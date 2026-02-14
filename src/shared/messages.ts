import { Vector3 } from "@babylonjs/core";
import type { GameMode, PlayerData, ProjectileData, WorldUpdate, ConsumableData } from "./types";

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
    LIST_ROOMS = "list_rooms",
    START_GAME = "start_game",
    GET_ONLINE_PLAYERS = "get_online_players",
    KICK_PLAYER = "kick_player",
    CHANGE_ROOM_SETTINGS = "change_room_settings",
    TRANSFER_ROOM_OWNERSHIP = "transfer_room_ownership",
    GET_ROOM_PLAYERS = "get_room_players",

    // Matchmaking
    QUICK_PLAY = "quick_play",
    CANCEL_QUEUE = "cancel_queue",

    // Social
    GAME_INVITE = "game_invite",

    // Gameplay
    PLAYER_INPUT = "player_input",
    PLAYER_SHOOT = "player_shoot",
    PLAYER_RESPAWN_REQUEST = "player_respawn_request",
    PLAYER_HIT = "player_hit", // Client reports hitting another player
    CHAT_MESSAGE = "chat_message",

    // World
    WORLD_UPDATE = "world_update",
    CONSUMABLE_PICKUP_REQUEST = "consumable_pickup_request",

    // Module events
    WALL_SPAWN = "wall_spawn",

    // Voice Chat
    VOICE_OFFER = "voice_offer",
    VOICE_ANSWER = "voice_answer",
    VOICE_ICE_CANDIDATE = "voice_ice_candidate",
    VOICE_JOIN = "voice_join",
    VOICE_LEAVE = "voice_leave",
    VOICE_TALKING = "voice_talking",

    // Monitoring
    CLIENT_METRICS = "client_metrics",

    // Network quality
    PING = "ping",
    RPC = "rpc",
    UPDATE_PROFILE = "update_profile", // [Opus 4.6] Added to ClientMessageType (was only in ServerMessageType)

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
    ROOM_LIST = "room_list",
    PLAYER_JOINED = "player_joined",
    PLAYER_LEFT = "player_left",
    ONLINE_PLAYERS_LIST = "online_players_list",
    PLAYER_KICKED = "player_kicked",
    ROOM_SETTINGS_CHANGED = "room_settings_changed",
    ROOM_OWNERSHIP_TRANSFERRED = "room_ownership_transferred",
    ROOM_PLAYERS_LIST = "room_players_list",

    // Matchmaking
    MATCH_FOUND = "match_found",
    QUEUE_UPDATE = "queue_update",
    GAME_INVITE = "game_invite",

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
    PLAYER_PROFILE_UPDATED = "player_profile_updated",

    // World
    WORLD_UPDATE = "world_update",
    CONSUMABLE_SPAWN = "consumable_spawn",
    CONSUMABLE_PICKUP = "consumable_pickup",

    // Module events
    WALL_SPAWN = "wall_spawn",

    // Enemies
    ENEMY_SPAWN = "enemy_spawn",
    ENEMY_UPDATE = "enemy_update",
    ENEMY_SHOOT = "enemy_shoot",
    ENEMY_DEATH = "enemy_death",

    // Chat
    CHAT_MESSAGE = "chat_message",
    LOBBY_CHAT_MESSAGE = "lobby_chat_message",

    // Battle Royale
    SAFE_ZONE_UPDATE = "safe_zone_update",

    // Voice Chat
    VOICE_PLAYER_JOINED = "voice_player_joined",
    VOICE_PLAYER_LEFT = "voice_player_left",
    VOICE_OFFER = "voice_offer",
    VOICE_ANSWER = "voice_answer",
    VOICE_ICE_CANDIDATE = "voice_ice_candidate",
    VOICE_TALKING = "voice_talking",

    // Capture the Flag
    CTF_FLAG_UPDATE = "ctf_flag_update",
    CTF_FLAG_PICKUP = "ctf_flag_pickup",
    CTF_FLAG_CAPTURE = "ctf_flag_capture",
    CTF_FLAG_RETURN = "ctf_flag_return",

    // Control Point
    CONTROL_POINT_UPDATE = "control_point_update",

    // Escort
    ESCORT_PAYLOAD_UPDATE = "escort_payload_update",

    // Survival
    SURVIVAL_WAVE_UPDATE = "survival_wave_update",

    // Raid
    RAID_BOSS_UPDATE = "raid_boss_update",

    // Monitoring
    MONITORING_STATS = "monitoring_stats",

    // Network quality
    PONG = "pong",

    // Batch updates - groups multiple messages into one
    BATCH = "batch",
    RPC = "rpc",
    UPDATE_PROFILE = "update_profile",
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
    mapType?: string; // Type of map
    enableBots?: boolean; // Enable bots
    botCount?: number; // Number of bots
    // Customization
    chassisType?: string;
    cannonType?: string;
    tankColor?: string;
    turretColor?: string;
    playerName?: string;
    // Map Data
    customMapData?: any; // Full JSON data for custom maps
    modules?: string[]; // Equipped modules
}

export interface JoinRoomData {
    roomId: string;
}

export interface QuickPlayData {
    mode: GameMode;
    region?: string;
}

export interface WallSpawnData {
    position: Vector3;
    rotation: number;
    duration: number; // ms
    ownerId: string;
}

export interface PlayerShootData {
    position: Vector3;
    direction: Vector3;
    aimPitch: number;
    cannonType: string;
    timestamp: number;
}

// Client-reported hit on another player
export interface PlayerHitData {
    targetId: string;      // ID of player that was hit
    damage: number;        // Damage amount
    hitPosition: Vector3;  // Where the hit occurred
    isCritical?: boolean;
    cannonType: string;    // Type of weapon used
    timestamp: number;     // When the hit occurred
}

export interface UpdateProfileData {
    playerName: string;
    // Add other fields if needed, e.g., tank customization
}

// Server-reported damage to a player
export interface PlayerDamagedData {
    playerId: string;      // ID of player that was damaged
    damage: number;        // Damage amount
    health: number;        // Current health after damage
    maxHealth: number;     // Max health of the player
    hitPosition?: Vector3; // Where the hit occurred (optional, for visual effects)
    isCritical?: boolean;  // Whether the hit was critical
    cannonType: string;    // Type of weapon used
    timestamp: number;     // When the damage occurred
    attackerId?: string;   // ID of the player who dealt the damage
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
    // Map Info
    mapType?: string;
    customMapData?: any; // Full JSON data for custom maps
    enemies?: any[]; // For bot synchronization
}

export interface ErrorData {
    code: string;
    message: string;
}

export interface ClientMetricsData {
    // GPU
    gpuUsage?: number;
    gpuMemory?: number;
    gpuRenderer?: string;
    gpuVendor?: string;

    // CPU
    cpuUsage?: number;
    cpuCores?: number;

    // Network
    networkIn?: number;  // bytes/s
    networkOut?: number; // bytes/s
    networkLatency?: number;
    networkPackets?: number;

    // Physics
    physicsObjects?: number;
    physicsCollisions?: number;
    physicsTime?: number;
    physicsBodies?: number;

    // Audio
    audioSources?: number;
    audioMemory?: number;
    audioPlaying?: number;

    // Effects
    particles?: number;
    effectSystems?: number;
    activeEffects?: number;

    // Scene
    meshes?: number;
    lights?: number;
    cameras?: number;
    materials?: number;
    textures?: number;

    // FPS
    fps?: number;
}

// PlayerStates data with server sequence for reconciliation
export interface PlayerStatesData {
    // КРИТИЧНО: Флаг для полных состояний (без дельта-компрессии)
    // Используется для периодической отправки полных состояний (каждые 60 пакетов)
    // чтобы предотвратить накопление ошибок квантования
    isFullState?: boolean;
    players: PlayerData[];
    gameTime: number;
    serverSequence?: number; // Sequence number of last processed input (for reconciliation)
}

// Ping/Pong data types
export interface PingData {
    timestamp: number;
    sequence: number;
}

export interface PongData {
    timestamp: number; // Original ping timestamp
    sequence: number; // Original ping sequence
    serverTime: number; // Server timestamp when pong was sent
}

// Batch update data - groups multiple messages into one
export interface BatchUpdateData {
    updates: Array<{
        type: ServerMessageType;
        data: any;
    }>;
    timestamp: number;
}

// Online players list data
export interface OnlinePlayerData {
    id: string;
    name: string;
    roomId: string | null;
    roomMode: GameMode | null;
    isInRoom: boolean;
}

export interface OnlinePlayersListData {
    players: OnlinePlayerData[];
}

// Room management data types
export interface KickPlayerData {
    roomId: string;
    targetPlayerId: string;
    reason?: string;
}

export interface ChangeRoomSettingsData {
    roomId: string;
    settings: {
        mode?: GameMode;
        maxPlayers?: number;
        isPrivate?: boolean;
        password?: string;
        mapType?: string;
        worldSeed?: number;
    };
}

export interface TransferRoomOwnershipData {
    roomId: string;
    newOwnerId: string;
}

export interface RoomPlayerData {
    id: string;
    name: string;
    isOwner: boolean;
    isReady?: boolean;
    ping?: number;
    kills?: number;
    deaths?: number;
    score?: number;
}

export interface RoomPlayersListData {
    roomId: string;
    players: RoomPlayerData[];
    ownerId: string;
}

// Player death and respawn data types
export interface PlayerDiedData {
    playerId: string;
    playerName: string;
}

export interface PlayerRespawnedData {
    playerId: string;
    playerName: string;
    position: Vector3;
    health: number;
}

export interface PlayerProfileUpdatedData {
    playerId: string;
    playerName: string;
}

// Generic RPC event for visual effects and non-critical game logic
export interface RpcEventData {
    event: string;      // Event name (e.g., "SHOOT_EFFECT", "DRESS_UPDATE")
    payload: any;       // Arbitrary data
    sourceId: string;   // Player ID who triggered the event
    timestamp: number;
}
