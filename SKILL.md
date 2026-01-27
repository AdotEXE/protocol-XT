# Protocol TX - AI Agent Skills

This file defines specialized skills that the Cursor AI agent can discover and apply when working on Protocol TX.

## 🎮 Game Development Skills

### `@physics-optimization`
**When to use**: Optimizing physics performance, reducing Havok calculations
**Instructions**:
- Review current physics update frequency
- Implement distance-based physics simplification (ANIMATED mode for distant objects)
- Cache physics queries when possible
- Use object pooling for frequently created/destroyed physics bodies
- Check `docs/PHYSICS_PARAMETERS.md` for tuning guidelines

### `@multiplayer-sync`
**When to use**: Fixing sync issues, implementing new multiplayer features
**Instructions**:
- Server is authoritative - validate all state changes server-side
- Use delta compression for network updates
- Implement client-side prediction for smooth gameplay
- Check `docs/MULTIPLAYER_SYNC_PROBLEMS.md` for known issues
- Test with multiple clients using `npm run start:all`

### `@performance-tuning`
**When to use**: Improving FPS, reducing frame drops
**Instructions**:
- Review adaptive update intervals (camera: every frame, HUD: every 6 frames, chunks: every 16 frames)
- Check position caching (`getAbsolutePosition()`, `computeWorldMatrix()`)
- Verify LOD system is working (disable enemy details beyond 150m)
- Limit active effects to 50 maximum
- Use material pooling
- Check `docs/PERFORMANCE.md` for detailed guidelines

### `@map-generation`
**When to use**: Working with procedural maps, terrain generation
**Instructions**:
- Review existing map generators in `src/client/maps/`
- Check `docs/MAP_GENERATION_IMPROVEMENTS.md`
- Use PolyGen Studio for AI-assisted map creation
- Consider chunk loading for infinite worlds
- Optimize terrain mesh generation

### `@tank-mechanics`
**When to use**: Implementing tank features, hover physics, weapons
**Instructions**:
- Review `src/client/tank/` for existing implementations
- Hover mechanics use anisotropic friction
- Ballistic system includes gravity and travel time
- Check workshop system in `src/client/workshop/` for customization

### `@codebase-refactor`
**When to use**: Refactoring, improving code quality
**Instructions**:
- Maintain client-server separation
- Use path aliases: `@client/*`, `@server/*`, `@shared/*`
- Follow TypeScript strict mode
- Check `docs/REFACTORING_PLAN.md` for planned improvements
- Preserve existing patterns and architecture

### `@bug-investigation`
**When to use**: Debugging issues, investigating crashes
**Instructions**:
- Check browser console for errors
- Review server logs
- Use `npm run monitor` for system monitoring
- Check `docs/TROUBLESHOOTING.md` for common issues
- Test with multiple clients if multiplayer-related
- Use Chrome DevTools Performance tab for FPS issues

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
**When to use**: Setting up development environment, configuring services
**Instructions**:
- Check `docs/SETUP.md` for setup instructions
- Configure Firebase if needed (see `docs/FIREBASE_*.md`)
- Set up Vercel deployment (see `docs/VERCEL_SETUP.md`)
- Configure Railway for server (see `docs/DEPLOY_SERVER.md`)
- Ensure Node.js >= 20.0.0

### `@testing-multiplayer`
**When to use**: Testing multiplayer features
**Instructions**:
- Use `npm run start:all` to start multiple clients
- Check `docs/TESTING_TWO_CLIENTS.md` for testing procedures
- Verify server-client synchronization
- Test network lag scenarios
- Check WebSocket connection stability

## 📋 Usage

To invoke a skill, use the slash command format:
- `/skill @physics-optimization` - Apply physics optimization knowledge
- `/skill @multiplayer-sync` - Focus on multiplayer synchronization
- `/skill @performance-tuning` - Optimize for 60 FPS

Or simply mention the skill in conversation, and the agent will automatically apply relevant knowledge.

