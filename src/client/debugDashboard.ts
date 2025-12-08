import { Scene, Engine } from "@babylonjs/core";
import { ChunkSystem } from "./chunkSystem";

export class DebugDashboard {
    private container: HTMLDivElement;
    private fpsIndicator: HTMLDivElement; // Always visible FPS indicator
    private engine: Engine;
    private scene: Scene;
    private chunkSystem: ChunkSystem | null = null;
    
    private fpsHistory: number[] = [];
    private maxHistoryLength = 60;
    private lastUpdate = 0;
    private updateInterval = 100;
    
    private visible = false; // Hidden by default
    
    constructor(engine: Engine, scene: Scene) {
        this.engine = engine;
        this.scene = scene;
        this.createUI();
        this.setupToggle();
        // Hide dashboard by default, show only FPS
        this.container.classList.add("hidden");
    }
    
    setChunkSystem(chunkSystem: ChunkSystem): void {
        this.chunkSystem = chunkSystem;
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
                <div class="debug-label">CHUNKS</div>
                <div class="debug-row"><span>Loaded:</span><span id="dbg-chunks-loaded">-</span></div>
                <div class="debug-row"><span>In Memory:</span><span id="dbg-chunks-mem">-</span></div>
                <div class="debug-row"><span>Update Time:</span><span id="dbg-chunk-time">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">MEMORY</div>
                <div class="debug-row"><span>JS Heap:</span><span id="dbg-memory">-</span></div>
            </div>
            <div class="debug-section">
                <div class="debug-label">POSITION</div>
                <div class="debug-row"><span>X:</span><span id="dbg-pos-x">-</span></div>
                <div class="debug-row"><span>Y:</span><span id="dbg-pos-y">-</span></div>
                <div class="debug-row"><span>Z:</span><span id="dbg-pos-z">-</span></div>
            </div>
        `;
        
        const style = document.createElement("style");
        style.textContent = `
            #debug-dashboard {
                position: fixed;
                top: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.85);
                color: #0f0;
                font-family: Consolas, Monaco, monospace;
                font-size: 11px;
                padding: 8px 12px;
                border-radius: 4px;
                border: 1px solid #0f0;
                z-index: 10000;
                min-width: 180px;
                user-select: none;
            }
            #debug-dashboard.hidden { display: none; }
            .debug-title {
                font-size: 12px;
                font-weight: bold;
                color: #0ff;
                border-bottom: 1px solid #0f04;
                padding-bottom: 4px;
                margin-bottom: 6px;
            }
            .debug-section { margin-bottom: 8px; }
            .debug-label {
                color: #ff0;
                font-weight: bold;
                font-size: 10px;
                margin-bottom: 2px;
            }
            .debug-row {
                display: flex;
                justify-content: space-between;
                padding: 1px 0;
            }
            .debug-row span:first-child { color: #aaa; }
            .debug-row span:last-child { color: #0f0; font-weight: bold; }
            #fps-graph {
                width: 100%;
                height: 30px;
                background: #111;
                border: 1px solid #333;
                margin-top: 4px;
            }
            .fps-good { color: #0f0 !important; }
            .fps-ok { color: #ff0 !important; }
            .fps-bad { color: #f00 !important; }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        // Create always-visible FPS indicator
        this.createFpsIndicator();
    }
    
    private createFpsIndicator(): void {
        this.fpsIndicator = document.createElement("div");
        this.fpsIndicator.id = "fps-indicator";
        this.fpsIndicator.innerHTML = `<span id="fps-value">-</span> FPS`;
        
        const style = document.createElement("style");
        style.textContent += `
            #fps-indicator {
                position: fixed;
                bottom: 10px;
                left: 10px;
                background: rgba(0, 0, 0, 0.7);
                color: #0f0;
                font-family: Consolas, Monaco, monospace;
                font-size: 14px;
                font-weight: bold;
                padding: 6px 12px;
                border: 1px solid #0f0;
                border-radius: 4px;
                z-index: 9999;
                user-select: none;
            }
            #fps-indicator .fps-good { color: #0f0 !important; }
            #fps-indicator .fps-ok { color: #ff0 !important; }
            #fps-indicator .fps-bad { color: #f00 !important; }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.fpsIndicator);
    }
    
    private setupToggle(): void {
        window.addEventListener("keydown", (e) => {
            if (e.code === "F3") {
                e.preventDefault();
                this.visible = !this.visible;
                this.container.classList.toggle("hidden", !this.visible);
            }
        });
    }
    
    update(playerPos: { x: number, y: number, z: number }): void {
        const now = performance.now();
        if (now - this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = now;
        
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
        const perf = this.scene.getEngine().getInfo();
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
        
        // Update always-visible FPS indicator
        const fpsValueEl = document.getElementById("fps-value");
        if (fpsValueEl) {
            fpsValueEl.textContent = fps.toFixed(0);
            fpsValueEl.className = fps >= 55 ? "fps-good" : fps >= 30 ? "fps-ok" : "fps-bad";
        }
        
        set("dbg-frametime", `${deltaTime.toFixed(1)} ms`);
        set("dbg-drawcalls", (perf.renderer?.drawCalls || 0).toString());
        set("dbg-totalmesh", this.scene.meshes.length.toString());
        set("dbg-activemesh", this.scene.getActiveMeshes().length.toString());
        set("dbg-vertices", this.formatNumber(this.scene.getTotalVertices()));
        set("dbg-faces", this.formatNumber(Math.floor(this.scene.getTotalVertices() / 3)));
        
        if (chunkStats) {
            set("dbg-chunks-loaded", chunkStats.loadedChunks.toString());
            set("dbg-chunks-mem", chunkStats.totalChunksInMemory.toString());
            set("dbg-chunk-time", `${chunkStats.lastUpdateTime.toFixed(2)} ms`);
        }
        
        let memoryUsed = 0;
        const perfMem = (performance as any).memory;
        if (perfMem) {
            memoryUsed = perfMem.usedJSHeapSize / 1048576;
        }
        set("dbg-memory", `${memoryUsed.toFixed(1)} MB`);
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
        this.fpsIndicator.remove();
    }
}


