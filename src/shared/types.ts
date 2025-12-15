import { Vector3 } from "@babylonjs/core";

export type GameMode = "ffa" | "tdm" | "coop" | "battle_royale" | "ctf";

// Vector3Data - сериализуемая версия Vector3 для передачи по сети
export interface Vector3Data {
    x: number;
    y: number;
    z: number;
}

export type PlayerStatus = "alive" | "dead" | "spectating";

export interface PlayerData {
    id: string;
    name: string;
    position: Vector3;
    rotation: number; // Y rotation (yaw)
    turretRotation: number;
    aimPitch: number;
    health: number;
    maxHealth: number;
    status: PlayerStatus;
    team?: number; // For team-based modes
    kills: number;
    deaths: number;
    score: number;
    // Tank customization
    chassisType?: string; // Chassis ID (e.g., "light", "heavy")
    cannonType?: string; // Cannon ID (e.g., "standard", "rapid")
    tankColor?: string; // Hex color for tank body
    turretColor?: string; // Hex color for turret
}

export interface PlayerInput {
    throttle: number; // -1 to 1
    steer: number; // -1 to 1
    turretRotation: number;
    aimPitch: number;
    isShooting: boolean;
    timestamp: number;
}

export interface ProjectileData {
    id: string;
    ownerId: string;
    position: Vector3;
    velocity: Vector3;
    damage: number;
    cannonType: string;
    spawnTime: number;
}

export interface WorldUpdate {
    destroyedObjects: string[]; // IDs of destroyed objects
    chunkUpdates: ChunkUpdate[];
}

export interface ChunkUpdate {
    chunkId: string;
    changes: any[]; // Specific changes to the chunk
}

export interface ConsumableData {
    id: string;
    type: string;
    position: Vector3;
    spawnTime: number;
    pickedUp: boolean;
}

export interface EnemyData {
    id: string;
    position: Vector3;
    rotation: number;
    turretRotation: number;
    health: number;
    maxHealth: number;
    isAlive: boolean;
    targetId: string | null;
    state: "idle" | "patrol" | "chase" | "attack" | "retreat";
}

export interface FlagData {
    id: string;
    team: number;
    position: Vector3Data;
    isCarried: boolean;
    carrierId: string | null;
    basePosition: Vector3Data;
}

export interface MatchResult {
    matchId: string;
    mode: GameMode;
    players: PlayerMatchResult[];
    duration: number;
    timestamp: number;
}

export interface PlayerMatchResult {
    playerId: string;
    kills: number;
    deaths: number;
    score: number;
    team?: number;
    won: boolean;
}

