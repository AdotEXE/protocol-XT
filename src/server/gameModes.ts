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
            1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
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
            1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(_room: GameRoom): { winner: string | null; reason: string } | null {
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
    private damagePerSecond: number = 5; // Damage outside safe zone
    private lastDamageTime: Map<string, number> = new Map();
    
    getSpawnPosition(_player: ServerPlayer, _room: GameRoom): Vector3 {
        // Random spawn in safe zone (but not too close to center)
        const angle = Math.random() * Math.PI * 2;
        const minRadius = this.safeZoneRadius * 0.3; // Spawn in outer 70% of zone
        const maxRadius = this.safeZoneRadius * 0.9;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);
        
        return new Vector3(
            this.safeZoneCenter.x + Math.cos(angle) * radius,
            1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            this.safeZoneCenter.z + Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Battle Royale: Last player standing
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        if (alivePlayers.length === 1) {
            const winner = alivePlayers[0];
            if (winner) {
                return { winner: winner.id, reason: "Last player standing" };
            }
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
    
    initialize(_room: GameRoom): void {
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
    getSpawnPosition(player: ServerPlayer, _room: GameRoom): Vector3 {
        // Spawn at team base
        const team = player.team || 0;
        const baseX = team === 0 ? -50 : 50;
        
        return new Vector3(baseX, 1.0, 0); // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
    }
    
    checkWinCondition(_room: GameRoom): { winner: string | null; reason: string } | null {
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

// Control Point Mode - захват контрольных точек
export class ControlPointMode implements GameModeRules {
    private controlPoints: Array<{ id: string; position: Vector3; team: number | null; captureProgress: number }> = [];
    
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        const team = player.team || 0;
        const teamPlayers = room.getAllPlayers().filter(p => (p.team || 0) === team);
        const spawnIndex = teamPlayers.indexOf(player);
        
        // Spawn near team base
        const baseX = team === 0 ? -50 : 50;
        const baseZ = (spawnIndex - teamPlayers.length / 2) * 15;
        
        return new Vector3(baseX, 1.0, baseZ); // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Control Point: Team with all points or most points for X seconds
        // Simplified: First team to control 2 out of 3 points wins
        if (this.controlPoints.length === 0) {
            this.initializeControlPoints(room);
        }
        
        let team0Points = 0;
        let team1Points = 0;
        
        for (const point of this.controlPoints) {
            if (point.team === 0) team0Points++;
            if (point.team === 1) team1Points++;
        }
        
        const totalPoints = this.controlPoints.length;
        const requiredPoints = Math.ceil(totalPoints / 2);
        
        if (team0Points >= requiredPoints) {
            return { winner: "team0", reason: `Team 0 captured ${team0Points}/${totalPoints} control points` };
        }
        if (team1Points >= requiredPoints) {
            return { winner: "team1", reason: `Team 1 captured ${team1Points}/${totalPoints} control points` };
        }
        
        return null;
    }
    
    getMaxScore(): number {
        return 3; // Control points count
    }
    
    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
    
    private initializeControlPoints(room: GameRoom): void {
        // Create 3 control points in neutral positions
        this.controlPoints = [
            { id: "cp1", position: new Vector3(0, 5, -30), team: null, captureProgress: 0 },
            { id: "cp2", position: new Vector3(0, 5, 0), team: null, captureProgress: 0 },
            { id: "cp3", position: new Vector3(0, 5, 30), team: null, captureProgress: 0 }
        ];
    }
}

// Escort Mode - охрана конвоя
export class EscortMode implements GameModeRules {
    private escortTarget: { position: Vector3; health: number; maxHealth: number; progress: number } | null = null;
    private escortStart: Vector3 = new Vector3(-100, 5, 0);
    private escortEnd: Vector3 = new Vector3(100, 5, 0);
    
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        const team = player.team || 0;
        
        if (team === 0) {
            // Attacking team spawns near escort start
            const spawnIndex = room.getAllPlayers().filter(p => (p.team || 0) === 0).indexOf(player);
            return new Vector3(this.escortStart.x - 20 - spawnIndex * 10, 5, this.escortStart.z + (spawnIndex % 2 === 0 ? -10 : 10));
        } else {
            // Defending team spawns along the route
            const spawnIndex = room.getAllPlayers().filter(p => (p.team || 0) === 1).indexOf(player);
            const routeProgress = 0.3 + (spawnIndex * 0.2);
            const spawnPos = Vector3.Lerp(this.escortStart, this.escortEnd, routeProgress);
            return new Vector3(spawnPos.x, 5, spawnPos.z + (spawnIndex % 2 === 0 ? -15 : 15));
        }
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        if (!this.escortTarget) {
            this.escortTarget = {
                position: this.escortStart.clone(),
                health: 1000,
                maxHealth: 1000,
                progress: 0
            };
        }
        
        // Attacking team (team 0) wins if escort reaches destination
        const distanceToEnd = Vector3.Distance(this.escortTarget.position, this.escortEnd);
        if (distanceToEnd < 10) {
            return { winner: "team0", reason: "Escort target reached destination" };
        }
        
        // Defending team (team 1) wins if escort is destroyed
        if (this.escortTarget.health <= 0) {
            return { winner: "team1", reason: "Escort target destroyed" };
        }
        
        return null;
    }
    
    getMaxScore(): number {
        return 100; // Progress percentage
    }
    
    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
}

// Survival Mode - волны врагов (PvE кооператив)
export class SurvivalMode implements GameModeRules {
    private currentWave: number = 1;
    private enemiesKilled: number = 0;
    private enemiesPerWave: number = 10;
    private waveStartTime: number = 0;
    
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // All players spawn together in safe zone
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 15;
        
        return new Vector3(
            Math.cos(angle) * radius,
            1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Survival: Players win if they survive X waves
        // Players lose if all are dead
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        
        if (alivePlayers.length === 0) {
            return { winner: null, reason: "All players eliminated" };
        }
        
        // Win condition: Survive 10 waves
        if (this.currentWave > 10) {
            return { winner: "players", reason: `Survived ${this.currentWave - 1} waves` };
        }
        
        return null;
    }
    
    getMaxScore(): number {
        return 10; // Waves to survive
    }
    
    getRespawnDelay(): number {
        return 10000; // 10 seconds
    }
}

// Raid Mode - PvE с боссами
export class RaidMode implements GameModeRules {
    private currentBoss: { id: string; health: number; maxHealth: number } | null = null;
    private bossesDefeated: number = 0;
    private totalBosses: number = 3;
    
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // All players spawn together
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 15;
        
        return new Vector3(
            Math.cos(angle) * radius,
            1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            Math.sin(angle) * radius
        );
    }
    
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Raid: Players win if they defeat all bosses
        // Players lose if all are dead
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        
        if (alivePlayers.length === 0) {
            return { winner: null, reason: "All players eliminated" };
        }
        
        if (this.bossesDefeated >= this.totalBosses) {
            return { winner: "players", reason: `Defeated all ${this.totalBosses} bosses` };
        }
        
        return null;
    }
    
    getMaxScore(): number {
        return this.totalBosses; // Bosses to defeat
    }
    
    getRespawnDelay(): number {
        return 15000; // 15 seconds (longer in raids)
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
        case "control_point":
            return new ControlPointMode();
        case "escort":
            return new EscortMode();
        case "survival":
            return new SurvivalMode();
        case "raid":
            return new RaidMode();
        default:
            return new FFAMode();
    }
}

