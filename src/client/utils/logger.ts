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
     * Логирует ошибку (всегда видно)
     */
    error(...args: any[]): void {
        console.error(this.prefix, ...args);
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

