@echo off
REM Build script for compiling C++ physics engine to WebAssembly (Windows)

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set BUILD_DIR=%SCRIPT_DIR%build
set OUTPUT_DIR=%SCRIPT_DIR%..\client\public\wasm

echo ================================
echo Building Physics Engine (WASM)
echo ================================

REM Check for Emscripten
where emcmake >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Emscripten not found!
    echo Please install Emscripten SDK: https://emscripten.org/docs/getting_started/downloads.html
    echo.
    echo Quick install:
    echo   git clone https://github.com/emscripten-core/emsdk.git
    echo   cd emsdk
    echo   emsdk install latest
    echo   emsdk activate latest
    echo   emsdk_env.bat
    exit /b 1
)

REM Create directories
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

cd /d "%BUILD_DIR%"

REM Configure with Emscripten
echo Configuring with CMake...
call emcmake cmake .. -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
if %errorlevel% neq 0 (
    echo CMake configuration failed!
    exit /b 1
)

REM Build
echo Building...
call emmake mingw32-make -j4
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b 1
)

echo.
echo ================================
echo Build complete!
echo Output files in: %OUTPUT_DIR%
echo ================================
dir "%OUTPUT_DIR%"

endlocal
