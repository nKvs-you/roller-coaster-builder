# 🎢 3D Roller Coaster Builder

An interactive 3D/2D roller coaster builder with real-time physics simulation. Design, build, and ride your own roller coasters with realistic G-forces, loops, hills, and atmospheric effects.

![Roller Coaster Builder](https://img.shields.io/badge/Built%20With-React%20%2B%20Three.js-blue?style=for-the-badge)
![Physics](https://img.shields.io/badge/Physics-Pure%20JavaScript-green?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)

## ✨ Features

### 🏗️ Track Building
- **Interactive 3D editor** with drag-and-drop control points
- **Catmull-Rom spline interpolation** for smooth tracks
- **Loop creation** with automatic banking
- **Height adjustment** with realistic support structures
- **Real-time track validation** and safety warnings

### 🎮 Ride Experience
- **3D Mode**: Full WebGL-powered first-person ride with Three.js
- **2D Mode**: Canvas-based ride that works without WebGL (accessibility fallback)
- **Real-time G-force visualization** with tunnel vision and airtime effects
- **Dynamic speed display** with km/h, mph, and m/s
- **Atmospheric day/night modes** with stars, moon, and dynamic lighting

### ⚡ Physics Engine
- **Pure JavaScript physics** - no WASM or WebGL required for calculations
- **Energy conservation** with realistic friction and air drag
- **Accurate G-force calculation** (vertical, lateral, longitudinal)
- **Chain lift simulation** for hill climbing
- **Centripetal force** and banking calculations
- **Safety limits** with automatic speed capping

### 🎨 Visual Features
- **Glass morphism UI** with modern styling
- **Dynamic day/night cycle** 
- **Night mode music** (plays only during night mode)
- **Particle effects** for speed visualization
- **Enhanced minimap** with real-time car tracking
- **G-force color coding** (green → yellow → orange → red)

## 🌐 Live Demo

Visit: https://jimenez537.github.io/roller-coaster-builder/

## 🚀 Quick Start

### Fork and Deploy

1. **Fork this repository** - Click the "Fork" button on GitHub

2. **Enable GitHub Pages**:
   - Go to your forked repo's **Settings** → **Pages**
   - Under **Source**, select **GitHub Actions**
   - Click **Save**

3. **Trigger deployment**:
   - Make any change and push, or manually run the workflow
   - Go to **Actions** → **Deploy to GitHub Pages** → **Run workflow**

4. **Access your site**:
   ```
   https://YOUR-USERNAME.github.io/roller-coaster-builder/
   ```

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at http://localhost:5000

## 🎮 Controls

### Build Mode
| Action | Control |
|--------|---------|
| Add track point | Click on ground |
| Select point | Click on point |
| Move point | Drag with mouse |
| Delete point | Select + Delete button |
| Add loop | Select + Loop button |
| Adjust height | Use slider or drag vertically |
| Toggle day/night | N key or UI button |
| Toggle 2D/3D mode | F2 key |

### Ride Mode
| Action | Control |
|--------|---------|
| Start ride | Click "Ride" button |
| Exit ride | ESC key or Exit button |
| Toggle 2D mode | F2 key |

## 🔧 Physics Constants

```typescript
GRAVITY: 9.80665      // m/s² (Earth standard)
CAR_MASS: 800         // kg
DRAG_COEFFICIENT: 0.35
ROLLING_RESISTANCE: 0.015
CHAIN_LIFT_SPEED: 2.5 // m/s
MAX_SPEED: 50         // m/s (~180 km/h)
```

### G-Force Limits
- **Vertical**: -1.5G to +4.5G
- **Lateral**: ±1.8G
- **Airtime detected**: < 0.5G vertical

## 🏗️ Project Structure

```
roller-coaster-builder/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── game/           # 3D components (Track, Car, Camera)
│   │   │   └── ui/             # UI components (shadcn/ui)
│   │   ├── lib/
│   │   │   ├── physics/        # Pure JS physics engine
│   │   │   ├── stores/         # Zustand state management
│   │   │   └── utils.ts        # Utility functions
│   │   └── hooks/              # Custom React hooks
│   └── public/
│       ├── sounds/             # Audio files
│       └── textures/           # Track textures
├── native/                     # C++ physics (optional WASM)
└── server/                     # Express backend
```

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **3D Rendering**: Three.js via @react-three/fiber
- **State Management**: Zustand
- **Styling**: Tailwind CSS + shadcn/ui
- **Build Tool**: Vite
- **Physics**: Custom pure JavaScript engine

## 🎵 Audio

- **Night mode music**: Ambient loop plays only during night mode
- **Sound effects**: Wind, clicks, and ride sounds
- **Mute toggle**: Available in UI

## 📱 Accessibility

- **2D Fallback**: Full ride experience without WebGL
- **Keyboard navigation**: All major actions have keyboard shortcuts
- **High contrast**: G-force indicators use distinct colors
- **Screen reader friendly**: Proper ARIA labels

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Three.js team for the amazing 3D library
- React Three Fiber for the React bindings
- shadcn/ui for the beautiful UI components
- The roller coaster enthusiast community for physics insights

- React
- Three.js / React Three Fiber
- Vite
- Tailwind CSS
- Zustand (state management)
