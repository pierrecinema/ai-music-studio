// A tiny VST3 MIDI effect for the end-to-end test of MIDI chains: a note-on comes out at half its velocity (so the test
// synth plays half the level), and while the song plays it adds a note (velocity 100) on every beat that starts in the
// block (so the test can check the transport the host gives it).
#include <juce_audio_processors/juce_audio_processors.h>

class TestArp : public juce::AudioProcessor
{
public:
    TestArp() : juce::AudioProcessor (BusesProperties()) {}
    const juce::String getName() const override { return "AMS Test Arp"; }
    void prepareToPlay (double sr, int) override { rate = sr; }
    void releaseResources() override {}
    void processBlock (juce::AudioBuffer<float>& b, juce::MidiBuffer& midi) override
    {
        b.clear();
        juce::MidiBuffer out;
        for (const auto m : midi)
        {
            auto msg = m.getMessage();
            if (msg.isNoteOn()) out.addEvent (juce::MidiMessage::noteOn (msg.getChannel(), msg.getNoteNumber(), (juce::uint8) (msg.getVelocity() / 2)), m.samplePosition);
            else out.addEvent (msg, m.samplePosition);
        }
        if (auto* ph = getPlayHead())
            if (auto pos = ph->getPosition())
                if (pos->getIsPlaying() && pos->getBpm() && pos->getPpqPosition())
                {
                    double ppq = *pos->getPpqPosition(), spb = rate * 60.0 / *pos->getBpm();
                    double next = std::ceil (ppq - 1e-9);
                    int at = (int) std::llround ((next - ppq) * spb);
                    if (at >= 0 && at < b.getNumSamples()) out.addEvent (juce::MidiMessage::noteOn (1, 72, (juce::uint8) 100), at);
                }
        midi.swapWith (out);
    }
    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return true; }
    bool isMidiEffect() const override { return true; }
    double getTailLengthSeconds() const override { return 0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}
    void getStateInformation (juce::MemoryBlock&) override {}
    void setStateInformation (const void*, int) override {}
private:
    double rate = 48000;
};

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new TestArp(); }
