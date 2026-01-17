// Enhanced Chat System - система логов и оповещений в стиле терминала
import { Scene } from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, ScrollViewer } from "@babylonjs/gui";
import { CommandSystem } from "./commandSystem";
import { LogLevel, loggingSettings } from "./utils/logger";

export type MessageType = "system" | "info" | "warning" | "error" | "success" | "log" | "combat" | "economy";

export interface ChatMessage {
    text: string;
    type: MessageType;
    color: string;
    timestamp: number;
    icon: string;
    priority: number; // 0 = normal, 1 = important, 2 = critical
}

export class ChatSystem {
    private guiTexture: AdvancedDynamicTexture;
    private chatContainer: Rectangle | null = null;
    private messages: ChatMessage[] = [];
    private maxMessages = 50; // Увеличено количество сообщений
    private messageElements: Map<number, TextBlock> = new Map();
    private scrollViewer: ScrollViewer | null = null;
    private messagesArea: Rectangle | null = null;

    // Настройки
    private autoScroll = true;
    private showTimestamps = true;
    private messageLifetime = 30000; // 30 секунд для обычных сообщений
    private importantMessageLifetime = 60000; // 60 секунд для важных

    // Звуковые уведомления
    private soundManager: any = null;

    // Фильтры сообщений
    private activeFilters: Set<MessageType> = new Set(["system", "info", "warning", "error", "success", "log", "combat", "economy"]);
    private filterButtons: Map<MessageType, Rectangle> = new Map();

    // Группировка сообщений
    private messageGroups: Map<string, { count: number, lastTime: number }> = new Map();
    private groupTimeout = 2000; // 2 секунды для группировки

    // Анимации
    private animationTime = 0;

    // Поиск
    private searchText: string = "";
    private searchActive = false;

    // Command system
    private commandSystem: CommandSystem | null = null;
    private scriptEngine: any = null; // Lazy loaded from "./scriptEngine"
    private themeManager: any = null; // Lazy loaded from "./terminalTheme"
    private automation: any = null; // Lazy loaded from "./terminalAutomation"
    private commandInput: HTMLInputElement | null = null;
    private _commandHistory: string[] = [];
    private _commandHistoryIndex: number = -1;

    private game: any = null;
    public onMessageSent: ((message: string) => void) | null = null;

    constructor(scene: Scene) {
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ChatUI", false, scene);
        this.guiTexture.isForeground = true;
        this.commandSystem = new CommandSystem();
        this.initThemeManager();
        this.createChatUI();
        this.startCleanupTimer();
    }

    /**
     * Инициализация ThemeManager (ленивая загрузка)
     */
    private async initThemeManager(): Promise<void> {
        if (!this.themeManager) {
            const { TerminalThemeManager } = await import("./terminalTheme");
            this.themeManager = new TerminalThemeManager();
        }
    }

    setGame(game: any): void {
        this.game = game;
        if (this.commandSystem) {
            this.commandSystem.setGame(game);
        }
        this.initAutomation();
    }

    /**
     * Инициализация Automation (ленивая загрузка)
     */
    private async initAutomation(): Promise<void> {
        if (!this.automation && this.commandSystem) {
            const { TerminalAutomation } = await import("./terminalAutomation");
            this.automation = new TerminalAutomation(this.commandSystem);
            if (this.game) {
                this.automation.setGame(this.game);
            }
        }
    }

    /**
     * Инициализация ScriptEngine (ленивая загрузка)
     */
    private async initScriptEngine(): Promise<void> {
        if (!this.scriptEngine && this.commandSystem) {
            const { ScriptEngine } = await import("./scriptEngine");
            this.scriptEngine = new ScriptEngine(this.commandSystem);
        }
    }

    setSoundManager(soundManager: any) {
        this.soundManager = soundManager;
    }

    private createChatUI(): void {
        // === SYSTEM TERMINAL - ПРОЗРАЧНЫЙ, ПРЯМОУГОЛЬНЫЙ, СВОРАЧИВАЕМЫЙ ===
        // Удаляем старый терминал, если он существует
        const existingTerminal = document.getElementById("system-terminal");
        if (existingTerminal) {
            existingTerminal.remove();
        }

        // Автоматически очищаем некорректные сохраненные данные
        try {
            const key = `window_position_system-terminal`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const data = JSON.parse(saved);
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;

                // Если размеры больше 80% экрана - это некорректно, очищаем
                if (data.width && (data.width > screenWidth * 0.8 || data.width > 1200)) {
                    // Clearing invalid terminal width
                    localStorage.removeItem(key);
                } else if (data.height && (data.height > screenHeight * 0.8 || data.height > 800)) {
                    // Clearing invalid terminal height
                    localStorage.removeItem(key);
                }
            }
        } catch (e) {
            // Если ошибка при чтении - очищаем
            try {
                localStorage.removeItem(`window_position_system-terminal`);
            } catch { }
        }

        // Загружаем сохраненные позицию и размер
        const savedPosition = this.loadWindowPosition("system-terminal");

        // Calculate scale factor for responsive sizing
        const baseWidth = 1920;
        const baseHeight = 1080;
        const scaleFactor = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight, 1.5);

        // Ограничиваем размеры экраном для предотвращения перекрытия всего экрана
        const maxWidth = Math.min(window.innerWidth - 20, 1200);
        const maxHeight = Math.min(window.innerHeight - 40, 800);

        let defaultLeft = savedPosition?.left ?? 10;
        let defaultTop = savedPosition?.top ?? 120;
        let defaultWidth = savedPosition?.width ?? 500;
        let defaultHeight = savedPosition?.height ?? 250;
        const defaultCollapsed = savedPosition?.collapsed !== undefined ? savedPosition.collapsed : true;

        // Проверяем и ограничиваем размеры
        if (defaultWidth > maxWidth) {
            defaultWidth = maxWidth;
            // Сохраняем исправленный размер
            if (savedPosition) {
                savedPosition.width = defaultWidth;
                this.saveWindowPosition("system-terminal", savedPosition);
            }
        }
        if (defaultWidth < 300) defaultWidth = 300;
        if (defaultHeight > maxHeight) {
            defaultHeight = maxHeight;
            // Сохраняем исправленный размер
            if (savedPosition) {
                savedPosition.height = defaultHeight;
                this.saveWindowPosition("system-terminal", savedPosition);
            }
        }
        if (defaultHeight < 150) defaultHeight = 150;

        // Проверяем позицию, чтобы терминал не выходил за границы экрана
        if (defaultLeft < 0) defaultLeft = 10;
        if (defaultLeft + defaultWidth > window.innerWidth) defaultLeft = window.innerWidth - defaultWidth - 10;
        if (defaultTop < 0) defaultTop = 10;
        if (defaultTop + defaultHeight > window.innerHeight) defaultTop = window.innerHeight - defaultHeight - 10;

        // Создаём HTML контейнер для перетаскивания и изменения размера
        const htmlContainer = document.createElement("div");
        htmlContainer.id = "system-terminal";
        // Use relative units for scalable sizing (scaleFactor уже объявлен выше)
        const scaledWidth = Math.max(300, Math.min(1200, defaultWidth * scaleFactor));
        const scaledHeight = Math.max(150, Math.min(800, defaultHeight * scaleFactor));
        const scaledLeft = defaultLeft * scaleFactor;
        const scaledTop = defaultTop * scaleFactor;

        htmlContainer.style.cssText = `
            position: fixed;
            left: ${scaledLeft}px;
            top: ${scaledTop}px;
            width: ${scaledWidth}px;
            height: ${defaultCollapsed ? `${30 * scaleFactor}px` : `${scaledHeight}px`};
            background: rgba(0, 10, 0, 0.95);
            border: ${2 * scaleFactor}px solid rgba(0, 255, 4, 0.6);
            border-radius: ${4 * scaleFactor}px;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: clamp(10px, 1.1vw, 12px);
            z-index: 10000;
            cursor: default;
            user-select: none;
            box-shadow: 0 0 ${15 * scaleFactor}px rgba(0, 255, 0, 0.4), inset 0 0 ${20 * scaleFactor}px rgba(0, 10, 0, 0.5);
            transform-origin: top;
            pointer-events: auto;
            display: block;
            transition: all 0.3s ease;
            backdrop-filter: blur(4px);
        `;
        document.body.appendChild(htmlContainer);

        // Состояние сворачивания
        let isCollapsed = defaultCollapsed;

        // Заголовок для перетаскивания
        const header = document.createElement("div");
        const headerHeight = 30 * scaleFactor;
        header.style.cssText = `
            width: 100%;
            height: ${headerHeight}px;
            background: linear-gradient(180deg, rgba(0, 20, 0, 0.9) 0%, rgba(0, 10, 0, 0.95) 100%);
            border-bottom: ${2 * scaleFactor}px solid rgba(0, 255, 4, 0.4);
            display: flex;
            align-items: center;
            padding: 0 ${10 * scaleFactor}px;
            cursor: move;
            position: relative;
            z-index: 10001;
            box-sizing: border-box;
            overflow: hidden;
            border-radius: ${4 * scaleFactor}px ${4 * scaleFactor}px 0 0;
        `;
        htmlContainer.appendChild(header);

        const headerText = document.createElement("span");
        headerText.textContent = isCollapsed ? "> SYSTEM TERMINAL [COLLAPSED]" : "> SYSTEM TERMINAL [ACTIVE]";
        headerText.style.cssText = `
            color: #0ff;
            font-size: clamp(11px, 1.3vw, 14px);
            font-weight: bold;
            flex: 1;
            text-shadow: 0 0 ${4 * scaleFactor}px rgba(0, 255, 255, 0.6);
            letter-spacing: ${0.5 * scaleFactor}px;
        `;
        header.appendChild(headerText);

        // Область сообщений
        const messagesDiv = document.createElement("div");
        messagesDiv.id = "terminal-messages";
        messagesDiv.style.cssText = `
            width: 100%;
            height: calc(100% - ${headerHeight}px - ${60 * scaleFactor}px);
            overflow-y: auto;
            padding: ${8 * scaleFactor}px;
            font-size: clamp(10px, 1.1vw, 12px);
            color: #0f0;
            display: ${isCollapsed ? 'none' : 'block'};
            background: rgba(0, 5, 0, 0.3);
            font-family: Consolas, Monaco, 'Courier New', monospace;
            line-height: 1.5;
            scrollbar-width: thin;
            scrollbar-color: rgba(0, 255, 4, 0.4) rgba(0, 10, 0, 0.2);
        `;

        // Стилизация скроллбара для WebKit
        const scrollbarStyle = document.createElement('style');
        scrollbarStyle.textContent = `
            #terminal-messages::-webkit-scrollbar {
                width: ${8 * scaleFactor}px;
            }
            #terminal-messages::-webkit-scrollbar-track {
                background: rgba(0, 10, 0, 0.2);
            }
            #terminal-messages::-webkit-scrollbar-thumb {
                background: rgba(0, 255, 4, 0.4);
                border-radius: ${4 * scaleFactor}px;
            }
            #terminal-messages::-webkit-scrollbar-thumb:hover {
                background: rgba(0, 255, 4, 0.6);
            }
        `;
        document.head.appendChild(scrollbarStyle);
        htmlContainer.appendChild(messagesDiv);
        (htmlContainer as any)._messagesDiv = messagesDiv;

        // Поле ввода команд
        const commandInput = document.createElement("input");
        commandInput.type = "text";
        commandInput.id = "terminal-command-input";
        commandInput.placeholder = "Enter command... (type 'help' for commands)";
        commandInput.style.cssText = `
            width: 100%;
            height: ${30 * scaleFactor}px;
            padding: ${4 * scaleFactor}px ${8 * scaleFactor}px;
            background: rgba(0, 5, 0, 0.8);
            border: ${1 * scaleFactor}px solid rgba(0, 255, 4, 0.4);
            border-top: ${2 * scaleFactor}px solid rgba(0, 255, 4, 0.6);
            color: #0f0;
            font-family: Consolas, Monaco, 'Courier New', monospace;
            font-size: clamp(10px, 1.1vw, 12px);
            outline: none;
            display: ${isCollapsed ? 'none' : 'block'};
        `;
        htmlContainer.appendChild(commandInput);
        this.commandInput = commandInput;

        // Обработка ввода команд
        commandInput.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                const command = commandInput.value.trim();
                if (command) {
                    // Добавляем команду в историю
                    this.addToHistory(command);
                    commandInput.value = "";
                    await this.executeCommand(command);
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                // Используем собственную историю команд
                const history = this.getHistory('up');
                if (history !== null) {
                    commandInput.value = history;
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                // Используем собственную историю команд
                const history = this.getHistory('down');
                if (history !== null) {
                    commandInput.value = history;
                } else {
                    commandInput.value = "";
                }
            } else if (e.key === "Tab") {
                e.preventDefault();
                const current = commandInput.value;
                const matches = this.commandSystem?.autocomplete(current) || [];
                if (matches.length === 1) {
                    commandInput.value = matches[0] + " ";
                } else if (matches.length > 1) {
                    // Показываем подсказки
                    this.addMessage(`Available: ${matches.join(", ")}`, "info");
                }
            } else if (e.ctrlKey && e.key === "r") {
                // Ctrl+R - начать/остановить запись макроса
                e.preventDefault();
                await this.toggleMacroRecording();
            }
        });

        // Область для расходников (внизу терминала)
        const consumablesArea = document.createElement("div");
        consumablesArea.id = "terminal-consumables";
        consumablesArea.style.cssText = `
            width: 100%;
            height: ${60 * scaleFactor}px;
            border-top: ${2 * scaleFactor}px solid #0f0;
            display: ${isCollapsed ? 'none' : 'flex'};
            justify-content: center;
            align-items: center;
            gap: ${4 * scaleFactor}px;
            padding: ${5 * scaleFactor}px;
        `;
        htmlContainer.appendChild(consumablesArea);
        (htmlContainer as any)._consumablesArea = consumablesArea;

        // Единая система обработки событий мыши
        let isDragging = false;
        let isResizing = false;
        let dragStart = { x: 0, y: 0 };
        let resizeStart = { x: 0, y: 0, width: 0, height: 0 };
        let resizeEdge: 'right' | 'bottom' | 'corner' | null = null;

        // Создаём элементы для изменения размера ПЕРЕД обработчиком кнопки сворачивания
        const resizeHandle = document.createElement("div");
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            z-index: 10002;
            background: transparent;
            display: ${isCollapsed ? 'none' : 'block'};
        `;
        htmlContainer.appendChild(resizeHandle);

        // Обработчик изменения размера (правый нижний угол)
        resizeHandle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeEdge = 'corner';
            const rect = htmlContainer.getBoundingClientRect();
            resizeStart.x = e.clientX;
            resizeStart.y = e.clientY;
            resizeStart.width = rect.width;
            resizeStart.height = rect.height;
            document.body.style.cursor = "nwse-resize";
            document.body.style.userSelect = "none";
        });

        // Обработчик изменения размера (правый край)
        const resizeRightHandle = document.createElement("div");
        resizeRightHandle.style.cssText = `
            position: absolute;
            top: 30px;
            right: 0;
            width: 5px;
            height: calc(100% - 30px);
            cursor: ew-resize;
            z-index: 10002;
            background: transparent;
            display: ${isCollapsed ? 'none' : 'block'};
        `;
        htmlContainer.appendChild(resizeRightHandle);

        resizeRightHandle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeEdge = 'right';
            const rect = htmlContainer.getBoundingClientRect();
            resizeStart.x = e.clientX;
            resizeStart.width = rect.width;
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";
        });

        // Обработчик изменения размера (нижний край)
        const resizeBottomHandle = document.createElement("div");
        resizeBottomHandle.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            width: calc(100% - 20px);
            height: 5px;
            cursor: ns-resize;
            z-index: 10002;
            background: transparent;
            display: ${isCollapsed ? 'none' : 'block'};
        `;
        htmlContainer.appendChild(resizeBottomHandle);

        resizeBottomHandle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            isResizing = true;
            resizeEdge = 'bottom';
            const rect = htmlContainer.getBoundingClientRect();
            resizeStart.y = e.clientY;
            resizeStart.height = rect.height;
            document.body.style.cursor = "ns-resize";
            document.body.style.userSelect = "none";
        });

        // Кнопка сворачивания/разворачивания (в правом верхнем углу терминала)
        const collapseBtn = document.createElement("button");
        collapseBtn.textContent = isCollapsed ? "▼" : "▲";
        collapseBtn.style.cssText = `
            position: absolute;
            top: 2px;
            right: 2px;
            background: rgba(0, 255, 4, 0.2);
            border: 1px solid rgba(0, 255, 4, 0.6);
            color: #0ff;
            width: 22px;
            height: 20px;
            cursor: pointer;
            font-size: 10px;
            line-height: 1;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            flex-shrink: 0;
            box-sizing: border-box;
            z-index: 10003;
            border-radius: ${2 * scaleFactor}px;
        `;
        collapseBtn.addEventListener("mouseenter", () => {
            collapseBtn.style.background = "rgba(0, 255, 4, 0.4)";
            collapseBtn.style.borderColor = "#0ff";
            collapseBtn.style.transform = "scale(1.1)";
        });
        collapseBtn.addEventListener("mouseleave", () => {
            collapseBtn.style.background = "rgba(0, 255, 4, 0.2)";
            collapseBtn.style.borderColor = "rgba(0, 255, 4, 0.6)";
            collapseBtn.style.transform = "scale(1)";
        });
        collapseBtn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });
        collapseBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            isCollapsed = !isCollapsed;

            if (isCollapsed) {
                messagesDiv.style.display = "none";
                consumablesArea.style.display = "none";
                if (this.commandInput) this.commandInput.style.display = "none";
                htmlContainer.style.height = "30px";
                collapseBtn.textContent = "▼";
                headerText.textContent = "> SYSTEM TERMINAL [COLLAPSED]";
                // Скрываем элементы изменения размера при сворачивании
                resizeHandle.style.display = 'none';
                resizeRightHandle.style.display = 'none';
                resizeBottomHandle.style.display = 'none';
            } else {
                const savedHeight = parseInt(htmlContainer.style.height) || defaultHeight;
                htmlContainer.style.height = `${savedHeight}px`;
                messagesDiv.style.display = "block";
                consumablesArea.style.display = "flex";
                if (commandInput) commandInput.style.display = "block";
                collapseBtn.textContent = "▲";
                headerText.textContent = "> SYSTEM TERMINAL [ACTIVE]";
                // Показываем элементы изменения размера при разворачивании
                resizeHandle.style.display = 'block';
                resizeRightHandle.style.display = 'block';
                resizeBottomHandle.style.display = 'block';
            }

            this.saveWindowPosition("system-terminal", {
                left: parseInt(htmlContainer.style.left) || defaultLeft,
                top: parseInt(htmlContainer.style.top) || defaultTop,
                bottom: null,
                width: parseInt(htmlContainer.style.width) || defaultWidth,
                height: isCollapsed ? 30 : parseInt(htmlContainer.style.height) || defaultHeight,
                collapsed: isCollapsed
            });
        });
        // Добавляем кнопку в контейнер терминала (не в header) для absolute positioning
        htmlContainer.appendChild(collapseBtn);

        // Перетаскивание за header
        header.addEventListener("mousedown", (e) => {
            const target = e.target as HTMLElement;
            // Не перетаскиваем, если клик по кнопке сворачивания или по элементам изменения размера
            if (target === collapseBtn || collapseBtn.contains(target) ||
                target === resizeHandle || target === resizeRightHandle || target === resizeBottomHandle) return;
            isDragging = true;
            const rect = htmlContainer.getBoundingClientRect();
            dragStart.x = e.clientX - rect.left;
            dragStart.y = e.clientY - rect.top;
            e.preventDefault();
        });

        // Предотвращаем перетаскивание при клике на кнопку
        collapseBtn.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });

        // Единый обработчик mousemove
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing && !isCollapsed) {
                const deltaX = e.clientX - resizeStart.x;
                const deltaY = e.clientY - resizeStart.y;

                let newWidth = resizeStart.width;
                let newHeight = resizeStart.height;

                const maxWidth = Math.min(window.innerWidth - 20, 1200);
                const maxHeight = Math.min(window.innerHeight - 40, 800);

                if (resizeEdge === 'right' || resizeEdge === 'corner') {
                    newWidth = Math.max(300, Math.min(maxWidth, resizeStart.width + deltaX));
                }
                if (resizeEdge === 'bottom' || resizeEdge === 'corner') {
                    newHeight = Math.max(150, Math.min(maxHeight, resizeStart.height + deltaY));
                }

                htmlContainer.style.width = `${newWidth}px`;
                htmlContainer.style.height = `${newHeight}px`;
            } else if (isDragging) {
                // Ограничиваем перетаскивание границами экрана
                let newLeft = e.clientX - dragStart.x;
                let newTop = e.clientY - dragStart.y;

                const rect = htmlContainer.getBoundingClientRect();
                const minLeft = 0;
                const minTop = 0;
                const maxLeft = window.innerWidth - rect.width;
                const maxTop = window.innerHeight - (isCollapsed ? 30 : rect.height);

                newLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
                newTop = Math.max(minTop, Math.min(maxTop, newTop));

                htmlContainer.style.left = `${newLeft}px`;
                htmlContainer.style.top = `${newTop}px`;
            }
        };

        // Единый обработчик mouseup
        const handleMouseUp = () => {
            if (isDragging || isResizing) {
                const rect = htmlContainer.getBoundingClientRect();
                this.saveWindowPosition("system-terminal", {
                    left: rect.left,
                    top: rect.top,
                    bottom: null,
                    width: rect.width,
                    height: rect.height,
                    collapsed: isCollapsed
                });
            }
            isDragging = false;
            isResizing = false;
            resizeEdge = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        // Сохраняем ссылку на HTML контейнер
        (this as any)._htmlContainer = htmlContainer;

        // Создаём GUI контейнер для совместимости (скрыт)
        this.chatContainer = new Rectangle("chatContainer");
        this.chatContainer.isVisible = false;
        this.guiTexture.addControl(this.chatContainer);

        // Область сообщений с прокруткой
        this.scrollViewer = new ScrollViewer("chatScrollViewer");
        this.scrollViewer.isVisible = false;
        this.chatContainer.addControl(this.scrollViewer);

        // Контейнер для сообщений
        this.messagesArea = new Rectangle("messagesArea");
        this.messagesArea.width = 1;
        this.messagesArea.height = "1px";
        this.messagesArea.cornerRadius = 0;
        this.messagesArea.thickness = 0;
        this.messagesArea.background = "#00000000";
        this.scrollViewer.addControl(this.messagesArea);

        // Запуск анимаций
        this.startAnimations();
    }

    // Обновить расходники в System Terminal
    updateConsumables(consumables: Map<number, any>): void {
        const htmlContainer = (this as any)._htmlContainer as HTMLDivElement;
        if (!htmlContainer) return;

        const consumablesArea = htmlContainer.querySelector("#terminal-consumables") as HTMLDivElement;
        if (!consumablesArea) return;

        // Вычисляем scaleFactor для текущего размера экрана
        const scaleFactor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080, 1.5);

        // Очищаем старые слоты
        consumablesArea.innerHTML = "";

        // Создаём слоты расходников
        for (let i = 1; i <= 5; i++) {
            const slotSize = 40 * scaleFactor;
            const slot = document.createElement("div");
            slot.style.cssText = `
                width: ${slotSize}px;
                height: ${slotSize}px;
                border: ${1 * scaleFactor}px solid #555;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                position: relative;
            `;

            const consumable = consumables.get(i);
            if (consumable) {
                slot.style.borderColor = consumable.color || "#0f0";

                // Номер клавиши
                const key = document.createElement("div");
                key.textContent = `${i}`;
                key.style.cssText = `
                    position: absolute;
                    top: ${2 * scaleFactor}px;
                    left: ${2 * scaleFactor}px;
                    color: #666;
                    font-size: clamp(7px, 0.8vw, 9px);
                    font-weight: bold;
                `;
                slot.appendChild(key);

                // Иконка
                const icon = document.createElement("div");
                icon.textContent = consumable.icon || "?";
                icon.style.cssText = `
                    color: #fff;
                    font-size: clamp(14px, 1.5vw, 18px);
                `;
                slot.appendChild(icon);

                // Название
                const name = document.createElement("div");
                name.textContent = consumable.name || "";
                name.style.cssText = `
                    position: absolute;
                    bottom: 2px;
                    font-size: 6px;
                    color: #888;
                `;
                slot.appendChild(name);
            } else {
                // Пустой слот
                const key = document.createElement("div");
                key.textContent = `${i}`;
                key.style.cssText = `
                    position: absolute;
                    top: 2px;
                    left: 2px;
                    color: #333;
                    font-size: 9px;
                `;
                slot.appendChild(key);
            }

            consumablesArea.appendChild(slot);
        }
    }

    // Создать кнопки фильтров (зарезервировано для будущего использования)
    // @ts-ignore - метод зарезервирован для будущей реализации
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createFilterButtons(): void {
        // Метод зарезервирован для будущей реализации фильтров
        if (!this.chatContainer) return;

        const filterContainer = new Rectangle("filterContainer");
        filterContainer.width = 1;
        filterContainer.height = "25px";
        filterContainer.cornerRadius = 0;
        filterContainer.thickness = 0;
        filterContainer.background = "#00000088";
        filterContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        filterContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        filterContainer.top = "30px";
        this.chatContainer.addControl(filterContainer);

        const types: MessageType[] = ["system", "info", "warning", "error", "success", "combat", "economy"];
        const icons = ["⚙", "ℹ", "⚠", "✖", "✓", "⚔", "💰"];

        types.forEach((type, index) => {
            const button = new Rectangle(`filter_${type}`);
            button.width = "50px";
            button.height = "20px";
            button.cornerRadius = 0;
            button.thickness = 1;
            button.color = this.getColorForType(type);
            button.background = this.activeFilters.has(type) ? "#000000aa" : "#00000044";
            button.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            button.left = `${5 + index * 55}px`;
            button.top = "2px";

            const buttonText = new TextBlock(`filterText_${type}`);
            buttonText.text = icons[index] ?? "";
            buttonText.color = this.getColorForType(type);
            buttonText.fontSize = 10;
            buttonText.fontFamily = "Courier New, monospace";
            button.addControl(buttonText);

            // Обработчик клика
            button.onPointerClickObservable.add(() => {
                if (this.activeFilters.has(type)) {
                    this.activeFilters.delete(type);
                    button.background = "#00000044";
                } else {
                    this.activeFilters.add(type);
                    button.background = "#000000aa";
                }
                this.updateMessages();
            });

            filterContainer.addControl(button);
            this.filterButtons.set(type, button);
        });
    }

    // Запуск анимаций (теперь вызывается из централизованного update)
    private startAnimations(): void {
        // Анимации теперь обновляются через update() метод
    }

    // Обновление анимаций (вызывается из централизованного update)
    update(deltaTime: number): void {
        this.animationTime += deltaTime;
        this.updateActivityIndicator();
    }

    // Обновить индикатор активности
    private updateActivityIndicator(): void {
        // activityIndicator удален
    }

    // Сохранение позиции и размера окна
    private saveWindowPosition(windowId: string, position: { left: number; top: number | null; bottom: number | null; width: number; height: number; collapsed: boolean }): void {
        try {
            // Проверяем корректность данных перед сохранением
            const maxWidth = Math.min(window.innerWidth - 20, 1200);
            const maxHeight = Math.min(window.innerHeight - 40, 800);

            // Ограничиваем размеры
            if (position.width > maxWidth) position.width = maxWidth;
            if (position.width < 300) position.width = 300;
            if (position.height > maxHeight) position.height = maxHeight;
            if (position.height < 150) position.height = 150;

            // Проверяем позицию
            if (position.left < 0) position.left = 10;
            if (position.left + position.width > window.innerWidth) position.left = window.innerWidth - position.width - 10;
            if (position.top !== null && position.top < 0) position.top = 10;
            if (position.top !== null && position.top + position.height > window.innerHeight) position.top = window.innerHeight - position.height - 10;

            const key = `window_position_${windowId}`;
            localStorage.setItem(key, JSON.stringify(position));
        } catch (e) {
            if (loggingSettings?.getLevel() >= LogLevel.DEBUG) {
                console.debug("[Chat] Failed to save window position:", e);
            }
        }
    }

    // Загрузка позиции и размера окна
    private loadWindowPosition(windowId: string): { left: number; top: number | null; bottom: number | null; width: number; height: number; collapsed: boolean } | null {
        try {
            const key = `window_position_${windowId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                const data = JSON.parse(saved);

                // Проверяем корректность данных и сбрасываем, если они некорректны
                const maxWidth = Math.min(window.innerWidth - 20, 1200);
                const maxHeight = Math.min(window.innerHeight - 40, 800);

                // Если размеры слишком большие (больше 80% экрана), сбрасываем
                if (data.width && (data.width > maxWidth || data.width > window.innerWidth * 0.8)) {
                    if (loggingSettings?.getLevel() >= LogLevel.DEBUG) {
                        console.debug("[Chat] Invalid saved width, resetting");
                    }
                    localStorage.removeItem(key);
                    return null;
                }
                if (data.height && (data.height > maxHeight || data.height > window.innerHeight * 0.8)) {
                    console.warn("[ChatSystem] Invalid saved height, resetting");
                    localStorage.removeItem(key);
                    return null;
                }

                return data;
            }
        } catch (e) {
            console.warn("[ChatSystem] Failed to load window position:", e);
            // Удаляем некорректные данные
            try {
                const key = `window_position_${windowId}`;
                localStorage.removeItem(key);
            } catch { }
        }
        return null;
    }

    // Добавить сообщение с типом
    addMessage(text: string, type: MessageType = "system", priority: number = 0): void {
        const message: ChatMessage = {
            text: text,
            type: type,
            color: this.getColorForType(type),
            timestamp: Date.now(),
            icon: this.getIconForType(type),
            priority: priority
        };

        this.messages.push(message);

        // Ограничиваем количество сообщений
        if (this.messages.length > this.maxMessages) {
            const removed = this.messages.shift();
            if (removed) {
                const element = this.messageElements.get(removed.timestamp);
                if (element) {
                    element.dispose();
                    this.messageElements.delete(removed.timestamp);
                }
            }
        }

        // Звуковое уведомление для важных сообщений
        if (priority >= 1 && this.soundManager) {
            try {
                if (type === "error") {
                    this.soundManager.playError();
                } else if (type === "warning") {
                    this.soundManager.playWarning();
                } else if (type === "success") {
                    this.soundManager.playSuccess();
                }
            } catch (e) {
                console.warn("[ChatSystem] Sound error:", e);
            }
        }

        // Группировка одинаковых сообщений
        const messageKey = `${type}:${text}`;
        const existingGroup = this.messageGroups.get(messageKey);
        if (existingGroup && Date.now() - existingGroup.lastTime < this.groupTimeout) {
            existingGroup.count++;
            existingGroup.lastTime = Date.now();
            // Обновляем последнее сообщение с счётчиком
            const lastMessage = this.messages[this.messages.length - 1];
            if (lastMessage && lastMessage.text === text && lastMessage.type === type) {
                lastMessage.text = `${text} (x${existingGroup.count})`;
            }
        } else {
            this.messageGroups.set(messageKey, { count: 1, lastTime: Date.now() });
        }

        // Очистка старых групп
        this.messageGroups.forEach((group, key) => {
            if (Date.now() - group.lastTime > this.groupTimeout * 2) {
                this.messageGroups.delete(key);
            }
        });

        this.updateMessages();
    }

    // Устаревший метод для совместимости
    addMessageOld(text: string, _sender: string = "System", color: string = "#0f0"): void {
        let type: MessageType = "system";
        if (color === "#f00") type = "error";
        else if (color === "#ff0") type = "warning";
        else if (color === "#0f0") type = "success";
        else if (color === "#0ff") type = "info";

        this.addMessage(text, type, 0);
    }

    /**
     * Выполнение команды
     */
    private async executeCommand(command: string): Promise<void> {
        if (!this.commandSystem) return;

        // Показываем введённую команду
        this.addMessage(`> ${command}`, "system");

        // Запись в макрос (если запись активна)
        if (this.scriptEngine && (this.scriptEngine as any).isRecording) {
            (this.scriptEngine as any).recordCommand(command);
        }

        try {
            // Если сообщение не начинается с /, считаем его чатом
            if (!command.startsWith('/') && !command.startsWith('theme ') && !command.startsWith('script ') && !command.startsWith('macro ')) {
                if (this.onMessageSent) {
                    this.onMessageSent(command);
                    // Добавляем сообщение локально для мгновенного отклика (опционально, сервер пришлет обратно)
                    // Но лучше ждать сервер
                    return;
                }
            }

            // Убираем / если есть, для обработки локальных команд
            // Но CommandSystem может ожидать команды без слэша.
            // Стандартное поведение: CommandSystem обрабатывает "help", "god", etc.
            // Значит если строка начинается с /, убираем его и передаем в CommandSystem.
            // Если не начинается с / (и не обработано выше как чат), то это может быть system command?
            // Предположим, что CommandSystem обрабатывает всё что ей дали. 
            // Но мы решили что текст без / это чат.

            let commandToExecute = command;
            if (command.startsWith('/')) {
                commandToExecute = command.substring(1);
            }

            // Проверка на специальные команды тем
            if (commandToExecute.startsWith('theme ')) {
                await this._handleThemeCommand(commandToExecute);
                return;
            }

            // Проверка на специальные команды скриптов
            if (commandToExecute.startsWith('script ')) {
                await this.handleScriptCommand(commandToExecute);
                return;
            }

            if (commandToExecute.startsWith('macro ')) {
                await this.handleMacroCommand(commandToExecute);
                return;
            }

            const result = await this.commandSystem.execute(commandToExecute);

            // Обработка специальных команд
            if (result === 'CLEAR') {
                this.clearMessages();
                return;
            }

            // Показываем результат
            if (result) {
                // Разбиваем многострочный результат
                const lines = result.split('\n');
                lines.forEach(line => {
                    if (line.trim()) {
                        this.addMessage(line, "info");
                    }
                });
            }
        } catch (error: any) {
            this.addMessage(`Error: ${error.message || String(error)}`, "error");
        }
    }

    /**
     * Обработка команд скриптов
     */
    private async handleScriptCommand(command: string): Promise<void> {
        await this.initScriptEngine();
        if (!this.scriptEngine) return;

        const args = command.split(' ').slice(1);
        const action = args[0];

        switch (action) {
            case 'list':
                const scripts = (this.scriptEngine as any).getScripts();
                if (scripts.length === 0) {
                    this.addMessage("No scripts found", "info");
                } else {
                    this.addMessage(`Scripts: ${scripts.join(", ")}`, "info");
                }
                break;

            case 'run':
                if (args.length < 2) {
                    this.addMessage("Usage: script run <name>", "error");
                    return;
                }
                try {
                    const results = await (this.scriptEngine as any).runScript(args[1]);
                    results.forEach((r: string) => this.addMessage(r, "info"));
                } catch (error: any) {
                    this.addMessage(`Error: ${error.message}`, "error");
                }
                break;

            case 'save':
                if (args.length < 3) {
                    this.addMessage("Usage: script save <name> <script>", "error");
                    return;
                }
                const scriptName = args[1];
                const scriptContent = args.slice(2).join(' ');
                (this.scriptEngine as any).saveScript(scriptName, scriptContent);
                this.addMessage(`Script "${scriptName}" saved`, "success");
                break;

            default:
                this.addMessage("Usage: script [list|run|save]", "error");
        }
    }

    /**
     * Обработка команд макросов
     */
    private async handleMacroCommand(command: string): Promise<void> {
        await this.initScriptEngine();
        if (!this.scriptEngine) return;

        const args = command.split(' ').slice(1);
        const action = args[0];

        switch (action) {
            case 'list':
                const macros = (this.scriptEngine as any).getMacros();
                if (macros.length === 0) {
                    this.addMessage("No macros found", "info");
                } else {
                    this.addMessage(`Macros: ${macros.join(", ")}`, "info");
                }
                break;

            case 'run':
                if (args.length < 2) {
                    this.addMessage("Usage: macro run <name>", "error");
                    return;
                }
                try {
                    const results = await (this.scriptEngine as any).runMacro(args[1]);
                    results.forEach((r: string) => this.addMessage(r, "info"));
                } catch (error: any) {
                    this.addMessage(`Error: ${error.message}`, "error");
                }
                break;

            default:
                this.addMessage("Usage: macro [list|run]", "error");
        }
    }

    /**
     * Обработка команд тем
     */
    private async _handleThemeCommand(command: string): Promise<void> {
        await this.initThemeManager();
        if (!this.themeManager) return;

        const args = command.split(' ').slice(1);
        const action = args[0];

        switch (action) {
            case 'list':
                const themes = (this.themeManager as any).getThemes();
                const themeNames = themes.map((t: any) => t.name).join(', ');
                this.addMessage(`Available themes: ${themeNames}`, "info");
                break;

            case 'set':
                if (args.length < 2) {
                    this.addMessage("Usage: theme set <name>", "error");
                    return;
                }
                const themeName = args[1];
                const theme = (this.themeManager as any).getTheme(themeName);
                if (theme) {
                    (this.themeManager as any).applyTheme(theme);
                    this.addMessage(`Theme "${theme.name}" applied`, "success");
                } else {
                    this.addMessage(`Theme "${themeName}" not found`, "error");
                }
                break;

            default:
                this.addMessage("Usage: theme [list|set <name>]", "error");
        }
    }

    /**
     * Добавление команды в историю
     */
    private addToHistory(command: string): void {
        if (!command.trim()) return;

        // Не добавляем дубликаты подряд
        if (this._commandHistory.length > 0 &&
            this._commandHistory[this._commandHistory.length - 1] === command) {
            return;
        }

        this._commandHistory.push(command);
        this._commandHistoryIndex = this._commandHistory.length;

        // Ограничиваем размер истории (максимум 100 команд)
        if (this._commandHistory.length > 100) {
            this._commandHistory.shift();
            this._commandHistoryIndex--;
        }
    }

    /**
     * Получение команды из истории для навигации
     */
    private getHistory(direction: 'up' | 'down'): string | null {
        if (this._commandHistory.length === 0) return null;

        if (direction === 'up') {
            // Перемещаемся назад по истории
            if (this._commandHistoryIndex > 0) {
                this._commandHistoryIndex--;
            }
            return this._commandHistory[this._commandHistoryIndex] || null;
        } else {
            // Перемещаемся вперед по истории
            if (this._commandHistoryIndex < this._commandHistory.length - 1) {
                this._commandHistoryIndex++;
                return this._commandHistory[this._commandHistoryIndex] || null;
            } else {
                // Выход за пределы истории - возвращаемся к пустой строке
                this._commandHistoryIndex = this._commandHistory.length;
                return null;
            }
        }
    }

    /**
     * Переключение записи макроса
     */
    private async toggleMacroRecording(): Promise<void> {
        await this.initScriptEngine();
        if (!this.scriptEngine) return;

        const isRecording = (this.scriptEngine as any).isRecording;

        if (isRecording) {
            const macro = (this.scriptEngine as any).stopRecording();
            if (macro) {
                const name = prompt("Macro name:", `macro_${Date.now()}`);
                if (name) {
                    (this.scriptEngine as any).saveMacro(name, macro.split('\n'));
                    this.addMessage(`Macro "${name}" saved`, "success");
                }
            }
            this.addMessage("Macro recording stopped", "info");
        } else {
            (this.scriptEngine as any).startRecording();
            this.addMessage("Macro recording started (Ctrl+R to stop)", "info");
        }
    }

    /**
     * Очистка сообщений
     */
    private clearMessages(): void {
        this.messages = [];
        this.messageElements.forEach(el => el.dispose());
        this.messageElements.clear();
        this.updateMessages();
    }

    private getColorForType(type: MessageType): string {
        switch (type) {
            case "system": return "#0ff"; // Cyan (системные)
            case "info": return "#aaa"; // Серый (информация)
            case "warning": return "#ff0"; // Жёлтый (предупреждения)
            case "error": return "#f00"; // Красный (ошибки)
            case "success": return "#0f0"; // Зелёный (успех)
            case "log": return "#888"; // Серый
            case "combat": return "#f80"; // Оранжевый
            case "economy": return "#ffd700"; // Золотой
            default: return "#0f0";
        }
    }

    private getIconForType(type: MessageType): string {
        switch (type) {
            case "system": return "⚙";
            case "info": return "ℹ";
            case "warning": return "⚠";
            case "error": return "✖";
            case "success": return "✓";
            case "log": return "📋";
            case "combat": return "⚔";
            case "economy": return "💰";
            default: return "•";
        }
    }

    // Обновить отображение сообщений
    private updateMessages(): void {
        const htmlContainer = (this as any)._htmlContainer as HTMLDivElement;
        if (!htmlContainer) return;

        const messagesDiv = htmlContainer.querySelector("#terminal-messages") as HTMLDivElement;
        if (!messagesDiv) return;

        // Фильтруем сообщения
        const filteredMessages = this.messages.filter(msg => {
            // Фильтр по типу
            if (!this.activeFilters.has(msg.type)) return false;
            // Фильтр по поиску
            if (this.searchActive && this.searchText) {
                return msg.text.toLowerCase().includes(this.searchText.toLowerCase());
            }
            return true;
        });

        // Очищаем и пересоздаём сообщения в HTML
        messagesDiv.innerHTML = "";

        filteredMessages.forEach((message) => {
            const time = new Date(message.timestamp);
            const timeStr = this.showTimestamps
                ? `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`
                : "";

            // Вычисляем scaleFactor для текущего размера экрана
            const scaleFactor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080, 1.5);

            const msgDiv = document.createElement("div");
            msgDiv.style.cssText = `
                color: ${message.color};
                font-size: clamp(10px, 1.1vw, 12px);
                margin: ${3 * scaleFactor}px 0;
                padding: ${2 * scaleFactor}px ${4 * scaleFactor}px;
                word-wrap: break-word;
                font-family: Consolas, Monaco, 'Courier New', monospace;
                line-height: 1.4;
                text-shadow: 0 0 ${2 * scaleFactor}px ${message.color}40;
                transition: opacity 0.2s ease;
                border-left: ${2 * scaleFactor}px solid ${message.color}40;
                padding-left: ${6 * scaleFactor}px;
            `;

            const prefix = timeStr ? `[${timeStr}]` : "";
            const priorityMark = message.priority >= 2 ? "!! " : message.priority >= 1 ? "! " : "";
            msgDiv.textContent = `${prefix} ${message.icon} ${priorityMark}${message.text}`;

            messagesDiv.appendChild(msgDiv);
        });

        // Автопрокрутка вниз
        if (this.autoScroll) {
            setTimeout(() => {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }, 10);
        }
    }

    // Создать элемент сообщения (зарезервировано для будущего использования)
    // @ts-ignore - метод зарезервирован для будущей реализации
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _createMessageElement(message: ChatMessage, index: number): TextBlock {
        // Метод зарезервирован для будущей реализации GUI элементов через Babylon.js
        // В данный момент используется HTML-реализация для лучшей производительности
        const element = new TextBlock(`chatMsg_${message.timestamp}`);

        // Форматируем время
        const time = new Date(message.timestamp);
        const timeStr = this.showTimestamps
            ? `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`
            : "";

        // Форматируем сообщение с улучшенным форматированием
        const prefix = timeStr ? `[${timeStr}]` : "";
        const iconSpacing = message.icon.length > 1 ? " " : "  ";
        const priorityMark = message.priority >= 2 ? "!! " : message.priority >= 1 ? "! " : "";
        element.text = `${prefix}${iconSpacing}${message.icon} ${priorityMark}${message.text}`;
        element.color = message.color;
        element.fontSize = 11;
        element.fontFamily = "Courier New, monospace";
        element.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        element.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        element.left = "5px";
        element.top = `${index * 20}px`;
        element.textWrapping = true;
        element.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

        // Добавляем эффект появления для новых сообщений (плавная анимация)
        element.alpha = 0;
        const startTime = Date.now();
        const animate = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed < 200 && element) {
                element.alpha = Math.min(1, elapsed / 200);
                requestAnimationFrame(animate);
            } else if (element) {
                element.alpha = 1;
            }
        };
        requestAnimationFrame(animate);

        // Выделение важных сообщений
        if (message.priority >= 1) {
            element.fontWeight = "bold";
        }
        if (message.priority >= 2) {
            element.fontSize = 12;
            // Пульсация для критических сообщений
            const pulse = () => {
                if (element) {
                    const pulseValue = (Math.sin(this.animationTime * 3) + 1) / 2;
                    const brightness = 0.7 + pulseValue * 0.3;
                    element.color = this.adjustColorBrightness(message.color, brightness);
                    requestAnimationFrame(pulse);
                }
            };
            pulse();
        }

        this.messagesArea!.addControl(element);
        return element;
    }

    // Изменить яркость цвета
    private adjustColorBrightness(color: string, brightness: number): string {
        const rgb = this.hexToRgb(color);
        if (!rgb) return color;
        const r = Math.round(rgb.r * brightness);
        const g = Math.round(rgb.g * brightness);
        const b = Math.round(rgb.b * brightness);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    private hexToRgb(hex: string): { r: number, g: number, b: number } | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result && result[1] && result[2] && result[3] ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // Очистить чат
    clear(): void {
        this.messages = [];
        this.messageElements.forEach(element => element.dispose());
        this.messageElements.clear();
        this.updateMessages();
    }

    // Удалить старые сообщения
    private startCleanupTimer(): void {
        setInterval(() => {
            const now = Date.now();
            const toRemove: number[] = [];

            this.messages.forEach((message, index) => {
                const lifetime = message.priority >= 1
                    ? this.importantMessageLifetime
                    : this.messageLifetime;

                if (now - message.timestamp > lifetime) {
                    toRemove.push(index);
                }
            });

            // Удаляем в обратном порядке, чтобы индексы не сбились
            for (let i = toRemove.length - 1; i >= 0; i--) {
                const index = toRemove[i];
                if (index === undefined) continue;
                const message = this.messages[index];
                if (!message) continue;
                this.messages.splice(index, 1);

                const element = this.messageElements.get(message.timestamp);
                if (element) {
                    element.dispose();
                    this.messageElements.delete(message.timestamp);
                }
            }

            if (toRemove.length > 0) {
                this.updateMessages();
            }
        }, 5000); // Проверяем каждые 5 секунд
    }

    // Удобные методы для разных типов сообщений
    system(text: string, priority: number = 0) {
        this.addMessage(text, "system", priority);
    }

    info(text: string, priority: number = 0) {
        this.addMessage(text, "info", priority);
    }

    warning(text: string, priority: number = 1) {
        this.addMessage(text, "warning", priority);
    }

    error(text: string, priority: number = 2) {
        this.addMessage(text, "error", priority);
    }

    success(text: string, priority: number = 0) {
        this.addMessage(text, "success", priority);
    }

    log(text: string, priority: number = 0) {
        this.addMessage(text, "log", priority);
    }

    combat(text: string, priority: number = 1) {
        this.addMessage(text, "combat", priority);
    }

    economy(text: string, priority: number = 0) {
        this.addMessage(text, "economy", priority);
    }

    // Поиск по сообщениям
    setSearchText(text: string): void {
        this.searchText = text;
        this.searchActive = text.length > 0;
        this.updateMessages();
    }

    clearSearch(): void {
        this.searchText = "";
        this.searchActive = false;
        this.updateMessages();
    }

    // Получить статистику сообщений
    getStats(): { total: number, byType: Map<MessageType, number> } {
        const byType = new Map<MessageType, number>();
        this.messages.forEach(msg => {
            byType.set(msg.type, (byType.get(msg.type) || 0) + 1);
        });
        return {
            total: this.messages.length,
            byType: byType
        };
    }

    // Экспорт сообщений
    exportMessages(): string {
        return this.messages.map(msg => {
            const time = new Date(msg.timestamp);
            const timeStr = `${time.toISOString()}`;
            return `[${timeStr}] [${msg.type.toUpperCase()}] ${msg.icon} ${msg.text}`;
        }).join('\n');
    }

    // Импорт сообщений (для истории)
    importMessages(messages: ChatMessage[]): void {
        this.messages = [...this.messages, ...messages];
        this.updateMessages();
    }

    // Показать/скрыть System Terminal (Ctrl+5)
    toggleTerminal(): void {
        const htmlContainer = (this as any)._htmlContainer as HTMLDivElement;
        if (!htmlContainer) return;

        const currentDisplay = htmlContainer.style.display;
        if (currentDisplay === "none") {
            htmlContainer.style.display = "block";
        } else {
            htmlContainer.style.display = "none";
        }
    }
}
