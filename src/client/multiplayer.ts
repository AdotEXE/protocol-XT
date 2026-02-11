import { Vector3 } from "@babylonjs/core";
import { createClientMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage, ClientMetricsData, PingData, PongData, PlayerStatesData, ChatMessageData, ConsumablePickupData, ErrorData, OnlinePlayersListData, RpcEventData, PlayerProfileUpdatedData } from "../shared/messages"; // [Opus 4.6] Added PlayerProfileUpdatedData import
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { PlayerData, PlayerInput, GameMode, PredictedState, ClientPredictionState, NetworkMetrics, ProjectileData, EnemyData, FlagData, Vector3Data } from "../shared/types";
import { nanoid } from "nanoid";
import { logger } from "./utils/logger";
import { ENABLE_DIAGNOSTIC_LOGS } from "./utils/diagnosticLogs";
import { getSkinById, getDefaultSkin } from "./tank/tankSkins";
import { firebaseService } from "./firebaseService";
import { getVoiceChatManager } from "./voiceChat";
import { timerManager } from "./optimization/TimerManager";
import { vector3Pool } from "./optimization/Vector3Pool";

/**
 * Safely convert any position object to Vector3
 * Handles both Vector3 instances and plain {x, y, z} objects from JSON
 */
function toVector3(pos: any): Vector3 {
    // ОПТИМИЗАЦИЯ: Используем vector3Pool для переиспользования объектов
    if (!pos) return vector3Pool.acquire(0, 0, 0);
    if (pos instanceof Vector3) {
        const vec = vector3Pool.acquire();
        vec.copyFrom(pos);
        return vec;
    }
    return vector3Pool.acquire(pos.x || 0, pos.y || 0, pos.z || 0);
}

/**
 * Safely clone a position (works with both Vector3 and plain objects)
 */
function clonePosition(pos: any): Vector3 {
    // ОПТИМИЗАЦИЯ: Используем toVector3 который уже использует pool
    return toVector3(pos);
}

// Callback data interfaces
export interface ConnectedData {
    playerId: string;
    playerName: string;
}

export interface RoomCreatedData {
    roomId: string;
    mode: GameMode;
    maxPlayers?: number;
    isPrivate?: boolean;
    isCreator?: boolean;
    worldSeed?: number;
    mapType?: string; // КРИТИЧНО: Тип карты для синхронизации
}

export interface RoomJoinedData {
    roomId: string;
    mode: GameMode;
    worldSeed?: number;
    mapType?: string; // КРИТИЧНО: Тип карты для синхронизации
    players?: PlayerData[];
    isCreator?: boolean;
    isActive?: boolean; // Статус игры - активна ли уже
}

export interface RoomData {
    id: string;
    mode: GameMode;
    players: number;
    maxPlayers: number;
    isActive: boolean;
    isPrivate?: boolean;
}

export interface MatchFoundData {
    roomId: string;
    mode: GameMode;
    worldSeed?: number;
}

export interface QueueUpdateData {
    mode: GameMode;
    queueSize: number;
    estimatedWait?: number;
}

export interface GameStartData {
    roomId: string;
    mode: GameMode;
    worldSeed?: number;
    players?: PlayerData[];
    mapType?: string;
    customMapData?: any;
}

export interface GameEndData {
    roomId: string;
    mode: GameMode;
    matchResult?: {
        matchId: string;
        players: Array<{
            playerId: string;
            kills: number;
            deaths: number;
            score: number;
            team?: number;
            won: boolean;
        }>;
        duration: number;
    };
}

export interface ProjectileSpawnData {
    projectile: ProjectileData;
    position?: Vector3Data;
    direction?: Vector3Data;
    cannonType?: string;
}

export interface EnemyUpdateData {
    enemy: EnemyData;
    enemies?: EnemyData[];
}

export interface SafeZoneUpdateData {
    center: Vector3Data;
    radius: number;
    shrinkRate?: number;
    damagePerSecond?: number;
}

export interface CTFFlagUpdateData {
    flag: FlagData;
}

export interface PlayerKilledData {
    killerId: string;
    victimId: string;
    killerName?: string;
    victimName?: string;
    weapon?: string;
    position?: Vector3Data;
}

export interface PlayerDiedData {
    playerId: string;
    cause?: string;
    position?: Vector3Data;
}

export interface PlayerRespawnedData {
    playerId: string;
    playerName?: string;
    position: Vector3Data;
    health?: number;
    maxHealth?: number;
}

export interface PlayerDamagedData {
    playerId: string;
    attackerId?: string;
    damage: number;
    health?: number;
    maxHealth?: number;
    remainingHealth?: number;
    position?: Vector3Data;
    hitPosition?: Vector3Data;
}



export interface CTFFlagPickupData {
    flagId: string;
    team: number;
    carrierId: string;
    position: Vector3Data;
    playerId?: string;
    playerName?: string;
    flagTeam?: number;
}

export interface CTFFlagCaptureData {
    flagId: string;
    team: number;
    capturerId: string;
    score: number;
    playerId?: string;
    playerName?: string;
    capturingTeam?: number;
}

export interface WallSpawnData {
    position: Vector3Data;
    rotation: number;
    duration: number;
    ownerId: string;
}

// World update data from server
export interface WorldUpdate {
    timestamp: number;
    players?: PlayerData[];
    projectiles?: ProjectileData[];
    enemies?: EnemyData[];
}

export interface NetworkPlayer {
    id: string;
    name: string;
    position: Vector3;
    rotation: number;
    chassisPitch?: number; // X rotation (pitch/tilt forward-backward)
    chassisRoll?: number; // Z rotation (roll/tilt left-right)
    turretRotation: number;
    aimPitch: number;
    health: number;
    maxHealth: number;
    status: "alive" | "dead" | "spectating";
    team?: number;
    kills?: number;
    deaths?: number;
    // Tank customization
    chassisType?: string;
    cannonType?: string;
    trackType?: string;
    tankColor?: string;
    turretColor?: string;
    modules?: string[];
    // For interpolation (linear)
    lastPosition: Vector3;
    lastRotation: number;
    lastTurretRotation: number;
    lastAimPitch: number; // Added for barrel pitch interpolation
    interpolationTime: number;
    // For cubic interpolation (spline)
    positionHistory: Vector3[]; // Last 3 positions for cubic spline
    rotationHistory: number[]; // Last 3 rotations
    turretRotationHistory: number[]; // Last 3 turret rotations
    aimPitchHistory: number[]; // Last 3 aim pitches for smooth barrel interpolation
    // For dead reckoning (extrapolation)
    velocity: Vector3; // Calculated velocity for extrapolation
    angularVelocity: number; // Rotation speed
    turretAngularVelocity: number; // Turret rotation speed
    lastUpdateTime: number; // Timestamp of last network update
    // Interpolation settings
    interpolationDelay: number; // Adaptive delay based on ping (ms)
    // Debug counters
    _rotDebugCounter?: number;
    _updateCount?: number; // [Opus 4.6] Added for position update diagnostics
}

/**
 * Автоматически определяет WebSocket URL на основе текущего hostname
 * Если игра загружена с 192.168.3.4:5000, вернет ws://192.168.3.4:8000
 * Если игра загружена с localhost:5000, вернет ws://localhost:8000
 */
/**
 * Validate WebSocket URL format
 */
function validateWebSocketUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:';
    } catch {
        return false;
    }
}

function getWebSocketUrl(defaultPort: number = 8000): string {
    // Проверяем переменную окружения (приоритет)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const envUrl = (import.meta as any).env?.VITE_WS_SERVER_URL;
    if (envUrl) {
        if (validateWebSocketUrl(envUrl)) {
            logger.log(`[Multiplayer] Using WebSocket URL from environment: ${envUrl}`);
            return envUrl;
        } else {
            logger.warn(`[Multiplayer] Invalid WebSocket URL in environment: ${envUrl}`);
        }
    }

    // Определяем hostname из текущего URL
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Локальная разработка — используем порт (отдельный сервер)
    // Продакшен (Vercel и т.д.) — без порта, используем дефолтный 80/443
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const url = `ws://localhost:${defaultPort}`;
        logger.log(`[Multiplayer] Auto-detected WebSocket URL (localhost): ${url}`);
        return url;
    }

    // Для локальных сетевых адресов (192.168.x.x, 10.x.x.x, 172.16-31.x.x) добавляем порт
    const isLocalNetwork = hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname);

    if (isLocalNetwork) {
        const url = `ws://${hostname}:${defaultPort}`;
        logger.log(`[Multiplayer] Auto-detected WebSocket URL (LAN): ${url}`);
        return url;
    }

    // Production - без порта (используется 80/443)
    const url = `${protocol}//${hostname}`;
    logger.log(`[Multiplayer] Auto-detected WebSocket URL (from hostname ${hostname}): ${url}`);
    return url;
}

/**
 * Get locally equipped modules from localStorage
 */
export function getLocallyEquippedModules(): string[] {
    try {
        const saved = localStorage.getItem("tank_modules_config");
        if (saved) {
            const config = JSON.parse(saved);
            return Object.values(config).filter(id => typeof id === 'string' && id.length > 0) as string[];
        }
    } catch (e) {
        logger.error("Failed to load modules for multiplayer", e);
    }
    return [];
}

/**
 * Получить сохраненный ID игрока из localStorage или создать новый
 */
function getOrCreatePlayerId(): string {
    const STORAGE_KEY = "tx_player_id";


    const STORAGE_NAME_KEY = "tx_player_name";

    try {
        // Пытаемся получить сохраненный ID
        const savedId = localStorage.getItem(STORAGE_KEY);

        if (savedId && savedId.length > 0) {
            return savedId;
        }

        // Если нет сохраненного ID - создаем новый
        const newId = nanoid();
        localStorage.setItem(STORAGE_KEY, newId);

        return newId;
    } catch (error) {
        // Если localStorage недоступен (например, в приватном режиме) - создаем временный ID
        logger.error(`[Multiplayer] ❌ Ошибка localStorage:`, error);
        logger.warn("[Multiplayer] Не удалось использовать localStorage, создаем временный ID", error);
        return nanoid();
    }
}

/**
 * Получить сохраненное имя игрока из localStorage
 */
function getSavedPlayerName(): string {
    const STORAGE_NAME_KEY = "tx_player_name";
    try {
        const savedName = localStorage.getItem(STORAGE_NAME_KEY);
        if (savedName && savedName.length > 0) {
            return savedName;
        }
    } catch (error) {
        // Игнорируем ошибки localStorage
    }
    return "Player";
}

/**
 * Сохранить имя игрока в localStorage
 */
function savePlayerName(name: string): void {
    const STORAGE_NAME_KEY = "tx_player_name";
    try {
        localStorage.setItem(STORAGE_NAME_KEY, name);
    } catch (error) {
        // Игнорируем ошибки localStorage
    }
}

export class MultiplayerManager {
    // Public Accessors for AdminPanel and Debugging
    public get localPlayerId(): string {
        return this.playerId;
    }

    public get localPlayerName(): string {
        return this.playerName;
    }

    public setPlayerName(name: string): void {
        this.playerName = name;
        savePlayerName(name);

        // If connected, send update to server
        if (this.connected) {
            this.send(createClientMessage(ClientMessageType.UPDATE_PROFILE, {
                playerName: name
            }));
        }
    }

    public get players(): Map<string, NetworkPlayer> {
        return this.networkPlayers;
    }

    private ws: WebSocket | null = null;
    private _lastBlobErrorTime: number = 0; // Throttling для ошибок Blob conversion
    private _lastPacketLossLogTime: number = 0; // Throttling для логов packet loss
    private _lastErrorLogTime: number = 0; // Throttling для ошибок обработки сообщений
    private playerId: string = getOrCreatePlayerId();
    private playerName: string = getSavedPlayerName();
    private connected: boolean = false;
    private roomId: string | null = null;
    private gameMode: GameMode | null = null;
    private _isRoomCreator: boolean = false;
    private serverUrl: string = getWebSocketUrl();
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private _reconnectDelay: number = 1000; // Start with 1 second
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isManualDisconnect: boolean = false;
    private isConnecting: boolean = false;
    private connectionTimeout: NodeJS.Timeout | null = null;
    private messageQueue: Array<ClientMessage> = [];
    private _gameTime: number = 0;
    private worldSeed: number | null = null;
    private pendingMapType: string | null = null; // КРИТИЧНО: mapType из ROOM_CREATED для использования до GAME_START
    private _roomIsActive: boolean = false; // Статус активности комнаты
    private _roomPlayersCount: number = 1; // Точное количество игроков в комнате (включая текущего)
    private _serverSpawnPosition: { x: number; y: number; z: number } | null = null; // Позиция спавна от сервера

    // Network players (excluding local player)
    private networkPlayers: Map<string, NetworkPlayer> = new Map();

    // Client-side prediction state
    private predictionState: ClientPredictionState = {
        predictedStates: new Map(),
        confirmedSequence: -1,
        lastServerState: null,
        maxHistorySize: 60 // 1 second at 60Hz
    };
    private currentSequence: number = 0;

    // Server time synchronization
    // offset = serverTime - clientTime (add this to Date.now() to get server time)
    private serverTimeOffset: number = 0;

    // Network quality metrics
    private networkMetrics: NetworkMetrics = {
        rtt: 0, // 0 until first PONG (real measurement)
        jitter: 0,
        packetLoss: 0,
        lastPingTime: 0,
        pingHistory: [],
        drift: 0
    };
    private pingInterval: NodeJS.Timeout | null = null;
    private pingSequence: number = 0;
    private lastPongTime: number = 0;

    // OPTIMIZATION: Adaptive ping interval configuration
    private readonly PING_INTERVAL_MIN = 1000;  // ОПТИМИЗАЦИЯ: 1s (было 0.5s) - снижает сетевую нагрузку
    private readonly PING_INTERVAL_MAX = 2000;  // 2s - less frequent when stable
    private readonly PING_INTERVAL_BASE = 1000; // 1s - default
    private currentPingInterval = 1000;         // Current adaptive interval

    public getPing(): number {
        return this.networkMetrics.rtt;
    }

    public getDrift(): number {
        return this.networkMetrics.drift ?? 0; // [Opus 4.6] Default to 0 since drift is optional
    }

    /**
     * Sync clock with server (NTP-like). Sends same PingData format as sendPing so server can respond with valid PONG.
     */
    private syncClock(): void {
        if (!this.connected) return;
        this.sendPing();
    }

    // КРИТИЧНО: Трекинг времени отправки PING по sequence number
    // Это позволяет корректно вычислять RTT независимо от расхождения часов
    private pingSendTimes: Map<number, number> = new Map();
    private pongTimeout: number = 30000; // 30 seconds timeout - fallback только если нет НИКАКИХ сообщений от сервера
    private healthCheckInterval: NodeJS.Timeout | null = null;
    // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval/setTimeout
    private pingTimerId: string | null = null;
    private healthCheckTimerId: string | null = null;
    private metricsTimerId: string | null = null;

    // Packet tracking for metrics
    private packetsSent: number = 0;
    private packetsReceived: number = 0;
    private packetsSentHistory: Array<{ timestamp: number; count: number }> = [];
    private packetsReceivedHistory: Array<{ timestamp: number; count: number }> = [];
    private lastMetricsUpdate: number = Date.now();
    private metricsUpdateInterval: NodeJS.Timeout | null = null;

    // Jitter buffer for smoothing network variations
    private jitterBuffer: Array<{
        data: PlayerStatesData;
        timestamp: number;
        sequence: number;
    }> = [];
    private jitterBufferTargetDelay: number = 16; // LOW-PING OPTIMIZED: Reduced from 30ms to ~1 frame at 60fps
    private jitterBufferMaxSize: number = 100; // ОПТИМИЗАЦИЯ: Уменьшено с 300 до 100 для снижения задержек и памяти
    private lastProcessedSequence: number = -1;
    private jitterBufferNeedsSort: boolean = false; // Flag to avoid unnecessary sorts

    private onProjectileUpdateCallback: ((data: any) => void) | null = null;
    private onProjectileHitCallback: ((data: any) => void) | null = null;

    onProjectileSpawn(callback: (data: any) => void) {
        this.onProjectileSpawnCallback = callback;
    }

    onProjectileUpdate(callback: (data: any) => void) {
        this.onProjectileUpdateCallback = callback;
    }

    onProjectileHit(callback: (data: any) => void) {
        this.onProjectileHitCallback = callback;
    }

    private handleProjectileSpawn(data: any) {
        // Ignore projectiles spawned by local player to prevent duplicates/ghosts
        // Client spawns its own projectiles immediately for zero latency
        if (data.ownerId === this.playerId) {
            return;
        }

        if (this.onProjectileSpawnCallback) {
            this.onProjectileSpawnCallback(data);
        }
    }

    private handleRpc(data: RpcEventData) {
        // RPC events are always processed, even for local player if echoed back (though usually server should exclude sender)
        if (this.onRpcCallback) {
            this.onRpcCallback(data);
        }
    }

    private handleProjectileUpdate(data: any) {
        // Ignore updates for local player projectiles
        if (data.ownerId === this.playerId) {
            return;
        }

        if (this.onProjectileUpdateCallback) {
            this.onProjectileUpdateCallback(data);
        }
    }

    private handleProjectileHit(data: any) {
        if (this.onProjectileHitCallback) {
            this.onProjectileHitCallback(data);
        }
    }

    // Callbacks
    private onConnectedCallback: (() => void) | null = null;
    private onDisconnectedCallback: (() => void) | null = null;
    private onPlayerJoinedCallbacks: Array<(player: PlayerData) => void> = [];
    private onPlayerLeftCallbacks: Array<(playerId: string) => void> = [];
    private onGameStartCallback: ((data: GameStartData) => void) | null = null;
    private onGameEndCallback: ((data: GameEndData) => void) | null = null;
    private onPlayerStatesCallback: ((players: PlayerData[], isFullState?: boolean) => void) | null = null;
    private onProjectileSpawnCallback: ((data: ProjectileSpawnData) => void) | null = null;
    private onChatMessageCallback: ((data: ChatMessageData) => void) | null = null;
    private onConsumablePickupCallback: ((data: ConsumablePickupData) => void) | null = null;
    private onConsumableSpawnCallback: ((data: any) => void) | null = null;
    private onEnemyUpdateCallback: ((data: EnemyUpdateData) => void) | null = null;
    private onSafeZoneUpdateCallback: ((data: SafeZoneUpdateData) => void) | null = null;
    private onCTFFlagUpdateCallback: ((data: CTFFlagUpdateData) => void) | null = null;
    private onPlayerKilledCallback: ((data: PlayerKilledData) => void) | null = null;
    private onPlayerDiedCallback: ((data: PlayerDiedData) => void) | null = null;
    private onPlayerRespawnedCallback: ((data: PlayerRespawnedData) => void) | null = null;
    private onPlayerDamagedCallback: ((data: PlayerDamagedData) => void) | null = null;
    private onCTFFlagPickupCallback: ((data: CTFFlagPickupData) => void) | null = null;
    private onCTFFlagCaptureCallback: ((data: CTFFlagCaptureData) => void) | null = null;
    private onQueueUpdateCallback: ((data: QueueUpdateData) => void) | null = null;
    private onMatchFoundCallback: ((data: MatchFoundData) => void) | null = null;
    private onGameInviteCallback: ((data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }) => void) | null = null;
    private onReconciliationCallback: ((data: { serverState?: PlayerData; predictedState?: PredictedState; unconfirmedStates?: PredictedState[]; unconfirmedInputs?: PlayerInput[]; positionDiff?: number; rotationDiff?: number; needsReapplication?: boolean }) => void) | null = null;
    private onRoomCreatedCallback: ((data: RoomCreatedData) => void) | null = null;
    private onRoomJoinedCallback: ((data: RoomJoinedData) => void) | null = null;
    private pendingRoomJoinedData: RoomJoinedData | null = null; // Буфер для ROOM_JOINED если callback еще не установлен
    private onRoomListCallbacks: Array<(rooms: RoomData[]) => void> = []; // Поддержка нескольких callbacks
    private onOnlinePlayersListCallbacks: Array<(players: OnlinePlayersListData) => void> = []; // Поддержка нескольких callbacks
    private onWallSpawnCallback: ((data: WallSpawnData) => void) | null = null;
    private onErrorCallback: ((data: ErrorData) => void) | null = null;
    private onRpcCallback: ((data: RpcEventData) => void) | null = null;

    constructor(serverUrl?: string, autoConnect: boolean = false) {
        // Если serverUrl не указан, автоматически определяем его
        this.serverUrl = serverUrl || getWebSocketUrl();
        if (autoConnect) {
            this.connect(this.serverUrl);
        }
    }


    // === NOTIFICATION HELPER ===
    private dispatchToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        try {
            // Dispatch standard UI event
            window.dispatchEvent(new CustomEvent('tx:notification', {
                detail: { message, type, duration: 3000 }
            }));

            // Also log to console for debugging
            const logPrefix = `[Multiplayer]`;
            if (type === 'error') logger.error(`${logPrefix} ${message}`);
            else if (type === 'warning') logger.warn(`${logPrefix} ${message}`);
            else logger.log(`${logPrefix} ${message}`);
        } catch (e) {
            logger.error("Failed to dispatch toast:", e);
        }
    }

    private _scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        // Check if localhost
        const isLocalhost = this.serverUrl.includes("localhost") || this.serverUrl.includes("127.0.0.1");

        // Exponential backoff
        // Increase delay by 50% each time, capped at 30 seconds (5s for localhost)
        const maxDelay = isLocalhost ? 5000 : 30000;
        const maxAttempts = isLocalhost ? 5 : this.maxReconnectAttempts;

        if (isLocalhost && this.reconnectAttempts >= maxAttempts) {
            this.dispatchToast("Connection refused (localhost). Is server running?", "error");
            logger.error("[Multiplayer] Max reconnect attempts reached for localhost.");
            return;
        }

        const nextDelay = Math.min(maxDelay, this._reconnectDelay * 1.5);
        this._reconnectDelay = nextDelay;

        logger.log(`[Multiplayer] Scheduling reconnect attempt ${this.reconnectAttempts + 1}/${maxAttempts} in ${Math.round(nextDelay)}ms`);

        this.reconnectTimer = setTimeout(() => {
            if (this.reconnectAttempts >= maxAttempts) {
                // Should have been caught above, but just in case
                return;
            }
            this.reconnectAttempts++;
            logger.log(`[Multiplayer] Attempting reconnect ${this.reconnectAttempts}/${maxAttempts}...`);
            this.connect(this.serverUrl);
        }, this._reconnectDelay);
    }

    connect(serverUrl: string): void {
        this.serverUrl = serverUrl;

        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            // logger.warn("[Multiplayer] Connection attempt already in progress");
            return;
        }

        // If already connected, don't reconnect
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // logger.warn("[Multiplayer] Already connected");
            return;
        }

        // Close existing connection if in CONNECTING or OPEN state
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            logger.log("[Multiplayer] Closing existing connection before creating new one");
            this.ws.close();
            this.ws = null;
        }

        // Clear any existing connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        try {
            // ИСПРАВЛЕНО: Проверяем и нормализуем URL перед подключением
            let normalizedUrl = serverUrl.trim();

            // Handle localhost special case for users without full protocol specification
            if (normalizedUrl.startsWith('localhost') || normalizedUrl.startsWith('127.0.0.1')) {
                normalizedUrl = `ws://${normalizedUrl}`;
            }

            // Убеждаемся, что используется правильный протокол
            if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
                // Если протокол не указан, добавляем ws:// или wss:// в зависимости от протокола страницы
                const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                normalizedUrl = `${wsProtocol}//${normalizedUrl}`;
            }

            // Validate URL format
            if (!validateWebSocketUrl(normalizedUrl)) {
                logger.error(`[Multiplayer] Invalid WebSocket URL format: ${normalizedUrl}`);
                this.isConnecting = false;

                // Don't just return, try to fallback to a safe default if initial failed
                if (serverUrl !== "ws://localhost:8000") {
                    logger.log("[Multiplayer] Falling back to default localhost URL");
                    this.connect("ws://localhost:8000");
                }
                return;
            }

            // Check if localhost to reduce log noise
            const isLocalhost = normalizedUrl.includes("localhost") || normalizedUrl.includes("127.0.0.1");

            logger.log("[Multiplayer] Connecting to:", normalizedUrl);
            this.isConnecting = true;

            try {
                this.ws = new WebSocket(normalizedUrl);
            } catch (wsError) {
                // For localhost, reduce spam level if it's just "not running"
                if (!isLocalhost || this.reconnectAttempts === 0) {
                    const errorMessage = isLocalhost
                        ? `Failed to create WebSocket connection to ${normalizedUrl}. Убедитесь, что сервер запущен: npm run server`
                        : `Failed to create WebSocket connection to ${normalizedUrl}`;
                    logger.error("[Multiplayer] Critical error creating WebSocket:", {
                        error: wsError,
                        url: normalizedUrl,
                        hint: errorMessage
                    });
                }
                this.isConnecting = false;
                // Dispatch error event so UI shows something only if manually initiated or max retries
                if (this.reconnectAttempts === 0) {
                    const toastMessage = isLocalhost
                        ? "Не удалось подключиться к серверу. Запустите сервер: npm run server"
                        : "Не удалось подключиться к серверу";
                    this.dispatchToast(toastMessage, "error");
                    window.dispatchEvent(new CustomEvent('tx:connection-lost', {
                        detail: { code: 1006, reason: 'Failed to create WebSocket connection', url: normalizedUrl }
                    }));
                }

                // Retry logic needs to happen here too if creation fails immediately
                if (!this.isManualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this._scheduleReconnect();
                }
                return;
            }

            // Set connection timeout (10 seconds)
            this.connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    logger.warn("[Multiplayer] Connection timeout - server may still be starting");
                    this.isConnecting = false;
                    try {
                        this.ws.close();
                    } catch (e) { /* ignore */ }
                    this.ws = null;

                    // Trigger reconnection if not manual disconnect
                    if (!this.isManualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this._scheduleReconnect();
                    }
                }
            }, 10000);

            this.ws.onopen = async () => {
                // Clear connection timeout
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }

                logger.log("[Multiplayer] Connected to server");
                this.dispatchToast("Connected to server", "success");

                this.connected = true;
                this.isConnecting = false;
                // Reset reconnect state on successful connection
                this.resetReconnectAttempts();
                this.isManualDisconnect = false; // Reset manual disconnect flag on successful connection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }

                try {
                    await this.sendConnect();
                } catch (e) {
                    logger.error("[Multiplayer] Error sending connect handshake:", e);
                }

                // Process queued messages
                this.processMessageQueue();
            };

            this.ws.onmessage = (event) => {
                // Handle both string (JSON) and ArrayBuffer/Uint8Array (MessagePack)
                const data = event.data;
                this.handleMessage(data);
            };

            this.ws.onclose = (event) => {
                // Clear connection timeout
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }

                // logger.log("[Multiplayer] Disconnected from server", event.code, event.reason);
                this.connected = false;
                this.isConnecting = false;
                this.roomId = null;
                this._roomPlayersCount = 1; // Сбрасываем счетчик игроков
                this.networkPlayers.clear();

                // Stop ping measurement on disconnect
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }

                // Stop health check
                if (this.healthCheckInterval) {
                    clearInterval(this.healthCheckInterval);
                    this.healthCheckInterval = null;
                }

                // Stop metrics tracking
                if (this.metricsUpdateInterval) {
                    clearInterval(this.metricsUpdateInterval);
                    this.metricsUpdateInterval = null;
                }

                if (this.onDisconnectedCallback) {
                    this.onDisconnectedCallback();
                }

                // Dispatch a custom event for connection lost notification
                if (!this.isManualDisconnect) {
                    window.dispatchEvent(new CustomEvent('tx:connection-lost', {
                        detail: { code: event.code, reason: event.reason || 'Соединение потеряно' }
                    }));
                }

                // Handle different close codes
                const shouldReconnect = this.shouldReconnectOnClose(event.code);

                // Auto-reconnect if not manual disconnect, should reconnect, and not exceeded max attempts
                if (!this.isManualDisconnect && shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    // Only show this once at the end
                    this.dispatchToast("Connection lost. Max retries reached.", "error");
                    logger.error("[Multiplayer] Max reconnect attempts reached. Please reconnect manually.");
                } else if (!shouldReconnect) {
                    logger.log(`[Multiplayer] Not reconnecting due to close code: ${event.code}`);
                }
            };

            this.ws.onerror = (error) => {
                // Clear connection timeout on error
                if (this.connectionTimeout) {
                    clearTimeout(this.connectionTimeout);
                    this.connectionTimeout = null;
                }

                this.isConnecting = false;
                // Suppress excessive error logging for localhost, но логируем первую попытку
                if (!isLocalhost || this.reconnectAttempts === 0) {
                    const errorMessage = isLocalhost
                        ? `WebSocket connection failed to ${normalizedUrl}. Убедитесь, что сервер запущен: npm run server`
                        : `WebSocket connection failed to ${normalizedUrl}. Проверьте доступность сервера`;
                    logger.error("[Multiplayer] WebSocket error observed", {
                        url: normalizedUrl,
                        reconnectAttempts: this.reconnectAttempts,
                        isLocalhost,
                        error: error,
                        hint: errorMessage
                    });
                }
            };
        } catch (error) {
            this.isConnecting = false;
            logger.error("[Multiplayer] Failed to connect:", error);
        }
    }

    disconnect(): void {
        // Mark as manual disconnect to prevent auto-reconnect
        this.isManualDisconnect = true;
        this.isConnecting = false;

        // Stop ping measurement
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Clear connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.roomId = null;
        this._isRoomCreator = false;
        this._roomIsActive = false;
        this._roomPlayersCount = 1; // Сбрасываем счетчик игроков
        this.networkPlayers.clear();

        // Reset prediction state
        this.predictionState.predictedStates.clear();
        this.predictionState.confirmedSequence = -1;
        this.predictionState.lastServerState = null;
        this.currentSequence = 0;

        // Clear jitter buffer
        this.jitterBuffer = [];
        this.lastProcessedSequence = -1;
        // ОПТИМИЗАЦИЯ: Сниженный delay для минимального пинга (было 50ms)
        this.jitterBufferTargetDelay = 20;

        // Clear message queue
        this.messageQueue = [];

        // Cleanup Voice Chat
        getVoiceChatManager().cleanup();
    }

    /**
     * Complete cleanup - clears all resources including callbacks
     */
    cleanup(): void {
        logger.log("[Multiplayer] Performing complete cleanup");

        // Disconnect first
        this.disconnect();

        // Clear all callbacks
        this.onConnectedCallback = null;
        this.onDisconnectedCallback = null;
        this.onPlayerJoinedCallbacks = [];
        this.onPlayerLeftCallbacks = [];
        this.onGameStartCallback = null;
        this.onGameEndCallback = null;
        this.onPlayerStatesCallback = null;
        this.onProjectileSpawnCallback = null;
        this.onChatMessageCallback = null;
        this.onConsumablePickupCallback = null;
        this.onEnemyUpdateCallback = null;
        this.onSafeZoneUpdateCallback = null;
        this.onCTFFlagUpdateCallback = null;
        this.onPlayerKilledCallback = null;
        this.onPlayerDiedCallback = null;
        this.onPlayerDamagedCallback = null;
        this.onCTFFlagPickupCallback = null;
        this.onCTFFlagCaptureCallback = null;
        this.onQueueUpdateCallback = null;
        this.onMatchFoundCallback = null;
        this.onRoomCreatedCallback = null;
        this.onRoomJoinedCallback = null;
        this.onRoomListCallbacks = [];
        this.onOnlinePlayersListCallbacks = [];
        this.onOnlinePlayersListCallbacks = [];
        this.onErrorCallback = null;
        this.onRpcCallback = null;

        // Reset network metrics
        this.networkMetrics = {
            rtt: 0,
            jitter: 0,
            packetLoss: 0,
            lastPingTime: 0,
            pingHistory: [],
            drift: 0
        };

        logger.log("[Multiplayer] Cleanup complete");
    }

    /**
     * Reset state without clearing callbacks
     */
    reset(): void {
        logger.log("[Multiplayer] Resetting state");

        // Disconnect first
        this.disconnect();

        // Reset connection state
        this.isManualDisconnect = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this._reconnectDelay = 1000;

        // Reset network metrics
        this.networkMetrics = {
            rtt: 0,
            jitter: 0,
            packetLoss: 0,
            lastPingTime: 0,
            pingHistory: [],
            drift: 0
        };

        // Reset sequence numbers
        this.currentSequence = 0;
        this.pingSequence = 0;
        this.lastProcessedSequence = -1;

        // Reset jitter buffer
        // ОПТИМИЗАЦИЯ: Сниженный delay для минимального пинга (было 50ms)
        this.jitterBufferTargetDelay = 20;
        this.jitterBufferNeedsSort = false;

        logger.log("[Multiplayer] State reset complete");
    }

    /**
     * Get current state for debugging
     */
    getState(): {
        connected: boolean;
        isConnecting: boolean;
        roomId: string | null;
        gameMode: GameMode | null;
        reconnectAttempts: number;
        networkPlayersCount: number;
        jitterBufferSize: number;
        predictionStatesSize: number;
        messageQueueSize: number;
    } {
        return {
            connected: this.connected,
            isConnecting: this.isConnecting,
            roomId: this.roomId,
            gameMode: this.gameMode,
            reconnectAttempts: this.reconnectAttempts,
            networkPlayersCount: this.networkPlayers.size,
            jitterBufferSize: this.jitterBuffer.length,
            predictionStatesSize: this.predictionState.predictedStates.size,
            messageQueueSize: this.messageQueue.length
        };
    }

    private async sendConnect(): Promise<void> {
        try {
            // Получаем токен авторизации, если пользователь авторизован
            let idToken: string | null = null;
            try {
                if (firebaseService.isAuthenticated()) {
                    idToken = await firebaseService.getAuthToken();
                }
            } catch (error) {
                logger.warn("[Multiplayer] Failed to get auth token:", error);
            }

            // Validate player data before sending
            if (!this.playerId || !this.playerName) {
                logger.error("[Multiplayer] Cannot connect: invalid player data");
                return;
            }

            this.send(createClientMessage(ClientMessageType.CONNECT, {
                playerId: this.playerId,
                playerName: this.playerName,
                idToken: idToken || undefined // Отправляем только если есть
            }));
        } catch (error) {
            logger.error("[Multiplayer] Error in sendConnect:", error);
        }
    }

    private handleMessage(data: string | ArrayBuffer | Blob): void {
        try {
            // Convert Blob to ArrayBuffer if needed
            // Convert Blob to ArrayBuffer if needed
            if (data instanceof Blob) {
                // Проверяем размер Blob - если пустой, пропускаем
                if (data.size === 0) {
                    logger.warn("[Multiplayer] Received empty Blob, skipping");
                    return;
                }

                // Use FileReader which is often more robust than arrayBuffer() in some contexts
                const reader = new FileReader();
                reader.onload = () => {
                    if (reader.result instanceof ArrayBuffer) {
                        this.handleMessage(reader.result);
                    }
                };
                reader.onerror = () => {
                    logger.error("[Multiplayer] Error converting Blob to ArrayBuffer via FileReader");
                };
                reader.readAsArrayBuffer(data);

                return;
            }

            if (!data) {
                logger.warn("[Multiplayer] Received empty message data");
                return;
            }

            // Track received packets
            this.packetsReceived++;

            const message = deserializeMessage<ServerMessage>(data);

            if (!message || !message.type) {
                logger.warn("[Multiplayer] Received invalid message format");
                return;
            }

            // КРИТИЧНО: Обновляем lastPongTime при получении ЛЮБОГО сообщения от сервера
            // Это предотвращает ложные срабатывания checkConnectionHealth когда PLAYER_STATES приходят, но pong задерживается
            this.lastPongTime = Date.now();

            switch (message.type) {
                case ServerMessageType.CONNECTED:
                    this.handleConnected(message.data);
                    break;

                case ServerMessageType.ROOM_CREATED:
                    this.handleRoomCreated(message.data);
                    break;

                case ServerMessageType.ROOM_JOINED:
                    this.handleRoomJoined(message.data);
                    break;

                case ServerMessageType.ROOM_LIST:
                    this.handleRoomList(message.data);
                    break;

                case ServerMessageType.ONLINE_PLAYERS_LIST:
                    this.handleOnlinePlayersList(message.data);
                    break;

                case ServerMessageType.PLAYER_JOINED:
                    this.handlePlayerJoined(message.data);
                    break;

                case ServerMessageType.PLAYER_LEFT:
                    this.handlePlayerLeft(message.data);
                    break;

                case ServerMessageType.MATCH_FOUND:
                    this.handleMatchFound(message.data);
                    break;

                case ServerMessageType.QUEUE_UPDATE:
                    this.handleQueueUpdate(message.data);
                    break;

                case ServerMessageType.GAME_INVITE:
                    this.handleGameInvite(message.data);
                    break;

                case ServerMessageType.GAME_START:
                    this.handleGameStart(message.data);
                    break;

                case ServerMessageType.GAME_END:
                    this.handleGameEnd(message.data);
                    break;

                case ServerMessageType.PLAYER_STATES:
                    // Update game time from server
                    if (message.data.gameTime !== undefined) {
                        this._gameTime = message.data.gameTime;
                    }
                    this.handlePlayerStates(message.data);
                    break;

                case ServerMessageType.PROJECTILE_SPAWN:
                    this.handleProjectileSpawn(message.data);
                    break;

                case ServerMessageType.CHAT_MESSAGE:
                    this.handleChatMessage(message.data);
                    break;

                // Add handler for LOBBY_CHAT_MESSAGE
                case "LOBBY_CHAT_MESSAGE" as any:
                case (ServerMessageType as any).LOBBY_CHAT_MESSAGE:
                    this.handleLobbyChatMessage(message.data);
                    break;

                case ServerMessageType.CONSUMABLE_PICKUP:
                    this.handleConsumablePickup(message.data);
                    break;

                case ServerMessageType.CONSUMABLE_SPAWN:
                    this.handleConsumableSpawn(message.data);
                    break;

                case ServerMessageType.ENEMY_UPDATE:
                    this.handleEnemyUpdate(message.data);
                    break;

                case ServerMessageType.VOICE_OFFER:
                case ServerMessageType.VOICE_ANSWER:
                case ServerMessageType.VOICE_ICE_CANDIDATE:
                case ServerMessageType.VOICE_PLAYER_JOINED:
                case ServerMessageType.VOICE_PLAYER_LEFT:
                    // Route to Voice Chat Manager
                    getVoiceChatManager().handleSignalingMessage(message);
                    break;

                case ServerMessageType.VOICE_TALKING:
                    // Уведомление о том, что игрок говорит по радио
                    this.handleVoiceTalking(message.data);
                    break;

                case ServerMessageType.SAFE_ZONE_UPDATE:
                    this.handleSafeZoneUpdate(message.data);
                    break;

                case ServerMessageType.CTF_FLAG_UPDATE:
                    this.handleCTFFlagUpdate(message.data);
                    break;

                case ServerMessageType.PLAYER_KILLED:
                    this.handlePlayerKilled(message.data);
                    break;

                case ServerMessageType.PLAYER_DIED:
                    this.handlePlayerDied(message.data);
                    break;

                case ServerMessageType.PLAYER_RESPAWNED:
                    this.handlePlayerRespawned(message.data);
                    break;

                case ServerMessageType.PLAYER_PROFILE_UPDATED:
                    this.handlePlayerProfileUpdated(message.data);
                    break;


                case ServerMessageType.PLAYER_DAMAGED:
                    this.handlePlayerDamaged(message.data);
                    break;

                case ServerMessageType.CTF_FLAG_PICKUP:
                    this.handleCTFFlagPickup(message.data);
                    break;

                case ServerMessageType.CTF_FLAG_CAPTURE:
                    this.handleCTFFlagCapture(message.data);
                    break;

                case ServerMessageType.WALL_SPAWN:
                    this.handleWallSpawn(message.data);
                    break;

                case ServerMessageType.PONG:
                    this.handlePong(message.data);
                    break;

                case ServerMessageType.BATCH:
                    // Process batch of messages - unpack and handle each message
                    this.handleBatch(message.data);
                    break;

                case ServerMessageType.ERROR:
                    logger.error("[Multiplayer] Server error:", message.data);
                    this.handleError(message.data);
                    break;

                case ServerMessageType.PROJECTILE_SPAWN:
                    this.handleProjectileSpawn(message.data);
                    break;

                case ServerMessageType.PROJECTILE_UPDATE:
                    this.handleProjectileUpdate(message.data);
                    break;

                case ServerMessageType.PROJECTILE_HIT:
                    this.handleProjectileHit(message.data);
                    break;

                case ServerMessageType.WORLD_UPDATE:
                    this.handleWorldUpdate(message.data);
                    break;

                case ServerMessageType.RPC:
                    this.handleRpc(message.data);
                    break;

                default:
                    logger.warn(`[Multiplayer] Unknown message type: ${message.type}`);
            }
        } catch (error) {
            // Улучшенное логирование ошибок - только раз в 10 секунд для уменьшения спама
            const now = Date.now();
            if (!this._lastErrorLogTime || now - this._lastErrorLogTime > 10000) {
                logger.error("[Multiplayer] Error handling message:", error instanceof Error ? error.message : error);
                if (error instanceof Error && error.stack) {
                    logger.error("[Multiplayer] Stack:", error.stack);
                }
                this._lastErrorLogTime = now;
            }
        }
    }

    private handleConnected(data: ConnectedData): void {
        this.connected = true;

        // Синхронизация времени с сервером
        if ((data as any).serverTime) {
            this.serverTimeOffset = (data as any).serverTime - Date.now();
        }

        // Обновляем ID игрока с сервера (если сервер присвоил новый ID)
        const newPlayerId = data.playerId || this.playerId;
        if (newPlayerId !== this.playerId) {
            const STORAGE_KEY = "tx_player_id";
            try {
                localStorage.setItem(STORAGE_KEY, newPlayerId);
            } catch (error) {
                logger.warn("[Multiplayer] Не удалось сохранить новый ID в localStorage", error);
            }
        }
        this.playerId = newPlayerId;

        // Обновляем имя игрока с сервера
        if (data.playerName) {
            this.playerName = data.playerName;
            savePlayerName(data.playerName);
        }

        // Reset manual disconnect flag and reconnect attempts on successful connection
        this.isManualDisconnect = false;
        this.resetReconnectAttempts();

        // Start ping measurement
        this.startPingMeasurement();

        // Start metrics tracking
        this.startMetricsTracking();

        // Автоматически запрашиваем список комнат и игроков при подключении
        // Небольшая задержка, чтобы сервер успел обработать подключение
        setTimeout(() => {
            this.requestRoomList();
            this.getOnlinePlayers(); // Запрашиваем список игроков для лобби
        }, 500);

        if (this.onConnectedCallback) {
            this.onConnectedCallback();
        }
    }

    /**
     * Start periodic ping measurement
     */
    private startPingMeasurement(): void {
        // Clear existing ping interval if any
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        // Clear existing health check interval
        // ОПТИМИЗАЦИЯ: Очищаем таймер через TimerManager
        if (this.healthCheckTimerId) {
            timerManager.clear(this.healthCheckTimerId);
            this.healthCheckTimerId = null;
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Reset last pong time
        this.lastPongTime = Date.now();

        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval/setTimeout
        // Это снижает нагрузку на event loop и улучшает производительность
        this.pingTimerId = timerManager.setInterval(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendPing();
            }
        }, this.currentPingInterval);

        // Start health check (check every 2 seconds) через TimerManager
        this.healthCheckTimerId = timerManager.setInterval(() => {
            this.checkConnectionHealth();
        }, 2000);

        // Send initial ping (proper format: timestamp + sequence for RTT and server pong)
        this.sendPing();
    }

    /**
     * Check connection health based on pong responses
     */
    private checkConnectionHealth(): void {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }

        const now = Date.now();
        const timeSinceLastPong = now - this.lastPongTime;

        // If we haven't received a pong in the timeout period, consider connection dead
        if (timeSinceLastPong > this.pongTimeout) {
            logger.warn(`[Multiplayer] Connection appears dead - no pong received in ${timeSinceLastPong}ms`);

            // Close connection to trigger reconnection
            if (this.ws) {
                this.ws.close();
            }
        }
    }

    /**
     * Check if connection is alive
     */
    isAlive(): boolean {
        if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        const now = Date.now();
        const timeSinceLastPong = now - this.lastPongTime;

        // Connection is alive if we received a pong recently
        return timeSinceLastPong < this.pongTimeout;
    }

    /**
     * Send ping to server
     */
    private sendPing(): void {
        const sequence = ++this.pingSequence;
        const sendTime = Date.now();

        // КРИТИЧНО: Сохраняем время отправки локально по sequence
        // Это гарантирует корректный расчёт RTT независимо от часов сервера
        this.pingSendTimes.set(sequence, sendTime);

        // Очищаем старые записи (храним максимум 20 последних)
        if (this.pingSendTimes.size > 20) {
            const oldestSeq = Math.min(...this.pingSendTimes.keys());
            this.pingSendTimes.delete(oldestSeq);
        }

        const pingData: PingData = {
            timestamp: sendTime,
            sequence: sequence
        };

        this.send(createClientMessage(ClientMessageType.PING, pingData));
        this.networkMetrics.lastPingTime = sendTime;
    }

    /**
     * Handle pong from server and calculate RTT
     */
    private handlePong(data: PongData): void {
        const pongData = data as PongData;
        const currentTime = Date.now();

        // Update last pong time for health check
        this.lastPongTime = currentTime;

        // КРИТИЧНО: Вычисляем RTT используя ЛОКАЛЬНО сохранённое время отправки
        // Это работает корректно даже при расхождении часов клиента и сервера
        const sequence = pongData?.sequence;

        // Проверяем, что sequence валиден
        if (sequence === undefined || sequence === null) {
            // Игнорируем PONG без sequence (старый формат или ошибка сервера)
            return;
        }

        const sendTime = this.pingSendTimes.get(sequence);

        if (!sendTime) {
            // Если нет записи о времени отправки - игнорируем (старый или дубликат пакета)
            // Не логируем warning для undefined sequence, так как уже проверили выше
            return;
        }

        // Удаляем использованную запись
        this.pingSendTimes.delete(sequence);

        const rtt = currentTime - sendTime;

        // КРИТИЧНО: Жёсткая валидация RTT
        // RTT не может быть отрицательным или больше 5 секунд (реалистичный максимум для любой сети)
        if (rtt < 0) {
            logger.warn(`[Multiplayer] ⚠️ Negative RTT: ${rtt}ms (clock skew?), resetting to 50ms`);
            // При отрицательном RTT - сбрасываем на разумное значение
            this.networkMetrics.rtt = 50;
            return;
        }

        if (rtt > 5000) {
            logger.warn(`[Multiplayer] ⚠️ RTT too high: ${rtt}ms > 5000ms, capping to 500ms`);
            // При слишком высоком RTT - используем максимальное разумное значение
            // Это предотвращает "загрязнение" метрик абсурдными значениями
            this.networkMetrics.rtt = Math.min(this.networkMetrics.rtt, 500);
            return;
        }

        // Дополнительная проверка - если RTT подозрительно высокий (> 1000ms), 
        // используем меньший вес для EWMA
        const isSuspiciousRTT = rtt > 1000;

        // КРИТИЧНО: Обновляем синхронизацию времени с сервером из serverTime в pong
        // Используем плавное обновление (EWMA) чтобы избежать скачков
        // КРИТИЧНО: Обновляем синхронизацию времени с сервером из serverTime в pong
        // Используем NTP-подобную формулу: offset = serverTime - (clientTime - rtt/2)
        // newOffset = serverTime + rtt/2 - currentTime
        if ((pongData as any).serverTime) {
            const serverTime = (pongData as any).serverTime;
            const newOffset = serverTime + (rtt / 2) - currentTime;

            // Если это первое измерение (offset ~ 0), принимаем сразу
            if (Math.abs(this.serverTimeOffset) < 100) {
                this.serverTimeOffset = newOffset;
            } else {
                // Плавное обновление offset: 90% старое значение + 10% новое
                this.serverTimeOffset = this.serverTimeOffset * 0.9 + newOffset * 0.1;
            }
        }

        // Update RTT history (only for valid RTT values)
        if (!isSuspiciousRTT) {
            this.networkMetrics.pingHistory.push(rtt);
            if (this.networkMetrics.pingHistory.length > 60) {
                this.networkMetrics.pingHistory.shift();
            }
        }

        // ОПТИМИЗАЦИЯ: Улучшенное вычисление RTT с адаптивным alpha на основе jitter
        // Более агрессивное обновление при высоком jitter для быстрой реакции на изменения
        const jitterRatio = this.networkMetrics.jitter / Math.max(this.networkMetrics.rtt, 1);
        let alpha = isSuspiciousRTT ? 0.05 : 0.125;

        // Адаптивный alpha: при высоком jitter используем более агрессивное обновление
        if (jitterRatio > 0.3) {
            alpha = isSuspiciousRTT ? 0.1 : 0.2; // Более агрессивное обновление при нестабильной сети
        }

        // ОПТИМИЗАЦИЯ: Медианный фильтр для устранения выбросов
        let rttToUse = rtt;
        if (this.networkMetrics.pingHistory.length >= 3) {
            const sorted = [...this.networkMetrics.pingHistory].sort((a, b) => a - b);
            const medianIndex = Math.floor(sorted.length / 2);
            const median = sorted[medianIndex];
            // Используем median если текущий RTT сильно отличается (выброс)
            if (median !== undefined && Math.abs(rtt - median) > median * 0.5) {
                rttToUse = median; // Используем медиану вместо выброса
            }
        }

        this.networkMetrics.rtt = (1 - alpha) * this.networkMetrics.rtt + alpha * rttToUse;

        // Calculate jitter (variation in RTT)
        if (this.networkMetrics.pingHistory.length >= 2) {
            const variations: number[] = [];
            for (let i = 1; i < this.networkMetrics.pingHistory.length; i++) {
                const current = this.networkMetrics.pingHistory[i];
                const previous = this.networkMetrics.pingHistory[i - 1];
                if (current !== undefined && previous !== undefined) {
                    variations.push(Math.abs(current - previous));
                }
            }
            // ОПТИМИЗАЦИЯ: Заменяем reduce на обычный цикл
            if (variations.length > 0) {
                let sumVariations = 0;
                for (let i = 0; i < variations.length; i++) {
                    const variation = variations[i];
                    if (variation !== undefined) {
                        sumVariations += variation;
                    }
                }
                this.networkMetrics.jitter = sumVariations / variations.length;
            }
        }

        // OPTIMIZATION: Calculate adaptive ping interval based on connection quality
        // High jitter = more frequent pings (better monitoring)
        // Low jitter = less frequent pings (reduce overhead)
        // Note: jitterRatio already calculated above at line 1360
        if (jitterRatio > 0.3) {
            // Unstable connection: ping more frequently
            this.currentPingInterval = this.PING_INTERVAL_MIN;
        } else if (jitterRatio > 0.1) {
            // Moderate instability: use base interval
            this.currentPingInterval = this.PING_INTERVAL_BASE;
        } else {
            // Stable connection: ping less frequently
            this.currentPingInterval = this.PING_INTERVAL_MAX;
        }
    }

    /**
     * Start metrics tracking
     */
    private startMetricsTracking(): void {
        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
        if (this.metricsTimerId) {
            timerManager.clear(this.metricsTimerId);
        }

        // Update metrics every second через TimerManager
        this.metricsTimerId = timerManager.setInterval(() => {
            this.updateMetrics();
        }, 1000);

        this.lastMetricsUpdate = Date.now();
    }

    /**
     * Update network metrics
     */
    private updateMetrics(): void {
        const now = Date.now();
        const elapsed = (now - this.lastMetricsUpdate) / 1000; // seconds

        if (elapsed > 0) {
            // Calculate packets per second
            const packetsSentPerSecond = this.packetsSent / elapsed;
            const packetsReceivedPerSecond = this.packetsReceived / elapsed;

            // [Opus 4.6] Store history (keep last 10 seconds, hard limit 100 entries)
            this.packetsSentHistory.push({ timestamp: now, count: packetsSentPerSecond });
            this.packetsReceivedHistory.push({ timestamp: now, count: packetsReceivedPerSecond });
            if (this.packetsSentHistory.length > 100) this.packetsSentHistory.splice(0, this.packetsSentHistory.length - 100);
            if (this.packetsReceivedHistory.length > 100) this.packetsReceivedHistory.splice(0, this.packetsReceivedHistory.length - 100);

            // Remove old history entries (older than 10 seconds)
            // ОПТИМИЗАЦИЯ: Заменяем filter на обычный цикл для лучшей производительности
            const historyThreshold = now - 10000;
            const newSentHistory: typeof this.packetsSentHistory = [];
            for (let i = 0; i < this.packetsSentHistory.length; i++) {
                const entry = this.packetsSentHistory[i];
                if (entry !== undefined && entry.timestamp > historyThreshold) {
                    newSentHistory.push(entry);
                }
            }
            this.packetsSentHistory = newSentHistory;

            const newReceivedHistory: typeof this.packetsReceivedHistory = [];
            for (let i = 0; i < this.packetsReceivedHistory.length; i++) {
                const entry = this.packetsReceivedHistory[i];
                if (entry !== undefined && entry.timestamp > historyThreshold) {
                    newReceivedHistory.push(entry);
                }
            }
            this.packetsReceivedHistory = newReceivedHistory;

            // ОПТИМИЗАЦИЯ: Заменяем reduce на обычный цикл для лучшей производительности
            let sumSent = 0;
            for (let i = 0; i < this.packetsSentHistory.length; i++) {
                const entry = this.packetsSentHistory[i];
                if (entry !== undefined) {
                    sumSent += entry.count;
                }
            }
            const avgSent = this.packetsSentHistory.length > 0 ? sumSent / this.packetsSentHistory.length : 0;

            let sumReceived = 0;
            for (let i = 0; i < this.packetsReceivedHistory.length; i++) {
                const entry = this.packetsReceivedHistory[i];
                if (entry !== undefined) {
                    sumReceived += entry.count;
                }
            }
            const avgReceived = this.packetsReceivedHistory.length > 0 ? sumReceived / this.packetsReceivedHistory.length : 0;

            // Estimate packet loss based on ping history (simplified)
            // ОПТИМИЗАЦИЯ: Заменяем reduce на обычный цикл для лучшей производительности
            if (this.networkMetrics.pingHistory.length > 0) {
                let sumRTT = 0;
                for (let i = 0; i < this.networkMetrics.pingHistory.length; i++) {
                    const rtt = this.networkMetrics.pingHistory[i];
                    if (rtt !== undefined) {
                        sumRTT += rtt;
                    }
                }
                const avgRTT = sumRTT / this.networkMetrics.pingHistory.length;
                // Higher RTT and jitter might indicate packet loss
                const estimatedLoss = Math.min(100, Math.max(0, (this.networkMetrics.jitter / avgRTT) * 10));
                this.networkMetrics.packetLoss = estimatedLoss;
            }

            // Reset counters
            this.packetsSent = 0;
            this.packetsReceived = 0;
            this.lastMetricsUpdate = now;
        }
    }

    /**
     * Get current network metrics
     */
    getNetworkMetrics(): NetworkMetrics {
        return { ...this.networkMetrics };
    }

    /**
     * Get connection quality score (0-100)
     */
    getConnectionQuality(): number {
        const rtt = this.networkMetrics.rtt;
        const jitter = this.networkMetrics.jitter;
        const packetLoss = this.networkMetrics.packetLoss;

        // Calculate quality score based on RTT, jitter, and packet loss
        // Lower is better for all metrics
        let score = 100;

        // RTT penalty (ideal: <50ms, bad: >200ms)
        if (rtt > 200) score -= 30;
        else if (rtt > 100) score -= 15;
        else if (rtt > 50) score -= 5;

        // Jitter penalty (ideal: <10ms, bad: >50ms)
        if (jitter > 50) score -= 20;
        else if (jitter > 20) score -= 10;
        else if (jitter > 10) score -= 5;

        // Packet loss penalty (ideal: 0%, bad: >5%)
        if (packetLoss > 5) score -= 25;
        else if (packetLoss > 2) score -= 10;
        else if (packetLoss > 0.5) score -= 5;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get current RTT
     */
    getRTT(): number {
        return this.networkMetrics.rtt;
    }

    /**
     * Get server time (client time + offset)
     * Use this for all timestamps sent to server to avoid "timestamp in future" errors
     */
    getServerTime(): number {
        return Date.now() + this.serverTimeOffset;
    }

    /**
     * Get server time offset for debugging
     */
    getServerTimeOffset(): number {
        return this.serverTimeOffset;
    }

    /**
     * Get packets per second (sent and received)
     */
    getPacketsPerSecond(): { sent: number; received: number } {
        const sentEntry = this.packetsSentHistory[this.packetsSentHistory.length - 1];
        const receivedEntry = this.packetsReceivedHistory[this.packetsReceivedHistory.length - 1];
        const sent = sentEntry?.count ?? 0;
        const received = receivedEntry?.count ?? 0;
        return { sent, received };
    }

    private onWorldUpdateCallback: ((data: WorldUpdate) => void) | null = null;

    onWorldUpdate(callback: (data: WorldUpdate) => void) {
        this.onWorldUpdateCallback = callback;
    }

    private handleWorldUpdate(data: WorldUpdate): void {
        if (this.onWorldUpdateCallback) {
            this.onWorldUpdateCallback(data);
        }
    }

    private handleRoomCreated(data: RoomCreatedData): void {
        const oldRoomId = this.roomId;
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        this._isRoomCreator = data.isCreator ?? true; // По умолчанию создатель, если не указано
        // При создании комнаты в ней только текущий игрок
        this._roomPlayersCount = 1;

        // КРИТИЧНО: Обновляем синхронизацию времени с сервером
        if ((data as any).serverTime) {
            this.serverTimeOffset = (data as any).serverTime - Date.now();
            logger.log(`[Multiplayer] 🕐 Server time offset updated in ROOM_CREATED: ${this.serverTimeOffset}ms`);
        }

        // КРИТИЧНО: Сохраняем mapType для использования до получения GAME_START
        if (data.mapType) {
            this.pendingMapType = data.mapType;
            logger.log(`[Multiplayer] 🗺️ Room created with mapType: ${data.mapType}`);
        }

        // Сохраняем worldSeed если есть
        if (data.worldSeed !== undefined) {
            this.worldSeed = data.worldSeed;
        }

        logger.log(`[Multiplayer] Room created: ${this.roomId}, mode: ${data.mode}, players: ${this._roomPlayersCount}`);
        if (this.onRoomCreatedCallback) {
            this.onRoomCreatedCallback(data);
        }
    }

    private handleRoomJoined(data: RoomJoinedData): void {
        const oldRoomId = this.roomId;
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        this._isRoomCreator = data.isCreator ?? false;
        this._roomIsActive = data.isActive ?? false; // Сохраняем статус активности комнаты

        // КРИТИЧНО: Обновляем синхронизацию времени с сервером
        if ((data as any).serverTime) {
            this.serverTimeOffset = (data as any).serverTime - Date.now();
            logger.log(`[Multiplayer] 🕐 Server time offset updated in ROOM_JOINED: ${this.serverTimeOffset}ms`);
        }

        // Store world seed for deterministic generation
        if (data.worldSeed !== undefined) {
            this.worldSeed = data.worldSeed;
        }

        // КРИТИЧНО: Сохраняем mapType для использования до получения GAME_START
        if (data.mapType) {
            this.pendingMapType = data.mapType;
            logger.log(`[Multiplayer] 🗺️ Room joined with mapType: ${data.mapType}`);
        }

        // КРИТИЧНО: Обновляем точное количество игроков из данных сервера
        if (data.players && Array.isArray(data.players)) {
            this._roomPlayersCount = data.players.length;
            logger.log(`[Multiplayer] 📊 Обновлено количество игроков в комнате: ${this._roomPlayersCount} (из данных сервера)`);
        } else {
            // Fallback: если данных нет, используем networkPlayers + 1
            this._roomPlayersCount = this.networkPlayers.size + 1;
            logger.warn(`[Multiplayer] ⚠️ Данные о количестве игроков не получены, используем fallback: ${this._roomPlayersCount}`);
        }

        // Initialize network players
        if (data.players) {
            for (const playerData of data.players) {
                if (playerData.id !== this.playerId) {
                    this.addNetworkPlayer(playerData);
                }
            }
        }

        logger.log(`[Multiplayer] Joined room: ${this.roomId}, seed: ${data.worldSeed}, isCreator: ${this._isRoomCreator}, isActive: ${this._roomIsActive}`);
        // Выводим номер комнаты в консоль с форматированием
        // КРИТИЧНО: Сохраняем данные в буфер на случай, если callback еще не установлен
        this.pendingRoomJoinedData = data;

        // Notify callback if set
        if (this.onRoomJoinedCallback) {
            this.onRoomJoinedCallback(data);
            this.pendingRoomJoinedData = null; // Clear buffer after successful call
        } else {
            logger.log("[Multiplayer] Room joined but no callback set, saving data");
            this.pendingRoomJoinedData = data; // Keep data in buffer for later
            logger.log(`[Multiplayer] ⏳ onRoomJoinedCallback еще не установлен, сохраняем данные для последующего вызова (roomId=${this.roomId}, players=${data.players?.length || 0})`);
        }

        // Initialize Voice Chat
        // We do this after successful room join
        getVoiceChatManager().initialize(data.roomId, this.playerId).then(success => {
            if (success) {
                logger.log("[Multiplayer] Voice Chat initialized");

                // Set handler for sending voice messages via game connection
                getVoiceChatManager().setMessageSender((type: string, data: any) => {
                    // Type strings (e.g. "voice_offer") match ClientMessageType values
                    this.send(createClientMessage(type as ClientMessageType, data));
                });
            } else {
                logger.warn("[Multiplayer] Voice Chat failed to initialize");
            }
        });
    }

    private handleRoomList(data: { rooms: RoomData[] }): void {
        const rooms = data.rooms || [];
        logger.log(`[Multiplayer] 📋 Получен список комнат: ${rooms.length} комнат`);
        if (rooms.length > 0) {
            rooms.forEach((room: RoomData) => {
                logger.log(`[Multiplayer]   - Комната ${room.id}: ${room.mode}, игроков ${room.players}/${room.maxPlayers}, активна=${room.isActive}`);
            });
        } else {
            logger.log(`[Multiplayer]   Нет доступных комнат`);
        }

        if (this.onRoomListCallbacks.length > 0) {
            logger.log(`[Multiplayer] ✅ Вызываем ${this.onRoomListCallbacks.length} callback(ов) для обновления UI`);
            this.onRoomListCallbacks.forEach(callback => {
                try {
                    callback(rooms);
                } catch (error) {
                    logger.error(`[Multiplayer] Ошибка в callback для списка комнат:`, error);
                }
            });
        } else {
            logger.warn(`[Multiplayer] ⚠️ Callback для списка комнат не настроен! Попытка автоматической настройки...`);

            // Попытка автоматически настроить callback через gameInstance
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const game = (window as any).gameInstance;
                if (game?.mainMenu && typeof game.mainMenu.updateRoomList === 'function') {
                    logger.log(`[Multiplayer] ✅ Найден mainMenu, настраиваем callback автоматически`);
                    this.onRoomList((rooms: RoomData[]) => {
                        if (game.mainMenu && typeof game.mainMenu.updateRoomList === 'function') {
                            game.mainMenu.updateRoomList(rooms);
                        }
                    });
                    // Вызываем callback сразу с текущими данными
                    if (this.onRoomListCallbacks.length > 0) {
                        this.onRoomListCallbacks.forEach(callback => {
                            try {
                                callback(rooms);
                            } catch (error) {
                                logger.error(`[Multiplayer] Ошибка в callback для списка комнат:`, error);
                            }
                        });
                    }
                } else if (game?.gameMultiplayerCallbacks) {
                    logger.log(`[Multiplayer] ✅ Найден gameMultiplayerCallbacks, пытаемся настроить через него`);
                    // Попробуем настроить через GameMultiplayerCallbacks
                    const callbacks = game.gameMultiplayerCallbacks;
                    if (callbacks.deps?.mainMenu && typeof callbacks.deps.mainMenu.updateRoomList === 'function') {
                        this.onRoomList((rooms: RoomData[]) => {
                            if (callbacks.deps?.mainMenu && typeof callbacks.deps.mainMenu.updateRoomList === 'function') {
                                callbacks.deps.mainMenu.updateRoomList(rooms);
                            }
                        });
                        // Вызываем callback сразу с текущими данными
                        if (this.onRoomListCallbacks.length > 0) {
                            this.onRoomListCallbacks.forEach(callback => {
                                try {
                                    callback(rooms);
                                } catch (error) {
                                    logger.error(`[Multiplayer] Ошибка в callback для списка комнат:`, error);
                                }
                            });
                        }
                    } else {
                        logger.warn(`[Multiplayer] ⚠️ mainMenu не доступен в gameMultiplayerCallbacks`);
                    }
                } else {
                    logger.warn(`[Multiplayer] ⚠️ gameInstance или mainMenu не найдены`);
                }
            } catch (error) {
                logger.error(`[Multiplayer] ❌ Ошибка при автоматической настройке callback:`, error);
            }

            if (this.onRoomListCallbacks.length === 0) {
                logger.warn(`[Multiplayer] 💡 Подсказка: откройте меню мультиплеера, чтобы настроить callback вручную`);
            }
        }
    }

    private handleOnlinePlayersList(data: OnlinePlayersListData): void {
        const players = data.players || [];
        logger.log(`[Multiplayer] 👥 Получен список игроков онлайн: ${players.length} игроков`);
        if (players.length > 0) {
            players.forEach((player) => {
                logger.log(`[Multiplayer]   - ${player.name} (${player.id})${player.isInRoom ? ` в комнате ${player.roomId} (${player.roomMode})` : ' (в лобби)'}`);
            });
        } else {
            logger.log(`[Multiplayer]   Нет игроков онлайн`);
        }

        if (this.onOnlinePlayersListCallbacks.length > 0) {
            logger.log(`[Multiplayer] ✅ Вызываем ${this.onOnlinePlayersListCallbacks.length} callback(ов) для обновления лобби`);
            this.onOnlinePlayersListCallbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    logger.error(`[Multiplayer] Ошибка в callback для списка игроков:`, error);
                }
            });
        } else {
            logger.warn(`[Multiplayer] ⚠️ Callback для списка игроков не настроен!`);
        }
    }

    private handlePlayerJoined(data: { player: PlayerData }): void {
        if (!data || !data.player) {
            logger.warn("[Multiplayer] Invalid player joined data");
            return;
        }

        const player = data.player;
        if (!player.id || typeof player.id !== 'string') {
            logger.warn("[Multiplayer] Invalid player ID in player joined");
            return;
        }

        if (player.id !== this.playerId) {
            // Проверяем, был ли это новый игрок ДО добавления
            const wasNewPlayer = !this.networkPlayers.has(player.id);
            this.addNetworkPlayer(player);
            // Увеличиваем счетчик игроков только если это новый игрок
            if (wasNewPlayer) {
                this._roomPlayersCount = this.networkPlayers.size + 1;
                logger.log(`[Multiplayer] 📊 Игрок присоединился: ${player.name}, теперь в комнате: ${this._roomPlayersCount}`);
            }
            // Notify all callbacks
            this.onPlayerJoinedCallbacks.forEach(cb => {
                try { cb(player); } catch (e) { logger.error("[Multiplayer] Error in onPlayerJoined callback", e); }
            });

            // ИСПРАВЛЕНО: Автоматически обновляем список комнат при входе игрока
            if (this.connected) {
                setTimeout(() => {
                    this.requestRoomList();
                }, 300);
            }
        }
    }

    private handlePlayerLeft(data: { playerId: string }): void {
        if (!data) {
            logger.warn("[Multiplayer] Invalid player left data");
            return;
        }

        const playerId = data.playerId;
        if (!playerId || typeof playerId !== 'string') {
            logger.warn("[Multiplayer] Invalid player ID in player left");
            return;
        }

        // Remove player efficiently
        const removed = this.networkPlayers.delete(playerId);
        if (removed) {
            // Уменьшаем счетчик игроков
            this._roomPlayersCount = Math.max(1, this._roomPlayersCount - 1);
            logger.log(`[Multiplayer] 📊 Игрок вышел: ${playerId}, теперь в комнате: ${this._roomPlayersCount}`);

            // Notify all callbacks
            this.onPlayerLeftCallbacks.forEach(cb => {
                try { cb(playerId); } catch (e) { logger.error("[Multiplayer] Error in onPlayerLeft callback", e); }
            });

            // ИСПРАВЛЕНО: Автоматически обновляем список комнат при выходе игрока
            if (this.connected) {
                setTimeout(() => {
                    this.requestRoomList();
                }, 300);
            }
        } else if (playerId === this.playerId) {
            // Если вышел текущий игрок, сбрасываем счетчик
            this._roomPlayersCount = 1;
        }
    }

    /**
     * Clean up inactive network players (players not updated recently)
     */
    private cleanupInactivePlayers(maxAge: number = 10000): void {
        const now = Date.now();
        const playersToRemove: string[] = [];

        // Note: We don't track last update time per player currently
        // This is a placeholder for future optimization
        // For now, we rely on server sending PLAYER_LEFT messages
    }

    /**
     * Handle player respawn message from server
     */
    private handlePlayerRespawned(data: any): void {
        logger.log(`[Multiplayer] Player respawned: ${data.playerName || data.playerId}`);

        // Dispatch to registered callback
        if (this.onPlayerRespawnedCallback) {
            try {
                this.onPlayerRespawnedCallback(data);
            } catch (error) {
                logger.error("[Multiplayer] Error in playerRespawned callback:", error);
            }
        }
    }

    private handlePlayerProfileUpdated(data: PlayerProfileUpdatedData): void {
        const { playerId, playerName } = data;

        // Update network player
        const player = this.networkPlayers.get(playerId);
        if (player) {
            player.name = playerName;
            logger.log(`[Multiplayer] Player ${playerId} changed name to ${playerName}`);

            // Re-add to ensure any UI components update?
            // Usually UI reads from networkPlayers reference.
        }

        // Update local player if it's us (confirmation from server)
        if (playerId === this.playerId) {
            this.playerName = playerName;
            savePlayerName(playerName);
        }

        // Notify UI components
        window.dispatchEvent(new CustomEvent('tx:player-profile-updated', {
            detail: { playerId, playerName }
        }));
    }

    private handleMatchFound(data: MatchFoundData): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        logger.log(`[Multiplayer] Match found: ${this.roomId}`);
        if (this.onMatchFoundCallback) {
            this.onMatchFoundCallback(data);
        }
    }

    private handleQueueUpdate(data: QueueUpdateData): void {
        if (this.onQueueUpdateCallback) {
            this.onQueueUpdateCallback(data);
        }
    }

    private handleGameInvite(data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }): void {
        logger.log(`[Multiplayer] Received game invite from ${data.fromPlayerName} (${data.fromPlayerId})`);
        if (this.onGameInviteCallback) {
            this.onGameInviteCallback(data);
        }
    }

    private handleError(data: ErrorData): void {
        if (this.onErrorCallback) {
            this.onErrorCallback(data);
        }
    }

    /**
     * Handle batch message - unpack and process each contained message
     * Batch messages reduce network overhead by grouping multiple updates
     */
    private handleBatch(data: { updates: Array<{ type: ServerMessageType; data: any }>; timestamp: number }): void {
        if (!data.updates || !Array.isArray(data.updates)) {
            logger.warn("[Multiplayer] Invalid batch message: missing updates array");
            return;
        }

        // Process each message in the batch
        for (const update of data.updates) {
            if (!update.type) continue;

            // Create a temporary message object and process it
            const message: ServerMessage = {
                type: update.type,
                data: update.data,
                timestamp: data.timestamp
            };

            // Call the appropriate handler based on type
            try {
                switch (update.type) {
                    case ServerMessageType.PROJECTILE_UPDATE:
                        // Projectile update - forward to callback if set
                        // Note: This would need a callback to be added
                        break;

                    case ServerMessageType.ENEMY_UPDATE:
                        this.handleEnemyUpdate(update.data);
                        break;

                    case ServerMessageType.SAFE_ZONE_UPDATE:
                        this.handleSafeZoneUpdate(update.data);
                        break;

                    case ServerMessageType.CTF_FLAG_UPDATE:
                        this.handleCTFFlagUpdate(update.data);
                        break;

                    case ServerMessageType.CTF_FLAG_PICKUP:
                        this.handleCTFFlagPickup(update.data);
                        break;

                    case ServerMessageType.CTF_FLAG_CAPTURE:
                        this.handleCTFFlagCapture(update.data);
                        break;

                    default:
                        logger.warn(`[Multiplayer] Unknown batch message type: ${update.type}`);
                }
            } catch (error) {
                logger.error(`[Multiplayer] Error handling batch message type ${update.type}:`, error);
            }
        }
    }

    private handleGameStart(data: GameStartData): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        this._roomIsActive = true; // Игра началась, комната активна

        // КРИТИЧНО: Обновляем синхронизацию времени с сервером
        if ((data as any).serverTime) {
            this.serverTimeOffset = (data as any).serverTime - Date.now();
            logger.log(`[Multiplayer] 🕐 Server time offset updated in GAME_START: ${this.serverTimeOffset}ms`);
        }

        // ДИАГНОСТИКА: Проверяем наличие mapType
        if (data.mapType) {
            logger.log(`[Multiplayer] 🗺️ GAME_START received mapType: ${data.mapType}`);
            // КРИТИЧНО: Обновляем pendingMapType из GAME_START (имеет приоритет над ROOM_CREATED)
            this.pendingMapType = data.mapType;
        } else {
            logger.warn(`[Multiplayer] ⚠️ GAME_START received WITHOUT mapType! Keys: ${Object.keys(data).join(', ')}`);
        }

        // КРИТИЧНО: Логируем получение кастомной карты
        if (data.customMapData) {
            logger.log(`[Multiplayer] 📦 GAME_START received customMapData: ${data.customMapData.name || 'Unnamed'} (${JSON.stringify(data.customMapData).length} bytes)`);
        }

        // Store world seed for deterministic generation
        if (data.worldSeed !== undefined) {
            this.worldSeed = data.worldSeed;
        }

        // КРИТИЧНО: Обновляем счетчик игроков из данных GAME_START
        if (data.players && Array.isArray(data.players)) {
            this._roomPlayersCount = data.players.length;
            logger.log(`[Multiplayer] 📊 GAME_START: обновлено количество игроков: ${this._roomPlayersCount}`);
        }

        // Initialize all players
        if (data.players) {
            for (const playerData of data.players) {
                if (playerData.id !== this.playerId) {
                    this.addNetworkPlayer(playerData);
                } else {
                    // КРИТИЧНО: Сохраняем позицию спавна локального игрока от сервера
                    // Это особенно важно при присоединении к идущей игре
                    if (playerData.position) {
                        this._serverSpawnPosition = {
                            x: playerData.position.x,
                            y: playerData.position.y,
                            z: playerData.position.z
                        };
                        // КРИТИЧНЫЙ ЛОГ: Показываем что позиция спавна установлена
                        logger.log(`%c[Multiplayer] 📍 SPAWN POSITION SET: (${playerData.position.x.toFixed(1)}, ${playerData.position.y.toFixed(1)}, ${playerData.position.z.toFixed(1)})`, 'color: #22c55e; font-weight: bold; font-size: 14px;');
                    } else {
                        logger.warn(`%c[Multiplayer] ⚠️ LOCAL PLAYER HAS NO POSITION IN GAME_START!`, 'color: #ef4444; font-weight: bold; font-size: 14px;', playerData);
                    }
                }
            }
        }

        if (this.onGameStartCallback) {
            this.onGameStartCallback(data);
        }
    }

    private handleGameEnd(data: GameEndData): void {
        if (this.onGameEndCallback) {
            this.onGameEndCallback(data);
        }
    }

    private handlePlayerStates(data: any): void {
        const statesData = data as PlayerStatesData;
        const currentTime = Date.now();
        const serverSequence = statesData.serverSequence ?? -1;

        const playersCount = statesData.players?.length || 0;
        // ОПТИМИЗАЦИЯ: Заменяем filter на обычный цикл для лучшей производительности
        let networkPlayersCount = 0;
        if (statesData.players) {
            for (let i = 0; i < statesData.players.length; i++) {
                if (statesData.players[i]?.id !== this.playerId) {
                    networkPlayersCount++;
                }
            }
        }

        // Логируем при изменении количества игроков (только при реальном изменении, через logger, не console)
        if (networkPlayersCount !== this.networkPlayers.size) {
            logger.log(`[Multiplayer] 📊 Изменение networkPlayers: ${this.networkPlayers.size} -> ${networkPlayersCount}, roomId=${this.roomId}`);
        }

        // КРИТИЧНО: Обновляем счетчик игроков из PLAYER_STATES (самый надежный источник)
        // PLAYER_STATES приходит 60 раз в секунду и содержит актуальный список всех игроков
        if (playersCount > 0 && this.roomId) {
            const oldCount = this._roomPlayersCount;
            this._roomPlayersCount = playersCount;
            // Логируем только при изменении, чтобы не засорять консоль
            if (oldCount !== playersCount) {
                logger.log(`[Multiplayer] 📊 PLAYER_STATES: обновлено количество игроков: ${oldCount} -> ${this._roomPlayersCount}`);
            }
        }

        // ДИАГНОСТИКА: Логируем критическую информацию для диагностики синхронизации
        // Логируем раз в секунду (каждые 60 пакетов при 60Hz) и только если включен debugSync
        const DEBUG_SYNC = (window as any).gameSettings?.debugSync || localStorage.getItem("debugSync") === "true";
        if (DEBUG_SYNC && (serverSequence % 60 === 0 || networkPlayersCount !== this.networkPlayers.size)) {
            logger.log(`[Multiplayer] 📊 PLAYER_STATES: players=${playersCount}, networkPlayers=${networkPlayersCount}, roomId=${this.roomId || 'N/A'}, worldSeed=${this.worldSeed || 'N/A'}, mapType=${this.pendingMapType || 'N/A'}, networkPlayers.size=${this.networkPlayers.size}`);
            if (networkPlayersCount > 0 && statesData.players) {
                // ОПТИМИЗАЦИЯ: Заменяем filter/map на обычный цикл для лучшей производительности
                const playerIds: string[] = [];
                for (let i = 0; i < statesData.players.length; i++) {
                    const p = statesData.players[i];
                    if (p && p.id !== this.playerId) {
                        playerIds.push(p.id || 'unknown');
                    }
                }
                logger.log(`[Multiplayer] 📊 Другие игроки в PLAYER_STATES: [${playerIds.join(', ')}]`);
            }
        }

        // КРИТИЧНО: Обработка полных состояний (isFullState)
        // Полные состояния отправляются каждые 60 пакетов (1 раз в секунду) для предотвращения
        // накопления ошибок квантования и дельта-компрессии
        const isFullState = statesData.isFullState === true;
        if (isFullState) {
            // При полном состоянии логируем для диагностики (раз в секунду)
            if (serverSequence % 60 === 0) {
                logger.log(`[Multiplayer] ✅ Полное состояние получено (isFullState=true) - сброс накопленных ошибок`);
            }
        }

        // КРИТИЧНО: В ранней фазе (первые 60 пакетов = 1 секунда) ПОЛНОСТЬЮ ОБХОДИМ jitter buffer
        // и обрабатываем данные НЕМЕДЛЕННО для гарантированного отображения игроков
        // Также обходим если есть другие игроки, но мы их еще не видим
        // КРИТИЧНО: Всегда обрабатываем немедленно, если в списке есть локальный игрок (для reconciliation)
        // КРИТИЧНО: Полные состояния также обрабатываем немедленно
        const hasLocalPlayer = statesData.players?.some((p: any) => p.id === this.playerId);
        if (this.lastProcessedSequence < 60 || (networkPlayersCount > 0 && this.networkPlayers.size === 0) || hasLocalPlayer || isFullState) {
            // Лишний спам убран: обход буфера без логов
            this.lastProcessedSequence = Math.max(this.lastProcessedSequence, serverSequence);
            this.applyPlayerStates(statesData);
            return;
        }

        // Add to jitter buffer
        this.jitterBuffer.push({
            data: statesData,
            timestamp: currentTime,
            sequence: serverSequence
        });

        // Mark buffer as needing sort
        this.jitterBufferNeedsSort = true;

        // Enforce maximum buffer size - remove oldest entries if exceeded
        if (this.jitterBuffer.length > this.jitterBufferMaxSize) {
            // Sort first to ensure we remove the oldest by sequence
            if (this.jitterBufferNeedsSort) {
                this.jitterBuffer.sort((a, b) => a.sequence - b.sequence);
                this.jitterBufferNeedsSort = false;
            }

            // Remove oldest entries (keep the newest ones)
            const removeCount = this.jitterBuffer.length - this.jitterBufferMaxSize;
            this.jitterBuffer.splice(0, removeCount);
            // Логируем overflow только если удалено много пакетов
            if (removeCount > 10) {
                logger.warn(`[Multiplayer] Jitter buffer overflow: removed ${removeCount} entries`);
            }
        }

        // Update target delay based on jitter
        this.updateJitterBufferDelay();

        // Process buffered updates
        this.processJitterBuffer(currentTime);
    }

    /**
     * Update jitter buffer target delay based on network conditions
     */
    private updateJitterBufferDelay(): void {
        if (this.networkMetrics.pingHistory.length < 2) {
            return;
        }

        // Calculate jitter as standard deviation of RTT
        // ОПТИМИЗАЦИЯ: Заменяем reduce на обычные циклы для лучшей производительности
        const rtts = this.networkMetrics.pingHistory;
        let sum = 0;
        for (let i = 0; i < rtts.length; i++) {
            const rtt = rtts[i];
            if (rtt !== undefined) {
                sum += rtt;
            }
        }
        const mean = rtts.length > 0 ? sum / rtts.length : 0;

        let varianceSum = 0;
        for (let i = 0; i < rtts.length; i++) {
            const rtt = rtts[i];
            if (rtt !== undefined) {
                varianceSum += Math.pow(rtt - mean, 2);
            }
        }
        const variance = varianceSum / rtts.length;
        const jitter = Math.sqrt(variance);
        this.networkMetrics.jitter = jitter;

        // Adaptive delay: base delay + (jitter * 2) for safety margin
        // ОПТИМИЗАЦИЯ: Снижен baseDelay с 30ms до 16ms для минимального пинга
        const baseDelay = 16; // ~1 кадр при 60fps
        this.jitterBufferTargetDelay = baseDelay + (jitter * 2);

        // ОПТИМИЗАЦИЯ: Снижены границы с 30-200ms до 16-150ms
        this.jitterBufferTargetDelay = Math.max(16, Math.min(150, this.jitterBufferTargetDelay));
    }

    /**
     * Process jitter buffer and apply updates in correct order
     * Handles out-of-order packets, packet loss, and adaptive timing
     */
    private processJitterBuffer(currentTime: number): void {
        // Sort buffer if needed (only when necessary)
        if (this.jitterBufferNeedsSort && this.jitterBuffer.length > 1) {
            this.jitterBuffer.sort((a, b) => a.sequence - b.sequence);
            this.jitterBufferNeedsSort = false;
        }

        // Remove old entries (older than 500ms are considered too stale)
        const staleThreshold = currentTime - 500;
        const validEntries: typeof this.jitterBuffer = [];
        const readyEntries: typeof this.jitterBuffer = [];

        // КРИТИЧНО: Первые 10 пакетов обрабатываем НЕМЕДЛЕННО без задержки
        // Это гарантирует, что игроки увидят друг друга сразу при подключении
        const isEarlyPhase = this.lastProcessedSequence < 10;

        for (const entry of this.jitterBuffer) {
            // Skip stale entries
            if (entry.timestamp < staleThreshold) {
                continue;
            }

            validEntries.push(entry);

            // КРИТИЧНО: В ранней фазе обрабатываем ВСЕ пакеты немедленно
            if (isEarlyPhase) {
                readyEntries.push(entry);
                continue;
            }

            // Check if entry is ready to process
            const age = currentTime - entry.timestamp;
            if (age >= this.jitterBufferTargetDelay) {
                readyEntries.push(entry);
            }
        }

        // Sort ready entries by sequence to ensure correct order
        if (readyEntries.length > 1) {
            readyEntries.sort((a, b) => a.sequence - b.sequence);
        }

        // Detect and handle packet loss
        if (readyEntries.length > 0 && this.lastProcessedSequence >= 0) {
            const nextExpectedSequence = this.lastProcessedSequence + 1;
            const oldestReadySequence = readyEntries[0]?.sequence ?? nextExpectedSequence;

            // If there's a gap in sequences (packet loss detected)
            if (oldestReadySequence > nextExpectedSequence) {
                const gapSize = oldestReadySequence - nextExpectedSequence;

                // If gap is small (1-3 packets), wait a bit more for late arrivals
                if (gapSize <= 3 && validEntries.length > 0) {
                    const waitTime = this.jitterBufferTargetDelay + (gapSize * 16); // Wait extra 16ms per missing packet
                    const oldestReady = readyEntries[0];
                    if (oldestReady && (currentTime - oldestReady.timestamp) < waitTime) {
                        // Don't process yet, wait for potential late packet
                        return;
                    }
                }

                // Gap too large or waited long enough - skip missing packets
                if (gapSize > 0) {
                    // Throttle packet loss logging - only log every 10 seconds or if gap is large
                    const shouldLogPacketLoss = gapSize > 10 || (currentTime - (this._lastPacketLossLogTime || 0)) > 10000;
                    if (shouldLogPacketLoss) {
                        logger.warn(`[Multiplayer] Packet loss: ${gapSize} packets skipped (seq ${nextExpectedSequence} to ${oldestReadySequence - 1})`);
                        this._lastPacketLossLogTime = currentTime;
                    }

                    // Track packet loss for metrics
                    const totalPackets = this.networkMetrics.pingHistory.length + gapSize;
                    this.networkMetrics.packetLoss = gapSize / Math.max(1, totalPackets);

                    // Increase jitter buffer delay on packet loss
                    this.jitterBufferTargetDelay = Math.min(200, this.jitterBufferTargetDelay + 10);
                }
            }
        }

        // Process ready entries in sequence order
        for (const entry of readyEntries) {
            // Skip if we already processed this sequence or newer
            if (entry.sequence <= this.lastProcessedSequence && entry.sequence >= 0) {
                continue;
            }

            // Handle out-of-order: if this packet is much newer than expected, 
            // it means we missed some packets - update lastProcessedSequence accordingly
            const expectedNext = this.lastProcessedSequence + 1;
            if (entry.sequence > expectedNext && this.lastProcessedSequence >= 0) {
                // Update packet loss metric
                const missed = entry.sequence - expectedNext;
                if (missed > 0) {
                    // Already logged above, just update sequence
                }
            }

            this.lastProcessedSequence = Math.max(this.lastProcessedSequence, entry.sequence);
            this.applyPlayerStates(entry.data);
        }

        // Update buffer with remaining valid entries
        // ОПТИМИЗАЦИЯ: Заменяем filter на обычный цикл для лучшей производительности
        const readySet = new Set(readyEntries);
        const remainingEntries: typeof this.jitterBuffer = [];
        for (let i = 0; i < validEntries.length; i++) {
            const entry = validEntries[i];
            if (entry !== undefined && !readySet.has(entry)) {
                remainingEntries.push(entry);
            }
        }
        this.jitterBuffer = remainingEntries;

        // Adaptive delay recovery: gradually reduce delay if no packet loss
        if (readyEntries.length > 0 && this.networkMetrics.packetLoss < 0.01) {
            // Slowly reduce delay back towards base
            const baseDelay = 30 + (this.networkMetrics.jitter * 2);
            if (this.jitterBufferTargetDelay > baseDelay) {
                this.jitterBufferTargetDelay = Math.max(baseDelay, this.jitterBufferTargetDelay - 1);
            }
        }
    }

    /**
     * Apply player states update (extracted from handlePlayerStates)
     */
    private applyPlayerStates(statesData: PlayerStatesData): void {
        // Фильтрация аномальных/подозрительных состояний игроков (простая защита от мусорных пакетов)
        // ОПТИМИЗАЦИЯ: Заменяем filter на обычный цикл для лучшей производительности
        const rawPlayers = statesData.players || [];
        const players: typeof rawPlayers = [];

        for (let i = 0; i < rawPlayers.length; i++) {
            const p = rawPlayers[i];
            if (!p || !p.position) {
                logger.warn(`[Multiplayer] Dropping player state: missing player or position for ${p?.id || 'unknown'}`);
                continue;
            }
            const { x, y, z } = p.position;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                logger.warn("[Multiplayer] Dropping player state with NaN/Infinity position", p.id);
                continue;
            }
            // Ограничение по радиусу карты (защита от телепортов далеко за пределы мира)
            const MAX_RADIUS = 10000;
            const MAX_HEIGHT = 2000;
            if (Math.abs(x) > MAX_RADIUS || Math.abs(z) > MAX_RADIUS || Math.abs(y) > MAX_HEIGHT) {
                logger.warn("[Multiplayer] Dropping player state with out-of-bounds position", p.id, p.position);
                continue;
            }
            players.push(p);
        }

        // ОПТИМИЗАЦИЯ: Логирование только в dev режиме
        if (ENABLE_DIAGNOSTIC_LOGS) {
            logger.log(`[Multiplayer] applyPlayerStates: ${players.length} players after filtering (dropped ${rawPlayers.length - players.length})`);
        }

        const gameTime = statesData.gameTime || 0;
        const serverSequence = statesData.serverSequence;

        // КРИТИЧНО: Очистка networkPlayers от локального игрока и игроков, которых нет в списке
        // ОПТИМИЗАЦИЯ: Используем Set для быстрой проверки, но создаем его через цикл вместо map/filter
        const validPlayerIds = new Set<string>();
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player !== undefined) {
                const playerId = player.id;
                if (playerId !== undefined && playerId !== this.playerId) {
                    validPlayerIds.add(playerId);
                }
            }
        }
        const playersToRemove: string[] = [];

        // ОПТИМИЗАЦИЯ: Используем for...of вместо forEach
        for (const [id, np] of this.networkPlayers) {
            // Удаляем локального игрока, если он попал в networkPlayers
            if (id === this.playerId) {
                playersToRemove.push(id);
                logger.warn(`[Multiplayer] ❌ Found local player (${id}) in networkPlayers! Removing...`);
            }
            // Удаляем игроков, которых нет в текущем списке (возможно, они отключились)
            // Strict AOI: Если это полное состояние, удаляем тех, кого нет в списке
            else if (statesData.isFullState && !validPlayerIds.has(id)) {
                playersToRemove.push(id);
                // logger.log(`[Multiplayer] 🗑️ Pruning AOI invisible player: ${id}`);
            }
        }

        // Удаляем найденных игроков
        // ОПТИМИЗАЦИЯ: Используем обычный цикл вместо forEach
        for (let i = 0; i < playersToRemove.length; i++) {
            const id = playersToRemove[i];
            if (id !== undefined) {
                this.networkPlayers.delete(id);
            }
            // ОПТИМИЗАЦИЯ: Логирование только в dev режиме
            if (ENABLE_DIAGNOSTIC_LOGS) {
                logger.log(`[Multiplayer] ✅ Removed invalid player ${id} from networkPlayers`);
            }
        }

        // ДИАГНОСТИКА: Логируем детальную информацию перед обработкой
        // ОПТИМИЗАЦИЯ: Используем цикл вместо find/filter
        let localPlayerInList: PlayerData | undefined = undefined;
        const networkPlayersInList: PlayerData[] = [];
        for (let i = 0; i < players.length; i++) {
            const p = players[i];
            if (p !== undefined) {
                if (p.id === this.playerId) {
                    localPlayerInList = p;
                } else {
                    networkPlayersInList.push(p);
                }
            }
        }
        const currentNetworkPlayersSize = this.networkPlayers.size;

        // Убрано для уменьшения спама в логах
        // logger.log(`%c[Multiplayer] 🔍 applyPlayerStates: Обработка игроков`, 'color: #3b82f6; font-weight: bold;', {
        //     totalPlayers: players.length,
        //     localPlayer: localPlayerInList ? `${localPlayerInList.name || localPlayerInList.id}(${localPlayerInList.id})` : 'NOT FOUND',
        //     networkPlayersInList: networkPlayersInList.map(p => `${p.name || p.id}(${p.id})`),
        //     currentNetworkPlayersSize: currentNetworkPlayersSize,
        //     localPlayerId: this.playerId,
        //     roomId: this.roomId
        // });

        // Find local player for reconciliation
        let localPlayerData: PlayerData | null = null;
        let addedCount = 0;
        let updatedCount = 0;

        for (const playerData of players) {
            if (playerData.id === this.playerId) {
                localPlayerData = playerData;
                // Perform reconciliation if we have server sequence
                if (serverSequence !== undefined) {
                    this.reconcileServerState(serverSequence, localPlayerData);
                }
                // КРИТИЧНО: НЕ добавляем локального игрока в networkPlayers
            } else {
                // Проверяем, есть ли уже игрок в networkPlayers
                const wasNew = !this.networkPlayers.has(playerData.id);

                // Обновляем или добавляем сетевого игрока
                this.updateNetworkPlayer(playerData, gameTime);

                if (wasNew) {
                    addedCount++;
                } else {
                    updatedCount++;
                }
            }
        }

        // Store last server state even if local player not found (for reconciliation)
        if (localPlayerData && serverSequence !== undefined) {
            this.predictionState.lastServerState = localPlayerData;
        }

        // ИСПРАВЛЕНИЕ: Сохраняем lastPlayerStates для использования в HUD
        // КРИТИЧНО: Сохраняем ДО вызова callback, чтобы данные были доступны даже если callback не настроен
        // КРИТИЧНО: Сохраняем ВСЕХ игроков, включая локального, для правильного отображения в HUD
        (this as any).lastPlayerStates = players;

        // ДИАГНОСТИКА: Логируем детальную информацию о сохраненных игроках
        // ОПТИМИЗАЦИЯ: Используем цикл вместо find/filter (уже вычислено выше)
        const savedLocalPlayer = localPlayerInList;
        const savedNetworkPlayers = networkPlayersInList;
        // logger.log(`[Multiplayer] applyPlayerStates: Saved ${players.length} players to lastPlayerStates:`);
        // logger.log(`  - Local player: ${savedLocalPlayer ? `YES (${savedLocalPlayer.name || savedLocalPlayer.id})` : 'NO'}`);
        // logger.log(`  - Network players: ${savedNetworkPlayers.length} (${savedNetworkPlayers.map(p => `${p.name || p.id}(${p.id})`).join(', ')})`);
        // logger.log(`[Multiplayer] applyPlayerStates: Processing ${players.length} players, callback set: ${!!this.onPlayerStatesCallback}, saved to lastPlayerStates`);

        if (this.onPlayerStatesCallback) {
            try {
                this.onPlayerStatesCallback(players, statesData.isFullState);
            } catch (error) {
                logger.error(`[Multiplayer] ❌ ОШИБКА в onPlayerStatesCallback:`, error);
            }
        }
    }



    private handleChatMessage(data: ChatMessageData): void {
        if (this.onChatMessageCallback) {
            this.onChatMessageCallback(data);
        }
    }

    private handleConsumablePickup(data: ConsumablePickupData): void {
        if (this.onConsumablePickupCallback) {
            this.onConsumablePickupCallback(data);
        }
    }

    private handleConsumableSpawn(data: any): void {
        if (this.onConsumableSpawnCallback) {
            this.onConsumableSpawnCallback(data);
        }
    }

    private handleEnemyUpdate(data: EnemyUpdateData): void {
        if (this.onEnemyUpdateCallback) {
            this.onEnemyUpdateCallback(data);
        }
    }

    private handleSafeZoneUpdate(data: SafeZoneUpdateData): void {
        if (this.onSafeZoneUpdateCallback) {
            this.onSafeZoneUpdateCallback(data);
        }
    }

    private handleCTFFlagUpdate(data: CTFFlagUpdateData): void {
        if (this.onCTFFlagUpdateCallback) {
            this.onCTFFlagUpdateCallback(data);
        }
    }

    private handlePlayerKilled(data: PlayerKilledData): void {
        if (this.onPlayerKilledCallback) {
            this.onPlayerKilledCallback(data);
        }
    }

    private handlePlayerDied(data: PlayerDiedData): void {
        if (this.onPlayerDiedCallback) {
            this.onPlayerDiedCallback(data);
        }
    }



    private handlePlayerDamaged(data: PlayerDamagedData): void {
        if (this.onPlayerDamagedCallback) {
            this.onPlayerDamagedCallback(data);
        }
    }

    private handleCTFFlagPickup(data: CTFFlagPickupData): void {
        if (this.onCTFFlagPickupCallback) {
            this.onCTFFlagPickupCallback(data);
        }
    }

    private handleCTFFlagCapture(data: CTFFlagCaptureData): void {
        if (this.onCTFFlagCaptureCallback) {
            this.onCTFFlagCaptureCallback(data);
        }
    }

    private addNetworkPlayer(playerData: PlayerData): void {
        // Validate player data
        if (!playerData || !playerData.id) {
            logger.warn("[Multiplayer] Cannot add network player: invalid player data");
            return;
        }

        // КРИТИЧНО: Защита от добавления локального игрока в networkPlayers
        // Это предотвращает создание сетевого танка для локального игрока (дублирование)
        // ИСПРАВЛЕНО: Используем только точное сравнение, чтобы избежать ложных срабатываний
        const isLocalPlayer = this.playerId && playerData.id === this.playerId;
        if (isLocalPlayer) {
            logger.warn(`[Multiplayer] ❌ Attempted to add local player to networkPlayers! playerData.id=${playerData.id}, this.playerId=${this.playerId}`);
            logger.warn(`%c[Multiplayer] ❌ BLOCKED: Попытка добавить локального игрока в networkPlayers!`, 'color: #ef4444; font-weight: bold;');
            return;
        }

        // КРИТИЧНО: Проверяем, не является ли это дубликатом
        if (this.networkPlayers.has(playerData.id)) {
            // Игрок уже есть - просто обновляем, не логируем (убрано для уменьшения спама)
            this.updateNetworkPlayer(playerData, 0);
            return;
        }

        // ДИАГНОСТИКА: Логируем только при реальном добавлении нового игрока (один раз)
        const oldSize = this.networkPlayers.size;
        logger.log(`[Multiplayer] ➕ Добавляю НОВОГО игрока: ${playerData.name || playerData.id} (${playerData.id}), roomId=${this.roomId}, было=${oldSize}`);

        // Check for NaN or Infinity - используем дефолтные значения если невалидны
        let x = 0, y = 2, z = 0;
        if (playerData.position &&
            typeof playerData.position.x === 'number' &&
            typeof playerData.position.y === 'number' &&
            typeof playerData.position.z === 'number' &&
            Number.isFinite(playerData.position.x) &&
            Number.isFinite(playerData.position.y) &&
            Number.isFinite(playerData.position.z)) {
            x = playerData.position.x;
            y = playerData.position.y;
            z = playerData.position.z;
        } else {
            logger.warn(`[Multiplayer] Invalid position for player ${playerData.id}, using default (0, 2, 0)`);
        }

        // Используем дефолтные значения для невалидных полей
        const rotation = Number.isFinite(playerData.rotation) ? playerData.rotation : 0;
        const turretRotation = Number.isFinite(playerData.turretRotation) ? playerData.turretRotation : 0;
        const aimPitch = Number.isFinite(playerData.aimPitch) ? playerData.aimPitch : 0;
        const health = Number.isFinite(playerData.health) ? playerData.health : 100;
        const maxHealth = Number.isFinite(playerData.maxHealth) ? playerData.maxHealth : 100;

        // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо new Vector3()
        const initialPos = vector3Pool.acquire(x, y, z);
        const lastPos1 = vector3Pool.acquire(x, y, z);
        const lastPos2 = vector3Pool.acquire(x, y, z);
        const lastPos3 = vector3Pool.acquire(x, y, z);
        const velocity = vector3Pool.acquire(0, 0, 0);

        const networkPlayer: NetworkPlayer = {
            id: playerData.id,
            name: playerData.name || "Unknown",
            position: initialPos, // Используем напрямую, не клонируем
            rotation: rotation,
            turretRotation: turretRotation,
            aimPitch: aimPitch,
            health: health,
            maxHealth: maxHealth,
            status: playerData.status || "alive", // КРИТИЧНО: По умолчанию "alive"
            team: playerData.team,
            kills: playerData.kills || 0,
            deaths: playerData.deaths || 0,
            // Tank customization (пустые строки считаются отсутствующими значениями)
            chassisType: playerData.chassisType && playerData.chassisType !== "" ? playerData.chassisType : undefined,
            cannonType: playerData.cannonType && playerData.cannonType !== "" ? playerData.cannonType : undefined,
            trackType: playerData.trackType && playerData.trackType !== "" ? playerData.trackType : undefined,
            tankColor: playerData.tankColor && playerData.tankColor !== "" ? playerData.tankColor : undefined,
            turretColor: playerData.turretColor && playerData.turretColor !== "" ? playerData.turretColor : undefined,
            modules: playerData.modules || [], // КРИТИЧНО: Инициализируем модули (пустой массив если не указаны)
            // Linear interpolation (backward compatibility)
            lastPosition: lastPos1,
            lastRotation: rotation,
            lastTurretRotation: turretRotation,
            lastAimPitch: aimPitch, // Added for barrel pitch interpolation
            interpolationTime: 0,
            // Cubic interpolation (spline)
            positionHistory: [lastPos1, lastPos2, lastPos3],
            rotationHistory: [rotation, rotation, rotation],
            turretRotationHistory: [turretRotation, turretRotation, turretRotation],
            aimPitchHistory: [aimPitch, aimPitch, aimPitch], // Added for smooth barrel interpolation
            // Dead reckoning (extrapolation)
            velocity: velocity,
            angularVelocity: 0,
            turretAngularVelocity: 0,
            lastUpdateTime: Date.now(),
            // Adaptive interpolation
            interpolationDelay: 50 // Default 50ms delay
        };

        this.networkPlayers.set(playerData.id, networkPlayer);
        const newSize = this.networkPlayers.size;

        // ДИАГНОСТИКА: Логируем только при реальном добавлении (размер должен увеличиться)
        if (newSize > oldSize) {
            logger.log(`[Multiplayer] ✅ Network player added: ${playerData.id} (${playerData.name || 'Unknown'}), total=${newSize}, roomId=${this.roomId || 'N/A'}`);
        } else {
            logger.error(`[Multiplayer] ❌ КРИТИЧЕСКАЯ ОШИБКА: Игрок не добавлен в networkPlayers! playerData.id=${playerData.id}, было=${oldSize}, стало=${newSize}`);
        }
    }

    private updateNetworkPlayer(playerData: PlayerData, _gameTime: number): void {
        // Validate player data
        if (!playerData || !playerData.id) {
            logger.warn("[Multiplayer] Cannot update network player: invalid player data");
            return;
        }

        // ИСПРАВЛЕНО: Гибкая валидация позиции - используем дефолты если данные невалидны
        let x = 0, y = 2, z = 0;
        const existingPlayer = this.networkPlayers.get(playerData.id);
        const hadValidPosition = playerData.position &&
            typeof playerData.position.x === 'number' &&
            typeof playerData.position.y === 'number' &&
            typeof playerData.position.z === 'number' &&
            Number.isFinite(playerData.position.x) &&
            Number.isFinite(playerData.position.y) &&
            Number.isFinite(playerData.position.z);

        if (hadValidPosition) {
            x = playerData.position.x;
            y = playerData.position.y;
            z = playerData.position.z;
        } else {
            // Если нет позиции, но есть existingPlayer - используем его позицию
            if (existingPlayer) {
                x = existingPlayer.position.x;
                y = existingPlayer.position.y;
                z = existingPlayer.position.z;
            }
        }

        // ДИАГНОСТИКА: Логируем обновление позиции (только для сетевых игроков, не локального)
        if (existingPlayer && playerData.id !== this.playerId) {
            const oldX = existingPlayer.position.x;
            const oldZ = existingPlayer.position.z;
            const distance = Math.sqrt(Math.pow(x - oldX, 2) + Math.pow(z - oldZ, 2));

            // Логируем только если позиция изменилась или это первые несколько обновлений
            if (distance > 0.01 || !existingPlayer._updateCount) {
                if (!existingPlayer._updateCount) existingPlayer._updateCount = 0;
                if (existingPlayer._updateCount < 3 || existingPlayer._updateCount % 60 === 0) {
                    logger.log(`[Multiplayer] ${playerData.id} position update: (${x.toFixed(1)}, ${z.toFixed(1)}) from (${oldX.toFixed(1)}, ${oldZ.toFixed(1)}), distance=${distance.toFixed(2)}, valid=${hadValidPosition}`);
                }
                existingPlayer._updateCount++;
            }
        }

        // ИСПРАВЛЕНО: Используем дефолты для невалидных числовых полей
        const rotation = typeof playerData.rotation === 'number' && Number.isFinite(playerData.rotation)
            ? playerData.rotation : (this.networkPlayers.get(playerData.id)?.rotation ?? 0);
        const turretRotation = typeof playerData.turretRotation === 'number' && Number.isFinite(playerData.turretRotation)
            ? playerData.turretRotation : (this.networkPlayers.get(playerData.id)?.turretRotation ?? 0);
        const aimPitch = typeof playerData.aimPitch === 'number' && Number.isFinite(playerData.aimPitch)
            ? playerData.aimPitch : (this.networkPlayers.get(playerData.id)?.aimPitch ?? 0);
        const health = typeof playerData.health === 'number' && Number.isFinite(playerData.health)
            ? playerData.health : (this.networkPlayers.get(playerData.id)?.health ?? 100);
        const maxHealth = typeof playerData.maxHealth === 'number' && Number.isFinite(playerData.maxHealth)
            ? playerData.maxHealth : (this.networkPlayers.get(playerData.id)?.maxHealth ?? 100);

        // Создаём нормализованные данные игрока
        const normalizedData: PlayerData = {
            ...playerData,
            position: { x, y, z } as any,
            rotation,
            turretRotation,
            aimPitch,
            health,
            maxHealth
        };

        const networkPlayer = this.networkPlayers.get(playerData.id);
        if (!networkPlayer) {
            this.addNetworkPlayer(normalizedData);
            return;
        }

        // КРИТИЧНО: Инициализация новых полей для старых игроков (если они отсутствуют)
        // ОПТИМИЗАЦИЯ: Используем vector3Pool
        if (!networkPlayer.velocity) {
            networkPlayer.velocity = vector3Pool.acquire(0, 0, 0);
        }
        if (networkPlayer.angularVelocity === undefined) {
            networkPlayer.angularVelocity = 0;
        }
        if (networkPlayer.turretAngularVelocity === undefined) {
            networkPlayer.turretAngularVelocity = 0;
        }
        if (!networkPlayer.lastUpdateTime) {
            networkPlayer.lastUpdateTime = Date.now();
        }
        if (!networkPlayer.positionHistory || !Array.isArray(networkPlayer.positionHistory)) {
            const pos = toVector3(networkPlayer.position);
            networkPlayer.positionHistory = [pos.clone(), pos.clone(), pos.clone()];
        }
        if (!networkPlayer.rotationHistory || !Array.isArray(networkPlayer.rotationHistory)) {
            const rot = networkPlayer.rotation;
            networkPlayer.rotationHistory = [rot, rot, rot];
        }
        if (!networkPlayer.turretRotationHistory || !Array.isArray(networkPlayer.turretRotationHistory)) {
            const tRot = networkPlayer.turretRotation;
            networkPlayer.turretRotationHistory = [tRot, tRot, tRot];
        }
        if (networkPlayer.interpolationDelay === undefined) {
            networkPlayer.interpolationDelay = 50;
        }

        const currentTime = Date.now();
        const deltaTime = (currentTime - networkPlayer.lastUpdateTime) / 1000; // Convert to seconds

        // Use server-provided velocity for dead reckoning if available
        // Otherwise calculate locally from position delta
        if (playerData.velocity && typeof playerData.velocity.x === 'number') {
            // Use server-calculated velocity (more accurate, accounts for physics)
            networkPlayer.velocity.set(playerData.velocity.x, playerData.velocity.y, playerData.velocity.z);
            networkPlayer.angularVelocity = playerData.angularVelocity ?? 0;
            networkPlayer.turretAngularVelocity = playerData.turretAngularVelocity ?? 0;
        } else if (deltaTime > 0 && deltaTime < 1) { // Valid delta time (0-1 second)
            // Fallback: calculate velocity from position delta with EWMA smoothing
            // ОПТИМИЗАЦИЯ: Используем vector3Pool
            const posDelta = vector3Pool.acquire(x, y, z);
            posDelta.subtractInPlace(networkPlayer.position);
            const newVelocity = posDelta.scale(1 / deltaTime);
            // EWMA smoothing - КРИТИЧНО уменьшено для МАКСИМАЛЬНОГО сглаживания (15% новое, 85% старое)
            const VELOCITY_SMOOTHING = 0.15;
            networkPlayer.velocity.x = networkPlayer.velocity.x * (1 - VELOCITY_SMOOTHING) + newVelocity.x * VELOCITY_SMOOTHING;
            networkPlayer.velocity.y = networkPlayer.velocity.y * (1 - VELOCITY_SMOOTHING) + newVelocity.y * VELOCITY_SMOOTHING;
            networkPlayer.velocity.z = networkPlayer.velocity.z * (1 - VELOCITY_SMOOTHING) + newVelocity.z * VELOCITY_SMOOTHING;

            // ОПТИМИЗАЦИЯ: Освобождаем временный вектор
            vector3Pool.release(posDelta);

            // Calculate angular velocities with EWMA smoothing
            let rotDiff = rotation - networkPlayer.rotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            const newAngularVelocity = rotDiff / deltaTime;
            networkPlayer.angularVelocity = networkPlayer.angularVelocity * (1 - VELOCITY_SMOOTHING) + newAngularVelocity * VELOCITY_SMOOTHING;

            let turretDiff = turretRotation - networkPlayer.turretRotation;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            const newTurretAngularVelocity = turretDiff / deltaTime;
            networkPlayer.turretAngularVelocity = networkPlayer.turretAngularVelocity * (1 - VELOCITY_SMOOTHING) + newTurretAngularVelocity * VELOCITY_SMOOTHING;
        } else {
            // Reset velocity if deltaTime is invalid
            networkPlayer.velocity.set(0, 0, 0);
            networkPlayer.angularVelocity = 0;
            networkPlayer.turretAngularVelocity = 0;
        }

        // ИСПРАВЛЕНО: Вычисляем drift (разница между предсказанной и серверной позицией)
        if (networkPlayer.id === this.playerId && networkPlayer.lastPosition instanceof Vector3) {
            const serverPos = vector3Pool.acquire(x, y, z);
            const predictedPos = networkPlayer.lastPosition;
            const driftDistance = Vector3.Distance(serverPos, predictedPos);
            this.networkMetrics.drift = driftDistance;
            vector3Pool.release(serverPos);
        }

        // Store previous state for interpolation (safely handle both Vector3 and plain objects)
        const currentPos = toVector3(networkPlayer.position);
        if (networkPlayer.lastPosition instanceof Vector3) {
            networkPlayer.lastPosition.copyFrom(currentPos);
        } else {
            // Если lastPosition не Vector3, создаем новый Vector3
            networkPlayer.lastPosition = currentPos.clone();
        }
        networkPlayer.lastRotation = networkPlayer.rotation;
        networkPlayer.lastTurretRotation = networkPlayer.turretRotation;
        networkPlayer.lastAimPitch = networkPlayer.aimPitch; // Track previous aim pitch for interpolation

        // Update position history for cubic interpolation (keep last 3 positions)
        networkPlayer.positionHistory.shift(); // Remove oldest
        networkPlayer.positionHistory.push(toVector3(networkPlayer.position)); // Add current before update
        networkPlayer.rotationHistory.shift();
        networkPlayer.rotationHistory.push(networkPlayer.rotation);
        networkPlayer.turretRotationHistory.shift();
        networkPlayer.turretRotationHistory.push(networkPlayer.turretRotation);
        // ADDED: Update aimPitch history for smooth barrel interpolation
        if (!networkPlayer.aimPitchHistory) {
            networkPlayer.aimPitchHistory = [networkPlayer.aimPitch, networkPlayer.aimPitch, networkPlayer.aimPitch];
        }
        networkPlayer.aimPitchHistory.shift();
        networkPlayer.aimPitchHistory.push(networkPlayer.aimPitch);

        // Update to new state
        networkPlayer.position.set(x, y, z);
        networkPlayer.rotation = rotation;
        networkPlayer.turretRotation = turretRotation;
        networkPlayer.aimPitch = aimPitch;
        networkPlayer.health = health;
        networkPlayer.maxHealth = maxHealth;
        networkPlayer.kills = playerData.kills;
        networkPlayer.deaths = playerData.deaths;

        // Update chassis tilt
        if (playerData.chassisPitch !== undefined) networkPlayer.chassisPitch = playerData.chassisPitch;
        if (playerData.chassisRoll !== undefined) networkPlayer.chassisRoll = playerData.chassisRoll;

        // DEBUG: Log rotation data periodically (every 60th update to reduce spam)
        if (!networkPlayer._rotDebugCounter) networkPlayer._rotDebugCounter = 0;
        networkPlayer._rotDebugCounter++;
        /*
        if (networkPlayer._rotDebugCounter % 60 === 0) {
            logger.log(`[MP] 🔄 Player ${playerData.id.substring(0, 8)} rotation:`, {
                rotation: rotation.toFixed(3),
                chassisPitch: (playerData.chassisPitch || 0).toFixed(3),
                chassisRoll: (playerData.chassisRoll || 0).toFixed(3),
                turretRot: turretRotation.toFixed(3)
            });
        }
        */

        // КРИТИЧНО: Обновляем статус, но если не указан, сохраняем текущий (не сбрасываем в undefined)
        if (playerData.status !== undefined && playerData.status !== null) {
            networkPlayer.status = playerData.status;
        } else {
            // Если статус не указан, используем "alive" по умолчанию (не скрываем танк)
            if (!networkPlayer.status) {
                networkPlayer.status = "alive";
            }
        }
        networkPlayer.team = playerData.team;

        // Update customization (only if changed)
        // КРИТИЧНО: Проверяем изменения перед обновлением, чтобы вызвать updateParts()
        const oldChassisType = networkPlayer.chassisType;
        const oldCannonType = networkPlayer.cannonType;
        const oldTrackType = networkPlayer.trackType;
        const oldTankColor = networkPlayer.tankColor;
        const oldTurretColor = networkPlayer.turretColor;

        let partsChanged = false;
        const partsUpdateData: { chassisType?: string; cannonType?: string; trackType?: string; tankColor?: string; turretColor?: string } = {};

        // КРИТИЧНО: Обрабатываем пустые строки как отсутствующие значения (используем дефолты)
        if (playerData.chassisType !== undefined && playerData.chassisType !== "" && playerData.chassisType !== oldChassisType) {
            networkPlayer.chassisType = playerData.chassisType;
            partsUpdateData.chassisType = playerData.chassisType;
            partsChanged = true;
        }
        if (playerData.cannonType !== undefined && playerData.cannonType !== "" && playerData.cannonType !== oldCannonType) {
            networkPlayer.cannonType = playerData.cannonType;
            partsUpdateData.cannonType = playerData.cannonType;
            partsChanged = true;
        }
        if (playerData.trackType !== undefined && playerData.trackType !== "" && playerData.trackType !== oldTrackType) {
            networkPlayer.trackType = playerData.trackType;
            partsUpdateData.trackType = playerData.trackType;
            partsChanged = true;
        }
        if (playerData.tankColor !== undefined && playerData.tankColor !== "" && playerData.tankColor !== oldTankColor) {
            networkPlayer.tankColor = playerData.tankColor;
            partsUpdateData.tankColor = playerData.tankColor;
            partsChanged = true;
        }
        if (playerData.turretColor !== undefined && playerData.turretColor !== "" && playerData.turretColor !== oldTurretColor) {
            networkPlayer.turretColor = playerData.turretColor;
            partsUpdateData.turretColor = playerData.turretColor;
            partsChanged = true;
        }

        // КРИТИЧНО: Обновляем визуальную модель танка если части изменились
        if (partsChanged) {
            const game = (window as any).gameInstance;
            if (game && game.networkPlayerTanks) {
                const tank = game.networkPlayerTanks.get(playerData.id);
                if (tank && typeof tank.updateParts === 'function') {
                    logger.log(`[Multiplayer] 🛠️ Updating tank parts for ${playerData.id}:`, partsUpdateData);
                    tank.updateParts(partsUpdateData);
                }
            }
        }

        // КРИТИЧНО: Обновляем модули если они переданы И изменились
        if (playerData.modules !== undefined) {
            const oldModules = networkPlayer.modules || [];
            const newModules = playerData.modules || [];

            // Проверяем, изменились ли модули (сравниваем массивы)
            const modulesChanged = oldModules.length !== newModules.length ||
                !oldModules.every((mod, idx) => mod === newModules[idx]);

            if (modulesChanged) {
                networkPlayer.modules = newModules;
                // Уведомляем NetworkPlayerTank об обновлении модулей только если они изменились
                const game = (window as any).gameInstance;
                if (game && game.networkPlayerTanks) {
                    const tank = game.networkPlayerTanks.get(playerData.id);
                    if (tank && typeof tank.updateModules === 'function') {
                        tank.updateModules(newModules);
                    }
                }
            }
        }

        // Update timestamp
        networkPlayer.lastUpdateTime = currentTime;

        // Reset interpolation timer
        networkPlayer.interpolationTime = 0;

        // Update adaptive interpolation delay based on ping
        // ОПТИМИЗИРОВАНО: Уменьшены задержки для более отзывчивого отображения
        const rtt = this.networkMetrics.rtt;
        if (rtt < 50) {
            networkPlayer.interpolationDelay = 12; // LOW-PING OPTIMIZED: Minimal delay for EU servers
        } else if (rtt < 100) {
            networkPlayer.interpolationDelay = 25; // LOW-PING OPTIMIZED: Reduced from 35ms
        } else if (rtt < 150) {
            networkPlayer.interpolationDelay = 40; // LOW-PING OPTIMIZED: Reduced from 50ms
        } else {
            networkPlayer.interpolationDelay = 55; // HIGH PING: Slightly reduced from 60ms
        }
    }

    // Public API

    /**
     * Get all currently connected network players
     */
    getPlayers(): NetworkPlayer[] {
        return Array.from(this.networkPlayers.values());
    }

    /**
     * Send player input to the server
     * @param input - Player input data (throttle, steer, turret rotation, etc.)
     * @returns Sequence number for client-side prediction, or -1 if not connected
     */
    sendPlayerInput(input: PlayerInput): number {
        try {
            if (!this.connected || !this.roomId) {
                return -1;
            }

            // Validate input
            if (!input || typeof input.throttle !== 'number' || typeof input.steer !== 'number') {
                logger.warn("[Multiplayer] Invalid player input data");
                return -1;
            }

            // Add sequence number for prediction and reconciliation
            const sequence = ++this.currentSequence;

            // ДИАГНОСТИКА: Логируем отправку позиции каждые 60 кадров (1 раз в секунду при 60 FPS) и только если включен debugSync
            const DEBUG_SYNC = (window as any).gameSettings?.debugSync || localStorage.getItem("debugSync") === "true";
            if (DEBUG_SYNC && sequence % 60 === 0 && this._lastKnownLocalPosition) {
                logger.log(`[Multiplayer] 📤 Sending input seq=${sequence}, pos=(${this._lastKnownLocalPosition.x.toFixed(1)}, ${this._lastKnownLocalPosition.y.toFixed(1)}, ${this._lastKnownLocalPosition.z.toFixed(1)}), throttle=${input.throttle.toFixed(2)}, steer=${input.steer.toFixed(2)}`);
            }

            const inputWithSequence: PlayerInput = {
                ...input,
                sequence,
                // КРИТИЧНО: Используем серверное время чтобы избежать ошибки "timestamp in future"
                timestamp: this.getServerTime()
            };

            // Store predicted state for reconciliation
            this.storePredictedState(sequence, inputWithSequence);

            this.send(createClientMessage(ClientMessageType.PLAYER_INPUT, inputWithSequence));
            return sequence;
        } catch (error) {
            logger.error("[Multiplayer] Error in sendPlayerInput:", error);
            return -1;
        }
    }

    /**
     * Store predicted state for client-side prediction and reconciliation
     * Called by TankController with actual position after applying input locally
     */
    private storePredictedState(sequence: number, input: PlayerInput): void {
        // Create predicted state with placeholder values
        // Position/rotation will be updated immediately by updatePredictedState()
        const predictedState: PredictedState = {
            sequence,
            timestamp: input.timestamp,
            // ОПТИМИЗАЦИЯ: Используем vector3Pool
            position: this._lastKnownLocalPosition ? (() => {
                const pos = vector3Pool.acquire();
                pos.copyFrom(this._lastKnownLocalPosition!);
                return pos;
            })() : vector3Pool.acquire(0, 0, 0),
            rotation: this._lastKnownLocalRotation || 0,
            turretRotation: input.turretRotation,
            aimPitch: input.aimPitch,
            input
        };

        this.predictionState.predictedStates.set(sequence, predictedState);

        // Clean up old states beyond maxHistorySize (batch cleanup for efficiency)
        this.cleanupOldPredictedStates();
    }

    // Track last known local player position for prediction
    private _lastKnownLocalPosition: Vector3 | null = null;
    private _lastKnownLocalRotation: number = 0;

    /**
     * Clean up old predicted states efficiently
     */
    private cleanupOldPredictedStates(): void {
        const maxSize = this.predictionState.maxHistorySize;
        if (this.predictionState.predictedStates.size <= maxSize) {
            return;
        }

        // Get all sequences and sort them
        const sequences = Array.from(this.predictionState.predictedStates.keys()).sort((a, b) => a - b);

        // Remove oldest entries (keep the newest ones)
        const removeCount = sequences.length - maxSize;
        for (let i = 0; i < removeCount; i++) {
            const seq = sequences[i];
            if (seq !== undefined) {
                this.predictionState.predictedStates.delete(seq);
            }
        }
    }

    /**
     * Update predicted state with actual position/rotation after applying input
     * @param sequence - Sequence number of the input
     * @param position - Actual position after applying input
     * @param rotation - Actual rotation after applying input
     */
    /**
     * Update predicted state with actual position after applying input locally
     * Called by TankController immediately after applying input
     */
    updatePredictedState(sequence: number, position: Vector3, rotation: number): void {
        const state = this.predictionState.predictedStates.get(sequence);
        if (state) {
            // ОПТИМИЗАЦИЯ: Используем vector3Pool
            if (!state.position) {
                state.position = vector3Pool.acquire();
            }
            state.position.copyFrom(position);
            state.rotation = rotation;
        }

        // Also update last known position for next prediction
        // ОПТИМИЗАЦИЯ: Используем copyFrom вместо clone()
        if (!this._lastKnownLocalPosition) {
            this._lastKnownLocalPosition = vector3Pool.acquire();
        }
        this._lastKnownLocalPosition.copyFrom(position);
        this._lastKnownLocalRotation = rotation;
    }

    /**
     * Set current local player position (called before sending input)
     * Ensures predicted states have accurate starting positions
     */
    setLocalPlayerPosition(position: Vector3, rotation: number): void {
        this._lastKnownLocalPosition = position.clone();
        this._lastKnownLocalRotation = rotation;
    }

    /**
     * Get all unconfirmed inputs that need to be re-applied after server reconciliation
     * Returns inputs in order (oldest first)
     */
    getUnconfirmedInputs(): PlayerInput[] {
        const confirmedSeq = this.predictionState.confirmedSequence;
        const unconfirmedInputs: PlayerInput[] = [];

        // Get all sequences after confirmed
        // ОПТИМИЗАЦИЯ: Заменяем filter на обычный цикл для лучшей производительности
        const allSequences = Array.from(this.predictionState.predictedStates.keys());
        const sequences: number[] = [];
        for (let i = 0; i < allSequences.length; i++) {
            const seq = allSequences[i];
            if (seq !== undefined && seq > confirmedSeq) {
                sequences.push(seq);
            }
        }
        sequences.sort((a, b) => a - b);

        for (const seq of sequences) {
            const state = this.predictionState.predictedStates.get(seq);
            if (state && state.input) {
                unconfirmedInputs.push(state.input);
            }
        }

        return unconfirmedInputs;
    }

    /**
     * Get the last confirmed server state for reconciliation
     */
    getLastServerState(): PlayerData | null {
        return this.predictionState.lastServerState;
    }

    /**
     * Check if reconciliation is needed (position difference exceeds threshold)
     */
    needsReconciliation(currentPosition: Vector3, threshold: number = 0.5): boolean {
        const serverState = this.predictionState.lastServerState;
        if (!serverState || !serverState.position) return false;

        // ОПТИМИЗАЦИЯ: Используем DistanceSquared вместо Distance (избегаем вычисления корня)
        const serverPos = toVector3(serverState.position);
        const diffSq = Vector3.DistanceSquared(currentPosition, serverPos);
        const thresholdSq = threshold * threshold;
        return diffSq > thresholdSq;
    }

    /**
     * Reconcile server state with client predictions
     * Implements proper rollback and re-application of inputs
     * 
     * Algorithm:
     * 1. Find the predicted state for the server's confirmed sequence
     * 2. Compare server position with predicted position
     * 3. If difference exceeds threshold:
     *    - Reset local position to server position
     *    - Re-apply all unconfirmed inputs to get new predicted position
     * 4. Clean up confirmed states from history
     */
    // =========================================================================
    // НОВЫЙ ПОДХОД: СЕРВЕР = АВТОРИТЕТ (без client-side prediction)
    // =========================================================================
    // Клиент ВСЕГДА принимает серверную позицию как единственную правду.
    // Это полностью устраняет дёрганье, но добавляет ~50-100ms визуальный лаг.
    // Для танковой игры это приемлемо.
    // =========================================================================

    // Целевая позиция от сервера (к ней интерполируем)
    // ОПТИМИЗАЦИЯ: Используем vector3Pool для переиспользования
    private _serverTargetPosition: Vector3 = vector3Pool.acquire(0, 0, 0);
    private _serverTargetRotation: number = 0;
    private _serverTargetTurretRotation: number = 0;
    private _serverTargetAimPitch: number = 0;
    private _hasServerTarget: boolean = false;

    // ОПТИМИЗАЦИЯ: Ограничение частоты reconciliation (максимум раз в 3 кадра)
    private _lastReconciliationFrame: number = -1;
    private readonly RECONCILIATION_INTERVAL = 3; // Каждые 3 кадра

    /**
     * НОВЫЙ МЕТОД: Получить целевую позицию от сервера для интерполяции
     */
    getServerTargetState(): {
        position: Vector3;
        rotation: number;
        turretRotation: number;
        aimPitch: number;
        hasTarget: boolean
    } {
        // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
        const pos = vector3Pool.acquire();
        pos.copyFrom(this._serverTargetPosition);
        return {
            position: pos, // Вызывающий код должен освободить этот вектор после использования
            rotation: this._serverTargetRotation,
            turretRotation: this._serverTargetTurretRotation,
            aimPitch: this._serverTargetAimPitch,
            hasTarget: this._hasServerTarget
        };
    }

    /**
     * УПРОЩЁННАЯ reconciliation: просто обновляем серверную целевую позицию
     * Клиент будет плавно интерполировать к ней в GameMultiplayerCallbacks
     */
    private reconcileServerState(serverSequence: number | undefined, serverPlayerData: PlayerData | null): void {
        if (!serverPlayerData || !serverPlayerData.position) {
            return;
        }

        // ОПТИМИЗАЦИЯ: Ограничиваем частоту reconciliation
        const currentFrame = (window as any).gameInstance?._updateTick || 0;
        if (this._lastReconciliationFrame >= 0 &&
            currentFrame - this._lastReconciliationFrame < this.RECONCILIATION_INTERVAL) {
            return; // Пропускаем reconciliation - слишком часто
        }
        this._lastReconciliationFrame = currentFrame;

        // ОПТИМИЗАЦИЯ: Проверяем необходимость reconciliation (расхождение должно быть значительным)
        const QUANTIZATION_ERROR = 0.15; // Погрешность квантования
        const thresholdSq = QUANTIZATION_ERROR * QUANTIZATION_ERROR;

        if (this._lastKnownLocalPosition && this._hasServerTarget) {
            const diffSq = Vector3.DistanceSquared(this._lastKnownLocalPosition, this._serverTargetPosition);
            if (diffSq < thresholdSq) {
                return; // Расхождение минимально - не требуется reconciliation
            }
        }

        // Обновляем серверную целевую позицию
        const serverPos = toVector3(serverPlayerData.position);
        this._serverTargetPosition = serverPos;
        this._serverTargetRotation = serverPlayerData.rotation || 0;
        this._serverTargetTurretRotation = serverPlayerData.turretRotation || 0;
        this._serverTargetAimPitch = serverPlayerData.aimPitch || 0;
        this._hasServerTarget = true;

        // Вычисляем positionDiff для callback (до перезаписи _lastKnownLocalPosition)
        let positionDiff = 0;
        if (this._lastKnownLocalPosition) {
            positionDiff = Vector3.Distance(this._lastKnownLocalPosition, serverPos);
        }
        const predictedStateForSequence =
            serverSequence !== undefined ? this.predictionState.predictedStates.get(serverSequence) : undefined;

        // Обновляем confirmed sequence до получения unconfirmed (чтобы unconfirmed = строго после serverSequence)
        if (serverSequence !== undefined && serverSequence > this.predictionState.confirmedSequence) {
            this.predictionState.confirmedSequence = serverSequence;
        }
        this.predictionState.lastServerState = serverPlayerData;
        const unconfirmedInputs = this.getUnconfirmedInputs();

        // Обновляем last known position (клиент принимает серверную позицию как основу)
        if (!this._lastKnownLocalPosition) {
            this._lastKnownLocalPosition = vector3Pool.acquire();
        }
        this._lastKnownLocalPosition.copyFrom(this._serverTargetPosition);
        this._lastKnownLocalRotation = this._serverTargetRotation;

        if (this.onReconciliationCallback) {
            this.onReconciliationCallback({
                serverState: serverPlayerData,
                predictedState: predictedStateForSequence,
                unconfirmedStates: undefined,
                unconfirmedInputs: unconfirmedInputs.length > 0 ? unconfirmedInputs : undefined,
                positionDiff,
                rotationDiff: 0,
                needsReapplication: true
            });
        }
    }

    /**
     * Get confirmed sequence number
     * @returns Last confirmed sequence number from server
     */
    getConfirmedSequence(): number {
        return this.predictionState.confirmedSequence;
    }

    /**
     * Send player shoot event to server
     * @param data - Shoot event data
     */
    sendPlayerShoot(data: { position: Vector3; direction: Vector3; aimPitch: number; cannonType: string; timestamp: number }): void {
        try {
            if (!this.connected || !this.roomId) return;

            if (!data) {
                logger.warn("[Multiplayer] Cannot send player shoot: invalid data");
                return;
            }

            this.send(createClientMessage(ClientMessageType.PLAYER_SHOOT, data));
        } catch (error) {
            logger.error("[Multiplayer] Error in sendPlayerShoot:", error);
        }
    }

    /**
     * Request respawn from server after death timer expires
     */
    requestRespawn(): void {
        try {
            if (!this.connected || !this.roomId) {
                logger.warn("[Multiplayer] Cannot request respawn: not connected or not in room");
                return;
            }

            logger.log("[Multiplayer] Requesting respawn from server");
            const modules = getLocallyEquippedModules();
            this.send(createClientMessage(ClientMessageType.PLAYER_RESPAWN_REQUEST, { modules }));
        } catch (error) {
            logger.error("[Multiplayer] Error in requestRespawn:", error);
        }
    }

    /**
     * Report a hit on another player (client-authoritative hit detection)
     * Server will validate and apply damage
     * @param targetId - ID of the player that was hit
     * @param damage - Damage amount
     * @param hitPosition - Position where the hit occurred
     * @param cannonType - Type of weapon used
     */
    sendPlayerHit(targetId: string, damage: number, hitPosition: Vector3, cannonType: string): void {
        try {
            if (!this.connected || !this.roomId) {
                return;
            }

            if (!targetId || damage <= 0) {
                logger.warn("[Multiplayer] Cannot send player hit: invalid data");
                return;
            }

            logger.log(`[Multiplayer] 🎯 Sending PLAYER_HIT: target=${targetId}, damage=${damage}`);
            this.send(createClientMessage(ClientMessageType.PLAYER_HIT, {
                targetId,
                damage,
                hitPosition: { x: hitPosition.x, y: hitPosition.y, z: hitPosition.z },
                cannonType,
                timestamp: this.getServerTime()
            }));
        } catch (error) {
            logger.error("[Multiplayer] Error in sendPlayerHit:", error);
        }
    }


    /**
     * Kick a player from the room (Host only)
     */
    kickPlayer(targetPlayerId: string): void {
        try {
            if (!this.connected || !this.roomId) {
                logger.warn("[Multiplayer] Cannot kick player: not connected or not in room");
                return;
            }

            logger.log(`[Multiplayer] Kicking player: ${targetPlayerId}`);
            this.send(createClientMessage(ClientMessageType.KICK_PLAYER, {
                roomId: this.roomId,
                targetPlayerId: targetPlayerId
            }));
        } catch (error) {
            logger.error("[Multiplayer] Error in kickPlayer:", error);
        }
    }

    /**
     * Change room settings (Host only)
     */
    changeRoomSettings(settings: { mapType?: string; mode?: GameMode }): void {
        try {
            if (!this.connected || !this.roomId) {
                logger.warn("[Multiplayer] Cannot change settings: not connected or not in room");
                return;
            }

            logger.log(`[Multiplayer] Changing room settings:`, settings);
            this.send(createClientMessage(ClientMessageType.CHANGE_ROOM_SETTINGS, {
                roomId: this.roomId,
                settings: settings
            }));
        } catch (error) {
            logger.error("[Multiplayer] Error in changeRoomSettings:", error);
        }
    }

    /**
     * Send chat message to server
     * @param message - Chat message text
     */
    sendChatMessage(message: string): void {
        try {
            // Убрана проверка на roomId - чат доступен всегда при подключении
            if (!this.connected) {
                logger.warn("[Multiplayer] Cannot send chat message: not connected");
                return;
            }

            if (!message || typeof message !== 'string' || message.trim() === '') {
                logger.warn("[Multiplayer] Cannot send chat message: invalid message");
                return;
            }

            // Если мы в комнате, отправляем в комнату, иначе отправляем в общий чат
            this.send(createClientMessage(ClientMessageType.CHAT_MESSAGE, { message }));
        } catch (error) {
            logger.error("[Multiplayer] Error in sendChatMessage:", error);
        }
    }

    /**
     * Alias for sendChatMessage for lobby chat
     * @param message - Chat message text
     */
    sendLobbyChatMessage(message: string): void {
        this.sendChatMessage(message);
    }

    /**
     * Handle incoming lobby chat message
     * @param data - Message data
     */
    private handleLobbyChatMessage(data: any): void {
        // data structure: { sender: string, message: string, timestamp: number, isSystem?: boolean }
        logger.log("[Multiplayer] Received lobby chat message:", data);

        if (this.onChatMessageCallback) {
            this.onChatMessageCallback(data);
        } else {
            // If no callback registered, try to use global event dispatch
            // This allows menu.ts to listen even if callback isn't set
            const event = new CustomEvent("mp-lobby-chat-message", {
                detail: data
            });
            window.dispatchEvent(event);
        }
    }

    /**
     * Request consumable pickup from server
     * @param consumableId - ID of the consumable
     * @param type - Type of consumable
     * @param position - Position of the consumable
     */
    requestConsumablePickup(consumableId: string, type: string, position: Vector3Data): void {
        try {
            if (!this.connected || !this.roomId) return;

            if (!consumableId || !type || !position) {
                logger.warn("[Multiplayer] Cannot request consumable pickup: invalid parameters");
                return;
            }

            this.send(createClientMessage(ClientMessageType.CONSUMABLE_PICKUP_REQUEST, {
                consumableId,
                type,
                position
            }));
        } catch (error) {
            logger.error("[Multiplayer] Error in requestConsumablePickup:", error);
        }
    }

    /**
     * Create a new game room
     * @param mode - Game mode (ffa, tdm, coop, battle_royale, ctf)
     * @param maxPlayers - Maximum number of players (default: 32)
     * @param isPrivate - Whether the room is private (default: false, always creates public rooms)
     * @param mapType - Map type (normal, desert, etc)
     * @param enableBots - Enable bots in the room (default: false)
     * @param botCount - Number of bots (0 = auto based on players)
     * @param customMapData - Optional custom map JSON data
     * @returns True if room creation request was sent, false if not connected
     */
    createRoom(mode: GameMode, maxPlayers: number = 32, isPrivate: boolean = false, mapType?: string, enableBots: boolean = false, botCount: number = 0, customMapData?: any): boolean {
        // Log mapType to debug why it might be missing/wrong
        logger.log(`[Multiplayer] createRoom called with mapType: '${mapType}', enableBots=${enableBots}, botCount=${botCount}, hasCustomMapData=${!!customMapData}`);

        if (!this.connected) {
            logger.warn("[Multiplayer] Cannot create room: not connected to server");
            return false;
        }

        logger.log(`[Multiplayer] Creating room: mode=${mode}, maxPlayers=${maxPlayers}, isPrivate=${isPrivate}, mapType=${mapType}, enableBots=${enableBots}, botCount=${botCount}`);
        // ВАЖНО: Убеждаемся, что комната публичная (isPrivate=false), чтобы её видели другие игроки
        // Получаем настройки кастомизации из localStorage
        const chassisType = localStorage.getItem("selectedChassis") || "medium";
        const cannonType = localStorage.getItem("selectedCannon") || "standard";
        const trackType = localStorage.getItem("selectedTrack") || "standard";
        const skinId = localStorage.getItem("selectedTankSkin") || "default";

        // Получаем цвета из скина
        const skin = getSkinById(skinId) || getDefaultSkin();
        const tankColor = skin.chassisColor;
        const turretColor = skin.turretColor;
        const modules = getLocallyEquippedModules();

        logger.log(`[Multiplayer] Creating room with customization: ${chassisType}/${cannonType}/${trackType}, skin=${skinId}, modules=${modules.length}`);
        if (mapType === 'custom') {
            logger.log(`[Multiplayer] 🔍 DEBUG: createRoom called with mapType='custom'. Has data: ${!!customMapData}`);
            if (customMapData) {
                logger.log(`[Multiplayer] 📦 Custom Map Data Summary: Keys=${Object.keys(customMapData).join(',')}, Objects=${customMapData.placedObjects?.length}`);
            } else {
                logger.error(`[Multiplayer] ❌ CRITICAL: mapType is 'custom' but customMapData is MISSING!`);
            }
        }

        this.send(createClientMessage(ClientMessageType.CREATE_ROOM, {
            mode,
            maxPlayers,
            isPrivate: false, // Всегда создаем публичные комнаты для видимости
            mapType: mapType || "normal", // Передаем тип карты
            enableBots, // Боты включены/выключены
            botCount, // Количество ботов
            // Кастомизация
            chassisType,
            cannonType,
            trackType,
            tankColor,
            turretColor,
            playerName: this.playerName, // КРИТИЧНО: Передаем имя игрока
            modules,
            // Данные карты
            customMapData
        }));
        return true;
    }

    /**
     * Join an existing game room
     * @param roomId - ID of the room to join
     */
    joinRoom(roomId: string): void {
        if (!this.connected) return;

        // Получаем настройки кастомизации из localStorage
        const chassisType = localStorage.getItem("selectedChassis") || "medium";
        const cannonType = localStorage.getItem("selectedCannon") || "standard";
        const trackType = localStorage.getItem("selectedTrack") || "standard";
        const skinId = localStorage.getItem("selectedTankSkin") || "default";

        // Получаем цвета из скина
        const skin = getSkinById(skinId) || getDefaultSkin();
        const tankColor = skin.chassisColor;
        const turretColor = skin.turretColor;

        logger.log(`[Multiplayer] Joining room with customization: ${chassisType}/${cannonType}/${trackType}, skin=${skinId}`);
        const modules = getLocallyEquippedModules();

        this.send(createClientMessage(ClientMessageType.JOIN_ROOM, {
            roomId,
            // Кастомизация
            chassisType,
            cannonType,
            trackType,
            tankColor,
            turretColor,
            modules
        }));
    }

    /**
     * Leave the current game room
     */
    leaveRoom(): void {
        if (!this.connected || !this.roomId) return;

        this.send(createClientMessage(ClientMessageType.LEAVE_ROOM, {}));
        this.roomId = null;
        this._isRoomCreator = false;
        this._roomIsActive = false;
        this._roomPlayersCount = 1; // Сбрасываем счетчик игроков
        this.networkPlayers.clear();
    }

    /**
     * Start the game (only for room creator)
     * @returns True if start request was sent, false if not connected or not in room
     */
    startGame(): boolean {
        if (!this.connected || !this.roomId) {
            logger.warn("[Multiplayer] Cannot start game: not connected or not in room");
            return false;
        }

        if (!this._isRoomCreator) {
            logger.warn("[Multiplayer] Cannot start game: not the room creator");
            return false;
        }

        logger.log(`[Multiplayer] Starting game in room: ${this.roomId}`);
        this.send(createClientMessage(ClientMessageType.START_GAME, {}));
        return true;
    }

    /**
     * Check if current player is the room creator
     * @returns True if player is the room creator
     */
    isRoomCreator(): boolean {
        return this._isRoomCreator;
    }

    /**
     * Check if the current room is active (game is in progress)
     * @returns True if room is active
     */
    isRoomActive(): boolean {
        return this._roomIsActive;
    }

    /**
     * Join matchmaking queue for quick play
     * @param mode - Game mode to queue for
     * @param region - Optional region preference
     */
    quickPlay(mode: GameMode, region?: string): void {
        if (!this.connected) return;

        // КРИТИЧНО: Отправляем mapType и customMapData для кастомных карт
        const mapType = localStorage.getItem("selectedMapType") || "normal";
        let customMapData: any = null;

        const customMapDataStr = localStorage.getItem("selectedCustomMapData");
        if (customMapDataStr) {
            try {
                customMapData = JSON.parse(customMapDataStr);
                logger.log(`[Multiplayer] quickPlay: sending customMapData: ${customMapData?.name}`);
            } catch (e) {
                logger.warn("[Multiplayer] Failed to parse customMapData for quickPlay");
            }
        }

        logger.log(`[Multiplayer] quickPlay: mode=${mode}, region=${region}, mapType=${mapType}`);
        this.send(createClientMessage(ClientMessageType.QUICK_PLAY, { mode, region, mapType, customMapData }));
    }

    /**
     * Request list of available rooms from server
     * @param mode - Optional game mode filter
     */
    requestRoomList(mode?: GameMode): void {
        if (!this.connected) return;

        this.send(createClientMessage(ClientMessageType.LIST_ROOMS, { mode }));
    }

    /**
     * Request list of online players
     */
    getOnlinePlayers(): void {
        if (!this.connected) {
            logger.warn("[Multiplayer] ⚠️ Не могу запросить список игроков - не подключен к серверу");
            return;
        }

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn("[Multiplayer] ⚠️ WebSocket не открыт, состояние:", this.ws?.readyState);
            return;
        }

        logger.log("[Multiplayer] 📡 Отправка запроса списка игроков онлайн...");
        try {
            this.send(createClientMessage(ClientMessageType.GET_ONLINE_PLAYERS, {}));
            logger.log("[Multiplayer] ✅ Запрос отправлен успешно");
        } catch (error) {
            logger.error("[Multiplayer] ❌ Ошибка при отправке запроса:", error);
        }
    }

    /**
     * Cancel matchmaking queue
     */
    cancelQueue(): void {
        if (!this.connected) return;

        this.send(createClientMessage(ClientMessageType.CANCEL_QUEUE, {}));
    }

    /**
     * Send game invite to another player
     * @param targetPlayerId - ID of the player to invite
     * @param gameMode - Optional game mode for the invite
     */
    sendGameInvite(targetPlayerId: string, gameMode?: string): void {
        if (!this.connected) return;

        this.send(createClientMessage(ClientMessageType.GAME_INVITE, {
            targetPlayerId,
            gameMode: gameMode || this.gameMode,
            roomId: this.roomId
        }));
    }

    /**
     * Send client performance metrics to server
     * @param metrics - Client metrics data (FPS, latency, etc.)
     */
    sendClientMetrics(metrics: ClientMetricsData): void {
        if (!this.connected) return;

        this.send(createClientMessage(ClientMessageType.CLIENT_METRICS, metrics));
    }

    // Getters

    /**
     * Check if connected to server
     * @returns True if connected and WebSocket is open
     */
    isConnected(): boolean {
        return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Get current game mode
     * @returns Current game mode or null if not in a game
     */
    getGameMode(): GameMode | null {
        return this.gameMode;
    }

    /**
     * Get current game time from server
     * @returns Game time in milliseconds
     */
    getGameTime(): number {
        return this._gameTime;
    }

    /**
     * Get current room ID
     * @returns Room ID or null if not in a room
     */
    getRoomId(): string | null {
        return this.roomId;
    }

    /**
     * Get current number of players in the room (including local player)
     * @returns Number of players in the room, or 1 if not in a room
     */
    getRoomPlayersCount(): number {
        if (!this.roomId) {
            return 1; // Not in a room, only local player
        }
        // Используем сохраненное значение или fallback на networkPlayers
        // КРИТИЧНО: _roomPlayersCount обновляется из PLAYER_STATES (60 раз в секунду)
        // поэтому это самый актуальный источник информации
        const count = this._roomPlayersCount > 0 ? this._roomPlayersCount : (this.networkPlayers.size + 1);
        // Дополнительная проверка: если networkPlayers больше, используем его (на случай рассинхронизации)
        const networkCount = this.networkPlayers.size + 1;
        return Math.max(count, networkCount);
    }

    /**
     * Get world seed for deterministic generation
     * @returns World seed or null if not available
     */
    getWorldSeed(): number | null {
        return this.worldSeed;
    }

    /**
     * Get map type for world generation
     * @returns Map type or null if not available
     */
    getMapType(): string | null {
        return this.pendingMapType;
    }

    /**
     * Get spawn position for local player (from server)
     * @returns Spawn position or null if not set
     */
    getSpawnPosition(): Vector3 | null {
        if (this._serverSpawnPosition) {
            return new Vector3(
                this._serverSpawnPosition.x,
                this._serverSpawnPosition.y,
                this._serverSpawnPosition.z
            );
        }
        return null;
    }

    /**
     * Get raw server spawn position without Vector3 conversion
     */
    getServerSpawnPositionRaw(): { x: number; y: number; z: number } | null {
        return this._serverSpawnPosition;
    }

    /**
     * Get all network players (excluding local player)
     * @returns Map of player ID to NetworkPlayer
     */
    getNetworkPlayers(): Map<string, NetworkPlayer> {
        return this.networkPlayers;
    }

    /**
     * Get network player by ID
     * @param playerId - Player ID
     * @returns NetworkPlayer or undefined if not found
     */
    getNetworkPlayer(playerId: string): NetworkPlayer | undefined {
        return this.networkPlayers.get(playerId);
    }

    /**
     * Get local player ID
     * @returns Player ID
     */
    getPlayerId(): string {
        return this.playerId;
    }

    /**
     * Get local player name
     * @returns Player name
     */
    getPlayerName(): string {
        return this.playerName;
    }
    /**
     * Get current server URL
     * @returns WebSocket server URL
     */
    getServerUrl(): string {
        return this.serverUrl;
    }



    // Callbacks
    onConnected(callback: () => void): void {
        this.onConnectedCallback = callback;
    }

    onDisconnected(callback: () => void): void {
        this.onDisconnectedCallback = callback;
    }

    onPlayerJoined(callback: (player: PlayerData) => void): void {
        if (!this.onPlayerJoinedCallbacks.includes(callback)) {
            this.onPlayerJoinedCallbacks.push(callback);
        }
    }

    onPlayerLeft(callback: (playerId: string) => void): void {
        if (!this.onPlayerLeftCallbacks.includes(callback)) {
            this.onPlayerLeftCallbacks.push(callback);
        }
    }

    onGameStart(callback: (data: GameStartData) => void): void {
        this.onGameStartCallback = callback;
    }

    onGameEnd(callback: (data: GameEndData) => void): void {
        this.onGameEndCallback = callback;
    }

    onPlayerStates(callback: (players: PlayerData[], isFullState?: boolean) => void): void {
        this.onPlayerStatesCallback = callback;
    }



    onChatMessage(callback: (data: ChatMessageData) => void): void {
        this.onChatMessageCallback = callback;
    }

    onConsumablePickup(callback: (data: ConsumablePickupData) => void): void {
        this.onConsumablePickupCallback = callback;
    }

    onConsumableSpawn(callback: (data: any) => void): void {
        this.onConsumableSpawnCallback = callback;
    }

    onEnemyUpdate(callback: (data: EnemyUpdateData) => void): void {
        this.onEnemyUpdateCallback = callback;
    }

    onSafeZoneUpdate(callback: (data: SafeZoneUpdateData) => void): void {
        this.onSafeZoneUpdateCallback = callback;
    }

    onCTFFlagUpdate(callback: (data: CTFFlagUpdateData) => void): void {
        this.onCTFFlagUpdateCallback = callback;
    }

    onPlayerKilled(callback: (data: PlayerKilledData) => void): void {
        this.onPlayerKilledCallback = callback;
    }

    onPlayerDied(callback: (data: PlayerDiedData) => void): void {
        this.onPlayerDiedCallback = callback;
    }

    onPlayerRespawned(callback: (data: PlayerRespawnedData) => void): void {
        this.onPlayerRespawnedCallback = callback;
    }


    onPlayerDamaged(callback: (data: PlayerDamagedData) => void): void {
        this.onPlayerDamagedCallback = callback;
    }

    onCTFFlagPickup(callback: (data: CTFFlagPickupData) => void): void {
        this.onCTFFlagPickupCallback = callback;
    }

    onCTFFlagCapture(callback: (data: CTFFlagCaptureData) => void): void {
        this.onCTFFlagCaptureCallback = callback;
    }

    onQueueUpdate(callback: (data: QueueUpdateData) => void): void {
        this.onQueueUpdateCallback = callback;
    }

    onMatchFound(callback: (data: MatchFoundData) => void): void {
        this.onMatchFoundCallback = callback;
    }

    onGameInvite(callback: (data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }) => void): void {
        this.onGameInviteCallback = callback;
    }

    onReconciliation(callback: (data: { serverState?: PlayerData; predictedState?: PredictedState; unconfirmedStates?: PredictedState[]; unconfirmedInputs?: PlayerInput[]; positionDiff?: number; rotationDiff?: number; needsReapplication?: boolean }) => void): void {
        this.onReconciliationCallback = callback;
    }

    onRoomCreated(callback: (data: RoomCreatedData) => void): void {
        this.onRoomCreatedCallback = callback;
    }

    onRoomJoined(callback: (data: RoomJoinedData) => void): void {
        this.onRoomJoinedCallback = callback;

        // КРИТИЧНО: Если есть pending данные ROOM_JOINED (callback был установлен позже), вызываем их сразу
        if (this.pendingRoomJoinedData) {
            logger.log(`[Multiplayer] ✅ Вызываю отложенный onRoomJoinedCallback с сохраненными данными`);
            callback(this.pendingRoomJoinedData);
            this.pendingRoomJoinedData = null;
        }
    }

    onRoomList(callback: (rooms: RoomData[]) => void): void {
        // Добавляем callback в массив, если его там еще нет
        if (!this.onRoomListCallbacks.includes(callback)) {
            this.onRoomListCallbacks.push(callback);
            logger.log(`[Multiplayer] ✅ Callback для списка комнат добавлен (всего: ${this.onRoomListCallbacks.length})`);
        }
    }

    onOnlinePlayersList(callback: (data: OnlinePlayersListData) => void): void {
        // Добавляем callback в массив, если его там еще нет
        if (!this.onOnlinePlayersListCallbacks.includes(callback)) {
            this.onOnlinePlayersListCallbacks.push(callback);
            logger.log(`[Multiplayer] ✅ Callback для списка игроков добавлен (всего: ${this.onOnlinePlayersListCallbacks.length})`);
        }
    }

    // === MENU INTEGRATION METHODS ===

    public updateRoomSettings(settings: any): void {
        logger.log("[Multiplayer] Sending UPDATE_ROOM_SETTINGS...", settings);
        // In a real implementation:
        // this.send({ type: ClientMessageType.UPDATE_ROOM_SETTINGS, data: settings });

        // For now, just simulate success for UI feedback
        this.dispatchToast("Настройки комнаты обновлены (симуляция)", "success");
    }


    public sendInvite(friendId: string): void {
        if (!friendId?.trim()) return;
        this.sendGameInvite(friendId.trim());
        logger.log("[Multiplayer] Game invite sent to", friendId);
        this.dispatchToast("Приглашение в игру отправлено", "success");
    }

    onError(callback: (data: ErrorData) => void): void {
        this.onErrorCallback = callback;
    }

    onWallSpawn(callback: (data: WallSpawnData) => void): void {
        this.onWallSpawnCallback = callback;
    }

    private handleWallSpawn(data: WallSpawnData): void {
        if (this.onWallSpawnCallback) {
            this.onWallSpawnCallback(data);
        }
    }

    private send(message: ClientMessage): void {
        try {
            if (!this.ws) {
                logger.warn("[Multiplayer] Cannot send message: WebSocket is null");
                // Queue message for later if critical
                if (this.isCriticalMessage(message.type)) {
                    this.messageQueue.push(message);
                }
                return;
            }

            if (this.ws.readyState !== WebSocket.OPEN) {
                logger.warn(`[Multiplayer] Cannot send message: WebSocket is not open(state: ${this.ws.readyState})`);
                // Queue message for later if critical
                if (this.isCriticalMessage(message.type)) {
                    this.messageQueue.push(message);
                }
                return;
            }

            const serialized = serializeMessage(message);
            // WebSocket.send() accepts both string and ArrayBuffer
            this.ws.send(serialized);

            // Track sent packets
            this.packetsSent++;
        } catch (error) {
            logger.error("[Multiplayer] Error sending message:", error);
            // Log message context for debugging
            if (error instanceof Error) {
                logger.error("[Multiplayer] Message type:", message.type, "Error:", error.message);
            }
        }
    }

    /**
     * Check if message type is critical and should be queued
     */
    private isCriticalMessage(messageType: ClientMessageType): boolean {
        return messageType === ClientMessageType.PLAYER_INPUT ||
            messageType === ClientMessageType.PING ||
            messageType === ClientMessageType.CONNECT;
    }

    /**
     * Process queued messages when connection is established
     */
    private processMessageQueue(): void {
        if (this.messageQueue.length === 0) return;

        logger.log(`[Multiplayer] Processing ${this.messageQueue.length} queued messages`);
        const messages = [...this.messageQueue];
        this.messageQueue = [];

        for (const message of messages) {
            this.send(message);
        }
    }

    /**
     * Determine if we should reconnect based on close code
     * WebSocket close codes: https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
     */
    private shouldReconnectOnClose(closeCode: number): boolean {
        // Don't reconnect on normal closure (1000) or going away (1001)
        if (closeCode === 1000 || closeCode === 1001) {
            return false;
        }

        // Don't reconnect on protocol errors (1002), unsupported data (1003), or no status (1005)
        if (closeCode === 1002 || closeCode === 1003 || closeCode === 1005) {
            return false;
        }

        // Reconnect on abnormal closure (1006), server error (1011), or service restart (1012)
        // Also reconnect on unknown codes (likely network issues)
        return true;
    }

    /**
     * Reset reconnect attempts counter (useful after successful connection)
     * This is called automatically on successful connection
     */
    resetReconnectAttempts(): void {
        this.reconnectAttempts = 0;
        this._reconnectDelay = 1000;
        logger.log("[Multiplayer] Reconnect attempts counter reset");
    }

    /**
     * Get respawn delay for current game mode
     * @returns Respawn delay in seconds (death screen duration)
     */
    getRespawnDelay(): number {
        // 3 seconds for death screen, then 2 seconds for respawn animation
        // 3 seconds for death screen, then 2 seconds for respawn animation
        return 3;
    }

    sendRpc(event: string, payload: any): void {
        const data: RpcEventData = {
            event,
            payload,
            sourceId: this.playerId,
            timestamp: Date.now()
        };
        this.send({
            type: ClientMessageType.RPC,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Обработка уведомления о том, что игрок говорит по радио
     */
    private handleVoiceTalking(data: { playerId: string; talking: boolean; playerName?: string }): void {
        // Пропускаем уведомления о себе
        if (data.playerId === this.playerId) {
            return;
        }

        const networkPlayer = this.networkPlayers.get(data.playerId);
        const playerName = data.playerName || networkPlayer?.name || "Игрок";

        // Показываем уведомление в HUD
        const game = (window as any).gameInstance;
        if (game && game.hud) {
            if (data.talking) {
                game.hud.showNotification(`📻 ${playerName} говорит по радио`, "info");
            }
        }
    }

    onRpc(callback: (data: RpcEventData) => void) {
        this.onRpcCallback = callback;
    }
}

