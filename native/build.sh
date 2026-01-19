#!/bin/bash
# Build script for compiling C++ physics engine to WebAssembly

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/../client/public/wasm"

echo "================================"
echo "Building Physics Engine (WASM)"
echo "================================"

# Check for Emscripten
if ! command -v emcmake &> /dev/null; then
    echo "Error: Emscripten not found!"
    echo "Please install Emscripten SDK: https://emscripten.org/docs/getting_started/downloads.html"
    echo ""
    echo "Quick install:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Create build directory
mkdir -p "$BUILD_DIR"
mkdir -p "$OUTPUT_DIR"

cd "$BUILD_DIR"

# Configure with Emscripten
echo "Configuring with CMake..."
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
echo "Building..."
emmake make -j$(nproc 2>/dev/null || echo 4)

echo ""
echo "================================"
echo "Build complete!"
echo "Output files in: $OUTPUT_DIR"
echo "================================"
ls -la "$OUTPUT_DIR"
