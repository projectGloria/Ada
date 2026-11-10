#pragma once

#include <flutter_windows.h>

FlutterDesktopEngineRef AdaFlutterDesktopEngineCreate(
    const FlutterDesktopEngineProperties* properties);

#define FlutterDesktopEngineCreate AdaFlutterDesktopEngineCreate
