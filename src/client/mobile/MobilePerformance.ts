/**
 * @module mobile/MobilePerformance
 * @description Оптимизация производительности для мобильных устройств
 */

import { Scene, AbstractEngine } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { isMobileDevice } from "./MobileDetection";

/**
 * Настройки производительности для мобильных
 */
export interface MobilePerformanceSettings {
    shadowsEnabled: boolean;
    shadowQuality: 'low' | 'medium' | 'high';
    particlesEnabled: boolean;
    particleCount: number;
    lodEnabled: boolean;
    lodDistance: number;
    postProcessingEnabled: boolean;
    textureQuality: 'low' | 'medium' | 'high';
    renderScale: number; // 0.5 - 1.0
}

export const DEFAULT_MOBILE_PERFORMANCE: MobilePerformanceSettings = {
    shadowsEnabled: false, // Отключаем тени для мобильных
    shadowQuality: 'low',
    particlesEnabled: true,
    particleCount: 50, // Меньше частиц
    lodEnabled: true,
    lodDistance: 50, // Ближе LOD
    postProcessingEnabled: false, // Отключаем пост-обработку
    textureQuality: 'medium',
    renderScale: 0.75 // 75% разрешения для лучшей производительности
};

/**
 * Менеджер производительности для мобильных
 */
export class MobilePerformance {
    private scene: Scene;
    private engine: AbstractEngine;
    private settings: MobilePerformanceSettings;
    private isEnabled: boolean;

    constructor(scene: Scene, settings?: Partial<MobilePerformanceSettings>) {
        this.scene = scene;
        this.engine = scene.getEngine();
        this.isEnabled = isMobileDevice();
        this.settings = { ...DEFAULT_MOBILE_PERFORMANCE, ...settings };

        if (this.isEnabled) {
            this.applySettings();
        }
    }

    /**
     * Применить настройки производительности
     */
    private applySettings(): void {
        const s = this.settings;

        // Настройка теней
        if (!s.shadowsEnabled) {
            this.scene.shadowsEnabled = false;
        } else {
            this.scene.shadowsEnabled = true;
            // Можно настроить качество теней через shadowGenerator
        }

        // Настройка масштаба рендеринга
        if (s.renderScale < 1.0) {
            this.engine.setHardwareScalingLevel(1.0 / s.renderScale);
        }

        // Настройка качества текстур
        // Это нужно делать на уровне загрузки текстур

        // Логирование
        logger.log('[MobilePerformance] Применены настройки:', {
            shadows: s.shadowsEnabled,
            particles: s.particlesEnabled,
            renderScale: s.renderScale,
            lod: s.lodEnabled
        });
    }

    /**
     * Обновить настройки
     */
    updateSettings(settings: Partial<MobilePerformanceSettings>): void {
        this.settings = { ...this.settings, ...settings };
        if (this.isEnabled) {
            this.applySettings();
        }
    }

    /**
     * Получить текущие настройки
     */
    getSettings(): MobilePerformanceSettings {
        return { ...this.settings };
    }

    /**
     * Включить/выключить оптимизацию
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (enabled) {
            this.applySettings();
        } else {
            // Восстановить стандартные настройки
            this.scene.shadowsEnabled = true;
            this.engine.setHardwareScalingLevel(1.0);
        }
    }

    /**
     * Проверить включена ли оптимизация
     */
    isOptimizationEnabled(): boolean {
        return this.isEnabled;
    }
}

export default MobilePerformance;

