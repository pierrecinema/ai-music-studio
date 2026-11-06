#include "AudioEngine.h"

AudioEngine::AudioEngine() {
    deviceManager.initialiseWithDefaultDevices(0, 2);
}

AudioEngine::~AudioEngine() {
    shutdown();
}

void AudioEngine::initialize(int sampleRate, int bufferSize) {
    currentSampleRate = sampleRate;
    samplesPerBeat = (60.0 / bpm) * sampleRate;
    deviceManager.addAudioCallback(this);
}

void AudioEngine::shutdown() {
    playing = false;
    deviceManager.removeAudioCallback(this);
    deviceManager.closeAudioDevice();
}

void AudioEngine::play()  { playing = true; }
void AudioEngine::pause() { playing = false; }
void AudioEngine::stop()  { playing = false; samplePosition = 0.0; positionBeats = 0.0; }

void AudioEngine::setBpm(double newBpm) {
    bpm = newBpm;
    samplesPerBeat = (60.0 / bpm) * currentSampleRate;
}

void AudioEngine::setMasterVolume(float v) { masterVolume = juce::jlimit(0.0f, 1.0f, v); }

void AudioEngine::audioDeviceIOCallbackWithContext(
    const float* const*, int,
    float* const* outputChannelData, int numOutputChannels,
    int numSamples, const juce::AudioIODeviceCallbackContext&)
{
    for (int ch = 0; ch < numOutputChannels; ++ch)
        juce::FloatVectorOperations::clear(outputChannelData[ch], numSamples);

    if (!playing) return;

    // Advance playhead
    samplePosition += numSamples;
    positionBeats = samplePosition / samplesPerBeat;
}

void AudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    currentSampleRate = static_cast<int>(device->getCurrentSampleRate());
    samplesPerBeat = (60.0 / bpm) * currentSampleRate;
}

void AudioEngine::audioDeviceStopped() {}
