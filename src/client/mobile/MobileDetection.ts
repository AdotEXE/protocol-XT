/**
 * @module mobile/MobileDetection
 * @description Определение мобильных устройств и их характеристик
 */

/**
 * Тип устройства
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Информация об устройстве
 */
export interface DeviceInfo {
    type: DeviceType;
    isTouchDevice: boolean;
    isMobile: boolean;
    isTablet: boolean;
    screenWidth: number;
    screenHeight: number;
    pixelRatio: number;
    userAgent: string;
}

/**
 * Определить тип устройства
 */
export function detectDeviceType(): DeviceType {
    const width = window.innerWidth;
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Проверка по ширине экрана
    if (width < 768) {
        return 'mobile';
    }
    
    if (width < 1024) {
        // Проверка по user agent для более точного определения
        if (userAgent.match(/tablet|ipad|playbook|silk/i)) {
            return 'tablet';
        }
        return 'mobile';
    }
    
    return 'desktop';
}

/**
 * Проверить наличие touchscreen
 */
export function hasTouchScreen(): boolean {
    return (
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0
    );
}

/**
 * Получить полную информацию об устройстве
 */
export function getDeviceInfo(): DeviceInfo {
    const type = detectDeviceType();
    const isTouch = hasTouchScreen();
    
    return {
        type,
        isTouchDevice: isTouch,
        isMobile: type === 'mobile',
        isTablet: type === 'tablet',
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        pixelRatio: window.devicePixelRatio || 1,
        userAgent: navigator.userAgent
    };
}

/**
 * Проверить является ли устройство мобильным (для управления)
 */
export function isMobileDevice(): boolean {
    const info = getDeviceInfo();
    return info.isMobile || (info.isTablet && info.isTouchDevice);
}

/**
 * Получить масштаб для мобильных элементов управления
 */
export function getMobileScale(): number {
    const { screenWidth, screenHeight } = getDeviceInfo();
    const minDimension = Math.min(screenWidth, screenHeight);
    
    // Базовый масштаб для мобильных (относительно 1920x1080)
    const baseScale = minDimension / 1080;
    
    // Ограничиваем диапазон
    return Math.max(0.6, Math.min(1.2, baseScale));
}

export default {
    detectDeviceType,
    hasTouchScreen,
    getDeviceInfo,
    isMobileDevice,
    getMobileScale
};

