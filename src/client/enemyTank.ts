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
    Observable,
    Ray,
    Matrix
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { logger } from "./utils/logger";
import { AIPathfinding } from "./ai/AIPathfinding";
import type { RoadNetwork } from "./roadNetwork";
import { PHYSICS_CONFIG } from "./config/physicsConfig";

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
    private hpBillboard: Mesh | null = null;
    
    // === Physics (SAME AS PLAYER!) ===
    physicsBody!: PhysicsBody;
    
    // Physics Config (HEAVY & RESPONSIVE - синхронизировано с TankController)
    private mass = PHYSICS_CONFIG.enemyTank.basic.mass; // HEAVY & RESPONSIVE: Масса бота из конфига
    private hoverHeight = PHYSICS_CONFIG.enemyTank.basic.hoverHeight;
    private hoverStiffness = PHYSICS_CONFIG.enemyTank.stability.hoverStiffness; // HEAVY & RESPONSIVE: Жесткость подвески
    private hoverDamping = PHYSICS_CONFIG.enemyTank.stability.hoverDamping; // HEAVY & RESPONSIVE: Демпфирование подвески
    
    // Movement (HEAVY TANK - из конфига)
    private moveSpeed = PHYSICS_CONFIG.enemyTank.basic.moveSpeed; // Из конфига (11 м/с)
    private turnSpeed = PHYSICS_CONFIG.enemyTank.basic.turnSpeed; // Из конфига (2.3 рад/с)
    private acceleration = PHYSICS_CONFIG.enemyTank.basic.acceleration; // Из конфига (58000 Н)
    
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
    
    // === AI State ===
    private target: { chassis: Mesh, isAlive: boolean, currentHealth?: number, turret?: Mesh, barrel?: Mesh } | null = null;
    private state: AIState = "patrol";
    private patrolPoints: Vector3[] = [];
    private currentPatrolIndex = 0;
    private stateTimer = 0;
    
    // POI System integration
    private targetPOI: { position: Vector3, type: string, id: string } | null = null;
    private poiCaptureTime = 0; // Time spent at POI
    
    // AI properties - УЛУЧШЕНО: Увеличен радиус атаки для более агрессивного ИИ
    private attackRange = 140; // УВЕЛИЧЕНО с 120 до 140 для ещё более активного боя
    
    // AI Decisions
    private lastDecisionTime = 0;
    private decisionInterval = 600; // УЛУЧШЕНО: Увеличено с 500 до 600мс для лучшей производительности и более плавной работы AI
    private flankDirection = 1; // 1 = right, -1 = left
    private evadeDirection = new Vector3(0, 0, 0);
    private lastTargetPos = new Vector3(0, 0, 0);
    private targetVelocity = new Vector3(0, 0, 0);
    
    // УЛУЧШЕНО: Групповое поведение
    private nearbyEnemies: EnemyTank[] = []; // Близкие союзники для координации
    private lastGroupCheckTime = 0;
    private readonly GROUP_CHECK_INTERVAL = 1000; // УЛУЧШЕНО: Уменьшено для более быстрой координации между ботами
    private readonly GROUP_COORDINATION_RANGE = 100; // УЛУЧШЕНО: Увеличен радиус координации с 80 до 100 для лучшей координации между ботами
    
    // УЛУЧШЕНО: Система укрытий и тактического позиционирования
    private lastCoverCheckTime = 0;
    private readonly COVER_CHECK_INTERVAL = 2500; // УЛУЧШЕНО: Увеличено с 2000 до 2500мс для лучшей производительности
    private currentCoverPosition: Vector3 | null = null;
    private seekingCover = false;
    
    // УЛУЧШЕНО: AI Pathfinding для умной навигации
    private pathfinding: AIPathfinding | null = null;
    private currentPath: Vector3[] = [];
    private currentPathIndex = 0;
    
    // УЛУЧШЕНО: Адаптация к стилю игры игрока
    private playerStyle: "aggressive" | "defensive" | "balanced" = "balanced";
    private playerStyleSamples: number[] = []; // История расстояний до игрока
    private lastStyleUpdateTime = 0;
    private readonly STYLE_UPDATE_INTERVAL = 4000; // УЛУЧШЕНО: Уменьшено для более быстрой адаптации к стилю игры игрока
    
    // УЛУЧШЕНО: Реакция на урон
    private lastDamageTime = 0;
    private damageReactionCooldown = 0;
    private consecutiveHits = 0;
    
    // УЛУЧШЕНО: Синхронизация групповых атак
    private lastGroupAttackTime = 0;
    private readonly GROUP_ATTACK_SYNC_WINDOW = 500; // Окно синхронизации 500мс
    private groupAttackCooldown = 0;
    
    // УЛУЧШЕНО: Использование рельефа
    private lastTerrainCheckTime = 0;
    private readonly TERRAIN_CHECK_INTERVAL = 4000; // УЛУЧШЕНО: Увеличено с 3000 до 4000мс для лучшей производительности
    private preferredHeightPosition: Vector3 | null = null;
    
    // УЛУЧШЕНО: Продвинутые тактики
    private ambushPosition: Vector3 | null = null;
    private ambushTimer = 0;
    private readonly AMBUSH_DURATION = 8000; // 8 секунд в засаде
    private baitPosition: Vector3 | null = null;
    private baitTimer = 0;
    private readonly BAIT_DURATION = 5000; // 5 секунд заманивания
    private lastHighGroundCheck = 0;
    private readonly HIGH_GROUND_CHECK_INTERVAL = 5000; // Проверка высот каждые 5 секунд
    private highGroundPosition: Vector3 | null = null;
    
    // УЛУЧШЕНО: Эскалация сложности
    private combatTime = 0; // Время в бою
    private killsCount = 0; // Количество убийств (для эскалации)
    private adaptiveIntelligence = 1.0; // Множитель интеллекта (1.0 = базовый, растёт со временем)
    
    // УЛУЧШЕНО: Приоритизация целей
    private targetPriority = 0; // 0 = нет цели, 1-10 = приоритет цели
    private lastTargetEvaluationTime = 0;
    private readonly TARGET_EVAL_INTERVAL = 2500; // УЛУЧШЕНО: Увеличено с 2000 до 2500мс для лучшей производительности
    
    // === Stats ===
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;
    
    // === Tracer Marking ===
    private isMarked = false;
    private markedUntil = 0;
    private markGlow: Mesh | null = null;
    
    // === Combat ===
    private lastShotTime = 0;
    private cooldown = 2200; // УЛУЧШЕНО: Уменьшено с 2.5 до 2.2 секунд для более динамичного боя
    private isReloading = false;
    private range = 60;           // Дальность атаки
    private detectRange = 250;    // УЛУЧШЕНО: Увеличен с 200 до 250м для лучшего обнаружения
    private optimalRange = 35;     // Оптимальная дистанция боя
    private aimAccuracy = 0.98;   // УЛУЧШЕНО: Увеличена с 0.95 до 0.98 для более точной стрельбы
    
    // УЛУЧШЕНО: Адаптивная точность в зависимости от дистанции и сложности
    // HARD режим: почти идеальная точность!
    private getAdaptiveAccuracy(distance: number): number {
        const baseAccuracy = this.aimAccuracy;
        
        // СЛОЖНЫЙ РЕЖИМ: минимальный штраф, почти идеальная точность
        let difficultyMultiplier: number;
        let distancePenaltyMax: number;
        let healthPenaltyMax: number;
        
        if (this.difficulty === "hard") {
            difficultyMultiplier = 1.0;
            distancePenaltyMax = 0.08; // Только 8% штраф на дистанции (было 15%)
            healthPenaltyMax = 0.05; // Только 5% штраф при низком HP (было 10%)
        } else if (this.difficulty === "medium") {
            difficultyMultiplier = 0.92;
            distancePenaltyMax = 0.12;
            healthPenaltyMax = 0.08;
        } else {
            difficultyMultiplier = 0.85;
            distancePenaltyMax = 0.15;
            healthPenaltyMax = 0.10;
        }
        
        const distancePenalty = Math.min(distancePenaltyMax, distance / 300);
        const healthPenalty = (1.0 - this.currentHealth / this.maxHealth) * healthPenaltyMax;
        
        // HARD режим: минимум 0.90 точность (было 0.75)
        const minAccuracy = this.difficulty === "hard" ? 0.90 : (this.difficulty === "medium" ? 0.80 : 0.75);
        return Math.max(minAccuracy, baseAccuracy * difficultyMultiplier - distancePenalty - healthPenalty);
    }
    
    // === Difficulty ===
    private difficulty: "easy" | "medium" | "hard" = "hard"; // По умолчанию сложная сложность
    private difficultyScale: number = 1; // Плавный множитель сложности по прогрессу игрока и длительности сессии
    
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
    
    // Tick counter
    private _tick = 0;
    
    // Raycast caching для оптимизации
    private raycastCache: { result: boolean, frame: number } | null = null;
    private readonly RAYCAST_CACHE_FRAMES = 4; // УЛУЧШЕНО: Уменьшено для более частых проверок видимости ближних целей
    
    // Ground raycast cache для hover системы
    private _groundRaycastCache: { groundHeight: number; frame: number } | null = null;
    
    // КРИТИЧНО: Кэш для проверки проваливания (чтобы не проверять каждый кадр)
    private _fallCheckCache: { lastCheck: number; lastCorrectedY: number } | null = null;
    private readonly FALL_CHECK_INTERVAL = 100; // Проверяем проваливание раз в 100мс (10 раз в секунду)
    private _fallCheckFrame = 0; // Кадр последней проверки проваливания
    
    // Переиспользуемые векторы для оптимизации памяти
    private _tmpPos?: Vector3;
    private _tmpForward?: Vector3;
    
    // КРИТИЧНО: Кэш для getWorldMatrix() - очень дорогая операция
    private _cachedWorldMatrix?: Matrix;
    private _tmpRight?: Vector3;
    private _tmpUp?: Vector3;
    
    // === SPAWN STABILIZATION ===
    private _spawnStabilizing = true;
    private _spawnWarmupTime = 0; // Время с момента окончания стабилизации (для плавного разгона)
    private readonly SPAWN_WARMUP_DURATION = 300; // УСКОРЕНО: 0.3 секунды плавного разгона
    
    // Для отслеживания застревания в воздухе
    private _airStuckTimer = 0;
    private readonly AIR_STUCK_RESET_TIME = 1000; // ИСПРАВЛЕНО: 1 секунда в воздухе = принудительная телепортация (было 2)
    
    // === ANTI-STUCK SYSTEM (УЛУЧШЕНО) ===
    private stuckTimer = 0;
    private lastStuckCheckPos = new Vector3();
    private readonly STUCK_CHECK_INTERVAL = 400; // УСКОРЕНО: 400мс вместо 1000мс
    private readonly STUCK_THRESHOLD = 1.0; // УМЕНЬШЕНО: 1.0 вместо 2.0 для более чувствительного обнаружения
    private consecutiveStuckCount = 0;
    private lastUnstuckTime = 0; // Время последней разблокировки
    
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
    private readonly WALL_COOLDOWN = 18000; // 18 секунд
    private readonly WALL_DURATION = 8000;  // 8 секунд
    private wallTimeout: number = 0;
    
    constructor(
        scene: Scene,
        position: Vector3,
        soundManager: SoundManager,
        effectsManager: EffectsManager,
        difficulty: "easy" | "medium" | "hard" = "hard",
        difficultyScale = 1
    ) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.effectsManager = effectsManager;
        this.difficulty = difficulty;
        this.difficultyScale = difficultyScale;
        this.id = EnemyTank.count++;
        // УЛУЧШЕНО: Регистрируем себя в статическом списке для группового поведения
        EnemyTank.allEnemies.push(this);
        
        // Применяем настройки сложности
        this.applyDifficultySettings();
        
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
        this.barrel = this.createBarrel();
        this.createTracks();
        this.createHpBillboard();
        
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
                    // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
                    const safeY = Math.max(groundHeight + 2.0, 3.0);
                    if (targetY < safeY) {
                        targetY = safeY;
                        logger.warn(`[EnemyTank] Corrected spawn height from ${position.y.toFixed(2)} to ${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)})`);
                    }
                }
                
                if (Math.abs(currentPos.y - targetY) > 0.1) {
                    this.chassis.position.y = targetY;
                }
                
                // КРИТИЧНО: Принудительно устанавливаем правильную ориентацию
                this.chassis.rotationQuaternion = Quaternion.Identity();
                
                // Сбрасываем скорости сразу
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());
                
                // Синхронизируем physics body с mesh
                this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
                
            }
        });
        
        // УЛУЧШЕННАЯ стабилизация: короткая задержка + плавный старт
        setTimeout(() => {
            if (this.physicsBody && this.chassis && !this.chassis.isDisposed()) {
                // Финальный сброс скоростей
                this.physicsBody.setLinearVelocity(Vector3.Zero());
                this.physicsBody.setAngularVelocity(Vector3.Zero());
                
                // КРИТИЧНО: Принудительно устанавливаем правильную ориентацию
                this.chassis.rotationQuaternion = Quaternion.Identity();
                this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
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
                this.generatePatrolPoints(this.chassis.absolutePosition);
            }
            this.currentPatrolIndex = 0;
            
            // КРИТИЧНО: Немедленно устанавливаем направление к первой точке патруля
            if (this.patrolPoints.length > 0) {
                const target = this.patrolPoints[0];
                if (!target) return;
                const myPos = this.chassis.absolutePosition;
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
    
    private applyDifficultySettings() {
        switch (this.difficulty) {
            case "easy":
                // Легкая сложность: медленная реакция, низкая точность
                this.cooldown = 3500; // 3.5 секунды перезарядка (было 4000)
                this.aimAccuracy = 0.70; // 70% точность (было 65%)
                this.detectRange = 150; // Радиус обнаружения
                this.range = 50;
                this.optimalRange = 28;
                this.decisionInterval = 600; // Решения каждые 600мс (улучшено для более быстрой реакции)
                this.moveSpeed = 12; // Быстрее для более бодрого поведения (было 10)
                // Менее толстые и бьют слабее
                this.maxHealth = 80;
                break;
            case "medium":
                // Средняя сложность: средняя реакция, средняя точность
                this.cooldown = 2500; // 2.5 секунды перезарядка (было 3000)
                this.aimAccuracy = 0.85; // 85% точность (было 80%)
                this.detectRange = 180;
                this.range = 60;
                this.optimalRange = 32;
                this.decisionInterval = 350; // Решения каждые 350мс (улучшено для более быстрой реакции)
                this.moveSpeed = 18; // Быстрее для более бодрого поведения (было 14)
                this.maxHealth = 100;
                break;
            case "hard":
                // Сложная сложность: быстрая реакция, высокая точность
                this.cooldown = 2000; // 2 секунды перезарядка (было 2500)
                this.aimAccuracy = 0.95; // 95% точность
                this.detectRange = 220; // Увеличенный радиус обнаружения (было 200)
                this.range = 70;
                this.optimalRange = 38;
                this.decisionInterval = 200; // Решения каждые 200мс (улучшено для максимально быстрой реакции)
                this.moveSpeed = 24; // Максимальная скорость (как у игрока!) (было 18)
                // Толще и живучее на сложной
                this.maxHealth = 130;
                break;
        }
        
        // Плавный множитель сложности на основе прогресса игрока и длительности сессии
        const scale = Math.min(Math.max(this.difficultyScale, 0.7), 1.8);

        // Живучесть (HP) растёт более заметно, но без экстремумов
        const healthScale = 1 + (scale - 1) * 0.8; // до ~+64% HP при максимальном скейле
        this.maxHealth = Math.round(this.maxHealth * healthScale);

        // Агрессия: чем выше скейл, тем быстрее решения и короче перезарядка
        const aggressionScale = 1 + (scale - 1) * 0.7;
        this.cooldown = Math.round(this.cooldown / aggressionScale);
        // Не позволяем ИИ принимать решения слишком редко или слишком часто
        this.decisionInterval = Math.max(200, Math.round(this.decisionInterval / aggressionScale));
        
        // Синхронизируем текущее здоровье с новым максимумом
        this.currentHealth = this.maxHealth;
    }
    
    // === VISUALS (same as player) ===
    
    private createChassis(position: Vector3): Mesh {
        // Random visual variation for enemies (light/medium/heavy look)
        const variant = this.id % 5; // 5 variants
        let width = 2.2, height = 0.8, depth = 3.5;
        
        if (variant === 0) {
            // Light variant - smaller
            width = 1.8; height = 0.7; depth = 3.0;
        } else if (variant === 1) {
            // Heavy variant - larger
            width = 2.6; height = 0.9; depth = 4.0;
        } else if (variant === 2) {
            // Scout variant - very small
            width = 1.6; height = 0.6; depth = 2.8;
        } else if (variant === 3) {
            // Assault variant - medium-large
            width = 2.4; height = 0.85; depth = 3.8;
        }
        // variant 4 = standard (medium)
        
        const chassis = MeshBuilder.CreateBox(`enemyTank_${this.id}`, {
            width, height, depth
        }, this.scene);
        // КРИТИЧНО: Используем позицию как есть (уже с правильной высотой террейна + 2.0)
        // НЕ добавляем 0.5, так как позиция уже правильная
        chassis.position.copyFrom(position);
        // КРИТИЧНО: Устанавливаем правильную ориентацию ПЕРЕД созданием физики
        chassis.rotationQuaternion = Quaternion.Identity();
        
        const mat = new StandardMaterial(`enemyTankMat_${this.id}`, this.scene);
        mat.diffuseColor = new Color3(0.5, 0.15, 0.1); // Dark red/brown
        mat.specularColor = Color3.Black();
        mat.freeze();
        chassis.material = mat;
        chassis.metadata = { type: "enemyTank", instance: this };
        
        // Add visual details for heavy variant
        if (variant === 1) {
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
        turret.position = new Vector3(0, 0.7, 0);
        
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
        // Random barrel variation for visual diversity
        const barrelVariant = this.id % 5;
        let width = 0.2, height = 0.2, depth = 2.5;
        
        if (barrelVariant === 0) {
            // Sniper-like - long and thin
            width = 0.15; height = 0.15; depth = 3.0;
        } else if (barrelVariant === 1) {
            // Heavy-like - thick
            width = 0.25; height = 0.25; depth = 2.5;
        } else if (barrelVariant === 2) {
            // Gatling-like - short and thick
            width = 0.22; height = 0.22; depth = 1.9;
        } else if (barrelVariant === 3) {
            // Rapid-like - short and thin
            width = 0.18; height = 0.18; depth = 1.7;
        }
        // variant 4 = standard
        
        const barrel = MeshBuilder.CreateBox(`enemyBarrel_${this.id}`, {
            width, height, depth
        }, this.scene);
        barrel.parent = this.turret;
        barrel.position = new Vector3(0, 0.2, 1.5);
        
        const mat = new StandardMaterial(`enemyBarrelMat_${this.id}`, this.scene);
        mat.diffuseColor = new Color3(0.25, 0.08, 0.05);
        mat.specularColor = Color3.Black();
        mat.freeze();
        barrel.material = mat;
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
    
    // === HP Billboard ===
    private hpBarFill: Rectangle | null = null;
    
    private createHpBillboard() {
        // Увеличен размер для лучшей видимости
        const plane = MeshBuilder.CreatePlane(`enemyHp_${this.id}`, { size: 2.8 }, this.scene);
        plane.parent = this.turret;
        plane.position = new Vector3(0, 1.6, 0); // Немного выше
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.isVisible = false;
        plane.renderingGroupId = 3; // В группе рендеринга для видимости через стены
        
        const tex = AdvancedDynamicTexture.CreateForMesh(plane, 240, 48); // Увеличен размер текстуры для размещения расстояния
        
        const container = new Rectangle();
        container.width = "220px"; // Увеличена ширина
        container.height = "20px"; // Увеличена высота
        container.background = "#300";
        container.color = "#f00";
        container.thickness = 2;
        container.cornerRadius = 0;
        tex.addControl(container);
        
        const barFill = new Rectangle();
        barFill.width = "216px"; // Соответствует новой ширине
        barFill.height = "16px"; // Соответствует новой высоте
        barFill.background = "#f00";
        barFill.thickness = 0;
        barFill.horizontalAlignment = 0;
        container.addControl(barFill);
        this.hpBarFill = barFill;
        
        // Добавляем текстовое отображение здоровья
        const healthText = new TextBlock("hpText");
        healthText.text = "100/100";
        healthText.color = "#fff";
        healthText.fontSize = 10;
        healthText.fontFamily = "'Press Start 2P', monospace";
        healthText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        healthText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        container.addControl(healthText);
        (this as any).hpText = healthText; // Сохраняем ссылку для обновления
        
        // Добавляем текстовое отображение расстояния (ниже HP bar)
        const distanceText = new TextBlock("distanceText");
        distanceText.text = "0m";
        distanceText.color = "#0ff";
        distanceText.fontSize = 8;
        distanceText.fontFamily = "'Press Start 2P', monospace";
        distanceText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        distanceText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        distanceText.top = "22px"; // Располагаем ниже HP bar
        container.addControl(distanceText);
        (this as any).distanceText = distanceText; // Сохраняем ссылку для обновления
        
        // Увеличиваем высоту контейнера для размещения текста расстояния
        container.height = "40px";
        this.hpBillboard = plane;
    }

    setHpVisible(visible: boolean, playerPosition?: Vector3) {
        if (!this.hpBillboard || !this.hpBarFill) return;
        this.hpBillboard.isVisible = visible;
        if (visible) {
            const healthPercent = Math.max(0, Math.min(100, (this.currentHealth / this.maxHealth) * 100));
            const fillWidth = (healthPercent / 100) * 216; // Обновлено под новую ширину
            this.hpBarFill.width = `${fillWidth}px`;
            
            let healthColor = "#0f0";
            if (healthPercent > 60) {
                healthColor = "#0f0"; // Зелёный
            } else if (healthPercent > 30) {
                healthColor = "#ff0"; // Жёлтый
            } else {
                healthColor = "#f00"; // Красный
            }
            this.hpBarFill.background = healthColor;
            
            // Обновляем текстовое отображение здоровья
            const hpText = (this as any).hpText;
            if (hpText) {
                const currentHp = Math.max(0, Math.round(this.currentHealth));
                const maxHp = Math.round(this.maxHealth);
                hpText.text = `${currentHp}/${maxHp}`;
                hpText.color = healthColor; // Цвет текста соответствует цвету здоровья
            }
            
            // Обновляем отображение расстояния до игрока
            const distanceText = (this as any).distanceText;
            if (distanceText && playerPosition && this.chassis && !this.chassis.isDisposed()) {
                const enemyPos = this.chassis.absolutePosition;
                const distance = Vector3.Distance(enemyPos, playerPosition);
                distanceText.text = `${Math.round(distance)}m`;
            }
        }
    }

    isPartOf(mesh: Mesh): boolean {
        return mesh === this.chassis || mesh === this.turret || mesh === this.barrel || this.wheels.includes(mesh);
    }
    
    // Проверка препятствий перед стволом перед выстрелом
    private checkBarrelObstacle(muzzlePos: Vector3, direction: Vector3, maxDistance: number = 1.5): boolean {
        const ray = new Ray(muzzlePos, direction, maxDistance);
        
        const pick = this.scene.pickWithRay(ray, (mesh: any) => {
            // Ранний выход: проверки в порядке частоты
            if (!mesh || !mesh.isEnabled()) return false;
            if (mesh.visibility <= 0.5) return false; // Прозрачные/невидимые объекты
            if (!mesh.isPickable) return false; // Объекты без коллизий
            
            // Игнорируем части самого танка
            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
            
            // Игнорируем дочерние элементы танка
            if (mesh.parent === this.chassis || mesh.parent === this.turret || mesh.parent === this.barrel) return false;
            
            // Проверка через isPartOf для всех частей танка (включая wheels)
            if (this.isPartOf(mesh)) return false;
            
            // Игнорируем билборды
            if (mesh.name.includes("billboard") || mesh.name.includes("hp") || mesh.name.includes("Hp")) return false;
            
            // Игнорируем пули
            const meta = mesh.metadata;
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
        const chassisWidth = 2.2;
        const chassisHeight = 0.8;
        const chassisDepth = 3.5;
        
        const chassisShape = new PhysicsShapeContainer(this.scene);
        
        // Размеры для скруглённых краёв гусениц
        const cylinderRadius = chassisHeight * 0.45;
        const cylinderOffset = chassisDepth * 0.42;
        const chassisLowering = -chassisHeight * 0.1;
        
        // 1. Центральный BOX (укороченный, без острых углов)
        const centerBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, chassisLowering, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(chassisWidth, chassisHeight * 0.7, chassisDepth * 0.7)
            }
        }, this.scene);
        // HEAVY & RESPONSIVE: Отключено трение Havok, используется только Custom Force
        centerBox.material = { friction: 0, restitution: 0.0 };
        chassisShape.addChildFromParent(this.chassis, centerBox, this.chassis);
        
        // 2. Передний CYLINDER (скруглённый край - позволяет заезжать на препятствия)
        const frontCylinder = new PhysicsShape({
            type: PhysicsShapeType.CYLINDER,
            parameters: {
                pointA: new Vector3(-chassisWidth * 0.5, chassisLowering, cylinderOffset),
                pointB: new Vector3(chassisWidth * 0.5, chassisLowering, cylinderOffset),
                radius: cylinderRadius
            }
        }, this.scene);
        // HEAVY & RESPONSIVE: Отключено трение Havok, используется только Custom Force
        frontCylinder.material = { friction: 0, restitution: 0.0 };
        chassisShape.addChildFromParent(this.chassis, frontCylinder, this.chassis);
        
        // 3. Задний CYLINDER (скруглённый край)
        const backCylinder = new PhysicsShape({
            type: PhysicsShapeType.CYLINDER,
            parameters: {
                pointA: new Vector3(-chassisWidth * 0.5, chassisLowering, -cylinderOffset),
                pointB: new Vector3(chassisWidth * 0.5, chassisLowering, -cylinderOffset),
                radius: cylinderRadius
            }
        }, this.scene);
        // HEAVY & RESPONSIVE: Отключено трение Havok, используется только Custom Force
        backCylinder.material = { friction: 0, restitution: 0.0 };
        chassisShape.addChildFromParent(this.chassis, backCylinder, this.chassis);
        
        // Настройки фильтрации столкновений
        chassisShape.filterMembershipMask = 8;
        chassisShape.filterCollideMask = 2 | 4 | 32;
        
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
        this.physicsBody.setLinearDamping(PHYSICS_CONFIG.enemyTank.stability.linearDamping);
        this.physicsBody.setAngularDamping(PHYSICS_CONFIG.enemyTank.stability.angularDamping);
        
        // КРИТИЧНО: Сбрасываем скорости сразу после создания физического тела
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());
        
        // КРИТИЧНО: Принудительно устанавливаем правильную ориентацию после создания physics body
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.rotationQuaternion = Quaternion.Identity();
            // Синхронизируем physics body с mesh
            this.physicsBody.setTargetTransform(this.chassis.position, this.chassis.rotationQuaternion);
        }
    }
    
    // === MAIN UPDATE ===
    
    update(): void {
        if (!this.isAlive) return;
        if (!this.chassis || this.chassis.isDisposed()) return;
        
        this._tick++;
        
        // Update tracer mark status
        this.updateMarkStatus();
        
        // Боты всегда активны и патрулируют независимо от расстояния
        // ОПТИМИЗАЦИЯ: Используем квадрат расстояния для сравнения, избегаем Math.sqrt
        let distSq = 1000000; // 1000м в квадрате
        if (this.target && this.target.chassis) {
            const dx = this.chassis.position.x - this.target.chassis.position.x;
            const dz = this.chassis.position.z - this.target.chassis.position.z;
            distSq = dx * dx + dz * dz;
        }
        
        // КРИТИЧНО: Обновление AI в зависимости от расстояния
        // ИСПРАВЛЕНО: AI обновляется реже, но движение обновляется каждый кадр через updateMovement()
        // До 500м (250000 в квадрате) - каждые 2 кадра
        // 500-700м (250000-490000) - каждые 3 кадра
        // Дальше - каждые 5 кадров
        let aiUpdateInterval = 1; // УЛУЧШЕНО: Ближние боты обновляются каждый кадр для максимальной реактивности
        if (distSq > 490000) { // 700м в квадрате
            aiUpdateInterval = 5; // Дальние - каждые 5 кадров
        } else if (distSq > 250000) { // 500м в квадрате
            aiUpdateInterval = 2; // УЛУЧШЕНО: Средние - каждые 2 кадра (было 3)
        } else {
            aiUpdateInterval = 1; // УЛУЧШЕНО: До 500м - каждый кадр для быстрой реакции (было 2)
        }
        
        // Обновляем AI логику (принятие решений) реже
        if (this._tick % aiUpdateInterval === 0) {
            this.updateAI();
        }
        
        // ИСПРАВЛЕНО: Обновляем движение и башню каждый кадр для всех ботов
        // Это критично для работающего AI
        this.executeState();
        
        // ИСПРАВЛЕНО: Башня ВСЕГДА обновляется каждый кадр
        this.updateTurret();
        
        // ИСПРАВЛЕНО: Активное наведение на игрока если он в радиусе обнаружения
        // Даже во время патруля башня должна следить за игроком
        if (this.target && this.target.isAlive && this.target.chassis && distSq < this.detectRange * this.detectRange) {
            this.aimAtTarget();
        }
        
        // УЛУЧШЕНО: Обновляем эскалацию сложности и использование высот
        if (this.target && this.target.isAlive) {
            this.combatTime += 16; // ~16ms per frame
            // Увеличиваем интеллект каждые 30 секунд боя
            if (this.combatTime > 30000 && this.adaptiveIntelligence < 1.5) {
                this.adaptiveIntelligence += 0.05;
                this.combatTime = 0;
                logger.debug(`[EnemyTank ${this.id}] Intelligence increased to ${this.adaptiveIntelligence.toFixed(2)}`);
            }
        }
        
        // УЛУЧШЕНО: Периодически проверяем возможность использования высот
        const now = Date.now();
        if (now - this.lastHighGroundCheck > this.HIGH_GROUND_CHECK_INTERVAL && this.target && this.state === "attack") {
            this.lastHighGroundCheck = now;
            const myPos = this.chassis.absolutePosition;
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
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
            return;
        }
        
        // Убеждаемся, что иерархия мешей корректна
        if (this.turret && this.turret.parent !== this.chassis) {
            this.turret.parent = this.chassis;
        }
        if (this.barrel && this.turret && this.barrel.parent !== this.turret) {
            this.barrel.parent = this.turret;
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
                body.setLinearVelocity(Vector3.Zero());
                return;
            }
            if (!isFinite(angVel.x) || !isFinite(angVel.y) || !isFinite(angVel.z)) {
                body.setAngularVelocity(Vector3.Zero());
                return;
            }
            
            // === ОГРАНИЧЕНИЕ СКОРОСТЕЙ (как у игрока) ===
            const maxLinearSpeed = 50;
            const maxAngularSpeed = 8;
            if (vel.length() > maxLinearSpeed) {
                body.setLinearVelocity(vel.normalize().scale(maxLinearSpeed));
            }
            if (angVel.length() > maxAngularSpeed) {
                body.setAngularVelocity(angVel.normalize().scale(maxAngularSpeed));
            }
            
            // Получаем ориентацию танка
            if (!this._cachedWorldMatrix || (this._tick % 2 === 0)) {
                this._cachedWorldMatrix = this.chassis.getWorldMatrix();
            }
            const rotMatrix = this._cachedWorldMatrix;
            
            if (!this._tmpForward) this._tmpForward = new Vector3();
            if (!this._tmpRight) this._tmpRight = new Vector3();
            if (!this._tmpUp) this._tmpUp = new Vector3();
            
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
                const groundRayStart = new Vector3(pos.x, pos.y + 0.5, pos.z);
                const groundRay = new Ray(groundRayStart, Vector3.Down(), 10.0);
                
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
            
            // Защита от проваливания - импульсом вверх, НЕ телепортацией
            if (pos.y < groundHeight - 1.0) {
                const pushUpForce = (groundHeight + 1.5 - pos.y) * 50000;
                body.applyForce(new Vector3(0, pushUpForce, 0), pos);
                if (vel.y < -5) {
                    body.setLinearVelocity(new Vector3(vel.x, -5, vel.z));
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
            totalTorqueY += (targetTurnRate - currentTurnRate) * 11000 * angularAccelMultiplier;
            
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
            
            // === 8. ANTI-FLY (ограничение вертикальной скорости) ===
            if (vel.y > 5) {
                body.setLinearVelocity(new Vector3(vel.x, 5, vel.z));
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
            // Применяем сильный импульс вверх вместо телепортации
            const pushUpForce = (groundY + 2.0 - pos.y) * 80000;
            this.physicsBody.applyForce(new Vector3(0, pushUpForce, 0), pos);
            // Ограничиваем вертикальную скорость вниз
            if (vel && vel.y < -5) {
                this.physicsBody.setLinearVelocity(new Vector3(vel.x, -2, vel.z));
            }
            this.consecutiveStuckCount = 0;
            this.stuckTimer = now;
            return true;
        }
        
        // УБРАНО: Проверка на высоту > 4 - танки могут законно находиться на возвышенностях!
        // Физика сама опустит танк через hover систему
        
        // Проверка 2: Летим вверх слишком быстро (анти-полёт)
        if (vel && vel.y > 8) {
            logger.debug(`[EnemyTank ${this.id}] Flying up too fast (velY=${vel.y.toFixed(2)}), clamping`);
            // Сбрасываем вертикальную скорость
            this.physicsBody.setLinearVelocity(new Vector3(vel.x, Math.min(vel.y, 2), vel.z));
            this.stuckTimer = now;
            return true;
        }
        
        // Проверка 3: Не двигаемся при попытке движения (УЛУЧШЕНО)
        const moved = Vector3.Distance(pos, this.lastStuckCheckPos);
        const isAttemptingMove = Math.abs(this.throttleTarget) > 0.1 || Math.abs(this.steerTarget) > 0.3;
        
        if (moved < this.STUCK_THRESHOLD && isAttemptingMove) {
            this.consecutiveStuckCount++;
            
            // УСКОРЕНО: 2 проверки вместо 3 (2 * 400мс = 800мс)
            if (this.consecutiveStuckCount >= 2) {
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
        
        // Проверка 4: Застревание в бою (стреляем, но не двигаемся)
        if (this.state === "attack" && moved < 0.5 && this.target) {
            const timeSinceUnstuck = now - this.lastUnstuckTime;
            if (timeSinceUnstuck > 2000) { // Не чаще чем раз в 2 секунды
                // УЛУЧШЕНО: Плавное маневрирование в бою вместо резких изменений
                const newThrottle = (Math.random() - 0.5) * 1.5;
                const newSteer = (Math.random() - 0.5) * 2.0;
                const maxChange = 0.15; // Плавное изменение
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
        
        // ИСПРАВЛЕНО: Используем СИЛЫ вместо телепортации!
        // Телепортация вызывает конфликты с физическим движком и "дёрганье"
        const targetY = groundHeight + this.hoverHeight + 0.5;
        const heightDiff = targetY - pos.y;
        
        // Применяем сильную силу вверх
        const pushUpForce = heightDiff * 100000;
        this.physicsBody.applyForce(new Vector3(0, pushUpForce, 0), pos);
        
        // Ограничиваем вертикальную скорость
        const vel = this.physicsBody.getLinearVelocity();
        if (vel && vel.y < -3) {
            this.physicsBody.setLinearVelocity(new Vector3(vel.x, -3, vel.z));
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
        
        // 4. Генерируем новую точку патруля в случайном направлении
        const myPos = this.chassis.absolutePosition;
        const newAngle = Math.random() * Math.PI * 2;
        const newDist = 50 + Math.random() * 100;
        const newTarget = new Vector3(
            myPos.x + Math.cos(newAngle) * newDist,
            myPos.y,
            myPos.z + Math.sin(newAngle) * newDist
        );
        
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
        
        const rotationDelta = angleDiff * 0.08 * Math.max(0.3, this.turretAcceleration);
        this.turretCurrentAngle += rotationDelta;
        this.turret.rotation.y = this.turretCurrentAngle;
    }
    
    // === AI SYSTEM ===
    
    private generatePatrolPoints(center: Vector3): void {
        // УЛУЧШЕНО: Генерируем умный маршрут патрулирования с стратегическими точками
        // Боты должны выезжать из гаража и ездить везде, включая высоты и укрытия!
        
        const patrolRadius = 150 + Math.random() * 200; // 150-350 единиц от старта
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
        
        // Вторая точка - дальше для продолжения движения
        const farExitX = center.x + Math.cos(exitAngle) * 60;
        const farExitZ = center.z + Math.sin(exitAngle) * 60;
        const farExitPoint = new Vector3(farExitX, center.y, farExitZ);
        this.patrolPoints.push(farExitPoint);
        
        // Генерируем случайные точки по карте
        const otherPoints: Vector3[] = [];
        for (let i = 0; i < numPoints; i++) {
            const angle = (Math.PI * 2 / numPoints) * i + Math.random() * 1.2 - 0.6;
            const dist = patrolRadius * (0.4 + Math.random() * 0.6);
            
            // Смещаем от центра карты, а не от гаража
            const offsetX = (Math.random() - 0.5) * 200;
            const offsetZ = (Math.random() - 0.5) * 200;
            
            const x = Math.cos(angle) * dist + offsetX;
            const z = Math.sin(angle) * dist + offsetZ;
            
            // Ограничиваем карту (1000x1000 для тестов)
            const clampedX = Math.max(-500, Math.min(500, x));
            const clampedZ = Math.max(-500, Math.min(500, z));
            
            // УЛУЧШЕНО: Пытаемся найти высоту для точки патруля (используем высоту террейна)
            let pointY = center.y;
            const game = (window as any).gameInstance;
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
        logger.debug(`[EnemyTank ${this.id}] Generated ${this.patrolPoints.length} patrol points, radius: ${patrolRadius.toFixed(0)}`);
    }
    
    setTarget(target: { chassis: Mesh, isAlive: boolean, currentHealth?: number }): void {
        this.target = target;
    }
    
    private updateAI(): void {
        const now = Date.now();
        
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
            
            // Для дальних врагов (> 100м) используем простую проверку расстояния без raycast
            if (distance > 100) {
                // Простая проверка: если в радиусе обнаружения, считаем что видим (для оптимизации)
                canSeeTarget = distance < this.detectRange;
            } else if (distance < this.detectRange) {
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
                        if (meta && (meta.type === "enemyTank" || meta.type === "bullet" || meta.type === "consumable")) return false;
                        if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                        if (mesh.parent === this.chassis || mesh.parent === this.turret || mesh.parent === this.barrel) return false;
                        if (mesh === this.target?.chassis || mesh === this.target?.turret || mesh === this.target?.barrel) return false;
                        if (mesh.parent === this.target?.chassis || mesh.parent === this.target?.turret) return false;
                        return mesh.isPickable && mesh.visibility > 0.5;
                    });
                    
                    canSeeTarget = !pick || !pick.hit || 
                        (pick.pickedMesh === this.target?.chassis || 
                         pick.pickedMesh === this.target?.turret || 
                         pick.pickedMesh === this.target?.barrel ||
                         pick.pickedMesh?.parent === this.target?.chassis ||
                         pick.pickedMesh?.parent === this.target?.turret);
                    
                    // Сохраняем в кэш
                    this.raycastCache = { result: canSeeTarget, frame: currentFrame };
                }
            }
            
            // Обновляем состояние только если видим цель
            if (canSeeTarget && distance < this.detectRange) {
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
                
                // Make decisions periodically
                if (now - this.lastDecisionTime > this.decisionInterval) {
                    this.lastDecisionTime = now;
                    this.makeDecision(distance);
                }
            } else {
                // Не видим цель - возвращаемся к патрулированию
                this.state = "patrol";
            }
            } else {
                this.state = "patrol";
            }
        
        // Execute current state
        this.executeState();
    }
    
    private makeDecision(distance: number): void {
        const healthPercent = this.currentHealth / this.maxHealth;
        const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;
        
        // === ПРОВЕРКА ИСПОЛЬЗОВАНИЯ СТЕНКИ ===
        if (this.shouldUseWall()) {
            this.activateWall();
        }
        
        // Улучшенная логика принятия решений - более агрессивная!
        
        // Priority 1: Retreat only at CRITICAL health (УЛУЧШЕНО: уменьшено с 10% до 7% для более агрессивного поведения)
        if (healthPercent < 0.07) {
            this.state = "retreat";
            this.stateTimer = 4000;
            return;
        }
        
        // Priority 2: Seek cover or evade if taking heavy damage
        if (healthPercent < 0.25 && distance < 20) {
            // УЛУЧШЕНО: Ищем укрытие если здоровье низкое
            const now = Date.now();
            if (now - this.lastCoverCheckTime > this.COVER_CHECK_INTERVAL) {
                const coverPos = this.findCoverPosition();
                if (coverPos) {
                    this.currentCoverPosition = coverPos;
                    this.seekingCover = true;
                    this.lastCoverCheckTime = now;
                    // Используем специальное состояние для движения к укрытию
                    this.state = "retreat"; // Используем retreat для движения к укрытию
                    this.stateTimer = 5000;
                    return;
                }
            }
            
            // Если укрытие не найдено - уклоняемся
            if (Math.random() < 0.4) {
                this.state = "evade";
                this.stateTimer = 1500;
                // Выбираем направление уклонения
                const angle = Math.random() * Math.PI * 2;
                this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
                return;
            }
        }
        
        // УЛУЧШЕНО: Ищем укрытие если здоровье среднее и цель сильнее
        if (healthPercent < 0.5 && healthPercent < targetHealthPercent && distance < 50) {
            const now = Date.now();
            if (now - this.lastCoverCheckTime > this.COVER_CHECK_INTERVAL * 1.5) {
                const coverPos = this.findCoverPosition();
                if (coverPos && Math.random() < 0.3) { // 30% шанс искать укрытие
                    this.currentCoverPosition = coverPos;
                    this.seekingCover = true;
                    this.lastCoverCheckTime = now;
                    this.state = "retreat";
                    this.stateTimer = 4000;
                    return;
                }
            }
        }
        
        // УЛУЧШЕНО: Проверка возможности засады (только если здоровье хорошее и есть укрытие)
        if (distance < this.range && healthPercent > 0.6 && distance > 30 && distance < 80) {
            const ambushChance = this.adaptiveIntelligence > 1.2 ? 0.25 : 0.12; // УЛУЧШЕНО: Умные враги чаще используют засады (увеличено с 0.15 до 0.25)
            if (Math.random() < ambushChance && this.findAmbushPosition()) {
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
            
            // Базовый шанс фланга зависит от множества факторов (УЛУЧШЕНО для более агрессивной тактики)
            let flankChance = 0.0;
            if (shouldFlank) {
                flankChance = 0.60; // УВЕЛИЧЕНО с 0.50 для более активного фланга
                // Увеличиваем шанс фланга если не в оптимальной дистанции
                if (!isInOptimalRange) {
                    flankChance += 0.15;
                }
                // Увеличиваем шанс фланга если есть преимущество по HP
                if (hasHealthAdvantage) {
                    flankChance += 0.10;
                }
            } else {
                flankChance = 0.20; // Базовая вероятность фланга
            }
            
            // УЛУЧШЕНО: Если есть союзники, которые атакуют - значительно увеличиваем шанс фланга для окружения
            if (hasAlliesAttacking && allyCount > 0) {
                flankChance = Math.min(0.85, flankChance + 0.25 * allyCount); // УВЕЛИЧЕНО: До 85% шанс фланга при координации (было 75%)
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
                this.stateTimer = 3000; // УВЕЛИЧЕНО с 2500 для более длительного фланга
            } else {
                this.state = "attack";
                // Если цель слабая - агрессивнее атакуем (добиваем)
                if (targetHealthPercent < 0.4) {
                    this.stateTimer = 0; // Не переключаемся на другую тактику
                }
            }
        } 
        // Priority 4: Detected but not in range - chase aggressively!
        else if (distance < this.detectRange) {
            this.state = "chase";
            // Менее осторожны - преследуем даже при низком здоровье если цель слабее
            if (healthPercent < 0.25 && distance > 120 && targetHealthPercent > healthPercent) {
                this.state = "patrol"; // Возвращаемся к патрулированию только если враг сильнее
            }
        } 
        // Priority 5: Not detected - patrol
        else {
            this.state = "patrol";
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
        if (this.patrolPoints.length === 0) {
            // Генерируем новые точки если их нет
            this.generatePatrolPoints(this.chassis.absolutePosition);
            return;
        }
        
        const target = this.patrolPoints[this.currentPatrolIndex];
        if (!target) return;
        const myPos = this.chassis.absolutePosition;
        
        // ОПТИМИЗАЦИЯ: Используем квадрат расстояния для избежания sqrt
        const dx = myPos.x - target.x;
        const dz = myPos.z - target.z;
        const distanceSq = dx * dx + dz * dz;
        
        // Проверяем достижение точки только каждые несколько кадров для оптимизации
        if (distanceSq < 64 && this._tick % 8 === 0) { // УЛУЧШЕНО: Увеличено с 5 до 8 кадров для лучшей производительности
            // Достигли точки - переходим к следующей
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
            
            // УЛУЧШЕНО: Более частое обновление точек патруля для более активного патрулирования
            if (Math.random() < 0.25) {
                const newAngle = Math.random() * Math.PI * 2;
                const newDist = 120 + Math.random() * 250;
                const newX = myPos.x + Math.cos(newAngle) * newDist;
                const newZ = myPos.z + Math.sin(newAngle) * newDist;
                this.patrolPoints[this.currentPatrolIndex] = new Vector3(
                    Math.max(-500, Math.min(500, newX)),
                    myPos.y,
                    Math.max(-500, Math.min(500, newZ))
                );
            }
        }
        
        // УСКОРЕНО: Быстрый старт после спавна
        let patrolSpeed = 0.95;
        if (this._spawnWarmupTime < this.SPAWN_WARMUP_DURATION) {
            // Сразу начинаем с высокой скорости
            const warmupProgress = this._spawnWarmupTime / this.SPAWN_WARMUP_DURATION;
            patrolSpeed = 0.7 + warmupProgress * 0.25; // 0.7 -> 0.95
            this._spawnWarmupTime += 16; // ~16ms per frame
        }
        
        // КРИТИЧНО: driveToward вызывается каждый кадр для плавного обновления throttleTarget и steerTarget
        this.driveToward(target, patrolSpeed);
        
        // ИСПРАВЛЕНО: Сканирование башни каждый кадр для плавности
        // Если нет игрока в радиусе - сканируем, иначе наведение обрабатывается в update()
        if (!this.target || !this.target.isAlive) {
            const scanAngle = Math.sin(Date.now() * 0.0015) * 0.9; // Увеличена амплитуда
            this.turretTargetAngle = scanAngle;
        }
    }
    
    // Захват POI
    private doCapturePOI(): void {
        if (!this.targetPOI) {
            this.state = "patrol";
            return;
        }
        
        const myPos = this.chassis.absolutePosition;
        // ОПТИМИЗАЦИЯ: Используем квадраты расстояний для сравнения
        const dx = myPos.x - this.targetPOI.position.x;
        const dz = myPos.z - this.targetPOI.position.z;
        const distanceSq = dx * dx + dz * dz;
        const distance15Sq = 15 * 15;
        const distance8Sq = 8 * 8;
        
        if (distanceSq > distance15Sq) {
            // Едем к POI
            this.driveToward(this.targetPOI.position, 0.7);
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
        if (!this.target) return;
        
        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(targetPos, myPos);
        
        // УЛУЧШЕНО: Более умное преследование с предсказанием движения цели
        // Предсказываем, где будет цель через короткое время (улучшено для лучшего перехвата)
        const predictionTime = 0.7; // УЛУЧШЕНО: 0.7 секунды вперёд (было 0.5) для более точного перехвата
        const predictedTargetPos = targetPos.add(this.targetVelocity.scale(predictionTime));
        
        // Едем к предсказанной позиции для более эффективного перехвата
        this.driveToward(predictedTargetPos, 1.0);
        this.aimAtTarget();
        
        // ОТКЛЮЧЕНО: Микро-маневры вызывают конфликты с driveToward и дёргание
        // УЛУЧШЕНО: Если близко к цели, начинаем активное маневрирование
        // if (distance < 50) {
        //     // Добавляем небольшое боковое движение для усложнения прицеливания противнику
        //     // Используем плавное добавление вместо накопления для предотвращения дёргания
        //     const baseSteer = this.steerTarget;
        //     const microManeuver = Math.sin(this._tick * 0.03) * 0.15; // УМЕНЬШЕНО с 0.2 до 0.15
        //     this.steerTarget = Math.max(-1, Math.min(1, baseSteer + microManeuver * 0.3)); // Плавное смешивание
        // }
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
        
        // УЛУЧШЕНО: Более умная стрельба с лучшим выбором момента и проверкой препятствий
        const canShoot = this.isAimedAtTarget() && !this.isReloading && this.canShootAtTarget();
        
        if (canShoot) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown) {
        // УЛУЧШЕНО: Логика стрельбы зависит от сложности
        // HARD РЕЖИМ: стреляем ВСЕГДА когда прицелились!
        let shouldFire = false;
        
        if (this.difficulty === "hard") {
            // HARD: Максимально агрессивная стрельба - стреляем сразу!
            shouldFire = true;
        } else {
            // MEDIUM/EASY: Вычисляем "качество выстрела"
            const distanceFactor = distance < this.optimalRange ? 1.0 : (distance < this.optimalRange * 1.5 ? 0.8 : 0.6);
            const aimFactor = this.isAimedAtTarget() ? 1.0 : 0.5;
            const targetSpeedFactor = this.targetVelocity.length() < 8 ? 1.0 : (this.targetVelocity.length() < 15 ? 0.8 : 0.6);
            const healthAdvantageFactor = healthPercent > targetHealthPercent ? 1.2 : (healthPercent > targetHealthPercent * 0.8 ? 1.0 : 0.7);
            const targetWeaknessFactor = targetHealthPercent < 0.4 ? 1.3 : (targetHealthPercent < 0.6 ? 1.1 : 1.0);
            
            const baseChance = this.difficulty === "medium" ? 0.95 : 0.90; // УЛУЧШЕНО: Более активная стрельба (было 0.92/0.85)
            const qualityScore = distanceFactor * aimFactor * targetSpeedFactor * healthAdvantageFactor * targetWeaknessFactor;
            const fireChance = Math.min(0.98, baseChance * qualityScore);
            
            if (qualityScore > 1.0 || targetHealthPercent < 0.5) {
                shouldFire = Math.random() < Math.min(0.98, fireChance * 1.1);
            } else if (qualityScore > 0.7) {
                shouldFire = Math.random() < fireChance;
            } else {
                shouldFire = Math.random() < fireChance * 0.7;
            }
        }
                
                if (shouldFire) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
        }
        
        // УЛУЧШЕНО: Более активные и умные микро-манёвры с адаптивным поведением
        // === АГРЕССИВНОЕ СБЛИЖЕНИЕ при преимуществе HP ===
        if (healthPercent > 0.6 && targetHealthPercent < 0.4) {
            // Добить раненую цель - приближаемся агрессивно с предсказанием!
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.3));
            this.driveToward(predictedTargetPos, 0.85); // УВЕЛИЧЕНО с 0.8
            return;
        }
        
        // Улучшенное поддержание оптимальной дистанции с адаптивными маневрами
        let newThrottle: number;
        let newSteer: number;
        
        // УЛУЧШЕНО: Адаптивная частота маневров в зависимости от здоровья
        const maneuverFrequency = healthPercent > 0.6 ? 0.025 : (healthPercent > 0.3 ? 0.02 : 0.015);
        const maneuverAmplitude = healthPercent > 0.5 ? 1.0 : 0.7; // Меньше амплитуда при низком HP
        
        if (distance < this.optimalRange * 0.4) {
            // Слишком близко - отступаем быстрее с активным зигзагом
            newThrottle = -0.75; // УВЕЛИЧЕНО с -0.7
            newSteer = Math.sin(this._tick * maneuverFrequency * 1.5) * 0.6 * maneuverAmplitude; // УВЕЛИЧЕНО
        } else if (distance < this.optimalRange * 0.7) {
            // Близко - активный зигзаг с предсказанием движения цели
            newThrottle = -0.35; // УВЕЛИЧЕНО с -0.3
            newSteer = Math.sin(this._tick * maneuverFrequency * 1.2) * 0.5 * maneuverAmplitude;
            // Добавляем боковое движение для усложнения прицеливания
            const lateralMovement = Math.cos(this._tick * maneuverFrequency * 0.8) * 0.3;
            newSteer += lateralMovement;
        } else if (distance > this.optimalRange * 1.4) {
            // Слишком далеко - быстро приближаемся с предсказанием
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.4));
            this.driveToward(predictedTargetPos, 0.75); // УВЕЛИЧЕНО с 0.7
            return;
        } else if (distance > this.optimalRange * 1.1) {
            // Немного далеко - приближаемся с предсказанием
            const predictedTargetPos = targetPos.add(this.targetVelocity.scale(0.2));
            this.driveToward(predictedTargetPos, 0.5); // УВЕЛИЧЕНО с 0.4
            return;
        } else {
            // Оптимальная дистанция - активное маневрирование с адаптивной частотой
            const strafeSpeed = healthPercent > 0.5 ? 0.6 : (healthPercent > 0.3 ? 0.4 : 0.25); // УВЕЛИЧЕНО
            // Комбинируем несколько паттернов движения для более непредсказуемого поведения
            const primaryPattern = Math.sin(this._tick * maneuverFrequency) * strafeSpeed;
            const secondaryPattern = Math.cos(this._tick * maneuverFrequency * 1.3) * strafeSpeed * 0.4;
            newThrottle = primaryPattern + secondaryPattern;
            newSteer = Math.cos(this._tick * maneuverFrequency * 1.5) * 0.6 * maneuverAmplitude; // УВЕЛИЧЕНО
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
        
        // УЛУЧШЕНО: Более быстрое движение при фланге
        this.driveToward(flankPos, 0.9); // УВЕЛИЧЕНО с 0.8
        this.aimAtTarget();
        
        // Check timer
        this.stateTimer -= 33; // ~30fps
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
            } else {
                // Движемся к укрытию
                this.driveToward(this.currentCoverPosition, 0.9);
                this.aimAtTarget(); // Все ещё целимся в цель
                
                // Стреляем из укрытия
                if (this.isAimedAtTarget() && !this.isReloading) {
                    const now = Date.now();
                    if (now - this.lastShotTime > this.cooldown * 0.95) {
                        if (Math.random() < 0.7) { // 70% шанс стрельбы из укрытия
                            this.fire();
                            this.lastShotTime = now;
                        }
                    }
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
        this.driveToward(retreatPos, 1.0);
        
        // Still aim at enemy while retreating (fighting retreat)
        this.aimAtTarget();
        
        // УЛУЧШЕНО: Более активная стрельба при отступлении
        if (this.isAimedAtTarget() && !this.isReloading) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown * 0.9) { // Быстрее стрельба при отступлении
                // УВЕЛИЧЕН шанс стрельбы до 60% для более активного боя
                if (Math.random() < 0.6) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
        }
    }
    
    private doEvade(): void {
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
        this.driveToward(evadePos, 1.0);
        
        // Все ещё целимся в цель (боевое уклонение)
        this.aimAtTarget();
        
        // УЛУЧШЕНО: Более агрессивная стрельба при уклонении
        if (this.isAimedAtTarget() && !this.isReloading) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown * 1.1) { // УМЕНЬШЕНО с 1.2 до 1.1
                // УВЕЛИЧЕН шанс стрельбы с 30% до 45% для более активного боя
                if (Math.random() < 0.45) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
        }
        
        this.stateTimer -= 33;
        if (this.stateTimer <= 0) {
            // Возвращаемся к атаке или отступлению в зависимости от здоровья
            const healthPercent = this.currentHealth / this.maxHealth;
            this.state = healthPercent < 0.3 ? "retreat" : "attack";
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
            this.driveToward(this.ambushPosition, 0.8);
        } else {
            // На позиции засады - ждём цель
            this.throttleTarget = 0;
            this.steerTarget = 0;
            this.aimAtTarget();
            
            // Стреляем если цель в радиусе и прицелились (с проверкой препятствий)
            if (distance < this.attackRange && this.isAimedAtTarget() && !this.isReloading && this.canShootAtTarget()) {
                const now = Date.now();
                if (now - this.lastShotTime > this.cooldown) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
            
            // Проверяем таймер засады
            this.ambushTimer += 33; // ~30fps
            if (this.ambushTimer > this.AMBUSH_DURATION || distance < 20) {
                // Засада закончилась или цель слишком близко - переходим к атаке
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
            this.driveToward(this.baitPosition, 0.7);
        } else {
            // На позиции - останавливаемся и стреляем
            this.throttleTarget = 0;
            this.aimAtTarget();
            
            // Стреляем если цель в радиусе
            if (distance < this.attackRange && this.isAimedAtTarget() && !this.isReloading && this.canShootAtTarget()) {
                const now = Date.now();
                if (now - this.lastShotTime > this.cooldown * 0.9) {
                    if (Math.random() < 0.7) {
                        this.fire();
                        this.lastShotTime = now;
                    }
                }
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
                if (mesh === this.chassis || mesh.parent === this.chassis) return false;
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
            // Игнорируем части нашего танка
            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel ||
                mesh.parent === this.chassis || mesh.parent === this.turret) return false;
            // Игнорируем части цели (с проверкой на null)
            if (this.target && this.target.chassis && this.target.turret && this.target.barrel) {
                if (mesh === this.target.chassis || mesh === this.target.turret || mesh === this.target.barrel ||
                    mesh.parent === this.target.chassis || mesh.parent === this.target.turret) return false;
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
        
        if (direction.length() < 0.5) {
            // УЛУЧШЕНО: Плавная остановка вместо резкой установки в 0
            const maxChange = 0.10;
            const throttleChange = Math.max(-maxChange, Math.min(maxChange, 0 - this.throttleTarget));
            const steerChange = Math.max(-maxChange, Math.min(maxChange, 0 - this.steerTarget));
            this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + throttleChange));
            this.steerTarget = Math.max(-1, Math.min(1, this.steerTarget + steerChange));
            return;
        }
        
        direction.normalize();
        
        // === OBSTACLE AVOIDANCE ===
        const avoidDir = this.checkObstacles();
        if (avoidDir !== 0) {
            // Корректируем направление для обхода препятствия
            const right = new Vector3(direction.z, 0, -direction.x);
            direction = direction.add(right.scale(avoidDir * 0.6)).normalize();
            speedMult *= 0.7; // Замедляемся при обходе
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
        const maxSteerChangePerFrame = 0.10; // УМЕНЬШЕНО с 0.15 до 0.10 для максимальной плавности
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
        
    }
    
    // === AIMING ===
    
    private aimAtTarget(): void {
        if (!this.target || !this.target.chassis) return;
        
        const targetPos = this.target.chassis.absolutePosition.clone();
        const myPos = this.chassis.absolutePosition;
        
        // === УЛУЧШЕННОЕ ПРЕДСКАЗАНИЕ: Точное упреждение для сложного режима! ===
        const distance = Vector3.Distance(targetPos, myPos);
        const bulletSpeed = 240; // Скорость снаряда
        const flightTime = distance / bulletSpeed;
        
        // HARD РЕЖИМ: Используем историю движения для предсказания
        const targetSpeed = this.targetVelocity.length();
        
        // Адаптивный фактор предсказания зависит от сложности (УЛУЧШЕНО для всех режимов)
        let predictionFactor: number;
        if (this.difficulty === "hard") {
            // HARD: почти идеальное предсказание! (улучшено)
            if (targetSpeed > 15) {
                predictionFactor = 0.99; // УЛУЧШЕНО: Почти идеальное для быстрых целей (было 0.98)
            } else if (targetSpeed > 5) {
                predictionFactor = 0.97; // УЛУЧШЕНО: Очень точное для средних скоростей (было 0.95)
            } else {
                predictionFactor = 0.94; // УЛУЧШЕНО: Точное для медленных целей (было 0.92)
            }
        } else if (this.difficulty === "medium") {
            // MEDIUM: улучшено на 5-7%
            predictionFactor = targetSpeed > 15 ? 0.93 : (targetSpeed > 5 ? 0.90 : 0.87); // УЛУЧШЕНО (было 0.88/0.85/0.82)
        } else {
            // EASY: улучшено на 5-7%
            predictionFactor = targetSpeed > 15 ? 0.85 : (targetSpeed > 5 ? 0.83 : 0.80); // УЛУЧШЕНО (было 0.80/0.78/0.75)
        }
        
        // HARD: Более точное вычисление ускорения с учётом истории
        let targetAcceleration = Vector3.Zero();
        if (this.difficulty === "hard" && this.targetVelocity.length() > 0.1) {
            // Предполагаем продолжение текущего направления движения
            targetAcceleration = this.targetVelocity.normalize().scale(3.0);
        }
        
        // Предсказываем позицию с учётом ускорения (квадратичная интерполяция)
        const predictedPos = targetPos.add(
            this.targetVelocity.scale(flightTime * predictionFactor)
                .add(targetAcceleration.scale(flightTime * flightTime * 0.5))
        );
        
        // УЛУЧШЕНО: Адаптивный разброс - МИНИМАЛЬНЫЙ для сложного режима!
        const adaptiveAccuracy = this.getAdaptiveAccuracy(distance);
        if (adaptiveAccuracy < 1.0) {
            // HARD режим: минимальный разброс
            const spreadMultiplier = this.difficulty === "hard" ? 0.02 : 
                                     (this.difficulty === "medium" ? 0.04 : 0.05);
            const baseSpread = (1 - adaptiveAccuracy) * distance * spreadMultiplier;
            
            // На сложном режиме не увеличиваем разброс для движущихся целей
            const movementSpread = this.difficulty === "hard" ? baseSpread : 
                                   (targetSpeed > 10 ? baseSpread * 1.3 : baseSpread);
            
            predictedPos.x += (Math.random() - 0.5) * movementSpread;
            predictedPos.z += (Math.random() - 0.5) * movementSpread;
            
            // Вертикальная коррекция только для лёгкого/среднего режима
            if (targetSpeed > 5 && this.difficulty !== "hard") {
                predictedPos.y += (Math.random() - 0.5) * movementSpread * 0.25;
            }
        }
        
        // Calculate angle to predicted position
        const dx = predictedPos.x - myPos.x;
        const dz = predictedPos.z - myPos.z;
        
        // Get chassis world rotation
        const chassisQuat = this.chassis.rotationQuaternion;
        const chassisAngle = chassisQuat ? chassisQuat.toEulerAngles().y : 0;
        
        // Calculate relative angle for turret
        const worldAngle = Math.atan2(dx, dz);
        this.turretTargetAngle = worldAngle - chassisAngle;
        
        // Normalize
        while (this.turretTargetAngle > Math.PI) this.turretTargetAngle -= Math.PI * 2;
        while (this.turretTargetAngle < -Math.PI) this.turretTargetAngle += Math.PI * 2;
    }
    
    private isAimedAtTarget(): boolean {
        if (!this.target) return false;
        
        // УЛУЧШЕНО: Более строгая проверка прицеливания для лучшей точности
        let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // УМЕНЬШЕН допуск с 0.15 до 0.12 (~6.9 градусов) для более точной стрельбы
        return Math.abs(angleDiff) < 0.12;
    }
    
    // === FIRE (from barrel, in barrel direction!) ===
    
    private fire(): void {
        if (!this.isAlive) return;
        
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
        
        // Устанавливаем перезарядку только если выстрел не заблокирован
        this.isReloading = true;
        setTimeout(() => { this.isReloading = false; }, this.cooldown);
        
        // Вражеские танки используют стандартную пушку по умолчанию with 3D positioning
        this.soundManager.playShoot("standard", muzzlePos);
        
        // Muzzle flash
        this.effectsManager.createMuzzleFlash(muzzlePos, barrelDir);
        this.effectsManager.createDustCloud(this.chassis.position.clone());
        
        // Create bullet (same size as player!)
        const ball = MeshBuilder.CreateBox(`enemyBullet_${Date.now()}`, {
            width: 0.6,
            height: 0.6,
            depth: 2.5
        }, this.scene);
        ball.position.copyFrom(muzzlePos);
        ball.lookAt(ball.position.add(barrelDir));
        ball.material = this.bulletMat;
        ball.metadata = { type: "enemyBullet", owner: this };
        
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { extents: new Vector3(0.5, 0.5, 2.0) }
        }, this.scene);
        shape.filterMembershipMask = 16; // Enemy bullet
        shape.filterCollideMask = 1 | 2 | 32;  // Player (1), environment (2), and protective walls (32)
        
        const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        // АРКАДНЫЙ СТИЛЬ: Минимальная масса - снаряд НЕ толкает танк при попадании
        body.setMassProperties({ mass: 0.001 });
        body.setLinearDamping(0.01);
        
        // Fire in BARREL direction! (уменьшен импульс из-за малой массы)
        body.applyImpulse(barrelDir.scale(3), ball.position);
        
        // === RECOIL (like player!) ===
        const recoilForce = barrelDir.scale(-400);
        this.physicsBody.applyImpulse(recoilForce, this.chassis.absolutePosition);
        
        // Angular recoil (tank rocks back)
        const barrelWorldPos = this.barrel.getAbsolutePosition();
        const chassisPos = this.chassis.absolutePosition;
        const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
        // Используем переиспользуемый вектор для torque отдачи
        const recoilTorque = this._tmpRight!;
        recoilTorque.set(-torqueDir.z * 2000, 0, torqueDir.x * 2000);
        this.applyTorque(recoilTorque);
        
        // === HIT DETECTION ===
        // Базовый урон пули
        let damage = 20;
        // Масштабируем урон в зависимости от сложности
        if (this.difficulty === "easy") {
            damage = 14; // Меньше урон на лёгкой
        } else if (this.difficulty === "hard") {
            damage = 26; // Больше урон на сложной
        }
        // Дополнительное плавное масштабирование урона от прогресса/длительности сессии
        const scale = Math.min(Math.max(this.difficultyScale, 0.7), 1.8);
        const damageScale = 1 + (scale - 1) * 0.5; // до ~+40% урона при максимальном скейле
        damage = Math.round(damage * damageScale);

        let hasHit = false;
        let ricochetCount = 0;
        const maxRicochets = 2;
        
        const target = this.target;
        
        const checkHit = () => {
            if (hasHit || ball.isDisposed()) return;
            
            const bulletPos = ball.absolutePosition;
            
            // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКОЙ ===
            // Ищем все стенки на сцене
            const walls = this.scene.meshes.filter(mesh => 
                mesh.metadata && mesh.metadata.type === "protectiveWall" && !mesh.isDisposed()
            );
            for (const wall of walls) {
                const wallPos = wall.absolutePosition;
                const wallRotation = wall.rotation.y;
                
                // Размеры стенки: width=6, height=4, depth=0.5
                const wallHalfWidth = 3;
                const wallHalfHeight = 2;
                const wallHalfDepth = 0.25;
                
                // Переводим позицию пули в локальную систему координат стенки
                const localPos = bulletPos.subtract(wallPos);
                const cosY = Math.cos(-wallRotation);
                const sinY = Math.sin(-wallRotation);
                
                // Поворачиваем позицию пули в локальную систему координат стенки
                const localX = localPos.x * cosY - localPos.z * sinY;
                const localY = localPos.y;
                const localZ = localPos.x * sinY + localPos.z * cosY;
                
                // Проверяем, находится ли пуля внутри границ стенки
                if (Math.abs(localX) < wallHalfWidth && 
                    Math.abs(localY) < wallHalfHeight && 
                    Math.abs(localZ) < wallHalfDepth) {
                    hasHit = true;
                    
                    // Урон по стенке совпадает с уроном по танку (учитывает скейл сложности)
                    const bulletDamage = damage;
                    
                    // Наносим урон стенке через metadata
                    const wallMeta = wall.metadata as any;
                    if (wallMeta && wallMeta.tankController && typeof wallMeta.tankController.damageWall === 'function') {
                        wallMeta.tankController.damageWall(wall, bulletDamage);
                    }
                    
                    logger.debug(`[EnemyTank ${this.id}] Bullet hit protective wall! Damage: ${bulletDamage}`);
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
                    // Передаём позицию атакующего для индикатора направления урона
                    (target as any).takeDamage(damage, this.chassis.absolutePosition.clone());
                    this.effectsManager.createExplosion(bulletPos, 0.8);
                    this.soundManager.playHit("normal", bulletPos);
                ball.dispose();
                return;
                }
            }
            
            // Ground ricochet
            if (bulletPos.y < 0.6 && ricochetCount < maxRicochets) {
                const velocity = body.getLinearVelocity();
                if (velocity && velocity.length() > 20) {
                    const direction = velocity.normalize();
                    const incidenceAngle = Math.abs(direction.y);
                    
                    if (incidenceAngle < 0.6) {
                        ricochetCount++;
                        const speed = velocity.length();
                        const groundNormal = new Vector3(0, 1, 0);
                        const reflection = direction.subtract(groundNormal.scale(2 * Vector3.Dot(direction, groundNormal)));
                        body.setLinearVelocity(reflection.scale(speed * 0.75));
                        ball.position.y = 0.7;
                        ball.lookAt(ball.position.add(reflection));
                        this.effectsManager.createHitSpark(bulletPos);
                    }
                }
            }
            
            // Bounds check
            if (bulletPos.y < -10 || bulletPos.y > 100 || 
                Math.abs(bulletPos.x) > 550 || Math.abs(bulletPos.z) > 550) {
                ball.dispose();
                return;
            }
            
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
        console.log(`[EnemyTank ${this.id}] Took ${amount} damage, HP: ${this.currentHealth}`);
        
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
            
            console.log(`[EnemyTank ${this.id}] MARKED for ${duration/1000}s!`);
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
            console.log(`[EnemyTank ${this.id}] Mark expired`);
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
        
        // Приоритет 1: Критически низкое здоровье при бое
        if (healthPercent < 0.35 && this.state === "attack") return true;
        
        // Приоритет 2: Отступление/уклонение
        if ((this.state === "retreat" || this.state === "evade") && healthPercent < 0.5) {
            return Math.random() < 0.6; // 60% шанс
        }
        
        // Приоритет 3: Перезарядка под огнём
        if (this.isReloading && healthPercent < 0.6) {
            return Math.random() < 0.3; // 30% шанс
        }
        
        return false;
    }
    
    private activateWall(): void {
        if (!this.chassis || !this.target || !this.target.chassis) return;
        
        this.lastWallTime = Date.now();
        
        // Позиция между ботом и целью
        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        const toTarget = targetPos.subtract(myPos).normalize();
        
        const wallPos = myPos.clone().add(toTarget.scale(5));
        wallPos.y = 2.0; // Центр стенки
        
        // Создаём стенку
        this.wallMesh = MeshBuilder.CreateBox(`enemyWall_${this.id}_${Date.now()}`, {
            width: 5,
            height: 3.5,
            depth: 0.4
        }, this.scene);
        
        this.wallMesh.position.copyFrom(wallPos);
        this.wallMesh.rotation.y = Math.atan2(toTarget.x, toTarget.z);
        
        // Материал (тёмно-красный, как и танк)
        const mat = new StandardMaterial(`enemyWallMat_${this.id}_${Date.now()}`, this.scene);
        mat.diffuseColor = new Color3(0.4, 0.1, 0.1);
        mat.emissiveColor = new Color3(0.2, 0.05, 0.05);
        mat.specularColor = Color3.Black();
        this.wallMesh.material = mat;
        
        this.wallMesh.metadata = { type: "enemyWall", owner: this };
        this.wallHealth = this.WALL_MAX_HEALTH;
        
        // Физика
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { extents: new Vector3(5, 3.5, 0.4) }
        }, this.scene);
        shape.filterMembershipMask = 64; // Стенки врагов
        shape.filterCollideMask = 1 | 2 | 4; // Игрок, окружение, пули игрока
        
        this.wallPhysics = new PhysicsBody(this.wallMesh, PhysicsMotionType.STATIC, false, this.scene);
        this.wallPhysics.shape = shape;
        
        // Таймер удаления
        this.wallTimeout = window.setTimeout(() => this.destroyWall(), this.WALL_DURATION);
        
        console.log(`[EnemyTank ${this.id}] Wall activated!`);
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
        
        this.wallHealth -= damage;
        console.log(`[EnemyTank ${this.id}] Wall took ${damage} damage, HP: ${this.wallHealth}`);
        
        if (this.wallHealth <= 0) {
            this.destroyWall();
            return true; // Стенка разрушена
        }
        return false; // Стенка повреждена
    }
    
    private die(): void {
        this.isAlive = false;
        console.log(`[EnemyTank ${this.id}] DESTROYED!`);
        
        const explosionPos = this.chassis.absolutePosition.clone();
        this.effectsManager.createExplosion(explosionPos, 2.5);
        this.soundManager.playExplosion(explosionPos, 2.5);
        
        // Анимация разрушения - разброс частей танка
        this.createDestructionAnimation();
        
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
                
                // Автоматическое удаление через 10 секунд
                setTimeout(() => {
                    if (mesh && !mesh.isDisposed()) {
                        if (partBody) {
                            partBody.dispose();
                        }
                        mesh.dispose();
                    }
                }, 10000);
                
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
    
    dispose(): void {
        this.isAlive = false;
        
        // УЛУЧШЕНО: Удаляем себя из статического списка
        const index = EnemyTank.allEnemies.indexOf(this);
        if (index > -1) {
            EnemyTank.allEnemies.splice(index, 1);
        }
        
        // Уничтожаем стенку если есть
        this.destroyWall();
        
        // УЛУЧШЕНО: Очистка pathfinding
        if (this.pathfinding) {
            this.pathfinding.dispose();
            this.pathfinding = null;
        }
        
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.dispose();
        }
        if (this.hpBillboard && !this.hpBillboard.isDisposed()) {
            this.hpBillboard.dispose();
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
    
    // УЛУЧШЕНО: Обновление информации о близких союзниках с дополнительной информацией
    private updateNearbyEnemies(): void {
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
    private findCoverPosition(): Vector3 | null {
        if (!this.target || !this.target.chassis || !this.pathfinding) return null;
        
        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
        
        // Используем улучшенный поиск укрытия из AIPathfinding
        const coverPos = this.pathfinding.findCover(myPos, targetPos, 30);
        
        if (coverPos) {
            return coverPos;
        }
        
        // Fallback: старый метод если pathfinding не нашёл укрытие
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        // Ищем препятствия вокруг себя
        const searchRadius = 25;
        const searchAngles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI * 3 / 4, -Math.PI * 3 / 4];
        
        let bestCover: { pos: Vector3, score: number } | null = null;
        
        for (const angle of searchAngles) {
            const perpDir = new Vector3(
                Math.cos(angle) * toTarget.x - Math.sin(angle) * toTarget.z,
                0,
                Math.sin(angle) * toTarget.x + Math.cos(angle) * toTarget.z
            ).normalize();
            
            const checkPos = myPos.clone().add(perpDir.scale(searchRadius));
            
            // Проверяем, есть ли препятствие между нами и целью
            const ray = new Ray(myPos, checkPos.subtract(myPos).normalize(), searchRadius);
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled()) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "enemyTank" || meta.type === "playerTank" || 
                    meta.type === "bullet" || meta.type === "enemyBullet")) return false;
                if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                if (mesh === this.chassis || mesh.parent === this.chassis) return false;
                // Ищем здания и крупные препятствия
                return mesh.isPickable && (mesh.name.includes("building") || 
                    mesh.name.includes("house") || mesh.name.includes("bunker") ||
                    mesh.name.includes("container") || mesh.name.includes("wall"));
            });
            
            if (pick && pick.hit && pick.distance < searchRadius * 0.8) {
                // Нашли потенциальное укрытие
                const coverPos = myPos.clone().add(perpDir.scale(pick.distance * 0.7));
                const distToTarget = Vector3.Distance(coverPos, targetPos);
                const distFromMe = Vector3.Distance(coverPos, myPos);
                
                // Оценка укрытия: дальше от цели, но не слишком далеко от нас
                const score = distToTarget / (distFromMe + 1);
                
                if (!bestCover || score > bestCover.score) {
                    bestCover = { pos: coverPos, score };
                }
            }
        }
        
        return bestCover ? bestCover.pos : null;
    }
    
    // УЛУЧШЕНО: Анализ стиля игры игрока с улучшенной адаптивностью
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
        
        if (avgStyle > 0.3) {
            this.playerStyle = "aggressive";
        } else if (avgStyle < -0.3) {
            this.playerStyle = "defensive";
        } else {
            this.playerStyle = "balanced";
        }
        
        // УЛУЧШЕНО: Адаптируем поведение в зависимости от стиля игрока
        if (this.playerStyle === "aggressive") {
            // Против агрессивного игрока - более осторожная тактика, больше уклонений
            this.optimalRange = 38; // Немного дальше
            this.attackRange = 145; // Немного дальше атакуем
        } else if (this.playerStyle === "defensive") {
            // Против оборонительного игрока - более агрессивная тактика, ближе подходим
            this.optimalRange = 32; // Ближе
            this.attackRange = 135; // Ближе атакуем
        } else {
            // Сбалансированный стиль - стандартные значения
            this.optimalRange = 35;
            this.attackRange = 140;
        }
        
        // Очищаем старые данные
        this.playerStyleSamples = [];
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
