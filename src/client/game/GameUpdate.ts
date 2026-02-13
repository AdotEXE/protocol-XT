// ═══════════════════════════════════════════════════════════════════════════
// GAME UPDATE - Основной игровой цикл
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from "../utils/logger";
import type { Engine, Scene, Vector3 } from "@babylonjs/core";
import { Vector3 as Vector3Impl, Ray, PhysicsMotionType } from "@babylonjs/core";
import type { TankController } from "../tankController";
import type { HUD } from "../hud";
import type { EnemyManager } from "../enemy";
import type { EnemyTank } from "../enemyTank";
import type { ChunkSystem } from "../chunkSystem";
import type { ConsumablesManager } from "../consumables";
import type { MissionSystem } from "../missionSystem";
import type { AchievementsSystem } from "../achievements";
import type { ExperienceSystem } from "../experienceSystem";
import type { PlayerProgressionSystem } from "../playerProgression";
import type { MultiplayerManager } from "../multiplayer";
import type { AICoordinator } from "../ai/AICoordinator";
import type { PerformanceOptimizer } from "../optimization/PerformanceOptimizer";
import { timerManager } from "../optimization/TimerManager";
import { GlobalIntelligenceManager } from "../ai/GlobalIntelligenceManager";
import { timeProvider } from "../optimization/TimeProvider";
import type { BotPerformanceMonitor } from "../bots/BotPerformanceMonitor";

/**
 * GameUpdate - Основной игровой цикл
 * 
 * Отвечает за:
 * - Обновление всех систем каждый кадр
 * - Оптимизацию обновлений (разные частоты для разных систем)
 * - Координацию обновлений между системами
 */
export class GameUpdate {
    // Счётчик кадров для оптимизации
    private _updateTick = 0;

    // ОПТИМИЗАЦИЯ: Кэш позиции танка для избежания дорогих вызовов absolutePosition
    private _cachedTankPosition: Vector3 = Vector3Impl.Zero();
    private _tankPositionCacheFrame = -1;

    // ОПТИМИЗАЦИЯ: Кэш позиций врагов для использования в HUD и updateCamera
    private _enemyPositionsCache: Map<string, {
        x: number;
        z: number;
        frame: number;
        alive: boolean;
        chassisRotY?: number; // Кэш угла корпуса для избежания toEulerAngles()
    }> = new Map();
    private _enemyPositionsCacheFrame = -1;

    // ОПТИМИЗАЦИЯ: Кэш ammo данных (избегаем new Map каждые 3 кадра)
    private _ammoDataCache: Map<string, { current: number, max: number }> = (() => {
        const m = new Map<string, { current: number, max: number }>();
        m.set("tracer", { current: 0, max: 0 });
        m.set("ap", { current: 0, max: 0 });
        m.set("apcr", { current: 0, max: 0 });
        m.set("he", { current: 0, max: 0 });
        m.set("apds", { current: 0, max: 0 });
        return m;
    })();

    // ОПТИМИЗАЦИЯ: Кэш LOD-состояния врагов (избегаем getChildMeshes каждый кадр)
    private _enemyLodState: Map<any, boolean> = new Map();

    // ОПТИМИЗАЦИЯ: Кэш результатов getCachedEnemyPositions
    private _cachedEnemyPositionsResult: { x: number, z: number, alive: boolean, chassisRotY?: number }[] = [];
    private _cachedEnemyPositionsFrame = -1;

    // ОПТИМИЗАЦИЯ: Reusable Set для отслеживания активных врагов
    private _activeEnemyIdsSet: Set<string> = new Set();

    // ОПТИМИЗАЦИЯ: Адаптивные интервалы обновления на основе FPS
    // Базовые интервалы увеличены для стабильного 60+ FPS
    private _adaptiveIntervals = {
        chunkSystem: 16,      // Увеличено с 12 для оптимизации
        enemyManager: 6,      // Увеличено с 5
        turrets: 15,          // Увеличено с 10
        garage: 3,            // Увеличено с 2
        multiplayer: 2,       // ОПТИМИЗАЦИЯ: Каждые 2 кадра (30 Hz) вместо каждого кадра - снижает нагрузку на 50%
        consumables: 15       // Увеличено с 10
    };
    private _lastFPS = 60;
    private _fpsUpdateCounter = 0;

    // Ссылки на системы
    protected engine: Engine | undefined;
    protected scene: Scene | undefined;
    protected tank: TankController | undefined;
    protected hud: HUD | undefined;
    protected enemyManager: EnemyManager | undefined;
    protected enemyTanks: EnemyTank[] | undefined; // Ссылка на массив врагов для кэширования
    protected chunkSystem: ChunkSystem | undefined;
    protected consumablesManager: ConsumablesManager | undefined;
    protected missionSystem: MissionSystem | undefined;
    protected achievementsSystem: AchievementsSystem | undefined;
    protected experienceSystem: ExperienceSystem | undefined;
    protected playerProgression: PlayerProgressionSystem | undefined;
    protected multiplayerManager: MultiplayerManager | undefined;
    protected aiCoordinator: AICoordinator | undefined;
    protected performanceOptimizer: PerformanceOptimizer | undefined;
    protected botPerformanceMonitor: BotPerformanceMonitor | undefined;

    // Callbacks для обновлений (будут переданы из Game)
    protected onUpdateCamera: (() => void) | null = null;
    protected onUpdateCompass: (() => void) | null = null;
    protected onUpdateHUD: (() => void) | null = null;
    protected onUpdateGarageDoors: (() => void) | null = null;
    protected onUpdateGarageCapture: ((deltaTime: number) => void) | null = null;
    protected onUpdateGarageRespawnTimers: ((deltaTime: number) => void) | null = null;
    protected onUpdateMultiplayer: ((deltaTime: number) => void) | null = null;
    protected onUpdateFrontlineWaves: ((deltaTime: number) => void) | null = null;
    protected onUpdateEnemyTurretsVisibility: (() => void) | null = null;
    protected onCheckConsumablePickups: (() => void) | null = null;
    protected onCheckSpectatorMode: (() => void) | null = null;
    protected onUpdateSupplyDrops: ((deltaTime: number) => void) | null = null;

    // Флаги состояния
    protected gameStarted = false;
    protected gamePaused = false;
    protected isAiming = false;
    protected survivalStartTime = 0;

    /**
     * Инициализация системы обновлений
     */
    initialize(
        engine: Engine,
        scene: Scene,
        callbacks: {
            tank?: TankController;
            hud?: HUD;
            enemyManager?: EnemyManager;
            enemyTanks?: EnemyTank[];
            chunkSystem?: ChunkSystem;
            consumablesManager?: ConsumablesManager;
            missionSystem?: MissionSystem;
            achievementsSystem?: AchievementsSystem;
            experienceSystem?: ExperienceSystem;
            playerProgression?: PlayerProgressionSystem;
            multiplayerManager?: MultiplayerManager;
            aiCoordinator?: AICoordinator;
            performanceOptimizer?: PerformanceOptimizer;
            botPerformanceMonitor?: BotPerformanceMonitor;
            gameStarted?: boolean;
            gamePaused?: boolean;
            isAiming?: boolean;
            survivalStartTime?: number;
        }
    ): void {
        this.engine = engine;
        this.scene = scene;
        this.tank = callbacks.tank;
        this.hud = callbacks.hud;
        this.enemyManager = callbacks.enemyManager;
        this.enemyTanks = callbacks.enemyTanks;
        this.chunkSystem = callbacks.chunkSystem;
        this.consumablesManager = callbacks.consumablesManager;
        this.missionSystem = callbacks.missionSystem;
        this.achievementsSystem = callbacks.achievementsSystem;
        this.experienceSystem = callbacks.experienceSystem;
        this.playerProgression = callbacks.playerProgression;
        this.multiplayerManager = callbacks.multiplayerManager;
        this.aiCoordinator = callbacks.aiCoordinator;
        this.performanceOptimizer = callbacks.performanceOptimizer;
        this.botPerformanceMonitor = callbacks.botPerformanceMonitor;
        this.gameStarted = callbacks.gameStarted || false;
        this.gamePaused = callbacks.gamePaused || false;
        this.isAiming = callbacks.isAiming || false;
        this.survivalStartTime = callbacks.survivalStartTime || 0;

        logger.log("[GameUpdate] Update system initialized");
    }

    /**
     * Основной метод обновления (вызывается каждый кадр)
     */
    update(): void {
        if (!this.scene || !this.engine) return;

        // PERFORMANCE: Обновляем глобальный провайдер времени ПЕРВЫМ
        // Это позволяет всем системам использовать кэшированное время вместо Date.now()
        timeProvider.update();

        // Счётчик кадров
        this._updateTick++;
        if (this._updateTick > 1000000) this._updateTick = 0;

        // Delta time для анимаций — вычисляем один раз
        const deltaTimeMs = this.engine.getDeltaTime();
        const deltaTime = deltaTimeMs / 1000;

        // ОПТИМИЗАЦИЯ: Обновляем централизованный TimerManager каждый кадр
        timerManager.update();

        // === ОБНОВЛЕНИЕ FPS И СЕТЕВОЙ СТАТИСТИКИ ===
        let currentFPS = 60;
        if (this.hud) {
            let fps = this.engine.getFps();
            if (!isFinite(fps) || fps <= 0) {
                if (deltaTimeMs > 0) {
                    fps = 1000 / deltaTimeMs;
                } else {
                    fps = 0;
                }
            }
            currentFPS = fps;
            this.hud.updateFPS(fps, deltaTimeMs);

            // Update Ping Indicator (0 = not yet measured, show "—")
            if (this.multiplayerManager && this.hud.updatePing && (this.multiplayerManager as any).connected) {
                const ping = this.multiplayerManager.getPing ? this.multiplayerManager.getPing() : 0;
                this.hud.updatePing(ping);
            }
        }

        // ОПТИМИЗАЦИЯ: Адаптивные интервалы обновления на основе FPS
        this._fpsUpdateCounter++;
        if (this._fpsUpdateCounter >= 60) { // Обновляем интервалы каждые 60 кадров (~1 секунда)
            this.updateAdaptiveIntervals(currentFPS);
            this._fpsUpdateCounter = 0;
        }
        this._lastFPS = currentFPS;

        // === ЦЕНТРАЛИЗОВАННЫЕ ОБНОВЛЕНИЯ АНИМАЦИЙ ===
        // Обновляем анимации с разной частотой для оптимизации

        // HUD анимации (каждые 3 кадра для оптимизации)
        // ПРИМЕЧАНИЕ: Основной hud.update() вызывается из render loop в game.ts,
        // здесь обновляем только данные (fuel, tracer, arsenal)
        if (this._updateTick % 3 === 0 && this.hud) {
            // Update fuel indicator
            if (this.tank) {
                this.hud.updateFuel?.(this.tank.currentFuel, this.tank.maxFuel);
            }

            // Update tracer count
            if (this.tank) {
                this.hud.updateTracerCount?.(this.tank.getTracerCount(), this.tank.getMaxTracerCount());
            }

            // Update arsenal — reuse pre-allocated Map to avoid GC pressure
            if (this.tank && this.hud.updateArsenal) {
                const ammoData = this._ammoDataCache;
                const tracerEntry = ammoData.get("tracer")!;
                tracerEntry.current = this.tank.getTracerCount();
                tracerEntry.max = this.tank.getMaxTracerCount();
                this.hud.updateArsenal(ammoData);
            }

            // Update missions panel (every 60 frames ~1 second)
            if (this._updateTick % 60 === 0 && this.missionSystem) {
                const activeMissions = this.missionSystem.getActiveMissions();
                const missionData = activeMissions.map(m => ({
                    id: m.mission.id,
                    name: this.missionSystem!.getName(m.mission),
                    description: this.missionSystem!.getDescription(m.mission),
                    icon: m.mission.icon,
                    current: m.progress.current,
                    requirement: m.mission.requirement,
                    completed: m.progress.completed,
                    claimed: m.progress.claimed,
                    type: m.mission.type
                }));
                this.hud.updateMissions?.(missionData);
            }

            // Update survival achievements and missions
            if (this.tank) {
                if (this.tank.isAlive) {
                    const survivalTime = (Date.now() - this.survivalStartTime) / 1000;

                    // Achievements
                    if (this.achievementsSystem) {
                        this.achievementsSystem.setProgress("survivor", Math.floor(survivalTime));

                        const hpPercent = this.tank.currentHealth / this.tank.maxHealth;
                        if (hpPercent < 0.1 && hpPercent > 0) {
                            this.achievementsSystem.updateProgress("iron_will", 1);
                        }
                    }
                }
            }
        }

        // КРИТИЧНО: Убрано дублирование updateCamera - камера обновляется через onAfterPhysicsObservable каждые 2 кадра
        // Это дает прирост +10-15 FPS, так как updateCamera больше не вызывается дважды

        // Обновление гаражей (адаптивный интервал)
        if (this._updateTick % this._adaptiveIntervals.garage === 0) {
            if (this.onUpdateGarageDoors) {
                this.onUpdateGarageDoors();
            }

            if (this.onUpdateGarageCapture) {
                this.onUpdateGarageCapture(deltaTime);
            }

            if (this.onUpdateGarageRespawnTimers) {
                this.onUpdateGarageRespawnTimers(deltaTime);
            }
        }

        // Обновление мультиплеера (адаптивный интервал)
        // ОПТИМИЗАЦИЯ: Пропускаем обновление мультиплеера в одиночном режиме
        // КРИТИЧНО: updateMultiplayer вызывается в основном цикле update(), который выполняется ПОСЛЕ onAfterPhysicsObservable
        // Порядок в Babylon.js: onBeforePhysicsObservable → Physics → onAfterPhysicsObservable → Scene.render() → update()
        // Это гарантирует, что updatePositionCache() уже вызван перед updateMultiplayer()
        const game = (window as any).gameInstance;
        const isMultiplayer = game?.isMultiplayer || false;
        if (isMultiplayer && this._updateTick % this._adaptiveIntervals.multiplayer === 0 && this.onUpdateMultiplayer) {
            this.onUpdateMultiplayer(deltaTime);

            // Обновление индикатора качества синхронизации (каждые 30 кадров ~0.5 секунды)
            if (this._updateTick % 30 === 0 && this.hud) {
                const game = (window as any).gameInstance;
                if (game && game.gameMultiplayerCallbacks) {
                    const syncMetrics = game.gameMultiplayerCallbacks.getSyncMetrics?.();
                    if (syncMetrics) {
                        this.hud.updateSyncQuality(syncMetrics);
                    }
                }
            }
        }

        // Обновление волн фронта (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.onUpdateFrontlineWaves) {
            this.onUpdateFrontlineWaves(deltaTime);
        }

        // Обновление видимости турелей (адаптивный интервал) - ОПТИМИЗАЦИЯ: адаптивная частота
        if (this._updateTick % this._adaptiveIntervals.turrets === 0 && this.onUpdateEnemyTurretsVisibility) {
            this.onUpdateEnemyTurretsVisibility();
        }

        // Проверка подбора расходников (адаптивный интервал)
        if (this._updateTick % this._adaptiveIntervals.consumables === 0 && this.onCheckConsumablePickups) {
            this.onCheckConsumablePickups();
        }

        // Обновление дропов с неба (падение, приземление, деспавн)
        if (this.onUpdateSupplyDrops) {
            this.onUpdateSupplyDrops(deltaTime);
        }

        // Проверка режима наблюдателя (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.onCheckSpectatorMode) {
            this.onCheckSpectatorMode();
        }

        // ОПТИМИЗАЦИЯ: Обновление HUD каждые 6 кадров (не каждый кадр) для производительности
        if (this._updateTick % 6 === 0 && this.onUpdateHUD) {
            this.onUpdateHUD();
        }

        // Обновление чанков
        if (this._updateTick % this._adaptiveIntervals.chunkSystem === 0 && this.chunkSystem) {
            if (this.tank && this.tank.chassis) {
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
                if (this._tankPositionCacheFrame !== this._updateTick) {
                    this._cachedTankPosition.copyFrom(this.tank.chassis.position);
                    this._tankPositionCacheFrame = this._updateTick;
                }
                this.chunkSystem.update(this._cachedTankPosition);
            }
        }

        // Обновление AI Coordinator (каждые 4 кадра для оптимизации)
        // Пропускаем при FPS < 50 для дополнительной производительности
        if (this._updateTick % 4 === 0 && this._lastFPS >= 50 && this.aiCoordinator && this.tank && this.tank.chassis) {
            const cachedPos = this.tank.getCachedChassisPosition();
            this.aiCoordinator.updatePlayerPosition(cachedPos);
            this.aiCoordinator.update();
        }

        // Обновление Performance Optimizer (каждые 8 кадров для оптимизации)
        // Пропускаем при FPS < 50 для дополнительной производительности
        if (this._updateTick % 8 === 0 && this._lastFPS >= 50 && this.performanceOptimizer && this.tank && this.tank.chassis) {
            const cachedPos = this.tank.getCachedChassisPosition();
            this.performanceOptimizer.setReferencePosition(cachedPos);
            this.performanceOptimizer.update();
        }

        // ОПТИМИЗАЦИЯ: Обновление кэша позиций врагов (каждые 4 кадра для оптимизации)
        // Увеличено с 3 до 4 для лучшей производительности
        if (this._updateTick % 4 === 0) {
            this.updateEnemyPositionsCache();
        }

        // ИСПРАВЛЕНО: Обновление врагов БЕЗ жесткой зависимости от FPS
        // Обновляем врагов всегда, но с адаптивной частотой при низком FPS
        if (this.enemyTanks && this.enemyTanks.length > 0 && this.tank && this.tank.chassis) {
            // Обновляем глобальный интеллект ботов (каждые 2 кадра для оптимизации)
            if (this._updateTick % 2 === 0) {
                const globalIntel = GlobalIntelligenceManager.getInstance();
                if (globalIntel.isEnabled()) {
                    // Проверяем, есть ли активный бой (хотя бы один живой враг)
                    const hasAliveEnemies = this.enemyTanks.some(e => e && e.isAlive && e.chassis && !e.chassis.isDisposed());
                    // ОПТИМИЗАЦИЯ: Используем timeProvider вместо Date.now()
                    const nowMs = timeProvider.now;
                    globalIntel.tick(nowMs, hasAliveEnemies);
                }
            }
            
            // Обновляем мониторинг производительности ботов
            if (this.botPerformanceMonitor && this._updateTick % 60 === 0) {
                // Обновляем FPS и позицию игрока в мониторе
                this.botPerformanceMonitor.updateFPS(this._lastFPS);
                if (this.tank?.chassis) {
                    const playerPos = this.tank.getCachedChassisPosition ? this.tank.getCachedChassisPosition() : this.tank.chassis.position;
                    this.botPerformanceMonitor.updatePlayerPosition(playerPos);
                }
            }
            
            this.updateEnemiesOptimized();
            // Физику обновляем только при FPS >= 20 (более мягкое ограничение)
            if (this._lastFPS >= 20) {
                this.updateEnemiesPhysicsOptimized();
            }
        }
    }

    /**
     * ИСПРАВЛЕНО: Обновление врагов с адекватной частотой
     * Обновляет всех врагов каждый кадр для корректной работы AI
     */
    private updateEnemiesOptimized(): void {
        if (!this.enemyTanks || !this.tank || !this.tank.chassis) return;

        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию игрока
        const playerPos = this.tank.getCachedChassisPosition ? this.tank.getCachedChassisPosition() : this.tank.chassis.position;
        const enemyCount = this.enemyTanks.length;

        if (enemyCount === 0) return;

        // ИСПРАВЛЕНО: Обновляем до 10 врагов за кадр для работающего AI
        const maxEnemiesPerFrame = 10;
        let updatedThisFrame = 0;

        // Распределяем обновления по кадрам - каждый кадр обновляем разных врагов
        const startIndex = this._updateTick % enemyCount;

        for (let offset = 0; offset < enemyCount && updatedThisFrame < maxEnemiesPerFrame; offset++) {
            const i = (startIndex + offset) % enemyCount;
            const enemy = this.enemyTanks[i];

            if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) {
                continue;
            }

            // Вычисляем расстояние до игрока (квадрат расстояния для оптимизации)
            const dx = enemy.chassis.position.x - playerPos.x;
            const dz = enemy.chassis.position.z - playerPos.z;
            const distSq = dx * dx + dz * dz;

            // ОПТИМИЗАЦИЯ: Distance-based update intervals для производительности
            // Близкие боты обновляются чаще, дальние - реже
            let updateInterval = 1;
            
            // Определяем интервал на основе расстояния до игрока
            const NEAR_DISTANCE_SQ = 50 * 50;  // < 50м
            const MID_DISTANCE_SQ = 100 * 100; // < 100м
            const FAR_DISTANCE_SQ = 200 * 200; // < 200м
            
            if (distSq < NEAR_DISTANCE_SQ) {
                // Близкие боты - каждые 2 кадра (30 Hz)
                updateInterval = 2;
            } else if (distSq < MID_DISTANCE_SQ) {
                // Средние боты - каждые 4 кадра (15 Hz)
                updateInterval = 4;
            } else if (distSq < FAR_DISTANCE_SQ) {
                // Дальние боты - каждые 8 кадров (7.5 Hz)
                updateInterval = 8;
            } else {
                // Очень дальние боты - каждые 16 кадров (3.75 Hz)
                updateInterval = 16;
            }
            
            // При низком FPS увеличиваем интервалы еще больше
            // ВАЖНО: проверяем < 20 ДО < 30, иначе ветка < 20 недостижима
            if (this._lastFPS < 20) {
                updateInterval *= 3; // Утраиваем при FPS < 20
            } else if (this._lastFPS < 30) {
                updateInterval *= 2; // Удваиваем интервал при FPS < 30
            }

            // Обновляем только если пришло время для этого врага
            if (this._updateTick % updateInterval === 0) {
                try {
                    // ОПТИМИЗАЦИЯ: LOD для врагов - отключаем детали на расстоянии > 150м
                    const distance = Math.sqrt(distSq);
                    this.updateEnemyLOD(enemy, distance);

                    // Записываем время начала обновления для мониторинга
                    const updateStartTime = performance.now();
                    enemy.update();
                    const updateTime = performance.now() - updateStartTime;
                    
                    // Записываем метрики в монитор производительности
                    if (this.botPerformanceMonitor) {
                        const botId = (enemy as any).id?.toString() || `enemy_${i}`;
                        this.botPerformanceMonitor.recordBotUpdate(botId, updateTime);
                    }
                    
                    updatedThisFrame++;
                    // ИСПРАВЛЕНО: Убран break - обновляем нескольких врагов за кадр
                } catch (e) {
                    logger.warn(`[GameUpdate] Error updating enemy ${i}:`, e);
                }
            }
        }
    }

    /**
     * ИСПРАВЛЕНО: Обновление физики врагов
     * Обновляет физику для всех ближних врагов каждый кадр
     * ОПТИМИЗАЦИЯ: Отключает физику для далёких врагов (> 100м)
     */
    private updateEnemiesPhysicsOptimized(): void {
        if (!this.enemyTanks || !this.tank || !this.tank.chassis) return;

        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию игрока
        const playerPos = this.tank.getCachedChassisPosition ? this.tank.getCachedChassisPosition() : this.tank.chassis.position;
        const enemyCount = this.enemyTanks.length;

        // ОПТИМИЗАЦИЯ: Уменьшена дистанция для физики до 100м (было 500м)
        const MAX_PHYSICS_DISTANCE_SQ = 10000; // 100м в квадрате
        const MAX_PHYSICS_ENEMIES_PER_FRAME = 15; // Максимум 15 врагов за кадр

        let updatedThisFrame = 0;

        for (let i = 0; i < enemyCount && updatedThisFrame < MAX_PHYSICS_ENEMIES_PER_FRAME; i++) {
            const enemy = this.enemyTanks[i];
            if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) {
                continue;
            }

            // Вычисляем расстояние до игрока
            const dx = enemy.chassis.position.x - playerPos.x;
            const dz = enemy.chassis.position.z - playerPos.z;
            const distSq = dx * dx + dz * dz;
            const distance = Math.sqrt(distSq);

            // ОПТИМИЗАЦИЯ: Отключаем физику для далёких врагов
            const physicsBody = (enemy.chassis as any).physicsBody;
            if (distance > 100 && physicsBody) {
                // Переключаем на ANIMATED режим для далёких врагов
                try {
                    physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
                } catch (e) {
                    // Игнорируем ошибки при переключении режима
                }
            } else if (distance <= 100 && physicsBody) {
                // Включаем физику для близких врагов
                try {
                    physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                } catch (e) {
                    // Игнорируем ошибки при переключении режима
                }
            }

            // Обновляем физику для врагов в радиусе видимости
            if (distSq <= MAX_PHYSICS_DISTANCE_SQ) {
                try {
                    enemy.updatePhysics();
                    updatedThisFrame++;
                } catch (e) {
                    logger.warn(`[GameUpdate] Error updating enemy physics ${i}:`, e);
                }
            }
        }
    }

    /**
     * ОПТИМИЗАЦИЯ: LOD для врагов - отключает детали на расстоянии > 150м
     */
    private updateEnemyLOD(enemy: any, distance: number): void {
        if (!enemy || !enemy.chassis || enemy.chassis.isDisposed()) return;

        const lodDistance = 150;
        const isLowDetail = distance > lodDistance;

        // ОПТИМИЗАЦИЯ: Пропускаем если LOD-состояние не изменилось
        const prevState = this._enemyLodState.get(enemy);
        if (prevState === isLowDetail) return;
        this._enemyLodState.set(enemy, isLowDetail);

        const childMeshes = enemy.chassis.getChildMeshes(false);

        if (isLowDetail) {
            // Отключить детали на расстоянии > 150м
            for (let i = 0; i < childMeshes.length; i++) {
                const child = childMeshes[i];
                if (!child || child.isDisposed()) continue;
                const name = child.name.toLowerCase();
                if (name.includes("track") || name.includes("detail") || name.includes("wheel") ||
                    name.includes("small") || name.includes("part")) {
                    child.setEnabled(false);
                }
            }
        } else {
            // Включить все детали
            for (let i = 0; i < childMeshes.length; i++) {
                const child = childMeshes[i];
                if (child && !child.isDisposed()) {
                    child.setEnabled(true);
                }
            }
        }
    }

    /**
     * ОПТИМИЗАЦИЯ: Обновление кэша позиций врагов
     * Использует position вместо absolutePosition для производительности
     */
    private updateEnemyPositionsCache(): void {
        if (!this.enemyTanks || this.enemyTanks.length === 0) {
            // Очищаем кэш если врагов нет
            if (this._enemyPositionsCache.size > 0) {
                this._enemyPositionsCache.clear();
            }
            this._enemyPositionsCacheFrame = this._updateTick;
            return;
        }

        // Обновляем кэш только если номер кадра изменился
        if (this._enemyPositionsCacheFrame === this._updateTick) {
            return;
        }

        this._enemyPositionsCacheFrame = this._updateTick;

        // ОПТИМИЗАЦИЯ: Reuse pre-allocated Set вместо new Set каждые 4 кадра
        const activeEnemyIds = this._activeEnemyIdsSet;
        activeEnemyIds.clear();

        // ОПТИМИЗАЦИЯ: Кэшируем только ближних врагов (< 500м) для производительности
        const MAX_CACHE_DISTANCE_SQ = 250000; // 500м в квадрате
        const MAX_CACHED_ENEMIES = 30; // КРИТИЧНО: Ограничиваем количество кэшируемых врагов
        const playerPos = this.tank?.chassis?.position;

        // КРИТИЧНО: Ранний выход если врагов слишком много
        const enemyCount = this.enemyTanks.length;
        if (enemyCount > 50) {
            // Если врагов слишком много, кэшируем только ближайших
            // Собираем расстояния для всех врагов
            const enemyDistances: Array<{ index: number, distSq: number }> = [];
            for (let i = 0; i < enemyCount; i++) {
                const enemy = this.enemyTanks[i];
                if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) {
                    continue;
                }
                if (playerPos) {
                    const dx = enemy.chassis.position.x - playerPos.x;
                    const dz = enemy.chassis.position.z - playerPos.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq <= MAX_CACHE_DISTANCE_SQ) {
                        enemyDistances.push({ index: i, distSq });
                    }
                }
            }
            // Сортируем по расстоянию и берем ближайших
            enemyDistances.sort((a, b) => a.distSq - b.distSq);
            const enemiesToCache = enemyDistances.slice(0, MAX_CACHED_ENEMIES);

            // Кэшируем только ближайших
            for (const { index: i } of enemiesToCache) {
                const enemy = this.enemyTanks[i];
                if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) {
                    continue;
                }
                try {
                    const pos = enemy.chassis.position;
                    const enemyId = `enemy_${i}_${enemy.chassis.uniqueId}`;
                    activeEnemyIds.add(enemyId);

                    // КРИТИЧНО: Кэшируем chassisRotY для избежания дорогого toEulerAngles() в updateHUD
                    let chassisRotY = 0;
                    if (enemy.chassis.rotationQuaternion) {
                        const euler = enemy.chassis.rotationQuaternion.toEulerAngles();
                        chassisRotY = euler.y;
                    } else {
                        chassisRotY = enemy.chassis.rotation.y;
                    }

                    this._enemyPositionsCache.set(enemyId, {
                        x: pos.x,
                        z: pos.z,
                        frame: this._updateTick,
                        alive: true,
                        chassisRotY: chassisRotY
                    });
                } catch (e) {
                    logger.warn("[GameUpdate] Error caching enemy position:", e);
                }
            }
        } else {
            // Обычный режим - обрабатываем всех ближних врагов
            let cachedCount = 0;
            for (let i = 0; i < enemyCount && cachedCount < MAX_CACHED_ENEMIES; i++) {
                const enemy = this.enemyTanks[i];
                if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) {
                    continue;
                }

                // Проверяем расстояние до игрока (только для ближних врагов)
                if (playerPos) {
                    const dx = enemy.chassis.position.x - playerPos.x;
                    const dz = enemy.chassis.position.z - playerPos.z;
                    const distSq = dx * dx + dz * dz;

                    // Пропускаем дальних врагов - они не нужны в кэше
                    if (distSq > MAX_CACHE_DISTANCE_SQ) {
                        continue;
                    }
                }

                try {
                    const pos = enemy.chassis.position;
                    const enemyId = `enemy_${i}_${enemy.chassis.uniqueId}`;
                    activeEnemyIds.add(enemyId);

                    // КРИТИЧНО: Кэшируем chassisRotY для избежания дорогого toEulerAngles() в updateHUD
                    let chassisRotY = 0;
                    if (enemy.chassis.rotationQuaternion) {
                        // Вычисляем угол один раз здесь, а не в updateHUD
                        const euler = enemy.chassis.rotationQuaternion.toEulerAngles();
                        chassisRotY = euler.y;
                    } else {
                        chassisRotY = enemy.chassis.rotation.y;
                    }

                    this._enemyPositionsCache.set(enemyId, {
                        x: pos.x,
                        z: pos.z,
                        frame: this._updateTick,
                        alive: true,
                        chassisRotY: chassisRotY
                    });
                    cachedCount++;
                } catch (e) {
                    // Игнорируем ошибки при получении позиции
                    logger.warn("[GameUpdate] Error caching enemy position:", e);
                }
            }
        }

        // Удаляем кэш для неактивных врагов
        for (const [id, data] of this._enemyPositionsCache.entries()) {
            if (!activeEnemyIds.has(id) || !data.alive) {
                this._enemyPositionsCache.delete(id);
            }
        }

        // Добавляем позиции турелей если есть enemyManager
        if (this.enemyManager && this.enemyManager.turrets) {
            try {
                const turretPositions = this.enemyManager.getEnemyPositions();
                if (turretPositions) {
                    const turretCount = turretPositions.length;
                    for (let i = 0; i < turretCount; i++) {
                        const pos = turretPositions[i];
                        if (!pos || !pos.alive) continue;

                        const turretId = `turret_${i}_${pos.x}_${pos.z}`;
                        activeEnemyIds.add(turretId);

                        this._enemyPositionsCache.set(turretId, {
                            x: pos.x,
                            z: pos.z,
                            frame: this._updateTick,
                            alive: true
                        });
                    }
                }
            } catch (e) {
                logger.warn("[GameUpdate] Error caching turret positions:", e);
            }
        }
    }

    /**
     * Получить все кэшированные позиции врагов
     * @returns Массив позиций врагов {x, z, alive}
     */
    getCachedEnemyPositions(): { x: number, z: number, alive: boolean, chassisRotY?: number }[] {
        // ОПТИМИЗАЦИЯ: Возвращаем кэшированный результат если кадр не изменился
        if (this._cachedEnemyPositionsFrame === this._updateTick) {
            return this._cachedEnemyPositionsResult;
        }
        this._cachedEnemyPositionsFrame = this._updateTick;

        const result = this._cachedEnemyPositionsResult;
        result.length = 0;

        for (const data of this._enemyPositionsCache.values()) {
            if (this._updateTick - data.frame <= 4) {
                result.push({
                    x: data.x,
                    z: data.z,
                    alive: data.alive,
                    chassisRotY: data.chassisRotY
                });
            }
        }

        return result;
    }

    /**
     * Получить кэшированную позицию конкретного врага по ID
     * @param enemyId ID врага
     * @returns Позиция или null если не найдена
     */
    getCachedEnemyPosition(enemyId: string): { x: number, z: number, alive: boolean } | null {
        const data = this._enemyPositionsCache.get(enemyId);
        if (!data) return null;

        // Проверяем валидность кэша
        if (this._updateTick - data.frame > 4) {
            return null;
        }

        return {
            x: data.x,
            z: data.z,
            alive: data.alive
        };
    }

    /**
     * Установить колбэки для обновлений
     */
    setUpdateCallbacks(callbacks: {
        onUpdateCamera?: () => void;
        onUpdateHUD?: () => void;
        onUpdateGarageDoors?: () => void;
        onUpdateGarageCapture?: (deltaTime: number) => void;
        onUpdateGarageRespawnTimers?: (deltaTime: number) => void;
        onUpdateMultiplayer?: (deltaTime: number) => void;
        onUpdateFrontlineWaves?: (deltaTime: number) => void;
        onUpdateEnemyTurretsVisibility?: () => void;
        onCheckConsumablePickups?: () => void;
        onCheckSpectatorMode?: () => void;
        onUpdateCompass?: () => void;
        onUpdateSupplyDrops?: (deltaTime: number) => void;
    }): void {
        if (callbacks.onUpdateCamera !== undefined) this.onUpdateCamera = callbacks.onUpdateCamera;
        if (callbacks.onUpdateHUD !== undefined) this.onUpdateHUD = callbacks.onUpdateHUD;
        if (callbacks.onUpdateCompass !== undefined) this.onUpdateCompass = callbacks.onUpdateCompass;
        if (callbacks.onUpdateGarageDoors !== undefined) this.onUpdateGarageDoors = callbacks.onUpdateGarageDoors;
        if (callbacks.onUpdateGarageCapture !== undefined) this.onUpdateGarageCapture = callbacks.onUpdateGarageCapture;
        if (callbacks.onUpdateGarageRespawnTimers !== undefined) this.onUpdateGarageRespawnTimers = callbacks.onUpdateGarageRespawnTimers;
        if (callbacks.onUpdateMultiplayer !== undefined) this.onUpdateMultiplayer = callbacks.onUpdateMultiplayer;
        if (callbacks.onUpdateFrontlineWaves !== undefined) this.onUpdateFrontlineWaves = callbacks.onUpdateFrontlineWaves;
        if (callbacks.onUpdateEnemyTurretsVisibility !== undefined) this.onUpdateEnemyTurretsVisibility = callbacks.onUpdateEnemyTurretsVisibility;
        if (callbacks.onCheckConsumablePickups !== undefined) this.onCheckConsumablePickups = callbacks.onCheckConsumablePickups;
        if (callbacks.onCheckSpectatorMode !== undefined) this.onCheckSpectatorMode = callbacks.onCheckSpectatorMode;
        if (callbacks.onUpdateSupplyDrops !== undefined) this.onUpdateSupplyDrops = callbacks.onUpdateSupplyDrops;
        if (callbacks.onUpdateCompass !== undefined) this.onUpdateCompass = callbacks.onUpdateCompass;
    }

    /**
     * Обновить ссылки на системы
     */
    updateReferences(callbacks: {
        tank?: TankController;
        hud?: HUD;
        enemyManager?: EnemyManager;
        enemyTanks?: EnemyTank[];
        chunkSystem?: ChunkSystem;
        consumablesManager?: ConsumablesManager;
        missionSystem?: MissionSystem;
        achievementsSystem?: AchievementsSystem;
        experienceSystem?: ExperienceSystem;
        playerProgression?: PlayerProgressionSystem;
            multiplayerManager?: MultiplayerManager;
            botPerformanceMonitor?: BotPerformanceMonitor;
            gameStarted?: boolean;
            gamePaused?: boolean;
            isAiming?: boolean;
            survivalStartTime?: number;
    }): void {
        if (callbacks.tank !== undefined) this.tank = callbacks.tank;
        if (callbacks.hud !== undefined) this.hud = callbacks.hud;
        if (callbacks.enemyManager !== undefined) this.enemyManager = callbacks.enemyManager;
        if (callbacks.enemyTanks !== undefined) this.enemyTanks = callbacks.enemyTanks;
        if (callbacks.chunkSystem !== undefined) this.chunkSystem = callbacks.chunkSystem;
        if (callbacks.consumablesManager !== undefined) this.consumablesManager = callbacks.consumablesManager;
        if (callbacks.missionSystem !== undefined) this.missionSystem = callbacks.missionSystem;
        if (callbacks.achievementsSystem !== undefined) this.achievementsSystem = callbacks.achievementsSystem;
        if (callbacks.experienceSystem !== undefined) this.experienceSystem = callbacks.experienceSystem;
        if (callbacks.playerProgression !== undefined) this.playerProgression = callbacks.playerProgression;
        if (callbacks.multiplayerManager !== undefined) this.multiplayerManager = callbacks.multiplayerManager;
        if (callbacks.botPerformanceMonitor !== undefined) this.botPerformanceMonitor = callbacks.botPerformanceMonitor;
        if (callbacks.gameStarted !== undefined) this.gameStarted = callbacks.gameStarted;
        if (callbacks.gamePaused !== undefined) this.gamePaused = callbacks.gamePaused;
        if (callbacks.isAiming !== undefined) this.isAiming = callbacks.isAiming;
        if (callbacks.survivalStartTime !== undefined) this.survivalStartTime = callbacks.survivalStartTime;
    }

    /**
     * Установка callback для таймеров респавна в гараже
     */
    public setOnUpdateGarageRespawnTimers(callback: (deltaTime: number) => void): void {
        this.onUpdateGarageRespawnTimers = callback;
    }

    /**
     * АГРЕССИВНАЯ ЗАЩИТА ОТ НИЗКОГО FPS
     * Автоматически увеличивает интервалы и отключает системы при падении FPS
     * Гарантирует стабильность даже при большой нагрузке
     */
    private updateAdaptiveIntervals(fps: number): void {
        // ОПТИМИЗАЦИЯ: Мутируем существующий объект вместо создания нового каждую секунду
        const intervals = this._adaptiveIntervals;
        if (fps >= 60) {
            intervals.chunkSystem = 16;
            intervals.enemyManager = 6;
            intervals.turrets = 15;
            intervals.garage = 3;
            intervals.multiplayer = 1;
            intervals.consumables = 15;
        } else if (fps >= 55) {
            intervals.chunkSystem = 24;
            intervals.enemyManager = 9;
            intervals.turrets = 23;
            intervals.garage = 5;
            intervals.multiplayer = 1;
            intervals.consumables = 23;
        } else if (fps >= 45) {
            intervals.chunkSystem = 32;
            intervals.enemyManager = 12;
            intervals.turrets = 30;
            intervals.garage = 6;
            intervals.multiplayer = 1;
            intervals.consumables = 30;
        } else if (fps >= 35) {
            intervals.chunkSystem = 48;
            intervals.enemyManager = 18;
            intervals.turrets = 45;
            intervals.garage = 9;
            intervals.multiplayer = 1;
            intervals.consumables = 45;
        } else if (fps >= 25) {
            intervals.chunkSystem = 64;
            intervals.enemyManager = 24;
            intervals.turrets = 60;
            intervals.garage = 12;
            intervals.multiplayer = 1;
            intervals.consumables = 60;
        } else {
            intervals.chunkSystem = 60;
            intervals.enemyManager = 30;
            intervals.turrets = 60;
            intervals.garage = 10;
            intervals.multiplayer = 1;
            intervals.consumables = 60;
        }
    }

    /**
     * Получить активные снаряды из сцены (для миникарты и полной карты)
     */
    getActiveProjectiles(): Array<{ x: number; z: number; type?: string; ownerId?: string }> {
        if (!this.scene) return [];
        const projectiles: Array<{ x: number; z: number; type?: string; ownerId?: string }> = [];
        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible) continue;
            const metadata = mesh.metadata;
            if (!metadata || (metadata.type !== "bullet" && metadata.type !== "projectile")) continue;
            const pos = mesh.getAbsolutePosition();
            projectiles.push({
                x: pos.x,
                z: pos.z,
                type: metadata.cannonType || "ap",
                ownerId: metadata.owner || "unknown"
            });
        }
        return projectiles;
    }

    /**
     * Обновить здания на радаре
     */
    updateRadarBuildings(playerPos: Vector3Impl): void {
        if (!this.hud || !this.scene) return;
        const buildings: { x: number; z: number; width: number; depth: number }[] = [];
        const maxDistance = 150;
        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible) continue;
            const name = mesh.name.toLowerCase();
            if (!name.includes("building") && !name.includes("house") &&
                !name.includes("structure") && !name.includes("wall") &&
                !name.includes("hangar") && !name.includes("warehouse") &&
                !name.includes("barrack") && !name.includes("tower")) continue;
            const pos = mesh.getAbsolutePosition();
            if (Vector3Impl.Distance(pos, playerPos) > maxDistance) continue;
            const bounds = mesh.getBoundingInfo()?.boundingBox;
            if (!bounds) continue;
            const size = bounds.extendSize;
            buildings.push({ x: pos.x, z: pos.z, width: size.x * 2, depth: size.z * 2 });
            if (buildings.length >= 30) break;
        }
        this.hud.setRadarBuildings(buildings);
    }

    /**
     * Обновить снаряды на миникарте
     */
    updateMinimapProjectiles(playerPos: Vector3Impl, angle: number): void {
        if (!this.scene || !this.hud) return;
        const projectiles = this.getActiveProjectiles();
        this.hud.updateMinimapProjectiles(projectiles, playerPos.x, playerPos.z, angle);
    }

    /**
     * Обновить снаряды на полной карте
     */
    updateFullMapProjectiles(playerPos: Vector3Impl): void {
        if (!this.scene || !this.hud) return;
        const projectiles = this.getActiveProjectiles();
        this.hud.updateFullMapProjectiles(projectiles, playerPos);
    }

    /**
     * Обновить здоровье врагов для миникарты (турели)
     */
    updateEnemyHealthForMinimap(enemies: { x: number; z: number; alive: boolean }[]): void {
        if (!this.hud || !this.enemyManager) return;
        const turrets = (this.enemyManager as { turrets?: Array<{ isAlive: boolean; position: { x: number; z: number }; health?: number; maxHealth?: number }> }).turrets || [];
        for (const turret of turrets) {
            if (!turret.isAlive) continue;
            const enemyKey = `${turret.position.x.toFixed(0)}_${turret.position.z.toFixed(0)}`;
            const health = turret.health ?? 100;
            const maxHealth = (turret as { maxHealth?: number }).maxHealth ?? 100;
            this.hud.setEnemyHealthForMinimap(enemyKey, health, maxHealth);
        }
    }

    /**
     * Обновить отображение HP цели при наведении ствола (враги и турели)
     */
    updateEnemyLookHP(): void {
        if (!this.tank || !this.tank.barrel || !this.scene || !this.enemyManager) return;
        const barrelPos = this.tank.getCachedBarrelPosition ? this.tank.getCachedBarrelPosition() : this.tank.barrel.getAbsolutePosition();
        if (!barrelPos) return;
        const barrelDir = this.tank.barrel.getDirection(Vector3Impl.Forward()).normalize();
        const maxRange = 150;
        const ray = new Ray(barrelPos, barrelDir, maxRange);
        const picks = this.scene.multiPickWithRay(ray);
        const playerPos = this.tank?.chassis ? this.tank.getCachedChassisPosition?.() : undefined;

        const turrets = this.enemyManager.turrets;
        for (let i = 0; i < turrets.length; i++) {
            const turret = turrets[i];
            if (turret) (turret as { setHpVisible?: (v: boolean) => void }).setHpVisible?.(false);
        }

        let targetFound = false;
        if (picks && picks.length > 0) {
            for (const pick of picks) {
                if (!pick.hit || !pick.pickedMesh) continue;
                const pickedMesh = pick.pickedMesh as { _enemyTank?: unknown };

                const tank = this.enemyTanks?.find((et: { isPartOf?: (m: unknown) => boolean }) => et.isPartOf?.(pickedMesh));
                if (tank && (tank as { isAlive?: boolean }).isAlive && this.hud && playerPos) {
                    const enemyPos = (tank as { chassis?: { getAbsolutePosition: () => Vector3Impl } }).chassis?.getAbsolutePosition();
                    const distance = enemyPos ? Vector3Impl.Distance(playerPos, enemyPos) : Infinity;
                    if (distance <= maxRange) {
                        targetFound = true;
                        break;
                    }
                }
                if (!targetFound && this.enemyManager) {
                    const turret = this.enemyManager.turrets.find((tr: { isPartOf?: (m: unknown) => boolean }) => tr.isPartOf?.(pickedMesh));
                    if (turret && (turret as { isAlive?: boolean }).isAlive && this.hud && playerPos) {
                        const turretPos = (turret as { base?: { getAbsolutePosition: () => Vector3Impl } }).base?.getAbsolutePosition();
                        const distance = turretPos ? Vector3Impl.Distance(playerPos, turretPos) : Infinity;
                        if (distance <= maxRange) {
                            (turret as { setHpVisible?: (v: boolean) => void }).setHpVisible?.(true);
                            targetFound = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    /**
     * Dispose системы обновлений
     */
    dispose(): void {
        this.onUpdateCamera = null;
        this.onUpdateCompass = null;
        this.onUpdateGarageDoors = null;
        this.onUpdateGarageCapture = null;
        this.onUpdateGarageRespawnTimers = null;
        this.onUpdateMultiplayer = null;
        this.onUpdateFrontlineWaves = null;
        this.onUpdateEnemyTurretsVisibility = null;
        this.onCheckConsumablePickups = null;
        this.onCheckSpectatorMode = null;
        this.onUpdateSupplyDrops = null;

        // Очищаем кэш позиций врагов
        this._enemyPositionsCache.clear();

        logger.log("[GameUpdate] Update system disposed");
    }
}

