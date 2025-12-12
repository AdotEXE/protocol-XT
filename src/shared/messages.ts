import { Vector3 } from "@babylonjs/core";
import type { GameMode, PlayerInput, PlayerData, ProjectileData, WorldUpdate, ConsumableData } from "./types";

// Client -> Server messages
export interface ClientMessage {
    type: ClientMessageType;
    data: any;
    timestamp: number;
}

export enum ClientMessageType {
    // Connection
    CONNECT = "connect",
    DISCONNECT = "disconnect",
    
    // Room management
    CREATE_ROOM = "create_room",
    JOIN_ROOM = "join_room",
    LEAVE_ROOM = "leave_room",
    
    // Matchmaking
    QUICK_PLAY = "quick_play",
    CANCEL_QUEUE = "cancel_queue",
    
    // Gameplay
    PLAYER_INPUT = "player_input",
    PLAYER_SHOOT = "player_shoot",
    CHAT_MESSAGE = "chat_message",
    
    // World
    WORLD_UPDATE = "world_update",
    CONSUMABLE_PICKUP_REQUEST = "consumable_pickup_request",
    
    // Voice Chat
    VOICE_OFFER = "voice_offer",
    VOICE_ANSWER = "voice_answer",
    VOICE_ICE_CANDIDATE = "voice_ice_candidate",
    VOICE_JOIN = "voice_join",
    VOICE_LEAVE = "voice_leave",
}

// Server -> Client messages
export interface ServerMessage {
    type: ServerMessageType;
    data: any;
    timestamp: number;
}

export enum ServerMessageType {
    // Connection
    CONNECTED = "connected",
    DISCONNECTED = "disconnected",
    ERROR = "error",
    
    // Room management
    ROOM_CREATED = "room_created",
    ROOM_JOINED = "room_joined",
    ROOM_LEFT = "room_left",
    PLAYER_JOINED = "player_joined",
    PLAYER_LEFT = "player_left",
    
    // Matchmaking
    MATCH_FOUND = "match_found",
    QUEUE_UPDATE = "queue_update",
    
    // Game state
    GAME_START = "game_start",
    GAME_END = "game_end",
    GAME_STATE = "game_state", // Full state snapshot
    PLAYER_STATE = "player_state", // Individual player state
    PLAYER_STATES = "player_states", // All players state (60 Hz)
    
    // Projectiles
    PROJECTILE_SPAWN = "projectile_spawn",
    PROJECTILE_HIT = "projectile_hit",
    PROJECTILE_UPDATE = "projectile_update",
    
    // Player events
    PLAYER_DAMAGED = "player_damaged",
    PLAYER_KILLED = "player_killed",
    PLAYER_DIED = "player_died",
    PLAYER_RESPAWNED = "player_respawned",
    
    // World
    WORLD_UPDATE = "world_update",
    CONSUMABLE_SPAWN = "consumable_spawn",
    CONSUMABLE_PICKUP = "consumable_pickup",
    
    // Enemies
    ENEMY_SPAWN = "enemy_spawn",
    ENEMY_UPDATE = "enemy_update",
    ENEMY_SHOOT = "enemy_shoot",
    ENEMY_DEATH = "enemy_death",
    
    // Chat
    CHAT_MESSAGE = "chat_message",
    
    // Battle Royale
    SAFE_ZONE_UPDATE = "safe_zone_update",
    
    // Capture the Flag
    CTF_FLAG_UPDATE = "ctf_flag_update",
    CTF_FLAG_PICKUP = "ctf_flag_pickup",
    CTF_FLAG_CAPTURE = "ctf_flag_capture",
    CTF_FLAG_RETURN = "ctf_flag_return",
}

// Specific message data types
export interface ConnectData {
    playerId?: string; // Optional, server generates if not provided
    playerName: string;
}

export interface CreateRoomData {
    mode: GameMode;
    maxPlayers: number;
    isPrivate?: boolean;
    settings?: any;
}

export interface JoinRoomData {
    roomId: string;
}

export interface QuickPlayData {
    mode: GameMode;
    region?: string;
}

export interface PlayerShootData {
    position: Vector3;
    direction: Vector3;
    aimPitch: number;
    cannonType: string;
    timestamp: number;
}

export interface ChatMessageData {
    playerId: string;
    playerName: string;
    message: string;
    timestamp: number;
}

export interface ConsumablePickupData {
    consumableId: string;
    playerId: string;
    type: string;
    position: Vector3;
}

export interface GameStateData {
    roomId: string;
    mode: GameMode;
    worldSeed: number;
    players: PlayerData[];
    projectiles: ProjectileData[];
    world: WorldUpdate;
    consumables: ConsumableData[];
    gameTime: number;
    matchStartTime: number;
}

export interface ErrorData {
    code: string;
    message: string;
}

