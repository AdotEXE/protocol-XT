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
    
    // Anti-cheat tracking
    positionHistory: Array<{ time: number; position: Vector3 }> = [];
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
            score: this.score
        };
    }
    
    updateFromInput(input: PlayerInput): void {
        this.lastInput = input;
        this.lastInputTime = Date.now();
        // Position and rotation will be updated by game logic in room.update()
    }
    
    /**
     * Add position snapshot to history for lag compensation
     */
    addPositionSnapshot(position: Vector3): void {
        const now = Date.now();
        this.positionHistory.push({
            time: now,
            position: position.clone()
        });
        
        // Keep only last 60 entries (1 second at 60Hz)
        const maxHistoryTime = 1000; // 1 second
        this.positionHistory = this.positionHistory.filter(
            entry => now - entry.time <= maxHistoryTime
        );
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

