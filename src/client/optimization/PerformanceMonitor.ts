/**
 * @module optimization/PerformanceMonitor
 * @description Мониторинг производительности в реальном времени
 * 
 * Собирает метрики:
 * - FPS и время кадра
 * - Время физики, рендера, обновлений
 * - Счетчики объектов и draw calls
 * - Память (если доступна)
 */

import { Scene, Engine } from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Метрики одного кадра
 */
export interface FrameMetrics {
    timestamp: number;
    deltaTime: number;
    fps: number;

    // Время в миллисекундах
    physicsTime: number;
    renderTime: number;
    updateTime: number;

    // Счетчики
    activeMeshes: number;
    totalMeshes: number;
    drawCalls: number;
    triangles: number;

    // Память (если доступна)
    memoryUsed?: number;
    memoryLimit?: number;
}

/**
 * Сводка производительности
 */
export interface PerformanceReport {
    avgFps: number;
    minFps: number;
    maxFps: number;

    avgFrameTime: number;
    maxFrameTime: number;

    avgPhysicsTime: number;
    avgRenderTime: number;
    avgUpdateTime: number;

    frameDrops: number; // кадры с FPS < 30
    stutters: number;   // кадры > 50ms

    avgActiveMeshes: number;
    avgDrawCalls: number;

    memoryPeak?: number;
}

/**
 * PerformanceMonitor - мониторинг производительности
 */
export class PerformanceMonitor {
    private scene: Scene;
    private engine: Engine;

    // Буфер метрик
    private metrics: FrameMetrics[] = [];
    private readonly MAX_SAMPLES = 300; // ~5 секунд при 60fps

    // Таймеры для измерений
    private frameStart = 0;
    private physicsStart = 0;
    private renderStart = 0;
    private updateStart = 0;

    private _physicsTime = 0;
    private _renderTime = 0;
    private _updateTime = 0;

    // UI overlay
    private overlay: HTMLDivElement | null = null;
    private overlayVisible = false;

    // Callbacks
    private onFrameCallback: ((metrics: FrameMetrics) => void) | null = null;

    constructor(scene: Scene, engine: Engine) {
        this.scene = scene;
        this.engine = engine;
        logger.log("[PerformanceMonitor] Initialized");
    }

    /**
     * Начало кадра - вызывать в начале render loop
     */
    startFrame(): void {
        this.frameStart = performance.now();
        this._physicsTime = 0;
        this._renderTime = 0;
        this._updateTime = 0;
    }

    /**
     * Начало измерения физики
     */
    startPhysics(): void {
        this.physicsStart = performance.now();
    }

    /**
     * Конец измерения физики
     */
    endPhysics(): void {
        this._physicsTime += performance.now() - this.physicsStart;
    }

    /**
     * Начало измерения рендера
     */
    startRender(): void {
        this.renderStart = performance.now();
    }

    /**
     * Конец измерения рендера
     */
    endRender(): void {
        this._renderTime += performance.now() - this.renderStart;
    }

    /**
     * Начало измерения обновлений
     */
    startUpdate(): void {
        this.updateStart = performance.now();
    }

    /**
     * Конец измерения обновлений
     */
    endUpdate(): void {
        this._updateTime += performance.now() - this.updateStart;
    }

    /**
     * Конец кадра - вызывать в конце render loop
     */
    endFrame(): void {
        const now = performance.now();
        const deltaTime = now - this.frameStart;
        const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

        const metrics: FrameMetrics = {
            timestamp: now,
            deltaTime,
            fps,
            physicsTime: this._physicsTime,
            renderTime: this._renderTime,
            updateTime: this._updateTime,
            activeMeshes: this.scene.getActiveMeshes().length,
            totalMeshes: this.scene.meshes.length,
            drawCalls: this.scene.getEngine().frameId, // Приблизительно
            triangles: this.scene.getActiveIndices() / 3
        };

        // Добавляем память если доступна
        if ((performance as any).memory) {
            const mem = (performance as any).memory;
            metrics.memoryUsed = mem.usedJSHeapSize;
            metrics.memoryLimit = mem.jsHeapSizeLimit;
        }

        // Добавляем в буфер
        this.metrics.push(metrics);
        if (this.metrics.length > this.MAX_SAMPLES) {
            this.metrics.shift();
        }

        // Callback
        if (this.onFrameCallback) {
            this.onFrameCallback(metrics);
        }

        // Обновляем overlay если видим
        if (this.overlayVisible && this.overlay) {
            this.updateOverlay(metrics);
        }
    }

    /**
     * Получить отчет за последние N кадров
     */
    getReport(sampleCount?: number): PerformanceReport {
        const samples = sampleCount
            ? this.metrics.slice(-sampleCount)
            : this.metrics;

        if (samples.length === 0) {
            return {
                avgFps: 0, minFps: 0, maxFps: 0,
                avgFrameTime: 0, maxFrameTime: 0,
                avgPhysicsTime: 0, avgRenderTime: 0, avgUpdateTime: 0,
                frameDrops: 0, stutters: 0,
                avgActiveMeshes: 0, avgDrawCalls: 0
            };
        }

        let sumFps = 0, minFps = 999, maxFps = 0;
        let sumFrameTime = 0, maxFrameTime = 0;
        let sumPhysics = 0, sumRender = 0, sumUpdate = 0;
        let sumMeshes = 0, sumDrawCalls = 0;
        let frameDrops = 0, stutters = 0;
        let memoryPeak = 0;

        for (const m of samples) {
            sumFps += m.fps;
            if (m.fps < minFps) minFps = m.fps;
            if (m.fps > maxFps) maxFps = m.fps;

            sumFrameTime += m.deltaTime;
            if (m.deltaTime > maxFrameTime) maxFrameTime = m.deltaTime;

            sumPhysics += m.physicsTime;
            sumRender += m.renderTime;
            sumUpdate += m.updateTime;

            sumMeshes += m.activeMeshes;
            sumDrawCalls += m.drawCalls;

            if (m.fps < 30) frameDrops++;
            if (m.deltaTime > 50) stutters++;

            if (m.memoryUsed && m.memoryUsed > memoryPeak) {
                memoryPeak = m.memoryUsed;
            }
        }

        const n = samples.length;

        return {
            avgFps: sumFps / n,
            minFps,
            maxFps,
            avgFrameTime: sumFrameTime / n,
            maxFrameTime,
            avgPhysicsTime: sumPhysics / n,
            avgRenderTime: sumRender / n,
            avgUpdateTime: sumUpdate / n,
            frameDrops,
            stutters,
            avgActiveMeshes: sumMeshes / n,
            avgDrawCalls: sumDrawCalls / n,
            memoryPeak: memoryPeak > 0 ? memoryPeak : undefined
        };
    }

    /**
     * Показать/скрыть overlay с метриками
     */
    toggleOverlay(): void {
        this.overlayVisible = !this.overlayVisible;

        if (this.overlayVisible) {
            this.createOverlay();
        } else if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    /**
     * Показать overlay
     */
    showOverlay(): void {
        if (!this.overlayVisible) {
            this.overlayVisible = true;
            this.createOverlay();
        }
    }

    /**
     * Скрыть overlay
     */
    hideOverlay(): void {
        if (this.overlayVisible) {
            this.overlayVisible = false;
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
        }
    }

    private createOverlay(): void {
        if (this.overlay) return;

        this.overlay = document.createElement("div");
        this.overlay.id = "perf-monitor-overlay";
        this.overlay.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.85);
            color: #0f0;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 11px;
            padding: 10px;
            border-radius: 5px;
            z-index: 99999;
            min-width: 200px;
            pointer-events: none;
            border: 1px solid #0f0;
        `;

        document.body.appendChild(this.overlay);
    }

    private updateOverlay(m: FrameMetrics): void {
        if (!this.overlay) return;

        const report = this.getReport(60); // последние 60 кадров

        // Цвет FPS
        let fpsColor = "#0f0";
        if (m.fps < 30) fpsColor = "#f00";
        else if (m.fps < 50) fpsColor = "#ff0";

        // Память
        let memoryStr = "";
        if (m.memoryUsed) {
            const usedMB = (m.memoryUsed / 1024 / 1024).toFixed(1);
            memoryStr = `MEM: ${usedMB}MB`;
        }

        this.overlay.innerHTML = `
            <div style="font-size: 14px; color: ${fpsColor}; font-weight: bold;">
                FPS: ${m.fps.toFixed(0)} (${report.avgFps.toFixed(0)} avg)
            </div>
            <div style="margin-top: 5px; border-top: 1px solid #333; padding-top: 5px;">
                Frame: ${m.deltaTime.toFixed(1)}ms (max: ${report.maxFrameTime.toFixed(1)}ms)
            </div>
            <div>Physics: ${m.physicsTime.toFixed(2)}ms</div>
            <div>Render: ${m.renderTime.toFixed(2)}ms</div>
            <div>Update: ${m.updateTime.toFixed(2)}ms</div>
            <div style="margin-top: 5px; border-top: 1px solid #333; padding-top: 5px;">
                Meshes: ${m.activeMeshes} / ${m.totalMeshes}
            </div>
            <div>Triangles: ${(m.triangles / 1000).toFixed(1)}K</div>
            ${memoryStr ? `<div>${memoryStr}</div>` : ""}
            <div style="margin-top: 5px; color: ${report.frameDrops > 0 ? '#f00' : '#0f0'};">
                Drops: ${report.frameDrops} | Stutters: ${report.stutters}
            </div>
        `;
    }

    /**
     * Установить callback для каждого кадра
     */
    setOnFrame(callback: (metrics: FrameMetrics) => void): void {
        this.onFrameCallback = callback;
    }

    /**
     * Вывести отчет в консоль
     */
    logReport(): void {
        const r = this.getReport();

        console.group("%c[Performance Report]", "color: #0af; font-weight: bold;");
        console.log(`FPS: ${r.avgFps.toFixed(1)} avg (${r.minFps.toFixed(0)}-${r.maxFps.toFixed(0)})`);
        console.log(`Frame Time: ${r.avgFrameTime.toFixed(2)}ms avg, ${r.maxFrameTime.toFixed(2)}ms max`);
        console.log(`Physics: ${r.avgPhysicsTime.toFixed(2)}ms | Render: ${r.avgRenderTime.toFixed(2)}ms | Update: ${r.avgUpdateTime.toFixed(2)}ms`);
        console.log(`Active Meshes: ${r.avgActiveMeshes.toFixed(0)} | Draw Calls: ${r.avgDrawCalls.toFixed(0)}`);
        console.log(`Frame Drops (<30fps): ${r.frameDrops} | Stutters (>50ms): ${r.stutters}`);
        if (r.memoryPeak) {
            console.log(`Memory Peak: ${(r.memoryPeak / 1024 / 1024).toFixed(1)}MB`);
        }
        console.groupEnd();
    }

    /**
     * Очистить метрики
     */
    clear(): void {
        this.metrics = [];
    }

    /**
     * Dispose
     */
    dispose(): void {
        this.hideOverlay();
        this.metrics = [];
        this.onFrameCallback = null;
        logger.log("[PerformanceMonitor] Disposed");
    }
}

// Singleton
let _monitorInstance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(scene?: Scene, engine?: Engine): PerformanceMonitor | null {
    if (!_monitorInstance && scene && engine) {
        _monitorInstance = new PerformanceMonitor(scene, engine);
    }
    return _monitorInstance;
}

export function disposePerformanceMonitor(): void {
    if (_monitorInstance) {
        _monitorInstance.dispose();
        _monitorInstance = null;
    }
}
