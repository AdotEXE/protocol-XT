import { Scene, Engine, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { ChunkSystem } from "./chunkSystem";
import { Game } from "./game";
import { TankController } from "./tankController";
import { MetricsCollector } from "./metricsCollector";
import { MetricsExporter } from "./metricsExporter";
import { MetricsAutomation } from "./metricsAutomation";
import { performanceOptimizer } from "./performanceOptimizer";
import { MetricsCharts } from "./metricsCharts";

export class DebugDashboard {
    private container!: HTMLDivElement;
    // FPS indicator removed - using HUD FPS only
    private engine: Engine;
    private scene: Scene;
    private chunkSystem: ChunkSystem | null = null;
    private game: Game | null = null;
    private tank: TankController | null = null;
    private metricsCollector: MetricsCollector | null = null;
    private metricsExporter: MetricsExporter | null = null;
    private metricsAutomation: MetricsAutomation | null = null;
    private metricsCharts: MetricsCharts | null = null;

    private fpsHistory: number[] = [];
    private maxHistoryLength = 60;
    private lastUpdate = 0;
    private updateInterval = 100;

    private visible = false; // Hidden by default
    private embedded = false;

    constructor(engine: Engine, scene: Scene, embedded: boolean = false) {
        this.engine = engine;
        this.scene = scene;
        this.embedded = embedded;
        this.metricsCollector = new MetricsCollector(engine, scene);
        this.metricsExporter = new MetricsExporter();
        this.metricsAutomation = new MetricsAutomation();
        this.metricsCharts = new MetricsCharts();
        this.metricsAutomation.setHandlers(
            (msg) => { if (this.game?.hud) this.game.hud.showMessage(`⚠ ${msg}`, "#ff0", 3000); },
            (msg) => { if (this.game?.hud) this.game.hud.showMessage(`🚨 ${msg}`, "#f00", 5000); }
        );

        // Не создаём overlay UI если панель будет встроена в другое меню
        if (!embedded) {
            this.createUI();
            this.setupToggle();
            // Hide dashboard by default, show only FPS
            this.visible = false;
            this.container.classList.add("hidden");
            this.container.style.display = "none"; // Дополнительно скрываем через style
        }
    }

    setChunkSystem(chunkSystem: ChunkSystem): void {
        this.chunkSystem = chunkSystem;
    }

    setGame(game: Game | null): void {
        this.game = game;
    }

    setTank(tank: TankController | null): void {
        this.tank = tank;
    }

    private createUI(): void {
        this.container = document.createElement("div");
        this.container.id = "debug-dashboard";
        this.container.innerHTML = `
            <div class="debug-title">DEV DASHBOARD [Ctrl+3]</div>
            <div class="debug-section">
                <div class="debug-label">PERFORMANCE</div>
                <div class="debug-row"><span>FPS:</span><span id="dbg-fps">-</span></div>
                <div class="debug-row"><span>Frame Time:</span><span id="dbg-frametime">-</span></div>
                <div class="debug-row"><span>Draw Calls:</span><span id="dbg-drawcalls">-</span></div>
                <canvas id="fps-graph" width="150" height="30"></canvas>
            </div>
            <div class="debug-section">
                <div class="debug-label">SCENE</div>
                <div class="debug-row"><span>Total Meshes:</span><span id="dbg-totalmesh">-</span></div>
                <div class="debug-row"><span>Active Meshes:</span><span id="dbg-activemesh">-</span></div>
                <div class="debug-row"><span>Vertices:</span><span id="dbg-vertices">-</span></div>
                <div class="debug-row"><span>Triangles:</span><span id="dbg-faces">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">ENEMIES</div>
                <div class="debug-row"><span>Count:</span><span id="dbg-enemy-count">-</span></div>
                <div class="debug-row"><span>Active:</span><span id="dbg-enemy-active">-</span></div>
                <div class="debug-row"><span>Spawned:</span><span id="dbg-enemy-spawned">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">TANK PHYSICS</div>
                <div class="debug-row"><span>Speed:</span><span id="dbg-tank-speed">-</span></div>
                <div class="debug-row"><span>Hover:</span><span id="dbg-tank-hover">-</span></div>
                <div class="debug-row"><span>Upright:</span><span id="dbg-tank-upright">-</span></div>
                <div class="debug-row"><span>Stability:</span><span id="dbg-tank-stability">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">CHUNKS</div>
                <div class="debug-row"><span>Loaded:</span><span id="dbg-chunks-loaded">-</span></div>
                <div class="debug-row"><span>In Memory:</span><span id="dbg-chunks-mem">-</span></div>
                <div class="debug-row"><span>Visible:</span><span id="dbg-chunks-visible">-</span></div>
                <div class="debug-row"><span>Update Time:</span><span id="dbg-chunk-time">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">NETWORK</div>
                <div class="debug-row"><span>Ping:</span><span id="dbg-network-ping">-</span></div>
                <div class="debug-row"><span>Players:</span><span id="dbg-network-players">-</span></div>
                <div class="debug-row"><span>Packets/s:</span><span id="dbg-network-packets">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">SYNC METRICS</div>
                <div class="debug-row"><span>Avg Pos Diff:</span><span id="dbg-sync-avg-diff">-</span></div>
                <div class="debug-row"><span>Max Pos Diff:</span><span id="dbg-sync-max-diff">-</span></div>
                <div class="debug-row"><span>Reconciliation/s:</span><span id="dbg-sync-recon-rate">-</span></div>
                <div class="debug-row"><span>Hard Corrections:</span><span id="dbg-sync-hard">-</span></div>
                <div class="debug-row"><span>Soft Corrections:</span><span id="dbg-sync-soft">-</span></div>
                <div class="debug-row"><span>Large Diffs:</span><span id="dbg-sync-large">-</span></div>
                <div class="debug-row"><span>Critical Diffs:</span><span id="dbg-sync-critical">-</span></div>
                <div class="debug-row"><span>Quality:</span><span id="dbg-sync-quality">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">MEMORY</div>
                <div class="debug-row"><span>Used:</span><span id="dbg-memory-used">-</span></div>
                <div class="debug-row"><span>Peak:</span><span id="dbg-memory-peak">-</span></div>
                <div class="debug-row"><span>Limit:</span><span id="dbg-memory-limit">-</span></div>
                <div class="debug-row"><span>GPU Memory:</span><span id="dbg-gpu-memory">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">PHYSICS</div>
                <div class="debug-row"><span>Objects:</span><span id="dbg-physics-objects">-</span></div>
                <div class="debug-row"><span>Bodies:</span><span id="dbg-physics-bodies">-</span></div>
                <div class="debug-row"><span>Time:</span><span id="dbg-physics-time">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">AUDIO</div>
                <div class="debug-row"><span>Sources:</span><span id="dbg-audio-sources">-</span></div>
                <div class="debug-row"><span>Playing:</span><span id="dbg-audio-playing">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">EFFECTS</div>
                <div class="debug-row"><span>Particles:</span><span id="dbg-particles">-</span></div>
                <div class="debug-row"><span>Systems:</span><span id="dbg-effect-systems">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">GPU</div>
                <div class="debug-row"><span>Renderer:</span><span id="dbg-gpu-renderer">-</span></div>
                <div class="debug-row"><span>Vendor:</span><span id="dbg-gpu-vendor">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">POSITION</div>
                <div class="debug-row"><span>X:</span><span id="dbg-pos-x">-</span></div>
                <div class="debug-row"><span>Y:</span><span id="dbg-pos-y">-</span></div>
                <div class="debug-row"><span>Z:</span><span id="dbg-pos-z">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">EXPORT</div>
                <button id="dbg-export-csv" style="
                    width: 100%;
                    padding: 4px;
                    margin: 2px 0;
                    background: rgba(0, 255, 4, 0.2);
                    border: 1px solid rgba(0, 255, 4, 0.6);
                    color: #0f0;
                    cursor: pointer;
                    font-size: 9px;
                    font-family: Consolas, monospace;
                ">Export CSV</button>
                <button id="dbg-export-json" style="
                    width: 100%;
                    padding: 4px;
                    margin: 2px 0;
                    background: rgba(0, 255, 4, 0.2);
                    border: 1px solid rgba(0, 255, 4, 0.6);
                    color: #0f0;
                    cursor: pointer;
                    font-size: 9px;
                    font-family: Consolas, monospace;
                ">Export JSON</button>
                <button id="dbg-toggle-charts" style="
                    width: 100%;
                    padding: 4px;
                    margin: 2px 0;
                    background: rgba(0, 255, 4, 0.2);
                    border: 1px solid rgba(0, 255, 4, 0.6);
                    color: #0f0;
                    cursor: pointer;
                    font-size: 9px;
                    font-family: Consolas, monospace;
                ">📊 Графики</button>
            </div>
            <div id="metrics-charts-container"></div>
        `;

        const style = document.createElement("style");
        style.textContent = `
            #debug-dashboard {
                position: fixed;
                top: clamp(5px, 1vh, 10px);
                left: clamp(5px, 1vw, 10px);
                background: rgba(0, 0, 0, 0.85);
                color: #0f0;
                font-family: Consolas, Monaco, monospace;
                font-size: clamp(9px, 1.1vw, 11px);
                padding: clamp(6px, 0.8vh, 8px) clamp(8px, 1.2vw, 12px);
                border-radius: clamp(3px, 0.4vw, 4px);
                border: clamp(1px, 0.1vw, 1px) solid #0f0;
                z-index: 10000;
                min-width: clamp(150px, 18vw, 180px);
                max-width: min(300px, 30vw);
                user-select: none;
            }
            #debug-dashboard.hidden { display: none; }
            .debug-title {
                font-size: clamp(10px, 1.2vw, 12px);
                font-weight: bold;
                color: #0ff;
                border-bottom: clamp(1px, 0.1vw, 1px) solid #0f04;
                padding-bottom: clamp(3px, 0.4vh, 4px);
                margin-bottom: clamp(4px, 0.6vh, 6px);
            }
            .debug-section { margin-bottom: clamp(6px, 0.8vh, 8px); }
            .debug-label {
                color: #ff0;
                font-weight: bold;
                font-size: clamp(8px, 1vw, 10px);
                margin-bottom: clamp(1px, 0.2vh, 2px);
            }
            .debug-row {
                display: flex;
                justify-content: space-between;
                padding: clamp(1px, 0.1vh, 1px) 0;
            }
            .debug-row span:first-child { color: #aaa; }
            .debug-row span:last-child { color: #0f0; font-weight: bold; }
            #fps-graph {
                width: 100%;
                height: clamp(25px, 3vh, 30px);
                background: #111;
                border: clamp(1px, 0.1vw, 1px) solid #333;
                margin-top: clamp(3px, 0.4vh, 4px);
            }
            .fps-good { color: #0f0 !important; }
            .fps-ok { color: #ff0 !important; }
            .fps-bad { color: #f00 !important; }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);

        // Добавляем контейнер графиков
        if (this.metricsCharts) {
            const chartsContainer = this.metricsCharts.createChartsContainer();
            this.container.appendChild(chartsContainer);
            this.metricsCharts.setVisible(false); // Скрыты по умолчанию
        }

        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        document.getElementById("dbg-export-csv")?.addEventListener("click", () => {
            this.metricsExporter?.exportToCSV();
        });

        document.getElementById("dbg-export-json")?.addEventListener("click", () => {
            this.metricsExporter?.exportToJSON();
        });

        let chartsVisible = false;
        document.getElementById("dbg-toggle-charts")?.addEventListener("click", () => {
            chartsVisible = !chartsVisible;
            this.metricsCharts?.setVisible(chartsVisible);
            const btn = document.getElementById("dbg-toggle-charts");
            if (btn) {
                btn.textContent = chartsVisible ? "📊 Скрыть графики" : "📊 Графики";
            }
        });
    }

    // FPS indicator removed - using HUD FPS only

    private setupToggle(): void {
        // F3 обработчик теперь управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
    }

    /**
     * Переключить видимость панели
     */
    toggle(): void {
        this.visible = !this.visible;
        if (this.visible) {
            this.container.classList.remove("hidden");
            this.container.style.display = "";

            // Показываем курсор и выходим из pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            document.body.style.cursor = 'default';
        } else {
            this.container.classList.add("hidden");
            this.container.style.display = "none";
        }
    }

    /**
     * Показать панель
     */
    show(): void {
        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "";

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';
    }

    /**
     * Скрыть панель
     */
    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }

    /**
     * Проверить видимость
     */
    isVisible(): boolean {
        return this.visible;
    }

    update(playerPos: { x: number, y: number, z: number }): void {
        // Обновляем только если dashboard видим
        if (!this.visible) return;

        const now = performance.now();
        if (now - this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = now;

        // Используем троттлинг для оптимизации
        const throttledUpdate = performanceOptimizer.throttle(
            'dashboard-update',
            () => this.updateDisplay(playerPos),
            this.updateInterval
        );
        throttledUpdate();

        const fps = this.engine.getFps();
        this.fpsHistory.push(fps);
        if (this.fpsHistory.length > this.maxHistoryLength) {
            this.fpsHistory.shift();
        }

        this.updateDisplay(playerPos);
        this.drawFpsGraph();
    }

    private updateDisplay(playerPos: { x: number, y: number, z: number }): void {
        const fps = this.engine.getFps();
        const deltaTime = this.engine.getDeltaTime();
        const perf = (this.scene.getEngine() as any).getInfo?.() || { triangles: 0, drawCalls: 0 };
        const chunkStats = this.chunkSystem ? {
            loadedChunks: (this.chunkSystem as any).loadedChunks?.size || 0,
            garageCount: this.chunkSystem.garagePositions?.length || 0,
            totalChunksInMemory: (this.chunkSystem as any).loadedChunks?.size || 0,
            lastUpdateTime: 0
        } : null;

        const set = (id: string, value: string) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };

        const fpsEl = document.getElementById("dbg-fps");
        if (fpsEl) {
            fpsEl.textContent = fps.toFixed(0);
            fpsEl.className = fps >= 55 ? "fps-good" : fps >= 30 ? "fps-ok" : "fps-bad";
        }

        // FPS indicator removed - using HUD FPS only

        set("dbg-frametime", `${deltaTime.toFixed(1)} ms`);
        set("dbg-drawcalls", (perf.renderer?.drawCalls || 0).toString());
        set("dbg-totalmesh", this.scene.meshes.length.toString());
        set("dbg-activemesh", this.scene.getActiveMeshes().length.toString());
        set("dbg-vertices", this.formatNumber(this.scene.getTotalVertices()));
        set("dbg-faces", this.formatNumber(Math.floor(this.scene.getTotalVertices() / 3)));

        // ENEMIES
        if (this.game) {
            const enemyTanks = (this.game as any).enemyTanks || [];
            const activeEnemies = enemyTanks.filter((e: any) => e && e.isAlive !== false).length;
            set("dbg-enemy-count", enemyTanks.length.toString());
            set("dbg-enemy-active", activeEnemies.toString());
            set("dbg-enemy-spawned", enemyTanks.length.toString());
        } else {
            set("dbg-enemy-count", "0");
            set("dbg-enemy-active", "0");
            set("dbg-enemy-spawned", "0");
        }

        // TANK PHYSICS
        if (this.tank) {
            set("dbg-tank-speed", this.tank.moveSpeed?.toFixed(1) || "0");
            set("dbg-tank-hover", this.tank.hoverHeight?.toFixed(2) || "0");
            set("dbg-tank-upright", this.tank.uprightForce?.toFixed(0) || "0");
            set("dbg-tank-stability", this.tank.stabilityForce?.toFixed(0) || "0");
        } else {
            set("dbg-tank-speed", "-");
            set("dbg-tank-hover", "-");
            set("dbg-tank-upright", "-");
            set("dbg-tank-stability", "-");
        }

        // CHUNKS
        if (chunkStats) {
            set("dbg-chunks-loaded", chunkStats.loadedChunks.toString());
            set("dbg-chunks-mem", chunkStats.totalChunksInMemory.toString());
            set("dbg-chunks-visible", (chunkStats.loadedChunks || 0).toString());
            set("dbg-chunk-time", `${chunkStats.lastUpdateTime.toFixed(2)} ms`);
        } else {
            set("dbg-chunks-loaded", "-");
            set("dbg-chunks-mem", "-");
            set("dbg-chunks-visible", "-");
            set("dbg-chunk-time", "-");
        }

        // NETWORK
        if (this.game && (this.game as any).multiplayerManager) {
            const mp = (this.game as any).multiplayerManager;
            set("dbg-network-ping", mp.ping?.toString() || "N/A");
            set("dbg-network-players", ((this.game as any).networkPlayerTanks?.size || 0).toString());
            set("dbg-network-packets", "N/A"); // Пакеты в секунду - если доступно
        } else {
            set("dbg-network-ping", "N/A");
            set("dbg-network-players", "0");
            set("dbg-network-packets", "N/A");
        }

        // SYNC METRICS
        if (this.game && (this.game as any).gameMultiplayerCallbacks) {
            const syncMetrics = (this.game as any).gameMultiplayerCallbacks.getSyncMetrics?.();
            if (syncMetrics) {
                const metrics = syncMetrics.getMetrics();
                set("dbg-sync-avg-diff", metrics.averagePositionDiff.toFixed(3));
                set("dbg-sync-max-diff", metrics.maxPositionDiff.toFixed(3));
                set("dbg-sync-recon-rate", metrics.reconciliationRate.toFixed(2));
                set("dbg-sync-hard", metrics.hardCorrections.toString());
                set("dbg-sync-soft", metrics.softCorrections.toString());
                set("dbg-sync-large", metrics.largeDiffs.toString());
                set("dbg-sync-critical", metrics.criticalDiffs.toString());
                const quality = syncMetrics.getSyncQuality();
                const qualityStatus = syncMetrics.getSyncQualityStatus();
                const qualityColor = qualityStatus === "excellent" ? "#0f0" : qualityStatus === "good" ? "#ff0" : qualityStatus === "fair" ? "#fa0" : "#f00";
                const qualityEl = document.getElementById("dbg-sync-quality");
                if (qualityEl) {
                    qualityEl.textContent = `${quality.toFixed(0)}% (${qualityStatus})`;
                    qualityEl.style.color = qualityColor;
                }
            } else {
                set("dbg-sync-avg-diff", "-");
                set("dbg-sync-max-diff", "-");
                set("dbg-sync-recon-rate", "-");
                set("dbg-sync-hard", "-");
                set("dbg-sync-soft", "-");
                set("dbg-sync-large", "-");
                set("dbg-sync-critical", "-");
                set("dbg-sync-quality", "-");
            }
        } else {
            set("dbg-sync-avg-diff", "-");
            set("dbg-sync-max-diff", "-");
            set("dbg-sync-recon-rate", "-");
            set("dbg-sync-hard", "-");
            set("dbg-sync-soft", "-");
            set("dbg-sync-large", "-");
            set("dbg-sync-critical", "-");
            set("dbg-sync-quality", "-");
        }

        // MEMORY
        let memoryUsed = 0;
        let memoryPeak = 0;
        let memoryLimit = 0;
        const perfMem = (performance as any).memory;
        if (perfMem) {
            memoryUsed = perfMem.usedJSHeapSize / 1048576;
            memoryPeak = perfMem.peakJSHeapSize / 1048576;
            memoryLimit = perfMem.jsHeapSizeLimit / 1048576;
        }
        set("dbg-memory-used", `${memoryUsed.toFixed(1)} MB`);
        set("dbg-memory-peak", `${memoryPeak.toFixed(1)} MB`);
        set("dbg-memory-limit", `${memoryLimit.toFixed(1)} MB`);

        // Extended metrics from MetricsCollector
        if (this.metricsCollector) {
            const metrics = this.metricsCollector.collect();

            // GPU
            if (metrics.gpuMemory !== undefined) {
                set("dbg-gpu-memory", `${(metrics.gpuMemory / 1048576).toFixed(1)} MB`);
            } else {
                set("dbg-gpu-memory", "N/A");
            }
            set("dbg-gpu-renderer", metrics.gpuRenderer || "N/A");
            set("dbg-gpu-vendor", metrics.gpuVendor || "N/A");

            // Physics
            set("dbg-physics-objects", (metrics.physicsObjects || 0).toString());
            set("dbg-physics-bodies", (metrics.physicsBodies || 0).toString());
            set("dbg-physics-time", metrics.physicsTime ? `${metrics.physicsTime.toFixed(2)} ms` : "N/A");

            // Audio
            set("dbg-audio-sources", (metrics.audioSources || 0).toString());
            set("dbg-audio-playing", (metrics.audioPlaying || 0).toString());

            // Effects
            set("dbg-particles", (metrics.particles || 0).toString());
            set("dbg-effect-systems", (metrics.effectSystems || 0).toString());

            // Сохранение метрик для экспорта
            if (this.metricsExporter) {
                const perf = (this.scene.getEngine() as any).getInfo?.() || { triangles: 0, drawCalls: 0 };
                const perfMem = (performance as any).memory;
                const memoryUsed = perfMem ? perfMem.usedJSHeapSize / 1048576 : 0;

                const metricsData = {
                    fps,
                    frameTime: deltaTime,
                    drawCalls: perf.renderer?.drawCalls || 0,
                    meshes: this.scene.meshes.length,
                    vertices: this.scene.getTotalVertices(),
                    triangles: Math.floor(this.scene.getTotalVertices() / 3),
                    memoryUsed,
                    ...metrics
                };

                this.metricsExporter.addMetrics(metrics, {
                    fps,
                    frameTime: deltaTime,
                    drawCalls: perf.renderer?.drawCalls || 0,
                    meshes: this.scene.meshes.length,
                    vertices: this.scene.getTotalVertices(),
                    triangles: Math.floor(this.scene.getTotalVertices() / 3),
                    memoryUsed
                });

                // Проверка триггеров автоматизации
                if (this.metricsAutomation) {
                    this.metricsAutomation.checkMetrics(metricsData as any);
                }

                // Обновление графиков
                if (this.metricsCharts) {
                    this.metricsCharts.updateCharts(metrics as any);
                }
            }
        } else {
            set("dbg-gpu-memory", "N/A");
            set("dbg-gpu-renderer", "N/A");
            set("dbg-gpu-vendor", "N/A");
            set("dbg-physics-objects", "0");
            set("dbg-physics-bodies", "0");
            set("dbg-physics-time", "N/A");
            set("dbg-audio-sources", "0");
            set("dbg-audio-playing", "0");
            set("dbg-particles", "0");
            set("dbg-effect-systems", "0");
        }

        set("dbg-pos-x", playerPos.x.toFixed(1));
        set("dbg-pos-y", playerPos.y.toFixed(1));
        set("dbg-pos-z", playerPos.z.toFixed(1));
    }

    private formatNumber(n: number): string {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "K";
        return n.toString();
    }

    private drawFpsGraph(): void {
        const canvas = document.getElementById("fps-graph") as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "#333";
        ctx.beginPath();
        ctx.moveTo(0, canvas.height * 0.5);
        ctx.lineTo(canvas.width, canvas.height * 0.5);
        ctx.stroke();

        if (this.fpsHistory.length < 2) return;

        const barWidth = canvas.width / this.maxHistoryLength;

        this.fpsHistory.forEach((fps, i) => {
            const height = Math.min((fps / 60) * canvas.height, canvas.height);
            const x = i * barWidth;

            ctx.fillStyle = fps >= 55 ? "#0f0" : fps >= 30 ? "#ff0" : "#f00";
            ctx.fillRect(x, canvas.height - height, barWidth - 1, height);
        });
    }

    dispose(): void {
        this.container.remove();
        // FPS indicator removed - using HUD FPS only
    }

    /**
     * Рендерит контент в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        container.innerHTML = this.getEmbeddedContentHTML();
        this.injectEmbeddedStyles(container);
        this.setupEmbeddedEventListeners(container);
        this.startEmbeddedUpdates(container);
    }

    /**
     * Инжектирует стили для embedded режима
     */
    private injectEmbeddedStyles(container: HTMLElement): void {
        const styleId = "debug-dashboard-embedded-styles";
        if (document.getElementById(styleId)) return;

        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
            .dbg-filter-btn {
                padding: 6px 12px;
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                border-radius: 4px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .dbg-filter-btn:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.05);
            }
            
            .dbg-filter-btn.active {
                background: rgba(0, 255, 4, 0.4);
                border-color: #0ff;
                color: #0ff;
                box-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
            }
            
            .dbg-metric-group {
                transition: opacity 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
        return `
            <div class="debug-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 18px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5); font-weight: bold;">
                    📊 DEBUG DASHBOARD
                </h3>
                
                <!-- Фильтры метрик -->
                <div style="margin-bottom: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="panel-btn dbg-filter-btn active" data-filter="all" style="padding: 6px 12px; font-size: 11px;">Все</button>
                    <button class="panel-btn dbg-filter-btn" data-filter="performance" style="padding: 6px 12px; font-size: 11px;">Производительность</button>
                    <button class="panel-btn dbg-filter-btn" data-filter="network" style="padding: 6px 12px; font-size: 11px;">Сеть</button>
                    <button class="panel-btn dbg-filter-btn" data-filter="memory" style="padding: 6px 12px; font-size: 11px;">Память</button>
                    <button class="panel-btn dbg-filter-btn" data-filter="physics" style="padding: 6px 12px; font-size: 11px;">Физика</button>
                </div>
                
                <!-- Основные метрики -->
                <div class="dbg-metric-group" data-group="performance" style="
                    background: rgba(0, 20, 0, 0.6);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        ⚡ ПРОИЗВОДИТЕЛЬНОСТЬ
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">FPS:</span>
                            <span class="dbg-fps-emb" style="color: #0f0; font-size: 13px; font-weight: bold;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Frame Time:</span>
                            <span class="dbg-frametime-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Draw Calls:</span>
                            <span class="dbg-drawcalls-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Vertices:</span>
                            <span class="dbg-vertices-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Active Meshes:</span>
                            <span class="dbg-meshes-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Triangles:</span>
                            <span class="dbg-triangles-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                    </div>
                </div>
                
                <!-- Сетевые метрики -->
                <div class="dbg-metric-group" data-group="network" style="
                    background: rgba(0, 20, 0, 0.6);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        🌐 СЕТЬ
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Ping:</span>
                            <span class="dbg-network-ping-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Игроки:</span>
                            <span class="dbg-network-players-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Sync Quality:</span>
                            <span class="dbg-sync-quality-emb" style="color: #0f0; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Avg Pos Diff:</span>
                            <span class="dbg-sync-avg-diff-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                    </div>
                </div>
                
                <!-- Память -->
                <div class="dbg-metric-group" data-group="memory" style="
                    background: rgba(0, 20, 0, 0.6);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        💾 ПАМЯТЬ
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Used:</span>
                            <span class="dbg-memory-used-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Peak:</span>
                            <span class="dbg-memory-peak-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">GPU Memory:</span>
                            <span class="dbg-gpu-memory-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">GPU Renderer:</span>
                            <span class="dbg-gpu-renderer-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                    </div>
                </div>
                
                <!-- Физика -->
                <div class="dbg-metric-group" data-group="physics" style="
                    background: rgba(0, 20, 0, 0.6);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        ⚙️ ФИЗИКА
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Objects:</span>
                            <span class="dbg-physics-objects-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Bodies:</span>
                            <span class="dbg-physics-bodies-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Update Time:</span>
                            <span class="dbg-physics-time-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="color: #7f7; font-size: 12px;">Particles:</span>
                            <span class="dbg-particles-emb" style="color: #0ff; font-size: 12px;">--</span>
                        </div>
                    </div>
                </div>
                
                <!-- FPS график -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        📈 FPS ИСТОРИЯ
                    </div>
                    <canvas class="dbg-fps-chart-emb" width="400" height="80" style="
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.3);
                        border-radius: 4px;
                        width: 100%;
                        display: block;
                    "></canvas>
                </div>
                
                <!-- Опции отладки -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        🔧 ОПЦИИ ОТЛАДКИ
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        <button class="panel-btn dbg-wireframe-btn" style="padding: 8px 14px; font-size: 11px;">Wireframe</button>
                        <button class="panel-btn dbg-bounds-btn" style="padding: 8px 14px; font-size: 11px;">Bounds</button>
                        <button class="panel-btn dbg-inspector-btn" style="padding: 8px 14px; font-size: 11px;">Inspector</button>
                        <button class="panel-btn dbg-axes-btn" style="padding: 8px 14px; font-size: 11px;">World Axes</button>
                    </div>
                </div>
                
                <!-- Экспорт -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        💾 ЭКСПОРТ ДАННЫХ
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="panel-btn primary dbg-export-csv-emb" style="padding: 8px 14px; font-size: 11px; flex: 1; min-width: 120px;">📄 CSV</button>
                        <button class="panel-btn primary dbg-export-json-emb" style="padding: 8px 14px; font-size: 11px; flex: 1; min-width: 120px;">📋 JSON</button>
                        <button class="panel-btn dbg-toggle-charts-emb" style="padding: 8px 14px; font-size: 11px; flex: 1; min-width: 120px;">📊 Графики</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        // Фильтры метрик
        const filterBtns = container.querySelectorAll(".dbg-filter-btn");
        filterBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const filter = btn.getAttribute("data-filter");
                filterBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                const groups = container.querySelectorAll(".dbg-metric-group");
                groups.forEach(group => {
                    const groupType = group.getAttribute("data-group");
                    if (filter === "all" || groupType === filter) {
                        (group as HTMLElement).style.display = "block";
                    } else {
                        (group as HTMLElement).style.display = "none";
                    }
                });
            });
        });

        // Экспорт
        const exportCsvBtn = container.querySelector(".dbg-export-csv-emb");
        const exportJsonBtn = container.querySelector(".dbg-export-json-emb");
        const toggleChartsBtn = container.querySelector(".dbg-toggle-charts-emb");

        exportCsvBtn?.addEventListener("click", () => {
            this.metricsExporter?.exportToCSV();
            if (this.game?.hud) {
                this.game.hud.showMessage("Метрики экспортированы в CSV", "#0f0", 2000);
            }
        });

        exportJsonBtn?.addEventListener("click", () => {
            this.metricsExporter?.exportToJSON();
            if (this.game?.hud) {
                this.game.hud.showMessage("Метрики экспортированы в JSON", "#0f0", 2000);
            }
        });

        let chartsVisible = false;
        toggleChartsBtn?.addEventListener("click", () => {
            chartsVisible = !chartsVisible;
            this.metricsCharts?.setVisible(chartsVisible);
            if (toggleChartsBtn) {
                toggleChartsBtn.textContent = chartsVisible ? "📊 Скрыть графики" : "📊 Графики";
            }
        });

        // Опции отладки
        const wireframeBtn = container.querySelector(".dbg-wireframe-btn");
        const boundsBtn = container.querySelector(".dbg-bounds-btn");
        const inspectorBtn = container.querySelector(".dbg-inspector-btn");
        const axesBtn = container.querySelector(".dbg-axes-btn");

        wireframeBtn?.addEventListener("click", () => {
            if (this.scene) {
                let anyWireframe = false;
                this.scene.meshes.forEach(mesh => {
                    if (mesh.material) {
                        const mat = mesh.material as any;
                        if (mat.wireframe) anyWireframe = true;
                    }
                });
                const newState = !anyWireframe;
                this.scene.meshes.forEach(mesh => {
                    if (mesh.material) {
                        (mesh.material as any).wireframe = newState;
                    }
                });
                if (this.game?.hud) {
                    this.game.hud.showMessage(`Wireframe: ${newState ? "ON" : "OFF"}`, "#0ff", 1500);
                }
            }
        });

        boundsBtn?.addEventListener("click", () => {
            if (this.scene) {
                const showBounds = !this.scene.meshes[0]?.showBoundingBox;
                this.scene.meshes.forEach(mesh => {
                    mesh.showBoundingBox = showBounds;
                });
                if (this.game?.hud) {
                    this.game.hud.showMessage(`Bounds: ${showBounds ? "ON" : "OFF"}`, "#0ff", 1500);
                }
            }
        });

        inspectorBtn?.addEventListener("click", async () => {
            if (this.scene) {
                try {
                    const { Inspector } = await import("@babylonjs/inspector");
                    if (Inspector.IsVisible) {
                        Inspector.Hide();
                        if (this.game?.hud) {
                            this.game.hud.showMessage("Inspector скрыт", "#0ff", 1500);
                        }
                    } else {
                        Inspector.Show(this.scene, {});
                        if (this.game?.hud) {
                            this.game.hud.showMessage("Inspector открыт", "#0f0", 1500);
                        }
                    }
                } catch (e) {
                    console.error("[DebugDashboard] Failed to load inspector:", e);
                    if (this.game?.hud) {
                        this.game.hud.showMessage("Ошибка загрузки Inspector", "#f00", 2000);
                    }
                }
            }
        });

        axesBtn?.addEventListener("click", () => {
            if (this.scene) {
                // Toggle world axes
                const existingAxes = this.scene.getMeshByName("worldAxes");
                if (existingAxes) {
                    existingAxes.dispose();
                    if (this.game?.hud) {
                        this.game.hud.showMessage("World Axes скрыты", "#0ff", 1500);
                    }
                } else {
                    // Create simple axes
                    const axesSize = 50;
                    // Imports are now at the top of the file

                    const axesParent = MeshBuilder.CreateBox("worldAxes", { size: 0.1 }, this.scene);
                    axesParent.isVisible = false;

                    const xAxis = MeshBuilder.CreateLines("xAxis", {
                        points: [Vector3.Zero(), new Vector3(axesSize, 0, 0)]
                    }, this.scene);
                    xAxis.color = new Color3(1, 0, 0);
                    xAxis.parent = axesParent;

                    const yAxis = MeshBuilder.CreateLines("yAxis", {
                        points: [Vector3.Zero(), new Vector3(0, axesSize, 0)]
                    }, this.scene);
                    yAxis.color = new Color3(0, 1, 0);
                    yAxis.parent = axesParent;

                    const zAxis = MeshBuilder.CreateLines("zAxis", {
                        points: [Vector3.Zero(), new Vector3(0, 0, axesSize)]
                    }, this.scene);
                    zAxis.color = new Color3(0, 0, 1);
                    zAxis.parent = axesParent;

                    if (this.game?.hud) {
                        this.game.hud.showMessage("World Axes показаны", "#0f0", 1500);
                    }
                }
            }
        });
    }

    /**
     * Запускает обновление метрик для embedded режима
     */
    private startEmbeddedUpdates(container: HTMLElement): void {
        const fpsEl = container.querySelector(".dbg-fps-emb");
        const frametimeEl = container.querySelector(".dbg-frametime-emb");
        const drawCallsEl = container.querySelector(".dbg-drawcalls-emb");
        const verticesEl = container.querySelector(".dbg-vertices-emb");
        const meshesEl = container.querySelector(".dbg-meshes-emb");
        const trianglesEl = container.querySelector(".dbg-triangles-emb");
        const particlesEl = container.querySelector(".dbg-particles-emb");
        const networkPingEl = container.querySelector(".dbg-network-ping-emb");
        const networkPlayersEl = container.querySelector(".dbg-network-players-emb");
        const syncQualityEl = container.querySelector(".dbg-sync-quality-emb");
        const syncAvgDiffEl = container.querySelector(".dbg-sync-avg-diff-emb");
        const memoryUsedEl = container.querySelector(".dbg-memory-used-emb");
        const memoryPeakEl = container.querySelector(".dbg-memory-peak-emb");
        const gpuMemoryEl = container.querySelector(".dbg-gpu-memory-emb");
        const gpuRendererEl = container.querySelector(".dbg-gpu-renderer-emb");
        const physicsObjectsEl = container.querySelector(".dbg-physics-objects-emb");
        const physicsBodiesEl = container.querySelector(".dbg-physics-bodies-emb");
        const physicsTimeEl = container.querySelector(".dbg-physics-time-emb");
        const chartCanvas = container.querySelector(".dbg-fps-chart-emb") as HTMLCanvasElement;

        const fpsHistory: number[] = [];
        const maxHistory = 100;

        const updateMetrics = () => {
            if (!this.engine || !this.scene) return;

            const fps = this.engine.getFps();
            const deltaTime = this.engine.getDeltaTime();
            fpsHistory.push(fps);
            if (fpsHistory.length > maxHistory) fpsHistory.shift();

            // Производительность
            if (fpsEl) {
                fpsEl.textContent = fps.toFixed(1);
                (fpsEl as HTMLElement).style.color = fps >= 55 ? "#0f0" : fps >= 30 ? "#ff0" : "#f00";
            }
            if (frametimeEl) frametimeEl.textContent = `${deltaTime.toFixed(2)} ms`;
            if (drawCallsEl) {
                const perf = (this.scene.getEngine() as any).getInfo?.() || { drawCalls: 0 };
                drawCallsEl.textContent = (perf.renderer?.drawCalls || this.scene.getActiveMeshes().length).toString();
            }
            if (verticesEl) verticesEl.textContent = this.formatNumber(this.scene.getTotalVertices());
            if (meshesEl) meshesEl.textContent = this.scene.getActiveMeshes().length.toString();
            if (trianglesEl) trianglesEl.textContent = this.formatNumber(Math.floor(this.scene.getTotalVertices() / 3));

            // Сеть
            if (this.game && (this.game as any).multiplayerManager) {
                const mp = (this.game as any).multiplayerManager;
                if (networkPingEl) networkPingEl.textContent = mp.ping ? `${mp.ping}ms` : "N/A";
                if (networkPlayersEl) networkPlayersEl.textContent = ((this.game as any).networkPlayerTanks?.size || 0).toString();

                const syncMetrics = (this.game as any).gameMultiplayerCallbacks?.getSyncMetrics?.();
                if (syncMetrics) {
                    const quality = syncMetrics.getSyncQuality();
                    const qualityStatus = syncMetrics.getSyncQualityStatus();
                    if (syncQualityEl) {
                        syncQualityEl.textContent = `${quality.toFixed(0)}%`;
                        (syncQualityEl as HTMLElement).style.color =
                            qualityStatus === "excellent" ? "#0f0" :
                                qualityStatus === "good" ? "#ff0" :
                                    qualityStatus === "fair" ? "#fa0" : "#f00";
                    }
                    const metrics = syncMetrics.getMetrics();
                    if (syncAvgDiffEl) syncAvgDiffEl.textContent = metrics.averagePositionDiff.toFixed(3);
                } else {
                    if (syncQualityEl) syncQualityEl.textContent = "N/A";
                    if (syncAvgDiffEl) syncAvgDiffEl.textContent = "N/A";
                }
            } else {
                if (networkPingEl) networkPingEl.textContent = "N/A";
                if (networkPlayersEl) networkPlayersEl.textContent = "0";
                if (syncQualityEl) syncQualityEl.textContent = "N/A";
                if (syncAvgDiffEl) syncAvgDiffEl.textContent = "N/A";
            }

            // Память
            const perfMem = (performance as any).memory;
            if (perfMem) {
                const used = perfMem.usedJSHeapSize / 1048576;
                const peak = perfMem.peakJSHeapSize / 1048576;
                if (memoryUsedEl) memoryUsedEl.textContent = `${used.toFixed(1)} MB`;
                if (memoryPeakEl) memoryPeakEl.textContent = `${peak.toFixed(1)} MB`;
            } else {
                if (memoryUsedEl) memoryUsedEl.textContent = "N/A";
                if (memoryPeakEl) memoryPeakEl.textContent = "N/A";
            }

            // GPU
            if (this.metricsCollector) {
                const metrics = this.metricsCollector.collect();
                if (gpuMemoryEl) {
                    gpuMemoryEl.textContent = metrics.gpuMemory !== undefined
                        ? `${(metrics.gpuMemory / 1048576).toFixed(1)} MB`
                        : "N/A";
                }
                if (gpuRendererEl) gpuRendererEl.textContent = metrics.gpuRenderer || "N/A";
            } else {
                if (gpuMemoryEl) gpuMemoryEl.textContent = "N/A";
                if (gpuRendererEl) gpuRendererEl.textContent = "N/A";
            }

            // Физика
            if (this.metricsCollector) {
                const metrics = this.metricsCollector.collect();
                if (physicsObjectsEl) physicsObjectsEl.textContent = (metrics.physicsObjects || 0).toString();
                if (physicsBodiesEl) physicsBodiesEl.textContent = (metrics.physicsBodies || 0).toString();
                if (physicsTimeEl) {
                    physicsTimeEl.textContent = metrics.physicsTime
                        ? `${metrics.physicsTime.toFixed(2)} ms`
                        : "N/A";
                }
                if (particlesEl) particlesEl.textContent = (metrics.particles || this.scene.particleSystems?.length || 0).toString();
            } else {
                if (physicsObjectsEl) physicsObjectsEl.textContent = "0";
                if (physicsBodiesEl) physicsBodiesEl.textContent = "0";
                if (physicsTimeEl) physicsTimeEl.textContent = "N/A";
                if (particlesEl) particlesEl.textContent = String(this.scene.particleSystems?.length || 0);
            }

            // Рисуем улучшенный FPS график
            if (chartCanvas) {
                const ctx = chartCanvas.getContext("2d");
                if (ctx) {
                    ctx.fillStyle = "rgba(0, 5, 0, 0.8)";
                    ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);

                    // Сетка
                    ctx.strokeStyle = "rgba(0, 255, 4, 0.1)";
                    ctx.lineWidth = 1;
                    for (let i = 0; i <= 4; i++) {
                        const y = (chartCanvas.height / 4) * i;
                        ctx.beginPath();
                        ctx.moveTo(0, y);
                        ctx.lineTo(chartCanvas.width, y);
                        ctx.stroke();
                    }

                    // Линия 60 FPS
                    ctx.strokeStyle = "rgba(0, 255, 0, 0.3)";
                    ctx.lineWidth = 1;
                    const fps60Y = chartCanvas.height * 0.2;
                    ctx.beginPath();
                    ctx.moveTo(0, fps60Y);
                    ctx.lineTo(chartCanvas.width, fps60Y);
                    ctx.stroke();

                    // График
                    if (fpsHistory.length > 1) {
                        const barWidth = chartCanvas.width / maxHistory;
                        const maxFps = Math.max(60, ...fpsHistory);

                        fpsHistory.forEach((f, i) => {
                            const height = (f / maxFps) * chartCanvas.height;
                            const x = i * barWidth;

                            // Градиент цвета в зависимости от FPS
                            ctx.fillStyle = f >= 55 ? "#0f0" : f >= 30 ? "#ff0" : "#f00";
                            ctx.fillRect(x, chartCanvas.height - height, Math.max(1, barWidth - 1), height);
                        });
                    }
                }
            }

            // Сохранение метрик для экспорта
            if (this.metricsExporter && this.metricsCollector) {
                const metrics = this.metricsCollector.collect();
                const perf = (this.scene.getEngine() as any).getInfo?.() || { triangles: 0, drawCalls: 0 };
                const perfMem = (performance as any).memory;
                const memoryUsed = perfMem ? perfMem.usedJSHeapSize / 1048576 : 0;

                this.metricsExporter.addMetrics(metrics, {
                    fps,
                    frameTime: deltaTime,
                    drawCalls: perf.renderer?.drawCalls || 0,
                    meshes: this.scene.meshes.length,
                    vertices: this.scene.getTotalVertices(),
                    triangles: Math.floor(this.scene.getTotalVertices() / 3),
                    memoryUsed
                });
            }
        };

        // Сохраняем интервал в dataset для очистки при размонтировании
        const intervalId = setInterval(updateMetrics, 500); // Обновляем чаще для более плавного графика
        container.dataset.debugInterval = String(intervalId);

        // Первое обновление сразу
        updateMetrics();
    }
}


