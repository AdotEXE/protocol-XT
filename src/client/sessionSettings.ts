/**
 * Session Settings - Меню настроек игровой сессии
 */

import { Game } from "./game";
import { logger } from "./utils/logger";

export interface SpawnZone {
    id: string;
    name: string;
    center: { x: number; y: number; z: number };
    radius: number;
    enabled: boolean;
}

export interface SpawnPattern {
    id: string;
    name: string;
    type: "random" | "circle" | "line" | "grid" | "custom";
    params?: { [key: string]: any };
}

export interface EnemyTypeConfig {
    id: string;
    name: string;
    enabled: boolean;
    weight: number; // Вероятность появления (1-10)
    minLevel: number;
    maxLevel: number;
}

export type GameMode = "normal" | "survival" | "capture" | "raid" | "sandbox";

export interface SessionSettingsData {
    gameMode: GameMode;            // Режим игры
    enemyCount: number;           // 0-50
    spawnInterval: number;         // 1-60 секунд
    aiDifficulty: "easy" | "medium" | "hard";
    enemyTypes: EnemyTypeConfig[]; // Расширенная конфигурация типов
    spawnZones: SpawnZone[];       // Зоны спавна
    spawnPattern: SpawnPattern;    // Паттерн спавна
    enemyLevels: {
        min: number;
        max: number;
        scaling: boolean; // Масштабирование по времени
    };
    waveSystem: {
        enabled: boolean;
        waveSize: number;
        waveInterval: number;
    };
    worldSettings: {
        seed?: number;
        mapSize?: number;
    };
    // Настройки режимов игры
    survivalSettings?: {
        timeLimit?: number; // Лимит времени в секундах
        maxWaves?: number;  // Максимум волн
    };
    captureSettings?: {
        capturePoints?: number; // Количество точек захвата
        captureTime?: number;   // Время захвата в секундах
    };
    raidSettings?: {
        objectiveCount?: number; // Количество целей
        difficulty?: number;     // Сложность рейда (1-10)
    };
}

export class SessionSettings {
    private container: HTMLDivElement;
    private visible: boolean = false;
    private settings: SessionSettingsData;
    private game: Game | null = null;
    private worldManager: WorldManager | null = null;
    private waveEditor: WaveEditor | null = null;
    
    constructor() {
        this.settings = this.getDefaultSettings();
        this.createUI();
        this.setupToggle();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    setGame(game: Game | null): void {
        this.game = game;
        if (game && game.scene) {
            this.worldManager = new WorldManager(game.scene);
        }
        this.waveEditor = new WaveEditor();
    }
    
    getSettings(): SessionSettingsData {
        return { ...this.settings };
    }
    
    private getDefaultSettings(): SessionSettingsData {
        return {
            gameMode: "normal",
            enemyCount: 7,
            spawnInterval: 30,
            aiDifficulty: "medium",
            enemyTypes: [
                { id: "basic", name: "Базовый", enabled: true, weight: 5, minLevel: 1, maxLevel: 3 },
                { id: "heavy", name: "Тяжёлый", enabled: true, weight: 3, minLevel: 2, maxLevel: 5 },
                { id: "fast", name: "Быстрый", enabled: true, weight: 4, minLevel: 1, maxLevel: 4 }
            ],
            spawnZones: [],
            spawnPattern: {
                id: "random",
                name: "Случайный",
                type: "random"
            },
            enemyLevels: {
                min: 1,
                max: 5,
                scaling: false
            },
            waveSystem: {
                enabled: false,
                waveSize: 5,
                waveInterval: 60
            },
            worldSettings: {
                seed: undefined,
                mapSize: undefined
            },
            survivalSettings: {
                timeLimit: 600, // 10 минут
                maxWaves: 20
            },
            captureSettings: {
                capturePoints: 3,
                captureTime: 30
            },
            raidSettings: {
                objectiveCount: 5,
                difficulty: 5
            }
        };
    }
    
    private createUI(): void {
        this.container = document.createElement("div");
        this.container.id = "session-settings";
        this.container.className = "panel-overlay";
        
        const style = document.createElement("style");
        style.textContent = `
            #session-settings {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(600px, 90vw);
                max-height: min(800px, 90vh);
                background: rgba(0, 10, 0, 0.95);
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 8px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                z-index: 10001;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #session-settings.hidden { display: none; }
            .session-header {
                background: linear-gradient(180deg, rgba(0, 20, 0, 0.9) 0%, rgba(0, 10, 0, 0.95) 100%);
                padding: 12px 16px;
                border-bottom: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .session-title {
                color: #0ff;
                font-size: 16px;
                font-weight: bold;
                text-shadow: 0 0 4px rgba(0, 255, 255, 0.6);
            }
            .session-close {
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                color: #0ff;
                width: 28px;
                height: 28px;
                cursor: pointer;
                border-radius: 4px;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
            }
            .session-close:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.1);
            }
            .session-content {
                padding: 16px;
                overflow-y: auto;
                flex: 1;
            }
            .session-section {
                margin-bottom: 20px;
            }
            .session-section-title {
                color: #ff0;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 10px;
                border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                padding-bottom: 5px;
            }
            .session-control {
                margin-bottom: 12px;
            }
            .session-label {
                color: #aaa;
                font-size: 12px;
                margin-bottom: 5px;
                display: block;
            }
            .session-input {
                width: 100%;
                padding: 6px 8px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.4);
                border-radius: 4px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 12px;
            }
            .session-input:focus {
                outline: none;
                border-color: #0ff;
                box-shadow: 0 0 8px rgba(0, 255, 255, 0.3);
            }
            .session-slider {
                width: 100%;
                height: 6px;
                background: rgba(0, 10, 0, 0.5);
                border-radius: 3px;
                outline: none;
                -webkit-appearance: none;
            }
            .session-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                background: #0f0;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 0 4px rgba(0, 255, 0, 0.6);
            }
            .session-slider::-moz-range-thumb {
                width: 16px;
                height: 16px;
                background: #0f0;
                border-radius: 50%;
                cursor: pointer;
                border: none;
                box-shadow: 0 0 4px rgba(0, 255, 0, 0.6);
            }
            .session-value {
                color: #0f0;
                font-weight: bold;
                margin-left: 10px;
            }
            .session-select {
                width: 100%;
                padding: 6px 8px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.4);
                border-radius: 4px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 12px;
                cursor: pointer;
            }
            .session-checkbox {
                width: 18px;
                height: 18px;
                cursor: pointer;
                accent-color: #0f0;
            }
            .session-buttons {
                display: flex;
                gap: 10px;
                padding: 16px;
                border-top: 2px solid rgba(0, 255, 4, 0.4);
            }
            .session-btn {
                flex: 1;
                padding: 10px;
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                border-radius: 4px;
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .session-btn:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.05);
            }
            .session-btn.primary {
                background: rgba(0, 255, 4, 0.3);
            }
        `;
        document.head.appendChild(style);
        
        this.container.innerHTML = `
            <div class="session-header">
                <div class="session-title">НАСТРОЙКИ СЕССИИ [F6]</div>
                <button class="session-close" id="session-close">✕</button>
            </div>
            <div class="session-content">
                <div class="session-section">
                    <div class="session-section-title">ВРАГИ</div>
                    <div class="session-control">
                        <label class="session-label">Количество врагов: <span class="session-value" id="enemy-count-value">${this.settings.enemyCount}</span></label>
                        <input type="range" class="session-slider" id="enemy-count" min="0" max="50" value="${this.settings.enemyCount}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Интервал спавна (сек): <span class="session-value" id="spawn-interval-value">${this.settings.spawnInterval}</span></label>
                        <input type="range" class="session-slider" id="spawn-interval" min="1" max="60" value="${this.settings.spawnInterval}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Мин. уровень врагов: <span class="session-value" id="enemy-level-min-value">${this.settings.enemyLevels.min}</span></label>
                        <input type="range" class="session-slider" id="enemy-level-min" min="1" max="10" value="${this.settings.enemyLevels.min}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Макс. уровень врагов: <span class="session-value" id="enemy-level-max-value">${this.settings.enemyLevels.max}</span></label>
                        <input type="range" class="session-slider" id="enemy-level-max" min="1" max="10" value="${this.settings.enemyLevels.max}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">
                            <input type="checkbox" class="session-checkbox" id="enemy-level-scaling" ${this.settings.enemyLevels.scaling ? 'checked' : ''}>
                            Масштабирование уровней по времени
                        </label>
                    </div>
                    <div class="session-control">
                        <label class="session-label">Паттерн спавна:</label>
                        <select class="session-select" id="spawn-pattern">
                            <option value="random" ${this.settings.spawnPattern.type === 'random' ? 'selected' : ''}>Случайный</option>
                            <option value="circle" ${this.settings.spawnPattern.type === 'circle' ? 'selected' : ''}>По кругу</option>
                            <option value="line" ${this.settings.spawnPattern.type === 'line' ? 'selected' : ''}>По линии</option>
                            <option value="grid" ${this.settings.spawnPattern.type === 'grid' ? 'selected' : ''}>Сетка</option>
                        </select>
                    </div>
                </div>
                <div class="session-section">
                    <div class="session-section-title">ТИПЫ ВРАГОВ</div>
                    <div id="enemy-types-list"></div>
                    <div class="session-control">
                        <label class="session-label">Сложность AI:</label>
                        <select class="session-select" id="ai-difficulty">
                            <option value="easy" ${this.settings.aiDifficulty === "easy" ? "selected" : ""}>Легкая</option>
                            <option value="medium" ${this.settings.aiDifficulty === "medium" ? "selected" : ""}>Средняя</option>
                            <option value="hard" ${this.settings.aiDifficulty === "hard" ? "selected" : ""}>Тяжелая</option>
                        </select>
                    </div>
                </div>
                
                <div class="session-section">
                    <div class="session-section-title">СИСТЕМА ВОЛН</div>
                    <div class="session-control">
                        <label class="session-label">
                            <input type="checkbox" class="session-checkbox" id="wave-enabled" ${this.settings.waveSystem.enabled ? "checked" : ""}>
                            Включить систему волн
                        </label>
                    </div>
                    <div class="session-control">
                        <button class="session-btn" id="wave-editor-open" style="width: 100%; margin-top: 8px;">📝 Открыть редактор волн</button>
                    </div>
                    <div class="session-control" id="wave-controls" style="display: ${this.settings.waveSystem.enabled ? "block" : "none"}">
                        <label class="session-label">Размер волны: <span class="session-value" id="wave-size-value">${this.settings.waveSystem.waveSize}</span></label>
                        <input type="range" class="session-slider" id="wave-size" min="1" max="20" value="${this.settings.waveSystem.waveSize}">
                    </div>
                    <div class="session-control" id="wave-interval-controls" style="display: ${this.settings.waveSystem.enabled ? "block" : "none"}">
                        <label class="session-label">Интервал волн (сек): <span class="session-value" id="wave-interval-value">${this.settings.waveSystem.waveInterval}</span></label>
                        <input type="range" class="session-slider" id="wave-interval" min="10" max="300" value="${this.settings.waveSystem.waveInterval}">
                    </div>
                </div>
                
                <div class="session-section">
                    <div class="session-section-title">МИР</div>
                    <div class="session-control">
                        <label class="session-label">Seed (опционально):</label>
                        <input type="number" class="session-input" id="world-seed" placeholder="Автоматически" value="${this.settings.worldSettings.seed || ""}">
                    </div>
                </div>
            </div>
            <div class="session-buttons">
                <button class="session-btn" id="session-reset">Сброс</button>
                <button class="session-btn primary" id="session-apply">Применить</button>
            </div>
        `;
        
        document.body.appendChild(this.container);
        this.setupEventListeners();
    }
    
    private setupEventListeners(): void {
        // Enemy count slider
        const enemyCountSlider = document.getElementById("enemy-count") as HTMLInputElement;
        const enemyCountValue = document.getElementById("enemy-count-value");
        enemyCountSlider?.addEventListener("input", (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.settings.enemyCount = value;
            if (enemyCountValue) enemyCountValue.textContent = value.toString();
        });
        
        // Spawn interval slider
        const spawnIntervalSlider = document.getElementById("spawn-interval") as HTMLInputElement;
        const spawnIntervalValue = document.getElementById("spawn-interval-value");
        spawnIntervalSlider?.addEventListener("input", (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.settings.spawnInterval = value;
            if (spawnIntervalValue) spawnIntervalValue.textContent = value.toString();
        });
        
        // AI difficulty
        const aiDifficultySelect = document.getElementById("ai-difficulty") as HTMLSelectElement;
        aiDifficultySelect?.addEventListener("change", (e) => {
            this.settings.aiDifficulty = (e.target as HTMLSelectElement).value as "easy" | "medium" | "hard";
        });
        
        // Wave system
        const waveEnabledCheckbox = document.getElementById("wave-enabled") as HTMLInputElement;
        const waveControls = document.getElementById("wave-controls");
        const waveIntervalControls = document.getElementById("wave-interval-controls");
        waveEnabledCheckbox?.addEventListener("change", (e) => {
            this.settings.waveSystem.enabled = (e.target as HTMLInputElement).checked;
            if (waveControls) waveControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";
            if (waveIntervalControls) waveIntervalControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";
        });
        
        const waveSizeSlider = document.getElementById("wave-size") as HTMLInputElement;
        const waveSizeValue = document.getElementById("wave-size-value");
        waveSizeSlider?.addEventListener("input", (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.settings.waveSystem.waveSize = value;
            if (waveSizeValue) waveSizeValue.textContent = value.toString();
        });
        
        const waveIntervalSlider = document.getElementById("wave-interval") as HTMLInputElement;
        const waveIntervalValue = document.getElementById("wave-interval-value");
        waveIntervalSlider?.addEventListener("input", (e) => {
            const value = parseInt((e.target as HTMLInputElement).value);
            this.settings.waveSystem.waveInterval = value;
            if (waveIntervalValue) waveIntervalValue.textContent = value.toString();
        });
        
        // World seed
        const worldSeedInput = document.getElementById("world-seed") as HTMLInputElement;
        worldSeedInput?.addEventListener("change", (e) => {
            const value = (e.target as HTMLInputElement).value;
            this.settings.worldSettings.seed = value ? parseInt(value) : undefined;
        });
        
        // Редактор волн
        document.getElementById("wave-editor-open")?.addEventListener("click", () => {
            if (this.waveEditor) {
                this.waveEditor.show();
            }
        });
        
        // Buttons
        document.getElementById("session-reset")?.addEventListener("click", () => {
            this.settings = this.getDefaultSettings();
            this.updateUI();
        });
        
        document.getElementById("session-apply")?.addEventListener("click", () => {
            this.applySettings();
        });
        
        document.getElementById("session-close")?.addEventListener("click", () => {
            this.hide();
        });
        
        // Close on background click
        this.container.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
    }
    
    private updateUI(): void {
        // Обновляем все значения в UI
        const enemyCountSlider = document.getElementById("enemy-count") as HTMLInputElement;
        const enemyCountValue = document.getElementById("enemy-count-value");
        if (enemyCountSlider) enemyCountSlider.value = this.settings.enemyCount.toString();
        if (enemyCountValue) enemyCountValue.textContent = this.settings.enemyCount.toString();
        
        const spawnIntervalSlider = document.getElementById("spawn-interval") as HTMLInputElement;
        const spawnIntervalValue = document.getElementById("spawn-interval-value");
        if (spawnIntervalSlider) spawnIntervalSlider.value = this.settings.spawnInterval.toString();
        if (spawnIntervalValue) spawnIntervalValue.textContent = this.settings.spawnInterval.toString();
        
        const aiDifficultySelect = document.getElementById("ai-difficulty") as HTMLSelectElement;
        if (aiDifficultySelect) aiDifficultySelect.value = this.settings.aiDifficulty;
        
        const waveEnabledCheckbox = document.getElementById("wave-enabled") as HTMLInputElement;
        const waveControls = document.getElementById("wave-controls");
        const waveIntervalControls = document.getElementById("wave-interval-controls");
        if (waveEnabledCheckbox) waveEnabledCheckbox.checked = this.settings.waveSystem.enabled;
        if (waveControls) waveControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";
        if (waveIntervalControls) waveIntervalControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";
        
        const waveSizeSlider = document.getElementById("wave-size") as HTMLInputElement;
        const waveSizeValue = document.getElementById("wave-size-value");
        if (waveSizeSlider) waveSizeSlider.value = this.settings.waveSystem.waveSize.toString();
        if (waveSizeValue) waveSizeValue.textContent = this.settings.waveSystem.waveSize.toString();
        
        const waveIntervalSlider = document.getElementById("wave-interval") as HTMLInputElement;
        const waveIntervalValue = document.getElementById("wave-interval-value");
        if (waveIntervalSlider) waveIntervalSlider.value = this.settings.waveSystem.waveInterval.toString();
        if (waveIntervalValue) waveIntervalValue.textContent = this.settings.waveSystem.waveInterval.toString();
        
        const worldSeedInput = document.getElementById("world-seed") as HTMLInputElement;
        if (worldSeedInput) worldSeedInput.value = this.settings.worldSettings.seed?.toString() || "";
    }
    
    private applySettings(): void {
        if (this.game) {
            // Сохраняем настройки в game
            (this.game as any).sessionSettings = this.settings;
            
            // Применяем настройки к спавну врагов
            logger.log("[SessionSettings] Applied settings:", this.settings);
            
            if (this.game.hud) {
                this.game.hud.showMessage("Настройки сессии применены!", "#0f0", 2000);
            }
        }
        
        this.hide();
    }
    
    private setupToggle(): void {
        window.addEventListener("keydown", (e) => {
            if (e.code === "F6") {
                e.preventDefault();
                e.stopPropagation();
                this.toggle();
            }
        });
    }
    
    toggle(): void {
        this.visible = !this.visible;
        if (this.visible) {
            this.show();
        } else {
            this.hide();
        }
    }
    
    show(): void {
        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "flex";
        this.updateUI();
    }
    
    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    isVisible(): boolean {
        return this.visible;
    }
    
    dispose(): void {
        this.container.remove();
    }
}



