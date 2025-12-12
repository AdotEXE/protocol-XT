import { WebSocket } from "ws";
import { Vector3 } from "@babylonjs/core";
import type { PlayerData, PlayerInput, PlayerStatus, GameMode } from "../shared/types";
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

