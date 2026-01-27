/**
 * Help Menu (F1) - Меню помощи и управления
 */

import { Game } from "./game";
import { logger } from "./utils/logger";
import { CommonStyles } from "./commonStyles";

interface ControlCategory {
    title: string;
    icon: string;
    controls: Array<{
        key: string;
        description: string;
    }>;
}

export class HelpMenu {
    private container!: HTMLDivElement;
    private visible = false;
    private game: Game | null = null;
    private searchInput: HTMLInputElement | null = null;
    private filteredCategories: ControlCategory[] = [];

    private categories: ControlCategory[] = [
        {
            title: "ДВИЖЕНИЕ",
            icon: "🎮",
            controls: [
                { key: "W / ↑", description: "Движение вперёд" },
                { key: "S / ↓", description: "Движение назад" },
                { key: "A / ←", description: "Поворот влево" },
                { key: "D / →", description: "Поворот вправо" },
                { key: "МЫШЬ", description: "Поворот башни" },
                { key: "Z / X", description: "Поворот башни влево/вправо" },
            ]
        },
        {
            title: "БОЙ",
            icon: "⚔",
            controls: [
                { key: "ПРОБЕЛ", description: "Выстрел" },
                { key: "ПКМ / CTRL", description: "Режим прицеливания" },
                { key: "R", description: "Поднять ствол" },
                { key: "F", description: "Опустить ствол" },
                { key: "1-5", description: "Расходники 1-5" },
                { key: "6-9", description: "Расходники 6-9" },
            ]
        },
        {
            title: "ИНТЕРФЕЙС",
            icon: "🖥",
            controls: [
                { key: "G", description: "Открыть/закрыть ворота гаража" },
                { key: "B", description: "Открыть/закрыть меню гаража" },
                { key: "TAB", description: "Статистика (удерживать)" },
                { key: "M", description: "Карта" },
                { key: "N", description: "Панель миссий" },
                { key: "ALT", description: "Игровой курсор (удерживать)" },
                { key: "ESC", description: "Пауза / Главное меню" },
            ]
        },
        {
            title: "ГОРЯЧИЕ КЛАВИШИ",
            icon: "⌨",
            controls: [
                { key: "F2", description: "📸 Скриншот (быстрый)" },
                { key: "F7", description: "🎛️ Панель управления" },
                { key: "Ctrl+7", description: "🎛️ Панель управления (альт.)" },
            ]
        },
        {
            title: "РАСХОДНИКИ",
            icon: "🎒",
            controls: [
                { key: "1", description: "Расходник слот 1" },
                { key: "2", description: "Расходник слот 2" },
                { key: "3", description: "Расходник слот 3" },
                { key: "4", description: "Расходник слот 4" },
                { key: "5", description: "Расходник слот 5" },
            ]
        },
        {
            title: "КАМЕРА",
            icon: "📷",
            controls: [
                { key: "SHIFT", description: "Свободный обзор" },
                { key: "C", description: "Центрировать башню" },
                { key: "Q / E", description: "Наклон камеры вверх/вниз" },
            ]
        },
        {
            title: "НАСТРОЙКИ",
            icon: "⚙",
            controls: [
                { key: "B", description: "Гараж" },
                { key: "ESC", description: "Пауза / Выход" },
            ]
        },
        {
            title: "РЕДАКТОР КАРТ",
            icon: "🏗️",
            controls: [
                { key: "T", description: "Инструмент Террейн" },
                { key: "O", description: "Инструмент Объекты" },
                { key: "S", description: "Инструмент Выбор" },
                { key: "R", description: "Инструмент Триггеры" },
                { key: "Ctrl+D", description: "Дублировать объект" },
                { key: "Delete", description: "Удалить объект" },
                { key: "Ctrl+Z", description: "Отмена действия" },
                { key: "Ctrl+Y", description: "Повтор действия" },
                { key: "Esc", description: "Снять выделение" },
            ]
        }
    ];

    constructor() {
        this.filteredCategories = [...this.categories];
        this.createUI();
        this.setupToggle();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }

    setGame(game: Game | null): void {
        this.game = game;
    }

    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();


        this.container = document.createElement("div");
        this.container.id = "help-menu";
        this.container.className = "panel-overlay";


        const html = `
            <div class="panel" style="width: min(800px, 90vw); max-height: min(700px, 90vh);">
                <div class="panel-header">
                    <div class="panel-title">HELP / CONTROLS [Ctrl+1]</div>
                    <button class="panel-close" id="help-close">×</button>
                </div>
                <div class="panel-content">
                    <div style="margin-bottom: 16px;">
                        <input type="text" id="help-search" class="panel-input" placeholder="Поиск по командам..." style="
                            width: 100%;
                            padding: 8px 12px;
                            background: rgba(0, 5, 0, 0.5);
                            border: 1px solid rgba(0, 255, 4, 0.4);
                            border-radius: 4px;
                            color: #0f0;
                            font-family: Consolas, Monaco, 'Courier New', monospace;
                            font-size: 12px;
                        ">
                    </div>
                    <div id="help-content">
                        ${this.renderCategories()}
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        document.body.appendChild(this.container);

        // Setup search
        this.searchInput = document.getElementById("help-search") as HTMLInputElement;
        if (this.searchInput) {
            this.searchInput.addEventListener("input", () => this.handleSearch());
        }

        // Setup close button
        const closeBtn = document.getElementById("help-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => this.hide());
        }

        // Close on overlay click
        this.container.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
    }

    private renderCategories(): string {
        return this.filteredCategories.map(category => `
            <div class="panel-section" style="margin-bottom: 24px;">
                <div class="panel-section-title" style="
                    color: #0ff;
                    font-size: 14px;
                    font-weight: bold;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                ">
                    ${category.icon} ${category.title}
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px;">
                    ${category.controls.map(control => `
                        <div class="panel-control" style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 8px 12px;
                            background: rgba(0, 5, 0, 0.3);
                            border: 1px solid rgba(0, 255, 4, 0.2);
                            border-radius: 4px;
                        ">
                            <span style="color: #0f0; font-size: 12px;">${control.description}</span>
                            <span style="
                                color: #0ff;
                                font-size: 11px;
                                font-weight: bold;
                                padding: 4px 8px;
                                background: rgba(0, 255, 4, 0.1);
                                border: 1px solid rgba(0, 255, 4, 0.3);
                                border-radius: 3px;
                                font-family: Consolas, Monaco, 'Courier New', monospace;
                            ">${control.key}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `).join("");
    }

    private handleSearch(): void {
        if (!this.searchInput) return;

        const query = this.searchInput.value.toLowerCase().trim();

        if (query === "") {
            this.filteredCategories = [...this.categories];
        } else {
            this.filteredCategories = this.categories.map(category => {
                const filteredControls = category.controls.filter(control =>
                    control.key.toLowerCase().includes(query) ||
                    control.description.toLowerCase().includes(query)
                );
                return filteredControls.length > 0
                    ? { ...category, controls: filteredControls }
                    : null;
            }).filter((cat): cat is ControlCategory => cat !== null);
        }

        const content = document.getElementById("help-content");
        if (content) {
            content.innerHTML = this.renderCategories();
        }
    }

    private setupToggle(): void {
        // ESC обработчик для закрытия меню
        window.addEventListener("keydown", (e) => {
            if (e.code === "Escape" && this.visible) {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
            }
        }, true);
    }

    toggle(): void {

        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show(): void {

        if (!this.container) return;

        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.classList.add("visible");
        this.container.style.display = "flex";
        this.container.style.visibility = "visible";

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';

        // Reset search
        if (this.searchInput) {
            this.searchInput.value = "";
            this.filteredCategories = [...this.categories];
            const content = document.getElementById("help-content");
            if (content) {
                content.innerHTML = this.renderCategories();
            }
        }

        logger.log("[HelpMenu] Menu opened");
    }

    hide(): void {
        if (!this.container) return;

        this.visible = false;
        this.container.classList.add("hidden");
        this.container.classList.remove("visible");
        this.container.style.display = "none";
        this.container.style.visibility = "hidden";

        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }

        logger.log("[HelpMenu] Menu closed");
    }

    isVisible(): boolean {
        return this.visible;
    }

    /**
     * Рендерит контент меню в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        container.innerHTML = this.getEmbeddedContentHTML();
        this.setupEmbeddedEventListeners(container);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
        return `
            <div class="help-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    🎮 Управление и горячие клавиши
                </h3>
                <div style="margin-bottom: 16px;">
                    <input type="text" class="help-search-embedded" placeholder="Поиск по командам..." style="
                        width: 100%;
                        padding: 8px 12px;
                        background: rgba(0, 5, 0, 0.5);
                        border: 1px solid rgba(0, 255, 4, 0.4);
                        border-radius: 4px;
                        color: #0f0;
                        font-family: Consolas, Monaco, 'Courier New', monospace;
                        font-size: 12px;
                        box-sizing: border-box;
                    ">
                </div>
                <div class="help-categories-container">
                    ${this.renderCategoriesEmbedded(this.categories)}
                </div>
            </div>
        `;
    }

    /**
     * Рендерит категории для embedded режима
     */
    private renderCategoriesEmbedded(categories: ControlCategory[]): string {
        return categories.map(category => `
            <div class="help-section" style="margin-bottom: 20px;">
                <div style="
                    color: #0ff;
                    font-size: 13px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    padding-bottom: 6px;
                    border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                ">
                    ${category.icon} ${category.title}
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 6px;">
                    ${category.controls.map(control => `
                        <div style="
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            padding: 6px 10px;
                            background: rgba(0, 5, 0, 0.3);
                            border: 1px solid rgba(0, 255, 4, 0.2);
                            border-radius: 4px;
                        ">
                            <span style="color: #0f0; font-size: 11px;">${control.description}</span>
                            <span style="
                                color: #0ff;
                                font-size: 10px;
                                font-weight: bold;
                                padding: 3px 6px;
                                background: rgba(0, 255, 4, 0.1);
                                border: 1px solid rgba(0, 255, 4, 0.3);
                                border-radius: 3px;
                                font-family: Consolas, Monaco, 'Courier New', monospace;
                            ">${control.key}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `).join("");
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        const searchInput = container.querySelector(".help-search-embedded") as HTMLInputElement;
        const categoriesContainer = container.querySelector(".help-categories-container");

        if (searchInput && categoriesContainer) {
            searchInput.addEventListener("input", () => {
                const query = searchInput.value.toLowerCase().trim();

                let filtered: ControlCategory[];
                if (query === "") {
                    filtered = [...this.categories];
                } else {
                    filtered = this.categories.map(category => {
                        const filteredControls = category.controls.filter(control =>
                            control.key.toLowerCase().includes(query) ||
                            control.description.toLowerCase().includes(query)
                        );
                        return filteredControls.length > 0
                            ? { ...category, controls: filteredControls }
                            : null;
                    }).filter((cat): cat is ControlCategory => cat !== null);
                }

                categoriesContainer.innerHTML = this.renderCategoriesEmbedded(filtered);
            });
        }
    }
}

