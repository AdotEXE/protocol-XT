// ═══════════════════════════════════════════════════════════════════════════
// GAME MODULES - Экспорт всех модулей Game
// ═══════════════════════════════════════════════════════════════════════════

// Independent modules first (no dependencies on other Game modules)
export { GameProjectile } from "./GameProjectile";
export { GamePhysics, DEFAULT_PHYSICS_CONFIG } from "./GamePhysics";
export type { PhysicsConfig } from "./GamePhysics";
export { GameConsumables } from "./GameConsumables";
export { GameVisibility } from "./GameVisibility";
export { GamePersistence } from "./GamePersistence";
export { GameLoaders } from "./GameLoaders";
export { GamePOI } from "./GamePOI";
export { GameAudio } from "./GameAudio";
export { GameStats } from "./GameStats";
export { GameStatsOverlay } from "./GameStatsOverlay";
export { GameEvents } from "./GameEvents";

// Core modules (may depend on types)
export { GameCore } from "./GameCore";
export { GameSystems } from "./GameSystems";
export { GameInput } from "./GameInput";
export { GameCamera } from "./GameCamera";
export type { GameCameraContext } from "./GameCamera";

// Dependent modules (may depend on other Game modules)
export { GameGarage } from "./GameGarage";
export { GameEnemies } from "./GameEnemies";
export { GameUpdate } from "./GameUpdate";
export { GameUI } from "./GameUI";
export { GameMultiplayer } from "./GameMultiplayer";
export { GameSpectator } from "./GameSpectator";
export { GameMultiplayerCallbacks } from "./GameMultiplayerCallbacks";

// UI modules
export { SettingsManager } from "./SettingsManager";

// Game modes
export { FrontlineMode, DEFAULT_FRONTLINE_CONFIG } from "./FrontlineMode";
export type { 
    FrontlineConfig, 
    WaveState, 
    DefenderState, 
    FrontlineEnemy,
    FrontlineEnemyType 
} from "./FrontlineMode";

// Types last (to avoid circular dependency issues)
export type * from "./types";

