/**
 * @module optimization/AdaptiveQualityScaler
 * @description Автоматическая настройка качества графики на основе FPS
 * 
 * Мониторит FPS и автоматически понижает/повышает качество для стабильной производительности
 */

import { Scene, Engine } from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Настройки качества
 */
export interface QualitySettings {
    shadowDistance: number;      // Дальность теней
    lodMultiplier: number;       // Множитель для LOD дистанций
    particleMultiplier: number;  // Множитель количества частиц
    maxActiveParticles: number;  // Максимум активных систем частиц
    renderScale: number;         // Масштаб рендеринга (0.5-1.0)
}

/**
 * Уровни качества
 */
export const QUALITY_PRESETS: Record<string, QualitySettings> = {
    ultra: {
        shadowDistance: 200,
        lodMultiplier: 1.5,
        particleMultiplier: 1.0,
        maxActiveParticles: 50,
        renderScale: 1.0
    },
    high: {
        shadowDistance: 150,
        lodMultiplier: 1.0,
        particleMultiplier: 0.8,
        maxActiveParticles: 30,
        renderScale: 1.0
    },
    medium: {
        shadowDistance: 100,
        lodMultiplier: 0.75,
        particleMultiplier: 0.5,
        maxActiveParticles: 15,
        renderScale: 0.9
    },
    low: {
        shadowDistance: 50,
        lodMultiplier: 0.5,
        particleMultiplier: 0.25,
        maxActiveParticles: 5,
        renderScale: 0.75
    },
    potato: {
        shadowDistance: 0,
        lodMultiplier: 0.3,
        particleMultiplier: 0.1,
        maxActiveParticles: 2,
        renderScale: 0.5
    }
};

/**
 * Конфигурация адаптивного скейлера
 */
export interface AdaptiveScalerConfig {
    targetFps: number;           // Целевой FPS (по умолчанию 60)
    minFps: number;              // Минимальный допустимый FPS (по умолчанию 30)
    sampleSize: number;          // Размер выборки для усреднения FPS
    adjustmentInterval: number;  // Интервал проверки (мс)
    stabilityThreshold: number;  // Порог стабильности (количество успешных проверок)
    enableRenderScaling: boolean; // Включить изменение разрешения (влияет на размер HUD)
}

const DEFAULT_CONFIG: AdaptiveScalerConfig = {
    targetFps: 60,
    minFps: 30,
    sampleSize: 30,
    adjustmentInterval: 2000,
    stabilityThreshold: 3,
    enableRenderScaling: false // Default to false to preserve HUD size/clarity
};

/**
 * AdaptiveQualityScaler - Автоматическая настройка качества
 */
export class AdaptiveQualityScaler {
    private engine: Engine;
    private scene: Scene;
    private config: AdaptiveScalerConfig;

    private fpsHistory: number[] = [];
    private currentQuality: string = "high";
    private qualityLevels = ["potato", "low", "medium", "high", "ultra"];
    private checkInterval: NodeJS.Timeout | null = null;
    private stabilityCounter = 0;
    private enabled = true;

    // Callbacks for quality changes
    private onQualityChange?: (quality: string, settings: QualitySettings) => void;

    constructor(engine: Engine, scene: Scene, config: Partial<AdaptiveScalerConfig> = {}) {
        this.engine = engine;
        this.scene = scene;
        this.config = { ...DEFAULT_CONFIG, ...config };

        logger.log("[AdaptiveQualityScaler] Initialized");
    }

    /**
     * Запуск мониторинга
     */
    start(): void {
        if (this.checkInterval) return;

        this.checkInterval = setInterval(() => {
            if (this.enabled) {
                this.checkAndAdjust();
            }
        }, this.config.adjustmentInterval);

        logger.log("[AdaptiveQualityScaler] Started monitoring");
    }

    /**
     * Остановка мониторинга
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        logger.log("[AdaptiveQualityScaler] Stopped monitoring");
    }

    /**
     * Включение/выключение автонастройки
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        logger.log(`[AdaptiveQualityScaler] ${enabled ? "Enabled" : "Disabled"}`);
    }

    /**
     * Установка callback для изменения качества
     */
    setOnQualityChange(callback: (quality: string, settings: QualitySettings) => void): void {
        this.onQualityChange = callback;
    }

    /**
     * Добавление FPS измерения
     */
    addFpsSample(): void {
        const fps = this.engine.getFps();
        this.fpsHistory.push(fps);

        // Ограничиваем историю
        if (this.fpsHistory.length > this.config.sampleSize) {
            this.fpsHistory.shift();
        }
    }

    /**
     * Получение среднего FPS
     */
    getAverageFps(): number {
        if (this.fpsHistory.length === 0) return 60;
        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        return sum / this.fpsHistory.length;
    }

    /**
     * Получение текущего уровня качества
     */
    getCurrentQuality(): string {
        return this.currentQuality;
    }

    /**
     * Получение текущих настроек
     */
    getCurrentSettings(): QualitySettings {
        return QUALITY_PRESETS[this.currentQuality] ?? QUALITY_PRESETS.medium!;
    }

    /**
     * Принудительная установка качества
     */
    setQuality(quality: string): void {
        if (!this.qualityLevels.includes(quality)) {
            logger.warn(`[AdaptiveQualityScaler] Unknown quality level: ${quality}`);
            return;
        }

        this.currentQuality = quality;
        this.applyQuality();
        this.stabilityCounter = 0;
    }

    /**
     * Проверка и корректировка качества
     */
    private checkAndAdjust(): void {
        // Добавляем текущий FPS
        this.addFpsSample();

        const avgFps = this.getAverageFps();
        const currentIndex = this.qualityLevels.indexOf(this.currentQuality);

        // FPS слишком низкий - понижаем качество
        if (avgFps < this.config.minFps && currentIndex > 0) {
            this.stabilityCounter = 0;
            this.currentQuality = this.qualityLevels[currentIndex - 1]!;
            this.applyQuality();
            logger.log(`[AdaptiveQualityScaler] FPS=${avgFps.toFixed(1)}, lowering to ${this.currentQuality}`);
        }
        // FPS ниже целевого - понижаем если есть куда
        else if (avgFps < this.config.targetFps * 0.9 && currentIndex > 0) {
            this.stabilityCounter = 0;
            this.currentQuality = this.qualityLevels[currentIndex - 1]!;
            this.applyQuality();
            logger.log(`[AdaptiveQualityScaler] FPS=${avgFps.toFixed(1)}, adjusting down to ${this.currentQuality}`);
        }
        // FPS стабильно высокий - пробуем повысить качество
        else if (avgFps > this.config.targetFps * 1.2 && currentIndex < this.qualityLevels.length - 1) {
            this.stabilityCounter++;

            if (this.stabilityCounter >= this.config.stabilityThreshold) {
                this.currentQuality = this.qualityLevels[currentIndex + 1]!;
                this.applyQuality();
                this.stabilityCounter = 0;
                logger.log(`[AdaptiveQualityScaler] FPS=${avgFps.toFixed(1)}, raising to ${this.currentQuality}`);
            }
        }
    }

    /**
     * Применение качества
     */
    private applyQuality(): void {
        const settings = QUALITY_PRESETS[this.currentQuality];
        if (!settings) return;

        // Применяем hardware scaling только если разрешено
        if (this.config.enableRenderScaling) {
            this.engine.setHardwareScalingLevel(1 / settings.renderScale);
        } else {
            // Ensure scaling is reset to 1.0 (native resolution)
            this.engine.setHardwareScalingLevel(1.0);
        }

        // Вызываем callback для внешней обработки
        if (this.onQualityChange) {
            this.onQualityChange(this.currentQuality, settings);
        }
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.stop();
        this.fpsHistory = [];
        logger.log("[AdaptiveQualityScaler] Disposed");
    }
}

// Singleton
let _instance: AdaptiveQualityScaler | null = null;

export function getAdaptiveQualityScaler(engine?: Engine, scene?: Scene): AdaptiveQualityScaler | null {
    if (!_instance && engine && scene) {
        _instance = new AdaptiveQualityScaler(engine, scene);
    }
    return _instance;
}

export function disposeAdaptiveQualityScaler(): void {
    if (_instance) {
        _instance.dispose();
        _instance = null;
    }
}
