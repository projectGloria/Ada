# Thermion 0.5.0 searches upward from CMAKE_BINARY_DIR. This repository keeps
# build/ outside the application, so use the application's package map explicitly.
find_package(Python3 REQUIRED COMPONENTS Interpreter)
execute_process(
  COMMAND "${Python3_EXECUTABLE}"
    "${CMAKE_CURRENT_SOURCE_DIR}/resolve_thermion.py"
    "${CMAKE_CURRENT_SOURCE_DIR}/../.dart_tool/package_config.json"
  RESULT_VARIABLE ADA_THERMION_RESOLVE_RESULT
  OUTPUT_VARIABLE ADA_THERMION_ROOT
  ERROR_VARIABLE ADA_THERMION_RESOLVE_ERROR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
if(NOT ADA_THERMION_RESOLVE_RESULT EQUAL 0)
  message(FATAL_ERROR "${ADA_THERMION_RESOLVE_ERROR}")
endif()
target_include_directories(thermion_flutter_plugin BEFORE PRIVATE
  "${ADA_THERMION_ROOT}/native/include"
  "${ADA_THERMION_ROOT}/native/include/filament"
  "${ADA_THERMION_ROOT}/native/include/filament/release"
  "${ADA_THERMION_ROOT}/native/include/vulkan/linux"
  "${ADA_THERMION_ROOT}/native/include/opengl/linux"
)
include("${CMAKE_CURRENT_LIST_DIR}/thermion_runtime_paths.cmake")
ada_configure_thermion_runtime_paths(thermion_flutter_plugin
  "${PROJECT_BUILD_DIR}native_assets/linux")

# Keep the dependency cache immutable. Generate the reviewed 0.5.0 source
# override in this build tree and replace only its plugin translation unit.
get_target_property(ADA_THERMION_PLUGIN_DIR thermion_flutter_plugin SOURCE_DIR)
set(ADA_THERMION_PLUGIN_SOURCE
  "${ADA_THERMION_PLUGIN_DIR}/thermion_flutter_plugin.cc")
set(ADA_THERMION_PATCHED_SOURCE
  "${CMAKE_CURRENT_BINARY_DIR}/thermion/thermion_flutter_plugin.cc")
execute_process(
  COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/thermion/prepare_source.py"
    "${ADA_THERMION_PLUGIN_SOURCE}" "${ADA_THERMION_PATCHED_SOURCE}"
  RESULT_VARIABLE ADA_THERMION_PATCH_RESULT
  ERROR_VARIABLE ADA_THERMION_PATCH_ERROR
)
if(NOT ADA_THERMION_PATCH_RESULT EQUAL 0)
  message(FATAL_ERROR "${ADA_THERMION_PATCH_ERROR}")
endif()
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
  "${ADA_THERMION_PLUGIN_SOURCE}"
  "${CMAKE_CURRENT_SOURCE_DIR}/thermion/prepare_source.py")
get_target_property(ADA_THERMION_SOURCES thermion_flutter_plugin SOURCES)
set(ADA_THERMION_LOCAL_SOURCES "")
foreach(ADA_THERMION_SOURCE IN LISTS ADA_THERMION_SOURCES)
  if(ADA_THERMION_SOURCE STREQUAL "thermion_flutter_plugin.cc")
    list(APPEND ADA_THERMION_LOCAL_SOURCES "${ADA_THERMION_PATCHED_SOURCE}")
  elseif(IS_ABSOLUTE "${ADA_THERMION_SOURCE}")
    list(APPEND ADA_THERMION_LOCAL_SOURCES "${ADA_THERMION_SOURCE}")
  else()
    list(APPEND ADA_THERMION_LOCAL_SOURCES
      "${ADA_THERMION_PLUGIN_DIR}/${ADA_THERMION_SOURCE}")
  endif()
endforeach()
set_property(TARGET thermion_flutter_plugin PROPERTY SOURCES "${ADA_THERMION_LOCAL_SOURCES}")
target_include_directories(thermion_flutter_plugin BEFORE PRIVATE
  "${CMAKE_CURRENT_SOURCE_DIR}" "${ADA_THERMION_PLUGIN_DIR}")
pkg_check_modules(EPOXY REQUIRED IMPORTED_TARGET epoxy)
target_link_libraries(thermion_flutter_plugin PRIVATE PkgConfig::EPOXY PkgConfig::X11)
