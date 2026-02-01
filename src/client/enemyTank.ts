import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsBody,
    PhysicsMotionType,
    PhysicsShape,
    PhysicsShapeType,
    PhysicsShapeContainer,
    Quaternion,
    Mesh,
    AbstractMesh,
    Observable,
    Ray,
    Matrix,
    DynamicTexture
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { logger } from "./utils/logger";
import { AIPathfinding } from "./ai/AIPathfinding";
import type { RoadNetwork } from "./roadNetwork";
import { PHYSICS_CONFIG } from "./config/physicsConfig";
import { CHASSIS_TYPES, CANNON_TYPES, ChassisType, CannonType } from "./tankTypes";
import { TRACK_TYPES, TrackType } from "./trackTypes";
import { MODULE_PRESETS, ModuleType } from "./tank/modules/ModuleTypes";
import { timeProvider } from "./optimization/TimeProvider";
import { createUniqueCannon, CannonAnimationElements } from "./tank/tankCannon";
import { CHASSIS_SIZE_MULTIPLIERS } from "./tank/tankChassis";
import { getAttachmentOffset } from "./tank/tankEquipment";
import type { AICoordinator } from "./ai/AICoordinator";
import { getMapBoundsFromConfig } from "./maps/MapConstants";
import { RicochetSystem, DEFAULT_RICOCHET_CONFIG } from "./tank/combat/RicochetSystem";
import { GlobalIntelligenceManager } from "./ai/GlobalIntelligenceManager";

// === AI States ===
type AIState = "idle" | "patrol" | "chase" | "attack" | "flank" | "retreat" | "evade" | "capturePOI" | "ambush" | "bait";

export class EnemyTank {
    private scene: Scene;
    private soundManager: SoundManager;
    private effectsManager: EffectsManager;

    // === Visuals ===
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    private wheels: Mesh[] = [];
    private cannonAnimationElements: CannonAnimationElements = {};

    // HP Bar Refactor: Temporary on-hit display with distance
    private healthBar: Mesh | null = null;
    private healthBarBackground: Mesh | null = null;
    private lastHitTime: number = 0;
    private readonly HP_BAR_VISIBLE_DURATION = 3000;
    private distanceTextPlane: Mesh | null = null;
    private distanceTexture: DynamicTexture | null = null;
    private _lastHealth: number = 100;

    // === Physics (SAME AS PLAYER!) ===
    physicsBody!: PhysicsBody;

    // Physics Config (SCALED BY CHASSIS SIZE)
    private mass: number = PHYSICS_CONFIG.enemyTank.basic.mass; // Масса масштабируется по размеру корпуса
    private hoverHeight = PHYSICS_CONFIG.enemyTank.basic.hoverHeight;
    private hoverStiffness: number = PHYSICS_CONFIG.enemyTank.stability.hoverStiffness; // Жесткость подвески (масштабируется)
    private hoverDamping: number = PHYSICS_CONFIG.enemyTank.stability.hoverDamping; // Демпфирование подвески (масштабируется)
    private linearDamping: number = PHYSICS_CONFIG.enemyTank.stability.linearDamping;
    private angularDamping: number = PHYSICS_CONFIG.enemyTank.stability.angularDamping;
    private turnForceMultiplier: number = 1.0; // Multiplier for turn torque (scaled by mass)

    // Movement (SCALED BY CHASSIS SIZE)
    private moveSpeed: number = PHYSICS_CONFIG.enemyTank.basic.moveSpeed; // Скорость нормализована относительно массы
    private turnSpeed: number = PHYSICS_CONFIG.enemyTank.basic.turnSpeed; // Скорость поворота нормализована относительно массы
    private acceleration: number = PHYSICS_CONFIG.enemyTank.basic.acceleration; // Ускорение масштабируется по массе
    private maxAngularVelocity: number = 10.0; // Максимальная угловая скорость (ограничение для маленьких танков)

    // СИСТЕМА "СКРУГЛЁННЫЕ ГУСЕНИЦЫ" - СИНХРОНИЗИРОВАНО С ИГРОКОМ из PHYSICS_CONFIG
    private climbAssistForce = PHYSICS_CONFIG.enemyTank.climbing.climbAssistForce;
    private maxClimbHeight = PHYSICS_CONFIG.enemyTank.climbing.maxClimbHeight;
    private slopeBoostMax = PHYSICS_CONFIG.enemyTank.climbing.slopeBoostMax;
    private frontClimbForce = PHYSICS_CONFIG.enemyTank.climbing.frontClimbForce;
    private wallPushForce = PHYSICS_CONFIG.enemyTank.climbing.wallPushForce;
    private climbTorque = PHYSICS_CONFIG.enemyTank.climbing.climbTorque;

    // Smooth inputs (like player)
    private throttleTarget = 0;
    private steerTarget = 0;
    private smoothThrottle = 0;
    private smoothSteer = 0;

    // Для плавного изменения физики (предотвращение дёргания)
    private _lastAccel = 0;
    private _lastTurnAccel = 0;

    // Turret control (smooth like player)
    private turretTargetAngle = 0;
    private turretCurrentAngle = 0;
    private turretAcceleration = 0;
    private turretAccelStartTime = 0;
    private turretSpeed = 0.12; // УВЕЛИЧЕНО: Быстрое наведение башни (было 0.04)

    // Barrel pitch control (vertical aiming)
    private barrelTargetPitch = 0; // Целевой угол наклона ствола
    private barrelCurrentPitch = 0; // Текущий угол (для плавного наведения)
    private turretLerpSpeed = 0.25; // УВЕЛИЧЕНО: Быстрая интерполяция башни (было 0.15)

    // Спавн: нормаль поверхности для выравнивания
    private spawnGroundNormal: Vector3 = Vector3.Up();

    // === Equipment (random selection) ===
    private chassisType!: ChassisType;
    private cannonType!: CannonType;
    private trackType!: TrackType;
    private modules: ModuleType[] = [];
    private moduleIds: string[] = []; // IDs from server
    private moduleMeshes: Mesh[] = [];

    // === AI State ===
    private target: { chassis: Mesh, isAlive: boolean, currentHealth?: number, turret?: Mesh, barrel?: Mesh } | null = null;
    private state: AIState = "patrol"; // ИСПРАВЛЕНО: По умолчанию патрулирование
    private patrolPoints: Vector3[] = [];
    private currentPatrolIndex = 0;
    private stateTimer = 0;

    // POI System integration
    private targetPOI: { position: Vector3, type: string, id: string } | null = null;
    private poiCaptureTime = 0; // Time spent at POI

    // AI properties - EXTREME: Максимально агрессивный ИИ
    private attackRange = 200; // EXTREME: +43% (было 140) - атакуют с большей дистанции

    // AI Decisions
    private lastDecisionTime = 0;
    private decisionInterval = 100; // ИСПРАВЛЕНО: 100мс для стабильности (было 0 - вызывало проблемы)
    // NIGHTMARE: Для nightmare сложности decisionInterval будет переопределен на 0 в applyDifficultySettings
    private flankDirection = 1; // 1 = right, -1 = left
    private evadeDirection = new Vector3(0, 0, 0);
    private lastTargetPos = new Vector3(0, 0, 0);
    private targetVelocity = new Vector3(0, 0, 0);

    // Подавляющий огонь по последней известной позиции (уменьшено для точности)
    private lastTargetSeenTime = 0; // Время последнего наблюдения цели
    private readonly SUPPRESSIVE_FIRE_DURATION = 500; // 0.5 секунды подавляющего огня (уменьшено с 3000)
    private readonly MAX_SUPPRESSIVE_DISTANCE = 50; // Макс. расстояние между lastTargetPos и текущей позицией для suppressive fire

    // EXTREME: История движения цели для максимально точного предсказания
    private targetPositionHistory: Array<{ pos: Vector3, time: number }> = [];
    // Stuck detection properties
    private lastPositions: Array<{ pos: Vector3, time: number }> = [];
    private lastStuckCheckPos: Vector3 = new Vector3(0, 0, 0); // Инициализируем сразу!
    private positionHistoryTimer = 0;
    private isStuck = false;
    private stuckTimer = 0;
    private readonly MAX_POSITION_HISTORY = 50; // EXTREME: +67% (было 30) - глубокий анализ траектории
    private readonly POSITION_HISTORY_INTERVAL = 50; // EXTREME: -50% (было 100) - быстрее обновление
    // NIGHTMARE: Для nightmare сложности эти параметры будут еще лучше
    private lastPositionHistoryUpdate = 0;

    // EXTREME: Анализ паттернов движения
    private movementPattern: "linear" | "zigzag" | "circular" | "erratic" = "linear";
    private movementPatternConfidence = 0.0; // 0.0 - 1.0
    private lastPatternAnalysisTime = 0;
    private readonly PATTERN_ANALYSIS_INTERVAL = 1000; // EXTREME: -50% (было 2000) - чаще анализ

    // EXTREME: Система уклонения от снарядов игрока
    private incomingProjectiles: Array<{ mesh: AbstractMesh, velocity: Vector3, lastUpdate: number }> = [];
    private lastProjectileScanTime = 0;
    private readonly PROJECTILE_SCAN_INTERVAL = 15; // EXTREME: -50% (было 30) - максимальная частота сканирования
    private readonly PROJECTILE_DETECTION_RANGE = 150; // EXTREME: +50% (было 100) - дальше видят снаряды
    private readonly PROJECTILE_DODGE_TIME_MIN = 0.3; // EXTREME: -40% (было 0.5) - раньше начинают уклонение
    private readonly PROJECTILE_DODGE_TIME_MAX = 2.0; // EXTREME: +33% (было 1.5) - дольше уклоняются
    private isDodgingProjectile = false;
    private dodgeDirection = Vector3.Zero();
    private dodgeEndTime = 0;

    // EXTREME: Групповое поведение
    private nearbyEnemies: EnemyTank[] = []; // Близкие союзники для координации
    private lastGroupCheckTime = 0;
    private readonly GROUP_CHECK_INTERVAL = 250; // EXTREME: -50% (было 500) - мгновенная координация

    // EXTREME: Интеграция с AI Coordinator
    private aiCoordinator: AICoordinator | null = null;
    private readonly GROUP_COORDINATION_RANGE = 200; // EXTREME: +67% (было 120) - огромный радиус координации!

    // EXTREME: Система укрытий и тактического позиционирования
    private lastCoverCheckTime = 0;
    private readonly COVER_CHECK_INTERVAL = 400; // EXTREME: -50% (было 800) - мгновенный поиск укрытий
    private currentCoverPosition: Vector3 | null = null;
    private seekingCover = false;
    private coverType: "full" | "partial" | "temporary" | null = null; // Тип текущего укрытия
    private isInCover = false; // Флаг что бот находится в укрытии
    private peekAndShootTimer = 0; // Таймер для peek-and-shoot тактики
    private readonly PEEK_AND_SHOOT_INTERVAL = 2000; // Интервал между peek-and-shoot (мс)
    private lastPeekTime = 0;

    // УЛУЧШЕНО: Кэширование для оптимизации производительности
    private coverCache: { position: Vector3 | null, timestamp: number } | null = null;
    private readonly COVER_CACHE_TTL = 3000; // Кэш укрытий живёт 3 секунды
    private pathCache: { path: Vector3[], start: Vector3, goal: Vector3, timestamp: number } | null = null;
    private readonly PATH_CACHE_TTL = 2000; // Кэш путей живёт 2 секунды

    // УЛУЧШЕНО: AI Pathfinding для умной навигации
    private pathfinding: AIPathfinding | null = null;
    private currentPath: Vector3[] = [];
    private currentPathIndex = 0;
    private lastPathUpdate = 0;
    private readonly PATH_UPDATE_INTERVAL = 1000; // УЛУЧШЕНО: Обновляем путь каждую секунду (было 2)
    private readonly PATH_UPDATE_INTERVAL_STUCK = 500; // При застревании обновляем каждые 0.5 сек
    private currentPathTarget: Vector3 | null = null; // Текущая цель пути

    // EXTREME: Мгновенная адаптация к стилю игры игрока
    private playerStyle: "aggressive" | "defensive" | "balanced" = "balanced";
    private playerStyleSamples: number[] = []; // История расстояний до игрока
    private lastStyleUpdateTime = 0;
    private readonly STYLE_UPDATE_INTERVAL = 500; // EXTREME: -50% (было 1000) - мгновенная адаптация!

    // EXTREME: Молниеносная реакция на урон
    private lastDamageTime = 0;
    private damageReactionCooldown = 0;
    private consecutiveHits = 0;

    // EXTREME: Синхронизация групповых атак
    private lastGroupAttackTime = 0;
    private readonly GROUP_ATTACK_SYNC_WINDOW = 250; // EXTREME: -50% (было 500) - мгновенная синхронизация!
    private groupAttackCooldown = 0;

    // EXTREME: Постоянное использование рельефа
    private lastTerrainCheckTime = 0;
    private readonly TERRAIN_CHECK_INTERVAL = 2000; // EXTREME: -50% (было 4000) - чаще проверяют рельеф
    private preferredHeightPosition: Vector3 | null = null;

    // EXTREME: Продвинутые тактики
    private ambushPosition: Vector3 | null = null;
    private ambushTimer = 0;
    private readonly AMBUSH_DURATION = 12000; // EXTREME: +50% (было 8000) - дольше в засаде
    private baitPosition: Vector3 | null = null;
    private baitTimer = 0;
    private readonly BAIT_DURATION = 8000; // EXTREME: +60% (было 5000) - дольше заманивают
    private lastHighGroundCheck = 0;
    private readonly HIGH_GROUND_CHECK_INTERVAL = 2500; // EXTREME: -50% (было 5000) - чаще ищут высоты
    private highGroundPosition: Vector3 | null = null;

    // EXTREME: Максимальная эскалация сложности
    private combatTime = 0; // Время в бою
    private killsCount = 0; // Количество убийств (для эскалации и статистики)
    private deathsCount = 0; // Количество смертей (для статистики TAB меню)
    private adaptiveIntelligence = 3.0; // EXTREME: +20% (было 2.5) - ЕЩЁ умнее! (локальный, если глобальный выключен)

    // ОПТИМИЗАЦИЯ: Кэшируем ссылку на GlobalIntelligenceManager для производительности
    private static _cachedGlobalIntel: GlobalIntelligenceManager | null = null;
    private static _lastGlobalIntelCheck = 0;
    private static readonly GLOBAL_INTEL_CHECK_INTERVAL = 1000; // Проверяем раз в секунду

    /**
     * Получить эффективный интеллект бота.
     * Если включён глобальный интеллект - использует его, иначе - локальный.
     * ОПТИМИЗИРОВАНО: Кэшируем ссылку на менеджер для производительности
     */
    private getEffectiveIntelligence(): number {
        // PERFORMANCE: Используем кэшированное время вместо Date.now()
        const now = timeProvider.now;
        if (!EnemyTank._cachedGlobalIntel || (now - EnemyTank._lastGlobalIntelCheck) > EnemyTank.GLOBAL_INTEL_CHECK_INTERVAL) {
            EnemyTank._cachedGlobalIntel = GlobalIntelligenceManager.getInstance();
            EnemyTank._lastGlobalIntelCheck = now;
        }

        const globalIntel = EnemyTank._cachedGlobalIntel;
        if (globalIntel && globalIntel.isEnabled()) {
            return globalIntel.get();
        }
        return this.adaptiveIntelligence;
    }

    // EXTREME: Быстрая приоритизация целей
    private targetPriority = 0; // 0 = нет цели, 1-10 = приоритет цели
    private lastTargetEvaluationTime = 0;
    private readonly TARGET_EVAL_INTERVAL = 1000; // EXTREME: -60% (было 2500) - быстрее оценивают цели

    // === Stats ===
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;

    // === Tracer Marking ===
    private isMarked = false;
    private markedUntil = 0;
    private markGlow: Mesh | null = null;

    // === Combat === EXTREME AI
    private lastShotTime = 0;
    private cooldown = 1200; // УЛУЧШЕНО: Уменьшено с 1800 до 1200 для более активной стрельбы
    private isReloading = false;
    private range = 100;           // EXTREME: +67% (было 60) - дальность атаки
    private detectRange = 600;    // УВЕЛИЧЕНО: +50% (было 400) - ещё больший радиус обнаружения
    private optimalRange = 50;     // EXTREME: +43% (было 35) - дальше оптимальная дистанция
    private aimAccuracy = 1.0;   // EXTREME: Идеальная точность (было 0.98)

    // Параметры из пушки (устанавливаются в applyDifficultySettings)
    private damage = 25; // Будет перезаписано из cannonType
    private projectileSpeed = 200; // Будет перезаписано из cannonType
    private projectileSize = 0.2; // Будет перезаписано из cannonType
    private weaponMaxRange = 268; // Максимальная эффективная дальность оружия (будет перезаписано из cannonType)

    // УЛУЧШЕНО: Адаптивная точность в зависимости от дистанции и сложности
    // HARD режим: почти идеальная точность!
    private getAdaptiveAccuracy(distance: number): number {
        const baseAccuracy = this.aimAccuracy;

        // СЛОЖНЫЙ РЕЖИМ: минимальный штраф, почти идеальная точность
        let difficultyMultiplier: number;
        let distancePenaltyMax: number;
        let healthPenaltyMax: number;

        if (this.difficulty === "nightmare") {
            difficultyMultiplier = 1.0;
            distancePenaltyMax = 0.0; // NIGHTMARE: НЕТ штрафа на дистанции - идеальная точность на любой дистанции!
            healthPenaltyMax = 0.0; // NIGHTMARE: НЕТ штрафа при низком HP - идеальная точность всегда!
        } else if (this.difficulty === "hard") {
            difficultyMultiplier = 1.0;
            distancePenaltyMax = 0.02; // МАКСИМАЛЬНО: Уменьшено с 0.04 до 0.02 - практически нет штрафа на дистанции!
            healthPenaltyMax = 0.01; // МАКСИМАЛЬНО: Уменьшено с 0.02 до 0.01 - практически нет штрафа при низком HP!
        } else if (this.difficulty === "medium") {
            difficultyMultiplier = 0.96; // МАКСИМАЛЬНО: Увеличено с 0.92
            distancePenaltyMax = 0.08; // МАКСИМАЛЬНО: Уменьшено с 0.12
            healthPenaltyMax = 0.05; // МАКСИМАЛЬНО: Уменьшено с 0.08
        } else {
            difficultyMultiplier = 0.90; // МАКСИМАЛЬНО: Увеличено с 0.85
            distancePenaltyMax = 0.12; // МАКСИМАЛЬНО: Уменьшено с 0.15
            healthPenaltyMax = 0.08; // МАКСИМАЛЬНО: Уменьшено с 0.10
        }

        const distancePenalty = Math.min(distancePenaltyMax, distance / 350); // УЛУЧШЕНО: Больше дистанция без штрафа
        const healthPenalty = (1.0 - this.currentHealth / this.maxHealth) * healthPenaltyMax;

        // EXTREME: Идеальная минимальная точность на всех уровнях!
        const minAccuracy = this.difficulty === "nightmare" ? 1.0 : (this.difficulty === "hard" ? 1.0 : (this.difficulty === "medium" ? 0.97 : 0.94)); // NIGHTMARE: Идеальная точность всегда!
        return Math.max(minAccuracy, baseAccuracy * difficultyMultiplier - distancePenalty - healthPenalty);
    }

    // === Difficulty ===
    private difficulty: "easy" | "medium" | "hard" | "nightmare" = "nightmare"; // NIGHTMARE по умолчанию!
    private difficultyScale: number = 1; // Плавный множитель сложности по прогрессу игрока и длительности сессии

    // NOTE: state and target are defined earlier in the class (lines 122-123)

    // Anti-Stuck
    private readonly STUCK_CHECK_INTERVAL: number = 1000;
    private readonly STUCK_THRESHOLD: number = 0.5;
    private consecutiveStuckCount: number = 0;
    private lastUnstuckTime: number = 0;
    // Pre-created materials
    private bulletMat: StandardMaterial;

    // Events
    onDeathObservable = new Observable<EnemyTank>();

    private static count = 0;
    private static allEnemies: EnemyTank[] = [];
    private static sharedBulletMat: StandardMaterial | null = null;
    private id: number;

    // Статический метод для получения всех врагов (для автонаводки и других систем)
    public static getAllEnemies(): EnemyTank[] {
        return EnemyTank.allEnemies;
    }

    // Публичный геттер для id (для AICoordinator)
    public getId(): number {
        return this.id;
    }

    // Публичные геттеры для статистики (для TAB меню)
    public getKillsCount(): number {
        return this.killsCount;
    }

    public getDeathsCount(): number {
        return this.deathsCount;
    }

    // Увеличить счётчик убийств (когда бот убивает игрока)
    public recordKill(): void {
        this.killsCount++;
    }

    // Публичные геттеры для информации о снаряжении (для отладки и UI)
    public getEquipmentInfo(): { chassis: string; cannon: string; track: string; modules: string[] } {
        return {
            chassis: this.chassisType?.name || "Unknown",
            cannon: this.cannonType?.name || "Unknown",
            track: this.trackType?.name || "Unknown",
            modules: this.modules.map(m => m.name)
        };
    }

    // Tick counter
    private _tick = 0;

    // ОПТИМИЗАЦИЯ: Distance-based update frequency constants
    // Ближние боты (<50m) - полная частота обновления
    // Средние боты (50-150m) - каждые 3 кадра
    // Далёкие боты (>150m) - каждые 10 кадров
    private readonly AI_UPDATE_NEAR = 1;      // < 50m: каждый кадр
    private readonly AI_UPDATE_MID = 3;       // 50-150m: каждые 3 кадра
    private readonly AI_UPDATE_FAR = 10;      // > 150m: каждые 10 кадров
    private readonly NEAR_DISTANCE_SQ = 2500;  // 50^2
    private readonly MID_DISTANCE_SQ = 22500;  // 150^2

    // Кешированное расстояние до цели (обновляется в update)
    private distanceToTargetSq: number = 1000000;

    // Raycast caching для оптимизации
    private raycastCache: { result: boolean, frame: number } | null = null;
    private readonly RAYCAST_CACHE_FRAMES = 8; // ОПТИМИЗАЦИЯ: Увеличено для снижения нагрузки - raycasts выполняются реже

    // Ground raycast cache для hover системы
    private _groundRaycastCache: { groundHeight: number; frame: number } | null = null;

    // КРИТИЧНО: Кэш для проверки проваливания (чтобы не проверять каждый кадр)
    private _fallCheckCache: { lastCheck: number; lastCorrectedY: number } | null = null;
    private readonly FALL_CHECK_INTERVAL = 100; // Проверяем проваливание раз в 100мс (10 раз в секунду)
    private _fallCheckFrame = 0; // Кадр последней проверки проваливания

    // Переиспользуемые векторы для оптимизации памяти
    // ИСПРАВЛЕНО: Инициализируем сразу, чтобы fire() мог использовать до первого update()
    private _tmpPos: Vector3 = new Vector3();
    private _tmpForward: Vector3 = new Vector3();

    // ОПТИМИЗАЦИЯ: Кэш для absolutePosition (обновляется в update)
    private _cachedAbsolutePosition: Vector3 = new Vector3();
    private _cachedAbsolutePositionFrame: number = -1;

    // КРИТИЧНО: Кэш для getWorldMatrix() - очень дорогая операция
    private _cachedWorldMatrix?: Matrix;
    private _tmpRight: Vector3 = new Vector3();
    private _tmpUp: Vector3 = new Vector3();

    // ОПТИМИЗАЦИЯ: Расширенный пул переиспользуемых Vector3
    private _tmpVec1: Vector3 = new Vector3();
    private _tmpVec2: Vector3 = new Vector3();
    private _tmpVec3: Vector3 = new Vector3();
    private _tmpVec4: Vector3 = new Vector3();
    private _tmpVec5: Vector3 = new Vector3();

    // PERFORMANCE: Кэшированные объекты для physics update (избегаем GC pressure)
    private _groundRayStart: Vector3 = new Vector3();
    private _groundRay: Ray = new Ray(new Vector3(), new Vector3(0, -1, 0), 10.0);
    private _pushUpForceVec: Vector3 = new Vector3();
    private _clampedVelVec: Vector3 = new Vector3();
    private _clampedAngVelVec: Vector3 = new Vector3();

    // PERFORMANCE: Статический кэш для Vector3.Zero() - избегаем создания нового объекта
    private static readonly ZERO_VECTOR: Vector3 = new Vector3(0, 0, 0);

    // === SPAWN STABILIZATION ===
    private _spawnStabilizing = true;
    private _spawnWarmupTime = 1000; // NIGHTMARE AI: Сразу готов к бою - без разгона!
    private readonly SPAWN_WARMUP_DURATION = 0; // NIGHTMARE AI: Мгновенный старт!

    // === SMOOTH SPAWN FADE ===
    private spawnStartTime = 0;
    private spawnFadeDuration = 1500; // Длительность анимации появления в миллисекундах

    // Для отслеживания застревания в воздухе
    private _airStuckTimer = 0;
    private readonly AIR_STUCK_RESET_TIME = 1000; // ИСПРАВЛЕНО: 1 секунда в воздухе = принудительная телепортация (было 2)

    // === ANTI-STUCK PROPERTIES REMOVED (DUPLICATE) ===

    // === OBSTACLE AVOIDANCE ===
    private obstacleAvoidanceDir = 0; // -1 = лево, 0 = прямо, 1 = право
    private lastObstacleCheck = 0;
    private readonly OBSTACLE_CHECK_INTERVAL = 200; // мс

    // === PROTECTIVE WALL (Module 6) ===
    private wallMesh: Mesh | null = null;
    private wallPhysics: PhysicsBody | null = null;
    private wallHealth = 100;
    private readonly WALL_MAX_HEALTH = 100;
    private lastWallTime = 0;
    private readonly WALL_COOLDOWN = 12000; // СУПЕР: Уменьшено с 18 до 12 секунд - чаще используем стенку!
    private readonly WALL_DURATION = 8000;  // 8 секунд
    private wallTimeout: number = 0;

    // УЛУЧШЕНО: Использование способностей корпусов
    private lastAbilityUseTime: Map<string, number> = new Map(); // ability -> last use time
    private readonly ABILITY_COOLDOWNS: Map<string, number> = new Map([
        ["shield", 30000], // 30 секунд
        ["drone", 60000],  // 60 секунд
        ["command", 60000], // 60 секунд
        ["siege", 0],      // Регенерация постоянная
        ["racer", 0]       // Ускорение постоянное
    ]);
    private shieldActive = false;
    private droneActive = false;
    private commandActive = false;

    constructor(
        scene: Scene,
        position: Vector3,
        soundManager: SoundManager,
        effectsManager: EffectsManager,
        difficulty: "easy" | "medium" | "hard" | "nightmare" = "nightmare", // NIGHTMARE по умолчанию!
        difficultyScale = 1,
        groundNormal: Vector3 = Vector3.Up() // Нормаль поверхности для выравнивания
    ) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.effectsManager = effectsManager;
        this.difficulty = difficulty;
        this.difficultyScale = difficultyScale;
        this.spawnGroundNormal = groundNormal; // Сохраняем нормаль для выравнивания
        this.id = EnemyTank.count++;
        // Define moduleIds if passed (currently random selection is here, but we want server driven for MP... 
        // Wait, for Single Player we still random select here?
        // Actually, this class is used for LOCAL enemies in Single Player? Or networked?
        // User's prompt implies "Bots can use modules". 
        // If this calls is mostly for Single Player local bots:
        // We can keep random selection.

        EnemyTank.allEnemies.push(this);

        // КРИТИЧНО: Выбираем случайное снаряжение ПЕРЕД применением настроек
        // Выбираем случайный корпус из ВСЕХ доступных (без фильтрации)
        this.chassisType = CHASSIS_TYPES[Math.floor(Math.random() * CHASSIS_TYPES.length)]!;
        // Выбираем случайную пушку из ВСЕХ доступных (без фильтрации)
        this.cannonType = CANNON_TYPES[Math.floor(Math.random() * CANNON_TYPES.length)]!;
        // Выбираем случайные гусеницы из ВСЕХ доступных (без фильтрации)
        this.trackType = TRACK_TYPES[Math.floor(Math.random() * TRACK_TYPES.length)]!;
        this.trackType = TRACK_TYPES[Math.floor(Math.random() * TRACK_TYPES.length)]!;

        // Modules: Load module objects from IDs if possible, else random
        // If we want Visuals, we need to populate this.moduleIds
        // Random selection for local bots:
        this.modules = this.selectRandomModules();
        this.moduleIds = this.modules.map(m => m.id);

        // Применяем настройки сложности (теперь только AI-параметры, параметры из снаряжения применяются внутри)
        this.applyDifficultySettings();

        // МАСШТАБИРОВАНИЕ ФИЗИКИ ПО РАЗМЕРУ КОРПУСА (после applyDifficultySettings, чтобы использовать правильные значения)
        this.scalePhysicsByChassis();

        // Share bullet material
        if (!EnemyTank.sharedBulletMat) {
            EnemyTank.sharedBulletMat = new StandardMaterial("enemyBulletMat", scene);
            EnemyTank.sharedBulletMat.diffuseColor = new Color3(1, 0.3, 0);
            EnemyTank.sharedBulletMat.emissiveColor = new Color3(1, 0.2, 0); // GLOW!
            EnemyTank.sharedBulletMat.specularColor = Color3.Black();
            EnemyTank.sharedBulletMat.disableLighting = true;
            EnemyTank.sharedBulletMat.freeze();
        }
        this.bulletMat = EnemyTank.sharedBulletMat;

        // Create visuals (same proportions as player!)
        this.chassis = this.createChassis(position);
        this.turret = this.createTurret();
        this.barrel = this.createBarrel(); // ИСПРАВЛЕНО: Убрано дублирование
        this.createTracks();

        // Create Module Visuals
        this.createModuleVisuals();

        // УЛУЧШЕНО: Плавное появление ботов - устанавливаем начальную прозрачность на 0
        this.spawnStartTime = Date.now();
        this.spawnFadeDuration = 1500; // 1.5 секунды для плавного появления

        // Initially hide everything (0 visibility)
        if (this.chassis) this.setHierarchyVisibility(this.chassis, 0);
        // If turret/barrel are not children yet (though they should be), hide them safely
        if (this.turret && !this.turret.parent) this.setHierarchyVisibility(this.turret, 0);
        if (this.barrel && !this.barrel.parent) this.setHierarchyVisibility(this.barrel, 0);
        for (const wheel of this.wheels) {
            if (wheel && !wheel.parent) this.setHierarchyVisibility(wheel, 0);
        }

        // КРИТИЧНО: Предотвращаем исчезновение при frustum culling (когда камера за стеной)
        // FIX: alwaysSelectAsActiveMesh только для корневого меша (chassis)!
        // Дочерние меши (turret, barrel) наследуют видимость от родителя
        // Установка alwaysSelectAsActiveMesh на дочерних мешах вызывает ДВОЙНОЙ РЕНДЕРИНГ
        this.chassis.alwaysSelectAsActiveMesh = true;
        // this.turret.alwaysSelectAsActiveMesh = true; // УБРАНО - причина дублирования!
        // this.barrel.alwaysSelectAsActiveMesh = true; // УБРАНО - причина дублирования!

        // Setup physics (SAME AS PLAYER!)
        this.setupPhysics();

        // УЛУЧШЕНО: Инициализация AI Pathfinding
        this.pathfinding = new AIPathfinding(scene);

        // Generate patrol points
        this.generatePatrolPoints(position);

        // Random flank direction
        this.flankDirection = Math.random() > 0.5 ? 1 : -1;

        // КРИТИЧНО: НЕ регистрируем onBeforePhysicsObservable здесь!
        // Это вызывало updatePhysics() для ВСЕХ врагов каждый кадр, убивая FPS
        // Физика врагов теперь обновляется централизованно через GameUpdate
        // только для ближних врагов с оптимизацией по расстоянию

        // УЛУЧШЕННАЯ стабилизация спавна: более быстрая и надёжная
        this._spawnStabilizing = true;

        // КРИТИЧНО: Сразу корректируем позицию и ориентацию ДО регистрации updatePhysics
        // Используем requestAnimationFrame для гарантии, что это выполнится после создания physics body
        requestAnimationFrame(() => {
            if (this.physicsBody && this.chassis && !this.chassis.isDisposed()) {
                // КРИТИЧНО: Проверяем высоту террейна и корректируем позицию если нужно
                const currentPos = this.chassis.position;
                const game = (window as any).gameInstance;
                let targetY = position.y;

                // Если позиция подозрительно низкая, пересчитываем высоту террейна
                if (game && typeof game.getGroundHeight === 'function') {
                    const groundHeight = game.getGroundHeight(currentPos.x, currentPos.z);
                    // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                    const safeY = groundHeight + 1.0;
                    if (targetY < safeY) {
                        targetY = safeY;
                        logger.warn(`[EnemyTank] Corrected spawn height from ${position.y.toFixed(2)} to ${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)})`);
                    }
                }

                if (Math.abs(currentPos.y - targetY) > 0.1) {
                    this.chassis.position.y = targetY;
                }

                // КРИТИЧНО: Используем ту же ориентацию что установили выше (перпендикулярно поверхности)
                // Сбрасываем скорости сразу
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());

                // Синхронизируем physics body с mesh используя правильную ориентацию
                if (this.chassis.rotationQuaternion) {
                    this.physicsBody.setTargetTransform(this.chassis.position, this.chassis.rotationQuaternion);
                }

            }
        });

        // УЛУЧШЕННАЯ стабилизация: короткая задержка + плавный старт
        setTimeout(() => {
            if (this.physicsBody && this.chassis && !this.chassis.isDisposed()) {
                // Финальный сброс скоростей
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());

                // КРИТИЧНО: Используем ориентацию перпендикулярно поверхности (уже установлена в createChassis)
                // Не сбрасываем в Identity, сохраняем правильную ориентацию
                if (this.chassis.rotationQuaternion) {
                    this.physicsBody.setTargetTransform(this.chassis.position, this.chassis.rotationQuaternion);
                }
            }

            // Только после финальной корректировки отключаем стабилизацию
            this._spawnStabilizing = false;

            // Сбрасываем накопленные значения ускорения для плавности движения
            this._lastAccel = 0;
            this._lastTurnAccel = 0;
            this._airStuckTimer = 0;

            // КРИТИЧНО: НЕ сбрасываем throttleTarget/steerTarget - они будут установлены doPatrol()
            // Вместо этого сбрасываем только smooth-значения для плавного старта
            this.smoothThrottle = 0;
            this.smoothSteer = 0;

            // КРИТИЧНО: Убеждаемся, что бот сразу начинает патрулировать после стабилизации
            this.state = "patrol";

            // Генерируем/проверяем точки патруля
            if (this.patrolPoints.length === 0) {
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию
                this.generatePatrolPoints(this._cachedAbsolutePosition);
            }
            this.currentPatrolIndex = 0;

            // КРИТИЧНО: Немедленно устанавливаем направление к первой точке патруля
            if (this.patrolPoints.length > 0) {
                const target = this.patrolPoints[0];
                if (!target) return;
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию
                const myPos = this._cachedAbsolutePosition;
                const dir = target.subtract(myPos);
                dir.y = 0;
                if (dir.length() > 1) {
                    // УСКОРЕНО: Сразу высокий throttle для мгновенного выезда
                    this.throttleTarget = 1.0;
                    this.steerTarget = 0;
                    // Высокое начальное значение для мгновенного старта
                    this.smoothThrottle = 0.5;
                }
            }

            // Вызываем doPatrol для корректировки направления
            this.doPatrol();

        }, 50); // УСКОРЕНО: 50мс для мгновенного старта

        logger.log(`[EnemyTank ${this.id}] Created at ${position.x.toFixed(0)}, ${position.z.toFixed(0)} with difficulty: ${difficulty}`);
    }

    /**
     * Масштабирует физические параметры по размеру корпуса
     * Маленькие корпуса (scout, racer) получают меньшую массу и ограниченную угловую скорость
     */
    private scalePhysicsByChassis(): void {
        // Базовые значения из конфига
        const baseMass = PHYSICS_CONFIG.enemyTank.basic.mass;
        const baseMoveSpeed = PHYSICS_CONFIG.enemyTank.basic.moveSpeed;
        const baseTurnSpeed = PHYSICS_CONFIG.enemyTank.basic.turnSpeed;
        const baseAcceleration = PHYSICS_CONFIG.enemyTank.basic.acceleration;
        const baseHoverStiffness = PHYSICS_CONFIG.enemyTank.stability.hoverStiffness;
        const baseHoverDamping = PHYSICS_CONFIG.enemyTank.stability.hoverDamping;

        // Используем массу из типа корпуса (если доступна)
        const chassisMass = this.chassisType.mass || baseMass;

        // Масштабируем массу: маленькие корпуса имеют меньшую массу
        // Масса корпуса уже учитывает размер, используем её напрямую
        this.mass = chassisMass;

        // Масштабируем скорость движения относительно массы
        // Маленькие танки должны двигаться быстрее относительно массы
        const massRatio = chassisMass / baseMass;
        const sizeFactor = Math.sqrt(massRatio); // Квадратный корень для более плавного масштабирования

        // Используем moveSpeed из типа корпуса, но нормализуем относительно базовой
        this.moveSpeed = this.chassisType.moveSpeed || (baseMoveSpeed * sizeFactor);

        // Используем turnSpeed из типа корпуса, но нормализуем относительно базовой
        this.turnSpeed = this.chassisType.turnSpeed || (baseTurnSpeed * sizeFactor);

        // Ускорение масштабируется линейно с массой
        this.acceleration = this.chassisType.acceleration || (baseAcceleration * massRatio);

        // Жесткость и демпфирование масштабируются по массе
        this.hoverStiffness = baseHoverStiffness * massRatio;
        this.hoverDamping = baseHoverDamping * massRatio;

        // Scale damping properties
        this.linearDamping = PHYSICS_CONFIG.enemyTank.stability.linearDamping * massRatio;
        this.angularDamping = PHYSICS_CONFIG.enemyTank.stability.angularDamping * massRatio;

        // Ограничение угловой скорости для маленьких танков (предотвращает хаотичное вращение)
        const smallChassisIds = ["scout", "racer", "light", "stealth"];
        if (smallChassisIds.includes(this.chassisType.id) || massRatio < 0.4) {
            // Маленькие танки: более строгое ограничение
            this.maxAngularVelocity = 6.0;
            // Boost angular damping for small tanks to prevent spinning
            this.angularDamping *= 2.5;
            // Reduce turn force for light tanks to prevent oversteering
            this.turnForceMultiplier = 0.6;
        } else if (massRatio < 0.7) {
            // Средние танки: умеренное ограничение
            this.maxAngularVelocity = 8.0;
            this.turnForceMultiplier = 0.8;
        } else {
            // Большие танки: стандартное ограничение
            this.maxAngularVelocity = 10.0;
            this.turnForceMultiplier = 1.0;
        }
    }

    private applyDifficultySettings() {
        // КРИТИЧНО: Параметры из снаряжения применяются ПЕРВЫМИ (не зависят от сложности!)
        // Применяем параметры из выбранного корпуса
        this.moveSpeed = this.chassisType.moveSpeed;
        this.turnSpeed = this.chassisType.turnSpeed; // Скорость поворота корпуса
        this.acceleration = this.chassisType.acceleration;
        this.maxHealth = this.chassisType.maxHealth;
        this.mass = this.chassisType.mass;

        // Применяем параметры из выбранной пушки
        this.cooldown = this.cannonType.cooldown;
        this.damage = this.cannonType.damage;
        this.projectileSpeed = this.cannonType.projectileSpeed;
        this.projectileSize = this.cannonType.projectileSize;
        // Максимальная дальность оружия (из cannonType или расчёт: barrelLength * 80 + projectileSpeed * 0.5)
        this.weaponMaxRange = this.cannonType.maxRange ||
            (this.cannonType.barrelLength * 80 + this.cannonType.projectileSpeed * 0.5);

        // Применяем бонусы от гусениц
        if (this.trackType?.stats) {
            if (this.trackType.stats.speedBonus) {
                this.moveSpeed *= (1 + this.trackType.stats.speedBonus);
            }
            if (this.trackType.stats.armorBonus) {
                this.maxHealth *= (1 + this.trackType.stats.armorBonus);
            }
        }

        // Применяем бонусы от модулей
        for (const module of this.modules) {
            if (module.stats.armor) {
                this.maxHealth *= (1 + module.stats.armor);
            }
            if (module.stats.health) {
                this.maxHealth *= (1 + module.stats.health);
            }
            if (module.stats.speed) {
                this.moveSpeed *= (1 + module.stats.speed);
            }
            if (module.stats.damage) {
                this.damage *= (1 + module.stats.damage);
            }
            if (module.stats.reload) {
                this.cooldown *= (1 + module.stats.reload); // reload -0.15 означает -15% cooldown
            }
        }

        // Округляем значения после всех модификаций
        this.maxHealth = Math.round(this.maxHealth);
        this.damage = Math.round(this.damage);
        this.cooldown = Math.round(this.cooldown);

        // EXTREME: Применяем AI-параметры - ВСЕ уровни сложности значительно усилены!
        switch (this.difficulty) {
            case "easy":
                // EXTREME Easy: Уже сложнее чем было hard!
                this.aimAccuracy = 0.96; // EXTREME: +6.7% (было 0.90)
                this.detectRange = 500; // УВЕЛИЧЕНО: +56% (было 320)
                this.range = 100; // EXTREME: +43% (было 70)
                this.optimalRange = 50; // EXTREME: +43% (было 35)
                this.decisionInterval = 0; // EXTREME: мгновенная реакция!
                break;
            case "medium":
                // EXTREME Medium: Почти идеальный AI
                this.aimAccuracy = 0.99; // EXTREME: +1% (было 0.98)
                this.detectRange = 600; // УВЕЛИЧЕНО: +50% (было 400)
                this.range = 120; // EXTREME: +41% (было 85)
                this.optimalRange = 60; // EXTREME: +43% (было 42)
                this.decisionInterval = 0; // EXTREME: мгновенная реакция!
                break;
            case "hard":
                // EXTREME Hard: АБСОЛЮТНО ИДЕАЛЬНЫЙ AI
                this.aimAccuracy = 1.0; // EXTREME: Идеальная точность
                this.detectRange = 800; // УВЕЛИЧЕНО: +60% (было 500) - видят ВЕЗДЕ!
                this.range = 150; // EXTREME: +50% (было 100) - атакуют издалека
                this.optimalRange = 80; // EXTREME: +45% (было 55) - комфортная дистанция
                this.decisionInterval = 0; // EXTREME: МГНОВЕННАЯ реакция!
                break;
            case "nightmare":
                // NIGHTMARE: МАКСИМАЛЬНО УМНЫЕ, БЫСТРЫЕ И МЕТКИЕ БОТЫ!
                this.aimAccuracy = 1.0; // Идеальная точность на любой дистанции
                this.detectRange = 1000; // NIGHTMARE: +25% (было 800) - видят ОЧЕНЬ далеко!
                this.range = 200; // NIGHTMARE: +33% (было 150) - атакуют с максимальной дистанции
                this.optimalRange = 100; // NIGHTMARE: +25% (было 80) - идеальная дистанция
                this.decisionInterval = 0; // NIGHTMARE: МГНОВЕННАЯ реакция - 0мс!
                // NIGHTMARE: Улучшенная скорость поворота башни
                this.turretSpeed = 0.2; // NIGHTMARE: +67% (было 0.12) - молниеносное наведение!
                this.turretLerpSpeed = 0.4; // NIGHTMARE: +60% (было 0.25) - мгновенная интерполяция!
                break;
        }

        // Плавный множитель сложности на основе прогресса игрока и длительности сессии
        const scale = Math.min(Math.max(this.difficultyScale, 0.7), 1.8);

        // Живучесть (HP) растёт более заметно, но без экстремумов (применяется к HP из корпуса)
        const healthScale = 1 + (scale - 1) * 0.8; // до ~+64% HP при максимальном скейле
        this.maxHealth = Math.round(this.maxHealth * healthScale);

        // Агрессия: чем выше скейл, тем быстрее решения и короче перезарядка (применяется к cooldown из пушки)
        const aggressionScale = 1 + (scale - 1) * 0.7;
        this.cooldown = Math.round(this.cooldown / aggressionScale);
        // МАКСИМАЛЬНО: Разрешаем принимать решения еще чаще для максимальной реактивности (nightmare level)
        this.decisionInterval = 0; // NIGHTMARE AI: Всегда мгновенная реакция!

        // Синхронизируем текущее здоровье с новым максимумом
        this.currentHealth = this.maxHealth;

        // === КОРРЕКТИРОВКА СКОРОСТИ ДЛЯ МАЛЕНЬКИХ КОРПУСОВ ===
        // Предотвращаем слишком быстрое движение легких танков (scout, racer)
        const isSmallChassis = this.chassisType.mass < 3000 ||
            this.chassisType.id === "scout" ||
            this.chassisType.id === "racer";
        if (isSmallChassis) {
            // Ограничиваем скорость движения для предотвращения хаотичного поведения
            this.moveSpeed = Math.min(this.moveSpeed, 18); // Максимум 18 м/с для маленьких
            this.turnSpeed = Math.min(this.turnSpeed, 3.0); // Более плавные повороты
        }

        logger.debug(`[EnemyTank ${this.id}] Equipment: ${this.chassisType.name} chassis, ${this.cannonType.name} cannon, ${this.trackType?.name || 'standard'} tracks | Modules: ${this.modules.length} | Speed: ${this.moveSpeed.toFixed(1)}, HP: ${this.maxHealth}, Damage: ${this.damage}, Cooldown: ${this.cooldown}ms`);
    }

    /**
     * Выбрать случайное количество случайных модулей для бота
     * Боты могут иметь 0-3 модуля, вероятность уменьшается с количеством
     * УЛУЧШЕНО: Добавлена проверка на пустой массив
     */
    private selectRandomModules(): ModuleType[] {
        const modules: ModuleType[] = [];

        // Определяем количество модулей (0-3, чаще меньше)
        // 40% шанс на 0, 30% на 1, 20% на 2, 10% на 3
        const roll = Math.random();
        let moduleCount: number;
        if (roll < 0.4) moduleCount = 0;
        else if (roll < 0.7) moduleCount = 1;
        else if (roll < 0.9) moduleCount = 2;
        else moduleCount = 3;

        // Выбираем случайные модули без повторений
        // КРИТИЧНО: Используем ВСЕ модули из MODULE_PRESETS без фильтрации
        const availableModules = [...MODULE_PRESETS];

        // ДОБАВЛЕНО: Проверка на пустой массив
        if (availableModules.length === 0) {
            console.warn(`[EnemyTank] WARNING: MODULE_PRESETS is empty!`);
            return [];
        }

        for (let i = 0; i < moduleCount && availableModules.length > 0; i++) {
            const index = Math.floor(Math.random() * availableModules.length);
            const selectedModule = availableModules.splice(index, 1)[0];
            if (selectedModule) {
                modules.push(selectedModule);
            }
        }

        return modules;
    }

    /**
     * Create Module Visuals - используем ДИНАМИЧЕСКИЕ offsets на основе размеров танка
     */
    private createModuleVisuals(): void {
        for (const module of this.modules) {
            // Проверяем наличие attachmentPoint
            if (!module.attachmentPoint) continue;

            // ДИНАМИЧЕСКИЙ расчёт offset на основе реальных размеров танка
            const offset = getAttachmentOffset(module.attachmentPoint as any, this.chassisType);

            let parent: Mesh;
            if (module.attachmentPoint.startsWith("turret")) parent = this.turret;
            else if (module.attachmentPoint.startsWith("barrel")) parent = this.barrel;
            else parent = this.chassis;

            if (!parent) continue;

            let mesh: Mesh;
            const color = Color3.FromHexString(module.color || "#ffffff");
            const scale = module.scale || 1;

            if (module.modelPath === "cylinder_pair") {
                mesh = new Mesh("mod_" + module.id, this.scene);
                const pipe1 = MeshBuilder.CreateCylinder("p1", { height: 1, diameter: 0.3 }, this.scene);
                const pipe2 = MeshBuilder.CreateCylinder("p2", { height: 1, diameter: 0.3 }, this.scene);
                pipe1.position.x = 0.3; pipe1.rotation.x = Math.PI / 2;
                pipe2.position.x = -0.3; pipe2.rotation.x = Math.PI / 2;
                pipe1.parent = mesh; pipe2.parent = mesh;

                const mat = new StandardMaterial("mat_" + module.id, this.scene);
                mat.diffuseColor = color;
                pipe1.material = mat; pipe2.material = mat;
            } else if (module.modelPath === "box_small") {
                mesh = MeshBuilder.CreateBox("mod_" + module.id, { size: 0.4 * scale }, this.scene);
                const mat = new StandardMaterial("mat_" + module.id, this.scene);
                mat.diffuseColor = color;
                mat.emissiveColor = color.scale(0.5);
                mesh.material = mat;
            } else {
                mesh = MeshBuilder.CreateBox("mod_" + module.id, {
                    width: 0.8 * scale,
                    height: 0.2 * scale,
                    depth: 0.8 * scale
                }, this.scene);
                const mat = new StandardMaterial("mat_" + module.id, this.scene);
                mat.diffuseColor = color;
                mesh.material = mat;
            }

            // Прикрепляем модуль НАПРЯМУЮ к родительскому мешу
            mesh.parent = parent;
            mesh.position = offset;

            this.moduleMeshes.push(mesh);
        }
    }

    // === VISUALS (same as player) ===

    private createChassis(position: Vector3): Mesh {
        // КРИТИЧНО: Используем размеры из выбранного корпуса
        const width = this.chassisType.width;
        const height = this.chassisType.height;
        const depth = this.chassisType.depth;

        const chassis = MeshBuilder.CreateBox(`enemyTank_${this.id}`, {
            width, height, depth
        }, this.scene);
        // КРИТИЧНО: Используем позицию как есть (уже с правильной высотой террейна + 2.0)
        // НЕ добавляем 0.5, так как позиция уже правильная
        chassis.position.copyFrom(position);
        // КРИТИЧНО: Выравниваем танк ПЕРПЕНДИКУЛЯРНО поверхности используя нормаль
        // Нормаль поверхности становится "up" вектором танка
        const up = this.spawnGroundNormal.clone().normalize();
        const defaultUp = Vector3.Up();

        // Если нормаль почти вертикальна (parallel to defaultUp), используем стандартную ориентацию
        const dot = Vector3.Dot(up, defaultUp);
        if (Math.abs(dot) > 0.99) {
            chassis.rotationQuaternion = Quaternion.Identity();
        } else {
            // Вычисляем ось и угол поворота для выравнивания up вектора с нормалью поверхности
            const axis = Vector3.Cross(defaultUp, up);
            if (axis.length() < 0.001) {
                // Векторы противоположны, используем любую перпендикулярную ось
                axis.copyFromFloats(1, 0, 0);
            }
            axis.normalize();

            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            // Создаём кватернион поворота вокруг вычисленной оси
            const spawnRotation = Quaternion.RotationAxis(axis, angle);
            chassis.rotationQuaternion = spawnRotation;
        }

        const mat = new StandardMaterial(`enemyTankMat_${this.id}`, this.scene);
        // КРИТИЧНО: Используем цвет из выбранного корпуса
        const colorHex = this.chassisType.color;
        const color = Color3.FromHexString(colorHex);
        mat.diffuseColor = color;
        mat.specularColor = Color3.Black();
        mat.freeze();
        chassis.material = mat;
        chassis.metadata = { type: "enemyTank", instance: this };

        // Add visual details for heavy chassis types
        if (this.chassisType.id === "heavy" || this.chassisType.id === "siege") {
            const armorMat = new StandardMaterial(`enemyArmor_${this.id}`, this.scene);
            armorMat.diffuseColor = new Color3(0.4, 0.12, 0.08);
            armorMat.freeze();

            const leftPlate = MeshBuilder.CreateBox(`armorL_${this.id}`, {
                width: 0.12, height: height * 0.8, depth: depth * 0.5
            }, this.scene);
            leftPlate.position = new Vector3(-width * 0.55, 0, 0);
            leftPlate.parent = chassis;
            leftPlate.material = armorMat;

            const rightPlate = MeshBuilder.CreateBox(`armorR_${this.id}`, {
                width: 0.12, height: height * 0.8, depth: depth * 0.5
            }, this.scene);
            rightPlate.position = new Vector3(width * 0.55, 0, 0);
            rightPlate.parent = chassis;
            rightPlate.material = armorMat;
        }

        return chassis;
    }

    private createTurret(): Mesh {
        // Same as player turret!
        const turret = MeshBuilder.CreateBox(`enemyTurret_${this.id}`, {
            width: 1.4,
            height: 0.6,
            depth: 2.0
        }, this.scene);
        turret.parent = this.chassis;
        
        // Для самолёта перемещаем башню в нос
        const isPlane = this.chassisType?.id === "plane";
        if (isPlane && this.chassisType) {
            const d = this.chassisType.depth;
            turret.position = new Vector3(0, 0.7, d * 0.6);
        } else {
            turret.position = new Vector3(0, 0.7, 0);
        }

        const mat = new StandardMaterial(`enemyTurretMat_${this.id}`, this.scene);
        mat.diffuseColor = new Color3(0.4, 0.12, 0.08);
        mat.specularColor = Color3.Black();
        mat.freeze();
        turret.material = mat;
        turret.renderingGroupId = 0;
        turret.metadata = { type: "enemyTank", instance: this };

        return turret;
    }

    private createBarrel(): Mesh {
        // Используем размеры из выбранной пушки
        const barrelWidth = this.cannonType.barrelWidth;
        const barrelLength = this.cannonType.barrelLength;

        // Создаём детализированную пушку как у игрока
        const barrel = createUniqueCannon(
            this.cannonType,
            this.scene,
            barrelWidth,
            barrelLength,
            this.cannonAnimationElements
        );

        barrel.parent = this.turret;
        
        // Для самолёта ствол направлен вперёд (в нос)
        const isPlane = this.chassisType?.id === "plane";
        let barrelZ: number;
        if (isPlane && this.chassisType) {
            const d = this.chassisType.depth;
            const turretDepth = d * 0.6;
            barrelZ = turretDepth / 2 + barrelLength / 2 + (d * 0.3); // Максимально вперёд в нос
        } else {
            barrelZ = barrelLength * 0.5; // Обычное положение
        }
        barrel.position = new Vector3(0, 0.2, barrelZ);
        barrel.renderingGroupId = 0;
        barrel.metadata = { type: "enemyTank", instance: this };

        return barrel;
    }

    private createTracks(): void {
        const trackMat = new StandardMaterial(`enemyTrackMat_${this.id}`, this.scene);
        trackMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        trackMat.specularColor = Color3.Black();
        trackMat.freeze();

        // Left track (same as player)
        // Гусеницы уменьшены для избежания глитчей
        const leftTrack = MeshBuilder.CreateBox(`eTrackL_${this.id}`, {
            width: 0.4, height: 0.5, depth: 3.4
        }, this.scene);
        leftTrack.position = new Vector3(-1.1, -0.2, 0); // Ближе к корпусу
        leftTrack.parent = this.chassis;
        leftTrack.material = trackMat;
        this.wheels.push(leftTrack);

        // Right track - уменьшен для избежания глитчей
        const rightTrack = MeshBuilder.CreateBox(`eTrackR_${this.id}`, {
            width: 0.4, height: 0.5, depth: 3.4
        }, this.scene);
        rightTrack.position = new Vector3(1.1, -0.2, 0); // Ближе к корпусу
        rightTrack.parent = this.chassis;
        rightTrack.material = trackMat;
        this.wheels.push(rightTrack);
    }

    isPartOf(mesh: AbstractMesh): boolean {
        // Robust check: is the mesh the chassis, a descendant of the chassis, or in our known lists?
        if (!mesh) return false;
        if (mesh === this.chassis) return true;

        // Fast check for common parts
        if (mesh === this.turret || mesh === this.barrel) return true;

        // Check hierarchy (covers modules, wheels, attached decorations)
        if (mesh.isDescendantOf(this.chassis)) return true;

        // Manual list checks (just in case some are detached)
        if (this.wheels.includes(mesh as Mesh)) return true;
        if (this.moduleMeshes.includes(mesh as Mesh)) return true;

        // Check health bar visuals
        if (mesh === this.healthBar || mesh === this.healthBarBackground || mesh === this.distanceTextPlane) return true;

        return false;
    }

    // Проверка препятствий перед стволом перед выстрелом
    private checkBarrelObstacle(muzzlePos: Vector3, direction: Vector3, maxDistance: number = 1.5): boolean {
        const ray = new Ray(muzzlePos, direction, maxDistance);

        const pick = this.scene.pickWithRay(ray, (mesh: any) => {
            // Ранний выход: проверки в порядке частоты
            if (!mesh || !mesh.isEnabled()) return false;
            if (mesh.visibility <= 0.5) return false; // Прозрачные/невидимые объекты

            // КРИТИЧНО: Проверяем стенки (protectiveWall и enemyWall) - они ВСЕГДА блокируют выстрел!
            const meta = mesh.metadata;
            if (meta && (meta.type === "protectiveWall" || meta.type === "enemyWall")) {
                return true; // Стенки ВСЕГДА блокируют выстрел, даже если isPickable = false
            }

            if (!mesh.isPickable) return false; // Объекты без коллизий (кроме стенок)

            // Игнорируем дочерние элементы танка (более надежная проверка)
            if (this.isPartOf(mesh)) return false;

            // Игнорируем билборды
            if (mesh.name.includes("billboard") || mesh.name.includes("hp") || mesh.name.includes("Hp")) return false;

            // Игнорируем пули
            if (meta && (meta.type === "bullet" || meta.type === "enemyBullet")) return false;

            // Игнорируем расходники
            if (meta && meta.type === "consumable") return false;

            // Игнорируем танки
            if (meta && (meta.type === "playerTank" || meta.type === "enemyTank")) return false;

            // Гаражные ворота - проверяем открыты ли они
            if (mesh.name.includes("garageFrontDoor") || mesh.name.includes("garageBackDoor")) {
                // Если ворота высоко (открыты), игнорируем их
                if (mesh.position.y > 3.5) return false;
                // Закрытые ворота - это препятствие
                return true;
            }

            // Все остальные объекты с isPickable === true и visibility > 0.5
            return true;
        });

        // Если препятствие найдено на расстоянии < maxDistance
        if (pick && pick.hit && pick.distance < maxDistance) {
            return true; // Препятствие найдено, выстрел заблокирован
        }

        return false; // Путь свободен, выстрел разрешён
    }

    // === PHYSICS (SAME AS PLAYER!) ===

    private setupPhysics(): void {
        // Физика корпуса (chassis) с РЕАЛИСТИЧНЫМ ГУСЕНИЧНЫМ ХИТБОКСОМ
        // Compound shape: центральный BOX + скруглённые CYLINDER спереди и сзади
        // КРИТИЧНО: Используем множители размеров для синхронизации с визуальной моделью
        const multipliers = CHASSIS_SIZE_MULTIPLIERS[this.chassisType.id] || CHASSIS_SIZE_MULTIPLIERS["medium"] || { width: 1, height: 1, depth: 1 };
        const realWidth = this.chassisType.width * multipliers.width;
        const realHeight = this.chassisType.height * multipliers.height;
        const realDepth = this.chassisType.depth * multipliers.depth;

        // Для hover и shield используем Math.max для width/depth (как в визуальной модели)
        let finalWidth = realWidth;
        let finalDepth = realDepth;
        if (this.chassisType.id === "hover" || this.chassisType.id === "shield") {
            const maxSize = Math.max(this.chassisType.width, this.chassisType.depth) * multipliers.width;
            finalWidth = maxSize;
            finalDepth = maxSize;
        }

        const chassisShape = new PhysicsShapeContainer(this.scene);

        const chassisLowering = -realHeight * 0.1;

        // ═══════════════════════════════════════════════════════════════════════
        // УЛУЧШЕННЫЙ ХИТБОКС: 5 форм для более реалистичной коллизии танка
        // ═══════════════════════════════════════════════════════════════════════

        // 1. ОСНОВНОЙ КОРПУС (центральный BOX) - 70% глубины
        const mainHullDepth = finalDepth * 0.7;
        const mainHullBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, chassisLowering, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(finalWidth, realHeight, mainHullDepth)
            }
        }, this.scene);
        mainHullBox.material = { friction: 0, restitution: 0.0 };
        chassisShape.addChildFromParent(this.chassis, mainHullBox, this.chassis);

        // 2. ПЕРЕДНИЙ СКОС (наклонная броня)
        const frontSlopeHeight = realHeight * 0.6;
        const frontSlopeDepth = finalDepth * 0.2;
        const frontSlopeZ = (mainHullDepth / 2) + (frontSlopeDepth / 2);
        const frontSlopeY = chassisLowering - (realHeight * 0.2);
        const frontSlopeBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, frontSlopeY, frontSlopeZ),
                rotation: Quaternion.Identity(),
                extents: new Vector3(finalWidth * 0.85, frontSlopeHeight, frontSlopeDepth)
            }
        }, this.scene);
        frontSlopeBox.material = { friction: 0.1, restitution: 0 };
        chassisShape.addChildFromParent(this.chassis, frontSlopeBox, this.chassis);

        // 3. ЗАДНЯЯ ЧАСТЬ (моторный отсек)
        const rearSlopeHeight = realHeight * 0.8;
        const rearSlopeDepth = finalDepth * 0.15;
        const rearSlopeZ = -(mainHullDepth / 2) - (rearSlopeDepth / 2);
        const rearSlopeBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, chassisLowering, rearSlopeZ),
                rotation: Quaternion.Identity(),
                extents: new Vector3(finalWidth * 0.9, rearSlopeHeight, rearSlopeDepth)
            }
        }, this.scene);
        rearSlopeBox.material = { friction: 0.1, restitution: 0 };
        chassisShape.addChildFromParent(this.chassis, rearSlopeBox, this.chassis);

        // 4. БАШНЯ (TURRET)
        const turretHitboxHeight = this.chassisType.height * 0.75;
        const turretHitboxWidth = this.chassisType.width * 0.65;
        const turretHitboxDepth = this.chassisType.depth * 0.6;
        const turretY = chassisLowering + (realHeight * 0.5) + (turretHitboxHeight * 0.5);

        const turretBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, turretY, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(turretHitboxWidth, turretHitboxHeight, turretHitboxDepth)
            }
        }, this.scene);
        turretBox.material = { friction: 0.1, restitution: 0 };
        chassisShape.addChildFromParent(this.chassis, turretBox, this.chassis);

        // 5. МАСКА ПУШКИ (gun mantlet)
        const mantletWidth = turretHitboxWidth * 0.4;
        const mantletHeight = turretHitboxHeight * 0.5;
        const mantletDepth = turretHitboxDepth * 0.3;
        const mantletZ = (turretHitboxDepth / 2) + (mantletDepth / 2);
        const mantletBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, turretY, mantletZ),
                rotation: Quaternion.Identity(),
                extents: new Vector3(mantletWidth, mantletHeight, mantletDepth)
            }
        }, this.scene);
        mantletBox.material = { friction: 0.1, restitution: 0 };
        chassisShape.addChildFromParent(this.chassis, mantletBox, this.chassis);

        // Настройки фильтрации столкновений
        chassisShape.filterMembershipMask = 8;
        chassisShape.filterCollideMask = 1 | 2 | 4 | 8 | 32;

        // КРИТИЧНО: Убеждаемся, что rotation установлен ПЕРЕД созданием physics body
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.rotationQuaternion = Quaternion.Identity();
        }

        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
        this.physicsBody.shape = chassisShape;
        // HEAVY & RESPONSIVE: Центр масс смещен ниже для предотвращения опрокидывания
        this.physicsBody.setMassProperties({
            mass: this.mass,
            centerOfMass: PHYSICS_CONFIG.enemyTank.centerOfMass.clone()
        });
        this.physicsBody.setLinearDamping(this.linearDamping);
        this.physicsBody.setAngularDamping(this.angularDamping);

        // КРИТИЧНО: Сбрасываем скорости сразу после создания физического тела
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());

        // КРИТИЧНО: Принудительно устанавливаем правильную ориентацию после создания physics body
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.rotationQuaternion = Quaternion.Identity();
            // Синхронизируем physics body с mesh
            this.physicsBody.setTargetTransform(this.chassis.position, this.chassis.rotationQuaternion!);
        }
    }


    /**
     * Создать визуальную полоску здоровья над танком
     */
    private createHealthBarVisuals(): void {
        if (this.healthBar) return;

        const barWidth = 2.5;
        const barHeight = 0.15;
        const barY = this.chassisType.height + 2.5;

        // Фон
        this.healthBarBackground = MeshBuilder.CreatePlane(
            `healthBg_${Date.now()}`,
            { width: barWidth, height: barHeight },
            this.scene
        );
        this.healthBarBackground.position = new Vector3(0, barY, 0);
        this.healthBarBackground.parent = this.chassis;
        this.healthBarBackground.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.healthBarBackground.isVisible = false;

        const bgMat = new StandardMaterial(`healthBgMat_${Date.now()}`, this.scene);
        bgMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
        bgMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        bgMat.backFaceCulling = false;
        bgMat.disableLighting = true;
        this.healthBarBackground.material = bgMat;

        // Полоска
        this.healthBar = MeshBuilder.CreatePlane(
            `healthBar_${Date.now()}`,
            { width: barWidth, height: barHeight },
            this.scene
        );
        this.healthBar.position = new Vector3(0, barY, -0.01);
        this.healthBar.parent = this.chassis;
        this.healthBar.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.healthBar.isVisible = false;

        const barMat = new StandardMaterial(`healthBarMat_${Date.now()}`, this.scene);
        barMat.diffuseColor = new Color3(0.2, 0.8, 0.2);
        barMat.emissiveColor = new Color3(0.1, 0.4, 0.1);
        barMat.backFaceCulling = false;
        barMat.disableLighting = true;
        this.healthBar.material = barMat;

        // Текст дистанции
        this.distanceTextPlane = MeshBuilder.CreatePlane(
            `distText_${Date.now()}`,
            { width: 1.5, height: 0.5 },
            this.scene
        );
        this.distanceTextPlane.position = new Vector3(barWidth / 2 + 0.9, barY, 0);
        this.distanceTextPlane.parent = this.chassis;
        this.distanceTextPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.distanceTextPlane.isVisible = false;

        this.distanceTexture = new DynamicTexture(`distTex_${Date.now()}`, { width: 256, height: 85 }, this.scene, false);
        this.distanceTexture.hasAlpha = true;

        const textMat = new StandardMaterial(`distTextMat_${Date.now()}`, this.scene);
        textMat.diffuseTexture = this.distanceTexture;
        textMat.emissiveColor = Color3.White();
        textMat.diffuseColor = Color3.White();
        textMat.backFaceCulling = false;
        textMat.disableLighting = true;
        textMat.useAlphaFromDiffuseTexture = true;
        this.distanceTextPlane.material = textMat;
    }

    private updateHealthBarVisuals(): void {
        if (!this.healthBar) this.createHealthBarVisuals();
        if (!this.healthBar) return;

        const healthPercent = this.maxHealth > 0 ? this.currentHealth / this.maxHealth : 0;
        const barWidth = 2.5;

        this.healthBar.scaling.x = healthPercent;
        this.healthBar.position.x = -barWidth * (1 - healthPercent) * 0.5;

        const mat = this.healthBar.material as StandardMaterial;
        if (mat) {
            if (healthPercent > 0.6) {
                mat.diffuseColor = new Color3(0.2, 0.8, 0.2);
                mat.emissiveColor = new Color3(0.1, 0.4, 0.1);
            } else if (healthPercent > 0.3) {
                mat.diffuseColor = new Color3(0.9, 0.8, 0.2);
                mat.emissiveColor = new Color3(0.45, 0.4, 0.1);
            } else {
                mat.diffuseColor = new Color3(0.9, 0.2, 0.2);
                mat.emissiveColor = new Color3(0.45, 0.1, 0.1);
            }
        }
    }

    private updateHealthBarVisibility(): void {
        if (!this.healthBar || !this.healthBarBackground || !this.distanceTextPlane || !this.chassis) return;

        const now = Date.now();
        const isVisible = (now - this.lastHitTime < this.HP_BAR_VISIBLE_DURATION) && this.currentHealth < this.maxHealth && this.currentHealth > 0;

        if (this.healthBar.isVisible !== isVisible) {
            this.healthBar.isVisible = isVisible;
            this.healthBarBackground.isVisible = isVisible;
            this.distanceTextPlane.isVisible = isVisible;
        }

        if (isVisible) {
            const camera = this.scene.activeCamera;
            if (camera) {
                const dist = Vector3.Distance(camera.position, this.chassis.absolutePosition);
                const distInt = Math.round(dist);

                if ((this as any)._lastDistInt !== distInt) {
                    (this as any)._lastDistInt = distInt;
                    const ctx = this.distanceTexture?.getContext();
                    if (ctx && this.distanceTexture) {
                        ctx.clearRect(0, 0, 256, 85);
                        ctx.font = "bold 48px 'Press Start 2P', monospace";
                        ctx.fillStyle = "white";
                        // ИСПРАВЛЕНО: Приводим к стандартному CanvasRenderingContext2D
                        (ctx as CanvasRenderingContext2D).textAlign = "left";
                        (ctx as CanvasRenderingContext2D).textBaseline = "middle";
                        ctx.fillText(`${distInt}m`, 10, 42);
                        this.distanceTexture.update();
                    }
                }
            }
        }
    }

    // === VISIBILITY HELPER ===
    private setHierarchyVisibility(mesh: AbstractMesh, visibility: number): void {
        mesh.visibility = visibility;
        // Use direct descendants only to avoid redundant recursion (since we recurse manually)
        mesh.getChildMeshes(true).forEach(child => {
            this.setHierarchyVisibility(child, visibility);
        });
    }

    // === MAIN UPDATE ===

    update(): void {
        if (!this.isAlive) return;
        if (!this.chassis || this.chassis.isDisposed()) return;

        this._tick++;

        // ОПТИМИЗАЦИЯ: Кэшируем absolutePosition один раз за кадр
        if (this._cachedAbsolutePositionFrame !== this._tick) {
            this._cachedAbsolutePosition.copyFrom(this.chassis.absolutePosition);
            this._cachedAbsolutePositionFrame = this._tick;
        }

        // Detect health change (damage)
        if (this.currentHealth < this._lastHealth) {
            this.lastHitTime = Date.now();
            this.updateHealthBarVisuals();
        }
        this._lastHealth = this.currentHealth;

        // Update visibility logic
        this.updateHealthBarVisibility();

        // УЛУЧШЕНО: Плавное появление ботов - анимация прозрачности от 0 до 1
        if (this.spawnStartTime > 0) {
            const elapsed = Date.now() - this.spawnStartTime;
            if (elapsed < this.spawnFadeDuration) {
                // Плавная интерполяция от 0 до 1
                const alpha = Math.min(1.0, elapsed / this.spawnFadeDuration);
                // Используем ease-out для более плавного появления
                const easedAlpha = 1 - Math.pow(1 - alpha, 3);

                if (this.chassis) this.setHierarchyVisibility(this.chassis, easedAlpha);
                // Turret and barrel are children of chassis usually, but to be safe and cover all cases:
                if (this.turret && !this.turret.parent) this.setHierarchyVisibility(this.turret, easedAlpha);
                if (this.barrel && !this.barrel.parent) this.setHierarchyVisibility(this.barrel, easedAlpha);

                // Wheels/Tracks
                for (const wheel of this.wheels) {
                    if (wheel && !wheel.parent) this.setHierarchyVisibility(wheel, easedAlpha);
                }

            } else {
                // Анимация завершена - устанавливаем полную видимость
                if (this.chassis) this.setHierarchyVisibility(this.chassis, 1.0);

                // Ensure everything is fully visible
                if (this.turret && !this.turret.parent) this.setHierarchyVisibility(this.turret, 1.0);
                if (this.barrel && !this.barrel.parent) this.setHierarchyVisibility(this.barrel, 1.0);
                for (const wheel of this.wheels) {
                    if (wheel && !wheel.parent) this.setHierarchyVisibility(wheel, 1.0);
                }

                this.spawnStartTime = 0; // Сбрасываем таймер
            }
        }

        // Update tracer mark status
        this.updateMarkStatus();

        // ОПТИМИЗАЦИЯ: Вычисляем расстояние до цели (квадрат, без sqrt)
        this.distanceToTargetSq = 1000000; // 1000м в квадрате по умолчанию
        if (this.target && this.target.chassis) {
            const dx = this.chassis.position.x - this.target.chassis.position.x;
            const dz = this.chassis.position.z - this.target.chassis.position.z;
            this.distanceToTargetSq = dx * dx + dz * dz;
        }

        // ОПТИМИЗАЦИЯ: Distance-based AI update frequency
        // PERFORMANCE FIX: Даже NIGHTMARE использует distance-based интервалы для стабильного FPS
        // NIGHTMARE боты остаются умными, но не убивают производительность
        let updateInterval: number;
        if (this.difficulty === "nightmare") {
            // NIGHTMARE: Быстрее чем обычные, но всё ещё distance-based для производительности
            // Ближние (< 50м): каждые 2 кадра, средние (< 100м): каждые 3, дальние: каждые 5
            if (this.distanceToTargetSq < this.NEAR_DISTANCE_SQ) {
                updateInterval = 2; // Ближние NIGHTMARE боты - каждые 2 кадра
            } else if (this.distanceToTargetSq < this.MID_DISTANCE_SQ) {
                updateInterval = 3; // Средние NIGHTMARE боты - каждые 3 кадра  
            } else {
                updateInterval = 5; // Дальние NIGHTMARE боты - каждые 5 кадров
            }
        } else if (this.distanceToTargetSq < this.NEAR_DISTANCE_SQ) {
            updateInterval = this.AI_UPDATE_NEAR; // Near: каждый кадр
        } else if (this.distanceToTargetSq < this.MID_DISTANCE_SQ) {
            updateInterval = this.AI_UPDATE_MID;  // Mid: каждые 3 кадра
        } else {
            updateInterval = 15;  // ОПТИМИЗАЦИЯ: Far - каждые 15 кадров (4 Hz) вместо 10 для лучшей производительности
        }

        // AI обновляется с частотой зависящей от расстояния
        if (this._tick % updateInterval === 0) {
            this.updateAI();
            this.executeState();
        }

        // Башня ВСЕГДА обновляется каждый кадр (дёшевая операция)
        this.updateTurret();

        // Активное наведение на игрока
        // NIGHTMARE: Наведение на любом расстоянии в пределах detectRange!
        const shouldAim = this.difficulty === "nightmare"
            ? (this.target && this.target.isAlive && this.target.chassis && this.distanceToTargetSq < this.detectRange * this.detectRange)
            : (this.distanceToTargetSq < this.NEAR_DISTANCE_SQ && this.target && this.target.isAlive && this.target.chassis && this.distanceToTargetSq < this.detectRange * this.detectRange);

        if (shouldAim) {
            this.aimAtTarget();
        }

        // УЛУЧШЕНО: Обновляем эскалацию сложности и использование высот
        // ВАЖНО: Локальный рост интеллекта отключается, если включён глобальный интеллект
        // ОПТИМИЗАЦИЯ: Используем кэшированную ссылку
        const now = Date.now();
        if (!EnemyTank._cachedGlobalIntel || (now - EnemyTank._lastGlobalIntelCheck) > EnemyTank.GLOBAL_INTEL_CHECK_INTERVAL) {
            EnemyTank._cachedGlobalIntel = GlobalIntelligenceManager.getInstance();
            EnemyTank._lastGlobalIntelCheck = now;
        }
        const globalIntel = EnemyTank._cachedGlobalIntel;
        if (this.target && this.target.isAlive && globalIntel && !globalIntel.isEnabled()) {
            // Локальный рост интеллекта только если глобальный выключен
            this.combatTime += 16; // ~16ms per frame
            // СУПЕР-УМНЫЕ БОТЫ: Интеллект растёт ОЧЕНЬ быстро!
            // NIGHTMARE AI: Интеллект растёт В 3 РАЗА БЫСТРЕЕ и до 6.0!
            const intelligenceGrowthInterval = this.difficulty === "nightmare" ? 2000 : 3000; // NIGHTMARE: Еще быстрее!
            const intelligenceGrowthAmount = this.difficulty === "nightmare" ? 0.7 : 0.5; // NIGHTMARE: Больше за раз!
            const maxIntelligence = this.difficulty === "nightmare" ? 6.0 : 5.0; // NIGHTMARE: Выше максимум!

            if (this.combatTime > intelligenceGrowthInterval && this.adaptiveIntelligence < maxIntelligence) {
                this.adaptiveIntelligence += intelligenceGrowthAmount;
                this.combatTime = 0;
                logger.debug(`[EnemyTank ${this.id}] ${this.difficulty.toUpperCase()}: Intelligence increased to ${this.adaptiveIntelligence.toFixed(2)}`);
            }
        }

        // УЛУЧШЕНО: Периодически проверяем возможность использования высот
        // Используем уже объявленную переменную now
        if (now - this.lastHighGroundCheck > this.HIGH_GROUND_CHECK_INTERVAL && this.target && this.state === "attack") {
            this.lastHighGroundCheck = now;
            // ОПТИМИЗАЦИЯ: Используем кэшированную позицию
            const myPos = this._cachedAbsolutePosition;
            const highGround = this.findHighGround(myPos);
            if (highGround && Vector3.Distance(myPos, highGround) < 30) {
                // Высота близко - можем использовать её для тактического преимущества
                this.highGroundPosition = highGround;
            }
        }
    }

    // === PHYSICS UPDATE (ИДЕНТИЧНО ИГРОКУ!) ===
    // КРИТИЧНО: Физика ботов теперь работает ТОЧНО ТАК ЖЕ как у игрока!
    // Используем ТОЛЬКО силы и моменты - НИКАКИХ прямых изменений position/rotation!

    public updatePhysics(): void {
        if (!this.isAlive || !this.chassis || this.chassis.isDisposed() || !this.physicsBody) return;

        // Skip physics during spawn stabilization
        if (this._spawnStabilizing) {
            // PERFORMANCE: Используем статический кэшированный вектор
            this.physicsBody.setLinearVelocity(EnemyTank.ZERO_VECTOR);
            this.physicsBody.setAngularVelocity(EnemyTank.ZERO_VECTOR);
            return;
        }

        // КРИТИЧНО: Восстанавливаем иерархию если она нарушена
        // Это предотвращает исчезновение стволов у ботов
        if (this.turret && this.turret.parent !== this.chassis) {
            this.turret.parent = this.chassis;
        }
        if (this.barrel && this.turret && this.barrel.parent !== this.turret) {
            // Восстанавливаем parent для barrel
            this.barrel.parent = this.turret;
            // Убеждаемся что barrel видим
            if (this.barrel.visibility < 1.0) {
                this.barrel.visibility = 1.0;
            }
        }
        // КРИТИЧНО: Проверяем что barrel не был случайно удален
        if (this.barrel && this.barrel.isDisposed()) {
            // Если barrel был удален - пересоздаем его
            console.warn(`[EnemyTank ${this.id}] Barrel was disposed, recreating...`);
            this.barrel = this.createBarrel();
        }

        try {
            const body = this.physicsBody;
            if (!this._tmpPos) this._tmpPos = new Vector3();
            const pos = this._tmpPos;
            pos.copyFrom(this.chassis.position);

            const vel = body.getLinearVelocity();
            const angVel = body.getAngularVelocity();
            if (!vel || !angVel) return;

            // === ЗАЩИТА ОТ NaN/INFINITY (как у игрока) ===
            if (!isFinite(vel.x) || !isFinite(vel.y) || !isFinite(vel.z)) {
                // PERFORMANCE: Используем статический кэшированный вектор
                body.setLinearVelocity(EnemyTank.ZERO_VECTOR);
                return;
            }
            if (!isFinite(angVel.x) || !isFinite(angVel.y) || !isFinite(angVel.z)) {
                // PERFORMANCE: Используем статический кэшированный вектор
                body.setAngularVelocity(EnemyTank.ZERO_VECTOR);
                return;
            }

            // === ОГРАНИЧЕНИЕ СКОРОСТЕЙ (как у игрока) ===
            const maxLinearSpeed = 50;
            // Для маленьких корпусов (scout, racer) ограничиваем angular velocity сильнее
            // чтобы они не вращались хаотично
            const isSmallChassis = this.chassisType.mass < 3000 ||
                this.chassisType.id === "scout" ||
                this.chassisType.id === "racer";
            const maxAngularSpeed = isSmallChassis ? 4 : 8; // Меньше для маленьких корпусов

            if (vel.length() > maxLinearSpeed) {
                body.setLinearVelocity(vel.normalize().scale(maxLinearSpeed));
            }
            if (angVel.length() > maxAngularSpeed) {
                // Используем масштабированное ограничение угловой скорости
                const maxAngVel = this.maxAngularVelocity;
                body.setAngularVelocity(angVel.normalize().scale(Math.min(maxAngularSpeed, maxAngVel)));
            }

            // Дополнительное ограничение для X и Z осей (предотвращение опрокидывания)
            if (isSmallChassis) {
                // PERFORMANCE: Используем кэшированный вектор вместо clone()
                this._clampedAngVelVec.copyFrom(angVel);
                this._clampedAngVelVec.x = Math.max(-2, Math.min(2, this._clampedAngVelVec.x));
                this._clampedAngVelVec.z = Math.max(-2, Math.min(2, this._clampedAngVelVec.z));
                if (this._clampedAngVelVec.x !== angVel.x || this._clampedAngVelVec.z !== angVel.z) {
                    body.setAngularVelocity(this._clampedAngVelVec);
                }
            }

            // Получаем ориентацию танка
            if (!this._cachedWorldMatrix || (this._tick % 2 === 0)) {
                this._cachedWorldMatrix = this.chassis.getWorldMatrix();
            }
            const rotMatrix = this._cachedWorldMatrix;

            // _tmpForward, _tmpRight, _tmpUp уже инициализированы при объявлении
            const forward = Vector3.TransformNormalToRef(Vector3.Forward(), rotMatrix, this._tmpForward);
            forward.normalize();
            const right = Vector3.TransformNormalToRef(Vector3.Right(), rotMatrix, this._tmpRight);
            right.normalize();
            const up = Vector3.TransformNormalToRef(Vector3.Up(), rotMatrix, this._tmpUp);
            up.normalize();

            const fwdSpeed = Vector3.Dot(vel, forward);
            const absFwdSpeed = Math.abs(fwdSpeed);

            // === GROUND HEIGHT (raycast каждые 8 кадров как у игрока) ===
            let groundHeight = pos.y - this.hoverHeight;

            if (!this._groundRaycastCache || (this._tick - this._groundRaycastCache.frame) >= 8) {
                // PERFORMANCE: Используем кэшированные объекты вместо new Vector3/Ray
                this._groundRayStart.set(pos.x, pos.y + 0.5, pos.z);
                this._groundRay.origin.copyFrom(this._groundRayStart);
                const groundRay = this._groundRay;

                const groundFilter = (mesh: any) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "enemyTank" || meta.type === "playerTank")) return false;
                    if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
                    return true;
                };

                const groundPick = this.scene.pickWithRay(groundRay, groundFilter);
                if (groundPick && groundPick.hit && groundPick.pickedPoint) {
                    groundHeight = groundPick.pickedPoint.y;
                } else {
                    groundHeight = pos.y - this.hoverHeight;
                }
                this._groundRaycastCache = { groundHeight, frame: this._tick };
            } else {
                groundHeight = this._groundRaycastCache.groundHeight;
            }

            // === 1. HOVER СИСТЕМА (ИДЕНТИЧНО ИГРОКУ) ===
            let totalVerticalForce = 0;

            // Защита от проваливания - мягкая коррекция, НЕ сильный толчок
            if (pos.y < groundHeight - 1.0) {
                const pushUpForce = (groundHeight + 1.0 - pos.y) * 20000; // УМЕНЬШЕНО с 50000
                // PERFORMANCE: Используем кэшированный вектор
                this._pushUpForceVec.set(0, pushUpForce, 0);
                body.applyForce(this._pushUpForceVec, pos);
                if (vel.y < -3) {
                    // PERFORMANCE: Используем кэшированный вектор
                    this._clampedVelVec.set(vel.x, -3, vel.z);
                    body.setLinearVelocity(this._clampedVelVec);
                }
            }

            const targetHeight = groundHeight + this.hoverHeight;
            const deltaY = targetHeight - pos.y;
            const velY = vel.y;
            const absVelY = Math.abs(velY);

            const isMoving = absFwdSpeed > 0.5;
            const isClimbing = deltaY > 0 && Math.abs(this.smoothThrottle) > 0.3;

            if (deltaY > 0) {
                // Танк ниже цели - поднимаем
                const hoverSensitivity = isMoving && !isClimbing ? 0.4 : 1.0;
                const stiffnessMultiplier = 1.0 + Math.min(Math.abs(deltaY) * 0.03, 0.2) * hoverSensitivity;
                const dampingMultiplier = isMoving ? 2.5 : 2.0;
                const hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping * dampingMultiplier);

                const movementReduction = isMoving && !isClimbing ? 0.6 : 1.0;
                const dynamicMaxForce = Math.min(
                    (absVelY > 30 ? 3000 : (absVelY > 15 ? 6000 : 10000)) * movementReduction,
                    this.hoverStiffness * 1.5
                );
                totalVerticalForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
            } else {
                // Танк выше цели - мягко опускаем
                const hoverForce = (deltaY * this.hoverStiffness * 0.8) - (velY * this.hoverDamping * 3.0);
                const dynamicMaxForce = isMoving ? 4000 : 8000;
                totalVerticalForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
            }

            // Прижимная сила при движении
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const downforceFactor = PHYSICS_CONFIG.enemyTank.arcade.downforceFactor;
                const downForce = Math.abs(this.smoothThrottle) * downforceFactor * absFwdSpeed * 0.4;
                totalVerticalForce -= downForce;
            }

            // Применяем ОДНУ вертикальную силу
            if (isFinite(totalVerticalForce)) {
                body.applyForce(new Vector3(0, totalVerticalForce, 0), pos);
            }

            // === 2. KEEP UPRIGHT (ИДЕНТИЧНО ИГРОКУ - только моменты!) ===
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));

            // Аккумулятор для ВСЕХ угловых моментов X/Z
            let totalTorqueX = 0;
            let totalTorqueZ = 0;

            // Нормальное выравнивание
            const uprightForce = PHYSICS_CONFIG.enemyTank.arcade.uprightForce || 15000;
            const uprightDamp = PHYSICS_CONFIG.enemyTank.arcade.uprightDamp || 8000;
            totalTorqueX += -tiltX * uprightForce - angVel.x * uprightDamp;
            totalTorqueZ += -tiltZ * uprightForce - angVel.z * uprightDamp;

            // Экстренное выравнивание если слишком наклонён
            if (up.y < 0.7) {
                const emergencyForce = PHYSICS_CONFIG.enemyTank.arcade.emergencyForce || 25000;
                totalTorqueX += -tiltX * emergencyForce;
                totalTorqueZ += -tiltZ * emergencyForce;

                // Подъёмная сила чтобы не застрять
                if (up.y < 0.5) {
                    const liftForce = (0.9 - up.y) * 50000;
                    body.applyForce(new Vector3(0, liftForce, 0), pos);
                }
            }

            // Применяем ВСЕ выравнивающие моменты ОДНОЙ командой
            if (isFinite(totalTorqueX) && isFinite(totalTorqueZ)) {
                this.applyTorque(new Vector3(totalTorqueX, 0, totalTorqueZ));
            }

            // Ограничение угловой скорости по X/Z (но не Y - поворот)
            const maxTiltAngVel = 3.0;
            if (Math.abs(angVel.x) > maxTiltAngVel || Math.abs(angVel.z) > maxTiltAngVel) {
                const clampedX = Math.max(-maxTiltAngVel, Math.min(maxTiltAngVel, angVel.x));
                const clampedZ = Math.max(-maxTiltAngVel, Math.min(maxTiltAngVel, angVel.z));
                body.setAngularVelocity(new Vector3(clampedX, angVel.y, clampedZ));
            }

            // === 3. MOVEMENT (ИДЕНТИЧНО ИГРОКУ) ===
            // Плавная интерполяция throttle/steer
            this.smoothThrottle += (this.throttleTarget - this.smoothThrottle) * 0.12;
            this.smoothSteer += (this.steerTarget - this.smoothSteer) * 0.18;

            // Вычисляем целевую скорость и силу
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const speedDiff = targetSpeed - fwdSpeed;

            if (Math.abs(this.smoothThrottle) > 0.05) {
                const accelForce = speedDiff * this.acceleration;
                const maxAccelForce = this.moveSpeed * this.mass * 4.0;
                const clampedAccelForce = Math.max(-maxAccelForce, Math.min(maxAccelForce, accelForce));

                if (isFinite(clampedAccelForce)) {
                    const moveForce = forward.scale(clampedAccelForce);
                    body.applyForce(moveForce, pos);
                }
            }

            // === 3.5. PITCH EFFECT: Наклон танка при движении (СИНХРОНИЗИРОВАНО С ИГРОКОМ) ===
            // При движении вперёд - поднимается перед (pitch назад)
            // При движении назад - поднимается зад (pitch вперёд)
            const pitchTorque = PHYSICS_CONFIG.enemyTank.movement.pitchTorque;
            if (Math.abs(this.smoothThrottle) > 0.1 && pitchTorque > 0) {
                // Направление torque: отрицательный X = перед вверх, положительный X = зад вверх
                const pitchDirection = -this.smoothThrottle; // Инвертируем для правильного эффекта
                const speedFactor = Math.min(1.0, absFwdSpeed / this.moveSpeed); // Пропорционально скорости
                const effectivePitchTorque = pitchDirection * pitchTorque * speedFactor;

                // Применяем torque в локальных координатах танка (вокруг оси Right)
                const right = this.chassis.getDirection(Vector3.Right());
                const torqueVec = right.scale(effectivePitchTorque);
                try {
                    const bodyAny = body as any;
                    if (bodyAny.applyTorque) {
                        bodyAny.applyTorque(torqueVec);
                    } else if (bodyAny.applyAngularImpulse) {
                        bodyAny.applyAngularImpulse(torqueVec.scale(0.016));
                    }
                } catch (e) {
                    // Игнорируем ошибки
                }
            }

            // === 4. TURN (ИДЕНТИЧНО ИГРОКУ) ===
            const speedRatio = absFwdSpeed / this.moveSpeed;
            const turnSpeedMultiplier = 1.0 + (1.0 - speedRatio) * 0.5;
            const effectiveTurnSpeed = this.turnSpeed * turnSpeedMultiplier;

            const targetTurnRate = this.smoothSteer * effectiveTurnSpeed;
            const currentTurnRate = angVel.y;

            // Аккумулятор для ВСЕХ угловых моментов Y
            let totalTorqueY = 0;

            const isTurning = Math.abs(this.smoothSteer) > 0.1;
            const angularAccelMultiplier = isTurning ? 1.2 : 1.5;
            totalTorqueY += (targetTurnRate - currentTurnRate) * 11000 * angularAccelMultiplier * this.turnForceMultiplier;

            // Стабилизация при повороте на скорости
            if (speedRatio > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                totalTorqueY += -angVel.y * 2000 * speedRatio * 0.5;
            }

            // Yaw damping когда не поворачиваем
            if (Math.abs(this.smoothSteer) < 0.05) {
                totalTorqueY += -angVel.y * 4500 * 0.7;
            }

            // Применяем ВСЕ угловые моменты Y ОДНОЙ командой
            if (isFinite(totalTorqueY)) {
                this.applyTorque(new Vector3(0, totalTorqueY, 0));
            }

            // === 5. ANTI-ROLL (ИДЕНТИЧНО ИГРОКУ) ===
            if (Math.abs(this.smoothSteer) > 0.1 && absFwdSpeed > 0.5) {
                const antiRollFactor = PHYSICS_CONFIG.enemyTank.arcade.antiRollFactor || 0.3;
                const rollAngle = this.smoothSteer > 0 ? tiltZ : -tiltZ;
                const rollCorrection = -rollAngle * antiRollFactor * absFwdSpeed * this.mass * 50;

                if (isFinite(rollCorrection) && Math.abs(rollCorrection) > 0.1) {
                    this.applyTorque(new Vector3(rollCorrection, 0, 0));
                }
            }

            // === 6. SIDE FRICTION (ИДЕНТИЧНО ИГРОКУ) ===
            const sideSpeed = Vector3.Dot(vel, right);
            const sideFrictionMultiplier = 1.0 + absFwdSpeed / this.moveSpeed * 0.5;
            const sideFrictionForce = right.scale(-sideSpeed * 13000 * sideFrictionMultiplier);
            body.applyForce(sideFrictionForce, pos);

            // === 7. DRAG WHEN STOPPED (ИДЕНТИЧНО ИГРОКУ) ===
            if (Math.abs(this.throttleTarget) < 0.05) {
                const sideVel = Vector3.Dot(vel, right);
                body.applyForce(right.scale(-sideVel * 8000), pos);

                const fwdVel = Vector3.Dot(vel, forward);
                body.applyForce(forward.scale(-fwdVel * 7000), pos);

                this.applyTorque(new Vector3(0, -angVel.y * 5000, 0));
            }

            // === 8. ANTI-FLY (строгое ограничение вертикальной скорости вверх) ===
            if (vel.y > 0.5) { // Танки НЕ должны летать вверх!
                body.setLinearVelocity(new Vector3(vel.x, 0, vel.z)); // Жёстко ограничиваем скорость вверх
            }

            // === 9. AUTO-RESET (только для критических ситуаций) ===
            const isFallen = pos.y < -10;
            if (isFallen) {
                this.reset();
            }

        } catch (e) {
            // Silent fail
        }
    }

    // === ANTI-STUCK SYSTEM ===

    private checkAndFixStuck(): boolean {
        const now = Date.now();
        if (now - this.stuckTimer < this.STUCK_CHECK_INTERVAL) return false;

        const pos = this.chassis.position;
        const vel = this.physicsBody?.getLinearVelocity();

        // Проверка 1: Высота выше нормы относительно земли
        // Используем raycast для определения высоты над землёй
        const rayStart = new Vector3(pos.x, pos.y + 2, pos.z);
        const ray = new Ray(rayStart, Vector3.Down(), 20);
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "bullet" || meta.type === "enemyTank")) return false;
            return true;
        });

        let groundY = 0;
        if (pick && pick.hit && pick.pickedPoint) {
            groundY = pick.pickedPoint.y;
        } else {
            // УЛУЧШЕНО: Если raycast не нашёл землю, используем game.getGroundHeight
            // ОПТИМИЗАЦИЯ: Вызываем только раз в несколько проверок (каждые 2 проверки = раз в 800мс)
            const checkCount = Math.floor((now - this.stuckTimer) / this.STUCK_CHECK_INTERVAL);
            if (checkCount % 2 === 0) {
                const game = (window as any).gameInstance;
                if (game && typeof game.getGroundHeight === 'function') {
                    groundY = game.getGroundHeight(pos.x, pos.z);
                } else {
                    groundY = pos.y - this.hoverHeight; // Fallback
                }
            } else {
                // Используем кэшированное значение из _groundRaycastCache
                if (this._groundRaycastCache) {
                    groundY = this._groundRaycastCache.groundHeight;
                } else {
                    groundY = pos.y - this.hoverHeight;
                }
            }
        }

        const heightAboveGround = pos.y - groundY;

        // КРИТИЧНО: Если провалились под террейн - применяем СИЛУ вверх, НЕ телепортацию!
        // Телепортация вызывает конфликты с физическим движком
        if (heightAboveGround < -1.0 || pos.y < groundY - 2.0) {
            // Применяем МЯГКУЮ коррекцию вверх вместо сильного толчка
            const pushUpForce = (groundY + 1.0 - pos.y) * 30000; // УМЕНЬШЕНО с 80000
            this.physicsBody.applyForce(new Vector3(0, pushUpForce, 0), pos);
            // Ограничиваем вертикальную скорость вниз
            if (vel && vel.y < -3) {
                this.physicsBody.setLinearVelocity(new Vector3(vel.x, -3, vel.z)); // УМЕНЬШЕНО с -2
            }
            this.consecutiveStuckCount = 0;
            this.stuckTimer = now;
            return true;
        }

        // Проверка 2: Летим вверх - ЖЁСТКОЕ ограничение (танки НЕ должны летать!)
        if (vel && vel.y > 0.5) {
            logger.debug(`[EnemyTank ${this.id}] Flying up (velY=${vel.y.toFixed(2)}), clamping to 0`);
            // Жёстко сбрасываем вертикальную скорость вверх
            this.physicsBody.setLinearVelocity(new Vector3(vel.x, 0, vel.z));
            this.stuckTimer = now;
            return true;
        }

        // Проверка 3: Не двигаемся при попытке движения (УЛУЧШЕНО)
        const moved = Vector3.Distance(pos, this.lastStuckCheckPos);
        const isAttemptingMove = Math.abs(this.throttleTarget) > 0.1 || Math.abs(this.steerTarget) > 0.3;

        if (moved < this.STUCK_THRESHOLD && isAttemptingMove) {
            this.consecutiveStuckCount++;

            // УЛУЧШЕНО: Более быстрая реакция на застревание - 1 проверка вместо 2
            if (this.consecutiveStuckCount >= 1) {
                logger.debug(`[EnemyTank ${this.id}] Stuck in place (moved ${moved.toFixed(2)}), forcing unstuck`);
                this.forceUnstuck();
                this.consecutiveStuckCount = 0;
                this.stuckTimer = now;
                return true;
            }
        } else {
            // Сбрасываем счётчик если двигаемся
            if (moved > this.STUCK_THRESHOLD * 2) {
                this.consecutiveStuckCount = 0;
            }
        }

        // Проверка 4: Застревание в бою или при преследовании (стреляем/преследуем, но не двигаемся)
        if ((this.state === "attack" || this.state === "chase") && moved < 0.5 && this.target) {
            const timeSinceUnstuck = now - this.lastUnstuckTime;
            if (timeSinceUnstuck > 1000) { // УЛУЧШЕНО: Ещё более частая проверка (1 сек вместо 1.5)
                // ИСПРАВЛЕНО: Принудительно обновляем путь при застревании!
                if (this.target && this.target.chassis) {
                    const targetPos = this.target.chassis.absolutePosition;
                    const myPos = this.chassis.absolutePosition;
                    const predictedTargetPos = targetPos.add(this.targetVelocity.scale(1.5));

                    // Принудительно обновляем путь
                    this.updatePathToTarget(predictedTargetPos, true); // forceUpdate = true
                    this.currentPathIndex = 0; // Сбрасываем индекс пути
                }

                // УЛУЧШЕНО: Более агрессивное маневрирование для выхода из застревания
                const newThrottle = (Math.random() - 0.5) * 1.8; // Увеличено с 1.5
                const newSteer = (Math.random() - 0.5) * 2.2; // Увеличено с 2.0
                const maxChange = 0.25; // УЛУЧШЕНО: Ещё более быстрое изменение (0.25 вместо 0.20)
                const throttleChange = Math.max(-maxChange, Math.min(maxChange, newThrottle - this.throttleTarget));
                const steerChange = Math.max(-maxChange, Math.min(maxChange, newSteer - this.steerTarget));
                this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + throttleChange));
                this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + steerChange));
                this.lastUnstuckTime = now;
            }
        }

        this.lastStuckCheckPos.copyFrom(pos);
        this.stuckTimer = now;
        return false;
    }

    private forceResetToGround(): void {
        if (!this.chassis || !this.physicsBody) return;

        const pos = this.chassis.position.clone();

        // УЛУЧШЕНО: Используем множественные методы для определения высоты земли
        let groundHeight = pos.y - this.hoverHeight; // Значение по умолчанию

        // Метод 1: Raycast
        const rayStart = new Vector3(pos.x, pos.y + 5, pos.z);
        const ray = new Ray(rayStart, Vector3.Down(), 20); // УВЕЛИЧЕНО с 15 до 20
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "bullet" || meta.type === "enemyTank")) return false;
            // Приоритет для ground мешей
            if (mesh.name.startsWith("ground_") || mesh.name.includes("terrain") ||
                mesh.name.includes("chunk") || mesh.name.includes("road")) {
                return true;
            }
            return true;
        });

        if (pick && pick.hit && pick.pickedPoint) {
            groundHeight = pick.pickedPoint.y;
        } else {
            // Метод 2: game.getGroundHeight как fallback
            const game = (window as any).gameInstance;
            if (game && typeof game.getGroundHeight === 'function') {
                const fallbackHeight = game.getGroundHeight(pos.x, pos.z);
                if (fallbackHeight > -10 && fallbackHeight < 200) {
                    groundHeight = fallbackHeight;
                }
            }
        }

        // ИСПРАВЛЕНО: Используем МЯГКИЕ СИЛЫ вместо сильных толчков!
        // Телепортация вызывает конфликты с физическим движком и "дёрганье"
        const targetY = groundHeight + this.hoverHeight;
        const heightDiff = targetY - pos.y;

        // Применяем МЯГКУЮ силу вверх (уменьшено в 5 раз)
        const pushUpForce = heightDiff * 20000; // УМЕНЬШЕНО с 100000
        this.physicsBody.applyForce(new Vector3(0, pushUpForce, 0), pos);

        // Жёстко ограничиваем вертикальную скорость вверх
        const vel = this.physicsBody.getLinearVelocity();
        if (vel) {
            if (vel.y > 0.5) {
                // Танки НЕ должны летать вверх!
                this.physicsBody.setLinearVelocity(new Vector3(vel.x, 0, vel.z));
            } else if (vel.y < -3) {
                this.physicsBody.setLinearVelocity(new Vector3(vel.x, -3, vel.z));
            }
        }

        // Демпфируем угловую скорость для стабилизации
        const angVel = this.physicsBody.getAngularVelocity();
        if (angVel && angVel.length() > 1) {
            this.physicsBody.setAngularVelocity(angVel.scale(0.3));
        }

        // НЕ сбрасываем цели движения - пусть бот продолжает патруль
    }

    private forceUnstuck(): void {
        if (!this.chassis || !this.physicsBody) return;

        const now = Date.now();
        this.lastUnstuckTime = now;

        // УЛУЧШЕНО: Более агрессивная разблокировка
        // 1. Сбрасываем все скорости
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());

        // 2. УЛУЧШЕНО: Плавное изменение направления вместо резкой установки
        const reverseDir = Math.random() > 0.3 ? -1 : 1; // 70% назад, 30% вперёд
        const newThrottle = reverseDir * 0.9;
        const newSteer = (Math.random() - 0.5) * 2.0; // Полный поворот
        const maxChange = 0.20; // Плавное изменение для разблокировки
        const throttleChange = Math.max(-maxChange, Math.min(maxChange, newThrottle - this.throttleTarget));
        const steerChange = Math.max(-maxChange, Math.min(maxChange, newSteer - this.steerTarget));
        this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + throttleChange));
        this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + steerChange));

        // 3. Сильный импульс в выбранном направлении
        const impulseDir = reverseDir > 0
            ? this.chassis.getDirection(Vector3.Backward())
            : this.chassis.getDirection(Vector3.Forward());
        const sideDir = this.chassis.getDirection(Vector3.Right()).scale((Math.random() - 0.5) * 0.5);
        const finalDir = impulseDir.add(sideDir).normalize();
        this.physicsBody.applyImpulse(finalDir.scale(4000), this.chassis.absolutePosition);

        // 4. Генерируем новую точку патруля в случайном направлении (в пределах карты)
        const myPos = this.chassis.absolutePosition;
        const newAngle = Math.random() * Math.PI * 2;

        // ИСПРАВЛЕНО: Получаем границы карты и масштабируем расстояние
        const game = (window as any).gameInstance;
        const currentMapType = game?.mapType || "normal";
        const mapBounds = getMapBoundsFromConfig(currentMapType);
        const mapSize = Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ);
        // Расстояние = 20-40% от размера карты (вместо фиксированных 50-150м)
        const newDist = mapSize * (0.2 + Math.random() * 0.2);

        let newX = myPos.x + Math.cos(newAngle) * newDist;
        let newZ = myPos.z + Math.sin(newAngle) * newDist;

        // Ограничиваем границами карты с отступом
        const margin = 5;
        newX = Math.max(mapBounds.minX + margin, Math.min(mapBounds.maxX - margin, newX));
        newZ = Math.max(mapBounds.minZ + margin, Math.min(mapBounds.maxZ - margin, newZ));

        const newTarget = new Vector3(newX, myPos.y, newZ);

        // 5. Перезаписываем текущую точку патруля
        if (this.patrolPoints.length > 0) {
            this.patrolPoints[this.currentPatrolIndex] = newTarget;
        }

        // 6. Меняем направление обхода препятствий
        this.obstacleAvoidanceDir = Math.random() > 0.5 ? 1 : -1;

        // If stuck too many times, teleport to safe position
        if (this.consecutiveStuckCount > 3) {
            this.forceResetToGround();
            this.consecutiveStuckCount = 0;
        }
    }

    // === OBSTACLE AVOIDANCE ===

    private checkObstacles(): number {
        const now = Date.now();
        if (now - this.lastObstacleCheck < this.OBSTACLE_CHECK_INTERVAL) {
            return this.obstacleAvoidanceDir;
        }
        this.lastObstacleCheck = now;

        if (!this.chassis) return 0;

        const pos = this.chassis.absolutePosition;
        const forward = this.chassis.getDirection(Vector3.Forward()).normalize();
        const right = this.chassis.getDirection(Vector3.Right()).normalize();

        const rayLength = 20; // УЛУЧШЕНО: Увеличена с 15 до 20 для ещё лучшего обнаружения препятствий
        const rayHeight = pos.y + 0.5;
        const rayStart = new Vector3(pos.x, rayHeight, pos.z);

        // Пять лучей: прямо, слегка влево/вправо, сильнее влево/вправо
        const directions = [
            forward.clone(),
            forward.clone().add(right.scale(-0.4)).normalize(), // 22° влево
            forward.clone().add(right.scale(0.4)).normalize(),  // 22° вправо
            forward.clone().add(right.scale(-0.8)).normalize(), // 45° влево
            forward.clone().add(right.scale(0.8)).normalize()   // 45° вправо
        ];

        const hits = directions.map(dir => {
            const ray = new Ray(rayStart, dir, rayLength);
            const pick = this.scene.pickWithRay(ray, mesh => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;

                // Игнорируем другие танки, пули, расходники
                if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" ||
                    meta.type === "bullet" || meta.type === "enemyBullet" || meta.type === "consumable")) return false;

                // Игнорируем билборды
                if (mesh.name.includes("billboard") || mesh.name.includes("hp") || mesh.name.includes("Hp")) return false;

                // Гаражные ворота - проверяем открыты ли они
                if (mesh.name.includes("garageFrontDoor") || mesh.name.includes("garageBackDoor")) {
                    // Если ворота высоко (открыты), игнорируем их
                    if (mesh.position.y > 3.5) return false;
                    // Закрытые ворота - это препятствие
                    return true;
                }

                return mesh.isPickable;
            });
            return pick && pick.hit ? pick.distance : rayLength;
        });

        // Оценка препятствий с весами (центральные лучи важнее)
        const centerHit = hits[0] ?? 100;
        const leftHits = Math.min(hits[1] ?? 100, hits[3] ?? 100);
        const rightHits = Math.min(hits[2] ?? 100, hits[4] ?? 100);

        // УЛУЧШЕНО: Более умный выбор направления обхода
        if (centerHit < 12) { // УВЕЛИЧЕНО с 10 до 12м для более раннего обнаружения
            // Выбираем сторону с большим пространством
            if (leftHits > rightHits + 1.5) { // УМЕНЬШЕНО порог с 2 до 1.5 для более быстрой реакции
                this.obstacleAvoidanceDir = -1; // Влево
            } else if (rightHits > leftHits + 1.5) {
                this.obstacleAvoidanceDir = 1;  // Вправо
            } else {
                // Примерно одинаково - выбираем случайно но консистентно
                this.obstacleAvoidanceDir = this.obstacleAvoidanceDir !== 0 ? this.obstacleAvoidanceDir : (Math.random() > 0.5 ? 1 : -1);
            }
        } else if (centerHit < 7) { // УВЕЛИЧЕНО с 6 до 7м
            // Очень близко - резкий манёвр (с плавным переходом)
            this.obstacleAvoidanceDir = leftHits > rightHits ? -1 : 1;
            // КРИТИЧНО: Исправленная логика плавного изменения - сначала вычисляем желаемое изменение, затем ограничиваем его
            const obstacleThrottle = -0.6;
            const maxObstacleChange = 0.12; // УМЕНЬШЕНО с 0.2 до 0.12 для максимальной плавности
            const desiredObstacleChange = obstacleThrottle - this.throttleTarget;
            const clampedObstacleChange = Math.max(-maxObstacleChange, Math.min(maxObstacleChange, desiredObstacleChange));
            this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + clampedObstacleChange));
        } else {
            this.obstacleAvoidanceDir = 0;
        }

        return this.obstacleAvoidanceDir;
    }

    private applyTorque(torque: Vector3) {
        const body = this.physicsBody as any;
        if (body.applyTorque) {
            body.applyTorque(torque);
        } else if (body.applyAngularImpulse) {
            body.applyAngularImpulse(torque.scale(0.016));
        }
    }

    // === TURRET UPDATE (smooth like player!) ===

    private updateTurret(): void {
        const now = performance.now();

        // Progressive acceleration (like player)
        const wantsToTurn = Math.abs(this.turretTargetAngle - this.turretCurrentAngle) > 0.01;

        if (wantsToTurn) {
            if (this.turretAccelStartTime === 0) {
                this.turretAccelStartTime = now;
            }
            const elapsed = now - this.turretAccelStartTime;
            this.turretAcceleration = Math.min(1.0, 0.01 + (elapsed / 1000) * 0.99);
        } else {
            this.turretAccelStartTime = 0;
            this.turretAcceleration *= 0.8;
        }

        // Smooth turret rotation
        let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // ИСПРАВЛЕНО: Быстрое наведение башни на цель
        const rotationDelta = angleDiff * this.turretSpeed * Math.max(0.6, this.turretAcceleration);
        this.turretCurrentAngle += rotationDelta;
        this.turret.rotation.y = this.turretCurrentAngle;

        // === ВЕРТИКАЛЬНОЕ НАВЕДЕНИЕ СТВОЛА ===
        // Плавно наводим ствол вертикально
        const pitchDiff = this.barrelTargetPitch - this.barrelCurrentPitch;
        this.barrelCurrentPitch += pitchDiff * 0.15;
        // Ограничиваем угол от -12.5° до +12.5° (симметричный диапазон как у игрока)
        const PITCH_LIMIT = Math.PI * 12.5 / 180; // ±12.5° в радианах (≈0.218)
        this.barrelCurrentPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.barrelCurrentPitch));
        // Применяем к стволу (инвертируем знак как у игрока)
        this.barrel.rotation.x = -this.barrelCurrentPitch;
    }

    // === AI SYSTEM ===

    private generatePatrolPoints(center: Vector3): void {
        // УЛУЧШЕНО: Генерируем умный маршрут патрулирования с стратегическими точками
        // Боты должны выезжать из гаража и ездить везде, включая высоты и укрытия!

        // ИСПРАВЛЕНО: Получаем реальные границы карты из MapConstants
        const game = (window as any).gameInstance;
        const currentMapType = game?.mapType || "normal";
        const mapBounds = getMapBoundsFromConfig(currentMapType);

        // Вычисляем размер карты и масштабируем патрульный радиус
        const mapSize = Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ);
        // Патрульный радиус = 30-60% от размера карты (вместо фиксированных 150-350)
        const patrolRadius = mapSize * (0.3 + Math.random() * 0.3);
        const numPoints = 8 + Math.floor(Math.random() * 5); // 8-12 точек маршрута

        // Очищаем старые точки
        this.patrolPoints = [];

        // КРИТИЧНО: Добавляем БЛИЖНЮЮ точку первой для плавного старта
        // Враги начинают с короткого броска вперёд, затем расходятся
        const exitAngle = Math.random() * Math.PI * 2;
        const nearExitX = center.x + Math.cos(exitAngle) * 15; // БЛИЖНЯЯ точка (15 единиц)
        const nearExitZ = center.z + Math.sin(exitAngle) * 15;
        const nearExitPoint = new Vector3(nearExitX, center.y, nearExitZ);
        this.patrolPoints.push(nearExitPoint);

        // Вторая точка - дальше для продолжения движения (но в пределах карты)
        const farDist = Math.min(60, mapSize * 0.3); // Не более 60 или 30% карты
        const farExitX = center.x + Math.cos(exitAngle) * farDist;
        const farExitZ = center.z + Math.sin(exitAngle) * farDist;
        const farExitPoint = new Vector3(farExitX, center.y, farExitZ);
        this.patrolPoints.push(farExitPoint);

        // Генерируем случайные точки по карте
        const otherPoints: Vector3[] = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (Math.PI * 2 / numPoints) * i + Math.random() * 1.2 - 0.6;
            const dist = patrolRadius * (0.4 + Math.random() * 0.6);

            // Смещаем от центра карты, а не от гаража (масштабируем под размер карты)
            const offsetScale = mapSize * 0.3; // 30% от размера карты
            const offsetX = (Math.random() - 0.5) * offsetScale;
            const offsetZ = (Math.random() - 0.5) * offsetScale;

            const x = Math.cos(angle) * dist + offsetX;
            const z = Math.sin(angle) * dist + offsetZ;

            // ИСПРАВЛЕНО: Используем реальные границы карты с отступом 5м от краёв
            const margin = 5;
            const clampedX = Math.max(mapBounds.minX + margin, Math.min(mapBounds.maxX - margin, x));
            const clampedZ = Math.max(mapBounds.minZ + margin, Math.min(mapBounds.maxZ - margin, z));

            // УЛУЧШЕНО: Пытаемся найти высоту для точки патруля (используем высоту террейна)
            let pointY = center.y;
            if (game && typeof game.getGroundHeight === 'function') {
                const groundHeight = game.getGroundHeight(clampedX, clampedZ);
                pointY = Math.max(groundHeight + 1.0, center.y); // Минимум 1м над террейном
            }

            otherPoints.push(new Vector3(clampedX, pointY, clampedZ));
        }

        // Перемешиваем ТОЛЬКО остальные точки (не точку выезда!)
        for (let i = otherPoints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = otherPoints[i]!;
            otherPoints[i] = otherPoints[j]!;
            otherPoints[j] = temp;
        }

        // Добавляем перемешанные точки после точки выезда
        this.patrolPoints.push(...otherPoints);

        // Начинаем патруль сразу!
        this.state = "patrol";
        logger.debug(`[EnemyTank ${this.id}] Generated ${this.patrolPoints.length} patrol points, radius: ${patrolRadius.toFixed(0)}, map bounds: [${mapBounds.minX}, ${mapBounds.maxX}]x[${mapBounds.minZ}, ${mapBounds.maxZ}]`);
    }

    setTarget(target: { chassis: Mesh, isAlive: boolean, currentHealth?: number }): void {
        this.target = target;
    }

    /**
     * КРИТИЧНО: Автоматический поиск цели (игрока) если цель отсутствует
     * Гарантирует что боты ВСЕГДА имеют цель для преследования
     */
    private tryFindPlayerTarget(): void {
        // Получаем игрока через глобальный инстанс игры
        const game = (window as any).gameInstance;
        if (game && game.tank && game.tank.isAlive && game.tank.chassis) {
            this.target = game.tank;
            logger.debug(`[EnemyTank ${this.id}] FALLBACK: Auto-acquired player target`);
        }
    }

    /**
     * УЛУЧШЕНО: Установка AI Coordinator для групповой тактики
     */
    setAiCoordinator(coordinator: AICoordinator | null): void {
        this.aiCoordinator = coordinator;
    }

    /**
     * УЛУЧШЕНО: Сканирование снарядов игрока для уклонения
     */
    private scanIncomingProjectiles(): void {
        // ОПТИМИЗАЦИЯ: Пропускаем для далёких ботов (>150m)
        if (this.distanceToTargetSq > this.MID_DISTANCE_SQ) {
            return;
        }

        const now = Date.now();
        if (now - this.lastProjectileScanTime < this.PROJECTILE_SCAN_INTERVAL) {
            return;
        }
        this.lastProjectileScanTime = now;

        // ОПТИМИЗАЦИЯ: Очищаем старые записи (снаряды которые уже попали или исчезли)
        // Используем обычный цикл вместо filter для лучшей производительности
        const validProjectiles: Array<{ mesh: AbstractMesh, velocity: Vector3, lastUpdate: number }> = [];
        for (let i = 0; i < this.incomingProjectiles.length; i++) {
            const proj = this.incomingProjectiles[i];
            if (!proj) continue;
            if (proj.mesh.isDisposed() || !proj.mesh.isEnabled()) continue;
            // Удаляем если не обновлялись более 200мс
            if (now - proj.lastUpdate > 200) continue;
            validProjectiles.push(proj);
        }
        this.incomingProjectiles = validProjectiles;

        const myPos = this.chassis.absolutePosition;

        // Сканируем все меши на сцене для поиска снарядов игрока
        for (const mesh of this.scene.meshes) {
            if (mesh.isDisposed() || !mesh.isEnabled()) continue;

            const meta = mesh.metadata;
            if (!meta || meta.type !== "bullet" || meta.owner !== "player") continue;

            const bulletPos = mesh.absolutePosition;
            const distance = Vector3.Distance(myPos, bulletPos);

            // Проверяем только близкие снаряды
            if (distance > this.PROJECTILE_DETECTION_RANGE) continue;

            // Вычисляем скорость снаряда
            const physicsBody = (mesh as any).physicsBody;
            let velocity = Vector3.Zero();
            if (physicsBody) {
                const vel = physicsBody.getLinearVelocity();
                if (vel) {
                    velocity = vel.clone();
                }
            } else {
                // Если нет physics body, вычисляем скорость из позиции
                const existing = this.incomingProjectiles.find(p => p.mesh === mesh);
                if (existing) {
                    const timeDelta = (now - existing.lastUpdate) / 1000;
                    if (timeDelta > 0) {
                        const posDelta = bulletPos.subtract(existing.mesh.absolutePosition);
                        velocity = posDelta.scale(1 / timeDelta);
                    }
                }
            }

            // Обновляем или добавляем снаряд
            const existing = this.incomingProjectiles.find(p => p.mesh === mesh);
            if (existing) {
                existing.velocity = velocity;
                existing.lastUpdate = now;
            } else {
                this.incomingProjectiles.push({
                    mesh,
                    velocity,
                    lastUpdate: now
                });
            }
        }
    }

    /**
     * УЛУЧШЕНО: Проверка необходимости уклонения от снаряда
     */
    private checkProjectileThreat(): { shouldDodge: boolean; dodgeDir: Vector3; timeToImpact: number } | null {
        // ОПТИМИЗАЦИЯ: Пропускаем для далёких ботов (>150m)
        if (this.distanceToTargetSq > this.MID_DISTANCE_SQ) {
            return null;
        }

        if (this.incomingProjectiles.length === 0) {
            return null;
        }

        const myPos = this.chassis.absolutePosition;
        const myRadius = 2.0; // Радиус танка для проверки попадания

        for (const proj of this.incomingProjectiles) {
            if (proj.mesh.isDisposed() || !proj.mesh.isEnabled()) continue;

            const bulletPos = proj.mesh.absolutePosition;
            const bulletVel = proj.velocity;

            // Если снаряд не движется - пропускаем
            if (bulletVel.length() < 0.1) continue;

            // Вычисляем время до попадания
            const toBot = myPos.subtract(bulletPos);
            const distToBot = toBot.length();
            const bulletSpeed = bulletVel.length();

            // Проекция вектора на направление движения снаряда
            const bulletDir = bulletVel.normalize();
            const projectedDist = Vector3.Dot(toBot, bulletDir);

            // Если снаряд движется в противоположную сторону - пропускаем
            if (projectedDist < 0) continue;

            // Вычисляем расстояние от траектории снаряда до бота
            const closestPoint = bulletPos.add(bulletDir.scale(projectedDist));
            const distFromTrajectory = Vector3.Distance(myPos, closestPoint);

            // Если снаряд пройдёт мимо - пропускаем
            if (distFromTrajectory > myRadius + 1.0) continue;

            // Вычисляем время до попадания
            const timeToImpact = projectedDist / bulletSpeed;

            // Проверяем что время попадания в допустимом диапазоне
            if (timeToImpact < this.PROJECTILE_DODGE_TIME_MIN || timeToImpact > this.PROJECTILE_DODGE_TIME_MAX) {
                continue;
            }

            // Вычисляем направление уклонения
            const dodgeDir = this.calculateDodgeDirection(bulletPos, bulletVel, myPos);

            return {
                shouldDodge: true,
                dodgeDir,
                timeToImpact
            };
        }

        return null;
    }

    /**
     * УЛУЧШЕНО: Вычисление оптимального направления уклонения
     */
    private calculateDodgeDirection(bulletPos: Vector3, bulletVel: Vector3, myPos: Vector3): Vector3 {
        const bulletDir = bulletVel.normalize();
        const toBot = myPos.subtract(bulletPos);

        // Вычисляем перпендикулярное направление (вбок от траектории)
        const horizontal = new Vector3(bulletDir.x, 0, bulletDir.z).normalize();
        const perpendicular = new Vector3(-horizontal.z, 0, horizontal.x);

        // Выбираем сторону уклонения (в сторону от цели если есть)
        let dodgeSide = perpendicular;
        if (this.target && this.target.chassis) {
            const targetPos = this.target.chassis.absolutePosition;
            const toTarget = targetPos.subtract(myPos);
            const sideDot = Vector3.Dot(toTarget.normalize(), perpendicular);

            // Уклоняемся в сторону от цели (чтобы не приближаться)
            if (sideDot > 0) {
                dodgeSide = perpendicular.scale(-1);
            }
        }

        // Комбинируем: 70% вбок, 30% назад
        const backward = horizontal.scale(-1);
        const dodgeDir = dodgeSide.scale(0.7).add(backward.scale(0.3)).normalize();

        // УЛУЧШЕНО: Проверяем укрытия - уклоняемся в сторону укрытия если возможно
        if (this.currentCoverPosition) {
            const toCover = this.currentCoverPosition.subtract(myPos);
            const coverDir = toCover.normalize();
            const coverDot = Vector3.Dot(coverDir, dodgeDir);

            // Если укрытие в направлении уклонения - корректируем
            if (coverDot > 0.3) {
                return coverDir;
            }
        }

        return dodgeDir;
    }

    /**
     * УЛУЧШЕНО: Выполнение уклонения от снаряда
     */
    private executeDodge(dodgeDir: Vector3, timeToImpact: number): void {
        this.isDodgingProjectile = true;
        this.dodgeDirection = dodgeDir;
        this.dodgeEndTime = Date.now() + (timeToImpact * 1000) + 200; // Добавляем 200мс запаса

        // Переключаемся в состояние уклонения
        if (this.state !== "evade") {
            this.state = "evade";
            this.stateTimer = timeToImpact * 1000 + 300;
        }

        this.evadeDirection = dodgeDir;
    }

    private updateAI(): void {
        const now = Date.now();

        // КРИТИЧНО: FALLBACK - автоматический поиск цели если её нет
        // Это гарантирует что боты ВСЕГДА имеют цель для преследования
        if (!this.target || !this.target.isAlive || !this.target.chassis) {
            this.tryFindPlayerTarget();
        }

        // УЛУЧШЕНО: Сканируем снаряды игрока для уклонения
        this.scanIncomingProjectiles();

        // УЛУЧШЕНО: Проверяем угрозу от снарядов и уклоняемся если нужно
        if (!this.isDodgingProjectile || now < this.dodgeEndTime) {
            const threat = this.checkProjectileThreat();
            if (threat && threat.shouldDodge) {
                // Приоритет: уклонение > атака
                this.executeDodge(threat.dodgeDir, threat.timeToImpact);
                return; // Прерываем обычную логику AI для уклонения
            }
        } else {
            // Завершаем уклонение
            this.isDodgingProjectile = false;
        }

        // УЛУЧШЕНО: Обновляем информацию о близких союзниках для группового поведения
        if (now - this.lastGroupCheckTime > this.GROUP_CHECK_INTERVAL) {
            this.updateNearbyEnemies();
            this.lastGroupCheckTime = now;
        }

        // УЛУЧШЕНО: Обновляем стиль игры игрока для адаптации
        if (now - this.lastStyleUpdateTime > this.STYLE_UPDATE_INTERVAL) {
            this.updatePlayerStyle();
        }

        // Check target validity
        const targetValid = this.target &&
            this.target.isAlive &&
            this.target.chassis &&
            !this.target.chassis.isDisposed();

        if (targetValid) {
            const targetPos = this.target!.chassis.absolutePosition;
            const myPos = this.chassis.absolutePosition;
            const distance = Vector3.Distance(targetPos, myPos);

            // Проверка видимости через raycast (оптимизированная)
            let canSeeTarget = false;

            // УПРОЩЕНО: Всегда считаем что видим цель если в радиусе обнаружения
            // Это исправляет проблему с "невидящими" ботами
            if (distance < this.detectRange) {
                canSeeTarget = true;
            }

            // ОПТИМИЗАЦИЯ: Raycast только для ближних врагов (< 50м) для снижения нагрузки
            if (distance < 50 && distance < this.detectRange) {
                // Для близких врагов (< 100м) используем кэшированный raycast
                const currentFrame = this._tick;

                // Проверяем кэш
                if (this.raycastCache && (currentFrame - this.raycastCache.frame) < this.RAYCAST_CACHE_FRAMES) {
                    canSeeTarget = this.raycastCache.result;
                } else {
                    // Выполняем raycast только если кэш устарел
                    const turretPos = this.turret.getAbsolutePosition();
                    const turretHeight = turretPos.y;
                    const targetHeight = targetPos.y + 1.0;

                    const direction = new Vector3(
                        targetPos.x - turretPos.x,
                        targetHeight - turretHeight,
                        targetPos.z - turretPos.z
                    ).normalize();

                    const rayDistance = Vector3.Distance(turretPos, targetPos);
                    const ray = new Ray(turretPos, direction, rayDistance + 2);

                    const pick = this.scene.pickWithRay(ray, (mesh) => {
                        if (!mesh || !mesh.isEnabled()) return false;
                        const meta = mesh.metadata;
                        // Игнорируем танки, пули, consumables
                        if (meta && (meta.type === "enemyTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
                        // Игнорируем UI элементы
                        if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                        // Игнорируем дочерние элементы танка (более надежная проверка)
                        if (this.isPartOf(mesh)) return false;
                        // Игнорируем части цели (но проверяем стены!)
                        if (mesh === this.target?.chassis || mesh === this.target?.turret || mesh === this.target?.barrel) return false;
                        if (mesh.parent === this.target?.chassis || mesh.parent === this.target?.turret) return false;
                        // КРИТИЧНО: Проверяем стены и здания - они блокируют видимость!
                        if (meta && (meta.type === "wall" || meta.type === "building" || meta.type === "protectiveWall" || meta.type === "enemyWall")) {
                            return true; // Стена блокирует видимость!
                        }
                        // Проверяем другие препятствия
                        if (mesh.name.includes("wall") || mesh.name.includes("building") || mesh.name.includes("barrier")) {
                            return true; // Препятствие блокирует видимость!
                        }
                        return mesh.isPickable && mesh.visibility > 0.5;
                    });

                    // КРИТИЧНО: Цель видна только если raycast НЕ попал в препятствие
                    // или попал в саму цель (или её части)
                    if (!pick || !pick.hit) {
                        canSeeTarget = true; // Нет препятствий
                    } else {
                        // Проверяем, попал ли raycast в цель или её части
                        const hitMesh = pick.pickedMesh;
                        const hitParent = hitMesh?.parent;
                        const isTarget = hitMesh === this.target?.chassis ||
                            hitMesh === this.target?.turret ||
                            hitMesh === this.target?.barrel ||
                            hitParent === this.target?.chassis ||
                            hitParent === this.target?.turret;

                        // Проверяем, не попал ли raycast в стену или здание
                        const hitMeta = hitMesh?.metadata;
                        const isWall = hitMeta && (hitMeta.type === "wall" || hitMeta.type === "building" ||
                            hitMeta.type === "protectiveWall" || hitMeta.type === "enemyWall");
                        const isObstacle = hitMesh?.name?.includes("wall") || hitMesh?.name?.includes("building") ||
                            hitMesh?.name?.includes("barrier");

                        canSeeTarget = isTarget && !isWall && !isObstacle;
                    }

                    // Сохраняем в кэш
                    this.raycastCache = { result: canSeeTarget, frame: currentFrame };
                }
            }

            // ОПТИМИЗАЦИЯ: Для дальних врагов упрощаем логику AI
            const isFarEnemy = distance > this.MID_DISTANCE_SQ; // > 150м
            
            // КРИТИЧНО: Обновляем скорость цели если видим её
            if (canSeeTarget && distance < this.detectRange) {
                // ОПТИМИЗАЦИЯ: Для дальних врагов не обновляем детальную информацию
                if (!isFarEnemy) {
                    // УЛУЧШЕНО: Более точное отслеживание скорости цели для лучшего предсказания
                    if (this.lastTargetPos.length() > 0) {
                        // Используем сглаживание для более стабильного предсказания
                        const newVelocity = targetPos.subtract(this.lastTargetPos).scale(30); // ~30 fps
                        // Сглаживаем скорость (70% новая, 30% старая) для уменьшения дрожания
                        this.targetVelocity = this.targetVelocity.scale(0.3).add(newVelocity.scale(0.7));
                    } else {
                        this.targetVelocity = Vector3.Zero();
                    }
                    this.lastTargetPos.copyFrom(targetPos);
                    this.lastTargetSeenTime = now; // Запоминаем время последнего наблюдения

                    // УЛУЧШЕНО: Обновляем историю позиций для улучшенного предсказания
                    if (now - this.lastPositionHistoryUpdate >= this.POSITION_HISTORY_INTERVAL) {
                        this.updateTargetPositionHistory(targetPos.clone(), now);
                        this.lastPositionHistoryUpdate = now;
                    }

                    // УЛУЧШЕНО: Анализируем паттерн движения периодически
                    if (now - this.lastPatternAnalysisTime >= this.PATTERN_ANALYSIS_INTERVAL) {
                        this.analyzeMovementPattern();
                        this.lastPatternAnalysisTime = now;
                    }
                } else {
                    // Для дальних врагов - только базовая информация
                    this.lastTargetPos.copyFrom(targetPos);
                    this.lastTargetSeenTime = now;
                }
            } else if (distance > this.detectRange * 1.5) {
                // ИСПРАВЛЕНО: НЕ сбрасываем позицию - продолжаем преследовать даже если далеко!
                // Боты должны ВСЕГДА преследовать цель, независимо от расстояния (NIGHTMARE AI)
                // this.lastTargetPos.set(0, 0, 0); // УДАЛЕНО для NIGHTMARE AI
                // this.targetVelocity.set(0, 0, 0); // УДАЛЕНО для NIGHTMARE AI
                // this.targetPositionHistory = []; // УДАЛЕНО для NIGHTMARE AI
            }

            // КРИТИЧНО: makeDecision() вызывается ВСЕГДА, не только при видимости цели!
            // Это гарантирует что боты всегда активны (патрулируют, преследуют и т.д.)
            // ОПТИМИЗАЦИЯ: Для дальних врагов увеличиваем интервал принятия решений
            const decisionInterval = isFarEnemy ? this.decisionInterval * 2 : this.decisionInterval;
            if (now - this.lastDecisionTime > decisionInterval) {
                this.lastDecisionTime = now;
                // Передаём distance и canSeeTarget для правильной логики преследования
                this.makeDecision(distance, canSeeTarget);
            }

            // КРИТИЧНО: Если цель не видна, но была видна недавно - продолжаем преследовать!
            // Боты должны активно преследовать игрока даже когда он за стеной
            if (!canSeeTarget && this.lastTargetPos.length() > 0 && (now - this.lastTargetSeenTime) < 10000) {
                // Цель была видна недавно (в течение 10 секунд) - преследуем!
                if (this.state !== "chase" && this.state !== "attack") {
                    this.state = "chase";
                }
            }
        } else {
            // Нет цели - патрулируем
            if (now - this.lastDecisionTime > this.decisionInterval) {
                this.lastDecisionTime = now;
                this.state = "patrol";
                // ИСПРАВЛЕНО: Убеждаемся, что есть точки патруля
                if (this.patrolPoints.length === 0 && this.chassis) {
                    this.generatePatrolPoints(this.chassis.absolutePosition);
                }
            }
        }

        // NIGHTMARE AI: Подавляющий огонь по последней известной позиции!
        // Стреляем даже когда не видим цель, если видели её недавно
        this.doSuppressiveFire(now);

        // КРИТИЧНО: НЕ вызываем executeState() здесь - он вызывается в update() для избежания двойного вызова
    }

    /**
     * Подавляющий огонь по последней известной позиции цели (только если цель рядом с lastTargetPos)
     */
    private doSuppressiveFire(now: number): void {
        // Проверяем условия для подавляющего огня:
        // 1. Цель была видна недавно (в пределах SUPPRESSIVE_FIRE_DURATION)
        // 2. У нас есть последняя известная позиция
        // 3. Cooldown готов
        // 4. Последняя позиция в радиусе атаки
        // 5. НОВОЕ: Текущая позиция цели близка к lastTargetPos (< MAX_SUPPRESSIVE_DISTANCE)

        if (this.lastTargetPos.length() < 1) return; // Нет данных о позиции

        const timeSinceSeen = now - this.lastTargetSeenTime;
        if (timeSinceSeen <= 0 || timeSinceSeen > this.SUPPRESSIVE_FIRE_DURATION) return;

        // ИСПРАВЛЕНИЕ: Проверяем, что цель не ушла далеко от lastTargetPos
        // Если цель видна и далеко от lastTargetPos - не используем suppressive fire
        if (this.target && this.target.isAlive && this.target.chassis) {
            const currentTargetPos = this.target.chassis.absolutePosition;
            const distanceFromLastKnown = Vector3.Distance(currentTargetPos, this.lastTargetPos);
            if (distanceFromLastKnown > this.MAX_SUPPRESSIVE_DISTANCE) {
                // Цель переместилась далеко - сбрасываем lastTargetPos и не стреляем
                this.lastTargetPos.set(0, 0, 0);
                this.targetVelocity.set(0, 0, 0);
                return;
            }
        }

        const myPos = this.chassis.absolutePosition;
        const distanceToLastPos = Vector3.Distance(myPos, this.lastTargetPos);

        // ИСПРАВЛЕНО: Убрано ограничение - преследуем ВСЕГДА, даже если очень далеко!
        // if (distanceToLastPos > this.attackRange * 1.5) return; // УДАЛЕНО для NIGHTMARE AI

        // Стреляем по последней известной позиции (короткое время)
        if (now - this.lastShotTime >= this.cooldown) {
            // Наводим башню на последнюю позицию
            const dx = this.lastTargetPos.x - myPos.x;
            const dz = this.lastTargetPos.z - myPos.z;
            const chassisQuat = this.chassis.rotationQuaternion;
            const chassisAngle = chassisQuat ? chassisQuat.toEulerAngles().y : this.chassis.rotation.y;
            const targetAngle = Math.atan2(dx, dz);
            this.turretTargetAngle = targetAngle - chassisAngle;

            // Стреляем если примерно направлены
            let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            if (Math.abs(angleDiff) < 0.3) { // Уменьшен допуск для большей точности
                this.fire();
                this.lastShotTime = now;
            }
        }
    }

    private makeDecision(distance: number, canSeeTarget: boolean = true): void {
        // УЛУЧШЕНО: Проверяем приказы от AI Coordinator (приоритет над обычной логикой)
        if (this.aiCoordinator) {
            const order = this.aiCoordinator.getOrder(this.id.toString());
            if (order) {
                // Выполняем приказ от координатора
                switch (order.type) {
                    case "attack":
                        if (order.targetPosition) {
                            this.state = "attack";
                            // Движемся к позиции атаки
                            this.driveToward(order.targetPosition, 1.0);
                        }
                        break;
                    case "flank":
                        if (order.targetPosition) {
                            this.state = "flank";
                            this.driveToward(order.targetPosition, 1.0); // МАКСИМАЛЬНО: Увеличено с 0.9 до 1.0
                        }
                        break;
                    case "cover":
                        if (order.targetPosition) {
                            this.state = "retreat";
                            this.currentCoverPosition = order.targetPosition;
                            this.seekingCover = true;
                        }
                        break;
                    case "retreat":
                        this.state = "retreat";
                        break;
                    case "regroup":
                        // Движемся к позиции перегруппировки
                        if (order.targetPosition) {
                            this.driveToward(order.targetPosition, 0.8);
                        }
                        break;
                }
                // Если получили приказ - не выполняем обычную логику
                if (order.priority <= 3) {
                    return;
                }
            }
        }

        // КРИТИЧНО: Если НЕТ цели или цель недействительна - ВСЕГДА патрулируем
        // (chase без цели приводит к тому, что бот стоит на месте!)
        if (!this.target || !this.target.isAlive || !this.target.chassis) {
            this.state = "patrol";
            // ИСПРАВЛЕНО: Убеждаемся, что есть точки патруля перед переходом в patrol
            if (this.patrolPoints.length === 0 && this.chassis) {
                this.generatePatrolPoints(this.chassis.absolutePosition);
            }
            return;
        }

        // NIGHTMARE AI: ВСЕГДА преследуем цель - НИКОГДА не патрулируем при наличии цели!
        // ИСПРАВЛЕНО: Убрано ограничение на расстояние - преследуем ВСЕГДА, даже если цель очень далеко!
        const healthPercent = this.currentHealth / this.maxHealth;
        const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;

        // === ПРОВЕРКА ИСПОЛЬЗОВАНИЯ СТЕНКИ ===
        if (this.shouldUseWall()) {
            this.activateWall();
        }

        // УЛУЧШЕНО: Проверка использования способностей корпусов
        this.checkAndUseChassisAbilities(healthPercent, distance);

        // ОТКЛЮЧЕНО: Боты сражаются до конца! Никакого отступления!
        // NIGHTMARE AI: Отступление ТОЛЬКО при критическом здоровье (1%)!
        // Боты сражаются до ПОСЛЕДНЕГО!
        // if (healthPercent < 0.01) {
        //     this.state = "retreat";
        //     this.stateTimer = 1500; // NIGHTMARE: Короткое отступление
        //     return;
        // }

        // ИСПРАВЛЕНО: На близкой дистанции (<30м) ВСЕГДА атакуем, игнорируя raycast!
        // Raycast может давать ложные отрицательные результаты из-за земли или других объектов
        const isCloseRange = distance < 30;

        // КРИТИЧНО: Если цель не видна И далеко - только преследуем, не атакуем!
        // Но на близкой дистанции всегда атакуем!
        if (!canSeeTarget && !isCloseRange) {
            // Цель не видна и далеко - только преследуем (не стреляем)
            if (this.state !== "chase") {
                this.clearPath();
            }
            this.state = "chase";
            return; // Не выполняем остальную логику если цель не видна и далеко
        }

        // NIGHTMARE AI: ВСЕГДА преследуем цель - независимо от расстояния!
        // Если цель в радиусе атаки ИЛИ близко (<30м) - атакуем!
        if (distance < this.attackRange || isCloseRange) {
            // В радиусе атаки или близко - переходим в режим атаки
            if (this.state !== "attack") {
                this.clearPath(); // Очищаем путь при переходе в attack
            }
            this.state = "attack";
        } else {
            // Вне радиуса атаки - ВСЕГДА преследуем, даже если очень далеко!
            if (this.state !== "chase") {
                this.clearPath(); // ИСПРАВЛЕНО: Очищаем путь при переходе в chase
            }
            this.state = "chase";
        }

        // УЛУЧШЕНО: Постоянное сканирование укрытий (не только при низком HP)
        const now = Date.now();
        if (now - this.lastCoverCheckTime > this.COVER_CHECK_INTERVAL) {
            // Ищем укрытие в разных ситуациях
            let shouldSeekCover = false;

            // Приоритет 1: Низкое здоровье
            if (healthPercent < 0.25 && distance < 30) {
                shouldSeekCover = true;
            }
            // Приоритет 2: Среднее здоровье и цель сильнее
            else if (healthPercent < 0.5 && healthPercent < targetHealthPercent && distance < 50) {
                shouldSeekCover = Math.random() < 0.5; // 50% шанс (увеличено с 30%)
            }
            // Приоритет 3: Во время атаки для peek-and-shoot тактики (СУПЕР: пороги снижены!)
            else if (distance < this.range && healthPercent > 0.3 && this.getEffectiveIntelligence() > 0.8) {
                shouldSeekCover = Math.random() < 0.4; // СУПЕР: Увеличено с 0.3 до 0.4
            }
            // СУПЕР: Комбинация укрытие + фланг - более частое использование!
            else if (distance < this.range && healthPercent > 0.4 && this.getEffectiveIntelligence() > 1.0 && Math.random() < 0.35) {
                shouldSeekCover = true; // СУПЕР: Увеличено с 0.25 до 0.35
            }

            if (shouldSeekCover) {
                const coverPos = this.findCoverPosition();
                if (coverPos) {
                    this.currentCoverPosition = coverPos;
                    this.seekingCover = true;
                    this.lastCoverCheckTime = now;
                    // ОТКЛЮЧЕНО: Боты НЕ должны отступать к укрытию - они атакуют!
                    // this.state = "retreat";
                    // this.stateTimer = 3000;
                    // Вместо retreat - используем укрытие для фланга
                    if (this.state !== "attack" && this.state !== "flank") {
                        this.state = "flank";
                        this.stateTimer = 2000;
                    }
                    return;
                }
            }

            this.lastCoverCheckTime = now;
        }

        // ОТКЛЮЧЕНО: Боты НЕ должны уклоняться - они атакуют!
        // Priority 2: Seek cover or evade if taking heavy damage
        // if (healthPercent < 0.25 && distance < 20 && !this.seekingCover) {
        //     // Если укрытие не найдено - уклоняемся
        //     if (Math.random() < 0.4) {
        //         this.state = "evade";
        //         this.stateTimer = 1500;
        //         // Выбираем направление уклонения
        //         const angle = Math.random() * Math.PI * 2;
        //         this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
        //         return;
        //     }
        // }

        // СУПЕР-УМНЫЕ засады: более частое и агрессивное использование!
        if (distance < this.range && healthPercent > 0.5 && distance > 25 && distance < 90) { // СУПЕР: расширены диапазоны
            const ambushChance = this.getEffectiveIntelligence() > 1.0 ? 0.45 : 0.30; // СУПЕР: Увеличено с 0.35/0.20 до 0.45/0.30
            // СУПЕР: Координированные засады - если есть союзники, ОЧЕНЬ высокий шанс
            const allyCount = this.getNearbyAllyCount();
            const coordinatedAmbushChance = ambushChance + (allyCount > 0 ? 0.20 * allyCount : 0); // СУПЕР: До +60% при 3 союзниках
            if (Math.random() < Math.min(0.9, coordinatedAmbushChance) && this.findAmbushPosition()) { // СУПЕР: до 90%
                this.state = "ambush";
                this.ambushTimer = 0;
                return;
            }
        }

        // УЛУЧШЕНО: Проверка возможности заманивания (при отступлении с союзниками)
        if (distance < this.range && healthPercent < 0.5 && healthPercent > 0.25 && this.getNearbyAllyCount() > 0) {
            const baitChance = this.adaptiveIntelligence > 1.3 ? 0.20 : 0.10;
            if (Math.random() < baitChance) {
                this.state = "bait";
                this.baitTimer = 0;
                return;
            }
        }

        // Priority 3: In range - attack or flank (УЛУЧШЕННАЯ логика с групповым поведением)
        if (distance < this.range) {
            // УЛУЧШЕНО: Более умный выбор тактики с учётом большего количества факторов
            const shouldFlank = distance > 25 && distance < this.optimalRange * 1.5 && healthPercent > 0.4;
            const shouldAggressiveAttack = targetHealthPercent < 0.5 && healthPercent > targetHealthPercent;
            const hasHealthAdvantage = healthPercent > targetHealthPercent * 1.2;
            const isInOptimalRange = distance >= this.optimalRange * 0.8 && distance <= this.optimalRange * 1.2;

            // УЛУЧШЕНО: Групповая координация - если союзники уже атакуют, больше шанс фланга
            const allyCount = this.getNearbyAllyCount();
            const hasAlliesAttacking = this.hasAlliesAttackingTarget();

            // СУПЕР-АГРЕССИВНАЯ ТАКТИКА: Максимальный шанс фланга!
            let flankChance = 0.0;
            if (shouldFlank) {
                flankChance = 0.80; // СУПЕР: Увеличено с 0.70 до 0.80 - ОЧЕНЬ агрессивный фланг!
                // Увеличиваем шанс фланга если не в оптимальной дистанции
                if (!isInOptimalRange) {
                    flankChance += 0.15; // СУПЕР: Всегда высокий шанс фланга!
                }
                // Увеличиваем шанс фланга если есть преимущество по HP
                if (hasHealthAdvantage) {
                    flankChance += 0.10;
                }
            } else {
                flankChance = 0.40; // СУПЕР: Увеличено с 0.30 до 0.40 - фланг почти всегда!
            }

            // СУПЕР: Если есть союзники - ГАРАНТИРОВАННЫЙ фланг для окружения!
            if (hasAlliesAttacking && allyCount > 0) {
                flankChance = Math.min(0.98, flankChance + 0.35 * allyCount); // СУПЕР: До 98% шанс фланга при координации!
            }

            // Если цель слабая и мы сильнее - меньше фланга, больше атаки (добиваем)
            if (shouldAggressiveAttack && targetHealthPercent < 0.3) {
                flankChance *= 0.3; // Сильно уменьшаем фланг для добивания
            } else if (shouldAggressiveAttack) {
                flankChance *= 0.6;
            }

            if (Math.random() < flankChance) {
                this.state = "flank";
                // УЛУЧШЕНО: Выбираем направление фланга в зависимости от позиции цели и союзников
                if (!this.target || !this.chassis) {
                    this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                    this.stateTimer = 3000;
                    return;
                }

                const myPos = this.chassis.absolutePosition;
                const targetPos = this.target.chassis?.absolutePosition || Vector3.Zero();
                const toTarget = targetPos.subtract(myPos);
                toTarget.y = 0;
                const right = new Vector3(toTarget.z, 0, -toTarget.x).normalize();

                // УЛУЧШЕНО: Если есть союзники, выбираем противоположную сторону для окружения
                if (hasAlliesAttacking && allyCount > 0) {
                    // Находим среднюю позицию союзников
                    let avgAllyPos = Vector3.Zero();
                    let attackingCount = 0;
                    for (const ally of this.nearbyEnemies) {
                        if (ally.target === this.target && ally.state === "attack") {
                            avgAllyPos.addInPlace(ally.chassis.absolutePosition);
                            attackingCount++;
                        }
                    }
                    if (attackingCount > 0) {
                        avgAllyPos.scaleInPlace(1 / attackingCount);
                        const toAlly = avgAllyPos.subtract(myPos);
                        toAlly.y = 0;
                        // Выбираем направление, противоположное союзникам
                        this.flankDirection = Vector3.Dot(right, toAlly.normalize()) > 0 ? -1 : 1;
                    } else {
                        this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                    }
                } else {
                    // Выбираем сторону с большим пространством
                    this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                }
                // МАКСИМАЛЬНО: Более динамичная смена тактик - уменьшено время фланга для более частого переключения
                this.stateTimer = 2000; // Уменьшено с 3000 до 2000мс для более динамичной смены тактик
            } else {
                this.state = "attack";
                // Если цель слабая - агрессивнее атакуем (добиваем)
                if (targetHealthPercent < 0.4) {
                    this.stateTimer = 0; // Не переключаемся на другую тактику
                }
            }
        }
        // NIGHTMARE AI: ВСЕГДА преследуем цель!
        else {
            // NIGHTMARE: Никогда не патрулируем когда есть живая цель - ВСЕГДА преследуем!
            this.state = "chase";
        }
    }

    private executeState(): void {
        switch (this.state) {
            case "idle":
                // Fallback - immediately switch to patrol
                this.state = "patrol";
                this.doPatrol();
                break;
            case "patrol":
                this.doPatrol();
                break;
            case "chase":
                this.doChase();
                break;
            case "attack":
                this.doAttack();
                break;
            case "flank":
                this.doFlank();
                break;
            case "retreat":
                this.doRetreat();
                break;
            case "evade":
                this.doEvade();
                break;
            case "capturePOI":
                this.doCapturePOI();
                break;
            case "ambush":
                this.doAmbush();
                break;
            case "bait":
                this.doBait();
                break;
        }
    }

    private doPatrol(): void {
        // ИСПРАВЛЕНО: Генерируем точки если их нет, но продолжаем патрулирование
        if (this.patrolPoints.length === 0) {
            if (this.chassis) {
                this.generatePatrolPoints(this.chassis.absolutePosition);
                this.currentPatrolIndex = 0;
            }
            // Если после генерации всё ещё нет точек - создаём временную точку
            if (this.patrolPoints.length === 0 && this.chassis) {
                const myPos = this.chassis.absolutePosition;
                const randomAngle = Math.random() * Math.PI * 2;
                const randomDist = 50 + Math.random() * 100;
                this.patrolPoints.push(new Vector3(
                    myPos.x + Math.cos(randomAngle) * randomDist,
                    myPos.y,
                    myPos.z + Math.sin(randomAngle) * randomDist
                ));
            }
        }

        const target = this.patrolPoints[this.currentPatrolIndex];
        if (!target) {
            // Если нет цели - создаём новую точку рядом
            if (this.chassis) {
                const myPos = this.chassis.absolutePosition;
                const randomAngle = Math.random() * Math.PI * 2;
                const randomDist = 50 + Math.random() * 100;
                const newPoint = new Vector3(
                    myPos.x + Math.cos(randomAngle) * randomDist,
                    myPos.y,
                    myPos.z + Math.sin(randomAngle) * randomDist
                );
                this.patrolPoints.push(newPoint);
                this.currentPatrolIndex = this.patrolPoints.length - 1;
            }
            return;
        }
        const myPos = this.chassis.absolutePosition;

        // ОПТИМИЗАЦИЯ: Используем квадрат расстояния для избежания sqrt
        const dx = myPos.x - target.x;
        const dz = myPos.z - target.z;
        const distanceSq = dx * dx + dz * dz;

        // Проверяем достижение точки только каждые несколько кадров для оптимизации
        if (distanceSq < 64 && this._tick % 8 === 0) { // УЛУЧШЕНО: Увеличено с 5 до 8 кадров для лучшей производительности
            // Достигли точки - переходим к следующей
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;

            // СУПЕР: Очень активное патрулирование с поиском целей!
            if (Math.random() < 0.50) { // СУПЕР: Увеличено с 0.35 до 0.50 - чаще меняем точки!
                // СУПЕР: Умные точки - на возвышенностях или у укрытий
                const newAngle = Math.random() * Math.PI * 2;
                const newDist = 80 + Math.random() * 150; // СУПЕР: Ближе точки для более активного поиска
                let newX = myPos.x + Math.cos(newAngle) * newDist;
                let newZ = myPos.z + Math.sin(newAngle) * newDist;

                // СУПЕР: Проверяем высоту террейна для точек на возвышенностях
                const game = (window as any).gameInstance;
                if (game && typeof game.getGroundHeight === 'function') {
                    const groundHeight = game.getGroundHeight(newX, newZ);
                    // Предпочитаем точки на возвышенностях (выше текущей позиции)
                    if (groundHeight > myPos.y + 2) {
                        // Это возвышенность - используем её
                    }
                }

                // СУПЕР: Агрессивная реакция - движение к последней известной позиции цели!
                if (this.target && this.target.isAlive && Math.random() < 0.50) { // СУПЕР: Увеличено с 0.2 до 0.5!
                    // 50% шанс двинуться к последней известной позиции цели - активный поиск!
                    const targetPos = this.target.chassis.absolutePosition;
                    newX = targetPos.x + (Math.random() - 0.5) * 30; // СУПЕР: Ближе к цели!
                    newZ = targetPos.z + (Math.random() - 0.5) * 30;
                }

                this.patrolPoints[this.currentPatrolIndex] = new Vector3(
                    Math.max(-500, Math.min(500, newX)),
                    myPos.y,
                    Math.max(-500, Math.min(500, newZ))
                );
            }
        }

        // ИСПРАВЛЕНО: Используем pathfinding для построения пути к точке патруля
        const now = Date.now();
        const needsPathUpdate = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, target) > 10 ||
            (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL);

        if (needsPathUpdate) {
            this.updatePathToTarget(target);
        }

        // Получаем следующую точку пути
        const nextPathPoint = this.getNextPathPoint();
        const moveTarget = nextPathPoint || target; // Fallback на прямую цель если путь не найден

        // NIGHTMARE AI: Мгновенный старт на МАКСИМАЛЬНОЙ скорости!
        const patrolSpeed = 1.0; // ВСЕГДА максимальная скорость!

        // КРИТИЧНО: driveToward вызывается каждый кадр для плавного обновления throttleTarget и steerTarget
        this.driveToward(moveTarget, patrolSpeed);

        // СУПЕР: Активное сканирование и поиск целей!
        if (!this.target || !this.target.isAlive) {
            // Сканируем быстрее для быстрого обнаружения!
            const scanAngle = Math.sin(Date.now() * 0.002) * 1.2; // СУПЕР: Быстрее и шире сканирование!
            this.turretTargetAngle = scanAngle;
        } else {
            // NIGHTMARE AI: Агрессивное прицеливание и стрельба!
            this.aimAtTarget();
            // NIGHTMARE: Стреляем ВСЕГДА когда цель в радиусе и cooldown готов!
            const myPos = this.chassis.absolutePosition;
            const targetPos = this.target.chassis.absolutePosition;
            const distance = Vector3.Distance(targetPos, myPos);
            const now = Date.now();
            // NIGHTMARE: Стреляем при любом cooldown без ожидания идеального прицела!
            if (distance < this.attackRange && now - this.lastShotTime >= this.cooldown) {
                this.fire();
                this.lastShotTime = now;
                // Мгновенно переключаемся на преследование!
                this.state = "chase";
            }
        }
    }

    // Захват POI
    private doCapturePOI(): void {
        if (!this.targetPOI) {
            this.state = "patrol";
            return;
        }

        const myPos = this.chassis.absolutePosition;
        // ОПТИМИЗАЦИЯ: Используем квадраты расстояния для сравнения
        const dx = myPos.x - this.targetPOI.position.x;
        const dz = myPos.z - this.targetPOI.position.z;
        const distanceSq = dx * dx + dz * dz;
        const distance15Sq = 15 * 15;
        const distance8Sq = 8 * 8;

        if (distanceSq > distance15Sq) {
            // ИСПРАВЛЕНО: Используем pathfinding для умного движения к POI
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, this.targetPOI.position) > 10 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL);

            if (needsPathUpdate) {
                this.updatePathToTarget(this.targetPOI.position);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || this.targetPOI.position;

            // Едем к POI
            this.driveToward(moveTarget, 0.7);
        } else if (distanceSq > distance8Sq) {
            // Подъезжаем ближе к центру
            this.driveToward(this.targetPOI.position, 0.3);
        } else {
            // Стоим на точке - ждём захвата
            this.poiCaptureTime += 16; // ~16ms per frame

            // Вращаем башню для защиты
            const scanAngle = Math.sin(Date.now() * 0.0015) * Math.PI * 0.8;
            this.turretTargetAngle = scanAngle;

            // Проверяем врагов и стреляем
            if (this.target && this.target.isAlive) {
                const targetDist = Vector3.Distance(myPos, this.target.chassis.absolutePosition);
                if (targetDist < this.attackRange) {
                    this.state = "attack";
                    return;
                }
            }

            // Если захватили POI (примерно 30 секунд) - возвращаемся к патрулю
            if (this.poiCaptureTime > 30000) {
                this.targetPOI = null;
                this.poiCaptureTime = 0;
                this.state = "patrol";
            }
        }
    }

    // Установка целевого POI
    setPOITarget(poi: { position: Vector3, type: string, id: string } | null): void {
        this.targetPOI = poi;
        if (poi) {
            this.poiCaptureTime = 0;
            this.state = "capturePOI";
        }
    }

    // Получение текущего состояния
    getState(): AIState {
        return this.state;
    }

    private doChase(): void {
        if (!this.target || !this.target.isAlive || !this.target.chassis) {
            // Если цель недействительна - переключаемся на патруль
            this.clearPath(); // ИСПРАВЛЕНО: Очищаем путь при смене состояния
            this.state = "patrol";
            return;
        }

        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);

        // УЛУЧШЕНО: Более агрессивное преследование - всегда на максимальной скорости
        // СУПЕР-УМНОЕ преследование с идеальным предсказанием движения цели!
        // Предсказываем, где будет цель через оптимальное время для максимально точного перехвата
        // NIGHTMARE AI: Сверх-упреждение для перехвата цели!
        const predictionTime = this.difficulty === "nightmare" ? 2.2 : (this.difficulty === "hard" ? 1.8 : (this.difficulty === "medium" ? 1.3 : 1.0)); // NIGHTMARE: Максимальное предсказание!
        const predictedTargetPos = targetPos.add(this.targetVelocity.scale(predictionTime));

        // ИСПРАВЛЕНО: Используем pathfinding для построения пути к предсказанной позиции цели
        const now = Date.now();
        const needsPathUpdate = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, predictedTargetPos) > 15 ||
            (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.5); // Обновляем чаще при преследовании

        if (needsPathUpdate) {
            this.updatePathToTarget(predictedTargetPos);
        }

        // Получаем следующую точку пути
        const nextPathPoint = this.getNextPathPoint();
        const moveTarget = nextPathPoint || predictedTargetPos; // Fallback на прямую цель если путь не найден

        // УЛУЧШЕНО: Всегда преследуем на максимальной скорости, даже если цель далеко
        // Едем к предсказанной позиции для более эффективного перехвата
        this.driveToward(moveTarget, 1.0); // Всегда максимальная скорость
        this.aimAtTarget();

        // УЛУЧШЕНО: Более частая проверка застревания во время преследования
        if (now - this.stuckTimer > this.STUCK_CHECK_INTERVAL * 0.5) { // Проверяем в 2 раза чаще
            this.checkAndFixStuck();
        }

        // КРИТИЧНО: Проверяем видимость перед стрельбой во время преследования
        const turretPos = this.turret.getAbsolutePosition();
        const direction = targetPos.subtract(turretPos).normalize();
        const rayDistance = Vector3.Distance(turretPos, targetPos);
        const ray = new Ray(turretPos, direction, rayDistance + 2);

        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "enemyTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
            if (this.isPartOf(mesh)) return false;
            if (mesh === this.target?.chassis || mesh === this.target?.turret || mesh === this.target?.barrel) return false;
            if (mesh.parent === this.target?.chassis || mesh.parent === this.target?.turret) return false;
            // КРИТИЧНО: Проверяем стены и здания!
            if (meta && (meta.type === "wall" || meta.type === "building" || meta.type === "protectiveWall" || meta.type === "enemyWall")) {
                return true;
            }
            if (mesh.name.includes("wall") || mesh.name.includes("building") || mesh.name.includes("barrier")) {
                return true;
            }
            return mesh.isPickable && mesh.visibility > 0.5;
        });

        const canSeeTarget = !pick || !pick.hit ||
            (pick.pickedMesh === this.target?.chassis || pick.pickedMesh === this.target?.turret ||
                pick.pickedMesh === this.target?.barrel || pick.pickedMesh?.parent === this.target?.chassis ||
                pick.pickedMesh?.parent === this.target?.turret);

        // ИСПРАВЛЕНО: На близкой дистанции (<30м) стреляем ВСЕГДА, игнорируя raycast!
        const isCloseRange = distance < 30;

        // NIGHTMARE AI: Непрерывный огонь во время преследования!
        // Стреляем если: (в радиусе атаки И видим) ИЛИ очень близко
        if (now - this.lastShotTime >= this.cooldown && (canSeeTarget || isCloseRange)) {
            this.fire();
            this.lastShotTime = now;
        }

        // NIGHTMARE: Быстрый переход в атаку!
        if (distance < this.range * 0.9) { // УВЕЛИЧЕН радиус для более быстрого перехода
            this.state = "attack";
        }
    }

    private doAttack(): void {
        if (!this.target) return;

        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);

        const healthPercent = this.currentHealth / this.maxHealth;
        const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;

        // Aim at target (with prediction!)
        this.aimAtTarget();

        // NIGHTMARE AI: НЕПРЕРЫВНЫЙ ОГОНЬ! Стреляем сразу как только cooldown готов!
        const now = Date.now();
        const isCooldownReady = (now - this.lastShotTime) >= this.cooldown;

        // NIGHTMARE: Стреляем КАЖДЫЙ кадр когда cooldown готов - подавляющий огонь!
        if (isCooldownReady) {
            this.fire();
            this.lastShotTime = now;
        }

        // УЛУЧШЕНО: Более активные и умные микро-манёры с адаптивным поведением
        // === АГРЕССИВНОЕ СБЛИЖЕНИЕ при преимуществе HP ===
        if (healthPercent > 0.6 && targetHealthPercent < 0.4) {
            // Добить раненую цель - приближаемся агрессивно с предсказанием!
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.3));

            // ИСПРАВЛЕНО: Используем pathfinding для умного сближения
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, predictedTargetPos) > 8 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.4);

            if (needsPathUpdate) {
                this.updatePathToTarget(predictedTargetPos);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || predictedTargetPos;

            this.driveToward(moveTarget, 1.0); // МАКСИМАЛЬНО: Увеличено с 0.85 до 1.0 (максимальная скорость)
            return;
        }

        // Улучшенное поддержание оптимальной дистанции с адаптивными маневрами
        let newThrottle: number;
        let newSteer: number;

        // NIGHTMARE AI: МОЛНИЕНОСНЫЕ маневры!
        const maneuverFrequency = healthPercent > 0.6 ? 0.05 : 0.04; // NIGHTMARE: Ещё быстрее!
        const maneuverAmplitude = 0.5; // Умеренная амплитуда для стабильного движения

        if (distance < this.optimalRange * 0.4) {
            // ИСПРАВЛЕНО: Слишком близко - НЕ отступаем, а стрейфим в сторону и стреляем!
            // Боты должны быть агрессивными, не убегать назад!
            newThrottle = 0.3; // Лёгкое движение вперёд вместо -1.0
            newSteer = Math.sin(this._tick * maneuverFrequency * 2.0) * 1.0; // Агрессивный strafe влево-вправо
        } else if (distance < this.optimalRange * 0.7) {
            // ИСПРАВЛЕНО: Близко - агрессивный strafe БЕЗ отступления!
            newThrottle = 0.2; // Слегка вперёд вместо -0.7
            newSteer = Math.sin(this._tick * maneuverFrequency * 1.8) * 0.9; // Боковое движение
        } else if (distance > this.optimalRange * 1.4) {
            // Слишком далеко - МАКСИМАЛЬНОЕ сближение!
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.7));

            // ИСПРАВЛЕНО: Используем pathfinding для умного сближения
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, predictedTargetPos) > 8 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.4);

            if (needsPathUpdate) {
                this.updatePathToTarget(predictedTargetPos);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || predictedTargetPos;

            this.driveToward(moveTarget, 1.0); // NIGHTMARE: МАКСИМАЛЬНАЯ скорость!
            return;
        } else if (distance > this.optimalRange * 1.1) {
            // Немного далеко - быстро приближаемся с предсказанием
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.3));

            // ИСПРАВЛЕНО: Используем pathfinding для умного сближения
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, predictedTargetPos) > 8 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.5);

            if (needsPathUpdate) {
                this.updatePathToTarget(predictedTargetPos);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || predictedTargetPos;

            this.driveToward(moveTarget, 0.7); // СУПЕР: Увеличено с 0.5 до 0.7
            return;
        } else {
            // Оптимальная дистанция - стабильное маневрирование
            // Один простой паттерн для предсказуемого движения
            const strafeSpeed = 0.4; // Умеренная скорость strafe
            newThrottle = Math.sin(this._tick * maneuverFrequency) * strafeSpeed;
            newSteer = Math.cos(this._tick * maneuverFrequency * 1.3) * maneuverAmplitude;
        }

        // УЛУЧШЕНО: Максимальная плавность изменения для предотвращения дёргания
        const maxStateChange = 0.08; // УМЕНЬШЕНО с 0.12 до 0.08 для максимальной плавности
        const desiredThrottleChange = newThrottle - this.throttleTarget;
        const desiredSteerChange = newSteer - this.steerTarget;
        const clampedThrottleChange = Math.max(-maxStateChange, Math.min(maxStateChange, desiredThrottleChange));
        const clampedSteerChange = Math.max(-maxStateChange, Math.min(maxStateChange, desiredSteerChange));
        this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + clampedThrottleChange));
        this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + clampedSteerChange));
    }

    private doFlank(): void {
        if (!this.target) return;

        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;

        // УЛУЧШЕНО: Используем AIPathfinding для поиска оптимальной позиции фланга
        let flankPos: Vector3 | null = null;

        if (this.pathfinding) {
            flankPos = this.pathfinding.findFlankPosition(myPos, targetPos, this.flankDirection);
        }

        // Fallback: старый метод если pathfinding не нашёл позицию
        if (!flankPos) {
            const toTarget = targetPos.subtract(myPos);
            toTarget.y = 0;
            toTarget.normalize();

            const perpendicular = new Vector3(toTarget.z * this.flankDirection, 0, -toTarget.x * this.flankDirection);
            const distance = Vector3.Distance(targetPos, myPos);
            const flankDistance = Math.min(20, Math.max(12, distance * 0.4));
            flankPos = myPos.clone().add(perpendicular.scale(flankDistance));
        }

        // ИСПРАВЛЕНО: Используем pathfinding для умного движения к позиции фланга
        const now = Date.now();
        const needsPathUpdate = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, flankPos) > 10 ||
            (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.7);

        if (needsPathUpdate) {
            this.updatePathToTarget(flankPos);
        }

        const nextPathPoint = this.getNextPathPoint();
        const moveTarget = nextPathPoint || flankPos;

        // NIGHTMARE: Быстрое движение при фланге
        this.driveToward(moveTarget, 1.0);
        this.aimAtTarget();

        // NIGHTMARE AI: Непрерывный огонь во время фланга!
        if (now - this.lastShotTime >= this.cooldown) {
            this.fire();
            this.lastShotTime = now;
        }

        // NIGHTMARE: Быстрый переход к атаке
        this.stateTimer -= 33;
        if (this.stateTimer <= 0) {
            this.state = "attack";
        }
    }

    private doRetreat(): void {
        if (!this.target) return;

        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);

        // УЛУЧШЕНО: Если ищем укрытие - движемся к нему
        if (this.seekingCover && this.currentCoverPosition) {
            const coverDist = Vector3.Distance(myPos, this.currentCoverPosition);

            // Если достигли укрытия или оно слишком далеко - сбрасываем
            if (coverDist < 5 || coverDist > 60) {
                this.seekingCover = false;
                this.currentCoverPosition = null;
                // МАКСИМАЛЬНО: После использования укрытия - переход к флангу (комбинация укрытие + фланг)
                const healthPercent = this.currentHealth / this.maxHealth;
                if (healthPercent > 0.5 && distance < this.range && this.adaptiveIntelligence > 1.2) {
                    this.state = "flank";
                    this.stateTimer = 2000;
                    this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                    return;
                }
            } else {
                // ИСПРАВЛЕНО: Используем pathfinding для умного движения к укрытию
                const now = Date.now();
                const needsPathUpdate = !this.currentPathTarget ||
                    Vector3.Distance(this.currentPathTarget, this.currentCoverPosition) > 10 ||
                    (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.6);

                if (needsPathUpdate) {
                    this.updatePathToTarget(this.currentCoverPosition);
                }

                const nextPathPoint = this.getNextPathPoint();
                const moveTarget = nextPathPoint || this.currentCoverPosition;

                // Движемся к укрытию
                this.driveToward(moveTarget, 1.0);
                this.aimAtTarget();

                // NIGHTMARE AI: Непрерывный огонь даже при движении к укрытию!
                if (now - this.lastShotTime >= this.cooldown) {
                    this.fire();
                    this.lastShotTime = now;
                }
                return;
            }
        }

        // УЛУЧШЕНО: Более умное отступление с учётом препятствий
        const awayDir = myPos.subtract(targetPos);
        awayDir.y = 0;
        awayDir.normalize();

        // УЛУЧШЕНО: Проверяем препятствия и корректируем направление отступления
        const obstacleDir = this.checkObstacles();
        if (obstacleDir !== 0) {
            // Если препятствие впереди, немного смещаемся в сторону
            const right = new Vector3(awayDir.z, 0, -awayDir.x);
            awayDir.add(right.scale(obstacleDir * 0.4)).normalize();
        }

        // УЛУЧШЕНО: Более дальнее отступление для лучшей безопасности
        const retreatDistance = distance < 30 ? 40 : 50; // Адаптивное расстояние
        const retreatPos = myPos.clone().add(awayDir.scale(retreatDistance));

        // ИСПРАВЛЕНО: Используем pathfinding для умного отступления
        const now = Date.now();
        const needsPathUpdate = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, retreatPos) > 10 ||
            (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.5);

        if (needsPathUpdate) {
            this.updatePathToTarget(retreatPos);
        }

        const nextPathPoint = this.getNextPathPoint();
        const moveTarget = nextPathPoint || retreatPos;

        this.driveToward(moveTarget, 1.0);

        // Still aim at enemy while retreating (fighting retreat)
        this.aimAtTarget();

        // NIGHTMARE AI: Непрерывный огонь даже при отступлении!
        if (now - this.lastShotTime >= this.cooldown) {
            this.fire();
            this.lastShotTime = now;
        }
    }

    private doEvade(): void {
        // УЛУЧШЕНО: Приоритет уклонения от снарядов
        if (this.isDodgingProjectile && this.dodgeDirection.length() > 0.1) {
            // Уклоняемся от снаряда
            const dodgeTarget = this.chassis.absolutePosition.add(this.dodgeDirection.scale(10));
            this.driveToward(dodgeTarget, 1.0);
            this.aimAtTarget(); // Все ещё целимся в цель
            return;
        }

        if (!this.target) {
            this.state = "patrol";
            return;
        }

        // Улучшенное уклонение - более динамичное
        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;

        // УЛУЧШЕНО: Более умное уклонение с учётом препятствий
        if (this._tick % 25 === 0) { // УВЕЛИЧЕНА частота с 30 до 25 кадров
            const toTarget = targetPos.subtract(myPos);
            toTarget.y = 0;
            toTarget.normalize();

            // Перпендикулярное направление
            const perpendicular = new Vector3(toTarget.z, 0, -toTarget.x);

            // УЛУЧШЕНО: Выбираем направление уклонения в зависимости от препятствий
            const obstacleDir = this.checkObstacles();
            if (obstacleDir !== 0) {
                // Если есть препятствие, уклоняемся в противоположную сторону
                this.evadeDirection = perpendicular.scale(-obstacleDir);
            } else {
                // Иначе выбираем случайно, но консистентно
                this.evadeDirection = perpendicular.scale(Math.random() > 0.5 ? 1 : -1);
            }
        }

        // УЛУЧШЕНО: Более быстрое и дальнее уклонение
        const evadePos = myPos.clone().add(this.evadeDirection.scale(20)); // УВЕЛИЧЕНО с 15 до 20

        // ИСПРАВЛЕНО: Используем pathfinding для умного уклонения
        const now = Date.now();
        const needsPathUpdate = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, evadePos) > 8 ||
            (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL * 0.3);

        if (needsPathUpdate) {
            this.updatePathToTarget(evadePos);
        }

        const nextPathPoint = this.getNextPathPoint();
        const moveTarget = nextPathPoint || evadePos;

        this.driveToward(moveTarget, 1.0);

        // Все ещё целимся в цель (боевое уклонение)
        this.aimAtTarget();

        // NIGHTMARE AI: Непрерывный огонь даже при уклонении!
        if (now - this.lastShotTime >= this.cooldown) {
            this.fire();
            this.lastShotTime = now;
        }

        this.stateTimer -= 33;
        if (this.stateTimer <= 0) {
            // NIGHTMARE: Всегда возвращаемся к атаке - боты агрессивны!
            this.state = "attack";
        }
    }

    // УЛУЧШЕНО: Засада - ожидание цели в укрытии
    private doAmbush(): void {
        if (!this.target) {
            this.state = "patrol";
            return;
        }

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);

        // Если позиция засады не установлена, ищем её
        if (!this.ambushPosition) {
            this.ambushPosition = this.findAmbushPosition();
            if (!this.ambushPosition) {
                // Не нашли позицию засады - переходим к обычной атаке
                this.state = "attack";
                return;
            }
        }

        // Движемся к позиции засады
        const distToAmbush = Vector3.Distance(myPos, this.ambushPosition);
        if (distToAmbush > 5) {
            // ИСПРАВЛЕНО: Используем pathfinding для умного движения к позиции засады
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, this.ambushPosition) > 10 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL);

            if (needsPathUpdate) {
                this.updatePathToTarget(this.ambushPosition);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || this.ambushPosition;

            this.driveToward(moveTarget, 1.0); // NIGHTMARE: Быстрее к позиции
        } else {
            // На позиции засады - ждём цель
            this.throttleTarget = 0;
            this.steerTarget = 0;
            this.aimAtTarget();

            // NIGHTMARE AI: Непрерывный огонь из засады!
            const now = Date.now();
            if (distance < this.attackRange && now - this.lastShotTime >= this.cooldown) {
                this.fire();
                this.lastShotTime = now;
            }

            // NIGHTMARE: Короткий таймер засады
            this.ambushTimer += 33;
            if (this.ambushTimer > this.AMBUSH_DURATION || distance < 30) { // УВЕЛИЧЕН радиус атаки
                this.ambushPosition = null;
                this.ambushTimer = 0;
                this.state = "attack";
            }
        }
    }

    // УЛУЧШЕНО: Заманивание - отступление с целью заманить цель в ловушку
    private doBait(): void {
        if (!this.target) {
            this.state = "patrol";
            return;
        }

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);

        // Если позиция заманивания не установлена, выбираем её
        if (!this.baitPosition) {
            // Отступаем в направлении, где есть союзники или укрытие
            const awayDir = myPos.subtract(targetPos);
            awayDir.y = 0;
            awayDir.normalize();

            // Ищем позицию с союзниками или укрытием
            const searchDistance = 40;
            this.baitPosition = myPos.clone().add(awayDir.scale(searchDistance));

            // Проверяем, есть ли союзники в этом направлении
            for (const ally of this.nearbyEnemies) {
                if (ally !== this && ally.isAlive) {
                    const allyPos = ally.chassis.absolutePosition;
                    const toAlly = allyPos.subtract(myPos);
                    if (Vector3.Dot(awayDir, toAlly.normalize()) > 0.5) {
                        // Союзник в направлении отступления - используем его позицию
                        this.baitPosition = allyPos.clone().add(awayDir.scale(10));
                        break;
                    }
                }
            }
        }

        // Движемся к позиции заманивания
        const distToBait = Vector3.Distance(myPos, this.baitPosition);
        if (distToBait > 8) {
            // ИСПРАВЛЕНО: Используем pathfinding для умного движения к позиции приманки
            const now = Date.now();
            const needsPathUpdate = !this.currentPathTarget ||
                Vector3.Distance(this.currentPathTarget, this.baitPosition) > 10 ||
                (now - this.lastPathUpdate > this.PATH_UPDATE_INTERVAL);

            if (needsPathUpdate) {
                this.updatePathToTarget(this.baitPosition);
            }

            const nextPathPoint = this.getNextPathPoint();
            const moveTarget = nextPathPoint || this.baitPosition;

            this.driveToward(moveTarget, 1.0); // NIGHTMARE: Быстрее
        } else {
            // На позиции - останавливаемся и стреляем
            this.throttleTarget = 0;
            this.aimAtTarget();

            // NIGHTMARE AI: Непрерывный огонь!
            const now = Date.now();
            if (distance < this.attackRange && now - this.lastShotTime >= this.cooldown) {
                this.fire();
                this.lastShotTime = now;
            }
        }

        // Проверяем таймер заманивания
        this.baitTimer += 33;
        if (this.baitTimer > this.BAIT_DURATION || distance > 80) {
            // Заманивание закончилось или цель слишком далеко - переходим к атаке
            this.baitPosition = null;
            this.baitTimer = 0;
            this.state = distance < this.attackRange ? "attack" : "chase";
        }
    }

    // УЛУЧШЕНО: Поиск позиции для засады
    private findAmbushPosition(): Vector3 | null {
        if (!this.target || !this.target.chassis) return null;

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        const distance = toTarget.length();

        if (distance < 30) return null; // Слишком близко для засады

        // Ищем позицию с укрытием между нами и целью
        const searchRadius = Math.min(50, distance * 0.6);
        const searchAngles = [Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2];

        let bestAmbush: { pos: Vector3, score: number } | null = null;

        for (const angle of searchAngles) {
            const perpDir = new Vector3(
                Math.cos(angle) * toTarget.x - Math.sin(angle) * toTarget.z,
                0,
                Math.sin(angle) * toTarget.x + Math.cos(angle) * toTarget.z
            ).normalize();

            const checkPos = myPos.clone().add(perpDir.scale(searchRadius));

            // Проверяем, есть ли укрытие между позицией и целью
            const ray = new Ray(checkPos, targetPos.subtract(checkPos).normalize(), distance);
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" ||
                    meta.type === "bullet")) return false;
                if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                if (this.isPartOf(mesh)) return false;
                // Ищем здания и крупные препятствия
                return mesh.isPickable && (mesh.name.includes("building") ||
                    mesh.name.includes("house") || mesh.name.includes("container") ||
                    mesh.name.includes("wall") || mesh.name.includes("barrier"));
            });

            if (pick && pick.hit && pick.distance < distance * 0.7) {
                // Нашли укрытие - оцениваем позицию
                const distToTarget = Vector3.Distance(checkPos, targetPos);
                const distFromMe = Vector3.Distance(checkPos, myPos);
                const coverScore = pick.distance / distance; // Чем ближе укрытие к цели, тем лучше
                const distanceScore = distToTarget > 25 && distToTarget < 60 ? 1.0 : 0.5;
                const score = coverScore * distanceScore / (distFromMe + 1);

                if (!bestAmbush || score > bestAmbush.score) {
                    bestAmbush = { pos: checkPos, score };
                }
            }
        }

        return bestAmbush ? bestAmbush.pos : null;
    }

    // УЛУЧШЕНО: Проверка возможности стрельбы по цели (нет препятствий между нами и целью)
    private canShootAtTarget(): boolean {
        if (!this.target || !this.target.chassis) return false;

        const turretPos = this.turret.getAbsolutePosition();
        const targetPos = this.target.chassis.absolutePosition.clone();
        targetPos.y += 1.0; // Немного выше центра цели

        const direction = targetPos.subtract(turretPos);
        const distance = direction.length();
        direction.normalize();

        // Проверяем препятствия между нами и целью
        const ray = new Ray(turretPos, direction, distance);
        const pick = this.scene.pickWithRay(ray, (mesh: any) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const meta = mesh.metadata;
            // Игнорируем пули, консумаблы и самого врага
            if (meta && (meta.type === "bullet" || meta.type === "enemyBullet" ||
                meta.type === "consumable" || meta.type === "enemyTank")) return false;
            // Игнорируем билборды и HP бары
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;

            // КРИТИЧНО: Используем надежную проверку isPartOf
            if (this.isPartOf(mesh)) return false;

            // Игнорируем части цели (с проверкой на null)
            if (this.target && this.target.chassis) {
                // Check if mesh is part of target hierarchy
                if (mesh === this.target.chassis || mesh.isDescendantOf(this.target.chassis)) return false;
            }
            return true;
        });

        // Если попали в препятствие (не в цель) - не можем стрелять
        if (pick && pick.hit && pick.pickedMesh) {
            const hitMesh = pick.pickedMesh;
            // Проверяем, что это не цель
            if (this.target && this.target.chassis && this.target.turret && this.target.barrel) {
                if (hitMesh !== this.target.chassis && hitMesh !== this.target.turret &&
                    hitMesh !== this.target.barrel && hitMesh.parent !== this.target.chassis &&
                    hitMesh.parent !== this.target.turret) {
                    return false; // Препятствие между нами и целью
                }
            } else {
                return false; // Нет цели - не можем стрелять
            }
        }

        return true; // Можем стрелять
    }

    // === MOVEMENT ===

    private driveToward(targetPos: Vector3, speedMult: number): void {
        const pos = this.chassis.absolutePosition;
        let direction = targetPos.subtract(pos);
        direction.y = 0;

        if (direction.length() < 1.0) { // Increased tolerance to prevent spinning
            // УЛУЧШЕНО: Плавная остановка вместо резкой установки в 0
            const maxChange = 0.10;
            const throttleChange = Math.max(-maxChange, Math.min(maxChange, 0 - this.throttleTarget));
            const steerChange = Math.max(-maxChange, Math.min(maxChange, 0 - this.steerTarget));
            this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + throttleChange));
            this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + steerChange));
            // Prevent micro-adjustments causing spin
            if (Math.abs(this.throttleTarget) < 0.05) this.throttleTarget = 0;
            if (Math.abs(this.steerTarget) < 0.05) this.steerTarget = 0;
            return;
        }

        direction.normalize();

        // ИСПРАВЛЕНО: Улучшенное обнаружение и обход препятствий
        // Проверяем препятствия впереди (не ждём столкновения)
        const lookAheadDistance = 12.0; // УЛУЧШЕНО: Увеличено с 8 до 12м для более раннего обнаружения
        const lookAheadPos = pos.add(direction.scale(lookAheadDistance));
        const lookAheadRay = new Ray(pos.add(Vector3.Up().scale(0.5)), direction, lookAheadDistance);
        const obstacleCheck = this.scene.pickWithRay(lookAheadRay, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || meta.type === "bullet")) return false;
            if (this.isPartOf(mesh)) return false;
            return mesh.isPickable && mesh.visibility > 0.5;
        });

        // ИСПРАВЛЕНО: Более агрессивный обход препятствий
        if (obstacleCheck && obstacleCheck.hit && obstacleCheck.distance < lookAheadDistance * 0.8) {
            // Препятствие близко - обходим его
            const avoidDir = this.checkObstacles();
            if (avoidDir !== 0) {
                const right = new Vector3(direction.z, 0, -direction.x);
                // УЛУЧШЕНО: Более сильное отклонение для лучшего обхода
                direction = direction.add(right.scale(avoidDir * 1.2)).normalize();
                speedMult *= 0.7; // Меньше замедляемся (было 0.6)
            } else {
                // Если checkObstacles не нашёл направление - пробуем оба
                const right = new Vector3(direction.z, 0, -direction.x);
                const left = new Vector3(-direction.z, 0, direction.x);

                // Проверяем правое направление
                const rightRay = new Ray(pos.add(Vector3.Up().scale(0.5)), right, 10);
                const rightCheck = this.scene.pickWithRay(rightRay, (mesh) => {
                    if (!mesh || !mesh.isEnabled()) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || meta.type === "bullet")) return false;
                    if (this.isPartOf(mesh)) return false;
                    return mesh.isPickable && mesh.visibility > 0.5;
                });

                // Проверяем левое направление
                const leftRay = new Ray(pos.add(Vector3.Up().scale(0.5)), left, 10);
                const leftCheck = this.scene.pickWithRay(leftRay, (mesh) => {
                    if (!mesh || !mesh.isEnabled()) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || meta.type === "bullet")) return false;
                    if (this.isPartOf(mesh)) return false;
                    return mesh.isPickable && mesh.visibility > 0.5;
                });

                // Выбираем направление без препятствий
                if (!rightCheck?.hit && leftCheck?.hit) {
                    direction = direction.add(right.scale(1.0)).normalize();
                } else if (rightCheck?.hit && !leftCheck?.hit) {
                    direction = direction.add(left.scale(1.0)).normalize();
                } else {
                    // Оба заблокированы - идём назад немного
                    direction = direction.scale(-0.5);
                }
                speedMult *= 0.6;
            }
        } else {
            // Обычное избегание препятствий
            const avoidDir = this.checkObstacles();
            if (avoidDir !== 0) {
                const right = new Vector3(direction.z, 0, -direction.x);
                direction = direction.add(right.scale(avoidDir * 0.8)).normalize();
                speedMult *= 0.8; // УЛУЧШЕНО: Меньше замедляемся (было 0.7)
            }
        }

        // Get current facing
        const chassisQuat = this.chassis.rotationQuaternion;
        const currentAngle = chassisQuat ? chassisQuat.toEulerAngles().y : this.chassis.rotation.y;

        // Target angle
        const targetAngle = Math.atan2(direction.x, direction.z);

        // Angle difference
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Steer toward target (с плавным ограничением для предотвращения дёргания)
        const rawSteer = angleDiff * 2;
        const oldSteerTarget = this.steerTarget;
        const targetSteer = Math.max(-1, Math.min(1, rawSteer));

        // УЛУЧШЕНО: Максимальная плавность изменения steer
        const desiredSteerChange = targetSteer - this.steerTarget;
        // NIGHTMARE AI: Молниеносные повороты!
        const maxSteerChangePerFrame = 0.35; // NIGHTMARE: В 3.5 раза быстрее поворот!
        const clampedSteerChange = Math.max(-maxSteerChangePerFrame, Math.min(maxSteerChangePerFrame, desiredSteerChange));
        this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + clampedSteerChange));


        // Move forward if mostly facing target (с плавным переходом)
        let newThrottle: number;
        if (Math.abs(angleDiff) < Math.PI / 2.5) {
            newThrottle = speedMult;
        } else if (Math.abs(angleDiff) < Math.PI / 1.5) {
            newThrottle = speedMult * 0.3;
        } else {
            newThrottle = 0; // Turn in place
        }
        // УЛУЧШЕНО: Максимальная плавность изменения throttle
        const desiredThrottleChange = newThrottle - this.throttleTarget;
        const maxThrottleChangePerFrame = 0.08; // УМЕНЬШЕНО с 0.12 до 0.08 для максимальной плавности
        const clampedThrottleChange = Math.max(-maxThrottleChangePerFrame, Math.min(maxThrottleChangePerFrame, desiredThrottleChange));
        this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + clampedThrottleChange));

        // CRITICAL: Check if we are stuck and need to un-stick (overrides normal movement)
        this.checkAndFixStuck();
    }

    // === AIMING ===

    /**
     * УЛУЧШЕНО: Обновление истории позиций цели
     */
    private updateTargetPositionHistory(pos: Vector3, time: number): void {
        // Добавляем новую позицию
        this.targetPositionHistory.push({ pos: pos.clone(), time });

        // ОПТИМИЗАЦИЯ: Удаляем старые записи (старше 2 секунд)
        // Используем обычный цикл вместо filter для лучшей производительности
        const maxAge = 2000;
        const now = time;
        const validHistory: Array<{ pos: Vector3, time: number }> = [];
        for (let i = 0; i < this.targetPositionHistory.length; i++) {
            const entry = this.targetPositionHistory[i];
            if (!entry) continue;
            if (now - entry.time <= maxAge) {
                validHistory.push(entry);
            }
        }
        this.targetPositionHistory = validHistory;

        // Ограничиваем размер истории
        if (this.targetPositionHistory.length > this.MAX_POSITION_HISTORY) {
            this.targetPositionHistory.shift(); // Удаляем самую старую
        }

        // КРИТИЧНО: Расчёт скорости цели (targetVelocity) на основе истории
        // Если этого не сделать, aimsAtTarget будет всегда использовать (0,0,0) и не сможет брать упреждение!
        if (this.targetPositionHistory.length >= 2) {
            const last = this.targetPositionHistory[this.targetPositionHistory.length - 1];
            const prev = this.targetPositionHistory[this.targetPositionHistory.length - 2];

            if (last && prev) {
                const dt = (last.time - prev.time) / 1000; // секунд
                if (dt > 0.001) {
                    // Мгновенная скорость
                    const currentVel = last.pos.subtract(prev.pos).scale(1 / dt);

                    // Сглаживание скорости (lerp) для уменьшения дёргания
                    // Используем alpha ~0.3 для сглаживания шума
                    // Проверяем инициализацию targetVelocity
                    if (!this.targetVelocity) this.targetVelocity = Vector3.Zero();
                    this.targetVelocity = Vector3.Lerp(this.targetVelocity, currentVel, 0.3);
                }
            }
        }
    }

    // === DUPLICATE CHECKANDFIXSTUCK REMOVED ===

    /**
     * УЛУЧШЕНО: Анализ паттерна движения цели
     */
    private analyzeMovementPattern(): void {
        if (this.targetPositionHistory.length < 5) {
            this.movementPattern = "linear";
            this.movementPatternConfidence = 0.0;
            return;
        }

        const history = this.targetPositionHistory;
        const n = history.length;

        // Вычисляем среднюю скорость и направление
        let totalDistance = 0;
        let totalDirectionChange = 0;
        let totalSpeedVariation = 0;
        const speeds: number[] = [];
        const directions: Vector3[] = [];

        for (let i = 1; i < n; i++) {
            const prev = history[i - 1]!.pos;
            const curr = history[i]!.pos;
            const dist = Vector3.Distance(prev, curr);
            totalDistance += dist;
            speeds.push(dist);

            if (dist > 0.1) {
                const dir = curr.subtract(prev).normalize();
                directions.push(dir);

                if (directions.length >= 2) {
                    const prevDir = directions[directions.length - 2]!;
                    const angleChange = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(prevDir, dir))));
                    totalDirectionChange += angleChange;
                }
            }
        }

        // Вычисляем вариацию скорости
        if (speeds.length > 1) {
            const avgSpeed = totalDistance / speeds.length;
            for (const speed of speeds) {
                totalSpeedVariation += Math.abs(speed - avgSpeed);
            }
            totalSpeedVariation /= speeds.length;
        }

        const avgSpeed = totalDistance / (n - 1);
        const avgDirectionChange = totalDirectionChange / (n - 2);
        const speedVariation = totalSpeedVariation / (avgSpeed || 1);

        // Определяем паттерн
        if (avgDirectionChange < 0.1 && speedVariation < 0.3) {
            // Прямолинейное движение
            this.movementPattern = "linear";
            this.movementPatternConfidence = Math.min(1.0, 1.0 - avgDirectionChange * 10);
        } else if (avgDirectionChange > 0.5 && avgDirectionChange < 1.5) {
            // Зигзаг
            this.movementPattern = "zigzag";
            this.movementPatternConfidence = Math.min(1.0, avgDirectionChange / 1.5);
        } else if (avgDirectionChange > 0.2 && avgDirectionChange < 0.5 && n > 8) {
            // Круговое движение
            this.movementPattern = "circular";
            this.movementPatternConfidence = Math.min(1.0, (n - 5) / 10);
        } else {
            // Нерегулярное движение
            this.movementPattern = "erratic";
            this.movementPatternConfidence = Math.min(1.0, speedVariation);
        }
    }

    /**
     * NIGHTMARE: Продвинутое предсказание позиции с максимальной точностью
     */
    private predictTargetPositionAdvanced(currentPos: Vector3, flightTime: number): Vector3 {
        if (!this.target || !this.target.chassis) {
            return currentPos;
        }

        const history = this.targetPositionHistory;
        if (history.length < 5) {
            // Недостаточно данных - используем стандартное предсказание
            return this.predictTargetPosition(flightTime);
        }

        // NIGHTMARE: Используем больше данных для максимальной точности
        const recentCount = Math.min(10, history.length); // NIGHTMARE: Используем до 10 последних позиций!
        const recent = history.slice(-recentCount);

        // NIGHTMARE: Более точное вычисление скорости и ускорения с весами
        let weightedVelocity = Vector3.Zero();
        let weightedAcceleration = Vector3.Zero();
        let totalWeight = 0;

        for (let i = 1; i < recent.length; i++) {
            const prev = recent[i - 1]!.pos;
            const curr = recent[i]!.pos;
            const timeDelta = (recent[i]!.time - recent[i - 1]!.time) / 1000;

            if (timeDelta > 0) {
                // NIGHTMARE: Более свежие данные имеют больший вес
                const weight = (i / recent.length) * 2.0; // Последние данные весят в 2 раза больше
                const velocity = curr.subtract(prev).scale(1 / timeDelta);
                weightedVelocity = weightedVelocity.add(velocity.scale(weight));
                totalWeight += weight;

                if (i > 1) {
                    const prevVel = recent[i - 1]!.pos.subtract(recent[i - 2]!.pos).scale(1 / ((recent[i - 1]!.time - recent[i - 2]!.time) / 1000));
                    if (timeDelta > 0) {
                        const acceleration = velocity.subtract(prevVel).scale(1 / timeDelta);
                        weightedAcceleration = weightedAcceleration.add(acceleration.scale(weight));
                    }
                }
            }
        }

        if (totalWeight > 0) {
            weightedVelocity = weightedVelocity.scale(1 / totalWeight);
            weightedAcceleration = weightedAcceleration.scale(1 / totalWeight);
        }

        // NIGHTMARE: Улучшенная коррекция паттернов движения
        let patternCorrection = Vector3.Zero();
        if (this.movementPatternConfidence > 0.2) { // NIGHTMARE: Используем паттерны даже при низкой уверенности
            switch (this.movementPattern) {
                case "zigzag":
                    if (recent.length >= 3) {
                        const lastDir = recent[recent.length - 1]!.pos.subtract(recent[recent.length - 2]!.pos).normalize();
                        const perpendicular = new Vector3(-lastDir.z, 0, lastDir.x);
                        const zigzagFreq = 2.5; // NIGHTMARE: Более точная частота
                        patternCorrection = perpendicular.scale(Math.sin(flightTime * zigzagFreq) * 3.0 * this.movementPatternConfidence);
                    }
                    break;
                case "circular":
                    if (recent.length >= 4) {
                        const center = this.estimateCircularCenter(recent);
                        if (center) {
                            const radius = Vector3.Distance(currentPos, center);
                            const angularVel = weightedVelocity.length() / (radius || 1);
                            const angle = angularVel * flightTime;
                            const toCenter = center.subtract(currentPos);
                            const tangent = new Vector3(-toCenter.z, 0, toCenter.x).normalize();
                            patternCorrection = tangent.scale(radius * Math.sin(angle) * this.movementPatternConfidence * 1.2);
                        }
                    }
                    break;
                case "erratic":
                    // NIGHTMARE: Для нерегулярного движения используем среднее направление
                    if (recent.length >= 3) {
                        const avgDir = Vector3.Zero();
                        for (let i = 1; i < recent.length; i++) {
                            const dir = recent[i]!.pos.subtract(recent[i - 1]!.pos).normalize();
                            avgDir.addInPlace(dir);
                        }
                        avgDir.normalize();
                        patternCorrection = avgDir.scale(weightedVelocity.length() * flightTime * 0.3 * this.movementPatternConfidence);
                    }
                    break;
            }
        }

        // NIGHTMARE: Предсказание с учётом ускорения, паттерна и высшего порядка
        const predictedPos = currentPos
            .add(weightedVelocity.scale(flightTime))
            .add(weightedAcceleration.scale(flightTime * flightTime * 0.5))
            .add(patternCorrection);

        // NIGHTMARE: Дополнительная коррекция для рельефа
        return this.correctPredictionForTerrain(predictedPos, currentPos);
    }

    /**
     * УЛУЧШЕНО: Предсказание позиции с учётом истории и паттернов
     */
    private predictTargetPosition(flightTime: number): Vector3 {
        if (!this.target || !this.target.chassis) {
            return Vector3.Zero();
        }

        const targetPos = this.target.chassis.absolutePosition.clone();
        const history = this.targetPositionHistory;

        if (history.length < 3) {
            // Недостаточно данных - используем простое предсказание
            return targetPos.add(this.targetVelocity.scale(flightTime));
        }

        // Используем последние 3-5 позиций для более точного предсказания
        const recentCount = Math.min(5, history.length);
        const recent = history.slice(-recentCount);

        // Вычисляем среднюю скорость и ускорение из истории
        let avgVelocity = Vector3.Zero();
        let avgAcceleration = Vector3.Zero();

        for (let i = 1; i < recent.length; i++) {
            const prev = recent[i - 1]!.pos;
            const curr = recent[i]!.pos;
            const timeDelta = (recent[i]!.time - recent[i - 1]!.time) / 1000; // в секундах

            if (timeDelta > 0) {
                const velocity = curr.subtract(prev).scale(1 / timeDelta);
                avgVelocity = avgVelocity.add(velocity);

                if (i > 1) {
                    const prevVel = recent[i - 1]!.pos.subtract(recent[i - 2]!.pos).scale(1 / ((recent[i - 1]!.time - recent[i - 2]!.time) / 1000));
                    if (timeDelta > 0) {
                        const acceleration = velocity.subtract(prevVel).scale(1 / timeDelta);
                        avgAcceleration = avgAcceleration.add(acceleration);
                    }
                }
            }
        }

        if (recent.length > 1) {
            avgVelocity = avgVelocity.scale(1 / (recent.length - 1));
            if (recent.length > 2) {
                avgAcceleration = avgAcceleration.scale(1 / (recent.length - 2));
            }
        }

        // Применяем паттерн движения для коррекции
        let patternCorrection = Vector3.Zero();
        if (this.movementPatternConfidence > 0.3) {
            switch (this.movementPattern) {
                case "zigzag":
                    // Для зигзага предсказываем изменение направления
                    if (recent.length >= 2) {
                        const lastDir = recent[recent.length - 1]!.pos.subtract(recent[recent.length - 2]!.pos).normalize();
                        const perpendicular = new Vector3(-lastDir.z, 0, lastDir.x);
                        const zigzagFreq = 2.0; // Частота зигзага
                        patternCorrection = perpendicular.scale(Math.sin(flightTime * zigzagFreq) * 2.0 * this.movementPatternConfidence);
                    }
                    break;
                case "circular":
                    // Для кругового движения предсказываем поворот
                    if (recent.length >= 3) {
                        const center = this.estimateCircularCenter(recent);
                        if (center) {
                            const radius = Vector3.Distance(targetPos, center);
                            const angularVel = avgVelocity.length() / (radius || 1);
                            const angle = angularVel * flightTime;
                            const toCenter = center.subtract(targetPos);
                            const tangent = new Vector3(-toCenter.z, 0, toCenter.x).normalize();
                            patternCorrection = tangent.scale(radius * Math.sin(angle) * this.movementPatternConfidence);
                        }
                    }
                    break;
            }
        }

        // Предсказание с учётом ускорения и паттерна
        const predictedPos = targetPos
            .add(avgVelocity.scale(flightTime))
            .add(avgAcceleration.scale(flightTime * flightTime * 0.5))
            .add(patternCorrection);

        // УЛУЧШЕНО: Проверка рельефа - корректируем если предсказанная позиция в препятствии
        const correctedPos = this.correctPredictionForTerrain(predictedPos, targetPos);

        return correctedPos;
    }

    /**
     * УЛУЧШЕНО: Оценка центра кругового движения
     */
    private estimateCircularCenter(positions: Array<{ pos: Vector3, time: number }>): Vector3 | null {
        if (positions.length < 3) return null;

        // Простая оценка: находим среднюю точку и радиус
        let center = Vector3.Zero();
        for (const entry of positions) {
            center = center.add(entry.pos);
        }
        center = center.scale(1 / positions.length);

        // Проверяем что точки действительно образуют круг
        const distances = positions.map(p => Vector3.Distance(p.pos, center));
        const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
        const variance = distances.reduce((sum, d) => sum + Math.pow(d - avgDist, 2), 0) / distances.length;

        // Если вариация слишком большая - не круг
        if (variance > avgDist * 0.3) return null;

        return center;
    }

    /**
     * УЛУЧШЕНО: Коррекция предсказания с учётом рельефа и препятствий
     */
    private correctPredictionForTerrain(predictedPos: Vector3, currentPos: Vector3): Vector3 {
        // Проверяем высоту террейна в предсказанной позиции
        const game = (window as any).gameInstance;
        if (game && typeof game.getGroundHeight === 'function') {
            const groundHeight = game.getGroundHeight(predictedPos.x, predictedPos.z);
            const currentGroundHeight = game.getGroundHeight(currentPos.x, currentPos.z);

            // Если предсказанная позиция слишком далеко от текущей высоты - корректируем
            if (Math.abs(predictedPos.y - groundHeight) > 5) {
                predictedPos.y = groundHeight + 1.0; // Стандартная высота танка над землёй
            }
        }

        // Проверяем препятствия на пути к предсказанной позиции
        const direction = predictedPos.subtract(currentPos);
        const distance = direction.length();
        if (distance > 0.1) {
            const dir = direction.normalize();
            const ray = new Ray(currentPos.add(dir.scale(2)), dir, distance);
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || meta.type === "bullet")) return false;
                if (this.isPartOf(mesh) || (this.target && this.target.chassis && (mesh === this.target.chassis || mesh.isDescendantOf(this.target.chassis)))) return false;
                return mesh.isPickable && mesh.visibility > 0.5;
            });

            // Если на пути препятствие - корректируем предсказание
            if (pick && pick.hit && pick.pickedPoint) {
                const obstacleDist = Vector3.Distance(currentPos, pick.pickedPoint);
                if (obstacleDist < distance * 0.8) {
                    // Препятствие близко - предсказываем остановку перед ним
                    predictedPos = currentPos.add(dir.scale(obstacleDist * 0.9));
                }
            }
        }

        return predictedPos;
    }

    private aimAtTarget(): void {
        if (!this.target || !this.target.chassis) return;

        const targetPos = this.target.chassis.absolutePosition.clone();
        const myPos = this.chassis.absolutePosition;

        // === ИСПРАВЛЕНО: Правильный расчёт скорости снаряда ===
        // Импульс = 3 * (projectileSpeed / 200), масса = 0.001
        // Реальная скорость = импульс / масса = 3 * projectileSpeed / 200 / 0.001 = 15 * projectileSpeed
        const distance = Vector3.Distance(targetPos, myPos);
        const realBulletSpeed = 15 * (this.projectileSpeed || 200); // ~3000 м/с для стандартной пушки
        const flightTime = distance / realBulletSpeed;

        // ИСПРАВЛЕНО: Простое линейное предсказание (снаряды очень быстрые!)
        // При скорости 3000 м/с на 100м снаряд летит 0.033 секунды - почти мгновенно
        let predictedPos: Vector3;

        // Для близких целей (<50м) - целимся прямо в центр
        if (distance < 50) {
            predictedPos = targetPos.clone();
            // Небольшая коррекция по высоте - целимся в центр танка
            predictedPos.y += 0.5;
        } else {
            // Для дальних целей - минимальное предсказание
            const targetSpeed = this.targetVelocity.length();

            // Предсказание только если цель быстро движется
            if (targetSpeed > 5) {
                // Простое линейное предсказание
                predictedPos = targetPos.add(this.targetVelocity.scale(flightTime));
            } else {
                // Цель медленная или стоит - целимся прямо
                predictedPos = targetPos.clone();
            }
            predictedPos.y += 0.5; // Коррекция высоты
        }

        // NIGHTMARE: ИДЕАЛЬНАЯ ТОЧНОСТЬ - НУЛЕВОЙ разброс!
        const adaptiveAccuracy = this.getAdaptiveAccuracy(distance);
        const targetSpeed = this.targetVelocity.length();

        // NIGHTMARE: Используем улучшенное предсказание с учётом истории движения
        if (this.difficulty === "nightmare" && this.targetPositionHistory.length > 5) {
            // NIGHTMARE: Используем продвинутое предсказание на основе истории
            predictedPos = this.predictTargetPositionAdvanced(targetPos, flightTime);
        }

        if (adaptiveAccuracy < 1.0 && this.difficulty !== "hard" && this.difficulty !== "nightmare") {
            // Разброс только для medium и easy режимов (hard и nightmare - идеальная точность!)
            const spreadMultiplier = this.difficulty === "medium" ? 0.025 : 0.035;
            const baseSpread = (1 - adaptiveAccuracy) * distance * spreadMultiplier;

            const movementSpread = targetSpeed > 10 ? baseSpread * 1.2 : baseSpread;

            predictedPos.x += (Math.random() - 0.5) * movementSpread;
            predictedPos.z += (Math.random() - 0.5) * movementSpread;

            // Вертикальная коррекция только для лёгкого режима
            if (targetSpeed > 5 && this.difficulty === "easy") {
                predictedPos.y += (Math.random() - 0.5) * movementSpread * 0.20;
            }
        }
        // HARD и NIGHTMARE режимы: НЕТ разброса - идеальное прицеливание!

        // Calculate angle to predicted position
        const dx = predictedPos.x - myPos.x;
        const dz = predictedPos.z - myPos.z;

        // Get chassis world rotation
        const chassisQuat = this.chassis.rotationQuaternion;
        const chassisAngle = chassisQuat ? chassisQuat.toEulerAngles().y : 0;

        // Calculate relative angle for turret (horizontal)
        const worldAngle = Math.atan2(dx, dz);
        this.turretTargetAngle = worldAngle - chassisAngle;

        // Normalize
        while (this.turretTargetAngle > Math.PI) this.turretTargetAngle -= Math.PI * 2;
        while (this.turretTargetAngle < -Math.PI) this.turretTargetAngle += Math.PI * 2;

        // === ВЕРТИКАЛЬНОЕ НАВЕДЕНИЕ СТВОЛА ===
        // Рассчитываем вертикальный угол до цели
        const dy = predictedPos.y - myPos.y;
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz);
        this.barrelTargetPitch = Math.atan2(dy, horizontalDistance);
    }

    private isAimedAtTarget(): boolean {
        if (!this.target) return false;

        // Проверка горизонтального наведения башни
        let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        // Допуск для стрельбы по сложности:
        // Более агрессивные значения - боты стреляют раньше, не крутятся вечно
        // Nightmare: 0.15 радиан (~8.5 градусов)
        // Hard: 0.18 радиан (~10 градусов)
        // Medium: 0.20 радиан (~11.5 градусов)
        // Easy: 0.25 радиан (~14 градусов)
        const tolerance = this.difficulty === "nightmare" ? 0.15 : (this.difficulty === "hard" ? 0.18 : (this.difficulty === "medium" ? 0.20 : 0.25));
        return Math.abs(angleDiff) < tolerance;
    }

    // === FIRE (from barrel, in barrel direction!) ===

    private fire(): void {
        if (!this.isAlive) return;

        // КРИТИЧНО: Не стреляем если нет прямой видимости к цели!
        // Это предотвращает стрельбу в стены когда игрок за укрытием
        if (!this.canShootAtTarget()) {
            logger.debug(`[EnemyTank ${this.id}] BLOCKED: canShootAtTarget() returned false`);
            return; // Цель не видна - не стреляем
        }

        // КРИТИЧНО: Не стреляем если башня не наведена на цель!
        // Это предотвращает стрельбу в случайных направлениях
        if (!this.isAimedAtTarget()) {
            logger.debug(`[EnemyTank ${this.id}] BLOCKED: isAimedAtTarget() returned false`);
            return; // Ждём пока башня наведётся
        }

        // Проверка дальности оружия
        if (this.target && this.target.chassis) {
            const distance = Vector3.Distance(this.chassis.absolutePosition, this.target.chassis.absolutePosition);
            if (distance > this.attackRange) {
                logger.debug(`[EnemyTank ${this.id}] BLOCKED: distance ${distance.toFixed(1)} > attackRange ${this.attackRange}`);
                return; // Цель слишком далеко для этого оружия
            }
        }

        logger.debug(`[EnemyTank ${this.id}] FIRE!`);

        // === GET MUZZLE POSITION AND DIRECTION FROM BARREL ===
        const barrelDir = this.barrel.getDirection(Vector3.Forward()).normalize();
        const muzzlePos = this.barrel.getAbsolutePosition().add(barrelDir.scale(1.5));

        // === ПРОВЕРКА ПРЕПЯТСТВИЙ ПЕРЕД СТВОЛОМ ===
        // Проверяем, не упирается ли ствол в препятствие (стена, здание и т.д.)
        if (this.checkBarrelObstacle(muzzlePos, barrelDir, 1.5)) {
            logger.debug(`[EnemyTank ${this.id}] Shot blocked by obstacle!`);
            // НЕ начисляем кулдаун - враг может попробовать снова сразу
            // НЕ вызываем this.isReloading = true
            return; // Не создаём снаряд - выстрел заблокирован
        }

        // КРИТИЧНО: Не используем isReloading - cooldown отслеживается через lastShotTime в doAttack()

        // Вражеские танки используют стандартную пушку по умолчанию with 3D positioning
        this.soundManager.playShoot("standard", muzzlePos);

        // Muzzle flash
        this.effectsManager.createMuzzleFlash(muzzlePos, barrelDir);
        this.effectsManager.createDustCloud(this.chassis.position.clone());

        // КРИТИЧНО: Используем размеры из выбранной пушки
        const bulletSize = this.cannonType.projectileSize;
        const bulletDepth = bulletSize * 12.5; // Глубина пропорциональна размеру

        // Create bullet с размерами из пушки
        const ball = MeshBuilder.CreateBox(`enemyBullet_${Date.now()}`, {
            width: bulletSize,
            height: bulletSize,
            depth: bulletDepth
        }, this.scene);
        ball.position.copyFrom(muzzlePos);
        ball.lookAt(ball.position.add(barrelDir));
        ball.material = this.bulletMat;
        ball.metadata = { type: "enemyBullet", owner: this, damage: this.damage };

        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { extents: new Vector3(bulletSize * 0.8, bulletSize * 0.8, bulletDepth * 0.8) }
        }, this.scene);
        shape.filterMembershipMask = 16; // Enemy bullet
        shape.filterCollideMask = 1 | 2 | 32 | 64;  // Player (1), environment (2), protective walls (32), and enemy walls (64)
        // КРИТИЧНО: Отключаем отскок для снарядов противника (одноразовые снаряды)
        shape.material = { friction: 0, restitution: 0.0 };

        const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        // АРКАДНЫЙ СТИЛЬ: Минимальная масса - снаряд НЕ толкает танк при попадании
        body.setMassProperties({ mass: 0.001 });
        body.setLinearDamping(0.01);

        // КРИТИЧНО: Используем скорость снаряда из выбранной пушки
        // Импульс рассчитывается как: импульс = скорость * масса, но так как масса мала, используем прямое масштабирование
        const impulseMultiplier = this.projectileSpeed / 200; // Нормализуем относительно стандартной скорости 200
        body.applyImpulse(barrelDir.scale(3 * impulseMultiplier), ball.position);

        // === RECOIL (like player!) ===
        // Отдача зависит от типа пушки (recoilMultiplier)
        const recoilBaseForce = 400;
        const recoilForce = barrelDir.scale(-recoilBaseForce * this.cannonType.recoilMultiplier);
        this.physicsBody.applyImpulse(recoilForce, this.chassis.absolutePosition);

        // Angular recoil (tank rocks back) - также зависит от типа пушки
        const barrelWorldPos = this.barrel.getAbsolutePosition();
        const chassisPos = this.chassis.absolutePosition;
        const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
        // Используем переиспользуемый вектор для torque отдачи (уже инициализирован)
        const recoilTorqueBase = 2000;
        this._tmpRight.set(-torqueDir.z * recoilTorqueBase * this.cannonType.recoilMultiplier, 0, torqueDir.x * recoilTorqueBase * this.cannonType.recoilMultiplier);
        this.applyTorque(this._tmpRight);

        // === HIT DETECTION ===
        // КРИТИЧНО: Урон берется из выбранной пушки (уже установлен в applyDifficultySettings)
        let damage = this.damage;
        // Дополнительное плавное масштабирование урона от прогресса/длительности сессии
        const scale = Math.min(Math.max(this.difficultyScale, 0.7), 1.8);
        const damageScale = 1 + (scale - 1) * 0.5; // до ~+40% урона при максимальном скейле
        damage = Math.round(damage * damageScale);

        let hasHit = false;
        let ricochetCount = 0;

        // Система рикошета для врагов - ОТКЛЮЧЕНА (снаряды противника одноразовые, без рикошета)
        const ricochetSystem = new RicochetSystem(DEFAULT_RICOCHET_CONFIG);
        const maxRicochets = 0; // Снаряды противника не рикошетят

        const target = this.target;
        // Минимальная скорость снаряда для нанесения урона (м/с)
        // Если снаряд лежит на земле или почти остановился - он не взрывается
        const MIN_DAMAGE_SPEED = 5.0;
        const MIN_DAMAGE_SPEED_SQ = MIN_DAMAGE_SPEED * MIN_DAMAGE_SPEED;

        // Сохраняем предыдущую позицию для raycast-проверки (защита от проскока через стенку)
        let prevBulletPos = ball.absolutePosition.clone();

        const checkHit = () => {
            if (hasHit || ball.isDisposed()) return;

            // КРИТИЧНО: Проверяем скорость снаряда перед нанесением урона
            // Если снаряд лежит на земле (низкая скорость) - он НЕ взрывается и не наносит урон
            const velocity = body.getLinearVelocity();
            const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
            if (speedSq < MIN_DAMAGE_SPEED_SQ) {
                // Снаряд почти остановился - удаляем его без урона
                if (!ball.metadata) ball.metadata = {};
                if (!ball.metadata._lowSpeedStartTime) {
                    ball.metadata._lowSpeedStartTime = Date.now();
                }
                // Если снаряд лежит более 2 секунд - удаляем
                if (Date.now() - ball.metadata._lowSpeedStartTime > 2000) {
                    ball.dispose();
                }
                return;
            } else {
                // Сбрасываем таймер низкой скорости если снаряд снова набрал скорость
                if (ball.metadata) ball.metadata._lowSpeedStartTime = null;
            }

            const bulletPos = ball.absolutePosition;

            // === УЛУЧШЕННАЯ ПРОВЕРКА СТЕН С РЕЙКАСТОМ ===
            // Используем рейкаст от предыдущей позиции к текущей для обнаружения быстрых снарядов
            const moveDistance = Vector3.Distance(prevBulletPos, bulletPos);
            if (moveDistance > 0.1) { // Только если снаряд переместился достаточно
                const moveDirection = bulletPos.subtract(prevBulletPos).normalize();
                const ray = new Ray(prevBulletPos, moveDirection, moveDistance + 0.5);

                // КРИТИЧНО: Ищем ВСЕ стенки на сцене (protectiveWall и enemyWall)
                const walls = this.scene.meshes.filter(mesh =>
                    mesh.metadata &&
                    (mesh.metadata.type === "protectiveWall" || mesh.metadata.type === "enemyWall") &&
                    !mesh.isDisposed()
                );

                for (const wall of walls) {
                    // Raycast проверка - ловит быстрые снаряды, проскакивающие через стенку
                    const pick = this.scene.pickWithRay(ray, (mesh) => mesh === wall);

                    if (pick && pick.hit && pick.pickedPoint) {
                        // Проверяем, что точка попадания внутри стенки
                        if (this.checkPointInWall(pick.pickedPoint, wall as Mesh)) {
                            hasHit = true;
                            const bulletDamage = damage;

                            const wallMeta = wall.metadata as any;
                            if (wallMeta) {
                                if (wallMeta.type === "protectiveWall" && wallMeta.tankController && typeof wallMeta.tankController.damageWall === 'function') {
                                    wallMeta.tankController.damageWall(wall, bulletDamage);
                                } else if (wallMeta.type === "enemyWall" && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                                    wallMeta.owner.damageEnemyWall(bulletDamage);
                                }
                            }

                            logger.debug(`[EnemyTank ${this.id}] Bullet hit wall via raycast (${wallMeta?.type || "unknown"})! Damage: ${bulletDamage}`);
                            if (this.effectsManager) this.effectsManager.createHitSpark(pick.pickedPoint);
                            if (this.soundManager) this.soundManager.playHit("armor", pick.pickedPoint);
                            ball.dispose();
                            return;
                        }
                    }
                }
            }

            // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКОЙ (дополнительная проверка текущей позиции) ===
            // КРИТИЧНО: Ищем ВСЕ стенки на сцене (protectiveWall и enemyWall)
            const walls = this.scene.meshes.filter(mesh =>
                mesh.metadata &&
                (mesh.metadata.type === "protectiveWall" || mesh.metadata.type === "enemyWall") &&
                !mesh.isDisposed()
            );
            for (const wall of walls) {
                // Проверяем, находится ли пуля внутри границ стенки
                if (this.checkPointInWall(bulletPos, wall as Mesh)) {
                    hasHit = true;

                    // Урон по стенке совпадает с уроном по танку (учитывает скейл сложности)
                    const bulletDamage = damage;

                    // КРИТИЧНО: Наносим урон стенке в зависимости от типа
                    const wallMeta = wall.metadata as any;
                    if (wallMeta) {
                        if (wallMeta.type === "protectiveWall" && wallMeta.tankController && typeof wallMeta.tankController.damageWall === 'function') {
                            // Урон защитной стенке игрока
                            wallMeta.tankController.damageWall(wall, bulletDamage);
                        } else if (wallMeta.type === "enemyWall" && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                            // Урон стенке другого бота
                            wallMeta.owner.damageEnemyWall(bulletDamage);
                        }
                    }

                    logger.debug(`[EnemyTank ${this.id}] Bullet hit wall (${wallMeta?.type || "unknown"})! Damage: ${bulletDamage}`);
                    if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                    if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                    ball.dispose();
                    return;
                }
            }

            // Check hit on player
            if (target && target.isAlive && target.chassis && !target.chassis.isDisposed()) {
                const tankPos = target.chassis.absolutePosition;
                const dist = Vector3.Distance(bulletPos, tankPos);

                if (dist < 3.5) {
                    hasHit = true;
                    logger.debug(`[EnemyTank ${this.id}] HIT PLAYER! Damage: ${damage}`);

                    // Запоминаем здоровье цели до нанесения урона
                    const healthBefore = (target as any).currentHealth || 0;

                    // Передаём позицию атакующего для индикатора направления урона
                    (target as any).takeDamage(damage, this.chassis.absolutePosition.clone());

                    // Проверяем, убили ли мы игрока этим выстрелом
                    const healthAfter = (target as any).currentHealth || 0;
                    if (healthBefore > 0 && healthAfter <= 0) {
                        this.killsCount++; // Записываем убийство для статистики
                        logger.log(`[EnemyTank ${this.id}] KILLED PLAYER! Total kills: ${this.killsCount}`);
                    }

                    this.effectsManager.createExplosion(bulletPos, 0.8);
                    this.soundManager.playHit("normal", bulletPos);
                    ball.dispose();
                    return;
                }
            }

            // Ground ricochet - ОТКЛЮЧЕН для снарядов противника (одноразовые снаряды)
            // Снаряды противника не рикошетят, при попадании в землю исчезают
            if (bulletPos.y < 0.3) {
                // Снаряд попал в землю - удаляем его без рикошета
                hasHit = true;
                this.effectsManager.createHitSpark(bulletPos);
                ball.dispose();
                return;
            }

            // Bounds check
            if (bulletPos.y < -10 || bulletPos.y > 100 ||
                Math.abs(bulletPos.x) > 550 || Math.abs(bulletPos.z) > 550) {
                ball.dispose();
                return;
            }

            // Обновляем предыдущую позицию для следующей итерации raycast
            prevBulletPos = bulletPos.clone();

            requestAnimationFrame(checkHit);
        };

        checkHit();

        // Auto dispose
        setTimeout(() => {
            if (!ball.isDisposed()) ball.dispose();
        }, 5000);
    }

    // === DAMAGE & DEATH ===

    takeDamage(amount: number): void {
        if (!this.isAlive) return;

        this.currentHealth -= amount;

        // Показываем плавающее число нанесённого урона над врагом
        const game = (window as any).gameInstance;
        if (game?.hud && this.chassis) {
            const damagePos = this.chassis.position.clone();
            damagePos.y += 3; // Над танком
            const isCritical = amount >= 50;
            game.hud.showDamageNumber(damagePos, amount, 'dealt', isCritical);
        }

        // УЛУЧШЕНО: Реакция на получение урона
        this.onDamageReceived(amount);

        // React to damage - evade or use wall!
        if (this.currentHealth > 0) {
            // Реакция на урон - резкий маневр
            if (Math.random() < 0.5) {
                this.steerTarget = Math.random() > 0.5 ? 1.0 : -1.0;
                this.throttleTarget = 0.8;
            }

            // Попытка использовать стенку при получении урона
            if (this.shouldUseWall()) {
                this.activateWall();
            } else if (Math.random() < 0.4) {
                this.state = "evade";
                this.stateTimer = 1000;
                // Random evade direction
                const angle = Math.random() * Math.PI * 2;
                this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
            }
        }

        if (this.currentHealth <= 0) {
            this.die();
        }
    }

    // === TRACER MARKING SYSTEM ===

    // Set this enemy as marked (visible through terrain, highlighted)
    setMarked(marked: boolean, duration: number = 15000): void {
        this.isMarked = marked;

        if (marked) {
            this.markedUntil = Date.now() + duration;

            // Create visual glow effect
            if (!this.markGlow && this.chassis && !this.chassis.isDisposed()) {
                this.markGlow = MeshBuilder.CreateBox("markGlow", {
                    width: this.chassis.scaling.x * 3.5,
                    height: this.chassis.scaling.y * 4,
                    depth: this.chassis.scaling.z * 5
                }, this.scene);
                this.markGlow.parent = this.chassis;
                this.markGlow.position = new Vector3(0, 0.5, 0);

                const glowMat = new StandardMaterial("markGlowMat", this.scene);
                glowMat.diffuseColor = new Color3(1, 0.3, 0); // Orange
                glowMat.emissiveColor = new Color3(1, 0.4, 0); // Bright orange glow
                glowMat.alpha = 0.3;
                glowMat.disableLighting = true;
                this.markGlow.material = glowMat;
                this.markGlow.visibility = 0.4;
            }
        } else {
            // Remove glow
            if (this.markGlow) {
                this.markGlow.dispose();
                this.markGlow = null;
            }
        }
    }

    // Check if enemy is currently marked
    getIsMarked(): boolean {
        // Auto-unmark if time expired
        if (this.isMarked && Date.now() > this.markedUntil) {
            this.setMarked(false);
        }
        return this.isMarked;
    }

    // Update mark status (call from update loop)
    private updateMarkStatus(): void {
        if (this.isMarked && Date.now() > this.markedUntil) {
            this.setMarked(false);
        }

        // Animate glow
        if (this.markGlow && !this.markGlow.isDisposed()) {
            const pulse = 0.3 + Math.sin(Date.now() / 200) * 0.15;
            this.markGlow.visibility = pulse;
        }
    }

    // === PROTECTIVE WALL MODULE ===

    private canUseWall(): boolean {
        const now = Date.now();

        // Кулдаун не прошёл
        if (now - this.lastWallTime < this.WALL_COOLDOWN) return false;

        // Уже есть активная стенка
        if (this.wallMesh && !this.wallMesh.isDisposed()) return false;

        // Нет цели или цель далеко
        if (!this.target || !this.target.chassis) return false;
        const dist = Vector3.Distance(this.chassis.position, this.target.chassis.position);
        if (dist > 60 || dist < 10) return false;

        return true;
    }

    private shouldUseWall(): boolean {
        if (!this.canUseWall()) return false;

        const healthPercent = this.currentHealth / this.maxHealth;

        // СУПЕР: Приоритет 1: Низкое здоровье при бое - ВСЕГДА используем!
        if (healthPercent < 0.45 && this.state === "attack") return true; // СУПЕР: Увеличено с 0.35 до 0.45

        // СУПЕР: Приоритет 2: Отступление/уклонение - высокий шанс!
        if ((this.state === "retreat" || this.state === "evade") && healthPercent < 0.6) { // СУПЕР: Увеличено с 0.5 до 0.6
            return Math.random() < 0.80; // СУПЕР: Увеличено с 0.6 до 0.8!
        }

        // СУПЕР: Приоритет 3: Перезарядка под огнём - высокий шанс!
        if (this.isReloading && healthPercent < 0.7) { // СУПЕР: Увеличено с 0.6 до 0.7
            return Math.random() < 0.50; // СУПЕР: Увеличено с 0.3 до 0.5!
        }

        // СУПЕР: Приоритет 4: Тактическое использование - защита союзников!
        if (this.getNearbyAllyCount() > 0 && healthPercent > 0.5 && this.state === "attack") {
            return Math.random() < 0.25; // 25% шанс защитить союзников
        }

        return false;
    }

    private activateWall(): void {
        if (!this.chassis || !this.barrel) return;

        this.lastWallTime = Date.now();

        // Обновляем матрицы для получения актуального направления пушки
        this.chassis.computeWorldMatrix(true);
        this.turret.computeWorldMatrix(true);
        this.barrel.computeWorldMatrix(true);

        // Получаем позицию и направление пушки
        const barrelPos = this.barrel.getAbsolutePosition();
        const barrelForward = this.barrel.getDirection(Vector3.Forward()).normalize();

        // Получаем позицию дула ствола (как при выстреле)
        const muzzlePos = barrelPos.add(barrelForward.scale(1.5));

        // Создаём стенку перед дулом ствола на расстоянии 2 метра
        const wallPos = muzzlePos.add(barrelForward.scale(2));

        // КРИТИЧНО: Определяем высоту поверхности через raycast вниз
        // Стенка должна появляться на ЛЮБОЙ поверхности на ЛЮБОЙ высоте (даже в воздухе)
        let groundY = wallPos.y; // По умолчанию используем Y координату позиции стенки (для появления в воздухе)
        const rayStart = wallPos.clone();
        // КРИТИЧНО: Начинаем достаточно высоко, но не слишком высоко, чтобы найти поверхности на любой высоте
        // Используем максимум из: позиция ствола + 50, позиция стенки + 100, или фиксированная высота 200
        rayStart.y = Math.max(Math.max(barrelPos.y + 50, wallPos.y + 100), 200);
        const rayDirection = new Vector3(0, -1, 0); // Направление вниз
        // КРИТИЧНО: Увеличена длина raycast до 500 метров для очень высоких поверхностей
        // Но также убеждаемся, что мы можем найти поверхности ниже (до -10 для защитной плоскости)
        const rayLength = Math.max(500, rayStart.y - (-10) + 50); // Достаточно для поиска от 200 до -10
        const ray = new Ray(rayStart, rayDirection, rayLength);

        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;

            // Исключаем танки, пули, стенки и другие динамические объекты
            const meta = mesh.metadata;
            if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable" || meta.type === "protectiveWall" || meta.type === "enemyWall" || meta.type === "platform")) return false;

            // Исключаем UI элементы
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;

            // КРИТИЧНО: Проверяем имя меша для поиска поверхностей
            const meshName = mesh.name.toLowerCase();
            const isSurface = meshName.startsWith("ground_") ||
                meshName.includes("terrain") ||
                meshName.includes("chunk") ||
                meshName.includes("floor") ||
                meshName.includes("platform") ||
                meshName.includes("wall") ||
                meshName.includes("road") ||
                meshName.includes("asphalt") ||
                meshName.includes("concrete") ||
                meshName.includes("dirt") ||
                meshName.includes("sand") ||
                meshName.includes("grass");

            // Если это поверхность, принимаем её даже если isPickable = false
            if (isSurface) {
                return mesh.visibility > 0.5;
            }

            // Для остальных мешей проверяем isPickable
            return mesh.isPickable && mesh.visibility > 0.5;
        });

        // Определяем цвет поверхности и высоту пола
        let surfaceColor = new Color3(0.5, 0.5, 0.5); // Цвет по умолчанию (серый)
        if (pick && pick.hit && pick.pickedPoint) {
            // Нашли поверхность - используем её высоту
            groundY = pick.pickedPoint.y;

            // КРИТИЧНО: Определяем цвет поверхности из материала
            if (pick.pickedMesh && pick.pickedMesh.material) {
                const material = pick.pickedMesh.material;
                if (material instanceof StandardMaterial) {
                    surfaceColor = material.diffuseColor.clone();
                } else {
                    // Если материал не StandardMaterial, пытаемся получить цвет другим способом
                    try {
                        const mat = material as any;
                        if (mat.diffuseColor) {
                            surfaceColor = mat.diffuseColor.clone ? mat.diffuseColor.clone() : new Color3(mat.diffuseColor.r || 0.5, mat.diffuseColor.g || 0.5, mat.diffuseColor.b || 0.5);
                        }
                    } catch (e) {
                        // Используем цвет по умолчанию
                    }
                }
            }
        } else {
            // НЕ нашли поверхность - используем Y координату позиции стенки (для появления в воздухе)
            groundY = wallPos.y;
        }

        // КРИТИЧНО: Финальная позиция стенки (центр на высоте groundY + 2)
        // Стенка высотой 4, так что центр на groundY + 2 означает, что нижняя грань на groundY
        const finalY = groundY + 2;
        const finalWallPos = new Vector3(wallPos.x, finalY, wallPos.z);

        // КРИТИЧНО: Начальная позиция (под поверхностью, чтобы стенка полностью была скрыта)
        // Стенка высотой 4, так что начинаем на 4 единицы ниже поверхности
        // Убеждаемся, что startY не слишком низко (минимум -10 для безопасности)
        const startY = Math.max(groundY - 4, groundY - 10);
        const startWallPos = new Vector3(wallPos.x, startY, wallPos.z);

        // Создаём стенку (те же размеры, что и у игрока)
        this.wallMesh = MeshBuilder.CreateBox(`enemyWall_${this.id}_${Date.now()}`, {
            width: 6,
            height: 4,
            depth: 0.5
        }, this.scene);

        // Начинаем с позиции под полом
        this.wallMesh.position.copyFrom(startWallPos);
        // Поворачиваем стенку в направлении пушки (горизонтальное направление)
        this.wallMesh.rotation.y = Math.atan2(barrelForward.x, barrelForward.z);

        // Материал стенки с цветом поверхности
        const mat = new StandardMaterial(`enemyWallMat_${this.id}_${Date.now()}`, this.scene);
        mat.diffuseColor = surfaceColor;
        mat.emissiveColor = surfaceColor.scale(0.3);
        mat.specularColor = Color3.Black();
        this.wallMesh.material = mat;

        this.wallMesh.metadata = { type: "enemyWall", owner: this };
        // КРИТИЧНО: Устанавливаем isPickable = true для работы raycast проверки снарядов игрока
        this.wallMesh.isPickable = true;
        this.wallHealth = this.WALL_MAX_HEALTH;

        // Анимация появления из пола (1 секунда)
        const animationDuration = 1000; // 1 секунда
        const startTime = Date.now();
        const startPos = startWallPos.clone();
        const endPos = finalWallPos.clone();

        const animateWall = () => {
            if (!this.wallMesh || this.wallMesh.isDisposed()) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            // Используем easing функцию для плавности (ease-out)
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Интерполируем позицию
            this.wallMesh.position.y = startPos.y + (endPos.y - startPos.y) * easeProgress;

            if (progress < 1) {
                // Продолжаем анимацию
                requestAnimationFrame(animateWall);
            } else {
                // Анимация завершена, создаём физику
                this.wallMesh.position.y = endPos.y;

                // Физика стенки (статическая, непроходимая и непростреливаемая - блокирует всё)
                const shape = new PhysicsShape({
                    type: PhysicsShapeType.BOX,
                    parameters: { extents: new Vector3(6, 4, 0.5) }
                }, this.scene);
                shape.filterMembershipMask = 64; // Стенки врагов
                shape.filterCollideMask = 1 | 2 | 4 | 16; // Игрок (1), окружение (2), пули игрока (4), пули врагов (16)

                this.wallPhysics = new PhysicsBody(this.wallMesh, PhysicsMotionType.STATIC, false, this.scene);
                this.wallPhysics.shape = shape;
            }
        };

        // Запускаем анимацию
        animateWall();

        // Таймер удаления
        this.wallTimeout = window.setTimeout(() => this.destroyWall(), this.WALL_DURATION);
    }

    private destroyWall(): void {
        if (this.wallTimeout) {
            clearTimeout(this.wallTimeout);
            this.wallTimeout = 0;
        }

        if (this.wallPhysics) {
            this.wallPhysics.dispose();
            this.wallPhysics = null;
        }

        if (this.wallMesh && !this.wallMesh.isDisposed()) {
            // Эффект разрушения
            if (this.effectsManager) {
                this.effectsManager.createHitSpark(this.wallMesh.absolutePosition);
            }
            // Удаляем материал
            if (this.wallMesh.material) {
                this.wallMesh.material.dispose();
            }
            this.wallMesh.dispose();
            this.wallMesh = null;
        }
    }

    // Публичный метод для нанесения урона стенке врага
    public damageEnemyWall(damage: number): boolean {
        if (!this.wallMesh || this.wallMesh.isDisposed()) return false;

        this.wallHealth = Math.max(0, this.wallHealth - damage);

        logger.debug(`[EnemyTank ${this.id}] Wall damaged: ${damage} HP, remaining: ${this.wallHealth}/${this.WALL_MAX_HEALTH}`);

        // Визуальное обновление - цвет меняется от зелёного к красному
        this.updateEnemyWallVisuals();

        if (this.wallHealth <= 0) {
            this.destroyWall();
            return true; // Стенка разрушена
        }
        return false; // Стенка повреждена
    }

    // Обновление визуального вида стенки в зависимости от HP
    private updateEnemyWallVisuals(): void {
        if (!this.wallMesh || this.wallMesh.isDisposed() || !this.wallMesh.material) return;

        const mat = this.wallMesh.material as StandardMaterial;
        const healthPercent = this.wallHealth / this.WALL_MAX_HEALTH;

        // Цвет меняется от исходного к красному при повреждении
        // При 100% HP - исходный цвет, при 0% - красный
        const damageColor = new Color3(1, 0.2, 0.2); // Красный для повреждённой стенки
        const originalColor = mat.diffuseColor.clone();

        // Интерполируем между исходным цветом и красным
        mat.diffuseColor = Color3.Lerp(damageColor, originalColor, healthPercent);
        mat.emissiveColor = mat.diffuseColor.scale(0.3 + (1 - healthPercent) * 0.3); // Больше свечения при повреждении
    }

    private die(): void {
        // КРИТИЧНО: Сначала помечаем как мёртвого чтобы остановить все обновления
        this.isAlive = false;
        this.currentHealth = 0; // Гарантируем что health = 0

        this.deathsCount++; // Увеличиваем счётчик смертей для статистики

        // УЛУЧШЕНО: Отписываемся от AI Coordinator при смерти
        if (this.aiCoordinator) {
            this.aiCoordinator.unregisterBot(this.id.toString());
        }

        // Останавливаем физику сразу
        if (this.physicsBody) {
            try {
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        const explosionPos = this.chassis.absolutePosition.clone();
        this.effectsManager.createExplosion(explosionPos, 2.5);
        this.soundManager.playExplosion(explosionPos, 2.5);

        // Анимация разрушения - разброс частей танка
        this.createDestructionAnimation();

        // Скрываем health bar сразу
        if (this.healthBar) {
            this.healthBar.isVisible = false;
        }
        if (this.healthBarBackground) {
            this.healthBarBackground.isVisible = false;
        }
        if (this.distanceTextPlane) {
            this.distanceTextPlane.isVisible = false;
        }

        this.onDeathObservable.notifyObservers(this);
    }

    /**
     * Создает анимацию разрушения - разбрасывает части танка по сторонам
     */
    private createDestructionAnimation(): void {
        const explosionCenter = this.chassis.absolutePosition.clone();

        // Список частей для разброса
        const parts: { mesh: Mesh; name: string; mass: number }[] = [];

        // Добавляем основные части
        if (this.chassis && !this.chassis.isDisposed()) {
            parts.push({ mesh: this.chassis, name: "chassis", mass: 2000 });
        }
        if (this.turret && !this.turret.isDisposed()) {
            parts.push({ mesh: this.turret, name: "turret", mass: 500 });
        }
        if (this.barrel && !this.barrel.isDisposed()) {
            parts.push({ mesh: this.barrel, name: "barrel", mass: 200 });
        }

        // Добавляем колеса, если есть
        if (this.wheels && this.wheels.length > 0) {
            for (let i = 0; i < this.wheels.length; i++) {
                const wheel = this.wheels[i];
                if (wheel && !wheel.isDisposed()) {
                    parts.push({ mesh: wheel, name: `wheel_${i}`, mass: 100 });
                }
            }
        }

        // Разбрасываем каждую часть
        for (const part of parts) {
            const mesh = part.mesh;

            // Отделяем от родителя, сохраняя мировую позицию
            const worldPos = mesh.absolutePosition.clone();
            const worldRot = mesh.absoluteRotationQuaternion ? mesh.absoluteRotationQuaternion.clone() : null;
            mesh.setParent(null);
            mesh.position.copyFrom(worldPos);
            if (worldRot) {
                mesh.rotationQuaternion = worldRot;
            }

            // Создаем физическое тело для части
            try {
                // Определяем форму в зависимости от типа части
                let shapeType: PhysicsShapeType;
                let shapeParams: any;

                if (part.name === "barrel") {
                    // Пушка - цилиндр
                    shapeType = PhysicsShapeType.CYLINDER;
                    shapeParams = {
                        radius: 0.15,
                        height: 2.5
                    };
                } else if (part.name.startsWith("wheel")) {
                    // Колесо - цилиндр
                    shapeType = PhysicsShapeType.CYLINDER;
                    shapeParams = {
                        radius: 0.3,
                        height: 0.4
                    };
                } else {
                    // Остальное - бокс
                    shapeType = PhysicsShapeType.BOX;
                    const boundingInfo = mesh.getBoundingInfo();
                    const size = boundingInfo.boundingBox.extendSizeWorld.scale(2);
                    shapeParams = {
                        center: Vector3.Zero(),
                        size: size
                    };
                }

                const shape = new PhysicsShape({
                    type: shapeType,
                    parameters: shapeParams
                }, this.scene);

                const partBody = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, this.scene);
                partBody.shape = shape;
                partBody.setMassProperties({ mass: part.mass });
                partBody.setLinearDamping(0.3);
                partBody.setAngularDamping(0.5);

                // Применяем случайную силу разброса
                const direction = new Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 0.5 + 0.5, // Вверх
                    (Math.random() - 0.5) * 2
                ).normalize();

                const force = direction.scale(8000 + Math.random() * 4000); // Сила разброса
                const torque = new Vector3(
                    (Math.random() - 0.5) * 5000,
                    (Math.random() - 0.5) * 5000,
                    (Math.random() - 0.5) * 5000
                );

                partBody.applyImpulse(force, mesh.absolutePosition);
                // Используем applyAngularImpulse вместо applyTorque (который может отсутствовать)
                const partBodyAny = partBody as any;
                if (partBodyAny.applyTorque) {
                    partBodyAny.applyTorque(torque);
                } else if (partBodyAny.applyAngularImpulse) {
                    partBodyAny.applyAngularImpulse(torque.scale(0.016));
                }

                // Автоматическое удаление через 5 секунд (уменьшено с 10)
                setTimeout(() => {
                    if (mesh && !mesh.isDisposed()) {
                        try {
                            if (partBody && !partBody.isDisposed) {
                                partBody.dispose();
                            }
                        } catch (e) {
                            // Игнорируем ошибки при dispose физики
                        }
                        try {
                            mesh.dispose();
                        } catch (e) {
                            // Игнорируем ошибки при dispose меша
                        }
                    }
                }, 5000); // Уменьшено с 10000 до 5000 для более быстрой очистки

            } catch (error) {
                console.error(`[EnemyTank] Failed to create destruction physics for ${part.name}:`, error);
            }
        }

        // Отключаем основное физическое тело танка
        if (this.physicsBody) {
            this.physicsBody.dispose();
        }
    }

    private reset(): void {
        if (this.patrolPoints.length > 0 && this.patrolPoints[0]) {
            // УЛУЧШЕНО: Правильное позиционирование при спавне
            const spawnPos = this.patrolPoints[0].add(new Vector3(0, 2, 0)); // УМЕНЬШЕНО с 3 до 2 для лучшего контакта с землёй
            this.chassis.position.copyFrom(spawnPos);
            this.chassis.rotationQuaternion = Quaternion.Identity();

            // КРИТИЧНО: Сбрасываем физику перед установкой позиции
            if (this.physicsBody) {
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());
                // Применяем небольшой импульс вниз для стабилизации
                this.physicsBody.applyImpulse(new Vector3(0, -500, 0), spawnPos);
            }

            // Включаем стабилизацию спавна заново
            this._spawnStabilizing = true;
            setTimeout(() => {
                this._spawnStabilizing = false;
            }, 300); // УМЕНЬШЕНО с 500 до 300 для более быстрого старта
        }
    }

    /**
     * Проверяет, находится ли точка внутри стенки
     * Используется для проверки столкновения снарядов со стенками
     */
    private checkPointInWall(pos: Vector3, wallMesh: Mesh): boolean {
        if (!wallMesh || wallMesh.isDisposed()) return false;

        const wallPos = wallMesh.absolutePosition;
        const wallRotation = wallMesh.rotation.y;
        const wallMeta = wallMesh.metadata as any;
        const wallType = wallMeta?.type || "protectiveWall";

        let wallHalfWidth: number, wallHalfHeight: number, wallHalfDepth: number;

        if (wallType === "protectiveWall") {
            // Размеры защитной стенки: width=6, height=4, depth=0.5
            wallHalfWidth = 3;
            wallHalfHeight = 2;
            wallHalfDepth = 0.25;
        } else {
            // Размеры стенки врага: width=6, height=4, depth=0.5 (те же, что и у игрока!)
            wallHalfWidth = 3;
            wallHalfHeight = 2;
            wallHalfDepth = 0.25;
        }

        // Переводим позицию в локальную систему координат стенки
        const localPos = pos.subtract(wallPos);
        const cosY = Math.cos(-wallRotation);
        const sinY = Math.sin(-wallRotation);

        // Поворачиваем позицию в локальную систему координат стенки
        const localX = localPos.x * cosY - localPos.z * sinY;
        const localY = localPos.y;
        const localZ = localPos.x * sinY + localPos.z * cosY;

        // Проверяем, находится ли точка внутри границ стенки
        return Math.abs(localX) < wallHalfWidth &&
            Math.abs(localY) < wallHalfHeight &&
            Math.abs(localZ) < wallHalfDepth;
    }

    dispose(): void {
        this.isAlive = false;

        // УЛУЧШЕНО: Удаляем себя из статического списка
        const index = EnemyTank.allEnemies.indexOf(this);
        if (index > -1) {
            EnemyTank.allEnemies.splice(index, 1);
        }

        // Уничтожаем стенку если есть
        this.destroyWall();

        // Удаляем полоску здоровья
        if (this.healthBar) {
            this.healthBar.dispose();
            this.healthBar = null;
        }
        if (this.healthBarBackground) {
            this.healthBarBackground.dispose();
            this.healthBarBackground = null;
        }
        if (this.distanceTextPlane) {
            this.distanceTextPlane.dispose();
            this.distanceTextPlane = null;
        }
        if (this.distanceTexture) {
            this.distanceTexture.dispose();
            this.distanceTexture = null;
        }

        // УЛУЧШЕНО: Очистка pathfinding
        if (this.pathfinding) {
            this.pathfinding.dispose();
            this.pathfinding = null;
        }

        // КРИТИЧНО: Убеждаемся что barrel не удаляется случайно
        // Barrel является дочерним элементом turret, который является дочерним элементом chassis
        // Поэтому при dispose() chassis все дочерние элементы удаляются автоматически
        // Но добавляем явную проверку для безопасности
        if (this.barrel && !this.barrel.isDisposed() && this.barrel.parent !== this.turret) {
            // Если barrel потерял parent - восстанавливаем связь
            if (this.turret && !this.turret.isDisposed()) {
                this.barrel.parent = this.turret;
            }
        }

        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.dispose();
        }
        this.onDeathObservable.clear();
    }

    // УЛУЧШЕНО: Установка roadNetwork для pathfinding
    setRoadNetwork(roadNetwork: RoadNetwork): void {
        if (this.pathfinding) {
            this.pathfinding.setRoadNetwork(roadNetwork);
        }
    }

    // УЛУЧШЕНО: Обновление позиции референса для pathfinding
    updatePathfindingReference(position: Vector3): void {
        if (this.pathfinding) {
            this.pathfinding.setReferencePosition(position);
        }
    }

    /**
     * ИСПРАВЛЕНО: Построение пути через pathfinding к цели
     */
    private updatePathToTarget(target: Vector3, forceUpdate: boolean = false): boolean {
        if (!this.pathfinding || !this.chassis) return false;

        const now = Date.now();
        const myPos = this.chassis.absolutePosition;

        // Проверяем, нужно ли обновлять путь
        const targetChanged = !this.currentPathTarget ||
            Vector3.Distance(this.currentPathTarget, target) > 10;
        const timeSinceUpdate = now - this.lastPathUpdate;
        const needsUpdate = forceUpdate || targetChanged ||
            (timeSinceUpdate > this.PATH_UPDATE_INTERVAL && this.currentPath.length === 0) ||
            (this.currentPathIndex >= this.currentPath.length);

        if (!needsUpdate && this.currentPath.length > 0) {
            return true; // Путь актуален
        }

        // Проверяем прямую видимость - если есть, не нужен сложный путь
        if (this.pathfinding.hasDirectPath(myPos, target)) {
            this.currentPath = [myPos.clone(), target.clone()];
            this.currentPathIndex = 0;
            this.currentPathTarget = target.clone();
            this.lastPathUpdate = now;
            return true;
        }

        // Строим путь через A*
        const pathResult = this.pathfinding.findPath(myPos, target);

        if (pathResult.found && pathResult.path.length > 0) {
            this.currentPath = pathResult.path;
            this.currentPathIndex = 0;
            this.currentPathTarget = target.clone();
            this.lastPathUpdate = now;
            return true;
        }

        // Путь не найден - используем прямую цель как fallback
        this.currentPath = [target.clone()];
        this.currentPathIndex = 0;
        this.currentPathTarget = target.clone();
        this.lastPathUpdate = now;
        return false;
    }

    /**
     * ИСПРАВЛЕНО: Очистка текущего пути (при смене состояния)
     */
    private clearPath(): void {
        this.currentPath = [];
        this.currentPathIndex = 0;
        this.currentPathTarget = null;
    }

    /**
     * ИСПРАВЛЕНО: Получение следующей точки пути для движения (УЛУЧШЕННАЯ ВЕРСИЯ)
     */
    private getNextPathPoint(): Vector3 | null {
        if (!this.chassis || !this.pathfinding) return null;

        const myPos = this.chassis.absolutePosition;

        // Если путь пуст или закончился - возвращаем null
        if (this.currentPath.length === 0 || this.currentPathIndex >= this.currentPath.length) {
            return null;
        }

        // УЛУЧШЕНО: Находим ближайшую точку пути, которая ещё впереди
        let bestIndex = this.currentPathIndex;
        let bestDistance = Infinity;

        // ИСПРАВЛЕНО: Ищем самую дальнюю точку с прямой видимостью (для обхода препятствий)
        const maxLookAhead = Math.min(this.currentPathIndex + 5, this.currentPath.length); // Увеличено с 3 до 5

        for (let i = this.currentPathIndex; i < maxLookAhead; i++) {
            const point = this.currentPath[i];
            if (!point) continue;

            // Проверяем прямую видимость до точки
            const hasDirectPath = this.pathfinding.hasDirectPath(myPos, point);
            if (hasDirectPath) {
                // Если есть прямая видимость - можем идти к этой точке
                const distance = Vector3.Distance(myPos, point);
                if (i > bestIndex || (i === bestIndex && distance < bestDistance)) {
                    bestDistance = distance;
                    bestIndex = i;
                }
            } else if (i === this.currentPathIndex) {
                // Если текущая точка заблокирована - всё равно используем её (pathfinding найдёт обход)
                const distance = Vector3.Distance(myPos, point);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = i;
                }
            }
        }

        this.currentPathIndex = bestIndex;

        // УЛУЧШЕНО: Если достигли текущей точки (или очень близко) - переходим к следующей
        const reachDistance = 8; // Увеличено с 6 до 8 для более плавного движения
        if (bestDistance < reachDistance && bestIndex < this.currentPath.length - 1) {
            this.currentPathIndex = bestIndex + 1;
        }

        // Возвращаем следующую точку
        const nextPoint = this.currentPath[this.currentPathIndex];
        return nextPoint ? nextPoint.clone() : null;
    }

    // УЛУЧШЕНО: Обновление информации о близких союзниках с дополнительной информацией
    private updateNearbyEnemies(): void {
        // ОПТИМИЗАЦИЯ: Пропускаем для очень далёких ботов (>150m)
        // Координация группы не нужна если игрок далеко
        if (this.distanceToTargetSq > this.MID_DISTANCE_SQ) {
            this.nearbyEnemies = [];
            return;
        }

        this.nearbyEnemies = [];
        const myPos = this.chassis.absolutePosition;

        for (const enemy of EnemyTank.allEnemies) {
            if (enemy === this || !enemy.isAlive || enemy.chassis.isDisposed()) continue;

            const enemyPos = enemy.chassis.absolutePosition;
            const distance = Vector3.Distance(myPos, enemyPos);

            if (distance < this.GROUP_COORDINATION_RANGE) {
                this.nearbyEnemies.push(enemy);
            }
        }

        // УЛУЧШЕНО: Сортируем союзников по приоритету (ближе и здоровее = выше приоритет)
        this.nearbyEnemies.sort((a, b) => {
            const distA = Vector3.Distance(myPos, a.chassis.absolutePosition);
            const distB = Vector3.Distance(myPos, b.chassis.absolutePosition);
            const healthA = a.currentHealth / a.maxHealth;
            const healthB = b.currentHealth / b.maxHealth;
            // Приоритет: здоровье важнее расстояния
            return (healthB * 2 - distB / 50) - (healthA * 2 - distA / 50);
        });
    }

    // УЛУЧШЕНО: Получить количество близких союзников
    // УЛУЧШЕНО: Получение количества союзников с дополнительной информацией
    private getNearbyAllyCount(): number {
        return this.nearbyEnemies.length;
    }

    // УЛУЧШЕНО: Получение количества союзников, атакующих ту же цель
    private getAttackingAllyCount(): number {
        if (!this.target) return 0;
        let count = 0;
        for (const ally of this.nearbyEnemies) {
            if (ally.target === this.target && (ally.state === "attack" || ally.state === "flank")) {
                count++;
            }
        }
        return count;
    }

    // УЛУЧШЕНО: Проверка, есть ли союзники, которые уже атакуют цель
    private hasAlliesAttackingTarget(): boolean {
        return this.getAttackingAllyCount() > 0;
    }

    // УЛУЧШЕНО: Проверка, нужно ли синхронизировать атаку с союзниками
    private shouldSyncAttack(): boolean {
        if (!this.target) return false;
        const attackingCount = this.getAttackingAllyCount();
        // Синхронизируем атаку если есть 1-2 союзника, атакующих ту же цель
        return attackingCount > 0 && attackingCount <= 2;
    }

    // УЛУЧШЕНО: Поиск укрытия (здания, препятствия) - использует AIPathfinding
    /**
     * УЛУЧШЕНО: Поиск укрытия с определением типа и приоритетом
     */
    /**
     * УЛУЧШЕНО: Проверка и использование способностей корпусов
     */
    private checkAndUseChassisAbilities(healthPercent: number, distance: number): void {
        if (!this.chassisType.specialAbility) return;

        const now = Date.now();
        const ability = this.chassisType.specialAbility;
        const lastUse = this.lastAbilityUseTime.get(ability) || 0;
        const cooldown = this.ABILITY_COOLDOWNS.get(ability) || 0;

        // Проверяем кулдаун
        if (now - lastUse < cooldown) return;

        switch (ability) {
            case "shield":
                // NIGHTMARE AI: Щит - используем АГРЕССИВНО при любой атаке!
                if ((distance < this.optimalRange && !this.shieldActive) || // NIGHTMARE: При атаке в зоне!
                    (this.state === "attack" && !this.shieldActive) || // NIGHTMARE: Всегда при атаке!
                    (healthPercent < 0.8 && !this.shieldActive) || // NIGHTMARE: HP<80%!
                    (this.consecutiveHits >= 1)) { // NIGHTMARE: При любом попадании!
                    this.activateShield();
                    this.lastAbilityUseTime.set(ability, now);
                }
                break;

            case "drone":
                // NIGHTMARE AI: Дроны - выпускаем СРАЗУ при обнаружении цели!
                if (distance < this.detectRange * 2.0 && !this.droneActive) { // NIGHTMARE: Огромный радиус!
                    this.activateDrones();
                    this.lastAbilityUseTime.set(ability, now);
                }
                break;

            case "siege":
                // NIGHTMARE: Регенерация - используем ВСЕГДА когда возможно!
                if (healthPercent < 0.7 && distance > 15) { // NIGHTMARE: HP<70%!
                    // Логика регенерации
                }
                break;

            case "racer":
                // NIGHTMARE: Ускорение - ВСЕГДА используем!
                if (distance < this.detectRange) {
                    // Логика ускорения
                }
                break;

            case "command":
                // NIGHTMARE: Командный бафф - активируем ВСЕГДА с союзниками!
                const allyCount = this.getNearbyAllyCount();
                if (allyCount >= 1 || distance < this.range) { // NIGHTMARE: Любой союзник или атака!
                    this.activateCommand();
                    this.lastAbilityUseTime.set(ability, now);
                }
                break;
        }
    }

    /**
     * УЛУЧШЕНО: Активация щита
     */
    private activateShield(): void {
        if (this.shieldActive) return;

        this.shieldActive = true;
        logger.debug(`[EnemyTank ${this.id}] Shield activated!`);

        // Визуальный эффект щита (упрощённая версия)
        // В полной версии можно добавить меш щита вокруг танка

        // Деактивируем через 8 секунд
        setTimeout(() => {
            this.shieldActive = false;
            logger.debug(`[EnemyTank ${this.id}] Shield deactivated`);
        }, 8000);
    }

    /**
     * УЛУЧШЕНО: Активация дронов
     */
    private activateDrones(): void {
        if (this.droneActive) return;

        this.droneActive = true;
        logger.debug(`[EnemyTank ${this.id}] Drones activated!`);

        // Визуальный эффект дронов (упрощённая версия)
        // В полной версии можно добавить меши дронов

        // Деактивируем через 15 секунд
        setTimeout(() => {
            this.droneActive = false;
            logger.debug(`[EnemyTank ${this.id}] Drones deactivated`);
        }, 15000);
    }

    /**
     * УЛУЧШЕНО: Активация командного баффа
     */
    private activateCommand(): void {
        if (this.commandActive) return;

        this.commandActive = true;
        logger.debug(`[EnemyTank ${this.id}] Command aura activated!`);

        // Бафф союзников в радиусе 20м
        const myPos = this.chassis.absolutePosition;
        const nearbyAllies = EnemyTank.allEnemies.filter(enemy => {
            if (enemy === this || !enemy.isAlive) return false;
            const dist = Vector3.Distance(myPos, enemy.chassis.absolutePosition);
            return dist <= 20;
        });

        // Визуальный эффект ауры (упрощённая версия)

        // Деактивируем через 10 секунд
        setTimeout(() => {
            this.commandActive = false;
            logger.debug(`[EnemyTank ${this.id}] Command aura deactivated`);
        }, 10000);
    }

    private findCoverPosition(): Vector3 | null {
        if (!this.target || !this.target.chassis || !this.pathfinding) return null;

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;

        // Smart Cover Search: Find positions that BLOCK line of sight to target
        const candidates: { pos: Vector3, score: number }[] = [];

        // Check 12 directions at 2 distances
        const directions = 12;
        const distances = [20, 40]; // 20m and 40m

        const game = (window as any).gameInstance;

        for (let i = 0; i < directions; i++) {
            const angle = (i / directions) * Math.PI * 2;
            const px = Math.cos(angle);
            const pz = Math.sin(angle);
            const dir = new Vector3(px, 0, pz);

            for (const dist of distances) {
                const candidatePos = myPos.add(dir.scale(dist));

                // 1. Correct height
                if (game && typeof game.getGroundHeight === 'function') {
                    candidatePos.y = game.getGroundHeight(candidatePos.x, candidatePos.z) + 1.0;
                }

                // 2. Check Line of Sight from Candidate to Target
                const toTarget = targetPos.subtract(candidatePos);
                const distToTarget = toTarget.length();
                toTarget.normalize();

                const ray = new Ray(candidatePos.add(Vector3.Up().scale(1.5)), toTarget, distToTarget);

                const pick = this.scene.pickWithRay(ray, (mesh) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.checkCollisions) return false;
                    if (this.isPartOf(mesh)) return false;
                    if (this.target && this.target.chassis && (mesh === this.target.chassis || mesh.isDescendantOf(this.target.chassis))) return false;

                    if (mesh.visibility < 0.5) return false;
                    if (mesh.name.includes("grass") || mesh.name.includes("Road")) return false;
                    return true;
                });

                if (pick && pick.hit) {
                    // LOS Blocked! This is cover.
                    let score = 100;
                    score -= dist * 1.5; // Prefer closer
                    if (distToTarget < 30) score -= 30; // Not too close to enemy

                    candidates.push({ pos: candidatePos, score });
                }
            }
        }

        if (candidates.length === 0) return null;

        // Sort by score
        candidates.sort((a, b) => b.score - a.score);

        const best = candidates[0];

        // Cache result
        this.coverCache = { position: best.pos.clone(), timestamp: Date.now() };
        this.coverType = "full";

        return best.pos;
    }

    /**
     * УЛУЧШЕНО: Проверка находится ли бот в укрытии
     */
    private checkIfInCover(): boolean {
        if (!this.target || !this.target.chassis || !this.currentCoverPosition) {
            return false;
        }

        const myPos = this.chassis.absolutePosition;
        const coverDist = Vector3.Distance(myPos, this.currentCoverPosition);

        // Считаем что в укрытии если близко к позиции укрытия
        if (coverDist < 5.0) {
            this.isInCover = true;
            return true;
        }

        this.isInCover = false;
        return false;
    }

    /**
     * УЛУЧШЕНО: Тактика peek-and-shoot (выглянуть из укрытия, выстрелить, спрятаться)
     */
    private doPeekAndShoot(): void {
        if (!this.target || !this.target.chassis || !this.currentCoverPosition) {
            return;
        }

        const now = Date.now();
        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const coverPos = this.currentCoverPosition;

        // Проверяем что мы в укрытии
        if (!this.checkIfInCover()) {
            // Движемся к укрытию
            this.driveToward(coverPos, 0.8);
            return;
        }

        // Peek-and-shoot цикл
        const timeSinceLastPeek = now - this.lastPeekTime;

        if (timeSinceLastPeek < this.PEEK_AND_SHOOT_INTERVAL * 0.3) {
            // Фаза "peek" - выглядываем из укрытия
            const peekPos = coverPos.add(targetPos.subtract(coverPos).normalize().scale(2));
            this.driveToward(peekPos, 0.5);
            this.aimAtTarget();
        } else if (timeSinceLastPeek < this.PEEK_AND_SHOOT_INTERVAL * 0.7) {
            // Фаза "shoot" - стреляем
            this.aimAtTarget();
            if (this.isAimedAtTarget()) {
                const shotNow = Date.now();
                if (shotNow - this.lastShotTime >= this.cooldown) {
                    this.fire();
                    this.lastShotTime = shotNow;
                }
            }
        } else {
            // Фаза "hide" - прячемся обратно
            this.driveToward(coverPos, 0.6);
            this.lastPeekTime = now;
        }
    }

    // УЛУЧШЕНО: Анализ стиля игры игрока с улучшенной адаптивностью и обучением
    private updatePlayerStyle(): void {
        const now = Date.now();
        if (now - this.lastStyleUpdateTime < this.STYLE_UPDATE_INTERVAL) return;
        this.lastStyleUpdateTime = now;

        if (!this.target || !this.target.chassis || this.playerStyleSamples.length < 5) return;

        // Анализируем среднее значение стиля (агрессивность)
        const avgStyle = this.playerStyleSamples.reduce((a, b) => a + b, 0) / this.playerStyleSamples.length;

        // Агрессивный: avgStyle > 0.3 (игрок часто наносит большой урон, близко)
        // Оборонительный: avgStyle < -0.3 (игрок часто далеко, маленький урон)
        // Сбалансированный: средние значения

        const previousStyle = this.playerStyle;

        if (avgStyle > 0.3) {
            this.playerStyle = "aggressive";
        } else if (avgStyle < -0.3) {
            this.playerStyle = "defensive";
        } else {
            this.playerStyle = "balanced";
        }

        // NIGHTMARE AI: КОНТР-ТАКТИКИ - полностью адаптируемся к стилю игрока!
        if (this.playerStyle === "aggressive") {
            // NIGHTMARE КОНТР: Против агрессивного - УКЛОНЕНИЕ + КОНТРАТАКА!
            this.optimalRange = 55; // NIGHTMARE: Держим большую дистанцию!
            this.attackRange = 180; // NIGHTMARE: Атакуем очень издалека!
            // NIGHTMARE: Переключаемся на уклонение и фланг
            if (this.state === "attack" && Math.random() < 0.4) {
                this.state = "evade"; // Уклоняемся от агрессивного игрока
                this.stateTimer = 1500;
            }
        } else if (this.playerStyle === "defensive") {
            // NIGHTMARE КОНТР: Против оборонительного - АГРЕССИВНЫЙ ФЛАНГ!
            this.optimalRange = 20; // NIGHTMARE: Максимально близко!
            this.attackRange = 100; // NIGHTMARE: Быстрое сближение!
            // NIGHTMARE: Фланговать укрывающегося игрока!
            if ((this.state === "attack" || this.state === "chase") && Math.random() < 0.5) {
                this.state = "flank"; // Фланкуем оборонцев!
                this.stateTimer = 2500;
                this.flankDirection = Math.random() > 0.5 ? 1 : -1;
            }
        } else {
            // NIGHTMARE: Сбалансированный стиль - непредсказуемое поведение!
            this.optimalRange = 35 + (Math.random() - 0.5) * 20; // Случайный диапазон 25-45
            this.attackRange = 140 + (Math.random() - 0.5) * 40; // Случайный диапазон 120-160
        }

        // УЛУЧШЕНО: Анализ паттернов движения игрока
        if (this.targetPositionHistory.length >= 10) {
            // Анализируем излюбленные позиции
            const favoritePositions = this.analyzeFavoritePositions();

            // Анализируем тактику уклонения игрока
            const dodgePattern = this.analyzePlayerDodgePattern();

            // Адаптируем предсказание на основе паттернов
            if (dodgePattern.direction !== "none") {
                // Игрок часто уклоняется в определённую сторону - корректируем прицеливание
                logger.debug(`[EnemyTank ${this.id}] Player dodges ${dodgePattern.direction}, adjusting aim`);
            }
        }

        // Очищаем старые данные
        this.playerStyleSamples = [];
    }

    /**
     * УЛУЧШЕНО: Анализ излюбленных позиций игрока
     */
    private analyzeFavoritePositions(): Vector3[] {
        if (this.targetPositionHistory.length < 10) return [];

        // Группируем позиции по зонам (квадраты 20x20м)
        const zones = new Map<string, { pos: Vector3, count: number }>();

        for (const entry of this.targetPositionHistory) {
            const zoneX = Math.floor(entry.pos.x / 20);
            const zoneZ = Math.floor(entry.pos.z / 20);
            const zoneKey = `${zoneX}_${zoneZ}`;

            const existing = zones.get(zoneKey);
            if (existing) {
                existing.count++;
                // Обновляем среднюю позицию
                existing.pos = existing.pos.add(entry.pos).scale(0.5);
            } else {
                zones.set(zoneKey, { pos: entry.pos.clone(), count: 1 });
            }
        }

        // Возвращаем топ-3 наиболее частые позиции
        const sortedZones = Array.from(zones.values()).sort((a, b) => b.count - a.count);
        return sortedZones.slice(0, 3).map(z => z.pos);
    }

    /**
     * УЛУЧШЕНО: Анализ паттерна уклонения игрока
     */
    private analyzePlayerDodgePattern(): { direction: "left" | "right" | "back" | "none", confidence: number } {
        if (this.targetPositionHistory.length < 8) {
            return { direction: "none", confidence: 0 };
        }

        // Анализируем изменения направления движения
        let leftCount = 0;
        let rightCount = 0;
        let backCount = 0;

        for (let i = 2; i < this.targetPositionHistory.length; i++) {
            const prev = this.targetPositionHistory[i - 2]!.pos;
            const curr = this.targetPositionHistory[i]!.pos;
            const prevDir = this.targetPositionHistory[i - 1]!.pos.subtract(prev).normalize();
            const currDir = curr.subtract(this.targetPositionHistory[i - 1]!.pos).normalize();

            // Вычисляем изменение направления
            const cross = Vector3.Cross(prevDir, currDir);
            const angleChange = Math.asin(Math.max(-1, Math.min(1, cross.y)));

            if (angleChange > 0.3) {
                rightCount++;
            } else if (angleChange < -0.3) {
                leftCount++;
            }

            // Проверяем отступление (движение назад относительно предыдущего направления)
            const dot = Vector3.Dot(prevDir, currDir);
            if (dot < -0.5) {
                backCount++;
            }
        }

        const total = leftCount + rightCount + backCount;
        if (total < 3) {
            return { direction: "none", confidence: 0 };
        }

        const maxCount = Math.max(leftCount, rightCount, backCount);
        const confidence = maxCount / total;

        if (leftCount === maxCount && confidence > 0.4) {
            return { direction: "left", confidence };
        } else if (rightCount === maxCount && confidence > 0.4) {
            return { direction: "right", confidence };
        } else if (backCount === maxCount && confidence > 0.4) {
            return { direction: "back", confidence };
        }

        return { direction: "none", confidence: 0 };
    }

    // УЛУЧШЕНО: Реакция на получение урона с адаптивным поведением
    onDamageReceived(damage: number): void {
        const now = Date.now();
        this.lastDamageTime = now;
        this.consecutiveHits++;

        // УЛУЧШЕНО: Адаптация к стилю игры игрока на основе урона
        if (damage > 15) {
            // Игрок наносит большой урон - возможно, он агрессивен
            this.playerStyleSamples.push(1.0); // Агрессивный стиль
        } else if (damage < 10) {
            // Маленький урон - возможно, игрок оборонителен
            this.playerStyleSamples.push(-1.0); // Оборонительный стиль
        } else {
            this.playerStyleSamples.push(0.0); // Сбалансированный стиль
        }

        // Ограничиваем размер истории
        if (this.playerStyleSamples.length > 20) {
            this.playerStyleSamples.shift();
        }

        // Если получили много урона подряд - более агрессивная реакция
        if (this.consecutiveHits > 2) {
            this.damageReactionCooldown = 2000; // 2 секунды реакции
            const healthPercent = this.currentHealth / this.maxHealth;
            const evadeChance = healthPercent < 0.4 ? 0.8 : 0.6; // Больше шанс уклонения при низком HP

            // Принудительно переключаемся на уклонение или отступление
            if (this.state === "attack" && healthPercent < 0.4 && Math.random() < evadeChance) {
                this.state = "evade";
                this.stateTimer = healthPercent < 0.3 ? 2000 : 1500; // Дольше уклоняемся при низком HP
                const angle = Math.random() * Math.PI * 2;
                this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
            }
        }

        // Сбрасываем счётчик через 3 секунды
        setTimeout(() => {
            if (Date.now() - this.lastDamageTime > 3000) {
                this.consecutiveHits = 0;
            }
        }, 3000);
    }

    // УЛУЧШЕНО: Поиск возвышенности для лучшей позиции (улучшенная версия)
    private findHighGround(preferredPos: Vector3): Vector3 | null {
        const myPos = this.chassis.absolutePosition;
        const searchRadius = 20;
        const searchPoints = 8;
        let bestHeight = myPos.y;
        let bestPos: Vector3 | null = null;

        for (let i = 0; i < searchPoints; i++) {
            const angle = (i / searchPoints) * Math.PI * 2;
            const checkPos = preferredPos.clone().add(new Vector3(
                Math.cos(angle) * searchRadius,
                0,
                Math.sin(angle) * searchRadius
            ));

            // Проверяем высоту через raycast вниз
            const ray = new Ray(checkPos.add(new Vector3(0, 10, 0)), Vector3.Down(), 20);
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "enemyTank" || meta.type === "playerTank")) return false;
                return mesh.isPickable;
            });

            if (pick && pick.hit) {
                if (pick.pickedPoint) {
                    const groundHeight = pick.pickedPoint.y;
                    if (!isNaN(groundHeight) && groundHeight > bestHeight + 0.5) { // Минимум 0.5м выше
                        bestHeight = groundHeight;
                        bestPos = new Vector3(checkPos.x, groundHeight, checkPos.z);
                    }
                }
            }
        }

        return bestPos;
    }

    // УЛУЧШЕНО: Оценка приоритета цели
    private evaluateTargetPriority(): number {
        if (!this.target || !this.target.chassis) return 0;

        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);
        const healthPercent = this.currentHealth / this.maxHealth;
        const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;

        let priority = 5; // Базовый приоритет

        // Близкая цель = выше приоритет
        if (distance < 30) priority += 2;
        else if (distance < 60) priority += 1;
        else if (distance > 100) priority -= 1;

        // Слабая цель = выше приоритет (легче убить)
        if (targetHealthPercent < 0.3) priority += 3;
        else if (targetHealthPercent < 0.5) priority += 2;
        else if (targetHealthPercent < 0.7) priority += 1;

        // Низкое здоровье = выше приоритет (нужно защищаться)
        if (healthPercent < 0.3) priority += 2;
        else if (healthPercent < 0.5) priority += 1;

        return Math.max(1, Math.min(10, priority));
    }

    // УЛУЧШЕНО: Обновление приоритета цели
    private updateTargetPriority(): void {
        const now = Date.now();
        if (now - this.lastTargetEvaluationTime < this.TARGET_EVAL_INTERVAL) return;
        this.lastTargetEvaluationTime = now;

        this.targetPriority = this.evaluateTargetPriority();
    }
}
