import { Vector3 } from "@babylonjs/core";
import type { GameMode } from "../shared/types";
import { ServerPlayer } from "./player";
import { GameRoom } from "./room";

export interface GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3;
    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null;
    getMaxScore(): number;
    getRespawnDelay(): number;
    update?(deltaTime: number, room: GameRoom): void;
}

export class FFAMode implements GameModeRules {
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        this.room = room;
        // Spawn in a circle around center
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const totalPlayers = room.getAllPlayers().length;
        const angle = (spawnIndex / totalPlayers) * Math.PI * 2;
        const radius = 30;

        return new Vector3(
            Math.cos(angle) * radius,
            5.0, // Безопасная высота (будет пересчитана на клиенте)
            Math.sin(angle) * radius
        );
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        this.room = room;
        // FFA: First to X kills wins (scaled by player count)
        const playerCount = room.getAllPlayers().length;
        let defaultKillLimit = 20;
        if (playerCount <= 4) defaultKillLimit = 15;
        else if (playerCount <= 8) defaultKillLimit = 20;
        else if (playerCount <= 16) defaultKillLimit = 30;
        else defaultKillLimit = 50;
        
        const maxKills = (room.settings?.ffaSettings?.killLimit) ?? (room.settings?.killLimit) ?? defaultKillLimit;
        for (const player of room.getAllPlayers()) {
            if (player.kills >= maxKills) {
                return { winner: player.id, reason: `Reached ${maxKills} kills` };
            }
        }
        return null;
    }

    getMaxScore(): number {
        // Scale by player count if room is available
        if (this.room) {
            const playerCount = this.room.getAllPlayers().length;
            let defaultKillLimit = 20;
            if (playerCount <= 4) defaultKillLimit = 15;
            else if (playerCount <= 8) defaultKillLimit = 20;
            else if (playerCount <= 16) defaultKillLimit = 30;
            else defaultKillLimit = 50;
            
            return (this.room?.settings?.ffaSettings?.killLimit) ?? (this.room?.settings?.killLimit) ?? defaultKillLimit;
        }
        return (this.room?.settings?.ffaSettings?.killLimit) ?? (this.room?.settings?.killLimit) ?? 20; // First to X kills
    }

    getRespawnDelay(): number {
        return 3000; // 3 seconds
    }
}

export class TDMMode implements GameModeRules {
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        this.room = room;
        // Spawn on team side
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const team = player.team || 0;
        const teamPlayers = room.getAllPlayers().filter(p => (p.team || 0) === team);
        const spawnIndex = teamPlayers.indexOf(player);

        // Spawn on opposite sides
        const baseX = team === 0 ? -40 : 40;
        const baseZ = (spawnIndex - teamPlayers.length / 2) * 15;

        return new Vector3(baseX, 5, baseZ); // Безопасная высота (будет пересчитана на клиенте)
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        this.room = room;
        // TDM: Team with most kills wins (scaled by player count)
        const team0Kills = room.getAllPlayers()
            .filter(p => (p.team || 0) === 0)
            .reduce((sum, p) => sum + p.kills, 0);
        const team1Kills = room.getAllPlayers()
            .filter(p => (p.team || 0) === 1)
            .reduce((sum, p) => sum + p.kills, 0);

        const playerCount = room.getAllPlayers().length;
        let defaultKillLimit = 50;
        if (playerCount <= 4) defaultKillLimit = 30;
        else if (playerCount <= 8) defaultKillLimit = 50;
        else if (playerCount <= 16) defaultKillLimit = 100;
        else defaultKillLimit = 150;
        
        const maxKills = (room.settings?.tdmSettings?.killLimit) ?? (room.settings?.killLimit) ?? defaultKillLimit;
        if (team0Kills >= maxKills) {
            return { winner: "team0", reason: `Team 0 reached ${maxKills} kills` };
        }
        if (team1Kills >= maxKills) {
            return { winner: "team1", reason: `Team 1 reached ${maxKills} kills` };
        }
        return null;
    }

    getMaxScore(): number {
        // Scale by player count if room is available
        if (this.room) {
            const playerCount = this.room.getAllPlayers().length;
            let defaultKillLimit = 50;
            if (playerCount <= 4) defaultKillLimit = 30;
            else if (playerCount <= 8) defaultKillLimit = 50;
            else if (playerCount <= 16) defaultKillLimit = 100;
            else defaultKillLimit = 150;
            
            return (this.room?.settings?.tdmSettings?.killLimit) ?? (this.room?.settings?.killLimit) ?? defaultKillLimit;
        }
        return (this.room?.settings?.tdmSettings?.killLimit) ?? (this.room?.settings?.killLimit) ?? 50; // Team total kills
    }

    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
}

export class CoopPVEMode implements GameModeRules {
    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // Spawn together in safe zone
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 15;

        return new Vector3(
            Math.cos(angle) * radius,
            5.0, // Безопасная высота (будет пересчитана на клиенте)
            Math.sin(angle) * radius
        );
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Co-op: Win if all enemies are defeated
        if (!room.enemies || room.enemies.size === 0) {
            // Ensure match started and enemies were actually spawned
            if (room.gameTime > 5000) { // Should have spawned by now
                return { winner: "players", reason: "All enemies defeated" };
            }
        }

        // Lose if all players dead
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        if (alivePlayers.length === 0) {
            return { winner: null, reason: "All players eliminated" };
        }

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
    private room: GameRoom | null = null;

    getSpawnPosition(_player: ServerPlayer, _room: GameRoom): Vector3 {
        // Random spawn in safe zone (but not too close to center)
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (1.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const angle = Math.random() * Math.PI * 2;
        const minRadius = this.safeZoneRadius * 0.3; // Spawn in outer 70% of zone
        const maxRadius = this.safeZoneRadius * 0.9;
        const radius = minRadius + Math.random() * (maxRadius - minRadius);

        return new Vector3(
            this.safeZoneCenter.x + Math.cos(angle) * radius,
            1.0, // Безопасная высота (будет пересчитана на клиенте)
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
        this.room = room;
        // Shrink safe zone over time
        const totalShrinkTime = (room.settings?.brSettings?.zoneShrinkTime) ?? 360; // Default 6 minutes (360 seconds)
        const minRadius = 30; // Minimum safe zone radius

        // Calculate current radius based on game time
        const shrinkProgress = Math.min(1, gameTime / totalShrinkTime);
        this.safeZoneRadius = 200 - (200 - minRadius) * shrinkProgress;

        // Progressive damage scaling based on game phase
        // Phase 1 (0-25%): 2 HP/sec
        // Phase 2 (25-50%): 5 HP/sec
        // Phase 3 (50-75%): 8 HP/sec
        // Phase 4 (75-100%): 15 HP/sec
        let baseDamage = (room.settings?.brSettings?.zoneDamage) ?? 5;
        if (shrinkProgress < 0.25) {
            this.damagePerSecond = 2; // Early game - low damage
        } else if (shrinkProgress < 0.5) {
            this.damagePerSecond = 5; // Mid game - moderate damage
        } else if (shrinkProgress < 0.75) {
            this.damagePerSecond = 8; // Late game - high damage
        } else {
            this.damagePerSecond = 15; // Final phase - very high damage
        }

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
        const totalShrinkTime = (this.room?.settings?.brSettings?.zoneShrinkTime) ?? 360; // Default 6 minutes
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
        this.room = room;
        // Set initial safe zone
        this.safeZoneRadius = 200;
        this.safeZoneCenter = new Vector3(0, 0, 0);

        // Start with low damage (will scale progressively)
        this.damagePerSecond = 2; // Early game damage

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
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        this.room = room;
        // Spawn at team base
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (1.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const team = player.team || 0;
        const baseX = team === 0 ? -50 : 50;

        return new Vector3(baseX, 1.0, 0); // Безопасная высота (будет пересчитана на клиенте)
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        this.room = room;
        // CTF: First team to capture X flags
        // This will be handled by flag system
        return null;
    }

    getMaxScore(): number {
        // Используем настройки комнаты, если доступны (scaled by player count)
        if (this.room) {
            const playerCount = this.room.getAllPlayers().length;
            let defaultFlags = 3;
            if (playerCount <= 8) defaultFlags = 3;
            else if (playerCount <= 16) defaultFlags = 5;
            else defaultFlags = 7;
            
            return (this.room?.settings?.ctfSettings?.flagsToWin) ?? defaultFlags;
        }
        return (this.room?.settings?.ctfSettings?.flagsToWin) ?? 3; // Flags to capture
    }

    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }
}

// Control Point Mode - захват контрольных точек
export class ControlPointMode implements GameModeRules {
    private controlPoints: Array<{ id: string; position: Vector3; team: number | null; captureProgress: number }> = [];
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (1.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const team = player.team || 0;
        const teamPlayers = room.getAllPlayers().filter(p => (p.team || 0) === team);
        const spawnIndex = teamPlayers.indexOf(player);

        // Spawn near team base
        const baseX = team === 0 ? -50 : 50;
        const baseZ = (spawnIndex - teamPlayers.length / 2) * 15;

        return new Vector3(baseX, 1.0, baseZ); // Безопасная высота (будет пересчитана на клиенте)
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        // Control Point: Team with all points or most points for X seconds
        // Simplified: First team to control 2 out of 3 points wins
        if (this.controlPoints.length === 0) {
            this.initializeControlPoints(room);
        }

        // Win Condition: First to X points
        const MAX_SCORE = (room.settings?.cpSettings?.maxScore) ?? 1000;

        if (this.team0Score >= MAX_SCORE) {
            return { winner: "team0", reason: `Team 0 reached ${MAX_SCORE} points` };
        }
        if (this.team1Score >= MAX_SCORE) {
            return { winner: "team1", reason: `Team 1 reached ${MAX_SCORE} points` };
        }

        return null;
    }

    // Score counters
    private team0Score: number = 0;
    private team1Score: number = 0;
    private lastScoreTick: number = 0;

    // Track contested status per point
    private contestedPoints: Map<string, boolean> = new Map();

    update(deltaTime: number, room: GameRoom): void {
        this.room = room;
        if (this.controlPoints.length === 0) {
            this.initializeControlPoints(room);
        }

        const captureRadius = 15;
        const captureSpeed = (room.settings?.cpSettings?.captureSpeed) ?? 25; // % per second (faster capture)
        const dtSeconds = deltaTime / 1000;
        const now = Date.now();

        // 1. Update Capture Progress
        for (const point of this.controlPoints) {
            let team0Count = 0;
            let team1Count = 0;

            for (const player of room.getAllPlayers()) {
                if (player.status !== "alive") continue;
                if (Vector3.Distance(player.position, point.position) <= captureRadius) {
                    if (player.team === 0) team0Count++;
                    if (player.team === 1) team1Count++;
                }
            }

            // Determine state
            const isContested = team0Count > 0 && team1Count > 0;
            this.contestedPoints.set(point.id, isContested);
            let capturingTeam: number | null = null;

            if (!isContested) {
                if (team0Count > team1Count) capturingTeam = 0;
                else if (team1Count > team0Count) capturingTeam = 1;
            }

            // Capture Logic
            if (capturingTeam !== null) {
                // If point belongs to enemy, neutralize it first
                if (point.team !== null && point.team !== capturingTeam) {
                    point.captureProgress -= captureSpeed * dtSeconds;
                    if (point.captureProgress <= 0) {
                        point.team = null; // Neutralized
                        point.captureProgress = 0;
                    }
                }
                // If neutral or own, capture/reinforce
                else {
                    point.captureProgress += captureSpeed * dtSeconds;
                    if (point.captureProgress >= 100) {
                        point.captureProgress = 100;
                        point.team = capturingTeam;
                    }
                }
            } else if (!isContested && point.team === null && point.captureProgress > 0) {
                // Decay if neutral and abandoned
                point.captureProgress = Math.max(0, point.captureProgress - (captureSpeed * 0.3) * dtSeconds);
            }
        }

        // 2. Score Ticking (Every 1 second)
        if (now - this.lastScoreTick >= 1000) {
            let team0Owned = 0;
            let team1Owned = 0;

            for (const point of this.controlPoints) {
                if (point.team === 0 && point.captureProgress >= 100) team0Owned++;
                if (point.team === 1 && point.captureProgress >= 100) team1Owned++;
            }

            // Points per second = number of owned zones
            // Bonus for holding ALL zones (+2 extra)
            const bonus0 = team0Owned === this.controlPoints.length ? 2 : 0;
            const bonus1 = team1Owned === this.controlPoints.length ? 2 : 0;

            this.team0Score += team0Owned + bonus0;
            this.team1Score += team1Owned + bonus1;

            this.lastScoreTick = now;

            // Optional: Log score periodically
            if (this.team0Score % 50 === 0 || this.team1Score % 50 === 0) {
                // room.broadcastMessage(...) // Implementation of broadcast would be good here
            }
        }
    }

    getMaxScore(): number {
        return (this.room?.settings?.cpSettings?.pointsCount) ?? 3; // Control points count
    }

    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }

    private initializeControlPoints(room: GameRoom): void {
        this.room = room;
        // Create control points in neutral positions (based on settings)
        const pointsCount = (room.settings?.cpSettings?.pointsCount) ?? 3;
        this.controlPoints = [];
        
        for (let i = 0; i < pointsCount; i++) {
            const angle = (i / pointsCount) * Math.PI * 2;
            const radius = 30 + (i % 2) * 10; // Vary positions slightly
            this.controlPoints.push({
                id: `cp${i + 1}`,
                position: new Vector3(Math.cos(angle) * radius, 5, Math.sin(angle) * radius),
                team: null,
                captureProgress: 0
            });
        }
    }

    getControlPointsData(): Array<{ id: string; position: { x: number; y: number; z: number }; team: number | null; captureProgress: number; isContested: boolean }> {
        if (this.controlPoints.length === 0) return [];
        
        return this.controlPoints.map(point => ({
            id: point.id,
            position: { x: point.position.x, y: point.position.y, z: point.position.z },
            team: point.team,
            captureProgress: point.captureProgress,
            isContested: this.contestedPoints.get(point.id) || false
        }));
    }

    getTeamScores(): { team0Score: number; team1Score: number; maxScore: number } {
        const maxScore = (this.room?.settings?.cpSettings?.maxScore) ?? 1000;
        return {
            team0Score: this.team0Score,
            team1Score: this.team1Score,
            maxScore
        };
    }
}

// Escort Mode - охрана конвоя
export class EscortMode implements GameModeRules {
    private escortTarget: { position: Vector3; health: number; maxHealth: number; progress: number } | null = null;
    private escortStart: Vector3 = new Vector3(-100, 5, 0);
    private escortEnd: Vector3 = new Vector3(100, 5, 0);
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const team = player.team || 0;

        if (team === 0) {
            // Attacking team spawns near escort start
            const spawnIndex = room.getAllPlayers().filter(p => (p.team || 0) === 0).indexOf(player);
            return new Vector3(this.escortStart.x - 20 - spawnIndex * 10, 5, this.escortStart.z + (spawnIndex % 2 === 0 ? -10 : 10)); // Безопасная высота (будет пересчитана на клиенте)
        } else {
            // Defending team spawns along the route
            const spawnIndex = room.getAllPlayers().filter(p => (p.team || 0) === 1).indexOf(player);
            const routeProgress = 0.3 + (spawnIndex * 0.2);
            const spawnPos = Vector3.Lerp(this.escortStart, this.escortEnd, routeProgress);
            return new Vector3(spawnPos.x, 5, spawnPos.z + (spawnIndex % 2 === 0 ? -15 : 15));
        }
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        if (!this.escortTarget) this.initializeEscort();

        // 1. Attackers Win (Destination Reached)
        if (this.escortTarget!.progress >= 1.0) {
            return { winner: "team0", reason: "Payload delivered!" };
        }

        // 2. Defenders Win (Time Limit & Not Overtime)
        // Time is handled mostly by room, but if we track "payload health" as limit:
        if (this.escortTarget!.health <= 0) {
            return { winner: "team1", reason: "Payload destroyed!" };
        }

        return null; // Continue playing
    }

    private initializeEscort() {
        const maxHealth = (this.room?.settings?.escortSettings?.payloadHealth) ?? 3000; // Balanced default
        this.escortTarget = {
            position: this.escortStart.clone(),
            health: maxHealth,
            maxHealth: maxHealth,
            progress: 0
        };
    }

    update(deltaTime: number, room: GameRoom): void {
        this.room = room;
        if (!this.escortTarget) this.initializeEscort();
        const target = this.escortTarget!;

        const pushRadius = 15;
        const maxSpeed = (room.settings?.escortSettings?.payloadSpeed) ?? 4; // Balanced default
        const dtSeconds = deltaTime / 1000;

        let attackers = 0;
        let defenders = 0;

        for (const player of room.getAllPlayers()) {
            if (player.status !== "alive") continue;
            const dist = Vector3.Distance(player.position, target.position);
            if (dist < pushRadius) {
                if (player.team === 0) attackers++;
                else if (player.team === 1) defenders++;
            }
        }

        // --- Payload Mechanics ---

        // 1. Movement
        if (attackers > 0 && defenders === 0) {
            // Push forward logic
            const speedMult = Math.min(1.5, 1.0 + (attackers - 1) * 0.2); // +20% per extra player
            const moveStep = (maxSpeed * speedMult * dtSeconds) / Vector3.Distance(this.escortStart, this.escortEnd);
            target.progress = Math.min(1.0, target.progress + moveStep);

            // Payload HEALS attackers nearby (10 HP/sec)
            if (room.gameTime % 1000 < dtSeconds * 1000) { // Approx once per second
                for (const player of room.getAllPlayers()) {
                    if (player.team === 0 && player.status === "alive" && Vector3.Distance(player.position, target.position) < pushRadius) {
                        player.health = Math.min(player.maxHealth, player.health + 10);
                        // No easy way to sync HP update purely from here without room broadcasting full state, 
                        // but player.health is authoritative on server. Update will naturally sync on next tick.
                    }
                }
            }

        } else if (defenders > 0 && attackers === 0) {
            // Push back (slowly rewinds progress if abandoned)
            const rewindSpeed = (maxSpeed * 0.3 * dtSeconds) / Vector3.Distance(this.escortStart, this.escortEnd);
            target.progress = Math.max(0, target.progress - rewindSpeed);
        }

        // 2. Update Position
        Vector3.LerpToRef(this.escortStart, this.escortEnd, target.progress, target.position);
    }


    getMaxScore(): number {
        return 100; // Progress percentage
    }

    getRespawnDelay(): number {
        return 5000; // 5 seconds
    }

    getEscortPayloadData(): { position: { x: number; y: number; z: number }; health: number; maxHealth: number; progress: number; route: Array<{ x: number; y: number; z: number }>; team: number } | null {
        if (!this.escortTarget) return null;
        
        return {
            position: { x: this.escortTarget.position.x, y: this.escortTarget.position.y, z: this.escortTarget.position.z },
            health: this.escortTarget.health,
            maxHealth: this.escortTarget.maxHealth,
            progress: this.escortTarget.progress * 100, // Convert to percentage
            route: [
                { x: this.escortStart.x, y: this.escortStart.y, z: this.escortStart.z },
                { x: this.escortEnd.x, y: this.escortEnd.y, z: this.escortEnd.z }
            ],
            team: 0 // Attacking team
        };
    }
}

// Survival Mode - волны врагов (PvE кооператив)
export class SurvivalMode implements GameModeRules {
    private currentWave: number = 1;
    private enemiesPerWave: number = 5;
    private waveState: "FIGHTING" | "RESTING" = "RESTING";
    private restTimer: number = 10000; // 10 sec prep time
    private waveStartTime: number = 0;
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // All players spawn together in safe zone
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 10;

        return new Vector3(
            Math.cos(angle) * radius,
            5.0, // Безопасная высота (будет пересчитана на клиенте)
            Math.sin(angle) * radius
        );
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        this.room = room;
        const alivePlayers = room.getAllPlayers().filter(p => p.status === "alive");
        if (alivePlayers.length === 0) return { winner: null, reason: "Team eliminated" };
        const maxWaves = (room.settings?.survivalSettings?.maxWaves) ?? 20;
        if (this.currentWave > maxWaves) return { winner: "players", reason: `Survived ${maxWaves} waves!` };
        return null;
    }

    getMaxScore(): number {
        return (this.room?.settings?.survivalSettings?.maxWaves) ?? 20;
    }
    getRespawnDelay(): number { return 999999; } // One life per wave? Or just long delay?

    update(deltaTime: number, room: GameRoom): void {
        const activeEnemies = room.enemies.size;

        if (this.waveState === "FIGHTING") {
            // Wave Clear Condition
            if (activeEnemies === 0) {
                this.waveState = "RESTING";
                // Progressive rest time: longer for early waves, shorter for later waves
                const baseRestTime = (room.settings?.survivalSettings?.restTime) ?? 10000; // Default 10s
                const restTimeMultiplier = this.currentWave <= 5 ? 1.5 : this.currentWave <= 10 ? 1.0 : 0.8;
                this.restTimer = baseRestTime * restTimeMultiplier;

                // REWARD: Heal all players
                room.getAllPlayers().forEach(p => {
                    if (p.status === "alive") p.health = p.maxHealth;
                    else p.respawn(this.getSpawnPosition(p, room)); // Revive dead players between waves
                });
            }
        } else if (this.waveState === "RESTING") {
            this.restTimer -= deltaTime;
            if (this.restTimer <= 0) {
                // START NEXT WAVE
                this.waveState = "FIGHTING";
                this.currentWave++;

                // Scaling: +2 enemies per wave, +10% HP every round
                // Scale initial enemies by player count
                const playerCount = room.getAllPlayers().length;
                const baseEnemies = playerCount <= 1 ? 5 : playerCount <= 2 ? 7 : 10;
                this.enemiesPerWave = baseEnemies + ((this.currentWave - 1) * 2);

                // Elite Wave every 5th round
                const isElite = this.currentWave % 5 === 0;
                if (isElite) this.enemiesPerWave = Math.floor(this.enemiesPerWave / 2); // Fewer but stronger

                this.spawnWave(room, isElite);
            }
        }
    }

    private spawnWave(room: GameRoom, isElite: boolean) {
        room.botCount = this.enemiesPerWave; // Sync prop

        const spawnRadius = 40 + Math.random() * 20; // varied distance

        // We utilize the room's internal spawner by hacking it via botCount
        // But to set "Elite" status we need access to the enemy objects AFTER spawn
        // Since room.spawnEnemies() clears old enemies and spawns new ones
        // We can just call it (as it uses botCount)
        // Spawn using public method
        room.spawnEnemies();


        // Apply Stats Multipliers (balanced scaling)
        // HP: +10% per wave (was +10%, keeping it)
        // For elite waves: +200% HP (was +300%, reducing to +200%)
        const hpMult = 1.0 + ((this.currentWave - 1) * 0.1); // Start at wave 1 with no multiplier
        const dmgMult = 1.0 + ((this.currentWave - 1) * 0.05);

        for (const enemy of room.enemies.values()) {
            enemy.maxHealth *= hpMult;
            enemy.health = enemy.maxHealth;
            // enemy.damage *= dmgMult; // If enemy has damage prop exposed

            if (isElite) {
                enemy.maxHealth *= 2.0; // Reduced from 3.0 to 2.0 for better balance
                enemy.health = enemy.maxHealth;
                // Visual indicator? Scale?
                // enemy.scale *= 1.5; // If visual scale supported
            }
        }
    }

    getSurvivalWaveData(): { currentWave: number; enemiesRemaining: number; enemiesTotal: number; timeUntilNextWave: number; waveState: "FIGHTING" | "RESTING"; isEliteWave: boolean } {
        const isEliteWave = this.currentWave % 5 === 0;
        return {
            currentWave: this.currentWave,
            enemiesRemaining: 0, // Will be set by room
            enemiesTotal: this.enemiesPerWave,
            timeUntilNextWave: Math.max(0, this.restTimer),
            waveState: this.waveState,
            isEliteWave
        };
    }
}


// Raid Mode - PvE с боссами
export class RaidMode implements GameModeRules {
    private currentBoss: { id: string; health: number; maxHealth: number } | null = null;
    private bossesDefeated: number = 0;
    private totalBosses: number = 3;
    private room: GameRoom | null = null;

    getSpawnPosition(player: ServerPlayer, room: GameRoom): Vector3 {
        // All players spawn together
        // ПРИМЕЧАНИЕ: На сервере нет информации о геометрии карты, поэтому используется безопасная высота (5.0м)
        // На клиенте высота будет пересчитана через findSafeSpawnPositionAt() для нахождения верхней поверхности
        const spawnIndex = Array.from(room.getAllPlayers()).indexOf(player);
        const angle = (spawnIndex / room.getAllPlayers().length) * Math.PI * 2;
        const radius = 15;

        return new Vector3(
            Math.cos(angle) * radius,
            5.0, // Безопасная высота (будет пересчитана на клиенте)
            Math.sin(angle) * radius
        );
    }

    checkWinCondition(room: GameRoom): { winner: string | null; reason: string } | null {
        this.room = room;
        const totalBosses = (room.settings?.raidSettings?.bossCount) ?? 3;
        this.totalBosses = totalBosses; // Update total bosses from settings
        
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

    update(deltaTime: number, room: GameRoom): void {
        this.room = room;
        const totalBosses = (room.settings?.raidSettings?.bossCount) ?? 3;
        this.totalBosses = totalBosses; // Update total bosses from settings
        
        const bosses = Array.from(room.enemies.values());

        // 1. Check Win/Phase State
        if (bosses.length === 0 && this.bossesDefeated < this.totalBosses) {
            // Spawn next boss
            this.spawnBoss(room, this.bossesDefeated + 1);
            this.bossesDefeated++;
        }

        // 2. Boss Logic (Phases)
        // Find the boss (highest max health enemy)
        let mainBoss: any = null;
        let maxHP = 0;

        for (const enemy of room.enemies.values()) {
            if (enemy.maxHealth > maxHP) {
                maxHP = enemy.maxHealth;
                mainBoss = enemy;
            }
        }

        if (mainBoss) {
            // Check Phase based on HP %
            const hpPercent = mainBoss.health / mainBoss.maxHealth;

            // Phase 2: Enrage / Minions at 50% HP
            // We use a custom flag on the object if possible, or just a state map in this class?
            // Since ServerEnemy class isn't easily extensible here without editing it, we'll use a local Set
            if (hpPercent < 0.5 && !this.enragedBosses.has(mainBoss.id)) {
                this.enragedBosses.add(mainBoss.id);

                // Spawn Minions (balanced count)
                const minionCount = Math.min(5, 2 + this.bossesDefeated); // 2-5 minions
                room.botCount = minionCount;
                room.spawnEnemies(); // This ADDS enemies, doesn't clear if we don't clear map
                // Wait, room.spawnEnemies usually adds to the map.
                // But check room.ts: `this.enemies.set(enemy.id, enemy);` - it adds.
                // So calling it will add minions. Perfect.
            }
        }
    }

    private enragedBosses: Set<string> = new Set();

    getRaidBossData(): { boss: { id: string; health: number; maxHealth: number; position: { x: number; y: number; z: number } } | null; bossesDefeated: number; totalBosses: number; minions: number } {
        // Update totalBosses from settings if available
        if (this.room?.settings?.raidSettings?.bossCount !== undefined) {
            this.totalBosses = this.room.settings.raidSettings.bossCount;
        }
        // Find current boss (highest max health enemy)
        let mainBoss: any = null;
        let maxHP = 0;
        
        // This will be called from room, so we need room reference
        // For now, return basic structure - room will fill in boss data
        
        return {
            boss: this.currentBoss ? {
                id: this.currentBoss.id,
                health: this.currentBoss.health,
                maxHealth: this.currentBoss.maxHealth,
                position: { x: 0, y: 5, z: 0 } // Will be updated from room
            } : null,
            bossesDefeated: this.bossesDefeated,
            totalBosses: this.totalBosses,
            minions: 0 // Will be calculated from room.enemies
        };
    }

    private spawnBoss(room: GameRoom, level: number) {
        // Cleanup existing (remove old minions/corpses)
        room.enemies.clear();
        this.enragedBosses.clear(); // Reset for new boss
        
        // Scale boss HP by player count for better balance
        const playerCount = room.getAllPlayers().length;
        const playerMultiplier = Math.max(1.0, 1.0 + (playerCount - 1) * 0.3); // +30% per extra player
        
        // Base HP calculation: 5000 * 2^(level-1) * playerMultiplier
        const baseHP = 5000 * Math.pow(2, level - 1);
        const scaledHP = baseHP * playerMultiplier;
        
        // Update current boss
        this.currentBoss = {
            id: `boss_${level}`,
            health: scaledHP,
            maxHealth: scaledHP
        };

        // Spawn ONE big enemy
        room.botCount = 1;
        room.spawnEnemies();

        // Buff the boss
        const boss = room.enemies.values().next().value;
        if (boss) {
            boss.maxHealth = scaledHP;
            boss.health = boss.maxHealth;
            boss.difficulty = "hard";
        }
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

