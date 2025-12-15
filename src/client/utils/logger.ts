/**
 * Утилита для логирования с поддержкой production/dev режимов
 */

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

class Logger {
    private prefix: string;

    constructor(prefix: string = "[Game]") {
        this.prefix = prefix;
    }

    /**
     * Логирует сообщение только в development режиме
     */
    log(...args: any[]): void {
        if (isDevelopment) {
            console.log(this.prefix, ...args);
        }
    }

    /**
     * Логирует предупреждение (всегда видно)
     */
    warn(...args: any[]): void {
        console.warn(this.prefix, ...args);
    }

    /**
     * УЛУЧШЕНО: Логирует ошибку (всегда видно) с дополнительной информацией
     */
    error(...args: any[]): void {
        console.error(this.prefix, ...args);
        // В development режиме добавляем stack trace для ошибок
        if (isDevelopment && args[0] instanceof Error) {
            console.error(this.prefix, "Stack trace:", args[0].stack);
        }
    }

    /**
     * Логирует информацию (только в development)
     */
    info(...args: any[]): void {
        if (isDevelopment) {
            console.info(this.prefix, ...args);
        }
    }

    /**
     * Логирует отладочную информацию (только в development)
     */
    debug(...args: any[]): void {
        if (isDevelopment) {
            console.debug(this.prefix, ...args);
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
}

/**
 * Создает новый экземпляр логгера с префиксом
 */
export function createLogger(prefix: string): Logger {
    return new Logger(prefix);
}

/**
 * Глобальный логгер по умолчанию
 */
export const logger = createLogger("[Game]");

/**
 * Логгер для физики
 */
export const physicsLogger = createLogger("[Physics]");

/**
 * Логгер для рендеринга
 */
export const renderLogger = createLogger("[Render]");

/**
 * Логгер для AI
 */
export const aiLogger = createLogger("[AI]");

