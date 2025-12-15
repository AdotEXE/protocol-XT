import { nanoid } from "nanoid";
import { Vector3 } from "@babylonjs/core";
import type { GameMode, PlayerData, PlayerInput, EnemyData } from "../shared/types";
import { ServerPlayer } from "./player";
import type { ProjectileData, ConsumableData, WorldUpdate } from "../shared/types";
import { ServerProjectile } from "./projectile";
import { ServerEnemy } from "./enemy";
import { getGameModeRules, type GameModeRules, BattleRoyaleMode, CTFMode } from "./gameModes";
import { CTFSystem } from "./ctf";
import { InputValidator } from "./validation";

export class GameRoom {
    id: string;
    mode: GameMode;
    maxPlayers: number;
    isPrivate: boolean;
    players: Map<string, ServerPlayer> = new Map();
    projectiles: Map<string, ServerProjectile> = new Map();
    consumables: Map<string, ConsumableData> = new Map();
    enemies: Map<string, ServerEnemy> = new Map();
    
    // Game state
    isActive: boolean = false;
    matchStartTime: number = 0;
    gameTime: number = 0;
    
    // World state
    worldUpdates: WorldUpdate = {
        destroyedObjects: [],
        chunkUpdates: []
    };
    
    // Track destroyed objects for synchronization
    private destroyedObjectIds: Set<string> = new Set();
    
    // Game mode rules
    private gameModeRules: GameModeRules;
    
    // Consumables tracking (for deterministic spawn, server validates pickup)
    private pickedUpConsumables: Set<string> = new Set(); // consumableId
    
    // CTF system
    ctfSystem: CTFSystem | null = null;
    
    // Settings
    settings: any = {};
    
    // World seed for deterministic generation
    worldSeed: number;
    
    constructor(mode: GameMode, maxPlayers: number = 32, isPrivate: boolean = false, worldSeed?: number) {
        this.id = nanoid();
        this.mode = mode;
        this.maxPlayers = maxPlayers;
        this.isPrivate = isPrivate;
        // Generate seed if not provided
        this.worldSeed = worldSeed || Math.floor(Math.random() * 999999999);
        // Get game mode rules
        this.gameModeRules = getGameModeRules(mode);
    }
    
    addPlayer(player: ServerPlayer): boolean {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }
        
        if (this.players.has(player.id)) {
            return false;
        }
        
        this.players.set(player.id, player);
        player.roomId = this.id;
        
        // Assign team for team-based modes
        if (this.mode === "tdm" || this.mode === "ctf") {
            const teamSize = Math.floor(this.players.size / 2);
            player.team = this.players.size % 2 === 0 ? 1 : 0;
        }
        
        return true;
    }
    
    removePlayer(playerId: string): boolean {
        const player = this.players.get(playerId);
        if (!player) return false;
        
        player.roomId = null;
        this.players.delete(playerId);
        
        // Clean up player's projectiles
        for (const [projId, projectile] of this.projectiles.entries()) {
            if (projectile.ownerId === playerId) {
                this.projectiles.delete(projId);
            }
        }
        
        return true;
    }
    
    getPlayer(playerId: string): ServerPlayer | undefined {
        return this.players.get(playerId);
    }
    
    getAllPlayers(): ServerPlayer[] {
        return Array.from(this.players.values());
    }
    
    getPlayerData(): PlayerData[] {
        return this.getAllPlayers().map(p => p.toPlayerData());
    }
    
    startMatch(): void {
        if (this.isActive) return;
        
        this.isActive = true;
        this.matchStartTime = Date.now();
        this.gameTime = 0;
        
        // Initialize Battle Royale mode
        if (this.mode === "battle_royale") {
            const brMode = this.gameModeRules as any;
            if (brMode && typeof brMode.initialize === "function") {
                brMode.initialize(this);
            }
        }
        
        // Initialize CTF system
        if (this.mode === "ctf") {
            this.ctfSystem = new CTFSystem(this);
            const ctfMode = this.gameModeRules as any;
            if (ctfMode && typeof ctfMode.setCTFSystem === "function") {
                ctfMode.setCTFSystem(this.ctfSystem);
            }
        }
        
        // Reset all players
        this.getAllPlayers().forEach(player => {
            const spawnPos = this.getSpawnPosition(player);
            player.respawn(spawnPos, 100);
        });
        
        // Spawn enemies for Co-op mode
        if (this.mode === "coop") {
            this.spawnEnemies();
        }
    }
    
    getSafeZoneData(): any {
        if (this.mode === "battle_royale") {
            const brMode = this.gameModeRules as any;
            if (brMode && typeof brMode.getSafeZoneData === "function") {
                return brMode.getSafeZoneData();
            }
        }
        return null;
    }
    
    getCTFFlags(): any[] {
        if (this.mode === "ctf" && this.ctfSystem) {
            return this.ctfSystem.getFlags();
        }
        return [];
    }
    
    private spawnEnemies(): void {
        const enemyCount = Math.min(8, this.players.size * 2);
        const spawnRadius = 50;
        
        for (let i = 0; i < enemyCount; i++) {
            const angle = (i / enemyCount) * Math.PI * 2;
            const radius = spawnRadius + Math.random() * 20;
            const position = new Vector3(
                Math.cos(angle) * radius,
                5,
                Math.sin(angle) * radius
            );
            
            const difficulty: "easy" | "medium" | "hard" = "medium";
            const enemy = new ServerEnemy(position, difficulty);
            this.enemies.set(enemy.id, enemy);
        }
        
        console.log(`[Room ${this.id}] Spawned ${enemyCount} enemies for Co-op mode`);
    }
    
    endMatch(): void {
        this.isActive = false;
        this.projectiles.clear();
        this.consumables.clear();
        this.enemies.clear();
        this.destroyedObjectIds.clear();
        this.worldUpdates = {
            destroyedObjects: [],
            chunkUpdates: []
        };
    }
    
    markObjectDestroyed(objectId: string): void {
        if (!this.destroyedObjectIds.has(objectId)) {
            this.destroyedObjectIds.add(objectId);
            this.worldUpdates.destroyedObjects.push(objectId);
        }
    }
    
    getDestroyedObjects(): string[] {
        return Array.from(this.destroyedObjectIds);
    }
    
    update(deltaTime: number): void {
        if (!this.isActive) return;
        
        this.gameTime += deltaTime;
        
        // Update player positions based on input
        for (const player of this.players.values()) {
            if (player.status !== "alive") continue;
            
            if (player.lastInput) {
                this.updatePlayerPosition(player, player.lastInput, deltaTime);
            }
        }
        
        // Update enemies (for Co-op mode)
        if (this.mode === "coop") {
            const playerData = this.getAllPlayers().map(p => ({
                id: p.id,
                position: p.position,
                status: p.status
            }));
            
            for (const enemy of this.enemies.values()) {
                enemy.update(deltaTime, playerData);
                
                // Check if enemy can shoot
                if (enemy.canShoot() && enemy.targetId) {
                    // Enemy shoots - create projectile
                    const target = this.players.get(enemy.targetId);
                    if (target && target.status === "alive") {
                        const direction = target.position.subtract(enemy.position).normalize();
                        const projId = nanoid();
                        const projPos = enemy.position.clone();
                        const projVel = direction.scale(100);
                        
                        const projectile = new ServerProjectile({
                            id: projId,
                            ownerId: enemy.id,
                            position: projPos,
                            velocity: projVel,
                            damage: 20,
                            cannonType: "standard",
                            spawnTime: Date.now()
                        });
                        
                        this.projectiles.set(projId, projectile);
                        enemy.shoot();
                    }
                }
                
                // Check player projectiles hitting enemies
                for (const [projId, projectile] of this.projectiles.entries()) {
                    if (projectile.ownerId === enemy.id) continue; // Enemy's own projectile
                    
                    if (projectile.checkHit(enemy.position)) {
                        const died = enemy.takeDamage(projectile.damage);
                        
                        // Award kill to owner
                        if (died) {
                            const owner = this.players.get(projectile.ownerId);
                            if (owner) {
                                owner.addKill();
                            }
                        }
                        
                        this.projectiles.delete(projId);
                        break;
                    }
                }
            }
            
            // Remove dead enemies
            for (const [enemyId, enemy] of this.enemies.entries()) {
                if (!enemy.isAlive) {
                    this.enemies.delete(enemyId);
                }
            }
        }
        
        // Update projectiles
        const currentTime = Date.now();
        for (const [projId, projectile] of this.projectiles.entries()) {
            projectile.update(deltaTime);
            
            // Check hits on players
            for (const player of this.players.values()) {
                if (player.id === projectile.ownerId) continue; // Can't hit self
                if (player.status !== "alive") continue;
                
                if (projectile.checkHit(player.position)) {
                    // Hit!
                    const died = player.takeDamage(projectile.damage);
                    
                    // Award kill to owner (if not enemy)
                    if (died && !this.enemies.has(projectile.ownerId)) {
                        const owner = this.players.get(projectile.ownerId);
                        if (owner) {
                            owner.addKill();
                        }
                    }
                    
                    // Store damage/kill event for broadcasting (will be sent by gameServer)
                    (this as any).lastDamageEvent = {
                        victimId: player.id,
                        victimName: player.name,
                        attackerId: projectile.ownerId,
                        attackerName: this.players.get(projectile.ownerId)?.name || "Unknown",
                        damage: projectile.damage,
                        newHealth: player.health,
                        died: died
                    };
                    
                    // Remove projectile
                    this.projectiles.delete(projId);
                    break;
                }
            }
            
            // Remove expired projectiles
            if (projectile.isExpired(currentTime)) {
                this.projectiles.delete(projId);
            }
        }
        
        // Update consumables
        // Update world state
        
        // Update Battle Royale safe zone
        if (this.mode === "battle_royale") {
            const brMode = this.gameModeRules as any;
            if (brMode && typeof brMode.updateSafeZone === "function") {
                brMode.updateSafeZone(this.gameTime, this);
            }
        }
        
        // Update CTF system
        if (this.mode === "ctf" && this.ctfSystem) {
            this.ctfSystem.update(deltaTime);
        }
        
        // Check win condition
        const winCondition = this.gameModeRules.checkWinCondition(this);
        if (winCondition && winCondition.winner) {
            // End match - will be handled by gameServer
            this.isActive = false;
        }
    }
    
    getWinCondition(): { winner: string | null; reason: string } | null {
        return this.gameModeRules.checkWinCondition(this);
    }
    
    getRespawnDelay(): number {
        return this.gameModeRules.getRespawnDelay();
    }
    
    private updatePlayerPosition(player: ServerPlayer, input: any, deltaTime: number): void {
        // Simple movement simulation
        const moveSpeed = 20; // Same as client
        const turnSpeed = 2.2; // Same as client
        
        const oldPosition = player.position.clone();
        
        // Update rotation
        if (input.steer !== 0) {
            player.rotation += input.steer * turnSpeed * deltaTime;
            // Normalize rotation
            while (player.rotation > Math.PI) player.rotation -= Math.PI * 2;
            while (player.rotation < -Math.PI) player.rotation += Math.PI * 2;
        }
        
        // Update position based on throttle and rotation
        if (input.throttle !== 0) {
            const moveDir = new Vector3(
                Math.sin(player.rotation) * input.throttle,
                0,
                Math.cos(player.rotation) * input.throttle
            );
            const moveDelta = moveDir.scale(moveSpeed * deltaTime);
            player.position = player.position.add(moveDelta);
            
            // Validate position after movement
            const posValidation = InputValidator.validatePosition(player.position);
            if (!posValidation.valid) {
                console.warn(`[Room] Invalid position for player ${player.id}, reverting: ${posValidation.reason}`);
                player.position = oldPosition; // Revert to old position
                player.violationCount++;
                player.lastViolationTime = Date.now();
            } else {
                // Update position history for anti-cheat
                player.positionHistory.push({
                    time: Date.now(),
                    position: player.position.clone()
                });
                
                // Keep only last 60 entries (1 second at 60 Hz)
                if (player.positionHistory.length > 60) {
                    player.positionHistory.shift();
                }
                
                // Check for suspicious movement
                const suspiciousCheck = InputValidator.checkSuspiciousMovement(player.positionHistory);
                if (suspiciousCheck.suspicious) {
                    player.suspiciousMovementCount++;
                    console.warn(`[Room] Suspicious movement from player ${player.id}: ${suspiciousCheck.reason} (count: ${player.suspiciousMovementCount})`);
                    
                    // Kick player after too many violations
                    if (player.suspiciousMovementCount >= 10 || player.violationCount >= 20) {
                        console.warn(`[Room] Kicking player ${player.id} for repeated violations`);
                        player.disconnect();
                        return;
                    }
                }
                
                // Update last valid position
                player.lastValidPosition = player.position.clone();
            }
        }
        
        // Update turret rotation
        player.turretRotation = input.turretRotation || player.turretRotation;
        player.aimPitch = input.aimPitch || player.aimPitch;
    }
    
    getSpawnPosition(player: ServerPlayer): Vector3 {
        return this.gameModeRules.getSpawnPosition(player, this);
    }
    
    isFull(): boolean {
        return this.players.size >= this.maxPlayers;
    }
    
    isEmpty(): boolean {
        return this.players.size === 0;
    }
}

