/**
 * @module effects/PostProcessingManager
 * @description Менеджер постпроцессинга для визуальных эффектов (bloom, motion blur и др.)
 */

import {
    Scene,
    Camera,
    DefaultRenderingPipeline,
    MotionBlurPostProcess,
    ImageProcessingConfiguration
} from "@babylonjs/core";
import { logger } from "../utils/logger";

export interface PostProcessingConfig {
    bloomEnabled: boolean;
    bloomIntensity: number;
    bloomThreshold: number;
    bloomWeight: number;
    bloomKernel: number;
    bloomScale: number;
    
    motionBlurEnabled: boolean;
    motionBlurIntensity: number;
    motionBlurSamples: number;
    
    fxaaEnabled: boolean;
    
    chromaticAberrationEnabled: boolean;
    chromaticAberrationAmount: number;
    
    grainEnabled: boolean;
    grainIntensity: number;
    
    vignetteEnabled: boolean;
    vignetteWeight: number;
    vignetteStretch: number;
    
    sharpenEnabled: boolean;
    sharpenIntensity: number;
    
    contrastEnabled: boolean;
    contrast: number;
    exposure: number;
}

export const DEFAULT_POST_PROCESSING_CONFIG: PostProcessingConfig = {
    bloomEnabled: false,
    bloomIntensity: 0.5,
    bloomThreshold: 0.9,
    bloomWeight: 0.15,
    bloomKernel: 64,
    bloomScale: 0.5,
    
    motionBlurEnabled: false,
    motionBlurIntensity: 0.5,
    motionBlurSamples: 32,
    
    fxaaEnabled: true,
    
    chromaticAberrationEnabled: false,
    chromaticAberrationAmount: 0,
    
    grainEnabled: false,
    grainIntensity: 0,
    
    vignetteEnabled: false,
    vignetteWeight: 0.3,
    vignetteStretch: 0.5,
    
    sharpenEnabled: false,
    sharpenIntensity: 0.2,
    
    contrastEnabled: false,
    contrast: 1.0,
    exposure: 1.0
};

export class PostProcessingManager {
    private scene: Scene;
    private camera: Camera | null = null;
    private config: PostProcessingConfig;
    
    private defaultPipeline: DefaultRenderingPipeline | null = null;
    private motionBlur: MotionBlurPostProcess | null = null;
    
    private isInitialized = false;
    
    constructor(scene: Scene, config: Partial<PostProcessingConfig> = {}) {
        this.scene = scene;
        this.config = { ...DEFAULT_POST_PROCESSING_CONFIG, ...config };
    }
    
    /**
     * Инициализация постпроцессинга
     */
    initialize(camera: Camera): void {
        if (this.isInitialized) {
            logger.warn("[PostProcessing] Already initialized");
            return;
        }
        
        this.camera = camera;
        
        try {
            // Создаём Default Rendering Pipeline для большинства эффектов
            // ИСПРАВЛЕНИЕ: Отключаем HDR чтобы избежать затемнения в режиме прицеливания
            this.defaultPipeline = new DefaultRenderingPipeline(
                "defaultPipeline",
                false, // HDR отключён для предотвращения затемнения
                this.scene,
                [camera]
            );
            
            // Применяем начальную конфигурацию
            this.applyConfig(this.config);
            
            // ВАЖНО: Устанавливаем нейтральную экспозицию для всех камер
            if (this.defaultPipeline.imageProcessing) {
                this.defaultPipeline.imageProcessing.exposure = 1.0;
                this.defaultPipeline.imageProcessing.contrast = 1.0;
            }
            
            this.isInitialized = true;
            logger.log("[PostProcessing] Initialized successfully");
        } catch (error) {
            logger.error("[PostProcessing] Failed to initialize:", error);
        }
    }
    
    /**
     * Применить конфигурацию
     */
    applyConfig(config: Partial<PostProcessingConfig>): void {
        this.config = { ...this.config, ...config };
        
        if (!this.defaultPipeline || !this.camera) {
            return;
        }
        
        const pipeline = this.defaultPipeline;
        
        // === BLOOM ===
        pipeline.bloomEnabled = this.config.bloomEnabled;
        if (this.config.bloomEnabled) {
            pipeline.bloomThreshold = this.config.bloomThreshold;
            pipeline.bloomWeight = this.config.bloomWeight;
            pipeline.bloomKernel = this.config.bloomKernel;
            pipeline.bloomScale = this.config.bloomScale;
        }
        
        // === FXAA (Anti-aliasing) ===
        pipeline.fxaaEnabled = this.config.fxaaEnabled;
        
        // === CHROMATIC ABERRATION ===
        pipeline.chromaticAberrationEnabled = this.config.chromaticAberrationEnabled;
        if (this.config.chromaticAberrationEnabled) {
            pipeline.chromaticAberration.aberrationAmount = this.config.chromaticAberrationAmount;
        }
        
        // === GRAIN ===
        pipeline.grainEnabled = this.config.grainEnabled;
        if (this.config.grainEnabled) {
            pipeline.grain.intensity = this.config.grainIntensity;
        }
        
        // === VIGNETTE ===
        if (pipeline.imageProcessing) {
            pipeline.imageProcessing.vignetteEnabled = this.config.vignetteEnabled;
            if (this.config.vignetteEnabled) {
                pipeline.imageProcessing.vignetteWeight = this.config.vignetteWeight;
                pipeline.imageProcessing.vignetteStretch = this.config.vignetteStretch;
            }
            
            // === CONTRAST & EXPOSURE ===
            if (this.config.contrastEnabled) {
                pipeline.imageProcessing.contrast = this.config.contrast;
                pipeline.imageProcessing.exposure = this.config.exposure;
            }
        }
        
        // === SHARPEN ===
        pipeline.sharpenEnabled = this.config.sharpenEnabled;
        if (this.config.sharpenEnabled && pipeline.sharpen) {
            pipeline.sharpen.edgeAmount = this.config.sharpenIntensity;
        }
        
        // === MOTION BLUR (отдельный постпроцесс) ===
        this.updateMotionBlur();
        
        logger.log("[PostProcessing] Config applied:", {
            bloom: this.config.bloomEnabled,
            motionBlur: this.config.motionBlurEnabled,
            fxaa: this.config.fxaaEnabled
        });
    }
    
    /**
     * Обновить Motion Blur
     */
    private updateMotionBlur(): void {
        if (!this.camera) return;
        
        // Удаляем существующий motion blur
        if (this.motionBlur) {
            this.motionBlur.dispose();
            this.motionBlur = null;
        }
        
        // Создаём новый, если включено
        if (this.config.motionBlurEnabled) {
            try {
                this.motionBlur = new MotionBlurPostProcess(
                    "motionBlur",
                    this.scene,
                    1.0, // ratio
                    this.camera
                );
                // ИСПРАВЛЕНО: isObjectBased = false - blur только от движения камеры
                // Это убирает размытие башни при вращении
                this.motionBlur.isObjectBased = false;
                
                this.motionBlur.motionStrength = this.config.motionBlurIntensity;
                this.motionBlur.motionBlurSamples = this.config.motionBlurSamples;
                
                logger.log("[PostProcessing] Motion blur enabled");
            } catch (error) {
                logger.error("[PostProcessing] Failed to create motion blur:", error);
            }
        }
    }
    
    /**
     * Включить/выключить bloom
     */
    setBloom(enabled: boolean, intensity?: number): void {
        this.config.bloomEnabled = enabled;
        if (intensity !== undefined) {
            this.config.bloomIntensity = intensity;
            this.config.bloomWeight = intensity * 0.3; // Пропорциональный weight
        }
        
        if (this.defaultPipeline) {
            this.defaultPipeline.bloomEnabled = enabled;
            if (enabled && intensity !== undefined) {
                this.defaultPipeline.bloomWeight = this.config.bloomWeight;
            }
        }
    }
    
    /**
     * Включить/выключить motion blur
     */
    setMotionBlur(enabled: boolean, intensity?: number): void {
        this.config.motionBlurEnabled = enabled;
        if (intensity !== undefined) {
            this.config.motionBlurIntensity = intensity;
        }
        this.updateMotionBlur();
    }
    
    /**
     * Динамическое обновление интенсивности Motion Blur в зависимости от скорости танка
     * ОПТИМИЗИРОВАНО: Motion Blur включается только при 80%+ скорости танка
     * @param speedRatio - Соотношение текущей скорости к максимальной (0.0 - 1.0)
     */
    updateMotionBlurBySpeed(speedRatio: number): void {
        // Если motion blur отключен в настройках, не делаем ничего
        if (!this.config.motionBlurEnabled) {
            // Удаляем blur если он существует но отключен
            if (this.motionBlur) {
                this.motionBlur.dispose();
                this.motionBlur = null;
            }
            return;
        }
        
        // Порог скорости для активации blur (80%)
        const minSpeedThreshold = 0.80;
        
        if (speedRatio < minSpeedThreshold) {
            // Ниже порога - убираем motion blur для производительности
            if (this.motionBlur) {
                this.motionBlur.dispose();
                this.motionBlur = null;
            }
            return;
        }
        
        // Выше порога - включаем/обновляем motion blur
        // Нормализуем от 0 до 1 (80% -> 0, 100% -> 1)
        const normalizedSpeed = (speedRatio - minSpeedThreshold) / (1 - minSpeedThreshold);
        // Квадратичная кривая для плавного нарастания
        const blurIntensityFactor = normalizedSpeed * normalizedSpeed;
        
        if (!this.motionBlur && this.camera) {
            // Создаём motion blur при достижении порога
            try {
                this.motionBlur = new MotionBlurPostProcess(
                    "motionBlur",
                    this.scene,
                    1.0,
                    this.camera
                );
                // ИСПРАВЛЕНО: isObjectBased = false - blur только от движения камеры
                // Это убирает размытие башни при вращении
                this.motionBlur.isObjectBased = false;
                this.motionBlur.motionBlurSamples = this.config.motionBlurSamples;
            } catch (error) {
                logger.error("[PostProcessing] Failed to create dynamic motion blur:", error);
                return;
            }
        }
        
        // Обновляем интенсивность
        if (this.motionBlur) {
            // Интенсивность растёт от 0 до maxIntensity в зависимости от скорости
            const maxIntensity = this.config.motionBlurIntensity;
            this.motionBlur.motionStrength = maxIntensity * blurIntensityFactor;
        }
    }
    
    /**
     * Включить/выключить FXAA
     */
    setFXAA(enabled: boolean): void {
        this.config.fxaaEnabled = enabled;
        if (this.defaultPipeline) {
            this.defaultPipeline.fxaaEnabled = enabled;
        }
    }
    
    /**
     * Включить/выключить vignette
     */
    setVignette(enabled: boolean, weight?: number): void {
        this.config.vignetteEnabled = enabled;
        if (weight !== undefined) {
            this.config.vignetteWeight = weight;
        }
        
        if (this.defaultPipeline?.imageProcessing) {
            this.defaultPipeline.imageProcessing.vignetteEnabled = enabled;
            if (enabled && weight !== undefined) {
                this.defaultPipeline.imageProcessing.vignetteWeight = weight;
            }
        }
    }
    
    /**
     * Установить контраст и экспозицию
     */
    setContrastExposure(contrast: number, exposure: number): void {
        this.config.contrast = contrast;
        this.config.exposure = exposure;
        this.config.contrastEnabled = true;
        
        if (this.defaultPipeline?.imageProcessing) {
            this.defaultPipeline.imageProcessing.contrast = contrast;
            this.defaultPipeline.imageProcessing.exposure = exposure;
        }
    }
    
    /**
     * Включить preset "Cinematic"
     */
    enableCinematicMode(): void {
        this.applyConfig({
            bloomEnabled: true,
            bloomWeight: 0.2,
            bloomThreshold: 0.8,
            vignetteEnabled: true,
            vignetteWeight: 0.4,
            grainEnabled: true,
            grainIntensity: 0.03,
            chromaticAberrationEnabled: true,
            chromaticAberrationAmount: 0.5,
            contrastEnabled: true,
            contrast: 1.1,
            exposure: 1.0
        });
    }
    
    /**
     * Включить preset "Performance"
     */
    enablePerformanceMode(): void {
        this.applyConfig({
            bloomEnabled: false,
            motionBlurEnabled: false,
            fxaaEnabled: true,
            chromaticAberrationEnabled: false,
            grainEnabled: false,
            vignetteEnabled: false,
            sharpenEnabled: false,
            contrastEnabled: false
        });
    }
    
    /**
     * Включить preset "Quality"
     */
    enableQualityMode(): void {
        this.applyConfig({
            bloomEnabled: true,
            bloomWeight: 0.15,
            bloomThreshold: 0.9,
            fxaaEnabled: true,
            sharpenEnabled: true,
            sharpenIntensity: 0.15,
            contrastEnabled: true,
            contrast: 1.05,
            exposure: 1.0
        });
    }
    
    /**
     * Выключить все эффекты
     */
    disableAll(): void {
        this.applyConfig({
            bloomEnabled: false,
            motionBlurEnabled: false,
            fxaaEnabled: false,
            chromaticAberrationEnabled: false,
            grainEnabled: false,
            vignetteEnabled: false,
            sharpenEnabled: false,
            contrastEnabled: false
        });
    }
    
    /**
     * Получить текущую конфигурацию
     */
    getConfig(): PostProcessingConfig {
        return { ...this.config };
    }
    
    /**
     * Проверить, инициализирован ли менеджер
     */
    isReady(): boolean {
        return this.isInitialized;
    }
    
    /**
     * Получить DefaultRenderingPipeline (для расширенной настройки)
     */
    getPipeline(): DefaultRenderingPipeline | null {
        return this.defaultPipeline;
    }
    
    /**
     * Добавить камеру к пайплайну (для поддержки нескольких камер, например aimCamera)
     * ИСПРАВЛЕНО: Пересоздаём пайплайн с обеими камерами, т.к. просто push не работает
     */
    addCamera(camera: Camera): void {
        if (!this.defaultPipeline) {
            logger.warn("[PostProcessing] Pipeline not initialized, cannot add camera");
            return;
        }
        
        // Get current cameras and check if already added
        const currentCameras = [...this.defaultPipeline.cameras];
        if (currentCameras.includes(camera)) {
            logger.log("[PostProcessing] Camera already in pipeline:", camera.name);
            return;
        }
        currentCameras.push(camera);
        
        // Save current settings before disposing
        const bloomEnabled = this.defaultPipeline.bloomEnabled;
        const bloomWeight = this.defaultPipeline.bloomWeight;
        const bloomThreshold = this.defaultPipeline.bloomThreshold;
        const bloomScale = this.defaultPipeline.bloomScale;
        const fxaaEnabled = this.defaultPipeline.fxaaEnabled;
        const sharpenEnabled = this.defaultPipeline.sharpenEnabled;
        const chromaticAberrationEnabled = this.defaultPipeline.chromaticAberrationEnabled;
        const grainEnabled = this.defaultPipeline.grainEnabled;
        
        // Dispose old pipeline
        this.defaultPipeline.dispose();
        
        // Recreate with all cameras
        this.defaultPipeline = new DefaultRenderingPipeline(
            "defaultPipeline",
            false, // HDR отключён
            this.scene,
            currentCameras
        );
        
        // Restore settings
        this.defaultPipeline.bloomEnabled = bloomEnabled;
        this.defaultPipeline.bloomWeight = bloomWeight;
        this.defaultPipeline.bloomThreshold = bloomThreshold;
        this.defaultPipeline.bloomScale = bloomScale;
        this.defaultPipeline.fxaaEnabled = fxaaEnabled;
        this.defaultPipeline.sharpenEnabled = sharpenEnabled;
        this.defaultPipeline.chromaticAberrationEnabled = chromaticAberrationEnabled;
        this.defaultPipeline.grainEnabled = grainEnabled;
        
        // Применяем нейтральные настройки
        if (this.defaultPipeline.imageProcessing) {
            this.defaultPipeline.imageProcessing.exposure = 1.0;
            this.defaultPipeline.imageProcessing.contrast = 1.0;
        }
        
        logger.log("[PostProcessing] Pipeline recreated with cameras:", currentCameras.map(c => c.name));
    }
    
    /**
     * Сбросить экспозицию к нормальному значению (для предотвращения затемнения)
     */
    resetExposure(): void {
        if (this.defaultPipeline?.imageProcessing) {
            this.defaultPipeline.imageProcessing.exposure = 1.0;
            this.defaultPipeline.imageProcessing.contrast = 1.0;
            // Отключаем виньетку если она затемняет экран
            if (this.defaultPipeline.imageProcessing.vignetteEnabled) {
                this.defaultPipeline.imageProcessing.vignetteWeight = Math.min(0.3, this.config.vignetteWeight);
            }
        }
    }
    
    /**
     * Освободить ресурсы
     */
    dispose(): void {
        if (this.motionBlur) {
            this.motionBlur.dispose();
            this.motionBlur = null;
        }
        
        if (this.defaultPipeline) {
            this.defaultPipeline.dispose();
            this.defaultPipeline = null;
        }
        
        this.isInitialized = false;
        logger.log("[PostProcessing] Disposed");
    }
}

export default PostProcessingManager;

