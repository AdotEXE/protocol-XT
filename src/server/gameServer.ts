import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { Vector3 } from "@babylonjs/core";
import * as os from "os";
import { ServerPlayer } from "./player";
import { GameRoom } from "./room";
import { ServerProjectile } from "./projectile";
import { MatchmakingSystem } from "./matchmaking";
import { createServerMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage, PongData } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { GameMode } from "../shared/types";
import { InputValidator } from "./validation";
import { DeltaCompressor, PrioritizedBroadcaster } from "./deltaCompression";
import { initializeFirebaseAdmin, verifyIdToken } from "./auth";
import { MonitoringAPI } from "./monitoring";
import { serverLogger } from "./logger";

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
    private monitoringAPI: MonitoringAPI;
    private monitoringClients: Set<WebSocket> = new Set();
    
    // Счетчики для простой системы наименований
    private guestPlayerCounter: number = 0; // Счетчик для гостей (ID и имя: 0001, 0002...)
    private roomCounter: number = 0; // Счетчик для комнат (0001, 0002...)
    
    constructor(port: number = 8000, host: string = "0.0.0.0") {
        // ИСПРАВЛЕНО: Настройка WebSocketServer с правильной обработкой upgrade
        this.wss = new WebSocketServer({ 
            port, 
            host,
            perMessageDeflate: false, // Отключаем сжатие для совместимости
            clientTracking: true // Отслеживание клиентов
        });
        
        // Настраиваем генератор ID комнат для matchmaking
        this.matchmaking.setRoomIdGenerator(() => {
            this.roomCounter++;
            return String(this.roomCounter).padStart(4, '0');
        });
        
        // Обработка ошибок сервера (включая EADDRINUSE)
        this.wss.on("error", (error: Error & { code?: string }) => {
            if (error.code === 'EADDRINUSE') {
                serverLogger.error(`[Server] ❌ Порт ${port} уже занят!`);
                serverLogger.error(`[Server] Попробуйте:`);
                serverLogger.error(`[Server]   1. Закрыть процесс, использующий порт ${port}`);
                serverLogger.error(`[Server]   2. Или установить переменную окружения PORT=<другой_порт>`);
                serverLogger.error(`[Server]   3. Windows: netstat -ano | findstr :${port} - найти процесс`);
                serverLogger.error(`[Server]   4. Windows: taskkill /PID <PID> /F - закрыть процесс`);
            } else {
                serverLogger.error(`[Server] ❌ WebSocket server error:`, error);
            }
        });
        
        this.wss.on("listening", () => {
            serverLogger.log(`[Server] ✅ WebSocket server started on ${host}:${port}`);
        });
        
        // Выводим информацию о доступных адресах для подключения
        this.printNetworkInfo(port);
        
        // Инициализация Firebase Admin для валидации токенов
        initializeFirebaseAdmin();
        
        // Инициализация Monitoring API
        this.monitoringAPI = new MonitoringAPI(this);
        
        this.setupWebSocket();
        this.startGameLoop();
        this.startMonitoringBroadcast();
        this.startPeriodicStats();
        
        serverLogger.log(`[Server] ✅ Сервер готов к работе. Активных комнат: 0, подключенных игроков: 0`);
    }
    
    private printNetworkInfo(port: number): void {
        const interfaces = os.networkInterfaces();
        
        serverLogger.log(`\n[Server] Доступные адреса для подключения:`);
        serverLogger.log(`  - localhost: ws://localhost:${port} (только на этой машине)`);
        serverLogger.log(`  - 127.0.0.1: ws://127.0.0.1:${port} (только на этой машине)`);
        
        // Выводим все локальные IP-адреса
        const addresses: string[] = [];
        Object.keys(interfaces).forEach((iface) => {
            interfaces[iface]?.forEach((addr: any) => {
                if (addr.family === 'IPv4' && !addr.internal) {
                    addresses.push(addr.address);
                    serverLogger.log(`  - ${iface}: ws://${addr.address}:${port} (для подключения с других ПК)`);
                }
            });
        });
        
        if (addresses.length === 0) {
            serverLogger.log(`  ⚠️  Локальные IP-адреса не найдены. Используйте localhost для подключения на этой машине.`);
        } else {
            serverLogger.log(`\n[Server] Для подключения с другого ПК используйте один из адресов выше.`);
        }
        serverLogger.log(``);
    }
    
    private setupWebSocket(): void {
        // Обработка ошибок сервера
        this.wss.on("error", (error: Error) => {
            serverLogger.error("[Server] WebSocket server error:", error);
        });
        
        // Обработка HTTP запросов (для отладки)
        this.wss.on("headers", (headers: string[], req: any) => {
            // Логируем заголовки для отладки
            if (req.url && !req.url.includes('/socket.io')) {
                serverLogger.log("[Server] Upgrade request from:", req.socket.remoteAddress, "URL:", req.url);
            }
        });
        
        // Обработка подключений
        this.wss.on("connection", (ws: WebSocket, req: any) => {
            serverLogger.log("[Server] New client connected from:", req.socket.remoteAddress || "unknown");
            
            ws.on("message", (data: Buffer) => {
                try {
                    const dataStr = data.toString();
                    
                    // Try to parse as JSON first (for monitoring messages)
                    let message: any;
                    try {
                        message = JSON.parse(dataStr);
                        // Check if it's a monitoring message
                        if (message.type === "monitoring_connect" || message.type === "monitoring_disconnect") {
                            this.handleMessage(ws, message);
                            return;
                        }
                    } catch (e) {
                        // Not JSON, continue with deserialize
                    }
                    
                    // Try to deserialize as ClientMessage
                    message = deserializeMessage<ClientMessage>(dataStr);
                    this.handleMessage(ws, message);
                } catch (error) {
                    // Only send error for game clients, not monitoring clients
                    if (!this.monitoringClients.has(ws)) {
                        serverLogger.error("[Server] Error parsing message:", error);
                        this.sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
                    }
                }
            });
            
            ws.on("close", () => {
                this.handleDisconnect(ws);
            });
            
            ws.on("error", (error) => {
                serverLogger.error("[Server] WebSocket error:", error);
            });
        });
    }
    
    private handleMessage(ws: WebSocket, message: ClientMessage | any): void {
        // Check for monitoring messages first (before parsing as ClientMessage)
        if (message && typeof message === 'object' && message.type) {
            if (message.type === "monitoring_connect") {
                // Monitoring client connecting
                this.monitoringClients.add(ws);
                // Send initial stats
                this.sendMonitoringStats(ws);
                return;
            } else if (message.type === "monitoring_disconnect") {
                // Monitoring client disconnecting
                this.monitoringClients.delete(ws);
                return;
            }
        }
        
        // Skip game message handling for monitoring clients
        if (this.monitoringClients.has(ws)) {
            return;
        }
        
        // Handle regular game messages
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
                
            case ClientMessageType.LIST_ROOMS:
                if (player) this.handleListRooms(player, message.data);
                break;
                
            case ClientMessageType.QUICK_PLAY:
                if (player) this.handleQuickPlay(player, message.data);
                break;
                
            case ClientMessageType.CANCEL_QUEUE:
                if (player) this.handleCancelQueue(player, message.data);
                break;
                
            case ClientMessageType.START_GAME:
                if (player) this.handleStartGame(player, message.data);
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
                
            case ClientMessageType.CLIENT_METRICS:
                if (player) this.handleClientMetrics(player, message.data);
                break;
                
            case ClientMessageType.VOICE_OFFER:
            case ClientMessageType.VOICE_ANSWER:
            case ClientMessageType.VOICE_ICE_CANDIDATE:
                // Voice signaling handled elsewhere
                // if (player) this._handleVoiceSignaling(player, message);
                break;
                
            case ClientMessageType.PING:
                if (player) this.handlePing(player, message.data);
                break;
                
            default:
                serverLogger.warn(`[Server] Unknown message type: ${message.type}`);
        }
    }
    
    private async handleConnect(ws: WebSocket, data: any): Promise<void> {
        const playerId = data.playerId;
        const idToken = data.idToken; // Firebase ID токен
        
        // Валидация токена, если предоставлен
        let verifiedUserId: string | null = null;
        if (idToken) {
            const decodedToken = await verifyIdToken(idToken);
            if (decodedToken) {
                verifiedUserId = decodedToken.uid;
                serverLogger.log(`[Server] Token verified for user: ${verifiedUserId}`);
                
                // Используем UID из токена вместо переданного playerId для безопасности
                if (verifiedUserId !== playerId) {
                    serverLogger.warn(`[Server] Player ID mismatch: provided ${playerId}, token UID ${verifiedUserId}`);
                }
            } else {
                serverLogger.warn(`[Server] Invalid token provided, connection may be rejected`);
                // Можно отклонить подключение или разрешить как гостя
                // Для гибкости разрешаем подключение без валидации
            }
        }
        
        // Простая система наименований: для гостей генерируем простой ID и имя anon_ID:XXXX
        // Для авторизованных используем Firebase UID
        let finalPlayerId: string;
        let finalPlayerName: string;
        
        if (verifiedUserId) {
            // Авторизованный игрок - используем Firebase UID как ID
            finalPlayerId = verifiedUserId;
            finalPlayerName = data.playerName || `User_${verifiedUserId.substring(0, 6)}`;
        } else {
            // Гость - генерируем простой ID (0001, 0002, 0003...) и имя anon_ID:XXXX
            // Используем ОДИН счетчик для согласованности ID и имени
            this.guestPlayerCounter++;
            const guestNumber = String(this.guestPlayerCounter).padStart(4, '0');
            finalPlayerId = guestNumber; // ID = 0001, 0002, 0003...
            finalPlayerName = `anon_ID:${guestNumber}`; // Имя = anon_ID:0001, anon_ID:0002, anon_ID:0003...
            serverLogger.log(`[Server] Гость подключился: ID=${finalPlayerId}, имя=${finalPlayerName} (игнорировано имя от клиента: ${data.playerName || 'не указано'})`);
        }
        
        let player = this.players.get(finalPlayerId);
        
        if (!player) {
            // Новое подключение - создаем игрока с правильным ID и именем
            player = new ServerPlayer(ws, finalPlayerId, finalPlayerName);
            this.players.set(player.id, player);
            serverLogger.log(`[Server] Игрок подключен: ID=${player.id}, имя=${player.name}${verifiedUserId ? ' [AUTHENTICATED]' : ' [GUEST]'}`);
        } else {
            // Reconnection - обновляем сокет и имя
            if (!verifiedUserId) {
                player.name = finalPlayerName; // Обновляем имя для гостей
            }
            player.socket = ws;
            player.connected = true;
            serverLogger.log(`[Server] Игрок переподключен: ID=${player.id}, имя=${player.name}${verifiedUserId ? ' [AUTHENTICATED]' : ' [GUEST]'}`);
        }
        
        this.send(ws, createServerMessage(ServerMessageType.CONNECTED, {
            playerId: player.id,
            playerName: player.name,
            authenticated: !!verifiedUserId
        }));
    }
    
    private handleCreateRoom(player: ServerPlayer, data: any): void {
        const { mode, maxPlayers, isPrivate, settings, worldSeed } = data;
        
        // Генерируем простой ID комнаты (0001, 0002, и т.д.)
        this.roomCounter++;
        const roomId = String(this.roomCounter).padStart(4, '0');
        serverLogger.log(`[Server] 🔧 Генерация ID комнаты: roomCounter=${this.roomCounter}, roomId=${roomId}`);
        
        const room = new GameRoom(mode, maxPlayers, isPrivate, worldSeed, roomId);
        room.settings = settings || {};
        
        // Проверяем, что ID комнаты правильный
        if (room.id !== roomId) {
            serverLogger.error(`[Server] ❌ ОШИБКА: ID комнаты не совпадает! Ожидалось: ${roomId}, получено: ${room.id}`);
        } else {
            serverLogger.log(`[Server] ✅ ID комнаты подтвержден: ${room.id}`);
        }
        
        if (room.addPlayer(player)) {
            this.rooms.set(room.id, room);
            room.creatorId = player.id; // Сохраняем ID создателя
            serverLogger.log(`[Server] Комната создана: ID=${room.id}, режим=${mode}, игроков=1/${maxPlayers}, создатель=${player.id} (${player.name}), seed=${room.worldSeed}`);
            
            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_CREATED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed,
                isCreator: true
            }));
            
            // Отправляем обновленный список комнат всем подключенным клиентам
            this.broadcastRoomListToAll();
        } else {
            serverLogger.error(`[Server] Ошибка создания комнаты: не удалось добавить игрока ${player.id}`);
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
            serverLogger.log(`[Server] Игрок ${player.id} (${player.name}) присоединился к комнате ${room.id}, игроков в комнате: ${room.players.size}/${room.maxPlayers}`);
            
            // Notify player
            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_JOINED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed,
                players: room.getPlayerData(),
                isCreator: room.creatorId === player.id,
                isActive: room.isActive // Добавляем информацию о статусе игры
            }));
            
            // Если комната активна, сразу отправляем GAME_START для присоединения к идущей игре
            if (room.isActive) {
                serverLogger.log(`[Server] Комната ${room.id} активна, отправляем GAME_START новому игроку ${player.id}`);
                this.send(player.socket, createServerMessage(ServerMessageType.GAME_START, {
                    roomId: room.id,
                    mode: room.mode,
                    worldSeed: room.worldSeed,
                    players: room.getPlayerData(),
                    enemies: room.getEnemyData() // Отправляем данные о ботах для синхронизации
                }));
            }
            
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
                serverLogger.log(`[Server] Комната ${room.id} удалена (пустая)`);
                // Отправляем обновленный список комнат всем подключенным клиентам
                this.broadcastRoomListToAll();
            }
        }
        
        player.roomId = null;
    }
    
    private handleStartGame(player: ServerPlayer, _data: any): void {
        if (!player.roomId) {
            this.sendError(player.socket, "NOT_IN_ROOM", "You are not in a room");
            return;
        }
        
        const room = this.rooms.get(player.roomId);
        if (!room) {
            this.sendError(player.socket, "ROOM_NOT_FOUND", "Room not found");
            return;
        }
        
        // Проверяем, что игрок является создателем комнаты
        if (room.creatorId !== player.id) {
            this.sendError(player.socket, "NOT_CREATOR", "Only room creator can start the game");
            return;
        }
        
        // Проверяем минимальное количество игроков (минимум 2)
        if (room.players.size < 2) {
            this.sendError(player.socket, "NOT_ENOUGH_PLAYERS", "Need at least 2 players to start the game");
            return;
        }
        
        // Проверяем, что игра еще не началась
        if (room.isActive) {
            this.sendError(player.socket, "GAME_ALREADY_STARTED", "Game is already in progress");
            return;
        }
        
        // Запускаем игру
        room.startMatch();
        serverLogger.log(`[Server] Игра запущена в комнате ${room.id} создателем ${player.id} (${player.name}), игроков: ${room.players.size}`);
        
        // Отправляем всем игрокам в комнате
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, {
            roomId: room.id,
            mode: room.mode,
            worldSeed: room.worldSeed,
            players: room.getPlayerData(),
            enemies: room.getEnemyData() // Отправляем данные о ботах для синхронизации
        }));
    }
    
    private handleQuickPlay(player: ServerPlayer, data: any): void {
        const { mode, region, skillBased } = data;
        
        // СНАЧАЛА ищем существующие комнаты с таким же режимом
        const availableRooms = Array.from(this.rooms.values()).filter(room => {
            return room.mode === mode && 
                   !room.isPrivate && 
                   !room.isActive && 
                   room.players.size < room.maxPlayers;
        });
        
        if (availableRooms.length > 0) {
            // Нашли существующую комнату - присоединяемся к ней
            const room = availableRooms[0]; // Берем первую доступную
            serverLogger.log(`[Server] Quick play: присоединение к существующей комнате ${room.id} (режим: ${mode})`);
            
            if (player.roomId) {
                this.handleLeaveRoom(player);
            }
            
            if (room.addPlayer(player)) {
                player.roomId = room.id;
                
                this.send(player.socket, createServerMessage(ServerMessageType.ROOM_JOINED, {
                    roomId: room.id,
                    mode: room.mode,
                    worldSeed: room.worldSeed,
                    players: room.getPlayerData(),
                    maxPlayers: room.maxPlayers
                }));
                
                // Уведомляем других игроков в комнате
                room.getAllPlayers().forEach(p => {
                    if (p.id !== player.id) {
                        this.send(p.socket, createServerMessage(ServerMessageType.PLAYER_JOINED, {
                            player: room.getPlayerData().find(pd => pd.id === player.id)
                        }));
                    }
                });
                
                // Не запускаем игру автоматически - ждем команды от создателя комнаты
                
                return; // Успешно присоединились, выходим
            }
        }
        
        // Если не нашли существующую комнату, добавляем в очередь матчмейкинга
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
            
            // Не запускаем игру автоматически - ждем команды от создателя комнаты
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
    
    private handleListRooms(player: ServerPlayer, data: any): void {
        const { mode } = data || {};
        
        // Получаем список всех доступных комнат
        const allRooms = Array.from(this.rooms.values());
        
        // Фильтруем по режиму если указан
        const filteredRooms = mode 
            ? allRooms.filter(room => room.mode === mode && !room.isPrivate)
            : allRooms.filter(room => !room.isPrivate);
        
        // Формируем данные о комнатах
        const roomsList = filteredRooms.map(room => ({
            id: room.id,
            mode: room.mode,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            isActive: room.isActive,
            gameTime: room.gameTime
        }));
        
        serverLogger.log(`[Server] Запрос списка комнат от ${player.id} (${player.name}): найдено ${filteredRooms.length} комнат${mode ? ` (режим: ${mode})` : ''}`);
        
        this.send(player.socket, createServerMessage(ServerMessageType.ROOM_LIST, {
            rooms: roomsList
        }));
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
            serverLogger.warn(`[Server] Rate limit exceeded for player ${player.id}: ${player.inputCount} inputs/sec`);
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
            serverLogger.warn(`[Server] Invalid input from player ${player.id}: ${validation.reason}`);
            // Don't process invalid input, but don't disconnect player
            return;
        }
        
        // Update last valid position
        player.lastValidPosition = player.position.clone();
        
        // Track sequence number for reconciliation
        if (data.sequence !== undefined && typeof data.sequence === 'number') {
            player.lastProcessedSequence = data.sequence;
        }
        
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
            serverLogger.warn(`[Server] Shoot rate limit exceeded for player ${player.id}: ${player.shootCount} shots/sec`);
            return;
        }
        
        // Validate shoot data
        const validation = InputValidator.validateShootData(data);
        if (!validation.valid) {
            serverLogger.warn(`[Server] Invalid shoot data from player ${player.id}: ${validation.reason}`);
            return;
        }
        
        // Create projectile on server
        const projId = nanoid();
        const projPos = new Vector3(data.position.x, data.position.y, data.position.z);
        const projVel = new Vector3(data.direction.x, data.direction.y, data.direction.z).scale(100); // Projectile speed
        const shootTime = data.timestamp || Date.now();
        
        // Store shooter's RTT for lag compensation (use ping if available, estimate otherwise)
        const shooterRTT = player.ping > 0 ? player.ping : 100; // Use measured ping or default
        
        const projectile = new ServerProjectile({
            id: projId,
            ownerId: player.id,
            position: projPos,
            velocity: projVel,
            damage: data.damage || 20,
            cannonType: data.cannonType || "standard",
            spawnTime: shootTime,
            shooterRTT: shooterRTT // Store RTT for lag compensation
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
    
    private handleClientMetrics(player: ServerPlayer, data: any): void {
        // Store client metrics in monitoring API
        this.monitoringAPI.storeClientMetrics(player.id, data);
    }
    
    private handlePing(player: ServerPlayer, data: any): void {
        // Respond to ping with pong
        const pingData = data as { timestamp: number; sequence: number };
        const currentTime = Date.now();
        const rtt = currentTime - pingData.timestamp;
        
        // Update player's ping (use EWMA for smoothing)
        const alpha = 0.125; // Weight for new measurement
        player.ping = (1 - alpha) * player.ping + alpha * rtt;
        player.lastPing = currentTime;
        
        const pongData: PongData = {
            timestamp: pingData.timestamp,
            sequence: pingData.sequence,
            serverTime: currentTime
        };
        
        this.send(player.socket, createServerMessage(ServerMessageType.PONG, pongData));
    }
    
    private handleCancelQueue(player: ServerPlayer, data: any): void {
        const { mode, region } = data;
        this.matchmaking.removeFromQueue(player, mode, region);
        serverLogger.log(`[Server] Player ${player.id} cancelled queue for ${mode}`);
    }
    
    private handleDisconnect(ws: WebSocket): void {
        // Check if it's a monitoring client
        if (this.monitoringClients.has(ws)) {
            this.monitoringClients.delete(ws);
            return;
        }
        
        const player = this.getPlayerBySocket(ws);
        if (player) {
            serverLogger.log(`[Server] Player disconnected: ${player.id}`);
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
            const tickStartTime = now;
            const deltaTime = (now - this.lastTick) / 1000; // Convert to seconds
            this.lastTick = now;
            
            this.update(deltaTime);
            
            // Record tick time for monitoring
            const tickEndTime = Date.now();
            const tickTime = tickEndTime - tickStartTime;
            this.monitoringAPI.recordTickTime(tickTime);
            this.tickCount++;
        }, TICK_INTERVAL);
    }
    
    private startMonitoringBroadcast(): void {
        // Broadcast monitoring stats every second to monitoring clients
        setInterval(() => {
            this.broadcastMonitoringStats();
        }, 1000);
    }
    
    private startPeriodicStats(): void {
        // Выводим статистику каждые 30 секунд
        setInterval(() => {
            const activeRooms = Array.from(this.rooms.values()).filter(r => r.isActive).length;
            const totalRooms = this.rooms.size;
            const totalPlayers = this.players.size;
            const connectedPlayers = Array.from(this.players.values()).filter(p => p.connected).length;
            
            serverLogger.log(`[Server] 📊 Статистика: комнат=${totalRooms} (активных=${activeRooms}), игроков=${totalPlayers} (подключено=${connectedPlayers})`);
        }, 30000); // 30 секунд
    }
    
    private broadcastMonitoringStats(): void {
        if (this.monitoringClients.size === 0) return;
        
        const stats = this.monitoringAPI.getStats();
        
        // Add detailed room info to stats
        const detailedRooms = this.monitoringAPI.getDetailedRoomStats();
        const roomsList = detailedRooms.map(room => ({
            id: room.id,
            mode: room.mode,
            players: room.currentPlayers,
            maxPlayers: room.maxPlayers,
            status: room.isActive ? 'ACTIVE' : 'WAITING',
            gameTime: room.gameTime
        }));
        
        const enhancedStats = {
            ...stats,
            roomsList
        };
        
        const message = createServerMessage(ServerMessageType.MONITORING_STATS, enhancedStats);
        const serialized = serializeMessage(message);
        
        for (const client of this.monitoringClients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(serialized);
            } else {
                this.monitoringClients.delete(client);
            }
        }
    }
    
    private sendMonitoringStats(ws: WebSocket): void {
        const stats = this.monitoringAPI.getStats();
        
        // Add detailed room info to stats
        const detailedRooms = this.monitoringAPI.getDetailedRoomStats();
        const roomsList = detailedRooms.map(room => ({
            id: room.id,
            mode: room.mode,
            players: room.currentPlayers,
            maxPlayers: room.maxPlayers,
            status: room.isActive ? 'ACTIVE' : 'WAITING',
            gameTime: room.gameTime
        }));
        
        const enhancedStats = {
            ...stats,
            roomsList
        };
        
        this.send(ws, createServerMessage(ServerMessageType.MONITORING_STATS, enhancedStats));
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
                // Send individual messages with serverSequence for each player
                // Use delta compression and prioritization
                const allPlayerData = room.getPlayerData();
                
                // Get or create delta compressor for this room
                let compressor = this.deltaCompressor.get(room.id);
                if (!compressor) {
                    compressor = new DeltaCompressor();
                    this.deltaCompressor.set(room.id, compressor);
                }
                
                for (const player of room.getAllPlayers()) {
                    // Prioritize players based on distance
                    const playerPos = player.position;
                    const prioritizedPlayers = this.prioritizedBroadcaster.prioritizePlayers(
                        allPlayerData,
                        playerPos,
                        20 // Max 20 prioritized players
                    );
                    
                    // Use prioritization to limit players sent (delta compression is internal optimization)
                    // For now, send full prioritized list (quantization happens in compression, but we use full data for compatibility)
                    // NOTE: Full delta compression would require:
                    // 1. Store previous state on client (lastState Map)
                    // 2. Send only changed fields: { id, delta: { position?, rotation?, health? } }
                    // 3. Client applies delta to cached state
                    // This is a significant protocol change - implement when bandwidth optimization is critical
                    const statesData = {
                        players: prioritizedPlayers, // Send prioritized players (full data with quantization in serialization)
                        gameTime: room.gameTime,
                        serverSequence: player.lastProcessedSequence
                    };
                    this.send(player.socket, createServerMessage(ServerMessageType.PLAYER_STATES, statesData));
                }
                
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
    
    private broadcastRoomListToAll(): void {
        // Получаем список всех доступных комнат (не приватных)
        const allRooms = Array.from(this.rooms.values());
        const publicRooms = allRooms.filter(room => !room.isPrivate);
        
        const roomsList = publicRooms.map(room => ({
            id: room.id,
            mode: room.mode,
            players: room.players.size,
            maxPlayers: room.maxPlayers,
            isActive: room.isActive,
            gameTime: room.gameTime
        }));
        
        serverLogger.log(`[Server] 📢 Отправка списка комнат всем подключенным клиентам: ${roomsList.length} публичных комнат, всего подключено ${this.players.size} игроков`);
        
        const message = createServerMessage(ServerMessageType.ROOM_LIST, {
            rooms: roomsList
        });
        const serialized = serializeMessage(message);
        
        // Отправляем всем подключенным игрокам
        let sentCount = 0;
        for (const player of this.players.values()) {
            if (player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(serialized);
                sentCount++;
            }
        }
        serverLogger.log(`[Server] ✅ Список комнат отправлен ${sentCount} клиентам`);
    }
    
    private send(ws: WebSocket, message: ServerMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            const serialized = serializeMessage(message);
            // WebSocket.send() accepts both string and ArrayBuffer
            ws.send(serialized);
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
    
    /**
     * Получить статистику сервера (для мониторинга)
     */
    getStats() {
        return this.monitoringAPI.getStats();
    }
    
    /**
     * Получить детальную статистику всех комнат
     */
    getDetailedRoomStats() {
        return this.monitoringAPI.getDetailedRoomStats();
    }
    
    /**
     * Получить детальную статистику всех игроков
     */
    getDetailedPlayerStats() {
        return this.monitoringAPI.getDetailedPlayerStats();
    }
    
    /**
     * Получить Monitoring API (для расширенного доступа)
     */
    getMonitoringAPI(): MonitoringAPI {
        return this.monitoringAPI;
    }
    
    shutdown(): void {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
        }
        
        this.wss.close();
        serverLogger.log("[Server] Server shutdown");
    }
}

