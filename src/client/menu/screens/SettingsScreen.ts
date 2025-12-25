/**
 * @module menu/screens/SettingsScreen
 * @description Экран настроек игры
 */

/**
 * Категории настроек
 */
export const SETTINGS_CATEGORIES = [
    { id: "graphics", label: "Графика", icon: "🖥️" },
    { id: "audio", label: "Звук", icon: "🔊" },
    { id: "controls", label: "Управление", icon: "🎮" },
    { id: "camera", label: "Камера", icon: "📷" },
    { id: "ui", label: "Интерфейс", icon: "📱" },
    { id: "gameplay", label: "Геймплей", icon: "🎯" }
] as const;

/**
 * Тип категории настроек
 */
export type SettingsCategoryId = typeof SETTINGS_CATEGORIES[number]["id"];

/**
 * Настройки графики
 */
export interface GraphicsSettings {
    quality: "low" | "medium" | "high" | "ultra";
    shadowQuality: 0 | 1 | 2 | 3;
    particleQuality: 0 | 1 | 2;
    antiAliasing: boolean;
    vsync: boolean;
    fullscreen: boolean;
    resolution: string;
}

/**
 * Настройки звука
 */
export interface AudioSettings {
    masterVolume: number;
    soundVolume: number;
    musicVolume: number;
    ambientVolume: number;
    voiceVolume: number;
    muteOnFocusLoss: boolean;
}

/**
 * Настройки управления
 */
export interface ControlSettings {
    mouseSensitivity: number;
    invertMouseY: boolean;
    autoReload: boolean;
    holdToAim: boolean;
}

/**
 * Настройки камеры
 */
export interface CameraSettings {
    cameraDistance: number;
    cameraHeight: number;
    cameraFOV: number;
    cameraSmoothing: number;
    cameraShakeIntensity: number;
    firstPersonMode: boolean;
}

/**
 * Все настройки по умолчанию
 */
export const DEFAULT_SETTINGS = {
    graphics: {
        quality: "medium",
        shadowQuality: 2,
        particleQuality: 1,
        antiAliasing: true,
        vsync: false,
        fullscreen: false,
        resolution: "auto"
    } as GraphicsSettings,
    
    audio: {
        masterVolume: 80,
        soundVolume: 80,
        musicVolume: 50,
        ambientVolume: 60,
        voiceVolume: 100,
        muteOnFocusLoss: true
    } as AudioSettings,
    
    controls: {
        mouseSensitivity: 1.0,
        invertMouseY: false,
        autoReload: true,
        holdToAim: false
    } as ControlSettings,
    
    camera: {
        cameraDistance: 20,
        cameraHeight: 8,
        cameraFOV: 75,
        cameraSmoothing: 0.1,
        cameraShakeIntensity: 1.0,
        firstPersonMode: false
    } as CameraSettings
};

export default { SETTINGS_CATEGORIES, DEFAULT_SETTINGS };

