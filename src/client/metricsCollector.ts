/**
 * Metrics Collector - Сбор расширенных метрик производительности
 * GPU, CPU, сеть, физика, звук, эффекты
 */

import { Engine, Scene } from "@babylonjs/core";
import { logger } from "./utils/logger";

export interface ExtendedMetrics {
    // GPU
    gpuUsage?: number;
    gpuMemory?: number;
    gpuRenderer?: string;
    gpuVendor?: string;
    
    // CPU
    cpuUsage?: number;
    cpuCores?: number;
    
    // Network
    networkIn?: number;  // bytes/s
    networkOut?: number; // bytes/s
    networkLatency?: number;
    networkPackets?: number;
    
    // Physics
    physicsObjects?: number;
    physicsCollisions?: number;
    physicsTime?: number;
    physicsBodies?: number;
    
    // Audio
    audioSources?: number;
    audioMemory?: number;
    audioPlaying?: number;
    
    // Effects
    particles?: number;
    effectSystems?: number;
    activeEffects?: number;
    
    // Scene
    meshes?: number;
    lights?: number;
    cameras?: number;
    materials?: number;
    textures?: number;
}

export class MetricsCollector {
    private engine: Engine;
    private scene: Scene;
    private networkStats: { in: number; out: number; packets: number } = { in: 0, out: 0, packets: 0 };
    private lastNetworkCheck: number = Date.now();
    
    constructor(engine: Engine, scene: Scene) {
        this.engine = engine;
        this.scene = scene;
    }
    
    /**
     * Сбор всех метрик
     */
    collect(): ExtendedMetrics {
        const metrics: ExtendedMetrics = {};
        
        // GPU информация
        this.collectGPUMetrics(metrics);
        
        // CPU информация (ограниченно доступна в браузере)
        this.collectCPUMetrics(metrics);
        
        // Network (если доступно)
        this.collectNetworkMetrics(metrics);
        
        // Physics
        this.collectPhysicsMetrics(metrics);
        
        // Audio
        this.collectAudioMetrics(metrics);
        
        // Effects
        this.collectEffectsMetrics(metrics);
        
        // Scene
        this.collectSceneMetrics(metrics);
        
        return metrics;
    }
    
    /**
     * Сбор GPU метрик
     */
    private collectGPUMetrics(metrics: ExtendedMetrics): void {
        try {
            const canvas = this.engine.getRenderingCanvas();
            if (!canvas) return;
            
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return;
            
            // Информация о рендерере
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                metrics.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                metrics.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            }
            
            // GPU память (если доступно через performance.memory)
            const memoryInfo = (performance as any).memory;
            if (memoryInfo) {
                // Это JS память, не GPU, но может быть полезно
                metrics.gpuMemory = memoryInfo.totalJSHeapSize;
            }
            
            // Попытка получить GPU использование через WebGL extensions (если доступно)
            const gpuInfo = gl.getExtension('WEBGL_lose_context');
            // GPU usage напрямую недоступен в браузере без специальных расширений
        } catch (error) {
            logger.warn("[MetricsCollector] GPU metrics collection failed:", error);
        }
    }
    
    /**
     * Сбор CPU метрик
     */
    private collectCPUMetrics(metrics: ExtendedMetrics): void {
        try {
            // CPU cores доступны через navigator.hardwareConcurrency
            if (navigator.hardwareConcurrency) {
                metrics.cpuCores = navigator.hardwareConcurrency;
            }
            
            // CPU usage напрямую недоступен в браузере
            // Можно оценить через performance.now() и загрузку основного потока
            // Но это неточно
        } catch (error) {
            logger.warn("[MetricsCollector] CPU metrics collection failed:", error);
        }
    }
    
    /**
     * Сбор сетевых метрик
     */
    private collectNetworkMetrics(metrics: ExtendedMetrics): void {
        try {
            // Сетевые метрики нужно собирать из multiplayerManager или других источников
            // Здесь базовая реализация
            const now = Date.now();
            const elapsed = (now - this.lastNetworkCheck) / 1000; // секунды
            
            if (elapsed > 0) {
                metrics.networkIn = this.networkStats.in / elapsed;
                metrics.networkOut = this.networkStats.out / elapsed;
                metrics.networkPackets = this.networkStats.packets;
                
                // Сброс статистики
                this.networkStats = { in: 0, out: 0, packets: 0 };
                this.lastNetworkCheck = now;
            }
        } catch (error) {
            logger.warn("[MetricsCollector] Network metrics collection failed:", error);
        }
    }
    
    /**
     * Обновление сетевой статистики (вызывается извне)
     */
    updateNetworkStats(bytesIn: number, bytesOut: number, packets: number): void {
        this.networkStats.in += bytesIn;
        this.networkStats.out += bytesOut;
        this.networkStats.packets += packets;
    }
    
    /**
     * Сбор метрик физики
     */
    private collectPhysicsMetrics(metrics: ExtendedMetrics): void {
        try {
            const physicsEngine = this.scene.getPhysicsEngine();
            if (!physicsEngine) return;
            
            // Количество физических объектов
            const bodies = (physicsEngine as any).getPhysicsBodies?.() || [];
            metrics.physicsBodies = bodies.length;
            metrics.physicsObjects = bodies.length;
            
            // Время физики (если доступно)
            const physicsTime = (physicsEngine as any).getPhysicsTime?.();
            if (physicsTime !== undefined) {
                metrics.physicsTime = physicsTime;
            }
        } catch (error) {
            logger.warn("[MetricsCollector] Physics metrics collection failed:", error);
        }
    }
    
    /**
     * Сбор метрик аудио
     */
    private collectAudioMetrics(metrics: ExtendedMetrics): void {
        try {
            const audioEngine = this.scene.getEngine().getAudioEngine();
            if (!audioEngine) return;
            
            // Количество активных источников звука
            const audioSources = (audioEngine as any).getAudioSources?.() || [];
            metrics.audioSources = audioSources.length;
            metrics.audioPlaying = audioSources.filter((s: any) => s.isPlaying).length;
        } catch (error) {
            logger.warn("[MetricsCollector] Audio metrics collection failed:", error);
        }
    }
    
    /**
     * Сбор метрик эффектов
     */
    private collectEffectsMetrics(metrics: ExtendedMetrics): void {
        try {
            // Эффекты через EffectsManager (если доступен)
            const effectsManager = (this.scene as any).effectsManager;
            if (effectsManager) {
                if (typeof effectsManager.getActiveParticlesCount === 'function') {
                    metrics.particles = effectsManager.getActiveParticlesCount();
                }
                if (typeof effectsManager.getActiveSystemsCount === 'function') {
                    metrics.effectSystems = effectsManager.getActiveSystemsCount();
                }
                if (typeof effectsManager.getActiveEffectsCount === 'function') {
                    metrics.activeEffects = effectsManager.getActiveEffectsCount();
                }
            }
        } catch (error) {
            logger.warn("[MetricsCollector] Effects metrics collection failed:", error);
        }
    }
    
    /**
     * Сбор метрик сцены
     */
    private collectSceneMetrics(metrics: ExtendedMetrics): void {
        try {
            metrics.meshes = this.scene.meshes.length;
            metrics.lights = this.scene.lights.length;
            metrics.cameras = this.scene.cameras.length;
            metrics.materials = this.scene.materials.length;
            metrics.textures = this.scene.textures.length;
        } catch (error) {
            logger.warn("[MetricsCollector] Scene metrics collection failed:", error);
        }
    }
}

