/**
 * Monitoring API - Экспорт статистики сервера для мониторинга
 */

import { GameServer } from "./gameServer";
import { GameRoom } from "./room";
import { ServerPlayer } from "./player";
import { MatchmakingSystem } from "./matchmaking";
import type { GameMode } from "../shared/types";

export interface ServerStats {
    // Server info
    uptime: number;
    tickRate: number;
    tickCount: number;
    startTime: number;
    
    // Connections
    totalPlayers: number;
    authenticatedPlayers: number;
    guestPlayers: number;
    activeConnections: number;
    
    // Rooms
    totalRooms: number;
    activeRooms: number;
    roomsByMode: Record<GameMode, number>;
    
    // Matchmaking
    playersInQueue: number;
    queueByMode: Record<GameMode, number>;
    
    // Performance
    averageTickTime: number;
    maxTickTime: number;
    minTickTime: number;
    
    // Memory
    memoryUsage: NodeJS.MemoryUsage;
    
    // Network
    bytesIn: number;
    bytesOut: number;
    messagesIn: number;
    messagesOut: number;
}

export interface DetailedRoomStats {
    id: string;
    mode: GameMode;
    maxPlayers: number;
    currentPlayers: number;
    isActive: boolean;
    isPrivate: boolean;
    matchStartTime: number;
    gameTime: number;
    worldSeed: number;
    projectiles: number;
    enemies: number;
    consumables: number;
    players: Array<{
        id: string;
        name: string;
        status: string;
        kills: number;
        deaths: number;
        score: number;
        ping: number;
    }>;
}

export interface DetailedPlayerStats {
    id: string;
    name: string;
    roomId: string | null;
    status: string;
    kills: number;
    deaths: number;
    score: number;
    health: number;
    maxHealth: number;
    ping: number;
    connected: boolean;
    authenticated: boolean;
    inputCount: number;
    shootCount: number;
    violationCount: number;
    suspiciousMovementCount: number;
}

export class MonitoringAPI {
    private server: GameServer;
    private startTime: number;
    private tickTimes: number[] = [];
    private maxTickHistory: number = 100;
    
    // Network stats
    private bytesIn: number = 0;
    private bytesOut: number = 0;
    private messagesIn: number = 0;
    private messagesOut: number = 0;
    
    // Client metrics storage (playerId -> latest metrics)
    private clientMetrics: Map<string, { metrics: any; timestamp: number }> = new Map();
    
    constructor(server: GameServer) {
        this.server = server;
        this.startTime = Date.now();
    }
    
    /**
     * Получить базовую статистику сервера
     */
    getStats(): ServerStats {
        const now = Date.now();
        const uptime = now - this.startTime;
        
        // Calculate average tick time
        const avgTickTime = this.tickTimes.length > 0
            ? this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length
            : 0;
        const maxTickTime = this.tickTimes.length > 0 ? Math.max(...this.tickTimes) : 0;
        const minTickTime = this.tickTimes.length > 0 ? Math.min(...this.tickTimes) : 0;
        
        // Get players info
        const players = this.getPlayers();
        const authenticatedPlayers = players.filter(p => (p as any).authenticated).length;
        const guestPlayers = players.length - authenticatedPlayers;
        
        // Get rooms info
        const rooms = this.getRooms();
        const activeRooms = rooms.filter(r => r.isActive).length;
        
        // Count rooms by mode
        const roomsByMode: Record<GameMode, number> = {
            ffa: 0,
            tdm: 0,
            coop: 0,
            battle_royale: 0,
            ctf: 0
        };
        rooms.forEach(room => {
            roomsByMode[room.mode] = (roomsByMode[room.mode] || 0) + 1;
        });
        
        // Get matchmaking info
        const matchmaking = this.getMatchmaking();
        const queueByMode: Record<GameMode, number> = {
            ffa: 0,
            tdm: 0,
            coop: 0,
            battle_royale: 0,
            ctf: 0
        };
        let totalInQueue = 0;
        
        // Access matchmaking queues (assuming it has a way to get queue info)
        const queues = (matchmaking as any).queues;
        if (queues) {
            queues.forEach((queue: any) => {
                const mode = queue.mode as GameMode;
                const count = queue.players?.length || 0;
                queueByMode[mode] = (queueByMode[mode] || 0) + count;
                totalInQueue += count;
            });
        }
        
        // Get tick rate from server
        const tickRate = this.getTickRate();
        const tickCount = this.getTickCount();
        
        return {
            uptime,
            tickRate,
            tickCount,
            startTime: this.startTime,
            totalPlayers: players.length,
            authenticatedPlayers,
            guestPlayers,
            activeConnections: this.getActiveConnections(),
            totalRooms: rooms.length,
            activeRooms,
            roomsByMode,
            playersInQueue: totalInQueue,
            queueByMode,
            averageTickTime: avgTickTime,
            maxTickTime,
            minTickTime,
            memoryUsage: process.memoryUsage(),
            bytesIn: this.bytesIn,
            bytesOut: this.bytesOut,
            messagesIn: this.messagesIn,
            messagesOut: this.messagesOut
        };
    }
    
    /**
     * Получить детальную статистику всех комнат
     */
    getDetailedRoomStats(): DetailedRoomStats[] {
        const rooms = this.getRooms();
        return rooms.map(room => this.getRoomStats(room));
    }
    
    /**
     * Получить статистику конкретной комнаты
     */
    getRoomStats(room: GameRoom): DetailedRoomStats {
        const players = room.getAllPlayers();
        
        return {
            id: room.id,
            mode: room.mode,
            maxPlayers: room.maxPlayers,
            currentPlayers: players.length,
            isActive: room.isActive,
            isPrivate: room.isPrivate,
            matchStartTime: room.matchStartTime,
            gameTime: room.gameTime,
            worldSeed: room.worldSeed,
            projectiles: room.projectiles.size,
            enemies: room.enemies.size,
            consumables: room.consumables.size,
            players: players.map(p => ({
                id: p.id,
                name: p.name,
                status: p.status,
                kills: p.kills,
                deaths: p.deaths,
                score: p.score,
                ping: p.ping
            }))
        };
    }
    
    /**
     * Получить детальную статистику всех игроков
     */
    getDetailedPlayerStats(): DetailedPlayerStats[] {
        const players = this.getPlayers();
        return players.map(player => this.getPlayerStats(player));
    }
    
    /**
     * Получить статистику конкретного игрока
     */
    getPlayerStats(player: ServerPlayer): DetailedPlayerStats {
        return {
            id: player.id,
            name: player.name,
            roomId: player.roomId,
            status: player.status,
            kills: player.kills,
            deaths: player.deaths,
            score: player.score,
            health: player.health,
            maxHealth: player.maxHealth,
            ping: player.ping,
            connected: player.connected,
            authenticated: !!(player as any).authenticated,
            inputCount: player.inputCount,
            shootCount: player.shootCount,
            violationCount: player.violationCount,
            suspiciousMovementCount: player.suspiciousMovementCount
        };
    }
    
    /**
     * Записать время тика для статистики производительности
     */
    recordTickTime(tickTime: number): void {
        this.tickTimes.push(tickTime);
        if (this.tickTimes.length > this.maxTickHistory) {
            this.tickTimes.shift();
        }
    }
    
    /**
     * Записать сетевую статистику
     */
    recordNetworkStats(bytesIn: number, bytesOut: number, messagesIn: number, messagesOut: number): void {
        this.bytesIn += bytesIn;
        this.bytesOut += bytesOut;
        this.messagesIn += messagesIn;
        this.messagesOut += messagesOut;
    }
    
    /**
     * Сбросить сетевую статистику
     */
    resetNetworkStats(): void {
        this.bytesIn = 0;
        this.bytesOut = 0;
        this.messagesIn = 0;
        this.messagesOut = 0;
    }
    
    // Private helper methods to access server internals
    private getPlayers(): ServerPlayer[] {
        return Array.from((this.server as any).players?.values() || []);
    }
    
    private getRooms(): GameRoom[] {
        return Array.from((this.server as any).rooms?.values() || []);
    }
    
    private getMatchmaking(): MatchmakingSystem {
        return (this.server as any).matchmaking;
    }
    
    private getTickRate(): number {
        // Calculate from tick times
        if (this.tickTimes.length < 2) return 60;
        const avgTickTime = this.tickTimes.reduce((a, b) => a + b, 0) / this.tickTimes.length;
        return avgTickTime > 0 ? 1000 / avgTickTime : 60;
    }
    
    private getTickCount(): number {
        return (this.server as any).tickCount || 0;
    }
    
    private getActiveConnections(): number {
        const wss = (this.server as any).wss;
        if (!wss) return 0;
        return wss.clients?.size || 0;
    }
    
    // Client metrics storage (playerId -> latest metrics)
    private clientMetrics: Map<string, { metrics: any; timestamp: number }> = new Map();
    
    /**
     * Сохранить метрики клиента
     */
    storeClientMetrics(playerId: string, metrics: any): void {
        this.clientMetrics.set(playerId, {
            metrics,
            timestamp: Date.now()
        });
        
        // Cleanup old metrics (older than 30 seconds)
        const now = Date.now();
        for (const [id, data] of this.clientMetrics.entries()) {
            if (now - data.timestamp > 30000) {
                this.clientMetrics.delete(id);
            }
        }
    }
    
    /**
     * Получить метрики клиента
     */
    getClientMetrics(playerId: string): any | null {
        const data = this.clientMetrics.get(playerId);
        return data ? data.metrics : null;
    }
    
    /**
     * Получить все метрики клиентов
     */
    getAllClientMetrics(): Map<string, any> {
        const result = new Map<string, any>();
        for (const [playerId, data] of this.clientMetrics.entries()) {
            result.set(playerId, data.metrics);
        }
        return result;
    }
}

