/**
 * GameMultiplayerCallbacks - Обработчики мультиплеерных событий
 * Вынесено из game.ts для уменьшения размера файла
 */

import { Vector3, MeshBuilder, StandardMaterial, Color3, PhysicsMotionType, LinesMesh, Mesh, Quaternion } from "@babylonjs/core";
import { logger } from "../utils/logger";
import { ServerMessageType } from "../../shared/messages";
import { CONSUMABLE_TYPES } from "../consumables";
import { RealtimeStatsTracker } from "../realtimeStats";
import { NetworkPlayerTank } from "../networkPlayerTank";
import { SyncMetrics } from "../syncMetrics";
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
    setMapType?: (mapType: string) => void; // New dependency for map sync
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
    private readonly PROCESS_PENDING_COOLDOWN = 100; // ms cooldown (reduced from 500ms for faster tank creation)

    // Метрики синхронизации
    private syncMetrics: SyncMetrics = new SyncMetrics();

    // Визуализация расхождений
    private reconciliationLines: LinesMesh[] = [];
    private readonly MAX_RECONCILIATION_LINES = 10; // Максимум линий для визуализации
    private showReconciliationVisualization: boolean = false; // Флаг включения визуализации

    // Защита от частых hard corrections и циклов
    private lastHardCorrectionTime: number = 0;
    private readonly HARD_CORRECTION_COOLDOWN = 1000; // 1000ms - минимальное время между hard corrections для устранения дёрганья
    private _isReconciling: boolean = false; // Флаг для предотвращения повторных reconciliation во время текущей коррекции
    private lastReconciliationIgnoreTime: number = 0; // Время последней hard correction для временного игнорирования маленьких расхождений
    private readonly RECONCILIATION_IGNORE_DURATION = 500; // 500ms - время игнорирования расхождений после hard correction для устранения дёрганья
    private reconciliationCount: number = 0; // Счётчик reconciliation для обработки первых нескольких при присоединении
    private readonly INITIAL_RECONCILIATION_COUNT = 3; // Первые 3 reconciliation при присоединении обрабатываем без проверки predictedState

    constructor() {
        this.deps = {
            networkPlayerTanks: new Map(), // Временный Map, будет заменен через updateDependencies
            getIsMultiplayer: () => false, // Геттер по умолчанию
            setIsMultiplayer: () => { },
            setBattleRoyaleVisualizer: () => { },
            setCTFVisualizer: () => { },
            setRealtimeStatsTracker: () => { },
            setReplayRecorder: () => { }
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
            // ПРИМЕЧАНИЕ: menu.ts также регистрирует свой callback, поэтому здесь только обновляем через updateRoomList
            if (this.deps.mainMenu) {
                mm.onRoomList((rooms: any[]) => {
                    // Throttling: логируем только раз в 2 секунды
                    const now = Date.now();
                    const lastLogTime = (this as any)._lastRoomListLogTime || 0;
                    if (now - lastLogTime > 2000) {
                        console.log(`[GameMultiplayerCallbacks] 📋 Получен список комнат через callback: ${rooms.length} комнат`);
                        (this as any)._lastRoomListLogTime = now;
                    }
                    if (this.deps.mainMenu && typeof this.deps.mainMenu.updateRoomList === "function") {
                        this.deps.mainMenu.updateRoomList(rooms);
                    }
                });
                console.log(`[GameMultiplayerCallbacks] ✅ Callback для списка комнат настроен`);

                // Настраиваем callback для списка игроков
                mm.onOnlinePlayersList((data: any) => {
                    logger.log(`[GameMultiplayerCallbacks] 👥 Получен список игроков через callback: ${data.players?.length || 0} игроков`);
                    if (this.deps.mainMenu && typeof this.deps.mainMenu.updateLobbyPlayers === "function") {
                        this.deps.mainMenu.updateLobbyPlayers(data.players || []);
                    }
                });
                logger.log(`[GameMultiplayerCallbacks] ✅ Callback для списка игроков настроен`);
            } else {
                console.warn(`[GameMultiplayerCallbacks] ⚠️ mainMenu не доступен для настройки callback`);
            }

            if (this.deps.mainMenu && typeof this.deps.mainMenu.updateMultiplayerStatus === "function") {
                this.deps.mainMenu.updateMultiplayerStatus();
            }
        });

        mm.onDisconnected(() => {
            logger.log("[Game] Disconnected from multiplayer server");

            // КРИТИЧНО: НЕ удаляем танки при отключении!
            // Танки удаляются только при явном событии onPlayerLeft.
            // Это предотвращает цикл удаления/создания танков при временных проблемах с соединением.

            const networkPlayersCount = mm.getNetworkPlayers()?.size || 0;
            const tanksCount = this.deps.networkPlayerTanks.size;

            if (networkPlayersCount > 0 || tanksCount > 0) {
                console.warn(`[Game] ⚠️ Отключение от сервера. ${networkPlayersCount} networkPlayers, ${tanksCount} tanks. Танки НЕ удаляются - ждём reconnect или onPlayerLeft.`);
                logger.warn(`[Game] ⚠️ Отключение от сервера. ${networkPlayersCount} networkPlayers, ${tanksCount} tanks. Танки НЕ удаляются.`);
                // НЕ сбрасываем isMultiplayer - пусть автореконнект сработает
            } else {
                // Только если нет сетевых игроков и танков, сбрасываем isMultiplayer
                this.deps.setIsMultiplayer(false);
            }

            this.deps.hud?.showMultiplayerHUD?.(false);

            // УДАЛЕНО: НЕ удаляем танки при отключении - они удаляются в onPlayerLeft
            // this.deps.networkPlayerTanks.forEach(tank => tank.dispose());
            // this.deps.networkPlayerTanks.clear();

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
                return;
            }

            // Принудительно устанавливаем isMultiplayer в true, если есть другие игроки
            const otherPlayers = players.filter(p => p.id !== localPlayerId);
            if (otherPlayers.length > 0 && !this.deps.getIsMultiplayer()) {
                this.deps.setIsMultiplayer(true);
            }

            // ДИАГНОСТИКА: Логируем состояние мультиплеера для отладки
            const networkPlayersCount = this.deps.multiplayerManager?.getNetworkPlayers()?.size || 0;
            const tanksCount = this.deps.networkPlayerTanks.size;
            const sceneReady = !!this.deps.scene;
            const isMultiplayer = this.deps.getIsMultiplayer();
            const roomId = this.deps.multiplayerManager?.getRoomId();

            // Убрано для уменьшения спама в логах (оставлены только предупреждения)
            // console.log(`[Game] 📡 PLAYER_STATES получены: всего игроков=${players.length}, других игроков=${otherPlayers.length}, комната=${roomId}`);
            if (otherPlayers.length > 0) {
                // console.log(`[Game] 📡 Другие игроки в PLAYER_STATES:`, otherPlayers.map(p => `${p.name || p.id}(${p.id})`).join(', '));
            } else {
                // Оставляем предупреждения только при реальных проблемах (можно раскомментировать при необходимости)
                // console.warn(`%c[Game] ⚠️ PLAYER_STATES: НЕТ других игроков! Возможно, игроки в разных комнатах или сервер не отправляет данные.`, 'color: #ff6600; font-weight: bold; font-size: 14px;');
                // console.warn(`[Game] 📊 Состояние: roomId=${roomId}, localPlayerId=${localPlayerId}, players.length=${players.length}`);
            }


            // Проверяем синхронизацию танков
            const expectedTanksCount = otherPlayers.length;
            const syncOk = tanksCount === expectedTanksCount &&
                otherPlayers.every(p => this.deps.networkPlayerTanks.has(p.id));

            // Если isMultiplayer=false, но есть игроки - исправляем
            if (!isMultiplayer && players.length > 1 && networkPlayersCount > 0) {
                this.deps.setIsMultiplayer(true);
            }

            // Если синхронизация не OK - исправляем
            if (!syncOk && sceneReady) {
                // ИСПРАВЛЕНО: Используем networkPlayers из MultiplayerManager для проверки orphan,
                // а не players из callback - они могут иметь разные форматы ID
                const networkPlayersMap = this.deps.multiplayerManager?.getNetworkPlayers();

                // Удаляем только танки локального игрока (не должно быть)
                // НЕ удаляем "orphan" танки - они могут быть валидными, просто ID не совпадает
                this.deps.networkPlayerTanks.forEach((tank, tankPlayerId) => {
                    // Проверка на локального игрока - только точное сравнение
                    const isLocalTank = localPlayerId && tankPlayerId === localPlayerId;

                    // КРИТИЧНО: Проверяем orphan по networkPlayers, а не по players из callback
                    const existsInNetworkPlayers = networkPlayersMap?.has(tankPlayerId) || false;
                    const isOrphanTank = !existsInNetworkPlayers && !otherPlayers.some(p => p.id === tankPlayerId);

                    // Удаляем только танки локального игрока, orphan танки НЕ удаляем автоматически
                    // (они будут удалены когда игрок реально покинет комнату)
                    if (isLocalTank) {
                        console.warn(`[Game] 🗑️ Removing local player tank: ${tankPlayerId}`);
                        tank.dispose();
                        this.deps.networkPlayerTanks.delete(tankPlayerId);
                    }
                });

                // Создаём недостающие танки
                const playersWithoutTanks = otherPlayers.filter(p => !this.deps.networkPlayerTanks.has(p.id));
                if (playersWithoutTanks.length > 0) {
                    console.log(`[Game] 🔨 [PLAYER_STATES] Создаем ${playersWithoutTanks.length} недостающих танков:`, playersWithoutTanks.map(p => p.name || p.id).join(', '));
                }
                for (const playerData of playersWithoutTanks) {
                    if (!playerData.status) playerData.status = "alive";
                    const networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                    if (networkPlayer) {
                        console.log(`[Game] 🔨 [PLAYER_STATES] Создаем танк для ${playerData.name || playerData.id} (${playerData.id}) через createNetworkPlayerTankInternal`);
                        this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                    } else {
                        console.warn(`[Game] ⚠️ [PLAYER_STATES] networkPlayer не найден для ${playerData.id}, добавляем в очередь`);
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                }
            }

            // Обрабатываем ожидающих игроков
            if (this.deps.scene && this.pendingNetworkPlayers.length > 0) {
                this.processPendingNetworkPlayers();
            }

            // Убеждаемся, что все игроки добавлены в networkPlayers
            for (const playerData of players) {
                // Пропускаем локального игрока - только точное сравнение
                if (localPlayerId && playerData.id === localPlayerId) continue;

                const networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                if (!networkPlayer) {
                    (this.deps.multiplayerManager as any).addNetworkPlayer(playerData);
                }
            }

            // Используем унифицированную функцию для всех игроков
            let tanksUpdated = 0;
            let tanksCreated = 0;
            let tanksSkipped = 0;

            for (const playerData of players) {
                // Пропускаем локального игрока - только точное сравнение
                if (localPlayerId && playerData.id === localPlayerId) {
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
                this.processPendingNetworkPlayers();
            }

            // КРИТИЧНО: Принудительная проверка - если есть networkPlayers без танков, создаем их
            const networkPlayers = this.deps.multiplayerManager?.getNetworkPlayers();
            if (networkPlayers) {
                let missingTanks = 0;
                networkPlayers.forEach((np, playerId) => {
                    // Пропускаем локального игрока - только точное сравнение
                    if (playerId !== localPlayerId && !this.deps.networkPlayerTanks.has(playerId)) {
                        missingTanks++;

                        // КРИТИЧНО: Если Scene готова, создаем танк СРАЗУ, не через очередь
                        if (this.deps.scene && np) {
                            // Логирование уменьшено - избегаем спама
                            try {
                                this.createNetworkPlayerTankInternal({
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
                                }, np);
                            } catch (error) {
                                console.error(`[Game] ❌ Ошибка принудительного создания танка для ${playerId}:`, error);
                                // Fallback: добавляем в очередь
                                const playerData = players.find(p => p.id === playerId);
                                if (playerData) {
                                    this.queueNetworkPlayerForCreation(playerData);
                                } else {
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
                        } else {
                            // Scene не готова - добавляем в очередь
                            const playerData = players.find(p => p.id === playerId);
                            if (playerData) {
                                this.queueNetworkPlayerForCreation(playerData);
                            } else {
                                const fallbackPlayerData = {
                                    id: playerId,
                                    name: np.name,
                                    position: { x: np.position.x, y: np.position.y, z: np.position.z },
                                    rotation: np.rotation || 0,
                                    turretRotation: np.turretRotation ?? 0,
                                    aimPitch: np.aimPitch ?? 0,
                                    health: np.health || 100,
                                    maxHealth: np.maxHealth || 100,
                                    status: np.status || "alive",
                                    team: np.team
                                };
                                this.queueNetworkPlayerForCreation(fallbackPlayerData);
                            }
                        }
                    }
                });

                if (missingTanks > 0 && this.deps.scene) {
                    // Дополнительная проверка через processPendingNetworkPlayers
                    setTimeout(() => this.processPendingNetworkPlayers(true), 100);
                }
            }
        });

        // Обработка смерти игрока
        mm.onPlayerDied((data) => {
            logger.log(`[Game] Player died: ${data.playerName} (${data.playerId})`);

            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();

            // Если умер локальный игрок
            if (data.playerId === localPlayerId) {
                logger.log("[Game] Local player died, starting respawn countdown");

                // Получаем задержку респавна из мультиплеер менеджера
                const respawnDelay = this.deps.multiplayerManager?.getRespawnDelay() || 5;

                // Запускаем таймер обратного отсчета
                if (this.deps.tank) {
                    // Устанавливаем количество секунд до респавна
                    (this.deps.tank as any).respawnCountdown = respawnDelay;

                    // Запускаем таймер
                    this.deps.tank.startRespawnCountdown();

                    // Устанавливаем callback для отправки запроса на респавн
                    // КРИТИЧНО: Используем стрелочную функцию для сохранения контекста
                    const originalRespawn = this.deps.tank.respawn.bind(this.deps.tank);
                    this.deps.tank.respawn = () => {
                        logger.log("[Game] Respawn countdown complete, requesting respawn from server");

                        // Отправляем запрос на респавн на сервер
                        this.deps.multiplayerManager?.requestRespawn();

                        // НЕ вызываем оригинальный respawn - ждем ответа от сервера
                    };
                }
            } else {
                // Умер другой игрок - скрываем его танк
                const tank = this.deps.networkPlayerTanks.get(data.playerId);
                if (tank) {
                    tank.setDead();
                    logger.log(`[Game] Network player ${data.playerName} died - tank hidden`);
                }
            }

            // Показываем уведомление
            this.showPlayerNotification(`💀 ${data.playerName} погиб!`, "#ef4444");
        });

        // Обработка респавна игрока
        mm.onPlayerRespawned((data) => {
            logger.log(`[Game] Player respawned: ${data.playerName} (${data.playerId}) at (${data.position.x.toFixed(1)}, ${data.position.y.toFixed(1)}, ${data.position.z.toFixed(1)})`);

            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();

            // Если респавнился локальный игрок
            if (data.playerId === localPlayerId) {
                logger.log("[Game] Local player respawned, starting respawn animation");

                if (this.deps.tank) {
                    // КРИТИЧНО: Сначала вызываем respawn() для перезагрузки частей танка
                    // Это запустит анимацию сборки (2 секунды)
                    this.deps.tank.respawn();

                    // Затем через 2 секунды (после анимации) телепортируем на позицию от сервера
                    setTimeout(() => {
                        if (!this.deps.tank) return;

                        logger.log("[Game] Respawn animation complete, teleporting to server position");

                        // Телепортируем на позицию от сервера
                        if (this.deps.tank.chassis && data.position) {
                            const respawnPos = new Vector3(data.position.x, data.position.y, data.position.z);
                            this.deps.tank.chassis.position.copyFrom(respawnPos);

                            // Обновляем физику если есть
                            if (this.deps.tank.physicsBody) {
                                try {
                                    this.deps.tank.physicsBody.setTargetTransform(
                                        respawnPos,
                                        this.deps.tank.chassis.rotationQuaternion || Quaternion.Identity()
                                    );
                                } catch (error) {
                                    logger.error("[Game] Error setting physics transform:", error);
                                }
                            }
                        }

                        // Скрываем экран смерти после анимации
                        if (this.deps.hud && typeof (this.deps.hud as any).hideDeathScreen === 'function') {
                            (this.deps.hud as any).hideDeathScreen();
                        }
                    }, 2000); // 2 секунды на анимацию респавна
                }
            } else {
                // Респавнился другой игрок - показываем его танк
                const tank = this.deps.networkPlayerTanks.get(data.playerId);
                if (tank && data.position) {
                    const respawnPos = new Vector3(data.position.x, data.position.y, data.position.z);
                    tank.setAlive(respawnPos);

                    // Устанавливаем полное здоровье
                    if (data.health !== undefined) {
                        tank.setHealth(data.health, data.maxHealth || 100);
                    }

                    logger.log(`[Game] Network player ${data.playerName} respawned at (${data.position.x.toFixed(1)}, ${data.position.y.toFixed(1)}, ${data.position.z.toFixed(1)})`);
                }
            }

            // Показываем уведомление
            this.showPlayerNotification(`✨ ${data.playerName} возродился!`, "#22c55e");
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
            const localPlayerId = this.deps.multiplayerManager?.getPlayerId();

            // КРИТИЧНО: Создаём RealtimeStatsTracker сразу при входе в комнату
            // Это нужно для корректного отображения Tab scoreboard
            // ИСПРАВЛЕНО: Создаем даже если localPlayerId еще не получен (будет установлен позже)
            if (!this.deps.realtimeStatsTracker) {
                const tracker = new RealtimeStatsTracker();
                this.deps.setRealtimeStatsTracker(tracker);
                console.log(`[Game] ✅ RealtimeStatsTracker создан при входе в комнату`);

                // Если localPlayerId уже есть, запускаем матч сразу
                if (localPlayerId) {
                    tracker.startMatch(localPlayerId);
                    console.log(`[Game] ✅ RealtimeStatsTracker.startMatch вызван с localPlayerId=${localPlayerId}`);
                } else {
                    console.warn(`[Game] ⚠️ RealtimeStatsTracker создан, но localPlayerId еще не получен. startMatch будет вызван позже.`);
                }
            } else {
                // Если tracker уже существует, но матч не запущен - запускаем его
                // Проверяем isTracking через приватное свойство или просто проверяем наличие localPlayerId
                const tracker = this.deps.realtimeStatsTracker as any;
                if (localPlayerId && (!tracker.isTracking || !tracker.localPlayerId)) {
                    this.deps.realtimeStatsTracker.startMatch(localPlayerId);
                    console.log(`[Game] ✅ RealtimeStatsTracker.startMatch вызван (повторно) с localPlayerId=${localPlayerId}`);
                }
            }

            // КРИТИЧНО: Устанавливаем mapType ДО запуска игры
            // Это гарантирует, что правильная карта загрузится при инициализации
            if (data.mapType && this.deps.setMapType) {
                logger.log(`[Game] 🗺️ [onRoomJoined] Setting mapType to ${data.mapType} before game start`);
                this.deps.setMapType(data.mapType);
            } else if (data.mapType) {
                // Fallback: устанавливаем напрямую в gameInstance
                if ((window as any).gameInstance) {
                    (window as any).gameInstance.currentMapType = data.mapType;
                    logger.log(`[Game] 🗺️ [onRoomJoined] Set mapType via fallback to ${data.mapType}`);
                }
            }

            // ДИАГНОСТИКА: Логируем синхронизацию при присоединении к комнате
            const mm = this.deps.multiplayerManager;
            const roomId = data.roomId || mm?.getRoomId();
            const worldSeed = data.worldSeed || mm?.getWorldSeed();
            const mapType = data.mapType || mm?.getMapType();

            console.log(`%c[Game] 📥 [onRoomJoined] Синхронизация комнаты`, 'color: #3b82f6; font-weight: bold;', {
                roomId: roomId,
                worldSeed: worldSeed,
                mapType: mapType,
                isActive: data.isActive,
                playersCount: data.players?.length || 0
            });
            logger.log(`[Game] 📥 [onRoomJoined] roomId=${roomId}, worldSeed=${worldSeed}, mapType=${mapType}, isActive=${data.isActive}, players=${data.players?.length || 0}`);

            // КРИТИЧНО: Устанавливаем isMultiplayer = true при входе в комнату
            // Это нужно для корректного отображения мультиплеерного режима в TAB меню
            this.deps.setIsMultiplayer(true);
            const verifiedRoomId = this.deps.multiplayerManager?.getRoomId();
            console.log(`%c[Game] ✅ onRoomJoined: isMultiplayer установлен`, 'color: #22c55e; font-weight: bold;', {
                roomId: verifiedRoomId,
                dataRoomId: data.roomId,
                isMultiplayer: this.deps.getIsMultiplayer(),
                hasTracker: !!this.deps.realtimeStatsTracker,
                playersCount: data.players?.length || 0
            });

            // Если комната АКТИВНА (игра уже идёт)
            if (data.isActive && data.players && data.players.length > 0) {

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
                    try {
                        this.deps.mainMenu.hide();
                    } catch (error) { }
                }

                // Запускаем игру если есть callback
                if (this.deps.startGame) {
                    this.gameStartedFromRoomJoined = true;
                    setTimeout(async () => {
                        try {
                            const result = this.deps.startGame!();
                            if (result instanceof Promise) {
                                await result.catch(error => {
                                    logger.error("[Game] Error starting game for active room:", error);
                                });
                            }

                            // После запуска игры обрабатываем ожидающих игроков И ботов (force=true для надёжности)
                            const tryProcessPending = (attempt: number, maxAttempts: number = 5) => {
                                if (this.deps.scene && (this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0)) {
                                    logger.log(`[Game] 🔄 [onRoomJoined] Обрабатываем pending: игроков=${this.pendingNetworkPlayers.length}, ботов=${this.pendingEnemies.length}`);
                                    this.processPendingNetworkPlayers(true);
                                } else if ((this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0) && attempt < maxAttempts) {
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
                // Комната ещё не активна - добавляем игроков в очередь
                this.deps.setIsMultiplayer(true);
                for (const playerData of data.players) {
                    if (playerData.id !== localPlayerId) {
                        if (!playerData.status) playerData.status = "alive";
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                }
            } else if (data.roomId) {
                this.deps.setIsMultiplayer(true);
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

    // =========================================================================
    // НОВЫЙ ПОДХОД: СЕРВЕР = АВТОРИТЕТ (без client-side prediction)
    // =========================================================================
    // Клиент ВСЕГДА плавно интерполирует к серверной позиции.
    // Это полностью устраняет дёрганье!
    // =========================================================================

    // Целевая позиция от сервера для интерполяции локального игрока
    private _localPlayerServerTarget: Vector3 = new Vector3(0, 0, 0);
    private _localPlayerServerRotation: number = 0;
    private _localPlayerServerTurretRotation: number = 0;
    private _localPlayerServerAimPitch: number = 0;
    private _hasLocalPlayerServerTarget: boolean = false;
    private _isFirstServerUpdate: boolean = true;

    // Скорость интерполяции к серверу (настраиваемая)
    // 0.15 = достигаем цели примерно за 100ms при 60 FPS
    private readonly LOCAL_PLAYER_LERP_SPEED = 0.15;

    /**
     * ЛОКАЛЬНАЯ ФИЗИКА = АВТОРИТЕТ ДЛЯ ЛОКАЛЬНОГО ИГРОКА
     * 
     * КРИТИЧНО: НЕ корректируем позицию/вращение корпуса локального игрока!
     * Сервер использует простую симуляцию, клиент - Havok физику.
     * Они НИКОГДА не совпадут точно, и любая коррекция создаёт дёрганье.
     * 
     * Локальная Havok физика полностью управляет танком.
     * Сервер нужен только для синхронизации позиции С ДРУГИМИ игроками.
     */
    updateLocalPlayerToServer(deltaTime: number): void {
        const tank = this.deps.tank;
        if (!tank || !tank.chassis || !tank.physicsBody || !this._hasLocalPlayerServerTarget) return;

        // =========================================================================
        // ТОЛЬКО НАЧАЛЬНАЯ ТЕЛЕПОРТАЦИЯ ПРИ СПАВНЕ
        // =========================================================================
        if (this._isFirstServerUpdate) {
            this._isFirstServerUpdate = false;
            const body = tank.physicsBody;
            const chassis = tank.chassis;
            const targetPos = this._localPlayerServerTarget;

            try {
                body.setMotionType(PhysicsMotionType.ANIMATED);
                chassis.position.set(targetPos.x, chassis.position.y, targetPos.z);
                chassis.rotation.y = this._localPlayerServerRotation;
                chassis.computeWorldMatrix(true);
                body.setLinearVelocity(new Vector3(0, 0, 0));
                body.setAngularVelocity(new Vector3(0, 0, 0));
                body.disablePreStep = false;
                body.setMotionType(PhysicsMotionType.DYNAMIC);
                setTimeout(() => {
                    if (tank.physicsBody) {
                        tank.physicsBody.disablePreStep = true;
                    }
                }, 0);
                console.log(`%c[Multiplayer] Initial spawn at (${targetPos.x.toFixed(1)}, ${targetPos.z.toFixed(1)})`, 'color: #22c55e; font-weight: bold;');
            } catch (e) {
                console.error("[updateLocalPlayerToServer] Spawn teleport error:", e);
            }

            // Башня и ствол при спавне
            if (tank.turret) {
                tank.turret.rotation.y = this._localPlayerServerTurretRotation;
            }
            if (tank.barrel) {
                tank.barrel.rotation.x = -(this._localPlayerServerAimPitch || 0);
            }
            tank.aimPitch = this._localPlayerServerAimPitch;
            return;
        }

        // =========================================================================
        // ПОСЛЕ СПАВНА: НИЧЕГО НЕ ДЕЛАЕМ!
        // =========================================================================
        // Локальная физика Havok полностью управляет танком.
        // Это обеспечивает ИДЕНТИЧНОЕ ощущение как в одиночке.
        // Никаких коррекций позиции, никаких коррекций вращения корпуса.
        // 
        // Башню и ствол тоже НЕ синхронизируем - они управляются локально.
        // Сервер получает их состояние через input и отправляет другим игрокам.
    }

    // Счётчики для логирования (раз в секунду)
    private _reconciliationLogCounter = 0;
    private _localPlayerLogCounter = 0;

    /**
     * УПРОЩЁННЫЙ handleReconciliation: просто сохраняем серверную позицию
     * Фактическая интерполяция происходит в updateLocalPlayerToServer()
     */
    private handleReconciliation(data: {
        serverState?: PlayerData;
        predictedState?: PredictedState;
        unconfirmedStates?: PredictedState[];
        positionDiff?: number;
        rotationDiff?: number;
        needsReapplication?: boolean;
    }): void {
        if (!data.serverState || !data.serverState.position) return;

        const serverPos = data.serverState.position;

        // Безопасное получение серверной позиции
        if (serverPos instanceof Vector3) {
            this._localPlayerServerTarget = serverPos.clone();
        } else if (serverPos && typeof serverPos === 'object' && 'x' in serverPos && 'y' in serverPos && 'z' in serverPos) {
            const pos = serverPos as { x: number; y: number; z: number };
            if (typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number' &&
                isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
                this._localPlayerServerTarget = new Vector3(pos.x, pos.y, pos.z);
            } else {
                return; // Невалидные данные - игнорируем
            }
        } else {
            return; // Невалидный формат - игнорируем
        }

        // ЛОГИРОВАНИЕ: Показываем что получили данные от сервера (раз в секунду)
        this._reconciliationLogCounter++;
        if (this._reconciliationLogCounter % 60 === 0) {
            console.log(`%c[Reconciliation] Server target: (${this._localPlayerServerTarget.x.toFixed(1)}, ${this._localPlayerServerTarget.y.toFixed(1)}, ${this._localPlayerServerTarget.z.toFixed(1)})`, 'color: #22c55e; font-weight: bold;');
        }

        // Сохраняем серверные значения
        this._localPlayerServerRotation = data.serverState.rotation || 0;
        this._localPlayerServerTurretRotation = data.serverState.turretRotation || 0;
        this._localPlayerServerAimPitch = data.serverState.aimPitch || 0;
        this._hasLocalPlayerServerTarget = true;

        // Записываем метрики для статистики
        if (data.positionDiff !== undefined) {
            this.syncMetrics.recordPositionDiff(data.positionDiff);
        }
    }

    /**
     * Создать линию визуализации расхождения при reconciliation
     */
    private createReconciliationLine(from: Vector3, to: Vector3, color: Color3): void {
        if (!this.deps.scene) return;

        // Удаляем старые линии если их слишком много
        while (this.reconciliationLines.length >= this.MAX_RECONCILIATION_LINES) {
            const oldLine = this.reconciliationLines.shift();
            if (oldLine) {
                oldLine.dispose();
            }
        }

        // Создаем линию от предсказанной позиции к серверной
        const points = [from, to];
        const line = MeshBuilder.CreateLines("reconciliation_line", { points }, this.deps.scene);

        // Устанавливаем цвет
        const mat = new StandardMaterial("reconciliation_line_mat", this.deps.scene);
        mat.emissiveColor = color;
        mat.diffuseColor = color;
        line.color = color;

        // Автоматически удаляем линию через 2 секунды
        setTimeout(() => {
            if (line && !line.isDisposed()) {
                line.dispose();
                const index = this.reconciliationLines.indexOf(line);
                if (index >= 0) {
                    this.reconciliationLines.splice(index, 1);
                }
            }
        }, 2000);

        this.reconciliationLines.push(line);
    }

    /**
     * Включить/выключить визуализацию расхождений
     */
    setReconciliationVisualization(enabled: boolean): void {
        this.showReconciliationVisualization = enabled;

        // Если выключаем, удаляем все линии
        if (!enabled) {
            this.reconciliationLines.forEach(line => {
                if (line && !line.isDisposed()) {
                    line.dispose();
                }
            });
            this.reconciliationLines = [];
        }
    }

    /**
     * Получить метрики синхронизации
     */
    getSyncMetrics() {
        return this.syncMetrics;
    }

    private handleGameStart(data: any): void {
        // КРИТИЧНО: Сбрасываем счётчик reconciliation при старте игры
        // Это позволяет правильно обработать первые reconciliation при присоединении к идущей игре
        this.reconciliationCount = 0;

        // ДИАГНОСТИКА: Логируем состояние игры перед запуском
        const mm = this.deps.multiplayerManager;
        const roomId = data.roomId || mm?.getRoomId();
        const playerId = mm?.getPlayerId();
        const gameMode = data.mode || mm?.getGameMode();
        const worldSeed = data.worldSeed;
        const playersCount = data.players?.length || 0;
        const isActive = data.isActive !== undefined ? data.isActive : true; // По умолчанию true для GAME_START

        console.log(`[Game] 🎮 GAME_START: комната=${roomId}, режим=${gameMode}, игроков=${playersCount}, worldSeed=${worldSeed}, mapType=${data.mapType || 'N/A'}`);
        console.log(`[Game] 🎮 GAME_START data:`, data); // ДИАГНОСТИКА: полные данные

        // КРИТИЧНО: Проверяем синхронизацию roomId, worldSeed и mapType
        const currentRoomId = mm?.getRoomId();
        const currentWorldSeed = mm?.getWorldSeed();
        const currentMapType = mm?.getMapType();

        if (roomId && currentRoomId && roomId !== currentRoomId) {
            console.error(`%c[Game] ❌ КРИТИЧЕСКАЯ ОШИБКА: roomId не совпадает! GAME_START: ${roomId}, текущий: ${currentRoomId}`, 'color: #ef4444; font-weight: bold; font-size: 14px;');
            logger.error(`[Game] ❌ RoomId mismatch! GAME_START: ${roomId}, current: ${currentRoomId}`);
        }

        if (worldSeed && currentWorldSeed && worldSeed !== currentWorldSeed) {
            console.error(`%c[Game] ❌ КРИТИЧЕСКАЯ ОШИБКА: worldSeed не совпадает! GAME_START: ${worldSeed}, текущий: ${currentWorldSeed}`, 'color: #ef4444; font-weight: bold; font-size: 14px;');
            logger.error(`[Game] ❌ WorldSeed mismatch! GAME_START: ${worldSeed}, current: ${currentWorldSeed}`);
        }

        if (data.mapType && currentMapType && data.mapType !== currentMapType) {
            console.error(`%c[Game] ❌ КРИТИЧЕСКАЯ ОШИБКА: mapType не совпадает! GAME_START: ${data.mapType}, текущий: ${currentMapType}`, 'color: #ef4444; font-weight: bold; font-size: 14px;');
            logger.error(`[Game] ❌ MapType mismatch! GAME_START: ${data.mapType}, current: ${currentMapType}`);
        }

        // Логируем успешную синхронизацию
        if (roomId && worldSeed && data.mapType) {
            console.log(`%c[Game] ✅ Синхронизация: roomId=${roomId}, worldSeed=${worldSeed}, mapType=${data.mapType}`, 'color: #22c55e; font-weight: bold;');
        }

        // КРИТИЧНО: Проверяем, что все игроки получают одинаковые данные
        if (data.players && data.players.length > 0) {
            console.log(`[Game] 🎮 Игроки в GAME_START:`, data.players.map((p: any) => `${p.name || p.id}(${p.id})`).join(', '));
        }

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

                voiceChatManager.initialize(serverUrl, roomId, playerId);
            }).catch(error => {
                logger.error("[Game] Failed to load voice chat:", error);
            });
        }

        // КРИТИЧНО: Применяем тип карты из данных сервера
        // Это ГЛАВНОЕ место синхронизации карты - GAME_START гарантированно приходит с правильным mapType
        if (data.mapType) {
            console.log(`%c[Game] 🗺️ GAME_START: Получен mapType от сервера: ${data.mapType}`, 'color: #22c55e; font-weight: bold; font-size: 14px;');

            const gameInstance = (window as any).gameInstance;

            // ПРИНУДИТЕЛЬНАЯ СИНХРОНИЗАЦИЯ: Всегда обновляем currentMapType из данных сервера
            if (gameInstance) {
                const currentMap = gameInstance.currentMapType;

                // Логируем состояние для диагностики
                console.log(`[Game] 🗺️ Текущая карта: ${currentMap}, Серверная карта: ${data.mapType}`);

                if (currentMap !== data.mapType) {
                    console.log(`%c[Game] ❌ КРИТИЧЕСКОЕ НЕСОВПАДЕНИЕ КАРТЫ! Текущая: ${currentMap}, Сервер: ${data.mapType}`,
                        'color: #ef4444; font-weight: bold; font-size: 16px;');

                    // ПРИНУДИТЕЛЬНО устанавливаем правильный mapType
                    gameInstance.currentMapType = data.mapType;

                    // Если ChunkSystem уже создан с неправильной картой - перезагружаем
                    if (gameInstance.chunkSystem) {
                        const chunkMapType = (gameInstance.chunkSystem as any).mapType;
                        if (chunkMapType !== data.mapType) {
                            console.log(`[Game] 🔄 ChunkSystem имеет mapType: ${chunkMapType}, перезагружаем на: ${data.mapType}`);
                            gameInstance.reloadMap(data.mapType).then(() => {
                                console.log(`%c[Game] ✅ Карта успешно синхронизирована: ${data.mapType}`, 'color: #22c55e; font-weight: bold;');
                            }).catch((err: any) => {
                                console.error(`[Game] ❌ Ошибка синхронизации карты:`, err);
                            });
                        }
                    }
                } else {
                    console.log(`[Game] ✅ Карта уже синхронизирована: ${data.mapType}`);
                }
            }

            // Сохраняем в глобальные настройки
            if (this.deps.setMapType) {
                this.deps.setMapType(data.mapType);
                logger.log(`[Game] 🗺️ Updated Game mapType via dependency to ${data.mapType}`);
            } else if (gameInstance) {
                gameInstance.currentMapType = data.mapType;
                logger.log(`[Game] 🗺️ Updated gameInstance.currentMapType to ${data.mapType} (fallback)`);
            }
            (window as any).currentMapType = data.mapType;
        } else {
            console.warn(`%c[Game] ⚠️ GAME_START: mapType ОТСУТСТВУЕТ в данных!`, 'color: #f59e0b; font-weight: bold; font-size: 14px;', data);
            // Пытаемся использовать pendingMapType из MultiplayerManager как fallback
            const pendingMapType = mm?.getMapType();
            if (pendingMapType) {
                console.log(`[Game] 🗺️ Используем pendingMapType как fallback: ${pendingMapType}`);
                const gameInstance = (window as any).gameInstance;
                if (gameInstance) {
                    gameInstance.currentMapType = pendingMapType;
                }
            }
        }

        // Сохраняем world seed
        if (data.worldSeed && mm) {
            (mm as any).worldSeed = data.worldSeed;
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
            }
        }

        // КРИТИЧНО: Добавляем игроков в networkPlayers ДО создания танков
        // Используем унифицированную функцию для предотвращения дублирования
        if (data.players && mm) {
            const localPlayerId = mm.getPlayerId();
            const otherPlayers = data.players.filter((p: any) => p.id !== localPlayerId);

            console.log(`[Game] 🎮 [GAME_START] Обрабатываем ${otherPlayers.length} других игроков из GAME_START`);

            // НЕ очищаем pendingNetworkPlayers сразу - сначала добавим всех игроков
            // Очистим только после того, как убедимся, что они обработаны
            const oldPendingCount = this.pendingNetworkPlayers.length;

            for (const playerData of otherPlayers) {
                if (!playerData.status) playerData.status = "alive";
                console.log(`[Game] 🎮 Добавляем игрока ${playerData.name || playerData.id} (${playerData.id}) в очередь`);
                this.queueNetworkPlayerForCreation(playerData);
            }

            // Теперь очищаем старые pending (которые могли быть из предыдущей сессии)
            // но только те, которых нет в новом списке игроков
            const newPlayerIds = new Set(otherPlayers.map((p: any) => p.id));
            this.pendingNetworkPlayers = this.pendingNetworkPlayers.filter(p => newPlayerIds.has(p.id));

            console.log(`[Game] 🎮 [GAME_START] После добавления: pendingNetworkPlayers=${this.pendingNetworkPlayers.length} (было ${oldPendingCount})`);
        } else {
            logger.warn(`[Game] ⚠️ No players data in GAME_START or multiplayerManager not available`);
            console.warn(`[Game] ⚠️ No players data in GAME_START! data.players=`, data.players, `mm=`, !!mm);
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

        // Сохраняем данные о синхронизированных ботах
        console.log(`[Game] 🔍 Проверка enemies в GAME_START:`, {
            hasEnemies: !!data.enemies,
            isArray: Array.isArray(data.enemies),
            length: data.enemies?.length,
            enemies: data.enemies
        });

        if (data.enemies && Array.isArray(data.enemies) && data.enemies.length > 0) {
            this.pendingEnemies = data.enemies;
            logger.log(`[Game] ✅ GAME_START: сохранено ${data.enemies.length} ботов в pendingEnemies`);
            console.log(`[Game] ✅ GAME_START: сохранено ${data.enemies.length} ботов в pendingEnemies`);
        } else {
            logger.warn(`[Game] ⚠️ GAME_START: enemies отсутствуют или пусты! data.enemies=`, data.enemies);
            console.warn(`[Game] ⚠️ GAME_START: enemies отсутствуют или пусты!`, data.enemies);
        }

        // КРИТИЧНО: Обрабатываем pending игроков и ботов, если Scene готова
        // Это гарантирует создание танков даже если игра уже запущена
        if (this.deps.scene && (this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0)) {
            logger.log(`[Game] 🔄 [GAME_START] Обрабатываем pending: игроков=${this.pendingNetworkPlayers.length}, ботов=${this.pendingEnemies.length}`);
            console.log(`[Game] 🔄 [GAME_START] Обрабатываем pending: игроков=${this.pendingNetworkPlayers.length}, ботов=${this.pendingEnemies.length}`);
            setTimeout(() => this.processPendingNetworkPlayers(true), 100);
        } else if (this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0) {
            logger.warn(`[Game] ⚠️ [GAME_START] Есть pending (игроков=${this.pendingNetworkPlayers.length}, ботов=${this.pendingEnemies.length}), но Scene не готова. Обработка произойдет позже.`);
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
            try {
                this.deps.mainMenu.hide();
            } catch (error) { }
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
            setTimeout(async () => {
                try {
                    const result = this.deps.startGame!();
                    if (result instanceof Promise) {
                        await result.catch(() => { });
                    }

                    // После запуска игры создаём танки для ожидающих игроков И ботов
                    const tryProcessPending = (attempt: number, maxAttempts: number = 5) => {
                        if (this.deps.scene && (this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0)) {
                            logger.log(`[Game] 🔄 Обрабатываем pending: игроков=${this.pendingNetworkPlayers.length}, ботов=${this.pendingEnemies.length}`);
                            this.processPendingNetworkPlayers(true);
                        } else if ((this.pendingNetworkPlayers.length > 0 || this.pendingEnemies.length > 0) && attempt < maxAttempts) {
                            setTimeout(() => tryProcessPending(attempt + 1, maxAttempts), 500 * attempt);
                        }
                    };
                    setTimeout(() => tryProcessPending(1), 500);
                } catch (error) { }
            }, 100);
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

            // Обновляем здоровье локального игрока
            if (data.playerId === localPlayerId) {
                const healthPercent = (data.health / data.maxHealth) * 100;
                if (healthPercent < 30) {
                    this.deps.hud?.showNotification?.(`⚠️ Критическое здоровье! ${Math.round(healthPercent)}%`, "warning");
                }
            } else {
                // Обновляем здоровье сетевого танка (показываем полоску здоровья)
                const networkTank = this.deps.networkPlayerTanks.get(data.playerId);
                if (networkTank) {
                    networkTank.setHealth(data.health, data.maxHealth);
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

            // Пропускаем локального игрока - его выстрелы обрабатываются локально
            // Сервер отправляет ownerId, не playerId
            const localPlayerId = mm.getPlayerId();
            if (data.ownerId === localPlayerId) {
                return;
            }

            if (data.position && data.direction) {
                const pos = new Vector3(data.position.x, data.position.y, data.position.z);
                const dir = new Vector3(data.direction.x, data.direction.y, data.direction.z);

                // Визуальный эффект выстрела (вспышка)
                if (this.deps.effectsManager) {
                    this.deps.effectsManager.createMuzzleFlash(pos, dir, data.cannonType || "standard");
                }

                // Звук выстрела с 3D позиционированием
                if (this.deps.soundManager) {
                    this.deps.soundManager.playShoot(data.cannonType || "standard", pos);
                }
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
            this.handleEnemyUpdate(data);
        });

        mm.onWallSpawn((data) => {
            if (!this.deps.scene) return;

            // Visuals only - collision is handled by server now
            const wall = MeshBuilder.CreateBox(`remoteWall_${Date.now()}`, {
                width: 6,
                height: 4,
                depth: 0.5
            }, this.deps.scene);

            const position = new Vector3(data.position.x, data.position.y, data.position.z);
            wall.position = position;
            wall.rotation.y = data.rotation;

            // Material
            const wallMat = new StandardMaterial(`remoteWallMat_${Date.now()}`, this.deps.scene);
            wallMat.diffuseColor = new Color3(0.5, 0.5, 0.5); // Default gray
            wallMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
            wall.material = wallMat;

            // Metadata
            wall.metadata = {
                type: "protectiveWall",
                ownerId: data.ownerId
            };

            // Animate appearance
            const startY = position.y - 4;
            const endY = position.y;
            wall.position.y = startY;

            let progress = 0;
            const animInterval = setInterval(() => {
                progress += 0.05;
                if (progress >= 1) {
                    wall.position.y = endY;
                    clearInterval(animInterval);
                } else {
                    // Ease out
                    const ease = 1 - Math.pow(1 - progress, 3);
                    wall.position.y = startY + (endY - startY) * ease;
                }
            }, 16);

            // Remove after duration
            setTimeout(() => {
                if (wall && !wall.isDisposed()) {
                    wall.dispose();
                }
            }, data.duration);
        });
    }

    /**
     * Обработка обновлений ботов от сервера
     */
    private handleEnemyUpdate(data: any): void {
        if (!data) return;

        // Данные могут приходить как массив enemies или как одиночный enemy
        const enemies = data.enemies || (data.enemy ? [data.enemy] : []);

        if (enemies.length === 0) return;

        // Обновляем ботов через GameEnemies
        if (this.deps.gameEnemies && typeof this.deps.gameEnemies.updateNetworkEnemies === "function") {
            this.deps.gameEnemies.updateNetworkEnemies(enemies);
        } else {
            // Fallback через глобальный gameInstance
            const game = (window as any).gameInstance;
            if (game?.gameEnemies?.updateNetworkEnemies) {
                game.gameEnemies.updateNetworkEnemies(enemies);
            }
        }
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
            console.log(`[Game] ⏸️ processPendingNetworkPlayers пропущен (throttling), force=${force}`);
            return;
        }
        this.lastProcessPendingTime = now;

        // Логируем только если есть pending players
        if (this.pendingNetworkPlayers.length > 0) {
            console.log(`[Game] 🔄 Processing ${this.pendingNetworkPlayers.length} pending players, scene=${!!this.deps.scene}`);
        }

        if (!this.deps.scene) {
            // Retry if scene not ready
            if (this.pendingNetworkPlayers.length > 0) {
                console.warn(`[Game] ⚠️ Scene не готова, повтор через 500ms. pendingNetworkPlayers=${this.pendingNetworkPlayers.length}`);
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

            console.log(`[Game] 🔨 Создаем ${playersToCreate.length} танков для pending игроков:`, playersToCreate.map(p => p.name || p.id).join(', '));

            for (const playerData of playersToCreate) {
                let networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                if (!networkPlayer) {
                    console.log(`[Game] 🔨 Игрок ${playerData.id} не в networkPlayers, добавляем...`);
                    (this.deps.multiplayerManager as any).addNetworkPlayer(playerData);
                    networkPlayer = this.deps.multiplayerManager?.getNetworkPlayer(playerData.id);
                }

                if (networkPlayer) {
                    try {
                        console.log(`[Game] 🔨 Создаем танк для ${playerData.name || playerData.id} (${playerData.id})...`);
                        this.createNetworkPlayerTankInternal(playerData, networkPlayer);
                    } catch (error) {
                        logger.error(`[Game] Error creating tank for ${playerData.id}:`, error);
                        console.error(`[Game] ❌ Ошибка создания танка для ${playerData.id}:`, error);
                        this.queueNetworkPlayerForCreation(playerData);
                    }
                } else {
                    console.warn(`[Game] ⚠️ Не удалось получить networkPlayer для ${playerData.id}, добавляем в очередь снова`);
                    this.queueNetworkPlayerForCreation(playerData);
                }
            }

            console.log(`[Game] ✅ После создания танков: networkPlayerTanks.size=${this.deps.networkPlayerTanks.size}`);

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
            const enemiesToCreate = [...this.pendingEnemies];
            this.pendingEnemies = [];

            logger.log(`[Game] 🤖 Обрабатываем ${enemiesToCreate.length} сетевых ботов...`);

            if (this.deps.gameEnemies && typeof this.deps.gameEnemies.spawnNetworkEnemies === "function") {
                logger.log(`[Game] ✅ Вызываем gameEnemies.spawnNetworkEnemies(${enemiesToCreate.length} ботов)`);
                this.deps.gameEnemies.spawnNetworkEnemies(enemiesToCreate);
            } else {
                logger.warn(`[Game] ⚠️ gameEnemies не доступен, пробуем через gameInstance...`);
                const game = (window as any).gameInstance;
                if (game?.gameEnemies?.spawnNetworkEnemies) {
                    logger.log(`[Game] ✅ Вызываем gameInstance.gameEnemies.spawnNetworkEnemies(${enemiesToCreate.length} ботов)`);
                    game.gameEnemies.spawnNetworkEnemies(enemiesToCreate);
                } else {
                    logger.error(`[Game] ❌ gameEnemies.spawnNetworkEnemies недоступен! Боты не будут созданы.`);
                }
            }
        } else {
            logger.log(`[Game] ℹ️ pendingEnemies пуст, боты не обрабатываются`);
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

        // КРИТИЧНО: Проверка на локального игрока - только точное сравнение
        if (localPlayerId && playerData.id === localPlayerId) {
            console.warn(`[Game] ⛔ BLOCKED: Attempted to create NetworkPlayerTank for LOCAL player! playerData.id=${playerData.id}, localPlayerId=${localPlayerId}`);
            return;
        }

        if (this.deps.networkPlayerTanks.has(playerData.id)) return;
        if (this.pendingNetworkPlayers.find(p => p.id === playerData.id)) return;

        // Проверка 3: Убеждаемся, что игрок добавлен в networkPlayers
        const mm = this.deps.multiplayerManager;
        if (!mm) {
            logger.error(`[Game] MultiplayerManager not available for player ${playerData.id}`);
            return;
        }

        let networkPlayer = mm.getNetworkPlayer(playerData.id);
        if (!networkPlayer) {
            (mm as any).addNetworkPlayer(playerData);
            networkPlayer = mm.getNetworkPlayer(playerData.id);
            if (!networkPlayer) return;
        } else {
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

        // КРИТИЧНО: Проверка на локального игрока - только точное сравнение
        const localPlayerId = this.deps.multiplayerManager?.getPlayerId();
        if (localPlayerId && playerData.id === localPlayerId) {
            console.error(`[Game] ❌ CRITICAL: Tried to create tank for LOCAL player in createNetworkPlayerTankInternal! ID=${playerData.id}`);
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
            // Создаём танк для сетевого игрока
            const mm = this.deps.multiplayerManager;
            const roomId = mm?.getRoomId() || 'N/A';
            const worldSeed = mm?.getWorldSeed() || 'N/A';
            const mapType = mm?.getMapType() || 'N/A';

            // Логирование уменьшено - только один лог при создании танка
            console.log(`[Game] 🔨 NetworkPlayerTank: ${playerData.name || playerData.id} at (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)}), room=${roomId}`);

            logger.log(`[Game] 🔨 Creating NetworkPlayerTank for ${playerData.id}: roomId=${roomId}, worldSeed=${worldSeed}, mapType=${mapType}, position=(${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`);

            const tank = new NetworkPlayerTank(this.deps.scene, networkPlayer);
            (tank as any).multiplayerManager = this.deps.multiplayerManager;
            this.deps.networkPlayerTanks.set(playerData.id, tank);

            // Убеждаемся, что танк видим
            if (tank.chassis) {
                tank.chassis.isVisible = true;
                tank.chassis.setEnabled(true);
            }
            if (tank.turret) {
                tank.turret.isVisible = true;
                tank.turret.setEnabled(true);
            }
            if (tank.barrel) {
                tank.barrel.isVisible = true;
                tank.barrel.setEnabled(true);
            }

            // КРИТИЧНО: Принудительно добавляем танк в сцену и делаем видимым
            if (tank.chassis && this.deps.scene) {
                const wasInScene = this.deps.scene.meshes.includes(tank.chassis);

                // Принудительно добавляем в сцену
                if (!wasInScene) {
                    this.deps.scene.addMesh(tank.chassis);
                    console.log(`[Game] ✅ Танк ${playerData.name || playerData.id} ДОБАВЛЕН в сцену`);
                }

                // Принудительно делаем видимым
                if (!tank.chassis.isVisible) {
                    tank.chassis.isVisible = true;
                    console.log(`[Game] ✅ Танк ${playerData.name || playerData.id} сделан ВИДИМЫМ`);
                }
                if (!tank.chassis.isEnabled()) {
                    tank.chassis.setEnabled(true);
                    console.log(`[Game] ✅ Танк ${playerData.name || playerData.id} ВКЛЮЧЕН`);
                }

                // Добавляем дочерние меши
                if (tank.turret && !this.deps.scene.meshes.includes(tank.turret)) {
                    this.deps.scene.addMesh(tank.turret);
                    tank.turret.isVisible = true;
                    tank.turret.setEnabled(true);
                }
                if (tank.barrel && !this.deps.scene.meshes.includes(tank.barrel)) {
                    this.deps.scene.addMesh(tank.barrel);
                    tank.barrel.isVisible = true;
                    tank.barrel.setEnabled(true);
                }

                // Логируем только если есть проблемы
                const visible = tank.chassis.isVisible;
                const enabled = tank.chassis.isEnabled();
                const inScene = this.deps.scene.meshes.includes(tank.chassis);

                if (!visible || !enabled || !inScene) {
                    console.error(`[Game] ❌ Танк ${playerData.id} НЕ ВИДЕН! visible=${visible}, enabled=${enabled}, inScene=${inScene}`);
                } else {
                    console.log(`[Game] ✅ Tank created: ${playerData.name || playerData.id} (total: ${this.deps.networkPlayerTanks.size})`);
                }
            } else {
                console.error(`[Game] ❌ КРИТИЧНО: Не удалось добавить танк ${playerData.id} в сцену! chassis=${!!tank.chassis}, scene=${!!this.deps.scene}`);
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

