import { Scene, Engine } from "@babylonjs/core";
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
    
    constructor(engine: Engine, scene: Scene) {
        this.engine = engine;
        this.scene = scene;
        this.metricsCollector = new MetricsCollector(engine, scene);
        this.metricsExporter = new MetricsExporter();
        this.metricsAutomation = new MetricsAutomation();
        this.metricsCharts = new MetricsCharts();
        this.metricsAutomation.setHandlers(
            (msg) => { if (this.game?.hud) this.game.hud.showMessage(`⚠ ${msg}`, "#ff0", 3000); },
            (msg) => { if (this.game?.hud) this.game.hud.showMessage(`🚨 ${msg}`, "#f00", 5000); }
        );
        this.createUI();
        this.setupToggle();
        // Hide dashboard by default, show only FPS
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none"; // Дополнительно скрываем через style
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
            <div class="debug-title">DEV DASHBOARD [F3]</div>
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
        const chunkStats = this.chunkSystem?.getStats();
        
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
}


