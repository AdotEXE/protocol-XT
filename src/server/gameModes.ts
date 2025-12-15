import { Vector3 } from "@babylonjs/core";
import type { GameMode } from "../shared/types";
import { ServerPlayer } from "./player";
import { GameRoom } from "./room";

export interface GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3;
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null;
    getMaxScore(): number;
    getRespawnDelay(): number;
}

export class FFAMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Spawn in a circle around center
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const totalPlayers = room.getAllPlayers().length;
        const angle = (spawnIndex / totalPlayers) * Math.PI * 2;
        const radius = 30;
        
        return new Vector3(
            Math.cos(angle) * radius,
            5,
            Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // FFA: First to X kills wins
        const maxKills = 20;
        for (const player of room.getAllPlayers()) {
            if (player.kills >= maxKills) {
                return { winner: player.id, reason: `Reached ${maxKills} kills` };
            }
        }
        return null;
    }
    
    getMaxScore(): number {
        return 20; // First to 20 kills
    }
    
    getRespawnDelay(): number {
        return 3000; // 3 seconds
    }
}

export class TDMMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Spawn on team side
        const team = player.team || 0;
        const teamPlayers = room.getAllPlayers().filter(p => (p.team || 0) === team);
        const spawnIndex = teamPlayers.indexOf(player);
        
        // Spawn on opposite sides
        const baseX = team === 0 ? -40 : 40;
        const baseZ = (spawnIndex - teamPlayers.length / 2) * 15;
        
        return new Vector3(baseX, 5, baseZ);
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // TDM: Team with most kills wins
        const team0Kills = room.getAllPlayers()
            .filter(p => (p.team || 0) === 0)
            .reduce((sum, p) => sum + p.kills, 0);
        const team1Kills = room.getAllPlayers()
            .filter(p => (p.team || 0) === 1)
            .reduce((sum, p) => sum + p.kills, 0);
        
        const maxKills = 50;
        if (team0Kills >= maxKills) {
            return { winner: "team0", reason: `Team 0 reached ${maxKills} kills` };
        }
        if (team1Kills >= maxKills) {
            return { winner: "team1", reason: `Team 1 reached ${maxKills} kills` };
        }
        return null;
    }
    
    getMaxScore(): number {
        return 50; // Team total kills
    }
    
    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
}

export class CoopPVEMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Spawn together in safe zone
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 15;
        
        return new Vector3(
            Math.cos(angle) * radius,
            5,
            Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Co-op: Survive X waves or kill all enemies
        // This will be handled by AI system
        return null;
    }
    
    getMaxScore(): number {
        return 100; // Wave-based scoring
    }
    
    getRespawnDelay(): number {
        return 10000; // 10 seconds (longer in co-op)
    }
}

export class BattleRoyaleMode implements GameModeRules {
    private safeZoneRadius: number = 200;
    private safeZoneCenter: Vector3 = new Vector3(0, 0, 0);
    private nextZoneRadius: number = 200;
    private nextZoneCenter: Vector3 = new Vector3(0, 0, 0);
    private zoneShrinkStartTime: number = 0;
    private zoneShrinkDuration: number = 60000; // 60 seconds to shrink
    private damagePerSecond: number = 5; // Damage outside safe zone
    private lastDamageTime: Map<string, number> = new Map();
    
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Random spawn in safe zone (but not too close to center)
        const angle = Math.random() * Math.PI * 2;
        const minRadius = this.safeZoneRadius * 0.3; // Spawn in outer 70% of zone
        const maxRadius = this.safeZoneRadius * 0.9;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        
        return new Vector3(
            this.safeZoneCenter.x + Math.cos(angle) * radius,
            5,
            this.safeZoneCenter.z + Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Battle Royale: Last player standing
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        if (alivePlayers.length === 1) {
            return { winner: alivePlayers[0].id, reason: "Last player standing" };
        }
        if (alivePlayers.length === 0) {
            return { winner: null, reason: "All players eliminated" };
        }
        return null;
    }
    
    getMaxScore(): number {
        return 1; // Survival
    }
    
    getRespawnDelay(): number {
        return 0; // No respawn in Battle Royale
    }
    
    updateSafeZone(gameTime: number, room: GameRoom): void {
        // Shrink safe zone over time
        const totalShrinkTime = 300; // 5 minutes total
        const minRadius = 30; // Minimum safe zone radius
        
        // Calculate current radius based on game time
        const shrinkProgress = Math.min(1, gameTime / totalShrinkTime);
        this.safeZoneRadius = 200 - (200 - minRadius) * shrinkProgress;
        
        // Move center towards a random point (simplified - could be more complex)
        if (shrinkProgress > 0.5) {
            // Start moving center after 50% shrink
            const moveProgress = (shrinkProgress - 0.5) * 2; // 0 to 1
            this.safeZoneCenter = Vector3.Lerp(
                new Vector3(0, 0, 0),
                this.nextZoneCenter,
                moveProgress
            );
        }
        
        // Check players outside safe zone and apply damage
        const currentTime = Date.now();
        for (const player of room.getAllPlayers()) {
            if (player.status !== "alive") continue;
            
            const distance = Vector3.Distance(player.position, this.safeZoneCenter);
            if (distance > this.safeZoneRadius) {
                // Player is outside safe zone
                const lastDamage = this.lastDamageTime.get(player.id) || 0;
                if (currentTime - lastDamage >= 1000) { // Damage every second
                    player.takeDamage(this.damagePerSecond);
                    this.lastDamageTime.set(player.id, currentTime);
                }
            }
        }
    }
    
    getSafeZoneData(): { 
        center: Vector3; 
        radius: number; 
        nextCenter: Vector3; 
        nextRadius: number; 
        shrinkProgress: number;
        timeUntilShrink: number;
        damagePerSecond: number;
    } {
        // Calculate time until next shrink phase (simplified - assumes constant shrink rate)
        const totalShrinkTime = 300; // 5 minutes total
        const currentProgress = Math.min(1, (200 - this.safeZoneRadius) / (200 - 30));
        const timeUntilShrink = Math.max(0, (1 - currentProgress) * totalShrinkTime);
        
        return {
            center: this.safeZoneCenter,
            radius: this.safeZoneRadius,
            nextCenter: this.nextZoneCenter,
            nextRadius: this.nextZoneRadius,
            shrinkProgress: currentProgress,
            timeUntilShrink: timeUntilShrink,
            damagePerSecond: this.damagePerSecond
        };
    }
    
    initialize(room: GameRoom): void {
        // Set initial safe zone
        this.safeZoneRadius = 200;
        this.safeZoneCenter = new Vector3(0, 0, 0);
        
        // Choose random next zone center (within reasonable bounds)
        const nextAngle = Math.random() * Math.PI * 2;
        const nextDistance = 50 + Math.random() * 100;
        this.nextZoneCenter = new Vector3(
            Math.cos(nextAngle) * nextDistance,
            0,
            Math.sin(nextAngle) * nextDistance
        );
        this.nextZoneRadius = 100; // Next zone will be smaller
    }
}

export class CTFMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Spawn at team base
        const team = player.team || 0;
        const baseX = team === 0 ? -50 : 50;
        
        return new Vector3(baseX, 5, 0);
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // CTF: First team to capture X flags
        // This will be handled by flag system
        return null;
    }
    
    getMaxScore(): number {
        return 3; // Flags to capture
    }
    
    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
}

export function getGameModeRules(mode: GameMode): GameModeRules {
    switch (mode) {
        case "ffa":
            return new FFAMode();
        case "tdm":
            return new TDMMode();
        case "coop":
            return new CoopPVEMode();
        case "battle_royale":
            return new BattleRoyaleMode();
        case "ctf":
            return new CTFMode();
        default:
            return new FFAMode();
    }
}

