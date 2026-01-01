/**
 * @module menu/screens/SettingsScreen
 * @description Экран настроек игры - типы, конфигурация и вспомогательные функции
 * 
 * Этот модуль содержит:
 * - Категории и типы настроек
 * - Значения по умолчанию
 * - Вспомогательные функции для работы с настройками
 */

// ============================================
// КАТЕГОРИИ НАСТРОЕК
// ============================================

/**
 * Категории настроек
 */
export const SETTINGS_CATEGORIES = [
    { id: "graphics", label: "Графика", icon: "🖥️" },
    { id: "audio", label: "Звук", icon: "🔊" },
    { id: "controls", label: "Управление", icon: "🎮" },
    { id: "camera", label: "Камера", icon: "📷" },
    { id: "ui", label: "Интерфейс", icon: "📱" },
    { id: "gameplay", label: "Геймплей", icon: "🎯" },
    { id: "network", label: "Сеть", icon: "🌐" },
    { id: "accessibility", label: "Доступность", icon: "♿" }
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
// ============================================
// НАСТРОЙКИ СЕТИ
// ============================================

/**
 * Настройки сети
 */
export interface NetworkSettings {
    region: "auto" | "eu" | "na" | "asia" | "ru";
    maxPing: number;
    showPing: boolean;
    showFPS: boolean;
    showNetworkStats: boolean;
}

// ============================================
// НАСТРОЙКИ ДОСТУПНОСТИ
// ============================================

/**
 * Настройки доступности
 */
export interface AccessibilitySettings {
    colorBlindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
    highContrastUI: boolean;
    subtitles: boolean;
    screenShakeReduction: number;
    flashingEffectsReduction: boolean;
}

// ============================================
// НАСТРОЙКИ ИНТЕРФЕЙСА
// ============================================

/**
 * Настройки интерфейса
 */
export interface UISettings {
    hudScale: number;
    minimapSize: number;
    crosshairStyle: number;
    crosshairColor: string;
    showDamageNumbers: boolean;
    showKillFeed: boolean;
    chatOpacity: number;
    language: "ru" | "en";
}

// ============================================
// НАСТРОЙКИ ГЕЙМПЛЕЯ
// ============================================

/**
 * Настройки геймплея
 */
export interface GameplaySettings {
    autoAim: boolean;
    aimAssist: number;
    showTrajectory: boolean;
    vibration: boolean;
    tutorialHints: boolean;
    confirmPurchases: boolean;
}

// ============================================
// ОБЪЕДИНЁННЫЙ ТИП НАСТРОЕК
// ============================================

/**
 * Все категории настроек
 */
export interface AllSettings {
    graphics: GraphicsSettings;
    audio: AudioSettings;
    controls: ControlSettings;
    camera: CameraSettings;
    network: NetworkSettings;
    accessibility: AccessibilitySettings;
    ui: UISettings;
    gameplay: GameplaySettings;
}

// ============================================
// ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ
// ============================================

/**
 * Все настройки по умолчанию
 */
export const DEFAULT_SETTINGS_SCREEN: AllSettings = {
    graphics: {
        quality: "medium",
        shadowQuality: 2,
        particleQuality: 1,
        antiAliasing: true,
        vsync: false,
        fullscreen: false,
        resolution: "auto"
    },
    
    audio: {
        masterVolume: 80,
        soundVolume: 80,
        musicVolume: 50,
        ambientVolume: 60,
        voiceVolume: 100,
        muteOnFocusLoss: true
    },
    
    controls: {
        mouseSensitivity: 1.0,
        invertMouseY: false,
        autoReload: true,
        holdToAim: false
    },
    
    camera: {
        cameraDistance: 20,
        cameraHeight: 8,
        cameraFOV: 75,
        cameraSmoothing: 0.1,
        cameraShakeIntensity: 1.0,
        firstPersonMode: false
    },
    
    network: {
        region: "auto",
        maxPing: 150,
        showPing: true,
        showFPS: true,
        showNetworkStats: false
    },
    
    accessibility: {
        colorBlindMode: "none",
        highContrastUI: false,
        subtitles: false,
        screenShakeReduction: 0,
        flashingEffectsReduction: false
    },
    
    ui: {
        hudScale: 1.0,
        minimapSize: 1.0,
        crosshairStyle: 0,
        crosshairColor: "#00ff00",
        showDamageNumbers: true,
        showKillFeed: true,
        chatOpacity: 0.8,
        language: "ru"
    },
    
    gameplay: {
        autoAim: false,
        aimAssist: 0,
        showTrajectory: false,
        vibration: true,
        tutorialHints: true,
        confirmPurchases: true
    }
};

// Для обратной совместимости
export const DEFAULT_SETTINGS = DEFAULT_SETTINGS_SCREEN;

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Получить категорию по ID
 */
export function getSettingsCategory(id: SettingsCategoryId): typeof SETTINGS_CATEGORIES[number] | undefined {
    return SETTINGS_CATEGORIES.find(cat => cat.id === id);
}

/**
 * Получить label категории
 */
export function getCategoryLabel(id: SettingsCategoryId): string {
    const category = getSettingsCategory(id);
    return category?.label || id;
}

/**
 * Валидировать настройки графики
 */
export function validateGraphicsSettings(settings: Partial<GraphicsSettings>): GraphicsSettings {
    return {
        quality: settings.quality || DEFAULT_SETTINGS_SCREEN.graphics.quality,
        shadowQuality: settings.shadowQuality ?? DEFAULT_SETTINGS_SCREEN.graphics.shadowQuality,
        particleQuality: settings.particleQuality ?? DEFAULT_SETTINGS_SCREEN.graphics.particleQuality,
        antiAliasing: settings.antiAliasing ?? DEFAULT_SETTINGS_SCREEN.graphics.antiAliasing,
        vsync: settings.vsync ?? DEFAULT_SETTINGS_SCREEN.graphics.vsync,
        fullscreen: settings.fullscreen ?? DEFAULT_SETTINGS_SCREEN.graphics.fullscreen,
        resolution: settings.resolution || DEFAULT_SETTINGS_SCREEN.graphics.resolution
    };
}

/**
 * Валидировать настройки звука
 */
export function validateAudioSettings(settings: Partial<AudioSettings>): AudioSettings {
    return {
        masterVolume: clamp(settings.masterVolume ?? DEFAULT_SETTINGS_SCREEN.audio.masterVolume, 0, 100),
        soundVolume: clamp(settings.soundVolume ?? DEFAULT_SETTINGS_SCREEN.audio.soundVolume, 0, 100),
        musicVolume: clamp(settings.musicVolume ?? DEFAULT_SETTINGS_SCREEN.audio.musicVolume, 0, 100),
        ambientVolume: clamp(settings.ambientVolume ?? DEFAULT_SETTINGS_SCREEN.audio.ambientVolume, 0, 100),
        voiceVolume: clamp(settings.voiceVolume ?? DEFAULT_SETTINGS_SCREEN.audio.voiceVolume, 0, 100),
        muteOnFocusLoss: settings.muteOnFocusLoss ?? DEFAULT_SETTINGS_SCREEN.audio.muteOnFocusLoss
    };
}

/**
 * Валидировать настройки управления
 */
export function validateControlSettings(settings: Partial<ControlSettings>): ControlSettings {
    return {
        mouseSensitivity: clamp(settings.mouseSensitivity ?? DEFAULT_SETTINGS_SCREEN.controls.mouseSensitivity, 0.1, 5.0),
        invertMouseY: settings.invertMouseY ?? DEFAULT_SETTINGS_SCREEN.controls.invertMouseY,
        autoReload: settings.autoReload ?? DEFAULT_SETTINGS_SCREEN.controls.autoReload,
        holdToAim: settings.holdToAim ?? DEFAULT_SETTINGS_SCREEN.controls.holdToAim
    };
}

/**
 * Валидировать настройки камеры
 */
export function validateCameraSettings(settings: Partial<CameraSettings>): CameraSettings {
    return {
        cameraDistance: clamp(settings.cameraDistance ?? DEFAULT_SETTINGS_SCREEN.camera.cameraDistance, 5, 50),
        cameraHeight: clamp(settings.cameraHeight ?? DEFAULT_SETTINGS_SCREEN.camera.cameraHeight, 2, 20),
        cameraFOV: clamp(settings.cameraFOV ?? DEFAULT_SETTINGS_SCREEN.camera.cameraFOV, 50, 120),
        cameraSmoothing: clamp(settings.cameraSmoothing ?? DEFAULT_SETTINGS_SCREEN.camera.cameraSmoothing, 0, 1),
        cameraShakeIntensity: clamp(settings.cameraShakeIntensity ?? DEFAULT_SETTINGS_SCREEN.camera.cameraShakeIntensity, 0, 2),
        firstPersonMode: settings.firstPersonMode ?? DEFAULT_SETTINGS_SCREEN.camera.firstPersonMode
    };
}

/**
 * Ограничить значение в диапазоне
 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Объединить настройки с дефолтами
 */
export function mergeWithDefaults<T extends keyof AllSettings>(
    category: T,
    settings: Partial<AllSettings[T]>
): AllSettings[T] {
    return { ...DEFAULT_SETTINGS_SCREEN[category], ...settings };
}

/**
 * Получить preset качества графики
 */
export function getGraphicsPreset(quality: GraphicsSettings["quality"]): Partial<GraphicsSettings> {
    switch (quality) {
        case "low":
            return { shadowQuality: 0, particleQuality: 0, antiAliasing: false };
        case "medium":
            return { shadowQuality: 1, particleQuality: 1, antiAliasing: true };
        case "high":
            return { shadowQuality: 2, particleQuality: 2, antiAliasing: true };
        case "ultra":
            return { shadowQuality: 3, particleQuality: 2, antiAliasing: true };
        default:
            return {};
    }
}

/**
 * Форматировать громкость для отображения
 */
export function formatVolume(volume: number): string {
    return `${Math.round(volume)}%`;
}

/**
 * Форматировать чувствительность
 */
export function formatSensitivity(sensitivity: number): string {
    return sensitivity.toFixed(2);
}

/**
 * Получить список доступных разрешений
 */
export function getAvailableResolutions(): string[] {
    return [
        "auto",
        "1280x720",
        "1366x768",
        "1600x900",
        "1920x1080",
        "2560x1440",
        "3840x2160"
    ];
}

/**
 * Получить список регионов
 */
export function getAvailableRegions(): { id: NetworkSettings["region"]; label: string }[] {
    return [
        { id: "auto", label: "Автоматически" },
        { id: "eu", label: "Европа" },
        { id: "na", label: "Северная Америка" },
        { id: "asia", label: "Азия" },
        { id: "ru", label: "Россия" }
    ];
}

/**
 * Получить список режимов дальтонизма
 */
export function getColorBlindModes(): { id: AccessibilitySettings["colorBlindMode"]; label: string }[] {
    return [
        { id: "none", label: "Выключено" },
        { id: "protanopia", label: "Протанопия (красный)" },
        { id: "deuteranopia", label: "Дейтеранопия (зелёный)" },
        { id: "tritanopia", label: "Тританопия (синий)" }
    ];
}

export default { 
    SETTINGS_CATEGORIES, 
    DEFAULT_SETTINGS: DEFAULT_SETTINGS_SCREEN,
    DEFAULT_SETTINGS_SCREEN
};

