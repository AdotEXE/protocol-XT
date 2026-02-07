import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import { GeckosServer, ChannelId } from "@geckos.io/server";
// @geckos.io/server does not export GeckosChannel directly in all versions, using any for now or specific interface if available
// If GeckosChannel is needed as a type, we might need to rely on inference or a custom interface matching the library's structure.
// For now, let's remove GeckosChannel from named imports if it fails.
// Checking the errors, it says 'Module ... has no exported member GeckosChannel'.
// Often it's named 'ServerChannel' or similar, or just 'Channel'.
// Let's try importing just GeckosServer and ChannelId first.
import { Vector3 } from "@babylonjs/core";
import * as os from "os";
import { getLocalIP, getAllLocalIPs } from "../../scripts/get-local-ip";
import { ServerPlayer } from "./player";
import { GameRoom } from "./room";
import { ServerProjectile } from "./projectile";
import { ServerWall } from "./wall";
import { MatchmakingSystem } from "./matchmaking";
import { createServerMessage, deserializeMessage, serializeMessage } from "../shared/protocol";
import type { ClientMessage, ServerMessage, PongData } from "../shared/messages";
import { ClientMessageType, ServerMessageType } from "../shared/messages";
import type { GameMode } from "../shared/types";
import { InputValidator, RateLimiter } from "./validation";
import { DeltaCompressor, PrioritizedBroadcaster } from "./deltaCompression";
import { initializeFirebaseAdmin, verifyIdToken } from "./auth";
import { MonitoringAPI } from "./monitoring";
import { serverLogger } from "./logger";
import { SpatialHashGrid } from "./spatialHash";

const TICK_RATE = 60; // 60 Hz
const TICK_INTERVAL = 1000 / TICK_RATE; // ~16.67ms
const ROOM_DELETION_DELAY = 5 * 60 * 1000; // 5 minutes in milliseconds

export class GameServer {
    private wss: WebSocketServer;
    private players: Map<string, ServerPlayer> = new Map();
    private rooms: Map<string, GameRoom> = new Map();
    private matchmaking: MatchmakingSystem = new MatchmakingSystem();
    private tickInterval: NodeJS.Timeout | null = null;
    private monitoringIntervals: NodeJS.Timeout[] = [];
    private lastTick: number = Date.now();
    private tickCount: number = 0;
    private deltaCompressor: Map<string, DeltaCompressor> = new Map(); // Per-room compressors
    private prioritizedBroadcaster: PrioritizedBroadcaster = new PrioritizedBroadcaster();
    private monitoringAPI: MonitoringAPI;
    private monitoringClients: Set<WebSocket> = new Set();

    private rateLimiter: RateLimiter = new RateLimiter(); // Per-player rate limiting
    private geckosServer: GeckosServer | null = null;
    private udpPlayers: Map<string, any> = new Map();
    private udpPort: number | null = null;

    // Spatial partitioning: per-room spatial hash grids
    private spatialGrids: Map<string, SpatialHashGrid> = new Map();

    // Adaptive update rate tracking: Map<receiverId, Map<senderId, lastUpdateTick>>
    private lastPlayerUpdateTick: Map<string, Map<string, number>> = new Map();

    // Ban system: playerId -> ban expiry timestamp (0 for permanent)
    private bannedPlayers: Map<string, { expiry: number; reason: string; banCount: number }> = new Map();

    // Счетчики для простой системы наименований
    private guestPlayerCounter: number = 0; // Счетчик для гостей (ID и имя: 0001, 0002...)
    private roomCounter: number = 0; // Счетчик для комнат (0001, 0002...)


    constructor(port: number = 8000, host: string = "127.0.0.1") {
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
            const displayHost = host === "0.0.0.0" ? "0.0.0.0 (all interfaces)" : host;
            serverLogger.log(`[Server] ✅ WebSocket server started on ${displayHost}:${port}`);
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
        serverLogger.log(`\n[Server] ═══════════════════════════════════════════════════════════`);
        serverLogger.log(`[Server] 📍 Локальный доступ:`);
        serverLogger.log(`[Server]    → ws://localhost:${port}`);
        serverLogger.log(`[Server]    → ws://127.0.0.1:${port}`);

        const localIP = getLocalIP();
        const allIPs = getAllLocalIPs();

        if (localIP) {
            serverLogger.log(`[Server] `);
            serverLogger.log(`[Server] 🌐 Сетевой доступ (для других ПК в сети):`);
            serverLogger.log(`[Server]    → ws://${localIP}:${port}`);
        }

        if (allIPs.length > 1) {
            serverLogger.log(`[Server] `);
            serverLogger.log(`[Server] 📡 Все доступные IP-адреса:`);
            allIPs.forEach(ip => {
                serverLogger.log(`[Server]    → ws://${ip}:${port}`);
            });
        }

        serverLogger.log(`[Server] ═══════════════════════════════════════════════════════════`);
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
        this.setupConnectionHandler();
    }

    public setGeckosServer(io: GeckosServer): void {
        this.geckosServer = io;
        this.setupGeckos();
        serverLogger.log("[Server] 🦎 UDP Transport (Geckos.io) enabled");
    }

    public setUdpPort(port: number): void {
        this.udpPort = port;
    }


    private setupGeckos(): void {
        if (!this.geckosServer) return;

        this.geckosServer.onConnection((channel: any) => {
            const channelId = channel.id;

            // Wait for authentication/handshake from client
            // Client sends: { type: 'auth', token: 'PLAYER_ID_TOKEN' }
            channel.onRaw((buffer: ArrayBuffer) => {
                // First packet must be auth
                // Or we can rely on .emit('auth', ...) events if reliable
                // Let's assume client sends an 'auth' event first for reliability
            });

            channel.on('auth', (data: any) => {
                const playerId = data.playerId;
                const token = data.token; // verification if needed

                if (playerId && this.players.has(playerId)) {
                    // Link UDP channel to player
                    this.udpPlayers.set(playerId, channel);
                    serverLogger.log(`[Server] 🦎 UDP Connected: ${playerId} (${channelId})`);

                    // Notify client of success
                    channel.emit('auth_ack', { status: 'ok' });

                    // Setup message handlers for this player/channel
                    this.setupGeckosPlayerHandlers(playerId, channel);
                } else {
                    channel.emit('auth_fail', { reason: 'Unknown player' });
                }
            });

            channel.onDisconnect(() => {
                // Find player by channel and remove
                for (const [pid, ch] of this.udpPlayers.entries()) {
                    if (ch.id === channel.id) {
                        this.udpPlayers.delete(pid);
                        serverLogger.log(`[Server] 🦎 UDP Disconnected: ${pid}`);
                        break;
                    }
                }
            });
        });
    }

    private setupGeckosPlayerHandlers(playerId: string, channel: any): void {
        const player = this.players.get(playerId);
        if (!player) return;

        // Handle PLAYER_INPUT via UDP
        channel.onRaw((buffer: ArrayBuffer | Buffer) => {
            try {
                // Assuming first byte identifies message type or we use Protocol Schema
                // For now, let's just interpret as MessagePack if it's our binary format
                // OR we can define specific raw types.

                // Let's reuse our binary protocol `deserializeMessage` if possible.
                // Note: buffer might need to be Uint8Array
                const uint8Array = new Uint8Array(buffer as ArrayBuffer);
                const message = deserializeMessage(uint8Array);

                if (message) {
                    // Handle specific high-frequency messages
                    if (message.type === ClientMessageType.PLAYER_INPUT) {
                        this.handlePlayerInput(player, message.data);
                    }
                }
            } catch (error) {
                // Suppress errors for UDP noise
            }
        });
    }

    // Обработка подключений
    private setupConnectionHandler(): void {
        this.wss.on("connection", (ws: WebSocket, req: any) => {
            // serverLogger.log("[Server] New client connected from:", req.socket.remoteAddress || "unknown");

            ws.on("message", (data: Buffer) => {
                try {
                    let message: any;

                    // Try to deserialize binary data first (for game messages)
                    // Buffer in Node.js extends Uint8Array, so we can pass it directly
                    try {
                        message = deserializeMessage<ClientMessage>(data);
                        this.handleMessage(ws, message);
                        return;
                    } catch (binaryError) {
                        // Not binary format, try JSON fallback
                    }

                    // Fallback: try to parse as JSON (for monitoring messages)
                    const dataStr = data.toString();
                    try {
                        message = JSON.parse(dataStr);
                        // Check if it's a monitoring message
                        if (message.type === "monitoring_connect" || message.type === "monitoring_disconnect") {
                            this.handleMessage(ws, message);
                            return;
                        }
                        // Also handle regular JSON messages for backward compatibility
                        this.handleMessage(ws, message);
                    } catch (jsonError) {
                        // Neither binary nor JSON
                        if (!this.monitoringClients.has(ws)) {
                            serverLogger.error("[Server] Error parsing message - not binary or JSON");
                            this.sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
                        }
                    }
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

    // Соединения голосового чата теперь обрабатываются через основной WebSocket
    // private voiceClients: Set<WebSocket> = new Set();

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
            } else if (message.type === "admin_command") {
                // Admin command from monitoring
                if (this.monitoringClients.has(ws)) {
                    this.handleAdminCommand(ws, message.command, message.args);
                }
                return;
            }

            // Voice messages are now handled via standard game messages
            if (message.type && (message.type === "voice_join" || message.type === "voice_offer" ||
                message.type === "voice_answer" || message.type === "voice_ice_candidate" ||
                message.type === "voice_leave")) {
                // Legacy check - should not be hit with new client
                return;
            }
        }

        // Skip game message handling for monitoring clients
        if (this.monitoringClients.has(ws)) {
            return;
        }

        // Voice clients set removed


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

            case ClientMessageType.GET_ONLINE_PLAYERS:
                if (player) this.handleGetOnlinePlayers(player);
                break;

            case ClientMessageType.QUICK_PLAY:
                if (player) this.handleQuickPlay(player, message.data);
                break;

            case ClientMessageType.CANCEL_QUEUE:
                if (player) this.handleCancelQueue(player, message.data);
                break;

            case ClientMessageType.GAME_INVITE:
                if (player) this.handleGameInvite(player, message.data);
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

            case ClientMessageType.PLAYER_RESPAWN_REQUEST:
                if (player) this.handlePlayerRespawnRequest(player, message.data);
                break;

            case ClientMessageType.PLAYER_HIT:
                if (player) this.handlePlayerHit(player, message.data);
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

            case ClientMessageType.WALL_SPAWN:
                if (player) this.handleWallSpawn(player, message.data);
                break;

            case ClientMessageType.VOICE_OFFER:
            case ClientMessageType.VOICE_ANSWER:
            case ClientMessageType.VOICE_ICE_CANDIDATE:
                if (player) {
                    if (message.type === ClientMessageType.VOICE_TALKING) {
                        this._handleVoiceTalking(player, message);
                    } else {
                        this._handleVoiceSignaling(player, message);
                    }
                }
                break;

            case ClientMessageType.PING:
                if (player) this.handlePing(player, message.data);
                break;

            case ClientMessageType.CHANGE_ROOM_SETTINGS:
                if (player) this.handleChangeRoomSettings(player, message.data);
                break;

            case ClientMessageType.UPDATE_PROFILE:
                if (player) this.handleUpdateProfile(player, message.data);
                break;

            default:
                serverLogger.warn(`[Server] Unknown message type: ${message.type}`);
        }
    }

    private handleAdminCommand(ws: WebSocket, command: string, args: any): void {
        serverLogger.log(`[Server] 👮 Admin Command: ${command} ${JSON.stringify(args || {})}`);

        switch (command) {
            case 'kick': {
                const playerId = args.playerId;
                if (!playerId) return;

                const playerToKick = this.players.get(playerId);
                if (playerToKick) {
                    this.sendError(playerToKick.socket, "KICKED", "You have been kicked by an admin.");
                    playerToKick.socket.close();
                    serverLogger.log(`[Server] 👢 Kicked player: ${playerId}`);
                }
                break;
            }
            case 'say': {
                const text = args.text;
                if (!text) return;

                // Broadcast chat message as 'Server' or 'Admin'
                const chatMsg = createServerMessage(ServerMessageType.CHAT_MESSAGE, {
                    playerId: "0",
                    playerName: "Admin",
                    text: text,
                    isSystem: true
                });

                // Broadcast to all rooms and all players
                // We don't have a global broadcast for chat easily, so iterate rooms or players
                // Iterating players is safer to ensure everyone gets it
                for (const player of this.players.values()) {
                    if (player.connected) {
                        this.send(player.socket, chatMsg);
                    }
                }
                break;
            }
            case 'restart': {
                // Send restart warning
                const restartMsg = createServerMessage(ServerMessageType.CHAT_MESSAGE, {
                    playerId: "0",
                    playerName: "System",
                    text: "Server is restarting in 3 seconds...",
                    isSystem: true
                });

                for (const player of this.players.values()) {
                    if (player.connected) {
                        this.send(player.socket, restartMsg);
                    }
                }

                setTimeout(() => {
                    serverLogger.log(`[Server] 🔄 Admin requested restart.`);
                    process.exit(0);
                }, 3000);
                break;
            }
        }
    }

    private handleUpdateProfile(player: ServerPlayer, data: any): void {
        const { playerName } = data;
        if (!playerName || typeof playerName !== 'string') return;

        // Валидация имени
        const cleanName = playerName.trim().substring(0, 20); // Limit length
        if (cleanName.length < 1) return;

        serverLogger.log(`[Server] 👤 Игрок ${player.id} сменил имя с "${player.name}" на "${cleanName}"`);

        // Обновляем имя игрока
        player.name = cleanName;

        // Уведомляем всех в комнате (если игрок в комнате)
        if (player.roomId) {
            const room = this.rooms.get(player.roomId);
            if (room) {
                // Broadcast to everyone in room including sender
                this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_PROFILE_UPDATED, {
                    playerId: player.id,
                    playerName: player.name
                }));
            }
        } else {
            // Если не в комнате, отправляем подтверждение самому игроку
            this.send(player.socket, createServerMessage(ServerMessageType.PLAYER_PROFILE_UPDATED, {
                playerId: player.id,
                playerName: player.name
            }));
        }
    }

    private async handleConnect(ws: WebSocket, data: any): Promise<void> {
        const playerId = data.playerId;
        const idToken = data.idToken; // Firebase ID токен

        // NOTE: Auto-ban system disabled for now
        // Check if player is banned (before validation to save resources)
        // if (playerId) {
        //     const banStatus = this.isPlayerBanned(playerId);
        //     if (banStatus.banned) {
        //         serverLogger.warn(`[Server] 🚫 Banned player tried to connect: ${playerId} - ${banStatus.reason}`);
        //         this.send(ws, createServerMessage(ServerMessageType.ERROR, {
        //             code: "BANNED",
        //             message: banStatus.remaining === -1 
        //                 ? `You are permanently banned: ${banStatus.reason}` 
        //                 : `You are banned for ${Math.ceil((banStatus.remaining || 0) / 60000)} more minutes: ${banStatus.reason}`
        //         }));
        //         ws.close();
        //         return;
        //     }
        // }

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

        // Простая система наименований: для гостей используем ID от клиента (если есть) или генерируем новый
        // Для авторизованных используем Firebase UID
        let finalPlayerId: string;
        let finalPlayerName: string;

        if (verifiedUserId) {
            // Авторизованный игрок - используем Firebase UID как ID
            finalPlayerId = verifiedUserId;
            finalPlayerName = data.playerName || `User_${verifiedUserId.substring(0, 6)}`;
        } else {
            // Гость - используем ID от клиента, если он валидный, иначе генерируем новый
            const clientPlayerId = data.playerId;

            // Проверяем, валидный ли ID от клиента (не пустой, не слишком короткий)
            if (clientPlayerId && clientPlayerId.length >= 4 && /^[a-zA-Z0-9_-]+$/.test(clientPlayerId)) {
                // Проверяем, не занят ли этот ID другим активным игроком
                const existingPlayer = this.players.get(clientPlayerId);
                if (!existingPlayer || !existingPlayer.connected) {
                    // ID свободен или игрок отключен - используем ID от клиента
                    finalPlayerId = clientPlayerId;
                    finalPlayerName = data.playerName || `anon_ID:${clientPlayerId.substring(0, 8)}`;
                    serverLogger.log(`[Server] Гость подключился с сохраненным ID: ${finalPlayerId}, имя=${finalPlayerName}`);
                } else {
                    // ID занят - генерируем новый
                    this.guestPlayerCounter++;
                    const guestNumber = String(this.guestPlayerCounter).padStart(4, '0');
                    finalPlayerId = guestNumber;
                    finalPlayerName = `anon_ID:${guestNumber}`;
                    serverLogger.log(`[Server] Гость подключился: ID ${clientPlayerId} занят, присвоен новый ID=${finalPlayerId}, имя=${finalPlayerName}`);
                }
            } else {
                // ID от клиента невалидный - генерируем новый
                this.guestPlayerCounter++;
                const guestNumber = String(this.guestPlayerCounter).padStart(4, '0');
                finalPlayerId = guestNumber;
                finalPlayerName = `anon_ID:${guestNumber}`;
                serverLogger.log(`[Server] Гость подключился: ID от клиента невалидный (${clientPlayerId}), присвоен новый ID=${finalPlayerId}, имя=${finalPlayerName}`);
            }
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

        // Send connection confirmation
        // Send UDP port if available so client knows where to connect
        const connectData: any = {
            playerId: player.id,
            playerName: player.name,
            authenticated: !!verifiedUserId
        };
        if (this.udpPort) {
            connectData.udpPort = this.udpPort;
        }
        this.send(ws, createServerMessage(ServerMessageType.CONNECTED, connectData));
    }

    private handleCreateRoom(player: ServerPlayer, data: any): void {
        const { mode, maxPlayers, isPrivate, settings, worldSeed, mapType, enableBots, botCount, customMapData } = data;

        const { chassisType, cannonType, trackType, tankColor, turretColor, playerName, modules } = data; // Extract customization

        // Update player name if provided
        if (playerName) player.name = playerName;

        // Save customization to player
        if (chassisType) player.chassisType = chassisType;
        if (cannonType) player.cannonType = cannonType;
        if (trackType) player.trackType = trackType;
        if (tankColor) player.tankColor = tankColor;
        if (turretColor) player.turretColor = turretColor;
        if (modules && Array.isArray(modules)) player.modules = modules;

        // Генерируем простой ID комнаты (0001, 0002, и т.д.)
        this.roomCounter++;
        const roomId = String(this.roomCounter).padStart(4, '0');
        serverLogger.log(`[Server] 🔧 Генерация ID комнаты: roomCounter=${this.roomCounter}, roomId=${roomId}`);
        serverLogger.log(`[Server] 📋 CREATE_ROOM: mode=${mode}, maxPlayers=${maxPlayers}, isPrivate=${isPrivate}, mapType=${mapType}, enableBots=${enableBots}, botCount=${botCount}`);

        const room = new GameRoom(mode, maxPlayers, isPrivate, worldSeed, roomId, mapType);
        room.settings = settings || {};

        // Настройки ботов (по умолчанию отключены)
        room.enableBots = enableBots === true;
        room.botCount = typeof botCount === 'number' ? botCount : 0;

        // Сохраняем данные кастомной карты, если они есть
        if (customMapData) {
            room.customMapData = customMapData;
            serverLogger.log(`[Server] 📦 Room ${room.id} has custom map data: ${customMapData.name || 'Unnamed'}. Objects: ${customMapData.placedObjects?.length}, MapType in Data: ${customMapData.mapType}`);
        } else if (mapType === 'custom') {
            serverLogger.error(`[Server] ❌ CRITICAL: Room ${room.id} created with mapType='custom' but NO customMapData received!`);
        }

        // Проверяем, что ID комнаты правильный
        if (room.id !== roomId) {
            serverLogger.error(`[Server] ❌ ОШИБКА: ID комнаты не совпадает! Ожидалось: ${roomId}, получено: ${room.id}`);
        } else {
            serverLogger.log(`[Server] ✅ ID комнаты подтвержден: ${room.id}`);
        }

        if (room.addPlayer(player)) {
            this.rooms.set(room.id, room);
            room.creatorId = player.id; // Сохраняем ID создателя

            // Создаём spatial grid для комнаты
            this.spatialGrids.set(room.id, new SpatialHashGrid(100));

            serverLogger.log(`[Server] ✅ Комната создана: ID=${room.id}, режим=${mode} (room.mode=${room.mode}), игроков=1/${maxPlayers}, создатель=${player.id} (${player.name}), seed=${room.worldSeed}`);
            serverLogger.log(`[Server] 📋 Комната ${room.id} боты: enableBots=${room.enableBots}, botCount=${room.botCount}`);

            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_CREATED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed,
                isCreator: true,
                enableBots: room.enableBots, // Передаём настройки ботов
                botCount: room.botCount
            }));

            // АВТОСТАРТ ДЛЯ КОМНАТ С БОТАМИ: Если enableBots=true, сразу запускаем игру
            if (room.enableBots && !room.isActive) {
                serverLogger.log(`[Server] 🤖 АВТОСТАРТ с ботами: Запускаем игру в комнате ${room.id}...`);
                room.startMatch();
                const enemyData = room.getEnemyData();
                serverLogger.log(`[Server] ✅ Игра с ботами запущена: ${enemyData.length} ботов`);

                // Отправляем сигнал старта игры создателю
                this.send(player.socket, createServerMessage(ServerMessageType.GAME_START, {
                    roomId: room.id,
                    mode: room.mode,
                    gameTime: 0,
                    worldSeed: room.worldSeed,
                    mapType: room.mapType,
                    customMapData: room.customMapData,
                    players: room.getPlayerData(),
                    enemies: enemyData
                }));
            }

            // Отправляем обновленный список комнат всем подключенным клиентам
            this.broadcastRoomListToAll();
        } else {
            serverLogger.error(`[Server] Ошибка создания комнаты: не удалось добавить игрока ${player.id}`);
            this.sendError(player.socket, "ROOM_CREATE_FAILED", "Failed to create room");
        }
    }

    private handleJoinRoom(player: ServerPlayer, data: any): void {
        const { roomId, password } = data;

        const { chassisType, cannonType, trackType, tankColor, turretColor, playerName, modules } = data; // Extract customization

        // Update player name if provided
        if (playerName) player.name = playerName;

        // Save customization to player
        if (chassisType) player.chassisType = chassisType;
        if (cannonType) player.cannonType = cannonType;
        if (trackType) player.trackType = trackType;
        if (tankColor) player.tankColor = tankColor;
        if (turretColor) player.turretColor = turretColor;
        if (modules && Array.isArray(modules)) player.modules = modules;
        serverLogger.log(`[Server] 🔍 JOIN_ROOM запрос от ${player.id} (${player.name}): roomId=${roomId}`);
        const room = this.rooms.get(roomId);

        if (!room) {
            serverLogger.warn(`[Server] ❌ Комната ${roomId} не найдена для игрока ${player.id}`);
            this.sendError(player.socket, "ROOM_NOT_FOUND", "Room not found");
            return;
        }

        serverLogger.log(`[Server] ✅ Комната ${roomId} найдена: режим=${room.mode}, активна=${room.isActive}, игроков=${room.players.size}/${room.maxPlayers}`);

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

            // Добавляем игрока в spatial grid комнаты
            let spatialGrid = this.spatialGrids.get(room.id);
            if (!spatialGrid) {
                spatialGrid = new SpatialHashGrid(100);
                this.spatialGrids.set(room.id, spatialGrid);
            }
            if (player.position) {
                spatialGrid.addPlayer(player.id, player.position);
            }

            // Cancel deletion timer if room was scheduled for deletion
            room.cancelDeletion();

            // Notify player
            // КРИТИЧНО: Если комната активна, устанавливаем позицию игрока через respawn
            // Это предотвращает отправку позиции (0, 0, 0) в PLAYER_STATES
            if (room.isActive) {
                const spawnPos = room.getSpawnPosition(player);
                player.respawn(spawnPos, player.health || 100);
                // Обновляем spatial grid с новой позицией
                if (spatialGrid && player.position) {
                    spatialGrid.updatePlayer(player.id, player.position);
                }
            }

            this.send(player.socket, createServerMessage(ServerMessageType.ROOM_JOINED, {
                roomId: room.id,
                mode: room.mode,
                worldSeed: room.worldSeed,
                mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                customMapData: room.customMapData, // КРИТИЧНО: Данные кастомной карты
                players: room.getPlayerData(),
                isCreator: room.creatorId === player.id,
                isActive: room.isActive // Добавляем информацию о статусе игры
            }));

            // Если комната активна, сразу отправляем GAME_START для присоединения к идущей игре
            if (room.isActive) {
                const enemyData = room.getEnemyData();
                serverLogger.log(`[Server] Комната ${room.id} активна, отправляем GAME_START новому игроку ${player.id} (ботов: ${enemyData.length})`);
                this.send(player.socket, createServerMessage(ServerMessageType.GAME_START, {
                    roomId: room.id,
                    mode: room.mode,
                    worldSeed: room.worldSeed,
                    mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                    customMapData: room.customMapData, // КРИТИЧНО: Данные кастомной карты
                    players: room.getPlayerData(),
                    enemies: enemyData // Отправляем данные о ботах для синхронизации
                }));
            }

            // Notify other players
            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_JOINED, {
                player: player.toPlayerData()
            }), player.id);

            // АВТОСТАРТ: Запускаем игру когда 2+ игрока присоединились ИЛИ когда 1 игрок с ботами
            serverLogger.log(`[Server] 🔍 Проверка АВТОСТАРТА: room.isActive=${room.isActive}, players.size=${room.players.size}, mode=${room.mode}, enableBots=${room.enableBots}`);
            const canAutoStart = room.players.size >= 2 || (room.players.size >= 1 && room.enableBots);
            if (!room.isActive && canAutoStart) {
                serverLogger.log(`[Server] 🚀 АВТОСТАРТ: Запускаем игру в комнате ${room.id} (enableBots=${room.enableBots})...`);
                room.startMatch();
                const enemyData = room.getEnemyData();
                serverLogger.log(`[Server] ✅ АВТОСТАРТ (join): Игра запущена в комнате ${room.id} (${room.players.size} игроков, ботов: ${enemyData.length})`);

                // ИСПРАВЛЕНО: Добавлены enemies для синхронизации ботов между клиентами
                const gameStartData = {
                    roomId: room.id,
                    mode: room.mode, // КРИТИЧНО: Добавляем режим!
                    gameTime: 0,
                    worldSeed: room.worldSeed,
                    mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                    customMapData: room.customMapData, // КРИТИЧНО: Данные кастомной карты
                    players: room.getPlayerData(),
                    enemies: enemyData
                };
                serverLogger.log(`[Server] 📤 АВТОСТАРТ GAME_START: roomId=${room.id}, mode=${room.mode}, players=${gameStartData.players.length}, enemies=${enemyData.length}`);
                this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, gameStartData));
            }
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

            // Удаляем игрока из spatial grid
            const spatialGrid = this.spatialGrids.get(room.id);
            if (spatialGrid) {
                spatialGrid.removePlayer(player.id);
            }

            // Schedule room deletion if empty, otherwise cancel any existing deletion timer
            if (room.isEmpty()) {
                // Schedule deletion after delay
                room.scheduleDeletion(ROOM_DELETION_DELAY, () => {
                    this.rooms.delete(room.id);
                    this.spatialGrids.delete(room.id); // Удаляем spatial grid вместе с комнатой
                    this.deltaCompressor.delete(room.id); // Очищаем delta compressor
                    // Отправляем обновленный список комнат всем подключенным клиентам
                    this.broadcastRoomListToAll();
                });
            } else {
                // Room is not empty, cancel deletion timer if it was scheduled
                room.cancelDeletion();
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
        const enemyData = room.getEnemyData();
        serverLogger.log(`[Server] Игра запущена в комнате ${room.id} создателем ${player.id} (${player.name}), игроков: ${room.players.size}, ботов: ${enemyData.length}`);

        // Отправляем всем игрокам в комнате
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, {
            roomId: room.id,
            mode: room.mode,
            worldSeed: room.worldSeed,
            mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
            customMapData: room.customMapData, // КРИТИЧНО: Данные кастомной карты
            players: room.getPlayerData(),
            enemies: enemyData // Отправляем данные о ботах для синхронизации
        }));
    }

    private handleChangeRoomSettings(player: ServerPlayer, settings: any): void {
        if (!player.roomId) return;

        const room = this.rooms.get(player.roomId);
        if (!room) return;

        // Only host can change settings
        // If room has no creator (orphaned), anyone can change? No, secure it.
        if (room.creatorId && room.creatorId !== player.id) {
            this.sendError(player.socket, "NOT_AUTHORIZED", "Only host can change room settings");
            return;
        }

        serverLogger.log(`[Server] Player ${player.name} updating room settings for ${room.id}`);
        room.updateSettings(settings);
    }

    private handleQuickPlay(player: ServerPlayer, data: any): void {
        const { mode, region, skillBased, mapType, customMapData } = data;
        serverLogger.log(`[Server] 🎮 QUICK_PLAY запрос от ${player.id} (${player.name}): mode=${mode}, region=${region}, skillBased=${skillBased}, mapType=${mapType || 'normal'}${customMapData ? `, customMap=${customMapData.name}` : ''}`);

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
            if (!room) {
                serverLogger.error(`[Server] Quick play: комната не найдена, хотя массив не пуст`);
                return;
            }
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
                    mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                    customMapData: room.customMapData, // КРИТИЧНО: Данные кастомной карты
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

                // АВТОСТАРТ: Запускаем игру когда 2+ игрока присоединились через Quick Play
                if (!room.isActive && room.players.size >= 2) {
                    room.startMatch();
                    serverLogger.log(`[Server] ✅ АВТОСТАРТ: Игра запущена в комнате ${room.id} (${room.players.size} игроков)`);

                    // Отправляем всем игрокам в комнате сигнал старта
                    // ИСПРАВЛЕНО: Добавлены enemies и mode для синхронизации ботов между клиентами
                    const enemyDataQP = room.getEnemyData();
                    const gameStartDataQP = {
                        roomId: room.id,
                        mode: room.mode, // КРИТИЧНО: Добавляем режим!
                        gameTime: 0,
                        worldSeed: room.worldSeed,
                        mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                        players: room.getPlayerData(),
                        enemies: enemyDataQP
                    };
                    serverLogger.log(`[Server] 📤 QuickPlay АВТОСТАРТ GAME_START: roomId=${room.id}, mode=${room.mode}, players=${gameStartDataQP.players.length}, enemies=${enemyDataQP.length}`);
                    this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, gameStartDataQP));
                }

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

            // АВТОСТАРТ: Запускаем игру когда матч найден через матчмейкинг
            if (!room.isActive && room.players.size >= 2) {
                room.startMatch();
                serverLogger.log(`[Server] ✅ АВТОСТАРТ (matchmaking): Игра запущена в комнате ${room.id} (${room.players.size} игроков)`);

                // ИСПРАВЛЕНО: Добавлены enemies и mode для синхронизации ботов между клиентами
                const enemyDataMM = room.getEnemyData();
                const gameStartDataMM = {
                    roomId: room.id,
                    mode: room.mode, // КРИТИЧНО: Добавляем режим!
                    gameTime: 0,
                    worldSeed: room.worldSeed,
                    mapType: room.mapType, // КРИТИЧНО: Добавляем тип карты для синхронизации
                    players: room.getPlayerData(),
                    enemies: enemyDataMM
                };
                serverLogger.log(`[Server] 📤 Matchmaking АВТОСТАРТ GAME_START: roomId=${room.id}, mode=${room.mode}, players=${gameStartDataMM.players.length}, enemies=${enemyDataMM.length}`);
                this.broadcastToRoom(room, createServerMessage(ServerMessageType.GAME_START, gameStartDataMM));
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
            gameTime: room.gameTime,
            mapType: room.mapType || "normal"
        }));

        // serverLogger.log(`[Server] Запрос списка комнат от ${player.id} (${player.name}): найдено ${filteredRooms.length} комнат${mode ? ` (режим: ${mode})` : ''}`);

        this.send(player.socket, createServerMessage(ServerMessageType.ROOM_LIST, {
            rooms: roomsList
        }));
    }

    private handleGetOnlinePlayers(player: ServerPlayer): void {
        // Получаем список всех подключенных игроков (включая самого запрашивающего)
        const allPlayers = Array.from(this.players.values());
        const connectedPlayers = allPlayers.filter(p => p.connected);

        // serverLogger.log(`[Server] 📋 Запрос списка игроков онлайн от ${player.id} (${player.name})`);
        // serverLogger.log(`[Server] 📋 Всего игроков в системе: ${allPlayers.length}, подключено: ${connectedPlayers.length}`);

        const onlinePlayers = connectedPlayers.map(p => {
            const room = p.roomId ? this.rooms.get(p.roomId) : null;
            const playerData = {
                id: p.id,
                name: p.name,
                roomId: p.roomId || null,
                roomMode: room ? room.mode : null,
                isInRoom: !!p.roomId
            };
            // serverLogger.log(`[Server] 📋   - ${p.name} (${p.id})${p.roomId ? ` в комнате ${p.roomId}` : ' (в лобби)'}`);
            return playerData;
        });

        // serverLogger.log(`[Server] ✅ Отправка списка из ${onlinePlayers.length} игроков игроку ${player.id}`);

        this.send(player.socket, createServerMessage(ServerMessageType.ONLINE_PLAYERS_LIST, {
            players: onlinePlayers
        }));
    }

    private handlePlayerInput(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;

        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) return;

        // MVP: Basic rate limiting (120 inputs/sec max)
        if (!this.rateLimiter.checkLimit(player.id, "input", 120)) {
            return; // Too many inputs, drop
        }

        // MVP: Basic position bounds validation
        if (data.position) {
            const px = data.position.x, py = data.position.y, pz = data.position.z;
            if (typeof px !== 'number' || typeof py !== 'number' || typeof pz !== 'number' ||
                !isFinite(px) || !isFinite(py) || !isFinite(pz) ||
                Math.abs(px) > 1000 || py < -50 || py > 500 || Math.abs(pz) > 1000) {
                return; // Invalid position, drop input
            }
        }

        // ДИАГНОСТИКА: Логируем инпут от игроков (только первые несколько раз или при движении)
        const throttle = data.throttle || 0;
        const steer = data.steer || 0;
        const hasMovement = Math.abs(throttle) > 0.01 || Math.abs(steer) > 0.01;

        if (!player._inputLogCount) player._inputLogCount = 0;
        if (player._inputLogCount < 3 || (hasMovement && player._inputLogCount % 60 === 0)) {
            const pos = player.position;
            serverLogger.log(`[Server] 📥 Input from ${player.name} (${player.id.substring(0, 8)}): throttle=${throttle.toFixed(2)}, steer=${steer.toFixed(2)}, pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
        }
        player._inputLogCount++;

        // Update last valid position
        player.lastValidPosition = player.position.clone();

        // Track sequence number for reconciliation
        if (data.sequence !== undefined && typeof data.sequence === 'number') {
            player.lastProcessedSequence = data.sequence;
        }

        // ANTI-CHEAT DISABLED: Track turret rotation for aimbot detection
        // this.trackTurretRotation(player, data.turretRotation);

        player.updateFromInput(data);

        // Обновляем spatial grid
        const spatialGrid = this.spatialGrids.get(player.roomId);
        if (spatialGrid && player.position) {
            if (spatialGrid.getPlayerCount() === 0 || !this.spatialGrids.has(player.roomId)) {
                spatialGrid.addPlayer(player.id, player.position);
            } else {
                spatialGrid.updatePlayer(player.id, player.position);
            }
        }

        // Check CTF flag pickup
        if (room.mode === "ctf") {
            const ctfSystem = (room as any).ctfSystem;
            if (ctfSystem && typeof ctfSystem.checkFlagPickup === "function") {
                ctfSystem.checkFlagPickup(player);
            }
        }

        // Position will be updated in game loop
    }

    /**
     * Track turret rotation history for aimbot detection
     * NOTE: ANTI-CHEAT DISABLED
     */
    // @ts-ignore - Unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private turretHistory: Map<string, Array<{ time: number; rotation: number }>> = new Map();

    // @ts-ignore - Unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private trackTurretRotation(_player: ServerPlayer, _turretRotation: number): void {
        // ANTI-CHEAT DISABLED
        return;

        /* Original implementation:
        const now = Date.now();
        
        if (!this.turretHistory.has(_player.id)) {
            this.turretHistory.set(_player.id, []);
        }
        
        const history = this.turretHistory.get(_player.id)!;
        history.push({ time: now, rotation: _turretRotation });
        
        if (history.length > 60) {
            history.shift();
        }
        
        if (history.length >= 30 && history.length % 30 === 0) {
            const aimbotCheck = InputValidator.detectAimbot(history);
            if (aimbotCheck.suspicious) {
                serverLogger.warn(`[Server] Potential aimbot detected for player ${_player.id}`);
                player.violationCount += aimbotCheck.score;
                
                if (player.violationCount > 150) {
                    this.kickPlayer(_player, "Suspected aimbot");
                }
            }
        }
        */
    }

    /**
     * Check if a player is banned
     * NOTE: Auto-ban system disabled for now - kept for future use
     */
    // @ts-ignore - Unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private isPlayerBanned(_playerId: string): { banned: boolean; reason?: string; remaining?: number } {
        // Auto-ban system disabled
        return { banned: false };

        /* Original implementation:
        const banInfo = this.bannedPlayers.get(_playerId);
        if (!banInfo) {
            return { banned: false };
        }
        
        // Permanent ban (expiry = 0)
        if (banInfo.expiry === 0) {
            return { banned: true, reason: banInfo.reason, remaining: -1 };
        }
        
        // Check if ban has expired
        const now = Date.now();
        if (now >= banInfo.expiry) {
            // Ban expired, remove it
            this.bannedPlayers.delete(_playerId);
            return { banned: false };
        }
        
        return { banned: true, reason: banInfo.reason, remaining: banInfo.expiry - now };
        */
    }

    /**
     * Apply automatic ban based on suspiciousScore/violationCount
     * NOTE: Auto-ban system disabled for now - kept for future use
     * Escalating ban system:
     * - Score > 100: 5 minute temp ban
     * - Score > 200: 1 hour ban
     * - Score > 500: Permanent ban
     */
    // @ts-ignore - Unused but kept for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private applyAutoBan(_player: ServerPlayer, _reason: string): void {
        // Auto-ban system disabled - just kick instead
        // this.kickPlayer(_player, _reason);
        return;
    }

    /* Original applyAutoBan implementation - kept for future use:
    private applyAutoBan(player: ServerPlayer, reason: string): void {
        const score = player.violationCount;
        let banDuration: number = 0;
        let banType: string = "";
        
        const existingBan = this.bannedPlayers.get(player.id);
        const banCount = existingBan ? existingBan.banCount + 1 : 1;
        
        if (score > 500 || banCount >= 5) {
            banDuration = 0;
            banType = "permanent";
        } else if (score > 200 || banCount >= 3) {
            banDuration = 60 * 60 * 1000;
            banType = "1 hour";
        } else if (score > 100 || banCount >= 2) {
            banDuration = 5 * 60 * 1000;
            banType = "5 minutes";
        } else {
            this.kickPlayer(player, reason);
            return;
        }
        
        const expiry = banDuration === 0 ? 0 : Date.now() + banDuration;
        
        this.bannedPlayers.set(player.id, {
            expiry,
            reason: `${reason} (${banType} ban, offense #${banCount})`,
            banCount
        });
        
        serverLogger.warn(`[Server] 🚫 BANNED player ${player.id} (${player.name}): ${banType} - ${reason}`);
        
        this.send(player.socket, createServerMessage(ServerMessageType.ERROR, {
            code: "BANNED",
            message: banDuration === 0 
                ? `You have been permanently banned: ${reason}` 
                : `You have been banned for ${banType}: ${reason}`
        }));
        
        this.handleDisconnect(player.socket);
    }
    */

    /**
     * Kick player from server
     */
    private kickPlayer(player: ServerPlayer, reason: string): void {
        serverLogger.log(`[Server] Kicking player ${player.id} (${player.name}): ${reason}`);

        // Send error message before disconnecting
        this.send(player.socket, createServerMessage(ServerMessageType.ERROR, {
            code: "KICKED",
            message: `You have been kicked: ${reason}`
        }));

        // Clean up rate limiter
        this.rateLimiter.resetPlayer(player.id);

        // NOTE: Anti-cheat disabled - turret history cleanup not needed
        // this.turretHistory.delete(player.id);

        // Disconnect player
        player.disconnect();
        this.handleDisconnect(player.socket);
    }

    private handlePlayerShoot(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;

        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) return;

        if (player.status !== "alive") return;

        // MVP: Basic shoot rate limiting (10 shots/sec max)
        if (!this.rateLimiter.checkLimit(player.id, "shoot", 10)) {
            return; // Too many shots, drop
        }

        // MVP: Basic shoot data validation
        if (!data.position || !data.direction ||
            !isFinite(data.position.x) || !isFinite(data.position.y) || !isFinite(data.position.z) ||
            !isFinite(data.direction.x) || !isFinite(data.direction.y) || !isFinite(data.direction.z)) {
            return; // Invalid shoot data, drop
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
        // Broadcast to nearby players only (AOI)
        this.broadcastToNearby(room, projPos, createServerMessage(ServerMessageType.PROJECTILE_SPAWN, {
            ...data,
            ownerId: player.id,
            id: projId
        }), 350); // 350 units radius
    }

    private handlePlayerRespawnRequest(player: ServerPlayer, data: any): void {
        // Update modules on respawn if provided
        if (data && data.modules && Array.isArray(data.modules)) {
            player.modules = data.modules;
            serverLogger.log(`[Server] Player ${player.name} updated modules on respawn: ${player.modules.join(', ')}`);
        }
        serverLogger.log(`[Server] 🔄 RESPAWN_REQUEST received from ${player.name} (${player.id}), status=${player.status}`);

        if (!player.roomId) {
            serverLogger.warn(`[Server] ⚠️ Respawn denied: player ${player.id} has no roomId`);
            return;
        }

        const room = this.rooms.get(player.roomId);
        if (!room || !room.isActive) {
            serverLogger.warn(`[Server] ⚠️ Respawn denied: room not found or not active for ${player.id}`);
            return;
        }

        // Проверяем, что игрок действительно мертв
        if (player.status !== "dead") {
            serverLogger.warn(`[Server] Player ${player.id} requested respawn but is not dead (status: ${player.status})`);
            return;
        }

        // Получаем позицию респавна
        const spawnPos = room.getSpawnPosition(player);

        // Респавним игрока
        player.respawn(spawnPos, 100);

        serverLogger.log(`[Server] ✅ Player ${player.name} respawned at position (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);

        // Отправляем сообщение о респавне всем игрокам в комнате
        const playerCount = room.getAllPlayers().length;
        serverLogger.log(`[Server] 📤 Broadcasting PLAYER_RESPAWNED to ${playerCount} players in room ${player.roomId}`);

        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_RESPAWNED, {
            playerId: player.id,
            playerName: player.name,
            position: spawnPos,
            health: player.health
        }));

        serverLogger.log(`[Server] ✅ PLAYER_RESPAWNED broadcast complete for ${player.name}`);
    }

    /**
     * Handle client-reported hit on another player
     * Client-authoritative: we trust the client's hit detection and apply damage
     */
    private handlePlayerHit(attacker: ServerPlayer, data: any): void {
        if (!attacker.roomId) return;

        const room = this.rooms.get(attacker.roomId);
        if (!room || !room.isActive) return;

        const { targetId, damage, hitPosition, cannonType } = data;

        // Validate basic data
        if (!targetId || typeof damage !== 'number' || damage <= 0 || damage > 200) {
            serverLogger.warn(`[Server] Invalid PLAYER_HIT data from ${attacker.id}`);
            return;
        }

        // Find target player
        const target = room.getPlayer(targetId);
        if (!target || target.status !== "alive") {
            return; // Target not found or already dead
        }

        // Apply damage
        const died = target.takeDamage(damage);

        serverLogger.log(`[Server] 🎯 PLAYER_HIT: ${attacker.name} hit ${target.name} for ${damage} damage (health: ${target.health}/${target.maxHealth}, died: ${died})`);

        // Award kill to attacker if target died
        if (died) {
            attacker.addKill();
            target.status = "dead";
        }

        // Broadcast PLAYER_DAMAGED to all players in room
        this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DAMAGED, {
            playerId: target.id,
            playerName: target.name,
            attackerId: attacker.id,
            attackerName: attacker.name,
            damage: damage,
            health: target.health,
            maxHealth: target.maxHealth,
            hitPosition: hitPosition,
            cannonType: cannonType
        }));

        // If target died, broadcast PLAYER_KILLED
        if (died) {
            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_KILLED, {
                victimId: target.id,
                victimName: target.name,
                killerId: attacker.id,
                killerName: attacker.name
            }));

            // Also broadcast PLAYER_DIED for UI updates
            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DIED, {
                playerId: target.id,
                playerName: target.name
            }));
        }
    }


    /**
     * Handle chat message with channel routing
     * Channels: 'global' | 'local' | 'team' | 'room' (default)
     */
    private handleChatMessage(player: ServerPlayer, data: any): void {
        const message = data.message;
        const channel = data.channel || "room"; // default to room chat

        // Basic validation
        if (!message || typeof message !== "string" || message.length === 0) {
            return;
        }

        // RATE LIMITING: 1 message per 500ms per player
        const now = Date.now();
        const CHAT_RATE_LIMIT_MS = 500;
        if (!player._lastChatTime) player._lastChatTime = 0;

        if (now - player._lastChatTime < CHAT_RATE_LIMIT_MS) {
            // Too fast - silently drop the message
            return;
        }
        player._lastChatTime = now;

        // Truncate long messages
        const truncatedMessage = message.substring(0, 500);

        const chatData = {
            playerId: player.id,
            playerName: player.name,
            message: truncatedMessage,
            channel: channel,
            timestamp: Date.now()
        };

        serverLogger.log(`[Chat] ${player.name} [${channel}]: ${truncatedMessage.substring(0, 50)}...`);

        switch (channel) {
            case "global":
                // Send to ALL connected players (all rooms + lobby)
                this.broadcastToAll(createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData));
                break;

            case "local":
                // Send only to players within 200 units
                if (player.roomId && player.position) {
                    const room = this.rooms.get(player.roomId);
                    if (room) {
                        this.broadcastToNearby(room, player.position,
                            createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData),
                            200 // 200 units radius for local chat
                        );
                    }
                }
                break;

            case "team":
                // Send only to same team players
                if (player.roomId) {
                    const room = this.rooms.get(player.roomId);
                    if (room) {
                        this.broadcastToTeam(room, player.team?.toString(),
                            createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData)
                        );
                    }
                }
                break;

            case "room":
            default:
                // Send to entire room or lobby
                if (player.roomId) {
                    const room = this.rooms.get(player.roomId);
                    if (room) {
                        this.broadcastToRoom(room, createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData));
                    }
                } else {
                    this.broadcastToLobby(createServerMessage(ServerMessageType.CHAT_MESSAGE, chatData));
                }
                break;
        }
    }

    /**
     * Broadcast to ALL connected players (global chat)
     */
    private broadcastToAll(message: ServerMessage): void {
        const serialized = serializeMessage(message);
        for (const player of this.players.values()) {
            if (player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(serialized);
            }
        }
    }

    /**
     * Broadcast to players on the same team
     */
    private broadcastToTeam(room: GameRoom, team: string | undefined, message: ServerMessage): void {
        const serialized = serializeMessage(message);
        for (const player of room.getAllPlayers()) {
            if (player.socket.readyState === WebSocket.OPEN && player.team === team) {
                player.socket.send(serialized);
            }
        }
    }

    private _handleVoiceSignaling(sender: ServerPlayer, message: ClientMessage): void {
        if (!sender.roomId) return;

        const room = this.rooms.get(sender.roomId);
        if (!room) return;

        const signalData = message.data;
        const targetId = signalData.to; // Target player ID

        if (!targetId) return;

        const targetPlayer = room.players.get(targetId);
        // Ensure target is in room and is not the sender
        if (targetPlayer && targetPlayer.id !== sender.id) {
            // Forward the message to the target player
            // We preserve the data but inject the 'from' field
            const forwardingData = { ...signalData, from: sender.id };
            // Remove 'to' field as it's redundant for the receiver
            delete forwardingData.to;

            // Map ClientMessageType to ServerMessageType
            let serverType: ServerMessageType;
            switch (message.type) {
                case ClientMessageType.VOICE_OFFER:
                    serverType = ServerMessageType.VOICE_OFFER;
                    break;
                case ClientMessageType.VOICE_ANSWER:
                    serverType = ServerMessageType.VOICE_ANSWER;
                    break;
                case ClientMessageType.VOICE_ICE_CANDIDATE:
                    serverType = ServerMessageType.VOICE_ICE_CANDIDATE;
                    break;
                default:
                    return;
            }

            this.send(targetPlayer.socket, createServerMessage(serverType, forwardingData));
        }
    }

    /**
     * Обработка события о том, что игрок говорит по радио
     * Рассылает уведомление всем игрокам в комнате
     */
    private _handleVoiceTalking(sender: ServerPlayer, message: ClientMessage): void {
        if (!sender.roomId) return;

        const room = this.rooms.get(sender.roomId);
        if (!room) return;

        const talking = message.data.talking || false;

        // Рассылаем уведомление всем игрокам в комнате (кроме отправителя)
        const notificationData = {
            playerId: sender.id,
            playerName: sender.name,
            talking: talking
        };

        room.players.forEach((player) => {
            if (player.id !== sender.id) {
                this.send(player.socket, createServerMessage(ServerMessageType.VOICE_TALKING, notificationData));
            }
        });
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
        // ОПТИМИЗАЦИЯ: Используем DistanceSquared вместо Distance (избегаем вычисления корня)
        const playerPos = player.position;
        const consumablePos = new Vector3(position.x, position.y, position.z);
        const distanceSq = Vector3.DistanceSquared(playerPos, consumablePos);
        const maxDistanceSq = 25; // 5^2

        if (distanceSq > maxDistanceSq) {
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
    private handleWallSpawn(player: ServerPlayer, data: any): void {
        if (!player.roomId) return;
        const room = this.rooms.get(player.roomId);
        if (!room) return;

        // Basic validation
        if (!data.position || typeof data.rotation !== 'number' || !data.duration) {
            return;
        }

        // Create server wall
        const wall = new ServerWall({
            position: new Vector3(data.position.x, data.position.y, data.position.z),
            rotation: data.rotation,
            duration: data.duration,
            ownerId: player.id
        });

        // Add to room
        room.spawnWall(wall);

        // Broadcast to other players in room
        const spawnMsg = createServerMessage(ServerMessageType.WALL_SPAWN, {
            position: data.position,
            rotation: data.rotation,
            duration: data.duration,
            ownerId: player.id
        });

        this.broadcastToRoom(room, spawnMsg, player.id); // Exclude sender as they already spawned it locally
    }

    /**
     * Handle player respawn request after death timer expires
     */



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

    private handleGameInvite(player: ServerPlayer, data: any): void {
        const { targetPlayerId, gameMode, roomId } = data;

        if (!targetPlayerId) {
            this.sendError(player.socket, "INVALID_INVITE", "Target player ID is required");
            return;
        }

        // Находим целевого игрока
        const targetPlayer = this.getPlayerById(targetPlayerId);
        if (!targetPlayer || !targetPlayer.connected) {
            this.sendError(player.socket, "PLAYER_NOT_FOUND", "Target player not found or not connected");
            return;
        }

        // Если указана комната, проверяем что отправитель в ней
        if (roomId) {
            if (player.roomId !== roomId) {
                this.sendError(player.socket, "NOT_IN_ROOM", "You are not in the specified room");
                return;
            }

            const room = this.rooms.get(roomId);
            if (!room) {
                this.sendError(player.socket, "ROOM_NOT_FOUND", "Room not found");
                return;
            }

            // Отправляем приглашение в комнату
            this.send(targetPlayer.socket, createServerMessage(ServerMessageType.GAME_INVITE, {
                fromPlayerId: player.id,
                fromPlayerName: player.name,
                roomId: roomId,
                gameMode: gameMode || room.mode,
                worldSeed: room.worldSeed
            }));

            serverLogger.log(`[Server] Game invite sent from ${player.id} to ${targetPlayerId} for room ${roomId}`);
        } else {
            // Приглашение без комнаты - создаем новую или используем режим игры
            this.send(targetPlayer.socket, createServerMessage(ServerMessageType.GAME_INVITE, {
                fromPlayerId: player.id,
                fromPlayerName: player.name,
                gameMode: gameMode || "ffa"
            }));

            serverLogger.log(`[Server] Game invite sent from ${player.id} to ${targetPlayerId} for mode ${gameMode || "ffa"}`);
        }
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

            // Clean up rate limiter
            this.rateLimiter.resetPlayer(player.id);
            // NOTE: Anti-cheat disabled - turret history cleanup not needed
            // this.turretHistory.delete(player.id);

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
            let deltaTime = (now - this.lastTick) / 1000; // Convert to seconds

            // КРИТИЧНО: Ограничиваем максимальный deltaTime для защиты от больших скачков времени
            // Максимальный deltaTime = 2 * TICK_INTERVAL (на случай пропуска одного тика)
            const MAX_DELTA_TIME = (TICK_INTERVAL * 2) / 1000; // ~0.033 секунды (2 тика)
            if (deltaTime > MAX_DELTA_TIME) {
                // Предупреждение отключено - deltaTime просто ограничивается без спама в логи
                deltaTime = MAX_DELTA_TIME;
            }

            // Минимальный deltaTime для защиты от отрицательных или нулевых значений
            if (deltaTime <= 0) {
                deltaTime = 1 / TICK_RATE; // Fallback to expected deltaTime
            }

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
        this.monitoringIntervals.push(setInterval(() => {
            this.broadcastMonitoringStats();
        }, 1000));
    }

    private startPeriodicStats(): void {
        // Сохраняем предыдущие значения для сравнения
        let lastStats: { rooms: number; activeRooms: number; players: number; connectedPlayers: number } | null = null;

        // Выводим статистику каждые 5 минут или при изменениях
        this.monitoringIntervals.push(setInterval(() => {
            const activeRooms = Array.from(this.rooms.values()).filter(r => r.isActive).length;
            const totalRooms = this.rooms.size;
            const totalPlayers = this.players.size;
            const connectedPlayers = Array.from(this.players.values()).filter(p => p.connected).length;

            const currentStats = { rooms: totalRooms, activeRooms, players: totalPlayers, connectedPlayers };

            // Логируем только если статистика изменилась или прошло 5 минут
            const statsChanged = !lastStats ||
                lastStats.rooms !== currentStats.rooms ||
                lastStats.activeRooms !== currentStats.activeRooms ||
                lastStats.players !== currentStats.players ||
                lastStats.connectedPlayers !== currentStats.connectedPlayers;

            if (statsChanged) {
                serverLogger.log(`[Server] 📊 Статистика: комнат=${totalRooms} (активных=${activeRooms}), игроков=${totalPlayers} (подключено=${connectedPlayers})`);
                lastStats = currentStats;
            }
        }, 30000)); // Проверяем каждые 30 секунд, но логируем только при изменениях

        // Также логируем каждые 5 минут независимо от изменений (для мониторинга)
        this.monitoringIntervals.push(setInterval(() => {
            const activeRooms = Array.from(this.rooms.values()).filter(r => r.isActive).length;
            const totalRooms = this.rooms.size;
            const totalPlayers = this.players.size;
            const connectedPlayers = Array.from(this.players.values()).filter(p => p.connected).length;
            serverLogger.log(`[Server] 📊 Статистика (периодическая): комнат=${totalRooms} (активных=${activeRooms}), игроков=${totalPlayers} (подключено=${connectedPlayers})`);
        }, 300000)); // 5 минут
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
        // Periodic rate limiter cleanup (every 600 ticks = ~10 seconds at 60Hz)
        if (this.tickCount % 600 === 0) {
            this.rateLimiter.cleanup();
        }

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
                if (room.damageEvents && room.damageEvents.length > 0) {
                    for (const event of room.damageEvents) {
                        if (event.died) {
                            // Player died
                            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_KILLED, {
                                victimId: event.victimId,
                                victimName: event.victimName,
                                killerId: event.attackerId,
                                killerName: event.attackerName
                            }));

                            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DIED, {
                                playerId: event.victimId,
                                playerName: event.victimName
                            }));
                        } else {
                            // Player damaged
                            this.broadcastToRoom(room, createServerMessage(ServerMessageType.PLAYER_DAMAGED, {
                                playerId: event.victimId,
                                playerName: event.victimName,
                                damage: event.damage,
                                health: event.newHealth,
                                maxHealth: room.getPlayer(event.victimId)?.maxHealth || 100
                            }));
                        }
                    }
                    // Clear events after broadcasting
                    room.damageEvents = [];
                }

                // Broadcast game state to all players in room (60 Hz)
                // Send individual messages with serverSequence for each player
                // Use delta compression, prioritization, and SPATIAL PARTITIONING
                const allPlayerData = room.getPlayerData();

                // Get or create delta compressor for this room
                let compressor = this.deltaCompressor.get(room.id);
                if (!compressor) {
                    compressor = new DeltaCompressor();
                    this.deltaCompressor.set(room.id, compressor);
                }

                // Get spatial grid for this room
                let spatialGrid = this.spatialGrids.get(room.id);
                if (!spatialGrid) {
                    spatialGrid = new SpatialHashGrid(100);
                    this.spatialGrids.set(room.id, spatialGrid);
                }

                // КРИТИЧНО: Убедиться что ВСЕ игроки комнаты добавлены в spatial grid
                for (const p of room.getAllPlayers()) {
                    if (p.position) {
                        spatialGrid.updatePlayer(p.id, p.position);
                    }
                }

                for (const player of room.getAllPlayers()) {
                    // Initialize tracking map for this receiver if needed
                    if (!this.lastPlayerUpdateTick.has(player.id)) {
                        this.lastPlayerUpdateTick.set(player.id, new Map());
                    }
                    const playerUpdateTracker = this.lastPlayerUpdateTick.get(player.id)!;

                    // SPATIAL PARTITIONING: Get nearby players from spatial grid
                    // [Opus 4.6] Spatial filtering для оптимизации O(n²) → O(n) при >= 4 игроках
                    let nearbyPlayerIds: Set<string> | null = null;
                    const playerCount = room.getAllPlayers().length;
                    if (playerCount >= 4 && spatialGrid.getPlayerCount() > 0) {
                        nearbyPlayerIds = spatialGrid.getNearbyPlayers(player.id, 300); // 300 unit radius
                    }

                    // Prioritize players based on distance
                    const playerPos = player.position;
                    const prioritizedPlayers = this.prioritizedBroadcaster.prioritizePlayers(
                        allPlayerData,
                        playerPos,
                        20 // Max 20 prioritized players
                    );

                    // ADAPTIVE UPDATE RATE with SPATIAL PARTITIONING:
                    // Filter players based on distance, spatial proximity, and time since last update
                    const playersToSend = prioritizedPlayers.filter(targetPlayer => {
                        // КРИТИЧНО: Всегда включаем локального игрока на полной частоте (60 Hz)
                        // Это необходимо для reconciliation на клиенте
                        if (targetPlayer.id === player.id) {
                            // Всегда обновляем трекер для локального игрока
                            playerUpdateTracker.set(targetPlayer.id, this.tickCount);
                            return true;
                        }

                        // КРИТИЧНО: На первых 60 тиках (1 секунда) ВСЕГДА отправлять ВСЕХ игроков
                        // Это гарантирует, что все клиенты увидят друг друга при подключении
                        if (this.tickCount < 60) {
                            playerUpdateTracker.set(targetPlayer.id, this.tickCount);
                            return true;
                        }

                        // КРИТИЧНО: Если игрок ещё НЕ был обновлён (lastTick = 0), ВСЕГДА включаем его
                        const lastTick = playerUpdateTracker.get(targetPlayer.id) || 0;
                        if (lastTick === 0) {
                            playerUpdateTracker.set(targetPlayer.id, this.tickCount);
                            return true;
                        }

                        // SPATIAL PARTITIONING: Strict AOI
                        // ВАЖНО: Если nearbyPlayerIds null - spatial не используется, все игроки nearby
                        // Если nearbyPlayerIds пустой Set - это значит игрок в grid, но рядом никого нет
                        const isNearby = nearbyPlayerIds === null || nearbyPlayerIds.has(targetPlayer.id);

                        // Strict AOI: Если игрок слишком далеко, вообще не отправляем про него данные
                        // Это заставит клиент удалить этого игрока (при isFullState update)
                        if (!isNearby) {
                            return false;
                        }

                        // Calculate distance
                        const distance = Vector3.Distance(playerPos, targetPlayer.position);

                        // Get adaptive rate (1.0 = every tick, 0.5 = every 2 ticks, etc.)
                        let rate = this.prioritizedBroadcaster.getAdaptiveUpdateRate(
                            distance,
                            room.getAllPlayers().length,
                            0 // Network load - could be calculated based on send queue size
                        );

                        // Calculate required tick interval based on rate
                        const tickInterval = Math.ceil(1 / rate);

                        // Check if enough ticks have passed since last update
                        if (this.tickCount - lastTick >= tickInterval) {
                            // Update tracking and include this player
                            playerUpdateTracker.set(targetPlayer.id, this.tickCount);
                            return true;
                        }

                        return false;
                    });

                    // ОПТИМИЗАЦИЯ: Периодическая отправка полных состояний (каждые 120 пакетов = 1 раз в 2 секунды)
                    // Это предотвращает накопление ошибок квантования и дельта-компрессии
                    // Уменьшено с 60 до 120 для снижения сетевого трафика на 50%
                    const isFullState = this.tickCount % 120 === 0;

                    // Send filtered player states with adaptive update rate
                    const statesData = {
                        players: playersToSend,
                        gameTime: room.gameTime,
                        serverSequence: player.lastProcessedSequence,
                        isFullState: isFullState // Флаг полного состояния для клиента
                    };

                    // ДИАГНОСТИКА: Логируем отправку PLAYER_STATES каждые 60 тиков (1 раз в секунду)
                    if (this.tickCount % 60 === 0 && playersToSend.length > 1) {
                        const otherPlayers = playersToSend.filter(p => p.id !== player.id);
                        serverLogger.log(`[Server] 📤 PLAYER_STATES для ${player.name}: отправляю ${otherPlayers.length} других игроков (всего в комнате: ${room.players.size})`);
                    }

                    // Add batched updates for this specific player (AOI filtered)
                    const playerBatchMessages: ServerMessage[] = [];

                    // AOI for Projectiles
                    const visibleProjectiles = Array.from(room.projectiles.values())
                        // ОПТИМИЗАЦИЯ: Используем DistanceSquared вместо Distance (избегаем вычисления корня)
                        .filter(p => {
                            const distSq = Vector3.DistanceSquared(playerPos, p.position);
                            return distSq < 122500; // 350^2
                        }) // 350 unit radius (slightly larger than player AOI)
                        .map(p => p.toProjectileData());

                    if (visibleProjectiles.length > 0) {
                        playerBatchMessages.push(createServerMessage(ServerMessageType.PROJECTILE_UPDATE, {
                            projectiles: visibleProjectiles
                        }));
                    }

                    // AOI for Enemies (Bots)
                    if (room.enemies.size > 0 && (room.mode === "coop" || room.mode === "ffa" || room.mode === "tdm" || room.mode === "survival" || room.mode === "raid")) {
                        const visibleEnemies = Array.from(room.enemies.values())
                            // ОПТИМИЗАЦИЯ: Используем DistanceSquared вместо Distance (избегаем вычисления корня)
                            .filter(e => {
                                const distSq = Vector3.DistanceSquared(playerPos, e.position);
                                return distSq < 122500; // 350^2
                            })
                            .map(e => e.toEnemyData());

                        // ALWAYS send enemy update, even if empty, to clear distant enemies from client
                        playerBatchMessages.push(createServerMessage(ServerMessageType.ENEMY_UPDATE, {
                            enemies: visibleEnemies
                        }));
                    }

                    this.send(player.socket, createServerMessage(ServerMessageType.PLAYER_STATES, statesData));

                    // Send player-specific batch updates
                    if (playerBatchMessages.length > 0) {
                        this.sendBatch(player.socket, playerBatchMessages);
                    }
                }

                // Global Room Events (Batch broadcast for events that MUST be seen by everyone regardless of distance, or handled differently)
                // e.g. Game End, Safe Zone (global), CTF Flags (global logic usually)
                const globalBatchMessages: ServerMessage[] = [];

                // Broadcast World Updates (Destroyed objects, chunks) - REPAIRED: Missing broadcast caused ghost projectiles
                if (room.worldUpdates.destroyedObjects.length > 0 || room.worldUpdates.chunkUpdates.length > 0) {
                    globalBatchMessages.push(createServerMessage(ServerMessageType.WORLD_UPDATE, {
                        destroyedObjects: [...room.worldUpdates.destroyedObjects],
                        chunkUpdates: [...room.worldUpdates.chunkUpdates]
                    }));

                    // Clear updates after queuing for broadcast
                    room.worldUpdates.destroyedObjects = [];
                    room.worldUpdates.chunkUpdates = [];
                }

                // Broadcast safe zone updates (Global)
                if (room.mode === "battle_royale") {
                    const safeZoneData = room.getSafeZoneData();
                    if (safeZoneData) {
                        globalBatchMessages.push(createServerMessage(ServerMessageType.SAFE_ZONE_UPDATE, safeZoneData));
                    }
                }

                // Broadcast CTF flag updates (Global - flags are important map objectives)
                if (room.mode === "ctf") {
                    const flags = room.getCTFFlags();
                    if (flags && flags.length > 0) {
                        globalBatchMessages.push(createServerMessage(ServerMessageType.CTF_FLAG_UPDATE, { flags }));
                    }

                    // Add CTF events to batch
                    const pickupEvent = (room as any).lastCTFPickupEvent;
                    if (pickupEvent) {
                        globalBatchMessages.push(createServerMessage(ServerMessageType.CTF_FLAG_PICKUP, pickupEvent));
                        (room as any).lastCTFPickupEvent = null;
                    }

                    const captureEvent = (room as any).lastCTFCaptureEvent;
                    if (captureEvent) {
                        globalBatchMessages.push(createServerMessage(ServerMessageType.CTF_FLAG_CAPTURE, captureEvent));
                        (room as any).lastCTFCaptureEvent = null;
                    }
                }

                // Send purely global updates
                if (globalBatchMessages.length > 0) {
                    this.broadcastBatchToRoom(room, globalBatchMessages);
                }
            }
        }
    }

    private broadcastToNearby(room: GameRoom, position: Vector3, message: ServerMessage, maxDistance: number = 350, excludePlayerId?: string): void {
        const serialized = serializeMessage(message);

        for (const player of room.getAllPlayers()) {
            if (player.id === excludePlayerId) continue;
            if (player.socket.readyState === WebSocket.OPEN && player.position) {
                // ОПТИМИЗАЦИЯ: Используем DistanceSquared вместо Distance (избегаем вычисления корня)
                const distSq = Vector3.DistanceSquared(player.position, position);
                const maxDistanceSq = maxDistance * maxDistance;
                if (distSq <= maxDistanceSq) {
                    player.socket.send(serialized);
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

    /**
     * Отправка сообщения всем игрокам которые не в комнатах (в лобби)
     */
    private broadcastToLobby(message: ServerMessage): void {
        const serialized = serializeMessage(message);
        let sentCount = 0;

        for (const player of this.players.values()) {
            // Только игрокам которые не в комнате
            if (!player.roomId && player.socket.readyState === WebSocket.OPEN) {
                player.socket.send(serialized);
                sentCount++;
            }
        }

        serverLogger.log(`[Server] broadcastToLobby: отправлено ${sentCount} игрокам`);
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

    /**
     * Send multiple messages as a single batch
     * Reduces network overhead by grouping updates
     */
    private sendBatch(ws: WebSocket, messages: ServerMessage[]): void {
        if (ws.readyState !== WebSocket.OPEN || messages.length === 0) {
            return;
        }

        // If only one message, send directly without batch wrapper
        if (messages.length === 1) {
            this.send(ws, messages[0]!);
            return;
        }

        // OPTIMIZED BATCH: Split large batches to avoid overwhelming the network
        const MAX_BATCH_SIZE = 10; // Maximum messages per batch
        const MAX_BATCH_BYTES = 16384; // 16KB max per batch

        let currentBatch: ServerMessage[] = [];
        let estimatedSize = 0;

        for (const msg of messages) {
            // Rough estimate of message size
            const msgSize = JSON.stringify(msg).length;

            // Check if adding this message would exceed limits
            if (currentBatch.length >= MAX_BATCH_SIZE ||
                (estimatedSize + msgSize > MAX_BATCH_BYTES && currentBatch.length > 0)) {
                // Send current batch
                this.sendSingleBatch(ws, currentBatch);
                currentBatch = [];
                estimatedSize = 0;
            }

            currentBatch.push(msg);
            estimatedSize += msgSize;
        }

        // Send remaining messages
        if (currentBatch.length > 0) {
            this.sendSingleBatch(ws, currentBatch);
        }
    }

    private sendSingleBatch(ws: WebSocket, messages: ServerMessage[]): void {
        if (messages.length === 0) return;

        if (messages.length === 1) {
            this.send(ws, messages[0]!);
            return;
        }

        // Create batch message with timestamp for jitter compensation
        const batchMessage = createServerMessage(ServerMessageType.BATCH, {
            updates: messages.map(m => ({ type: m.type, data: m.data })),
            timestamp: Date.now(),
            count: messages.length
        });

        const serialized = serializeMessage(batchMessage);
        ws.send(serialized);
    }

    /**
     * Broadcast batch to room - groups messages for each player
     */
    private broadcastBatchToRoom(room: GameRoom, messages: ServerMessage[], excludePlayerId?: string): void {
        if (messages.length === 0) return;

        for (const player of room.getAllPlayers()) {
            if (player.id === excludePlayerId) continue;
            if (player.socket.readyState === WebSocket.OPEN) {
                this.sendBatch(player.socket, messages);
            }
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

    private getPlayerById(playerId: string): ServerPlayer | undefined {
        return this.players.get(playerId);
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

        // Очищаем все мониторинг-интервалы
        for (const interval of this.monitoringIntervals) {
            clearInterval(interval);
        }
        this.monitoringIntervals = [];

        // Очищаем delta compressors
        this.deltaCompressor.clear();

        this.wss.close();
        serverLogger.log("[Server] Server shutdown");
    }
}


