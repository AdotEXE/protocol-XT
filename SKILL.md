# Protocol TX - AI Agent Skills

This file defines specialized skills that the Cursor AI agent can discover and apply when working on Protocol TX. Skills are automatically discovered based on context, or can be explicitly invoked using `/skill @skill-name`.

## 🎮 Game Development Skills

### `@physics-optimization`
**When to use**: Optimizing physics performance, reducing Havok calculations, fixing physics-related FPS drops

**Instructions**:
1. **Review Physics Update Frequency**:
   - Physics should update every frame (required for accuracy)
   - Check if physics is being updated unnecessarily
   - Verify physics bodies are using correct types (DYNAMIC/STATIC/ANIMATED)

2. **Distance-Based Simplification**:
   - Enemies beyond 100m: Use ANIMATED mode instead of DYNAMIC
   - Disable detailed physics for distant objects
   - Use simplified collision shapes for LOD

3. **Caching**:
   - Cache physics queries (raycasts, overlaps) when position unchanged
   - Cache `getAbsolutePosition()` per frame
   - Avoid repeated physics queries in same frame

4. **Object Pooling**:
   - Pool frequently created/destroyed physics bodies
   - Reuse physics shapes when possible
   - Pre-create physics bodies for common objects

5. **Configuration**:
   - Check `src/client/config/physicsConfig.ts` for tuning
   - Review `docs/PHYSICS_PARAMETERS.md` for detailed parameters
   - Use physics visualizer (F4) to debug physics bodies

**Example**: "Optimize physics for 50+ enemies on screen" → Use ANIMATED mode for enemies > 100m, pool physics bodies, cache raycasts

### `@multiplayer-sync`
**When to use**: Fixing sync issues, implementing new multiplayer features, debugging desynchronization

**Instructions**:
1. **Server Authority**:
   - Server validates ALL state changes (positions, health, damage, actions)
   - Client can predict but server corrects discrepancies
   - Never trust client input for critical operations
   - Use server-side validation for all game logic

2. **Network Protocol**:
   - Use binary protocols (msgpack) for efficiency
   - Implement delta compression (only send changed values)
   - Batch multiple updates when possible
   - Use WebSocket (TCP) for reliable messages, Geckos (UDP) for fast updates

3. **Client Prediction**:
   - Predict movement, shooting, immediate feedback
   - Use reconciliation when server state differs
   - Smooth interpolation between server updates
   - Handle network lag gracefully (extrapolation, lag compensation)

4. **Synchronization**:
   - 60Hz sync rate (60 updates per second)
   - Interpolate positions between updates
   - Handle packet loss and out-of-order packets
   - Test with simulated network conditions (lag, packet loss)

5. **Debugging**:
   - Check `docs/MULTIPLAYER_SYNC_PROBLEMS.md` for known issues
   - Use `SyncDebugVisualizer` to visualize sync issues
   - Test with multiple clients using `npm run start:all`
   - Monitor network traffic and latency

**Example**: "Tanks desync when moving fast" → Implement lag compensation, increase sync rate, add interpolation

### `@performance-tuning`
**When to use**: Improving FPS, reducing frame drops, optimizing rendering, fixing lag

**Instructions**:
1. **Adaptive Update Intervals**:
   - Camera: Every frame (critical)
   - Physics: Every frame (required)
   - HUD: Every 6 frames
   - Chunk System: Every 12-16 frames
   - Enemy AI: Every 5-6 frames
   - Enemy Turrets: Every 15 frames
   - **Adaptive**: When FPS < 30, increase intervals by 50%

2. **Position Caching**:
   - Cache `getAbsolutePosition()` once per frame
   - Cache `computeWorldMatrix()` to avoid redundant calculations
   - Cache raycasts when camera position unchanged (> 0.5m)
   - Performance gain: 80-90% reduction in expensive calculations

3. **LOD System**:
   - Disable enemy details beyond 150m (tracks, wheels, small parts)
   - Use ANIMATED physics for enemies > 100m
   - Simplified materials for distant objects
   - Performance gain: 30-40% reduction for distant objects

4. **Effect Limits**:
   - Maximum 50 active effects
   - Remove oldest effects when limit reached
   - Pool effect objects

5. **Material Pooling**:
   - Reuse materials with identical parameters
   - Freeze static materials
   - Reduce memory usage and update overhead

6. **Production Optimizations**:
   - Anti-aliasing, shadows, particles, fog disabled in production
   - Render distance reduced to 1.2 (from 1.5)
   - Larger chunks (80 units) for fewer objects

7. **Monitoring**:
   - Use Chrome DevTools Performance tab
   - Check FPS (target: 60 FPS)
   - Monitor memory usage (watch for leaks)
   - Profile CPU usage (identify bottlenecks)

**Example**: "FPS drops to 30 during combat" → Increase effect limit check, optimize enemy updates, verify LOD

### `@map-generation`
**When to use**: Working with procedural maps, terrain generation
**Instructions**:
- Review existing map generators in `src/client/maps/`
- Check `docs/MAP_GENERATION_IMPROVEMENTS.md`
- Use PolyGen Studio for AI-assisted map creation
- Consider chunk loading for infinite worlds
- Optimize terrain mesh generation

### `@tank-mechanics`
**When to use**: Implementing tank features, hover physics, weapons, movement, combat

**Instructions**:
1. **Tank Structure**:
   - `TankController` - Main tank controller (movement, physics)
   - `src/client/tank/` - Tank components (Chassis, Weapons, Physics)
   - `src/client/workshop/` - Tank customization system
   - `src/client/garage/` - Tank upgrades and modifications

2. **Hover Mechanics**:
   - Use raycasts to ground for hover height
   - Anisotropic friction for realistic movement
   - Upright forces for stability
   - Configurable: hoverHeight, hoverStiffness, hoverDamping, uprightForce

3. **Ballistic System**:
   - Realistic trajectories with gravity
   - Travel time calculation for moving targets
   - Ricochet system (`src/client/tank/combat/RicochetSystem.ts`)
   - Damage falloff with distance

4. **Movement**:
   - W/S: Forward/backward
   - A/D: Turn left/right
   - Mouse: Turret rotation
   - Z/X: Turret rotation (keyboard)
   - Q/E: Camera tilt / Vertical aiming axis
   - R/F: Pitch up/down

5. **Combat**:
   - Left click: Shoot
   - Ctrl/RMB: Aim mode
   - Projectile system with travel time
   - Damage calculation with distance falloff

6. **Workshop System**:
   - Custom tank configurations
   - Model selector, parameter editor
   - Attachment point editor
   - Visual editor for customization

**Example**: "Add new weapon type" → Create weapon class in `tank/weapons/`, add to TankController, update ballistic system

### `@codebase-refactor`
**When to use**: Refactoring, improving code quality, reducing duplication, cleaning up code

**Instructions**:
1. **Architecture Principles**:
   - Maintain strict client-server separation
   - Use path aliases: `@client/*`, `@server/*`, `@shared/*`
   - Don't mix concerns (physics in UI, rendering in physics)
   - Follow existing patterns and architecture

2. **Code Quality**:
   - Follow TypeScript strict mode (no `any`, proper types)
   - Extract duplicated code to utilities
   - Use single responsibility principle
   - Keep functions small and focused

3. **Refactoring Process**:
   - Check `docs/REFACTORING_PLAN.md` for planned improvements
   - Review related files using semantic search
   - Understand dependencies before refactoring
   - Test thoroughly after refactoring

4. **Best Practices**:
   - Use events for loose coupling
   - Implement proper error handling
   - Add JSDoc for public APIs
   - Clean up unused code and imports

5. **Performance**:
   - Don't break performance optimizations
   - Maintain caching strategies
   - Keep update intervals optimized
   - Test FPS impact after refactoring

**Example**: "Refactor TankController to separate movement and combat" → Create separate classes, use events for communication, maintain same API

### `@bug-investigation`
**When to use**: Debugging issues, investigating crashes, fixing bugs, troubleshooting

**Instructions**:
1. **Initial Investigation**:
   - Check browser console for errors (F12)
   - Review server logs (terminal or Railway logs)
   - Check `docs/TROUBLESHOOTING.md` for common issues
   - Reproduce the bug consistently

2. **Debugging Tools**:
   - Use `npm run monitor` for system monitoring
   - Chrome DevTools Performance tab for FPS issues
   - Physics visualizer (F4) for physics bugs
   - Dev Dashboard (F3) for game state
   - Network tab for multiplayer issues

3. **Multiplayer Bugs**:
   - Test with multiple clients using `npm run start:all`
   - Check `SyncDebugVisualizer` for sync issues
   - Monitor network traffic and latency
   - Test with simulated network conditions

4. **Performance Bugs**:
   - Profile with Chrome DevTools
   - Check memory usage (watch for leaks)
   - Identify CPU bottlenecks
   - Review update intervals and caching

5. **Physics Bugs**:
   - Use physics visualizer (F4)
   - Check physics body types (DYNAMIC/STATIC/ANIMATED)
   - Verify forces are applied correctly
   - Check collision shapes and layers

6. **Systematic Approach**:
   - Isolate the problem (which system?)
   - Check related files using semantic search
   - Review recent changes (git history)
   - Test edge cases and boundary conditions

**Example**: "Tank falls through ground" → Check physics body type, verify collision layers, test with physics visualizer

### `@documentation`
**When to use**: Writing or updating documentation
**Instructions**:
- Keep documentation in `docs/` folder
- Update relevant sections when making changes
- Include code examples where helpful
- Reference related documentation files
- Keep architecture diagrams up to date

## 🛠️ Development Skills

### `@setup-environment`
**When to use**: Setting up development environment, configuring services, deployment

**Instructions**:
1. **Prerequisites**:
   - Node.js >= 20.0.0 (check with `node --version`)
   - npm or yarn package manager
   - Git for version control

2. **Local Setup**:
   - Check `docs/SETUP.md` for detailed setup instructions
   - Run `npm install` to install dependencies
   - Create `.env` file with required variables
   - Set `VITE_WS_SERVER_URL=ws://localhost:8080` for local development

3. **Firebase Configuration**:
   - See `docs/FIREBASE_*.md` for Firebase setup
   - Configure authentication, database, storage
   - Set up environment variables for Firebase keys

4. **Vercel Deployment** (Client):
   - See `docs/VERCEL_SETUP.md` for deployment guide
   - Configure environment variables
   - Set `VITE_WS_SERVER_URL` to Railway server URL (wss://...)
   - Enable automatic deployments from Git

5. **Railway Deployment** (Server):
   - See `docs/DEPLOY_SERVER.md` for server deployment
   - Configure environment variables
   - Set up networking and public domain
   - Configure port (default: 8080)

6. **Testing Setup**:
   - Use `npm run start:all` for local testing
   - Test with multiple clients
   - Verify WebSocket connections

**Example**: "Set up new development environment" → Follow SETUP.md, configure .env, test with npm run dev

### `@testing-multiplayer`
**When to use**: Testing multiplayer features, verifying synchronization, network testing

**Instructions**:
1. **Setup Multiple Clients**:
   - Use `npm run start:all` to start client + server + monitoring
   - Open multiple browser windows/tabs
   - Connect each to the same server
   - Check `docs/TESTING_TWO_CLIENTS.md` for detailed procedures

2. **Synchronization Testing**:
   - Verify positions sync correctly
   - Test health/damage synchronization
   - Check action synchronization (shooting, movement)
   - Verify state consistency across clients

3. **Network Conditions**:
   - Test with normal latency (< 50ms)
   - Test with high latency (100ms+, 500ms+)
   - Test packet loss scenarios
   - Test disconnections and reconnections
   - Use browser DevTools to simulate network conditions

4. **Connection Stability**:
   - Check WebSocket connection stability
   - Test reconnection after disconnect
   - Verify heartbeat/ping mechanism
   - Test timeout handling

5. **Edge Cases**:
   - Rapid input (spam clicking, rapid movement)
   - Multiple simultaneous actions
   - Boundary conditions (map edges, spawn points)
   - Large number of players (stress test)

6. **Debugging Tools**:
   - Use `SyncDebugVisualizer` to visualize sync issues
   - Monitor network traffic in DevTools
   - Check server logs for errors
   - Use `npm run monitor` for system monitoring

**Example**: "Test multiplayer sync with 4 players" → Start server, open 4 browser windows, verify all positions sync, test lag scenarios

## 🎨 UI/UX Skills

### `@hud-development`
**When to use**: Working on HUD, UI components, menus, overlays

**Instructions**:
- HUD system located in `src/client/hud/`
- Components in `hud/components/` (25+ components)
- Use `HUDManager` for centralized management
- Update HUD every 6 frames (not every frame)
- Use Babylon GUI for in-game UI
- Use React for editor/admin interfaces
- Follow theme system (`HUDTheme.ts`, `uiTheme.ts`)
- Maintain consistent styling across all UI

### `@sound-system`
**When to use**: Working with sounds, audio, music, sound effects

**Instructions**:
- `SoundManager` handles all audio
- Located in `src/client/soundManager.ts`
- Use `jsfxr` for procedural sound generation
- Sound patterns in `soundPatterns.ts`
- Game audio system in `game/GameAudio.ts`
- Support 3D positional audio
- Optimize audio loading and playback

### `@effects-system`
**When to use**: Working with visual effects, particles, post-processing

**Instructions**:
- Effects system in `src/client/effects/`
- `ParticleEffects` for particle systems
- `PostProcessingManager` for post-processing effects
- Limit active effects to 50 maximum
- Pool effect objects for performance
- Effects config in `effects/EffectsConfig.ts`
- Main effects manager in `effects.ts`

### `@map-editor`
**When to use**: Working with map editor, terrain editing, object placement

**Instructions**:
- Map editor in `src/client/mapEditor/`
- `GizmoSystem` for object manipulation
- `TankObjectEditor` for tank object editing
- `WorkshopPropertiesPanel` for properties
- Support for direct manipulation
- Context menu for object operations
- Integration with PolyGen Studio

## 🔧 System-Specific Skills

### `@enemy-ai`
**When to use**: Working on enemy AI, pathfinding, combat behavior

**Instructions**:
- Enemy AI in `src/client/ai/`
- `EnemyAI` for basic AI behavior
- `EnemyCombat` for combat logic
- `AIPathfinding` for pathfinding
- `AICoordinator` for coordinating AI actions
- Update AI every 5-6 frames (not every frame)
- Use LOD for distant enemies (disable details > 150m)

### `@chunk-system`
**When to use**: Working with chunk system, world generation, terrain loading

**Instructions**:
- Chunk system in `src/client/chunkSystem.ts`
- Update every 12-16 frames (adaptive)
- Biome cache: MAX_BIOME_CACHE_SIZE = 50000
- Garage area cache for spawn checks
- Edge smoothing radius = 3
- Optimize chunk loading and unloading
- Support infinite world generation

### `@workshop-system`
**When to use**: Working on tank customization, workshop editor

**Instructions**:
- Workshop system in `src/client/workshop/`
- `ConfigurationManager` for tank configurations
- `ModelSelector` for model selection
- `ParameterEditor` for parameter editing
- `AttachmentPointEditor` for attachment points
- `VisualEditor` for visual customization
- Export/import configurations

### `@garage-system`
**When to use**: Working on garage, upgrades, tank modifications

**Instructions**:
- Garage system in `src/client/garage/`
- `GarageData` for garage data management
- `GarageTypes` for type definitions
- `cannonDetails.ts`, `chassisDetails.ts` for details
- `preview.ts` for tank preview
- `ui.ts` for garage UI
- Integration with workshop system

## 📋 Usage

### Automatic Discovery
Skills are automatically discovered based on context. When you mention:
- "optimize physics" → `@physics-optimization` is applied
- "fix multiplayer sync" → `@multiplayer-sync` is applied
- "improve FPS" → `@performance-tuning` is applied

### Explicit Invocation
Use slash command format:
- `/skill @physics-optimization` - Apply physics optimization knowledge
- `/skill @multiplayer-sync` - Focus on multiplayer synchronization
- `/skill @performance-tuning` - Optimize for 60 FPS
- `/skill @hud-development` - Work on HUD/UI components
- `/skill @enemy-ai` - Work on enemy AI behavior

### Combining Skills
You can mention multiple skills in conversation:
- "Optimize physics and improve multiplayer sync" → Both skills applied
- "Fix HUD performance and add new UI component" → HUD + performance skills

### Best Practices
- Mention the skill naturally in conversation
- Provide context about what you're trying to achieve
- Ask specific questions to get targeted help
- Review the skill instructions for detailed guidance

