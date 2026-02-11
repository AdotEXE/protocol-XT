/**
 * Wave Editor - Визуальный редактор волн врагов
 */

import { logger } from "./utils/logger";
import { inGameAlert, inGameConfirm } from "./utils/inGameDialogs";

export interface Wave {
    id: string;
    name: string;
    delay: number; // Задержка перед волной (секунды)
    enemies: WaveEnemy[];
    spawnPattern: "random" | "circle" | "line" | "grid";
    completed: boolean;
}

export interface WaveEnemy {
    type: string;
    count: number;
    level: number;
    delay: number; // Задержка между спавном врагов (секунды)
}

export class WaveEditor {
    private container!: HTMLDivElement;
    private visible: boolean = false;
    private waves: Wave[] = [];
    private currentWave: Wave | null = null;

    constructor() {
        this.waves = this.loadWaves();
        this.createUI();
    }

    /**
     * Создание UI
     */
    private createUI(): void {
        this.container = document.createElement("div");
        this.container.id = "wave-editor";
        this.container.className = "panel-overlay";

        const style = document.createElement("style");
        style.textContent = `
            /* ИСПРАВЛЕНИЕ: Переопределяем стили panel-overlay для wave-editor */
            #wave-editor.panel-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100002 !important;
            }
            
            #wave-editor {
                position: relative !important;
                width: min(900px, 95vw) !important;
                max-width: 95vw !important;
                height: min(700px, 90vh) !important;
                max-height: 90vh !important;
                background: rgba(0, 10, 0, 0.95);
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 8px;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
            }
            #wave-editor.hidden { display: none !important; }
            
            .wave-editor-header {
                background: linear-gradient(180deg, rgba(0, 20, 0, 0.9) 0%, rgba(0, 10, 0, 0.95) 100%);
                padding: 12px 16px;
                border-bottom: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }
            .wave-editor-title {
                color: #0ff;
                font-size: 16px;
                font-weight: bold;
            }
            .wave-editor-close {
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                color: #0ff;
                width: 28px;
                height: 28px;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .wave-editor-close:hover {
                background: rgba(0, 255, 4, 0.4);
                transform: scale(1.1);
            }
            
            .wave-editor-content {
                padding: 16px;
                overflow: hidden;
                flex: 1;
                display: flex;
                gap: 16px;
                min-height: 0; /* КРИТИЧНО: Позволяет flex-элементам сжиматься */
            }
            
            .wave-list {
                flex: 1;
                min-width: 0; /* КРИТИЧНО: Позволяет сжиматься */
                max-width: 300px;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            
            #wave-list-items {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
            }
            
            .wave-details {
                flex: 2;
                min-width: 0; /* КРИТИЧНО: Позволяет сжиматься */
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
            }
            
            /* Адаптивность для маленьких экранов */
            @media (max-width: 768px) {
                #wave-editor {
                    width: 95vw !important;
                    height: 90vh !important;
                }
                .wave-editor-content {
                    flex-direction: column;
                    gap: 12px;
                }
                .wave-list {
                    max-width: 100%;
                    max-height: 40%;
                }
                .wave-details {
                    max-height: 60%;
                    overflow-y: auto;
                }
            }
            .wave-item {
                padding: 10px;
                margin-bottom: 8px;
                background: rgba(0, 20, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .wave-item:hover {
                background: rgba(0, 30, 0, 0.5);
                border-color: rgba(0, 255, 4, 0.6);
            }
            .wave-item.active {
                background: rgba(0, 255, 4, 0.2);
                border-color: rgba(0, 255, 4, 0.8);
            }
            .wave-item-name {
                font-weight: bold;
                color: #0f0;
                margin-bottom: 4px;
            }
            .wave-item-info {
                font-size: 11px;
                color: #aaa;
            }
            .wave-editor-btn {
                padding: 6px 12px;
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.6);
                border-radius: 4px;
                color: #0f0;
                cursor: pointer;
                font-size: 12px;
                margin-right: 8px;
            }
            .wave-editor-btn:hover {
                background: rgba(0, 255, 4, 0.4);
            }
            .wave-control {
                margin-bottom: 12px;
            }
            .wave-label {
                color: #aaa;
                font-size: 12px;
                margin-bottom: 5px;
                display: block;
            }
            .wave-input {
                width: 100%;
                padding: 6px 8px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 4, 0.4);
                border-radius: 4px;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 12px;
            }
            .enemy-list {
                margin-top: 16px;
            }
            .enemy-item {
                padding: 8px;
                margin-bottom: 8px;
                background: rgba(0, 15, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.2);
                border-radius: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            /* Скроллбары */
            #wave-list-items::-webkit-scrollbar,
            .wave-details::-webkit-scrollbar {
                width: 8px;
            }
            #wave-list-items::-webkit-scrollbar-track,
            .wave-details::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }
            #wave-list-items::-webkit-scrollbar-thumb,
            .wave-details::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 4px;
            }
            #wave-list-items::-webkit-scrollbar-thumb:hover,
            .wave-details::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 4, 0.6);
            }
        `;
        document.head.appendChild(style);

        this.updateUI();
        document.body.appendChild(this.container);
        this.setupEventListeners();
    }

    /**
     * Обновление UI
     */
    private updateUI(): void {
        this.container.innerHTML = `
            <div class="wave-editor-header">
                <div class="wave-editor-title">РЕДАКТОР ВОЛН</div>
                <button class="wave-editor-close" id="wave-editor-close">✕</button>
            </div>
            <div class="wave-editor-content">
                <div class="wave-list">
                    <div style="display: flex; justify-content: space-between; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                        <button class="wave-editor-btn" id="wave-add" style="flex: 1; min-width: 100px;">+ Добавить</button>
                        <button class="wave-editor-btn" id="wave-export" style="flex: 1; min-width: 100px;">Экспорт</button>
                        <button class="wave-editor-btn" id="wave-import" style="flex: 1; min-width: 100px;">Импорт</button>
                    </div>
                    <div id="wave-list-items"></div>
                </div>
                <div class="wave-details" id="wave-details">
                    ${this.currentWave ? this.renderWaveDetails() : '<div style="color: #666; text-align: center; padding: 40px;">Выберите волну для редактирования</div>'}
                </div>
            </div>
        `;

        this.renderWaveList();
        const detailsDiv = document.getElementById("wave-details");
        if (detailsDiv) {
            detailsDiv.innerHTML = this.currentWave ? this.renderWaveDetails() : '<div style="color: #666; text-align: center; padding: 40px;">Выберите волну для редактирования</div>';
        }
    }

    /**
     * Рендер встроенного редактора волн (для SessionSettings)
     */
    renderEmbeddedEditor(): void {
        const listContainer = document.getElementById("wave-list-items-embedded");
        const detailsContainer = document.getElementById("wave-details-embedded");

        if (listContainer) {
            this.renderEmbeddedWaveList(listContainer);
        }

        if (detailsContainer) {
            if (this.currentWave) {
                detailsContainer.innerHTML = this.renderWaveDetails();
            } else {
                detailsContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">Выберите волну для редактирования</div>';
            }
        }
    }

    /**
     * Рендер списка волн для встроенного редактора
     */
    private renderEmbeddedWaveList(container: HTMLElement): void {
        container.innerHTML = '';

        if (this.waves.length === 0) {
            container.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Нет волн. Добавьте первую волну.</div>';
            return;
        }

        this.waves.forEach((wave, index) => {
            const item = document.createElement("div");
            item.style.cssText = `
                padding: 8px;
                margin-bottom: 6px;
                background: ${wave === this.currentWave ? 'rgba(0, 255, 4, 0.2)' : 'rgba(0, 20, 0, 0.3)'};
                border: 1px solid ${wave === this.currentWave ? 'rgba(0, 255, 4, 0.8)' : 'rgba(0, 255, 4, 0.3)'};
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            item.innerHTML = `
                <div style="font-weight: bold; color: #0f0; margin-bottom: 4px;">${wave.name}</div>
                <div style="font-size: 10px; color: #aaa;">
                    Задержка: ${wave.delay}с | Врагов: ${wave.enemies.reduce((sum, e) => sum + e.count, 0)} | Паттерн: ${wave.spawnPattern}
                </div>
            `;
            item.addEventListener("click", () => {
                this.currentWave = wave;
                this.renderEmbeddedEditor();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "✕";
            deleteBtn.style.cssText = `
                padding: 2px 6px;
                margin: 0;
                float: right;
                background: rgba(255, 50, 50, 0.2);
                border: 1px solid rgba(255, 50, 50, 0.6);
                color: #ff5050;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
            `;
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                inGameConfirm(`Удалить волну "${wave.name}"?`, "Волны").then((ok) => {
                    if (!ok) return;
                    this.waves.splice(index, 1);
                    if (this.currentWave === wave) {
                        this.currentWave = null;
                    }
                    this.saveWaves();
                    this.renderEmbeddedEditor();
                }).catch(() => {});
            });
            item.appendChild(deleteBtn);

            container.appendChild(item);
        });
    }

    /**
     * Рендер списка волн
     */
    private renderWaveList(): void {
        const list = document.getElementById("wave-list-items");
        if (!list) return;

        list.innerHTML = '';

        if (this.waves.length === 0) {
            list.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Нет волн. Добавьте первую волну.</div>';
            return;
        }

        this.waves.forEach((wave, index) => {
            const item = document.createElement("div");
            item.className = `wave-item ${wave === this.currentWave ? 'active' : ''}`;
            item.innerHTML = `
                <div class="wave-item-name">${wave.name}</div>
                <div class="wave-item-info">
                    Задержка: ${wave.delay}с | Врагов: ${wave.enemies.reduce((sum, e) => sum + e.count, 0)} | Паттерн: ${wave.spawnPattern}
                </div>
            `;
            item.addEventListener("click", () => {
                this.currentWave = wave;
                this.updateUI();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.textContent = "✕";
            deleteBtn.className = "wave-editor-btn";
            deleteBtn.style.cssText = "padding: 2px 6px; margin: 0; float: right;";
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                inGameConfirm(`Удалить волну "${wave.name}"?`, "Волны").then((ok) => {
                    if (!ok) return;
                    this.waves.splice(index, 1);
                    if (this.currentWave === wave) {
                        this.currentWave = null;
                    }
                    this.saveWaves();
                    this.updateUI();
                }).catch(() => {});
            });
            item.appendChild(deleteBtn);

            list.appendChild(item);
        });
    }

    /**
     * Рендер деталей волны
     */
    private renderWaveDetails(): string {
        if (!this.currentWave) return '';

        let enemiesHTML = '';
        if (this.currentWave.enemies.length === 0) {
            enemiesHTML = '<div style="color: #666; text-align: center; padding: 20px;">Нет врагов. Добавьте врага.</div>';
        } else {
            enemiesHTML = this.currentWave.enemies.map((enemy, index) => `
                <div class="enemy-item">
                    <div style="flex: 1;">
                        <div style="margin-bottom: 5px;">
                            <label class="wave-label">Тип:</label>
                            <select class="wave-input" id="enemy-${index}-type" style="width: 100px; display: inline-block;">
                                <option value="basic" ${enemy.type === 'basic' ? 'selected' : ''}>Базовый</option>
                                <option value="heavy" ${enemy.type === 'heavy' ? 'selected' : ''}>Тяжёлый</option>
                                <option value="fast" ${enemy.type === 'fast' ? 'selected' : ''}>Быстрый</option>
                            </select>
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <div style="flex: 1;">
                                <label class="wave-label">Количество:</label>
                                <input type="number" class="wave-input" id="enemy-${index}-count" value="${enemy.count}" min="1" style="width: 80px;">
                            </div>
                            <div style="flex: 1;">
                                <label class="wave-label">Уровень:</label>
                                <input type="number" class="wave-input" id="enemy-${index}-level" value="${enemy.level}" min="1" max="10" style="width: 80px;">
                            </div>
                            <div style="flex: 1;">
                                <label class="wave-label">Задержка (с):</label>
                                <input type="number" class="wave-input" id="enemy-${index}-delay" value="${enemy.delay}" min="0" step="0.5" style="width: 80px;">
                            </div>
                        </div>
                    </div>
                    <button class="wave-editor-btn" id="enemy-delete-${index}" style="margin-left: 10px;">✕</button>
                </div>
            `).join('');
        }

        return `
            <div class="wave-control">
                <label class="wave-label">Название волны:</label>
                <input type="text" class="wave-input" id="wave-name" value="${this.currentWave.name}">
            </div>
            <div class="wave-control">
                <label class="wave-label">Задержка перед волной (сек):</label>
                <input type="number" class="wave-input" id="wave-delay" value="${this.currentWave.delay}" min="0" step="0.5">
            </div>
            <div class="wave-control">
                <label class="wave-label">Паттерн спавна:</label>
                <select class="wave-input" id="wave-pattern">
                    <option value="random" ${this.currentWave.spawnPattern === 'random' ? 'selected' : ''}>Случайный</option>
                    <option value="circle" ${this.currentWave.spawnPattern === 'circle' ? 'selected' : ''}>По кругу</option>
                    <option value="line" ${this.currentWave.spawnPattern === 'line' ? 'selected' : ''}>По линии</option>
                    <option value="grid" ${this.currentWave.spawnPattern === 'grid' ? 'selected' : ''}>Сетка</option>
                </select>
            </div>
            <div class="enemy-list">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <div style="color: #ff0; font-weight: bold;">Враги в волне (${this.currentWave.enemies.reduce((sum, e) => sum + e.count, 0)}):</div>
                    <button class="wave-editor-btn" id="enemy-add">+ Добавить врага</button>
                </div>
                <div id="enemy-list-items">${enemiesHTML}</div>
            </div>
        `;
    }

    /**
     * Настройка обработчиков событий
     */
    private setupEventListeners(): void {
        // Закрытие
        document.getElementById("wave-editor-close")?.addEventListener("click", () => {
            this.hide();
        });

        // Добавление волны
        document.getElementById("wave-add")?.addEventListener("click", () => {
            const newWave: Wave = {
                id: `wave_${Date.now()}`,
                name: `Волна ${this.waves.length + 1}`,
                delay: 0,
                enemies: [],
                spawnPattern: "random",
                completed: false
            };
            this.waves.push(newWave);
            this.currentWave = newWave;
            this.saveWaves();
            this.updateUI();
        });

        // Экспорт/импорт
        document.getElementById("wave-export")?.addEventListener("click", () => {
            const data = this.exportWaves();
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `waves_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById("wave-import")?.addEventListener("click", () => {
            this.importWavesFromFile();
        });

        // Обновление обработчиков при изменении UI
        this.container.addEventListener("input", (e) => {
            const target = e.target as HTMLElement;
            if (!this.currentWave) return;

            if (target.id === "wave-name") {
                this.currentWave.name = (target as HTMLInputElement).value;
            } else if (target.id === "wave-delay") {
                this.currentWave.delay = parseFloat((target as HTMLInputElement).value) || 0;
            } else if (target.id === "wave-pattern") {
                this.currentWave.spawnPattern = (target as HTMLSelectElement).value as any;
            }

            this.saveWaves();
            this.renderWaveList();
        });

        // Обработчик добавления врага
        this.container.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!this.currentWave) return;

            if (target.id === "enemy-add") {
                const newEnemy: WaveEnemy = {
                    type: "basic",
                    count: 1,
                    level: 1,
                    delay: 0
                };
                this.currentWave.enemies.push(newEnemy);
                this.saveWaves();
                this.updateUI();
            } else if (target.id?.startsWith("enemy-delete-")) {
                const index = parseInt(target.id.replace("enemy-delete-", ""));
                if (!isNaN(index) && this.currentWave.enemies[index]) {
                    this.currentWave.enemies.splice(index, 1);
                    this.saveWaves();
                    this.updateUI();
                }
            }
        });

        // Обработчики изменения врагов
        this.container.addEventListener("change", (e) => {
            const target = e.target as HTMLElement;
            if (!this.currentWave) return;

            const match = target.id?.match(/^enemy-(\d+)-(type|count|level|delay)$/);
            if (match) {
                const index = parseInt(match[1]!, 10);
                const field = match[2];
                const enemy = this.currentWave.enemies[index];
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
                    this.saveWaves();
                }
            }
        });
    }

    /**
     * Добавление волны (публичный метод для совместимости с планом)
     */
    addWave(wave: Wave): void {
        this.waves.push(wave);
        this.saveWaves();
        this.updateUI();
    }

    /**
     * Получить все волны
     */
    getWaves(): Wave[] {
        return [...this.waves];
    }

    /**
     * Получить волну по ID
     */
    getWave(id: string): Wave | undefined {
        return this.waves.find(w => w.id === id);
    }

    /**
     * Удалить волну
     */
    removeWave(id: string): boolean {
        const index = this.waves.findIndex(w => w.id === id);
        if (index !== -1) {
            this.waves.splice(index, 1);
            this.saveWaves();
            this.updateUI();
            return true;
        }
        return false;
    }

    /**
     * Импорт волн
     */
    importWaves(data: string): void {
        try {
            const imported = JSON.parse(data);
            if (Array.isArray(imported)) {
                this.waves = imported;
                this.saveWaves();
                this.updateUI();
                logger.log("[WaveEditor] Waves imported successfully");
            } else {
                throw new Error("Invalid wave data format");
            }
        } catch (error) {
            logger.error("[WaveEditor] Failed to import waves:", error);
        }
    }

    /**
     * Экспорт волн (публичный метод)
     */
    exportWaves(): string {
        return JSON.stringify(this.waves, null, 2);
    }

    /**
     * Импорт волн (старый метод для UI)
     */
    private importWavesFromFile(): void {
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
                    this.importWaves(data);
                    inGameAlert(`Импортировано ${this.waves.length} волн`, "Импорт").catch(() => {});
                } catch (error) {
                    inGameAlert('Ошибка импорта: ' + error, "Ошибка").catch(() => {});
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    /**
     * Загрузка волн из localStorage
     */
    private loadWaves(): Wave[] {
        try {
            const saved = localStorage.getItem('ptx_waves');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            logger.warn("[WaveEditor] Failed to load waves:", error);
        }
        return [];
    }

    /**
     * Сохранение волн в localStorage
     */
    private saveWaves(): void {
        try {
            localStorage.setItem('ptx_waves', JSON.stringify(this.waves));
        } catch (error) {
            logger.warn("[WaveEditor] Failed to save waves:", error);
        }
    }

    /**
     * Показать редактор
     */
    show(): void {
        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "flex"; // ИСПРАВЛЕНИЕ: Явно устанавливаем display
        this.container.style.display = "flex";

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';
    }

    /**
     * Скрыть редактор
     */
    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none"; // ИСПРАВЛЕНИЕ: Явно скрываем
        this.container.style.display = "none";
    }

    /**
     * Переключение видимости
     */
    toggle(): void {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

