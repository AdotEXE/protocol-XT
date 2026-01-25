import { Vector3 } from "@babylonjs/core";

export type GameMode = "ffa" | "tdm" | "coop" | "battle_royale" | "ctf" | "control_point" | "escort" | "survival" | "raid";

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
    chassisPitch?: number; // X rotation (pitch/tilt forward-backward)
    chassisRoll?: number; // Z rotation (roll/tilt left-right)
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
    trackType?: string; // Track ID (e.g., "standard", "light")
    tankColor?: string; // Hex color for tank body
    turretColor?: string; // Hex color for turret
    // Velocity data for dead reckoning (extrapolation)
    velocity?: Vector3Data; // Linear velocity
    angularVelocity?: number; // Angular velocity (rotation speed)
    turretAngularVelocity?: number; // Turret rotation speed
}

export interface PlayerInput {
    throttle: number; // -1 to 1
    steer: number; // -1 to 1
    turretRotation: number;
    aimPitch: number;
    isShooting: boolean;
    timestamp: number;
    sequence?: number; // Sequence number for client-side prediction and server reconciliation
    // CLIENT-AUTHORITATIVE POSITION: Клиент отправляет реальную позицию от Havok физики
    position?: { x: number; y: number; z: number };
    rotation?: number; // Y rotation of chassis (yaw)
    chassisPitch?: number; // X rotation of chassis (pitch/tilt forward-backward)
    chassisRoll?: number; // Z rotation of chassis (roll/tilt left-right)
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

// Client-side prediction types
export interface PredictedState {
    sequence: number;
    timestamp: number;
    position: Vector3;
    rotation: number;
    turretRotation: number;
    aimPitch: number;
    input: PlayerInput;
}

export interface ClientPredictionState {
    predictedStates: Map<number, PredictedState>; // sequence -> state
    confirmedSequence: number; // Last server-confirmed sequence
    lastServerState: PlayerData | null;
    maxHistorySize: number; // Maximum number of states to keep (default: 60 = 1 second at 60Hz)
}

// Network quality metrics
export interface NetworkMetrics {
    rtt: number; // Round-trip time (ms)
    jitter: number; // Variation in RTT (ms)
    packetLoss: number; // Packet loss percentage (0-1)
    lastPingTime: number; // Timestamp of last ping
    pingHistory: number[]; // Last 10 RTT measurements
}

// КРИТИЧНО: Константы движения для синхронизации клиента и сервера
// Эти значения используются на сервере для симуляции движения
// На клиенте используются для расчета сил в физике Havok
// ВАЖНО: Эти значения должны совпадать на клиенте и сервере для правильной синхронизации
export const MOVEMENT_CONSTANTS = {
    // Базовая скорость движения (единиц/сек)
    // Используется на сервере для простой симуляции
    // На клиенте это максимальная скорость, достигаемая через физику
    BASE_MOVE_SPEED: 20,

    // Базовая скорость поворота (радиан/сек)
    // Используется на сервере для простой симуляции
    // На клиенте это базовая скорость поворота через физику
    BASE_TURN_SPEED: 4.4,
} as const;

