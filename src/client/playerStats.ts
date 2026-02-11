// PLAYER STATS SYSTEM - Session stats (kills, POI, repair, etc.)

import { logger } from "./utils/logger";

export interface SessionStats {
    kills: number;
    deaths: number;
    poiCaptures: number;
    poiContests: number;
    ammoCollected: number;
    hpRepaired: number;
    fuelCollected: number;
    fuelDepotsDestroyed: number;
}

export class PlayerStatsSystem {
    private stats: SessionStats = {
        kills: 0,
        deaths: 0,
        poiCaptures: 0,
        poiContests: 0,
        ammoCollected: 0,
        hpRepaired: 0,
        fuelCollected: 0,
        fuelDepotsDestroyed: 0
    };

    private onStatsUpdateCb: ((stats: SessionStats) => void) | undefined;

    setOnStatsUpdate(cb: (stats: SessionStats) => void): void {
        this.onStatsUpdateCb = cb;
    }

    private notify(): void {
        if (this.onStatsUpdateCb) this.onStatsUpdateCb({ ...this.stats });
    }

    resetSession(): void {
        this.stats = { kills: 0, deaths: 0, poiCaptures: 0, poiContests: 0, ammoCollected: 0, hpRepaired: 0, fuelCollected: 0, fuelDepotsDestroyed: 0 };
        this.notify();
        logger.log("[PlayerStats] Session reset");
    }

    recordKill(): void { this.stats.kills++; this.notify(); }
    recordDeath(): void { this.stats.deaths++; this.notify(); }
    recordPOICapture(): void { this.stats.poiCaptures++; this.notify(); }
    recordPOIContest(): void { this.stats.poiContests++; this.notify(); }
    recordAmmoCollected(amount: number): void { this.stats.ammoCollected += amount; this.notify(); }
    recordHPRepaired(amount: number): void { this.stats.hpRepaired += amount; this.notify(); }
    recordFuelCollected(amount: number): void { this.stats.fuelCollected += amount; this.notify(); }
    recordFuelDepotDestroyed(): void { this.stats.fuelDepotsDestroyed++; this.notify(); }

    getStats(): SessionStats { return { ...this.stats }; }
}
