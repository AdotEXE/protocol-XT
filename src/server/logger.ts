/**
 * Улучшенный логгер для сервера
 * - Добавляет время в формате [часы:минуты:секунды]
 * - Предотвращает повторяющиеся сообщения (показывает только последнее, без учета времени)
 * - В dev режиме использует TUI интерфейс для умного логирования
 */

import { createTUILogger, getTUILogger } from './tuiLogger';

const isDev = process.env.NODE_ENV !== 'production';

class ServerLogger {
    private lastLogMessage: string | null = null;
    private tuiLogger: ReturnType<typeof getTUILogger> = null;

    constructor() {
        // В dev режиме инициализируем TUI логгер только если есть TTY
        if (isDev && process.stdout.isTTY) {
            try {
                this.tuiLogger = createTUILogger();
            } catch (error) {
                // Если TUI не удалось создать, используем обычный режим
                // Не выводим предупреждение, так как это нормально в некоторых случаях
            }
        }
    }

    /**
     * Устанавливает ссылку на GameServer для TUI
     */
    setGameServer(server: any): void {
        if (this.tuiLogger) {
            this.tuiLogger.setGameServer(server);
        }
    }

    /**
     * Форматирует время в формат [часы:минуты:секунды]
     */
    private formatTime(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `[${hours}:${minutes}:${seconds}]`;
    }

    /**
     * Проверяет, является ли сообщение дубликатом предыдущего
     * Сравнивает только текст сообщения, без учета времени
     */
    private isDuplicate(message: string): boolean {
        // Если сообщение совпадает с предыдущим, это дубликат
        return this.lastLogMessage === message;
    }

    /**
     * Обновляет информацию о последнем сообщении
     */
    private updateLastLog(message: string): void {
        this.lastLogMessage = message;
    }

    /**
     * Логирует сообщение с временной меткой
     */
    private logMessage(level: 'log' | 'error' | 'warn', ...args: any[]): void {
        // Формируем строку сообщения для проверки дубликатов
        const messageStr = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        // Если используем TUI, передаем туда
        if (this.tuiLogger) {
            this.tuiLogger[level](...args);
            return; // TUI сам обрабатывает все, не дублируем в консоль
        }

        // Обычный режим (production или если TUI недоступен)
        // Проверяем на дубликат
        if (this.isDuplicate(messageStr)) {
            return; // Пропускаем дубликат
        }

        // Обновляем информацию о последнем сообщении
        this.updateLastLog(messageStr);

        // Формируем временную метку
        const timestamp = this.formatTime();

        // Выводим сообщение с временной меткой
        const consoleMethod = console[level];
        consoleMethod(timestamp, ...args);
    }

    /**
     * Логирует информационное сообщение
     */
    log(...args: any[]): void {
        this.logMessage('log', ...args);
    }

    /**
     * Логирует информационное сообщение (алиас для log)
     */
    info(...args: any[]): void {
        this.logMessage('log', ...args);
    }

    /**
     * Логирует ошибку
     */
    error(...args: any[]): void {
        this.logMessage('error', ...args);
    }

    /**
     * Логирует предупреждение
     */
    warn(...args: any[]): void {
        this.logMessage('warn', ...args);
    }

    /**
     * Очистка ресурсов
     */
    cleanup(): void {
        if (this.tuiLogger) {
            this.tuiLogger.cleanup();
        }
    }
}

// Экспортируем единственный экземпляр логгера
export const serverLogger = new ServerLogger();

