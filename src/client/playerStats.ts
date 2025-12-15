// ═══════════════════════════════════════════════════════════════════════════
// PLAYER STATISTICS SYSTEM - Система статистики игрока
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayerStats {
    // Combat
    totalKills: number;
    totalDeaths: number;
    totalDamageDealt: number;
    totalDamageTaken: number;
    accuracy: number; // hits / shots
    criticalHits: number;
    
    // POI
    poiCaptured: number;
    poiContested: number;
    ammoCollected: number;
    fuelCollected: number;
    hpRepaired: number;
    fuelDepotsDestroyed: number;
    
    // Survival
    totalPlayTime: number; // seconds
    longestSurvival: number; // seconds
    totalDistance: number; // meters
    
    // Records
    highestKillStreak: number;
    highestCombo: number;
    mostDamageInOneHit: number;
    
    // Session stats
    sessionKills: number;
    sessionDeaths: number;
    sessionStartTime: number;
}

export class PlayerStatsSystem {
    private stats: PlayerStats;
    private onStatsUpdate: ((stats: PlayerStats) => void) | null = null;
    
    constructor() {
        this.stats = this.getDefaultStats();
        this.loadStats();
        this.stats.sessionStartTime = Date.now();
    }
    
    private getDefaultStats(): PlayerStats {
        return {
            totalKills: 0,
            totalDeaths: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            accuracy: 0,
            criticalHits: 0,
            poiCaptured: 0,
            poiContested: 0,
            ammoCollected: 0,
            fuelCollected: 0,
            hpRepaired: 0,
            fuelDepotsDestroyed: 0,
            totalPlayTime: 0,
            longestSurvival: 0,
            totalDistance: 0,
            highestKillStreak: 0,
            highestCombo: 0,
            mostDamageInOneHit: 0,
            sessionKills: 0,
            sessionDeaths: 0,
            sessionStartTime: Date.now()
        };
    }
    
    setOnStatsUpdate(callback: (stats: PlayerStats) => void): void {
        this.onStatsUpdate = callback;
    }
    
    // Combat stats
    recordKill(): void {
        this.stats.totalKills++;
        this.stats.sessionKills++;
        this.notifyUpdate();
    }
    
    recordDeath(): void {
        this.stats.totalDeaths++;
        this.stats.sessionDeaths++;
        this.notifyUpdate();
    }
    
    recordDamageDealt(amount: number): void {
        this.stats.totalDamageDealt += amount;
        if (amount > this.stats.mostDamageInOneHit) {
            this.stats.mostDamageInOneHit = amount;
        }
        this.notifyUpdate();
    }
    
    recordDamageTaken(amount: number): void {
        this.stats.totalDamageTaken += amount;
        this.notifyUpdate();
    }
    
    recordShot(hit: boolean): void {
        // Simple accuracy tracking (could be improved)
        if (hit) {
            this.stats.accuracy = (this.stats.accuracy * 0.99) + (1 * 0.01);
        } else {
            this.stats.accuracy = (this.stats.accuracy * 0.99) + (0 * 0.01);
        }
        this.notifyUpdate();
    }
    
    recordCriticalHit(): void {
        this.stats.criticalHits++;
        this.notifyUpdate();
    }
    
    // POI stats
    recordPOICapture(): void {
        this.stats.poiCaptured++;
        this.notifyUpdate();
    }
    
    recordPOIContest(): void {
        this.stats.poiContested++;
        this.notifyUpdate();
    }
    
    recordAmmoCollected(amount: number): void {
        this.stats.ammoCollected += amount;
        this.notifyUpdate();
    }
    
    recordFuelCollected(amount: number): void {
        this.stats.fuelCollected += amount;
        this.notifyUpdate();
    }
    
    recordHPRepaired(amount: number): void {
        this.stats.hpRepaired += amount;
        this.notifyUpdate();
    }
    
    recordFuelDepotDestroyed(): void {
        this.stats.fuelDepotsDestroyed++;
        this.notifyUpdate();
    }
    
    // Survival stats
    recordSurvivalTime(seconds: number): void {
        this.stats.totalPlayTime += seconds;
        if (seconds > this.stats.longestSurvival) {
            this.stats.longestSurvival = seconds;
        }
        this.notifyUpdate();
    }
    
    recordDistance(meters: number): void {
        this.stats.totalDistance += meters;
        this.notifyUpdate();
    }
    
    // Records
    recordKillStreak(streak: number): void {
        if (streak > this.stats.highestKillStreak) {
            this.stats.highestKillStreak = streak;
            this.notifyUpdate();
        }
    }
    
    recordCombo(combo: number): void {
        if (combo > this.stats.highestCombo) {
            this.stats.highestCombo = combo;
            this.notifyUpdate();
        }
    }
    
    // Get stats
    getStats(): PlayerStats {
        return { ...this.stats };
    }
    
    getKDRatio(): number {
        if (this.stats.totalDeaths === 0) return this.stats.totalKills;
        return this.stats.totalKills / this.stats.totalDeaths;
    }
    
    getSessionTime(): number {
        return (Date.now() - this.stats.sessionStartTime) / 1000;
    }
    
    // Reset session stats
    resetSession(): void {
        this.stats.sessionKills = 0;
        this.stats.sessionDeaths = 0;
        this.stats.sessionStartTime = Date.now();
        this.notifyUpdate();
    }
    
    private notifyUpdate(): void {
        this.saveStats();
        if (this.onStatsUpdate) {
            this.onStatsUpdate(this.getStats());
        }
    }
    
    private saveStats(): void {
        try {
            // Don't save session stats
            const toSave = { ...this.stats };
            toSave.sessionKills = 0;
            toSave.sessionDeaths = 0;
            localStorage.setItem("tx_player_stats", JSON.stringify(toSave));
        } catch (e) {
            console.warn("[Stats] Failed to save:", e);
        }
    }
    
    private loadStats(): void {
        try {
            const saved = localStorage.getItem("tx_player_stats");
            if (saved) {
                const loaded = JSON.parse(saved);
                this.stats = { ...this.getDefaultStats(), ...loaded };
            }
        } catch (e) {
            console.warn("[Stats] Failed to load:", e);
        }
    }
    
    // Reset all stats (for testing)
    resetAll(): void {
        this.stats = this.getDefaultStats();
        this.saveStats();
        this.notifyUpdate();
    }
}

