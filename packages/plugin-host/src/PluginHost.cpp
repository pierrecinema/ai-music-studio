#include "PluginHost.h"
#include <algorithm>
#include <cmath>
#if JUCE_WINDOWS
 #include <windows.h>
#endif

// ── one loaded plugin ──────────────────────────────────────────────────────────
class EditorWindow : public juce::DocumentWindow
{
public:
    EditorWindow (const juce::String& title, juce::AudioProcessorEditor* ed, std::function<void()> onClose)
        : juce::DocumentWindow (title, juce::Colour (0xff1a1a1a), juce::DocumentWindow::closeButton | juce::DocumentWindow::minimiseButton),
          closed (std::move (onClose))
    {
        setUsingNativeTitleBar (true);
        setContentOwned (ed, true);
        setResizable (ed->isResizable(), false);
        centreWithSize (getWidth(), getHeight());
    }
    void closeButtonPressed() override { setVisible (false); if (closed) closed(); }
    std::function<void()> closed;
};

// the song's transport as the plugins see it (tempo, position, playing), set by the app's frames (flag 4)
struct HostPlayHead : public juce::AudioPlayHead
{
    bool playing = false;
    double bpm = 120, ppq = 0;
    int64_t samples = 0;
    juce::Optional<PositionInfo> getPosition() const override
    {
        PositionInfo p;
        p.setBpm (bpm);
        p.setPpqPosition (ppq);
        p.setPpqPositionOfLastBarStart (std::floor (ppq / 4.0) * 4.0);
        p.setTimeSignature (TimeSignature { 4, 4 });
        p.setTimeInSamples (samples);
        p.setIsPlaying (playing);
        return p;
    }
};

struct PluginInstance : public juce::AudioProcessorListener
{
    HostPlayHead head;                    // before the plugin: it is destroyed after it
    std::atomic<bool> changed { false };
    void audioProcessorParameterChanged (juce::AudioProcessor*, int, float) override { changed = true; }
    void audioProcessorChanged (juce::AudioProcessor*, const ChangeDetails& d) override { if (d.parameterInfoChanged || d.programChanged || d.nonParameterStateChanged) changed = true; }
    ~PluginInstance() override { if (plugin) plugin->removeListener (this); }
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    juce::PluginDescription desc;
    std::mutex lock;                      // processing and state changes never at the same time
    juce::AudioBuffer<float> buffer;
    juce::MidiBuffer midi;
    double sampleRate = 48000;
    int maxBlock = 2048;
    std::unique_ptr<EditorWindow> window; // message thread only
    std::vector<std::shared_ptr<PluginInstance>> midiChain;   // MIDI effects before this instrument (under `lock`)
    std::atomic<int> midiIn { 0 }, midiOut { 0 };              // events into the MIDI chain / into the instrument (midiStats)
    std::atomic<bool> transportPlaying { false };
};

static juce::var obj() { return juce::var (new juce::DynamicObject()); }
static juce::var fail (const juce::String& e) { auto o = obj(); o.getDynamicObject()->setProperty ("ok", false); o.getDynamicObject()->setProperty ("error", e); return o; }
static juce::var okay() { auto o = obj(); o.getDynamicObject()->setProperty ("ok", true); return o; }

static juce::var describe (const juce::PluginDescription& d)
{
    auto o = obj();
    auto* p = o.getDynamicObject();
    p->setProperty ("id", d.createIdentifierString());
    p->setProperty ("name", d.name);
    p->setProperty ("vendor", d.manufacturerName);
    p->setProperty ("format", d.pluginFormatName == "VST" ? juce::String ("VST2") : d.pluginFormatName);
    p->setProperty ("category", d.category);
    p->setProperty ("isInstrument", d.isInstrument);
    p->setProperty ("file", d.fileOrIdentifier);
    p->setProperty ("version", d.version);
    p->setProperty ("inputs", d.numInputChannels);
    p->setProperty ("outputs", d.numOutputChannels);
    if (auto xml = d.createXml()) p->setProperty ("xml", xml->toString (juce::XmlElement::TextFormat().singleLine()));
    p->setProperty ("arch", sizeof (void*) == 8 ? "x64" : "x86");     // which host loads it: 64-bit or 32-bit
    return o;
}

// 32 or 64 bit: the machine field of the Windows binary (PE header). A .vst3 bundle has a folder per architecture.
static juce::String binaryArch (const juce::File& f)
{
    if (f.isDirectory())
    {
        auto contents = f.getChildFile ("Contents");
        if (contents.getChildFile ("x86_64-win").isDirectory()) return "x64";
        if (contents.getChildFile ("x86-win").isDirectory()) return "x86";
        return "x64";
    }
    juce::FileInputStream in (f);
    if (! in.openedOk() || in.readByte() != 'M' || in.readByte() != 'Z') return "x64";
    in.setPosition (0x3C);
    auto peOffset = in.readInt();
    if (peOffset <= 0 || peOffset > 1 << 20) return "x64";
    in.setPosition (peOffset);
    if (in.readInt() != 0x00004550) return "x64";            // "PE\0\0"
    auto machine = (uint16_t) in.readShort();
    return machine == 0x014c ? "x86" : "x64";
}

PluginHost::PluginHost (juce::String t) : token (std::move (t))
{
    formats.addDefaultFormats();
    startTimer (500);
}

void PluginHost::timerCallback()
{
    std::vector<int> ids;
    {
        std::lock_guard<std::mutex> l (instancesLock);
        for (auto& [id, inst] : instances) if (inst->changed.exchange (false)) ids.push_back (id);
    }
    if (ids.empty()) return;
    std::lock_guard<std::mutex> l (clientsLock);
    for (auto it = clients.begin(); it != clients.end();)
    {
        auto c = it->lock();
        if (! c || ! c->isOpen()) { it = clients.erase (it); continue; }
        for (int id : ids)
        {
            auto ev = obj(); ev.getDynamicObject()->setProperty ("event", "changed"); ev.getDynamicObject()->setProperty ("instance", id);
            c->sendText (juce::JSON::toString (ev, true));
        }
        ++it;
    }
}

PluginHost::~PluginHost()
{
    stopTimer();
    if (scanThread) scanThread->stopThread (3000);
    std::lock_guard<std::mutex> l (instancesLock);
    for (auto& [id, inst] : instances) inst->window.reset();
    instances.clear();
}

std::shared_ptr<PluginInstance> PluginHost::find (int id)
{
    std::lock_guard<std::mutex> l (instancesLock);
    auto it = instances.find (id);
    return it == instances.end() ? nullptr : it->second;
}

// ── commands ───────────────────────────────────────────────────────────────────
void PluginHost::onText (std::shared_ptr<WsConnection> conn, const juce::String& text)
{
    auto msg = juce::JSON::parse (text);
    auto id = (int) msg.getProperty ("id", 0);
    auto cmd = msg.getProperty ("cmd", "").toString();
    auto reply = [conn, id] (juce::var r)
    {
        if (auto* o = r.getDynamicObject()) { o->setProperty ("id", id); if (! o->hasProperty ("ok")) o->setProperty ("ok", true); }
        conn->sendText (juce::JSON::toString (r, true));
    };
    if (cmd == "hello")
    {
        conn->authed = msg.getProperty ("token", "").toString() == token;
        if (conn->authed) { std::lock_guard<std::mutex> l (clientsLock); clients.push_back (conn); }
        reply (conn->authed ? okay() : fail ("wrong token"));
        if (! conn->authed) conn->close();
        return;
    }
    if (! conn->authed) { reply (fail ("hello first")); conn->close(); return; }
    if (cmd == "scan")
    {
        juce::StringArray paths, known;
        if (auto* a = msg.getProperty ("paths", {}).getArray()) for (auto& v : *a) paths.add (v.toString());
        if (auto* a = msg.getProperty ("known", {}).getArray()) for (auto& v : *a) known.add (v.toString());
        scan (conn, id, paths, known);
        return;
    }
    // everything else runs on the message thread (plugins expect that for loading, state and editors)
    juce::MessageManager::callAsync ([this, conn, msg, reply]
    {
        juce::var r;
        try { r = handle (conn, msg); } catch (const std::exception& e) { r = fail (e.what()); } catch (...) { r = fail ("unknown error"); }
        reply (r);
    });
}

juce::var PluginHost::handle (std::shared_ptr<WsConnection>, const juce::var& msg)
{
    auto cmd = msg.getProperty ("cmd", "").toString();
    if (cmd == "formats")
    {
        juce::Array<juce::var> f;
        for (auto* fmt : formats.getFormats()) f.add (fmt->getName() == "VST" ? juce::String ("VST2") : fmt->getName());
        auto o = okay(); o.getDynamicObject()->setProperty ("formats", f); return o;
    }
    if (cmd == "load")
    {
        auto xml = juce::parseXML (msg.getProperty ("xml", "").toString());
        juce::PluginDescription desc;
        if (xml == nullptr || ! desc.loadFromXml (*xml)) return fail ("bad plugin description");
        double sr = (double) msg.getProperty ("sampleRate", 48000.0);
        int block = (int) msg.getProperty ("blockSize", 2048);
        juce::String err;
        auto plugin = formats.createPluginInstance (desc, sr, block, err);
        if (plugin == nullptr) return fail (err.isEmpty() ? juce::String ("the plugin could not be loaded") : err);
        // stereo in and out where the plugin allows it
        auto stereo = juce::AudioChannelSet::stereo();
        juce::AudioProcessor::BusesLayout layout;
        if (plugin->getBusCount (true) > 0) layout.inputBuses.add (stereo);
        if (plugin->getBusCount (false) > 0) layout.outputBuses.add (stereo);
        if (plugin->checkBusesLayoutSupported (layout)) plugin->setBusesLayout (layout);
        plugin->enableAllBuses();
        plugin->setRateAndBufferSizeDetails (sr, block);
        plugin->prepareToPlay (sr, block);
        auto inst = std::make_shared<PluginInstance>();
        inst->sampleRate = sr; inst->maxBlock = block; inst->desc = desc;
        inst->buffer.setSize (juce::jmax (2, plugin->getTotalNumInputChannels(), plugin->getTotalNumOutputChannels()), block);
        inst->plugin = std::move (plugin);
        inst->plugin->addListener (inst.get());
        inst->plugin->setPlayHead (&inst->head);
        int iid;
        { std::lock_guard<std::mutex> l (instancesLock); iid = nextInstance++; instances[iid] = inst; }
        auto o = okay(); auto* p = o.getDynamicObject();
        p->setProperty ("instance", iid);
        p->setProperty ("name", inst->plugin->getName());
        p->setProperty ("latency", inst->plugin->getLatencySamples());
        p->setProperty ("hasEditor", inst->plugin->hasEditor());
        p->setProperty ("isInstrument", desc.isInstrument);
        p->setProperty ("inputs", inst->plugin->getTotalNumInputChannels());
        p->setProperty ("outputs", inst->plugin->getTotalNumOutputChannels());
        return o;
    }
    if (cmd == "audioDevices") { auto r = audioOut.devices(); r.getDynamicObject()->setProperty ("ok", true); return r; }
    if (cmd == "audioOpen")
        return audioOut.open (msg["type"].toString(), msg["device"].toString(), (double) msg["sampleRate"], (int) msg["buffer"], (int) msg["channel"]);
    if (cmd == "audioClose") { audioOut.close(); return okay(); }
    if (cmd == "audioPanel") { bool shown = audioOut.showPanel(); auto r = okay(); r.getDynamicObject()->setProperty ("shown", shown); return r; }
    if (cmd == "audioInfo") return audioOut.info();
    if (cmd == "audioStats") { auto r = audioOut.stats(); r.getDynamicObject()->setProperty ("ok", true); return r; }
    if (cmd == "stats")
    {
        auto o = okay(); auto* p = o.getDynamicObject();
        { std::lock_guard<std::mutex> l (instancesLock); p->setProperty ("instances", (int) instances.size()); }
        p->setProperty ("cpu", lastCpu.load());
        return o;
    }
    auto inst = find ((int) msg.getProperty ("instance", 0));
    if (inst == nullptr) return fail ("no such plugin instance");
    if (cmd == "unload")
    {
        inst->window.reset();
        { std::lock_guard<std::mutex> l (instancesLock); instances.erase ((int) msg.getProperty ("instance", 0)); }
        // out of every MIDI chain it is in (an instrument would otherwise keep calling the unloaded plugin)
        std::vector<std::shared_ptr<PluginInstance>> all;
        { std::lock_guard<std::mutex> l (instancesLock); for (auto& [k, v] : instances) all.push_back (v); }
        for (auto& o : all)
        {
            std::lock_guard<std::mutex> l (o->lock);
            o->midiChain.erase (std::remove (o->midiChain.begin(), o->midiChain.end(), inst), o->midiChain.end());
        }
        { std::lock_guard<std::mutex> l (inst->lock); inst->midiChain.clear(); }
        { std::lock_guard<std::mutex> l (inst->lock); inst->plugin->releaseResources(); }
        return okay();
    }
    if (cmd == "midiChain")
    {
        // MIDI effects in front of this instrument, in order; they follow its transport
        std::vector<std::shared_ptr<PluginInstance>> chain;
        if (auto* a = msg.getProperty ("chain", {}).getArray())
            for (auto& v : *a)
            {
                auto fx = find ((int) v);
                if (fx == nullptr) return fail ("no such plugin instance in the MIDI chain");
                if (fx == inst) return fail ("a plugin cannot be in its own MIDI chain");
                chain.push_back (fx);
            }
        std::vector<std::shared_ptr<PluginInstance>> old;
        { std::lock_guard<std::mutex> l (inst->lock); old = inst->midiChain; inst->midiChain = chain; }
        for (auto& fx : old) { std::lock_guard<std::mutex> l (fx->lock); fx->plugin->setPlayHead (&fx->head); }
        for (auto& fx : chain) { std::lock_guard<std::mutex> l (fx->lock); fx->plugin->setPlayHead (&inst->head); }
        auto r = okay(); r.getDynamicObject()->setProperty ("chain", (int) chain.size()); return r;
    }
    if (cmd == "midiStats")
    {
        // what went through the MIDI chain since the last call (the app shows it while playing)
        auto r = okay(); auto* o = r.getDynamicObject();
        o->setProperty ("in", inst->midiIn.exchange (0));
        o->setProperty ("out", inst->midiOut.exchange (0));
        o->setProperty ("chain", (int) inst->midiChain.size());
        o->setProperty ("playing", inst->transportPlaying.load());
        o->setProperty ("bpm", inst->head.bpm);
        o->setProperty ("ppq", inst->head.ppq);
        return r;
    }
    if (cmd == "params")
    {
        // the automatable parameters: index (as in the audio frame), name, value 0..1, the value as text, steps
        juce::Array<juce::var> list;
        {
            std::lock_guard<std::mutex> l (inst->lock);
            auto& ps = inst->plugin->getParameters();
            for (int i = 0; i < ps.size() && list.size() < 2048; ++i)
            {
                auto* q = ps[i];
                if (! q->isAutomatable()) continue;
                auto* o = new juce::DynamicObject();
                o->setProperty ("i", i);
                o->setProperty ("name", q->getName (64));
                o->setProperty ("value", q->getValue());
                o->setProperty ("text", q->getText (q->getValue(), 32));
                o->setProperty ("label", q->getLabel());
                o->setProperty ("steps", q->getNumSteps());
                list.add (juce::var (o));
            }
        }
        auto r = okay(); r.getDynamicObject()->setProperty ("params", list); return r;
    }
    if (cmd == "setParam")
    {
        // a parameter set by hand (a knob of a MIDI controller): {index, value 0..1}
        std::lock_guard<std::mutex> l (inst->lock);
        auto& ps = inst->plugin->getParameters();
        int i = (int) msg.getProperty ("index", -1);
        if (i < 0 || i >= ps.size()) return fail ("no such parameter");
        ps[i]->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, (float) (double) msg.getProperty ("value", 0.0)));
        return okay();
    }
    if (cmd == "paramText")
    {
        // how a value of a parameter reads (for the automation lane): {index, value} -> text
        std::lock_guard<std::mutex> l (inst->lock);
        auto& ps = inst->plugin->getParameters();
        int i = (int) msg.getProperty ("index", -1);
        if (i < 0 || i >= ps.size()) return fail ("no such parameter");
        auto r = okay(); r.getDynamicObject()->setProperty ("text", ps[i]->getText ((float) (double) msg.getProperty ("value", 0.0), 32)); return r;
    }
    if (cmd == "getState")
    {
        juce::MemoryBlock mb;
        { std::lock_guard<std::mutex> l (inst->lock); inst->plugin->getStateInformation (mb); }
        auto o = okay(); o.getDynamicObject()->setProperty ("state", juce::Base64::toBase64 (mb.getData(), mb.getSize())); return o;
    }
    if (cmd == "setState")
    {
        juce::MemoryOutputStream decoded;
        if (! juce::Base64::convertFromBase64 (decoded, msg.getProperty ("state", "").toString())) return fail ("bad state");
        auto mb = decoded.getMemoryBlock();
        { std::lock_guard<std::mutex> l (inst->lock); inst->plugin->setStateInformation (mb.getData(), (int) mb.getSize()); }
        auto o = okay(); o.getDynamicObject()->setProperty ("latency", inst->plugin->getLatencySamples()); return o;
    }
    if (cmd == "reset")
    {
        std::lock_guard<std::mutex> l (inst->lock);
        inst->plugin->reset();
        return okay();
    }
    if (cmd == "editor")
    {
        bool show = (bool) msg.getProperty ("show", true);
        if (! show) { if (inst->window) inst->window->setVisible (false); return okay(); }
        // a window that was closed is built again: some plugins only draw the settings they had when their window
        // was made (after a project was opened its settings arrive first, then the window)
        if (inst->window != nullptr && ! inst->window->isVisible())
        {
            inst->window.reset();                              // deletes the editor it owns as well
        }
        if (inst->window == nullptr)
        {
            if (! inst->plugin->hasEditor()) return fail ("this plugin has no window");
            auto* ed = inst->plugin->createEditorIfNeeded();
            if (ed == nullptr) return fail ("the plugin window could not be opened");
            auto title = msg.getProperty ("title", inst->plugin->getName()).toString();
            inst->window = std::make_unique<EditorWindow> (title, ed, nullptr);
        }
        auto* w = inst->window.get();
        w->setVisible (true);
       #if JUCE_WINDOWS
        // owned by the app window: always above the app (not above other programs), minimised with it
        auto parent = msg.getProperty ("parent", "").toString();
        if (parent.isNotEmpty())
            if (auto* hwnd = (HWND) w->getWindowHandle())
                SetWindowLongPtr (hwnd, GWLP_HWNDPARENT, (LONG_PTR) parent.getLargeIntValue());
       #else
        w->setAlwaysOnTop (true);
       #endif
        // a minimised plugin window comes back (an owned window stays a small bar otherwise, and Open did nothing)
        if (w->isMinimised()) w->setMinimised (false);
       #if JUCE_WINDOWS
        if (auto* hwnd = (HWND) w->getWindowHandle()) if (IsIconic (hwnd)) ShowWindow (hwnd, SW_RESTORE);
       #endif
        w->toFront (true);
        return okay();
    }
    return fail ("unknown command " + cmd);
}

void PluginHost::onClosed (std::shared_ptr<WsConnection>) {}

// ── audio ──────────────────────────────────────────────────────────────────────
void PluginHost::onBinary (std::shared_ptr<WsConnection> conn, const juce::MemoryBlock& data)
{
    if (! conn->authed || data.getSize() < 24) return;
    auto* bytes = static_cast<const uint8_t*> (data.getData());
    auto u32 = [bytes] (size_t o) { uint32_t v; memcpy (&v, bytes + o, 4); return juce::ByteOrder::swapIfBigEndian (v); };
    auto u16 = [bytes] (size_t o) { uint16_t v; memcpy (&v, bytes + o, 2); return juce::ByteOrder::swapIfBigEndian (v); };
    if (u32 (0) != kAudioMagic) return;
    int iid = (int) u32 (4), channels = u16 (12), flags = u16 (14), frames = (int) u32 (16), midiCount = (int) u32 (20);
    if (midiCount < 0 || midiCount > 65536) return;
    size_t audioOffset = 24 + (size_t) midiCount * 8;
    // flag 2: parameter changes (automation) after the MIDI: u32 count, then count x (u32 offset, u32 index, f32 value)
    size_t paramsAt = audioOffset;
    int paramCount = 0;
    if (flags & 2)
    {
        if (data.getSize() < paramsAt + 4) return;
        paramCount = (int) u32 (paramsAt);
        if (paramCount < 0 || paramCount > 65536) return;
        audioOffset = paramsAt + 4 + (size_t) paramCount * 12;
    }
    // flag 4: the transport after that: u32 count, then count x (u32 offset, f32 bpm, f64 quarter notes)
    size_t transportAt = audioOffset;
    int transportCount = 0;
    if (flags & 4)
    {
        if (data.getSize() < transportAt + 4) return;
        transportCount = (int) u32 (transportAt);
        if (transportCount < 0 || transportCount > 4096) return;
        audioOffset = transportAt + 4 + (size_t) transportCount * 16;
    }
    if (channels < 1 || channels > 8 || frames < 1 || frames > 65536 || data.getSize() < audioOffset + (size_t) channels * frames * 4) return;
    // the app's master mix for the sound card (Settings → Audio → ASIO): no reply
    if ((uint32_t) iid == kOutputInstance)
    {
        audioOut.push (reinterpret_cast<const float*> (bytes + audioOffset), channels, frames);
        return;
    }
    auto inst = find (iid);

    juce::MemoryBlock out (data.getData(), audioOffset);     // header (+ MIDI) back, then the audio
    out.ensureSize (audioOffset + (size_t) channels * frames * 4);
    auto* outBytes = static_cast<uint8_t*> (out.getData());
    const float* in = reinterpret_cast<const float*> (bytes + audioOffset);
    float* res = reinterpret_cast<float*> (outBytes + audioOffset);

    uint32_t latency = 0;
    if (inst == nullptr)
    {
        memcpy (res, in, (size_t) channels * frames * 4);   // plugin gone: pass the sound through
    }
    else
    {
        auto t0 = juce::Time::getMillisecondCounterHiRes();
        std::lock_guard<std::mutex> l (inst->lock);
        auto& p = *inst->plugin;
        if (flags & 1) p.reset();
        int bufCh = inst->buffer.getNumChannels();
        auto& params = p.getParameters();
        auto paramOffset = [&] (int k) { uint32_t at; memcpy (&at, bytes + paramsAt + 4 + (size_t) k * 12, 4); return (int) juce::ByteOrder::swapIfBigEndian (at); };
        auto transportOffset = [&] (int k) { uint32_t at; memcpy (&at, bytes + transportAt + 4 + (size_t) k * 16, 4); return (int) juce::ByteOrder::swapIfBigEndian (at); };
        int nextParam = 0, nextTransport = 0;
        if (flags & 1) for (auto& fx : inst->midiChain) { std::lock_guard<std::mutex> fl (fx->lock); fx->plugin->reset(); }
        for (int pos = 0; pos < frames;)
        {
            // the transport from this point on (the song starts, stops or jumps)
            while (nextTransport < transportCount && transportOffset (nextTransport) <= pos)
            {
                auto* e = bytes + transportAt + 4 + (size_t) nextTransport * 16;
                float bpm; double ppq; memcpy (&bpm, e + 4, 4); memcpy (&ppq, e + 8, 8);
                inst->head.playing = bpm > 0;
                if (bpm > 0) { inst->head.bpm = bpm; inst->head.ppq = ppq; }
                ++nextTransport;
            }
            // parameter changes due at this point are applied first; the block is cut at the next one
            while (nextParam < paramCount && paramOffset (nextParam) <= pos)
            {
                auto* e = bytes + paramsAt + 4 + (size_t) nextParam * 12;
                uint32_t index; float value; memcpy (&index, e + 4, 4); memcpy (&value, e + 8, 4);
                if ((int) index < params.size()) params[(int) index]->setValue (juce::jlimit (0.0f, 1.0f, value));
                ++nextParam;
            }
            int n = juce::jmin (inst->maxBlock, frames - pos);
            if (nextParam < paramCount) n = juce::jmax (1, juce::jmin (n, paramOffset (nextParam) - pos));
            if (nextTransport < transportCount) n = juce::jmax (1, juce::jmin (n, transportOffset (nextTransport) - pos));
            inst->buffer.setSize (bufCh, n, false, false, true);
            inst->buffer.clear();
            for (int c = 0; c < juce::jmin (bufCh, channels); ++c)
                inst->buffer.copyFrom (c, 0, in + (size_t) c * frames + pos, n);
            inst->midi.clear();
            for (int m = 0; m < midiCount; ++m)
            {
                auto* e = bytes + 24 + (size_t) m * 8;
                uint32_t at; memcpy (&at, e, 4);
                if ((int) at >= pos && (int) at < pos + n) inst->midi.addEvent (juce::MidiMessage (e[4], e[5], e[6]), (int) at - pos);
            }
            // MIDI effects first: what they play is what the instrument gets
            if (! inst->midiChain.empty()) inst->midiIn += inst->midi.getNumEvents();
            for (auto& fx : inst->midiChain)
            {
                std::lock_guard<std::mutex> fl (fx->lock);
                int fxCh = juce::jmax (1, fx->buffer.getNumChannels());
                fx->buffer.setSize (fxCh, n, false, false, true);
                fx->buffer.clear();
                fx->plugin->processBlock (fx->buffer, inst->midi);
            }
            if (! inst->midiChain.empty()) inst->midiOut += inst->midi.getNumEvents();
            inst->transportPlaying = inst->head.playing;
            p.processBlock (inst->buffer, inst->midi);
            for (int c = 0; c < channels; ++c)
                memcpy (res + (size_t) c * frames + pos, inst->buffer.getReadPointer (juce::jmin (c, bufCh - 1)), (size_t) n * 4);
            inst->head.samples += n;
            if (inst->head.playing) inst->head.ppq += n / inst->sampleRate * inst->head.bpm / 60.0;
            pos += n;
        }
        latency = (uint32_t) juce::jmax (0, p.getLatencySamples());
        // CPU: time spent processing per second of real time
        auto t1 = juce::Time::getMillisecondCounterHiRes();
        busySeconds = busySeconds + (t1 - t0) / 1000.0;
        if (t1 / 1000.0 - busyWindowStart > 1.0) { lastCpu = busySeconds / juce::jmax (0.001, t1 / 1000.0 - busyWindowStart); busySeconds = 0; busyWindowStart = t1 / 1000.0; }
    }
    uint32_t lat = juce::ByteOrder::swapIfBigEndian (latency);
    memcpy (outBytes + 20, &lat, 4);
    // the reply carries no MIDI, parameter changes or transport: drop them, keep the header
    if (midiCount > 0 || (flags & 6))
    {
        juce::MemoryBlock compact (outBytes, 24);
        uint16_t f = juce::ByteOrder::swapIfBigEndian ((uint16_t) (flags & 1));
        memcpy (static_cast<uint8_t*> (compact.getData()) + 14, &f, 2);
        compact.append (res, (size_t) channels * frames * 4);
        conn->sendBinary (compact.getData(), compact.getSize());
        return;
    }
    conn->sendBinary (out.getData(), audioOffset + (size_t) channels * frames * 4);
}

// ── scanning ───────────────────────────────────────────────────────────────────
// One child process per file: a plugin that crashes while being scanned only takes that child down.
int PluginHost::scanOne (const juce::String& formatName, const juce::String& file)
{
    juce::AudioPluginFormatManager fm;
    fm.addDefaultFormats();
    for (auto* fmt : fm.getFormats())
    {
        if (fmt->getName() != formatName) continue;
        juce::OwnedArray<juce::PluginDescription> found;
        fmt->findAllTypesForFile (found, file);
        for (auto* d : found)
        {
            std::cout << "PLUGIN " << juce::JSON::toString (describe (*d), true).toStdString() << std::endl;
        }
        return found.isEmpty() ? 2 : 0;
    }
    return 3;
}

namespace
{
    class ScanThread : public juce::Thread
    {
    public:
        ScanThread (std::function<void (juce::Thread&)> fn) : juce::Thread ("scan"), job (std::move (fn)) {}
        void run() override { job (*this); }
        std::function<void (juce::Thread&)> job;
    };
}

void PluginHost::scan (std::shared_ptr<WsConnection> conn, int id, juce::StringArray paths, juce::StringArray known)
{
    if (scanThread && scanThread->isThreadRunning()) { auto r = fail ("a search is already running"); r.getDynamicObject()->setProperty ("id", id); conn->sendText (juce::JSON::toString (r, true)); return; }
    scanThread = std::make_unique<ScanThread> ([this, conn, id, paths, known] (juce::Thread& self)
    {
        // all plugin files in the folders, per format
        struct Item { juce::String format, file; };
        // a 32-bit plugin is checked (and later loaded) by the 32-bit host next to this one
        auto hostExe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
        auto host32 = hostExe.getSiblingFile (hostExe.getFileNameWithoutExtension() + "32" + hostExe.getFileExtension());
        juce::Array<Item> items;
        for (auto* fmt : formats.getFormats())
        {
            juce::FileSearchPath sp;
            for (auto& p : paths) if (juce::File::isAbsolutePath (p) && juce::File (p).isDirectory()) sp.add (juce::File (p));
            if (sp.getNumPaths() == 0) sp = fmt->getDefaultLocationsToSearch();
            for (auto& f : fmt->searchPathsForPlugins (sp, true, false))
                if (! known.contains (f)) items.add ({ fmt->getName(), f });
        }
        juce::Array<juce::var> plugins, failed;
        auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile).getFullPathName();
        for (int i = 0; i < items.size() && ! self.threadShouldExit(); ++i)
        {
            auto ev = obj(); auto* e = ev.getDynamicObject();
            e->setProperty ("event", "scan"); e->setProperty ("id", id); e->setProperty ("file", items[i].file);
            e->setProperty ("done", i); e->setProperty ("total", items.size());
            conn->sendText (juce::JSON::toString (ev, true));

            juce::ChildProcess child;
            juce::String runner = exe;
            bool is32 = sizeof (void*) == 8 && binaryArch (juce::File (items[i].file)) == "x86";
            if (is32)
            {
                if (! host32.existsAsFile())
                {
                    auto f = obj(); f.getDynamicObject()->setProperty ("file", items[i].file);
                    f.getDynamicObject()->setProperty ("format", items[i].format == "VST" ? juce::String ("VST2") : items[i].format);
                    f.getDynamicObject()->setProperty ("reason", "32-bit plugin, but the 32-bit plugin host is missing");
                    failed.add (f);
                    continue;
                }
                runner = host32.getFullPathName();
            }
            juce::StringArray args { runner, "--scan-one", items[i].format, items[i].file };
            bool ok = child.start (args, juce::ChildProcess::wantStdOut);
            juce::String out;
            if (ok)
            {
                auto until = juce::Time::getMillisecondCounter() + 60000;
                while (child.isRunning() && juce::Time::getMillisecondCounter() < until && ! self.threadShouldExit())
                {
                    char buf[4096]; int n = child.readProcessOutput (buf, sizeof (buf));
                    if (n > 0) out += juce::String::fromUTF8 (buf, n); else juce::Thread::sleep (20);
                }
                if (child.isRunning()) { child.kill(); ok = false; }
                else out += child.readAllProcessOutput();
            }
            int added = 0;
            for (auto& line : juce::StringArray::fromLines (out))
                if (line.startsWith ("PLUGIN ")) { plugins.add (juce::JSON::parse (line.substring (7))); ++added; }
            if (! ok || added == 0)
            {
                auto f = obj(); f.getDynamicObject()->setProperty ("file", items[i].file);
                f.getDynamicObject()->setProperty ("format", items[i].format == "VST" ? juce::String ("VST2") : items[i].format);
                f.getDynamicObject()->setProperty ("reason", ok ? "no plugin found in this file" : "the plugin crashed or did not answer while being checked");
                failed.add (f);
            }
        }
        auto r = okay(); auto* p = r.getDynamicObject();
        p->setProperty ("id", id); p->setProperty ("plugins", plugins); p->setProperty ("failed", failed);
        p->setProperty ("checked", items.size());
        conn->sendText (juce::JSON::toString (r, true));
    });
    scanThread->startThread();
}
