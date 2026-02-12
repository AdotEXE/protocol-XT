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

// Индикатор боеприпасов
export { AmmoIndicator, DEFAULT_AMMO_CONFIG } from './AmmoIndicator';
export type { AmmoIndicatorConfig, AmmoState } from './AmmoIndicator';

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

// Индикатор цели
export { TargetIndicator, DEFAULT_TARGET_CONFIG } from './TargetIndicator';
export type { TargetIndicatorConfig, TargetData } from './TargetIndicator';

// Индикатор урона
export { DamageIndicator, DEFAULT_DAMAGE_CONFIG } from './DamageIndicator';
export type { DamageIndicatorConfig } from './DamageIndicator';

// Очередь уведомлений
export { NotificationQueue, DEFAULT_NOTIFICATION_CONFIG } from './NotificationQueue';
export type { NotificationQueueConfig, NotificationType } from './NotificationQueue';

// Индикатор топлива
export { FuelIndicator, DEFAULT_FUEL_CONFIG } from './FuelIndicator';
export type { FuelIndicatorConfig } from './FuelIndicator';

// Статус танка
export { TankStatus, DEFAULT_TANK_STATUS_CONFIG } from './TankStatus';
export type { TankStatusConfig, TankStatusData } from './TankStatus';

// Экранная вспышка при уроне
export { ScreenFlashEffect } from './ScreenFlashEffect';
export type { FlashDirection } from './ScreenFlashEffect';

// Экран смерти
export { DeathScreen, DEFAULT_DEATH_SCREEN_CONFIG } from './DeathScreen';
export type { DeathScreenConfig } from './DeathScreen';

// Панель арсенала
export { ArsenalBar, DEFAULT_ARSENAL_CONFIG } from './ArsenalBar';
export type { ArsenalBarConfig, ArsenalSlotData } from './ArsenalBar';

// Индикатор скорости
export { SpeedIndicator, DEFAULT_SPEED_CONFIG } from './SpeedIndicator';
export type { SpeedIndicatorConfig } from './SpeedIndicator';

// Полоса перезарядки
export { ReloadBar, DEFAULT_RELOAD_CONFIG } from './ReloadBar';
export type { ReloadBarConfig } from './ReloadBar';

// Лента уничтожений
export { KillFeed, DEFAULT_KILLFEED_CONFIG } from './KillFeed';
export type { KillFeedConfig, KillFeedEntry } from './KillFeed';

// Полоса опыта
export { ExperienceBar, DEFAULT_EXPERIENCE_BAR_CONFIG } from './ExperienceBar';
export type { ExperienceBarConfig } from './ExperienceBar';

// Полоса здоровья цели
export { TargetHealthBar } from './TargetHealthBar';
export type { TargetInfo } from './TargetHealthBar';

// Плавающие числа урона
export { FloatingDamageNumbers, DEFAULT_DAMAGE_NUMBER_CONFIG } from './FloatingDamageNumbers';
export type { DamageNumberConfig } from './FloatingDamageNumbers';

// Layout и темы
export { HUDLayout, DEFAULT_LAYOUT_CONFIG } from './HUDLayout';
export type { ComponentPosition, ComponentSize, LayoutConfig } from './HUDLayout';

export { HUDThemeManager, DEFAULT_THEME, DARK_THEME, LIGHT_THEME } from './HUDTheme';
export type { HUDTheme, HUDColorScheme } from './HUDTheme';

export { HUDManager } from './HUDManager';
export type { HUDManagerConfig } from './HUDManager';

// Экранное управление (джойстик)
export { TouchControls, DEFAULT_TOUCH_CONTROLS_CONFIG } from './TouchControls';
export type { TouchControlsConfig, TouchInputState } from './TouchControls';

// Виньетка при низком здоровье
export { LowHealthVignette, DEFAULT_LOW_HEALTH_CONFIG } from './LowHealthVignette';
export type { LowHealthVignetteConfig } from './LowHealthVignette';

// Aircraft HUD (Mouse-Aim ретикли)
export { AircraftHUD, DEFAULT_AIRCRAFT_HUD_CONFIG } from './AircraftHUD';
export type { AircraftHUDConfig } from './AircraftHUD';

// Game Mode Specific HUD Components
export { BattleRoyaleHUD, DEFAULT_CONFIG as DEFAULT_BR_HUD_CONFIG } from './BattleRoyaleHUD';
export type { BattleRoyaleHUDConfig } from './BattleRoyaleHUD';

export { ControlPointHUD, DEFAULT_CONFIG as DEFAULT_CP_HUD_CONFIG } from './ControlPointHUD';
export type { ControlPointHUDConfig, ControlPointData } from './ControlPointHUD';

export { EscortHUD, DEFAULT_CONFIG as DEFAULT_ESCORT_HUD_CONFIG } from './EscortHUD';
export type { EscortHUDConfig, EscortPayloadData } from './EscortHUD';

export { SurvivalHUD, DEFAULT_CONFIG as DEFAULT_SURVIVAL_HUD_CONFIG } from './SurvivalHUD';
export type { SurvivalHUDConfig, SurvivalWaveData } from './SurvivalHUD';

export { RaidHUD, DEFAULT_CONFIG as DEFAULT_RAID_HUD_CONFIG } from './RaidHUD';
export type { RaidHUDConfig, RaidBossData } from './RaidHUD';

export { FFAHUD, DEFAULT_CONFIG as DEFAULT_FFA_HUD_CONFIG } from './FFAHUD';
export type { FFAHUDConfig } from './FFAHUD';

export { TDMHUD, DEFAULT_CONFIG as DEFAULT_TDM_HUD_CONFIG } from './TDMHUD';
export type { TDMHUDConfig } from './TDMHUD';

export { CTFHUD, DEFAULT_CONFIG as DEFAULT_CTF_HUD_CONFIG } from './CTFHUD';
export type { CTFHUDConfig, CTFFlagData } from './CTFHUD';

export { CoopHUD, DEFAULT_CONFIG as DEFAULT_COOP_HUD_CONFIG } from './CoopHUD';
export type { CoopHUDConfig } from './CoopHUD';
