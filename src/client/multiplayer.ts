import { Vector3 } from "@babylonjs/core";
import { createClientMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { PlayerData, PlayerInput, GameMode } from "../shared/types";
import { nanoid } from "nanoid";

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
    
    constructor(serverUrl: string = "ws://localhost:8080") {
        this.serverUrl = serverUrl;
        this.connect(serverUrl);
    }
    
    connect(serverUrl: string): void {
        this.serverUrl = serverUrl;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            console.warn("[Multiplayer] Already connected");
            return;
        }
        
        try {
            this.ws = new WebSocket(serverUrl);
            
            this.ws.onopen = () => {
                console.log("[Multiplayer] Connected to server");
                this.connected = true;
                this.reconnectAttempts = 0;
                this._reconnectDelay = 1000; // Reset delay on successful connection
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                this.sendConnect();
            };
            
            this.ws.onmessage = (event) => {
                this.handleMessage(event.data);
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.roomId = null;
        this.networkPlayers.clear();
    }
    
    private sendConnect(): void {
        this.send(createClientMessage(ClientMessageType.CONNECT, {
            playerId: this.playerId,
            playerName: this.playerName
        }));
    }
    
    private handleMessage(data: string): void {
        try {
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
                    
                case ServerMessageType.ERROR:
                    console.error("[Multiplayer] Server error:", message.data);
                    break;
                    
                default:
                    console.warn(`[Multiplayer] Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error("[Multiplayer] Error handling message:", error);
        }
    }
    
    private handleConnected(data: any): void {
        this.connected = true;
        this.playerId = data.playerId || this.playerId;
        console.log(`[Multiplayer] Connected as ${this.playerId}`);
        if (this.onConnectedCallback) {
            this.onConnectedCallback();
        }
    }
    
    private handleRoomCreated(data: any): void {
        this.roomId = data.roomId;
        this.gameMode = data.mode;
        console.log(`[Multiplayer] Room created: ${this.roomId}`);
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
        const players = data.players as PlayerData[];
        const gameTime = data.gameTime || 0;
        
        // Update network players
        for (const playerData of players) {
            if (playerData.id !== this.playerId) {
                this.updateNetworkPlayer(playerData, gameTime);
            }
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
    sendPlayerInput(input: PlayerInput): void {
        if (!this.connected || !this.roomId) return;
        
        this.send(createClientMessage(ClientMessageType.PLAYER_INPUT, input));
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
    
    private send(message: ClientMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(serializeMessage(message));
        }
    }
    
    private _scheduleReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this._reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        
        this.reconnectTimer = setTimeout(() => {
            console.log(`[Multiplayer] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.connect(this.serverUrl);
        }, delay);
    }
}

