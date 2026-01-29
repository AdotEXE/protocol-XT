/**
 * Real-time statistics tracking system
 * Tracks player stats during matches and provides leaderboard data
 */

export interface PlayerMatchStats {
    playerId: string;
    playerName: string;
    kills: number;
    deaths: number;
    score: number;
    team?: number;
    isAlive: boolean;
    damageDealt: number;
    damageTaken: number;
    timestamp: number; // When this stat was recorded
}

export interface KDHistoryPoint {
    time: number; // Time in seconds since match start
    kd: number; // K/D ratio at this point
    kills: number;
    deaths: number;
}

export class RealtimeStatsTracker {
    private matchStartTime: number = 0;
    private isTracking: boolean = false;
    private currentRoomId: string | null = null; // ИСПРАВЛЕНО: Храним ID текущей комнаты/матча
    
    // Current player stats
    private playerStats: Map<string, PlayerMatchStats> = new Map();
    
    // K/D history for local player (for graph)
    private localPlayerKDHistory: KDHistoryPoint[] = [];
    private localPlayerId: string | null = null;
    
    // Update interval for history (every 2 seconds)
    private readonly HISTORY_UPDATE_INTERVAL = 2000;
    private lastHistoryUpdate: number = 0;

    /**
     * Start tracking stats for a match
     */
    startMatch(localPlayerId: string, roomId?: string): void {
        this.matchStartTime = Date.now();
        this.isTracking = true;
        this.localPlayerId = localPlayerId;
        this.currentRoomId = roomId || null; // ИСПРАВЛЕНО: Сохраняем ID комнаты
        this.playerStats.clear();
        this.localPlayerKDHistory = [];
        this.lastHistoryUpdate = 0;
        
        // Add initial point
        this.addKDHistoryPoint(0, 0, 0);
    }

    /**
     * ИСПРАВЛЕНО: Получить ID текущей комнаты
     */
    getCurrentRoomId(): string | null {
        return this.currentRoomId;
    }

    /**
     * Stop tracking stats
     */
    stopMatch(): void {
        this.isTracking = false;
    }

    /**
     * Update player stats from server data
     */
    updatePlayerStats(players: Array<{
        id: string;
        name: string;
        kills: number;
        deaths: number;
        score: number;
        team?: number;
        status?: string;
        damageDealt?: number;
        damageTaken?: number;
    }>): void {
        if (!this.isTracking) return;

        const currentTime = Date.now() - this.matchStartTime;

        players.forEach(player => {
            const existing = this.playerStats.get(player.id);
            const newStats: PlayerMatchStats = {
                playerId: player.id,
                playerName: player.name,
                kills: player.kills || 0,
                deaths: player.deaths || 0,
                score: player.score || 0,
                team: player.team,
                isAlive: player.status === "alive",
                damageDealt: player.damageDealt || (existing?.damageDealt || 0),
                damageTaken: player.damageTaken || (existing?.damageTaken || 0),
                timestamp: currentTime
            };

            this.playerStats.set(player.id, newStats);

            // Update K/D history for local player
            if (player.id === this.localPlayerId) {
                const timeSinceStart = currentTime / 1000; // Convert to seconds
                
                // Check if we should add a new history point
                    if (timeSinceStart - this.lastHistoryUpdate >= this.HISTORY_UPDATE_INTERVAL / 1000) {
                        this.addKDHistoryPoint(timeSinceStart, player.kills, player.deaths);
                        this.lastHistoryUpdate = timeSinceStart;
                    }
            }
        });
    }

    /**
     * Add a K/D history point
     */
    private addKDHistoryPoint(time: number, kills: number, deaths: number): void {
        const kd = deaths > 0 ? kills / deaths : kills;
        this.localPlayerKDHistory.push({ time, kd, kills, deaths });
        
        // Keep only last 60 points (2 minutes at 2s intervals)
        if (this.localPlayerKDHistory.length > 60) {
            this.localPlayerKDHistory.shift();
        }
    }

    /**
     * Get leaderboard sorted by score (or K/D for FFA)
     */
    getLeaderboard(sortBy: "score" | "kd" | "kills" = "score"): PlayerMatchStats[] {
        const players = Array.from(this.playerStats.values());
        
        return players.sort((a, b) => {
            if (sortBy === "score") {
                return b.score - a.score;
            } else if (sortBy === "kd") {
                const kdA = a.deaths > 0 ? a.kills / a.deaths : a.kills;
                const kdB = b.deaths > 0 ? b.kills / b.deaths : b.kills;
                return kdB - kdA;
            } else { // kills
                return b.kills - a.kills;
            }
        });
    }

    /**
     * Get local player stats
     */
    getLocalPlayerStats(): PlayerMatchStats | null {
        if (!this.localPlayerId) return null;
        return this.playerStats.get(this.localPlayerId) || null;
    }

    /**
     * Get K/D history for graph
     */
    getKDHistory(): KDHistoryPoint[] {
        return [...this.localPlayerKDHistory];
    }

    /**
     * Get match time in seconds
     */
    getMatchTime(): number {
        if (!this.isTracking) return 0;
        return (Date.now() - this.matchStartTime) / 1000;
    }

    /**
     * Get all player stats
     */
    getAllPlayerStats(): PlayerMatchStats[] {
        return Array.from(this.playerStats.values());
    }

    /**
     * Clear all stats
     */
    clear(): void {
        this.playerStats.clear();
        this.localPlayerKDHistory = [];
        this.isTracking = false;
        this.localPlayerId = null;
    }
}

