/**
 * @module hud/components
 * @description Модульные компоненты HUD
 * 
 * Компоненты:
 * - Crosshair - прицел
 * - HealthBar - полоса здоровья
 * - Minimap - радар/миникарта
 * - Compass - компас
 * - ConsumablesBar - панель расходников
 */

// Прицел
export { Crosshair, DEFAULT_CROSSHAIR_CONFIG } from './Crosshair';
export type { CrosshairConfig } from './Crosshair';

// Полоса здоровья
export { HealthBar, DEFAULT_HEALTHBAR_CONFIG } from './HealthBar';
export type { HealthBarConfig } from './HealthBar';

// Миникарта
export { Minimap, DEFAULT_MINIMAP_CONFIG } from './Minimap';
export type { MinimapConfig, MinimapMarker } from './Minimap';

// Компас
export { Compass, DEFAULT_COMPASS_CONFIG } from './Compass';
export type { CompassConfig } from './Compass';

// Панель расходников
export { ConsumablesBar, DEFAULT_CONSUMABLES_CONFIG } from './ConsumablesBar';
export type { ConsumablesBarConfig, ConsumableSlotData } from './ConsumablesBar';

