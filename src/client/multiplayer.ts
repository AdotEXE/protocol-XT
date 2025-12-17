import { Vector3 } from "@babylonjs/core";
import { createClientMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage, ClientMetricsData, PingData, PongData, PlayerStatesData } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { PlayerData, PlayerInput, GameMode, PredictedState, ClientPredictionState, NetworkMetrics } from "../shared/types";
import { nanoid } from "nanoid";
import { logger } from "./utils/logger";
import { firebaseService } from "./firebaseService";

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
    // For interpolation
    lastPosition: Vector3;
    lastRotation: number;
    lastTurretRotation: number;
    interpolationTime: number;
}

export class MultiplayerManager {
    private ws: WebSocket | null = null;
    private playerId: string = nanoid();
    private playerName: string = "Player";
    private connected: boolean = false;
    private roomId: string | null = null;
    private gameMode: GameMode | null = null;
    private serverUrl: string = "ws://localhost:8080";
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private _reconnectDelay: number = 1000; // Start with 1 second
    private reconnectTimer: NodeJS.Timeout | null = null;
    private isManualDisconnect: boolean = false;
    private _gameTime: number = 0;
    
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
    
    // Jitter buffer for smoothing network variations
    private jitterBuffer: Array<{
        data: PlayerStatesData;
        timestamp: number;
        sequence: number;
    }> = [];
    private jitterBufferTargetDelay: number = 50; // Initial target delay (ms)
    private lastProcessedSequence: number = -1;
    
    // Callbacks
    private onConnectedCallback: (() => void) | null = null;
    private onDisconnectedCallback: (() => void) | null = null;
    private onPlayerJoinedCallback: ((player: PlayerData) => void) | null = null;
    private onPlayerLeftCallback: ((playerId: string) => void) | null = null;
    private onGameStartCallback: ((data: any) => void) | null = null;
    private onGameEndCallback: ((data: any) => void) | null = null;
    private onPlayerStatesCallback: ((players: PlayerData[]) => void) | null = null;
    private onProjectileSpawnCallback: ((data: any) => void) | null = null;
    private onChatMessageCallback: ((data: any) => void) | null = null;
    private onConsumablePickupCallback: ((data: any) => void) | null = null;
    private onEnemyUpdateCallback: ((data: any) => void) | null = null;
    private onSafeZoneUpdateCallback: ((data: any) => void) | null = null;
    private onCTFFlagUpdateCallback: ((data: any) => void) | null = null;
    private onPlayerKilledCallback: ((data: any) => void) | null = null;
    private onPlayerDiedCallback: ((data: any) => void) | null = null;
    private onPlayerDamagedCallback: ((data: any) => void) | null = null;
    private onCTFFlagPickupCallback: ((data: any) => void) | null = null;
    private onCTFFlagCaptureCallback: ((data: any) => void) | null = null;
    private onQueueUpdateCallback: ((data: any) => void) | null = null;
    private onMatchFoundCallback: ((data: any) => void) | null = null;
    
    constructor(serverUrl: string = "ws://localhost:8080", autoConnect: boolean = false) {
        this.serverUrl = serverUrl;
        if (autoConnect) {
            this.connect(serverUrl);
        }
    }
    
    connect(serverUrl: string): void {
        this.serverUrl = serverUrl;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.warn("[Multiplayer] Already connected");
            return;
        }
        
        try {
            this.ws = new WebSocket(serverUrl);
            
            this.ws.onopen = async () => {
                console.log("[Multiplayer] Connected to server");
                this.connected = true;
                this.reconnectAttempts = 0;
                this._reconnectDelay = 1000; // Reset delay on successful connection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                await this.sendConnect();
            };
            
            this.ws.onmessage = (event) => {
                // Handle both string (JSON) and ArrayBuffer/Uint8Array (MessagePack)
                const data = event.data;
                this.handleMessage(data);
            };
            
            this.ws.onclose = (event) => {
                console.log("[Multiplayer] Disconnected from server", event.code, event.reason);
                this.connected = false;
                this.roomId = null;
                this.networkPlayers.clear();
                
                if (this.onDisconnectedCallback) {
                    this.onDisconnectedCallback();
                }
                
                // Auto-reconnect if not manual disconnect and not exceeded max attempts
                if (!this.isManualDisconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.error("[Multiplayer] Max reconnect attempts reached. Please reconnect manually.");
                }
            };
            
            this.ws.onerror = (error) => {
                console.error("[Multiplayer] WebSocket error:", error);
            };
        } catch (error) {
            console.error("[Multiplayer] Failed to connect:", error);
        }
    }
    
    disconnect(): void {
        // Stop ping measurement
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.roomId = null;
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
    }
    
    private async sendConnect(): Promise<void> {
        // Получаем токен авторизации, если пользователь авторизован
        let idToken: string | null = null;
        try {
            if (firebaseService.isAuthenticated()) {
                idToken = await firebaseService.getAuthToken();
            }
        } catch (error) {
            console.warn("[Multiplayer] Failed to get auth token:", error);
        }

        this.send(createClientMessage(ClientMessageType.CONNECT, {
            playerId: this.playerId,
            playerName: this.playerName,
            idToken: idToken || undefined // Отправляем только если есть
        }));
    }
    
    private handleMessage(data: string | ArrayBuffer | Blob): void {
        try {
            // Convert Blob to ArrayBuffer if needed
            if (data instanceof Blob) {
                data.arrayBuffer().then(buffer => {
                    this.handleMessage(buffer);
                });
                return;
            }
            
            const message = deserializeMessage<ServerMessage>(data);
            
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
                    
                case ServerMessageType.CONSUMABLE_PICKUP:
                    this.handleConsumablePickup(message.data);
                    break;
                    
                case ServerMessageType.ENEMY_UPDATE:
                    this.handleEnemyUpdate(message.data);
                    break;
                    
                case ServerMessageType.VOICE_PLAYER_JOINED:
                case ServerMessageType.VOICE_PLAYER_LEFT:
                    // Forward to voice chat manager
                    if ((window as any).voiceChatManager) {
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
                    
                case ServerMessageType.PONG:
                    this.handlePong(message.data);
                    break;
                    
                case ServerMessageType.ERROR:
                    logger.error("[Multiplayer] Server error:", message.data);
                    this.handleError(message.data);
                    break;
                    
                default:
                    logger.warn(`[Multiplayer] Unknown message type: ${message.type}`);
            }
        } catch (error) {
            logger.error("[Multiplayer] Error handling message:", error);
        }
    }
    
    private handleConnected(data: any): void {
        this.connected = true;
        this.playerId = data.playerId || this.playerId;
        console.log(`[Multiplayer] Connected as ${this.playerId}`);
        
        // Start ping measurement
        this.startPingMeasurement();
        
        if (this.onConnectedCallback) {
            this.onConnectedCallback();
        }
    }
    
    /**
     * Start periodic ping measurement
     */
    private startPingMeasurement(): void {
        // Send ping every 1000ms
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.sendPing();
            }
        }, 1000);
        
        // Send initial ping
        this.sendPing();
    }
    
    /**
     * Send ping to server
     */
    private sendPing(): void {
        const pingData: PingData = {
            timestamp: Date.now(),
            sequence: ++this.pingSequence
        };
        
        this.send(createClientMessage(ClientMessageType.PING, pingData));
        this.networkMetrics.lastPingTime = pingData.timestamp;
    }
    
    /**
     * Handle pong from server and calculate RTT
     */
    private handlePong(data: any): void {
        const pongData = data as PongData;
        const currentTime = Date.now();
        const rtt = currentTime - pongData.timestamp;
        
        // Update RTT history
        this.networkMetrics.pingHistory.push(rtt);
        if (this.networkMetrics.pingHistory.length > 10) {
            this.networkMetrics.pingHistory.shift();
        }
        
        // Calculate exponential weighted moving average (EWMA)
        const alpha = 0.125; // Weight for new measurement
        this.networkMetrics.rtt = (1 - alpha) * this.networkMetrics.rtt + alpha * rtt;
        
        // Calculate jitter (variation in RTT)
        if (this.networkMetrics.pingHistory.length >= 2) {
            const variations: number[] = [];
            for (let i = 1; i < this.networkMetrics.pingHistory.length; i++) {
                variations.push(Math.abs(this.networkMetrics.pingHistory[i] - this.networkMetrics.pingHistory[i - 1]));
            }
            this.networkMetrics.jitter = variations.reduce((a, b) => a + b, 0) / variations.length;
        }
    }
    
    /**
     * Get current network metrics
     */
    getNetworkMetrics(): NetworkMetrics {
        return { ...this.networkMetrics };
    }
    
    /**
     * Get current RTT
     */
    getRTT(): number {
        return this.networkMetrics.rtt;
    }
    
    private handleRoomCreated(data: any): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        console.log(`[Multiplayer] Room created: ${this.roomId}`);
        if (this.onRoomCreatedCallback) {
            this.onRoomCreatedCallback(data);
        }
    }
    
    private handleRoomJoined(data: any): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        
        // Store world seed for deterministic generation
        if (data.worldSeed !== undefined) {
            (this as any).worldSeed = data.worldSeed;
        }
        
        // Initialize network players
        if (data.players) {
            for (const playerData of data.players) {
                if (playerData.id !== this.playerId) {
                    this.addNetworkPlayer(playerData);
                }
            }
        }
        
        console.log(`[Multiplayer] Joined room: ${this.roomId}, seed: ${data.worldSeed}`);
    }
    
    private handlePlayerJoined(data: any): void {
        const player = data.player;
        if (player.id !== this.playerId) {
            this.addNetworkPlayer(player);
            if (this.onPlayerJoinedCallback) {
                this.onPlayerJoinedCallback(player);
            }
        }
    }
    
    private handlePlayerLeft(data: any): void {
        const playerId = data.playerId;
        this.networkPlayers.delete(playerId);
        if (this.onPlayerLeftCallback) {
            this.onPlayerLeftCallback(playerId);
        }
    }
    
    private handleMatchFound(data: any): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        console.log(`[Multiplayer] Match found: ${this.roomId}`);
        if (this.onMatchFoundCallback) {
            this.onMatchFoundCallback(data);
        }
    }
    
    private handleQueueUpdate(data: any): void {
        if (this.onQueueUpdateCallback) {
            this.onQueueUpdateCallback(data);
        }
    }
    
    private handleError(data: any): void {
        if (this.onErrorCallback) {
            this.onErrorCallback(data);
        }
    }
    
    private handleGameStart(data: any): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        
        // Store world seed for deterministic generation
        if (data.worldSeed !== undefined) {
            (this as any).worldSeed = data.worldSeed;
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
    
    private handleGameEnd(data: any): void {
        if (this.onGameEndCallback) {
            this.onGameEndCallback(data);
        }
    }
    
    private handlePlayerStates(data: any): void {
        const statesData = data as PlayerStatesData;
        const currentTime = Date.now();
        const serverSequence = statesData.serverSequence ?? -1;
        
        // Add to jitter buffer
        this.jitterBuffer.push({
            data: statesData,
            timestamp: currentTime,
            sequence: serverSequence
        });
        
        // Sort buffer by sequence to ensure correct order
        this.jitterBuffer.sort((a, b) => a.sequence - b.sequence);
        
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
     */
    private processJitterBuffer(currentTime: number): void {
        // Remove old entries (older than 500ms are considered too stale)
        this.jitterBuffer = this.jitterBuffer.filter(
            entry => currentTime - entry.timestamp < 500
        );
        
        // Process entries that have waited long enough
        const readyEntries: typeof this.jitterBuffer = [];
        const remainingEntries: typeof this.jitterBuffer = [];
        
        for (const entry of this.jitterBuffer) {
            const age = currentTime - entry.timestamp;
            if (age >= this.jitterBufferTargetDelay) {
                readyEntries.push(entry);
            } else {
                remainingEntries.push(entry);
            }
        }
        
        // Process ready entries in sequence order
        for (const entry of readyEntries) {
            // Skip if we already processed this sequence or newer
            if (entry.sequence <= this.lastProcessedSequence && entry.sequence >= 0) {
                continue;
            }
            
            this.lastProcessedSequence = Math.max(this.lastProcessedSequence, entry.sequence);
            this.applyPlayerStates(entry.data);
        }
        
        // Update buffer with remaining entries
        this.jitterBuffer = remainingEntries;
    }
    
    /**
     * Apply player states update (extracted from handlePlayerStates)
     */
    private applyPlayerStates(statesData: PlayerStatesData): void {
        const players = statesData.players || [];
        const gameTime = statesData.gameTime || 0;
        const serverSequence = statesData.serverSequence;
        
        // Find local player for reconciliation
        let localPlayerData: PlayerData | null = null;
        for (const playerData of players) {
            if (playerData.id === this.playerId) {
                localPlayerData = playerData;
                // Perform reconciliation if we have server sequence
                if (serverSequence !== undefined) {
                    this.reconcileServerState(serverSequence, localPlayerData);
                }
            } else {
                this.updateNetworkPlayer(playerData, gameTime);
            }
        }
        
        // Store last server state even if local player not found (for reconciliation)
        if (localPlayerData && serverSequence !== undefined) {
            this.predictionState.lastServerState = localPlayerData;
        }
        
        if (this.onPlayerStatesCallback) {
            this.onPlayerStatesCallback(players);
        }
    }
    
    private handleProjectileSpawn(data: any): void {
        if (this.onProjectileSpawnCallback) {
            this.onProjectileSpawnCallback(data);
        }
    }
    
    private handleChatMessage(data: any): void {
        if (this.onChatMessageCallback) {
            this.onChatMessageCallback(data);
        }
    }
    
    private handleConsumablePickup(data: any): void {
        if (this.onConsumablePickupCallback) {
            this.onConsumablePickupCallback(data);
        }
    }
    
    private handleEnemyUpdate(data: any): void {
        if (this.onEnemyUpdateCallback) {
            this.onEnemyUpdateCallback(data);
        }
    }
    
    private handleSafeZoneUpdate(data: any): void {
        if (this.onSafeZoneUpdateCallback) {
            this.onSafeZoneUpdateCallback(data);
        }
    }
    
    private handleCTFFlagUpdate(data: any): void {
        if (this.onCTFFlagUpdateCallback) {
            this.onCTFFlagUpdateCallback(data);
        }
    }
    
    private handlePlayerKilled(data: any): void {
        if (this.onPlayerKilledCallback) {
            this.onPlayerKilledCallback(data);
        }
    }
    
    private handlePlayerDied(data: any): void {
        if (this.onPlayerDiedCallback) {
            this.onPlayerDiedCallback(data);
        }
    }
    
    private handlePlayerDamaged(data: any): void {
        if (this.onPlayerDamagedCallback) {
            this.onPlayerDamagedCallback(data);
        }
    }
    
    private handleCTFFlagPickup(data: any): void {
        if (this.onCTFFlagPickupCallback) {
            this.onCTFFlagPickupCallback(data);
        }
    }
    
    private handleCTFFlagCapture(data: any): void {
        if (this.onCTFFlagCaptureCallback) {
            this.onCTFFlagCaptureCallback(data);
        }
    }
    
    private addNetworkPlayer(playerData: PlayerData): void {
        const networkPlayer: NetworkPlayer = {
            id: playerData.id,
            name: playerData.name,
            position: new Vector3(playerData.position.x, playerData.position.y, playerData.position.z),
            rotation: playerData.rotation,
            turretRotation: playerData.turretRotation,
            aimPitch: playerData.aimPitch,
            health: playerData.health,
            maxHealth: playerData.maxHealth,
            status: playerData.status,
            team: playerData.team,
            // Tank customization
            chassisType: playerData.chassisType,
            cannonType: playerData.cannonType,
            tankColor: playerData.tankColor,
            turretColor: playerData.turretColor,
            lastPosition: new Vector3(playerData.position.x, playerData.position.y, playerData.position.z),
            lastRotation: playerData.rotation,
            lastTurretRotation: playerData.turretRotation,
            interpolationTime: 0
        };
        
        this.networkPlayers.set(playerData.id, networkPlayer);
    }
    
    private updateNetworkPlayer(playerData: PlayerData, _gameTime: number): void {
        const networkPlayer = this.networkPlayers.get(playerData.id);
        if (!networkPlayer) {
            this.addNetworkPlayer(playerData);
            return;
        }
        
        // Store previous state for interpolation
        networkPlayer.lastPosition.copyFrom(networkPlayer.position);
        networkPlayer.lastRotation = networkPlayer.rotation;
        networkPlayer.lastTurretRotation = networkPlayer.turretRotation;
        
        // Update to new state
        networkPlayer.position.set(
            playerData.position.x,
            playerData.position.y,
            playerData.position.z
        );
        networkPlayer.rotation = playerData.rotation;
        networkPlayer.turretRotation = playerData.turretRotation;
        networkPlayer.aimPitch = playerData.aimPitch;
        networkPlayer.health = playerData.health;
        networkPlayer.maxHealth = playerData.maxHealth;
        networkPlayer.status = playerData.status;
        networkPlayer.team = playerData.team;
        
        // Update customization (only if changed)
        if (playerData.chassisType !== undefined) networkPlayer.chassisType = playerData.chassisType;
        if (playerData.cannonType !== undefined) networkPlayer.cannonType = playerData.cannonType;
        if (playerData.tankColor !== undefined) networkPlayer.tankColor = playerData.tankColor;
        if (playerData.turretColor !== undefined) networkPlayer.turretColor = playerData.turretColor;
        
        // Reset interpolation timer
        networkPlayer.interpolationTime = 0;
    }
    
    // Public API
    sendPlayerInput(input: PlayerInput): number {
        if (!this.connected || !this.roomId) return -1;
        
        // Add sequence number for prediction and reconciliation
        const sequence = ++this.currentSequence;
        const inputWithSequence: PlayerInput = {
            ...input,
            sequence
        };
        
        // Store predicted state for reconciliation
        this.storePredictedState(sequence, inputWithSequence);
        
        this.send(createClientMessage(ClientMessageType.PLAYER_INPUT, inputWithSequence));
        return sequence;
    }
    
    /**
     * Store predicted state for client-side prediction and reconciliation
     */
    private storePredictedState(sequence: number, input: PlayerInput): void {
        // Note: Actual position/rotation will be stored by TankController after applying input
        // This is just a placeholder - the actual state will be updated when we receive
        // the local player's state from the game
        const predictedState: PredictedState = {
            sequence,
            timestamp: input.timestamp,
            position: new Vector3(0, 0, 0), // Will be updated by TankController
            rotation: 0, // Will be updated by TankController
            turretRotation: input.turretRotation,
            aimPitch: input.aimPitch,
            input
        };
        
        this.predictionState.predictedStates.set(sequence, predictedState);
        
        // Clean up old states beyond maxHistorySize
        if (this.predictionState.predictedStates.size > this.predictionState.maxHistorySize) {
            const oldestSequence = Math.min(...Array.from(this.predictionState.predictedStates.keys()));
            this.predictionState.predictedStates.delete(oldestSequence);
        }
    }
    
    /**
     * Update predicted state with actual position/rotation after applying input
     */
    updatePredictedState(sequence: number, position: Vector3, rotation: number): void {
        const state = this.predictionState.predictedStates.get(sequence);
        if (state) {
            state.position = position.clone();
            state.rotation = rotation;
        }
    }
    
    /**
     * Reconcile server state with client predictions
     */
    private reconcileServerState(serverSequence: number | undefined, serverPlayerData: PlayerData | null): void {
        if (serverSequence === undefined || serverSequence < 0) {
            // No reconciliation needed if server doesn't send sequence
            return;
        }
        
        // Update confirmed sequence
        this.predictionState.confirmedSequence = serverSequence;
        this.predictionState.lastServerState = serverPlayerData;
        
        // Remove confirmed states from prediction history
        const sequencesToRemove: number[] = [];
        for (const seq of this.predictionState.predictedStates.keys()) {
            if (seq <= serverSequence) {
                sequencesToRemove.push(seq);
            }
        }
        for (const seq of sequencesToRemove) {
            this.predictionState.predictedStates.delete(seq);
        }
        
        // If we have predicted states after confirmed sequence, they need to be re-applied
        // This will be handled by the game's TankController through reconciliation callback
    }
    
    /**
     * Get the last confirmed server state (for reconciliation)
     */
    getLastServerState(): PlayerData | null {
        return this.predictionState.lastServerState;
    }
    
    /**
     * Get confirmed sequence number
     */
    getConfirmedSequence(): number {
        return this.predictionState.confirmedSequence;
    }
    
    sendPlayerShoot(data: any): void {
        if (!this.connected || !this.roomId) return;
        
        this.send(createClientMessage(ClientMessageType.PLAYER_SHOOT, data));
    }
    
    sendChatMessage(message: string): void {
        if (!this.connected || !this.roomId) return;
        
        this.send(createClientMessage(ClientMessageType.CHAT_MESSAGE, { message }));
    }
    
    requestConsumablePickup(consumableId: string, type: string, position: any): void {
        if (!this.connected || !this.roomId) return;
        
        this.send(createClientMessage(ClientMessageType.CONSUMABLE_PICKUP_REQUEST, {
            consumableId,
            type,
            position
        }));
    }
    
    createRoom(mode: GameMode, maxPlayers: number = 32, isPrivate: boolean = false): void {
        if (!this.connected) return;
        
        this.send(createClientMessage(ClientMessageType.CREATE_ROOM, {
            mode,
            maxPlayers,
            isPrivate
        }));
    }
    
    joinRoom(roomId: string): void {
        if (!this.connected) return;
        
        this.send(createClientMessage(ClientMessageType.JOIN_ROOM, { roomId }));
    }
    
    leaveRoom(): void {
        if (!this.connected || !this.roomId) return;
        
        this.send(createClientMessage(ClientMessageType.LEAVE_ROOM, {}));
        this.roomId = null;
        this.networkPlayers.clear();
    }
    
    quickPlay(mode: GameMode, region?: string): void {
        if (!this.connected) return;
        
        this.send(createClientMessage(ClientMessageType.QUICK_PLAY, { mode, region }));
    }
    
    sendClientMetrics(metrics: ClientMetricsData): void {
        if (!this.connected) return;
        
        this.send(createClientMessage(ClientMessageType.CLIENT_METRICS, metrics));
    }
    
    // Getters
    isConnected(): boolean {
        return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
    }
    
    getGameMode(): GameMode | null {
        return this.gameMode;
    }
    
    getGameTime(): number {
        return this._gameTime;
    }
    
    getRoomId(): string | null {
        return this.roomId;
    }
    
    getWorldSeed(): number | null {
        return (this as any).worldSeed || null;
    }
    
    getNetworkPlayers(): Map<string, NetworkPlayer> {
        return this.networkPlayers;
    }
    
    getNetworkPlayer(playerId: string): NetworkPlayer | undefined {
        return this.networkPlayers.get(playerId);
    }
    
    getPlayerId(): string {
        return this.playerId;
    }
    
    getServerUrl(): string {
        return this.serverUrl;
    }
    
    setPlayerName(name: string): void {
        this.playerName = name;
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
    
    onGameStart(callback: (data: any) => void): void {
        this.onGameStartCallback = callback;
    }
    
    onGameEnd(callback: (data: any) => void): void {
        this.onGameEndCallback = callback;
    }
    
    onPlayerStates(callback: (players: PlayerData[]) => void): void {
        this.onPlayerStatesCallback = callback;
    }
    
    onProjectileSpawn(callback: (data: any) => void): void {
        this.onProjectileSpawnCallback = callback;
    }
    
    onChatMessage(callback: (data: any) => void): void {
        this.onChatMessageCallback = callback;
    }
    
    onConsumablePickup(callback: (data: any) => void): void {
        this.onConsumablePickupCallback = callback;
    }
    
    onEnemyUpdate(callback: (data: any) => void): void {
        this.onEnemyUpdateCallback = callback;
    }
    
    onSafeZoneUpdate(callback: (data: any) => void): void {
        this.onSafeZoneUpdateCallback = callback;
    }
    
    onCTFFlagUpdate(callback: (data: any) => void): void {
        this.onCTFFlagUpdateCallback = callback;
    }
    
    onPlayerKilled(callback: (data: any) => void): void {
        this.onPlayerKilledCallback = callback;
    }
    
    onPlayerDied(callback: (data: any) => void): void {
        this.onPlayerDiedCallback = callback;
    }
    
    onPlayerDamaged(callback: (data: any) => void): void {
        this.onPlayerDamagedCallback = callback;
    }
    
    onCTFFlagPickup(callback: (data: any) => void): void {
        this.onCTFFlagPickupCallback = callback;
    }
    
    onCTFFlagCapture(callback: (data: any) => void): void {
        this.onCTFFlagCaptureCallback = callback;
    }
    
    onQueueUpdate(callback: (data: any) => void): void {
        this.onQueueUpdateCallback = callback;
    }
    
    onMatchFound(callback: (data: any) => void): void {
        this.onMatchFoundCallback = callback;
    }
    
    onRoomCreated(callback: (data: any) => void): void {
        this.onRoomCreatedCallback = callback;
    }
    
    onError(callback: (data: any) => void): void {
        this.onErrorCallback = callback;
    }
    
    private send(message: ClientMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const serialized = serializeMessage(message);
            // WebSocket.send() accepts both string and ArrayBuffer
            this.ws.send(serialized);
        }
    }
    
    private _scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this._reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.reconnectTimer = setTimeout(() => {
            // Убрано сообщение о переподключении для одиночного режима
            // console.log(`[Multiplayer] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connect(this.serverUrl);
        }, delay);
    }
}

