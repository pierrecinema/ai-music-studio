# AMS Plugin Host: loads VST3 and VST2 plugins for AI Music Studio and processes audio for the app over a local
# WebSocket (see docs/VST-PLAN.md). Built with JUCE 7 (GPL-3.0, like the app).
#
#   cmake -B build -DJUCE_DIR=/path/to/JUCE [-DAMS_FST_DIR=/path/to/FST] [-DAMS_BUILD_TEST_PLUGIN=ON]
#   cmake --build build --config Release
#
# VST2 hosting needs VST2 headers; the official SDK is no longer distributed, so the free FST headers are used
# (AMS_FST_DIR). Without them the host loads VST3 only.
cmake_minimum_required(VERSION 3.22)
project(AMSPluginHost VERSION 0.50.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(MSVC)
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

set(JUCE_DIR "" CACHE PATH "JUCE 7 source folder (empty: downloaded)")
set(AMS_FST_DIR "" CACHE PATH "FST folder (free VST2 headers); empty: VST3 only")
option(AMS_BUILD_TEST_PLUGIN "Also build a small VST3 test effect (gain) for the end-to-end test" OFF)

if(JUCE_DIR)
  add_subdirectory(${JUCE_DIR} juce)
else()
  include(FetchContent)
  FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 7.0.12 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(JUCE)
endif()

juce_add_gui_app(AMSPluginHost
  PRODUCT_NAME "ams-plugin-host"
  COMPANY_NAME "AI Music Studio"
  BUNDLE_ID "com.aimusic.pluginhost")

target_sources(AMSPluginHost PRIVATE
  src/Main.cpp
  src/WebSocketServer.cpp
  src/PluginHost.cpp)

set(AMS_VST2 0)
if(AMS_FST_DIR)
  # JUCE looks for <pluginterfaces/vst2.x/aeffect.h> and <aeffectx.h>: small headers that include FST
  set(_shim ${CMAKE_CURRENT_BINARY_DIR}/vst2shim)
  file(MAKE_DIRECTORY ${_shim}/pluginterfaces/vst2.x)
  # FST2VST: FST then uses the usual VST2 names (AEffect, VstEvents …), as its own aeffect.h does
  file(WRITE ${_shim}/pluginterfaces/vst2.x/aeffect.h "#pragma once\n#define FST2VST 1\n#include <fst.h>\n")
  file(WRITE ${_shim}/pluginterfaces/vst2.x/aeffectx.h "#pragma once\n#define FST2VST 1\n#include <fst.h>\n")
  file(GLOB_RECURSE _fsth ${AMS_FST_DIR}/fst.h)
  list(GET _fsth 0 _fst1)
  get_filename_component(_fstinc ${_fst1} DIRECTORY)
  target_include_directories(AMSPluginHost PRIVATE ${_shim} ${_fstinc})
  set(AMS_VST2 1)
endif()

target_compile_definitions(AMSPluginHost PRIVATE
  JUCE_PLUGINHOST_VST3=1
  JUCE_PLUGINHOST_VST=${AMS_VST2}
  JUCE_PLUGINHOST_AU=0
  JUCE_PLUGINHOST_LADSPA=0
  JUCE_PLUGINHOST_LV2=0
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_DISPLAY_SPLASH_SCREEN=0
  JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:AMSPluginHost,JUCE_PRODUCT_NAME>"
  JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:AMSPluginHost,JUCE_VERSION>"
  AMS_HAS_VST2=${AMS_VST2})

target_link_libraries(AMSPluginHost PRIVATE
  juce::juce_audio_processors
  juce::juce_audio_utils
  juce::juce_gui_basics
  juce::juce_recommended_config_flags
  juce::juce_recommended_warning_flags)

if(AMS_BUILD_TEST_PLUGIN)
  juce_add_plugin(AMSTestGain
    PRODUCT_NAME "AMS Test Gain"
    COMPANY_NAME "AI Music Studio"
    PLUGIN_MANUFACTURER_CODE AiMs
    PLUGIN_CODE AtGn
    FORMATS VST3
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE)
  target_sources(AMSTestGain PRIVATE test/TestGain.cpp)
  target_compile_definitions(AMSTestGain PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(AMSTestGain PRIVATE juce::juce_audio_utils juce::juce_recommended_config_flags)

  # a test instrument: plays a constant level while a note is held (checks MIDI to instruments)
  juce_add_plugin(AMSTestSynth
    PRODUCT_NAME "AMS Test Synth"
    COMPANY_NAME "AI Music Studio"
    PLUGIN_MANUFACTURER_CODE AiMs
    PLUGIN_CODE AtSy
    FORMATS VST3
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE)
  target_sources(AMSTestSynth PRIVATE test/TestSynth.cpp)
  target_compile_definitions(AMSTestSynth PUBLIC JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_DISPLAY_SPLASH_SCREEN=0)
  target_link_libraries(AMSTestSynth PRIVATE juce::juce_audio_utils juce::juce_recommended_config_flags)
endif()
