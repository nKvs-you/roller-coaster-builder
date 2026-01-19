# C++ Physics Engine for Roller Coaster Builder

This directory contains the C++ physics engine that compiles to WebAssembly for high-performance physics calculations.

## Features

The C++ physics engine provides:

- **Catmull-Rom Spline Interpolation**: Smooth curve calculations for track geometry
- **Physics Simulation**: Realistic gravity, friction, air resistance, and G-force calculations
- **Track Validation**: Detects steep grades, tight turns, and self-intersections
- **Collision Detection**: AABB bounds checking and ground collision

## Building

### Prerequisites

1. **Emscripten SDK**: Required to compile C++ to WebAssembly
   ```bash
   git clone https://github.com/emscripten-core/emsdk.git
   cd emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ./emsdk_env.sh  # Linux/Mac
   # or
   emsdk_env.bat  # Windows
   ```

2. **CMake**: Version 3.14 or higher

### Build Commands

**Linux/Mac:**
```bash
cd native
chmod +x build.sh
./build.sh
```

**Windows:**
```cmd
cd native
build.bat
```

### Output

After building, the following files will be generated in `client/public/wasm/`:
- `physics_engine.js` - JavaScript loader
- `physics_engine.wasm` - WebAssembly binary

## API Reference

### PhysicsEngine Class

```cpp
class PhysicsEngine {
public:
    void setTrack(TrackPointDataVector points, bool isLooped);
    void setChainLift(bool enabled);
    void reset();
    PhysicsState step(double deltaTime);
    
    // Getters
    double getSpeed();
    double getGForceVertical();
    double getGForceLateral();
    double getGForceTotal();
    double getProgress();
    double getHeight();
    bool getIsOnChainLift();
    bool getIsInLoop();
    
    // Position & velocity
    double getPositionX/Y/Z();
    double getVelocityX/Y/Z();
    
    // Setters
    void setProgress(double p);
    void setSpeed(double s);
};
```

### TrackValidator Class

```cpp
class TrackValidator {
    static ValidationResultVector validate(
        TrackPointDataVector points, 
        bool isLooped
    );
};
```

### Physics Constants

| Constant | Value | Description |
|----------|-------|-------------|
| GRAVITY | 9.81 m/s² | Gravitational acceleration |
| AIR_RESISTANCE | 0.02 | Drag coefficient |
| ROLLING_FRICTION | 0.015 | Friction coefficient |
| CHAIN_LIFT_SPEED | 3.0 m/s | Constant chain lift speed |
| MAX_SAFE_G_FORCE | 5.0 G | Maximum safe G-force |

## JavaScript Integration

The TypeScript wrapper in `client/src/lib/wasm/physicsEngine.ts` provides:

```typescript
import { loadPhysicsEngine, PhysicsSimulation } from '@/lib/wasm/physicsEngine';

// Load the WASM module
await loadPhysicsEngine();

// Create simulation
const sim = new PhysicsSimulation();
sim.setChainLift(true);

// Get state
const state = sim.getState();
console.log(`Speed: ${state.speed} m/s, G-Force: ${state.gForceTotal}G`);
```

## Fallback

If WebAssembly is not available or the build hasn't been run, the application automatically falls back to a JavaScript physics implementation with similar functionality.
