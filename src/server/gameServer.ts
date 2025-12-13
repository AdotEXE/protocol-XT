import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { Vector3 } from "@babylonjs/core";
import { ServerPlayer } from "./player";
import { GameRoom } from "./room";
import { ServerProjectile } from "./projectile";
import { MatchmakingSystem } from "./matchmaking";
import { createServerMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { GameMode } from "../shared/types";
import { InputValidator } from "./validation";
import { DeltaCompressor, PrioritizedBroadcaster } from "./deltaCompression";

const TICK_RATE = 60; // 60 Hz
const TICK_INTERVAL = 1000 / TICK_RATE; // ~16.67ms

export class GameServer {
    private wss: WebSocketServer;
    private players: Map<string, ServerPlayer> = new Map();
    private rooms: Map<string, GameRoom> = new Map();
    private matchmaking: MatchmakingSystem = new MatchmakingSystem();
    private tickInterval: NodeJS.Timeout | null = null;
    private lastTick: number = Date.now();
    private tickCount: number = 0;
    private deltaCompressor: Map<string, DeltaCompressor> = new Map(); // Per-room compressors
    private prioritizedBroadcaster: PrioritizedBroadcaster = new PrioritizedBroadcaster();
    
    constructor(port: number = 8080) {
        this.wss = new WebSocketServer({ port });
        console.log(`[Server] WebSocket server started on port ${port}`);
        
        this.setupWebSocket();
        this.startGameLoop();
    }
    
    private setupWebSocket(): void {
        this.wss.on("connection", (ws: WebSocket) => {
            console.log("[Server] New client connected");
            
            ws.on("message", (data: Buffer) => {
                try {
                    const message = deserializeMessage<ClientMessage>(data.toString());
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error("[Server] Error parsing message:", error);
                    this.sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
                }
            });
            
            ws.on("close", () => {
                this.handleDisconnect(ws);
            });
            
            ws.on("error", (error) => {
                console.error("[Server] WebSocket error:", error);
            });
        });
    }
    
    private handleMessage(ws: WebSocket, message: ClientMessage): void {
        const player = this.getPlayerBySocket(ws);
        
        switch (message.type) {
            case ClientMessageType.CONNECT:
                this.handleConnect(ws, message.data);
                break;
                
            case ClientMessageType.CREATE_ROOM:
                if (player) this.handleCreateRoom(player, message.data);
                break;
                
            case ClientMessageType.JOIN_ROOM:
                if (player) this.handleJoinRoom(player, message.data);
                break;
                
            case ClientMessageType.LEAVE_ROOM:
                if (player) this.handleLeaveRoom(player);
                break;
                
            case ClientMessageType.QUICK_PLAY:
                if (player) this.handleQuickPlay(player, message.data);
                break;
                
            case ClientMessageType.CANCEL_QUEUE:
                if (player) this.handleCancelQueue(player, message.data);
                break;
                
            case ClientMessageType.PLAYER_INPUT:
                if (player) this.handlePlayerInput(player, message.data);
                break;
                
            case ClientMessageType.PLAYER_SHOOT:
                if (player) this.handlePlayerShoot(player, message.data);
                break;
                
            case ClientMessageType.CHAT_MESSAGE:
                if (player) this.handleChatMessage(player, message.data);
                break;
                
            case ClientMessageType.CONSUMABLE_PICKUP_REQUEST:
                if (player) this.handleConsumablePickup(player, message.data);
                break;
                
            case ClientMessageType.VOICE_OFFER:
            case ClientMessageType.VOICE_ANSWER:
            case ClientMessageType.VOICE_ICE_CANDIDATE:
                // Voice signaling handled elsewhere
                // if (player) this._handleVoiceSignaling(player, message);
                break;
                
            default:
                console.warn(`[Server] Unknown message type: ${message.type}`);
        }
    }
    
    private handleConnect(ws: WebSocket, data: any): void {
        const playerId = data.playerId;
        const playerName = data.playerName || `Player_${playerId?.substring(0, 6) || "Unknown"}`;
        
        let player = this.players.get(playerId);
        
        if (!player) {
            player = new ServerPlayer(ws, playerId, playerName);
            this.players.set(player.id, player);
            console.log(`[Server] Player connected: ${player.id} (${player.name})`);
        } else {
            // Reconnection
            player.socket = ws;
            player.connected = true;
            console.log(`[Server] Player reconnected: ${player.id}`);
        }
        
        this.send(ws, createServerMessage(ServerMessageType.CONNECTED, {
            playerId: player.id,
            playerName: player.name
        }));
    }
    
    private handleCreateRoom(player: ServerPlayer, data: any): void {
        const { mode, maxPlayers, isPrivate, settings, worldSeed } = data;
        const room = new GameRoom(mode, maxPlayers, isPrivate, worldSeed);
        room.settings = settings || {};
        
        if (room.addPlayer(player)) {
            this.rooms.set(room.id, room);
            console.log(`[Server] Room created: ${room.id} by ${player.id}, seed: ${room.worldSeed}`);
            
            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_CREATED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed
            }));
        } else {
            this.sendError(player.socket, "ROOM_CREATE_FAILED", "Failed to create room");
        }
    }
    
    private handleJoinRoom(player: ServerPlayer, data: any): void {
        const { roomId } = data;
        const room = this.rooms.get(roomId);
        
        if (!room) {
            this.sendError(player.socket, "ROOM_NOT_FOUND", "Room not found");
            return;
        }
        
        if (room.isFull()) {
            this.sendError(player.socket, "ROOM_FULL", "Room is full");
            return;
        }
        
        // Leave current room if any
        if (player.roomId) {
            this.handleLeaveRoom(player);
        }
        
        if (room.addPlayer(player)) {
            console.log(`[Server] Player ${player.id} joined room ${room.id}`);
            
            // Notify player
            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_JOINED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed,
                players: room.getPlayerData()
            }));
            
            // Notify other players
            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_JOINED, {
                player: player.toPlayerData()
            }), player.id);
        }
    }
    
    private handleLeaveRoom(player: ServerPlayer): void {
        if (!player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (room) {
            room.removePlayer(player.id);
            
            // Notify other players
            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_LEFT, {
                playerId: player.id
            }));
            
            // Clean up empty rooms
            if (room.isEmpty()) {
                this.rooms.delete(room.id);
                console.log(`[Server] Room ${room.id} deleted (empty)`);
            }
        }
        
        player.roomId = null;
    }
    
    private handleQuickPlay(player: ServerPlayer, data: any): void {
        const { mode, region, skillBased } = data;
        
        // Add to matchmaking queue
        this.matchmaking.addToQueue(player, mode, region);
        
        // Try to find match
        const room = this.matchmaking.findMatch(player, mode, region, skillBased || false);
        
        if (room) {
            // Match found!
            this.rooms.set(room.id, room);
            
            if (player.roomId) {
                this.handleLeaveRoom(player);
            }
            
            this.send(player.socket, createServerMessage(ServerMessageType.MATCH_FOUND, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed
            }));
            
            // Notify other player in room
            const otherPlayer = room.getAllPlayers().find(p => p.id !== player.id);
            if (otherPlayer) {
                this.send(otherPlayer.socket, createServerMessage(ServerMessageType.MATCH_FOUND, {
                    roomId: room.id,
                    mode: room.mode,
                    worldSeed: room.worldSeed
                }));
            }
            
            // Start match if enough players
            if (room.players.size >= 2) {
                room.startMatch();
                this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, {
                    roomId: room.id,
                    mode: room.mode,
                    worldSeed: room.worldSeed,
                    players: room.getPlayerData()
                }));
            }
        } else {
            // No match found, send queue update
            const queueSize = this.matchmaking.getQueueSize(mode, region);
            this.send(player.socket, createServerMessage(ServerMessageType.QUEUE_UPDATE, {
                mode,
                queueSize,
                estimatedWait: queueSize * 5 // Rough estimate
            }));
        }
    }
    
    private handlePlayerInput(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) return;
        
        // Rate limiting: reset counter every second
        const now = Date.now();
        if (now - player.inputCountResetTime >= 1000) {
            player.inputCount = 0;
            player.inputCountResetTime = now;
        }
        player.inputCount++;
        
        if (player.inputCount > 60) { // Max 60 inputs per second
            console.warn(`[Server] Rate limit exceeded for player ${player.id}: ${player.inputCount} inputs/sec`);
            return;
        }
        
        // Validate input
        const deltaTime = 1 / 60; // Approximate delta time
        const validation = InputValidator.validatePlayerInput(
            data,
            player.lastValidPosition,
            player.position,
            deltaTime
        );
        
        if (!validation.valid) {
            console.warn(`[Server] Invalid input from player ${player.id}: ${validation.reason}`);
            // Don't process invalid input, but don't disconnect player
            return;
        }
        
        // Update last valid position
        player.lastValidPosition = player.position.clone();
        
        player.updateFromInput(data);
        
        // Check CTF flag pickup
        if (room.mode === "ctf") {
            const ctfSystem = (room as any).ctfSystem;
            if (ctfSystem && typeof ctfSystem.checkFlagPickup === "function") {
                ctfSystem.checkFlagPickup(player);
            }
        }
        
        // Position will be updated in game loop
    }
    
    private handlePlayerShoot(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) return;
        
        if (player.status !== "alive") return;
        
        // Rate limiting for shoots
        const now = Date.now();
        if (now - player.shootCountResetTime >= 1000) {
            player.shootCount = 0;
            player.shootCountResetTime = now;
        }
        player.shootCount++;
        
        if (player.shootCount > 10) { // Max 10 shots per second
            console.warn(`[Server] Shoot rate limit exceeded for player ${player.id}: ${player.shootCount} shots/sec`);
            return;
        }
        
        // Validate shoot data
        const validation = InputValidator.validateShootData(data);
        if (!validation.valid) {
            console.warn(`[Server] Invalid shoot data from player ${player.id}: ${validation.reason}`);
            return;
        }
        
        // Create projectile on server
        const projId = nanoid();
        const projPos = new Vector3(data.position.x, data.position.y, data.position.z);
        const projVel = new Vector3(data.direction.x, data.direction.y, data.direction.z).scale(100); // Projectile speed
        
        const projectile = new ServerProjectile({
            id: projId,
            ownerId: player.id,
            position: projPos,
            velocity: projVel,
            damage: data.damage || 20,
            cannonType: data.cannonType || "standard",
            spawnTime: Date.now()
        });
        
        room.projectiles.set(projId, projectile);
        
        // Broadcast to all players
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PROJECTILE_SPAWN, {
            ...data,
            ownerId: player.id,
            id: projId
        }));
    }
    
    private handleChatMessage(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room) return;
        
        const chatData = {
            playerId: player.id,
            playerName: player.name,
            message: data.message,
            timestamp: Date.now()
        };
        
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData));
    }
    
    private handleConsumablePickup(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;
        
        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) return;
        
        if (player.status !== "alive") return;
        
        const { consumableId, type, position } = data;
        
        // Validate pickup (check if already picked up, distance, etc.)
        if ((room as any).pickedUpConsumables?.has(consumableId)) {
            return; // Already picked up
        }
        
        // Check distance (simple validation)
        const playerPos = player.position;
        const consumablePos = new Vector3(position.x, position.y, position.z);
        const distance = Vector3.Distance(playerPos, consumablePos);
        
        if (distance > 5) {
            return; // Too far
        }
        
        // Mark as picked up
        (room as any).pickedUpConsumables?.add(consumableId);
        
        // Broadcast to all players
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CONSUMABLE_PICKUP, {
            consumableId,
            playerId: player.id,
            type,
            position
        }));
    }
    
    private handleCancelQueue(player: ServerPlayer, data: any): void {
        const { mode, region } = data;
        this.matchmaking.removeFromQueue(player, mode, region);
        console.log(`[Server] Player ${player.id} cancelled queue for ${mode}`);
    }
    
    private handleDisconnect(ws: WebSocket): void {
        const player = this.getPlayerBySocket(ws);
        if (player) {
            console.log(`[Server] Player disconnected: ${player.id}`);
            this.handleLeaveRoom(player);
            // Remove from all queues
            for (const mode of ["ffa", "tdm", "coop", "battle_royale", "ctf"] as GameMode[]) {
                this.matchmaking.removeFromQueue(player, mode);
            }
            player.disconnect();
            this.players.delete(player.id);
        }
    }
    
    private startGameLoop(): void {
        this.tickInterval = setInterval(() => {
            const now = Date.now();
            const deltaTime = (now - this.lastTick) / 1000; // Convert to seconds
            this.lastTick = now;
            
            this.update(deltaTime);
        }, TICK_INTERVAL);
    }
    
    private update(deltaTime: number): void {
        // Update all active rooms
        for (const room of this.rooms.values()) {
            if (room.isActive) {
                room.update(deltaTime);
                
                // Check win condition
                const winCondition = room.getWinCondition();
                if (winCondition && winCondition.winner) {
                    room.endMatch();
                    this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_END, {
                        winner: winCondition.winner,
                        reason: winCondition.reason,
                        players: room.getPlayerData()
                    }));
                    continue; // Skip broadcasting for ended match
                }
                
                // Broadcast damage/kill events if any
                const lastDamageEvent = (room as any).lastDamageEvent;
                if (lastDamageEvent) {
                    if (lastDamageEvent.died) {
                        // Player died
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_KILLED, {
                            victimId: lastDamageEvent.victimId,
                            victimName: lastDamageEvent.victimName,
                            killerId: lastDamageEvent.attackerId,
                            killerName: lastDamageEvent.attackerName
                        }));
                        
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DIED, {
                            playerId: lastDamageEvent.victimId,
                            playerName: lastDamageEvent.victimName
                        }));
                    } else {
                        // Player damaged
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DAMAGED, {
                            playerId: lastDamageEvent.victimId,
                            playerName: lastDamageEvent.victimName,
                            damage: lastDamageEvent.damage,
                            health: lastDamageEvent.newHealth,
                            maxHealth: room.getPlayer(lastDamageEvent.victimId)?.maxHealth || 100
                        }));
                    }
                    (room as any).lastDamageEvent = null;
                }
                
                // Broadcast game state to all players in room (60 Hz)
                this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_STATES, {
                    players: room.getPlayerData(),
                    gameTime: room.gameTime
                }));
                
                // Broadcast projectile updates
                const projectileUpdates = Array.from(room.projectiles.values()).map(p => p.toProjectileData());
                if (projectileUpdates.length > 0) {
                    this.broadcastToRoom(room, createServerMessage(ServerMessageType.PROJECTILE_UPDATE, {
                        projectiles: projectileUpdates
                    }));
                }
                
                // Broadcast enemy updates (for Co-op mode)
                if (room.mode === "coop") {
                    const enemyUpdates = Array.from(room.enemies.values()).map(e => e.toEnemyData());
                    if (enemyUpdates.length > 0) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.ENEMY_UPDATE, {
                            enemies: enemyUpdates
                        }));
                    }
                }
                
                // Broadcast safe zone updates (for Battle Royale mode)
                if (room.mode === "battle_royale") {
                    const safeZoneData = room.getSafeZoneData();
                    if (safeZoneData) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.SAFE_ZONE_UPDATE, safeZoneData));
                    }
                }
                
                // Broadcast CTF flag updates
                if (room.mode === "ctf") {
                    const flags = room.getCTFFlags();
                    if (flags && flags.length > 0) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CTF_FLAG_UPDATE, { flags }));
                    }
                    
                    // Broadcast CTF events
                    const pickupEvent = (room as any).lastCTFPickupEvent;
                    if (pickupEvent) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CTF_FLAG_PICKUP, pickupEvent));
                        (room as any).lastCTFPickupEvent = null;
                    }
                    
                    const captureEvent = (room as any).lastCTFCaptureEvent;
                    if (captureEvent) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CTF_FLAG_CAPTURE, captureEvent));
                        (room as any).lastCTFCaptureEvent = null;
                    }
                }
            }
        }
    }
    
    private broadcastToRoom(room: GameRoom, message: ServerMessage, excludePlayerId?: string): void {
        const serialized = serializeMessage(message);
        
        for (const player of room.getAllPlayers()) {
            if (player.id === excludePlayerId) continue;
            if (player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(serialized);
            }
        }
    }
    
    private send(ws: WebSocket, message: ServerMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(serializeMessage(message));
        }
    }
    
    private sendError(ws: WebSocket, code: string, message: string): void {
        this.send(ws, createServerMessage(ServerMessageType.ERROR, { code, message }));
    }
    
    private getPlayerBySocket(ws: WebSocket): ServerPlayer | undefined {
        for (const player of this.players.values()) {
            if (player.socket === ws) {
                return player;
            }
        }
        return undefined;
    }
    
    shutdown(): void {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }
        
        this.wss.close();
        console.log("[Server] Server shutdown");
    }
}

