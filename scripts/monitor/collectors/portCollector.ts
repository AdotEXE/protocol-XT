/**
 * Port Collector - Проверка доступности портов
 */

import WebSocket from 'ws';
import * as http from 'http';

export interface PortStatus {
    port: number;
    label: string;
    url: string;
    type: 'http' | 'websocket';
    online: boolean;
    lastCheck: number;
    responseTime?: number;
}

export interface PortCollectorConfig {
    checkInterval: number; // Интервал проверки в мс
    timeout: number; // Таймаут для проверки в мс
}

export class PortCollector {
    private config: PortCollectorConfig;
    private ports: Array<{ port: number; label: string; url: string; type: 'http' | 'websocket' }>;
    private portStatuses: Map<number, PortStatus> = new Map();
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(config?: Partial<PortCollectorConfig>) {
        this.config = {
            checkInterval: config?.checkInterval ?? 5000, // 5 секунд
            timeout: config?.timeout ?? 2000 // 2 секунды таймаут
        };

        // Определяем порты для проверки
        this.ports = [
            { port: 3000, label: 'Editor', url: 'http://localhost:3000', type: 'http' },
            { port: 5000, label: 'Client', url: 'http://localhost:5000', type: 'http' },
            { port: 7000, label: 'HTTP', url: 'http://localhost:7000', type: 'http' },
            { port: 8000, label: 'WS', url: 'ws://localhost:8000', type: 'websocket' },
            { port: 9000, label: 'Dashboard', url: 'http://localhost:9000', type: 'http' }
        ];

        // Инициализируем статусы
        this.ports.forEach(p => {
            this.portStatuses.set(p.port, {
                port: p.port,
                label: p.label,
                url: p.url,
                type: p.type,
                online: false,
                lastCheck: 0
            });
        });
    }

    /**
     * Проверяет доступность HTTP порта
     */
    private async checkHTTPPort(port: number, url: string): Promise<{ online: boolean; responseTime?: number }> {
        const startTime = Date.now();
        
        return new Promise<{ online: boolean; responseTime?: number }>((resolve) => {
            const timeout = setTimeout(() => {
                req.destroy();
                resolve({ online: false });
            }, this.config.timeout);

            // Для порта 7000 используем /health endpoint, для остальных просто проверяем доступность
            const path = port === 7000 ? '/health' : '/';
            const urlObj = new URL(url);
            
            const req = http.request({
                hostname: urlObj.hostname,
                port: urlObj.port || port,
                path: path,
                method: 'GET',
                timeout: this.config.timeout
            }, (res) => {
                clearTimeout(timeout);
                const responseTime = Date.now() - startTime;
                
                // Для порта 7000 проверяем статус код, для остальных - просто доступность
                if (port === 7000) {
                    resolve({ online: res.statusCode === 200, responseTime });
                } else {
                    // Любой ответ означает что порт доступен
                    resolve({ online: true, responseTime });
                }
            });

            req.on('error', (error) => {
                clearTimeout(timeout);
                resolve({ online: false });
            });

            req.on('timeout', () => {
                req.destroy();
                clearTimeout(timeout);
                resolve({ online: false });
            });

            req.end();
        });
    }

    /**
     * Проверяет доступность WebSocket порта
     */
    private async checkWebSocketPort(port: number, url: string): Promise<{ online: boolean; responseTime?: number }> {
        const startTime = Date.now();
        
        return new Promise<{ online: boolean; responseTime?: number }>((resolve) => {
            try {
                // Используем WebSocket (ws библиотека для Node.js) для проверки
                const ws = new WebSocket(url);
                
                const timeout = setTimeout(() => {
                    ws.close();
                    resolve({ online: false });
                }, this.config.timeout);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    const responseTime = Date.now() - startTime;
                    ws.close();
                    resolve({ online: true, responseTime });
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve({ online: false });
                });

                ws.on('close', () => {
                    clearTimeout(timeout);
                });
            } catch (error) {
                resolve({ online: false });
            }
        });
    }

    /**
     * Проверяет все порты
     */
    async checkAllPorts(): Promise<PortStatus[]> {
        const checks = this.ports.map(async (portInfo) => {
            let result: { online: boolean; responseTime?: number };

            if (portInfo.type === 'http') {
                result = await this.checkHTTPPort(portInfo.port, portInfo.url);
            } else {
                result = await this.checkWebSocketPort(portInfo.port, portInfo.url);
            }

            const status: PortStatus = {
                port: portInfo.port,
                label: portInfo.label,
                url: portInfo.url,
                type: portInfo.type,
                online: result.online,
                lastCheck: Date.now(),
                responseTime: result.responseTime
            };

            this.portStatuses.set(portInfo.port, status);
            return status;
        });

        return Promise.all(checks);
    }

    /**
     * Получить текущий статус портов
     */
    getPortStatuses(): PortStatus[] {
        return Array.from(this.portStatuses.values());
    }

    /**
     * Получить статус конкретного порта
     */
    getPortStatus(port: number): PortStatus | undefined {
        return this.portStatuses.get(port);
    }

    /**
     * Начать периодическую проверку портов
     */
    start(): void {
        if (this.checkInterval) {
            return; // Уже запущен
        }

        // Первая проверка сразу
        this.checkAllPorts().catch(err => {
            console.error('[PortCollector] Error checking ports:', err);
        });

        // Затем периодически
        this.checkInterval = setInterval(() => {
            this.checkAllPorts().catch(err => {
                console.error('[PortCollector] Error checking ports:', err);
            });
        }, this.config.checkInterval);
    }

    /**
     * Остановить периодическую проверку
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Обновить конфигурацию
     */
    updateConfig(config: Partial<PortCollectorConfig>): void {
        this.config = { ...this.config, ...config };
        
        // Перезапустить если был запущен
        if (this.checkInterval) {
            this.stop();
            this.start();
        }
    }
}

