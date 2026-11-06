#pragma once
#include <JuceHeader.h>
#include <functional>

/**
 * HTTP client for communicating with the AI Music Studio local server.
 * Uses JUCE URL for simple, cross-platform HTTP calls.
 */
class AMSClient {
public:
    struct NoteData {
        int pitch;
        double startTime;
        double duration;
        int velocity;
        juce::String lyric;
    };

    struct GenerateResult {
        bool success{false};
        juce::String audioFilePath;
        double duration{0.0};
        juce::String error;
    };

    void setServerUrl(const juce::String& url) { serverUrl = url; }

    GenerateResult generateVocal(const juce::String& voiceId,
                                  const juce::Array<NoteData>& notes,
                                  const juce::String& lyrics);

    GenerateResult generateInstrument(const juce::String& instrumentId,
                                       const juce::Array<NoteData>& notes);

    bool isServerRunning();

private:
    juce::String serverUrl{"http://127.0.0.1:8765"};

    juce::var postJson(const juce::String& endpoint, const juce::var& body);
};
