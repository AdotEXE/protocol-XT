import { firebaseService } from "./firebaseService";

export interface LeaderboardEntry {
    playerId: string;
    rank: number;
    value: number;
    name?: string;
}

export type LeaderboardType = "kills" | "wins" | "skillRating" | "timePlayed" | "damageDealt";

export class Leaderboard {
    private cache: Map<LeaderboardType, LeaderboardEntry[]> = new Map();
    private cacheTime: Map<LeaderboardType, number> = new Map();
    private readonly CACHE_DURATION = 60000; // 1 minute

    async getLeaderboard(
        type: LeaderboardType = "kills",
        limit: number = 100
    ): Promise<LeaderboardEntry[]> {
        // Check cache
        const cached = this.cache.get(type);
        const cacheTime = this.cacheTime.get(type) || 0;
        const now = Date.now();
        
        if (cached && (now - cacheTime) < this.CACHE_DURATION) {
            return cached.slice(0, limit);
        }

        // Fetch from Firebase
        try {
            let statName: keyof import("./firebaseService").PlayerStats;
            
            switch (type) {
                case "kills":
                    statName = "kills";
                    break;
                case "wins":
                    statName = "wins";
                    break;
                case "timePlayed":
                    statName = "timePlayed";
                    break;
                case "damageDealt":
                    statName = "damageDealt";
                    break;
                case "skillRating":
                    // For skill rating, we need to get from progression
                    return await this.getSkillRatingLeaderboard(limit);
                default:
                    statName = "kills";
            }

            const entries = await firebaseService.getLeaderboard(statName, limit);
            
            // Format entries with ranks
            const leaderboard: LeaderboardEntry[] = entries.map((entry, index) => ({
                playerId: entry.playerId,
                rank: index + 1,
                value: entry.value,
                name: entry.name
            }));

            // Cache results
            this.cache.set(type, leaderboard);
            this.cacheTime.set(type, now);

            return leaderboard;
        } catch (error) {
            console.error("[Leaderboard] Error fetching leaderboard:", error);
            return [];
        }
    }

    private async getSkillRatingLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
        // This would require a separate query or index
        // For now, return empty array
        console.warn("[Leaderboard] Skill rating leaderboard not yet implemented");
        return [];
    }

    async getPlayerRank(playerId: string, type: LeaderboardType = "kills"): Promise<number | null> {
        const leaderboard = await this.getLeaderboard(type, 1000);
        const entry = leaderboard.find(e => e.playerId === playerId);
        return entry ? entry.rank : null;
    }

    clearCache(): void {
        this.cache.clear();
        this.cacheTime.clear();
    }

    clearCacheForType(type: LeaderboardType): void {
        this.cache.delete(type);
        this.cacheTime.delete(type);
    }
}

export const leaderboard = new Leaderboard();

