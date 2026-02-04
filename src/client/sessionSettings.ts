/**
 * Session Settings - Меню настроек игровой сессии
 */

import { Game } from "./game";
import { logger } from "./utils/logger";
import { WorldManager } from "./worldManager";
import { WaveEditor } from "./waveEditor";
import { CommonStyles } from "./commonStyles";
import { inGameAlert } from "./utils/inGameDialogs";

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

export interface AIBotsSettings {
    /** Включить глобальный общий интеллект для всех ботов (shared intelligence) */
    globalIntelligenceEnabled: boolean;
    /** Базовое значение global intelligence (старт) */
    globalIntelligenceBase: number;
    /** Максимальное значение global intelligence (потолок) */
    globalIntelligenceMax: number;
    /** Интервал роста global intelligence (мс) */
    globalIntelligenceGrowthIntervalMs: number;
    /** Шаг роста global intelligence */
    globalIntelligenceGrowthAmount: number;
}

export interface SessionSettingsData {
    gameMode: GameMode;            // Режим игры
    enemyCount: number;           // 0-50
    spawnInterval: number;         // 1-60 секунд
    aiDifficulty: "easy" | "medium" | "hard" | "nightmare";
    aiBots: AIBotsSettings;
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
    private container!: HTMLDivElement;
    private visible: boolean = false;
    private settings: SessionSettingsData;
    private game: Game | null = null;
    private worldManager: WorldManager | null = null;
    private waveEditor: WaveEditor | null = null;
    private embedded: boolean = false;

    // ОПТИМИЗАЦИЯ: AbortController для управления слушателями событий
    private abortController: AbortController = new AbortController();

    private static readonly STORAGE_KEY = "tx:sessionSettings";

    constructor(embedded: boolean = false) {
        this.settings = this.getDefaultSettings();
        // ИСПРАВЛЕНО: Загружаем сохранённые настройки (localStorage)
        this.loadSettingsFromStorage();
        this.embedded = embedded;

        // Не создаём overlay UI если панель будет встроена в другое меню
        if (!embedded) {
            this.createUI();
            this.setupToggle();
            this.visible = false;
            this.container.classList.add("hidden");
            this.container.style.display = "none";
        }
    }

    setGame(game: Game | null): void {
        this.game = game;
        if (game && game.scene) {
            this.worldManager = new WorldManager(game.scene);
            // Чтение нужно, чтобы worldManager не считался неиспользуемым и оставался готовым для будущих расширений
            if (this.worldManager) {
                // no-op
            }
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
            aiDifficulty: "nightmare",
            aiBots: {
                globalIntelligenceEnabled: false,
                globalIntelligenceBase: 3.0,
                globalIntelligenceMax: 6.0,
                globalIntelligenceGrowthIntervalMs: 2000,
                globalIntelligenceGrowthAmount: 0.7
            },
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

    private clamp(n: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, n));
    }

    private loadSettingsFromStorage(): void {
        try {
            const raw = localStorage.getItem(SessionSettings.STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<SessionSettingsData> | null;
            if (!parsed || typeof parsed !== "object") return;

            const defaults = this.getDefaultSettings();
            const merged: SessionSettingsData = {
                ...defaults,
                ...parsed,
                // глубокие блоки
                enemyLevels: { ...defaults.enemyLevels, ...(parsed as any).enemyLevels },
                waveSystem: { ...defaults.waveSystem, ...(parsed as any).waveSystem },
                worldSettings: { ...defaults.worldSettings, ...(parsed as any).worldSettings },
                spawnPattern: { ...defaults.spawnPattern, ...(parsed as any).spawnPattern },
                aiBots: { ...defaults.aiBots, ...(parsed as any).aiBots }
            };

            // валидация/клампы
            merged.enemyCount = this.clamp(Number(merged.enemyCount) || defaults.enemyCount, 0, 50);
            merged.spawnInterval = this.clamp(Number(merged.spawnInterval) || defaults.spawnInterval, 1, 60);

            const diff = merged.aiDifficulty;
            if (diff !== "easy" && diff !== "medium" && diff !== "hard" && diff !== "nightmare") {
                merged.aiDifficulty = defaults.aiDifficulty;
            }

            merged.aiBots.globalIntelligenceEnabled = Boolean(merged.aiBots.globalIntelligenceEnabled);
            merged.aiBots.globalIntelligenceBase = this.clamp(Number(merged.aiBots.globalIntelligenceBase) || defaults.aiBots.globalIntelligenceBase, 1, 10);
            merged.aiBots.globalIntelligenceMax = this.clamp(Number(merged.aiBots.globalIntelligenceMax) || defaults.aiBots.globalIntelligenceMax, 1, 10);
            if (merged.aiBots.globalIntelligenceMax < merged.aiBots.globalIntelligenceBase) {
                merged.aiBots.globalIntelligenceMax = merged.aiBots.globalIntelligenceBase;
            }
            merged.aiBots.globalIntelligenceGrowthIntervalMs = this.clamp(
                Number(merged.aiBots.globalIntelligenceGrowthIntervalMs) || defaults.aiBots.globalIntelligenceGrowthIntervalMs,
                200,
                10000
            );
            merged.aiBots.globalIntelligenceGrowthAmount = this.clamp(
                Number(merged.aiBots.globalIntelligenceGrowthAmount) || defaults.aiBots.globalIntelligenceGrowthAmount,
                0.05,
                2.0
            );

            this.settings = merged;

            // Обновляем конфигурацию глобального интеллекта после загрузки
            try {
                const { GlobalIntelligenceManager } = require("./ai/GlobalIntelligenceManager");
                const globalIntel = GlobalIntelligenceManager.getInstance();
                globalIntel.setConfig({
                    enabled: merged.aiBots.globalIntelligenceEnabled,
                    base: merged.aiBots.globalIntelligenceBase,
                    max: merged.aiBots.globalIntelligenceMax,
                    growthIntervalMs: merged.aiBots.globalIntelligenceGrowthIntervalMs,
                    growthAmount: merged.aiBots.globalIntelligenceGrowthAmount
                });
            } catch (e) {
                // Игнорируем ошибки при обновлении конфигурации
            }
        } catch (e) {
            // ignore
        }
    }

    private saveSettingsToStorage(): void {
        try {
            localStorage.setItem(SessionSettings.STORAGE_KEY, JSON.stringify(this.settings));
        } catch (e) {
            // ignore
        }
    }

    private createUI(): void {
        // Проверяем, что мы не в embedded режиме
        if (this.embedded) {
            console.warn("[SessionSettings] createUI called in embedded mode, skipping overlay creation");
            return;
        }

        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();

        // Проверяем, не существует ли уже контейнер
        const existingContainer = document.getElementById("session-settings");
        if (existingContainer) {
            existingContainer.remove();
        }

        this.container = document.createElement("div");
        this.container.id = "session-settings";
        this.container.className = "panel-overlay";

        const style = document.createElement("style");
        style.id = "session-settings-styles";
        style.textContent = `
            #session-settings .panel {
                width: min(600px, 90vw);
                max-height: min(800px, 90vh);
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
                font-family: 'Press Start 2P', monospace;
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
            }
            /* ИСПРАВЛЕНИЕ: Стили для встроенного редактора волн */
            #wave-editor-embedded {
                margin-top: 16px;
                padding: 12px;
                background: rgba(0, 20, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
            }
            #wave-editor-embedded .wave-item {
                padding: 8px;
                margin-bottom: 6px;
                background: rgba(0, 20, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            #wave-editor-embedded .wave-item:hover {
                background: rgba(0, 30, 0, 0.5);
                border-color: rgba(0, 255, 4, 0.6);
            }
            #wave-editor-embedded .wave-item.active {
                background: rgba(0, 255, 4, 0.2);
                border-color: rgba(0, 255, 4, 0.8);
            }
            #wave-list-items-embedded {
                max-height: 400px;
                overflow-y: auto;
            }
            #wave-list-items-embedded::-webkit-scrollbar {
                width: 6px;
            }
            #wave-list-items-embedded::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }
            #wave-list-items-embedded::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 3px;
            }
            #wave-details-embedded {
                max-height: 400px;
                overflow-y: auto;
            }
            #wave-details-embedded::-webkit-scrollbar {
                width: 6px;
            }
            #wave-details-embedded::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }
            #wave-details-embedded::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 3px;
            }
            #wave-editor-embedded .wave-label {
                color: #aaa;
                font-size: 11px;
                margin-bottom: 4px;
                display: block;
            }
            #wave-editor-embedded .wave-input {
                width: 100%;
                padding: 4px 6px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.4);
                border-radius: 4px;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 11px;
            }
            #wave-editor-embedded .enemy-item {
                padding: 6px;
                margin-bottom: 6px;
                background: rgba(0, 15, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.2);
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #wave-editor-embedded .wave-control {
                margin-bottom: 10px;
            }
            #wave-editor-embedded .enemy-list {
                margin-top: 12px;
            }
            /* Адаптивность для встроенного редактора */
            @media (max-width: 768px) {
                #wave-editor-embedded > div:last-child {
                    flex-direction: column;
                }
                #wave-editor-embedded > div:last-child > div:first-child {
                    max-width: 100%;
                    max-height: 200px;
                }
                #wave-editor-embedded > div:last-child > div:last-child {
                    max-height: 300px;
                    padding-left: 0;
                    border-left: none;
                    border-top: 1px solid rgba(0, 255, 4, 0.2);
                    padding-top: 12px;
                    margin-top: 12px;
                }
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
                font-family: 'Press Start 2P', monospace;
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
        `;
        document.head.appendChild(style);

        this.container.innerHTML = `
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-title">НАСТРОЙКИ СЕССИИ [Ctrl+6]</div>
                    <button class="panel-close" id="session-close">×</button>
                </div>
                <div class="panel-content">
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
                            <option value="nightmare" ${this.settings.aiDifficulty === "nightmare" ? "selected" : ""} style="background: #8b0000; color: #fff; font-weight: bold;">КОШМАР</option>
                        </select>
                    </div>
                </div>

                <div class="session-section">
                    <div class="session-section-title">AI BOTS (ADVANCED)</div>
                    <div class="session-control">
                        <label class="session-label">
                            <input type="checkbox" class="session-checkbox" id="ai-global-intel-enabled" ${this.settings.aiBots.globalIntelligenceEnabled ? "checked" : ""}>
                            Глобальный общий интеллект (shared intelligence) на всю сессию
                        </label>
                        <div style="color:#888; font-size:11px; margin-top:6px;">
                            Если включено — все боты используют один общий уровень интеллекта, который растёт во время боя.
                        </div>
                    </div>
                    <div class="session-control">
                        <label class="session-label">База: <span class="session-value" id="ai-global-intel-base-value">${this.settings.aiBots.globalIntelligenceBase.toFixed(1)}</span></label>
                        <input type="range" class="session-slider" id="ai-global-intel-base" min="1" max="10" step="0.1" value="${this.settings.aiBots.globalIntelligenceBase}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Максимум: <span class="session-value" id="ai-global-intel-max-value">${this.settings.aiBots.globalIntelligenceMax.toFixed(1)}</span></label>
                        <input type="range" class="session-slider" id="ai-global-intel-max" min="1" max="10" step="0.1" value="${this.settings.aiBots.globalIntelligenceMax}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Интервал роста (мс): <span class="session-value" id="ai-global-intel-interval-value">${this.settings.aiBots.globalIntelligenceGrowthIntervalMs}</span></label>
                        <input type="range" class="session-slider" id="ai-global-intel-interval" min="200" max="10000" step="100" value="${this.settings.aiBots.globalIntelligenceGrowthIntervalMs}">
                    </div>
                    <div class="session-control">
                        <label class="session-label">Шаг роста: <span class="session-value" id="ai-global-intel-amount-value">${this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2)}</span></label>
                        <input type="range" class="session-slider" id="ai-global-intel-amount" min="0.05" max="2.0" step="0.05" value="${this.settings.aiBots.globalIntelligenceGrowthAmount}">
                    </div>
                    <div class="session-control">
                        <button class="panel-btn secondary" id="ai-global-intel-reset">Сбросить глобальный интеллект</button>
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
                    <div class="session-control" id="wave-controls" style="display: ${this.settings.waveSystem.enabled ? "block" : "none"}">
                        <label class="session-label">Размер волны: <span class="session-value" id="wave-size-value">${this.settings.waveSystem.waveSize}</span></label>
                        <input type="range" class="session-slider" id="wave-size" min="1" max="20" value="${this.settings.waveSystem.waveSize}">
                    </div>
                    <div class="session-control" id="wave-interval-controls" style="display: ${this.settings.waveSystem.enabled ? "block" : "none"}">
                        <label class="session-label">Интервал волн (сек): <span class="session-value" id="wave-interval-value">${this.settings.waveSystem.waveInterval}</span></label>
                        <input type="range" class="session-slider" id="wave-interval" min="10" max="300" value="${this.settings.waveSystem.waveInterval}">
                    </div>
                    
                    <!-- ИСПРАВЛЕНИЕ: Встроенный редактор волн прямо в настройки сессии -->
                    <div id="wave-editor-embedded" style="display: ${this.settings.waveSystem.enabled ? "block" : "none"}; margin-top: 16px; padding: 12px; background: rgba(0, 20, 0, 0.3); border: 1px solid rgba(0, 255, 4, 0.3); border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="color: #0ff; font-weight: bold; font-size: 14px;">РЕДАКТОР ВОЛН</div>
                            <div style="display: flex; gap: 8px;">
                                <button class="session-btn" id="wave-add" style="padding: 4px 8px; font-size: 11px;">+ Добавить</button>
                                <button class="session-btn" id="wave-export" style="padding: 4px 8px; font-size: 11px;">Экспорт</button>
                                <button class="session-btn" id="wave-import" style="padding: 4px 8px; font-size: 11px;">Импорт</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px; max-height: 400px; overflow: hidden;">
                            <div style="flex: 1; min-width: 200px; max-width: 300px; overflow-y: auto; max-height: 400px;">
                                <div id="wave-list-items-embedded"></div>
                            </div>
                            <div style="flex: 2; min-width: 300px; overflow-y: auto; max-height: 400px; padding-left: 12px; border-left: 1px solid rgba(0, 255, 4, 0.2);">
                                <div id="wave-details-embedded">
                                    <div style="color: #666; text-align: center; padding: 40px;">Выберите волну для редактирования</div>
                                </div>
                            </div>
                        </div>
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
                    <button class="panel-btn secondary" id="session-reset">Сброс</button>
                    <button class="panel-btn primary" id="session-apply">Применить</button>
                </div>
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
            this.settings.aiDifficulty = (e.target as HTMLSelectElement).value as "easy" | "medium" | "hard" | "nightmare";
        });

        // AI Bots (Advanced)
        const globalIntelEnabled = document.getElementById("ai-global-intel-enabled") as HTMLInputElement | null;
        globalIntelEnabled?.addEventListener("change", (e) => {
            this.settings.aiBots.globalIntelligenceEnabled = (e.target as HTMLInputElement).checked;
        }, { signal: this.abortController.signal });

        const baseSlider = document.getElementById("ai-global-intel-base") as HTMLInputElement | null;
        const baseValue = document.getElementById("ai-global-intel-base-value");
        baseSlider?.addEventListener("input", (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.settings.aiBots.globalIntelligenceBase = value;
            if (this.settings.aiBots.globalIntelligenceMax < value) {
                this.settings.aiBots.globalIntelligenceMax = value;
                const maxSlider = document.getElementById("ai-global-intel-max") as HTMLInputElement | null;
                const maxValue = document.getElementById("ai-global-intel-max-value");
                if (maxSlider) maxSlider.value = value.toFixed(1);
                if (maxValue) maxValue.textContent = value.toFixed(1);
            }
            if (baseValue) baseValue.textContent = value.toFixed(1);
        }, { signal: this.abortController.signal });

        const maxSlider = document.getElementById("ai-global-intel-max") as HTMLInputElement | null;
        const maxValue = document.getElementById("ai-global-intel-max-value");
        maxSlider?.addEventListener("input", (e) => {
            let value = parseFloat((e.target as HTMLInputElement).value);
            if (value < this.settings.aiBots.globalIntelligenceBase) {
                value = this.settings.aiBots.globalIntelligenceBase;
                (e.target as HTMLInputElement).value = value.toFixed(1);
            }
            this.settings.aiBots.globalIntelligenceMax = value;
            if (maxValue) maxValue.textContent = value.toFixed(1);
        }, { signal: this.abortController.signal });

        const intervalSlider = document.getElementById("ai-global-intel-interval") as HTMLInputElement | null;
        const intervalValue = document.getElementById("ai-global-intel-interval-value");
        intervalSlider?.addEventListener("input", (e) => {
            const value = parseInt((e.target as HTMLInputElement).value, 10);
            this.settings.aiBots.globalIntelligenceGrowthIntervalMs = value;
            if (intervalValue) intervalValue.textContent = value.toString();
        }, { signal: this.abortController.signal });

        const amountSlider = document.getElementById("ai-global-intel-amount") as HTMLInputElement | null;
        const amountValue = document.getElementById("ai-global-intel-amount-value");
        amountSlider?.addEventListener("input", (e) => {
            const value = parseFloat((e.target as HTMLInputElement).value);
            this.settings.aiBots.globalIntelligenceGrowthAmount = value;
            if (amountValue) amountValue.textContent = value.toFixed(2);
        }, { signal: this.abortController.signal });

        document.getElementById("ai-global-intel-reset")?.addEventListener("click", () => {
            try {
                const { GlobalIntelligenceManager } = require("./ai/GlobalIntelligenceManager");
                const globalIntel = GlobalIntelligenceManager.getInstance();
                globalIntel.reset();
                if (this.game?.hud) {
                    this.game.hud.showMessage("Глобальный интеллект сброшен", "#ff0", 2000);
                }
            } catch (e) {
                logger.warn("[SessionSettings] Failed to reset global intelligence:", e);
            }
        }, { signal: this.abortController.signal });

        // Wave system - ИСПРАВЛЕНИЕ: Объединенный обработчик
        const waveEnabledCheckbox = document.getElementById("wave-enabled") as HTMLInputElement;
        const waveControls = document.getElementById("wave-controls");
        const waveIntervalControls = document.getElementById("wave-interval-controls");
        const waveEditorContainer = document.getElementById("wave-editor-embedded");

        waveEnabledCheckbox?.addEventListener("change", (e) => {
            this.settings.waveSystem.enabled = (e.target as HTMLInputElement).checked;
            if (waveControls) waveControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";
            if (waveIntervalControls) waveIntervalControls.style.display = this.settings.waveSystem.enabled ? "block" : "none";

            // ИСПРАВЛЕНИЕ: Показываем/скрываем встроенный редактор волн
            if (waveEditorContainer) {
                waveEditorContainer.style.display = this.settings.waveSystem.enabled ? "block" : "none";
            }
            if (this.settings.waveSystem.enabled && this.waveEditor) {
                this.waveEditor.renderEmbeddedEditor();
            }
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

        // Обработчики для встроенного редактора волн
        this.setupEmbeddedWaveEditor();

        // Buttons
        document.getElementById("session-reset")?.addEventListener("click", () => {
            this.settings = this.getDefaultSettings();
            this.saveSettingsToStorage();
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

    /**
     * Настройка обработчиков для встроенного редактора волн
     */
    private setupEmbeddedWaveEditor(): void {
        if (!this.waveEditor) return;

        // Добавление волны
        const addBtn = document.getElementById("wave-add");
        if (addBtn) {
            addBtn.addEventListener("click", () => {
                const newWave = {
                    id: `wave_${Date.now()}`,
                    name: `Волна ${this.waveEditor!.getWaves().length + 1}`,
                    delay: 0,
                    enemies: [],
                    spawnPattern: "random" as const,
                    completed: false
                };
                (this.waveEditor as any).waves.push(newWave);
                (this.waveEditor as any).currentWave = newWave;
                (this.waveEditor as any).saveWaves();
                if (this.waveEditor) {
                    this.waveEditor.renderEmbeddedEditor();
                }
            });
        }

        // Экспорт волн
        const exportBtn = document.getElementById("wave-export");
        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                const data = this.waveEditor!.exportWaves();
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `waves_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        // Импорт волн
        const importBtn = document.getElementById("wave-import");
        if (importBtn) {
            importBtn.addEventListener("click", () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const data = event.target?.result as string;
                            this.waveEditor!.importWaves(data);
                            this.waveEditor!.renderEmbeddedEditor();
                            inGameAlert(`Импортировано ${this.waveEditor!.getWaves().length} волн`, "Импорт").catch(() => {});
                        } catch (error) {
                            inGameAlert('Ошибка импорта: ' + error, "Ошибка").catch(() => {});
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });
        }

        // Обработчики для редактирования волн (делегирование событий)
        const waveEditorContainer = document.getElementById("wave-editor-embedded");
        if (waveEditorContainer) {
            // Обновление названия, задержки, паттерна
            waveEditorContainer.addEventListener("input", (e) => {
                const target = e.target as HTMLElement;
                const waveEditor = this.waveEditor as any;
                if (!waveEditor.currentWave) return;

                if (target.id === "wave-name") {
                    waveEditor.currentWave.name = (target as HTMLInputElement).value;
                } else if (target.id === "wave-delay") {
                    waveEditor.currentWave.delay = parseFloat((target as HTMLInputElement).value) || 0;
                } else if (target.id === "wave-pattern") {
                    waveEditor.currentWave.spawnPattern = (target as HTMLSelectElement).value;
                }

                waveEditor.saveWaves();
                this.waveEditor!.renderEmbeddedEditor();
            });

            // Добавление/удаление врагов
            waveEditorContainer.addEventListener("click", (e) => {
                const target = e.target as HTMLElement;
                const waveEditor = this.waveEditor as any;
                if (!waveEditor.currentWave) return;

                if (target.id === "enemy-add") {
                    const newEnemy = {
                        type: "basic",
                        count: 1,
                        level: 1,
                        delay: 0
                    };
                    waveEditor.currentWave.enemies.push(newEnemy);
                    waveEditor.saveWaves();
                    this.waveEditor!.renderEmbeddedEditor();
                } else if (target.id?.startsWith("enemy-delete-")) {
                    const index = parseInt(target.id.replace("enemy-delete-", ""));
                    if (!isNaN(index) && waveEditor.currentWave.enemies[index]) {
                        waveEditor.currentWave.enemies.splice(index, 1);
                        waveEditor.saveWaves();
                        this.waveEditor!.renderEmbeddedEditor();
                    }
                }
            });

            // Изменение параметров врагов
            waveEditorContainer.addEventListener("change", (e) => {
                const target = e.target as HTMLElement;
                const waveEditor = this.waveEditor as any;
                if (!waveEditor.currentWave) return;

                const match = target.id?.match(/^enemy-(\d+)-(type|count|level|delay)$/);
                if (match) {
                    const index = parseInt(match[1]!, 10);
                    const field = match[2];
                    const enemy = waveEditor.currentWave.enemies[index];
                    if (enemy) {
                        if (field === "type") {
                            enemy.type = (target as HTMLSelectElement).value;
                        } else if (field === "count") {
                            enemy.count = parseInt((target as HTMLInputElement).value) || 1;
                        } else if (field === "level") {
                            enemy.level = parseInt((target as HTMLInputElement).value) || 1;
                        } else if (field === "delay") {
                            enemy.delay = parseFloat((target as HTMLInputElement).value) || 0;
                        }
                        waveEditor.saveWaves();
                        this.waveEditor!.renderEmbeddedEditor();
                    }
                }
            });
        }

        // Первоначальная отрисовка редактора
        if (this.settings.waveSystem.enabled && this.waveEditor) {
            this.waveEditor.renderEmbeddedEditor();
        }
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

        // AI Bots (Advanced)
        const globalIntelEnabled = document.getElementById("ai-global-intel-enabled") as HTMLInputElement | null;
        if (globalIntelEnabled) globalIntelEnabled.checked = this.settings.aiBots.globalIntelligenceEnabled;

        const baseSlider = document.getElementById("ai-global-intel-base") as HTMLInputElement | null;
        const baseValue = document.getElementById("ai-global-intel-base-value");
        if (baseSlider) baseSlider.value = this.settings.aiBots.globalIntelligenceBase.toFixed(1);
        if (baseValue) baseValue.textContent = this.settings.aiBots.globalIntelligenceBase.toFixed(1);

        const maxSlider = document.getElementById("ai-global-intel-max") as HTMLInputElement | null;
        const maxValue = document.getElementById("ai-global-intel-max-value");
        if (maxSlider) maxSlider.value = this.settings.aiBots.globalIntelligenceMax.toFixed(1);
        if (maxValue) maxValue.textContent = this.settings.aiBots.globalIntelligenceMax.toFixed(1);

        const intervalSlider = document.getElementById("ai-global-intel-interval") as HTMLInputElement | null;
        const intervalValue = document.getElementById("ai-global-intel-interval-value");
        if (intervalSlider) intervalSlider.value = String(this.settings.aiBots.globalIntelligenceGrowthIntervalMs);
        if (intervalValue) intervalValue.textContent = String(this.settings.aiBots.globalIntelligenceGrowthIntervalMs);

        const amountSlider = document.getElementById("ai-global-intel-amount") as HTMLInputElement | null;
        const amountValue = document.getElementById("ai-global-intel-amount-value");
        if (amountSlider) amountSlider.value = this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2);
        if (amountValue) amountValue.textContent = this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2);

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

        // ИСПРАВЛЕНИЕ: Обновляем встроенный редактор волн
        const waveEditorContainer = document.getElementById("wave-editor-embedded");
        if (waveEditorContainer) {
            waveEditorContainer.style.display = this.settings.waveSystem.enabled ? "block" : "none";
        }
        if (this.settings.waveSystem.enabled && this.waveEditor) {
            this.waveEditor.renderEmbeddedEditor();
        }

        const worldSeedInput = document.getElementById("world-seed") as HTMLInputElement;
        if (worldSeedInput) worldSeedInput.value = this.settings.worldSettings.seed?.toString() || "";
    }

    private applySettings(): void {
        if (this.game) {
            // Сохраняем настройки в game
            (this.game as any).sessionSettings = this.settings;
            this.saveSettingsToStorage();

            // Применяем настройки к спавну врагов
            logger.log("[SessionSettings] Applied settings:", this.settings);

            // Обновляем конфигурацию глобального интеллекта ботов
            try {
                const { GlobalIntelligenceManager } = require("./ai/GlobalIntelligenceManager");
                const globalIntel = GlobalIntelligenceManager.getInstance();
                globalIntel.setConfig({
                    enabled: this.settings.aiBots.globalIntelligenceEnabled,
                    base: this.settings.aiBots.globalIntelligenceBase,
                    max: this.settings.aiBots.globalIntelligenceMax,
                    growthIntervalMs: this.settings.aiBots.globalIntelligenceGrowthIntervalMs,
                    growthAmount: this.settings.aiBots.globalIntelligenceGrowthAmount
                });
                logger.log("[SessionSettings] Global intelligence config updated");
            } catch (e) {
                logger.warn("[SessionSettings] Failed to update global intelligence:", e);
            }

            if (this.game.hud) {
                this.game.hud.showMessage("Настройки сессии применены!", "#0f0", 2000);
            }
        }

        // В embedded режиме (админ меню) мы НЕ скрываем панель
        if (!this.embedded) {
            this.hide();
        }
    }

    private setupToggle(): void {
        // F6 обработчик управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
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
        if (!this.container) return;

        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "flex";

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';

        this.updateUI();

        // ИСПРАВЛЕНИЕ: Обновляем встроенный редактор волн при показе настроек сессии
        if (this.settings.waveSystem.enabled && this.waveEditor) {
            // Небольшая задержка, чтобы DOM успел обновиться
            setTimeout(() => {
                this.waveEditor!.renderEmbeddedEditor();
            }, 50);
        }
    }

    hide(): void {
        if (!this.container) return;

        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }

    isVisible(): boolean {
        return this.visible;
    }

    dispose(): void {
        // ОПТИМИЗАЦИЯ: Очищаем все слушатели событий
        this.abortController.abort();
        this.abortController = new AbortController();

        this.container.remove();
    }

    /**
     * Рендерит контент меню в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        // Убеждаемся, что мы в embedded режиме
        if (!this.embedded) {
            console.warn("[SessionSettings] renderToContainer called but not in embedded mode");
        }

        // Удаляем любой существующий overlay контейнер, если он был создан
        if (this.container && this.container.parentNode) {
            // Проверяем, что это не тот же контейнер, куда мы рендерим
            if (this.container !== container && this.container.classList.contains("panel-overlay")) {
                // Удаляем overlay только если он не используется
                const existingOverlay = document.getElementById("session-settings");
                if (existingOverlay && existingOverlay !== container) {
                    existingOverlay.remove();
                }
            }
        }

        // Очищаем контейнер и добавляем embedded контент
        container.innerHTML = this.getEmbeddedContentHTML();

        // Убеждаемся, что контейнер не имеет overlay стилей
        container.classList.remove("panel-overlay");
        container.style.position = "";
        container.style.top = "";
        container.style.left = "";
        container.style.right = "";
        container.style.bottom = "";
        container.style.zIndex = "";
        container.style.display = "";

        this.setupEmbeddedEventListeners(container);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
        return `
            <div class="session-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    🎮 Настройки сессии
                </h3>
                
                <div class="session-section-emb">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        ВРАГИ
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 5px;">
                            Количество врагов: <span class="ss-enemy-count-val" style="color: #0f0; font-weight: bold;">${this.settings.enemyCount}</span>
                        </label>
                        <input type="range" class="ss-enemy-count-emb" min="0" max="50" value="${this.settings.enemyCount}" style="width: 100%;">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 5px;">
                            Интервал спавна (сек): <span class="ss-spawn-interval-val" style="color: #0f0; font-weight: bold;">${this.settings.spawnInterval}</span>
                        </label>
                        <input type="range" class="ss-spawn-interval-emb" min="1" max="60" value="${this.settings.spawnInterval}" style="width: 100%;">
                    </div>
                </div>
                
                <div class="session-section-emb">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        СЛОЖНОСТЬ AI
                    </div>
                    <div style="margin-bottom: 12px;">
                        <select class="ss-difficulty-emb" style="
                            width: 100%; padding: 6px 8px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px; color: #0f0;
                            font-family: 'Press Start 2P', monospace;
                        ">
                            <option value="easy" ${this.settings.aiDifficulty === 'easy' ? 'selected' : ''}>Лёгкая</option>
                            <option value="medium" ${this.settings.aiDifficulty === 'medium' ? 'selected' : ''}>Средняя</option>
                            <option value="hard" ${this.settings.aiDifficulty === 'hard' ? 'selected' : ''}>Сложная</option>
                            <option value="nightmare" ${this.settings.aiDifficulty === 'nightmare' ? 'selected' : ''} style="background: #8b0000; color: #fff; font-weight: bold;">КОШМАР</option>
                        </select>
                    </div>
                </div>

                <div class="session-section-emb">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        AI BOTS (ADVANCED)
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="color: #aaa; font-size: 11px; display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" class="ss-global-intel-enabled" ${this.settings.aiBots.globalIntelligenceEnabled ? "checked" : ""}>
                            Глобальный общий интеллект
                        </label>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="color:#aaa; font-size:11px; display:block; margin-bottom:5px;">
                            База: <span class="ss-global-intel-base-val" style="color:#0f0; font-weight:bold;">${this.settings.aiBots.globalIntelligenceBase.toFixed(1)}</span>
                        </label>
                        <input type="range" class="ss-global-intel-base" min="1" max="10" step="0.1" value="${this.settings.aiBots.globalIntelligenceBase}" style="width: 100%;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="color:#aaa; font-size:11px; display:block; margin-bottom:5px;">
                            Максимум: <span class="ss-global-intel-max-val" style="color:#0f0; font-weight:bold;">${this.settings.aiBots.globalIntelligenceMax.toFixed(1)}</span>
                        </label>
                        <input type="range" class="ss-global-intel-max" min="1" max="10" step="0.1" value="${this.settings.aiBots.globalIntelligenceMax}" style="width: 100%;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="color:#aaa; font-size:11px; display:block; margin-bottom:5px;">
                            Интервал роста (мс): <span class="ss-global-intel-interval-val" style="color:#0f0; font-weight:bold;">${this.settings.aiBots.globalIntelligenceGrowthIntervalMs}</span>
                        </label>
                        <input type="range" class="ss-global-intel-interval" min="200" max="10000" step="100" value="${this.settings.aiBots.globalIntelligenceGrowthIntervalMs}" style="width: 100%;">
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="color:#aaa; font-size:11px; display:block; margin-bottom:5px;">
                            Шаг роста: <span class="ss-global-intel-amount-val" style="color:#0f0; font-weight:bold;">${this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2)}</span>
                        </label>
                        <input type="range" class="ss-global-intel-amount" min="0.05" max="2.0" step="0.05" value="${this.settings.aiBots.globalIntelligenceGrowthAmount}" style="width: 100%;">
                    </div>
                    <div style="margin-bottom: 12px;">
                        <button class="panel-btn secondary ss-global-intel-reset" style="width:100%; padding:8px;">Сбросить глобальный интеллект</button>
                    </div>
                </div>
                
                <div class="session-section-emb">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        РЕЖИМ ИГРЫ
                    </div>
                    <div style="margin-bottom: 12px;">
                        <select class="ss-gamemode-emb" style="
                            width: 100%; padding: 6px 8px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px; color: #0f0;
                            font-family: 'Press Start 2P', monospace;
                        ">
                            <option value="normal" ${this.settings.gameMode === 'normal' ? 'selected' : ''}>Обычный</option>
                            <option value="survival" ${this.settings.gameMode === 'survival' ? 'selected' : ''}>Выживание</option>
                            <option value="capture" ${this.settings.gameMode === 'capture' ? 'selected' : ''}>Захват</option>
                            <option value="raid" ${this.settings.gameMode === 'raid' ? 'selected' : ''}>Рейд</option>
                            <option value="sandbox" ${this.settings.gameMode === 'sandbox' ? 'selected' : ''}>Песочница</option>
                        </select>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 16px;">
                    <button class="panel-btn primary ss-apply-btn" style="flex: 1; padding: 10px;">✓ Применить</button>
                    <button class="panel-btn ss-reset-btn" style="flex: 1; padding: 10px;">↻ Сбросить</button>
                </div>
            </div>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        const enemyCountSlider = container.querySelector(".ss-enemy-count-emb") as HTMLInputElement;
        const enemyCountVal = container.querySelector(".ss-enemy-count-val");
        const spawnIntervalSlider = container.querySelector(".ss-spawn-interval-emb") as HTMLInputElement;
        const spawnIntervalVal = container.querySelector(".ss-spawn-interval-val");
        const difficultySelect = container.querySelector(".ss-difficulty-emb") as HTMLSelectElement;
        const gamemodeSelect = container.querySelector(".ss-gamemode-emb") as HTMLSelectElement;
        const applyBtn = container.querySelector(".ss-apply-btn");
        const resetBtn = container.querySelector(".ss-reset-btn");

        const globalIntelEnabled = container.querySelector(".ss-global-intel-enabled") as HTMLInputElement | null;
        const baseSlider = container.querySelector(".ss-global-intel-base") as HTMLInputElement | null;
        const baseVal = container.querySelector(".ss-global-intel-base-val");
        const maxSlider = container.querySelector(".ss-global-intel-max") as HTMLInputElement | null;
        const maxVal = container.querySelector(".ss-global-intel-max-val");
        const intervalSlider = container.querySelector(".ss-global-intel-interval") as HTMLInputElement | null;
        const intervalVal = container.querySelector(".ss-global-intel-interval-val");
        const amountSlider = container.querySelector(".ss-global-intel-amount") as HTMLInputElement | null;
        const amountVal = container.querySelector(".ss-global-intel-amount-val");
        const globalResetBtn = container.querySelector(".ss-global-intel-reset");

        enemyCountSlider?.addEventListener("input", () => {
            if (enemyCountVal) enemyCountVal.textContent = enemyCountSlider.value;
            this.settings.enemyCount = parseInt(enemyCountSlider.value);
        });

        spawnIntervalSlider?.addEventListener("input", () => {
            if (spawnIntervalVal) spawnIntervalVal.textContent = spawnIntervalSlider.value;
            this.settings.spawnInterval = parseInt(spawnIntervalSlider.value);
        });

        difficultySelect?.addEventListener("change", () => {
            this.settings.aiDifficulty = difficultySelect.value as "easy" | "medium" | "hard" | "nightmare";
        });

        gamemodeSelect?.addEventListener("change", () => {
            this.settings.gameMode = gamemodeSelect.value as GameMode;
        });

        globalIntelEnabled?.addEventListener("change", () => {
            this.settings.aiBots.globalIntelligenceEnabled = globalIntelEnabled.checked;
        });

        baseSlider?.addEventListener("input", () => {
            const v = parseFloat(baseSlider.value);
            this.settings.aiBots.globalIntelligenceBase = v;
            if (this.settings.aiBots.globalIntelligenceMax < v) {
                this.settings.aiBots.globalIntelligenceMax = v;
                if (maxSlider) maxSlider.value = v.toFixed(1);
                if (maxVal) maxVal.textContent = v.toFixed(1);
            }
            if (baseVal) baseVal.textContent = v.toFixed(1);
        });

        maxSlider?.addEventListener("input", () => {
            let v = parseFloat(maxSlider.value);
            if (v < this.settings.aiBots.globalIntelligenceBase) {
                v = this.settings.aiBots.globalIntelligenceBase;
                maxSlider.value = v.toFixed(1);
            }
            this.settings.aiBots.globalIntelligenceMax = v;
            if (maxVal) maxVal.textContent = v.toFixed(1);
        });

        intervalSlider?.addEventListener("input", () => {
            const v = parseInt(intervalSlider.value, 10);
            this.settings.aiBots.globalIntelligenceGrowthIntervalMs = v;
            if (intervalVal) intervalVal.textContent = String(v);
        });

        amountSlider?.addEventListener("input", () => {
            const v = parseFloat(amountSlider.value);
            this.settings.aiBots.globalIntelligenceGrowthAmount = v;
            if (amountVal) amountVal.textContent = v.toFixed(2);
        });

        globalResetBtn?.addEventListener("click", () => {
            window.dispatchEvent(new CustomEvent("aiBots:resetGlobalIntelligence"));
        });

        applyBtn?.addEventListener("click", () => {
            this.applySettings();
            if (this.game?.hud) {
                this.game.hud.showMessage("Настройки сессии применены!", "#0f0", 2000);
            }
        });

        resetBtn?.addEventListener("click", () => {
            this.settings = this.getDefaultSettings();
            this.saveSettingsToStorage();
            // Обновляем UI
            if (enemyCountSlider) enemyCountSlider.value = String(this.settings.enemyCount);
            if (enemyCountVal) enemyCountVal.textContent = String(this.settings.enemyCount);
            if (spawnIntervalSlider) spawnIntervalSlider.value = String(this.settings.spawnInterval);
            if (spawnIntervalVal) spawnIntervalVal.textContent = String(this.settings.spawnInterval);
            if (difficultySelect) difficultySelect.value = this.settings.aiDifficulty;
            if (gamemodeSelect) gamemodeSelect.value = this.settings.gameMode;
            if (globalIntelEnabled) globalIntelEnabled.checked = this.settings.aiBots.globalIntelligenceEnabled;
            if (baseSlider) baseSlider.value = this.settings.aiBots.globalIntelligenceBase.toFixed(1);
            if (baseVal) baseVal.textContent = this.settings.aiBots.globalIntelligenceBase.toFixed(1);
            if (maxSlider) maxSlider.value = this.settings.aiBots.globalIntelligenceMax.toFixed(1);
            if (maxVal) maxVal.textContent = this.settings.aiBots.globalIntelligenceMax.toFixed(1);
            if (intervalSlider) intervalSlider.value = String(this.settings.aiBots.globalIntelligenceGrowthIntervalMs);
            if (intervalVal) intervalVal.textContent = String(this.settings.aiBots.globalIntelligenceGrowthIntervalMs);
            if (amountSlider) amountSlider.value = this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2);
            if (amountVal) amountVal.textContent = this.settings.aiBots.globalIntelligenceGrowthAmount.toFixed(2);

            if (this.game?.hud) {
                this.game.hud.showMessage("Настройки сброшены!", "#ff0", 2000);
            }
        });
    }
}



