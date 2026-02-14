import { WebSocket } from "ws";
import { Vector3 } from "@babylonjs/core";
import type { PlayerData, PlayerInput, PlayerStatus } from "../shared/types";
import { nanoid } from "nanoid";

export class ServerPlayer {
    id: string;
    socket: WebSocket;
    name: string;
    roomId: string | null = null;

    // Game state
    position: Vector3 = new Vector3(0, 0, 0);
    rotation: number = 0;
    chassisPitch: number = 0; // X rotation (pitch/tilt forward-backward)
    chassisRoll: number = 0; // Z rotation (roll/tilt left-right)
    turretRotation: number = 0;
    aimPitch: number = 0;
    health: number = 100;
    maxHealth: number = 100;
    status: PlayerStatus = "alive";
    team?: number;

    // Customization
    chassisType: string = "medium";
    cannonType: string = "standard";
    trackType: string = "standard";
    tankColor: string = "#00ff00"; // Default green (matches medium chassis)
    turretColor: string = "#00ff00";
    modules: string[] = []; // Equipped modules

    // Chassis dimensions for hit detection (set based on chassisType)
    chassisHalfWidth: number = 1.1;  // Half of chassis width
    chassisHalfDepth: number = 1.75; // Half of chassis depth
    chassisHalfHeight: number = 0.4; // Half of chassis height

    // Velocity for dead reckoning (extrapolation on clients)
    velocity: Vector3 = new Vector3(0, 0, 0);
    angularVelocity: number = 0;
    turretAngularVelocity: number = 0;
    private lastRotation: number = 0;
    private lastTurretRotation: number = 0;
    private lastVelocityUpdateTime: number = Date.now();

    // =========================================================================
    // ИНЕРЦИЯ: Плавное движение для устранения дёрганья
    // =========================================================================
    smoothThrottle: number = 0;  // Текущая сглаженная скорость газа
    smoothSteer: number = 0;     // Текущий сглаженный поворот

    // Stats
    kills: number = 0;
    deaths: number = 0;
    score: number = 0;

    // Input tracking
    lastInput: PlayerInput | null = null;
    lastInputTime: number = 0;
    lastValidPosition: Vector3 = new Vector3(0, 0, 0);
    inputCount: number = 0;
    inputCountResetTime: number = Date.now();
    shootCount: number = 0;
    shootCountResetTime: number = Date.now();

    // PERF: True circular buffer for position history — O(1) insert instead of O(n) shift()
    // Max 60 entries = 1 second at 60Hz
    private readonly MAX_POSITION_HISTORY = 60;
    private _posHistoryBuffer: Array<{ time: number; position: Vector3 }> = new Array(60);
    private _posHistoryHead: number = 0;  // next write index
    private _posHistorySize: number = 0;  // current number of entries
    // Legacy accessor for any external code that reads positionHistory
    get positionHistory(): Array<{ time: number; position: Vector3 }> {
        // Return a view of the ring buffer in chronological order
        const result: Array<{ time: number; position: Vector3 }> = [];
        const start = (this._posHistoryHead - this._posHistorySize + this.MAX_POSITION_HISTORY) % this.MAX_POSITION_HISTORY;
        for (let i = 0; i < this._posHistorySize; i++) {
            result.push(this._posHistoryBuffer[(start + i) % this.MAX_POSITION_HISTORY]!);
        }
        return result;
    }
    suspiciousMovementCount: number = 0;
    violationCount: number = 0;
    lastViolationTime: number = 0;

    // Connection tracking
    connected: boolean = true;
    lastPing: number = Date.now();
    ping: number = 0;

    // Diagnostics & rate limiting // [Opus 4.6]
    _inputLogCount: number = 0;
    _lastChatTime: number = 0;

    // Sequence tracking for client-side prediction reconciliation
    lastProcessedSequence: number = -1;

    constructor(socket: WebSocket, playerId?: string, playerName?: string) {
        this.id = playerId || nanoid();
        this.socket = socket;
        this.name = playerName || `Player_${this.id.substring(0, 6)}`;
    }

    toPlayerData(): PlayerData {
        return {
            id: this.id,
            name: this.name,
            position: this.position,
            rotation: this.rotation,
            chassisPitch: this.chassisPitch,
            chassisRoll: this.chassisRoll,
            turretRotation: this.turretRotation,
            aimPitch: this.aimPitch,
            health: this.health,
            maxHealth: this.maxHealth,
            status: this.status,
            team: this.team,
            kills: this.kills,
            deaths: this.deaths,
            score: this.score,
            // Tank customization
            chassisType: this.chassisType,
            cannonType: this.cannonType,
            trackType: this.trackType,
            tankColor: this.tankColor,
            turretColor: this.turretColor,
            // Velocity data for dead reckoning
            velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
            angularVelocity: this.angularVelocity,
            turretAngularVelocity: this.turretAngularVelocity,
            modules: this.modules
        };
    }

    updateFromInput(input: PlayerInput): void {
        this.lastInput = input;
        this.lastInputTime = Date.now();
        // Position and rotation will be updated by game logic in room.update()
    }

    /**
     * Add position snapshot to history for lag compensation
     * Also calculates velocity for dead reckoning
     */
    addPositionSnapshot(position: Vector3): void {
        const now = Date.now();
        const deltaTime = (now - this.lastVelocityUpdateTime) / 1000; // seconds

        // Calculate velocity from position delta
        if (deltaTime > 0 && deltaTime < 1) { // Ignore if > 1 second (likely reconnect)
            const newVelocity = position.subtract(this.lastValidPosition).scale(1 / deltaTime);
            // Smooth velocity using EWMA (exponential weighted moving average)
            const alpha = 0.3;
            this.velocity.x = this.velocity.x * (1 - alpha) + newVelocity.x * alpha;
            this.velocity.y = this.velocity.y * (1 - alpha) + newVelocity.y * alpha;
            this.velocity.z = this.velocity.z * (1 - alpha) + newVelocity.z * alpha;

            // Calculate angular velocities
            let rotationDelta = this.rotation - this.lastRotation;
            // Normalize angle delta
            while (rotationDelta > Math.PI) rotationDelta -= Math.PI * 2;
            while (rotationDelta < -Math.PI) rotationDelta += Math.PI * 2;
            this.angularVelocity = this.angularVelocity * (1 - alpha) + (rotationDelta / deltaTime) * alpha;

            let turretDelta = this.turretRotation - this.lastTurretRotation;
            while (turretDelta > Math.PI) turretDelta -= Math.PI * 2;
            while (turretDelta < -Math.PI) turretDelta += Math.PI * 2;
            this.turretAngularVelocity = this.turretAngularVelocity * (1 - alpha) + (turretDelta / deltaTime) * alpha;
        }

        this.lastRotation = this.rotation;
        this.lastTurretRotation = this.turretRotation;
        this.lastVelocityUpdateTime = now;

        // PERF: O(1) ring buffer insert — overwrites oldest entry when full
        this._posHistoryBuffer[this._posHistoryHead] = { time: now, position: position.clone() };
        this._posHistoryHead = (this._posHistoryHead + 1) % this.MAX_POSITION_HISTORY;
        if (this._posHistorySize < this.MAX_POSITION_HISTORY) {
            this._posHistorySize++;
        }
    }

    /**
     * Get position at a specific time for lag compensation
     * PERF: Reads ring buffer directly without allocating a new array.
     */
    getPositionAtTime(targetTime: number): Vector3 | null {
        if (this._posHistorySize === 0) {
            return this.position.clone();
        }

        // Iterate ring buffer in chronological order
        const start = (this._posHistoryHead - this._posHistorySize + this.MAX_POSITION_HISTORY) % this.MAX_POSITION_HISTORY;
        let before: { time: number; position: Vector3 } | null = null;
        let after: { time: number; position: Vector3 } | null = null;

        for (let i = 0; i < this._posHistorySize; i++) {
            const entry = this._posHistoryBuffer[(start + i) % this.MAX_POSITION_HISTORY]!;
            if (entry.time <= targetTime) {
                before = entry;
            }
            if (entry.time >= targetTime && !after) {
                after = entry;
                break;
            }
        }

        if (!before && !after) return this.position.clone();
        if (!before) return after!.position.clone();
        if (!after) return before.position.clone();

        const timeDelta = after.time - before.time;
        if (timeDelta === 0) return before.position.clone();

        const t = (targetTime - before.time) / timeDelta;
        return Vector3.Lerp(before.position, after.position, t);
    }

    takeDamage(damage: number): boolean {
        if (this.status !== "alive") return false;

        this.health = Math.max(0, this.health - damage);

        if (this.health <= 0) {
            this.health = 0;
            this.status = "dead";
            this.deaths++;
            return true; // Player died
        }

        return false; // Player still alive
    }

    respawn(position: Vector3, health: number = 100): void {
        this.position = position;
        this.health = health;
        this.maxHealth = health;
        this.status = "alive";
        this.rotation = 0;
        this.turretRotation = 0;
        this.aimPitch = 0;
    }

    addKill(): void {
        this.kills++;
        this.score += 100; // Base score for kill
    }

    disconnect(): void {
        this.connected = false;
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
    }
}

