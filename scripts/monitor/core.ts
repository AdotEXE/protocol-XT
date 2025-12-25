/**
 * Monitor Core - Ядро системы мониторинга
 */

import { ConfigManager } from './config';
import { MetricsManager } from './metrics';
import { HistoryManager } from './history';
import { AlertManager } from './alerts';

export interface MonitorConfig {
    server: {
        host: string;
        port: number;
        reconnectInterval: number;
    };
    client: {
        viteUrl: string;
        checkInterval: number;
    };
    updateInterval: number;
    history: {
        enabled: boolean;
        duration: number;
        interval: number;
    };
    alerts: {
        enabled: boolean;
        sound: boolean;
        rules: {
            cpuThreshold: number;
            ramThreshold: number;
            fpsThreshold: number;
            latencyThreshold: number;
        };
    };
    ui: {
        theme: string;
        refreshRate: number;
    };
    export: {
        defaultFormat: string;
        defaultPath: string;
    };
}

export class MonitorCore {
    private config: MonitorConfig;
    private configManager: ConfigManager;
    private metricsManager: MetricsManager;
    private historyManager: HistoryManager;
    private alertManager: AlertManager;
    private isRunning: boolean = false;
    private updateInterval: NodeJS.Timeout | null = null;
    
    constructor(configPath?: string) {
        // Load configuration
        this.configManager = new ConfigManager(configPath);
        this.config = this.configManager.getConfig();
        
        // Initialize managers
        this.metricsManager = new MetricsManager(this.config);
        this.historyManager = new HistoryManager(this.config.history);
        this.alertManager = new AlertManager(this.config.alerts);
        
        // Setup signal handlers
        this.setupSignalHandlers();
    }
    
    async start(): Promise<void> {
        if (this.isRunning) {
            console.warn('[Monitor] Already running');
            return;
        }
        
        this.isRunning = true;
        
        // Start metrics collection
        await this.metricsManager.start();
        
        // Start update loop
        this.startUpdateLoop();
        
        console.log('[Monitor] Started');
    }
    
    async stop(): Promise<void> {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        // Stop update loop
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        // Stop metrics collection
        await this.metricsManager.stop();
        
        console.log('[Monitor] Stopped');
    }
    
    getMetricsManager(): MetricsManager {
        return this.metricsManager;
    }
    
    getHistoryManager(): HistoryManager {
        return this.historyManager;
    }
    
    getAlertManager(): AlertManager {
        return this.alertManager;
    }
    
    getConfig(): MonitorConfig {
        return this.config;
    }
    
    private startUpdateLoop(): void {
        const interval = this.config.updateInterval;
        
        this.updateInterval = setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                // Collect current metrics
                await this.metricsManager.collectMetrics();
                const metrics = this.metricsManager.getCurrentMetrics();
                
                if (!metrics) return;
                
                // Store in history
                if (this.config.history.enabled) {
                    this.historyManager.addSnapshot(metrics);
                }
                
                // Check alerts
                if (this.config.alerts.enabled) {
                    this.alertManager.checkMetrics(metrics);
                }
            } catch (error) {
                console.error('[MonitorCore] Error in update loop:', error);
            }
        }, interval);
    }
    
    private setupSignalHandlers(): void {
        process.on('SIGINT', async () => {
            console.log('\n[Monitor] Shutting down...');
            await this.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n[Monitor] Shutting down...');
            await this.stop();
            process.exit(0);
        });
    }
}

