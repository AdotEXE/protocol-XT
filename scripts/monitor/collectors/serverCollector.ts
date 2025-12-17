/**
 * Server Collector - Сбор метрик с WebSocket сервера
 */

import WebSocket from 'ws';
import type { ServerStats, DetailedRoomStats, DetailedPlayerStats } from '../../../src/server/monitoring';

export interface ServerCollectorConfig {
    host: string;
    port: number;
    reconnectInterval: number;
}

export interface ServerMetrics {
    server?: {
        online: boolean;
        uptime?: number;
        tickRate?: number;
        tickCount?: number;
        averageTickTime?: number;
        maxTickTime?: number;
        minTickTime?: number;
    };
    fps?: number;
    latency?: number;
    players?: number;
    authenticated?: number;
    rooms?: number;
    activeRooms?: number;
    inQueue?: number;
    websocketConns?: number;
    avgPing?: number;
    roomsList?: Array<{
        id: string;
        mode: string;
        players: number;
        maxPlayers: number;
        status: string;
        gameTime?: number;
    }>;
    // Extended metrics
    memoryUsage?: {
        rss?: number;
        heapTotal?: number;
        heapUsed?: number;
        external?: number;
    };
    networkStats?: {
        bytesIn?: number;
        bytesOut?: number;
        messagesIn?: number;
        messagesOut?: number;
    };
    roomsByMode?: Record<string, number>;
    queueByMode?: Record<string, number>;
    // Aggregated client metrics (from all connected clients)
    aggregatedClientMetrics?: {
        avgFps?: number;
        gpu?: { renderer?: string; vendor?: string; memory?: number };
        physics?: { objects?: number; bodies?: number; time?: number };
        audio?: { sources?: number; playing?: number };
        effects?: { particles?: number; systems?: number };
        scene?: { meshes?: number; lights?: number; textures?: number };
    };
}

export class ServerCollector {
    private config: ServerCollectorConfig;
    private ws: WebSocket | null = null;
    private connected: boolean = false;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private lastStats: ServerStats | null = null;
    private lastStatsTime: number = 0;
    private connectTime: number = 0;
    
    constructor(config: ServerCollectorConfig) {
        this.config = config;
    }
    
    async start(): Promise<void> {
        // Try to connect, but don't fail if it doesn't work immediately
        // The reconnect logic will handle retries
        try {
            await this.connect();
        } catch (error) {
            // If initial connection fails, schedule reconnect
            // This allows monitor to start even if server is not ready yet
            console.log('[ServerCollector] Initial connection failed, will retry...');
            this.scheduleReconnect();
        }
    }
    
    async stop(): Promise<void> {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.connected = false;
    }
    
    async collect(): Promise<ServerMetrics> {
        if (!this.connected || !this.lastStats) {
            return {
                server: {
                    online: false
                }
            };
        }
        
        const now = Date.now();
        const uptime = this.connectTime > 0 ? now - this.connectTime : 0;
        
        // Calculate latency (time since last stats update)
        const latency = this.lastStatsTime > 0 ? now - this.lastStatsTime : 0;
        
        // Get rooms list from stats (if available)
        const roomsList = (this.lastStats as any).roomsList || [];
        
        return {
            server: {
                online: true,
                uptime: this.lastStats.uptime,
                tickRate: this.lastStats.tickRate
            },
            fps: this.lastStats.tickRate,
            latency: latency < 1000 ? latency : undefined,
            players: this.lastStats.totalPlayers,
            authenticated: this.lastStats.authenticatedPlayers,
            rooms: this.lastStats.totalRooms,
            activeRooms: this.lastStats.activeRooms,
            inQueue: this.lastStats.playersInQueue,
            websocketConns: this.lastStats.activeConnections,
            avgPing: 0, // TODO: Calculate from player stats
            roomsList
        };
    }
    
    private async connect(): Promise<void> {
        const url = `ws://${this.config.host}:${this.config.port}`;
        
        try {
            // Close existing connection if any
            if (this.ws) {
                try {
                    this.ws.removeAllListeners();
                    this.ws.close();
                } catch (e) {
                    // Ignore
                }
                this.ws = null;
            }
            
            this.ws = new WebSocket(url);
            
            this.ws.on('open', () => {
                this.connected = true;
                this.connectTime = Date.now();
                console.log(`[ServerCollector] Connected to ${url}`);
                
                // Clear any pending reconnect timer
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                
                // Send monitoring connect message
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        // Small delay to ensure connection is fully established
                        setTimeout(() => {
                            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                                this.ws.send(JSON.stringify({
                                    type: 'monitoring_connect',
                                    data: {},
                                    timestamp: Date.now()
                                }));
                            }
                        }, 100);
                    } catch (error) {
                        // Ignore errors sending connect message
                    }
                }
            });
            
            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const dataStr = data.toString();
                    const message = JSON.parse(dataStr);
                    
                    // Handle monitoring_stats message type
                    if (message.type === 'monitoring_stats') {
                        this.lastStats = message.data as ServerStats;
                        this.lastStatsTime = Date.now();
                    }
                } catch (error) {
                    // Silently ignore parse errors - server sends binary messages for game data
                    // Only log if it's actually a JSON parse error (not binary data)
                    if (error instanceof SyntaxError) {
                        // This is likely binary game data, ignore silently
                    } else {
                        // Only log unexpected errors, not connection issues
                    }
                }
            });
            
            this.ws.on('close', () => {
                if (this.connected) {
                    console.log('[ServerCollector] Disconnected, reconnecting...');
                }
                this.connected = false;
                this.scheduleReconnect();
            });
            
            this.ws.on('error', (error: Error) => {
                // Only log error if we were previously connected
                // Initial connection errors are expected if server is not ready
                if (this.connected) {
                    console.error('[ServerCollector] WebSocket error:', error.message);
                }
                this.connected = false;
                // Don't schedule reconnect here - close event will handle it
            });
            
            // Set timeout for initial connection
            setTimeout(() => {
                if (!this.connected && this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    // Connection is taking too long, close and retry
                    try {
                        this.ws.close();
                    } catch (e) {
                        // Ignore
                    }
                }
            }, 5000);
            
        } catch (error: any) {
            // Connection setup failed - schedule reconnect
            this.scheduleReconnect();
        }
    }
    
    private scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, this.config.reconnectInterval);
    }
    
    isConnected(): boolean {
        return this.connected;
    }
}

