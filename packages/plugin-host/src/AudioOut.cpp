#include "AudioOut.h"

AudioOut::AudioOut() {}
AudioOut::~AudioOut() { close(); }

juce::var AudioOut::devices()
{
    juce::Array<juce::var> types;
    for (auto* t : dm.getAvailableDeviceTypes())
    {
        t->scanForDevices();
        juce::Array<juce::var> names;
        for (auto& n : t->getDeviceNames (false)) names.add (n);
        auto* o = new juce::DynamicObject();
        o->setProperty ("type", t->getTypeName());
        o->setProperty ("devices", names);
        types.add (juce::var (o));
    }
    auto* r = new juce::DynamicObject();
    r->setProperty ("types", types);
    return juce::var (r);
}

juce::var AudioOut::open (const juce::String& type, const juce::String& device, double rate, int buffer, int firstChannel)
{
    close();
    dm.initialise (0, 2, nullptr, false);
    dm.setCurrentAudioDeviceType (type, true);
    auto setup = dm.getAudioDeviceSetup();
    setup.outputDeviceName = device;
    setup.inputDeviceName = {};
    if (rate > 0) setup.sampleRate = rate;
    if (buffer > 0) setup.bufferSize = buffer;
    setup.useDefaultOutputChannels = false;
    setup.outputChannels.clear();
    outChannel = juce::jmax (0, firstChannel);
    setup.outputChannels.setRange (outChannel, 2, true);
    auto err = dm.setAudioDeviceSetup (setup, true);
    auto* r = new juce::DynamicObject();
    auto* dev = dm.getCurrentAudioDevice();
    if (err.isNotEmpty() || dev == nullptr)
    {
        r->setProperty ("ok", false);
        r->setProperty ("error", err.isNotEmpty() ? err : juce::String ("The device could not be opened (it may be in use by another program)."));
        return juce::var (r);
    }
    fifo.reset();
    primed = false;
    underruns = 0; dropped = 0;
    dm.addAudioCallback (this);
    r->setProperty ("ok", true);
    r->setProperty ("type", dm.getCurrentAudioDeviceType());
    r->setProperty ("device", dev->getName());
    r->setProperty ("sampleRate", dev->getCurrentSampleRate());
    r->setProperty ("buffer", dev->getCurrentBufferSizeSamples());
    r->setProperty ("outputLatency", dev->getOutputLatencyInSamples());
    juce::Array<juce::var> rates, sizes, chans;
    for (auto s : dev->getAvailableSampleRates()) rates.add (s);
    for (auto s : dev->getAvailableBufferSizes()) sizes.add (s);
    for (auto& c : dev->getOutputChannelNames()) chans.add (c);
    r->setProperty ("sampleRates", rates);
    r->setProperty ("buffers", sizes);
    r->setProperty ("channels", chans);
    r->setProperty ("hasPanel", dev->hasControlPanel());
    return juce::var (r);
}

void AudioOut::close()
{
    dm.removeAudioCallback (this);
    dm.closeAudioDevice();
    running = false;
}

bool AudioOut::showPanel()
{
    auto* dev = dm.getCurrentAudioDevice();
    if (dev == nullptr || ! dev->hasControlPanel()) return false;
    dm.removeAudioCallback (this);
    bool changed = dev->showControlPanel();       // modal; the driver may change its settings
    if (changed) dm.restartLastAudioDevice();
    dm.addAudioCallback (this);
    return true;
}

juce::var AudioOut::stats()
{
    auto* r = new juce::DynamicObject();
    r->setProperty ("open", running.load());
    r->setProperty ("fill", fifo.getNumReady());
    r->setProperty ("underruns", underruns.load());
    r->setProperty ("dropped", dropped.load());
    if (auto* dev = dm.getCurrentAudioDevice())
    {
        r->setProperty ("sampleRate", dev->getCurrentSampleRate());
        r->setProperty ("buffer", dev->getCurrentBufferSizeSamples());
        r->setProperty ("outputLatency", dev->getOutputLatencyInSamples());
    }
    return juce::var (r);
}

void AudioOut::push (const float* planar, int channels, int frames)
{
    if (! running.load() || frames <= 0) return;
    // too much waiting (the app runs a little faster than the card): drop the oldest samples
    int limit = target.load() * 3;
    if (fifo.getNumReady() + frames > limit)
    {
        int drop = fifo.getNumReady() + frames - target.load();
        int s1, n1, s2, n2;
        fifo.prepareToRead (juce::jmin (drop, fifo.getNumReady()), s1, n1, s2, n2);
        fifo.finishedRead (n1 + n2);
        dropped += n1 + n2;
    }
    int s1, n1, s2, n2;
    fifo.prepareToWrite (frames, s1, n1, s2, n2);
    for (int c = 0; c < 2; ++c)
    {
        const float* src = planar + (size_t) juce::jmin (c, channels - 1) * (size_t) frames;
        if (n1 > 0) ring.copyFrom (c, s1, src, n1);
        if (n2 > 0) ring.copyFrom (c, s2, src + n1, n2);
    }
    fifo.finishedWrite (n1 + n2);
}

void AudioOut::audioDeviceIOCallbackWithContext (const float* const*, int, float* const* out, int numOut, int n, const juce::AudioIODeviceCallbackContext&)
{
    for (int c = 0; c < numOut; ++c) if (out[c] != nullptr) juce::FloatVectorOperations::clear (out[c], n);
    // wait until the buffer holds its headroom, then play; when it runs dry, wait again
    if (! primed.load())
    {
        if (fifo.getNumReady() < target.load()) return;
        primed = true;
    }
    int ready = fifo.getNumReady();
    int take = juce::jmin (n, ready);
    if (take < n) { underruns++; primed = false; }
    int s1, n1, s2, n2;
    fifo.prepareToRead (take, s1, n1, s2, n2);
    int outs = 0;
    for (int c = 0; c < numOut && outs < 2; ++c)
    {
        if (out[c] == nullptr) continue;
        if (n1 > 0) juce::FloatVectorOperations::copy (out[c], ring.getReadPointer (outs, s1), n1);
        if (n2 > 0) juce::FloatVectorOperations::copy (out[c] + n1, ring.getReadPointer (outs, s2), n2);
        ++outs;
    }
    if (outs == 1 && numOut == 1) {}                            // mono card: the left channel only
    fifo.finishedRead (n1 + n2);
}

void AudioOut::audioDeviceAboutToStart (juce::AudioIODevice* d)
{
    cardBuffer = d->getCurrentBufferSizeSamples();
    // headroom: the app sends blocks of 512; keep at least two of them and two card buffers
    target = juce::jmax (1024, 2 * cardBuffer.load()) + 512;
    running = true;
}

void AudioOut::audioDeviceStopped() { running = false; }
