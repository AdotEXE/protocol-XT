/**
 * Menu Settings Module
 * Логика работы с настройками игры из menu.ts
 */

import { logger } from "../utils/logger";

export interface GameSettings {
    // Existing settings
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
    
    // Graphics
    particleQuality: number;
    shadowQuality: number;
    antiAliasing: boolean;
    bloom: boolean;
    motionBlur: boolean;
    textureQuality: number;
    lightingQuality: number;
    
    // Audio
    masterVolume: number;
    ambientVolume: number;
    voiceVolume: number;
    muteOnFocusLoss: boolean;
    
    // Controls
    invertMouseY: boolean;
    keyboardLayout: string;
    autoReload: boolean;
    holdToAim: boolean;
    
    // Gameplay
    showTutorial: boolean;
    showHints: boolean;
    showCrosshair: boolean;
    crosshairStyle: string;
    showHealthBar: boolean;
    showAmmoCounter: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
    
    // Camera
    cameraSmoothing: number;
    cameraShakeIntensity: number;
    firstPersonMode: boolean;
    cameraFOV: number;
    
    // Network
    showPing: boolean;
    showNetworkStats: boolean;
    networkQuality: number;
    
    // Accessibility
    colorBlindMode: string;
    fontSize: number;
    highContrast: boolean;
    subtitles: boolean;
    
    // Additional
    showDebugInfo: boolean;
    enableCheats: boolean;
    maxFPS: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
    // Existing settings
    renderDistance: 3,
    soundVolume: 70,
    musicVolume: 50,
    mouseSensitivity: 5,
    showFPS: true,
    showMinimap: true,
    cameraDistance: 12,
    cameraHeight: 5,
    aimFOV: 0.4,
    graphicsQuality: 2,
    vsync: false,
    fullscreen: false,
    aimAssist: true,
    showDamageNumbers: true,
    screenShake: true,
    virtualTurretFixation: false,
    language: "ru",
    enemyDifficulty: "medium",
    worldSeed: 12345,
    useRandomSeed: true,
    
    // Graphics
    particleQuality: 2,
    shadowQuality: 2,
    antiAliasing: true,
    bloom: false,
    motionBlur: false,
    textureQuality: 2,
    lightingQuality: 2,
    
    // Audio
    masterVolume: 100,
    ambientVolume: 20,
    voiceVolume: 100,
    muteOnFocusLoss: false,
    
    // Controls
    invertMouseY: false,
    keyboardLayout: "qwerty",
    autoReload: false,
    holdToAim: false,
    
    // Gameplay
    showTutorial: true,
    showHints: true,
    showCrosshair: true,
    crosshairStyle: "default",
    showHealthBar: true,
    showAmmoCounter: true,
    autoSave: true,
    autoSaveInterval: 300,
    
    // Camera
    cameraSmoothing: 0.7,
    cameraShakeIntensity: 1.0,
    firstPersonMode: false,
    cameraFOV: 60,
    
    // Network
    showPing: false,
    showNetworkStats: false,
    networkQuality: 2,
    
    // Accessibility
    colorBlindMode: "none",
    fontSize: 14,
    highContrast: false,
    subtitles: false,
    
    // Additional
    showDebugInfo: false,
    enableCheats: false,
    maxFPS: 0
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
            logger.error("Failed to parse settings:", e);
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
 * Вспомогательные функции для чтения значений из UI элементов
 */
function getInt(id: string, def: number): number {
    const el = document.getElementById(id) as HTMLInputElement;
    return el ? parseInt(el.value || def.toString()) : def;
}

function getFloat(id: string, def: number): number {
    const el = document.getElementById(id) as HTMLInputElement;
    return el ? parseFloat(el.value || def.toString()) : def;
}

function getBool(id: string, def: boolean): boolean {
    const el = document.getElementById(id) as HTMLInputElement;
    return el ? el.checked : def;
}

function getSelect(id: string, def: string): string {
    const el = document.getElementById(id) as HTMLSelectElement;
    return el ? el.value || def : def;
}

/**
 * Сохраняет настройки из UI элементов формы
 */
export function saveSettingsFromUI(): GameSettings {
    // Determine world seed
    const useRandomSeed = getBool("set-random-seed", true);
    let worldSeed = getInt("set-seed", 12345);
    if (useRandomSeed) {
        worldSeed = Math.floor(Math.random() * 999999999);
    }
    
    const settings: GameSettings = {
        // Existing settings
        renderDistance: getInt("set-render", 3),
        soundVolume: getInt("set-sound", 70),
        musicVolume: getInt("set-music", 50),
        mouseSensitivity: getInt("set-mouse", 5),
        showFPS: getBool("set-fps", true),
        showMinimap: getBool("set-minimap", true),
        cameraDistance: getInt("set-camera-dist", 12),
        cameraHeight: getFloat("set-camera-height", 5),
        aimFOV: getFloat("set-aim-fov", 0.4),
        graphicsQuality: parseInt(getSelect("set-graphics", "2")),
        vsync: getBool("set-vsync", false),
        fullscreen: getBool("set-fullscreen", false),
        aimAssist: getBool("set-aim-assist", true),
        showDamageNumbers: getBool("set-damage-numbers", true),
        screenShake: getBool("set-screen-shake", true),
        virtualTurretFixation: getBool("set-virtual-fixation", false),
        language: getSelect("set-language", "ru"),
        enemyDifficulty: getSelect("set-difficulty", "medium") as "easy" | "medium" | "hard",
        worldSeed: worldSeed,
        useRandomSeed: useRandomSeed,
        
        // Graphics
        particleQuality: getInt("set-particle-quality", 2),
        shadowQuality: getInt("set-shadow-quality", 2),
        antiAliasing: getBool("set-anti-aliasing", true),
        bloom: getBool("set-bloom", false),
        motionBlur: getBool("set-motion-blur", false),
        textureQuality: getInt("set-texture-quality", 2),
        lightingQuality: getInt("set-lighting-quality", 2),
        
        // Audio
        masterVolume: getInt("set-master-volume", 100),
        ambientVolume: getInt("set-ambient-volume", 20),
        voiceVolume: getInt("set-voice-volume", 100),
        muteOnFocusLoss: getBool("set-mute-on-focus-loss", false),
        
        // Controls
        invertMouseY: getBool("set-invert-mouse-y", false),
        keyboardLayout: getSelect("set-keyboard-layout", "qwerty"),
        autoReload: getBool("set-auto-reload", false),
        holdToAim: getBool("set-hold-to-aim", false),
        
        // Gameplay
        showTutorial: getBool("set-show-tutorial", true),
        showHints: getBool("set-show-hints", true),
        showCrosshair: getBool("set-show-crosshair", true),
        crosshairStyle: getSelect("set-crosshair-style", "default"),
        showHealthBar: getBool("set-show-health-bar", true),
        showAmmoCounter: getBool("set-show-ammo-counter", true),
        autoSave: getBool("set-auto-save", true),
        autoSaveInterval: getInt("set-auto-save-interval", 300),
        
        // Camera
        cameraSmoothing: getFloat("set-camera-smoothing", 0.7),
        cameraShakeIntensity: getFloat("set-camera-shake-intensity", 1.0),
        firstPersonMode: getBool("set-first-person-mode", false),
        cameraFOV: getInt("set-camera-fov", 60),
        
        // Network
        showPing: getBool("set-show-ping", false),
        showNetworkStats: getBool("set-show-network-stats", false),
        networkQuality: getInt("set-network-quality", 2),
        
        // Accessibility
        colorBlindMode: getSelect("set-color-blind-mode", "none"),
        fontSize: getInt("set-font-size", 14),
        highContrast: getBool("set-high-contrast", false),
        subtitles: getBool("set-subtitles", false),
        
        // Additional
        showDebugInfo: getBool("set-show-debug-info", false),
        enableCheats: getBool("set-enable-cheats", false),
        maxFPS: getInt("set-max-fps", 0)
    };
    
    saveSettings(settings);
    return settings;
}

/**
 * Применяет настройки к игре
 */
export function applySettings(
    settings: GameSettings, 
    engine: any, 
    scene: any, 
    camera?: any,
    soundManager?: any,
    hud?: any
): void {
    if (!engine || !scene) return;
    
    // === ГРАФИЧЕСКИЕ НАСТРОЙКИ ===
    
    // Качество графики и масштабирование
    if (settings.graphicsQuality !== undefined) {
        const scaling = 1 / Math.max(0.5, settings.graphicsQuality);
        engine.setHardwareScalingLevel(scaling);
    }
    
    // VSync
    if (settings.vsync !== undefined) {
        engine.setHardwareScalingLevel(engine.getHardwareScalingLevel());
        // VSync управляется через engine, но для полного контроля можно добавить
        if (settings.vsync && engine.setTargetFPS) {
            engine.setTargetFPS(60);
        }
    }
    
    // Ограничение FPS
    if (settings.maxFPS && settings.maxFPS > 0) {
        if (engine.setTargetFPS) {
            engine.setTargetFPS(settings.maxFPS);
        }
    }
    
    // Качество частиц
    if (settings.particleQuality !== undefined && scene.getParticleSystem) {
        // Применяется при создании частиц через EffectsManager
    }
    
    // Качество теней
    if (settings.shadowQuality !== undefined && scene.shadowsEnabled !== undefined) {
        // Управление тенями на уровне сцены
    }
    
    // Антиалиасинг
    if (settings.antiAliasing !== undefined) {
        // Управляется через engine при инициализации
    }
    
    // Bloom эффект
    if (settings.bloom !== undefined) {
        // Применяется через постпроцессинг, если доступен
    }
    
    // Motion Blur
    if (settings.motionBlur !== undefined) {
        // Применяется через постпроцессинг, если доступен
    }
    
    // === АУДИО НАСТРОЙКИ ===
    if (soundManager) {
        // Master volume
        if (settings.masterVolume !== undefined) {
            if (soundManager.setMasterVolume) {
                soundManager.setMasterVolume(settings.masterVolume / 100);
            }
        }
        
        // Sound volume
        if (settings.soundVolume !== undefined) {
            if (soundManager.setSoundVolume) {
                soundManager.setSoundVolume(settings.soundVolume / 100);
            }
        }
        
        // Music volume
        if (settings.musicVolume !== undefined) {
            if (soundManager.setMusicVolume) {
                soundManager.setMusicVolume(settings.musicVolume / 100);
            }
        }
        
        // Ambient volume
        if (settings.ambientVolume !== undefined) {
            if (soundManager.setAmbientVolume) {
                soundManager.setAmbientVolume(settings.ambientVolume / 100);
            }
        }
        
        // Voice volume
        if (settings.voiceVolume !== undefined) {
            if (soundManager.setVoiceVolume) {
                soundManager.setVoiceVolume(settings.voiceVolume / 100);
            }
        }
        
        // Mute on focus loss
        if (settings.muteOnFocusLoss !== undefined) {
            if (soundManager.setMuteOnFocusLoss) {
                soundManager.setMuteOnFocusLoss(settings.muteOnFocusLoss);
            }
        }
    }
    
    // === НАСТРОЙКИ КАМЕРЫ ===
    if (camera) {
        // Camera distance
        if (settings.cameraDistance !== undefined && camera.radius !== undefined) {
            camera.radius = settings.cameraDistance;
        }
        
        // Camera height
        if (settings.cameraHeight !== undefined && camera.radius !== undefined) {
            // Высота камеры управляется через beta (угол наклона)
            // Или через setPosition, если доступен Vector3
            try {
                if (camera.setPosition) {
                    const currentAlpha = camera.alpha || 0;
                    camera.setPosition(new Vector3(
                        Math.cos(currentAlpha) * camera.radius,
                        settings.cameraHeight,
                        Math.sin(currentAlpha) * camera.radius
                    ));
                } else if (camera.beta !== undefined) {
                    // beta влияет на угол наклона, что косвенно влияет на высоту
                    camera.beta = Math.atan2(settings.cameraHeight, camera.radius);
                }
            } catch (e) {
                // Если Vector3 недоступен или setPosition не работает, используем beta
                if (camera.beta !== undefined) {
                    camera.beta = Math.atan2(settings.cameraHeight, camera.radius);
                }
            }
        }
        
        // Camera FOV
        if (settings.cameraFOV !== undefined && camera.fov !== undefined) {
            camera.fov = settings.cameraFOV * Math.PI / 180; // Конвертация в радианы
        }
        
        // Camera smoothing
        if (settings.cameraSmoothing !== undefined) {
            // Применяется при обновлении камеры
        }
        
        // Camera shake intensity
        if (settings.cameraShakeIntensity !== undefined) {
            // Применяется при встряске камеры
        }
        
        // Invert mouse Y
        if (settings.invertMouseY !== undefined) {
            // Применяется при обработке мыши
        }
        
        // First person mode
        if (settings.firstPersonMode !== undefined) {
            // Переключение режима камеры
        }
    }
    
    // === UI НАСТРОЙКИ ===
    if (hud) {
        // Show FPS
        if (settings.showFPS !== undefined && hud.showFPS !== undefined) {
            hud.showFPS = settings.showFPS;
        }
        
        // Show minimap
        if (settings.showMinimap !== undefined && hud.showMinimap !== undefined) {
            hud.showMinimap = settings.showMinimap;
        }
        
        // Show damage numbers
        if (settings.showDamageNumbers !== undefined) {
            // Применяется при отображении урона
        }
        
        // Show crosshair
        if (settings.showCrosshair !== undefined) {
            // Применяется при отображении прицела
        }
        
        // Show health bar
        if (settings.showHealthBar !== undefined) {
            // Применяется при отображении здоровья
        }
        
        // Show ammo counter
        if (settings.showAmmoCounter !== undefined) {
            // Применяется при отображении боеприпасов
        }
        
        // Font size
        if (settings.fontSize !== undefined) {
            document.documentElement.style.setProperty('--ui-font-size', `${settings.fontSize}px`);
        }
        
        // High contrast
        if (settings.highContrast !== undefined) {
            document.body.classList.toggle('high-contrast', settings.highContrast);
        }
        
        // Color blind mode
        if (settings.colorBlindMode !== undefined) {
            document.body.setAttribute('data-color-blind', settings.colorBlindMode);
        }
    }
    
    // === ИГРОВЫЕ НАСТРОЙКИ ===
    
    // Mouse sensitivity
    if (settings.mouseSensitivity !== undefined) {
        // Применяется при обработке мыши в Game или TankController
    }
    
    // Aim assist
    if (settings.aimAssist !== undefined) {
        // Применяется в системе прицеливания
    }
    
    // Screen shake
    if (settings.screenShake !== undefined) {
        // Применяется при встряске камеры
    }
    
    // Auto reload
    if (settings.autoReload !== undefined) {
        // Применяется в TankController
    }
    
    // Hold to aim
    if (settings.holdToAim !== undefined) {
        // Применяется в системе прицеливания
    }
    
    // Auto save
    if (settings.autoSave !== undefined) {
        // Применяется в системе сохранения
    }
    
    // Auto save interval
    if (settings.autoSaveInterval !== undefined) {
        // Применяется в системе автосохранения
    }
    
    // Show debug info
    if (settings.showDebugInfo !== undefined) {
        // Применяется в debug панели
    }
    
    // === FULLSCREEN ===
    if (settings.fullscreen !== undefined) {
        if (settings.fullscreen) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
        }
    }
}


