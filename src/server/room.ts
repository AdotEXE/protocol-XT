import { nanoid } from "nanoid";
import { Vector3 } from "@babylonjs/core";
import type { GameMode, PlayerData, ConsumableData, WorldUpdate } from "../shared/types";
import { ServerPlayer } from "./player";
import { ServerProjectile } from "./projectile";
import { ServerWall } from "./wall";
import { ServerEnemy } from "./enemy";
import { getGameModeRules, type GameModeRules } from "./gameModes";
import { CTFSystem } from "./ctf";
import { InputValidator } from "./validation";
import { logger, LogLevel, loggingSettings } from "../client/utils/logger";
import { serverLogger } from "./logger";

// Chassis dimensions lookup table (half-sizes for OBB check)
// Format: { halfWidth, halfDepth, halfHeight }
const CHASSIS_DIMENSIONS: Record<string, { halfWidth: number; halfDepth: number; halfHeight: number }> = {
    racer: { halfWidth: 0.75, halfDepth: 1.3, halfHeight: 0.275 },
    siege: { halfWidth: 1.5, halfDepth: 2.25, halfHeight: 0.55 },
    amphibious: { halfWidth: 1.05, halfDepth: 1.8, halfHeight: 0.4 },
    shield: { halfWidth: 1.15, halfDepth: 1.85, halfHeight: 0.45 },
    artillery: { halfWidth: 1.4, halfDepth: 2.1, halfHeight: 0.5 },
    light: { halfWidth: 0.9, halfDepth: 1.5, halfHeight: 0.35 },
    medium: { halfWidth: 1.1, halfDepth: 1.75, halfHeight: 0.4 },
    heavy: { halfWidth: 1.3, halfDepth: 2.0, halfHeight: 0.45 },
    assault: { halfWidth: 1.2, halfDepth: 1.9, halfHeight: 0.425 },
    scout: { halfWidth: 0.8, halfDepth: 1.4, halfHeight: 0.3 },
    stealth: { halfWidth: 0.95, halfDepth: 1.6, halfHeight: 0.325 },
    hover: { halfWidth: 1.0, halfDepth: 1.65, halfHeight: 0.375 },
    destroyer: { halfWidth: 1.25, halfDepth: 2.0, halfHeight: 0.475 },
    command: { halfWidth: 1.2, halfDepth: 1.95, halfHeight: 0.44 },
    drone: { halfWidth: 1.1, halfDepth: 1.75, halfHeight: 0.425 },
};

/**
 * Check OBB (Oriented Bounding Box) intersection with rotation
 * Transforms projectile position into tank's local space and checks bounds
 */
function checkOBBHit(
    projPos: Vector3,
    tankPos: Vector3,
    tankRotation: number,
    halfW: number,
    halfD: number,
    halfH: number,
    projRadius: number = 0.3
): boolean {
    // Transform projectile position into tank's local space (rotate by -rotation)
    const cos = Math.cos(-tankRotation);
    const sin = Math.sin(-tankRotation);

    // Relative position
    const relX = projPos.x - tankPos.x;
    const relZ = projPos.z - tankPos.z;

    // Rotated into local space
    const localX = relX * cos - relZ * sin;
    // OBB центр должен быть поднят на halfH, чтобы хитбокс стоял НА земле (от 0 до 2*halfH)
    // Т.е. мы проверяем разницу между высотой снаряда и центом хитбокса (pos.y + halfH)
    const localY = projPos.y - (tankPos.y + halfH);
    const localZ = relX * sin + relZ * cos;

    // Check if within OBB bounds (with projectile radius buffer)
    return Math.abs(localX) <= halfW + projRadius &&
        Math.abs(localY) <= halfH + projRadius &&
        Math.abs(localZ) <= halfD + projRadius;
}


export class GameRoom {
    id: string;
    mode: GameMode;
    maxPlayers: number;
    isPrivate: boolean;
    creatorId: string | null = null; // ID создателя комнаты
    players: Map<string, ServerPlayer> = new Map();
    projectiles: Map<string, ServerProjectile> = new Map();
    walls: ServerWall[] = [];
    consumables: Map<string, ConsumableData> = new Map();
    enemies: Map<string, ServerEnemy> = new Map();

    // Bot settings
    enableBots: boolean = false; // По умолчанию боты ОТКЛЮЧЕНЫ
    botCount: number = 0; // Количество ботов (0 = автоматически на основе игроков)

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

    // Damage events queue for broadcasting
    damageEvents: any[] = [];

    // CTF system
    ctfSystem: CTFSystem | null = null;

    // Settings
    settings: any = {};

    // World seed for deterministic generation
    worldSeed: number;

    // Map type
    mapType: string = "normal";

    // Room deletion timer
    deletionTimer: NodeJS.Timeout | null = null;
    emptySince: number | null = null; // Time when room became empty (for logging)

    constructor(mode: GameMode, maxPlayers: number = 32, isPrivate: boolean = false, worldSeed?: number, roomId?: string, mapType?: string) {
        // ВСЕГДА используем переданный roomId (простой формат 0001, 0002...)
        // Если roomId не передан, это ошибка - используем fallback, но логируем предупреждение
        if (!roomId) {
            serverLogger.warn(`[Room] ВНИМАНИЕ: комната создана без roomId! Используется fallback nanoid.`);
            this.id = nanoid();
        } else {
            this.id = roomId;
        }
        this.mode = mode;
        this.maxPlayers = maxPlayers;
        this.isPrivate = isPrivate;
        // Generate seed if not provided
        this.worldSeed = worldSeed || Math.floor(Math.random() * 999999999);

        // Валидация и установка mapType
        // Список допустимых типов карт для предотвращения инъекции невалидных значений
        const validMapTypes = ["normal", "desert", "snow", "sandbox", "city", "forest", "swamp", "volcanic", "arctic", "tropical", "sand"];
        if (mapType && validMapTypes.includes(mapType)) {
            this.mapType = mapType;
        } else {
            if (mapType) {
                serverLogger.warn(`[Room] Невалидный mapType: '${mapType}', используем 'normal'. Допустимые: ${validMapTypes.join(', ')}`);
            }
            this.mapType = "normal";
        }
        serverLogger.log(`[Room] Комната создана с mapType: ${this.mapType}, worldSeed: ${this.worldSeed}`);

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
        if (this.mode === "tdm" || this.mode === "ctf" || this.mode === "control_point" || this.mode === "escort") {
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

        // Spawn enemies for multiplayer modes (только если enableBots = true)
        serverLogger.log(`[Room] startMatch: режим=${this.mode}, enableBots=${this.enableBots}, botCount=${this.botCount}`);
        if (this.enableBots) {
            serverLogger.log(`[Room] ✅ Боты включены, запускаем spawnEnemies()...`);
            this.spawnEnemies();
        } else {
            serverLogger.log(`[Room] ⚠️ Боты отключены (enableBots=false)`);
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
        // Используем детерминированный спавн на основе worldSeed для синхронизации между клиентами
        // Если botCount > 0 - используем указанное количество, иначе автоматически
        const enemyCount = this.botCount > 0 ? this.botCount : Math.min(8, this.players.size * 2);
        const spawnRadius = 50;

        // Используем простой генератор случайных чисел на основе worldSeed для детерминированности
        let seed = this.worldSeed || 12345;
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };

        for (let i = 0; i < enemyCount; i++) {
            const angle = (i / enemyCount) * Math.PI * 2;
            const radius = spawnRadius + random() * 20;
            const position = new Vector3(
                Math.cos(angle) * radius,
                1.0, // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                Math.sin(angle) * radius
            );

            const difficulty: "easy" | "medium" | "hard" = "medium";
            const enemy = new ServerEnemy(position, difficulty);
            this.enemies.set(enemy.id, enemy);
        }

        serverLogger.log(`[Room] Spawned ${enemyCount} synchronized enemies for room ${this.id}`);
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            logger.debug(`[Room] Enemies spawned: ${enemyCount} enemies`);
        }
    }

    /**
     * Get all enemy data for synchronization
     */
    getEnemyData(): Array<import("../shared/types").EnemyData> {
        return Array.from(this.enemies.values()).map(enemy => enemy.toEnemyData());
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
        this.damageEvents = [];
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


        // Update walls (remove expired)
        this.walls = this.walls.filter(wall => !wall.isExpired(Date.now()));

        // Update projectiles
        const currentTime = Date.now();
        for (const [projId, projectile] of this.projectiles.entries()) {
            projectile.update(deltaTime);

            // Check collisions with walls
            // Using lastFrames position to simulate raycast for high speed projectiles
            // For now simple point check, can be improved to raycast
            let wallHit = false;
            for (const wall of this.walls) {
                // If projectile is explosive, we might want to detonate on wall
                // Basic check: is projectile inside wall?
                if (wall.checkCollision(projectile.position)) {
                    wallHit = true;
                    this.projectiles.delete(projId);
                    // Force a "hit" event on the wall location for visual feedback (optional)
                    break;
                }
            }
            if (wallHit) continue;

            // Check hits on players
            for (const player of this.players.values()) {
                if (player.id === projectile.ownerId) continue; // Can't hit self
                if (player.status !== "alive") continue;

                // Enhanced lag compensation: check hit at position when shot was fired
                // Rewind to when the shooter saw the target (accounting for network latency)
                const shooterRTT = projectile.shooterRTT || 100; // Default 100ms if not available
                const MAX_REWIND_TIME = 300; // Maximum rewind of 300ms (protection against high latency abuse)
                const effectiveRTT = Math.min(shooterRTT, MAX_REWIND_TIME);

                // Calculate rewind time: current time - half RTT (when shooter saw the target)
                const rewindTime = currentTime - (effectiveRTT / 2);

                // Get target position at the rewound time
                let targetPos = player.getPositionAtTime(rewindTime);

                // Fallback to current position if history is not available or position is invalid
                if (!targetPos || !Number.isFinite(targetPos.x) || !Number.isFinite(targetPos.y) || !Number.isFinite(targetPos.z)) {
                    targetPos = player.position.clone();
                }

                // Additional validation: if rewound position is too far from current, use interpolated position
                const maxRewindDistance = 20; // Maximum distance for valid rewind (units)
                if (Vector3.Distance(targetPos, player.position) > maxRewindDistance) {
                    // Position seems invalid, fallback to slightly rewound current position
                    targetPos = player.position.clone();
                }

                // КРИТИЧНО: Используем OBB (Oriented Bounding Box) для точного определения попадания
                // OBB учитывает rotation танка в отличие от AABB

                // Получаем размеры хитбокса
                const dims = CHASSIS_DIMENSIONS[player.chassisType] || CHASSIS_DIMENSIONS.medium || { halfWidth: 1.1, halfDepth: 1.75, halfHeight: 0.4 };
                const halfW = dims.halfWidth;
                const halfD = dims.halfDepth;
                const halfH = dims.halfHeight; // This is half height, center should be up by this amount if pivot is bottom

                // OBB Center: Tank position is usually ground center. 
                // We need to raise it to the physical center of the box.
                const tankCenterInfo = targetPos.clone().add(new Vector3(0, halfH, 0));

                // Проверка попадания в OBB с учётом rotation
                let isHit = this.checkOBBHit(projectile.position, tankCenterInfo, player.rotation, halfW, halfD, halfH, 0.5); // 0.5 radius tolerance

                // DEBUG LOGGING
                if (!isHit && Math.random() < 0.01) {
                    // Log some misses to verify coordinates
                    // serverLogger.log(`[HitCheck] MISS: Proj(${projectile.position.x.toFixed(1)},${projectile.position.z.toFixed(1)}) vs Tank(${targetPos.x.toFixed(1)},${targetPos.z.toFixed(1)}) Rot:${player.rotation.toFixed(2)}`);
                }

                if (isHit) {
                    serverLogger.log(`[Room] 🎯 HIT CONFIRMED! ProjID=${projectile.id} on Player=${player.name}(${player.id})`);
                }

                if (isHit) {
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
                    const damageEvent = {
                        died: died,
                        victimId: player.id,
                        victimName: player.name,
                        attackerId: projectile.ownerId,
                        attackerName: this.players.get(projectile.ownerId)?.name || "Unknown",
                        damage: projectile.damage,
                        newHealth: player.health,
                        maxHealth: player.maxHealth
                    };
                    this.damageEvents.push(damageEvent);

                    // Remove projectile
                    this.projectiles.delete(projId);
                    this.worldUpdates.destroyedObjects.push(projId);
                    break;
                }
            }

            // Remove expired projectiles
            if (projectile.isExpired(currentTime)) {
                this.projectiles.delete(projId);
                this.worldUpdates.destroyedObjects.push(projId);
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
        // =========================================================================
        // CLIENT-AUTHORITATIVE POSITION
        // Клиент отправляет свою реальную позицию от Havok физики.
        // Сервер принимает её и транслирует другим игрокам.
        // Это гарантирует точную синхронизацию позиций между клиентами.
        // =========================================================================

        const oldPosition = player.position.clone();

        // Если клиент прислал позицию - используем её напрямую БЕЗ ВАЛИДАЦИИ
        if (input.position && typeof input.position.x === 'number') {
            player.position = new Vector3(input.position.x, input.position.y, input.position.z);
            player.addPositionSnapshot(player.position);
            player.lastValidPosition = player.position.clone();
        }

        // Если клиент прислал rotation - используем его
        if (input.rotation !== undefined && typeof input.rotation === 'number') {
            player.rotation = input.rotation;
            // Normalize rotation
            while (player.rotation > Math.PI) player.rotation -= Math.PI * 2;
            while (player.rotation < -Math.PI) player.rotation += Math.PI * 2;
        }

        // Если клиент прислал pitch/roll (наклон на местности) - используем их
        if (input.chassisPitch !== undefined && typeof input.chassisPitch === 'number') {
            player.chassisPitch = input.chassisPitch;
        }
        if (input.chassisRoll !== undefined && typeof input.chassisRoll === 'number') {
            player.chassisRoll = input.chassisRoll;
        }

        // Update turret rotation
        player.turretRotation = input.turretRotation ?? player.turretRotation;
        player.aimPitch = input.aimPitch ?? player.aimPitch;
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

    /**
     * Schedule room deletion after specified delay
     * @param delay - Delay in milliseconds before deletion
     * @param onDelete - Callback to execute when deletion timer expires
     */
    scheduleDeletion(delay: number, onDelete: () => void): void {
        // Cancel existing timer if any
        this.cancelDeletion();

        // Set empty timestamp
        this.emptySince = Date.now();

        this.deletionTimer = setTimeout(() => {
            onDelete();
        }, delay);

        serverLogger.info(`[Room] Room ${this.id} scheduled for deletion in ${delay}ms`);
    }

    cancelDeletion(): void {
        if (this.deletionTimer) {
            clearTimeout(this.deletionTimer);
            this.deletionTimer = null;
            this.emptySince = null;
        }
    }

    spawnWall(wall: ServerWall) {
        this.walls.push(wall);
        // Limit max walls per room to prevent abuse/lag
        if (this.walls.length > 50) {
            this.walls.shift();
        }
    }
    /**
     * Helper to check OBB (Oriented Bounding Box) intersection
     * @param point Point to check (projectile pos)
     * @param boxCenter Center of the OBB (tank center)
     * @param boxRotation Y-axis rotation of the box
     * @param halfW Half width
     * @param halfD Half depth
     * @param halfH Half height
     * @param tolerance Radius of the point/tolerance
     */
    private checkOBBHit(point: Vector3, boxCenter: Vector3, boxRotation: number, halfW: number, halfD: number, halfH: number, tolerance: number): boolean {
        // Transform the point into the OBB's local space

        // 1. Translate point to OBB center relative
        const dir = point.clone().subtract(boxCenter);

        // 2. Rotate point by inverse of OBB rotation (to align OBB with axes)
        // Tank rotates around Y axis.
        // If tank rotation is 'rot', we rotate point by '-rot' to bring it to local axis-aligned system.
        const cos = Math.cos(-boxRotation);
        const sin = Math.sin(-boxRotation);

        // Rotate around Y axis:
        // x' = x*cos - z*sin
        // z' = x*sin + z*cos
        const localX = dir.x * cos - dir.z * sin;
        const localZ = dir.x * sin + dir.z * cos;
        const localY = dir.y; // Y is up, unaffected by yaw

        // 3. Check AABB in local space
        // Add tolerance (projectile radius) to dimensions
        return (
            Math.abs(localX) <= (halfW + tolerance) &&
            Math.abs(localY) <= (halfH + tolerance) &&
            Math.abs(localZ) <= (halfD + tolerance)
        );
    }
}

