/**
 * @module menu/screens
 * @description Экраны меню
 */

// MainMenuScreen
export { MAIN_MENU_ITEMS, DEFAULT_MAIN_MENU_CONFIG } from './MainMenuScreen';
export type { MainMenuConfig, MainMenuItemId, MainMenuEventHandler } from './MainMenuScreen';

// SettingsScreen
export { 
    SETTINGS_CATEGORIES, 
    DEFAULT_SETTINGS,
    DEFAULT_SETTINGS_SCREEN,
    getSettingsCategory,
    getCategoryLabel,
    validateGraphicsSettings,
    validateAudioSettings,
    validateControlSettings,
    validateCameraSettings,
    mergeWithDefaults,
    getGraphicsPreset,
    formatVolume,
    formatSensitivity,
    getAvailableResolutions,
    getAvailableRegions,
    getColorBlindModes
} from './SettingsScreen';
export type { 
    SettingsCategoryId,
    GraphicsSettings,
    AudioSettings,
    ControlSettings,
    CameraSettings,
    NetworkSettings,
    AccessibilitySettings,
    UISettings,
    GameplaySettings,
    AllSettings
} from './SettingsScreen';

// StatsPanel
export {
    STATS_CATEGORIES,
    DEFAULT_STATS_PANEL_CONFIG,
    calculateWinRate,
    calculateKD,
    calculateAccuracy,
    calculateAvgDamage,
    calculateAvgKills,
    formatWinRate,
    formatKD,
    formatAccuracy,
    formatDamage,
    formatPlayTime,
    formatDate,
    getWinRateColor,
    getKDColor,
    getAccuracyColor,
    getAchievementRarityColor,
    getAchievementRarityName,
    compareStats,
    formatDiff,
    getDiffColor,
    sortTanksByStats,
    filterTanksByBattles,
    getTopTanks,
    createEmptyPlayerStats,
    createEmptySessionStats
} from './StatsPanel';
export type {
    PlayerStats,
    TankSpecificStats,
    SessionStats,
    PeriodStats,
    Achievement,
    AchievementCategory,
    StatsPanelConfig,
    StatsCategoryId
} from './StatsPanel';

// PlayMenuPanel
export {
    GAME_MODES,
    MODE_CATEGORIES,
    DEFAULT_MATCHMAKING_CONFIG,
    getGameMode,
    getModesByCategory,
    getAvailableModes,
    getRankedModes,
    checkModeRequirements,
    formatWaitTime,
    getEstimatedWaitTime,
    createInitialMatchmakingState,
    getMatchmakingStatusText,
    getMatchmakingStatusColor
} from './PlayMenuPanel';
export type {
    GameModeId,
    GameModeCategory,
    GameMode,
    GameModeRequirement,
    MatchmakingConfig,
    MatchmakingStatus,
    MatchmakingState
} from './PlayMenuPanel';
