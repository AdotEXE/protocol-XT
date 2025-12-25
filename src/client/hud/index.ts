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
