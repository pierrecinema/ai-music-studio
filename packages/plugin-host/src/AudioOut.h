#pragma once
// Sound output through the host (Settings → Audio → driver ASIO, or another JUCE device type): the app sends its
// master mix as audio frames to the instance number kOutputInstance; they go into a buffer that the sound card's
// callback empties. The buffer absorbs the small clock difference between the app and the card: when it runs low
// the card gets silence (counted), when it grows too large the oldest samples are dropped.
#include <juce_audio_devices/juce_audio_devices.h>
#include <atomic>

static constexpr uint32_t kOutputInstance = 0xFFFFFFF0u;

class AudioOut : private juce::AudioIODeviceCallback
{
public:
    AudioOut();
    ~AudioOut() override;
    juce::var devices();                                        // {types: [{type, devices: [..]}]}
    juce::var open (const juce::String& type, const juce::String& device, double rate, int buffer, int firstChannel);
    void close();
    bool showPanel();                                           // the driver's own settings window (ASIO)
    juce::var stats();
    juce::var info();                                           // the open device: rates, buffers, outputs, panel
    // planar float32 from the app (any number of channels, the first two are used)
    void push (const float* planar, int channels, int frames);
    bool isOpen() const { return running.load(); }

private:
    void audioDeviceIOCallbackWithContext (const float* const*, int, float* const*, int, int, const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart (juce::AudioIODevice*) override;
    void audioDeviceStopped() override;

    juce::AudioDeviceManager dm;
    juce::AbstractFifo fifo { 1 << 17 };                        // stereo frames (about 2.7 s at 48 kHz)
    juce::AudioBuffer<float> ring { 2, 1 << 17 };
    std::atomic<int> target { 2048 };                           // frames kept in the buffer (headroom against jitter)
    std::atomic<bool> running { false }, primed { false };
    std::atomic<int> underruns { 0 }, dropped { 0 }, cardBuffer { 0 };
    std::atomic<int> outChannel { 0 };
    bool initialised = false;
};
