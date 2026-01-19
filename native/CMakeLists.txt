cmake_minimum_required(VERSION 3.14)
project(RollerCoasterPhysics VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(SOURCES
    physics_engine.cpp
)

# Emscripten-specific settings
if(EMSCRIPTEN)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    
    # Output directory
    set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_SOURCE_DIR}/../client/public/wasm)
    
    add_executable(physics_engine ${SOURCES})
    
    # Emscripten compile flags
    target_compile_options(physics_engine PRIVATE
        -O3
        -fno-exceptions
        -fno-rtti
    )
    
    # Emscripten link flags
    target_link_options(physics_engine PRIVATE
        --bind
        -s WASM=1
        -s MODULARIZE=1
        -s EXPORT_NAME="PhysicsEngine"
        -s ALLOW_MEMORY_GROWTH=1
        -s ENVIRONMENT=web
        -s NO_EXIT_RUNTIME=1
        -s FILESYSTEM=0
        -s SINGLE_FILE=0
        -s EXPORT_ES6=1
        -O3
    )
    
    message(STATUS "Configured for Emscripten WebAssembly build")
else()
    # Native build for testing
    add_library(physics_engine STATIC ${SOURCES})
    
    target_compile_options(physics_engine PRIVATE
        -O3
        -Wall
        -Wextra
    )
    
    message(STATUS "Configured for native build")
endif()
