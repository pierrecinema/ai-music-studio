#pragma once
// The plugin side of the host: scan, load / unload, process audio blocks, state, editor windows.
//
// Commands (text frames, JSON) : {"id": n, "cmd": "...", ...}  -> reply {"id": n, "ok": true, ...} or {"ok": false, "error": "..."}
//   hello {token}                      must be the first command of every connection
//   formats                            -> {formats: ["VST3", "VST"]}
//   scan {paths: [..], known: [..]}    -> events {event: "scan", file, done, total}; reply {plugins: [..], failed: [..]}
//   load {xml, sampleRate, blockSize}  -> {instance, name, latency, hasEditor, isInstrument, inputs, outputs}
//   unload {instance}
//   getState {instance} -> {state}     setState {instance, state}     (state: base64 of the plugin's own chunk)
//   editor {instance, show, title, parent}   parent: native handle of the app window (Windows), keeps it above the app
//   reset {instance}                   clears tails (after a jump in the song)
//   stats                              -> {instances, cpu}  (cpu: processing time / real time of the last second)
//   events: {event: "changed", instance}  the plugin's settings changed (in its window): the project has unsaved changes
//   audioDevices                       -> {types: [{type ("ASIO", "Windows Audio", ...), devices: [..]}]}
//   audioOpen {type, device, sampleRate, buffer, channel}  -> {sampleRate, buffer, outputLatency, sampleRates, buffers, channels, hasPanel}
//   audioClose      audioPanel (the driver's own settings window)      audioStats -> {open, fill, underruns, dropped, ...}
//   the app's master mix: audio frames to instance 0xFFFFFFF0 (no reply), played on the opened device
//
// Audio (binary frames, little endian), header of 24 bytes then MIDI events (8 bytes each) then planar float32:
//   u32 magic 'AMSA' | u32 instance | u32 seq | u16 channels | u16 flags (1: reset first, 2: parameter changes follow the MIDI) | u32 frames | u32 midiCount
//   reply: same header (midiCount field = the plugin's latency in samples) and the processed audio
//   flag 2: after the MIDI events u32 count, then count x (u32 offset, u32 parameter index, f32 value 0..1); the
//   block is cut at each change so automation is sample-accurate. Command "params" lists the parameters.
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include "WebSocketServer.h"
#include "AudioOut.h"
#include <map>

static constexpr uint32_t kAudioMagic = 0x41534D41;   // "AMSA"

struct PluginInstance;

class PluginHost : public WebSocketServer::Handler, private juce::Timer
{
public:
    explicit PluginHost (juce::String token);
    ~PluginHost() override;
    void onText (std::shared_ptr<WsConnection>, const juce::String&) override;
    void onBinary (std::shared_ptr<WsConnection>, const juce::MemoryBlock&) override;
    void onClosed (std::shared_ptr<WsConnection>) override;

    // run in a child process: describe the plugins in one file as JSON lines on stdout
    static int scanOne (const juce::String& formatName, const juce::String& file);

private:
    juce::var handle (std::shared_ptr<WsConnection>, const juce::var& msg);   // on the message thread
    void scan (std::shared_ptr<WsConnection>, int id, juce::StringArray paths, juce::StringArray known);
    std::shared_ptr<PluginInstance> find (int id);

    juce::String token;
    juce::AudioPluginFormatManager formats;
    std::map<int, std::shared_ptr<PluginInstance>> instances;
    std::mutex instancesLock;
    int nextInstance = 1;
    std::atomic<double> busySeconds { 0 };
    std::atomic<double> busyWindowStart { 0 };
    std::atomic<double> lastCpu { 0 };
    std::unique_ptr<juce::Thread> scanThread;
    // a plugin's settings changed (in its window): told to the app twice a second as {event: "changed", instance}
    void timerCallback() override;
    std::vector<std::weak_ptr<WsConnection>> clients;
    std::mutex clientsLock;
    AudioOut audioOut;
};
