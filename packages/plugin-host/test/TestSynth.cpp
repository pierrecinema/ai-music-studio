// A tiny VST3 instrument for the end-to-end test of the plugin host: while a note is held it plays a constant level
// of velocity / 254 on both channels (no input), so the test can check that MIDI arrives at the right sample.
#include <juce_audio_processors/juce_audio_processors.h>

class TestSynth : public juce::AudioProcessor
{
public:
    TestSynth() : juce::AudioProcessor (BusesProperties().withOutput ("Out", juce::AudioChannelSet::stereo())) {}
    const juce::String getName() const override { return "AMS Test Synth"; }
    void prepareToPlay (double, int) override { level = 0; }
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>& b, juce::MidiBuffer& midi) override
    {
        b.clear();
        int pos = 0;
        auto fill = [&] (int to) { for (int c = 0; c < b.getNumChannels(); ++c) for (int i = pos; i < to; ++i) b.setSample (c, i, level); pos = to; };
        for (const auto m : midi)
        {
            fill (juce::jlimit (pos, b.getNumSamples(), m.samplePosition));
            auto msg = m.getMessage();
            if (msg.isNoteOn()) level = msg.getVelocity() / 254.0f;
            else if (msg.isNoteOff() || msg.isAllNotesOff()) level = 0;
        }
        fill (b.getNumSamples());
    }
    juce::AudioProcessorEditor* createEditor() override { return new juce::GenericAudioProcessorEditor (*this); }
    bool hasEditor() const override { return true; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}
private:
    float level = 0;
};

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new TestSynth(); }
