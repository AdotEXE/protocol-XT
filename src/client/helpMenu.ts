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
                { key: "ПКМ", description: "Режим прицеливания" },
                { key: "CTRL", description: "Активация модулей" },
                { key: "R", description: "Перезарядка" },
            ]
        },
        {
            title: "ИНТЕРФЕЙС",
            icon: "🖥",
            controls: [
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
                { key: "F1", description: "Помощь / Управление" },
                { key: "F2", description: "Настройки скриншотов" },
                { key: "F3", description: "Панель отладки" },
                { key: "F4", description: "Настройки физики" },
                { key: "F5", description: "Системная консоль" },
                { key: "F6", description: "Настройки сессии" },
                { key: "F7", description: "Меню читов" },
                { key: "F8", description: "Настройки сети" },
                { key: "F9", description: "Генерация мира" },
            ]
        },
        {
            title: "НАСТРОЙКИ",
            icon: "⚙",
            controls: [
                { key: "B", description: "Гараж" },
                { key: "ESC", description: "Пауза / Выход" },
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
                    <div class="panel-title">HELP / CONTROLS [F1]</div>
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
        // ESC key handler will be handled by game.ts
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
        this.container.style.display = "flex";
        
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
        this.container.style.display = "none";
        
        logger.log("[HelpMenu] Menu closed");
    }
    
    isVisible(): boolean {
        return this.visible;
    }
}

