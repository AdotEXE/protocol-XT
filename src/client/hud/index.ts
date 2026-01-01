/**
 * @module hud
 * @description HUD Module - централизованный экспорт типов, констант и компонентов
 */

// Типы
export type {
    ArsenalSlot,
    POIMinimapMarker,
    POI3DMarker,
    ActiveEffect,
    DamageDirection,
    ComboElement,
    HUDConfig,
    HUDState
} from './HUDTypes';

export { DEFAULT_HUD_CONFIG } from './HUDTypes';

// Константы
export {
    HUD_COLORS,
    HUD_SIZES,
    HUD_FONTS,
    HUD_ANIMATIONS,
    HUD_Z_INDEX,
    HUD_THRESHOLDS
} from './HUDConstants';

// Компоненты
export { Crosshair, DEFAULT_CROSSHAIR_CONFIG } from './components';
export type { CrosshairConfig } from './components';

export { HealthBar, DEFAULT_HEALTHBAR_CONFIG } from './components';
export type { HealthBarConfig } from './components';

export { Minimap, DEFAULT_MINIMAP_CONFIG } from './components';
export type { MinimapConfig, MinimapMarker } from './components';

export { Compass, DEFAULT_COMPASS_CONFIG } from './components';
export type { CompassConfig } from './components';

export { ConsumablesBar, DEFAULT_CONSUMABLES_CONFIG } from './components';
export type { ConsumablesBarConfig, ConsumableSlotData } from './components';

export { TargetIndicator, DEFAULT_TARGET_CONFIG } from './components';
export type { TargetIndicatorConfig, TargetData } from './components';

export { DamageIndicator, DEFAULT_DAMAGE_CONFIG } from './components';
export type { DamageIndicatorConfig } from './components';

export { NotificationQueue, DEFAULT_NOTIFICATION_CONFIG } from './components';
export type { NotificationQueueConfig, NotificationType } from './components';

export { FuelIndicator, DEFAULT_FUEL_CONFIG } from './components';
export type { FuelIndicatorConfig } from './components';

export { TankStatus, DEFAULT_TANK_STATUS_CONFIG } from './components';
export type { TankStatusConfig, TankStatusData } from './components';

// MinimapManager
export { 
    MinimapManager, 
    DEFAULT_MINIMAP_MANAGER_CONFIG,
    worldToRadar,
    getAngleToTarget,
    normalizeAngle,
    isInScanZone,
    getCompassDirection,
    interpolateColor
} from './MinimapManager';
export type { 
    MinimapManagerConfig, 
    EnemyMarkerData, 
    MinimapMarker as MinimapManagerMarker,
    ScannedEnemy,
    PlayerMarkerData 
} from './MinimapManager';

// MultiplayerHUD
export {
    MultiplayerHUDManager,
    DEFAULT_SCOREBOARD_CONFIG,
    DEFAULT_BR_CONFIG,
    DEFAULT_CTF_CONFIG,
    formatKDRatio,
    formatTime,
    formatDistance,
    getTeamColor,
    sortPlayersByScore,
    getPlayerRank,
    formatFlagStatus,
    getBRZoneColor,
    getBRZoneStatus
} from './MultiplayerHUD';
export type {
    GameModeType,
    TeamData,
    PlayerScoreData,
    BattleRoyaleInfo,
    BattleRoyaleConfig,
    CTFState,
    CTFConfig,
    ScoreboardConfig
} from './MultiplayerHUD';

// POIManager
export {
    POIManager,
    DEFAULT_POI_CONFIG,
    DEFAULT_CAPTURE_CONFIG,
    getPOIColor,
    getPOIIcon,
    getPOITypeName,
    formatPOIDistance,
    getDistanceToPOI,
    getDirectionToPOI,
    calculateDistanceFade,
    calculatePulse,
    getCaptureProgressColor,
    sortPOIByDistance,
    filterPOIByType,
    filterPOIByDistance
} from './POIManager';
export type {
    POIType,
    POIData,
    POIMarkerConfig,
    CaptureBarConfig
} from './POIManager';

// MissionPanel
export {
    MissionPanelManager,
    DEFAULT_MISSION_PANEL_CONFIG,
    DEFAULT_MISSION_ITEM_CONFIG,
    getMissionStatusColor,
    getMissionTypeIcon,
    getMissionTypeName,
    getDifficultyColor,
    getDifficultyName,
    calculateMissionProgress,
    isMissionComplete,
    formatMissionTime,
    formatReward,
    sortMissionsByPriority,
    filterMissionsByType,
    filterMissionsByStatus
} from './MissionPanel';
export type {
    MissionType,
    MissionStatus,
    MissionDifficulty,
    MissionObjective,
    MissionReward,
    MissionData,
    MissionPanelConfig,
    MissionItemConfig
} from './MissionPanel';

// FullMapManager
export {
    FullMapManager,
    DEFAULT_FULLMAP_CONFIG,
    DEFAULT_MARKER_CONFIG,
    DEFAULT_LEGEND_ITEMS,
    getMarkerColor,
    worldToMapCoordinates,
    mapToWorldCoordinates,
    calculateMapBounds,
    calculateMapScale,
    formatCoordinates,
    generateGridLines,
    isInMapBounds,
    getMapDistance,
    calculateMarkerPulse
} from './FullMapManager';
export type {
    FullMapMarkerType,
    FullMapMarkerData,
    MapBounds,
    LegendItem,
    FullMapConfig,
    MarkerConfig
} from './FullMapManager';
