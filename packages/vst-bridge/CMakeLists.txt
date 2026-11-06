cmake_minimum_required(VERSION 3.22)
project(AMSBridge VERSION 0.1.0)

include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        7.0.9
)
FetchContent_MakeAvailable(JUCE)

juce_add_plugin(AMSBridge
    PRODUCT_NAME        "AMS Bridge"
    COMPANY_NAME        "AI Music Studio"
    BUNDLE_ID           "com.aimusic.amsbridge"
    PLUGIN_MANUFACTURER_CODE AiMs
    PLUGIN_CODE         Amsb
    FORMATS             VST3 Standalone
    VST3_CATEGORIES     "Instrument"
    IS_SYNTH            TRUE
    NEEDS_MIDI_INPUT    TRUE
    NEEDS_MIDI_OUTPUT   FALSE
    IS_MIDI_EFFECT      FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
)

target_sources(AMSBridge PRIVATE
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/AMSClient.cpp
)

target_compile_definitions(AMSBridge PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(AMSBridge PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_recommended_config_flags
)
