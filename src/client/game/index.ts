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
export { createSafetyPlane } from "./createSafetyPlane";
export { applyGraphicsSettings } from "./applyGraphicsSettings";
export type { PostProcessingManagerLike } from "./applyGraphicsSettings";
export { setupFog, setFogWeatherIntensity, FOG_START, FOG_END } from "./setupFog";
export { showSoftwareRendererWarning } from "./showSoftwareRendererWarning";
export { updateCanvasPointerEvents } from "./updateCanvasPointerEvents";
export {
    createLoadingScreen,
    updateLoadingProgress,
    hideLoadingScreen
} from "./loadingScreenHelpers";
export { handleAchievementUnlocked, handleMissionComplete } from "./achievementMissionHandlers";
export type { AchievementUnlockedDeps, MissionCompleteDeps } from "./achievementMissionHandlers";
export { saveGameStateForAutoRestart } from "./saveGameStateForAutoRestart";
export type { SaveGameStateParams } from "./saveGameStateForAutoRestart";
export { updateExplorerProgress } from "./updateExplorerProgress";
export type { AchievementsSystemLike } from "./updateExplorerProgress";
export { ensureCanvasVisible } from "./ensureCanvasVisible";
export type { EngineResizeLike } from "./ensureCanvasVisible";
export { getMapDisplayName } from "./getMapDisplayName";
export { getMouseSensitivityFromSettings } from "./mouseSensitivityFromSettings";
export { handleEnemyDeath } from "./handleEnemyDeath";
export type { HandleEnemyDeathDeps } from "./handleEnemyDeath";
export { buildDetailedTankStatsData } from "./buildDetailedTankStatsData";
export type { TankForStatsLike, UpgradeManagerLike, DetailedTankStatsSync, BuildDetailedTankStatsResult } from "./buildDetailedTankStatsData";
export { checkForCustomTank } from "./checkForCustomTank";
export type { TankWithCustomConfig } from "./checkForCustomTank";
export { cleanupUnusedResources, getMemoryStatsFromScene } from "./cleanupUnusedResources";
export type { CleanupUnusedResourcesOptions, MemoryStats } from "./cleanupUnusedResources";
export { normalizeMapDataForGame } from "./normalizeMapDataForGame";
export type { NormalizedMapData, NormalizedMapDataMetadata } from "./normalizeMapDataForGame";
export { getRawSpawnPositionsFromMapData } from "./getRawSpawnPositionsFromMapData";
export {
    updateCameraShakeState,
    addCameraShakeIntensity,
    DEFAULT_CAMERA_SHAKE_DECAY
} from "./cameraShakeHelper";
export type { CameraShakeState, TankForCameraShake } from "./cameraShakeHelper";
export { registerGlobalKeyboardShortcuts } from "./globalKeyboardShortcuts";
export type { GlobalKeyboardShortcutsAPI } from "./globalKeyboardShortcuts";
export { setupMenuCallbacks } from "./setupMenuCallbacks";
export type { IGameForMenuCallbacks } from "./setupMenuCallbacks";
export { registerGameKeyboardHandler } from "./gameKeyboardHandler";
export type { GameKeyboardHandlerAPI } from "./gameKeyboardHandler";
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

