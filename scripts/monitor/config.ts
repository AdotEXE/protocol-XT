/**
 * Config Manager - Управление конфигурацией
 */

import * as fs from 'fs';
import * as path from 'path';
import type { MonitorConfig } from './core';

export class ConfigManager {
    private config: MonitorConfig;
    private configPath: string;

    constructor(configPath?: string) {
        // Default config path (relative to monitor directory)
        const defaultPath = path.join(process.cwd(), 'scripts', 'monitor', 'config.json');
        this.configPath = configPath || defaultPath;

        // Load configuration
        this.config = this.loadConfig();
    }

    getConfig(): MonitorConfig {
        return this.config;
    }

    private loadConfig(): MonitorConfig {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(configData);
            } else {
                // Return default config
                return this.getDefaultConfig();
            }
        } catch (error) {
            console.error(`[Config] Failed to load config from ${this.configPath}:`, error);
            return this.getDefaultConfig();
        }
    }

    private getDefaultConfig(): MonitorConfig {
        return {
            server: {
                host: 'localhost',
                port: 8000,
                reconnectInterval: 5000
            },
            client: {
                viteUrl: 'http://localhost:5001',
                checkInterval: 1000
            },
            updateInterval: 16,
            history: {
                enabled: true,
                duration: 1800,
                interval: 1000
            },
            alerts: {
                enabled: true,
                sound: false,
                rules: {
                    cpuThreshold: 90,
                    ramThreshold: 95,
                    fpsThreshold: 55,
                    latencyThreshold: 100
                }
            },
            ui: {
                theme: 'terminal-green',
                refreshRate: 60
            },
            export: {
                defaultFormat: 'json',
                defaultPath: './monitor-exports'
            }
        };
    }
}

