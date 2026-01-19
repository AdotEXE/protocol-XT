# PolyGen Studio

**PolyGen Studio** is a Voxel-based AI Map Editor & Asset Designer for the Protocol TX game engine. It allows users to create 3D assets and maps using procedural generation, AI synthesis, and manual editing.

<div align="center">
<img width="800" alt="PolyGen Studio" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## Features

- **3D Voxel Editor**: Place, rotate, and colorize blocks in a 3D environment.
- **AI Synthesis**: Generate models from text prompts using Google Gemini AI.
- **Real World Generator**: Import real-world map data (buildings, terrain) from OpenStreetMap.
- **Procedural Generation**: Create cities, forests, and buildings algorithmically.
- **Multiplayer**: Collaborative editing with real-time cursor sync.
- **Export**: Export to `.obj`, `.ply`, `.bbmodel` (Blockbench), and TX Map format.

## Setup & Installation

**Prerequisites:** Node.js (v16+)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Create a `.env` file in the root directory (or use the Settings menu in-app) to add your Gemini API Key:
   ```env
   VITE_GEMINI_API_KEY=AIza...
   ```

3. **Run Locally:**
   ```bash
   npm run dev
   ```
   Access the editor at `http://localhost:3000`.

## Real World Generator

The new **Real World Generator** mode allows you to import real city layouts into your map.

1. Open the **Real World Generator** panel in the left sidebar.
2. Enter a **City Name** (e.g., "Moscow", "Paris") or specific address.
3. Adjust the **Radius** (scan area size).
4. Click **Generate**.
   - The system uses Gemini AI to find coordinates.
   - OSM data is fetched to place buildings and roads matching the real location.

## Settings

Click the **Settings (⚙️)** icon in the header to configure:
- Grid size and snapping
- Auto-save intervals
- Gemini API Key
- Theme preferences

## Project Structure

- `src/components/`: UI components (Scene, Panels, Modal)
- `src/services/`: Core logic (AI, Procedural, OSM, Export)
- `src/contexts/`: React Contexts (Loader, State)
- `src/types.ts`: TypeScript definitions

## Deployment

To build for production:
```bash
npm run build
```
The output will be in the `dist` folder, ready to be deployed to any static host (Vercel, Netlify, Github Pages).
