import { Vector3 } from "@babylonjs/core";
import { createClientMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage, ClientMetricsData, PingData, PongData, PlayerStatesData, ChatMessageData, ConsumablePickupData, ErrorData, OnlinePlayersListData } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { PlayerData, PlayerInput, GameMode, PredictedState, ClientPredictionState, NetworkMetrics, ProjectileData, EnemyData, FlagData, Vector3Data } from "../shared/types";
import { nanoid } from "nanoid";
import { logger } from "./utils/logger";
import { firebaseService } from "./firebaseService";

/**
 * Safely convert any position object to Vector3
 * Handles both Vector3 instances and plain {x, y, z} objects from JSON
 */
function toVector3(pos: any): Vector3 {
    if (!pos) return new Vector3(0, 0, 0);
    if (pos instanceof Vector3) return pos.clone();
    return new Vector3(pos.x || 0, pos.y || 0, pos.z || 0);
}

/**
 * Safely clone a position (works with both Vector3 and plain objects)
 */
function clonePosition(pos: any): Vector3 {
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

export interface PlayerDamagedData {
    playerId: string;
    damage: number;
    attackerId?: string;
    health: number;
    maxHealth: number;
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

export interface NetworkPlayer {
    id: string;
    name: string;
    position: Vector3;
    rotation: number;
    turretRotation: number;
    aimPitch: number;
    health: number;
    maxHealth: number;
    status: "alive" | "dead" | "spectating";
    team?: number;
    // Tank customization
    chassisType?: string;
    cannonType?: string;
    tankColor?: string;
    turretColor?: string;
    // For interpolation (linear)
    lastPosition: Vector3;
    lastRotation: number;
    lastTurretRotation: number;
    interpolationTime: number;
    // For cubic interpolation (spline)
    positionHistory: Vector3[]; // Last 3 positions for cubic spline
    rotationHistory: number[]; // Last 3 rotations
    turretRotationHistory: number[]; // Last 3 turret rotations
    // For dead reckoning (extrapolation)
    velocity: Vector3; // Calculated velocity for extrapolation
    angularVelocity: number; // Rotation speed
    turretAngularVelocity: number; // Turret rotation speed
    lastUpdateTime: number; // Timestamp of last network update
    // Interpolation settings
    interpolationDelay: number; // Adaptive delay based on ping (ms)
}

/**
 * Автоматически определяет WebSocket URL на основе текущего hostname
 * Если игра загружена с 192.168.3.4:5000, вернет ws://192.168.3.4:8080
 * Если игра загружена с localhost:5000, вернет ws://localhost:8080
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

function getWebSocketUrl(defaultPort: number = 8080): string {
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

    // Если hostname localhost или 127.0.0.1, используем localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const url = `ws://localhost:${defaultPort}`;
        logger.log(`[Multiplayer] Auto-detected WebSocket URL (localhost): ${url}`);
        return url;
    }

    // Иначе используем тот же hostname, что и для игры
    const url = `${protocol}//${hostname}:${defaultPort}`;
    logger.log(`[Multiplayer] Auto-detected WebSocket URL (from hostname ${hostname}): ${url}`);
    return url;
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
        console.log(`[Multiplayer] 🔍 Проверка localStorage: ключ=${STORAGE_KEY}, значение=${savedId}`);

        if (savedId && savedId.length > 0) {
            console.log(`[Multiplayer] ✅ Используем сохраненный ID игрока: ${savedId}`);
            logger.log(`[Multiplayer] Используем сохраненный ID игрока: ${savedId}`);
            return savedId;
        }

        // Если нет сохраненного ID - создаем новый
        const newId = nanoid();
        localStorage.setItem(STORAGE_KEY, newId);
        console.log(`[Multiplayer] 🆕 Создан новый ID игрока и сохранен в localStorage: ${newId}`);
        logger.log(`[Multiplayer] Создан новый ID игрока и сохранен: ${newId}`);

        // Проверяем, что действительно сохранилось
        const verifyId = localStorage.getItem(STORAGE_KEY);
        if (verifyId !== newId) {
            console.error(`[Multiplayer] ❌ ОШИБКА: ID не сохранился! Ожидалось: ${newId}, получено: ${verifyId}`);
        } else {
            console.log(`[Multiplayer] ✅ ID успешно сохранен и проверен: ${verifyId}`);
        }

        return newId;
    } catch (error) {
        // Если localStorage недоступен (например, в приватном режиме) - создаем временный ID
        console.error(`[Multiplayer] ❌ Ошибка localStorage:`, error);
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
        rtt: 100, // Default 100ms
        jitter: 0,
        packetLoss: 0,
        lastPingTime: 0,
        pingHistory: []
    };
    private pingInterval: NodeJS.Timeout | null = null;
    private pingSequence: number = 0;
    private lastPongTime: number = 0;
    
    // КРИТИЧНО: Трекинг времени отправки PING по sequence number
    // Это позволяет корректно вычислять RTT независимо от расхождения часов
    private pingSendTimes: Map<number, number> = new Map();
    private pongTimeout: number = 30000; // 30 seconds timeout - fallback только если нет НИКАКИХ сообщений от сервера
    private healthCheckInterval: NodeJS.Timeout | null = null;

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
    private jitterBufferTargetDelay: number = 50; // Initial target delay (ms) - увеличено для стабильности
    private jitterBufferMaxSize: number = 300; // Maximum buffer size - увеличено для предотвращения overflow
    private lastProcessedSequence: number = -1;
    private jitterBufferNeedsSort: boolean = false; // Flag to avoid unnecessary sorts

    // Callbacks
    private onConnectedCallback: (() => void) | null = null;
    private onDisconnectedCallback: (() => void) | null = null;
    private onPlayerJoinedCallback: ((player: PlayerData) => void) | null = null;
    private onPlayerLeftCallback: ((playerId: string) => void) | null = null;
    private onGameStartCallback: ((data: GameStartData) => void) | null = null;
    private onGameEndCallback: ((data: GameEndData) => void) | null = null;
    private onPlayerStatesCallback: ((players: PlayerData[]) => void) | null = null;
    private onProjectileSpawnCallback: ((data: ProjectileSpawnData) => void) | null = null;
    private onChatMessageCallback: ((data: ChatMessageData) => void) | null = null;
    private onConsumablePickupCallback: ((data: ConsumablePickupData) => void) | null = null;
    private onEnemyUpdateCallback: ((data: EnemyUpdateData) => void) | null = null;
    private onSafeZoneUpdateCallback: ((data: SafeZoneUpdateData) => void) | null = null;
    private onCTFFlagUpdateCallback: ((data: CTFFlagUpdateData) => void) | null = null;
    private onPlayerKilledCallback: ((data: PlayerKilledData) => void) | null = null;
    private onPlayerDiedCallback: ((data: PlayerDiedData) => void) | null = null;
    private onPlayerDamagedCallback: ((data: PlayerDamagedData) => void) | null = null;
    private onCTFFlagPickupCallback: ((data: CTFFlagPickupData) => void) | null = null;
    private onCTFFlagCaptureCallback: ((data: CTFFlagCaptureData) => void) | null = null;
    private onQueueUpdateCallback: ((data: QueueUpdateData) => void) | null = null;
    private onMatchFoundCallback: ((data: MatchFoundData) => void) | null = null;
    private onGameInviteCallback: ((data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }) => void) | null = null;
    private onReconciliationCallback: ((data: { serverState?: PlayerData; predictedState?: PredictedState; unconfirmedStates?: PredictedState[]; positionDiff?: number; rotationDiff?: number; needsReapplication?: boolean }) => void) | null = null;
    private onRoomCreatedCallback: ((data: RoomCreatedData) => void) | null = null;
    private onRoomJoinedCallback: ((data: RoomJoinedData) => void) | null = null;
    private pendingRoomJoinedData: RoomJoinedData | null = null; // Буфер для ROOM_JOINED если callback еще не установлен
    private onRoomListCallbacks: Array<(rooms: RoomData[]) => void> = []; // Поддержка нескольких callbacks
    private onOnlinePlayersListCallbacks: Array<(players: OnlinePlayersListData) => void> = []; // Поддержка нескольких callbacks
    private onWallSpawnCallback: ((data: WallSpawnData) => void) | null = null;
    private onErrorCallback: ((data: ErrorData) => void) | null = null;

    constructor(serverUrl?: string, autoConnect: boolean = false) {
        // Если serverUrl не указан, автоматически определяем его
        this.serverUrl = serverUrl || getWebSocketUrl();
        if (autoConnect) {
            this.connect(this.serverUrl);
        }
    }

    connect(serverUrl: string): void {
        this.serverUrl = serverUrl;

        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            logger.warn("[Multiplayer] Connection attempt already in progress");
            return;
        }

        // If already connected, don't reconnect
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.warn("[Multiplayer] Already connected");
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

            // Убеждаемся, что используется правильный протокол
            if (!normalizedUrl.startsWith('ws://') && !normalizedUrl.startsWith('wss://')) {
                // Если протокол не указан, добавляем ws://
                normalizedUrl = `ws://${normalizedUrl}`;
            }

            // Validate URL format
            if (!validateWebSocketUrl(normalizedUrl)) {
                logger.error(`[Multiplayer] Invalid WebSocket URL format: ${normalizedUrl}`);
                this.isConnecting = false;
                return;
            }

            logger.log("[Multiplayer] Connecting to:", normalizedUrl);
            this.isConnecting = true;
            this.ws = new WebSocket(normalizedUrl);

            // Set connection timeout (10 seconds)
            this.connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    logger.error("[Multiplayer] Connection timeout - closing connection");
                    this.isConnecting = false;
                    this.ws.close();
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
                this.connected = true;
                this.isConnecting = false;
                // Reset reconnect state on successful connection
                this.resetReconnectAttempts();
                this.isManualDisconnect = false; // Reset manual disconnect flag on successful connection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                await this.sendConnect();

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

                logger.log("[Multiplayer] Disconnected from server", event.code, event.reason);
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

                // Handle different close codes
                const shouldReconnect = this.shouldReconnectOnClose(event.code);

                // Auto-reconnect if not manual disconnect, should reconnect, and not exceeded max attempts
                if (!this.isManualDisconnect && shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
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
                logger.error("[Multiplayer] WebSocket error:", error);
                // Выводим более подробную информацию об ошибке
                if (error instanceof Error) {
                    logger.error("[Multiplayer] Error message:", error.message);
                }
                // Проверяем, не является ли это ошибкой upgrade
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    logger.error("[Multiplayer] Connection failed. Check:");
                    logger.error("  1. Server is running on", this.serverUrl);
                    logger.error("  2. Firewall allows connection on port", this.serverUrl.split(':')[2] || '8080');
                    logger.error("  3. URL format is correct (ws://host:port)");
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
        this.jitterBufferTargetDelay = 50;

        // Clear message queue
        this.messageQueue = [];
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
        this.onPlayerJoinedCallback = null;
        this.onPlayerLeftCallback = null;
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
        this.onErrorCallback = null;

        // Reset network metrics
        this.networkMetrics = {
            rtt: 100,
            jitter: 0,
            packetLoss: 0,
            lastPingTime: 0,
            pingHistory: []
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
            rtt: 100,
            jitter: 0,
            packetLoss: 0,
            lastPingTime: 0,
            pingHistory: []
        };

        // Reset sequence numbers
        this.currentSequence = 0;
        this.pingSequence = 0;
        this.lastProcessedSequence = -1;

        // Reset jitter buffer
        this.jitterBufferTargetDelay = 50;
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

            // ДИАГНОСТИКА: Логируем отправляемый ID
            console.log(`[Multiplayer] 📤 Отправляем CONNECT с ID: ${this.playerId}, имя: ${this.playerName}`);
            logger.log(`[Multiplayer] Sending CONNECT with playerId: ${this.playerId}, playerName: ${this.playerName}`);

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
            if (data instanceof Blob) {
                // Проверяем размер Blob - если пустой, пропускаем
                if (data.size === 0) {
                    logger.warn("[Multiplayer] Received empty Blob, skipping");
                    return;
                }
                
                // Увеличиваем timeout до 10 секунд для больших Blob
                const timeoutPromise = new Promise<ArrayBuffer>((_, reject) => {
                    setTimeout(() => reject(new Error("Blob conversion timeout")), 10000);
                });

                Promise.race([
                    data.arrayBuffer(),
                    timeoutPromise
                ]).then(buffer => {
                    if (buffer.byteLength === 0) {
                        logger.warn("[Multiplayer] Converted Blob is empty, skipping");
                        return;
                    }
                    this.handleMessage(buffer);
                }).catch(error => {
                    // Логируем только один раз в секунду, чтобы не спамить
                    const now = Date.now();
                    if (!this._lastBlobErrorTime || (now - this._lastBlobErrorTime) > 1000) {
                        logger.error("[Multiplayer] Error converting Blob to ArrayBuffer:", error);
                        if (error instanceof Error && error.message === "Blob conversion timeout") {
                            // Если маленький Blob (< 1000 байт) завис, возможно это поврежденные данные - пропускаем
                            if (data.size < 1000) {
                                logger.warn(`[Multiplayer] Пропускаем зависший маленький Blob (${data.size} bytes) - возможно поврежденные данные`);
                                return;
                            }
                            logger.error(`[Multiplayer] Blob conversion timed out after 10 seconds (size: ${data.size} bytes)`);
                        }
                        this._lastBlobErrorTime = now;
                    }
                });
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

                case ServerMessageType.ENEMY_UPDATE:
                    this.handleEnemyUpdate(message.data);
                    break;

                case ServerMessageType.VOICE_PLAYER_JOINED:
                case ServerMessageType.VOICE_PLAYER_LEFT:
                    // Forward to voice chat manager
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if ((window as any).voiceChatManager) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (window as any).voiceChatManager.handleSignalingMessage(message);
                    }
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

                default:
                    logger.warn(`[Multiplayer] Unknown message type: ${message.type}`);
            }
        } catch (error) {
            // Улучшенное логирование ошибок - только раз в 10 секунд для уменьшения спама
            const now = Date.now();
            if (!this._lastErrorLogTime || now - this._lastErrorLogTime > 10000) {
                logger.error("[Multiplayer] Error handling message:", error instanceof Error ? error.message : error);
                if (error instanceof Error && error.stack) {
                    console.error("[Multiplayer] Stack:", error.stack);
                }
                this._lastErrorLogTime = now;
            }
        }
    }

    private handleConnected(data: ConnectedData): void {
        this.connected = true;

        console.log(`[Multiplayer] 📥 Получен CONNECTED от сервера: playerId=${data.playerId}, playerName=${data.playerName}`);
        console.log(`[Multiplayer] 📥 Текущий локальный ID: ${this.playerId}`);

        // КРИТИЧНО: Синхронизация времени с сервером
        // serverTimeOffset = serverTime - clientTime
        // Добавляем к Date.now() чтобы получить серверное время
        if ((data as any).serverTime) {
            this.serverTimeOffset = (data as any).serverTime - Date.now();
            console.log(`[Multiplayer] 🕐 Server time offset: ${this.serverTimeOffset}ms`);
            logger.log(`[Multiplayer] Server time offset calculated: ${this.serverTimeOffset}ms`);
        }

        // Обновляем ID игрока с сервера (если сервер присвоил новый ID)
        const newPlayerId = data.playerId || this.playerId;
        if (newPlayerId !== this.playerId) {
            console.warn(`[Multiplayer] ⚠️ Сервер изменил ID: было ${this.playerId}, стало ${newPlayerId}`);
            // Сохраняем новый ID в localStorage
            const STORAGE_KEY = "tx_player_id";
            try {
                localStorage.setItem(STORAGE_KEY, newPlayerId);
                console.log(`[Multiplayer] ✅ ID игрока обновлен и сохранен в localStorage: ${newPlayerId}`);
                logger.log(`[Multiplayer] ID игрока обновлен и сохранен: ${newPlayerId}`);

                // Проверяем сохранение
                const verifyId = localStorage.getItem(STORAGE_KEY);
                if (verifyId !== newPlayerId) {
                    console.error(`[Multiplayer] ❌ ОШИБКА: ID не сохранился! Ожидалось: ${newPlayerId}, получено: ${verifyId}`);
                }
            } catch (error) {
                console.error(`[Multiplayer] ❌ Ошибка сохранения ID в localStorage:`, error);
                logger.warn("[Multiplayer] Не удалось сохранить новый ID в localStorage", error);
            }
        } else {
            console.log(`[Multiplayer] ✅ Сервер подтвердил наш ID: ${this.playerId}`);
        }
        this.playerId = newPlayerId;

        // Обновляем имя игрока с сервера (сервер может изменить его для гостей)
        if (data.playerName) {
            this.playerName = data.playerName;
            savePlayerName(data.playerName); // Сохраняем имя в localStorage
            console.log(`[Multiplayer] ✅ Имя игрока установлено и сохранено: ${this.playerName}`);
            logger.log(`[Multiplayer] Player name set to: ${this.playerName}`);
        }
        console.log(`[Multiplayer] ✅ Подключен как ${this.playerId} (${this.playerName})`);
        logger.log(`[Multiplayer] Connected as ${this.playerId} (${this.playerName})`);

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
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Reset last pong time
        this.lastPongTime = Date.now();

        // Send ping every 1000ms
        this.pingInterval = setInterval(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendPing();
            } else {
                // Stop ping if not connected
                if (this.pingInterval) {
                    clearInterval(this.pingInterval);
                    this.pingInterval = null;
                }
            }
        }, 1000);

        // Start health check (check every 2 seconds)
        this.healthCheckInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 2000);

        // Send initial ping
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
        const sequence = pongData.sequence;
        const sendTime = this.pingSendTimes.get(sequence);
        
        if (!sendTime) {
            // Если нет записи о времени отправки - игнорируем (старый или дубликат пакета)
            logger.warn(`[Multiplayer] ⚠️ PONG received for unknown sequence ${sequence}, ignoring`);
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
        if ((pongData as any).serverTime) {
            const newOffset = (pongData as any).serverTime - currentTime;
            // Плавное обновление offset: 90% старое значение + 10% новое
            this.serverTimeOffset = this.serverTimeOffset * 0.9 + newOffset * 0.1;
        }

        // Update RTT history (only for valid RTT values)
        if (!isSuspiciousRTT) {
            this.networkMetrics.pingHistory.push(rtt);
            if (this.networkMetrics.pingHistory.length > 10) {
                this.networkMetrics.pingHistory.shift();
            }
        }

        // Calculate exponential weighted moving average (EWMA)
        // При подозрительном RTT используем меньший вес (0.05 вместо 0.125)
        const alpha = isSuspiciousRTT ? 0.05 : 0.125;
        this.networkMetrics.rtt = (1 - alpha) * this.networkMetrics.rtt + alpha * rtt;

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
            if (variations.length > 0) {
                this.networkMetrics.jitter = variations.reduce((a, b) => a + b, 0) / variations.length;
            }
        }
    }

    /**
     * Start metrics tracking
     */
    private startMetricsTracking(): void {
        // Clear existing interval
        if (this.metricsUpdateInterval) {
            clearInterval(this.metricsUpdateInterval);
        }

        // Update metrics every second
        this.metricsUpdateInterval = setInterval(() => {
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

            // Store history (keep last 10 seconds)
            this.packetsSentHistory.push({ timestamp: now, count: packetsSentPerSecond });
            this.packetsReceivedHistory.push({ timestamp: now, count: packetsReceivedPerSecond });

            // Remove old history entries (older than 10 seconds)
            const historyThreshold = now - 10000;
            this.packetsSentHistory = this.packetsSentHistory.filter(h => h.timestamp > historyThreshold);
            this.packetsReceivedHistory = this.packetsReceivedHistory.filter(h => h.timestamp > historyThreshold);

            // Calculate average packets per second
            const avgSent = this.packetsSentHistory.reduce((sum, h) => sum + h.count, 0) / this.packetsSentHistory.length || 0;
            const avgReceived = this.packetsReceivedHistory.reduce((sum, h) => sum + h.count, 0) / this.packetsReceivedHistory.length || 0;

            // Estimate packet loss based on ping history (simplified)
            if (this.networkMetrics.pingHistory.length > 0) {
                const avgRTT = this.networkMetrics.pingHistory.reduce((a, b) => a + b, 0) / this.networkMetrics.pingHistory.length;
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
        
        console.log(`%c[Multiplayer] 🔑 ROOM_CREATED: roomId установлен`, 'color: #22c55e; font-weight: bold;', {
            oldRoomId: oldRoomId,
            newRoomId: this.roomId,
            dataRoomId: data.roomId,
            mode: data.mode,
            playersCount: this._roomPlayersCount
        });
        
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

        console.log(`%c[Multiplayer] 🔑 ROOM_JOINED: roomId установлен`, 'color: #22c55e; font-weight: bold;', {
            oldRoomId: oldRoomId,
            newRoomId: this.roomId,
            dataRoomId: data.roomId,
            playersCount: data.players?.length || 0,
            isActive: data.isActive,
            isCreator: data.isCreator
        });

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
            console.log(`%c[Multiplayer] 📥 ROOM_JOINED: получено ${data.players.length} игроков`, 'color: #3b82f6; font-weight: bold;', {
                roomId: this.roomId,
                playersCount: data.players.length,
                localPlayerId: this.playerId,
                players: data.players.map((p: any) => `${p.name || p.id}(${p.id})`)
            });
            
            for (const playerData of data.players) {
                if (playerData.id !== this.playerId) {
                    console.log(`%c[Multiplayer] ➕ Добавляю игрока из ROOM_JOINED: ${playerData.name || playerData.id}(${playerData.id})`, 'color: #22c55e; font-weight: bold;');
                    this.addNetworkPlayer(playerData);
                } else {
                    console.log(`%c[Multiplayer] ⏭️ Пропускаю локального игрока: ${playerData.id}`, 'color: #888;');
                }
            }
        } else {
            console.warn(`%c[Multiplayer] ⚠️ ROOM_JOINED: нет данных об игроках!`, 'color: #f59e0b; font-weight: bold;');
        }

        logger.log(`[Multiplayer] Joined room: ${this.roomId}, seed: ${data.worldSeed}, isCreator: ${this._isRoomCreator}, isActive: ${this._roomIsActive}`);
        // Выводим номер комнаты в консоль с форматированием
        logger.log(`[Multiplayer] Joined room: ${this.roomId}, players: ${this._roomPlayersCount}, active: ${this._roomIsActive}, networkPlayers.size=${this.networkPlayers.size}`);

        // КРИТИЧНО: Сохраняем данные в буфер на случай, если callback еще не установлен
        this.pendingRoomJoinedData = data;
        
        // Вызываем callback для обработки ROOM_JOINED
        if (this.onRoomJoinedCallback) {
            this.onRoomJoinedCallback(data);
            this.pendingRoomJoinedData = null; // Очищаем буфер после успешного вызова
        } else {
            // Callback еще не установлен - сохраняем данные для последующего вызова
            logger.log(`[Multiplayer] ⏳ onRoomJoinedCallback еще не установлен, сохраняем данные для последующего вызова (roomId=${this.roomId}, players=${data.players?.length || 0})`);
        }
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
            if (this.onPlayerJoinedCallback) {
                this.onPlayerJoinedCallback(player);
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
            if (this.onPlayerLeftCallback) {
                this.onPlayerLeftCallback(playerId);
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
        const networkPlayersCount = statesData.players?.filter((p: any) => p.id !== this.playerId).length || 0;
        
        // КРИТИЧНО: Логируем только каждые 1800 пакетов (раз в 30 секунд при 60 FPS)
        if (serverSequence >= 0 && serverSequence % 1800 === 0) {
            console.log(`[Multiplayer] 📡 PLAYER_STATES #${serverSequence}: ${playersCount} players, ${networkPlayersCount} network, room=${this.roomId}`);
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
        // Логируем раз в секунду (каждые 60 пакетов при 60Hz)
        if (serverSequence % 60 === 0 || networkPlayersCount !== this.networkPlayers.size) {
            logger.log(`[Multiplayer] 📊 PLAYER_STATES: players=${playersCount}, networkPlayers=${networkPlayersCount}, roomId=${this.roomId || 'N/A'}, worldSeed=${this.worldSeed || 'N/A'}, mapType=${this.pendingMapType || 'N/A'}, networkPlayers.size=${this.networkPlayers.size}`);
            if (networkPlayersCount > 0) {
                const playerIds = statesData.players?.filter((p: any) => p.id !== this.playerId).map((p: any) => p.id || 'unknown').join(', ') || 'none';
                logger.log(`[Multiplayer] 📊 Другие игроки в PLAYER_STATES: [${playerIds}]`);
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
        const rtts = this.networkMetrics.pingHistory;
        const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        const variance = rtts.reduce((sum, rtt) => sum + Math.pow(rtt - mean, 2), 0) / rtts.length;
        const jitter = Math.sqrt(variance);
        this.networkMetrics.jitter = jitter;

        // Adaptive delay: base delay + (jitter * 2) for safety margin
        const baseDelay = 30; // Base delay for low jitter networks
        this.jitterBufferTargetDelay = baseDelay + (jitter * 2);

        // Clamp to reasonable bounds (30ms - 200ms)
        this.jitterBufferTargetDelay = Math.max(30, Math.min(200, this.jitterBufferTargetDelay));
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
        this.jitterBuffer = validEntries.filter(entry => !readyEntries.includes(entry));

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
        const rawPlayers = statesData.players || [];

        const players = rawPlayers.filter((p) => {
            if (!p || !p.position) {
                logger.warn(`[Multiplayer] Dropping player state: missing player or position for ${p?.id || 'unknown'}`);
                return false;
            }
            const { x, y, z } = p.position;
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                logger.warn("[Multiplayer] Dropping player state with NaN/Infinity position", p.id);
                return false;
            }
            // Ограничение по радиусу карты (защита от телепортов далеко за пределы мира)
            const MAX_RADIUS = 10000;
            const MAX_HEIGHT = 2000;
            if (Math.abs(x) > MAX_RADIUS || Math.abs(z) > MAX_RADIUS || Math.abs(y) > MAX_HEIGHT) {
                logger.warn("[Multiplayer] Dropping player state with out-of-bounds position", p.id, p.position);
                return false;
            }
            return true;
        });

        // ДИАГНОСТИКА: Логируем количество игроков после фильтрации
        logger.log(`[Multiplayer] applyPlayerStates: ${players.length} players after filtering (dropped ${rawPlayers.length - players.length})`);

        const gameTime = statesData.gameTime || 0;
        const serverSequence = statesData.serverSequence;

        // КРИТИЧНО: Очистка networkPlayers от локального игрока и игроков, которых нет в списке
        const validPlayerIds = new Set(players.map(p => p.id).filter(id => id !== this.playerId));
        const playersToRemove: string[] = [];

        this.networkPlayers.forEach((np, id) => {
            // Удаляем локального игрока, если он попал в networkPlayers
            if (id === this.playerId) {
                playersToRemove.push(id);
                logger.warn(`[Multiplayer] ❌ Found local player (${id}) in networkPlayers! Removing...`);
            }
            // Удаляем игроков, которых нет в текущем списке (возможно, они отключились)
            // НО: не удаляем сразу, так как они могут быть в процессе отключения
            // Вместо этого просто не обновляем их
        });

        // Удаляем найденных игроков
        playersToRemove.forEach(id => {
            this.networkPlayers.delete(id);
            logger.log(`[Multiplayer] ✅ Removed invalid player ${id} from networkPlayers`);
        });

        // ДИАГНОСТИКА: Логируем детальную информацию перед обработкой
        const localPlayerInList = players.find(p => p.id === this.playerId);
        const networkPlayersInList = players.filter(p => p.id !== this.playerId);
        const currentNetworkPlayersSize = this.networkPlayers.size;
        
        // Убрано для уменьшения спама в логах
        // console.log(`%c[Multiplayer] 🔍 applyPlayerStates: Обработка игроков`, 'color: #3b82f6; font-weight: bold;', {
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
                    console.log(`%c[Multiplayer] ✅ Добавлен новый networkPlayer: ${playerData.name || playerData.id}(${playerData.id})`, 'color: #22c55e; font-weight: bold;');
                } else {
                    updatedCount++;
                }
            }
        }
        
        // ДИАГНОСТИКА: Логируем результат обработки
        const finalNetworkPlayersSize = this.networkPlayers.size;
        if (addedCount > 0 || finalNetworkPlayersSize !== currentNetworkPlayersSize) {
            console.log(`%c[Multiplayer] 📊 applyPlayerStates результат: добавлено=${addedCount}, обновлено=${updatedCount}, было=${currentNetworkPlayersSize}, стало=${finalNetworkPlayersSize}`, 'color: #8b5cf6; font-weight: bold;');
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
        const savedLocalPlayer = players.find(p => p.id === this.playerId);
        const savedNetworkPlayers = players.filter(p => p.id !== this.playerId);
        logger.log(`[Multiplayer] applyPlayerStates: Saved ${players.length} players to lastPlayerStates:`);
        logger.log(`  - Local player: ${savedLocalPlayer ? `YES (${savedLocalPlayer.name || savedLocalPlayer.id})` : 'NO'}`);
        logger.log(`  - Network players: ${savedNetworkPlayers.length} (${savedNetworkPlayers.map(p => `${p.name || p.id}(${p.id})`).join(', ')})`);
        logger.log(`[Multiplayer] applyPlayerStates: Processing ${players.length} players, callback set: ${!!this.onPlayerStatesCallback}, saved to lastPlayerStates`);

        if (this.onPlayerStatesCallback) {
            try {
                this.onPlayerStatesCallback(players);
            } catch (error) {
                console.error(`[Multiplayer] ❌ ОШИБКА в onPlayerStatesCallback:`, error);
            }
        }
    }

    private handleProjectileSpawn(data: ProjectileSpawnData): void {
        if (this.onProjectileSpawnCallback) {
            this.onProjectileSpawnCallback(data);
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
            console.warn(`%c[Multiplayer] ❌ BLOCKED: Попытка добавить локального игрока в networkPlayers!`, 'color: #ef4444; font-weight: bold;');
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

        const initialPos = new Vector3(x, y, z);
        const networkPlayer: NetworkPlayer = {
            id: playerData.id,
            name: playerData.name || "Unknown",
            position: initialPos.clone(),
            rotation: rotation,
            turretRotation: turretRotation,
            aimPitch: aimPitch,
            health: health,
            maxHealth: maxHealth,
            status: playerData.status || "alive", // КРИТИЧНО: По умолчанию "alive"
            team: playerData.team,
            // Tank customization
            chassisType: playerData.chassisType,
            cannonType: playerData.cannonType,
            tankColor: playerData.tankColor,
            turretColor: playerData.turretColor,
            // Linear interpolation (backward compatibility)
            lastPosition: initialPos.clone(),
            lastRotation: rotation,
            lastTurretRotation: turretRotation,
            interpolationTime: 0,
            // Cubic interpolation (spline)
            positionHistory: [initialPos.clone(), initialPos.clone(), initialPos.clone()],
            rotationHistory: [rotation, rotation, rotation],
            turretRotationHistory: [turretRotation, turretRotation, turretRotation],
            // Dead reckoning (extrapolation)
            velocity: new Vector3(0, 0, 0),
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
            // Если нет позиции, но есть existingPlayer - используем его позицию
            const existingPlayer = this.networkPlayers.get(playerData.id);
            if (existingPlayer) {
                x = existingPlayer.position.x;
                y = existingPlayer.position.y;
                z = existingPlayer.position.z;
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
        if (!networkPlayer.velocity) {
            networkPlayer.velocity = new Vector3(0, 0, 0);
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
            // Fallback: calculate velocity from position delta
            const posDelta = new Vector3(x, y, z).subtract(networkPlayer.position);
            networkPlayer.velocity = posDelta.scale(1 / deltaTime); // Scale mutates, but that's OK here

            // Calculate angular velocities
            let rotDiff = rotation - networkPlayer.rotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            networkPlayer.angularVelocity = rotDiff / deltaTime;

            let turretDiff = turretRotation - networkPlayer.turretRotation;
            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
            networkPlayer.turretAngularVelocity = turretDiff / deltaTime;
        } else {
            // Reset velocity if deltaTime is invalid
            networkPlayer.velocity.set(0, 0, 0);
            networkPlayer.angularVelocity = 0;
            networkPlayer.turretAngularVelocity = 0;
        }

        // Store previous state for interpolation (safely handle both Vector3 and plain objects)
        const currentPos = toVector3(networkPlayer.position);
        if (networkPlayer.lastPosition instanceof Vector3) {
            networkPlayer.lastPosition.copyFrom(currentPos);
        } else {
            networkPlayer.lastPosition = currentPos.clone();
        }
        networkPlayer.lastRotation = networkPlayer.rotation;
        networkPlayer.lastTurretRotation = networkPlayer.turretRotation;

        // Update position history for cubic interpolation (keep last 3 positions)
        networkPlayer.positionHistory.shift(); // Remove oldest
        networkPlayer.positionHistory.push(toVector3(networkPlayer.position)); // Add current before update
        networkPlayer.rotationHistory.shift();
        networkPlayer.rotationHistory.push(networkPlayer.rotation);
        networkPlayer.turretRotationHistory.shift();
        networkPlayer.turretRotationHistory.push(networkPlayer.turretRotation);

        // Update to new state
        networkPlayer.position.set(x, y, z);
        networkPlayer.rotation = rotation;
        networkPlayer.turretRotation = turretRotation;
        networkPlayer.aimPitch = aimPitch;
        networkPlayer.health = health;
        networkPlayer.maxHealth = maxHealth;
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
        if (playerData.chassisType !== undefined) networkPlayer.chassisType = playerData.chassisType;
        if (playerData.cannonType !== undefined) networkPlayer.cannonType = playerData.cannonType;
        if (playerData.tankColor !== undefined) networkPlayer.tankColor = playerData.tankColor;
        if (playerData.turretColor !== undefined) networkPlayer.turretColor = playerData.turretColor;

        // Update timestamp
        networkPlayer.lastUpdateTime = currentTime;

        // Reset interpolation timer
        networkPlayer.interpolationTime = 0;

        // Update adaptive interpolation delay based on ping
        // ОПТИМИЗИРОВАНО: Уменьшены задержки для более отзывчивого отображения
        const rtt = this.networkMetrics.rtt;
        if (rtt < 50) {
            networkPlayer.interpolationDelay = 20; // Low ping: very fast interpolation
        } else if (rtt < 100) {
            networkPlayer.interpolationDelay = 35; // Medium ping: fast
        } else if (rtt < 150) {
            networkPlayer.interpolationDelay = 50; // Higher ping: normal
        } else {
            networkPlayer.interpolationDelay = 60; // High ping: smoothed but responsive
        }
    }

    // Public API

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
            
            // ДИАГНОСТИКА: Логируем отправку позиции каждые 60 кадров (1 раз в секунду при 60 FPS)
            if (sequence % 60 === 0 && this._lastKnownLocalPosition) {
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
            position: this._lastKnownLocalPosition?.clone() || new Vector3(0, 0, 0),
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
            state.position = position.clone();
            state.rotation = rotation;
        }

        // Also update last known position for next prediction
        this._lastKnownLocalPosition = position.clone();
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
        const sequences = Array.from(this.predictionState.predictedStates.keys())
            .filter(seq => seq > confirmedSeq)
            .sort((a, b) => a - b);

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

        const serverPos = toVector3(serverState.position);
        const diff = Vector3.Distance(currentPosition, serverPos);
        return diff > threshold;
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
    private reconcileServerState(serverSequence: number | undefined, serverPlayerData: PlayerData | null): void {
        if (serverSequence === undefined || serverSequence < 0 || !serverPlayerData) {
            // No reconciliation needed if server doesn't send sequence or data
            return;
        }

        // Skip if this is an old/duplicate update
        if (serverSequence <= this.predictionState.confirmedSequence) {
            return;
        }

        // Check if we need to reconcile (server state differs from our prediction)
        const predictedState = this.predictionState.predictedStates.get(serverSequence);
        let needsReapplication = false;
        let posDiff = 0;
        let rotationDiff = 0;

        if (predictedState) {
            const serverPos = toVector3(serverPlayerData.position);
            const predictedPos = predictedState.position;

            // Calculate position difference
            posDiff = Vector3.Distance(serverPos, predictedPos);
            rotationDiff = Math.abs((serverPlayerData.rotation || 0) - predictedState.rotation);

            // Normalize rotation difference to [-PI, PI]
            while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
            rotationDiff = Math.abs(rotationDiff);

            // КРИТИЧНО: Учитываем погрешность квантования (0.1 единицы для позиций)
            // Позиции квантуются с точностью 0.1 единицы, поэтому разница может быть из-за квантования
            const QUANTIZATION_ERROR = 0.15; // 0.1 единицы + небольшой запас
            const POSITION_THRESHOLD = 0.5 + QUANTIZATION_ERROR; // 0.5 units + quantization error
            const ROTATION_THRESHOLD = 0.1; // ~6 degrees

            needsReapplication = posDiff > POSITION_THRESHOLD || rotationDiff > ROTATION_THRESHOLD;

            // ДИАГНОСТИКА: Логируем reconciliation только при значительных расхождениях
            if (needsReapplication) {
                logger.log(`[Multiplayer] Reconciliation needed: seq=${serverSequence}, posDiff=${posDiff.toFixed(2)} (threshold=${POSITION_THRESHOLD.toFixed(2)}), rotDiff=${rotationDiff.toFixed(2)}, serverPos=(${serverPos.x.toFixed(1)}, ${serverPos.y.toFixed(1)}, ${serverPos.z.toFixed(1)}), predictedPos=(${predictedPos.x.toFixed(1)}, ${predictedPos.y.toFixed(1)}, ${predictedPos.z.toFixed(1)})`);
            } else if (posDiff > 0.1) {
                // Логируем маленькие расхождения для диагностики (но не reconciliation)
                logger.log(`[Multiplayer] Small position diff (within threshold): seq=${serverSequence}, posDiff=${posDiff.toFixed(3)}, threshold=${POSITION_THRESHOLD.toFixed(2)}`);
            }
        }

        // Update confirmed sequence and last server state
        this.predictionState.confirmedSequence = serverSequence;
        this.predictionState.lastServerState = serverPlayerData;

        // Update last known position from server
        this._lastKnownLocalPosition = toVector3(serverPlayerData.position);
        this._lastKnownLocalRotation = serverPlayerData.rotation || 0;

        // Remove confirmed states from prediction history (batch deletion for efficiency)
        const sequencesToRemove: number[] = [];
        for (const seq of this.predictionState.predictedStates.keys()) {
            if (seq <= serverSequence) {
                sequencesToRemove.push(seq);
            }
        }

        // Batch delete confirmed sequences
        for (const seq of sequencesToRemove) {
            this.predictionState.predictedStates.delete(seq);
        }

        // Clean up any remaining old states
        this.cleanupOldPredictedStates();

        // Get all unconfirmed sequences (after serverSequence)
        const unconfirmedSequences = Array.from(this.predictionState.predictedStates.keys())
            .filter(seq => seq > serverSequence)
            .sort((a, b) => a - b);

        // Collect unconfirmed inputs for re-application
        const unconfirmedInputs: PlayerInput[] = [];
        const unconfirmedStates: PredictedState[] = [];

        for (const seq of unconfirmedSequences) {
            const state = this.predictionState.predictedStates.get(seq);
            if (state) {
                unconfirmedStates.push(state);
                if (state.input) {
                    unconfirmedInputs.push(state.input);
                }
            }
        }

        // Always trigger callback if we have significant difference or unconfirmed states
        if (this.onReconciliationCallback) {
            if (needsReapplication || unconfirmedStates.length > 0) {
                this.onReconciliationCallback({
                    serverState: serverPlayerData,
                    predictedState: predictedState,
                    unconfirmedStates: unconfirmedStates.length > 0 ? unconfirmedStates : undefined,
                    positionDiff: posDiff,
                    rotationDiff: rotationDiff,
                    needsReapplication: needsReapplication
                });
            }
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

        if (this.onLobbyChatMessageCallback) {
            this.onLobbyChatMessageCallback(data);
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
     * @returns True if room creation request was sent, false if not connected
     */
    createRoom(mode: GameMode, maxPlayers: number = 32, isPrivate: boolean = false, mapType?: string): boolean {
        // Log mapType to debug why it might be missing/wrong
        logger.log(`[Multiplayer] createRoom called with mapType: '${mapType}' (type: ${typeof mapType})`);

        if (!this.connected) {
            logger.warn("[Multiplayer] Cannot create room: not connected to server");
            return false;
        }

        logger.log(`[Multiplayer] Creating room: mode=${mode}, maxPlayers=${maxPlayers}, isPrivate=${isPrivate}, mapType=${mapType}`);
        // ВАЖНО: Убеждаемся, что комната публичная (isPrivate=false), чтобы её видели другие игроки
        this.send(createClientMessage(ClientMessageType.CREATE_ROOM, {
            mode,
            maxPlayers,
            isPrivate: false, // Всегда создаем публичные комнаты для видимости
            mapType: mapType || "normal" // Передаем тип карты
        }));
        return true;
    }

    /**
     * Join an existing game room
     * @param roomId - ID of the room to join
     */
    joinRoom(roomId: string): void {
        if (!this.connected) return;

        this.send(createClientMessage(ClientMessageType.JOIN_ROOM, { roomId }));
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

        this.send(createClientMessage(ClientMessageType.QUICK_PLAY, { mode, region }));
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
        return (this as any).spawnPosition || null;
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

    /**
     * Set player name
     * @param name - Player name
     */
    setPlayerName(name: string): void {
        this.playerName = name;
        savePlayerName(name); // Сохраняем имя в localStorage
    }

    // Callbacks
    onConnected(callback: () => void): void {
        this.onConnectedCallback = callback;
    }

    onDisconnected(callback: () => void): void {
        this.onDisconnectedCallback = callback;
    }

    onPlayerJoined(callback: (player: PlayerData) => void): void {
        this.onPlayerJoinedCallback = callback;
    }

    onPlayerLeft(callback: (playerId: string) => void): void {
        this.onPlayerLeftCallback = callback;
    }

    onGameStart(callback: (data: GameStartData) => void): void {
        this.onGameStartCallback = callback;
    }

    onGameEnd(callback: (data: GameEndData) => void): void {
        this.onGameEndCallback = callback;
    }

    onPlayerStates(callback: (players: PlayerData[]) => void): void {
        this.onPlayerStatesCallback = callback;
    }

    onProjectileSpawn(callback: (data: ProjectileSpawnData) => void): void {
        this.onProjectileSpawnCallback = callback;
    }

    onChatMessage(callback: (data: ChatMessageData) => void): void {
        this.onChatMessageCallback = callback;
    }

    onConsumablePickup(callback: (data: ConsumablePickupData) => void): void {
        this.onConsumablePickupCallback = callback;
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

    onReconciliation(callback: (data: { serverState?: PlayerData; predictedState?: PredictedState; unconfirmedStates?: PredictedState[]; positionDiff?: number; rotationDiff?: number; needsReapplication?: boolean }) => void): void {
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
                logger.warn(`[Multiplayer] Cannot send message: WebSocket is not open (state: ${this.ws.readyState})`);
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

    private _scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        this.reconnectAttempts++;
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        const delay = Math.min(this._reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

        logger.log(`[Multiplayer] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            logger.log(`[Multiplayer] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connect(this.serverUrl);
        }, delay);
    }
}

