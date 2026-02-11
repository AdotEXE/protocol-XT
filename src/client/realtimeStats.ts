// ═══════════════════════════════════════════════════════════════════════════
// REALTIME STATS TRACKER - Статистика матча в мультиплеере (Tab scoreboard)
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "./utils/logger";

export interface PlayerMatchStats {
    id: string;
    name: string;
    kills?: number;
    deaths?: number;
    score?: number;
    team?: number;
    status?: string;
    damageDealt?: number;
    damageTaken?: number;
}

/**
 * Трекер статистики матча в реальном времени для мультиплеера.
 * Используется для отображения в Tab (scoreboard) и Kill Feed.
 */
export class RealtimeStatsTracker {
    private players = new Map<string, PlayerMatchStats>();
    private localPlayerId: string | undefined;
    private roomId: string | undefined;
    isTracking = false;

    startMatch(playerId: string, roomId?: string): void {
        this.localPlayerId = playerId;
        this.roomId = roomId;
        this.isTracking = true;
        this.players.clear();
        logger.log(`[RealtimeStats] Match started localPlayerId=${playerId}, roomId=${roomId ?? "N/A"}`);
    }

    stopMatch(): void {
        this.isTracking = false;
        this.localPlayerId = undefined;
        this.roomId = undefined;
        this.players.clear();
        logger.log("[RealtimeStats] Match stopped");
    }

    updateStats(playerId: string, delta: { kills?: number; deaths?: number; score?: number }): void {
        const cur = this.players.get(playerId) || { id: playerId, name: playerId, kills: 0, deaths: 0, score: 0 };
        if (delta.kills !== undefined) cur.kills = (cur.kills ?? 0) + delta.kills;
        if (delta.deaths !== undefined) cur.deaths = (cur.deaths ?? 0) + delta.deaths;
        if (delta.score !== undefined) cur.score = (cur.score ?? 0) + delta.score;
        this.players.set(playerId, cur);
    }

    updatePlayerStats(players: PlayerMatchStats[]): void {
        for (const p of players) {
            this.players.set(p.id, { ...p });
        }
    }

    getPlayers(): PlayerMatchStats[] {
        return Array.from(this.players.values());
    }

    getLocalPlayerId(): string | undefined {
        return this.localPlayerId;
    }

    getRoomId(): string | undefined {
        return this.roomId;
    }
}
