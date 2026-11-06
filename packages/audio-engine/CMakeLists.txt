cmake_minimum_required(VERSION 3.22)
project(AMSAudioEngine VERSION 0.1.0)

# Download JUCE via FetchContent
include(FetchContent)
FetchContent_Declare(
    JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        7.0.9
)
FetchContent_MakeAvailable(JUCE)

juce_add_console_app(AMSAudioEngine
    PRODUCT_NAME "AMS Audio Engine"
    COMPANY_NAME "AI Music Studio"
    BUNDLE_ID    "com.aimusic.audioengine"
)

target_sources(AMSAudioEngine PRIVATE
    src/main.cpp
    src/AudioEngine.cpp
    src/VSTHost.cpp
    src/MidiRouter.cpp
    src/IPCServer.cpp
)

target_compile_definitions(AMSAudioEngine PRIVATE
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_AU=0
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
)

target_link_libraries(AMSAudioEngine PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_dsp
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
)
