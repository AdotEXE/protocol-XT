/**
 * Client Collector - Сбор метрик с Vite dev server
 * Note: Client metrics (GPU, CPU, Network, Physics) are collected by the server
 * via WebSocket from game clients and stored in MonitoringAPI.
 * This collector primarily checks Vite dev server status.
 */

export interface ClientCollectorConfig {
    viteUrl: string;
    checkInterval: number;
}

export interface ClientMetrics {
    vite?: {
        online: boolean;
        responseTime?: number;
    };
    fps?: number;
    // Note: Extended client metrics (GPU, CPU, Network, Physics) are collected
    // server-side and available via server stats when clients are connected
}

export class ClientCollector {
    private config: ClientCollectorConfig;
    private checkTimer: NodeJS.Timeout | null = null;
    private lastCheck: { online: boolean; responseTime?: number } | null = null;
    
    constructor(config: ClientCollectorConfig) {
        this.config = config;
    }
    
    async start(): Promise<void> {
        // Start periodic checks
        this.checkTimer = setInterval(() => {
            this.checkVite();
        }, this.config.checkInterval);
        
        // Initial check
        await this.checkVite();
    }
    
    async stop(): Promise<void> {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }
    
    async collect(): Promise<ClientMetrics> {
        return {
            vite: this.lastCheck || { online: false }
        };
    }
    
    private async checkVite(): Promise<void> {
        try {
            const startTime = Date.now();
            
            // Use fetch with timeout (compatible with Node.js 18+)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            try {
                const response = await fetch(this.config.viteUrl, {
                    method: 'HEAD',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                const responseTime = Date.now() - startTime;
                
                if (response.ok) {
                    this.lastCheck = {
                        online: true,
                        responseTime
                    };
                } else {
                    this.lastCheck = {
                        online: false
                    };
                }
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    // Timeout
                    this.lastCheck = {
                        online: false
                    };
                } else {
                    throw fetchError;
                }
            }
        } catch (error) {
            this.lastCheck = {
                online: false
            };
        }
    }
}

