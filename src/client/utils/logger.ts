/**
 * Утилита для логирования с поддержкой production/dev режимов и настройками
 */

// ИСПРАВЛЕНО: Проверка на доступность import.meta.env (может быть undefined в Node.js)
// В Node.js import.meta может быть доступен, но env может быть undefined
let isDevelopment: boolean;
let isProduction: boolean;

try {
    // Vite provides import.meta.env; in Node (tests) it may be undefined
    const meta = typeof import.meta !== "undefined" ? (import.meta as { env?: { DEV?: boolean; PROD?: boolean } }).env : undefined;
    if (meta) {
        isDevelopment = meta.DEV ?? false;
        isProduction = meta.PROD ?? false;
    } else {
        isDevelopment = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
        isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
    }
} catch {
    isDevelopment = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
    isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
}

/**
 * Уровни логирования
 */
export enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    VERBOSE = 5
}

/**
 * Категории логирования
 */
export enum LogCategory {
    GENERAL = "general",
    PHYSICS = "physics",
    RENDERING = "rendering",
    AI = "ai",
    NETWORK = "network",
    FIREBASE = "firebase",
    SOCIAL = "social",
    REPLAY = "replay",
    MENU = "menu",
    TANK = "tank",
    COMBAT = "combat"
}

/**
 * Менеджер настроек логирования
 */
class LoggingSettings {
    private static instance: LoggingSettings;
    private level: LogLevel = LogLevel.INFO;
    private categories: Set<LogCategory> = new Set([LogCategory.GENERAL]);
    private enabledCategories: Map<LogCategory, boolean> = new Map();

    private constructor() {
        this.loadSettings();
    }

    static getInstance(): LoggingSettings {
        if (!LoggingSettings.instance) {
            LoggingSettings.instance = new LoggingSettings();
        }
        return LoggingSettings.instance;
    }

    private loadSettings(): void {
        try {
            const saved = localStorage.getItem("loggingSettings");
            if (saved) {
                const settings = JSON.parse(saved);
                this.level = settings.level ?? LogLevel.INFO;
                if (settings.categories) {
                    this.categories = new Set(settings.categories);
                }
                if (settings.enabledCategories) {
                    this.enabledCategories = new Map(Object.entries(settings.enabledCategories).map(([k, v]) => [k as LogCategory, v as boolean]));
                }
            } else {
                // По умолчанию: WARN для оптимальной производительности
                this.level = LogLevel.WARN;
                this.categories = new Set([LogCategory.GENERAL]);
            }
        } catch (e) {
            // Используем значения по умолчанию
            this.level = LogLevel.WARN;
        }
    }

    saveSettings(): void {
        try {
            const settings = {
                level: this.level,
                categories: Array.from(this.categories),
                enabledCategories: Object.fromEntries(this.enabledCategories)
            };
            localStorage.setItem("loggingSettings", JSON.stringify(settings));
        } catch (e) {
            // Игнорируем ошибки сохранения
        }
    }

    setLevel(level: LogLevel): void {
        this.level = level;
        this.saveSettings();
    }

    getLevel(): LogLevel {
        return this.level;
    }

    enableCategory(category: LogCategory): void {
        this.categories.add(category);
        this.enabledCategories.set(category, true);
        this.saveSettings();
    }

    disableCategory(category: LogCategory): void {
        this.categories.delete(category);
        this.enabledCategories.set(category, false);
        this.saveSettings();
    }

    isCategoryEnabled(category: LogCategory): boolean {
        return this.categories.has(category) || this.enabledCategories.get(category) === true;
    }

    shouldLog(level: LogLevel, category?: LogCategory): boolean {
        if (level > this.level) return false;
        if (category && !this.isCategoryEnabled(category)) return false;
        return true;
    }
}

export class Logger {
    private prefix: string;
    private category?: LogCategory;
    private settings: LoggingSettings;

    constructor(prefix: string = "[Game]", category?: LogCategory) {
        this.prefix = prefix;
        this.category = category;
        this.settings = LoggingSettings.getInstance();
    }

    /**
     * Логирует сообщение с проверкой уровня и категории
     * ОПТИМИЗАЦИЯ: В production режиме все логи кроме ERROR отключены для максимальной производительности
     */
    log(...args: any[]): void {
        // PERFORMANCE: Fast path - skip all non-error logs in production
        if (isProduction) return;
        if (this.settings.shouldLog(LogLevel.INFO, this.category)) {
            console.log(this.prefix, ...args);
        }
    }

    /**
     * Логирует предупреждение (всегда видно если уровень >= WARN)
     * ОПТИМИЗАЦИЯ: В production режиме отключено
     */
    warn(...args: any[]): void {
        // PERFORMANCE: Fast path - skip warnings in production
        if (isProduction) return;
        if (this.settings.shouldLog(LogLevel.WARN, this.category)) {
            console.warn(this.prefix, ...args);
        }
    }

    /**
     * Логирует ошибку (ВСЕГДА видно - критические ошибки важны даже в production)
     */
    error(...args: any[]): void {
        // Ошибки всегда логируются, даже в production - это критически важно
        if (this.settings.shouldLog(LogLevel.ERROR, this.category)) {
            console.error(this.prefix, ...args);
            if (isDevelopment && args[0] instanceof Error) {
                console.error(this.prefix, "Stack trace:", args[0].stack);
            }

            if (Logger.onErrorCallback) {
                Logger.onErrorCallback(args); // Pass arguments to callback
            }
        }
    }

    /**
     * Логирует информацию
     * ОПТИМИЗАЦИЯ: В production режиме отключено
     */
    info(...args: any[]): void {
        // PERFORMANCE: Fast path - skip info in production
        if (isProduction) return;
        if (this.settings.shouldLog(LogLevel.INFO, this.category)) {
            console.info(this.prefix, ...args);
        }
    }

    /**
     * Логирует отладочную информацию
     * ОПТИМИЗАЦИЯ: В production режиме отключено
     */
    debug(...args: any[]): void {
        // PERFORMANCE: Fast path - skip debug in production
        if (isProduction) return;
        if (this.settings.shouldLog(LogLevel.DEBUG, this.category)) {
            console.debug(this.prefix, ...args);
        }
    }

    /**
     * Логирует детальную информацию (VERBOSE уровень)
     * ОПТИМИЗАЦИЯ: В production режиме отключено
     */
    verbose(...args: any[]): void {
        // PERFORMANCE: Fast path - skip verbose in production
        if (isProduction) return;
        if (this.settings.shouldLog(LogLevel.VERBOSE, this.category)) {
            console.log(this.prefix, "[VERBOSE]", ...args);
        }
    }

    /**
     * Логирует только в production (для важных сообщений)
     */
    production(...args: any[]): void {
        if (isProduction) {
            console.log(this.prefix, ...args);
        }
    }

    /**
     * Регистрирует глобальный обработчик ошибок
     */
    static onErrorCallback: ((error: any) => void) | null = null;

    static setOnError(callback: (error: any) => void) {
        Logger.onErrorCallback = callback;
    }
}

/**
 * Создает новый экземпляр логгера с префиксом и категорией
 */
export function createLogger(prefix: string, category?: LogCategory): Logger {
    return new Logger(prefix, category);
}

/**
 * Глобальный логгер по умолчанию
 */
export const logger = createLogger("[Game]", LogCategory.GENERAL);

/**
 * Логгер для физики
 */
export const physicsLogger = createLogger("[Physics]", LogCategory.PHYSICS);

/**
 * Логгер для рендеринга
 */
export const renderLogger = createLogger("[Render]", LogCategory.RENDERING);

/**
 * Логгер для AI
 */
export const aiLogger = createLogger("[AI]", LogCategory.AI);

/**
 * Логгер для танка
 */
export const tankLogger = createLogger("[Tank]", LogCategory.TANK);

/**
 * Логгер для боевой системы
 */
export const combatLogger = createLogger("[Combat]", LogCategory.COMBAT);

/**
 * Экспорт менеджера настроек для управления логированием
 */
export const loggingSettings = LoggingSettings.getInstance();

