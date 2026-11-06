#pragma once
#include <JuceHeader.h>

class AudioEngine : public juce::AudioIODeviceCallback {
public:
    AudioEngine();
    ~AudioEngine() override;

    void initialize(int sampleRate = 44100, int bufferSize = 512);
    void shutdown();

    void play();
    void pause();
    void stop();
    void setBpm(double bpm);
    void setMasterVolume(float volume);

    bool isPlaying() const { return playing.load(); }
    double getCurrentPositionBeats() const { return positionBeats.load(); }

    // AudioIODeviceCallback
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;

    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

private:
    juce::AudioDeviceManager deviceManager;
    juce::MixerAudioSource mixer;
    std::atomic<bool> playing{false};
    std::atomic<double> positionBeats{0.0};
    double bpm{120.0};
    float masterVolume{0.8f};
    int currentSampleRate{44100};
    double samplesPerBeat{0.0};
    double samplePosition{0.0};
};
