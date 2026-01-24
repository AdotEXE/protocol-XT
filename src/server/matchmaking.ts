import type { GameMode } from "../shared/types";
import { GameRoom } from "./room";
import { ServerPlayer } from "./player";
import { logger, LogLevel, loggingSettings } from "../client/utils/logger";

export interface MatchmakingQueue {
    mode: GameMode;
    region?: string;
    players: ServerPlayer[];
    minSkill?: number;
    maxSkill?: number;
}

export class MatchmakingSystem {
    private queues: Map<string, MatchmakingQueue> = new Map();
    private skillLevels: Map<string, number> = new Map(); // playerId -> skill level
    private roomIdGenerator: (() => string) | null = null; // Функция для генерации ID комнат

    constructor() {
        // Clean up empty queues periodically
        setInterval(() => {
            this.cleanupQueues();
        }, 30000); // Every 30 seconds
    }

    // Устанавливаем функцию генерации ID комнат
    setRoomIdGenerator(generator: () => string): void {
        this.roomIdGenerator = generator;
    }

    private getQueueKey(mode: GameMode, region?: string): string {
        return `${mode}_${region || "global"}`;
    }

    addToQueue(player: ServerPlayer, mode: GameMode, region?: string): void {
        const queueKey = this.getQueueKey(mode, region);

        if (!this.queues.has(queueKey)) {
            this.queues.set(queueKey, {
                mode,
                region,
                players: []
            });
        }

        const queue = this.queues.get(queueKey)!;

        // Check if player is already in queue
        if (queue.players.includes(player)) {
            return;
        }

        queue.players.push(player);
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[Matchmaking] Player ${player.name} added to queue: ${queueKey} (${queue.players.length} players)`);
        }
    }

    removeFromQueue(player: ServerPlayer, mode: GameMode, region?: string): boolean {
        const queueKey = this.getQueueKey(mode, region);
        const queue = this.queues.get(queueKey);

        if (!queue) return false;

        const index = queue.players.indexOf(player);
        if (index !== -1) {
            queue.players.splice(index, 1);
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug(`[Matchmaking] Player ${player.name} removed from queue: ${queueKey}`);
            }
            return true;
        }

        return false;
    }

    findMatch(player: ServerPlayer, mode: GameMode, region?: string, skillBased: boolean = false, mapType?: string, customMapData?: any): GameRoom | null {
        const queueKey = this.getQueueKey(mode, region);
        const queue = this.queues.get(queueKey);

        if (!queue || queue.players.length < 2) {
            return null;
        }

        // Simple matchmaking: find players in queue
        if (skillBased) {
            return this.findSkillBasedMatch(player, queue, mapType, customMapData);
        } else {
            return this.findQuickMatch(player, queue, mapType, customMapData);
        }
    }

    private findQuickMatch(player: ServerPlayer, queue: MatchmakingQueue, mapType?: string, customMapData?: any): GameRoom | null {
        // Find first available player
        const otherPlayers = queue.players.filter(p => p.id !== player.id && !p.roomId);

        if (otherPlayers.length === 0) {
            return null;
        }

        // Create room with first available player
        const otherPlayer = otherPlayers[0];
        if (!otherPlayer) {
            return null;
        }
        // Генерируем простой ID комнаты
        const roomId = this.roomIdGenerator ? this.roomIdGenerator() : undefined;
        const room = new GameRoom(queue.mode, 32, false, undefined, roomId, mapType);

        // Сохраняем данные кастомной карты
        if (customMapData) {
            room.customMapData = customMapData;
        }

        room.addPlayer(player);
        room.addPlayer(otherPlayer);

        // Remove from queue
        this.removeFromQueue(player, queue.mode, queue.region);
        this.removeFromQueue(otherPlayer, queue.mode, queue.region);

        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[Matchmaking] Quick match found: ${player.name} vs ${otherPlayer.name}, mapType=${mapType || 'normal'}`);
        }

        return room;
    }

    private findSkillBasedMatch(player: ServerPlayer, queue: MatchmakingQueue, mapType?: string, customMapData?: any): GameRoom | null {
        const playerSkill = this.getSkillLevel(player.id);
        const skillRange = 5; // ±5 skill levels

        // Find players with similar skill
        const candidates = queue.players.filter(p => {
            if (p.id === player.id || p.roomId) return false;
            const skill = this.getSkillLevel(p.id);
            return Math.abs(skill - playerSkill) <= skillRange;
        });

        if (candidates.length === 0) {
            // Fallback to quick match if no skill match found
            return this.findQuickMatch(player, queue, mapType, customMapData);
        }

        // Create room with best match
        const match = candidates[0];
        if (!match) {
            return this.findQuickMatch(player, queue, mapType, customMapData);
        }
        // Генерируем простой ID комнаты
        const roomId = this.roomIdGenerator ? this.roomIdGenerator() : undefined;
        const room = new GameRoom(queue.mode, 32, false, undefined, roomId, mapType);

        // Сохраняем данные кастомной карты
        if (customMapData) {
            room.customMapData = customMapData;
        }

        room.addPlayer(player);
        room.addPlayer(match);

        // Remove from queue
        this.removeFromQueue(player, queue.mode, queue.region);
        this.removeFromQueue(match, queue.mode, queue.region);

        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[Matchmaking] Skill-based match found: ${player.name} (skill ${playerSkill}) vs ${match.name} (skill ${this.getSkillLevel(match.id)}), mapType=${mapType || 'normal'}`);
        }

        return room;
    }

    getSkillLevel(playerId: string): number {
        // Default skill level (can be loaded from database)
        return this.skillLevels.get(playerId) || 10;
    }

    setSkillLevel(playerId: string, level: number): void {
        this.skillLevels.set(playerId, level);
    }

    updateSkillAfterMatch(playerId: string, won: boolean, _opponentSkill: number): void {
        const currentSkill = this.getSkillLevel(playerId);
        const change = won ? 2 : -1; // Gain 2 on win, lose 1 on loss
        const newSkill = Math.max(0, Math.min(100, currentSkill + change));
        this.setSkillLevel(playerId, newSkill);
    }

    private cleanupQueues(): void {
        for (const [key, queue] of this.queues.entries()) {
            // Remove disconnected players
            queue.players = queue.players.filter(p => p.connected);

            // Remove empty queues
            if (queue.players.length === 0) {
                this.queues.delete(key);
            }
        }
    }

    getQueueSize(mode: GameMode, region?: string): number {
        const queueKey = this.getQueueKey(mode, region);
        const queue = this.queues.get(queueKey);
        return queue ? queue.players.length : 0;
    }
}

