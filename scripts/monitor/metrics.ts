/**
 * Metrics Manager - Управление сбором метрик
 */

import type { MonitorConfig } from './core';
import { ServerCollector } from './collectors/serverCollector';
import { ClientCollector } from './collectors/clientCollector';
import { SystemCollector } from './collectors/systemCollector';
import { NetworkCollector } from './collectors/networkCollector';
import { FirebaseCollector } from './collectors/firebaseCollector';
import { PortCollector } from './collectors/portCollector';

export interface MetricsSnapshot {
    timestamp: number;

    // System status
    systemStatus: {
        vite: { online: boolean; responseTime?: number };
        server: { online: boolean; uptime?: number };
        firebase: { online: boolean; lastRequest?: number };
        physics: { active: boolean };
    };

    // Performance
    performance: {
        cpu: { usage: number; cores: number };
        ram: { used: number; total: number; percent: number };
        serverFps: number;
        clientFps?: number;
        latency?: number;
        // Extended server performance metrics
        serverMetrics?: {
            tickCount?: number;
            averageTickTime?: number;
            maxTickTime?: number;
            minTickTime?: number;
        };
        // Extended client metrics
        clientMetrics?: {
            gpu?: { renderer?: string; vendor?: string; memory?: number };
            physics?: { objects?: number; bodies?: number; time?: number };
            audio?: { sources?: number; playing?: number };
            effects?: { particles?: number; systems?: number };
            scene?: { meshes?: number; lights?: number; textures?: number };
        };
    };

    // Connections
    connections: {
        players: number;
        authenticated: number;
        guests: number;
        rooms: number;
        activeRooms: number;
        inQueue: number;
        websocketConns: number;
        avgPing: number;
    };

    // Resources
    resources: {
        cpuHistory: number[];
        ramHistory: number[];
        networkIn: number;
        networkOut: number;
        diskUsage?: number;
        serverMemory?: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
        };
    };

    // Game state
    gameState: {
        rooms: Array<{
            id: string;
            mode: string;
            players: number;
            maxPlayers: number;
            status: string;
            gameTime?: number;
        }>;
    };

    // Port status
    portStatus?: {
        ports: Array<{
            port: number;
            label: string;
            url: string;
            type: 'http' | 'websocket';
            online: boolean;
            lastCheck: number;
            responseTime?: number;
        }>;
    };
}

export class MetricsManager {
    private config: MonitorConfig;
    private serverCollector: ServerCollector;
    private clientCollector: ClientCollector;
    private systemCollector: SystemCollector;
    private networkCollector: NetworkCollector;
    private firebaseCollector: FirebaseCollector;
    private portCollector: PortCollector;

    private currentMetrics: MetricsSnapshot | null = null;

    constructor(config: MonitorConfig) {
        this.config = config;

        // Initialize collectors
        this.serverCollector = new ServerCollector(config.server);
        this.clientCollector = new ClientCollector(config.client);
        this.systemCollector = new SystemCollector();
        this.networkCollector = new NetworkCollector();
        this.firebaseCollector = new FirebaseCollector();
        this.portCollector = new PortCollector({ checkInterval: 5000 }); // Проверка каждые 5 секунд
    }

    async start(): Promise<void> {
        // Start all collectors
        await Promise.all([
            this.serverCollector.start(),
            this.clientCollector.start(),
            this.systemCollector.start(),
            this.networkCollector.start(),
            this.firebaseCollector.start()
        ]);

        // Start port collector (runs in background)
        this.portCollector.start();
    }

    async stop(): Promise<void> {
        // Stop all collectors
        await Promise.all([
            this.serverCollector.stop(),
            this.clientCollector.stop(),
            this.systemCollector.stop(),
            this.networkCollector.stop(),
            this.firebaseCollector.stop()
        ]);

        // Stop port collector
        this.portCollector.stop();
    }

    async collectMetrics(): Promise<MetricsSnapshot> {
        // Collect from all sources (with error handling)
        const [serverMetrics, clientMetrics, systemMetrics, networkMetrics, firebaseMetrics] = await Promise.allSettled([
            this.serverCollector.collect(),
            this.clientCollector.collect(),
            this.systemCollector.collect(),
            this.networkCollector.collect(),
            this.firebaseCollector.collect()
        ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : {}));

        // Combine metrics (with type safety)
        const server = (serverMetrics as any) || {};
        const client = (clientMetrics as any) || {};
        const system = (systemMetrics as any) || {};
        const network = (networkMetrics as any) || {};
        const firebase = (firebaseMetrics as any) || {};

        const snapshot: MetricsSnapshot = {
            timestamp: Date.now(),
            systemStatus: {
                vite: client.vite || { online: false },
                server: server.server || { online: false },
                firebase: firebase.firebase || { online: false },
                physics: { active: true } // Assume active if server is online
            },
            performance: {
                cpu: system.cpu || { usage: 0, cores: 0 },
                ram: server.memoryUsage ? {
                    used: server.memoryUsage.rss, // Use RSS for actual memory usage against plan
                    total: 2 * 1024 * 1024 * 1024, // 2GB limit (Vercel default)
                    percent: (server.memoryUsage.rss / (2 * 1024 * 1024 * 1024)) * 100
                } : (system.ram || { used: 0, total: 0, percent: 0 }),
                serverFps: server.fps || 0,
                clientFps: server.aggregatedClientMetrics?.avgFps || client.fps,
                latency: server.latency,
                // Extended server performance metrics
                serverMetrics: server.server ? {
                    tickCount: server.server.tickCount,
                    averageTickTime: server.server.averageTickTime,
                    maxTickTime: server.server.maxTickTime,
                    minTickTime: server.server.minTickTime
                } : undefined,
                // Extended client metrics (aggregated from all connected clients via server)
                clientMetrics: server.aggregatedClientMetrics ? {
                    gpu: server.aggregatedClientMetrics.gpu,
                    physics: server.aggregatedClientMetrics.physics,
                    audio: server.aggregatedClientMetrics.audio,
                    effects: server.aggregatedClientMetrics.effects,
                    scene: server.aggregatedClientMetrics.scene
                } : undefined
            },
            connections: {
                players: server.players || 0,
                authenticated: server.authenticated || 0,
                guests: (server.players || 0) - (server.authenticated || 0),
                rooms: server.rooms || 0,
                activeRooms: server.activeRooms || 0,
                inQueue: server.inQueue || 0,
                websocketConns: server.websocketConns || 0,
                avgPing: server.avgPing || 0
            },
            resources: {
                cpuHistory: system.cpuHistory || [],
                ramHistory: system.ramHistory || [],
                networkIn: (server.networkStats?.bytesIn || 0) + (network.networkIn || 0),
                networkOut: (server.networkStats?.bytesOut || 0) + (network.networkOut || 0),
                diskUsage: system.diskUsage,
                // Server memory usage
                serverMemory: server.memoryUsage ? {
                    rss: server.memoryUsage.rss,
                    heapTotal: server.memoryUsage.heapTotal,
                    heapUsed: server.memoryUsage.heapUsed,
                    external: server.memoryUsage.external
                } : undefined
            },
            gameState: {
                rooms: server.roomsList || []
            },
            portStatus: {
                ports: this.portCollector.getPortStatuses()
            }
        };

        this.currentMetrics = snapshot;
        return snapshot;
    }

    getCurrentMetrics(): MetricsSnapshot | null {
        return this.currentMetrics;
    }

    getServerCollector(): ServerCollector {
        return this.serverCollector;
    }

    getClientCollector(): ClientCollector {
        return this.clientCollector;
    }

    getSystemCollector(): SystemCollector {
        return this.systemCollector;
    }

    getPortCollector(): PortCollector {
        return this.portCollector;
    }
}

