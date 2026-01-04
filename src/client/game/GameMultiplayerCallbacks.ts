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
import type { PlayerData, PredictedState } from "../../shared/types";
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
    getIsMultiplayer: () => boolean; // Геттер для актуального значения isMultiplayer
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
    private gameStartedFromRoomJoined: boolean = false; // Флаг защиты от двойного запуска игры
    private lastProcessPendingTime: number = 0; // Throttling timestamp
    private readonly PROCESS_PENDING_COOLDOWN = 500; // ms cooldown for processPendingNetworkPlayers
    
    constructor() {
        this.deps = {
            networkPlayerTanks: new Map(), // Временный Map, будет заменен через updateDependencies
            getIsMultiplayer: () => false, // Геттер по умолчанию
            setIsMultiplayer: () => {},
            setBattleRoyaleVisualizer: () => {},
            setCTFVisualizer: () => {},
            setRealtimeStatsTracker: () => {},
            setReplayRecorder: () => {}
        };
    }
    
    /**
     * Обновить зависимости
     * КРИТИЧНО: Если scene становится доступной и есть ожидающие игроки, обрабатываем их
     */
    updateDependencies(deps: Partial<MultiplayerCallbacksDependencies>): void {
        const hadScene = !!this.deps.scene;
        const hadNetworkPlayerTanks = !!this.deps.networkPlayerTanks;
        
        // КРИТИЧНО: Если networkPlayerTanks передается, используем его напрямую (не создаем новый Map)
        if (deps.networkPlayerTanks) {
            this.deps.networkPlayerTanks = deps.networkPlayerTanks;
            logger.log(`[GameMultiplayerCallbacks] ✅ Синхронизирован networkPlayerTanks Map (размер: ${deps.networkPlayerTanks.size})`);
        }
        
        Object.assign(this.deps, deps);
        
        // КРИТИЧНО: Если scene только что стала доступной и есть ожидающие игроки
        if (!hadScene && this.deps.scene && this.pendingNetworkPlayers.length > 0) {
            logger.log(`[Game] 🔧 Scene became available via updateDependencies, processing ${this.pendingNetworkPlayers.length} pending players`);
            // Используем setTimeout чтобы дать время на полную инициализацию
            // force=true чтобы пропустить throttling
            setTimeout(() => {
                this.processPendingNetworkPlayers(true);
            }, 100);
        }
    }
    
    /**
     * Настроить все мультиплеерные колбэки
     */
    setup(): void {
        const mm = this.deps.multiplayerManager;
        if (!mm) {
            logger.warn("[GameMultiplayerCallbacks] setup() called but multiplayerManager is not available");
            return;
        }
        
        logger.log("[GameMultiplayerCallbacks] Setting up all multiplayer callbacks...");
        
        // КРИТИЧНО: Настраиваем onPlayerStates ПЕРВЫМ, до других callbacks
        // Это гарантирует, что данные игроков будут обрабатываться сразу при получении
        this.setupPlayerCallbacks(mm);
        
        this.setupConnectionCallbacks(mm);
        this.setupMatchCallbacks(mm);
        this.setupGameEventCallbacks(mm);
        this.setupCTFCallbacks(mm);
        this.setupOtherCallbacks(mm);
        
        logger.log("[GameMultiplayerCallbacks] ✅ All callbacks set up successfully");
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
            
            // КРИТИЧНО: Проверяем, есть ли еще сетевые игроки перед сбросом isMultiplayer
            const networkPlayersCount = mm.getNetworkPlayers()?.size || 0;
            const tanksCount = this.deps.networkPlayerTanks.size;
            
            if (networkPlayersCount > 0 || tanksCount > 0) {
                console.warn(`[Game] ⚠️ Отключение от сервера, но есть ${networkPlayersCount} networkPlayers и ${tanksCount} tanks. Очищаем, но НЕ сбрасываем isMultiplayer.`);
                logger.warn(`[Game] ⚠️ Отключение от сервера, но есть ${networkPlayersCount} networkPlayers и ${tanksCount} tanks. Очищаем, но НЕ сбрасываем isMultiplayer.`);
            } else {
                // Только если нет сетевых игроков, сбрасываем isMultiplayer
                this.deps.setIsMultiplayer(false);
            }
            
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
            
            // КРИТИЧНО: Создаём танк СРАЗУ, не через очередь с throttling
            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
            if (playerData.id !== localPlayerId) {
                if (this.deps.scene) {
                    // Сцена готова - создаём танк напрямую
                    let networkPlayer = mm.getNetworkPlayer(playerData.id);
                    if (!networkPlayer) {
                        (mm as any).addNetworkPlayer(playerData);
                        networkPlayer = mm.getNetworkPlayer(playerData.id);
                    }
                    if (networkPlayer && !this.deps.networkPlayerTanks.has(playerData.id)) {
                        this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                    }
                } else {
                    // Сцена не готова - добавляем в очередь
                    if (!this.pendingNetworkPlayers.find(p => p.id === playerData.id)) {
                        this.pendingNetworkPlayers.push(playerData);
                    }
                }
                
                // Показываем оповещение о новом игроке
                this.showPlayerNotification(`${playerData.name || 'Игрок'} присоединился!`, "#4ade80");
            }
            
            // Обновляем статус мультиплеера
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        mm.onPlayerLeft((playerId) => {
            logger.log(`[Game] Player left: ${playerId}`);
            const tank = this.deps.networkPlayerTanks.get(playerId);
            const playerName = tank ? (tank as any).playerName || 'Игрок' : 'Игрок';
            if (tank) {
                tank.dispose();
                this.deps.networkPlayerTanks.delete(playerId);
            }
            
            // Показываем оповещение об уходе игрока
            this.showPlayerNotification(`${playerName} покинул игру`, "#f87171");
            
            // Обновляем статус мультиплеера
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
            
            // КРИТИЧНО: Принудительно устанавливаем isMultiplayer в true, если есть другие игроки
            const otherPlayers = players.filter(p => p.id !== localPlayerId);
            if (otherPlayers.length > 0 && !this.deps.getIsMultiplayer()) {
                logger.warn(`[Game] ⚠️ isMultiplayer=false, but ${otherPlayers.length} other players exist! Setting isMultiplayer=true`);
                console.warn(`%c[Game] ⚠️ isMultiplayer=false, но есть ${otherPlayers.length} других игроков! Устанавливаем isMultiplayer=true`, 'color: #ef4444; font-weight: bold;');
                this.deps.setIsMultiplayer(true);
            }
            
            // ДИАГНОСТИКА: Логируем состояние мультиплеера для отладки
            const networkPlayersCount = this.deps.multiplayerManager?.getNetworkPlayers()?.size || 0;
            const tanksCount = this.deps.networkPlayerTanks.size;
            const sceneReady = !!this.deps.scene;
            const isMultiplayer = this.deps.getIsMultiplayer();
            
            logger.log(`[Game] onPlayerStates: ${players.length} players, ${otherPlayers.length} network, ${tanksCount} tanks`);
            
            // ВЕРИФИКАЦИЯ СИНХРОНИЗАЦИИ: Проверяем что все игроки синхронизированы
            // КРИТИЧНО: Используем реальное количество сетевых игроков из players (исключая локального)
            // otherPlayers уже объявлен выше
            const expectedTanksCount = otherPlayers.length; // Количество других игроков (не локальный)
            
            // Синхронизация OK если:
            // 1. Количество танков = количество других игроков
            // 2. Количество networkPlayers = количество других игроков
            // 3. Все другие игроки имеют танки
            const syncOk = tanksCount === expectedTanksCount && 
                          networkPlayersCount === expectedTanksCount &&
                          otherPlayers.every(p => this.deps.networkPlayerTanks.has(p.id));
            
            // УЛУЧШЕННАЯ ДИАГНОСТИКА: Логируем детальную информацию о синхронизации
            if (!syncOk || this.pendingNetworkPlayers.length > 0) {
                const syncDetails = {
                    players: players.length,
                    localPlayer: localPlayerId,
                    otherPlayers: otherPlayers.length,
                    otherPlayerIds: otherPlayers.map(p => p.id),
                    networkPlayers: networkPlayersCount,
                    tanks: tanksCount,
                    expected: expectedTanksCount,
                    syncOk: syncOk,
                    pending: this.pendingNetworkPlayers.length,
                    scene: sceneReady,
                    isMultiplayer: isMultiplayer
                };
                
                logger.log(`[Game] SYNC CHECK: syncOk=${syncOk}, tanks=${tanksCount}, expected=${expectedTanksCount}`);
                
                // Дополнительная диагностика: проверяем какие игроки есть
                if (otherPlayers.length > 0) {
                    logger.log(`[Game] 🔍 Other players: ${otherPlayers.map(p => `${p.name}(${p.id}, status=${p.status || 'undefined'})`).join(', ')}`);
                }
                
                // КРИТИЧНО: Диагностика networkPlayers - кто там есть?
                if (networkPlayersCount > 0) {
                    const networkPlayerIds: string[] = [];
                    this.deps.multiplayerManager?.getNetworkPlayers().forEach((np, id) => {
                        networkPlayerIds.push(`${np.name}(${id}, status=${np.status || 'undefined'})`);
                    });
                }
                
                // КРИТИЧНО: Диагностика tanks - какие танки созданы?
                if (tanksCount > 0) {
                    const tankIds: string[] = [];
                    this.deps.networkPlayerTanks.forEach((tank, id) => {
                        const np = this.deps.multiplayerManager?.getNetworkPlayer(id);
                        tankIds.push(`${np?.name || id}(${id})`);
                    });
                }
                
                // КРИТИЧНО: Если isMultiplayer=false, но есть другие игроки, устанавливаем его в true
                // Проверяем актуальное значение через сеттер, так как isMultiplayer передается по значению
                if (!isMultiplayer && players.length > 1 && networkPlayersCount > 0) {
                    logger.warn(`[Game] isMultiplayer=false but ${players.length} players exist, setting to true`);
                    this.deps.setIsMultiplayer(true);
                }
                
                // ВЕРИФИКАЦИЯ: Если синхронизация не OK, пытаемся исправить
                if (!syncOk && sceneReady) {
                    // Проверяем, есть ли лишние танки (танки ботов или дубликаты)
                    const extraTanks: string[] = [];
                    this.deps.networkPlayerTanks.forEach((tank, tankPlayerId) => {
                        if (tankPlayerId === localPlayerId) {
                            extraTanks.push(tankPlayerId);
                        } else {
                            const playerExists = otherPlayers.some(p => p.id === tankPlayerId);
                            if (!playerExists) {
                                extraTanks.push(tankPlayerId);
                            }
                        }
                    });
                    
                    // Удаляем лишние танки
                    if (extraTanks.length > 0) {
                        extraTanks.forEach(playerId => {
                            const tank = this.deps.networkPlayerTanks.get(playerId);
                            if (tank) {
                                tank.dispose();
                                this.deps.networkPlayerTanks.delete(playerId);
                            }
                        });
                    }
                    
                    // Проверяем, есть ли игроки без танков
                    const playersWithoutTanks = otherPlayers.filter(p => !this.deps.networkPlayerTanks.has(p.id));
                    
                    if (playersWithoutTanks.length > 0) {
                        if (this.deps.scene) {
                            for (const playerData of playersWithoutTanks) {
                                if (!playerData.status) playerData.status = "alive";
                                const networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                                if (networkPlayer) {
                                    this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                                } else {
                                    this.queueNetworkPlayerForCreation(playerData);
                                }
                            }
                            if (this.pendingNetworkPlayers.length > 0) {
                                this.processPendingNetworkPlayers();
                            }
                        } else {
                            for (const playerData of playersWithoutTanks) {
                                if (!playerData.status) playerData.status = "alive";
                                this.queueNetworkPlayerForCreation(playerData);
                            }
                        }
                    }
                }
            }
            
            // Если сцена доступна и есть ожидающие игроки, обрабатываем их сначала
            if (this.deps.scene && this.pendingNetworkPlayers.length > 0) {
                logger.log(`[Game] Scene is now available, processing ${this.pendingNetworkPlayers.length} pending players from queue`);
                this.processPendingNetworkPlayers();
            }
            
            // КРИТИЧНО: Сначала убеждаемся, что все игроки добавлены в networkPlayers
            // Это важно, так как танки создаются из networkPlayers
            for (const playerData of players) {
                if (playerData.id === localPlayerId) continue;
                
                const networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                if (!networkPlayer) {
                    logger.warn(`[Game] ⚠️ Player ${playerData.id} (${playerData.name || 'Unknown'}) not in networkPlayers! Adding...`);
                    console.warn(`%c[Game] ⚠️ Игрок ${playerData.name || playerData.id} не в networkPlayers! Добавляю...`, 'color: #ef4444;');
                    // Принудительно добавляем игрока в networkPlayers
                    (this.deps.multiplayerManager as any).addNetworkPlayer(playerData);
                }
            }
            
            // Используем унифицированную функцию для всех игроков
            let tanksUpdated = 0;
            let tanksCreated = 0;
            let tanksSkipped = 0;
            
            for (const playerData of players) {
                // Пропускаем локального игрока
                if (playerData.id === localPlayerId) {
                    tanksSkipped++;
                    continue;
                }
                
                // КРИТИЧНО: Обновляем время последнего сетевого обновления для существующих танков
                // Это необходимо для корректной работы интерполяции и экстраполяции
                const existingTank = this.deps.networkPlayerTanks.get(playerData.id);
                if (existingTank) {
                    // Танк уже существует - обновляем timestamp для интерполяции
                    existingTank.markNetworkUpdate();
                    tanksUpdated++;
                } else {
                    // Танк не существует - создаем через очередь
                    this.queueNetworkPlayerForCreation(playerData);
                    tanksCreated++;
                }
            }
            
            
            // КРИТИЧНО: Если танки были созданы, но Scene готова, обрабатываем сразу
            if (tanksCreated > 0 && this.deps.scene) {
                logger.log(`[Game] 🔧 ${tanksCreated} tanks were queued, processing immediately since scene is ready`);
                this.processPendingNetworkPlayers();
            }
            
            // КРИТИЧНО: Принудительная проверка - если есть networkPlayers без танков, создаем их
            const networkPlayers = this.deps.multiplayerManager?.getNetworkPlayers();
            if (networkPlayers) {
                let missingTanks = 0;
                networkPlayers.forEach((np, playerId) => {
                    if (playerId !== localPlayerId && !this.deps.networkPlayerTanks.has(playerId)) {
                        missingTanks++;
                        
                        // Находим данные игрока из players или создаем из networkPlayer
                        const playerData = players.find(p => p.id === playerId);
                        if (playerData) {
                            this.queueNetworkPlayerForCreation(playerData);
                        } else {
                            // Создаем playerData из networkPlayer
                            const fallbackPlayerData = {
                                id: playerId,
                                name: np.name,
                                position: { x: np.position.x, y: np.position.y, z: np.position.z },
                                rotation: np.rotation,
                                turretRotation: np.turretRotation,
                                aimPitch: np.aimPitch,
                                health: np.health,
                                maxHealth: np.maxHealth,
                                status: np.status || "alive",
                                team: np.team
                            };
                            this.queueNetworkPlayerForCreation(fallbackPlayerData);
                        }
                    }
                });
                
                if (missingTanks > 0) {
                    logger.log(`[Game] 🔧 Created ${missingTanks} missing tanks for networkPlayers without tanks`);
                    // Если Scene готова, обрабатываем сразу
                    if (this.deps.scene) {
                        this.processPendingNetworkPlayers();
                    }
                }
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
            logger.log(`[Game] Room created: ${data.roomId}, mode: ${data.mode}`);
            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });
        
        // Обработка ROOM_JOINED - как для ожидающих комнат, так и для активных игр
        mm.onRoomJoined((data) => {
            logger.log(`[Game] Room joined: ${data.roomId}, isActive: ${data.isActive}, players: ${data.players?.length || 0}`);
            
            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
            
            // Если комната АКТИВНА (игра уже идёт)
            if (data.isActive && data.players && data.players.length > 0) {
                logger.log(`[Game] Joining ACTIVE room with ${data.players.length} players`);
                
                this.deps.setIsMultiplayer(true);
                
                // Обрабатываем всех игроков - добавляем в очередь
                for (const playerData of data.players) {
                    if (playerData.id !== localPlayerId) {
                        if (!playerData.status) {
                            playerData.status = "alive";
                        }
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                }
                
                // Скрываем меню и запускаем игру
                if (this.deps.mainMenu) {
                    logger.log("[Game] Hiding menu for joining active game");
                    try {
                        this.deps.mainMenu.hide();
                    } catch (error) {
                        logger.error("[Game] Error hiding menu:", error);
                    }
                }
                
                // Запускаем игру если есть callback
                if (this.deps.startGame) {
                    // ЗАЩИТА: Устанавливаем флаг, что игра запущена из onRoomJoined
                    // Это предотвратит повторный запуск из handleGameStart
                    this.gameStartedFromRoomJoined = true;
                    logger.log("[Game] Starting game for joining active room (gameStartedFromRoomJoined = true)");
                    setTimeout(async () => {
                        try {
                            const result = this.deps.startGame!();
                            if (result instanceof Promise) {
                                await result.catch(error => {
                                    logger.error("[Game] Error starting game for active room:", error);
                                });
                            }
                            
                            // После запуска игры обрабатываем ожидающих игроков (force=true для надёжности)
                            const tryProcessPending = (attempt: number, maxAttempts: number = 5) => {
                                if (this.deps.scene && this.pendingNetworkPlayers.length > 0) {
                                    this.processPendingNetworkPlayers(true);
                                } else if (this.pendingNetworkPlayers.length > 0 && attempt < maxAttempts) {
                                    setTimeout(() => tryProcessPending(attempt + 1, maxAttempts), 500 * attempt);
                                }
                            };
                            
                            setTimeout(() => tryProcessPending(1), 500);
                        } catch (error) {
                            logger.error("[Game] Error starting game for active room:", error);
                        }
                    }, 100);
                }
            } else if (!data.isActive && data.players && data.players.length > 0) {
                // Комната ещё не активна - просто добавляем игроков в очередь (GAME_START придёт позже)
                logger.log(`[Game] 🔄 FALLBACK: Processing ${data.players.length} players from ROOM_JOINED (game not active yet)`);
                
                for (const playerData of data.players) {
                    if (playerData.id !== localPlayerId) {
                        if (!playerData.status) {
                            playerData.status = "alive";
                        }
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                }
                
                logger.log(`[Game] 🔄 FALLBACK: Queued ${this.pendingNetworkPlayers.length} players from ROOM_JOINED`);
            }
            
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
        
        // Setup reconciliation callback for client-side prediction
        mm.onReconciliation((data) => {
            this.handleReconciliation(data);
        });
    }
    
    /**
     * Handle server reconciliation for client-side prediction
     * When server state differs significantly from predicted state, we need to correct
     */
    private handleReconciliation(data: {
        serverState?: PlayerData;
        predictedState?: PredictedState;
        unconfirmedStates?: PredictedState[];
        positionDiff?: number;
        rotationDiff?: number;
        needsReapplication?: boolean;
    }): void {
        const tank = this.deps.tank;
        if (!tank || !tank.chassis || !data.serverState) return;
        
        const HARD_CORRECTION_THRESHOLD = 2.0; // Instant teleport if > 2 units difference
        const SOFT_CORRECTION_THRESHOLD = 0.5; // Smooth interpolation if > 0.5 units
        
        const posDiff = data.positionDiff || 0;
        const serverPos = data.serverState.position;
        const serverRot = data.serverState.rotation || 0;
        
        if (posDiff > HARD_CORRECTION_THRESHOLD) {
            // Hard correction - teleport to server position
            logger.log(`[Reconciliation] Hard correction: diff=${posDiff.toFixed(2)} - teleporting to server position`);
            tank.chassis.position.copyFrom(serverPos);
            tank.chassis.rotation.y = serverRot;
            
            // Clear physics velocity to prevent drift after teleport
            if (tank.physicsBody) {
                try {
                    // Note: Setting velocity depends on physics engine implementation
                    // This is a simplified approach
                    if ('velocity' in tank) {
                        (tank as any).velocity = new Vector3(0, 0, 0);
                    }
                } catch (e) {
                    // Ignore if velocity setting fails
                }
            }
        } else if (data.needsReapplication && posDiff > SOFT_CORRECTION_THRESHOLD) {
            // Soft correction - smoothly interpolate towards server position
            logger.log(`[Reconciliation] Soft correction: diff=${posDiff.toFixed(2)} - interpolating to server position`);
            
            // Start from server position and re-apply unconfirmed inputs
            const correctedPosition = serverPos.clone();
            
            // Re-apply unconfirmed inputs on top of server state
            if (data.unconfirmedStates && data.unconfirmedStates.length > 0) {
                // For now, we just interpolate to server position
                // A more advanced implementation would simulate physics for each unconfirmed input
                // But this requires duplicating physics simulation which is complex
                logger.log(`[Reconciliation] ${data.unconfirmedStates.length} unconfirmed inputs to re-apply`);
            }
            
            // Smooth interpolation towards corrected position
            const LERP_SPEED = 0.3;
            Vector3.LerpToRef(
                tank.chassis.position,
                correctedPosition,
                LERP_SPEED,
                tank.chassis.position
            );
            
            // Smoothly interpolate rotation
            let currentRot = tank.chassis.rotation.y;
            let targetRot = serverRot;
            // Normalize angle difference
            while (targetRot - currentRot > Math.PI) targetRot -= Math.PI * 2;
            while (targetRot - currentRot < -Math.PI) targetRot += Math.PI * 2;
            tank.chassis.rotation.y = currentRot + (targetRot - currentRot) * LERP_SPEED;
        }
        // If difference is small, do nothing - prediction was accurate
    }
    
    private handleGameStart(data: any): void {
        // ДИАГНОСТИКА: Логируем состояние игры перед запуском
        const mm = this.deps.multiplayerManager;
        const roomId = data.roomId || mm?.getRoomId();
        const playerId = mm?.getPlayerId();
        const gameMode = data.mode || mm?.getGameMode();
        const worldSeed = data.worldSeed;
        const playersCount = data.players?.length || 0;
        const isActive = data.isActive !== undefined ? data.isActive : true; // По умолчанию true для GAME_START
        
        logger.log(`[Game] GAME_START: roomId=${roomId}, mode=${gameMode}, players=${playersCount}`);
        
        // Устанавливаем isMultiplayer
        this.deps.setIsMultiplayer(true);
        
        if (!mm) {
            logger.error("[Game] ❌ MultiplayerManager not available in handleGameStart!");
            return;
        }
        
        const serverUrl = mm.getServerUrl() || "ws://localhost:8080";
        
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
            
            // ДИАГНОСТИКА: Логируем данные о каждом игроке
            data.players.forEach((p: any) => {
                logger.log(`[Game] 🔍 Player data: id=${p.id}, name=${p.name}, status=${p.status || 'undefined'}, position=(${p.position?.x?.toFixed(2)}, ${p.position?.y?.toFixed(2)}, ${p.position?.z?.toFixed(2)})`);
            });
            
            // Очищаем предыдущую очередь
            this.pendingNetworkPlayers = [];
            
            for (const playerData of data.players) {
                if (playerData.id !== localPlayerId) {
                    // КРИТИЧНО: Убеждаемся, что статус установлен как "alive" если не указан
                    if (!playerData.status) {
                        playerData.status = "alive";
                        logger.log(`[Game] ⚠️ Player ${playerData.id} has no status, setting to "alive"`);
                    }
                    
                    logger.log(`[Game] Queueing network tank for player ${playerData.id} (${playerData.name}) at position (${playerData.position?.x?.toFixed(2)}, ${playerData.position?.y?.toFixed(2)}, ${playerData.position?.z?.toFixed(2)}), status=${playerData.status}`);
                    // Используем унифицированную функцию для добавления/создания
                    this.queueNetworkPlayerForCreation(playerData);
                } else {
                    logger.log(`[Game] Skipping local player ${localPlayerId}`);
                }
            }
        } else {
            logger.warn(`[Game] ⚠️ No players data in GAME_START or multiplayerManager not available`);
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
        
        // ЗАЩИТА: Проверяем, не была ли игра уже запущена из onRoomJoined
        if (this.gameStartedFromRoomJoined) {
            this.gameStartedFromRoomJoined = false;
            
            // Обрабатываем ожидающих игроков если есть (force=true для надёжности)
            if (this.pendingNetworkPlayers.length > 0 && this.deps.scene) {
                setTimeout(() => this.processPendingNetworkPlayers(true), 100);
            }
            return;
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
                    
                    // КРИТИЧНО: После запуска игры проверяем и создаем танки для ожидающих игроков
                    // Используем несколько попыток с увеличивающейся задержкой, чтобы Scene успела инициализироваться
                    // force=true чтобы гарантированно создать танки без throttling
                    const tryProcessPending = (attempt: number, maxAttempts: number = 5) => {
                        if (this.deps.scene && this.pendingNetworkPlayers.length > 0) {
                            logger.log(`[Game] 🔄 Processing ${this.pendingNetworkPlayers.length} pending players after game start (attempt ${attempt})`);
                            this.processPendingNetworkPlayers(true);
                        } else if (this.pendingNetworkPlayers.length > 0 && attempt < maxAttempts) {
                            logger.warn(`[Game] ⚠️ Scene not available after game start (attempt ${attempt}/${maxAttempts}), ${this.pendingNetworkPlayers.length} players still pending, retrying...`);
                            setTimeout(() => tryProcessPending(attempt + 1, maxAttempts), 500 * attempt);
                        } else if (this.pendingNetworkPlayers.length > 0) {
                            logger.error(`[Game] ❌ Scene not available after ${maxAttempts} attempts, ${this.pendingNetworkPlayers.length} players still pending!`);
                            console.error(`%c[Game] ❌ Scene не доступна после ${maxAttempts} попыток!`, 'color: #ef4444; font-weight: bold;');
                        }
                    };
                    
                    // Первая попытка через 500ms, затем повторные попытки
                    setTimeout(() => tryProcessPending(1), 500);
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
            if (data.enemies && this.deps.getIsMultiplayer()) {
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
     * @param force - если true, пропускает throttling (для критических вызовов)
     */
    processPendingNetworkPlayers(force: boolean = false): void {
        // Throttling: Skip if called too frequently (unless forced)
        const now = Date.now();
        if (!force && now - this.lastProcessPendingTime < this.PROCESS_PENDING_COOLDOWN) {
            return;
        }
        this.lastProcessPendingTime = now;
        
        if (!this.deps.scene) {
            // Retry if scene not ready
            if (this.pendingNetworkPlayers.length > 0) {
                setTimeout(() => {
                    if (this.deps.scene) {
                        this.processPendingNetworkPlayers();
                    }
                }, 500);
            }
            return;
        }
        
        // Add networkPlayers without tanks to queue
        const networkPlayersCount = this.deps.multiplayerManager?.getNetworkPlayers()?.size || 0;
        const tanksCount = this.deps.networkPlayerTanks.size;
        
        if (this.pendingNetworkPlayers.length === 0 && networkPlayersCount > tanksCount) {
            this.deps.multiplayerManager?.getNetworkPlayers().forEach((np, id) => {
                if (!this.deps.networkPlayerTanks.has(id)) {
                    this.pendingNetworkPlayers.push({
                        id: np.id,
                        name: np.name,
                        position: np.position,
                        rotation: np.rotation,
                        turretRotation: np.turretRotation,
                        status: np.status || "alive"
                    });
                }
            });
        }
        
        // Process pending players
        if (this.pendingNetworkPlayers.length > 0) {
            const playersToCreate = [...this.pendingNetworkPlayers];
            this.pendingNetworkPlayers = [];
            
            for (const playerData of playersToCreate) {
                let networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                if (!networkPlayer) {
                    (this.deps.multiplayerManager as any).addNetworkPlayer(playerData);
                    networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                }
                
                if (networkPlayer) {
                    try {
                        this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                    } catch (error) {
                        logger.error(`[Game] Error creating tank for ${playerData.id}:`, error);
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                } else {
                    this.queueNetworkPlayerForCreation(playerData);
                }
            }
            
            // Ensure all tanks are in scene and visible
            this.deps.networkPlayerTanks.forEach((tank, playerId) => {
                if (tank && tank.chassis && this.deps.scene) {
                    const tankInScene = this.deps.scene.meshes.includes(tank.chassis);
                    const tankVisible = tank.chassis.isVisible && tank.chassis.isEnabled();
                    
                    if (!tankInScene) {
                        this.deps.scene.addMesh(tank.chassis);
                    }
                    if (!tankVisible) {
                        tank.chassis.isVisible = true;
                        tank.chassis.setEnabled(true);
                    }
                }
            });
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
            logger.log(`[Game] queueNetworkPlayerForCreation: Skipping local player ${playerData.id}`);
            return;
        }

        // Проверка 1: Танк уже создан?
        if (this.deps.networkPlayerTanks.has(playerData.id)) {
            // Танк уже существует - это нормальная ситуация, не логируем
            logger.log(`[Game] queueNetworkPlayerForCreation: Tank already exists for ${playerData.id} (${playerData.name || 'Unknown'})`);
            return;
        }

        // Проверка 2: Игрок уже в очереди?
        if (this.pendingNetworkPlayers.find(p => p.id === playerData.id)) {
            // Игрок уже в очереди - это нормальная ситуация, не логируем
            // (избегаем спама в консоль при каждом onPlayerStates)
            logger.log(`[Game] queueNetworkPlayerForCreation: Player ${playerData.id} already in queue`);
            return;
        }
        
        // ДИАГНОСТИКА: Логируем начало процесса создания
        logger.log(`[Game] queueNetworkPlayerForCreation: Starting for ${playerData.id} (${playerData.name || 'Unknown'}), position=(${playerData.position?.x?.toFixed(1) || 'N/A'}, ${playerData.position?.y?.toFixed(1) || 'N/A'}, ${playerData.position?.z?.toFixed(1) || 'N/A'}), status=${playerData.status || 'undefined'}`);

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

        // Scene ready? Create tank now, else queue
        if (this.deps.scene) {
            this.createNetworkPlayerTankInternal(playerData, networkPlayer);
        } else {
            this.pendingNetworkPlayers.push(playerData);
        }
    }

    /**
     * Внутренняя функция создания танка (без проверок на дубликаты)
     */
    private createNetworkPlayerTankInternal(playerData: any, networkPlayer: any): void {
        // Skip if tank already exists
        if (this.deps.networkPlayerTanks.has(playerData.id)) {
            return;
        }
        
        if (!this.deps.scene) {
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
                    logger.error(`[Game] ❌ Tank chassis NOT in scene meshes! Adding manually...`);
                    this.deps.scene.addMesh(tank.chassis);
                    // Также добавляем дочерние меши
                    if (tank.turret && !this.deps.scene.meshes.includes(tank.turret)) {
                        this.deps.scene.addMesh(tank.turret);
                    }
                    if (tank.barrel && !this.deps.scene.meshes.includes(tank.barrel)) {
                        this.deps.scene.addMesh(tank.barrel);
                    }
                    logger.log(`[Game] ✅ Manually added tank meshes to scene`);
                }
            }
            
            // ДИАГНОСТИКА: Проверяем финальное состояние
            const finalInScene = tank.chassis && this.deps.scene && this.deps.scene.meshes.includes(tank.chassis);
            const finalVisible = tank.chassis && tank.chassis.isVisible;
            const finalEnabled = tank.chassis?.isEnabled();
            const finalStatus = networkPlayer.status;
            
            logger.log(`[Game] ✅ Network player tank created for ${playerData.id} (${playerData.name || 'Unknown'}) at (${networkPlayer.position.x.toFixed(2)}, ${networkPlayer.position.y.toFixed(2)}, ${networkPlayer.position.z.toFixed(2)})`);
            logger.log(`[Game] 🔍 Final state: inScene=${finalInScene}, visible=${finalVisible}, enabled=${finalEnabled}, status=${finalStatus}`);
            
            // КРИТИЧНО: Принудительно проверяем и исправляем видимость
            if (tank.chassis) {
                if (!finalInScene) {
                    console.error(`[Game] ❌ Tank ${playerData.id} NOT in scene! Adding...`);
                    this.deps.scene.addMesh(tank.chassis);
                }
                if (!finalVisible) {
                    console.error(`[Game] ❌ Tank ${playerData.id} NOT visible! Fixing...`);
                    tank.chassis.isVisible = true;
                }
                if (!finalEnabled) {
                    console.error(`[Game] ❌ Tank ${playerData.id} NOT enabled! Fixing...`);
                    tank.chassis.setEnabled(true);
                }
                if (finalStatus !== "alive") {
                    console.warn(`[Game] ⚠️ Tank ${playerData.id} status is "${finalStatus}", not "alive"!`);
                }
            }
            
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
     * Показать оповещение о действии игрока (присоединился/покинул)
     */
    private showPlayerNotification(message: string, color: string = "#ffffff"): void {
        // Используем HUD если доступен
        if (this.deps.hud && typeof this.deps.hud.showMessage === "function") {
            this.deps.hud.showMessage(message, color, 3000);
            return;
        }
        
        // Fallback: создаём временный DOM элемент
        const notification = document.createElement("div");
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: ${color};
            padding: 12px 24px;
            border-radius: 8px;
            font-family: 'Rajdhani', sans-serif;
            font-size: 16px;
            font-weight: 600;
            z-index: 10000;
            pointer-events: none;
            animation: slideDown 0.3s ease-out;
            border: 1px solid ${color}40;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        `;
        notification.textContent = message;
        
        // Добавляем стили анимации если ещё не добавлены
        if (!document.getElementById("player-notification-styles")) {
            const style = document.createElement("style");
            style.id = "player-notification-styles";
            style.textContent = `
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes fadeOut {
                    from { opacity: 1; }
                    to { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        // Удаляем через 3 секунды
        setTimeout(() => {
            notification.style.animation = "fadeOut 0.3s ease-out forwards";
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    /**
     * Очистка
     */
    dispose(): void {
        // Cleanup if needed
    }
}

