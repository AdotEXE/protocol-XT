/**
 * Unified Menu - Единое окно с вкладками для всех меню
 */

import { Game } from "./game";
import { CommonStyles } from "./commonStyles";
import { logger } from "./utils/logger";

// Типы категорий меню
export interface MenuCategory {
    id: string;
    name: string;
    icon: string;
    description: string;
}

// Типы вкладок
export interface MenuTab {
    id: string;
    categoryId: string;
    name: string;
    icon: string;
    container: HTMLDivElement;
    loaded: boolean;
    instance?: any;
}

// Список всех категорий меню
const MENU_CATEGORIES: MenuCategory[] = [
    { id: "help", name: "Помощь", icon: "❓", description: "Справка по управлению" },
    { id: "screenshot", name: "Скриншот", icon: "📸", description: "Настройки скриншотов" },
    { id: "debug", name: "Debug", icon: "📊", description: "Панель отладки" },
    { id: "physics", name: "Физика", icon: "⚙️", description: "Параметры физики" },
    { id: "terminal", name: "Терминал", icon: "💻", description: "Системная консоль" },
    { id: "session", name: "Сессия", icon: "🎮", description: "Настройки сессии" },
    { id: "cheat", name: "Читы", icon: "🎯", description: "Меню читов" },
    { id: "network", name: "Сеть", icon: "🌐", description: "Настройки сети" },
    { id: "world", name: "Мир", icon: "🌍", description: "Генерация мира" },
    { id: "physics-editor", name: "Редактор", icon: "🔧", description: "Редактор физики" },
];

export class UnifiedMenu {
    private container!: HTMLDivElement;
    private game: Game | null = null;
    private isVisible = false;

    // Система вкладок
    private tabs: Map<string, MenuTab> = new Map();
    private activeTabId: string | null = null;
    private tabCounter = 0;

    // DOM элементы
    private sidebarElement!: HTMLDivElement;
    private tabBarElement!: HTMLDivElement;
    private contentElement!: HTMLDivElement;

    constructor() {
        this.createUI();
        this.setupEventListeners();
        this.hide();
    }

    setGame(game: Game | null): void {
        this.game = game;
    }

    toggle(): void {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    show(): void {
        if (!this.container) {
            this.createUI();
        }
        this.isVisible = true;
        this.container.classList.remove("hidden");
        this.container.classList.add("visible");
        this.container.style.display = "flex";

        // Скрываем play-menu панель и все play-windows чтобы они не накладывались
        const playMenuPanel = document.getElementById("play-menu-panel");
        if (playMenuPanel) {
            playMenuPanel.classList.remove("visible");
            playMenuPanel.style.display = "none";
        }
        document.querySelectorAll(".play-window").forEach(win => {
            (win as HTMLElement).classList.remove("visible");
        });

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';
    }

    hide(): void {
        if (this.container) {
            this.isVisible = false;
            this.container.classList.add("hidden");
            this.container.classList.remove("visible");
            this.container.style.display = "none";
        }
    }

    private createUI(): void {
        CommonStyles.initialize();
        this.injectStyles();

        this.container = document.createElement("div");
        this.container.id = "unified-menu";
        this.container.className = "panel-overlay";

        const html = `
            <div class="unified-panel">
                <div class="unified-header">
                    <div class="unified-title">🎛️ ПАНЕЛЬ УПРАВЛЕНИЯ</div>
                    <button class="panel-close" id="unified-menu-close">×</button>
                </div>
                <div class="unified-body">
                    <div class="unified-sidebar" id="unified-sidebar">
                        <div class="sidebar-title">КАТЕГОРИИ</div>
                        <div class="sidebar-categories" id="sidebar-categories"></div>
                    </div>
                    <div class="unified-main">
                        <div class="unified-tabbar" id="unified-tabbar">
                            <div class="tab-list" id="tab-list"></div>
                        </div>
                        <div class="unified-content" id="unified-content">
                            <div class="content-empty" id="content-empty">
                                <div class="empty-icon">📋</div>
                                <div class="empty-text">Выберите категорию слева<br>для открытия вкладки</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        document.body.appendChild(this.container);

        // Сохраняем ссылки на DOM элементы
        this.sidebarElement = document.getElementById("sidebar-categories") as HTMLDivElement;
        this.tabBarElement = document.getElementById("tab-list") as HTMLDivElement;
        this.contentElement = document.getElementById("unified-content") as HTMLDivElement;

        // Рендерим категории в sidebar
        this.renderSidebar();
    }

    private renderSidebar(): void {
        if (!this.sidebarElement) return;

        this.sidebarElement.innerHTML = MENU_CATEGORIES.map(cat => `
            <div class="sidebar-item" data-category="${cat.id}">
                <span class="sidebar-icon">${cat.icon}</span>
                <span class="sidebar-name">${cat.name}</span>
            </div>
        `).join("");

        // Добавляем обработчики кликов
        MENU_CATEGORIES.forEach(cat => {
            const item = this.sidebarElement.querySelector(`[data-category="${cat.id}"]`);
            if (item) {
                item.addEventListener("click", () => this.openTab(cat.id));
            }
        });
    }

    private renderTabBar(): void {
        if (!this.tabBarElement) return;

        let html = "";
        this.tabs.forEach((tab, tabId) => {
            const isActive = tabId === this.activeTabId;
            html += `
                <div class="tab-item ${isActive ? 'active' : ''}" data-tab="${tabId}">
                    <span class="tab-icon">${tab.icon}</span>
                    <span class="tab-name">${tab.name}</span>
                    <span class="tab-close" data-close="${tabId}">×</span>
                </div>
            `;
        });

        this.tabBarElement.innerHTML = html;

        // Обработчики для вкладок
        this.tabs.forEach((_, tabId) => {
            const tabEl = this.tabBarElement.querySelector(`[data-tab="${tabId}"]`);
            const closeEl = this.tabBarElement.querySelector(`[data-close="${tabId}"]`);

            if (tabEl) {
                tabEl.addEventListener("click", (e) => {
                    if (!(e.target as HTMLElement).classList.contains("tab-close")) {
                        this.switchTab(tabId);
                    }
                });
            }

            if (closeEl) {
                closeEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.closeTab(tabId);
                });
            }
        });
    }

    openTab(categoryId: string): void {
        // Проверяем, есть ли уже открытая вкладка с этой категорией
        let existingTabId: string | null = null;
        this.tabs.forEach((tab, tabId) => {
            if (tab.categoryId === categoryId) {
                existingTabId = tabId;
            }
        });

        if (existingTabId) {
            // Переключаемся на существующую вкладку
            this.switchTab(existingTabId);
            return;
        }

        // Создаём новую вкладку
        const category = MENU_CATEGORIES.find(c => c.id === categoryId);
        if (!category) {
            logger.error(`[UnifiedMenu] Category not found: ${categoryId}`);
            return;
        }

        const tabId = `tab-${++this.tabCounter}`;
        const container = document.createElement("div");
        container.className = "tab-content";
        container.id = `tab-content-${tabId}`;
        container.style.display = "none";

        const tab: MenuTab = {
            id: tabId,
            categoryId: category.id,
            name: category.name,
            icon: category.icon,
            container,
            loaded: false,
        };

        this.tabs.set(tabId, tab);
        this.contentElement.appendChild(container);

        // Скрываем пустое сообщение
        const emptyEl = document.getElementById("content-empty");
        if (emptyEl) emptyEl.style.display = "none";

        // Переключаемся на новую вкладку и загружаем контент
        this.switchTab(tabId);
        this.loadTabContent(tabId);
        this.renderTabBar();
    }

    private switchTab(tabId: string): void {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Скрываем все контейнеры вкладок
        this.tabs.forEach((t) => {
            t.container.style.display = "none";
        });

        // Показываем выбранную вкладку
        tab.container.style.display = "block";
        this.activeTabId = tabId;

        // Обновляем активный класс в sidebar
        this.updateSidebarActive(tab.categoryId);

        // Перерендериваем tab bar
        this.renderTabBar();
    }

    private updateSidebarActive(categoryId: string): void {
        const items = this.sidebarElement.querySelectorAll(".sidebar-item");
        items.forEach(item => {
            if (item.getAttribute("data-category") === categoryId) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });
    }

    closeTab(tabId: string): void {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Удаляем контейнер
        tab.container.remove();
        this.tabs.delete(tabId);

        // Если закрыли активную вкладку, переключаемся на другую
        if (this.activeTabId === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            const lastTab = remainingTabs[remainingTabs.length - 1];
            if (lastTab) {
                this.switchTab(lastTab);
            } else {
                this.activeTabId = null;
                // Показываем пустое сообщение
                const emptyEl = document.getElementById("content-empty");
                if (emptyEl) emptyEl.style.display = "flex";
                // Убираем активный класс с sidebar
                this.updateSidebarActive("");
            }
        }

        this.renderTabBar();
    }

    private async loadTabContent(tabId: string): Promise<void> {
        const tab = this.tabs.get(tabId);
        if (!tab || tab.loaded) return;

        tab.container.innerHTML = `<div class="tab-loading">Загрузка...</div>`;

        try {
            await this.loadCategoryContent(tab);
            tab.loaded = true;
        } catch (error) {
            logger.error(`[UnifiedMenu] Failed to load content for ${tab.categoryId}:`, error);
            tab.container.innerHTML = `<div class="tab-error">Ошибка загрузки</div>`;
        }
    }

    private async loadCategoryContent(tab: MenuTab): Promise<void> {
        if (!this.game) {
            tab.container.innerHTML = `<div class="tab-error">Game не инициализирован</div>`;
            return;
        }

        switch (tab.categoryId) {
            case "help":
                await this.loadHelpContent(tab);
                break;
            case "screenshot":
                await this.loadScreenshotContent(tab);
                break;
            case "debug":
                await this.loadDebugContent(tab);
                break;
            case "physics":
                await this.loadPhysicsContent(tab);
                break;
            case "terminal":
                await this.loadTerminalContent(tab);
                break;
            case "session":
                await this.loadSessionContent(tab);
                break;
            case "cheat":
                await this.loadCheatContent(tab);
                break;
            case "network":
                await this.loadNetworkContent(tab);
                break;
            case "world":
                await this.loadWorldContent(tab);
                break;
            case "physics-editor":
                await this.loadPhysicsEditorContent(tab);
                break;
            default:
                tab.container.innerHTML = `<div class="tab-error">Неизвестная категория: ${tab.categoryId}</div>`;
        }
    }

    // ========== Адаптеры для загрузки контента ==========

    private async loadHelpContent(tab: MenuTab): Promise<void> {
        const { HelpMenu } = await import("./helpMenu");
        const helpMenu = new HelpMenu();
        helpMenu.setGame(this.game!);
        tab.instance = helpMenu;
        // Используем renderToContainer для встраивания контента
        helpMenu.renderToContainer(tab.container);
    }

    private async loadScreenshotContent(tab: MenuTab): Promise<void> {
        const { ScreenshotPanel } = await import("./screenshotPanel");
        // Убеждаемся, что screenshotManager инициализирован
        if (this.game && !this.game.screenshotManager) {
            const { ScreenshotManager } = await import("./screenshotManager");
            this.game.screenshotManager = new ScreenshotManager(this.game.engine, this.game.scene, this.game.hud || null);
        }
        // embedded = true - не создаём отдельный overlay, только контент
        const panel = new ScreenshotPanel(this.game!.screenshotManager!, this.game, true);
        tab.instance = panel;
        // Используем renderToContainer для встраивания контента
        panel.renderToContainer(tab.container);
    }

    private async loadDebugContent(tab: MenuTab): Promise<void> {
        const { DebugDashboard } = await import("./debugDashboard");
        // embedded = true - не создаём отдельный overlay, только контент
        const dashboard = new DebugDashboard(this.game!.engine, this.game!.scene, true);
        dashboard.setGame(this.game!);
        if (this.game!.chunkSystem) {
            dashboard.setChunkSystem(this.game!.chunkSystem);
        }
        if (this.game!.tank) {
            dashboard.setTank(this.game!.tank);
        }
        tab.instance = dashboard;
        // Используем renderToContainer для встраивания контента
        dashboard.renderToContainer(tab.container);
    }

    private async loadPhysicsContent(tab: MenuTab): Promise<void> {
        const { PhysicsPanel } = await import("./physicsPanel");
        // embedded = true - не создаём отдельный overlay, только контент
        const panel = new PhysicsPanel(true);
        panel.setGame(this.game!);
        if (this.game!.tank) {
            panel.setTank(this.game!.tank);
        }
        tab.instance = panel;
        // Используем renderToContainer для встраивания контента
        panel.renderToContainer(tab.container);
    }

    private async loadTerminalContent(tab: MenuTab): Promise<void> {
        if (this.game && typeof this.game.ensureChatSystem === "function") {
            await this.game.ensureChatSystem();
        }
        this.renderTerminalContent(tab.container);
    }

    private renderTerminalContent(container: HTMLDivElement): void {
        container.innerHTML = `
            <div class="terminal-content">
                <h3 style="color: #0ff; margin-bottom: 16px;">💻 Системный терминал</h3>
                <div class="terminal-output" id="terminal-output" style="
                    background: rgba(0, 0, 0, 0.8);
                    border: 1px solid #0f0;
                    padding: 12px;
                    height: 300px;
                    overflow-y: auto;
                    font-family: monospace;
                    font-size: 12px;
                    color: #0f0;
                    margin-bottom: 12px;
                ">
                    <div>> Терминал готов к работе</div>
                    <div>> Введите команду и нажмите Enter</div>
                </div>
                <div class="terminal-input-row" style="display: flex; gap: 8px;">
                    <input type="text" id="terminal-input" placeholder="Введите команду..." style="
                        flex: 1;
                        background: rgba(0, 20, 0, 0.8);
                        border: 1px solid #0f0;
                        padding: 8px 12px;
                        color: #0f0;
                        font-family: monospace;
                    ">
                    <button class="panel-btn primary" id="terminal-run">Run</button>
                </div>
            </div>
        `;

        const input = container.querySelector("#terminal-input") as HTMLInputElement;
        const runBtn = container.querySelector("#terminal-run");
        const output = container.querySelector("#terminal-output");

        const executeCommand = () => {
            if (!input || !output) return;
            const cmd = input.value.trim();
            if (!cmd) return;

            const cmdEl = document.createElement("div");
            cmdEl.innerHTML = `<span style="color: #0ff;">></span> ${cmd}`;
            output.appendChild(cmdEl);

            // Простая обработка команд
            const resultEl = document.createElement("div");
            if (cmd === "help") {
                resultEl.innerHTML = "Доступные команды: help, clear, fps, version";
            } else if (cmd === "clear") {
                output.innerHTML = "";
            } else if (cmd === "fps" && this.game?.engine) {
                resultEl.textContent = `FPS: ${this.game.engine.getFps().toFixed(1)}`;
            } else if (cmd === "version") {
                resultEl.textContent = "Protocol TX v1.0";
            } else {
                resultEl.innerHTML = `<span style="color: #f00;">Неизвестная команда: ${cmd}</span>`;
            }
            output.appendChild(resultEl);
            output.scrollTop = output.scrollHeight;
            input.value = "";
        };

        if (runBtn) runBtn.addEventListener("click", executeCommand);
        if (input) input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") executeCommand();
        });
    }

    private async loadSessionContent(tab: MenuTab): Promise<void> {
        const { SessionSettings } = await import("./sessionSettings");
        // embedded = true - не создаём отдельный overlay, только контент
        const settings = new SessionSettings(true);
        settings.setGame(this.game!);
        tab.instance = settings;
        // Используем renderToContainer для встраивания контента
        settings.renderToContainer(tab.container);
    }

    private async loadCheatContent(tab: MenuTab): Promise<void> {
        const { CheatMenu } = await import("./cheatMenu");
        // embedded = true - не создаём отдельный overlay, только контент
        const cheatMenu = new CheatMenu(true);
        cheatMenu.setGame(this.game!);
        if (this.game!.tank) {
            cheatMenu.setTank(this.game!.tank);
        }
        tab.instance = cheatMenu;
        // Используем renderToContainer для встраивания контента
        cheatMenu.renderToContainer(tab.container);
    }

    private async loadNetworkContent(tab: MenuTab): Promise<void> {
        const { NetworkMenu } = await import("./networkMenu");
        // embedded = true - не создаём отдельный overlay, только контент
        const networkMenu = new NetworkMenu(true);
        networkMenu.setGame(this.game!); // Keep this for backward compatibility or internal usage

        // Update game's reference to network menu for dependency injection
        if (this.game) {
            this.game.updateNetworkMenu(networkMenu);
        }
        tab.instance = networkMenu;
        // Используем renderToContainer для встраивания контента
        networkMenu.renderToContainer(tab.container);
    }

    private async loadWorldContent(tab: MenuTab): Promise<void> {
        const { WorldGenerationMenu } = await import("./worldGenerationMenu");
        const worldMenu = new WorldGenerationMenu();
        worldMenu.setGame(this.game!);
        tab.instance = worldMenu;
        // Используем renderToContainer для встраивания контента
        worldMenu.renderToContainer(tab.container);
    }

    private async loadPhysicsEditorContent(tab: MenuTab): Promise<void> {
        const module = await import("./physicsEditor");
        const { getPhysicsEditor } = module;
        const editor = getPhysicsEditor();
        editor.setGame(this.game!);
        if (this.game!.tank) {
            editor.setTank(this.game!.tank);
        }
        tab.instance = editor;
        // Используем renderToContainer для встраивания контента
        editor.renderToContainer(tab.container);
    }

    private setupEventListeners(): void {
        // Обработчик закрытия
        const closeBtn = document.getElementById("unified-menu-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => this.hide());
        }

        // Закрытие по клику на overlay
        this.container?.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });

        // Закрытие по ESC
        const handleKeyDown = (e: KeyboardEvent) => {
            if (this.isVisible && e.code === "Escape") {
                e.preventDefault();
                this.hide();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
    }

    private injectStyles(): void {
        if (document.getElementById("unified-menu-styles")) return;

        const style = document.createElement("style");
        style.id = "unified-menu-styles";
        style.textContent = `
            .unified-panel {
                width: 900px;
                max-width: 95vw;
                height: 650px;
                max-height: 90vh;
                background: rgba(0, 10, 0, 0.98);
                border: 2px solid rgba(0, 255, 4, 0.6);
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 30px rgba(0, 255, 0, 0.4);
            }

            .unified-header {
                background: linear-gradient(180deg, rgba(0, 25, 0, 0.95) 0%, rgba(0, 15, 0, 0.98) 100%);
                padding: 14px 18px;
                border-bottom: 2px solid rgba(0, 255, 4, 0.4);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .unified-title {
                color: #0ff;
                font-size: 18px;
                font-weight: bold;
                text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
                font-family: Consolas, Monaco, 'Courier New', monospace;
            }

            .unified-body {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            /* Sidebar */
            .unified-sidebar {
                width: 160px;
                background: rgba(0, 15, 0, 0.6);
                border-right: 1px solid rgba(0, 255, 4, 0.3);
                display: flex;
                flex-direction: column;
            }

            .sidebar-title {
                padding: 14px 12px;
                color: #7f7;
                font-size: 12px;
                font-weight: bold;
                letter-spacing: 1px;
                border-bottom: 1px solid rgba(0, 255, 4, 0.2);
            }

            .sidebar-categories {
                flex: 1;
                overflow-y: auto;
            }

            .sidebar-item {
                padding: 12px 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                border-bottom: 1px solid rgba(0, 255, 4, 0.1);
            }

            .sidebar-item:hover {
                background: rgba(0, 255, 4, 0.1);
            }

            .sidebar-item.active {
                background: rgba(0, 255, 4, 0.2);
                border-left: 3px solid #0f0;
            }

            .sidebar-icon {
                font-size: 16px;
            }

            .sidebar-name {
                color: #0f0;
                font-size: 13px;
                font-family: Consolas, Monaco, 'Courier New', monospace;
            }

            /* Main content area */
            .unified-main {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }

            /* Tab bar */
            .unified-tabbar {
                background: rgba(0, 20, 0, 0.8);
                border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                min-height: 42px;
            }

            .tab-list {
                display: flex;
                gap: 4px;
                padding: 6px 10px;
                overflow-x: auto;
            }

            .tab-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 14px;
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px 4px 0 0;
                cursor: pointer;
                transition: all 0.2s ease;
                white-space: nowrap;
            }

            .tab-item:hover {
                background: rgba(0, 50, 0, 0.7);
            }

            .tab-item.active {
                background: rgba(0, 60, 0, 0.8);
                border-bottom-color: transparent;
            }

            .tab-icon {
                font-size: 14px;
            }

            .tab-name {
                color: #0f0;
                font-size: 12px;
                font-family: Consolas, Monaco, 'Courier New', monospace;
            }

            .tab-close {
                color: #f00;
                font-size: 14px;
                line-height: 1;
                padding: 0 4px;
                cursor: pointer;
                opacity: 0.6;
                transition: opacity 0.2s;
            }

            .tab-close:hover {
                opacity: 1;
            }

            /* Content area */
            .unified-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                position: relative;
            }

            .content-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100%;
                color: #7f7;
            }

            .empty-icon {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
            }

            .empty-text {
                text-align: center;
                font-size: 14px;
                line-height: 1.6;
            }

            .tab-content {
                color: #0f0;
                font-family: Consolas, Monaco, 'Courier New', monospace;
            }

            .tab-loading {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 200px;
                color: #7f7;
            }

            .tab-error {
                color: #f00;
                padding: 20px;
                text-align: center;
            }

            /* Help content styles */
            .help-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }

            .help-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                background: rgba(0, 30, 0, 0.5);
                border-radius: 4px;
            }

            .help-item .key {
                background: rgba(0, 255, 4, 0.2);
                border: 1px solid rgba(0, 255, 4, 0.5);
                padding: 4px 8px;
                border-radius: 3px;
                font-size: 11px;
                color: #0ff;
                min-width: 60px;
                text-align: center;
            }

            .help-item .desc {
                color: #7f7;
                font-size: 12px;
            }

            /* Debug metrics */
            .debug-metrics {
                background: rgba(0, 20, 0, 0.6);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
                padding: 12px;
            }

            .metric-row {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                border-bottom: 1px solid rgba(0, 255, 4, 0.1);
            }

            .metric-label {
                color: #7f7;
            }

            /* Cheat grid */
            .cheat-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }

            .cheat-btn {
                padding: 12px !important;
                text-align: left;
            }

            /* Settings rows */
            .setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 0;
                border-bottom: 1px solid rgba(0, 255, 4, 0.1);
            }

            .setting-label {
                color: #7f7;
                font-size: 12px;
            }

            /* Network status */
            .network-status {
                background: rgba(0, 20, 0, 0.6);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-radius: 4px;
                padding: 12px;
            }

            .status-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
            }

            .status-label {
                color: #7f7;
            }

            /* Scrollbar */
            .unified-content::-webkit-scrollbar,
            .sidebar-categories::-webkit-scrollbar {
                width: 6px;
            }

            .unified-content::-webkit-scrollbar-track,
            .sidebar-categories::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.3);
            }

            .unified-content::-webkit-scrollbar-thumb,
            .sidebar-categories::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: 3px;
            }

            .unified-content::-webkit-scrollbar-thumb:hover,
            .sidebar-categories::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 4, 0.6);
            }
        `;
        document.head.appendChild(style);
    }
}



