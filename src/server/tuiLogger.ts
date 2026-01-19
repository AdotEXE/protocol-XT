/**
 * TUI (Text User Interface) логгер для dev-режима сервера
 * Показывает умные логи с агрегацией и мониторинг в реальном времени
 */

// @ts-ignore - blessed is CommonJS
import blessed from 'blessed';
// @ts-ignore - blessed-contrib is CommonJS
import contrib from 'blessed-contrib';
import { GameServer } from './gameServer';

interface LogEntry {
    timestamp: string;
    level: 'log' | 'error' | 'warn';
    message: string;
    count: number; // Количество повторений
}

interface AggregatedLog {
    message: string;
    count: number;
    lastSeen: Date;
    level: 'log' | 'error' | 'warn';
}

export class TUILogger {
    private screen: blessed.Widgets.Screen;
    private logBox: blessed.Widgets.Log;
    private statsBox: blessed.Widgets.Box;
    private recentEventsBox: blessed.Widgets.List;
    private aggregatedLogsBox: blessed.Widgets.List;
    private grid: contrib.grid;

    private logEntries: LogEntry[] = [];
    private aggregatedLogs: Map<string, AggregatedLog> = new Map();
    private recentEvents: string[] = [];
    private maxLogEntries = 100;
    private maxRecentEvents = 20;
    private maxAggregatedLogs = 15;

    private stats: {
        players: number;
        rooms: number;
        uptime: string;
        messagesPerSecond: number;
        errors: number;
        warnings: number;
    } = {
            players: 0,
            rooms: 0,
            uptime: '0s',
            messagesPerSecond: 0,
            errors: 0,
            warnings: 0
        };

    private startTime: number = Date.now();
    private messageCount: number = 0;
    private lastMessageCount: number = 0;
    private lastStatsUpdate: number = Date.now();
    private gameServer: GameServer | null = null;
    private statsUpdateInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Проверяем, что мы в TTY (терминале)
        if (!process.stdout.isTTY) {
            throw new Error('TUI requires TTY');
        }

        try {
            // Создаем экран
            this.screen = blessed.screen({
                smartCSR: true,
                title: 'Protocol TX - Server Monitor',
                fullUnicode: false, // Отключаем для лучшей совместимости
                cursor: {
                    artificial: true,
                    shape: 'line',
                    blink: false
                }
            });
        } catch (error) {
            throw new Error(`Failed to create TUI screen: ${error}`);
        }

        // Создаем grid layout
        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        // Левая панель - статистика (4 колонки)
        this.statsBox = this.grid.set(0, 0, 3, 4, blessed.box, {
            label: ' Статистика ',
            content: '',
            border: { type: 'line' },
            tags: true, // Включаем поддержку цветных тегов
            style: {
                border: { fg: 'cyan' },
                fg: 'white',
                bg: 'black'
            },
            scrollable: false,
            padding: { left: 1, right: 1, top: 1, bottom: 1 }
        });

        // Правая верхняя - последние события (8 колонок)
        this.recentEventsBox = this.grid.set(0, 4, 3, 8, blessed.list, {
            label: ' Последние события ',
            keys: true,
            mouse: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'green' },
                fg: 'white',
                bg: 'black',
                selected: { bg: 'blue', fg: 'white' }
            },
            scrollable: true,
            alwaysScroll: true,
            padding: { left: 1, right: 1 }
        });

        // Левая нижняя - агрегированные логи (4 колонки)
        this.aggregatedLogsBox = this.grid.set(3, 0, 4, 4, blessed.list, {
            label: ' Агрегированные логи ',
            keys: true,
            mouse: true,
            border: { type: 'line' },
            style: {
                border: { fg: 'yellow' },
                fg: 'white',
                bg: 'black',
                selected: { bg: 'blue', fg: 'white' }
            },
            scrollable: true,
            alwaysScroll: true,
            padding: { left: 1, right: 1 }
        });

        // Правая нижняя - детальные логи (8 колонок)
        this.logBox = this.grid.set(3, 4, 9, 8, blessed.log, {
            label: ' Детальные логи ',
            keys: true,
            mouse: true,
            border: { type: 'line' },
            tags: true, // Включаем поддержку цветных тегов
            style: {
                border: { fg: 'magenta' },
                fg: 'white',
                bg: 'black'
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: '│',
                track: { bg: 'black' },
                style: { inverse: false }
            },
            padding: { left: 1, right: 1 }
        });

        // Обработка клавиш
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.cleanup();
            return process.exit(0);
        });

        // Обработка resize
        this.screen.on('resize', () => {
            this.screen.render();
        });

        // Начальный рендер
        this.updateStats();
        this.screen.render();
    }

    /**
     * Устанавливает ссылку на GameServer для получения статистики
     */
    setGameServer(server: GameServer): void {
        this.gameServer = server;

        // Обновляем статистику каждую секунду
        this.statsUpdateInterval = setInterval(() => {
            this.updateStats();
        }, 1000);
    }

    /**
     * Форматирует время
     */
    private formatTime(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    /**
     * Форматирует uptime
     */
    private formatUptime(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Обновляет статистику
     */
    private updateStats(): void {
        if (this.gameServer) {
            const serverStats = this.gameServer.getStats() as any;
            this.stats.players = serverStats.players || 0;
            this.stats.rooms = serverStats.rooms || 0;
        }

        const now = Date.now();
        this.stats.uptime = this.formatUptime(now - this.startTime);

        // Вычисляем сообщений в секунду
        const elapsed = (now - this.lastStatsUpdate) / 1000;
        if (elapsed >= 1) {
            this.stats.messagesPerSecond = (this.messageCount - this.lastMessageCount) / elapsed;
            this.lastMessageCount = this.messageCount;
            this.lastStatsUpdate = now;
        }

        // Обновляем содержимое
        const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        const statsContent = [
            '',
            ` Игроков:      {cyan-fg}${this.stats.players}{/}`,
            ` Комнат:       {cyan-fg}${this.stats.rooms}{/}`,
            ` Uptime:       {green-fg}${this.stats.uptime}{/}`,
            ` Сообщ/сек:    {yellow-fg}${this.stats.messagesPerSecond.toFixed(1)}{/}`,
            '',
            ` Ошибок:       {red-fg}${this.stats.errors}{/}`,
            ` Предупреждений: {yellow-fg}${this.stats.warnings}{/}`,
            '',
            ` Память:       {magenta-fg}${memUsage} MB{/}`,
            ` Всего логов:  {white-fg}${this.messageCount}{/}`
        ].join('\n');

        this.statsBox.setContent(statsContent);
        this.updateAggregatedLogs();
        this.screen.render();
    }

    /**
     * Обновляет список агрегированных логов
     */
    private updateAggregatedLogs(): void {
        const logs = Array.from(this.aggregatedLogs.values())
            .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
            .slice(0, this.maxAggregatedLogs)
            .map(log => {
                const icon = log.level === 'error' ? '[ERR]' : log.level === 'warn' ? '[WRN]' : '[INF]';
                const countStr = log.count > 1 ? ` x${log.count}` : '';
                const time = this.formatTime();
                // Обрезаем длинные сообщения и убираем лишние символы
                let message = log.message
                    .replace(/\[Server\]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (message.length > 40) {
                    message = message.substring(0, 37) + '...';
                }

                return `${time} ${icon}${countStr} ${message}`;
            });

        this.aggregatedLogsBox.setItems(logs);
    }

    /**
     * Добавляет событие в список последних событий
     */
    private addRecentEvent(message: string, level: 'log' | 'error' | 'warn'): void {
        const icon = level === 'error' ? '[ERR]' : level === 'warn' ? '[WRN]' : '[OK]';
        const time = this.formatTime();

        // Очищаем сообщение от лишних символов
        let cleanMessage = message
            .replace(/\[Server\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Обрезаем длинные сообщения
        if (cleanMessage.length > 60) {
            cleanMessage = cleanMessage.substring(0, 57) + '...';
        }

        const event = `${time} ${icon} ${cleanMessage}`;

        this.recentEvents.unshift(event);
        if (this.recentEvents.length > this.maxRecentEvents) {
            this.recentEvents.pop();
        }

        this.recentEventsBox.setItems(this.recentEvents);
    }

    /**
     * Агрегирует логи (группирует одинаковые)
     */
    private aggregateLog(message: string, level: 'log' | 'error' | 'warn'): void {
        const key = `${level}:${message}`;
        const existing = this.aggregatedLogs.get(key);

        if (existing) {
            existing.count++;
            existing.lastSeen = new Date();
        } else {
            this.aggregatedLogs.set(key, {
                message,
                count: 1,
                lastSeen: new Date(),
                level
            });
        }

        // Ограничиваем размер map
        if (this.aggregatedLogs.size > 100) {
            const sorted = Array.from(this.aggregatedLogs.entries())
                .sort((a, b) => b[1].lastSeen.getTime() - a[1].lastSeen.getTime());
            this.aggregatedLogs.clear();
            sorted.slice(0, 50).forEach(([key, value]) => {
                this.aggregatedLogs.set(key, value);
            });
        }
    }

    /**
     * Логирует сообщение
     */
    private logMessage(level: 'log' | 'error' | 'warn', ...args: any[]): void {
        this.messageCount++;

        // Формируем строку сообщения
        const messageStr = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 0);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ')
            // Очищаем от лишних символов blessed
            .replace(/\{[^}]*\}/g, '') // Убираем все теги вида {xxx}
            .replace(/\s+/g, ' ') // Множественные пробелы в один
            .trim();

        // Обновляем счетчики
        if (level === 'error') this.stats.errors++;
        if (level === 'warn') this.stats.warnings++;

        // Агрегируем логи (только для повторяющихся)
        this.aggregateLog(messageStr, level);

        // Добавляем в детальные логи (только важные или первые)
        const shouldShowDetail = level === 'error' || level === 'warn' ||
            !this.aggregatedLogs.has(`${level}:${messageStr}`) ||
            this.aggregatedLogs.get(`${level}:${messageStr}`)?.count === 1;

        if (shouldShowDetail) {
            const timestamp = this.formatTime();
            const levelTag = level === 'error' ? '[ERR]' : level === 'warn' ? '[WRN]' : '[INF]';

            // Очищаем сообщение от лишних символов
            let cleanMessage = messageStr
                .replace(/\[Server\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Используем цвета для разных уровней
            if (level === 'error') {
                this.logBox.log(`{red-fg}${timestamp} ${levelTag}{/} ${cleanMessage}`);
            } else if (level === 'warn') {
                this.logBox.log(`{yellow-fg}${timestamp} ${levelTag}{/} ${cleanMessage}`);
            } else {
                this.logBox.log(`${timestamp} ${levelTag} ${cleanMessage}`);
            }
        }

        // Добавляем в последние события (только важные)
        if (level === 'error' || level === 'warn' || messageStr.includes('✅') || messageStr.includes('❌')) {
            this.addRecentEvent(messageStr, level);
        }

        // Обновляем статистику периодически
        if (this.messageCount % 10 === 0) {
            this.updateStats();
        }
    }

    /**
     * Логирует информационное сообщение
     */
    log(...args: any[]): void {
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
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        this.screen.destroy();
    }
}

// Экспортируем единственный экземпляр (создается только в dev режиме)
let tuiLoggerInstance: TUILogger | null = null;

export function getTUILogger(): TUILogger | null {
    return tuiLoggerInstance;
}

export function createTUILogger(): TUILogger {
    if (!tuiLoggerInstance) {
        tuiLoggerInstance = new TUILogger();
    }
    return tuiLoggerInstance;
}

