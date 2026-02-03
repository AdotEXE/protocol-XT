/**
 * Hotkey Manager - Управление горячими клавишами и блокировка браузерных сочетаний
 * 
 * Функциональность:
 * - Блокировка браузерных горячих клавиш во время игры (Ctrl+W, F5, Ctrl+R, etc.)
 * - Глобальные горячие клавиши для открытия чата (Enter или /)
 * - Интеграция с ChatSystem и VoiceChat
 */

import { ChatSystem } from "./chatSystem";
import { getVoiceChatManager } from "./voiceChat";

export interface HotkeyConfig {
    // Блокировка браузерных клавиш
    blockBrowserHotkeys: boolean;
    // Клавиши открытия чата
    chatOpenKeys: string[];
    // PTT (Push-to-Talk) клавиша
    pushToTalkKey: string;
}

const DEFAULT_CONFIG: HotkeyConfig = {
    blockBrowserHotkeys: true,
    chatOpenKeys: ["Enter", "/"],
    pushToTalkKey: "KeyV"
};

// Браузерные клавиши для блокировки
const BLOCKED_BROWSER_HOTKEYS: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean }[] = [
    // Закрытие/обновление
    { key: "w", ctrl: true },      // Ctrl+W - закрыть вкладку
    { key: "r", ctrl: true },      // Ctrl+R - обновить страницу
    { key: "F5" },                 // F5 - обновить страницу
    { key: "F11" },                // F11 - полноэкранный режим (разрешим, но перехватим)

    // Навигация
    { key: "d", ctrl: true },      // Ctrl+D - добавить в закладки
    { key: "g", ctrl: true },      // Ctrl+G - поиск
    { key: "h", ctrl: true },      // Ctrl+H - история
    { key: "j", ctrl: true },      // Ctrl+J - загрузки
    { key: "k", ctrl: true },      // Ctrl+K - поиск
    { key: "l", ctrl: true },      // Ctrl+L - адресная строка
    { key: "n", ctrl: true },      // Ctrl+N - новое окно
    { key: "o", ctrl: true },      // Ctrl+O - открыть файл
    { key: "p", ctrl: true },      // Ctrl+P - печать
    { key: "s", ctrl: true },      // Ctrl+S - сохранить
    { key: "t", ctrl: true },      // Ctrl+T - новая вкладка
    { key: "u", ctrl: true },      // Ctrl+U - исходный код

    // Масштаб
    { key: "+", ctrl: true },      // Ctrl++ - увеличить
    { key: "-", ctrl: true },      // Ctrl+- - уменьшить
    { key: "0", ctrl: true },      // Ctrl+0 - сбросить масштаб

    // Другие
    { key: "f", ctrl: true },      // Ctrl+F - поиск на странице
    { key: "Escape" },             // Escape - обрабатываем в игре

    // Alt комбинации
    { key: "ArrowLeft", alt: true },  // Alt+Left - назад
    { key: "ArrowRight", alt: true }, // Alt+Right - вперед
    { key: "Home", alt: true },       // Alt+Home - домашняя страница
    { key: "F4", alt: true },         // Alt+F4 - закрыть (не блокируется браузером, но попробуем)
];

class HotkeyManager {
    private config: HotkeyConfig;
    private chatSystem: ChatSystem | null = null;
    private isGameActive: boolean = false;
    private isInitialized: boolean = false;
    private boundKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;
    private boundKeyUpHandler: ((e: KeyboardEvent) => void) | null = null;
    private contextMenuHandler: ((e: Event) => void) | null = null;
    private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
    private focusTimeout: NodeJS.Timeout | null = null;

    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.loadConfig();
    }

    /**
     * Инициализация менеджера
     */
    initialize(chatSystem: ChatSystem): void {
        if (this.isInitialized) return;

        this.chatSystem = chatSystem;
        this.setupEventListeners();
        this.isInitialized = true;
        console.log("[HotkeyManager] Initialized");
    }

    /**
     * Установить состояние игры (активна/не активна)
     */
    setGameActive(active: boolean): void {
        this.isGameActive = active;
        console.log(`[HotkeyManager] Game active: ${active}`);
    }

    /**
     * Настроить глобальные обработчики клавиш
     */
    private setupEventListeners(): void {
        this.boundKeyDownHandler = this.handleKeyDown.bind(this);
        this.boundKeyUpHandler = this.handleKeyUp.bind(this);

        // Используем capture phase для перехвата до других обработчиков
        window.addEventListener("keydown", this.boundKeyDownHandler, true);
        window.addEventListener("keyup", this.boundKeyUpHandler, true);

        // Блокировка контекстного меню правой кнопкой
        this.contextMenuHandler = (e) => {
            if (this.isGameActive) {
                e.preventDefault();
            }
        };
        window.addEventListener("contextmenu", this.contextMenuHandler);

        // Предотвращение закрытия страницы
        this.beforeUnloadHandler = (e) => {
            if (this.isGameActive) {
                e.preventDefault();
                e.returnValue = "Вы уверены, что хотите покинуть игру?";
                return e.returnValue;
            }
        };
        window.addEventListener("beforeunload", this.beforeUnloadHandler);
    }

    /**
     * Обработчик нажатия клавиш
     */
    private handleKeyDown(e: KeyboardEvent): void {
        // Если фокус на input элементе, не перехватываем (кроме Escape)
        const activeElement = document.activeElement;
        const isInputFocused = activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement?.getAttribute("contenteditable") === "true";

        // 1. Блокировка браузерных горячих клавиш
        if (this.isGameActive && this.config.blockBrowserHotkeys) {
            if (this.shouldBlockKey(e)) {
                e.preventDefault();
                e.stopPropagation();
                console.log(`[HotkeyManager] Blocked browser hotkey: ${this.getKeyCombo(e)}`);
                return;
            }
        }

        // 2. Открытие чата по Enter или /
        if (this.isGameActive && !isInputFocused && this.chatSystem) {
            if (this.config.chatOpenKeys.includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                this.openChat(e.key === "/" ? "/" : "");
                return;
            }
        }

        // 3. Push-to-Talk для голосового чата
        if (this.isGameActive && e.code === this.config.pushToTalkKey && !isInputFocused) {
            const voiceChat = getVoiceChatManager();
            if (voiceChat.isEnabled() && voiceChat.getConfig().pushToTalk) {
                // Начать передачу голоса
                voiceChat.setPushToTalkActive(true);
            }
        }

        // 4. Escape - закрыть чат если открыт
        if (e.key === "Escape" && this.chatSystem?.isChatActive()) {
            e.preventDefault();
            e.stopPropagation();
            this.chatSystem.setVisible(false);
            return;
        }
    }

    /**
     * Обработчик отпускания клавиш
     */
    private handleKeyUp(e: KeyboardEvent): void {
        // Push-to-Talk - остановить передачу
        if (e.code === this.config.pushToTalkKey) {
            const voiceChat = getVoiceChatManager();
            if (voiceChat.isEnabled() && voiceChat.getConfig().pushToTalk) {
                voiceChat.setPushToTalkActive(false);
            }
        }
    }

    /**
     * Проверить, нужно ли блокировать клавишу
     */
    private shouldBlockKey(e: KeyboardEvent): boolean {
        for (const blocked of BLOCKED_BROWSER_HOTKEYS) {
            const keyMatch = e.key.toLowerCase() === blocked.key.toLowerCase() ||
                e.key === blocked.key;
            const ctrlMatch = blocked.ctrl ? e.ctrlKey : !e.ctrlKey;
            const altMatch = blocked.alt ? e.altKey : !e.altKey;
            const shiftMatch = blocked.shift ? e.shiftKey : true; // shift необязателен

            if (keyMatch && ctrlMatch && altMatch) {
                return true;
            }
        }
        return false;
    }

    /**
     * Открыть чат с начальным текстом
     */
    private openChat(initialText: string = ""): void {
        if (!this.chatSystem) return;

        // Очищаем предыдущий таймер если есть
        if (this.focusTimeout) {
            clearTimeout(this.focusTimeout);
        }

        // Показать терминал
        this.chatSystem.setVisible(true);

        // Фокус на поле ввода с начальным текстом
        this.focusTimeout = setTimeout(() => {
            const input = document.getElementById("terminal-command-input") as HTMLInputElement;
            if (input) {
                input.focus();
                if (initialText) {
                    input.value = initialText;
                }
            }
            this.focusTimeout = null;
        }, 50);
    }

    /**
     * Получить строку комбинации клавиш для логирования
     */
    private getKeyCombo(e: KeyboardEvent): string {
        let combo = "";
        if (e.ctrlKey) combo += "Ctrl+";
        if (e.altKey) combo += "Alt+";
        if (e.shiftKey) combo += "Shift+";
        combo += e.key;
        return combo;
    }

    /**
     * Загрузить конфигурацию из localStorage
     */
    private loadConfig(): void {
        try {
            const saved = localStorage.getItem("hotkey-config");
            if (saved) {
                this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn("[HotkeyManager] Failed to load config:", e);
        }
    }

    /**
     * Сохранить конфигурацию
     */
    saveConfig(): void {
        try {
            localStorage.setItem("hotkey-config", JSON.stringify(this.config));
        } catch (e) {
            console.warn("[HotkeyManager] Failed to save config:", e);
        }
    }

    /**
     * Обновить конфигурацию
     */
    setConfig(config: Partial<HotkeyConfig>): void {
        this.config = { ...this.config, ...config };
        this.saveConfig();
    }

    /**
     * Получить текущую конфигурацию
     */
    getConfig(): HotkeyConfig {
        return { ...this.config };
    }

    /**
     * Очистка
     */
    cleanup(): void {
        if (this.boundKeyDownHandler) {
            window.removeEventListener("keydown", this.boundKeyDownHandler, true);
            this.boundKeyDownHandler = null;
        }
        if (this.boundKeyUpHandler) {
            window.removeEventListener("keyup", this.boundKeyUpHandler, true);
            this.boundKeyUpHandler = null;
        }
        if (this.contextMenuHandler) {
            window.removeEventListener("contextmenu", this.contextMenuHandler);
            this.contextMenuHandler = null;
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener("beforeunload", this.beforeUnloadHandler);
            this.beforeUnloadHandler = null;
        }
        if (this.focusTimeout) {
            clearTimeout(this.focusTimeout);
            this.focusTimeout = null;
        }
        this.isInitialized = false;
    }
}

// Singleton
let _hotkeyManagerInstance: HotkeyManager | null = null;

export function getHotkeyManager(): HotkeyManager {
    if (!_hotkeyManagerInstance) {
        _hotkeyManagerInstance = new HotkeyManager();
    }
    return _hotkeyManagerInstance;
}

export { HotkeyManager };
