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

// === AI States ===
type AIState = "idle" | "patrol" | "chase" | "attack" | "flank" | "retreat" | "evade" | "capturePOI";

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
    
    // Physics Config (same as TankController)
    private mass = 3000; // УВЕЛИЧЕНО с 1875 для предотвращения парения в воздухе (согласовано с игроком)
    private hoverHeight = 1.0;
    private hoverStiffness = 4500; // УЛУЧШЕНО: Согласовано с игроком для лучшей проходимости
    private hoverDamping = 35000; // УЛУЧШЕНО: Согласовано с игроком для лучшей стабилизации
    
    // Movement (same as TankController)
    private moveSpeed = 20;        // Slightly slower than player
    private turnSpeed = 2.2;
    private acceleration = 15000; // УЛУЧШЕНО: Согласовано с игроком для лучшей проходимости по пересечённой местности
    
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
    private decisionInterval = 500; // УВЕЛИЧЕНО с 300 до 500мс для более плавной работы AI (меньше резких переключений состояний)
    private flankDirection = 1; // 1 = right, -1 = left
    private evadeDirection = new Vector3(0, 0, 0);
    private lastTargetPos = new Vector3(0, 0, 0);
    private targetVelocity = new Vector3(0, 0, 0);
    
    // УЛУЧШЕНО: Групповое поведение
    private nearbyEnemies: EnemyTank[] = []; // Близкие союзники для координации
    private lastGroupCheckTime = 0;
    private readonly GROUP_CHECK_INTERVAL = 1000; // Проверка каждую секунду
    private readonly GROUP_COORDINATION_RANGE = 80; // Радиус координации
    
    // УЛУЧШЕНО: Система укрытий и тактического позиционирования
    private lastCoverCheckTime = 0;
    private readonly COVER_CHECK_INTERVAL = 2000; // Проверка каждые 2 секунды
    private currentCoverPosition: Vector3 | null = null;
    private seekingCover = false;
    
    // УЛУЧШЕНО: Адаптация к стилю игры игрока
    private playerStyle: "aggressive" | "defensive" | "balanced" = "balanced";
    private playerStyleSamples: number[] = []; // История расстояний до игрока
    private lastStyleUpdateTime = 0;
    private readonly STYLE_UPDATE_INTERVAL = 5000; // Обновление каждые 5 секунд
    
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
    private readonly TERRAIN_CHECK_INTERVAL = 3000; // Проверка каждые 3 секунды
    private preferredHeightPosition: Vector3 | null = null;
    
    // УЛУЧШЕНО: Приоритизация целей
    private targetPriority = 0; // 0 = нет цели, 1-10 = приоритет цели
    private lastTargetEvaluationTime = 0;
    private readonly TARGET_EVAL_INTERVAL = 2000; // Оценка каждые 2 секунды
    
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
    
    // Tick counter
    private _tick = 0;
    
    // Raycast caching для оптимизации
    private raycastCache: { result: boolean, frame: number } | null = null;
    private readonly RAYCAST_CACHE_FRAMES = 4; // Кэшируем на 4 кадра
    
    // Ground raycast cache для hover системы
    private _groundRaycastCache: { groundHeight: number; frame: number } | null = null;
    
    // Переиспользуемые векторы для оптимизации памяти
    private _tmpPos?: Vector3;
    private _tmpForward?: Vector3;
    private _tmpRight?: Vector3;
    private _tmpUp?: Vector3;
    
    // === SPAWN STABILIZATION ===
    private _spawnStabilizing = true;
    private _spawnWarmupTime = 0; // Время с момента окончания стабилизации (для плавного разгона)
    private readonly SPAWN_WARMUP_DURATION = 1500; // 1.5 секунды плавного разгона
    
    // Для отслеживания застревания в воздухе
    private _airStuckTimer = 0;
    private readonly AIR_STUCK_RESET_TIME = 2000; // 2 секунды в воздухе = принудительная телепортация
    
    // === ANTI-STUCK SYSTEM ===
    private stuckTimer = 0;
    private lastStuckCheckPos = new Vector3();
    private readonly STUCK_CHECK_INTERVAL = 1000; // мс
    private readonly STUCK_THRESHOLD = 2.0; // минимальное перемещение за интервал
    private consecutiveStuckCount = 0;
    
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
        
        // Setup physics (SAME AS PLAYER!)
        this.setupPhysics();
        
        // Generate patrol points
        this.generatePatrolPoints(position);
        
        // Random flank direction
        this.flankDirection = Math.random() > 0.5 ? 1 : -1;
        
        // Register physics update
        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());
        
        // УЛУЧШЕННАЯ стабилизация спавна: более быстрая и надёжная
        this._spawnStabilizing = true;
        
        // КРИТИЧНО: Сразу корректируем позицию и ориентацию ДО регистрации updatePhysics
        // Используем requestAnimationFrame для гарантии, что это выполнится после создания physics body
        requestAnimationFrame(() => {
            if (this.physicsBody && this.chassis && !this.chassis.isDisposed()) {
                // Убеждаемся, что танк на правильной высоте (позиция уже правильная, не добавляем 2.0)
                const currentPos = this.chassis.position;
                const targetY = position.y; // Используем позицию как есть (уже с учетом террейна)
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
                const myPos = this.chassis.absolutePosition;
                const dir = target.subtract(myPos);
                dir.y = 0;
                if (dir.length() > 1) {
                    // Сразу устанавливаем throttle для немедленного начала движения
                    this.throttleTarget = 0.8;
                    this.steerTarget = 0;
                    // Также инициализируем smooth-значения для плавного разгона
                    this.smoothThrottle = 0.1; // Небольшое начальное значение для мгновенного старта
                }
            }
            
            // Вызываем doPatrol для корректировки направления
            this.doPatrol();
            
        }, 150); // УМЕНЬШЕНО с 300 до 150 для более быстрого старта
        
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
                this.decisionInterval = 800; // Решения каждые 800мс (было 1000)
                this.moveSpeed = 10; // Медленнее (было 8)
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
                this.decisionInterval = 500; // Решения каждые 500мс (было 700)
                this.moveSpeed = 14; // Быстрее (было 10)
                this.maxHealth = 100;
                break;
            case "hard":
                // Сложная сложность: быстрая реакция, высокая точность
                this.cooldown = 2000; // 2 секунды перезарядка (было 2500)
                this.aimAccuracy = 0.95; // 95% точность
                this.detectRange = 220; // Увеличенный радиус обнаружения (было 200)
                this.range = 70;
                this.optimalRange = 38;
                this.decisionInterval = 300; // Решения каждые 300мс (было 500)
                this.moveSpeed = 18; // Значительно быстрее (было 12)
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
        // Физика корпуса (chassis)
        const chassisShape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, 0, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(2.2, 0.8, 3.5) // Same as player!
            }
        }, this.scene);
        chassisShape.filterMembershipMask = 8;
        chassisShape.filterCollideMask = 2 | 4 | 32;
        
        // КРИТИЧНО: Убеждаемся, что rotation установлен ПЕРЕД созданием physics body
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.rotationQuaternion = Quaternion.Identity();
        }
        
        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
        this.physicsBody.shape = chassisShape;
        this.physicsBody.setMassProperties({
            mass: this.mass,
            centerOfMass: new Vector3(0, -0.55, -0.3) // Центр тяжести: немного ниже (Y) и сзади (Z)
        });
        this.physicsBody.setLinearDamping(0.5);
        this.physicsBody.setAngularDamping(3.0);
        
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
        const distToPlayer = (this.target && this.target.chassis) ? 
            Vector3.Distance(this.chassis.position, this.target.chassis.position) : 1000;
        
        // Обновление AI в зависимости от расстояния:
        // До 400м - полное обновление
        // 400-600м - каждые 2 кадра
        // Дальше - каждые 4 кадра (но всё равно патрулируют!)
        let aiUpdateInterval = 1;
        if (distToPlayer > 600) {
            aiUpdateInterval = 4;
        } else if (distToPlayer > 400) {
            aiUpdateInterval = 2;
        }
        
        // КРИТИЧНО: Обновляем AI даже во время стабилизации, чтобы боты сразу начали патрулировать
        // (физика блокируется, но AI логика работает)
        if (this._tick % aiUpdateInterval === 0) {
            this.updateAI();
        }
        
        // Turret always updates (smooth)
        this.updateTurret();
    }
    
    // === PHYSICS UPDATE (SAME AS PLAYER!) ===
    
    private updatePhysics(): void {
        if (!this.isAlive || !this.chassis || this.chassis.isDisposed() || !this.physicsBody) return;
        
        // КРИТИЧНО: Skip physics during spawn stabilization - полностью блокируем физику
        if (this._spawnStabilizing) {
            // Принудительно сбрасываем все скорости и ориентацию во время стабилизации
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
            if (this.chassis && !this.chassis.isDisposed()) {
                this.chassis.rotationQuaternion = Quaternion.Identity();
                this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
            }
            return;
        }
        
        // КРИТИЧНО: Убеждаемся, что иерархия мешей НЕ сломана!
        // Башня ДОЛЖНА быть дочерним элементом корпуса
        if (this.turret && this.turret.parent !== this.chassis) {
            this.turret.parent = this.chassis;
        }
        // Ствол ДОЛЖЕН быть дочерним элементом башни
        if (this.barrel && this.turret && this.barrel.parent !== this.turret) {
            this.barrel.parent = this.turret;
        }
        
        try {
            const body = this.physicsBody;
            // Используем переиспользуемый вектор вместо clone() для оптимизации
            if (!this._tmpPos) this._tmpPos = new Vector3();
            const pos = this._tmpPos;
            pos.copyFrom(this.chassis.position);
            const vel = body.getLinearVelocity();
            const angVel = body.getAngularVelocity();
            
            if (!vel || !angVel) return;
            
            // Get orientation - используем переиспользуемые векторы
            const rotMatrix = this.chassis.getWorldMatrix();
            if (!this._tmpForward) this._tmpForward = new Vector3();
            if (!this._tmpRight) this._tmpRight = new Vector3();
            if (!this._tmpUp) this._tmpUp = new Vector3();
            const forward = Vector3.TransformNormalToRef(Vector3.Forward(), rotMatrix, this._tmpForward);
            forward.normalize();
            const right = Vector3.TransformNormalToRef(Vector3.Right(), rotMatrix, this._tmpRight);
            right.normalize();
            const up = Vector3.TransformNormalToRef(Vector3.Up(), rotMatrix, this._tmpUp);
            up.normalize();
            
            // Объявляем переиспользуемые векторы для сил один раз
            let forceVec = this._tmpForward!;
            
            // --- GROUND CLAMPING (определение высоты земли) ---
            // СНАЧАЛА определяем высоту земли, чтобы hover система работала относительно неё
            // Raycast вниз для определения высоты земли (кэшируем каждые 3 кадра)
            let groundHeight = pos.y - this.hoverHeight; // Значение по умолчанию
            if (!this._groundRaycastCache || (this._tick - this._groundRaycastCache.frame) >= 3) {
                const groundRayStart = pos.clone();
                groundRayStart.y += 0.5; // Немного выше танка
                const groundRayDir = Vector3.Down();
                const groundRayLength = 10.0; // Достаточно для любой высоты
                const groundRay = new Ray(groundRayStart, groundRayDir, groundRayLength);
                
                const groundFilter = (mesh: any) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "enemyTank")) return false;
                    if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
                    // Приоритет для ground мешей - всегда проверяем их
                    if (mesh.name.startsWith("ground_") || mesh.name.includes("road") || mesh.name.includes("garageFloorCollision")) {
                        return true;
                    }
                    return true;
                };
                
                const groundPick = this.scene.pickWithRay(groundRay, groundFilter);
                if (groundPick && groundPick.hit && groundPick.pickedPoint) {
                    groundHeight = groundPick.pickedPoint.y;
                    this._groundRaycastCache = {
                        groundHeight: groundHeight,
                        frame: this._tick
                    };
                } else {
                    // Если не нашли землю, используем текущую высоту минус hoverHeight
                    this._groundRaycastCache = {
                        groundHeight: pos.y - this.hoverHeight,
                        frame: this._tick
                    };
                }
            } else {
                groundHeight = this._groundRaycastCache.groundHeight;
            }
            
            // КРИТИЧНО: Проверяем застревание в воздухе ПЕРЕД hover системой
            const maxAllowedHeight = groundHeight + 3.0;
            const isStuckInAir = pos.y > maxAllowedHeight;
            
            // --- 1. ENHANCED HOVER (same improvements as player) ---
            // КРИТИЧЕСКИ ВАЖНО: Hover работает ОТНОСИТЕЛЬНО ЗЕМЛИ, а не абсолютной высоты!
            // ОТКЛЮЧАЕМ hover систему, если танк застрял в воздухе (она мешает падению)
            if (!isStuckInAir) {
                // Целевая высота = высота земли + hoverHeight
                const targetHeight = groundHeight + this.hoverHeight;
                const deltaY = targetHeight - pos.y; // Положительно когда танк ниже цели
                const velY = vel.y;
                
                // УЛУЧШЕННАЯ адаптивная жесткость для пересечённой местности
                const isMoving = Math.abs(Vector3.Dot(vel, forward)) > 1;
                const hoverSensitivity = isMoving ? 0.25 : 1.0; // Адаптивная чувствительность
                const stiffnessMultiplier = 1.0 + Math.min(Math.abs(deltaY) * 0.02, 0.12) * hoverSensitivity;
                const dampingMultiplier = isMoving ? 4.5 : 2.5; // Улучшенное демпфирование
                const hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping * dampingMultiplier);
                
                // Ограничение силы для предотвращения взлёта
                const absVelY = Math.abs(velY);
                const movementReduction = isMoving ? 0.35 : 1.0;
                const dynamicMaxForce = Math.min(
                    (absVelY > 30 ? 800 : (absVelY > 15 ? 1500 : 2500)) * movementReduction,
                    this.hoverStiffness * 0.5
                );
                const clampedHoverForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
                
                // Дополнительная прижимная сила при движении для лучшего сцепления
                let totalVerticalForce = clampedHoverForce;
                if (isMoving && deltaY < -0.1) {
                    totalVerticalForce -= Math.abs(deltaY) * this.mass * 120; // Прижимание при движении
                }
                
                // Используем переиспользуемый вектор для силы
                this._tmpUp!.set(0, totalVerticalForce, 0);
                body.applyForce(this._tmpUp!, pos);
            }
            
            // --- 2. ENHANCED KEEP UPRIGHT (same as player!) ---
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
            
            // КРИТИЧНО: Если танк слишком наклонён, принудительно выравниваем БЕЗ применения сил
            if (up.y < 0.5 || Math.abs(tiltX) > 0.5 || Math.abs(tiltZ) > 0.5) {
                // КРИТИЧНО: Принудительное выравнивание без применения сил
                this.chassis.rotationQuaternion = Quaternion.Identity();
                body.setAngularVelocity(Vector3.Zero());
                body.setTargetTransform(this.chassis.position, Quaternion.Identity());
            } else {
                // Нормальное выравнивание только если танк не слишком наклонён
                const uprightForce = 15000;
                const uprightDamp = 8000;
                const correctiveX = -tiltX * uprightForce - angVel.x * uprightDamp;
                const correctiveZ = -tiltZ * uprightForce - angVel.z * uprightDamp;
                
                // Используем переиспользуемый вектор для torque
                const correctiveTorque = this._tmpRight!;
                correctiveTorque.set(correctiveX, 0, correctiveZ);
                this.applyTorque(correctiveTorque);
                
                // Ограничение угловой скорости для предотвращения переворотов
                const maxAngVel = 3.0; // Максимальная угловая скорость
                const angVelLength = angVel.length();
                if (angVelLength > maxAngVel) {
                    const clampedAngVel = angVel.normalize().scale(maxAngVel);
                    body.setAngularVelocity(clampedAngVel);
                }
                
                // Экстренное выравнивание (только если не было принудительного выравнивания выше)
                if (up.y < 0.7 || Math.abs(tiltX) > 0.3 || Math.abs(tiltZ) > 0.3) {
                    if (up.y >= 0.5 && Math.abs(tiltX) <= 0.5 && Math.abs(tiltZ) <= 0.5) {
                        const emergencyForce = 25000;
                        const emergencyX = -tiltX * emergencyForce;
                        const emergencyZ = -tiltZ * emergencyForce;
                        correctiveTorque.set(emergencyX, 0, emergencyZ);
                        this.applyTorque(correctiveTorque);
                        
                        if (up.y < 0.5) {
                            const liftForce = (0.9 - up.y) * 50000;
                            this._tmpUp!.set(0, liftForce, 0);
                            body.applyForce(this._tmpUp!, pos);
                        }
                    }
                }
            }
            
            // Принудительная коррекция при критическом перевороте
            if (up.y < 0.3) {
                // КРИТИЧНО: Полностью сбрасываем угловую скорость и выравниваем
                body.setAngularVelocity(Vector3.Zero());
                this.chassis.rotationQuaternion = Quaternion.Identity();
                body.setTargetTransform(this.chassis.position, Quaternion.Identity());
                body.setAngularVelocity(Vector3.Zero());
            }
            
            // УЛУЧШЕНО: Проверка на застревание в воздухе (высота > 3 единиц над землёй - уменьшено с 5.0)
            // ПРИМЕЧАНИЕ: isStuckInAir уже вычислено выше перед hover системой
            if (isStuckInAir) {
                // Увеличиваем таймер застревания в воздухе
                this._airStuckTimer += 16; // ~16ms per frame
                
                // КРИТИЧНО: Если слишком долго в воздухе, принудительно телепортируем на землю
                if (this._airStuckTimer > this.AIR_STUCK_RESET_TIME) {
                    const targetY = groundHeight + this.hoverHeight;
                    const correctedPos = new Vector3(pos.x, targetY, pos.z);
                    
                    
                    this.chassis.position.copyFrom(correctedPos);
                    const currentQuat = this.chassis.rotationQuaternion || Quaternion.Identity();
                    body.setTargetTransform(correctedPos, currentQuat);
                    body.setLinearVelocity(new Vector3(vel.x, 0, vel.z)); // Сбрасываем вертикальную скорость
                    body.setAngularVelocity(Vector3.Zero());
                    this._airStuckTimer = 0; // Сбрасываем таймер
                } else {
                    // КРИТИЧНО: Принудительно опускаем вниз с более сильной силой
                    const targetY = groundHeight + this.hoverHeight;
                    const heightDiff = targetY - pos.y;
                    const dropForce = heightDiff * 80000; // УВЕЛИЧЕНО с 50000 до 80000 для более быстрого возврата
                    
                    
                    this._tmpUp!.set(0, dropForce, 0);
                    body.applyForce(this._tmpUp!, pos);
                    
                    // ДОПОЛНИТЕЛЬНО: Принудительно ограничиваем вертикальную скорость вниз, если она слишком мала
                    if (vel.y > -2) {
                        const correctedVelY = Math.max(-8, vel.y - 2); // Гарантируем падение минимум на 8 м/с или быстрее
                        body.setLinearVelocity(new Vector3(vel.x, correctedVelY, vel.z));
                    }
                }
            } else {
                // Сбрасываем таймер, если бот на нормальной высоте
                this._airStuckTimer = 0;
            }
            
            // --- 3. ENHANCED MOVEMENT (same improvements as player) ---
            // УВЕЛИЧЕНА плавность интерполяции для предотвращения дёргания
            const throttleLerpSpeed = Math.abs(this.throttleTarget) > 0 ? 0.06 : 0.04; // УМЕНЬШЕНО еще больше для максимальной плавности
            const steerLerpSpeed = Math.abs(this.steerTarget) > 0 ? 0.10 : 0.06; // УМЕНЬШЕНО еще больше для максимальной плавности
            
            // КРИТИЧНО: Ограничиваем максимальное изменение за кадр для предотвращения резких скачков
            const maxThrottleDelta = 0.15; // Максимальное изменение throttle за кадр
            const maxSteerDelta = 0.20; // Максимальное изменение steer за кадр
            
            const throttleDiff = this.throttleTarget - this.smoothThrottle;
            const steerDiff = this.steerTarget - this.smoothSteer;
            
            const clampedThrottleDiff = Math.max(-maxThrottleDelta, Math.min(maxThrottleDelta, throttleDiff));
            const clampedSteerDiff = Math.max(-maxSteerDelta, Math.min(maxSteerDelta, steerDiff));
            
            // Применяем ограниченное изменение
            const effectiveThrottleTarget = this.smoothThrottle + clampedThrottleDiff;
            const effectiveSteerTarget = this.smoothSteer + clampedSteerDiff;
            
            // Используем эффективные цели с ограничениями
            this.smoothThrottle += (effectiveThrottleTarget - this.smoothThrottle) * throttleLerpSpeed;
            this.smoothSteer += (effectiveSteerTarget - this.smoothSteer) * steerLerpSpeed;
            
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const currentSpeed = Vector3.Dot(vel, forward);
            const speedDiff = targetSpeed - currentSpeed;
            
            const isAccelerating = Math.sign(speedDiff) === Math.sign(this.smoothThrottle);
            const accelMultiplier = isAccelerating ? 1.0 : 1.5;
            let accel = speedDiff * this.acceleration * accelMultiplier;
            
            // УЛУЧШЕНО: Ограничиваем максимальное изменение ускорения за кадр для плавности
            const maxAccelChange = this.acceleration * 0.15; // Максимум 15% от базового ускорения за кадр
            const accelChange = Math.max(-maxAccelChange, Math.min(maxAccelChange, accel - this._lastAccel));
            accel = this._lastAccel + accelChange;
            this._lastAccel = accel;
            
            // Используем переиспользуемый вектор для forcePoint
            const forcePoint = this._tmpPos!;
            forcePoint.copyFrom(pos);
            forcePoint.y -= 0.6;
            // Используем переиспользуемый вектор для силы
            forceVec.copyFrom(forward);
            forceVec.scaleInPlace(accel);
            body.applyForce(forceVec, forcePoint);
            
            if (Math.abs(this.smoothThrottle) > 0.1) {
                // УЛУЧШЕНО: Увеличена прижимная сила для лучшего сцепления на пересечённой местности
                const downForce = Math.abs(this.smoothThrottle) * 6000; // УВЕЛИЧЕНО с 2000
                this._tmpUp!.set(0, -downForce, 0);
                body.applyForce(this._tmpUp!, pos);
            }
            
            // --- 4. ENHANCED TURN (Speed-dependent turning) ---
            const speedRatio = Math.abs(currentSpeed) / this.moveSpeed;
            const turnSpeedMultiplier = 1.0 + (1.0 - speedRatio) * 0.5;
            const effectiveTurnSpeed = this.turnSpeed * turnSpeedMultiplier;
            
            const targetTurnRate = this.smoothSteer * effectiveTurnSpeed;
            const currentTurnRate = angVel.y;
            
            const isTurning = Math.abs(this.smoothSteer) > 0.1;
            const angularAccelMultiplier = isTurning ? 1.2 : 1.5;
            let turnAccel = (targetTurnRate - currentTurnRate) * 11000 * angularAccelMultiplier;
            
            // УЛУЧШЕНО: Ограничиваем максимальное изменение углового ускорения за кадр для плавности
            const maxTurnAccelChange = 11000 * 0.12; // Максимум 12% от базового углового ускорения за кадр
            const turnAccelChange = Math.max(-maxTurnAccelChange, Math.min(maxTurnAccelChange, turnAccel - this._lastTurnAccel));
            turnAccel = this._lastTurnAccel + turnAccelChange;
            this._lastTurnAccel = turnAccel;
            // Используем переиспользуемый вектор для torque
            const torqueVec = this._tmpRight!;
            torqueVec.set(0, turnAccel, 0);
            this.applyTorque(torqueVec);
            
            if (Math.abs(speedRatio) > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                const stabilityTorque = -angVel.y * 2000 * speedRatio;
                torqueVec.set(0, stabilityTorque, 0);
                this.applyTorque(torqueVec);
            }
            
            if (Math.abs(this.smoothSteer) < 0.05) {
                torqueVec.set(0, -angVel.y * 4500, 0);
                this.applyTorque(torqueVec);
            }
            
            // --- 5. ENHANCED SIDE FRICTION ---
            const sideSpeed = Vector3.Dot(vel, right);
            const sideFrictionMultiplier = 1.0 + Math.abs(currentSpeed) / this.moveSpeed * 0.5;
            // Используем переиспользуемый вектор для силы
            forceVec.copyFrom(right);
            forceVec.scaleInPlace(-sideSpeed * 13000 * sideFrictionMultiplier);
            body.applyForce(forceVec, pos);
            
            // --- 6. ENHANCED DRAG ---
            if (Math.abs(this.throttleTarget) < 0.05) {
                const sideVel = Vector3.Dot(vel, right);
                const sideDrag = -sideVel * 8000;
                forceVec.copyFrom(right);
                forceVec.scaleInPlace(sideDrag);
                body.applyForce(forceVec, pos);
                
                const fwdVel = Vector3.Dot(vel, forward);
                const fwdDrag = -fwdVel * 7000;
                forceVec.copyFrom(forward);
                forceVec.scaleInPlace(fwdDrag);
                body.applyForce(forceVec, pos);
                
                const angularDrag = -angVel.y * 5000;
                torqueVec.set(0, angularDrag, 0);
                this.applyTorque(torqueVec);
            }
            
            // --- ANTI-FLY: Clamp vertical velocity ---
            // Боты не должны летать - ограничиваем вертикальную скорость
            if (vel.y > 4) {
                body.setLinearVelocity(new Vector3(vel.x, 4, vel.z));
            }
            // УЛУЧШЕНО: Ограничиваем максимальную высоту с учетом groundHeight (было фиксированное 2.5)
            const absoluteMaxHeight = groundHeight + 2.5; // Используем groundHeight вместо фиксированного значения
            if (pos.y > absoluteMaxHeight) {
                // Сильная сила вниз (увеличена с -30000 до -50000 для более быстрого возврата)
                const heightDiff = absoluteMaxHeight - pos.y;
                const dropForce = heightDiff * 40000; // Динамическая сила в зависимости от высоты
                
                
                this._tmpUp!.set(0, dropForce, 0);
                body.applyForce(this._tmpUp!, pos);
            }
            
            // --- Auto reset if fallen (Enhanced detection) ---
            const isFallen = pos.y < -10 || up.y < 0.3 || Math.abs(tiltX) > 1.0 || Math.abs(tiltZ) > 1.0;
            const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.5;
            
            if (isFallen || isStuck) {
                this.reset();
            }
            
            // --- ANTI-STUCK CHECK ---
            this.checkAndFixStuck();
            
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
        
        const groundY = pick && pick.hit && pick.pickedPoint ? pick.pickedPoint.y : 0;
        const heightAboveGround = pos.y - groundY;
        
        // Если высота над землёй > 4 единиц - сбрасываем (но не реагируем на холмы)
        if (heightAboveGround > 4.0) {
            logger.debug(`[EnemyTank ${this.id}] Too high above ground (height=${heightAboveGround.toFixed(2)}), resetting`);
            this.forceResetToGround();
            this.consecutiveStuckCount = 0;
            this.stuckTimer = now;
            return true;
        }
        
        // Проверка 2: Летим вверх слишком быстро (анти-полёт)
        if (vel && vel.y > 8) {
            logger.debug(`[EnemyTank ${this.id}] Flying up too fast (velY=${vel.y.toFixed(2)}), clamping`);
            // Сбрасываем вертикальную скорость
            this.physicsBody.setLinearVelocity(new Vector3(vel.x, Math.min(vel.y, 2), vel.z));
            this.stuckTimer = now;
            return true;
        }
        
        // Проверка 3: Не двигаемся при попытке движения
        const moved = Vector3.Distance(pos, this.lastStuckCheckPos);
        if (moved < this.STUCK_THRESHOLD && Math.abs(this.throttleTarget) > 0.1) {
            this.consecutiveStuckCount++;
            if (this.consecutiveStuckCount >= 3) {
                logger.debug(`[EnemyTank ${this.id}] Stuck in place (moved ${moved.toFixed(2)}), forcing unstuck`);
                this.forceUnstuck();
                this.consecutiveStuckCount = 0;
                this.stuckTimer = now;
                return true;
            }
        } else {
            this.consecutiveStuckCount = 0;
        }
        
        this.lastStuckCheckPos.copyFrom(pos);
        this.stuckTimer = now;
        return false;
    }
    
    private forceResetToGround(): void {
        if (!this.chassis || !this.physicsBody) return;
        
        const pos = this.chassis.position.clone();
        
        // Используем raycast для определения правильной высоты земли
        const rayStart = new Vector3(pos.x, pos.y + 5, pos.z);
        const ray = new Ray(rayStart, Vector3.Down(), 15);
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "bullet" || meta.type === "enemyTank")) return false;
            return true;
        });
        
        if (pick && pick.hit && pick.pickedPoint) {
            pos.y = pick.pickedPoint.y + this.hoverHeight;
        } else {
            pos.y = this.hoverHeight; // Fallback на стандартную высоту
        }
        
        // Сбрасываем скорости БЕЗ агрессивных импульсов
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());
        
        // Телепортируем на правильную высоту
        this.chassis.position.copyFrom(pos);
        this.chassis.rotationQuaternion = Quaternion.Identity();
        
        // Синхронизируем physics body с мешем
        this.physicsBody.setTargetTransform(pos, Quaternion.Identity());
        
        // НЕ сбрасываем цели движения - пусть бот продолжает патруль
    }
    
    private forceUnstuck(): void {
        if (!this.chassis || !this.physicsBody) return;
        
        // Try to reverse first - go backwards
        this.throttleTarget = -0.8;
        this.steerTarget = (Math.random() - 0.5) * 1.5;
        
        // Сбрасываем текущую скорость для предотвращения накопления
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        
        // Мягкий импульс назад (уменьшен с 5000)
        const backward = this.chassis.getDirection(Vector3.Backward());
        this.physicsBody.applyImpulse(backward.scale(2000), this.chassis.absolutePosition);
        
        // Change obstacle avoidance direction
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
        // Генерируем маршрут патрулирования по ВСЕЙ карте
        // Боты должны выезжать из гаража и ездить везде!
        
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
            
            // Ограничиваем карту
            const clampedX = Math.max(-400, Math.min(400, x));
            const clampedZ = Math.max(-400, Math.min(400, z));
            
            otherPoints.push(new Vector3(clampedX, center.y, clampedZ));
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
        
        // Priority 1: Retreat only at CRITICAL health (было 15%, теперь 10%)
        if (healthPercent < 0.10) {
            this.state = "retreat";
            this.stateTimer = 4000;
            return;
        }
        
        // Priority 2: Evade if taking heavy damage (было 40%, теперь 25%)
        if (healthPercent < 0.25 && distance < 20) {
            if (Math.random() < 0.4) {
                this.state = "evade";
                this.stateTimer = 1500;
                // Выбираем направление уклонения
                const angle = Math.random() * Math.PI * 2;
                this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
                return;
            }
        }
        
        // Priority 3: In range - attack or flank (УЛУЧШЕННАЯ логика с групповым поведением)
        if (distance < this.range) {
            // УЛУЧШЕНО: Более умный выбор тактики с учётом большего количества факторов
            const shouldFlank = distance > 25 && distance < this.optimalRange * 1.5 && healthPercent > 0.4;
            const shouldAggressiveAttack = targetHealthPercent < 0.5 && healthPercent > targetHealthPercent;
            
            // УЛУЧШЕНО: Групповая координация - если союзники уже атакуют, больше шанс фланга
            const allyCount = this.getNearbyAllyCount();
            const hasAlliesAttacking = this.hasAlliesAttackingTarget();
            
            // Увеличиваем шанс фланга для более тактичного поведения
            let flankChance = shouldFlank ? 0.45 : 0.25; // УВЕЛИЧЕНО с 0.35/0.20
            
            // УЛУЧШЕНО: Если есть союзники, которые атакуют - увеличиваем шанс фланга для окружения
            if (hasAlliesAttacking && allyCount > 0) {
                flankChance = Math.min(0.7, flankChance + 0.2); // До 70% шанс фланга при координации
            }
            
            // Если цель слабая и мы сильнее - меньше фланга, больше атаки
            if (shouldAggressiveAttack) {
                flankChance *= 0.5;
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
        const distance = Vector3.Distance(myPos, target);
        
        if (distance < 8) {
            // Достигли точки - переходим к следующей
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
            
            // УЛУЧШЕНО: Более частое обновление точек патруля для более активного патрулирования
            if (Math.random() < 0.25) {
                const newAngle = Math.random() * Math.PI * 2;
                const newDist = 120 + Math.random() * 250;
                const newX = myPos.x + Math.cos(newAngle) * newDist;
                const newZ = myPos.z + Math.sin(newAngle) * newDist;
                this.patrolPoints[this.currentPatrolIndex] = new Vector3(
                    Math.max(-400, Math.min(400, newX)),
                    myPos.y,
                    Math.max(-400, Math.min(400, newZ))
                );
            }
        } else {
            // УЛУЧШЕНО: Плавный разгон после спавна
            let patrolSpeed = 0.95;
            if (this._spawnWarmupTime < this.SPAWN_WARMUP_DURATION) {
                // Во время warmup постепенно увеличиваем скорость от 0.3 до 0.95
                const warmupProgress = this._spawnWarmupTime / this.SPAWN_WARMUP_DURATION;
                patrolSpeed = 0.3 + warmupProgress * 0.65;
                this._spawnWarmupTime += 16; // ~16ms per frame
            }
            this.driveToward(target, patrolSpeed);
        }
        
        // Плавное сканирование башни во время патруля
        const scanAngle = Math.sin(Date.now() * 0.0012) * 0.7;
        this.turretTargetAngle = scanAngle;
    }
    
    // Захват POI
    private doCapturePOI(): void {
        if (!this.targetPOI) {
            this.state = "patrol";
            return;
        }
        
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(myPos, this.targetPOI.position);
        
        if (distance > 15) {
            // Едем к POI
            this.driveToward(this.targetPOI.position, 0.7);
        } else if (distance > 8) {
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
        // Предсказываем, где будет цель через короткое время
        const predictionTime = 0.5; // 0.5 секунды вперёд
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
        
        // УЛУЧШЕНО: Более умная стрельба с лучшим выбором момента
        const canShoot = this.isAimedAtTarget() && !this.isReloading;
        
        if (canShoot) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown) {
                // УЛУЧШЕНО: Более умная логика стрельбы
                // Стреляем почти всегда, но с учётом ситуации
                let shouldFire = false;
                
                // Высокий приоритет: цель слабая или мы в преимуществе
                if (targetHealthPercent < 0.6 || healthPercent > 0.5) {
                    shouldFire = true;
                }
                // Средний приоритет: хорошая позиция или цель движется предсказуемо
                else if (distance < this.optimalRange * 1.2 || this.targetVelocity.length() < 8) {
                    shouldFire = Math.random() < 0.95; // 95% шанс
                }
                // Низкий приоритет: дальняя или быстрая цель
                else {
                    shouldFire = Math.random() < 0.85; // 85% шанс
                }
                
                if (shouldFire) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
        }
        
        // УЛУЧШЕНО: Более активные и умные микро-манёвры (ИСПРАВЛЕНО: без накопления для плавности)
        // УБРАНО накопление для предотвращения дёргания - микро-маневры применяются только при оптимальной дистанции
        // Микро-маневры теперь встроены в логику поддержания дистанции ниже
        
        // === АГРЕССИВНОЕ СБЛИЖЕНИЕ при преимуществе HP ===
        if (healthPercent > 0.6 && targetHealthPercent < 0.4) {
            // Добить раненую цель - приближаемся агрессивно!
            this.driveToward(targetPos, 0.8);
            return;
        }
        
        // Улучшенное поддержание оптимальной дистанции (с плавным переходом для предотвращения дёргания)
        let newThrottle: number;
        let newSteer: number;
        
        if (distance < this.optimalRange * 0.4) {
            // Слишком близко - отступаем быстрее с зигзагом
            newThrottle = -0.7;
            newSteer = Math.sin(this._tick * 0.04) * 0.5;
        } else if (distance < this.optimalRange * 0.7) {
            // Близко - активный зигзаг
            newThrottle = -0.3;
            newSteer = Math.sin(this._tick * 0.03) * 0.4;
        } else if (distance > this.optimalRange * 1.4) {
            // Слишком далеко - быстро приближаемся (используем driveToward для плавности)
            this.driveToward(targetPos, 0.7);
            return; // driveToward уже установил throttleTarget и steerTarget плавно
        } else if (distance > this.optimalRange * 1.1) {
            // Немного далеко - приближаемся (используем driveToward для плавности)
            this.driveToward(targetPos, 0.4);
            return; // driveToward уже установил throttleTarget и steerTarget плавно
        } else {
            // Оптимальная дистанция - активное маневрирование
            const strafeSpeed = healthPercent > 0.5 ? 0.5 : 0.3;
            newThrottle = Math.sin(this._tick * 0.02) * strafeSpeed;
            newSteer = Math.cos(this._tick * 0.025) * 0.5;
        }
        
        // КРИТИЧНО: Исправленная логика плавного изменения - сначала вычисляем желаемое изменение, затем ограничиваем его
        const oldThrottle = this.throttleTarget;
        const oldSteer = this.steerTarget;
        const maxStateChange = 0.12; // УМЕНЬШЕНО с 0.2 до 0.12 для максимальной плавности
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
        
        // УЛУЧШЕНО: Более умное вычисление позиции фланга
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        // Perpendicular direction
        const perpendicular = new Vector3(toTarget.z * this.flankDirection, 0, -toTarget.x * this.flankDirection);
        
        // УЛУЧШЕНО: Динамическое расстояние фланга в зависимости от дистанции до цели
        const distance = Vector3.Distance(targetPos, myPos);
        const flankDistance = Math.min(20, Math.max(12, distance * 0.4)); // Адаптивное расстояние
        const flankPos = myPos.clone().add(perpendicular.scale(flankDistance));
        
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
    
    // === MOVEMENT ===
    
    private driveToward(targetPos: Vector3, speedMult: number): void {
        const pos = this.chassis.absolutePosition;
        let direction = targetPos.subtract(pos);
        direction.y = 0;
        
        if (direction.length() < 0.5) {
            this.throttleTarget = 0;
            this.steerTarget = 0;
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
        
        // КРИТИЧНО: Исправленная логика плавного изменения - сначала вычисляем желаемое изменение, затем ограничиваем его
        const desiredSteerChange = targetSteer - this.steerTarget;
        const maxSteerChangePerFrame = 0.15; // УМЕНЬШЕНО с 0.3 до 0.15 для максимальной плавности
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
        // КРИТИЧНО: Исправленная логика плавного изменения - сначала вычисляем желаемое изменение, затем ограничиваем его
        const oldThrottleTarget = this.throttleTarget;
        const desiredThrottleChange = newThrottle - this.throttleTarget;
        const maxThrottleChangePerFrame = 0.12; // УМЕНЬШЕНО с 0.25 до 0.12 для максимальной плавности
        const clampedThrottleChange = Math.max(-maxThrottleChangePerFrame, Math.min(maxThrottleChangePerFrame, desiredThrottleChange));
        this.throttleTarget = Math.max(-1, Math.min(1, this.throttleTarget + clampedThrottleChange));
        
    }
    
    // === AIMING ===
    
    private aimAtTarget(): void {
        if (!this.target || !this.target.chassis) return;
        
        const targetPos = this.target.chassis.absolutePosition.clone();
        const myPos = this.chassis.absolutePosition;
        
        // === УЛУЧШЕННОЕ ПРЕДСКАЗАНИЕ: Более точное упреждение цели! ===
        const distance = Vector3.Distance(targetPos, myPos);
        const bulletSpeed = 240; // Approximate bullet speed (doubled)
        const flightTime = distance / bulletSpeed;
        
        // УЛУЧШЕНО: Более точное предсказание с учётом ускорения цели
        // Используем 85% предсказания вместо 70% для лучшей точности
        const predictionFactor = 0.85;
        const predictedPos = targetPos.add(this.targetVelocity.scale(flightTime * predictionFactor));
        
        // УЛУЧШЕНО: Уменьшен разброс для более точной стрельбы
        if (this.aimAccuracy < 1.0) {
            const spread = (1 - this.aimAccuracy) * distance * 0.06; // УМЕНЬШЕНО с 0.1 до 0.06
            predictedPos.x += (Math.random() - 0.5) * spread;
            predictedPos.z += (Math.random() - 0.5) * spread;
            // Добавляем небольшую вертикальную коррекцию для движущихся целей
            if (this.targetVelocity.length() > 5) {
                predictedPos.y += (Math.random() - 0.5) * spread * 0.3;
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
        body.setMassProperties({ mass: 15 });
        body.setLinearDamping(0.01);
        
        // Fire in BARREL direction!
        body.applyImpulse(barrelDir.scale(3000), ball.position);
        
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
        
        if (this.chassis && !this.chassis.isDisposed()) {
            this.chassis.dispose();
        }
        if (this.hpBillboard && !this.hpBillboard.isDisposed()) {
            this.hpBillboard.dispose();
        }
        this.onDeathObservable.clear();
    }
    
    // УЛУЧШЕНО: Обновление информации о близких союзниках
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
    }
    
    // УЛУЧШЕНО: Получить количество близких союзников
    private getNearbyAllyCount(): number {
        return this.nearbyEnemies.length;
    }
    
    // УЛУЧШЕНО: Проверка, есть ли союзники, которые уже атакуют цель
    private hasAlliesAttackingTarget(): boolean {
        if (!this.target) return false;
        
        for (const ally of this.nearbyEnemies) {
            if (ally.target === this.target && ally.state === "attack") {
                return true;
            }
        }
        return false;
    }
    
    // УЛУЧШЕНО: Поиск укрытия (здания, препятствия)
    private findCoverPosition(): Vector3 | null {
        if (!this.target || !this.target.chassis) return null;
        
        const myPos = this.chassis.absolutePosition;
        const targetPos = this.target.chassis.absolutePosition;
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
    
    // УЛУЧШЕНО: Анализ стиля игры игрока
    private updatePlayerStyle(): void {
        const now = Date.now();
        if (now - this.lastStyleUpdateTime < this.STYLE_UPDATE_INTERVAL) return;
        this.lastStyleUpdateTime = now;
        
        if (!this.target || !this.target.chassis || this.playerStyleSamples.length < 5) return;
        
        // Анализируем среднее расстояние до игрока
        const avgDistance = this.playerStyleSamples.reduce((a, b) => a + b, 0) / this.playerStyleSamples.length;
        
        // Агрессивный: часто близко (< 30м)
        // Оборонительный: часто далеко (> 50м)
        // Сбалансированный: средние дистанции
        
        if (avgDistance < 30) {
            this.playerStyle = "aggressive";
        } else if (avgDistance > 50) {
            this.playerStyle = "defensive";
        } else {
            this.playerStyle = "balanced";
        }
        
        // Очищаем старые данные
        this.playerStyleSamples = [];
    }
    
    // УЛУЧШЕНО: Реакция на получение урона
    onDamageReceived(damage: number): void {
        const now = Date.now();
        this.lastDamageTime = now;
        this.consecutiveHits++;
        
        // Если получили много урона подряд - более агрессивная реакция
        if (this.consecutiveHits > 2) {
            this.damageReactionCooldown = 2000; // 2 секунды реакции
            // Принудительно переключаемся на уклонение или отступление
            if (this.state === "attack" && this.currentHealth / this.maxHealth < 0.4) {
                this.state = "evade";
                this.stateTimer = 2000;
            }
        }
        
        // Сбрасываем счётчик через 3 секунды
        setTimeout(() => {
            if (Date.now() - this.lastDamageTime > 3000) {
                this.consecutiveHits = 0;
            }
        }, 3000);
    }
    
    // УЛУЧШЕНО: Поиск возвышенности для лучшей позиции
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
