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
export { default as MobileControlsManager } from './MobileControlsManager';

