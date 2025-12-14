/**
 * Menu Settings Module
 * Логика работы с настройками игры из menu.ts
 */

export interface GameSettings {
    renderDistance: number;
    soundVolume: number;
    musicVolume: number;
    mouseSensitivity: number;
    showFPS: boolean;
    showMinimap: boolean;
    cameraDistance: number;
    cameraHeight: number;
    aimFOV: number;
    graphicsQuality: number;
    vsync: boolean;
    fullscreen: boolean;
    aimAssist: boolean;
    showDamageNumbers: boolean;
    screenShake: boolean;
    virtualTurretFixation: boolean;
    language: string;
    enemyDifficulty: "easy" | "medium" | "hard";
    worldSeed: number;
    useRandomSeed: boolean;
    particleQuality: number;
    shadowQuality: number;
    antiAliasing: boolean;
    bloom: boolean;
    motionBlur: boolean;
    textureQuality: number;
    lightingQuality: number;
}

const DEFAULT_SETTINGS: GameSettings = {
    renderDistance: 2000,
    soundVolume: 0.7,
    musicVolume: 0.5,
    mouseSensitivity: 1.0,
    showFPS: false,
    showMinimap: true,
    cameraDistance: 15,
    cameraHeight: 8,
    aimFOV: 45,
    graphicsQuality: 1,
    vsync: true,
    fullscreen: false,
    aimAssist: false,
    showDamageNumbers: true,
    screenShake: true,
    virtualTurretFixation: false,
    language: "ru",
    enemyDifficulty: "medium",
    worldSeed: 12345,
    useRandomSeed: false,
    particleQuality: 1,
    shadowQuality: 1,
    antiAliasing: true,
    bloom: true,
    motionBlur: false,
    textureQuality: 1,
    lightingQuality: 1
};

/**
 * Загружает настройки из localStorage
 */
export function loadSettings(): GameSettings {
    const saved = localStorage.getItem("gameSettings");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            return { ...DEFAULT_SETTINGS, ...parsed };
        } catch (e) {
            console.error("Failed to parse settings:", e);
        }
    }
    return { ...DEFAULT_SETTINGS };
}

/**
 * Сохраняет настройки в localStorage
 */
export function saveSettings(settings: GameSettings): void {
    localStorage.setItem("gameSettings", JSON.stringify(settings));
}

/**
 * Применяет настройки к игре
 */
export function applySettings(settings: GameSettings, engine: any, scene: any): void {
    // TODO: Переместить логику применения настроек из menu.ts
    // Применение настроек графики, звука и т.д.
}

