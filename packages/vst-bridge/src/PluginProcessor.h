#pragma once
#include <JuceHeader.h>
#include "AMSClient.h"

/**
 * AMS Bridge VST3 Plugin Processor
 *
 * Receives MIDI from the DAW, forwards notes+lyrics to AI Music Studio's
 * local backend, streams the rendered audio back into the plugin's output.
 * Supports ARA for tempo sync when the host provides it.
 */
class AMSBridgeProcessor : public juce::AudioProcessor {
public:
    AMSBridgeProcessor();
    ~AMSBridgeProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "AMS Bridge"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& dest) override;
    void setStateInformation(const void* data, int size) override;

    // State shared with editor
    juce::String selectedVoiceId{"v001"};
    juce::String serverUrl{"http://127.0.0.1:8765"};

private:
    AMSClient amsClient;
    juce::AudioBuffer<float> renderedAudio;
    int playbackPos{0};
    double currentSampleRate{44100.0};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AMSBridgeProcessor)
};
