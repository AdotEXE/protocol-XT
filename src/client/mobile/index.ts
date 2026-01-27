/**
 * @module mobile
 * @description Мобильное управление для Protocol TX
 */

export { default as MobileDetection, getDeviceInfo, isMobileDevice, getMobileScale } from './MobileDetection';
export { default as HapticFeedback, getHapticFeedback, HapticType } from './HapticFeedback';
export { default as FloatingJoystick, DEFAULT_FLOATING_JOYSTICK_CONFIG } from './FloatingJoystick';
export { default as AimZoomButton, DEFAULT_AIM_ZOOM_CONFIG } from './AimZoomButton';
export { default as MobileHUD, DEFAULT_MOBILE_HUD_CONFIG } from './MobileHUD';
export { default as MobilePerformance, DEFAULT_MOBILE_PERFORMANCE } from './MobilePerformance';
export { default as MobileControlsManager, type MobileInputState } from './MobileControlsManager';
export { default as DynamicOpacityManager, type OpacityState, type UIElementCategory } from './DynamicOpacityManager';
export { default as VirtualScrollWheel, DEFAULT_SCROLL_WHEEL_CONFIG } from './VirtualScrollWheel';
export { default as GunElevationSlider, DEFAULT_GUN_ELEVATION_CONFIG } from './GunElevationSlider';
export { default as FreeLookZone, DEFAULT_FREE_LOOK_CONFIG } from './FreeLookZone';
export { default as RadialMenu, type RadialMenuItem } from './RadialMenu';
export { default as ContextualRepair, type DamagedModule } from './ContextualRepair';

