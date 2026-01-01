/**
 * GameMultiplayerCallbacks - Обработчики мультиплеерных событий
 * Вынесено из game.ts для уменьшения размера файла
 */

import { Vector3 } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { ServerMessageType } from "../../shared/messages";
import { CONSUMABLE_TYPES } from "../consumables";
import { RealtimeStatsTracker } from "../realtimeStats";
import { NetworkPlayerTank } from "../networkPlayerTank";
import type { MultiplayerManager } from "../multiplayer";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { AchievementsSystem } from "../achievements";
import type { ChatSystem } from "../chatSystem";
import type { SoundManager } from "../soundManager";
import type { EffectsManager } from "../effects";
import type { ConsumablesManager } from "../consumables";
import type { ChunkSystem } from "../chunkSystem";
import type { Scene } from "@babylonjs/core";
import type { MainMenu } from "../menu";
import type { BattleRoyaleVisualizer } from "../battleRoyale";
import type { CTFVisualizer } from "../ctfVisualizer";
import type { GamePersistence } from "./GamePersistence";
import type { GameUI } from "./GameUI";

export interface MultiplayerCallbacksDependencies {
    multiplayerManager?: MultiplayerManager;
    scene?: Scene;
    tank?: TankController;
    hud?: HUD;
    mainMenu?: MainMenu;
    achievementsSystem?: AchievementsSystem;
    chatSystem?: ChatSystem;
    soundManager?: SoundManager;
    effectsManager?: EffectsManager;
    consumablesManager?: ConsumablesManager;
    chunkSystem?: ChunkSystem;
    gameUI?: GameUI;
    gamePersistence?: GamePersistence;
    networkPlayerTanks: Map<string, NetworkPlayerTank>;
    gameEnemies?: any; // GameEnemies для создания синхронизированных ботов
    battleRoyaleVisualizer?: BattleRoyaleVisualizer;
    ctfVisualizer?: CTFVisualizer;
    replayRecorder?: any;
    realtimeStatsTracker?: RealtimeStatsTracker;
    isMultiplayer: boolean;
    setIsMultiplayer: (value: boolean) => void;
    setBattleRoyaleVisualizer: (viz: BattleRoyaleVisualizer) => void;
    setCTFVisualizer: (viz: CTFVisualizer) => void;
    setRealtimeStatsTracker: (tracker: RealtimeStatsTracker) => void;
    setReplayRecorder: (recorder: any) => void;
    startGame?: () => Promise<void> | void;
    isGameInitialized?: () => boolean;
    isGameStarted?: () => boolean;
    processPendingNetworkPlayers?: () => void;
}

/**
 * Класс для управления мультиплеерными колбэками
 */
export class GameMultiplayerCallbacks {
    private deps: MultiplayerCallbacksDependencies;
    private pendingNetworkPlayers: Array<any> = []; // Очередь игроков, ожидающих создания танков
    private pendingEnemies: Array<any> = []; // Очередь ботов, ожидающих создания
    
    constructor() {
        this.deps = {
            networkPlayerTanks: new Map(),
            isMultiplayer: false,
            setIsMultiplayer: () => {},
            setBattleRoyaleVisualizer: () => {},
            setCTFVisualizer: () => {},
            setRealtimeStatsTracker: () => {},
            setReplayRecorder: () => {}
        };
    }
    
    /**
     * Обновить зависимости
     */
    updateDependencies(deps: Partial<MultiplayerCallbacksDependencies>): void {
        Object.assign(this.deps, deps);
    }
    
    /**
     * Настроить все мультиплеерные колбэки
     */
    setup(): void {
        const mm = this.deps.multiplayerManager;
        if (!mm) return;
        
        this.setupConnectionCallbacks(mm);
        this.setupPlayerCallbacks(mm);
        this.setupMatchCallbacks(mm);
        this.setupGameEventCallbacks(mm);
        this.setupCTFCallbacks(mm);
        this.setupOtherCallbacks(mm);
    }
    
    private setupConnectionCallbacks(mm: MultiplayerManager): void {
        mm.onConnected(() => {
            logger.log("[Game] Connected to multiplayer server");
            
            // Настраиваем callback для списка комнат при подключении
            // Это нужно, чтобы список комнат обновлялся автоматически
            if (this.deps.mainMenu) {
                mm.onRoomList((rooms: any[]) => {
                    console.log(`[GameMultiplayerCallbacks] 📋 Получен список комнат через callback: ${rooms.length} комнат`);
                    if (this.deps.mainMenu && typeof this.deps.mainMenu.updateRoomList === "function") {
                        console.log(`[GameMultiplayerCallbacks] ✅ Вызываем updateRoomList`);
                        this.deps.mainMenu.updateRoomList(rooms);
                    } else {
                        console.warn(`[GameMultiplayerCallbacks] ⚠️ mainMenu.updateRoomList не доступен`);
                    }
                });
                console.log(`[GameMultiplayerCallbacks] ✅ Callback для списка комнат настроен`);
            } else {
                console.warn(`[GameMultiplayerCallbacks] ⚠️ mainMenu не доступен для настройки callback`);
            }
            
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        mm.onDisconnected(() => {
            logger.log("[Game] Disconnected from multiplayer server");
            this.deps.setIsMultiplayer(false);
            this.deps.hud?.showMultiplayerHUD?.(false);
            
            this.deps.networkPlayerTanks.forEach(tank => tank.dispose());
            this.deps.networkPlayerTanks.clear();
            
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
    }
    
    private setupPlayerCallbacks(mm: MultiplayerManager): void {
        mm.onPlayerJoined((playerData) => {
            logger.log(`[Game] Player joined: ${playerData.name}`);
            this.queueNetworkPlayerForCreation(playerData);
            // Обновляем статус мультиплеера для обновления кнопки "В БОЙ!"
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        mm.onPlayerLeft((playerId) => {
            logger.log(`[Game] Player left: ${playerId}`);
            const tank = this.deps.networkPlayerTanks.get(playerId);
            if (tank) {
                tank.dispose();
                this.deps.networkPlayerTanks.delete(playerId);
            }
            // Обновляем статус мультиплеера для обновления кнопки "В БОЙ!"
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        mm.onQueueUpdate((data) => {
            logger.log(`[Game] Queue update: ${data.queueSize} players, estimated wait: ${data.estimatedWait}s`);
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateQueueInfo === "function") {
                this.deps.mainMenu.updateQueueInfo(
                    data.queueSize || 0,
                    data.estimatedWait || 0,
                    data.mode || "unknown"
                );
            }
        });
        
        mm.onGameInvite((data) => {
            logger.log(`[Game] Game invite from ${data.fromPlayerName} (${data.fromPlayerId})`);
            // Показываем уведомление в HUD
            if (this.deps.hud) {
                this.deps.hud.showMessage(
                    `🎮 Приглашение от ${data.fromPlayerName}${data.roomId ? ` (Комната: ${data.roomId.substring(0, 8)})` : ''}`,
                    "#4ade80",
                    5000
                );
            }
            // Показываем уведомление в меню
            if (this.deps.mainMenu && typeof this.deps.mainMenu.showGameInviteNotification === "function") {
                this.deps.mainMenu.showGameInviteNotification(data);
            }
            // Показываем уведомление в чате
            if (this.deps.chatSystem) {
                this.deps.chatSystem.addMessage(
                    `🎮 ${data.fromPlayerName} приглашает вас в игру${data.roomId ? ` (Комната: ${data.roomId.substring(0, 8)})` : ''}`,
                    "info",
                    1
                );
            }
        });
        
        mm.onPlayerStates((players) => {
            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
            if (!localPlayerId) {
                logger.warn(`[Game] onPlayerStates: Local player ID not available`);
                return;
            }
            
            logger.log(`[Game] onPlayerStates: Processing ${players.length} players, current tanks: ${this.deps.networkPlayerTanks.size}, pending: ${this.pendingNetworkPlayers.length}`);
            
            // Если сцена доступна и есть ожидающие игроки, обрабатываем их сначала
            if (this.deps.scene && this.pendingNetworkPlayers.length > 0) {
                logger.log(`[Game] Scene is now available, processing ${this.pendingNetworkPlayers.length} pending players from queue`);
                this.processPendingNetworkPlayers();
            }
            
            // Используем унифицированную функцию для всех игроков
            for (const playerData of players) {
                // Пропускаем локального игрока
                if (playerData.id === localPlayerId) continue;
                
                // Используем унифицированную функцию - она сама проверит все условия
                this.queueNetworkPlayerForCreation(playerData);
            }
        });
    }
    
    private setupMatchCallbacks(mm: MultiplayerManager): void {
        mm.onMatchFound((data) => {
            logger.log(`[Game] Match found: ${data.roomId}`);
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateQueueInfo === "function") {
                this.deps.mainMenu.updateQueueInfo(0, 0, null);
            }
        });
        
        mm.onRoomCreated((data) => {
            logger.log(`[Game] Room created: ${data.roomId}`);
            // Выводим номер комнаты в консоль браузера
            console.log(`%c🎮 НОМЕР СОЗДАННОЙ КОМНАТЫ: ${data.roomId}`, 'color: #4ade80; font-size: 16px; font-weight: bold; padding: 6px; background: rgba(74, 222, 128, 0.15); border: 2px solid #4ade80; border-radius: 6px;');
            console.log(`%cРежим игры: ${data.mode?.toUpperCase() || 'UNKNOWN'}`, 'color: #a78bfa; font-size: 13px; margin-top: 4px;');
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        mm.onGameStart((data) => {
            this.handleGameStart(data);
        });
        
        mm.onGameEnd((data) => {
            this.handleGameEnd(data);
        });
    }
    
    private handleGameStart(data: any): void {
        logger.log("[Game] Multiplayer game started");
        // КРИТИЧНО: Устанавливаем isMultiplayer СРАЗУ, до вызова startGame()
        // Это предотвратит спавн ботов в мультиплеере
        this.deps.setIsMultiplayer(true);
        
        const mm = this.deps.multiplayerManager;
        if (!mm) return;
        
        const serverUrl = mm.getServerUrl() || "ws://localhost:8000";
        const roomId = data.roomId || mm.getRoomId();
        const playerId = mm.getPlayerId();
        
        // Initialize voice chat (lazy loaded)
        if (roomId && playerId) {
            import("../voiceChat").then(({ voiceChatManager }) => {
                (window as any).voiceChatManager = voiceChatManager;
                
                voiceChatManager.initialize(serverUrl, roomId, playerId).then(success => {
                    if (success) {
                        logger.log("[Game] Voice chat initialized");
                    } else {
                        logger.warn("[Game] Voice chat initialization failed");
                    }
                });
            }).catch(error => {
                logger.error("[Game] Failed to load voice chat:", error);
            });
        }
        
        // Use world seed from server
        // ВАЖНО: World seed уже должен быть установлен при создании chunkSystem
        // Если chunkSystem уже создан, мы не можем изменить seed - карта уже сгенерирована
        // Поэтому seed должен быть получен ДО создания chunkSystem
        if (data.worldSeed) {
            logger.log(`[Game] Server world seed: ${data.worldSeed} (should be set before chunkSystem creation)`);
            // Сохраняем seed в multiplayerManager для использования при следующей инициализации
            if (mm) {
                (mm as any).worldSeed = data.worldSeed;
            }
            // Если chunkSystem еще не создан, seed будет использован при создании
            // Если уже создан - игроки будут на разных картах (это нормально для присоединения к активной игре)
        }
        
        // Сохраняем позицию спавна локального игрока
        if (data.players && mm) {
            const localPlayerId = mm.getPlayerId();
            const localPlayerData = data.players.find((p: any) => p.id === localPlayerId);
            if (localPlayerData && localPlayerData.position) {
                (mm as any).spawnPosition = new Vector3(
                    localPlayerData.position.x,
                    localPlayerData.position.y,
                    localPlayerData.position.z
                );
                logger.log(`[Game] Saved spawn position for local player: (${localPlayerData.position.x.toFixed(2)}, ${localPlayerData.position.y.toFixed(2)}, ${localPlayerData.position.z.toFixed(2)})`);
            }
        }
        
        // КРИТИЧНО: Добавляем игроков в networkPlayers ДО создания танков
        // Используем унифицированную функцию для предотвращения дублирования
        if (data.players && mm) {
            const localPlayerId = mm.getPlayerId();
            logger.log(`[Game] Processing ${data.players.length} network players for creation (local: ${localPlayerId})`);
            
            // Очищаем предыдущую очередь
            this.pendingNetworkPlayers = [];
            
            for (const playerData of data.players) {
                if (playerData.id !== localPlayerId) {
                    logger.log(`[Game] Queueing network tank for player ${playerData.id} at position (${playerData.position?.x?.toFixed(2)}, ${playerData.position?.y?.toFixed(2)}, ${playerData.position?.z?.toFixed(2)})`);
                    // Используем унифицированную функцию для добавления/создания
                    this.queueNetworkPlayerForCreation(playerData);
                } else {
                    logger.log(`[Game] Skipping local player ${localPlayerId}`);
                }
            }
            logger.log(`[Game] Queued ${this.pendingNetworkPlayers.length} network players (will be created after Scene initialization)`);
            console.log(`%c[Game] 📋 Очередь сетевых игроков: ${this.pendingNetworkPlayers.length}`, 'color: #a78bfa; font-weight: bold;');
        }
        
        // Initialize Battle Royale visualizer
        if (data.mode === "battle_royale" && !this.deps.battleRoyaleVisualizer && this.deps.scene) {
            import("../battleRoyale").then(({ BattleRoyaleVisualizer }) => {
                const viz = new BattleRoyaleVisualizer(this.deps.scene!);
                this.deps.setBattleRoyaleVisualizer(viz);
            }).catch(error => {
                logger.error("[Game] Failed to load Battle Royale visualizer:", error);
            });
        }
        
        // Initialize CTF visualizer
        if (data.mode === "ctf" && !this.deps.ctfVisualizer && this.deps.scene) {
            import("../ctfVisualizer").then(({ CTFVisualizer }) => {
                const viz = new CTFVisualizer(this.deps.scene!);
                this.deps.setCTFVisualizer(viz);
            }).catch(error => {
                logger.error("[Game] Failed to load CTF visualizer:", error);
            });
        }
        
        // Initialize real-time stats tracker
        if (playerId) {
            if (!this.deps.realtimeStatsTracker) {
                const tracker = new RealtimeStatsTracker();
                this.deps.setRealtimeStatsTracker(tracker);
                tracker.startMatch(playerId);
            } else {
                this.deps.realtimeStatsTracker.startMatch(playerId);
            }
        }
        
        // Создаем синхронизированных ботов из данных с сервера
        if (data.enemies && Array.isArray(data.enemies) && data.enemies.length > 0) {
            logger.log(`[Game] Received ${data.enemies.length} synchronized enemies from server`);
            // Сохраняем данные о ботах для создания после инициализации
            this.pendingEnemies = data.enemies;
        }
        
        // Start replay recording
        this.startReplayRecording(data);
        
        // Ensure game is initialized before starting
        if (this.deps.isGameInitialized && !this.deps.isGameInitialized()) {
            logger.warn("[Game] Game not initialized yet, waiting for initialization...");
            // Game will be initialized when startGame is called
        }
        
        // Hide menu before starting game
        if (this.deps.mainMenu) {
            logger.log("[Game] Hiding menu before starting multiplayer game");
            try {
                this.deps.mainMenu.hide();
            } catch (error) {
                logger.error("[Game] Error hiding menu:", error);
            }
        } else {
            logger.warn("[Game] MainMenu not available, cannot hide menu");
        }
        
        // Start the game
        if (this.deps.startGame) {
            logger.log("[Game] Starting multiplayer game via callback");
            // Используем setTimeout для асинхронного вызова, чтобы не блокировать обработку сообщения
            setTimeout(async () => {
                try {
                    const result = this.deps.startGame!();
                    if (result instanceof Promise) {
                        await result.catch(error => {
                            logger.error("[Game] Error starting multiplayer game (async):", error);
                            console.error("[Game] startGame promise rejected:", error);
                        });
                    }
                } catch (error) {
                    logger.error("[Game] Error starting multiplayer game (sync):", error);
                    console.error("[Game] startGame callback error:", error);
                }
            }, 100); // Небольшая задержка для завершения инициализации систем
        } else {
            logger.error("[Game] startGame callback not available! Game will not start.");
        }
    }
    
    private startReplayRecording(data: any): void {
        const worldSeed = data.worldSeed || 0;
        const initialPlayers = data.players || [];
        const matchData = {
            roomId: data.roomId || `match_${Date.now()}`,
            mode: data.mode || "ffa",
            maxPlayers: data.maxPlayers || 32
        };
        
        if (!this.deps.replayRecorder) {
            import("../replaySystem").then(({ ReplayRecorder }) => {
                const recorder = new ReplayRecorder();
                this.deps.setReplayRecorder(recorder);
                recorder.startRecording(matchData.roomId, matchData.mode, worldSeed, initialPlayers, {
                    maxPlayers: matchData.maxPlayers
                });
            }).catch(error => {
                logger.error("[Game] Failed to load replay system:", error);
            });
        } else {
            this.deps.replayRecorder.startRecording(matchData.roomId, matchData.mode, worldSeed, initialPlayers, {
                maxPlayers: matchData.maxPlayers
            });
        }
    }
    
    private handleGameEnd(data: any): void {
        // Stop real-time stats tracking
        if (this.deps.realtimeStatsTracker) {
            this.deps.realtimeStatsTracker.stopMatch();
        }
        
        // Stop and save replay
        if (this.deps.replayRecorder) {
            const replayData = this.deps.replayRecorder.stopRecording();
            if (replayData) {
                const key = this.deps.replayRecorder.saveReplay(replayData, false);
                if (key) {
                    logger.log(`[Game] Replay saved: ${key}`);
                }
            }
        }
        
        // Save match statistics
        this.deps.gamePersistence?.saveMatchStatistics(data);
    }
    
    private setupGameEventCallbacks(mm: MultiplayerManager): void {
        mm.onPlayerKilled((data) => {
            if (this.deps.replayRecorder) {
                this.deps.replayRecorder.recordServerMessage(ServerMessageType.PLAYER_KILLED, data);
            }
            
            const localPlayerId = mm.getPlayerId();
            if (data.killerId === localPlayerId) {
                this.deps.hud?.addKill();
                this.deps.hud?.showNotification?.(`⚔️ Вы убили ${data.victimName}!`, "success");
                
                if (this.deps.achievementsSystem) {
                    this.deps.achievementsSystem.updateProgress("multiplayer_first_kill", 1);
                    this.deps.achievementsSystem.updateProgress("multiplayer_killer", 1);
                    this.deps.achievementsSystem.updateProgress("multiplayer_dominator", 1);
                }
            } else if (data.victimId === localPlayerId) {
                this.deps.hud?.showNotification?.(`💀 Вас убил ${data.killerName}`, "error");
            } else {
                this.deps.hud?.showNotification?.(`⚔️ ${data.killerName} убил ${data.victimName}`, "info");
            }
        });
        
        mm.onPlayerDied((data) => {
            const localPlayerId = mm.getPlayerId();
            if (data.playerId === localPlayerId) {
                this.deps.hud?.showNotification?.("💀 Вы погибли", "error");
            }
        });
        
        mm.onPlayerDamaged((data) => {
            const localPlayerId = mm.getPlayerId();
            if (data.playerId === localPlayerId) {
                const healthPercent = (data.health / data.maxHealth) * 100;
                if (healthPercent < 30) {
                    this.deps.hud?.showNotification?.(`⚠️ Критическое здоровье! ${Math.round(healthPercent)}%`, "warning");
                }
            }
        });
        
        mm.onSafeZoneUpdate((data: any) => {
            this.handleSafeZoneUpdate(data);
        });
        
        mm.onProjectileSpawn((data) => {
            if (this.deps.replayRecorder) {
                this.deps.replayRecorder.recordServerMessage(ServerMessageType.PROJECTILE_SPAWN, data);
            }
            
            if (this.deps.effectsManager && data.position && data.direction) {
                const pos = new Vector3(data.position.x, data.position.y, data.position.z);
                const dir = new Vector3(data.direction.x, data.direction.y, data.direction.z);
                this.deps.effectsManager.createMuzzleFlash(pos, dir, data.cannonType || "standard");
            }
        });
        
        mm.onChatMessage((data) => {
            if (this.deps.chatSystem) {
                this.deps.chatSystem.addMessage(`${data.playerName}: ${data.message}`, "info");
            }
        });
        
        mm.onConsumablePickup((data) => {
            this.handleConsumablePickup(data);
        });
        
        mm.onEnemyUpdate((data) => {
            if (data.enemies && this.deps.isMultiplayer) {
                logger.log(`[Game] Received ${data.enemies.length} enemy updates`);
            }
        });
    }
    
    private handleSafeZoneUpdate(data: any): void {
        if (!this.deps.battleRoyaleVisualizer || !data) return;
        
        const zoneData = {
            center: new Vector3(data.center.x, data.center.y || 0, data.center.z),
            radius: data.radius,
            nextCenter: new Vector3(
                data.nextCenter?.x || data.center.x,
                data.nextCenter?.y || 0,
                data.nextCenter?.z || data.center.z
            ),
            nextRadius: data.nextRadius || data.radius,
            shrinkProgress: data.shrinkProgress || 0
        };
        this.deps.battleRoyaleVisualizer.updateSafeZone(zoneData);
        
        if (this.deps.tank?.chassis) {
            const playerPos = this.deps.tank.chassis.getAbsolutePosition();
            const isInZone = this.deps.battleRoyaleVisualizer.isPlayerInSafeZone(playerPos);
            const distance = this.deps.battleRoyaleVisualizer.getDistanceToSafeZone(playerPos);
            
            if (!isInZone) {
                this.deps.hud?.showNotification?.(`⚠️ Вне безопасной зоны! ${distance.toFixed(0)}м`, "warning");
            }
        }
    }
    
    private handleConsumablePickup(data: any): void {
        const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
        
        if (data.playerId === localPlayerId) {
            const consumableType = CONSUMABLE_TYPES.find(c => c.id === data.type);
            if (consumableType && this.deps.consumablesManager) {
                let slot = -1;
                for (let s = 1; s <= 5; s++) {
                    if (!this.deps.consumablesManager.get(s)) {
                        slot = s;
                        break;
                    }
                }
                if (slot > 0) {
                    this.deps.consumablesManager.pickUp(consumableType, slot);
                    this.deps.chatSystem?.success(`Подобран: ${consumableType.icon} ${consumableType.name} (слот ${slot})`);
                    this.deps.hud?.updateConsumables(this.deps.consumablesManager.getAll());
                    this.deps.soundManager?.playPickup();
                }
            }
        }
        
        // Remove consumable from map
        if (this.deps.chunkSystem && data.consumableId) {
            const pickup = this.deps.chunkSystem.consumablePickups.find(
                p => ((p as any).mesh.metadata as any)?.consumableId === data.consumableId ||
                     (data.position && Math.abs((p as any).mesh.position.x - data.position.x) < 1 &&
                      Math.abs((p as any).mesh.position.z - data.position.z) < 1)
            );
            if (pickup) {
                (pickup as any).mesh.dispose();
                const index = this.deps.chunkSystem.consumablePickups.indexOf(pickup);
                if (index !== -1) {
                    this.deps.chunkSystem.consumablePickups.splice(index, 1);
                }
            }
        }
    }
    
    private setupCTFCallbacks(mm: MultiplayerManager): void {
        mm.onCTFFlagPickup((data) => {
            const localPlayerId = mm.getPlayerId();
            if (data.playerId === localPlayerId) {
                this.deps.gameUI?.showNotification(
                    `🏴 Вы подобрали флаг команды ${data.flagTeam === 0 ? "синих" : "красных"}!`, 
                    "success"
                );
            } else {
                this.deps.gameUI?.showNotification(
                    `🏴 ${data.playerName} подобрал флаг команды ${data.flagTeam === 0 ? "синих" : "красных"}`, 
                    "info"
                );
            }
        });
        
        mm.onCTFFlagCapture((data) => {
            const localPlayerId = mm.getPlayerId();
            if (data.playerId === localPlayerId) {
                this.deps.gameUI?.showNotification(
                    `🏆 Вы захватили флаг! Команда ${data.capturingTeam === 0 ? "синих" : "красных"} получает очко!`, 
                    "success"
                );
                
                if (this.deps.achievementsSystem) {
                    this.deps.achievementsSystem.updateProgress("multiplayer_ctf_capture", 1);
                    this.deps.achievementsSystem.updateProgress("multiplayer_ctf_master", 1);
                }
            } else {
                this.deps.gameUI?.showNotification(
                    `🏆 ${data.playerName} захватил флаг! Команда ${data.capturingTeam === 0 ? "синих" : "красных"} получает очко!`, 
                    "info"
                );
            }
        });
        
        mm.onCTFFlagUpdate((data: any) => {
            if (!this.deps.ctfVisualizer || !data.flags) return;
            
            this.deps.ctfVisualizer.updateFlags(data.flags);
            
            if (this.deps.hud && this.deps.tank?.chassis) {
                const playerPos = this.deps.tank.chassis.getAbsolutePosition();
                const localPlayerId = mm.getPlayerId();
                const localPlayer = mm.getNetworkPlayer(localPlayerId || "");
                const playerTeam = localPlayer?.team;
                
                if (playerTeam !== undefined) {
                    const ownFlag = data.flags.find((f: any) => f.team === playerTeam);
                    const enemyFlag = data.flags.find((f: any) => f.team !== playerTeam);
                    
                    this.deps.hud.updateCTFInfo?.({
                        ownFlag: ownFlag ? {
                            isCarried: ownFlag.isCarried,
                            carrierId: ownFlag.carrierId,
                            position: ownFlag.position
                        } : null,
                        enemyFlag: enemyFlag ? {
                            isCarried: enemyFlag.isCarried,
                            carrierId: enemyFlag.carrierId,
                            position: enemyFlag.position
                        } : null,
                        playerPosition: playerPos,
                        playerTeam
                    });
                }
            }
        });
    }
    
    private setupOtherCallbacks(_mm: MultiplayerManager): void {
        // Additional callbacks can be added here
    }
    
    /**
     * Проверить, есть ли ожидающие сетевые игроки
     */
    hasPendingNetworkPlayers(): boolean {
        return this.pendingNetworkPlayers.length > 0;
    }
    
    /**
     * Обработать очередь ожидающих сетевых игроков
     * Вызывается после инициализации Scene
     */
    processPendingNetworkPlayers(): void {
        logger.log(`[Game] 🔄 processPendingNetworkPlayers called. Scene available: ${!!this.deps.scene}, Pending players: ${this.pendingNetworkPlayers.length}`);
        
        if (!this.deps.scene) {
            logger.warn("[Game] Cannot process pending network players: Scene not available");
            return;
        }
        
        // Обрабатываем сетевых игроков
        if (this.pendingNetworkPlayers.length > 0) {
            logger.log(`[Game] 🔄 Processing ${this.pendingNetworkPlayers.length} pending network players`);
            console.log(`%c[Game] 🔄 Обработка ${this.pendingNetworkPlayers.length} ожидающих сетевых игроков`, 'color: #fbbf24; font-weight: bold;');
            
            const playersToCreate = [...this.pendingNetworkPlayers];
            this.pendingNetworkPlayers = [];
            
            let createdCount = 0;
            for (const playerData of playersToCreate) {
                const hadTank = this.deps.networkPlayerTanks.has(playerData.id);
                // Используем внутренний метод для создания, так как все проверки уже пройдены
                const networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                if (networkPlayer) {
                    this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                    if (this.deps.networkPlayerTanks.has(playerData.id) && !hadTank) {
                        createdCount++;
                    }
                } else {
                    // Если networkPlayer не найден, используем унифицированную функцию
                    this.queueNetworkPlayerForCreation(playerData);
                }
            }
            
            logger.log(`[Game] ✅ Created ${createdCount} new network player tanks from queue (total: ${this.deps.networkPlayerTanks.size})`);
            console.log(`%c[Game] ✅ Создано ${createdCount} новых сетевых танков из очереди (всего: ${this.deps.networkPlayerTanks.size})`, 'color: #4ade80; font-weight: bold;');
        } else {
            logger.log(`[Game] No pending network players to process (current tanks: ${this.deps.networkPlayerTanks.size})`);
        }
        
        // Обрабатываем синхронизированных ботов
        if (this.pendingEnemies.length > 0) {
            logger.log(`[Game] Processing ${this.pendingEnemies.length} pending network enemies`);
            
            const enemiesToCreate = [...this.pendingEnemies];
            this.pendingEnemies = [];
            
            // Создаем ботов через GameEnemies
            if (this.deps.gameEnemies && typeof this.deps.gameEnemies.spawnNetworkEnemies === "function") {
                this.deps.gameEnemies.spawnNetworkEnemies(enemiesToCreate);
                logger.log(`[Game] ✅ Spawned ${enemiesToCreate.length} network-synchronized enemies`);
            } else {
                // Fallback: пытаемся получить gameEnemies из game
                const game = (window as any).gameInstance;
                if (game && game.gameEnemies && typeof game.gameEnemies.spawnNetworkEnemies === "function") {
                    game.gameEnemies.spawnNetworkEnemies(enemiesToCreate);
                    logger.log(`[Game] ✅ Spawned ${enemiesToCreate.length} network-synchronized enemies (via fallback)`);
                } else {
                    logger.warn("[Game] Cannot spawn network enemies: GameEnemies.spawnNetworkEnemies not available");
                }
            }
        }
    }
    
    /**
     * Унифицированная функция для добавления сетевого игрока в очередь или создания танка
     * Предотвращает дублирование и race conditions
     */
    private queueNetworkPlayerForCreation(playerData: any): void {
        if (!playerData || !playerData.id) {
            logger.warn(`[Game] Invalid player data for queueing`);
            return;
        }

        const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
        if (playerData.id === localPlayerId) {
            // Пропускаем локального игрока
            return;
        }

        // Проверка 1: Танк уже создан?
        if (this.deps.networkPlayerTanks.has(playerData.id)) {
            logger.log(`[Game] Network player tank ${playerData.id} already exists, skipping`);
            return;
        }

        // Проверка 2: Игрок уже в очереди?
        if (this.pendingNetworkPlayers.find(p => p.id === playerData.id)) {
            logger.log(`[Game] Network player ${playerData.id} already in queue, skipping`);
            return;
        }

        // Проверка 3: Убеждаемся, что игрок добавлен в networkPlayers
        const mm = this.deps.multiplayerManager;
        if (!mm) {
            logger.error(`[Game] MultiplayerManager not available for player ${playerData.id}`);
            return;
        }

        let networkPlayer = mm.getNetworkPlayer(playerData.id);
        if (!networkPlayer) {
            // Добавляем игрока в networkPlayers
            logger.log(`[Game] Adding network player ${playerData.id} to manager`);
            (mm as any).addNetworkPlayer(playerData);
            networkPlayer = mm.getNetworkPlayer(playerData.id);
            if (!networkPlayer) {
                logger.error(`[Game] Failed to add network player ${playerData.id} to manager`);
                return;
            }
        } else {
            // Обновляем существующего игрока
            (mm as any).updateNetworkPlayer(playerData, 0);
        }

        // Проверка 4: Scene готов? Создаем танк сразу, иначе добавляем в очередь
        if (this.deps.scene) {
            // Scene готов - создаем танк сразу
            logger.log(`[Game] Scene available, creating tank immediately for ${playerData.id}`);
            this.createNetworkPlayerTankInternal(playerData, networkPlayer);
        } else {
            // Scene не готов - добавляем в очередь
            logger.log(`[Game] Scene not available, queueing network player ${playerData.id}`);
            this.pendingNetworkPlayers.push(playerData);
        }
    }

    /**
     * Внутренняя функция создания танка (без проверок на дубликаты)
     */
    private createNetworkPlayerTankInternal(playerData: any, networkPlayer: any): void {
        if (!this.deps.scene) {
            logger.warn(`[Game] Scene not available for creating tank ${playerData.id}`);
            // Проверяем, нет ли игрока уже в очереди перед добавлением
            if (!this.pendingNetworkPlayers.find(p => p.id === playerData.id)) {
                this.pendingNetworkPlayers.push(playerData);
            }
            return;
        }

        // Проверяем валидность позиции
        if (!playerData.position || 
            !Number.isFinite(playerData.position.x) || 
            !Number.isFinite(playerData.position.y) || 
            !Number.isFinite(playerData.position.z)) {
            logger.warn(`[Game] Invalid position for player ${playerData.id}, using default position (0, 2, 0)`);
            networkPlayer.position.set(0, 2, 0);
        }

        try {
            logger.log(`[Game] 🔨 Creating NetworkPlayerTank for ${playerData.id} (${playerData.name || 'Unknown'}) at (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`);
            const tank = new NetworkPlayerTank(this.deps.scene, networkPlayer);
            (tank as any).multiplayerManager = this.deps.multiplayerManager;
            this.deps.networkPlayerTanks.set(playerData.id, tank);
            
            // Убеждаемся, что танк видим
            if (tank.chassis) {
                tank.chassis.isVisible = true;
                tank.chassis.setEnabled(true);
                logger.log(`[Game] ✅ Tank chassis created and visible: ${tank.chassis.name || 'unnamed'}, position: (${tank.chassis.position.x.toFixed(1)}, ${tank.chassis.position.y.toFixed(1)}, ${tank.chassis.position.z.toFixed(1)})`);
            } else {
                logger.error(`[Game] ❌ Tank chassis is null for ${playerData.id}`);
            }
            if (tank.turret) {
                tank.turret.isVisible = true;
                tank.turret.setEnabled(true);
                logger.log(`[Game] ✅ Tank turret created and visible: ${tank.turret.name || 'unnamed'}`);
            } else {
                logger.error(`[Game] ❌ Tank turret is null for ${playerData.id}`);
            }
            if (tank.barrel) {
                tank.barrel.isVisible = true;
                tank.barrel.setEnabled(true);
                logger.log(`[Game] ✅ Tank barrel created and visible: ${tank.barrel.name || 'unnamed'}`);
            } else {
                logger.error(`[Game] ❌ Tank barrel is null for ${playerData.id}`);
            }
            
            // Проверяем, что танк действительно в сцене
            if (tank.chassis && this.deps.scene) {
                const inScene = this.deps.scene.meshes.includes(tank.chassis);
                logger.log(`[Game] Tank chassis in scene: ${inScene}, scene meshes count: ${this.deps.scene.meshes.length}`);
                if (!inScene) {
                    logger.error(`[Game] ❌ Tank chassis NOT in scene meshes!`);
                }
            }
            
            logger.log(`[Game] ✅ Network player tank created for ${playerData.id} (${playerData.name || 'Unknown'}) at (${networkPlayer.position.x.toFixed(2)}, ${networkPlayer.position.y.toFixed(2)}, ${networkPlayer.position.z.toFixed(2)})`);
            console.log(`%c[Game] ✅ Сетевой игрок создан: ${playerData.name || playerData.id}`, 'color: #4ade80; font-weight: bold;');
            console.log(`%cПозиция: (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`, 'color: #a78bfa;');
            console.log(`%cВсего сетевых игроков: ${this.deps.networkPlayerTanks.size}`, 'color: #a78bfa;');
        } catch (error) {
            logger.error(`[Game] Error creating network player tank for ${playerData.id}:`, error);
            console.error(`[Game] Ошибка создания сетевого игрока:`, error);
        }
    }

    /**
     * Создать сетевой танк игрока (публичный метод для обратной совместимости)
     * Теперь использует унифицированную функцию queueNetworkPlayerForCreation
     */
    private createNetworkPlayerTank(playerData: any): void {
        this.queueNetworkPlayerForCreation(playerData);
    }
    
    /**
     * Очистка
     */
    dispose(): void {
        // Cleanup if needed
    }
}

