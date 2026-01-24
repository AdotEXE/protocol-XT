# 🎮 Protocol TX

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Babylon.js](https://img.shields.io/badge/Babylon.js-8.40-orange.svg)](https://www.babylonjs.com/)
[![Havok](https://img.shields.io/badge/Havok-Physics-red.svg)](https://www.havok.com/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF.svg)](https://vitejs.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)

**A High-Performance, Low-Poly 3D Tank Combat Simulator**

[Play Online (Vercel)](https://protocol-xt.vercel.app/) | [Report Bug](docs/CONTRIBUTING.md) | [Request Feature](docs/CONTRIBUTING.md)

</div>

> [!NOTE]
> **Production Status**: The Vercel deployment link above may occasionally lag behind the latest codebase. For the absolute cutting-edge experience, please run the project locally.

<div align="center">
  <img src="docs/images/preview.png(for future)" alt="Protocol TX Gameplay" width="800" />
</div>

## 📖 About Protocol TX

Protocol TX is a browser-based, multiplayer tank shooter that pushes the limits of modern web technologies. Built with **Babylon.js** and **Havok Physics**, it delivers a console-quality experience directly in your browser.

The game features realistic hover-tank physics, a robust client-server architecture for 60Hz multiplayer synchronization, and a fully destructible procedural world.

### ✨ Key Features

| Category | Features |
|----------|----------|
| **🦾 Physics & Core** | • **Havok Physics Engine**: Realistic collisions and interactions.<br>• **Hover Mechanics**: Advanced suspension system for smooth terrain traversal.<br>• **Anisotropic Friction**: Drifting and precise movement control. |
| **🌍 World Generation** | • **8+ Map Generators**: Procedural maps including Urban, Wasteland, Canyon, and more.<br>• **Dynamic Chunks**: Infinite world potential with optimized loading.<br>• **Destructible Environment**: Breakable objects and changing cover. |
| **⚔️ Combat & Gameplay** | • **Ballistic System**: Realistic projectile trajectories with gravity and travel time.<br>• **Smart AI**: Enemy bots with patrolling, pursuing, and tactical behaviors.<br>• **Progression**: Exp system, levels, skills, and tank upgrades. |
| **🛠️ Tech Stack** | • **WebGPU / WebGL2**: Cutting-edge rendering support with optimized performance.<br>• **WebSocket Multiplayer**: Custom binary protocol for efficient data sync.<br>• **Modular Architecture**: Component-based design for scalability.<br>• **Performance Optimized**: Advanced caching, LOD, and adaptive update systems for 60 FPS gameplay. |
| **🎨 PolyGen Studio** | • **AI Map Editor**: Generate terrain, cities, and bases using **Gemini AI** prompts.<br>• **Real-World Import**: One-click import of real cities via **OpenStreetMap**.<br>• **Live Preview**: See physics and lighting exactly as they appear in-game. |

### 🚀 Performance Optimizations

Protocol TX implements advanced performance optimizations to ensure smooth 60 FPS gameplay:

- **Adaptive Update Intervals**: Systems update at different frequencies based on priority (camera every frame, HUD every 6 frames, chunk system every 16 frames)
- **Position Caching**: Expensive `getAbsolutePosition()` and `computeWorldMatrix()` calls are cached per frame, reducing calculations by 80-90%
- **LOD System**: Level-of-detail management for distant objects - enemy details are disabled beyond 150m
- **Material Pooling**: Shared materials reduce memory usage and improve rendering performance
- **Physics Optimization**: Distant objects use simplified physics (ANIMATED mode) to reduce CPU load
- **Effect Limits**: Maximum 50 active effects prevent performance degradation during intense combat
- **Raycast Caching**: Camera collision raycasts are cached when camera position hasn't changed significantly

For detailed performance tuning, see the [Performance Guide](docs/PERFORMANCE.md).

## 🚀 Getting Started

Follow these instructions to set up the project locally for development and testing.

### Prerequisites

*   **Node.js**: v18 or higher (v20+ recommended)
*   **npm** or **yarn**

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/protocol-tx.git
    cd protocol-tx
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory. You can start with the defaults or copy `.env.example` if available.
    ```env
    VITE_WS_SERVER_URL=ws://localhost:8080
    ```

### Running the Project

1.  **Start the Multiplayer Server**
    ```bash
    npm run server
    ```
    This will start the WebSocket server on port `8080`.

2.  **Start the Client**
    ```bash
    npm run dev
    ```
    The game will typically be available at `http://localhost:5000`.

    > [!TIP]
    > **Local Network Testing**: If configured, you can access the game from other devices on your LAN using your local IP, e.g., `http://192.168.3.4:5000/`.

## 🏗️ Architecture Overview

Protocol TX uses a strict separation of concerns for maintainability and performance.

*   **Client (`src/client`)**: Handles rendering (Babylon.js), input, and prediction.
*   **Server (`src/server`)**: Authoritative game state, physics validation, and client synchronization.
*   **Shared (`src/shared`)**: Common types, constants, and utility functions used by both.

For a deep dive into the system design, check out the [Architecture Documentation](docs/ARCHITECTURE.md).

### Directory Structure

```
├── docs/               # Detailed documentation files
├── scripts/            # Build and utility scripts
├── src/
│   ├── client/
│   │   ├── game/       # Core game loop and orchestration
│   │   ├── hud/        # UI components (React/Babylon GUI)
│   │   ├── maps/       # Procedural map generators
│   │   └── tank/       # Tank components (Chassis, Weapons, Physics)
│   ├── server/         # Node.js WebSocket server
│   └── shared/         # Shared logic/types
└── public/             # Static assets
```

## 🗺️ Documentation

We maintain extensive documentation for developers:

*   [**Architecture & Design**](docs/ARCHITECTURE.md) - System deep dive.
*   [**Features List**](docs/FEATURES.md) - Detailed breakdown of game mechanics.
*   [**Performance Guide**](docs/PERFORMANCE.md) - Performance optimizations and tuning.
*   [**Contributing Guide**](docs/CONTRIBUTING.md) - How to get involved.
*   [**API Reference**](docs/API.md) - Internal API documentation.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the ISC License. See `package.json` for more information.

---

<div align="center">
Built with ❤️ by the Protocol TX Team
</div>
