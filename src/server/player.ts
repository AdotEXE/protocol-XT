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
    turretRotation: number = 0;
    aimPitch: number = 0;
    health: number = 100;
    maxHealth: number = 100;
    status: PlayerStatus = "alive";
    team?: number;
    
    // Velocity for dead reckoning (extrapolation on clients)
    velocity: Vector3 = new Vector3(0, 0, 0);
    angularVelocity: number = 0;
    turretAngularVelocity: number = 0;
    private lastRotation: number = 0;
    private lastTurretRotation: number = 0;
    private lastVelocityUpdateTime: number = Date.now();
    
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
    
    // Anti-cheat tracking - using ring buffer for position history (max 60 entries = 1 second at 60Hz)
    positionHistory: Array<{ time: number; position: Vector3 }> = [];
    private readonly MAX_POSITION_HISTORY = 60;
    suspiciousMovementCount: number = 0;
    violationCount: number = 0;
    lastViolationTime: number = 0;
    
    // Connection tracking
    connected: boolean = true;
    lastPing: number = Date.now();
    ping: number = 0;
    
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
            turretRotation: this.turretRotation,
            aimPitch: this.aimPitch,
            health: this.health,
            maxHealth: this.maxHealth,
            status: this.status,
            team: this.team,
            kills: this.kills,
            deaths: this.deaths,
            score: this.score,
            // Velocity data for dead reckoning
            velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
            angularVelocity: this.angularVelocity,
            turretAngularVelocity: this.turretAngularVelocity
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
        
        this.positionHistory.push({
            time: now,
            position: position.clone()
        });
        
        // Ring buffer: remove oldest entries if exceeding max size (O(1) instead of O(n) filter)
        while (this.positionHistory.length > this.MAX_POSITION_HISTORY) {
            this.positionHistory.shift();
        }
    }
    
    /**
     * Get position at a specific time for lag compensation
     */
    getPositionAtTime(targetTime: number): Vector3 | null {
        if (this.positionHistory.length === 0) {
            return this.position.clone(); // Fallback to current position
        }
        
        // Find closest snapshots
        let before: { time: number; position: Vector3 } | null = null;
        let after: { time: number; position: Vector3 } | null = null;
        
        for (const entry of this.positionHistory) {
            if (entry.time <= targetTime) {
                before = entry;
            }
            if (entry.time >= targetTime && !after) {
                after = entry;
                break;
            }
        }
        
        if (!before && !after) {
            return this.position.clone(); // Fallback to current position
        }
        
        if (!before) return after!.position.clone();
        if (!after) return before.position.clone();
        
        // Interpolate between before and after
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

