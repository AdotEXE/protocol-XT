// ═══════════════════════════════════════════════════════════════════════════
// GAME MODULES - Экспорт всех модулей Game
// ═══════════════════════════════════════════════════════════════════════════

// Core modules
export { GameCore } from "./GameCore";
export { GameSystems } from "./GameSystems";
export { GameInput } from "./GameInput";
export { GameCamera } from "./GameCamera";
export { GameMultiplayer } from "./GameMultiplayer";
export { GameSpectator } from "./GameSpectator";
export { GameGarage } from "./GameGarage";
export { GameEnemies } from "./GameEnemies";
export { GameEvents } from "./GameEvents";
export { GameUpdate } from "./GameUpdate";
export { GameAudio } from "./GameAudio";
export { GameStats } from "./GameStats";
export { GameUI } from "./GameUI";
export { GamePhysics, DEFAULT_PHYSICS_CONFIG } from "./GamePhysics";
export type { PhysicsConfig } from "./GamePhysics";
export { GameConsumables } from "./GameConsumables";
export { GameProjectile } from "./GameProjectile";
export { GameVisibility } from "./GameVisibility";

// UI modules
export { LoadingScreen } from "./LoadingScreen";
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

// Types
export type * from "./types";

