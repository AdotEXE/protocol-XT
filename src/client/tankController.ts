import {
    Scene,
    Vector3,
    Mesh,
    MeshBuilder,
    PhysicsBody,
    PhysicsMotionType,
    PhysicsShape,
    PhysicsShapeType,
    PhysicsShapeContainer,
    Quaternion,
    StandardMaterial,
    Color3,
    ActionManager,
    Ray,
    Matrix,
    AbstractMesh,
    LinesMesh,
    CreateLines
} from "@babylonjs/core";
import { HUD } from "./hud";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import type { EnemyManager } from "./enemy";
import { EnemyTank } from "./enemyTank";
import { logger, tankLogger, combatLogger, physicsLogger, LogLevel, LogCategory, loggingSettings } from "./utils/logger";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "./tankTypes";
import { getTrackById, type TrackType } from "./trackTypes";
import { TankHealthModule } from "./tank/tankHealth";
import { TankMovementModule } from "./tank/tankMovement";
import { TankProjectilesModule } from "./tank/tankProjectiles";
import { TankVisualsModule } from "./tank/tankVisuals";
import { TankEquipmentModule } from "./tank/tankEquipment";
import type { ChassisAnimationElements } from "./tank/tankChassis";
import { CHASSIS_SIZE_MULTIPLIERS } from "./tank/tankChassis";
import type { ShellCasing } from "./tank/types";
import { getSkinById, loadSelectedSkin, applySkinToTank, applySkinColorToMaterial } from "./tank/tankSkins";
import { PHYSICS_CONFIG } from "./config/physicsConfig";
import { tankDuplicationLogger } from "./tankDuplicationLogger";
import { RicochetSystem, RicochetConfig, RICOCHET_CANNON_CONFIG, DEFAULT_RICOCHET_CONFIG } from "./tank/combat/RicochetSystem";
import { upgradeManager, UpgradeBonuses } from "./upgrade";
import { ClientMessageType } from "../shared/messages";
import { createClientMessage } from "../shared/protocol";
import { isMobileDevice } from "./mobile/MobileDetection";
import { timerManager } from "./optimization/TimerManager";
import { vector3Pool } from "./optimization/Vector3Pool";
import { updateTrajectoryLine } from "./tank/tankTrajectoryVisualization";

export class TankController {
    scene: Scene;
    public isMovementEnabled: boolean = true;
    public onShootCallback: ((data: any) => void) | null = null;
    chassis!: Mesh;
    turret!: Mesh;
    barrel!: Mesh;
    physicsBody!: PhysicsBody;
    hud: HUD | null = null;
    soundManager: SoundManager | null = null;
    effectsManager: EffectsManager | null = null;
    enemyManager: EnemyManager | null = null;
    enemyTanks: any[] = []; // Reference to enemy tanks for hit detection

    // Callback for camera shake
    cameraShakeCallback: ((intensity: number) => void) | null = null;
    chatSystem: any = null; // ChatSystem для сообщений
    experienceSystem: any = null; // ExperienceSystem для опыта
    playerProgression: any = null; // PlayerProgressionSystem для глобального прогресса
    achievementsSystem: any = null; // AchievementsSystem для достижений

    // Callback для получения позиции респавна (гараж)
    respawnPositionCallback: (() => Vector3 | null) | null = null;
    // Callback to request server-side respawn
    public onRespawnRequest: (() => void) | null = null;

    // Reference to network players for hit detection
    networkPlayers: Map<string, any> | null = null; // NetworkPlayerTank instances

    // Callback for reporting network player hits (client-authoritative)
    private onNetworkPlayerHitCallback: ((targetId: string, damage: number, hitPosition: Vector3, cannonType: string) => void) | null = null;

    // =========================================================================
    // МУЛЬТИПЛЕЕР: Флаг для отключения локальной физики движения
    // Когда включён - танк НЕ двигается от локального input, а только интерполирует к серверу
    // =========================================================================
    isMultiplayerMode: boolean = false;

    // =========================================================================
    // ЧИТЫ: Флаги для читов
    // =========================================================================
    flyMode: boolean = false; // Режим полёта - Q вверх, E вниз, отключает гравитацию

    // =========================================================================
    // DEBUG: Флаг для отображения траектории снаряда (красным цветом)
    // =========================================================================
    public showProjectileTrajectory: boolean = true; // По умолчанию ВКЛ
    private trajectoryLine: LinesMesh | null = null; // Визуализация траектории
    private trajectoryLines: Mesh[] = []; // Линии траектории
    private trajectoryFrameCounter: number = 0; // Счётчик кадров для оптимизации
    private trajectoryTimeoutIds: number[] = []; // ID таймеров для очистки при dispose

    // Респавн с таймером
    private respawnCountdown = 0; // Секунды до респавна
    private respawnIntervalId: string | null = null;

    /**
     * Очищает все таймеры и интервалы для предотвращения утечек памяти
     * Публичный метод для вызова из Game.stopGame()
     */
    public cleanupTimers(): void {
        // Останавливаем интервал респавна
        if (this.respawnIntervalId !== null) {
            timerManager.clear(this.respawnIntervalId);
            this.respawnIntervalId = null;
        }

        // Очищаем все таймауты
        this.tankTimeouts.forEach(id => clearTimeout(id));
        this.tankTimeouts = [];

        // Очищаем таймауты траекторий
        this.trajectoryTimeoutIds.forEach(id => clearTimeout(id));
        this.trajectoryTimeoutIds = [];

        // Очищаем таймауты модулей
        if (this.module7Timeout !== null) {
            clearTimeout(this.module7Timeout);
            this.module7Timeout = null;
        }
        if (this.module8Timeout !== null) {
            clearTimeout(this.module8Timeout);
            this.module8Timeout = null;
        }
    }

    // Модули
    private healthModule: TankHealthModule;
    private movementModule: TankMovementModule;
    private projectilesModule: TankProjectilesModule;
    private visualsModule: TankVisualsModule;
    public equipment: TankEquipmentModule;

    // Эффекты движения
    private _lastMovementSoundTime: number = 0;
    private _lastSmokeTime: number = 0;

    // Special chassis abilities
    chassisAnimationElements: ChassisAnimationElements & {
        stealthActive?: boolean;
        shieldActive?: boolean;
        energyBoosters?: Mesh[];
    } = { animationTime: 0 };

    // ============================================
    // TRIGGER SYSTEM
    // ============================================
    private _lastTriggerCheck: number = 0;
    private _cachedTriggerMeshes: AbstractMesh[] = [];
    private _triggerCacheDirty: boolean = true; // Flag to rebuild cache periodically

    // ============================================
    // CHASSIS ACCELERATION TILT (Visual Feedback)
    // ============================================
    private _lastThrottleInput: number = 0;
    private _tiltTimer: number = 0;
    private readonly TILT_DURATION: number = 1000; // ms (Increased for prolonged rocking)
    private _targetTiltTorque: number = 0;

    // ============================================
    // SECONDARY STATS (Modules & Progression)
    // ============================================
    public critChance: number = 0;       // % (0-100)
    public evasion: number = 0;          // % (0-100)
    public repairRate: number = 0;       // HP/sec
    public fuelEfficiencyBonus: number = 0; // % reduction (0-100)

    // Special ability cooldowns
    private stealthCooldown = 0;
    private shieldCooldown = 0;
    private droneCooldown = 0;
    private commandCooldown = 0;

    // Отдача при выстреле
    private barrelRecoilOffset = 0; // Текущий откат пушки (0 = норма, <0 = откат назад)
    private barrelRecoilTarget = 0; // Целевой откат
    barrelRecoilSpeed = 0.3; // Скорость возврата пушки
    barrelRecoilAmount = -1.6; // Величина отката пушки (увеличено в 4 раза от оригинала)
    recoilForce = PHYSICS_CONFIG.shooting.recoil.force; // HEAVY & RESPONSIVE: Сила отдачи из конфига
    recoilTorque = PHYSICS_CONFIG.shooting.recoil.torque; // Сила угловой отдачи
    private _baseBarrelZ = 0; // Исходная позиция Z пушки
    private _baseBarrelY = 0; // Исходная позиция Y пушки
    private _barrelRecoilY = 0; // Вертикальный откат пушки (подъем при выстреле)
    private _barrelRecoilYTarget = 0; // Целевой вертикальный откат

    // Массив активных гильз для анимации
    shellCasings: ShellCasing[] = [];

    // Cannon animation elements (for animated cannons)
    private cannonAnimationElements: {
        sniperLens?: Mesh;
        gatlingBarrels?: Mesh[];
        gatlingPowerBlock?: Mesh;
        teslaCoils?: Mesh[];
        teslaGen?: Mesh;
        plasmaCore?: Mesh;
        plasmaCoils?: Mesh[];
        laserLens?: Mesh;
        laserRings?: Mesh[];
        railgunCapacitors?: Mesh[];
        vortexRings?: Mesh[];
        vortexGen?: Mesh;
        supportEmitter?: Mesh;
        supportRings?: Mesh[];
        supportHealingRings?: Mesh[];
        repairGen?: Mesh;
        // All other cannons for animations
        rocketTube?: Mesh;
        rocketGuides?: Mesh[];
        mortarBase?: Mesh;
        mortarLegs?: Mesh[];
        clusterTubes?: Mesh[];
        clusterCenterTube?: Mesh;
        acidTank?: Mesh;
        acidSprayer?: Mesh;
        freezeFins?: Mesh[];
        cryoTank?: Mesh;
        poisonInjector?: Mesh;
        empDish?: Mesh;
        empCoils?: Mesh[];
        empGen?: Mesh;
        multishotBarrels?: Mesh[];
        multishotConnector?: Mesh;
        shotgunBarrels?: Mesh[];
        homingGuidance?: Mesh;
        homingAntennas?: Mesh[];
        piercingTip?: Mesh;
        piercingConduits?: Mesh[];
        shockwaveAmp?: Mesh;
        shockwaveEmitters?: Mesh[];
        beamFocuser?: Mesh;
        beamLenses?: Mesh[];
        beamConduits?: Mesh[];
        flamethrowerNozzle?: Mesh;
        animationTime?: number;
    } = { animationTime: 0 };

    // Tank type configuration
    chassisType!: ChassisType;
    cannonType!: CannonType;
    trackType!: TrackType;

    // Config (будут переопределены типом корпуса)
    mass = 3500; // Масса танка в кг
    hoverHeight = 1.0;  // Hover height

    // Movement Settings (будут переопределены типом корпуса)
    moveSpeed = 24;         // Slower max speed
    turnSpeed = 5.0;        // Moderate turning
    acceleration = 40000;    // СКРУГЛЁННЫЕ ГУСЕНИЦЫ: +143% для преодоления ЛЮБЫХ препятствий
    turnAccel = 11000;      // Угловое ускорение поворота
    stabilityTorque = 2000; // Стабилизация при повороте на скорости
    yawDamping = 4500;      // Демпфирование рыскания
    sideFriction = 17000;   // Боковое трение
    sideDrag = 8000;        // Боковое сопротивление при остановке
    fwdDrag = 7000;         // Продольное сопротивление при остановке
    angularDrag = 5000;     // Угловое сопротивление при остановке

    // Stability
    hoverStiffness = 4000;   // SOFTER SUSPENSION: Reduced from 7000 allows more travel
    hoverDamping = 6000;    // REDUCED DAMPING: Reduced from 18000 allows more oscillation (rocking)
    uprightForce = 12000;    // Стабилизация на склонах
    uprightDamp = 8000;     // Демпфирование наклона
    stabilityForce = 3000;  // Стабильность
    emergencyForce = 18000; // Экстренные ситуации
    liftForce = 0;          // Отключено для предотвращения взлета
    downForce = 1500;       // СКРУГЛЁННЫЕ ГУСЕНИЦЫ: -75% минимальное прижатие для свободного подъёма

    // СИСТЕМА "СКРУГЛЁННЫЕ ГУСЕНИЦЫ" - РАЗУМНАЯ ПРОХОДИМОСТЬ (уменьшено для предотвращения взбирания по стенам)
    climbAssistForce = 40000;    // Уменьшено с 120000 - разумный автоподъём для склонов
    maxClimbHeight = 1.5;        // Уменьшено с 3.0 - до 1.5 метров (реалистично для танка)
    slopeBoostMax = 1.8;         // Уменьшено с 2.5 - умеренная тяга на склонах
    frontClimbForce = 60000;     // Уменьшено с 180000 - сила подъёма передней части
    wallPushForce = 25000;       // Уменьшено с 80000 - сила проталкивания
    climbTorque = 12000;         // Уменьшено с 25000 - момент для наклона при подъёме

    // ВЕРТИКАЛЬНЫЕ СТЕНЫ - система прилипания и горизонтального движения
    verticalWallThreshold = 0.34; // sin(70°) ≈ 0.34 - порог для определения вертикальной стены
    wallAttachmentForce = 15000; // Сила прилипания к стене (направлена к стене) - уменьшено для более плавного поведения
    wallAttachmentDistance = 2.0; // Максимальное расстояние для прилипания - уменьшено
    wallFrictionCoefficient = 0.8; // Коэффициент трения для горизонтального движения
    wallSlideGravityMultiplier = 1.2; // Множитель гравитации для соскальзывания - уменьшено
    wallMinHorizontalSpeed = 0.5; // Минимальная горизонтальная скорость для предотвращения соскальзывания - увеличено
    wallAttachmentSmoothing = 0.2; // Плавность перехода в режим прилипания (0-1) - увеличено для плавности
    wallBaseAttachmentForce = 8000; // Базовая сила прилипания (работает всегда, не зависит от throttle)

    // Health System (будет переопределено типом корпуса)
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;

    // Fuel System
    maxFuel = 500; // Литров
    currentFuel = 500;
    fuelConsumptionRate = 0.5; // Литров в секунду при движении
    isFuelEmpty = false;

    // Shooting (будет переопределено типом пушки)
    damage = 25; // Базовый урон

    // КРИТИЧНО: Сохранённые характеристики в начале боя (НЕ должны изменяться после смерти!)
    private _initialMaxHealth: number = 0;
    private _initialMoveSpeed: number = 0;
    private _initialTurnSpeed: number = 0;
    private _initialDamage: number = 0;
    private _initialCooldown: number = 0;
    private _initialProjectileSpeed: number = 0;
    private _initialTurretSpeed: number = 0;
    private _initialBaseTurretSpeed: number = 0;
    private _characteristicsInitialized: boolean = false;

    // Tracer System (T key)
    tracerCount = 5; // Количество трассеров
    maxTracerCount = 5; // Максимум трассеров
    tracerDamage = 10; // Урон трассера (меньше обычного)
    tracerMarkDuration = 15000; // Время метки на враге (15 секунд)
    private tracerMat: StandardMaterial | null = null; // Материал трассера (яркий)
    // ОПТИМИЗАЦИЯ: Массив для ручного обновления движения трассеров (без физики)
    private manualProjectiles: { mesh: Mesh, velocity: Vector3, intervalId?: number, timeoutId?: number }[] = [];

    // State
    private _tmpVector = new Vector3();
    private _tmpVector2 = new Vector3();
    private _tmpVector3 = new Vector3();
    private lastPhysicsErrorMs = 0;
    private _tmpVector4 = new Vector3();
    private _tmpVector5 = new Vector3(); // For torque scaling to avoid mutations
    private _tmpVector6 = new Vector3(); // For hoverForceVec (to avoid corrupting up)
    private _tmpVector7 = new Vector3(); // For correctiveTorque (to avoid corrupting forward)
    private _tmpVector8 = new Vector3(); // For projectile previous position
    private _tmpVector9 = new Vector3(); // For projectile current position
    private _cachedRedColor = new Color3(1, 0, 0); // Кэшированный красный цвет для траектории

    // Position caching for performance optimization
    private _cachedChassisPosition = new Vector3();
    private _cachedTurretPosition: Vector3 | null = null;
    private _cachedBarrelPosition: Vector3 | null = null;
    private _positionCacheFrame = -1; // Frame number when cache was last updated

    // Кэш для scene.meshes.filter - очень дорогая операция
    private _cachedEnemyWalls: AbstractMesh[] | null = null;
    private _enemyWallsCacheFrame = -1;

    // Кэш для Date.now() и performance.now() - оптимизация частых вызовов
    private _cachedTime: number = 0;
    private _timeCacheFrame = -1;

    private _resetTimer: number = 0; // Таймер для автоматического сброса при опрокидывания
    private _logFrameCounter = 0; // Счетчик кадров для логирования

    // Ground clamping cache
    private _groundRaycastCache: { groundHeight: number, frame: number } | null = null;
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию для производительности
    private _tick = 0;

    // Vertical wall climbing state
    private _isOnVerticalWall: boolean = false; // Флаг состояния "на вертикальной стене"
    private _wallNormal: Vector3 | null = null; // Нормаль текущей стены (кэшируется)
    private _wallDistance: number = 0; // Расстояние до стены
    private _wallHitPoint: Vector3 | null = null; // Точка контакта со стеной

    // Inputs (smoothed)
    throttleTarget = 0;
    steerTarget = 0;
    smoothThrottle = 0;
    smoothSteer = 0;
    turretTurnTarget = 0;
    turretTurnSmooth = 0;
    private turretAcceleration = 0; // Прогрессивный разгон башни (0-1, за 1 секунду)
    private turretAccelStartTime = 0; // Время начала ускорения башни
    isAutoCentering = false; // Флаг автоматического центрирования башни (публичный для game.ts)
    isKeyboardTurretControl = false; // Флаг клавиатурного управления башней (Z/X)

    // Скорость вращения башни (публичная для game.ts)
    turretSpeed = 0.08; // Базовая скорость вращения башни (рад/кадр) - УВЕЛИЧЕНО для более быстрого поворота
    baseTurretSpeed = 0.08; // Базовая скорость башни для центрирования - УВЕЛИЧЕНО
    turretLerpSpeed = 0.25; // Резкая реакция башни

    // Barrel pitch control (vertical tilt of barrel) - keyboard R/F
    barrelPitchTarget = 0; // Целевое направление наклона ствола (-1, 0, +1)
    barrelPitchSmooth = 0; // Сглаженное значение для интерполяции
    private _barrelCurrentRotationX = 0; // Текущий rotation.x ствола (для плавной интерполяции)
    private _barrelTargetRotationX = 0; // Целевой rotation.x ствола (для плавной интерполяции)
    private _barrelRotationXSmoothing = 0.15; // Коэффициент сглаживания для rotation.x ствола
    private barrelPitchAcceleration = 0; // Прогрессивный разгон наклона ствола (0-1, за 1 секунду)
    private barrelPitchAccelStartTime = 0; // Время начала ускорения наклона ствола
    baseBarrelPitchSpeed = 0.002; // УВЕЛИЧЕНО с 0.00035 для быстрой вертикальной наводки (~6x быстрее)
    barrelPitchLerpSpeed = 0.35; // УВЕЛИЧЕНО с 0.2: Более отзывчивая интерполяция наклона ствола

    // Aiming pitch (vertical angle for aiming) - set from game.ts
    aimPitch = 0;

    // Mouse control for turret
    mouseSensitivity = 0.003; // Чувствительность мыши для башни (публичная для game.ts)
    private isPointerLocked = false; // Флаг блокировки указателя
    private lastMouseX = 0; // Последняя позиция мыши X (используется в pointerlockchange handler)

    // Control settings (applied from SettingsManager)
    invertMouseY = false; // Инверсия вертикальной оси мыши
    autoReload = false; // Автоматическая перезарядка
    holdToAim = false; // Удерживать для прицеливания (вместо toggle)

    // Shooting (будут переопределены типом пушки)
    lastShotTime = 0;
    cooldown = 1800; // УЛУЧШЕНО: Уменьшено с 2000 до 1800 мс для более быстрой перезарядки
    baseCooldown = 2000; // Базовый cooldown для модулей
    isReloading = false;
    projectileSpeed = 200;
    projectileSize = 0.2;

    // Автоматическая стрельба при зажатии кнопки
    private isFireKeyPressed = false; // Пробел зажат
    private isMouseButtonPressed = false; // ЛКМ зажата

    // Модули (кнопки 6-0)
    private module6Walls: Array<{
        mesh: Mesh;
        physics: PhysicsBody | null;
        timeout: number;
        health: number;
        maxHealth: number;
    }> = []; // Массив активных защитных стенок (кнопка 6)
    private readonly MAX_WALLS = 10; // Максимальное количество активных стенок
    private readonly WALL_MAX_HEALTH = 100; // Максимальное HP стенки
    private module6Cooldown = 10000; // Кулдаун модуля 6 (10 секунд)
    private module6LastUse = 0; // Время последнего использования модуля 6
    private module7Active = false; // Ускоренная стрельба (кнопка 7)
    private module7Timeout: number | null = null; // Используется в setTimeout callback
    private module7Cooldown = 15000; // Кулдаун модуля 7 (15 секунд)
    private module7LastUse = 0; // Время последнего использования модуля 7
    private module8Active = false; // Автонаводка + автострельба (кнопка 8)
    private module8Timeout: number | null = null; // Используется в setTimeout callback
    private module8Cooldown = 20000; // Кулдаун модуля 8 (20 секунд)
    private module8LastUse = 0; // Время последнего использования модуля 8
    private module8LastAutoFire = 0; // Время последнего автострельбы

    // УПРАВЛЕНИЕ ТАЙМЕРАМИ (для предотвращения утечек памяти)
    private tankTimeouts: NodeJS.Timeout[] = []; // Одноразовые задержки для логики танка
    // Модуль 9: Платформа (поднимающаяся платформа под танком)
    private module9Active = false; // Платформа существует
    private module9Platform: Mesh | null = null; // Меш платформы
    private module9PlatformPhysics: PhysicsBody | null = null; // Физика платформы
    private module9StartTime = 0; // Время начала подъёма
    private module9CurrentY = 0; // Текущая высота платформы
    private module9GroundY = 0; // Высота поверхности
    private module9Cooldown = 15000; // Кулдаун модуля 9 (15 секунд)
    private module9LastUse = 0; // Время последнего использования модуля 9
    private module9ReleaseTime = 0; // Время отпускания кнопки
    private module9State: "idle" | "rising" | "staying" | "falling" = "idle"; // Состояние платформы
    private readonly MODULE9_MAX_DURATION = 10000; // Максимальная длительность подъёма (10 секунд)
    private readonly MODULE9_LIFT_SPEED = 3; // Скорость подъёма (метров в секунду)
    private readonly MODULE9_FALL_SPEED = 5; // Скорость опускания (метров в секунду)
    private readonly MODULE9_MAX_HEIGHT = 30; // Максимальная высота подъёма (30 метров)
    private readonly MODULE9_STAY_DURATION = 3000; // Время удержания после отпускания (3 секунды)
    private module0Charging = false; // Прыжок с зажатием (кнопка 0)
    private module0ChargeStart = 0; // Время начала зарядки
    private module0ChargePower = 0; // Накопленная сила прыжка (используется в updateModules)
    private module0LastUse = 0; // Время последнего использования модуля 0
    private module0Cooldown = 5000; // Кулдаун модуля 0 (5 секунд)
    private canJump = true; // Прыжок (cooldown)
    private jumpCooldown = 1500; // УЛУЧШЕНО: Уменьшено с 2000 до 1500мс для более частых прыжков
    private isJumping = false; // Флаг активного прыжка
    private jumpStartTime = 0; // Время начала прыжка
    private jumpDuration = 1000; // Длительность прыжка (1 секунда)

    // Visuals
    visualWheels: Mesh[] = [];
    leftTrack: Mesh | null = null;
    rightTrack: Mesh | null = null;

    // Module visuals - визуальные меши для модулей (6-0)
    private moduleVisuals: Map<number, Mesh[]> = new Map();

    // Pre-created materials for optimization
    bulletMat: StandardMaterial;

    private _inputMap: { [key: string]: boolean } = {};
    private _lastJumpWarnTime: number = 0; // Throttle для лога "Cannot start jump"

    // Touch input (экранное управление)
    private _touchThrottle = 0;  // -1..1 газ/тормоз
    private _touchSteer = 0;     // -1..1 поворот
    private _touchTurretLeft = false;
    private _touchTurretRight = false;
    private _touchTurretRotation = 0;  // -1..1 аналоговый поворот башни
    private _touchAimPitch = 0;  // -1..1 наклон пушки
    private _touchFire = false;
    private _touchAim = false;

    // Load tank configuration from localStorage (зарезервировано для будущего использования)
    // private loadTankConfig(): { color: string, turretColor: string, speed: number, armor: number, firepower: number } {
    //     const saved = localStorage.getItem("tankConfig");
    //     if (saved) {
    //         try {
    //             return JSON.parse(saved);
    //         } catch (e) {
    //             console.error("Failed to load tank config");
    //         }
    //     }
    //     return { color: "#00ff00", turretColor: "#888888", speed: 2, armor: 2, firepower: 2 };
    // }

    constructor(scene: Scene, position: Vector3) {
        logger.log("TankController: Init Start");
        this.scene = scene;

        // КРИТИЧНО: Защита от множественного создания - проверяем, нет ли уже танка в сцене
        const existingTanks = scene.meshes.filter(mesh => {
            if (!mesh.name || mesh.isDisposed()) return false;
            return mesh.name.startsWith("tankHull_") &&
                mesh.metadata &&
                (mesh.metadata as any).type === "playerTank";
        });
        if (existingTanks.length > 0) {
            logger.error(`[TankController] WARNING: Found ${existingTanks.length} existing player tank(s) in scene! Disposing them.`);
            existingTanks.forEach((mesh, idx) => {
                logger.error(`[TankController] Existing tank ${idx}: ${mesh.name}, instance: ${(mesh.metadata as any)?.instance?.constructor?.name || 'unknown'}`);
                try {
                    // Удаляем все дочерние меши
                    if (mesh.getChildren && mesh.getChildren().length > 0) {
                        mesh.getChildren().forEach((child: any) => {
                            if (child.dispose && !child.isDisposed()) {
                                try {
                                    child.dispose();
                                } catch (e) {
                                    // Игнорируем ошибки
                                }
                            }
                        });
                    }
                    mesh.dispose();
                } catch (e) {
                    logger.error(`[TankController] Error disposing existing tank ${idx}:`, e);
                }
            });
        }

        // КРИТИЧНО: Агрессивная очистка всех старых мешей танка перед созданием новых
        // Это предотвращает дублирование танка при повторном создании
        const oldTankMeshes = scene.meshes.filter(mesh => {
            if (!mesh.name || mesh.isDisposed()) return false;
            return mesh.name.startsWith("tankHull_") ||
                mesh.name.startsWith("turret_") ||
                mesh.name.startsWith("barrel_");
        });
        if (oldTankMeshes.length > 0) {
            logger.warn(`[TankController] Found ${oldTankMeshes.length} old tank meshes, disposing them`);
            oldTankMeshes.forEach(mesh => {
                try {
                    // КРИТИЧНО: Удаляем все дочерние меши перед удалением родительского
                    if (mesh.getChildren && mesh.getChildren().length > 0) {
                        const children = mesh.getChildren();
                        children.forEach((child: any) => {
                            if (child.dispose && !child.isDisposed()) {
                                try {
                                    child.dispose();
                                } catch (e) {
                                    // Игнорируем ошибки при удалении дочерних мешей
                                }
                            }
                        });
                    }
                    mesh.dispose();
                } catch (e) {
                    // Игнорируем ошибки при удалении уже удаленных мешей
                }
            });
        }

        // КРИТИЧНО: Удаляем все старые observers, которые могут работать со старыми мешами
        // Это предотвращает дублирование при рендеринге
        if (scene.onBeforeActiveMeshesEvaluationObservable) {
            // Удаляем все observers, которые могут быть связаны со старыми мешами танка
            // К сожалению, мы не можем напрямую удалить конкретные observers без их ссылок,
            // но мы можем очистить активные меши и rendering groups перед созданием новых
            const activeMeshes = (scene as any)._activeMeshes;
            if (activeMeshes && Array.isArray(activeMeshes)) {
                // Удаляем все меши танка из активных мешей
                const tankMeshesInActive = activeMeshes.filter((mesh: any) => {
                    if (!mesh || !mesh.name) return false;
                    return mesh.name.startsWith("tankHull_") ||
                        mesh.name.startsWith("turret_") ||
                        mesh.name.startsWith("barrel_");
                });
                tankMeshesInActive.forEach((mesh: any) => {
                    const index = activeMeshes.indexOf(mesh);
                    if (index >= 0) {
                        activeMeshes.splice(index, 1);
                    }
                });
            }

            // Очищаем rendering groups от старых мешей танка
            const renderingGroups = (scene as any)._renderingGroups;
            if (renderingGroups) {
                Object.keys(renderingGroups).forEach((groupId: string) => {
                    const group = renderingGroups[groupId];
                    if (group && group.meshes && Array.isArray(group.meshes)) {
                        const tankMeshesInGroup = group.meshes.filter((mesh: any) => {
                            if (!mesh || !mesh.name) return false;
                            return mesh.name.startsWith("tankHull_") ||
                                mesh.name.startsWith("turret_") ||
                                mesh.name.startsWith("barrel_");
                        });
                        tankMeshesInGroup.forEach((mesh: any) => {
                            const index = group.meshes.indexOf(mesh);
                            if (index >= 0) {
                                group.meshes.splice(index, 1);
                            }
                        });
                    }
                });
            }
        }

        // Pre-create bullet material - VERY BRIGHT for visibility
        this.bulletMat = new StandardMaterial("bulletMat", scene);
        this.bulletMat.diffuseColor = new Color3(1, 1, 0); // Bright yellow
        this.bulletMat.emissiveColor = new Color3(1, 0.8, 0); // GLOW!
        this.bulletMat.specularColor = Color3.Black();
        this.bulletMat.disableLighting = true;
        this.bulletMat.freeze();

        // Pre-create tracer material - BRIGHT RED/ORANGE for visibility
        this.tracerMat = new StandardMaterial("tracerMat", scene);
        this.tracerMat.diffuseColor = new Color3(1, 0.2, 0); // Red-orange
        this.tracerMat.emissiveColor = new Color3(1, 0.3, 0); // GLOW!
        this.tracerMat.specularColor = Color3.Black();
        this.tracerMat.disableLighting = true;
        this.tracerMat.freeze();

        // 5. Initialize modules (before visuals to use them)
        this.healthModule = new TankHealthModule(this);
        this.movementModule = new TankMovementModule(this);
        this.projectilesModule = new TankProjectilesModule(this);
        this.visualsModule = new TankVisualsModule(this);
        this.equipment = new TankEquipmentModule(this);
        // Note: Equipment visuals are NOT created yet. We must wait for rebuildTankVisuals.

        // 6. Build visuals and load configuration
        this.rebuildTankVisuals(position);

        // 6.1 Initialize Equipment (Now that visuals exist)
        this.equipment.initialize();

        // 7. Loop & Inputs (Run ONCE)
        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());

        // 3.1 КРИТИЧНО: Обновляем кэш позиций ПОСЛЕ шага физики, чтобы камера использовала актуальные данные
        scene.onAfterPhysicsObservable.add(() => this.updatePositionCache());

        // 3.2 Инициализируем кэш позиций сразу
        if (this.chassis) {
            this._cachedChassisPosition.copyFrom(this.chassis.absolutePosition);
        }

        // 4. Inputs
        this.setupInput();

        // 5. Connect Upgrade System
        // Listen for upgrades and level ups to apply bonuses immediately
        upgradeManager.onUpgrade((category, elementId, newLevel) => {
            logger.log(`[Tank] Upgrade applied: ${category} ${elementId} -> Lv${newLevel}`);
            this.applyUpgrades();
            if (this.hud) {
                this.hud.showNotification(`Upgrade Complete: ${elementId} Lv.${newLevel}`);
            }
        });

        upgradeManager.onPlayerLevelUp((newLevel) => {
            logger.log(`[Tank] Level Up: ${newLevel}`);
            this.applyUpgrades();
            // HUD notification is handled by UpgradeUI listeners, but we can add effects here
            if (this.effectsManager) {
                // TODO: Add level up particle effect
            }
        });

        logger.log("TankController: Init Success");
    }

    // Создать визуальные меши для модулей
    // Модули размещаются в фиксированных слотах:
    // - На корпусе: модули 6 (щит), 9 (платформа), 0 (прыжок)
    // - На башне: модуль 8 (автонаводка)
    // - На пушке: модуль 7 (ускоренная стрельба)
    private createModuleVisuals(): void {
        // МОДУЛИ ОТКЛЮЧЕНЫ - разноцветные модели модулей удалены с танка
        // Функция оставлена для совместимости, но не создаёт визуализацию
        return;
    }

    // Модуль 6 - Защитная стенка (щит на корпусе)
    private createModule6Visual(w: number, h: number, d: number): void {
        const meshes: Mesh[] = [];

        // Защитный щит на передней части корпуса
        const shield = MeshBuilder.CreateBox("module6_shield", {
            width: w * 0.6,
            height: h * 0.8,
            depth: 0.2
        }, this.scene);
        shield.position = new Vector3(0, h * 0.1, d * 0.45);
        shield.parent = this.chassis;

        const shieldMat = new StandardMaterial("module6Mat", this.scene);
        shieldMat.diffuseColor = new Color3(0.2, 0.4, 0.8); // Синий щит
        shieldMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
        shieldMat.specularColor = Color3.Black();
        shield.material = shieldMat;
        meshes.push(shield);

        this.moduleVisuals.set(6, meshes);
    }

    // Модуль 7 - Ускоренная стрельба (индикатор на пушке)
    private createModule7Visual(): void {
        const meshes: Mesh[] = [];

        // Индикатор на пушке
        const indicator = MeshBuilder.CreateBox("module7_indicator", {
            width: 0.3,
            height: 0.3,
            depth: 0.3
        }, this.scene);
        indicator.position = new Vector3(0, 0.2, this.cannonType.barrelLength * 0.3);
        indicator.parent = this.barrel;

        const indicatorMat = new StandardMaterial("module7Mat", this.scene);
        indicatorMat.diffuseColor = new Color3(1, 0.8, 0); // Желтый/оранжевый
        indicatorMat.emissiveColor = new Color3(0.5, 0.4, 0);
        indicatorMat.specularColor = Color3.Black();
        indicator.material = indicatorMat;
        meshes.push(indicator);

        this.moduleVisuals.set(7, meshes);
    }

    // Модуль 8 - Автонаводка (радар на башне)
    private createModule8Visual(w: number): void {
        const meshes: Mesh[] = [];

        // Радар/сенсор на башне
        const radar = MeshBuilder.CreateBox("module8_radar", {
            width: w * 0.3,
            height: 0.2,
            depth: w * 0.3
        }, this.scene);
        radar.position = new Vector3(0, this.chassisType.height * 0.75 + 0.3, 0);
        radar.parent = this.turret;

        const radarMat = new StandardMaterial("module8Mat", this.scene);
        radarMat.diffuseColor = new Color3(0.8, 0.2, 0.2); // Красный радар
        radarMat.emissiveColor = new Color3(0.4, 0.1, 0.1);
        radarMat.specularColor = Color3.Black();
        radar.material = radarMat;
        meshes.push(radar);

        this.moduleVisuals.set(8, meshes);
    }

    // Модуль 9 - Платформа (гидравлические опоры снизу корпуса)
    private createModule9Visual(w: number, h: number, d: number): void {
        const meshes: Mesh[] = [];

        // Гидравлические опоры по углам корпуса (для подъёма платформы)
        const positions = [
            new Vector3(-w * 0.35, -h * 0.4, d * 0.35),
            new Vector3(w * 0.35, -h * 0.4, d * 0.35),
            new Vector3(-w * 0.35, -h * 0.4, -d * 0.35),
            new Vector3(w * 0.35, -h * 0.4, -d * 0.35)
        ];

        for (let i = 0; i < 4; i++) {
            const piston = MeshBuilder.CreateCylinder(`module9_piston_${i}`, {
                height: 0.4,
                diameterTop: 0.15,
                diameterBottom: 0.2
            }, this.scene);
            piston.position = positions[i]!;
            piston.parent = this.chassis;

            const pistonMat = new StandardMaterial(`module9Mat_${i}`, this.scene);
            pistonMat.diffuseColor = new Color3(1, 0.6, 0.1); // Оранжевый (гидравлика)
            pistonMat.emissiveColor = new Color3(0.4, 0.2, 0);
            pistonMat.specularColor = new Color3(0.3, 0.3, 0.3);
            piston.material = pistonMat;
            meshes.push(piston);
        }

        this.moduleVisuals.set(9, meshes);
    }

    // Модуль 0 - Прыжок (реактивные двигатели снизу/сзади)
    private createModule0Visual(w: number, h: number, d: number): void {
        const meshes: Mesh[] = [];

        // Реактивные двигатели сзади корпуса
        for (let i = 0; i < 2; i++) {
            const engine = MeshBuilder.CreateBox(`module0_engine_${i}`, {
                width: 0.5,
                height: 0.3,
                depth: 0.5
            }, this.scene);
            engine.position = new Vector3(
                (i === 0 ? -1 : 1) * w * 0.35,
                -h * 0.3,
                -d * 0.45
            );
            engine.parent = this.chassis;

            const engineMat = new StandardMaterial(`module0Mat_${i}`, this.scene);
            engineMat.diffuseColor = new Color3(1, 0.5, 0); // Оранжевый/красный
            engineMat.emissiveColor = new Color3(0.5, 0.25, 0);
            engineMat.specularColor = Color3.Black();
            engine.material = engineMat;
            meshes.push(engine);
        }

        this.moduleVisuals.set(0, meshes);
    }

    // Обновить видимость модулей в зависимости от установки
    private updateModuleVisuals(): void {
        // Проверяем установленные модули через localStorage
        // Пока что делаем все модули видимыми (можно будет добавить проверку установки)
        const installedModules = this.getInstalledModules();

        for (const [moduleId, meshes] of this.moduleVisuals.entries()) {
            const isInstalled = installedModules.has(moduleId);
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const meshCount = meshes.length;
            for (let i = 0; i < meshCount; i++) {
                const mesh = meshes[i];
                if (mesh) {
                    mesh.isVisible = isInstalled;
                }
            }
        }
    }

    // Получить список установленных модулей
    private getInstalledModules(): Set<number> {
        const installed = new Set<number>();

        // Проверяем localStorage для установленных модулей
        try {
            const savedModules = localStorage.getItem("installedModules");
            if (savedModules) {
                const modules = JSON.parse(savedModules) as number[];
                // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
                const moduleCount = modules.length;
                for (let i = 0; i < moduleCount; i++) {
                    const moduleId = modules[i];
                    if (moduleId !== undefined && typeof moduleId === 'number') {
                        installed.add(moduleId);
                    }
                }
            }
            // По умолчанию модули НЕ установлены - они должны быть выбраны в гараже
        } catch (e) {
            logger.warn("[TankController] Failed to load installed modules:", e);
            // В случае ошибки возвращаем пустой набор - модули не установлены
        }

        return installed;
    }

    // Сохранить список установленных модулей в localStorage
    private saveInstalledModules(modules: Set<number>): void {
        try {
            const modulesArray = Array.from(modules);
            localStorage.setItem("installedModules", JSON.stringify(modulesArray));
        } catch (e) {
            logger.warn("[TankController] Failed to save installed modules:", e);
        }
    }

    // Установить модуль (вызывается из гаража)
    public installModule(moduleId: number): void {
        const installed = this.getInstalledModules();
        installed.add(moduleId);
        this.saveInstalledModules(installed);
        this.updateModuleVisuals();
        // Инвалидируем кэш модулей в HUD
        if (this.hud && typeof (this.hud as any).invalidateModulesCache === 'function') {
            (this.hud as any).invalidateModulesCache();
        }
    }

    // Удалить модуль (вызывается из гаража)
    public uninstallModule(moduleId: number): void {
        const installed = this.getInstalledModules();
        installed.delete(moduleId);
        this.saveInstalledModules(installed);
        this.updateModuleVisuals();
        // Инвалидируем кэш модулей в HUD
        if (this.hud && typeof (this.hud as any).invalidateModulesCache === 'function') {
            (this.hud as any).invalidateModulesCache();
        }
    }

    // Публичный метод для обновления визуализации модулей (вызывается из гаража)
    public updateModuleVisualsFromGarage(): void {
        this.updateModuleVisuals();
    }

    setHUD(hud: HUD) {
        this.hud = hud;
        this.hud.setHealth(this.currentHealth, this.maxHealth);
        this.hud.reloadTime = this.cooldown;
    }

    setSoundManager(soundManager: SoundManager) {
        this.soundManager = soundManager;
    }



    /**
     * Применить настройки управления
     */
    setControlSettings(settings: { invertMouseY?: boolean; autoReload?: boolean; holdToAim?: boolean }): void {
        if (settings.invertMouseY !== undefined) {
            this.invertMouseY = settings.invertMouseY;
        }
        if (settings.autoReload !== undefined) {
            this.autoReload = settings.autoReload;
        }
        if (settings.holdToAim !== undefined) {
            this.holdToAim = settings.holdToAim;
        }
    }

    /**
     * Установить состояние экранного управления (touch input)
     * Вызывается из HUD при изменении состояния джойстика/кнопок
     */
    setTouchInput(state: {
        throttle?: number;
        steer?: number;
        turretLeft?: boolean;
        turretRight?: boolean;
        turretRotation?: number;  // Аналоговый поворот башни -1..1
        aimPitch?: number;        // Наклон пушки -1..1
        fire?: boolean;
        aim?: boolean;
    }): void {
        if (state.throttle !== undefined) this._touchThrottle = state.throttle;
        if (state.steer !== undefined) this._touchSteer = state.steer;
        if (state.turretLeft !== undefined) this._touchTurretLeft = state.turretLeft;
        if (state.turretRight !== undefined) this._touchTurretRight = state.turretRight;
        if (state.turretRotation !== undefined) this._touchTurretRotation = state.turretRotation;
        if (state.aimPitch !== undefined) this._touchAimPitch = state.aimPitch;
        if (state.fire !== undefined) {
            // Если touch fire стал true и не было fire раньше - стреляем
            if (state.fire && !this._touchFire) {
                this.fire();
            }
            this._touchFire = state.fire;
        }
        if (state.aim !== undefined) this._touchAim = state.aim;
    }

    /**
     * Получить состояние touch throttle (для TankMovementModule)
     */
    getTouchThrottle(): number {
        return this._touchThrottle;
    }

    /**
     * Получить состояние touch steer (для TankMovementModule)
     */
    getTouchSteer(): number {
        return this._touchSteer;
    }

    /**
     * Получить состояние touch turret (для TankMovementModule)
     */
    getTouchTurret(): { left: boolean; right: boolean } {
        return { left: this._touchTurretLeft, right: this._touchTurretRight };
    }

    /**
     * Получить аналоговое значение поворота башни от джойстика (-1..1)
     */
    getTouchTurretRotation(): number {
        return this._touchTurretRotation;
    }

    /**
     * Получить аналоговое значение наклона пушки от джойстика (-1..1)
     */
    getTouchAimPitch(): number {
        return this._touchAimPitch;
    }

    /**
     * Получить состояние touch aim
     */
    isTouchAiming(): boolean {
        return this._touchAim;
    }

    setEffectsManager(effectsManager: EffectsManager) {
        this.effectsManager = effectsManager;
    }

    setCameraShakeCallback(callback: (intensity: number) => void) {
        this.cameraShakeCallback = callback;
    }

    setEnemyManager(enemyManager: EnemyManager) {
        this.enemyManager = enemyManager;
    }

    setEnemyTanks(enemyTanks: any[]) {
        this.enemyTanks = enemyTanks;
    }

    // Установить callback для получения позиции респавна (гараж)
    setRespawnPositionCallback(callback: () => Vector3 | null) {
        this.respawnPositionCallback = callback;
    }

    setOnShootCallback(callback: ((data: any) => void)) {
        this.onShootCallback = callback;
    }

    // Set callback for when player hits a network player (client-authoritative)
    setOnNetworkPlayerHitCallback(callback: (targetId: string, damage: number, hitPosition: Vector3, cannonType: string) => void) {
        this.onNetworkPlayerHitCallback = callback;
    }

    // Запуск обратного отсчёта респавна
    /**
     * Checks if the tank configuration (chassis, cannon, track) in localStorage
     * differs from the current tank state.
     */
    private checkForConfigurationChanges(): boolean {
        const savedChassisId = localStorage.getItem("selectedChassis") || "medium";
        const savedCannonId = localStorage.getItem("selectedCannon") || "standard";
        // Track might be undefined/standard
        const savedTrackId = localStorage.getItem("selectedTrack") || "standard";

        if (this.chassisType.id !== savedChassisId) return true;
        if (this.cannonType.id !== savedCannonId) return true;

        const currentTrackId = this.trackType ? this.trackType.id : "standard";
        if (currentTrackId !== savedTrackId) return true;

        return false;
    }

    /**
     * Rebuilds the tank visuals and physics based on current localStorage configuration.
     */
    public rebuildTankVisuals(position: Vector3): void {
        const scene = this.scene;

        // Загружаем типы корпуса, пушки и гусениц
        const savedChassisId = localStorage.getItem("selectedChassis") || "medium";
        const savedCannonId = localStorage.getItem("selectedCannon") || "standard";
        const savedTrackId = localStorage.getItem("selectedTrack") || "standard";

        this.chassisType = getChassisById(savedChassisId);
        this.cannonType = getCannonById(savedCannonId);
        this.trackType = getTrackById(savedTrackId);

        // Инициализируем характеристики танка
        this.resetBaseStats();

        // Применяем улучшения (они модифицируют базовые характеристики)
        // applyUpgrades теперь сама обновляет _initial* статы ПЕРЕД применением оборудования
        this.applyUpgrades();

        // 1. Visuals - создаём уникальные формы для каждого типа корпуса

        // КРИТИЧНО: Явно удаляем гусеницы и колёса, которые могли остаться от предыдущего танка (особенно если они были отсоединены при взрыве)
        if (this.leftTrack) { this.leftTrack.dispose(); this.leftTrack = null; }
        if (this.rightTrack) { this.rightTrack.dispose(); this.rightTrack = null; }
        if (this.visualWheels && this.visualWheels.length > 0) {
            this.visualWheels.forEach(w => { if (w && !w.isDisposed()) w.dispose(); });
            this.visualWheels = [];
        }

        if ((this as any).chassis && !(this as any).chassis.isDisposed()) {
            logger.warn("[TankController] Rebuild: Chassis already exists, disposing old one");
            (this as any).chassis.dispose();
        }

        this.chassis = this.visualsModule.createUniqueChassis(scene, position);

        // КРИТИЧНО: Проверяем, что меш не добавлен в сцену дважды
        const chassisCount = scene.meshes.filter(m => m === this.chassis).length;
        if (chassisCount > 1) {
            scene.removeMesh(this.chassis);
        }

        // КРИТИЧНО: Убеждаемся, что меш имеет правильный parent (null для корневого меша)
        if (this.chassis.parent) {
            this.chassis.parent = null;
        }

        // Настройки меша (culling, shadows)
        this.chassis.alwaysSelectAsActiveMesh = true;
        this.chassis.occlusionType = AbstractMesh.OCCLUSION_TYPE_NONE;
        this.chassis.isOccluded = false;
        this.chassis.receiveShadows = false;
        this.chassis.doNotSyncBoundingInfo = false;
        this.chassis.renderingGroupId = 0;

        // Применяем скин к корпусу
        const selectedSkinId = loadSelectedSkin();
        if (selectedSkinId && this.chassis.material) {
            const skin = getSkinById(selectedSkinId);
            if (skin) {
                const skinColors = applySkinToTank(skin);
                applySkinColorToMaterial(this.chassis.material as StandardMaterial, skinColors.chassisColor);
            }
        }

        // ВАЖНО: Metadata для обнаружения снарядами врагов
        this.chassis.metadata = { type: "playerTank", instance: this };

        this.visualsModule.createVisualWheels();

        // Башня
        if ((this as any).turret && !(this as any).turret.isDisposed()) {
            (this as any).turret.dispose();
        }

        const uniqueTurretId = `turret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const turretWidth = this.chassisType.width * 0.65;
        const turretHeight = this.chassisType.height * 0.75;
        const turretDepth = this.chassisType.depth * 0.6;

        this.turret = MeshBuilder.CreateBox(uniqueTurretId, {
            width: turretWidth,
            height: turretHeight,
            depth: turretDepth
        }, scene);

        // Применяем кастомный pivot если есть
        if ((this as any).customTurretPivot) {
            const pivot = (this as any).customTurretPivot as Vector3;
            this.turret.position = pivot;
        } else {
            // Для самолёта перемещаем башню в нос
            const isPlane = this.chassisType.id === "plane";
            if (isPlane) {
                // Башня в носу самолёта (передняя часть по Z)
                // Для самолёта depth = 4.0, но визуальная модель имеет нос на z = 6-7.8
                // Перемещаем башню максимально вперёд, в нос самолёта
                this.turret.position = new Vector3(0, this.chassisType.height / 2 + turretHeight / 2, this.chassisType.depth * 0.6);
            } else {
                this.turret.position = new Vector3(0, this.chassisType.height / 2 + turretHeight / 2, 0);
            }
        }
        this.turret.parent = this.chassis;
        (this.turret as any)._isChildMesh = true;
        (this.turret as any)._shouldBeChild = true;
        this.turret.renderingGroupId = 0;
        this.turret.occlusionType = AbstractMesh.OCCLUSION_TYPE_NONE;
        this.turret.isOccluded = false;
        this.turret.receiveShadows = false;

        const uniqueTurretMatId = `turretMat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const turretMat = new StandardMaterial(uniqueTurretMatId, scene);
        let turretColor: Color3;
        const selectedSkinIdTurret = loadSelectedSkin();
        if (selectedSkinIdTurret) {
            const skin = getSkinById(selectedSkinIdTurret);
            if (skin) {
                const skinColors = applySkinToTank(skin);
                turretColor = skinColors.turretColor;
            } else {
                turretColor = Color3.FromHexString(this.chassisType.color).scale(0.8);
            }
        } else {
            turretColor = Color3.FromHexString(this.chassisType.color).scale(0.8);
        }
        turretMat.diffuseColor = turretColor;
        turretMat.specularColor = Color3.Black();
        turretMat.alpha = 1.0; // ИСПРАВЛЕНИЕ БАГА: Явно устанавливаем полную непрозрачность
        this.turret.material = turretMat;

        // Пушка
        // Удаляем старые barrel
        const oldBarrels = scene.meshes.filter(mesh =>
            mesh.name && mesh.name.startsWith("barrel_") && !mesh.isDisposed()
        );
        oldBarrels.forEach(mesh => mesh.dispose());

        const barrelWidth = this.cannonType.barrelWidth;
        const barrelLength = this.cannonType.barrelLength;

        // Для самолёта ствол направлен вперёд (в нос)
        const isPlane = this.chassisType.id === "plane";
        let baseBarrelZ: number;
        if (isPlane) {
            // Для самолёта ствол в носу - позиция максимально вперёд от центра башни
            // Башня уже смещена вперёд (depth * 0.6), так что ствол должен быть ещё дальше вперёд
            // Ствол должен быть в самом носу самолёта
            baseBarrelZ = turretDepth / 2 + barrelLength / 2 + (this.chassisType.depth * 0.3); // Максимально вперёд в нос
        } else {
            baseBarrelZ = turretDepth / 2 + barrelLength / 2; // Обычное положение
        }

        this.barrel = this.visualsModule.createUniqueCannon(scene, barrelWidth, barrelLength);
        this.barrel.position = new Vector3(0, 0, baseBarrelZ);
        this.barrel.parent = this.turret;
        this.barrel.rotation.set(0, 0, 0);
        (this.barrel as any)._isChildMesh = true;
        (this.barrel as any)._shouldBeChild = true;
        this.barrel.renderingGroupId = 0;
        this.barrel.occlusionType = AbstractMesh.OCCLUSION_TYPE_NONE;
        this.barrel.isOccluded = false;
        this.barrel.receiveShadows = false;

        const pivotPoint = new Vector3(0, 0, -barrelLength / 2);
        this.barrel.setPivotPoint(pivotPoint);

        this._baseBarrelZ = baseBarrelZ;
        this._baseBarrelY = 0;
        this._barrelRecoilY = 0;
        this._barrelRecoilYTarget = 0;

        // Physics
        // Clean up old physics body
        if ((this as any).physicsBody) {
            try { (this as any).physicsBody.dispose(); } catch (e) { }
            (this as any).physicsBody = null;
        }

        // Create new physics shape
        const chassisShape = new PhysicsShapeContainer(scene);
        const multipliers = CHASSIS_SIZE_MULTIPLIERS[this.chassisType.id] ?? CHASSIS_SIZE_MULTIPLIERS["medium"]!;
        const realWidth = this.chassisType.width * multipliers!.width;
        const realHeight = this.chassisType.height * multipliers!.height;
        const realDepth = this.chassisType.depth * multipliers!.depth;

        let finalWidth = realWidth;
        let finalDepth = realDepth;
        if (this.chassisType.id === "hover" || this.chassisType.id === "shield") {
            const maxSize = Math.max(this.chassisType.width, this.chassisType.depth) * multipliers!.width;
            finalWidth = maxSize;
            finalDepth = maxSize;
        }

        const chassisLowering = -realHeight * 0.1;

        // ═══════════════════════════════════════════════════════════════════════
        // УПРОЩЕННЫЙ ХИТБОКС: Строго 2 формы (Корпус + Башня)
        // ═══════════════════════════════════════════════════════════════════════

        // 1. ОСНОВНОЙ КОРПУС (Hull)
        // Центр бокса должен быть в 0 (центр меша), так как MeshBuilder создает меш с центром в 0
        const hullCenterY = 0;

        const mainHullBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, hullCenterY, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(finalWidth, realHeight, finalDepth) // Полный размер корпуса
            }
        }, scene);
        mainHullBox.material = { friction: PHYSICS_CONFIG.tank.collisionMaterials.centerBoxFriction, restitution: PHYSICS_CONFIG.tank.collisionMaterials.centerBoxRestitution };
        chassisShape.addChildFromParent(this.chassis, mainHullBox, this.chassis);

        // 2. БАШНЯ (Turret)
        const turretHitboxHeight = this.chassisType.height * 0.75;
        const turretHitboxWidth = this.chassisType.width * 0.65;
        const turretHitboxDepth = this.chassisType.depth * 0.6;

        // Башня стоит НАД корпусом. 
        // Если центр корпуса в 0, то крыша на realHeight/2.
        // Центр башни = Крыша + Половина высоты башни.
        const turretY = (realHeight * 0.5) + (turretHitboxHeight * 0.5);

        const turretBox = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, turretY, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(turretHitboxWidth, turretHitboxHeight, turretHitboxDepth)
            }
        }, scene);
        turretBox.material = { friction: 0.1, restitution: 0 };
        chassisShape.addChildFromParent(this.chassis, turretBox, this.chassis);

        chassisShape.filterMembershipMask = 1;
        chassisShape.filterCollideMask = 2 | 32;

        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, scene);
        this.physicsBody.shape = chassisShape;
        this.physicsBody.disablePreStep = true;
        this.physicsBody.setMassProperties({
            mass: this.mass,
            centerOfMass: PHYSICS_CONFIG.tank.centerOfMass.clone()
        });
        this.physicsBody.setLinearDamping(PHYSICS_CONFIG.tank.stability.linearDamping);
        this.physicsBody.setAngularDamping(PHYSICS_CONFIG.tank.stability.angularDamping);

        // Update module visuals (removed old ones via dispose, create new ones)
        this.createModuleVisuals();

        // Update Position Cache
        this._cachedChassisPosition.copyFrom(this.chassis.absolutePosition);

        // КРИТИЧНО: Сохраняем базовые характеристики для работы модулей
        if (!this._characteristicsInitialized) {
            this._initialMoveSpeed = this.moveSpeed;
            this._initialTurnSpeed = this.turnSpeed;
            this._initialCooldown = this.cooldown; // Используем cooldown (1800) как базу
            this._initialDamage = this.damage;
            this._initialMaxHealth = this.maxHealth;
            this._characteristicsInitialized = true;
            logger.log(`[TankController] Initial characteristics saved: Speed=${this.moveSpeed}, CD=${this.cooldown}, HP=${this.maxHealth}`);
        }

        logger.log("[TANK-REBUILD] Visuals Rebuilt Successfully");
    }

    startRespawnCountdown() {
        // Очищаем предыдущий таймер если есть
        if (this.respawnIntervalId !== null) {
            timerManager.clear(this.respawnIntervalId);
        }

        // Без сообщения о смерти - тихий респавн

        // Обратный отсчёт каждую секунду
        // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
        this.respawnIntervalId = timerManager.setInterval(() => {
            this.respawnCountdown--;

            if (this.respawnCountdown <= 0) {
                // Останавливаем таймер
                if (this.respawnIntervalId !== null) {
                    timerManager.clear(this.respawnIntervalId);
                    this.respawnIntervalId = null;
                }

                // Респавн!
                logger.log("[TANK] Respawn timer complete!");
                if (!this.isAlive) {
                    this.respawn();
                    // Скрываем экран смерти после респавна
                    if (this.hud && typeof (this.hud as any).hideDeathScreen === 'function') {
                        (this.hud as any).hideDeathScreen();
                    }
                }
            } else {
                // Без сообщения о таймере - тихий респавн
            }
        }, 1000);
    }

    // ============ HEALTH MODULE DELEGATION ============
    takeDamage(amount: number, attackerPosition?: Vector3) {
        return this.healthModule.takeDamage(amount, attackerPosition);
    }

    heal(amount: number) {
        this.healthModule.heal(amount);
    }

    // Set health directly (used for multiplayer sync)
    setHealth(current: number, max: number = 100): void {
        this.healthModule.setHealth(current, max);
    }

    // Обработка смерти в мультиплеере
    setDead(respawnDelay: number): void {
        tankLogger.info(`[TankController] Setting state to DEAD. Respawn in ${respawnDelay}ms`);
        // Вызываем логику смерти модуля здоровья, но со своим колбеком респавна
        this.healthModule.die(() => {
            tankLogger.info("[TankController] Death timer finished, requesting respawn...");
            if (this.hud) this.hud.hideDeathScreen(); // Скрываем экран смерти
            if (this.onRespawnRequest) {
                this.onRespawnRequest();
            } else {
                console.warn("[TankController] No onRespawnRequest callback sent!");
            }
        });
    }

    // Респавн танка (вызывается при получении ответа от сервера)
    respawn(position?: Vector3): void {
        const game = (window as any).gameInstance;

        // КРИТИЧНО: Если позиция передана от сервера (мультиплеер), доверяем серверу!
        // НЕ пересчитываем "безопасную" позицию — сервер уже её валидировал.
        let respawnPos: Vector3;

        if (position) {
            // Мультиплеер: сервер указал точную позицию — используем её
            respawnPos = position.clone();
            console.log(`[TankController] Respawning at SERVER position (${respawnPos.x.toFixed(1)}, ${respawnPos.y.toFixed(1)}, ${respawnPos.z.toFixed(1)})`);
        } else {
            // Одиночная игра: ищем безопасную позицию локально
            let basePos = this.chassis ? this.chassis.position.clone() : new Vector3(0, 5, 0);

            if (game && typeof game.findSafeSpawnPositionAt === 'function') {
                const tankHeight = this.chassisType?.height || 2.0;
                const minOffset = Math.max(3.0, tankHeight * 0.5 + 1.0);
                const foundSafePos = game.findSafeSpawnPositionAt(basePos.x, basePos.z, minOffset, 10);
                respawnPos = foundSafePos || basePos;
            } else {
                respawnPos = basePos;
                if (respawnPos.y < -2.0) {
                    respawnPos.y = 5.0;
                }
            }
            console.log(`[TankController] Respawning at LOCAL position (${respawnPos.x.toFixed(1)}, ${respawnPos.y.toFixed(1)}, ${respawnPos.z.toFixed(1)})`);
        }

        // Проверяем изменения конфигурации и пересоздаём если нужно
        // ИСПРАВЛЕНИЕ: ВСЕГДА пересоздаём визуал при респавне, чтобы исправить баги с прозрачностью и оторванными гусеницами
        // Старый код: if (this.checkForConfigurationChanges()) {
        if (true) {
            logger.log("[TankController] Respawn: Rebuilding tank visuals (forced to fix artifacts)...");
            this.rebuildTankVisuals(respawnPos);
        }

        this.isAlive = true;
        this.isMovementEnabled = true;

        // КРИТИЧНО: Сбрасываем состояние перезарядки при респавне!
        // Это предотвращает зависание перезарядки если танк умер во время reload
        this.isReloading = false;
        this.lastShotTime = 0;

        // КРИТИЧНО: Прямой телепорт ПЕРЕД восстановлением физики
        if (this.chassis) {
            this.chassis.position.copyFrom(respawnPos);
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.computeWorldMatrix(true);
        }

        // Восстанавливаем физику (теперь chassis уже в правильной позиции)
        this.healthModule.restoreTankPhysics(respawnPos);

        // КРИТИЧНО: Принудительный мгновенный телепорт физики
        if (this.physicsBody) {
            this.physicsBody.disablePreStep = false;
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
        }

        // Восстанавливаем здоровье
        this.setHealth(this.maxHealth, this.maxHealth);

        // Включаем защиту
        this.healthModule.activateInvulnerability();

        // Скрываем экран смерти
        if (this.hud) {
            this.hud.hideDeathScreen();
        }

        // Эффект телепортации
        if (this.effectsManager) {
            this.effectsManager.createTeleportEffect(respawnPos);
        }
    }

    // Топливная система
    addFuel(amount: number): void {
        return this.healthModule.addFuel(amount);
    }

    consumeFuel(deltaTime: number): void {
        return this.healthModule.consumeFuel(deltaTime);
    }

    getFuelPercent(): number {
        return this.healthModule.getFuelPercent();
    }

    // Защита от урона
    private activateInvulnerability(): void {
        return this.healthModule.activateInvulnerability();
    }

    private updateInvulnerability(): void {
        return this.healthModule.updateInvulnerability();
    }

    isInvulnerableNow(): boolean {
        return this.healthModule.isInvulnerableNow();
    }

    getInvulnerabilityTimeLeft(): number {
        return this.healthModule.getInvulnerabilityTimeLeft();
    }

    die() {
        // ALWAYS use healthModule.die() to ensure death animation and garage assembly sequence runs.
        // In MP, TankHealthModule will call onRespawnRequest (if set) to notify server, 
        // but will continue local animation sequence.
        return this.healthModule.die();
    }

    /**
     * Сбрасывает все характеристики танка к базовым значениям из chassisType/cannonType.
     * КРИТИЧНО: Должна вызываться ПЕРЕД применением любых бонусов,
     * чтобы предотвратить накопление бонусов при респавне.
     */
    private resetBaseStats(): void {
        // Сбрасываем характеристики к базовым значениям из типа шасси
        this.mass = this.chassisType.mass;
        this.moveSpeed = this.chassisType.moveSpeed;
        this.turnSpeed = this.chassisType.turnSpeed;
        this.acceleration = this.chassisType.acceleration;
        this.maxHealth = this.chassisType.maxHealth;

        // Reset Secondary Stats
        this.critChance = 0;
        this.evasion = 0;
        this.repairRate = 0;
        this.fuelEfficiencyBonus = 0;

        // Сбрасываем характеристики к базовым значениям из типа пушки
        this.cooldown = this.cannonType.cooldown;
        this.baseCooldown = this.cannonType.cooldown;
        this.damage = this.cannonType.damage;
        this.projectileSpeed = this.cannonType.projectileSpeed;
        this.projectileSize = this.cannonType.projectileSize;

        // Сбрасываем скорость поворота башни к базовым значениям
        this.turretSpeed = 0.08;
        this.baseTurretSpeed = 0.08;
    }

    // Применить улучшения из гаража и бонусы от уровня опыта
    applyUpgrades(): void {
        try {
            // КРИТИЧНО: Сначала сбрасываем все характеристики к базовым значениям
            // Это предотвращает накопление бонусов при каждом респавне
            this.resetBaseStats();

            // === 1. УЛУЧШЕНИЯ ИЗ ГАРАЖА ===
            const saved = localStorage.getItem("tx_garage_progress");
            if (saved) {
                const progress = JSON.parse(saved);
                if (progress.upgrades) {
                    const upgrades = progress.upgrades;

                    // Здоровье
                    if (upgrades.health_1) {
                        const healthBonus = upgrades.health_1 * 20;
                        this.maxHealth += healthBonus;
                    }

                    // Скорость
                    if (upgrades.speed_1) {
                        const speedBonus = upgrades.speed_1 * 2;
                        this.moveSpeed += speedBonus;
                    }

                    // Броня (увеличиваем здоровье)
                    if (upgrades.armor_1) {
                        const armorBonus = upgrades.armor_1 * 0.2;
                        this.maxHealth += Math.floor(armorBonus * 50);
                    }

                    // Урон
                    if (upgrades.damage_1) {
                        const damageBonus = upgrades.damage_1 * 5;
                        this.damage += damageBonus;
                    }

                    // Перезарядка
                    if (upgrades.reload_1) {
                        const reloadBonus = upgrades.reload_1 * 100;
                        this.cooldown = Math.max(500, this.cooldown - reloadBonus);
                    }
                }
            }

            // === 2. БОНУСЫ ОТ УРОВНЯ ОПЫТА ===
            if (this.experienceSystem) {
                // Бонусы корпуса
                const chassisBonus = this.experienceSystem.getChassisLevelBonus(this.chassisType.id);
                if (chassisBonus) {
                    this.maxHealth += chassisBonus.healthBonus;
                    this.moveSpeed += chassisBonus.speedBonus;
                    this.turnSpeed += chassisBonus.turnSpeedBonus;
                    // Броня применяется как процент снижения урона в takeDamage
                }

                // Бонусы пушки
                const cannonBonus = this.experienceSystem.getCannonLevelBonus(this.cannonType.id);
                if (cannonBonus) {
                    this.damage += cannonBonus.damageBonus;
                    this.cooldown = Math.max(300, this.cooldown - cannonBonus.reloadBonus);
                    this.projectileSpeed += cannonBonus.projectileSpeedBonus;
                }

                // Логируем применённые бонусы
                const chassisLevel = this.experienceSystem.getChassisLevel(this.chassisType.id);
                const cannonLevel = this.experienceSystem.getCannonLevel(this.cannonType.id);
                logger.log(`[Tank] Experience bonuses applied: Chassis Lv.${chassisLevel}, Cannon Lv.${cannonLevel}`);
            }

            // === 3. БОНУСЫ ОТ НАВЫКОВ ИГРОКА ===
            if (this.playerProgression) {
                const skillBonuses = this.playerProgression.getSkillBonuses();
                this.maxHealth += skillBonuses.healthBonus;
                this.damage += skillBonuses.damageBonus;
                this.moveSpeed += skillBonuses.speedBonus;
                this.cooldown = Math.max(300, this.cooldown - skillBonuses.reloadBonus);
                // ИСПРАВЛЕНО: turretSpeedBonus влияет на скорость БАШНИ, а не корпуса
                this.turretSpeed += skillBonuses.turretSpeedBonus;
                this.baseTurretSpeed += skillBonuses.turretSpeedBonus;

                logger.log(`[Tank] Skill bonuses applied: +${skillBonuses.healthBonus} HP, +${skillBonuses.damageBonus} dmg, +${skillBonuses.speedBonus.toFixed(1)} speed`);
            }

            // === 4. ПАССИВНЫЕ БОНУСЫ ОТ УРОВНЯ ИГРОКА ===
            if (this.playerProgression) {
                const levelBonuses = this.playerProgression.getLevelBonuses();
                this.maxHealth += levelBonuses.healthBonus;
                this.damage += levelBonuses.damageBonus;
                this.moveSpeed += levelBonuses.speedBonus;

                logger.log(`[Tank] Level bonuses applied: +${levelBonuses.healthBonus} HP, +${levelBonuses.damageBonus.toFixed(1)} dmg, +${levelBonuses.speedBonus.toFixed(1)} speed`);
            }

            // === 5. БОНУСЫ ОТ СИСТЕМЫ ПРОКАЧКИ (UpgradeManager) ===
            this.applyUpgradeManagerBonuses();

            // Обновляем текущее здоровье (чтобы оно соответствовало новому максимуму)
            // ПРИМЕЧАНИЕ: Если мы хотим сохранить "текущее здоровье" процентно, нужно другое решение.
            // Но при applyUpgrades (обычно в гараже или респавне) полный хил логичен.
            this.currentHealth = this.maxHealth;

            // КРИТИЧНО: Сохраняем "Базовые + Прогресс" характеристики перед применением оборудования!
            // EquipmentModule использует _initial* значения для наложения мультипликаторов.
            // Если не обновить их здесь, equipment будет использовать старые значения (от предыдущего шасси/жизни).
            this._initialMaxHealth = this.maxHealth;
            this._initialMoveSpeed = this.moveSpeed;
            this._initialDamage = this.damage;
            this._initialCooldown = this.cooldown;
            // Cooldown может быть меньше baseCooldown. Обновляем и baseCooldown если нужно?
            // baseCooldown используется как база для speed multipliers.
            // this.baseCooldown = this.cooldown; 

            this._initialProjectileSpeed = this.projectileSpeed;
            this._initialTurretSpeed = this.turretSpeed;
            this._initialBaseTurretSpeed = this.baseTurretSpeed;
            this._characteristicsInitialized = true;
            logger.log(`[Tank] Base+Progression Stats captured: HP=${this._initialMaxHealth}, Speed=${this._initialMoveSpeed.toFixed(1)}, Damage=${this._initialDamage}`);

            // Обновляем визуализацию модулей
            this.updateModuleVisuals();

            // REFRESH EQUIPMENT VISUALS (Fix for "Parent mesh not ready")
            // Now that new chassis/turret/barrel meshes exist, re-attach equipment
            if (this.equipment) {
                // This will apply multipliers on top of the _initial* stats we just captured
                this.equipment.refreshVisuals();
            }

            logger.log(`[Tank] Final stats (with Equipment): HP=${this.maxHealth}, Speed=${this.moveSpeed.toFixed(1)}, Damage=${this.damage}, Reload=${this.cooldown}ms, ProjSpeed=${this.projectileSpeed}`);
        } catch (e) {
            logger.warn("[Tank] Failed to apply upgrades:", e);
        }
    }

    /**
     * Применить бонусы от системы прокачки (UpgradeManager)
     */
    private applyUpgradeManagerBonuses(): void {
        try {
            // Бонусы орудия
            const cannonBonuses = upgradeManager.getCannonBonuses(this.cannonType.id);
            if (cannonBonuses.damageMultiplier && cannonBonuses.damageMultiplier > 1) {
                this.damage = Math.round(this.damage * cannonBonuses.damageMultiplier);
            }
            if (cannonBonuses.cooldownMultiplier && cannonBonuses.cooldownMultiplier < 1) {
                this.cooldown = Math.round(this.cooldown * cannonBonuses.cooldownMultiplier);
                this.baseCooldown = this.cooldown;
            }
            if (cannonBonuses.projectileSpeedMultiplier && cannonBonuses.projectileSpeedMultiplier > 1) {
                this.projectileSpeed = Math.round(this.projectileSpeed * cannonBonuses.projectileSpeedMultiplier);
            }

            // Бонусы корпуса
            const chassisBonuses = upgradeManager.getChassisBonuses(this.chassisType.id);
            if (chassisBonuses.healthMultiplier && chassisBonuses.healthMultiplier > 1) {
                this.maxHealth = Math.round(this.maxHealth * chassisBonuses.healthMultiplier);
            }

            // Бонусы шасси
            const tracksBonuses = upgradeManager.getTracksBonuses(this.trackType?.id || "standard");
            if (tracksBonuses.speedMultiplier && tracksBonuses.speedMultiplier > 1) {
                this.moveSpeed = this.moveSpeed * tracksBonuses.speedMultiplier;
            }
            if (tracksBonuses.turnSpeedMultiplier && tracksBonuses.turnSpeedMultiplier > 1) {
                this.turnSpeed = this.turnSpeed * tracksBonuses.turnSpeedMultiplier;
            }
            if (tracksBonuses.accelerationMultiplier && tracksBonuses.accelerationMultiplier > 1) {
                this.acceleration = this.acceleration * tracksBonuses.accelerationMultiplier;
            }

            // Логируем уровни прокачки
            const cannonLevel = upgradeManager.getElementLevel("cannon", this.cannonType.id);
            const chassisLevel = upgradeManager.getElementLevel("chassis", this.chassisType.id);
            const tracksLevel = upgradeManager.getElementLevel("tracks", this.trackType?.id || "standard");

            if (cannonLevel > 1 || chassisLevel > 1 || tracksLevel > 1) {
                logger.log(`[Tank] UpgradeManager bonuses: Cannon Lv.${cannonLevel}, Chassis Lv.${chassisLevel}, Tracks Lv.${tracksLevel}`);
            }
        } catch (e) {
            logger.warn("[Tank] Failed to apply UpgradeManager bonuses:", e);
        }
    }



    /**
     * Завершает респавн - устанавливает позицию и восстанавливает физику
     */
    private completeRespawn(respawnPos: Vector3): void {
        // КРИТИЧНО: Сохраняем rotation башни ПЕРЕД любыми операциями (для переодевания)
        // Если башня не была пересоздана, восстановим rotation после
        let savedTurretRotY = 0;
        let savedTurretRotQuat: Quaternion | null = null;
        const turretExistsBefore = this.turret && !this.turret.isDisposed();
        if (turretExistsBefore) {
            savedTurretRotY = this.turret.rotation.y;
            if (this.turret.rotationQuaternion) {
                savedTurretRotQuat = this.turret.rotationQuaternion.clone();
            }
            // Сохраняем ссылку на turret для проверки пересоздания
            (this as any)._savedTurretBeforeRespawn = this.turret;
        }

        // КРИТИЧНО: Устанавливаем lastRespawnTime и сбрасываем флаги ДО isAlive = true!
        // Это предотвращает race condition: игровой цикл может запуститься до установки lastRespawnTime
        const game = (window as any).gameInstance;
        if (game) {
            game.lastRespawnTime = Date.now();
            game.shouldCenterCamera = false;
            game.isCenteringActive = false;
            // КРИТИЧНО: Синхронизируем cameraYaw с ТЕКУЩИМ углом башни, а не устанавливаем в 0!
            // Это предотвращает проблему, когда башня пытается повернуться к cameraYaw = 0
            if (this.turret) {
                game.cameraYaw = this.turret.rotation.y;
            } else {
                game.cameraYaw = 0; // Fallback если башни нет
            }
            logger.log(`[TANK] Respawn flags reset BEFORE isAlive: lastRespawnTime=${game.lastRespawnTime}, shouldCenterCamera=${game.shouldCenterCamera}, cameraYaw=${game.cameraYaw.toFixed(3)}, turretRotY=${this.turret ? this.turret.rotation.y.toFixed(3) : 'N/A'}`);
        }

        // КРИТИЧНО: Устанавливаем isAlive = true ЗДЕСЬ, после завершения анимации сборки!
        // Это предотвращает конфликт между анимацией и updatePhysics/updateCamera
        this.isAlive = true;

        // КРИТИЧНО: Сбрасываем состояние перезарядки при респавне!
        this.isReloading = false;
        this.lastShotTime = 0;

        let targetX = respawnPos.x;
        let targetZ = respawnPos.z;

        // КРИТИЧНО: Проверяем был ли танк уже телепортирован через startGarageRespawn
        // Если да - НЕ пересчитываем позицию, просто используем текущую (избегаем дёрганья)
        const wasTeleportedToGarage = (this as any)._wasTeleportedToGarage === true;

        // КРИТИЧНО: Проверяем флаг переодевания на месте (из GameGarage)
        const isInPlaceDressing = (this as any)._inPlaceDressing === true;

        let targetY = respawnPos.y;

        // Проверяем, находится ли танк в гараже через gameGarage
        let isInGarage = false;
        if (game && (game as any).gameGarage && typeof (game as any).gameGarage.isPlayerInAnyGarage === 'function') {
            isInGarage = (game as any).gameGarage.isPlayerInAnyGarage();
        }

        // КРИТИЧНО: Если переодевание на месте - используем ПЕРЕДАННУЮ позицию БЕЗ ИЗМЕНЕНИЙ
        if (isInPlaceDressing) {
            // Используем Y из respawnPos (которая уже содержит текущую позицию танка)
            targetY = respawnPos.y;
            logger.log(`[TANK] In-place dressing: using exact position Y=${targetY.toFixed(2)}`);
        }
        // Если танк уже был телепортирован в гараж - используем текущую позицию (без пересчёта!)
        else if (wasTeleportedToGarage && this.chassis) {
            targetY = this.chassis.position.y;
            logger.log(`[TANK] Tank was teleported to garage, using current Y: ${targetY.toFixed(2)}`);
            // Сбрасываем флаг
            (this as any)._wasTeleportedToGarage = false;
        } else if (isInGarage && this.chassis) {
            // Танк в гараже (переодевание) - сохраняем Y-позицию
            targetY = this.chassis.position.y;
            logger.log(`[TANK] Tank is in garage, preserving Y position: ${targetY.toFixed(2)}`);
        } else {
            // ИСПРАВЛЕНО: Если танк НЕ в гараже и НЕ был телепортирован - используем findSafeSpawnPositionAt()
            // для нахождения безопасной позиции над верхней поверхностью
            // КРИТИЧНО: Используем высоту танка + запас для предотвращения застревания
            const multipliers = CHASSIS_SIZE_MULTIPLIERS[this.chassisType.id] ?? CHASSIS_SIZE_MULTIPLIERS["medium"]!;
            const tankHeight = this.chassisType.height * multipliers.height;
            const safeOffset = Math.max(3.0, tankHeight * 0.5 + 1.0); // Минимум 3м, или половина высоты + 1м

            if (game && typeof game.findSafeSpawnPositionAt === 'function') {
                const safePos = game.findSafeSpawnPositionAt(targetX, targetZ, safeOffset, 5);
                if (safePos) {
                    targetX = safePos.x;
                    targetY = safePos.y;
                    targetZ = safePos.z;
                    logger.log(`[TANK] Corrected respawn position using findSafeSpawnPositionAt: (${targetX.toFixed(2)}, ${targetY.toFixed(2)}, ${targetZ.toFixed(2)})`);
                } else {
                    // Fallback: если findSafeSpawnPositionAt вернул null, используем getTopSurfaceHeight
                    if (game && typeof game.getTopSurfaceHeight === 'function') {
                        const surfaceHeight = game.getTopSurfaceHeight(targetX, targetZ);
                        targetY = surfaceHeight + safeOffset;
                        logger.warn(`[TANK] findSafeSpawnPositionAt failed, using getTopSurfaceHeight: Y=${targetY.toFixed(2)} (surface: ${surfaceHeight.toFixed(2)}, offset: ${safeOffset.toFixed(2)})`);
                    } else if (game && typeof game.getGroundHeight === 'function') {
                        const groundHeight = game.getGroundHeight(targetX, targetZ);
                        targetY = groundHeight + safeOffset;
                        logger.warn(`[TANK] findSafeSpawnPositionAt failed, using getGroundHeight: Y=${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)}, offset: ${safeOffset.toFixed(2)})`);
                    } else {
                        // Последний fallback: минимум 2 метра
                        if (targetY < 2.0) {
                            targetY = 2.0;
                            logger.warn(`[TANK] Respawn height too low (${respawnPos.y.toFixed(2)}), forcing to 2.0`);
                        }
                    }
                }
            } else {
                // Fallback: если game или findSafeSpawnPositionAt недоступен
                const multipliers = CHASSIS_SIZE_MULTIPLIERS[this.chassisType.id] ?? CHASSIS_SIZE_MULTIPLIERS["medium"]!;
                const tankHeight = this.chassisType.height * multipliers.height;
                const safeOffset = Math.max(3.0, tankHeight * 0.5 + 1.0);

                if (game && typeof game.getTopSurfaceHeight === 'function') {
                    const surfaceHeight = game.getTopSurfaceHeight(targetX, targetZ);
                    targetY = surfaceHeight + safeOffset;
                    logger.log(`[TANK] Using getTopSurfaceHeight fallback: Y=${targetY.toFixed(2)} (surface: ${surfaceHeight.toFixed(2)}, offset: ${safeOffset.toFixed(2)})`);
                } else if (game && typeof game.getGroundHeight === 'function') {
                    const groundHeight = game.getGroundHeight(targetX, targetZ);
                    targetY = groundHeight + safeOffset;
                    logger.log(`[TANK] Using getGroundHeight fallback: Y=${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)}, offset: ${safeOffset.toFixed(2)})`);
                } else {
                    // Последний fallback: минимум safeOffset
                    if (targetY < safeOffset) {
                        targetY = safeOffset;
                        logger.warn(`[TANK] Respawn height too low (${respawnPos.y.toFixed(2)}), forcing to ${safeOffset.toFixed(2)}`);
                    }
                }
            }
        }

        logger.log(`[TANK] Completing respawn at: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Z=${targetZ.toFixed(2)}`);

        // ТЕЛЕПОРТИРУЕМ ТАНК В ГАРАЖ - ЖЁСТКО И ПРИНУДИТЕЛЬНО!
        if (this.chassis) {
            // 1. Устанавливаем позицию С ПРАВИЛЬНОЙ ВЫСОТОЙ
            this.chassis.position.set(targetX, targetY, targetZ);

            // ИСПРАВЛЕНИЕ: Проверяем коллизии после установки позиции и выталкиваем танк если застрял
            if (game && typeof game.ejectTankFromCollision === 'function') {
                game.ejectTankFromCollision();
                // Обновляем targetY после выталкивания
                if (this.chassis) {
                    targetY = this.chassis.position.y;
                    logger.log(`[TANK] After collision check: Y=${targetY.toFixed(2)}`);
                }
            }

            // 2. Сбрасываем вращение
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.rotation.set(0, 0, 0);

            // КРИТИЧНО: Проверяем, была ли башня пересоздана ДО сброса rotation
            const turretWasRecreated = !turretExistsBefore || !this.turret || this.turret.isDisposed() ||
                (turretExistsBefore && this.turret !== (this as any)._savedTurretBeforeRespawn);

            if (this.turret) {
                if (turretWasRecreated) {
                    // Башня была пересоздана - сбрасываем rotation (обычный респавн)
                    this.turret.rotationQuaternion = Quaternion.Identity();
                    this.turret.rotation.set(0, 0, 0);
                } else {
                    // Башня НЕ была пересоздана - ВОССТАНАВЛИВАЕМ сохранённый rotation (переодевание)
                    if (savedTurretRotQuat) {
                        this.turret.rotationQuaternion = savedTurretRotQuat;
                    }
                    this.turret.rotation.y = savedTurretRotY;
                    logger.log(`[TANK] Restored turret rotation after respawn: ${savedTurretRotY.toFixed(4)}`);
                }
            }
            if (this.barrel) {
                this.barrel.rotationQuaternion = Quaternion.Identity();
                this.barrel.rotation.set(0, 0, 0);
            }

            // 3. Обновляем матрицы ПРИНУДИТЕЛЬНО
            this.chassis.computeWorldMatrix(true);
            if (this.turret) this.turret.computeWorldMatrix(true);
            if (this.barrel) this.barrel.computeWorldMatrix(true);

            // 3.5. ИСПРАВЛЕНИЕ БАГА: Восстанавливаем прозрачность всех частей танка после респавна
            // Анимация сборки/разборки может оставить промежуточные значения alpha
            if (this.chassis && this.chassis.material) {
                const chassisMat = this.chassis.material as any;
                if (chassisMat.alpha !== undefined) {
                    chassisMat.alpha = 1.0;
                }
            }

            if (this.turret && this.turret.material) {
                const turretMat = this.turret.material as any;
                if (turretMat.alpha !== undefined) {
                    turretMat.alpha = 1.0;
                }
            }

            if (this.barrel && this.barrel.material) {
                const barrelMat = this.barrel.material as any;
                if (barrelMat.alpha !== undefined) {
                    barrelMat.alpha = 1.0;
                }
            }

            // Также проверяем дочерние меши (гусеницы и другие части корпуса)
            if (this.chassis) {
                const childMeshes = this.chassis.getChildMeshes(false);
                for (const child of childMeshes) {
                    if (child.material) {
                        const childMat = child.material as any;
                        if (childMat.alpha !== undefined) {
                            childMat.alpha = 1.0;
                        }
                    }
                }
            }

            // Проверяем дочерние меши башни (если есть)
            if (this.turret) {
                const turretChildren = this.turret.getChildMeshes(false);
                for (const child of turretChildren) {
                    if (child.material) {
                        const childMat = child.material as any;
                        if (childMat.alpha !== undefined) {
                            childMat.alpha = 1.0;
                        }
                    }
                }
            }

            // 4. Восстанавливаем физику, если её нет (УПРОЩЁННЫЕ ХИТБОКСЫ: КОРПУС И БАШНЯ)
            if (!this.physicsBody) {
                const chassisShape = new PhysicsShapeContainer(this.scene);

                const chassisLowering = -this.chassisType.height * 0.1;

                // 1. КОРПУС (центральный BOX) - ОДИН В ОДИН с визуальным размером
                const multipliers = CHASSIS_SIZE_MULTIPLIERS[this.chassisType.id] ?? CHASSIS_SIZE_MULTIPLIERS["medium"]!;
                const realWidth = this.chassisType.width * multipliers!.width;
                const realHeight = this.chassisType.height * multipliers!.height;
                const realDepth = this.chassisType.depth * multipliers!.depth;

                let finalWidth = realWidth;
                let finalDepth = realDepth;
                if (this.chassisType.id === "hover" || this.chassisType.id === "shield") {
                    const maxSize = Math.max(this.chassisType.width, this.chassisType.depth) * multipliers!.width;
                    finalWidth = maxSize;
                    finalDepth = maxSize;
                }

                const chassisBox = new PhysicsShape({
                    type: PhysicsShapeType.BOX,
                    parameters: {
                        center: new Vector3(0, chassisLowering, 0),
                        rotation: Quaternion.Identity(),
                        extents: new Vector3(finalWidth, realHeight, finalDepth) // ИСПРАВЛЕНИЕ: убрали * 0.95
                    }
                }, this.scene);
                chassisBox.material = { friction: PHYSICS_CONFIG.tank.collisionMaterials.centerBoxFriction, restitution: PHYSICS_CONFIG.tank.collisionMaterials.centerBoxRestitution };
                chassisShape.addChildFromParent(this.chassis, chassisBox, this.chassis);

                // 2. БАШНЯ (TURRET BOX) - ОДИН В ОДИН с визуальным размером
                const turretHeight = this.chassisType.height * 0.75; // Как в визуальной модели
                const turretWidth = this.chassisType.width * 0.65; // Как в визуальной модели
                const turretDepth = this.chassisType.depth * 0.6; // Как в визуальной модели
                // Calculate Y position: Top of chassis + half turret height
                const turretY = chassisLowering + (realHeight * 0.5) + (turretHeight * 0.5);

                const turretBox = new PhysicsShape({
                    type: PhysicsShapeType.BOX,
                    parameters: {
                        center: new Vector3(0, turretY, 0),
                        rotation: Quaternion.Identity(),
                        extents: new Vector3(turretWidth, turretHeight, turretDepth)
                    }
                }, this.scene);
                turretBox.material = { friction: 0.1, restitution: 0 };
                chassisShape.addChildFromParent(this.chassis, turretBox, this.chassis);

                chassisShape.filterMembershipMask = 1;
                chassisShape.filterCollideMask = 1 | 2 | 32;

                // КРИТИЧНО: Проверяем, не создано ли уже физическое тело
                const existingPhysics = this.physicsBody as any;
                if (existingPhysics && !existingPhysics.isDisposed) {
                    logger.error("[TankController] CRITICAL: Physics body already exists in restoreTankPhysics! Disposing old one.");
                    existingPhysics.dispose();
                    (this as any).physicsBody = null;
                }
                // КРИТИЧНО: Проверяем, не привязано ли уже физическое тело к мешу
                const existingBody = (this.chassis as any).physicsBody;
                if (existingBody && existingBody !== this.physicsBody) {
                    logger.error("[TankController] CRITICAL: Chassis already has physics body in restoreTankPhysics! Disposing it.");
                    if (!existingBody.isDisposed && typeof existingBody.dispose === 'function') {
                        existingBody.dispose();
                    }
                    (this.chassis as any).physicsBody = null;
                }

                this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
                this.physicsBody.shape = chassisShape;

                // КРИТИЧНО: disablePreStep = true - физика единственный источник истины
                this.physicsBody.disablePreStep = true;

                // HEAVY & RESPONSIVE: Используем значения из конфига
                this.physicsBody.setMassProperties({
                    mass: this.mass,
                    centerOfMass: PHYSICS_CONFIG.tank.centerOfMass.clone()
                });
                this.physicsBody.setLinearDamping(PHYSICS_CONFIG.tank.stability.linearDamping);
                this.physicsBody.setAngularDamping(PHYSICS_CONFIG.tank.stability.angularDamping);
            }

            // 5. КРИТИЧНО: Телепортация с правильной синхронизацией физики
            // Шаг 1: Переключаем в ANIMATED режим для прямого позиционирования
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);

            // Шаг 2: Сбрасываем скорости
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());

            // Шаг 3: Устанавливаем позицию и вращение меша
            this.chassis.position.set(targetX, targetY, targetZ);
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.rotation.set(0, 0, 0);

            // КРИТИЧНО: НЕ сбрасываем rotation башни если она не была пересоздана (переодевание)
            // Rotation башни уже восстановлен выше, не трогаем его здесь
            if (this.turret && turretWasRecreated) {
                // Только если башня была пересоздана - сбрасываем rotation
                this.turret.rotationQuaternion = Quaternion.Identity();
                this.turret.rotation.set(0, 0, 0);
            }

            this.chassis.computeWorldMatrix(true);

            // Шаг 4: Временно включаем preStep для синхронизации позиции с физикой
            this.physicsBody.disablePreStep = false;

            // Шаг 5: Возвращаем в DYNAMIC режим (физика возьмёт позицию из меша)
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);

            // Шаг 6: Сбрасываем скорости после переключения
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());

            // Шаг 7: Восстанавливаем disablePreStep после одного кадра
            const timeoutId1 = setTimeout(() => {
                if (this.physicsBody) {
                    this.physicsBody.disablePreStep = true;
                }
            }, 0);
            this.tankTimeouts.push(timeoutId1);

            // 6. Активируем защиту от урона
            this.activateInvulnerability();

            // 7. Дополнительная проверка через задержку (SAFETY CHECK)
            const timeoutId2 = setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    // А. Проверяем не провалился ли танк в пол
                    const rayOrigin = this.chassis.absolutePosition.clone();
                    // Стреляем лучом вниз с позиции танка (центр)
                    const rayDown = new Ray(rayOrigin, new Vector3(0, -1, 0), 2.0);
                    const pick = this.scene.pickWithRay(rayDown, (mesh) => mesh.isPickable && mesh.isEnabled());

                    if (pick && pick.hit && pick.pickedPoint && pick.distance < 0.5) {
                        logger.warn(`[TANK] CRITICAL: Tank stuck in floor after spawn! Distance: ${pick.distance.toFixed(2)}m. Teleporting UP!`);

                        // EMERGENCY TELEPORT UP
                        this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
                        this.chassis.position.y += 2.0; // Bump up 2 meters
                        this.chassis.computeWorldMatrix(true);
                        this.physicsBody.setTargetTransform(this.chassis.position, this.chassis.rotationQuaternion || Quaternion.Identity());

                        const timeoutId3 = setTimeout(() => {
                            if (this.physicsBody) this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                        }, 50);
                        this.tankTimeouts.push(timeoutId3);
                    }

                    // Б. Проверяем ориентацию (переворот)
                    const rotMatrix = this.chassis.getWorldMatrix();
                    const up = Vector3.TransformNormal(Vector3.Up(), rotMatrix);

                    if (up.y < 0.7) {
                        logger.warn(`[TANK] Tank is flipped on spawn! Correcting...`);
                        // ... existing flip correction logic ...
                        this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
                        this.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.physicsBody.setAngularVelocity(Vector3.Zero());

                        this.chassis.position.set(targetX, targetY + 2.0, targetZ); // Also bump up when correcting flip
                        this.chassis.rotationQuaternion = Quaternion.Identity();
                        this.chassis.rotation.set(0, 0, 0);

                        // ... restore logic ...
                        if (this.turret && turretWasRecreated) {
                            this.turret.rotationQuaternion = Quaternion.Identity();
                            this.turret.rotation.set(0, 0, 0);
                        }

                        this.chassis.computeWorldMatrix(true);

                        // Re-enable physics
                        this.physicsBody.disablePreStep = false;
                        this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                        this.physicsBody.setLinearVelocity(Vector3.Zero());

                        // FIX: Do NOT disable PreStep again. Keep it false (enabled) for active movement.
                        if (this.physicsBody) {
                            this.physicsBody.disablePreStep = false;
                        }

                    }
                }
            }, 500); // Check after 500ms physics settling
            this.tankTimeouts.push(timeoutId2);
        } else {
            logger.error("[TANK] Cannot complete respawn - chassis missing!");
        }

        // Обновляем HUD
        if (this.hud) {
            this.hud.setHealth(this.currentHealth, this.maxHealth);
            this.hud.showRespawnMessage();
        }

        tankLogger.verbose("[TANK] Respawn completed!");

        // Сбрасываем все инпуты
        this.throttleTarget = 0;
        this.steerTarget = 0;
        this.smoothThrottle = 0;
        this.smoothSteer = 0;
        this.turretTurnTarget = 0;
        this.turretTurnSmooth = 0;
        this.turretAcceleration = 0;
        this.turretAccelStartTime = 0;

        // КРИТИЧНО: Сбрасываем флаги управления башней для восстановления поворота
        this.isKeyboardTurretControl = false;
        this.isAutoCentering = false;

        // КРИТИЧНО: НЕ применяем улучшения! Характеристики НЕ должны изменяться после смерти!
        // Восстанавливаем сохранённые характеристики из начала боя
        if (this._characteristicsInitialized) {
            this.maxHealth = this._initialMaxHealth;
            this.moveSpeed = this._initialMoveSpeed;
            this.turnSpeed = this._initialTurnSpeed;
            this.damage = this._initialDamage;
            this.cooldown = this._initialCooldown;
            this.baseCooldown = this._initialCooldown;
            this.projectileSpeed = this._initialProjectileSpeed;
            this.turretSpeed = this._initialTurretSpeed;
            this.baseTurretSpeed = this._initialBaseTurretSpeed;
            logger.log(`[TANK] Characteristics restored in completeRespawn: HP=${this.maxHealth}, Speed=${this.moveSpeed}, Damage=${this.damage}, TurretSpeed=${this.turretSpeed}`);
        } else {
            // Fallback: если характеристики не были сохранены, используем значения по умолчанию
            this.turretSpeed = 0.08;
            this.baseTurretSpeed = 0.08;
            logger.warn(`[TANK] Characteristics not initialized in completeRespawn, using default values`);
        }

        // КРИТИЧНО: Гарантируем, что turretSpeed не равен 0, NaN, Infinity или слишком маленький
        // Это должно быть ДО отправки события respawn, чтобы game.ts получил правильное значение
        const safeDefaultTurretSpeed = 0.08;
        if (!this.turretSpeed || this.turretSpeed === 0 || !isFinite(this.turretSpeed) || isNaN(this.turretSpeed) || this.turretSpeed === Infinity || this.turretSpeed === -Infinity || this.turretSpeed < 0.06) {
            this.turretSpeed = safeDefaultTurretSpeed;
            logger.warn(`[TANK] turretSpeed was invalid after respawn, resetting to ${safeDefaultTurretSpeed}`);
        }
        if (!this.baseTurretSpeed || this.baseTurretSpeed === 0 || !isFinite(this.baseTurretSpeed) || isNaN(this.baseTurretSpeed) || this.baseTurretSpeed === Infinity || this.baseTurretSpeed === -Infinity || this.baseTurretSpeed < 0.06) {
            this.baseTurretSpeed = safeDefaultTurretSpeed;
            logger.warn(`[TANK] baseTurretSpeed was invalid after respawn, resetting to ${safeDefaultTurretSpeed}`);
        }

        // КРИТИЧНО: Ограничиваем максимальную скорость поворота башни
        // После применения бонусов turretSpeed может стать слишком большим
        const maxTurretSpeed = 0.15; // Максимальная скорость поворота башни
        if (this.turretSpeed > maxTurretSpeed) {
            logger.warn(`[TANK] turretSpeed (${this.turretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}), clamping`);
            this.turretSpeed = maxTurretSpeed;
        }
        if (this.baseTurretSpeed > maxTurretSpeed) {
            logger.warn(`[TANK] baseTurretSpeed (${this.baseTurretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}), clamping`);
            this.baseTurretSpeed = maxTurretSpeed;
        }

        // КРИТИЧНО: Финальная проверка перед использованием
        if (!isFinite(this.turretSpeed) || this.turretSpeed <= 0) {
            this.turretSpeed = safeDefaultTurretSpeed;
            logger.error(`[TANK] turretSpeed failed final validation, forcing to ${safeDefaultTurretSpeed}`);
        }
        if (!isFinite(this.baseTurretSpeed) || this.baseTurretSpeed <= 0) {
            this.baseTurretSpeed = safeDefaultTurretSpeed;
            logger.error(`[TANK] baseTurretSpeed failed final validation, forcing to ${safeDefaultTurretSpeed}`);
        }

        // КРИТИЧНО: Сбрасываем ВСЕ переменные, связанные с вращением башни
        this.turretTurnTarget = 0;
        this.turretTurnSmooth = 0;
        this.turretAcceleration = 0;
        this.turretAccelStartTime = 0;
        this.turretLerpSpeed = 0.25;

        // Сбрасываем наклон ствола
        this.barrelPitchTarget = 0;
        this.barrelPitchSmooth = 0;
        this._barrelCurrentRotationX = 0;
        this._barrelTargetRotationX = 0;
        this.barrelPitchAcceleration = 0;
        this.barrelPitchAccelStartTime = 0;
        this.aimPitch = 0;

        // Сбрасываем режим прицеливания
        if (this.isAiming) {
            this.toggleAimMode(false);
        }

        // Очищаем визуализацию траектории
        if (this.aimTrajectoryLine) {
            disposeTrajectoryLine(this.aimTrajectoryLine);
            this.aimTrajectoryLine = null;
        }

        // КРИТИЧНО: Отправляем событие для сброса углов камеры в game.ts ПОСЛЕ сброса вращения
        // Используем несколько попыток чтобы убедиться, что башня уже сброшена
        const sendRespawnEvent = () => {
            if (!this.turret || this.turret.isDisposed()) {
                logger.warn(`[TANK] Cannot send respawn event - turret is missing or disposed!`);
                return;
            }

            const turretRotY = this.turret.rotation.y;
            const chassisRotY = this.chassis.rotationQuaternion
                ? this.chassis.rotationQuaternion.toEulerAngles().y
                : this.chassis.rotation.y;

            // КРИТИЧНО: НЕ сбрасываем флаги управления башней при переодевании!
            // Флаги сбрасываются только при обычном респавне (когда башня была пересоздана)
            const turretWasRecreated = !this.turret || this.turret.isDisposed();
            if (turretWasRecreated) {
                // Башня была пересоздана - сбрасываем флаги (обычный респавн)
                this.isKeyboardTurretControl = false;
                this.isAutoCentering = false;
            }
            // Если башня НЕ была пересоздана (переодевание), НЕ сбрасываем флаги!

            // КРИТИЧНО: Убеждаемся, что turretSpeed не равен 0 и не слишком маленький
            if (!this.turretSpeed || this.turretSpeed === 0 || this.turretSpeed < 0.06) {
                this.turretSpeed = 0.08; // Восстанавливаем стандартную скорость (увеличено)
                logger.warn(`[TANK] turretSpeed was invalid, resetting to 0.08`);
            }

            // КРИТИЧНО: Ограничиваем максимальную скорость поворота башни
            // После применения бонусов turretSpeed может стать слишком большим
            const maxTurretSpeed = 0.15; // Максимальная скорость поворота башни
            if (this.turretSpeed > maxTurretSpeed) {
                logger.warn(`[TANK] turretSpeed (${this.turretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}) in sendRespawnEvent, clamping`);
                this.turretSpeed = maxTurretSpeed;
            }
            if (this.baseTurretSpeed > maxTurretSpeed) {
                logger.warn(`[TANK] baseTurretSpeed (${this.baseTurretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}) in sendRespawnEvent, clamping`);
                this.baseTurretSpeed = maxTurretSpeed;
            }

            window.dispatchEvent(new CustomEvent("tankRespawned", {
                detail: {
                    turretRotY: turretRotY,
                    chassisRotY: chassisRotY
                }
            }));

            logger.log(`[TANK] Respawn event sent: turretRotY=${turretRotY.toFixed(3)}, chassisRotY=${chassisRotY.toFixed(3)}, isKeyboardTurretControl=${this.isKeyboardTurretControl}, isAutoCentering=${this.isAutoCentering}, turretSpeed=${this.turretSpeed}`);
        };

        // КРИТИЧНО: Отправляем событие ТОЛЬКО ОДИН РАЗ!
        // Повторная отправка сбрасывает cameraYaw и вызывает дёрганье башни к центру
        const timeoutId = setTimeout(sendRespawnEvent, 0);
        this.tankTimeouts.push(timeoutId);

        // Сообщение в чат о респавне (БЕЗ визуальных эффектов - пункт 16!)
        if (this.chatSystem) {
            this.chatSystem.success("Респавн в гараже", 1);
        }

        // БЕЗ звука респавна - моментальный телепорт
        // БЕЗ визуальных эффектов - моментальный телепорт (пункт 16)

        // ТЕЛЕПОРТИРУЕМ ТАНК В ГАРАЖ - ЖЁСТКО И ПРИНУДИТЕЛЬНО!
        if (this.chassis && this.physicsBody) {
            const targetX = respawnPos.x;
            const targetZ = respawnPos.z;

            // КРИТИЧНО: Если танк уже находится в гараже (переодевание), сохраняем текущую Y-позицию
            // НЕ поднимаем танк вверх, чтобы он не застревал в потолке
            let targetY = respawnPos.y;

            // Проверяем флаг переодевания на месте (устанавливается из GameGarage)
            const isInPlaceDressingHere = (this as any)._inPlaceDressing === true;

            // Проверяем, находится ли танк в гараже через gameGarage
            const game = (window as any).gameInstance;
            let isInGarage = false;
            if (game && (game as any).gameGarage && typeof (game as any).gameGarage.isPlayerInAnyGarage === 'function') {
                isInGarage = (game as any).gameGarage.isPlayerInAnyGarage();
            }

            // КРИТИЧНО: Если переодевание на месте - используем ТОЧНУЮ позицию из respawnPos
            if (isInPlaceDressingHere) {
                targetY = respawnPos.y;
                logger.log(`[TANK] In-place dressing (teleport): keeping exact Y=${targetY.toFixed(2)}`);
            }
            // Если танк в гараже - используем текущую Y-позицию (не поднимаем)
            else if (isInGarage && this.chassis) {
                targetY = this.chassis.position.y;
                logger.log(`[TANK] Tank is in garage, preserving Y position: ${targetY.toFixed(2)}`);
            } else if (game && typeof game.getGroundHeight === 'function') {
                // Если танк НЕ в гараже и НЕ переодевание - вычисляем высоту террейна и корректируем позицию
                const groundHeight = game.getGroundHeight(targetX, targetZ);
                // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                targetY = groundHeight + 1.0;
                logger.log(`[TANK] Corrected teleport height: ${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)})`);
            } else {
                // Fallback: если game недоступен, используем минимум 2 метра
                if (targetY < 2.0) {
                    targetY = 2.0;
                    logger.warn(`[TANK] Teleport height too low (${respawnPos.y.toFixed(2)}), forcing to 2.0`);
                }
            }

            logger.log(`[TANK] Teleporting to garage: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Z=${targetZ.toFixed(2)}`);

            // 1. ОТКЛЮЧАЕМ физику временно
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);

            // 2. Сбрасываем ВСЕ скорости СРАЗУ
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());

            // 3. Устанавливаем позицию
            this.chassis.position.set(targetX, targetY, targetZ);

            // 4. КРИТИЧНО: НЕ сбрасываем rotation башни при переодевании!
            // Проверяем, была ли башня пересоздана - сравниваем текущий turret с сохранённым в начале
            const turretWasRecreated = !turretExistsBefore || !this.turret || this.turret.isDisposed() ||
                (turretExistsBefore && this.turret !== (this as any)._savedTurretBeforeRespawn);

            // Сбрасываем вращение корпуса (всегда сбрасываем)
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.rotation.set(0, 0, 0);

            if (turretWasRecreated) {
                // Башня была пересоздана - сбрасываем rotation (обычный респавн)
                if (this.turret) {
                    this.turret.rotationQuaternion = Quaternion.Identity();
                    this.turret.rotation.set(0, 0, 0);
                }
            } else {
                // Башня НЕ была пересоздана - НЕ сбрасываем rotation (переодевание)
                // Rotation уже сохранён в начале функции
            }

            if (this.barrel) {
                this.barrel.rotationQuaternion = Quaternion.Identity();
                this.barrel.rotation.set(0, 0, 0);
            }

            // Восстанавливаем rotation башни если она не была пересоздана
            if (!turretWasRecreated && this.turret && !this.turret.isDisposed()) {
                this.turret.rotation.y = savedTurretRotY;
                if (savedTurretRotQuat) {
                    this.turret.rotationQuaternion = savedTurretRotQuat;
                }
                logger.log(`[TANK] Turret rotation restored after respawn (dressing): ${savedTurretRotY.toFixed(3)}`);
            }


            // 5. Обновляем матрицы ПРИНУДИТЕЛЬНО
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);

            // 6. Временно включаем preStep для синхронизации позиции с физикой
            // В ANIMATED режиме это безопасно
            this.physicsBody.disablePreStep = false;

            // 7. Активируем защиту от урона ПОСЛЕ установки позиции (чтобы эффект появился в правильном месте)
            this.activateInvulnerability();

            // 8. Включаем физику обратно через задержку (ОДИН раз, чтобы избежать конфликтов)
            // КРИТИЧНО: Сохраняем флаги для использования в setTimeout
            const turretWasRecreatedForTimeout = turretWasRecreated;
            const isInPlaceDressingForTimeout = isInPlaceDressingHere; // Сохраняем флаг ДО setTimeout
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    // КРИТИЧНО: Если танк в гараже или переодевание на месте, сохраняем текущую Y-позицию (не поднимаем)
                    const game = (window as any).gameInstance;
                    let finalY = targetY;

                    // Используем СОХРАНЁННЫЙ флаг переодевания на месте (не читаем заново, он мог уже сброситься)
                    const isInPlaceDressing = isInPlaceDressingForTimeout;

                    // Проверяем, находится ли танк в гараже
                    let isInGarage = false;
                    if (game && (game as any).gameGarage && typeof (game as any).gameGarage.isPlayerInAnyGarage === 'function') {
                        isInGarage = (game as any).gameGarage.isPlayerInAnyGarage();
                    }

                    // КРИТИЧНО: Если переодевание на месте - используем ТОЧНУЮ Y-позицию из targetY (уже установлена ранее)
                    if (isInPlaceDressing) {
                        finalY = targetY; // targetY уже содержит правильную высоту из respawnPos
                        logger.log(`[TANK] In-place dressing: keeping Y=${finalY.toFixed(2)}`);
                    }
                    // Если танк в гараже - используем текущую Y-позицию (не поднимаем)
                    else if (isInGarage && this.chassis) {
                        finalY = this.chassis.position.y;
                    } else if (game && typeof game.getGroundHeight === 'function') {
                        // Если танк НЕ в гараже - вычисляем высоту террейна
                        const groundHeight = game.getGroundHeight(targetX, targetZ);
                        // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                        finalY = groundHeight + 1.0;
                    }

                    // Убеждаемся, что позиция правильная
                    this.chassis.position.set(targetX, finalY, targetZ);
                    this.chassis.rotationQuaternion = Quaternion.Identity();
                    this.chassis.rotation.set(0, 0, 0);
                    // КРИТИЧНО: Сбрасываем вращение башни ТОЛЬКО если она была пересоздана (не при переодевании!)
                    if (this.turret && turretWasRecreatedForTimeout) {
                        this.turret.rotationQuaternion = Quaternion.Identity();
                        this.turret.rotation.set(0, 0, 0);
                    } else if (this.turret && !turretWasRecreatedForTimeout) {
                        // Башня НЕ была пересоздана - восстанавливаем сохранённый rotation
                        this.turret.rotation.y = savedTurretRotY;
                        if (savedTurretRotQuat) {
                            this.turret.rotationQuaternion = savedTurretRotQuat;
                        }
                        logger.log(`[TANK] Turret rotation restored in setTimeout (dressing): ${savedTurretRotY.toFixed(3)}`);
                    }
                    if (this.barrel) {
                        this.barrel.rotationQuaternion = Quaternion.Identity();
                        this.barrel.rotation.set(0, 0, 0);
                    }
                    this.chassis.computeWorldMatrix(true);
                    if (this.turret) this.turret.computeWorldMatrix(true);
                    if (this.barrel) this.barrel.computeWorldMatrix(true);

                    // Сбрасываем скорости ПЕРЕД включением физики
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());

                    // Включаем физику (disablePreStep уже false, физика возьмёт позицию из меша)
                    this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);

                    // Ещё раз сбрасываем скорости после включения
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());

                    // DisablePreStep freezing REMOVED to fix movement regression
                    // The tank must have PreStep ENABLED to move physically (apply forces)
                    if (this.physicsBody) {
                        this.physicsBody.disablePreStep = false;
                    }


                    logger.log(`[TANK] Physics re-enabled at garage position`);
                }
            }, 100);
        } else {
            logger.error("[TANK] Cannot respawn - chassis or physics body missing!");
        }

        // Обновляем HUD
        if (this.hud) {
            this.hud.setHealth(this.currentHealth, this.maxHealth);
            // Без сообщения о респавне - просто телепорт
        }

        tankLogger.verbose("[TANK] Respawned!");
    }

    // ============ UNIQUE CANNON CREATION ============
    // Moved to tank/tankCannon.ts - функция createUniqueCannon теперь в модуле

    createVisualWheels() {
        // === TRACKS WITH SELECTED TYPE ===
        const trackColor = Color3.FromHexString(this.trackType.color);
        const trackMat = new StandardMaterial("trackMat", this.scene);
        trackMat.diffuseColor = trackColor;
        trackMat.specularColor = Color3.Black();
        trackMat.freeze();

        // Размеры корпуса
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;

        // КРИТИЧНО: Масштабируем размеры гусениц пропорционально корпусу
        // Гусеницы должны быть видимыми и пропорциональными
        const trackWidth = this.trackType.width;  // Ширина гусениц фиксирована
        const trackHeight = this.trackType.height; // Высота гусениц фиксирована
        const trackDepth = d * 0.95; // Гусеницы почти на всю длину корпуса

        // Left track
        this.leftTrack = MeshBuilder.CreateBox("leftTrack", {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.leftTrack.position = new Vector3(-w * 0.55, -h * 0.25, 0);
        this.leftTrack.parent = this.chassis;
        this.leftTrack.material = trackMat;

        // Right track
        this.rightTrack = MeshBuilder.CreateBox("rightTrack", {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.rightTrack.position = new Vector3(w * 0.55, -h * 0.25, 0);
        this.rightTrack.parent = this.chassis;
        this.rightTrack.material = trackMat;

        // Применяем бонусы от типа гусениц
        if (this.trackType.stats.speedBonus) {
            this.moveSpeed *= (1 + this.trackType.stats.speedBonus);
        }
        if (this.trackType.stats.durabilityBonus) {
            this.maxHealth *= (1 + this.trackType.stats.durabilityBonus);
            this.currentHealth = this.maxHealth;
        }
        if (this.trackType.stats.armorBonus) {
            this.maxHealth *= (1 + this.trackType.stats.armorBonus);
            this.currentHealth = this.maxHealth;
        }
    }


    setupInput() {
        this.scene.actionManager = new ActionManager(this.scene);

        // Use window events for better reliability
        const handleKeyDown = (evt: KeyboardEvent) => {
            const code = evt.code;
            this._inputMap[code] = true;

            // Debug: Log key presses for movement keys
            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                if (code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD" ||
                    code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
                    tankLogger.verbose(`[KeyPress] ${code} pressed`);
                }
            }

            // ОТКЛЮЧЕНО: Авто-центрирование башни отключено
            // if (code === "KeyC") {
            //     this.isAutoCentering = true;
            //     console.log("[Tank] C pressed - центровка башни активирована");
            // }
            // Отмена авто-центрирования при ручном управлении башней
            if (code === "KeyZ" || code === "KeyX") {
                this.isAutoCentering = false;
                window.dispatchEvent(new CustomEvent("stopCenterCamera"));
            }

            if (code === "Space") {
                this.isFireKeyPressed = true;
                this.fire(); // Стреляем сразу при нажатии
            }

            // Tracer (P key) - fires tracer round if available and not reloading
            if (code === "KeyP") this.fireTracer();

            // Special chassis abilities (V key)
            if (code === "KeyV") this.activateChassisAbility();

            // Модули (кнопки 6-0)
            if (code === "Digit6" || code === "Numpad6") {
                this.activateModule6();
            }
            if (code === "Digit7" || code === "Numpad7") {
                this.activateModule7();
            }
            if (code === "Digit8" || code === "Numpad8") {
                this.activateModule8();
            }
            if (code === "Digit9" || code === "Numpad9") {
                this.activateModule9();
            }
            if ((code === "Digit0" || code === "Numpad0") && !evt.ctrlKey && !evt.metaKey) {
                // Начинаем зарядку прыжка (игнорируем, если нажата Ctrl - используется для других функций)
                const now = Date.now();
                logger.log(`[TANK] Key 0 pressed: module0Charging=${this.module0Charging}, canJump=${this.canJump}, hasPhysics=${!!this.physicsBody}, isAlive=${this.isAlive}`);

                if (!this.module0Charging && this.canJump && this.physicsBody && this.isAlive) {
                    // Проверка кулдауна
                    if (now - this.module0LastUse < this.module0Cooldown) {
                        const remaining = ((this.module0Cooldown - (now - this.module0LastUse)) / 1000).toFixed(1);
                        if (this.chatSystem) {
                            this.chatSystem.log(`Модуль 0 на кулдауне: ${remaining}с`);
                        }
                        logger.log(`[TANK] Module 0 on cooldown: ${remaining}s`);
                        return;
                    }
                    this.module0Charging = true;
                    this.module0ChargeStart = Date.now();
                    this.module0ChargePower = 0;
                    logger.log(`[TANK] Module 0 charging started`);
                    if (this.chatSystem) {
                        this.chatSystem.log("Прыжок: зарядка...");
                    }
                } else {
                    // Throttle: логируем не чаще раз в 5 секунд
                    const now = Date.now();
                    if (!this._lastJumpWarnTime || now - this._lastJumpWarnTime > 5000) {
                        logger.warn(`[TANK] Cannot start jump: module0Charging=${this.module0Charging}, canJump=${this.canJump}`);
                        this._lastJumpWarnTime = now;
                    }
                }
            }
        };

        const handleKeyUp = (evt: KeyboardEvent) => {
            this._inputMap[evt.code] = false;

            // Сбрасываем флаг стрельбы при отпускании пробела
            if (evt.code === "Space") {
                this.isFireKeyPressed = false;
            }

            // Модуль 9: Останавливаем платформу при отпускании кнопки
            if (evt.code === "Digit9" || evt.code === "Numpad9") {
                if (this.module9Active) {
                    this.deactivateModule9Platform();
                }
            }

            // Модуль 0: Выполняем прыжок при отпускании кнопки
            // Игнорируем, если была нажата Ctrl (используется для других функций, например Ctrl+0 для редактора физики)
            if ((evt.code === "Digit0" || evt.code === "Numpad0") && !evt.ctrlKey && !evt.metaKey) {
                if (this.module0Charging) {
                    logger.log(`[TANK] Key 0 released, executing jump`);
                    this.executeModule0Jump();
                }
                // Убрано предупреждение - это нормальная ситуация, если клавиша 0 использовалась для других целей
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        // Also use scene keyboard observable as backup
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const evt = kbInfo.event;
            const code = evt.code;
            const isPressed = kbInfo.type === 1;
            this._inputMap[code] = isPressed;

            if (code === "Space") {
                if (isPressed) {
                    this.isFireKeyPressed = true;
                    this.fire(); // Стреляем сразу при нажатии
                } else {
                    this.isFireKeyPressed = false;
                }
            }
        });

        // Mouse control for turret and aiming
        const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;

        // Pointer lock change detection
        document.addEventListener("pointerlockchange", () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
            if (!this.isPointerLocked) {
                this.lastMouseX = 0; // Сбрасываем позицию мыши при выходе из pointer lock
            }
            // Явное использование lastMouseX для подавления предупреждения линтера
            void this.lastMouseX;
        });

        // ВАЖНО: Управление мышкой обрабатывается в game.ts для синхронизации с режимом прицеливания
        // Здесь только клавиатурное управление (Z, X, C) - работает ВСЕГДА

        // Prevent context menu on RMB (используем уже объявленный canvas)
        if (canvas) {
            canvas.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                return false;
            });
        }

        // Left click - enter pointer lock and ALWAYS shoot
        this.scene.onPointerDown = (evt) => {
            if (evt.button === 0) { // Left click
                // Pointer lock handled by browser
                if (canvas) {
                    try {
                        canvas.requestPointerLock();
                    } catch (err) {
                        // Pointer lock error - ignore
                    }
                }
                if (!isMobileDevice()) {
                    // Устанавливаем флаг зажатой ЛКМ и стреляем сразу (ТОЛЬКО НА ПК)
                    this.isMouseButtonPressed = true;
                    this.fire();
                } else {
                    // На мобильных устройствах стрельба только через кнопку, но вход в Pointer Lock (если поддерживается) оставляем
                }
            }
            if (evt.button === 2) { // Right click - AIM MODE
                // RMB pressed - aim mode ON
                this.toggleAimMode(true);
            }
        };

        this.scene.onPointerUp = (evt) => {
            if (evt.button === 0) { // Left click released
                this.isMouseButtonPressed = false;
            }
            if (evt.button === 2) { // Release right click
                // RMB released - aim mode OFF
                this.toggleAimMode(false);
            }
        };

        // Ctrl key for aim mode too
        window.addEventListener("keydown", (e) => {
            if (e.code === "ControlLeft" || e.code === "ControlRight") {
                // CTRL keydown - aim mode ON
                this.toggleAimMode(true);
            }
        });
        window.addEventListener("keyup", (e) => {
            if (e.code === "ControlLeft" || e.code === "ControlRight") {
                // CTRL keyup - aim mode OFF
                this.toggleAimMode(false);
            }
        });

        // Автоматическая стрельба при зажатой кнопке (пробел или ЛКМ)
        this.scene.registerBeforeRender(() => {
            // Проверяем, зажата ли кнопка стрельбы
            if (this.isFireKeyPressed || this.isMouseButtonPressed) {
                // Стреляем автоматически, метод fire() сам проверит cooldown
                this.fire();
            }
        });

        // Сбрасываем флаги при потере фокуса окна (чтобы избежать "залипания" кнопок)
        window.addEventListener("blur", () => {
            this.isFireKeyPressed = false;
            this.isMouseButtonPressed = false;
        });
    }

    // === AIM MODE ===
    isAiming = false;

    toggleAimMode(enabled: boolean) {
        // toggleAimMode called - performance optimized by removing log
        if (this.isAiming === enabled) return;
        this.isAiming = enabled;

        // Dispatch event for camera to handle zoom
        window.dispatchEvent(new CustomEvent("aimModeChanged", { detail: { aiming: enabled } }));
        // aimModeChanged event dispatched

        if (this.hud) {
            this.hud.setAimMode(enabled);
        }

        // Управляем визуализацией траектории
        if (enabled && this.showProjectileTrajectory) {
            // Включаем траекторию при прицеливании
            this.updateAimTrajectory();
        } else {
            // Скрываем траекторию когда не прицеливаемся
            if (this.aimTrajectoryLine) {
                this.aimTrajectoryLine.setEnabled(false);
            }
        }
    }

    /**
     * Обновляет визуализацию траектории при прицеливании
     */
    private updateAimTrajectory(): void {
        if (!this.isAiming || !this.showProjectileTrajectory || !this.scene || !this.barrel || !this.cannonType) {
            if (this.aimTrajectoryLine) {
                this.aimTrajectoryLine.setEnabled(false);
            }
            return;
        }

        try {
            // Получаем позицию и направление ствола
            this.barrel.computeWorldMatrix(true);
            const barrelPosition = this.barrel.getAbsolutePosition();
            const barrelDirection = this.barrel.getDirection(Vector3.Forward()).normalize();

            // Вычисляем позицию дула
            const barrelLength = this.cannonType.barrelLength || 2;
            const muzzlePosition = barrelPosition.add(barrelDirection.scale(barrelLength));
            muzzlePosition.y += 0.3; // Немного выше для визуализации

            // Обновляем или создаем линию траектории
            this.aimTrajectoryLine = updateTrajectoryLine(
                this.aimTrajectoryLine,
                this.scene,
                this.cannonType,
                muzzlePosition,
                barrelDirection,
                300 // Максимальная дальность визуализации
            );

            if (this.aimTrajectoryLine) {
                this.aimTrajectoryLine.setEnabled(true);
            }
        } catch (error) {
            console.warn("[TankController] Failed to update aim trajectory:", error);
        }
    }

    // ============ MOVEMENT MODULE DELEGATION ============
    private updateInputs() {
        return this.movementModule.updateInputs();
    }

    reset() {
        return this.movementModule.reset();
    }

    // === АВТОНАВОДКА: Найти врага в линии огня ===
    private findTargetInLineOfFire(origin: Vector3, direction: Vector3, maxDistance: number = 200, coneAngle: number = 0.05): Vector3 | null {
        // Используем статический список всех врагов
        const enemies = EnemyTank.getAllEnemies();
        if (!enemies || enemies.length === 0) return null;

        let closestTarget: Vector3 | null = null;
        let closestDot = Math.cos(coneAngle); // Минимальный dot product для попадания в конус
        let closestDistance = maxDistance;

        for (const enemy of enemies) {
            if (!enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

            const enemyPos = enemy.chassis.getAbsolutePosition();
            const toEnemy = enemyPos.subtract(origin);
            const distance = toEnemy.length();

            if (distance > maxDistance || distance < 5) continue; // Слишком далеко или слишком близко

            const dirToEnemy = toEnemy.normalize();
            const dot = Vector3.Dot(direction, dirToEnemy);

            // Враг в линии огня (в узком конусе перед стволом)?
            if (dot > closestDot && distance < closestDistance) {
                closestDot = dot;
                closestDistance = distance;
                // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
                if (closestTarget) vector3Pool.release(closestTarget);
                closestTarget = vector3Pool.acquire(enemyPos.x, enemyPos.y, enemyPos.z);
            }
        }

        return closestTarget;
    }

    // === АВТОНАВОДКА ПО ВЕРТИКАЛИ ===
    private findTargetInVerticalRange(
        origin: Vector3,
        barrelDirection: Vector3,
        maxDistance: number = 200,
        verticalAngleTolerance: number = 0.0436 // ±2.5° в радианах
    ): Vector3 | null {
        // Вычисляем углы ствола
        const barrelHorizontalDist = Math.sqrt(barrelDirection.x * barrelDirection.x + barrelDirection.z * barrelDirection.z);
        const barrelPitch = Math.atan2(barrelDirection.y, barrelHorizontalDist);
        const barrelYaw = Math.atan2(barrelDirection.x, barrelDirection.z);

        // Ограничение по горизонтали (Line of Attack) - ±10 градусов
        const HORIZONTAL_TOLERANCE = 0.175; // ~10 градусов

        let closestTarget: Vector3 | null = null;
        let closestDistanceSq = maxDistance * maxDistance;
        const maxDistanceSq = maxDistance * maxDistance;
        const minDistanceSq = 5 * 5;

        const checkTarget = (targetPos: Vector3) => {
            const toTarget = targetPos.subtract(origin);
            const distanceSq = toTarget.lengthSquared();

            if (distanceSq > maxDistanceSq || distanceSq < minDistanceSq) return;

            const dx = toTarget.x;
            const dy = toTarget.y;
            const dz = toTarget.z;
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);

            // 1. Проверка по ВЕРТИКАЛИ (Pitch)
            const targetPitch = Math.atan2(dy, horizontalDist);
            const pitchDiff = Math.abs(targetPitch - barrelPitch);
            if (pitchDiff > verticalAngleTolerance) return;

            // 2. Проверка по ГОРИЗОНТАЛИ (Yaw) - "Line of Attack"
            const targetYaw = Math.atan2(dx, dz);
            let yawDiff = Math.abs(targetYaw - barrelYaw);
            // Нормализация угла (чтобы -PI и +PI были рядом)
            if (yawDiff > Math.PI) yawDiff = Math.PI * 2 - yawDiff;

            if (yawDiff > HORIZONTAL_TOLERANCE) return;

            // Если подходит по обоим углам
            if (distanceSq < closestDistanceSq) {
                closestDistanceSq = distanceSq;
                if (closestTarget) vector3Pool.release(closestTarget);
                closestTarget = vector3Pool.acquire(targetPos.x, targetPos.y, targetPos.z);
            }
        };

        // === ПРОВЕРКА ВРАЖЕСКИХ ТАНКОВ ===
        const enemies = EnemyTank.getAllEnemies();
        if (enemies && enemies.length > 0) {
            for (const enemy of enemies) {
                if (!enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;
                checkTarget(enemy.chassis.getAbsolutePosition());
            }
        }

        // === ПРОВЕРКА ТУРЕЛЕЙ ВРАГОВ ===
        if (this.enemyManager && this.enemyManager.turrets) {
            for (const turret of this.enemyManager.turrets) {
                if (!turret.isAlive || !turret.base || turret.isDestroyed || turret.base.isDisposed()) continue;
                checkTarget(turret.base.getAbsolutePosition());
            }
        }

        // === ПРОВЕРКА СЕТЕВЫХ ИГРОКОВ (МУЛЬТИПЛЕЕР) ===
        if (this.networkPlayers && this.networkPlayers.size > 0) {
            for (const [playerId, networkTank] of this.networkPlayers) {
                if (!networkTank || !networkTank.chassis || networkTank.chassis.isDisposed()) continue;
                if (networkTank.networkPlayer && networkTank.networkPlayer.status !== "alive") continue;
                checkTarget(networkTank.chassis.getAbsolutePosition());
            }
        }

        return closestTarget;
    }

    fire() {
        try {
            if (!this.isAlive) return;

            const now = Date.now();
            if (this.isReloading || now - this.lastShotTime < this.cooldown) return;

            // Get muzzle position and direction (exactly along barrel forward)
            const wasBarrelEnabled = this.barrel.isEnabled();
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(true);
            }

            // Force compute world matrix for accurate direction
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);

            // КРИТИЧЕСКИ ВАЖНО: Получаем фактическое направление ствола напрямую
            let shootDirection = this.barrel.getDirection(Vector3.Forward()).normalize();

            // === АВТОНАВОДКА ПО ВЕРТИКАЛИ ===
            // Проверяем, есть ли враг в вертикальном диапазоне ±2.5° и в секторе атаки
            const muzzlePreviewPos = this.barrel.getAbsolutePosition();
            const verticalAimTarget = this.findTargetInVerticalRange(
                muzzlePreviewPos,
                shootDirection,
                200,    // Дистанция
                0.0436  // ±2.5° Pitch tolerance
            );

            if (verticalAimTarget) {
                // Враг найден в диапазоне атаки.
                // КРИТИЧНО: Корректируем ТОЛЬКО Pitch (вертикаль), сохраняя Yaw (горизонталь) игрока.
                // Это предотвращает "срыв" прицела в сторону.

                const toTarget = verticalAimTarget.subtract(muzzlePreviewPos);
                const horizontalDist = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
                const targetPitch = Math.atan2(toTarget.y, horizontalDist);

                // Текущий Yaw ствола
                const currentYaw = Math.atan2(shootDirection.x, shootDirection.z);

                // Создаём новый вектор: Yaw как у игрока, Pitch - точно в цель
                // Y = sin(pitch)
                // X = cos(pitch) * sin(yaw)
                // Z = cos(pitch) * cos(yaw)
                // Примечание: В Babylon/Unity coordinate system Z is forward check carefully.
                // Assuming Standard: Y up. X/Z ground. 
                // X = sin(yaw) * horizontal_len, Z = cos(yaw) * horizontal_len
                // horizontal_len = cos(pitch)

                const cosPitch = Math.cos(targetPitch);
                const sinPitch = Math.sin(targetPitch);

                shootDirection = new Vector3(
                    Math.sin(currentYaw) * cosPitch,
                    sinPitch,
                    Math.cos(currentYaw) * cosPitch
                ).normalize();
            }


            // ВАЖНО: Используем shootDirection (фактическое направление ствола) для направления выстрела
            // shootDirection получен напрямую из barrel.getDirection(), что гарантирует точность
            const forward = shootDirection;

            // Получаем позицию конца ствола (дульный срез)
            // Используем реальную длину ствола для точного позиционирования
            const barrelLength = this.cannonType.barrelLength;

            // КРИТИЧНО: Обновляем матрицы всей иерархии!
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);

            const barrelCenter = this.barrel.getAbsolutePosition();

            // ДИАГНОСТИКА: Проверяем позицию ствола
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                tankLogger.debug(`[FIRE] Barrel: ${this.barrel.name}, Pos: ${barrelCenter}, Chassis: ${this.chassis.getAbsolutePosition()}`);
                if (barrelCenter.length() < 0.1) {
                    tankLogger.warn(`[FIRE] ⚠️ Suspicious barrel position (near zero)! Mesh might be detached or not updated.`);
                    // Force matrix update again just in case
                    this.barrel.computeWorldMatrix(true);
                    // Retry getting position
                    const newCenter = this.barrel.getAbsolutePosition();
                    tankLogger.warn(`[FIRE] ⚠️ Retry Pos: ${newCenter}`);
                }
            }

            // ВАЖНО: После установки pivot, позиция дула должна рассчитываться на основе реального направления выстрела
            // Используем shootDirection (forward) для расчета позиции дула, так как это правильное направление
            // Позиция дула = центр ствола + направление выстрела * (половина длины + смещение вперед для избежания коллизии)
            const muzzleOffset = 0.3; // Смещение вперед от конца ствола для избежания коллизии с самим стволом
            const muzzlePos = barrelCenter.add(forward.scale(barrelLength / 2 + muzzleOffset));



            // Возвращаем состояние barrel обратно
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(false);
            }

            // === ПРОВЕРКА ПРЕПЯТСТВИЙ ПЕРЕД СТВОЛОМ ===
            // Проверяем, не упирается ли ствол в препятствие (стена, здание и т.д.)
            // Используем forward (shootDirection) для проверки препятствий
            if (this.checkBarrelObstacle(muzzlePos, forward, 1.5)) {
                if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                    tankLogger.debug("[FIRE] Shot blocked by obstacle in front of barrel!");
                }
                // Опционально: воспроизвести звук блокировки
                if (this.soundManager) {
                    this.soundManager.playHit("armor", muzzlePos);
                }
                // НЕ начисляем кулдаун - игрок может попробовать снова сразу
                // НЕ вызываем this.isReloading = true
                return; // Не создаём снаряд - выстрел заблокирован
            }

            // Устанавливаем перезарядку только если выстрел не заблокирован
            this.lastShotTime = now;
            this.isReloading = true;

            // ИСПРАВЛЕНО: Запускаем перезарядку на HUD
            if (this.hud) {
                this.hud.startReload(this.cooldown);
                this.hud.notifyPlayerShot(); // Tutorial notification
            }

            // End reload after cooldown
            // УЛУЧШЕНО: Добавлен failsafe timeout для предотвращения зависания
            const reloadTimeout = setTimeout(() => {
                this.isReloading = false;
                if (this.soundManager) {
                    this.soundManager.playReloadComplete();
                }
            }, this.cooldown);

            // FAILSAFE: Если через 2x cooldown reload всё еще active - принудительно сбрасываем
            setTimeout(() => {
                if (this.isReloading) {
                    console.warn('[TankController] FAILSAFE: Reload was stuck, forcing reset');
                    this.isReloading = false;
                }
            }, this.cooldown * 2 + 500);

            // Play shooting sound (с учётом типа пушки) with 3D positioning
            if (this.soundManager) {
                // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
                const soundPos = vector3Pool.acquire(muzzlePos.x, muzzlePos.y, muzzlePos.z);
                this.soundManager.playShoot(this.cannonType.id, soundPos);
                vector3Pool.release(soundPos);
            }

            // Записываем выстрел для опыта пушки
            if (this.experienceSystem) {
                this.experienceSystem.recordShot(this.cannonType.id);
            }
            // Записываем выстрел в статистику игрока
            if (this.playerProgression) {
                this.playerProgression.recordShot(false);
            }

            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                combatLogger.debug("[FIRE] Cannon fired!");
            }

            // Special handling for Support cannon
            if (this.cannonType.id === "support") {
                this.fireSupportBeam(muzzlePos, shootDirection);
                return; // Support doesn't create regular projectile
            }

            // Send shoot event to multiplayer server
            if (this.onShootCallback) {
                this.onShootCallback({
                    position: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                    direction: { x: forward.x, y: forward.y, z: forward.z }, // Используем forward (shootDirection)
                    aimPitch: this.aimPitch,
                    cannonType: this.cannonType.id,
                    damage: this.damage,
                    timestamp: Date.now()
                });
            }

            // Create muzzle flash effect with cannon type
            // Используем forward (shootDirection) для эффекта вспышки
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos, forward, this.cannonType.id);
            }

            // === ПРОВЕРКА СТЕНЫ ПЕРЕД СОЗДАНИЕМ СНАРЯДА ===
            // Проверяем, не упирается ли ствол в стену
            // Используем forward (shootDirection) для проверки стен
            const wallCheck = this.checkWallCollisionRaycast(muzzlePos, forward, 0.5);
            if (wallCheck.hit && wallCheck.wallMesh && wallCheck.hitPoint) {
                // Выстрел блокируется стеной - создаём эффект попадания и наносим урон
                const bulletDamage = this.damage;

                if (wallCheck.wallType === "protectiveWall") {
                    // Наносим урон защитной стенке
                    this.damageWall(wallCheck.wallMesh, bulletDamage);
                } else if (wallCheck.wallType === "enemyWall") {
                    // Наносим урон стенке врага
                    const wallMeta = wallCheck.wallMesh.metadata as any;
                    if (wallMeta && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                        wallMeta.owner.damageEnemyWall(bulletDamage);
                    }
                }

                // Создаём эффект попадания
                if (this.effectsManager) {
                    this.effectsManager.createHitSpark(wallCheck.hitPoint);
                }
                if (this.soundManager) {
                    this.soundManager.playHit("armor", wallCheck.hitPoint);
                }

                if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                    combatLogger.debug("[FIRE] Shot blocked by wall!");
                }
                return; // Не создаём снаряд - выстрел заблокирован
            }

            // Create projectile - используем параметры пушки
            // forward теперь равен shootDirection (правильное направление выстрела)


            // Размер снаряда из типа пушки
            const bulletSize = this.projectileSize;

            // Special handling for different cannon types
            let projectileMesh: Mesh;
            let projectileMaterial: StandardMaterial;
            let projectileColor: Color3;

            // Set unique colors and materials based on cannon type
            switch (this.cannonType.id) {
                case "plasma":
                    projectileColor = new Color3(1, 0, 1); // Magenta
                    break;
                case "laser":
                    projectileColor = new Color3(1, 0, 0); // Red
                    break;
                case "tesla":
                    projectileColor = new Color3(0, 1, 1); // Cyan
                    break;
                case "rocket":
                case "explosive":
                case "mortar":
                case "cluster":
                    projectileColor = new Color3(1, 0.5, 0); // Orange
                    break;
                case "flamethrower":
                    projectileColor = new Color3(1, 0.3, 0); // Fire orange
                    break;
                case "acid":
                    projectileColor = new Color3(0, 1, 0); // Green
                    break;
                case "freeze":
                    projectileColor = new Color3(0.5, 0.8, 1); // Light blue
                    break;
                case "poison":
                    projectileColor = new Color3(0.5, 0, 1); // Purple
                    break;
                case "emp":
                    projectileColor = new Color3(1, 1, 0); // Yellow
                    break;
                case "beam":
                    projectileColor = new Color3(1, 0, 0.5); // Pink
                    break;
                default:
                    projectileColor = new Color3(1, 1, 0); // Yellow (default)
            }

            // Create projectile mesh with unique shape for some types
            if (this.cannonType.id === "shotgun") {
                // Shotgun fires multiple projectiles
                this.fireShotgunSpread(muzzlePos, shootDirection);
                return; // Shotgun handled separately
            } else if (this.cannonType.id === "cluster") {
                // Cluster splits into multiple projectiles
                this.fireClusterProjectiles(muzzlePos, shootDirection);
                return; // Cluster handled separately
            } else {
                // Standard projectile - УВЕЛИЧЕННЫЙ РАЗМЕР для видимости
                projectileMesh = MeshBuilder.CreateBox("bullet", {
                    width: bulletSize * 2, // УВЕЛИЧЕНО в 2 раза
                    height: bulletSize * 2, // УВЕЛИЧЕНО в 2 раза
                    depth: bulletSize * 4 // УВЕЛИЧЕНО в 2 раза
                }, this.scene);
            }

            projectileMesh.position.copyFrom(muzzlePos);
            projectileMesh.lookAt(projectileMesh.position.add(forward));

            // Create unique material for projectile - ЯРЧЕ для видимости
            projectileMaterial = new StandardMaterial("projectileMat", this.scene);
            projectileMaterial.diffuseColor = projectileColor;
            projectileMaterial.emissiveColor = projectileColor.scale(2.0); // УВЕЛИЧЕНО свечение до 2.0
            projectileMaterial.disableLighting = true;
            // Добавляем свечение для лучшей видимости
            (projectileMaterial as any).emissiveIntensity = 3.0; // УВЕЛИЧЕНО до 3.0
            // Добавляем глосси для лучшей видимости
            projectileMaterial.specularColor = projectileColor.scale(0.5);
            // metallicFactor не существует в StandardMaterial, используем emissiveColor для эффекта
            projectileMesh.material = projectileMaterial;

            // Enhanced metadata with special properties
            const specialProperties: any = {
                isHoming: this.cannonType.id === "homing",
                isExplosive: ["rocket", "explosive", "mortar", "cluster"].includes(this.cannonType.id),
                isPiercing: this.cannonType.id === "piercing",
                isChain: this.cannonType.id === "tesla",
                explosionRadius: this.cannonType.id === "rocket" ? 8 : this.cannonType.id === "mortar" ? 12 : this.cannonType.id === "explosive" ? 6 : 0,
                chainRange: this.cannonType.id === "tesla" ? 15 : 0,
                chainTargets: this.cannonType.id === "tesla" ? 3 : 0,
                effectType: this.cannonType.id // For hit effects
            };

            projectileMesh.metadata = {
                type: "bullet",
                owner: "player",
                damage: this.damage,
                cannonType: this.cannonType.id,
                ...specialProperties
            };

            // Create unique bullet trail effect
            if (this.effectsManager) {
                this.effectsManager.createBulletTrail(projectileMesh, projectileColor, this.cannonType.id);
            }

            const ball = projectileMesh; // For compatibility with existing code

            // Special handling for homing projectiles
            if (specialProperties.isHoming && this.enemyTanks) {
                ball.metadata.homingTarget = null;
                ball.metadata.homingStrength = 0.15; // How strongly it tracks
            }

            const shape = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: { extents: new Vector3(bulletSize * 0.75, bulletSize * 0.75, bulletSize * 2) }
            }, this.scene);
            shape.filterMembershipMask = 4; // Player bullet group
            shape.filterCollideMask = 2 | 8 | 32; // Can collide with environment (2), enemy tanks (8), and protective walls (32)

            const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            // АРКАДНЫЙ СТИЛЬ: Минимальная масса - снаряд НЕ толкает танки при попадании
            body.setMassProperties({ mass: 0.001 });
            body.setLinearDamping(0.01);

            // Скорость снаряда из типа пушки (уменьшен импульс из-за малой массы)
            const impulse = this.projectileSpeed * 0.018;

            body.applyImpulse(forward.scale(impulse), ball.position);


            // === GUN FEEL: УСИЛЕННАЯ ОТДАЧА ===
            // Множитель отдачи зависит от типа пушки
            const recoilMultiplier = this.cannonType.recoilMultiplier ?? 1.0;

            // 1. Физическая отдача - применяется как импульс к дулу/башне для создания рычага
            const recoilConfig = PHYSICS_CONFIG.shooting.recoil;
            const effectiveRecoilForce = this.recoilForce * recoilMultiplier;
            const recoilForceVec = forward.scale(-effectiveRecoilForce);

            // GUN FEEL: Применяем отдачу к дулу/башне вместо центра масс для создания крутящего момента
            if (recoilConfig.applicationPoint === "muzzle") {
                const barrelWorldPos = this.barrel.getAbsolutePosition();
                this.physicsBody.applyImpulse(recoilForceVec, barrelWorldPos);
            } else {
                // Fallback на центр масс (старое поведение)
                this.physicsBody.applyImpulse(recoilForceVec, this.chassis.absolutePosition);
            }

            // 2. Угловая отдача - танк наклоняется назад (усилена для аркадного геймплея)
            const effectiveRecoilTorque = this.recoilTorque * recoilMultiplier;
            const barrelWorldPos = this.barrel.getAbsolutePosition();
            const chassisPos = this.chassis.absolutePosition;
            const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
            this.applyTorque(new Vector3(-torqueDir.z * effectiveRecoilTorque, 0, torqueDir.x * effectiveRecoilTorque));

            // 3. Визуальный откат пушки - пушка откатывается назад и поднимается
            // Устанавливаем текущие значения отката (мгновенно)
            this.barrelRecoilOffset = this.barrelRecoilAmount; // Откат пушки назад
            this._barrelRecoilY = 0.15; // Пушка поднимается при отдаче
            // Целевые значения - возврат в исходное положение (0)
            this.barrelRecoilTarget = 0;
            this._barrelRecoilYTarget = 0;

            // 4. Выброс гильзы (используем forward - barrelForward)
            this.projectilesModule.createShellCasing(muzzlePos, forward);

            // ВАЖНО: Отдача НЕ влияет на камеру - только физика танка и визуальный откат пушки

            // === ПРОВЕРКА ПОПАДАНИЙ ===
            const projectileDamage = this.damage; // Урон из типа пушки
            let hasHit = false;
            let ricochetCount = 0;

            // Создаём систему рикошета с учётом типа пушки
            const ricochetConfig: RicochetConfig = this.cannonType.id === "ricochet"
                ? { ...RICOCHET_CANNON_CONFIG, maxRicochets: (this.cannonType.maxRicochets || 5) }
                : { ...DEFAULT_RICOCHET_CONFIG, maxRicochets: (this.cannonType.maxRicochets || 3) };

            // Учитываем параметры пушки
            if (this.cannonType.ricochetSpeedRetention) {
                ricochetConfig.ricochetSpeedRetention = this.cannonType.ricochetSpeedRetention;
            }
            if (this.cannonType.ricochetAngle) {
                ricochetConfig.baseRicochetAngle = this.cannonType.ricochetAngle;
            }

            const ricochetSystem = new RicochetSystem(ricochetConfig);
            const maxRicochets = ricochetConfig.maxRicochets;

            // === ОСНОВНАЯ ПРОВЕРКА ПО РАССТОЯНИЮ (надёжнее чем физика!) ===
            const HIT_RADIUS_TANK = 4.0;   // Радиус попадания в танк
            const HIT_RADIUS_TURRET = 2.5; // Радиус попадания в турель

            // Сохраняем предыдущую позицию для рейкаста
            // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
            let prevBulletPos = vector3Pool.acquire(
                ball.absolutePosition.x,
                ball.absolutePosition.y,
                ball.absolutePosition.z
            );

            const checkHit = () => {
                if (hasHit || ball.isDisposed()) {
                    // Освобождаем prevBulletPos при завершении
                    if (prevBulletPos) vector3Pool.release(prevBulletPos);
                    return;
                }

                const bulletPos = ball.absolutePosition;
                const bulletMeta = ball.metadata as any;

                // === УЛУЧШЕННАЯ ПРОВЕРКА СТЕН С РЕЙКАСТОМ ===
                // Используем рейкаст от предыдущей позиции к текущей для обнаружения быстрых снарядов
                const moveDistance = Vector3.Distance(prevBulletPos, bulletPos);
                if (moveDistance > 0.1) { // Только если снаряд переместился достаточно
                    const moveDirection = bulletPos.subtract(prevBulletPos).normalize();
                    const ray = new Ray(prevBulletPos, moveDirection, moveDistance + 0.5);

                    // Проверяем защитные стены
                    for (const wallData of this.module6Walls) {
                        if (!wallData.mesh || wallData.mesh.isDisposed()) continue;

                        const pick = this.scene.pickWithRay(ray, (mesh) => {
                            return mesh === wallData.mesh;
                        });

                        if (pick && pick.hit && pick.pickedPoint) {
                            // Проверяем, что точка попадания внутри стены
                            if (this.checkPointInWall(pick.pickedPoint, wallData.mesh, "protectiveWall")) {
                                hasHit = true;
                                const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                                this.damageWall(wallData.mesh, bulletDamage);
                                if (this.effectsManager) this.effectsManager.createHitSpark(pick.pickedPoint);
                                if (this.soundManager) this.soundManager.playHit("armor", pick.pickedPoint);
                                ball.dispose();
                                return;
                            }
                        }
                    }

                    // Проверяем стены врагов
                    // ОПТИМИЗАЦИЯ: Кэшируем результат filter для enemyWalls
                    if (!this._cachedEnemyWalls || this._enemyWallsCacheFrame !== this._logFrameCounter) {
                        this._cachedEnemyWalls = this.scene.meshes.filter(mesh =>
                            mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                        );
                        this._enemyWallsCacheFrame = this._logFrameCounter;
                    }
                    const enemyWalls = this._cachedEnemyWalls;
                    for (const wall of enemyWalls) {
                        const wallMesh = wall as Mesh;
                        const pick = this.scene.pickWithRay(ray, (mesh) => {
                            return mesh === wallMesh;
                        });

                        if (pick && pick.hit && pick.pickedPoint) {
                            if (this.checkPointInWall(pick.pickedPoint, wallMesh, "enemyWall")) {
                                hasHit = true;
                                const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                                const wallMeta = wall.metadata as any;
                                if (wallMeta && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                                    wallMeta.owner.damageEnemyWall(bulletDamage);
                                }
                                if (this.effectsManager) this.effectsManager.createHitSpark(pick.pickedPoint);
                                if (this.soundManager) this.soundManager.playHit("armor", pick.pickedPoint);
                                ball.dispose();
                                return;
                            }
                        }
                    }
                }

                // === NETWORK PLAYER HIT DETECTION (Capsule Cast - Client-Authoritative) ===
                // Check hits against network players in multiplayer mode
                if (this.networkPlayers && this.networkPlayers.size > 0 && moveDistance > 0.1) {
                    const CAPSULE_RADIUS = 5.5; // Capsule radius for generous hit detection
                    const CAPSULE_RADIUS_SQ = CAPSULE_RADIUS * CAPSULE_RADIUS;

                    // DIAGNOSTIC: Log disabled for cleaner console
                    // if (this._logFrameCounter % 60 === 0) {
                    //     console.log(`[TankController] 🔍 Checking ${this.networkPlayers.size} network players for hit detection. Bullet at (${bulletPos.x.toFixed(1)}, ${bulletPos.y.toFixed(1)}, ${bulletPos.z.toFixed(1)})`);
                    // }

                    for (const [playerId, networkTank] of this.networkPlayers.entries()) {
                        // FIXED: Use getHealth() method and check networkPlayer.status
                        if (!networkTank || !networkTank.chassis) continue;
                        const tankHealth = networkTank.getHealth ? networkTank.getHealth() : 100;
                        const tankStatus = networkTank.networkPlayer?.status || "alive";
                        if (tankHealth <= 0 || tankStatus === "dead") continue;

                        const targetPos = networkTank.chassis.absolutePosition;

                        // Calculate distance from bullet trajectory to tank center (Capsule Cast)
                        const rayDir = bulletPos.subtract(prevBulletPos);
                        const rayLengthSq = rayDir.lengthSquared();

                        let distSqToSegment: number;
                        let impactPoint: Vector3;

                        if (rayLengthSq < 0.001) {
                            distSqToSegment = Vector3.DistanceSquared(bulletPos, targetPos);
                            impactPoint = bulletPos;
                        } else {
                            const w = targetPos.subtract(prevBulletPos);
                            const t = Math.max(0, Math.min(1, Vector3.Dot(w, rayDir) / rayLengthSq));
                            const closestPoint = prevBulletPos.add(rayDir.scale(t));
                            distSqToSegment = Vector3.DistanceSquared(closestPoint, targetPos);
                            impactPoint = closestPoint;
                        }

                        if (distSqToSegment < CAPSULE_RADIUS_SQ) {
                            hasHit = true;
                            console.log(`[TankController] 🎯 CAPSULE HIT on network player ${playerId}!`);

                            // Get damage from projectile metadata
                            const bulletDamage = bulletMeta?.damage || 25;
                            const cannonTypeId = bulletMeta?.cannonType || this.cannonType.id || "standard";

                            // CRITICAL: Send hit to server via callback
                            if (this.onNetworkPlayerHitCallback) {
                                this.onNetworkPlayerHitCallback(playerId, bulletDamage, impactPoint, cannonTypeId);
                            }

                            // Visual/audio feedback
                            this.createHitEffect(impactPoint, cannonTypeId);
                            if (this.soundManager) this.soundManager.playHit("normal", impactPoint);

                            // Show hit marker
                            if (this.hud) this.hud.showHitMarker(false);

                            ball.dispose();
                            return;
                        }
                    }
                }

                // Homing projectile guidance
                if (bulletMeta?.isHoming && this.enemyTanks && this.enemyTanks.length > 0) {
                    // Find nearest enemy
                    let nearestEnemy: any = null;
                    let nearestDist = 50; // Max homing range

                    // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
                    const enemyCount = this.enemyTanks.length;
                    for (let i = 0; i < enemyCount; i++) {
                        const enemy = this.enemyTanks[i];
                        if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

                        // КРИТИЧНО: Используем absolutePosition для правильной позиции в мировых координатах
                        const enemyPos = enemy.chassis.absolutePosition;
                        const dx = bulletPos.x - enemyPos.x;
                        const dy = bulletPos.y - enemyPos.y;
                        const dz = bulletPos.z - enemyPos.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq < nearestDist * nearestDist) {
                            nearestDist = Math.sqrt(distSq);
                            nearestEnemy = enemy;
                        }
                    }

                    if (nearestEnemy) {
                        // Steer towards target
                        const targetPos = nearestEnemy.chassis.absolutePosition;
                        const toTarget = targetPos.subtract(bulletPos).normalize();
                        const currentVel = body.getLinearVelocity();
                        if (currentVel) {
                            const currentDir = currentVel.normalize();
                            const steerDir = currentDir.add(toTarget.scale(bulletMeta.homingStrength || 0.15)).normalize();
                            const speed = currentVel.length();
                            body.setLinearVelocity(steerDir.scale(speed));
                            ball.lookAt(ball.position.add(steerDir));
                        }
                    }
                }

                // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКАМИ (дополнительная проверка текущей позиции) ===
                // Используем вспомогательную функцию для проверки
                for (const wallData of this.module6Walls) {
                    if (!wallData.mesh || wallData.mesh.isDisposed()) continue;

                    if (this.checkPointInWall(bulletPos, wallData.mesh, "protectiveWall")) {
                        hasHit = true;
                        const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                        this.damageWall(wallData.mesh, bulletDamage);
                        if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                        if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                        ball.dispose();
                        return;
                    }
                }

                // === ПРОВЕРКА ПОПАДАНИЯ В СТЕНКИ ВРАГОВ ===
                // ОПТИМИЗАЦИЯ: Кэшируем результат filter для enemyWalls
                if (!this._cachedEnemyWalls || this._enemyWallsCacheFrame !== this._logFrameCounter) {
                    this._cachedEnemyWalls = this.scene.meshes.filter(mesh =>
                        mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                    );
                    this._enemyWallsCacheFrame = this._logFrameCounter;
                }
                const enemyWalls = this._cachedEnemyWalls;
                for (const wall of enemyWalls) {
                    const wallMesh = wall as Mesh;
                    if (this.checkPointInWall(bulletPos, wallMesh, "enemyWall")) {
                        hasHit = true;
                        const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                        const wallMeta = wall.metadata as any;
                        if (wallMeta && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                            wallMeta.owner.damageEnemyWall(bulletDamage);
                        }
                        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                            combatLogger.debug(`[TANK] Hit enemy wall! Damage: ${bulletDamage}`);
                        }
                        if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                        if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                        ball.dispose();
                        return;
                    }
                }

                // === ПРОВЕРКА ПОПАДАНИЯ В СЕТЕВЫХ ИГРОКОВ (Capsule Cast) ===
                // Используем "толстый луч" для надежного обнаружения попаданий в мультиплеере
                if (this.networkPlayers && moveDistance > 0.1) {
                    const CAPSULE_RADIUS = 5.5; // Радиус "капсулы" для попадания
                    const CAPSULE_RADIUS_SQ = CAPSULE_RADIUS * CAPSULE_RADIUS;

                    for (const [playerId, networkTank] of this.networkPlayers.entries()) {
                        if (!networkTank || !networkTank.chassis || networkTank.health <= 0) continue;

                        const targetPos = networkTank.chassis.absolutePosition;

                        // Вычисляем расстояние от траектории пули до центра танка (Capsule Cast)
                        const rayDir = bulletPos.subtract(prevBulletPos);
                        const rayLengthSq = rayDir.lengthSquared();

                        let distSqToSegment: number;
                        let impactPoint: Vector3;

                        if (rayLengthSq < 0.001) {
                            distSqToSegment = Vector3.DistanceSquared(bulletPos, targetPos);
                            impactPoint = bulletPos;
                        } else {
                            const w = targetPos.subtract(prevBulletPos);
                            const t = Math.max(0, Math.min(1, Vector3.Dot(w, rayDir) / rayLengthSq));
                            const closestPoint = prevBulletPos.add(rayDir.scale(t));
                            distSqToSegment = Vector3.DistanceSquared(closestPoint, targetPos);
                            impactPoint = closestPoint;
                        }

                        if (distSqToSegment < CAPSULE_RADIUS_SQ) {
                            hasHit = true;
                            console.log(`[TankController] 🎯 CAPSULE HIT on network player ${playerId}!`);

                            // Get damage from projectile metadata
                            const bulletDamage = bulletMeta?.damage || 25;
                            const cannonTypeId = bulletMeta?.cannonType || this.cannonType.id || "standard";

                            // CRITICAL: Send hit to server via callback (FIX: was missing in duplicate code!)
                            if (this.onNetworkPlayerHitCallback) {
                                this.onNetworkPlayerHitCallback(playerId, bulletDamage, impactPoint, cannonTypeId);
                            }

                            // Визуальный эффект
                            this.createHitEffect(impactPoint, cannonTypeId);
                            if (this.soundManager) this.soundManager.playHit("normal", impactPoint);

                            // Show hit marker
                            if (this.hud) this.hud.showHitMarker(false);

                            ball.dispose();
                            return;
                        }
                    }
                }

                // === ПРОВЕРКА ПОПАДАНИЯ В ТУРЕЛИ ===
                if (this.enemyManager) {
                    // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
                    const turrets = this.enemyManager.turrets;
                    const turretCount = turrets.length;
                    const HIT_RADIUS_TURRET_SQ = HIT_RADIUS_TURRET * HIT_RADIUS_TURRET;
                    for (let i = 0; i < turretCount; i++) {
                        const turret = turrets[i];
                        if (!turret || !turret.isAlive || !turret.base) continue;
                        // ОПТИМИЗАЦИЯ: Используем position вместо absolutePosition и квадрат расстояния
                        const turretPos = turret.base.position;
                        const dx = bulletPos.x - turretPos.x;
                        const dy = bulletPos.y - turretPos.y;
                        const dz = bulletPos.z - turretPos.z;
                        const distSq = dx * dx + dy * dy + dz * dz;
                        if (distSq < HIT_RADIUS_TURRET_SQ) {
                            hasHit = true;
                            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                                combatLogger.debug("%c[HIT] TURRET! Damage: " + projectileDamage, "color: red; font-weight: bold");
                            }
                            turret.takeDamage(projectileDamage);
                            if (this.effectsManager) this.effectsManager.createExplosion(bulletPos, 1.0);
                            if (this.soundManager) {
                                const hitType = projectileDamage > 30 ? "critical" : projectileDamage > 15 ? "armor" : "normal";
                                this.soundManager.playHit(hitType, bulletPos);
                            }
                            // Записываем попадание и урон для опыта
                            if (this.experienceSystem) {
                                this.experienceSystem.recordHit(this.cannonType.id, false);
                                this.experienceSystem.recordDamageDealt(this.chassisType.id, this.cannonType.id, projectileDamage);
                            }
                            // Записываем урон в статистику игрока
                            if (this.playerProgression) {
                                this.playerProgression.recordShot(true);
                                this.playerProgression.recordDamageDealt(projectileDamage);
                            }
                            // Награда XP от UpgradeManager
                            upgradeManager.addXpForDamage(projectileDamage);
                            // Show hit marker on HUD
                            if (this.hud) {
                                this.hud.showHitMarker(false);
                            }
                            // Вибрация при попадании (мобильные устройства)
                            if (typeof window !== 'undefined' && 'vibrate' in navigator) {
                                try {
                                    const { getHapticFeedback } = require('./mobile');
                                    getHapticFeedback().hit();
                                } catch (e) {
                                    // Игнорируем ошибки если модуль не загружен
                                }
                            }
                            ball.dispose();
                            return;
                        }
                    }
                }

                // === ПРОВЕРКА ПОПАДАНИЯ В ТАНКИ ===
                const enemies = this.enemyTanks || [];
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

                    const enemyPos = enemy.chassis.absolutePosition;
                    // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
                    const dx = bulletPos.x - enemyPos.x;
                    const dy = bulletPos.y - enemyPos.y;
                    const dz = bulletPos.z - enemyPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const HIT_RADIUS_TANK_SQ4 = HIT_RADIUS_TANK * HIT_RADIUS_TANK;
                    if (distSq < HIT_RADIUS_TANK_SQ4) {
                        hasHit = true;
                        const bulletMeta = ball.metadata as any;
                        const cannonTypeId = bulletMeta?.cannonType || this.cannonType.id;
                        const effectType = bulletMeta?.effectType || cannonTypeId;

                        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                            // ОПТИМИЗАЦИЯ: Вычисляем dist только для лога
                            const dist = Math.sqrt(distSq);
                            combatLogger.debug("%c[HIT] ENEMY TANK! Damage: " + projectileDamage + " | Distance: " + dist.toFixed(1), "color: red; font-weight: bold");
                        }

                        // Handle special mechanics
                        if (bulletMeta?.isExplosive && bulletMeta?.explosionRadius > 0) {
                            // Explosive AOE damage
                            this.handleExplosiveHit(bulletPos, projectileDamage, bulletMeta.explosionRadius, effectType);
                        } else if (bulletMeta?.isChain && bulletMeta?.chainRange > 0) {
                            // Chain lightning
                            this.handleChainLightning(bulletPos, enemy, projectileDamage, bulletMeta.chainRange, bulletMeta.chainTargets || 3);
                        } else {
                            // Normal hit
                            enemy.takeDamage(projectileDamage);
                            this.createHitEffect(bulletPos, effectType);
                        }

                        // Piercing projectiles continue through
                        if (!bulletMeta?.isPiercing) {
                            if (this.soundManager) {
                                const hitType = projectileDamage > this.cannonType.damage * 1.2 ? "critical" : projectileDamage > this.cannonType.damage * 0.8 ? "armor" : "normal";
                                this.soundManager.playHit(hitType, bulletPos);
                            }
                            // Записываем попадание и урон для опыта (критический если больше базового урона)
                            if (this.experienceSystem) {
                                const isCritical = projectileDamage > this.cannonType.damage * 1.2;
                                this.experienceSystem.recordHit(this.cannonType.id, isCritical);
                                this.experienceSystem.recordDamageDealt(this.chassisType.id, this.cannonType.id, projectileDamage);
                            }
                        } else {
                            // Piercing: reduce damage for next target
                            (ball.metadata as any).damage = Math.max(projectileDamage * 0.7, 5);
                            hasHit = false; // Continue through
                        }
                        // Записываем урон в статистику игрока
                        if (this.playerProgression) {
                            this.playerProgression.recordShot(true);
                            this.playerProgression.recordDamageDealt(projectileDamage);
                        }
                        // Show hit marker on HUD (critical if damage > 120% of base)
                        const isCriticalHit = projectileDamage > this.cannonType.damage * 1.2;
                        if (this.hud) {
                            this.hud.showHitMarker(isCriticalHit);
                        }
                        // Play special critical hit sound
                        if (isCriticalHit && this.soundManager) {
                            this.soundManager.playCriticalHitSpecial(bulletPos);
                        }
                        // Track critical hit achievement
                        if (isCriticalHit && this.achievementsSystem) {
                            this.achievementsSystem.updateProgress("sharpshooter", 1);
                        }
                        // Track damage dealt achievement
                        if (this.achievementsSystem) {
                            this.achievementsSystem.updateProgress("damage_dealer", projectileDamage);
                        }
                        ball.dispose();
                        return;
                    }
                }

                // === РИКОШЕТ ОТ ЗЕМЛИ (используем RicochetSystem) ===
                if (bulletPos.y < 0.6 && ricochetCount < maxRicochets) {
                    const velocity = body.getLinearVelocity();
                    if (velocity) {
                        const groundNormal = new Vector3(0, 1, 0);
                        const cannonType = this.cannonType.id;

                        // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
                        const hitPoint = vector3Pool.acquire(bulletPos.x, bulletPos.y, bulletPos.z);
                        const result = ricochetSystem.calculate({
                            velocity,
                            hitPoint: hitPoint,
                            hitNormal: groundNormal,
                            surfaceMaterial: "ground",
                            currentRicochetCount: ricochetCount,
                            projectileType: cannonType === "tracer" ? "tracer" : undefined
                        });
                        vector3Pool.release(hitPoint);

                        if (result.shouldRicochet) {
                            ricochetCount = result.ricochetCount;
                            body.setLinearVelocity(result.newVelocity);
                            ball.position.y = 0.7; // Поднимаем над землёй
                            ball.lookAt(ball.position.add(result.newVelocity.normalize()));

                            // Эффекты и звук
                            if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                            if (this.soundManager && result.sound) {
                                this.soundManager.playRicochet(bulletPos);
                            }

                            // Управление трейлом
                            if (!result.showTrail && ball.metadata?.trailParticles) {
                                ball.metadata.trailParticles.stop();
                            }

                            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                combatLogger.verbose(`[RICOCHET] Ground #${ricochetCount} speed=${result.newSpeed.toFixed(1)}`);
                            }
                        } else {
                            // ИМПАКТ: Если рикошета не произошло (угол слишком крутой), снаряд взрывается/удаляется
                            // Это предотвращает "скольжение" снаряда по земле
                            if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos); // Или createExplosion если HE
                            if (this.soundManager) this.soundManager.playHit("soft", bulletPos);

                            // Записываем промах (попадание в землю)
                            if (this.playerProgression) {
                                this.playerProgression.recordShot(false);
                            }

                            ball.dispose();
                            return;
                        }
                    }
                }

                // === РИКОШЕТ ОТ ГРАНИЦ КАРТЫ (стены) ===
                const mapBorder = 1000;
                if (Math.abs(bulletPos.x) > mapBorder || Math.abs(bulletPos.z) > mapBorder) {
                    if (ricochetCount < maxRicochets) {
                        const velocity = body.getLinearVelocity();
                        if (velocity) {
                            // Определяем нормаль стены
                            let wallNormal: Vector3;
                            if (Math.abs(bulletPos.x) > mapBorder) {
                                wallNormal = new Vector3(-Math.sign(bulletPos.x), 0, 0);
                            } else {
                                wallNormal = new Vector3(0, 0, -Math.sign(bulletPos.z));
                            }

                            const cannonType = this.cannonType.id;
                            // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
                            const hitPoint3 = vector3Pool.acquire(bulletPos.x, bulletPos.y, bulletPos.z);
                            const result = ricochetSystem.calculate({
                                velocity,
                                hitPoint: hitPoint3,
                                hitNormal: wallNormal,
                                surfaceMaterial: "concrete", // Границы карты как бетон
                                currentRicochetCount: ricochetCount,
                                projectileType: cannonType === "tracer" ? "tracer" : undefined
                            });
                            vector3Pool.release(hitPoint3);

                            if (result.shouldRicochet) {
                                ricochetCount = result.ricochetCount;
                                body.setLinearVelocity(result.newVelocity);
                                ball.lookAt(ball.position.add(result.newVelocity.normalize()));

                                if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                                if (this.soundManager && result.sound) {
                                    this.soundManager.playRicochet(bulletPos);
                                }

                                // Управление трейлом
                                if (!result.showTrail && ball.metadata?.trailParticles) {
                                    ball.metadata.trailParticles.stop();
                                }

                                if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                    combatLogger.verbose(`[RICOCHET] Wall #${ricochetCount} speed=${result.newSpeed.toFixed(1)}`);
                                }
                            }
                        }
                    }
                }

                // Удаление за границами (увеличено максимальное расстояние)
                if (bulletPos.y < -10 || bulletPos.y > 100 ||
                    Math.abs(bulletPos.x) > 1200 || Math.abs(bulletPos.z) > 1200) {
                    ball.dispose();
                    return;
                }

                // Сохраняем текущую позицию для следующего кадра (для рейкаста)
                // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
                vector3Pool.release(prevBulletPos);
                prevBulletPos = vector3Pool.acquire(bulletPos.x, bulletPos.y, bulletPos.z);

                // Продолжаем проверку КАЖДЫЙ КАДР
                requestAnimationFrame(checkHit);
            };

            // Запускаем проверку СРАЗУ
            checkHit();

            // Авто-удаление через 6 секунд (дольше для большей дальности)
            setTimeout(() => {
                if (!ball.isDisposed()) {
                    ball.dispose();
                    // Освобождаем prevBulletPos при dispose
                    if (prevBulletPos) vector3Pool.release(prevBulletPos);
                }
            }, 6000);
        } catch (e) { logger.error("[FIRE ERROR]", e); }
    }

    // ============ SPECIAL MECHANICS ============

    private fireShotgunSpread(muzzlePos: Vector3, direction: Vector3): void {
        // Shotgun fires 5 projectiles in a spread pattern
        const spreadAngle = 0.3; // 30 degrees total spread
        const pelletCount = 5;

        for (let i = 0; i < pelletCount; i++) {
            const angle = (i - (pelletCount - 1) / 2) * spreadAngle / (pelletCount - 1);
            const right = Vector3.Cross(direction, Vector3.Up()).normalize();
            const up = Vector3.Up();
            // ОПТИМИЗАЦИЯ: Используем vector3Pool вместо clone()
            const spreadDir = vector3Pool.acquire(direction.x, direction.y, direction.z);
            spreadDir.addInPlace(right.scale(Math.sin(angle)));
            spreadDir.addInPlace(up.scale(Math.sin(angle * 0.5)));
            spreadDir.normalize();

            // Create smaller projectile
            const pellet = MeshBuilder.CreateBox("shotgunPellet", {
                width: this.projectileSize * 0.6,
                height: this.projectileSize * 0.6,
                depth: this.projectileSize * 2
            }, this.scene);
            const pelletPos = vector3Pool.acquire(muzzlePos.x, muzzlePos.y, muzzlePos.z);
            pellet.position = pelletPos;
            pellet.lookAt(pellet.position.add(spreadDir));
            // Освобождаем векторы после использования (позиция сохраняется в mesh)
            vector3Pool.release(spreadDir);
            vector3Pool.release(pelletPos);

            const pelletMat = new StandardMaterial("pelletMat", this.scene);
            pelletMat.diffuseColor = new Color3(1, 0.7, 0.2);
            pelletMat.emissiveColor = new Color3(1, 0.5, 0.1);
            pelletMat.disableLighting = true;
            pellet.material = pelletMat;

            pellet.metadata = {
                type: "bullet",
                owner: "player",
                damage: this.damage * 0.4, // Each pellet does less damage
                cannonType: "shotgun"
            };

            // Physics
            const shape = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: { extents: new Vector3(this.projectileSize * 0.5, this.projectileSize * 0.5, this.projectileSize * 1.5) }
            }, this.scene);
            shape.filterMembershipMask = 4;
            shape.filterCollideMask = 2 | 8 | 32;

            const body = new PhysicsBody(pellet, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            // АРКАДНЫЙ СТИЛЬ: Минимальная масса
            body.setMassProperties({ mass: 0.001 });
            body.setLinearDamping(0.01);
            body.applyImpulse(spreadDir.scale(this.projectileSpeed * 0.018), pellet.position);

            // Trail
            if (this.effectsManager) {
                this.effectsManager.createBulletTrail(pellet, new Color3(1, 0.7, 0.2), "shotgun");
            }

            // Hit detection (same as normal projectile)
            this.setupProjectileHitDetection(pellet, body);
        }
    }

    private fireClusterProjectiles(muzzlePos: Vector3, direction: Vector3): void {
        // Cluster fires main projectile that splits into 4 smaller ones after distance
        const mainProjectile = this.createStandardProjectile(muzzlePos, direction, this.damage, "cluster");
        const splitDistance = 20; // Split after 20 units
        const splitTime = splitDistance / this.projectileSpeed;

        setTimeout(() => {
            if (mainProjectile && !mainProjectile.isDisposed()) {
                const splitPos = mainProjectile.absolutePosition.clone();
                mainProjectile.dispose();

                // Create 4 smaller projectiles
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI * 2) / 4;
                    const right = Vector3.Cross(direction, Vector3.Up()).normalize();
                    const spreadDir = direction.clone();
                    spreadDir.addInPlace(right.scale(Math.cos(angle) * 0.2));
                    spreadDir.normalize();

                    const cluster = this.createStandardProjectile(splitPos, spreadDir, this.damage * 0.6, "cluster");
                    // Trail
                    if (this.effectsManager) {
                        this.effectsManager.createBulletTrail(cluster, new Color3(1, 0.5, 0), "cluster");
                    }
                }
            }
        }, splitTime * 1000);
    }

    private createStandardProjectile(pos: Vector3, dir: Vector3, damage: number, cannonType: string): Mesh {
        const bulletSize = this.projectileSize;
        const ball = MeshBuilder.CreateBox("bullet", {
            width: bulletSize,
            height: bulletSize,
            depth: bulletSize * 3
        }, this.scene);
        ball.position = pos.clone();
        ball.lookAt(ball.position.add(dir));

        const mat = new StandardMaterial("bulletMat", this.scene);
        mat.diffuseColor = new Color3(1, 1, 0);
        mat.emissiveColor = new Color3(1, 0.8, 0);
        mat.disableLighting = true;
        ball.material = mat;

        ball.metadata = {
            type: "bullet",
            owner: "player",
            damage: damage,
            cannonType: cannonType
        };

        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { extents: new Vector3(bulletSize * 0.75, bulletSize * 0.75, bulletSize * 2) }
        }, this.scene);
        shape.filterMembershipMask = 4;
        shape.filterCollideMask = 2 | 8 | 32;

        const projConfig = PHYSICS_CONFIG.shooting.projectiles;
        const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        // PROJECTILE BALLISTICS: Минимальная масса - снаряд НЕ толкает танки при попадании
        body.setMassProperties({ mass: projConfig.mass });
        body.setLinearDamping(projConfig.linearDamping);

        // PROJECTILE BALLISTICS: Continuous Collision Detection для быстрых снарядов
        // Примечание: В Babylon.js Havok CCD настраивается через shape properties, не через motionType

        // PROJECTILE BALLISTICS: Применяем импульс с учетом конфига
        const impulse = dir.scale(this.projectileSpeed * projConfig.impulseMultiplier);
        body.applyImpulse(impulse, ball.position);

        // PROJECTILE BALLISTICS: Усиленная гравитация для более "хищных" траекторий
        // Применяется через кастомную гравитацию в updatePhysics или через world gravity
        if (projConfig.gravityScale !== 1.0) {
            // Сохраняем gravityScale в metadata для применения в updatePhysics
            ball.metadata.gravityScale = projConfig.gravityScale;
            ball.metadata.ricochetMode = projConfig.ricochetMode;
            ball.metadata.ricochetSpeedLoss = projConfig.ricochetSpeedLoss;
        }

        this.setupProjectileHitDetection(ball, body);

        // LOGIC CHANGE: Monitor speed for damage/despawn
        ball.onBeforeRenderObservable.add(() => {
            if (ball.isDisposed() || !body) return;

            // Get linear velocity
            const velocity = body.getLinearVelocity();
            if (!velocity) return;

            const speed = velocity.length();

            // Threshold: 10 units/sec (adjust as needed)
            if (speed < 10.0) {
                // Disable damage
                if (ball.metadata) {
                    ball.metadata.damage = 0;
                }

                // Start despawn timer
                if (!ball.metadata.lowSpeedTime) {
                    ball.metadata.lowSpeedTime = Date.now();
                } else if (Date.now() - ball.metadata.lowSpeedTime > 500) {
                    // Despawn after 0.5s of low speed
                    ball.dispose();
                }
            } else {
                // Reset timer if speed recovers (e.g. ricochet)
                if (ball.metadata) {
                    ball.metadata.lowSpeedTime = null;
                }
            }
        });

        return ball;
    }

    private setupProjectileHitDetection(ball: Mesh, _body: PhysicsBody): void {
        // Use the same hit detection logic as main fire() method
        // This is a simplified version that integrates with existing checkHit
        let hasHit = false;
        const HIT_RADIUS_TANK = 4.0;

        const checkHit = () => {
            if (hasHit || ball.isDisposed()) return;

            const bulletPos = ball.absolutePosition;
            const bulletMeta = ball.metadata as any;
            const projectileDamage = bulletMeta?.damage || this.damage;

            // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКАМИ ===
            // Проверяем защитные стены игрока
            for (const wallData of this.module6Walls) {
                if (!wallData.mesh || wallData.mesh.isDisposed()) continue;

                if (this.checkPointInWall(bulletPos, wallData.mesh, "protectiveWall")) {
                    hasHit = true;
                    const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                    this.damageWall(wallData.mesh, bulletDamage);
                    if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                    if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                    ball.dispose();
                    return;
                }
            }

            // Проверяем стены врагов
            // ОПТИМИЗАЦИЯ: Кэшируем результат filter для enemyWalls
            if (!this._cachedEnemyWalls || this._enemyWallsCacheFrame !== this._logFrameCounter) {
                this._cachedEnemyWalls = this.scene.meshes.filter(mesh =>
                    mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                );
                this._enemyWallsCacheFrame = this._logFrameCounter;
            }
            const enemyWalls = this._cachedEnemyWalls;
            for (const wall of enemyWalls) {
                const wallMesh = wall as Mesh;
                if (this.checkPointInWall(bulletPos, wallMesh, "enemyWall")) {
                    hasHit = true;
                    const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                    const wallMeta = wall.metadata as any;
                    if (wallMeta && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                        wallMeta.owner.damageEnemyWall(bulletDamage);
                    }
                    if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                    if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                    ball.dispose();
                    return;
                }
            }

            // Check enemy hits
            // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
            const enemies = this.enemyTanks || [];
            const enemyCount = enemies.length;
            const HIT_RADIUS_TANK_SQ = HIT_RADIUS_TANK * HIT_RADIUS_TANK;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = enemies[i];
                if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию для лучшей производительности
                // КРИТИЧНО: absolutePosition дорогая операция - используем position если нет родителя
                let enemyPos: Vector3;
                if (enemy.chassis.parent === null) {
                    // Если нет родителя, position уже в мировых координатах
                    enemyPos = enemy.chassis.position;
                } else {
                    // Если есть родитель, используем absolutePosition (кэшируем на кадр)
                    const cachedPos = (enemy.chassis as any)._cachedAbsolutePosition;
                    const cachedFrame = (enemy.chassis as any)._cachedAbsolutePositionFrame;
                    const currentFrame = (window as any).gameInstance?._updateTick || 0;
                    if (cachedPos && cachedFrame === currentFrame) {
                        enemyPos = cachedPos;
                    } else {
                        enemyPos = enemy.chassis.absolutePosition;
                        (enemy.chassis as any)._cachedAbsolutePosition = enemyPos.clone();
                        (enemy.chassis as any)._cachedAbsolutePositionFrame = currentFrame;
                    }
                }
                const dx = bulletPos.x - enemyPos.x;
                const dy = bulletPos.y - enemyPos.y;
                const dz = bulletPos.z - enemyPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < HIT_RADIUS_TANK_SQ) {
                    hasHit = true;
                    enemy.takeDamage(projectileDamage);
                    this.createHitEffect(bulletPos, bulletMeta?.cannonType || "standard");
                    if (this.soundManager) this.soundManager.playHit("normal", bulletPos);
                    ball.dispose();
                    return;
                }
            }

            // Check network player hits (with lag compensation)
            if (this.networkPlayers) {
                const shootTime = bulletMeta?.shootTime || Date.now();
                // Get real RTT from multiplayer manager if available
                const multiplayerManager = (this as any).multiplayerManager || (window as any).game?.multiplayerManager;
                const estimatedPing = multiplayerManager?.getRTT?.() || 100; // Fallback to 100ms
                const rewindTime = shootTime - estimatedPing; // Rewind to when shot was fired

                for (const [, networkTank] of this.networkPlayers.entries()) {
                    if (!networkTank || !networkTank.chassis) continue;

                    // Get position at time of shot (lag compensation)
                    const targetPos = networkTank.getPositionAtTime?.(rewindTime) || networkTank.chassis.position;

                    // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
                    const dx = bulletPos.x - targetPos.x;
                    const dy = bulletPos.y - targetPos.y;
                    const dz = bulletPos.z - targetPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const HIT_RADIUS_TANK_SQ3 = HIT_RADIUS_TANK * HIT_RADIUS_TANK;
                    if (distSq < HIT_RADIUS_TANK_SQ3) {
                        hasHit = true;
                        // Hit detected - server will validate and apply damage
                        this.createHitEffect(bulletPos, bulletMeta?.cannonType || "standard");
                        if (this.soundManager) this.soundManager.playHit("normal", bulletPos);
                        ball.dispose();
                        return;
                    }
                }
            }

            // Bounds check
            if (bulletPos.y < -10 || Math.abs(bulletPos.x) > 1200 || Math.abs(bulletPos.z) > 1200) {
                ball.dispose();
                return;
            }

            requestAnimationFrame(checkHit);
        };

        checkHit();

        // Auto-remove after 6 seconds
        setTimeout(() => {
            if (ball && !ball.isDisposed()) ball.dispose();
        }, 6000);
    }

    private handleExplosiveHit(center: Vector3, damage: number, radius: number, effectType: string): void {
        // AOE damage to all enemies in radius
        const enemies = this.enemyTanks || [];
        let hitCount = 0;

        // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
        const enemyCount = enemies.length;
        const radiusSq3 = radius * radius;
        for (let i = 0; i < enemyCount; i++) {
            const enemy = enemies[i];
            if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

            // КРИТИЧНО: Используем absolutePosition для правильной позиции в мировых координатах
            const enemyPos = enemy.chassis.absolutePosition;
            const dx = center.x - enemyPos.x;
            const dy = center.y - enemyPos.y;
            const dz = center.z - enemyPos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq <= radiusSq3) {
                // ИСПРАВЛЕНИЕ: Проверяем, блокирует ли защитная стенка взрывную волну
                if (this.isExplosionBlockedByWall(center, enemyPos)) {
                    continue; // Стенка блокирует AOE урон
                }

                // Вычисляем реальное расстояние только для damageMultiplier
                const dist = Math.sqrt(distSq);
                // Damage falls off with distance
                const damageMultiplier = 1 - (dist / radius) * 0.5; // 50% damage at edge
                const finalDamage = Math.round(damage * damageMultiplier);
                enemy.takeDamage(finalDamage);
                hitCount++;
            }
        }

        // Create explosion effect
        if (this.effectsManager) {
            this.effectsManager.createExplosion(center, radius / 5);
        }
        this.createHitEffect(center, effectType);

        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            combatLogger.debug(`[EXPLOSIVE] Hit ${hitCount} enemies in ${radius}m radius`);
        }
    }

    private handleChainLightning(startPos: Vector3, firstTarget: any, damage: number, range: number, maxTargets: number): void {
        const hitTargets = new Set<any>();
        hitTargets.add(firstTarget);
        firstTarget.takeDamage(damage);

        let currentPos = firstTarget.chassis.absolutePosition.clone();
        let currentDamage = damage;

        // Chain to nearby enemies
        for (let chain = 1; chain < maxTargets; chain++) {
            const enemies = this.enemyTanks || [];
            let nearestEnemy: any = null;
            let nearestDist = range;

            // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
            const enemyCount = enemies.length;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = enemies[i];
                if (!enemy || !enemy.isAlive || hitTargets.has(enemy) || !enemy.chassis || enemy.chassis.isDisposed()) continue;

                // КРИТИЧНО: Используем absolutePosition для правильной позиции в мировых координатах
                const enemyPos = enemy.chassis.absolutePosition;
                const dx = currentPos.x - enemyPos.x;
                const dy = currentPos.y - enemyPos.y;
                const dz = currentPos.z - enemyPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < nearestDist * nearestDist) {
                    nearestDist = Math.sqrt(distSq);
                    nearestEnemy = enemy;
                }
            }

            if (nearestEnemy) {
                hitTargets.add(nearestEnemy);
                currentDamage = Math.round(currentDamage * 0.7); // Damage reduces with each chain
                nearestEnemy.takeDamage(currentDamage);

                // Visual chain effect
                if (this.effectsManager) {
                    this.createLightningBolt(currentPos, nearestEnemy.chassis.absolutePosition);
                }

                currentPos = nearestEnemy.chassis.absolutePosition.clone();
            } else {
                break; // No more targets
            }
        }

        this.createHitEffect(startPos, "tesla");
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            combatLogger.debug(`[CHAIN] Hit ${hitTargets.size} enemies`);
        }
    }

    private createLightningBolt(start: Vector3, end: Vector3): void {
        // Simple lightning bolt visual
        const mid = start.add(end).scale(0.5);
        mid.y += 2; // Arc upward

        const bolt = MeshBuilder.CreateBox("lightning", {
            width: 0.1,
            height: 0.1,
            depth: Vector3.Distance(start, end)
        }, this.scene);
        bolt.position = mid;
        bolt.lookAt(end);

        const boltMat = new StandardMaterial("lightningMat", this.scene);
        boltMat.diffuseColor = new Color3(0, 1, 1);
        boltMat.emissiveColor = new Color3(0, 0.8, 0.8);
        boltMat.disableLighting = true;
        bolt.material = boltMat;

        setTimeout(() => {
            if (bolt && !bolt.isDisposed()) bolt.dispose();
        }, 200);
    }

    private createHitEffect(position: Vector3, effectType: string): void {
        if (!this.effectsManager) return;

        switch (effectType) {
            case "plasma":
                this.effectsManager.createPlasmaBurst(position);
                break;
            case "freeze":
                this.effectsManager.createIceShards(position);
                break;
            case "poison":
            case "acid":
                this.effectsManager.createPoisonCloud(position);
                break;
            case "flamethrower":
                this.effectsManager.createFireEffect(position);
                break;
            default:
                this.effectsManager.createExplosion(position, 1.0);
        }
    }

    // ============ TRACER SYSTEM ============
    // Tracer round - special marking projectile fired with T key
    // Uses same cooldown as normal fire, limited ammo, marks enemies on hit
    // ============ SUPPORT BEAM ============
    private fireSupportBeam(muzzlePos: Vector3, direction: Vector3): void {
        // Support beam - instant hit, repairs allies or damages enemies
        const maxRange = 50; // Maximum range for support beam
        const beamEnd = muzzlePos.add(direction.scale(maxRange));

        // Raycast to find target
        const ray = new Ray(muzzlePos, direction);
        ray.length = maxRange;

        // Check for hits
        const hit = this.scene.pickWithRay(ray);

        if (hit && hit.pickedMesh) {
            const target = hit.pickedMesh;
            const targetPos = target.absolutePosition;
            const distance = Vector3.Distance(muzzlePos, targetPos);

            // Check if target is enemy tank
            if (target.metadata && target.metadata.type === "enemyTank" && target.metadata.instance) {
                const enemy = target.metadata.instance;
                if (enemy.isAlive && distance <= maxRange) {
                    // Damage enemy
                    enemy.takeDamage(this.damage, muzzlePos);
                    if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                        combatLogger.debug(`[SUPPORT] Damaged enemy for ${this.damage} damage`);
                    }

                    // Visual effect
                    if (this.effectsManager) {
                        this.effectsManager.createMuzzleFlash(targetPos, direction.scale(-1));
                    }
                }
            }
            // Check if target is player tank (self-repair or future ally system)
            else if (target.metadata && target.metadata.type === "playerTank") {
                // Self-repair if damaged
                if (this.currentHealth < this.maxHealth && distance <= maxRange) {
                    const healAmount = Math.min(15, this.maxHealth - this.currentHealth);
                    this.currentHealth += healAmount;
                    if (this.hud) {
                        this.hud.setHealth(this.currentHealth, this.maxHealth);
                    }
                    if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                        combatLogger.debug(`[SUPPORT] Repaired ${healAmount} HP`);
                    }
                }
            }
        }

        // Create visual beam effect
        if (this.effectsManager) {
            // Create beam line
            const beamLength = hit ? Vector3.Distance(muzzlePos, hit.pickedPoint || beamEnd) : maxRange;
            const beamEndPoint = muzzlePos.add(direction.scale(beamLength));

            // Create green healing beam or red damage beam
            const isHealing = hit && hit.pickedMesh && hit.pickedMesh.metadata && hit.pickedMesh.metadata.type === "playerTank";
            const beamColor = isHealing ? new Color3(0, 1, 0.5) : new Color3(1, 0.5, 0);

            // Create temporary beam mesh
            const beam = MeshBuilder.CreateBox("supportBeam", {
                width: 0.1,
                height: 0.1,
                depth: beamLength
            }, this.scene);
            beam.position = muzzlePos.add(direction.scale(beamLength / 2));
            beam.lookAt(beamEndPoint);

            const beamMat = new StandardMaterial("supportBeamMat", this.scene);
            beamMat.diffuseColor = beamColor;
            beamMat.emissiveColor = beamColor.scale(0.5);
            beam.material = beamMat;

            // Remove beam after short time
            setTimeout(() => {
                if (beam && !beam.isDisposed()) {
                    beam.dispose();
                }
            }, 200);
        }
    }

    fireTracer() {
        try {
            if (!this.isAlive) return;

            // Check if we have tracers
            if (this.tracerCount <= 0) {
                if (this.chatSystem) {
                    this.chatSystem.log("No tracers left!");
                }
                return;
            }

            const now = Date.now();

            // Check cooldown (same as normal fire)
            if (this.isReloading || now - this.lastShotTime < this.cooldown) {
                if (this.chatSystem) {
                    const remaining = ((this.cooldown - (now - this.lastShotTime)) / 1000).toFixed(1);
                    this.chatSystem.log(`Reloading... ${remaining}s`);
                }
                return;
            }

            // Use tracer
            this.tracerCount--;
            this.lastShotTime = now;
            this.isReloading = true;

            // Update HUD for tracer count
            if (this.hud) {
                this.hud.startReload(this.cooldown);
                // Could add tracer count display here
            }

            // End reload after cooldown
            // УЛУЧШЕНО: Добавлен failsafe timeout для предотвращения зависания
            setTimeout(() => {
                this.isReloading = false;
                if (this.soundManager) {
                    this.soundManager.playReloadComplete();
                }
            }, this.cooldown);

            // FAILSAFE: Если через 2x cooldown reload всё еще active - принудительно сбрасываем
            setTimeout(() => {
                if (this.isReloading) {
                    console.warn('[TankController] FAILSAFE: Tracer reload was stuck, forcing reset');
                    this.isReloading = false;
                }
            }, this.cooldown * 2 + 500);

            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                combatLogger.debug(`[TRACER] Fired! ${this.tracerCount}/${this.maxTracerCount} remaining`);
            }

            // Get muzzle position and direction (строго по направлению ствола)
            const wasBarrelEnabled = this.barrel.isEnabled();
            if (!wasBarrelEnabled) this.barrel.setEnabled(true);

            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);

            // Получаем РЕАЛЬНОЕ направление ствола в мировых координатах
            const barrelWorldMatrix = this.barrel.getWorldMatrix();
            const barrelForward = Vector3.TransformNormal(Vector3.Forward(), barrelWorldMatrix).normalize();

            // Получаем позицию конца ствола (дульный срез)
            const barrelLength = this.cannonType.barrelLength;
            const barrelCenter = this.barrel.getAbsolutePosition();
            const muzzlePos = barrelCenter.add(barrelForward.scale(barrelLength / 2));

            // Направление выстрела = реальное направление ствола (строго по траектории ствола)
            const shootDirection = barrelForward.clone();

            if (!wasBarrelEnabled) this.barrel.setEnabled(false);

            // Play tracer sound (can use different sound if available)
            if (this.soundManager) {
                this.soundManager.playShoot(this.cannonType.id, muzzlePos.clone());
            }

            // Create tracer muzzle flash (slightly different color)
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos, shootDirection);
            }

            // Create tracer projectile - BRIGHT RED/ORANGE, larger, more visible
            const tracerSize = this.projectileSize * 1.5; // Bigger than normal
            const tracer = MeshBuilder.CreateBox("tracer", {
                width: tracerSize,
                height: tracerSize,
                depth: tracerSize * 4 // Longer trail
            }, this.scene);
            tracer.position.copyFrom(muzzlePos);
            tracer.lookAt(tracer.position.add(shootDirection));
            tracer.material = this.tracerMat!;
            tracer.metadata = { type: "tracer", owner: "player", damage: this.tracerDamage, markDuration: this.tracerMarkDuration };

            // Create bullet trail effect
            if (this.effectsManager) {
                this.effectsManager.createBulletTrail(tracer);
            }

            // Physics
            // КРИТИЧНО: Удаляем старый физический агрегат перед созданием нового
            // Physics - Tracer Body

            // Physics
            const shape = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: { extents: new Vector3(tracerSize * 0.75, tracerSize * 0.75, tracerSize * 3) }
            }, this.scene);
            shape.filterMembershipMask = 4;
            // OPTIMIZATION: Disable physics engine collisions for tracer.
            // Hit detection is handled manually via setInterval/distance check (see below).
            // Enabling collisions here causes massive FPS drop if it spawns inside the barrel.
            shape.filterCollideMask = 0; // Was 2 | 8 | 32

            // ОПТИМИЗАЦИЯ: Полностью отключаем PhysicsBody для трассеров!
            // Использование физического движка для 20+ снарядов в секунду убивает FPS.
            // Переходим на ручное движение (position += velocity * dt).

            /* 
            const body = new PhysicsBody(tracer, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            // АРКАДНЫЙ СТИЛЬ: Минимальная масса
            body.setMassProperties({ mass: 0.001 });
            // Сопротивление воздуха для трассера
            body.setLinearDamping(0.0);
            body.setAngularDamping(0.0);
    
            // Отключаем гравитацию для трассера! (Пусть летит прямо как луч света)
            body.setGravityFactor(0);
    
            // Устанавливаем начальную скорость
            const velocity = shootDirection.scale(this.projectileSpeed);
            body.setLinearVelocity(velocity);
            
            // Добавляем к списку активных снарядов
            this.projectiles.push({ mesh: tracer, body: body, damage: this.damage, ownerId: this.id });
            */

            // Вместо физики добавляем в список для ручного обновления:
            const velocity = shootDirection.scale(this.projectileSpeed);
            this.manualProjectiles.push({ mesh: tracer, velocity: velocity });

            // Для совместимости добавляем в старый массив (если он используется где-то) с body: null
            // Но лучше не трогать старый массив, если мы не нашли его определение/тип.
            // Мы просто игнорируем его, так как удалили создание body.
            // this.projectiles.push({ mesh: tracer, body: null as any, ... }); 









            // Light recoil for tracer
            const recoilForceVec = shootDirection.scale(-this.recoilForce * 0.3);
            this.physicsBody.applyImpulse(recoilForceVec, this.chassis.absolutePosition);

            // === TRACER HIT DETECTION ===
            const tracerDamage = this.tracerDamage;
            const markDuration = this.tracerMarkDuration;
            const HIT_RADIUS = 4.5; // Slightly larger hit radius for tracer

            // ОПТИМИЗАЦИЯ: Используем TimerManager вместо setInterval
            const checkInterval = timerManager.setInterval(() => {
                if (tracer.isDisposed()) {
                    timerManager.clear(checkInterval);
                    return;
                }

                const tracerPos = tracer.absolutePosition;

                // Check enemy tanks
                const enemies = this.enemyTanks || [];
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;

                    // КРИТИЧНО: Используем absolutePosition для правильной позиции в мировых координатах
                    const enemyPos = enemy.chassis.absolutePosition;
                    const dx = tracerPos.x - enemyPos.x;
                    const dy = tracerPos.y - enemyPos.y;
                    const dz = tracerPos.z - enemyPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    const HIT_RADIUS_SQ = HIT_RADIUS * HIT_RADIUS;
                    if (distSq < HIT_RADIUS_SQ) {
                        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                            combatLogger.debug("%c[TRACER HIT] Enemy marked for " + (markDuration / 1000) + "s!", "color: orange; font-weight: bold");
                        }

                        // Deal tracer damage (reduced)
                        enemy.takeDamage(tracerDamage);

                        // MARK THE ENEMY - make them visible/highlighted
                        if (enemy.setMarked) {
                            enemy.setMarked(true, markDuration);
                        }

                        // Visual effect
                        if (this.effectsManager) {
                            this.effectsManager.createExplosion(tracerPos, 0.8);
                        }

                        // Sound
                        if (this.soundManager) {
                            this.soundManager.playHit("normal", tracerPos);
                        }

                        // Show special marker on HUD
                        if (this.hud) {
                            this.hud.showHitMarker(false);
                        }

                        // Chat notification
                        if (this.chatSystem) {
                            this.chatSystem.log(`Enemy marked for ${markDuration / 1000}s!`);
                        }

                        tracer.dispose();
                        clearInterval(checkInterval);
                        // ИСПРАВЛЕНИЕ: Удаляем из массива при попадании
                        const idx = this.manualProjectiles.findIndex(p => p.mesh === tracer);
                        if (idx !== -1) {
                            if (this.manualProjectiles[idx]!.timeoutId !== undefined) {
                                clearTimeout(this.manualProjectiles[idx]!.timeoutId);
                            }
                            this.manualProjectiles.splice(idx, 1);
                        }
                        return;
                    }
                }

                // Dispose if too far or too old
                // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
                const dx = tracerPos.x - muzzlePos.x;
                const dy = tracerPos.y - muzzlePos.y;
                const dz = tracerPos.z - muzzlePos.z;
                const distSq = dx * dx + dy * dy + dz * dz;
                if (tracerPos.y < -10 || distSq > 250000) { // 500 * 500 = 250000
                    tracer.dispose();
                    clearInterval(checkInterval);
                    // ИСПРАВЛЕНИЕ: Удаляем из массива при удалении
                    const idx = this.manualProjectiles.findIndex(p => p.mesh === tracer);
                    if (idx !== -1) {
                        if (this.manualProjectiles[idx]!.timeoutId !== undefined) {
                            clearTimeout(this.manualProjectiles[idx]!.timeoutId);
                        }
                        this.manualProjectiles.splice(idx, 1);
                    }
                }
            }, 16);

            // Auto-dispose after 5 seconds
            const timeoutId = window.setTimeout(() => {
                clearInterval(checkInterval);
                if (!tracer.isDisposed()) tracer.dispose();
                // ИСПРАВЛЕНИЕ: Удаляем из массива при таймауте
                const idx = this.manualProjectiles.findIndex(p => p.mesh === tracer);
                if (idx !== -1) {
                    this.manualProjectiles.splice(idx, 1);
                }
            }, 5000);

            // ИСПРАВЛЕНИЕ: Сохраняем intervalId и timeoutId для очистки
            const projIdx = this.manualProjectiles.findIndex(p => p.mesh === tracer);
            if (projIdx !== -1) {
                this.manualProjectiles[projIdx]!.intervalId = checkInterval as any;
                this.manualProjectiles[projIdx]!.timeoutId = timeoutId;
            }

        } catch (e) { logger.error("[TRACER ERROR]", e); }
    }

    // Refill tracers (can be called from consumables or pickups)
    refillTracers(amount: number = this.maxTracerCount): void {
        this.tracerCount = Math.min(this.tracerCount + amount, this.maxTracerCount);
        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
            combatLogger.debug(`[TRACER] Refilled! ${this.tracerCount}/${this.maxTracerCount}`);
        }
        if (this.chatSystem) {
            this.chatSystem.log(`Tracers refilled: ${this.tracerCount}/${this.maxTracerCount}`);
        }
    }

    // Get current tracer count (for HUD display)
    getTracerCount(): number {
        return this.tracerCount;
    }

    getMaxTracerCount(): number {
        return this.maxTracerCount;
    }

    private applyTorque(torque: Vector3) {
        // Защитные проверки перед применением момента
        if (!this.physicsBody || !this.chassis || this.chassis.isDisposed()) return;

        // Проверка на валидность вектора момента
        if (!isFinite(torque.x) || !isFinite(torque.y) || !isFinite(torque.z)) return;

        return this.movementModule.applyTorque(torque);
    }

    // ОПТИМИЗАЦИЯ: Ручное обновление движения снарядов (вместо тяжелой физики)
    // ИСПРАВЛЕНИЕ: Ограничение на количество снарядов для предотвращения утечек памяти
    private readonly MAX_MANUAL_PROJECTILES = 100;

    private updateProjectiles(dt: number) {
        // Инкремент счётчика кадров для оптимизации траектории
        this.trajectoryFrameCounter++;

        // ИСПРАВЛЕНИЕ: Очищаем старые снаряды если их слишком много
        if (this.manualProjectiles.length > this.MAX_MANUAL_PROJECTILES) {
            const toRemove = this.manualProjectiles.length - this.MAX_MANUAL_PROJECTILES;
            for (let i = 0; i < toRemove; i++) {
                const proj = this.manualProjectiles[i];
                if (!proj) continue;
                if (proj.mesh && !proj.mesh.isDisposed()) {
                    proj.mesh.dispose();
                }
                if (proj.intervalId !== undefined) {
                    clearInterval(proj.intervalId);
                }
                if (proj.timeoutId !== undefined) {
                    clearTimeout(proj.timeoutId);
                }
            }
            this.manualProjectiles.splice(0, toRemove);
        }

        for (let i = this.manualProjectiles.length - 1; i >= 0; i--) {
            const proj = this.manualProjectiles[i];
            if (!proj) continue;
            // Удаляем если меш уничтожен
            if (!proj.mesh || proj.mesh.isDisposed()) {
                // ИСПРАВЛЕНИЕ: Очищаем интервалы и таймауты
                if (proj.intervalId !== undefined) {
                    clearInterval(proj.intervalId);
                }
                if (proj.timeoutId !== undefined) {
                    clearTimeout(proj.timeoutId);
                }
                this.manualProjectiles.splice(i, 1);
                continue;
            }

            // Двигаем снаряд: position += velocity * dt
            // ОПТИМИЗАЦИЯ: Используем переиспользуемые Vector3 вместо clone()
            this._tmpVector8.copyFrom(proj.mesh.position);
            proj.mesh.position.addInPlace(proj.velocity.scale(dt));

            // DEBUG: Отображение траектории снаряда красным цветом (оптимизировано)
            // Создаём линию только каждые 3 кадра для экономии производительности
            if (this.showProjectileTrajectory && this.trajectoryFrameCounter % 3 === 0) {
                this._tmpVector9.copyFrom(proj.mesh.position);
                const trajectoryLine = MeshBuilder.CreateLines(
                    `traj_${i}`,
                    {
                        points: [this._tmpVector8.clone(), this._tmpVector9.clone()],
                        updatable: false
                    },
                    this.scene
                );
                trajectoryLine.color = this._cachedRedColor; // Используем кэшированный цвет
                trajectoryLine.isPickable = false;
                this.trajectoryLines.push(trajectoryLine);

                // Удаляем старые линии траектории (максимум 100 для производительности)
                while (this.trajectoryLines.length > 100) {
                    const toRemove = this.trajectoryLines.shift();
                    if (toRemove && !toRemove.isDisposed()) {
                        toRemove.dispose();
                    }
                }

                // Автоматическое удаление линии через 3 секунды
                const timeoutId = window.setTimeout(() => {
                    // Удаляем ID из массива
                    const tidx = this.trajectoryTimeoutIds.indexOf(timeoutId);
                    if (tidx !== -1) {
                        this.trajectoryTimeoutIds.splice(tidx, 1);
                    }
                    const idx = this.trajectoryLines.indexOf(trajectoryLine);
                    if (idx !== -1) {
                        this.trajectoryLines.splice(idx, 1);
                    }
                    if (!trajectoryLine.isDisposed()) {
                        trajectoryLine.dispose();
                    }
                }, 3000);
                this.trajectoryTimeoutIds.push(timeoutId);
            }
        }
    }

    /**
     * Переключить отображение траектории снаряда (для тестирования)
     */
    public toggleProjectileTrajectory(): boolean {
        this.showProjectileTrajectory = !this.showProjectileTrajectory;
        if (!this.showProjectileTrajectory) {
            this.clearTrajectoryLines();
        }
        console.log(`[TankController] 🎯 Projectile trajectory: ${this.showProjectileTrajectory ? 'ON (RED)' : 'OFF'}`);
        return this.showProjectileTrajectory;
    }

    /**
     * Очистить все линии траектории
     */
    public clearTrajectoryLines(): void {
        // Очищаем все таймеры траектории
        for (const timeoutId of this.trajectoryTimeoutIds) {
            window.clearTimeout(timeoutId);
        }
        this.trajectoryTimeoutIds = [];

        // Удаляем все линии
        for (const line of this.trajectoryLines) {
            if (line && !line.isDisposed()) {
                line.dispose();
            }
        }
        this.trajectoryLines = [];
    }

    // Update HUD elements (Reload bar, etc)
    private updateHUD(): void {
        if (!this.hud) return;

        // Update reload bar
        const now = Date.now();
        const timeSinceShot = now - this.lastShotTime;
        // Ensure progress is 0..1
        const reloadProgress = Math.min(1, Math.max(0, timeSinceShot / this.cooldown));
        const isReloading = reloadProgress < 1;

        // Call updateReload
        if (this.hud.updateReload) {
            this.hud.updateReload(reloadProgress, isReloading);
        }
    }

    /**
     * Check map triggers (custom map zones)
     */
    private checkTriggers(dt: number): void {
        const now = performance.now();
        if (now - this._lastTriggerCheck < 200) return; // Chech every 200ms
        this._lastTriggerCheck = now;

        if (!this.chassis || this.chassis.isDisposed()) return;

        // Rebuild cache if needed (e.g. every 5 seconds or if empty)
        if (this._triggerCacheDirty || (now % 5000 < 200 && this._cachedTriggerMeshes.length === 0)) {
            this._cachedTriggerMeshes = [];
            this.scene.meshes.forEach(mesh => {
                if (mesh.metadata && mesh.metadata.isTrigger && mesh.isEnabled()) {
                    this._cachedTriggerMeshes.push(mesh);
                }
            });
            this._triggerCacheDirty = false;
        }

        for (const trigger of this._cachedTriggerMeshes) {
            if (trigger.isDisposed()) {
                this._triggerCacheDirty = true;
                continue;
            }

            if (trigger.intersectsMesh(this.chassis, false)) { // AABB check is faster
                const type = trigger.metadata.triggerType;

                if (type === 'damage') {
                    // Deal 10 damage per second (2dmg per 0.2s tick)
                    if (this.healthModule) {
                        this.takeDamage(2);
                        if (this.effectsManager) {
                            // Visual feedback?
                        }
                    }
                } else if (type === 'heal') {
                    // Heal 10 HP per second
                    if (this.healthModule) {
                        this.heal(2);
                    }
                } else if (type === 'teleport') {
                    // Teleport logic requires destination. 
                    // For now, just log interaction.
                    // Ideally metadata has targetPos.
                    // If no target, maybe random jump?
                    // console.log("Teleport trigger hit!");
                }
            }
        }
    }

    updatePhysics() {
        // Защитные проверки для предотвращения крашей
        if (!this.chassis || !this.physicsBody) return;

        // Проверка на валидность chassis (disposed состояние)
        if (this.chassis.isDisposed()) return;

        // КРИТИЧЕСКИ ВАЖНО: Физика НЕ работает когда танк мёртв!
        if (!this.isAlive) {
            // Когда мёртв - останавливаем всю физику (с проверкой на валидность)
            try {
                if (this.physicsBody) {
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                }
            } catch (e) {
                // Игнорируем ошибки при остановке физики мёртвого танка
            }
            return;
        }

        try {
            // Дополнительная проверка валидности перед использованием
            if (!this.physicsBody || !this.chassis || this.chassis.isDisposed()) return;

            // КРИТИЧНО: Проверяем иерархию мешей ТОЛЬКО если она сломана (редкий случай)
            // Башня ДОЛЖНА быть дочерним элементом корпуса
            if (this.turret && this.turret.parent !== this.chassis) {
                this.turret.parent = this.chassis;
                // Восстанавливаем позицию башни строго по центру корпуса
                this.turret.position.set(0, this.turret.position.y, 0);
            }
            // Ствол ДОЛЖЕН быть дочерним элементом башни
            if (this.barrel && this.turret && this.barrel.parent !== this.turret) {
                this.barrel.parent = this.turret;
                // Восстанавливаем позицию ствола строго по центру башни
                this.barrel.position.set(0, this.barrel.position.y, this.barrel.position.z);
            }

            // УДАЛЕНО: Постоянные проверки position.x/z каждый кадр
            // Эти проверки вызывали "двойной танк" из-за floating-point сравнений
            // Позиции башни и ствола устанавливаются ОДИН РАЗ при создании

            // Обновляем время игры для системы опыта
            if (this.experienceSystem) {
                this.experienceSystem.updatePlayTime(this.chassisType.id, this.cannonType.id);
            }

            // Low health smoke effect - subtle, barely visible
            const healthPercent = this.currentHealth / this.maxHealth;
            if (healthPercent < 0.3 && this.effectsManager && this.chassis) {
                // Only create smoke occasionally (every 2 seconds) to keep it subtle
                // ОПТИМИЗАЦИЯ: Кэшируем performance.now() результат
                const now = this._tick % 120 === 0 ? performance.now() : (this._lastSmokeTime || 0) + 2000;
                if (!this._lastSmokeTime || now - this._lastSmokeTime > 2000) {
                    // ОПТИМИЗАЦИЯ: Переиспользуем Vector3 вместо clone()
                    const smokePos = this._tmpVector7;
                    smokePos.copyFrom(this._cachedChassisPosition);
                    smokePos.y = 0.5;
                    this.effectsManager.createLowHealthSmoke(smokePos);
                    this._lastSmokeTime = now;
                }
            }

            // КРИТИЧЕСКИ ВАЖНО: Физика танка НЕ зависит от режима прицеливания!
            // isAiming влияет ТОЛЬКО на камеру и прицел, НЕ на физику, позицию, скорость или вращение танка!
            // Танк должен вести себя одинаково независимо от режима прицеливания!

            // Обновляем визуализацию траектории при прицеливании
            if (this.isAiming && this.showProjectileTrajectory) {
                this.updateAimTrajectory();
            }

            // Update modules (movement, projectiles, visuals)
            // Calculate deltaTime in seconds (approximate for physics step)
            // Note: Physics engine handles physics steps, but we need dt for game logic
            const dt = this.scene.getEngine().getDeltaTime() / 1000;

            // Update Tank Components
            this.movementModule.updateMovement(dt);
            this.projectilesModule.updateShellCasings();
            this.updateProjectiles(dt); // ОПТИМИЗАЦИЯ: Ручное движение трассеров
            this.updateHUD(); // Update HUD (Reload bar)
            this.visualsModule.updateVisuals(dt);

            // Update Health (Passive repair, Invulnerability)
            this.healthModule.update(dt);

            // Check Map Triggers
            this.checkTriggers(dt);

            // === CHASSIS ACCELERATION TILT ===
            // Detect start of movement
            const currentThrottle = this.throttleTarget; // -1 to 1
            const throttleDelta = currentThrottle - this._lastThrottleInput;

            // Trigger tilt only on significant input change (acceleration start)
            // e.g. 0 -> 1 (Start Forward) or 0 -> -1 (Start Backward)
            // OR -1 -> 1 (Quick Reverse) -> Allows "Rocking" the tank!
            if (Math.abs(throttleDelta) > 0.5) {
                // Determine direction based on CHANGE in input (Delta)
                // This correctly handles both starting (0->1) and braking (1->0)
                // Delta > 0 (Accel Fwd OR Brake Rev): Lift Front (Negative Torque)
                // Delta < 0 (Accel Rev OR Brake Fwd): Dive Front (Positive Torque)
                const tiltDirection = Math.sign(throttleDelta);

                // Force Magnitude - INCREASED to 150000 (from 45000) for "Heavy Rocking"
                // This ensures the suspension reacts visibly to inertia
                const force = 50000;

                this._targetTiltTorque = -tiltDirection * force;
                this._tiltTimer = (this as any).TILT_DURATION || 800;
            }

            // Apply Tilt Torque
            if (this._tiltTimer > 0) {
                this._tiltTimer -= (dt * 1000);

                // Fade out effect
                const intensity = Math.max(0, this._tiltTimer / this.TILT_DURATION);
                const currentTorque = this._targetTiltTorque * intensity;

                // Apply torque around Local X axis (Pitch)
                // Use a temporary vector to transform local X to world space
                const localX = this.chassis.getDirection(new Vector3(1, 0, 0));
                const torqueVector = localX.scale(currentTorque);
                this.applyTorque(torqueVector);
            }

            this._lastThrottleInput = currentThrottle;
            // =================================

            // Disable inputs if menu is open
            const game = (window as any).gameInstance;
            if (game && game.isMenuOpen) {
                // Zero out inputs to prevent stuck controls
                this.movementModule.setInputs(0, 0); // Assuming movementModule handles state
                // If inputs are stored on this, reset them too (safe bet)
                (this as any).throttleTarget = 0;
                (this as any).steerTarget = 0;
                (this as any).turretTurnTarget = 0;
            } else {
                this.updateInputs();
            }

            const isPlane = this.chassisType === "plane" || (typeof this.chassisType === 'object' && (this.chassisType as any)?.id === "plane");

            if (isPlane) {
                // КРИТИЧНО: Для самолёта пропускаем стандартную физику танка (hover, upright и т.д.)
                // Вся физика самолёта обрабатывается внутри movementModule.updateInputs -> AircraftPhysics

                // DEBUG LOG (Throttled)
                // if (Math.random() < 0.01) console.log("[TankController] Skipping tank physics for PLANE. UpdateInputs called?");

                return;
            }

            const body = this.physicsBody;

            // Проверка валидности перед получением скорости
            if (!body) return;

            // КРИТИЧЕСКИ ВАЖНО: В onBeforePhysicsObservable физика еще не обновилась!
            // Физическое тело автоматически синхронизирует позицию меша ПОСЛЕ шага физики
            // Но мы находимся ДО шага физики, поэтому используем позицию меша, которая уже синхронизирована
            // с ПРЕДЫДУЩИМ шагом физики. Это правильная позиция для применения сил.
            // ОПТИМИЗАЦИЯ: Используем position вместо getAbsolutePosition() для производительности
            // position уже синхронизирован с физикой после предыдущего шага
            const pos = this._tmpVector;
            pos.copyFrom(this.chassis.position);

            // Проверка отрыва от стены (если были на стене в предыдущем кадре)
            if (this._isOnVerticalWall && this._wallNormal) {
                // Проверяем расстояние до стены через raycast
                const checkRayStart = pos.clone();
                checkRayStart.y -= (this.chassisType?.height || 1.5) * 0.3;
                const checkDir = this._wallNormal.scale(-1); // Направление к стене
                const checkRay = new Ray(checkRayStart, checkDir, this.wallAttachmentDistance * 2.0);

                const obstacleFilter = (mesh: any) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "playerTank")) return false;
                    if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
                    return true;
                };

                const checkHit = this.scene.pickWithRay(checkRay, obstacleFilter);

                // Если стена слишком далеко или не найдена - отрываемся
                if (!checkHit || !checkHit.hit || (checkHit.distance > this.wallAttachmentDistance * 1.8)) {
                    this._isOnVerticalWall = false;
                    this._wallNormal = null;
                    this._wallDistance = 0;
                    this._wallHitPoint = null;
                } else {
                    // Обновляем расстояние до стены
                    this._wallDistance = checkHit.distance;
                }
            }

            // Центр масс смещен на (0, -0.4, 0), но applyForce автоматически учитывает это
            let vel: Vector3 | null = null;
            let angVel: Vector3 | null = null;

            try {
                vel = body.getLinearVelocity();
                angVel = body.getAngularVelocity();
            } catch (e) {
                // Если не удалось получить скорость, выходим
                return;
            }

            // Проверка на null/undefined после получения скорости
            if (!vel || !angVel) return;

            // Проверка на валидность векторов (NaN или Infinity)
            if (!isFinite(vel.x) || !isFinite(vel.y) || !isFinite(vel.z) ||
                !isFinite(angVel.x) || !isFinite(angVel.y) || !isFinite(angVel.z)) {
                return;
            }

            // Объявляем переменную для экстренного демпфирования (используется позже в hover системе)
            let emergencyDampingForce = 0;

            // Ограничиваем вертикальную скорость и угловую скорость, чтобы исключить "взлёты"
            const maxUpwardSpeed = 4.0; // Снижено с 12 до 4.0 м/с для предотвращения подпрыгиваний
            const maxDownwardSpeed = 35; // Оставлено без изменений (нормально для падения)

            // Плавное принудительное ограничение вертикальной скорости каждый кадр
            const targetVelY = Math.max(-maxDownwardSpeed, Math.min(maxUpwardSpeed, vel.y));
            if (Math.abs(vel.y - targetVelY) > 0.1) {
                vel.y = vel.y * 0.7 + targetVelY * 0.3; // Плавная коррекция
                try {
                    body.setLinearVelocity(vel);
                } catch (_e) {
                    // ignore
                }
            }

            // Экстренное демпфирование при слишком быстром подъеме
            if (vel.y > 3.0) {
                emergencyDampingForce = -(vel.y - 3.0) * this.mass * 200; // Сильное демпфирование
            }

            const maxAngularSpeed = 2.5;
            const angMag = angVel.length();
            if (angMag > maxAngularSpeed) {
                angVel.scaleInPlace(maxAngularSpeed / Math.max(angMag, 0.0001));
                try {
                    body.setAngularVelocity(angVel);
                } catch (_e) {
                    // ignore
                }
            }

            // Get tank orientation vectors (in world space) - оптимизировано
            // КРИТИЧЕСКИ ВАЖНО: НЕ вызываем computeWorldMatrix здесь!
            // Физическое тело автоматически обновляет позицию и вращение меша ПОСЛЕ шага физики
            // Вызов computeWorldMatrix здесь может вызывать конфликт и дрожание
            // Используем getWorldMatrix() который автоматически обновит матрицу если нужно
            const rotMatrix = this.chassis.getWorldMatrix();

            // Используем переиспользуемые векторы для оптимизации памяти
            const forward = Vector3.TransformNormalToRef(Vector3.Forward(), rotMatrix, this._tmpVector2);
            forward.normalize();
            const right = Vector3.TransformNormalToRef(Vector3.Right(), rotMatrix, this._tmpVector3);
            right.normalize();
            const up = Vector3.TransformNormalToRef(Vector3.Up(), rotMatrix, this._tmpVector4);
            up.normalize();

            // === ИСПРАВЛЕНИЕ: Блокировка движения при перевороте танка ===
            // Если танк перевёрнут или лежит на боку (up.y < 0.3), полностью блокируем движение
            if (up.y < 0.3) {
                // Танк перевёрнут - блокируем ВСЕ входные данные
                this.smoothThrottle = 0;
                this.smoothSteer = 0;
                this.throttleTarget = 0;
                this.steerTarget = 0;

                // Мягко демпфируем скорость (не резкая остановка)
                const dampedVel = vel.scale(0.92);
                try {
                    body.setLinearVelocity(dampedVel);
                } catch (e) { /* ignore */ }

                // Применяем только корректирующий момент для выравнивания танка
                const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
                const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
                const emergencyTorque = new Vector3(
                    -tiltX * 20000,  // Выравнивание по X
                    0,
                    -tiltZ * 20000   // Выравнивание по Z
                );
                this.applyTorque(emergencyTorque);

                // Пропускаем ВСЕ остальные системы движения (hover, climb, movement и т.д.)
                // Но продолжаем обновлять башню и ствол
                if (this.turret && !this.turret.isDisposed()) {
                    this.turretTurnSmooth += (this.turretTurnTarget - this.turretTurnSmooth) * this.turretLerpSpeed;
                }
                return;
            }

            // Кэшируем часто используемые значения для оптимизации
            const fwdSpeed = Vector3.Dot(vel, forward);
            const absFwdSpeed = Math.abs(fwdSpeed);
            const isMoving = absFwdSpeed > 0.5;

            // === ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ===
            this._logFrameCounter++;
            const shouldLog = loggingSettings.getLevel() >= LogLevel.VERBOSE &&
                loggingSettings.isCategoryEnabled(LogCategory.PHYSICS) &&
                (this._logFrameCounter % 30 === 0 || up.y < 0.7 || Math.abs(vel.length()) > 30);

            if (shouldLog) {
                const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
                const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
                const speed = vel.length();
                // Используем кэшированное значение fwdSpeed

                physicsLogger.verbose("═══════════════════════════════════════════════════════");
                physicsLogger.verbose(`[TANK PHYSICS] Frame ${this._logFrameCounter}`);
                physicsLogger.verbose(`  POSITION:     [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}]`);
                physicsLogger.verbose(`  VELOCITY:     [${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)}] | Speed: ${speed.toFixed(2)} m/s | Fwd: ${fwdSpeed.toFixed(2)} m/s`);
                physicsLogger.verbose(`  ANGULAR VEL:  [${angVel.x.toFixed(2)}, ${angVel.y.toFixed(2)}, ${angVel.z.toFixed(2)}]`);
                physicsLogger.verbose(`  ORIENTATION:`);
                physicsLogger.verbose(`    Forward:    [${forward.x.toFixed(2)}, ${forward.y.toFixed(2)}, ${forward.z.toFixed(2)}]`);
                physicsLogger.verbose(`    Up:         [${up.x.toFixed(2)}, ${up.y.toFixed(2)}, ${up.z.toFixed(2)}] | Up.y: ${up.y.toFixed(3)}`);
                physicsLogger.verbose(`    Right:      [${right.x.toFixed(2)}, ${right.y.toFixed(2)}, ${right.z.toFixed(2)}]`);
                physicsLogger.verbose(`  TILT:         X: ${(tiltX * 180 / Math.PI).toFixed(1)}° | Z: ${(tiltZ * 180 / Math.PI).toFixed(1)}°`);
                physicsLogger.verbose(`  INPUTS:       Throttle: ${this.throttleTarget.toFixed(2)} → ${this.smoothThrottle.toFixed(2)} | Steer: ${this.steerTarget.toFixed(2)} → ${this.smoothSteer.toFixed(2)}`);
                physicsLogger.verbose("═══════════════════════════════════════════════════════");
            }

            // --- GROUND CLAMPING (определение высоты земли) ---
            // СНАЧАЛА определяем высоту земли, чтобы hover система работала относительно неё
            // Raycast вниз для определения высоты земли (кэшируем каждые 8 кадров для оптимизации)
            let groundHeight = pos.y - this.hoverHeight; // Значение по умолчанию

            // ОПТИМИЗАЦИЯ: Увеличено кэш-время raycast с 6 до 8 кадров для лучшей производительности
            if (!this._groundRaycastCache || (this._logFrameCounter - this._groundRaycastCache.frame) >= 8) {
                // ОПТИМИЗАЦИЯ: Переиспользуем Vector3 вместо clone()
                const groundRayStart = this._tmpVector4;
                groundRayStart.copyFrom(pos);
                groundRayStart.y += 0.5; // Немного выше танка
                const groundRayDir = Vector3.Down();
                const groundRayLength = 10.0; // Достаточно для любой высоты
                const groundRay = new Ray(groundRayStart, groundRayDir, groundRayLength);

                const groundFilter = (mesh: any) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "playerTank")) return false;
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
                        frame: this._logFrameCounter
                    };
                } else {
                    // Если не нашли землю, используем текущую высоту минус hoverHeight
                    this._groundRaycastCache = {
                        groundHeight: pos.y - this.hoverHeight,
                        frame: this._logFrameCounter
                    };
                }
            } else {
                groundHeight = this._groundRaycastCache.groundHeight;
            }

            // --- 1. OPTIMIZED HOVER (Simplified height control) ---
            // КРИТИЧЕСКИ ВАЖНО: Hover работает ОТНОСИТЕЛЬНО ЗЕМЛИ, а не абсолютной высоты!
            // Целевая высота = высота земли + hoverHeight

            // НА СТЕНЕ: hover система работает по-другому
            let hoverForce = 0;
            let totalVerticalForce = 0;
            if (this._isOnVerticalWall) {
                // На стене не применяем обычный hover - используем прилипание
                hoverForce = 0;
                totalVerticalForce = 0;
            } else {
                // FIX: Защита от проваливания под террейн БЕЗ прямого изменения позиции
                // Для DYNAMIC bodies нельзя напрямую менять mesh.position - это вызывает "дёрганье"
                // Вместо этого применяем сильный импульс вверх
                if (pos.y < groundHeight - 1.0) {
                    // Применяем импульс для выталкивания танка вверх
                    const pushUpForce = (groundHeight + 1.5 - pos.y) * 50000;
                    if (this.physicsBody) {
                        this.physicsBody.applyForce(new Vector3(0, pushUpForce, 0), pos);
                        // Гасим вертикальную скорость вниз
                        if (vel.y < -5) {
                            this.physicsBody.setLinearVelocity(new Vector3(vel.x, -5, vel.z));
                        }
                    }
                }

                const targetHeight = groundHeight + this.hoverHeight;
                const deltaY = targetHeight - pos.y; // Положительно когда танк ниже цели
                const velY = vel.y;

                const absVelY = Math.abs(velY);

                // ТАНКОВАЯ ПРОХОДИМОСТЬ: Адаптивная hover-система с поддержкой преодоления препятствий
                if (deltaY > 0) {
                    // Танк ниже цели - применяем hover для поднятия
                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: При движении вверх по склону - НЕ уменьшаем hover
                    const isClimbing = deltaY > 0 && Math.abs(this.smoothThrottle) > 0.3;
                    const hoverSensitivity = isMoving && !isClimbing ? 0.4 : 1.0; // УВЕЛИЧЕНО: меньше уменьшение при движении
                    const stiffnessMultiplier = 1.0 + Math.min(Math.abs(deltaY) * 0.03, 0.2) * hoverSensitivity; // УВЕЛИЧЕНО для более быстрой реакции
                    const dampingMultiplier = isMoving ? 2.5 : 2.0; // УМЕНЬШЕНО демпфирование для лучшего подъёма
                    hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping * dampingMultiplier);

                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: При движении вверх по склону - НЕ уменьшаем hover
                    const movementReduction = isMoving && !isClimbing ? 0.6 : 1.0; // УВЕЛИЧЕНО с 0.35 до 0.6
                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: Значительно увеличенные лимиты для преодоления препятствий
                    const dynamicMaxForce = Math.min(
                        (absVelY > 30 ? 3000 : (absVelY > 15 ? 6000 : 10000)) * movementReduction, // 4x УВЕЛИЧЕНО
                        this.hoverStiffness * 1.5 // УВЕЛИЧЕНО с 0.5 до 1.5
                    );
                    hoverForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
                } else {
                    // Танк выше цели - демпфирование вниз
                    // КРИТИЧНО: Во время прыжка или при активном газе ослабляем демпфирование
                    const isActiveClimb = Math.abs(this.smoothThrottle) > 0.3;
                    const dampingMultiplier = this.isJumping ? 0.1 : (isActiveClimb ? 1.5 : 3.0); // УМЕНЬШЕНО при активном газе
                    hoverForce = -velY * this.hoverDamping * dampingMultiplier;

                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: Прижатие только при НЕАКТИВНОМ движении
                    if (deltaY < -0.15 && !this.isJumping && !isActiveClimb) {
                        hoverForce -= Math.abs(deltaY) * this.mass * 60; // УМЕНЬШЕНО с 120 до 60
                    }

                    // КРИТИЧНО: Во время прыжка и при движении вверх - полностью отключаем hover
                    if (this.isJumping && velY > 2) {
                        hoverForce = 0;
                    }
                    const clampedHoverForce = hoverForce;

                    // Накопление всех вертикальных сил в одну для предотвращения конфликтов
                    let totalVerticalForce = clampedHoverForce;

                    // Добавляем экстренное демпфирование при слишком быстром подъеме (из ограничения скорости)
                    if (emergencyDampingForce !== 0) {
                        totalVerticalForce += emergencyDampingForce;
                    }

                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: Прижимаем ТОЛЬКО если танк летит вверх БЕЗ газа (нежелательный полёт)
                    const heightDiff = pos.y - targetHeight;
                    const isUnwantedFlight = heightDiff > 0.1 && Math.abs(this.smoothThrottle) < 0.2;
                    if (isUnwantedFlight) {
                        const clampForce = -heightDiff * this.mass * 60; // УМЕНЬШЕНО с 120 до 60
                        const maxClampForce = -this.mass * 200; // УМЕНЬШЕНО с 400 до 200
                        const clampedForce = Math.max(maxClampForce, clampForce);
                        totalVerticalForce += clampedForce;

                        // Дополнительное демпфирование при полете (только без газа)
                        if (vel.y > 0.5) {
                            totalVerticalForce -= vel.y * this.mass * 15; // УМЕНЬШЕНО с 25 до 15
                        }
                    }

                    // ТАНКОВАЯ ПРОХОДИМОСТЬ: Экстренное прижатие только если НЕ едем вперед
                    const isNotDriving = Math.abs(this.smoothThrottle) < 0.1;
                    if (heightDiff > 0.5 && isNotDriving) {
                        const emergencyClampForce = -this.mass * 300; // УМЕНЬШЕНО с 500 до 300
                        totalVerticalForce += emergencyClampForce;
                        // Принудительно ограничиваем вертикальную скорость
                        if (vel.y > 0) {
                            const emergencyVelDamping = -vel.y * this.mass * 30; // УМЕНЬШЕНО с 50 до 30
                            totalVerticalForce += emergencyVelDamping;
                        }
                    }

                    if (shouldLog) {
                        physicsLogger.verbose(`  [HOVER] GroundY: ${groundHeight.toFixed(2)} | TargetY: ${targetHeight.toFixed(2)} | CurrentY: ${pos.y.toFixed(2)} | DeltaY: ${deltaY.toFixed(3)} | VelY: ${velY.toFixed(2)} | Force: ${clampedHoverForce.toFixed(0)}`);
                    }
                }
            }

            // Дополнительная стабилизация при движении (отключена для предотвращения тряски)
            // Эта сила конфликтует с hover и вызывает тряску
            // if (Math.abs(Vector3.Dot(vel, forward)) > 2) {
            //     const stabilityForceVal = -velY * this.stabilityForce * 0.6;
            //     const maxStabilityForce = 3000;
            //     const clampedStabilityForce = Math.max(-maxStabilityForce, Math.min(maxStabilityForce, stabilityForceVal));
            //     const stabilityForceVec = this._tmpVector6;
            //     stabilityForceVec.set(0, clampedStabilityForce, 0);
            //     body.applyForce(stabilityForceVec, pos);
            // }

            // --- 2. KEEP UPRIGHT (Проактивная система выравнивания) ---
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));  // Forward/back tilt
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x))); // Left/right tilt

            // Определяем степень опрокидывания (менее чувствительные пороги для уменьшения тряски)
            const isSlightlyTilted = up.y < 0.80 || Math.abs(tiltX) > 0.25 || Math.abs(tiltZ) > 0.25;
            const isModeratelyTilted = up.y < 0.65 || Math.abs(tiltX) > 0.5 || Math.abs(tiltZ) > 0.5;
            const isSeverelyTilted = up.y < 0.45 || Math.abs(tiltX) > 0.7 || Math.abs(tiltZ) > 0.7;
            const isCriticallyTilted = up.y < 0.25 || Math.abs(tiltX) > 1.1 || Math.abs(tiltZ) > 1.1;

            // КРИТИЧЕСКИ ВАЖНО: При движении уменьшаем корректирующие моменты для предотвращения тряски
            // Используем кэшированное значение isMoving для оптимизации
            // УВЕЛИЧЕНО уменьшение при движении для устранения дрожания
            const uprightSensitivity = isMoving ? 0.3 : 1.0; // Еще больше уменьшено при движении (было 0.5)

            // Адаптивное ограничение: больше силы при сильном опрокидывании (уменьшено для плавности)
            // Дополнительно уменьшаем при движении для предотвращения тряски
            const baseMaxTorque = isCriticallyTilted ? 15000 : (isSeverelyTilted ? 10000 : (isModeratelyTilted ? 6000 : 4000));
            const maxTorquePerFrame = isMoving ? baseMaxTorque * 0.7 : baseMaxTorque; // Уменьшаем при движении

            // Базовая корректирующая сила (всегда активна, но менее агрессивная при движении)
            // Дополнительно уменьшаем агрессивность при движении для предотвращения дёргания
            const movementDamping = isMoving ? 0.5 : 1.0; // Еще больше уменьшено при движении (было 0.7)
            let correctiveX = -tiltX * this.uprightForce * 0.6 * uprightSensitivity * movementDamping - angVel.x * this.uprightDamp * uprightSensitivity * movementDamping;
            let correctiveZ = -tiltZ * this.uprightForce * 0.6 * uprightSensitivity * movementDamping - angVel.z * this.uprightDamp * uprightSensitivity * movementDamping;
            const baseCorrectiveX = correctiveX;
            const baseCorrectiveZ = correctiveZ;

            // Усиливаем силу при наклоне (менее агрессивные множители для уменьшения тряски)
            // Дополнительно уменьшаем множители при движении
            let multiplier = 1.0;
            if (isSlightlyTilted) {
                const baseMultiplier = isCriticallyTilted ? 2.0 : (isSeverelyTilted ? 1.6 : (isModeratelyTilted ? 1.3 : 1.1));
                multiplier = isMoving ? baseMultiplier * 0.8 : baseMultiplier; // Дополнительное уменьшение при движении
                correctiveX *= multiplier;
                correctiveZ *= multiplier;
            }

            // Ограничиваем максимальную силу за кадр (но больше при опрокидывании)
            const torqueMagnitude = Math.sqrt(correctiveX * correctiveX + correctiveZ * correctiveZ);
            const wasClamped = torqueMagnitude > maxTorquePerFrame;
            if (wasClamped) {
                const scale = maxTorquePerFrame / torqueMagnitude;
                correctiveX *= scale;
                correctiveZ *= scale;
            }

            // Накопление всех корректирующих моментов в один для предотвращения конфликтов
            let totalCorrectiveX = correctiveX;
            let totalCorrectiveZ = correctiveZ;

            // Применяем ВСЕ корректирующие моменты одной командой (предотвращает конфликты и тряску)
            const totalCorrectiveMagnitude = Math.sqrt(totalCorrectiveX * totalCorrectiveX + totalCorrectiveZ * totalCorrectiveZ);
            const totalMaxTorque = maxTorquePerFrame * 1.5; // Общий максимум для всех корректирующих сил
            if (totalCorrectiveMagnitude > totalMaxTorque) {
                const scale = totalMaxTorque / totalCorrectiveMagnitude;
                totalCorrectiveX *= scale;
                totalCorrectiveZ *= scale;
            }

            // Use separate vector to avoid corrupting forward
            const totalCorrectiveTorque = this._tmpVector7;
            totalCorrectiveTorque.set(totalCorrectiveX, 0, totalCorrectiveZ);
            this.applyTorque(totalCorrectiveTorque);

            if (shouldLog) {
                physicsLogger.verbose(`  [UPRIGHT] Tilt: X=${(tiltX * 180 / Math.PI).toFixed(1)}° Z=${(tiltZ * 180 / Math.PI).toFixed(1)}°`);
                physicsLogger.verbose(`    States: Slight=${isSlightlyTilted} Moderate=${isModeratelyTilted} Severe=${isSeverelyTilted} Critical=${isCriticallyTilted}`);
                physicsLogger.verbose(`    Base Torque: [${baseCorrectiveX.toFixed(0)}, ${baseCorrectiveZ.toFixed(0)}] | Mult: ${multiplier.toFixed(2)}`);
                physicsLogger.verbose(`    Total Torque: [${totalCorrectiveX.toFixed(0)}, ${totalCorrectiveZ.toFixed(0)}] | Mag: ${totalCorrectiveMagnitude.toFixed(0)}`);
            }

            // Экстренное выравнивание при умеренном и сильном опрокидывании (объединено с базовым)
            if (isModeratelyTilted) {
                // Экстренное выравнивание - менее агрессивное для уменьшения тряски
                // Дополнительно уменьшаем при движении для предотвращения дёргания
                const baseEmergencyMultiplier = isCriticallyTilted ? 2.0 : (isSeverelyTilted ? 1.5 : 1.2);
                const emergencyMultiplier = isMoving ? baseEmergencyMultiplier * 0.7 : baseEmergencyMultiplier; // Сильно уменьшено при движении
                let emergencyX = -tiltX * this.emergencyForce * emergencyMultiplier * 0.6;
                let emergencyZ = -tiltZ * this.emergencyForce * emergencyMultiplier * 0.6;

                // Ограничиваем экстренную силу (но больше при критическом опрокидывании)
                const emergencyMax = isCriticallyTilted ? maxTorquePerFrame * 1.8 : (isSeverelyTilted ? maxTorquePerFrame * 1.5 : maxTorquePerFrame * 1.2); // Уменьшено
                const emergencyMagnitude = Math.sqrt(emergencyX * emergencyX + emergencyZ * emergencyZ);
                const emergencyWasClamped = emergencyMagnitude > emergencyMax;
                if (emergencyWasClamped) {
                    const scale = emergencyMax / emergencyMagnitude;
                    emergencyX *= scale;
                    emergencyZ *= scale;
                }

                // Добавляем к общей корректирующей силе вместо отдельного применения
                totalCorrectiveX += emergencyX;
                totalCorrectiveZ += emergencyZ;

                // Lift force полностью отключен для предотвращения подпрыгиваний
                // (liftForce = 0 в параметрах физики)

                if (shouldLog) {
                    physicsLogger.verbose(`  [EMERGENCY] Torque: [${emergencyX.toFixed(0)}, ${emergencyZ.toFixed(0)}] | Mult: ${emergencyMultiplier.toFixed(2)} | Clamped: ${emergencyWasClamped}`);
                }
            }

            // HEAVY & RESPONSIVE: Прижимная сила при движении (зависит от скорости)
            // Используем кэшированное значение absFwdSpeed для оптимизации
            if (absFwdSpeed > 1) {
                // Downforce Factor: прижимная сила = downforceFactor * velocity
                const downforceFactor = PHYSICS_CONFIG.tank.arcade.downforceFactor;
                const downForceVal = downforceFactor * absFwdSpeed * (1.0 - up.y) * 0.5;
                totalVerticalForce -= downForceVal; // Добавляем к общей вертикальной силе

                if (shouldLog) {
                    physicsLogger.verbose(`  [DOWNFORCE] Force: ${downForceVal.toFixed(0)} | Factor: ${downforceFactor} | Speed: ${absFwdSpeed.toFixed(2)}`);
                }
            }

            // Автоматический сброс при критическом опрокидывании или застревании
            const isFallen = pos.y < -10 || up.y < 0.2 || Math.abs(tiltX) > 1.2 || Math.abs(tiltZ) > 1.2;
            const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.4;

            if (isFallen || isStuck) {
                if (shouldLog) {
                    physicsLogger.verbose(`  [RESET] Fallen: ${isFallen} | Stuck: ${isStuck} | Timer: ${this._resetTimer ? ((Date.now() - this._resetTimer) / 1000).toFixed(1) + 's' : 'none'}`);
                }
                // Небольшая задержка перед сбросом, чтобы дать системе выравнивания шанс
                if (!this._resetTimer) {
                    this._resetTimer = Date.now();
                } else if (Date.now() - this._resetTimer > 2000) { // 2 секунды
                    if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                        physicsLogger.debug(`  [RESET] Executing reset!`);
                    }
                    this.reset();
                    this._resetTimer = 0;
                }
            } else {
                this._resetTimer = 0; // Сбрасываем таймер если танк восстановился
            }

            // HEAVY & RESPONSIVE: Прижимная сила при движении (зависит от скорости)
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const downforceFactor = PHYSICS_CONFIG.tank.arcade.downforceFactor;
                const throttleDownForceVal = Math.abs(this.smoothThrottle) * downforceFactor * absFwdSpeed * 0.4;
                totalVerticalForce -= throttleDownForceVal; // Добавляем к общей вертикальной силе
            }

            // Применяем ВСЮ вертикальную силу одной командой (предотвращает конфликты и тряску)
            // Проверка валидности перед применением силы
            if (body && isFinite(totalVerticalForce)) {
                const verticalForceVec = this._tmpVector6;
                verticalForceVec.set(0, totalVerticalForce, 0);
                try {
                    body.applyForce(verticalForceVec, pos);
                } catch (e) {
                    logger.warn("[TANK] Error applying vertical force:", e);
                }
            }

            // =============================================================
            // --- СИСТЕМА "СКРУГЛЁННЫЕ ГУСЕНИЦЫ" - АВТОПОДЪЁМ НА ПРЕПЯТСТВИЯ ---
            // Многолучевая система для имитации закруглённой передней части
            // =============================================================
            let climbForce = 0;
            let slopeMultiplier = 1.0;
            let isClimbingObstacle = false;

            // Фильтр для raycast (исключаем танк и снаряды)
            const obstacleFilter = (mesh: any) => {
                if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                const meta = mesh.metadata;
                if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "playerTank")) return false;
                if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
                return true;
            };

            const throttleAbs = Math.abs(this.smoothThrottle);
            const movingForward = this.smoothThrottle > 0.1;
            const movingBackward = this.smoothThrottle < -0.1;
            const isClimbMoving = throttleAbs > 0.1;

            // Если танк не движется и был на стене - сбрасываем состояние
            if (!isClimbMoving && this._isOnVerticalWall) {
                this._isOnVerticalWall = false;
                this._wallNormal = null;
                this._wallDistance = 0;
                this._wallHitPoint = null;
            }

            if (isClimbMoving) {
                // Направление движения (вперёд или назад)
                const moveDir = movingForward ? forward.clone() : forward.scale(-1);
                const tankHeight = this.chassisType?.height || 1.5;
                const tankDepth = this.chassisType?.depth || 4.0;

                // === ЛУЧ 1: ГОРИЗОНТАЛЬНЫЙ (обнаружение стены) ===
                // Стреляем от нижней передней части танка горизонтально
                const wallRayStart = pos.clone();
                wallRayStart.y -= tankHeight * 0.3; // Ниже центра (уровень гусениц)
                wallRayStart.addInPlace(moveDir.scale(tankDepth * 0.3)); // Смещение к передней части

                const wallRay = new Ray(wallRayStart, moveDir, 2.5);
                const wallHit = this.scene.pickWithRay(wallRay, obstacleFilter);

                if (wallHit && wallHit.hit && wallHit.pickedPoint && wallHit.distance < this.wallAttachmentDistance) {
                    // ИСПРАВЛЕНИЕ: Проверяем нормаль поверхности чтобы различать склоны от вертикальных стен
                    const wallNormal = wallHit.getNormal(true); // true = world space

                    if (wallNormal && wallNormal.y < this.verticalWallThreshold) {
                        // Это ВЕРТИКАЛЬНАЯ СТЕНА (угол ≥70°)

                        // Плавное включение режима прилипания
                        const attachmentIntensity = 1.0 - Math.min(wallHit.distance / this.wallAttachmentDistance, 1.0);
                        const smoothAttachment = this._isOnVerticalWall ?
                            1.0 :
                            Math.min(1.0, attachmentIntensity / this.wallAttachmentSmoothing);

                        // Сохраняем состояние стены
                        this._isOnVerticalWall = smoothAttachment > 0.1;
                        if (this._isOnVerticalWall) {
                            if (!this._wallNormal) {
                                this._wallNormal = new Vector3();
                            }
                            this._wallNormal.copyFrom(wallNormal);
                            this._wallDistance = wallHit.distance;
                            if (!this._wallHitPoint) {
                                this._wallHitPoint = new Vector3();
                            }
                            this._wallHitPoint.copyFrom(wallHit.pickedPoint);
                        }

                        // Применяем силу прилипания (направлена к стене)
                        // Базовая сила работает всегда, дополнительная - при движении
                        if (this._isOnVerticalWall && body && this._wallNormal) {
                            // Базовая сила прилипания (работает всегда)
                            const baseAttachmentForce = this.wallBaseAttachmentForce * smoothAttachment;
                            // Дополнительная сила при движении
                            const movementAttachmentForce = this.wallAttachmentForce * smoothAttachment * throttleAbs * 0.5;
                            const totalAttachmentForce = baseAttachmentForce + movementAttachmentForce;

                            if (isFinite(totalAttachmentForce) && totalAttachmentForce > 0) {
                                this._wallNormal.scaleToRef(-totalAttachmentForce, this._tmpVector7); // К стене
                                try {
                                    body.applyForce(this._tmpVector7, pos);
                                } catch (e) { /* ignore */ }
                            }
                        }

                        isClimbingObstacle = false; // Не применяем climb assist
                    } else {
                        // Это ПОЛОГИЙ СКЛОН (нормаль направлена вверх, y >= verticalWallThreshold) - применяем climb assist
                        // Плавное отключение при переходе к пологому склону
                        if (this._isOnVerticalWall && wallNormal && wallNormal.y >= this.verticalWallThreshold) {
                            this._isOnVerticalWall = false;
                            this._wallNormal = null;
                        }
                        isClimbingObstacle = true;
                    }

                    // Применяем climb assist ТОЛЬКО для пологих склонов
                    if (!isClimbingObstacle) {
                        // Вертикальная стена - пропускаем весь climb assist код
                    } else {
                        // === ЛУЧ 2: ВЕРТИКАЛЬНЫЙ ВВЕРХ (определение высоты препятствия) ===
                        const heightRayStart = wallHit.pickedPoint.clone();
                        heightRayStart.y = pos.y - tankHeight * 0.5; // От нижней точки танка

                        const heightRay = new Ray(heightRayStart, Vector3.Up(), this.maxClimbHeight + 1);
                        const heightHit = this.scene.pickWithRay(heightRay, obstacleFilter);

                        // Высота препятствия = расстояние до верха или maxClimbHeight если не нашли
                        let obstacleHeight: number;
                        if (heightHit && heightHit.hit) {
                            obstacleHeight = heightHit.distance;
                        } else {
                            // Луч не попал - препятствие ниже чем мы думали или это край
                            // Попробуем определить высоту по точке удара
                            obstacleHeight = Math.max(0, wallHit.pickedPoint.y - (pos.y - tankHeight * 0.5));
                        }

                        // === ЛУЧ 3: ПРОВЕРКА ВЕРХА ПРЕПЯТСТВИЯ ===
                        // Стреляем вниз сверху препятствия чтобы найти его верхнюю грань
                        const topCheckStart = wallHit.pickedPoint.clone();
                        topCheckStart.y = pos.y + this.maxClimbHeight;
                        topCheckStart.addInPlace(moveDir.scale(0.5)); // Чуть впереди

                        const topRay = new Ray(topCheckStart, Vector3.Down(), this.maxClimbHeight * 2);
                        const topHit = this.scene.pickWithRay(topRay, obstacleFilter);

                        if (topHit && topHit.hit && topHit.pickedPoint) {
                            // Нашли верхнюю грань - пересчитываем высоту
                            const topY = topHit.pickedPoint.y;
                            const currentBottomY = pos.y - tankHeight * 0.5;
                            obstacleHeight = Math.max(0, topY - currentBottomY);
                        }

                        // Проверяем можем ли преодолеть
                        if (obstacleHeight > 0.05 && obstacleHeight <= this.maxClimbHeight) {
                            // Интенсивность зависит от близости к стене и высоты препятствия
                            const proximityFactor = 1.0 - Math.min(wallHit.distance / 2.0, 1.0);
                            const heightFactor = Math.min(obstacleHeight / this.maxClimbHeight, 1.0);
                            const climbIntensity = proximityFactor * (0.5 + heightFactor * 0.5) * throttleAbs;

                            // === СИЛА 1: ПОДЪЁМ ВВЕРХ ===
                            // Чем ближе к стене и чем выше препятствие - тем сильнее подъём
                            climbForce = this.climbAssistForce * climbIntensity;

                            // === СИЛА 2: ПОДЪЁМ ПЕРЕДНЕЙ ЧАСТИ (применяется к точке впереди) ===
                            const frontLiftForce = this.frontClimbForce * climbIntensity;
                            const frontPoint = pos.clone();
                            frontPoint.addInPlace(moveDir.scale(tankDepth * 0.4)); // Передняя точка
                            frontPoint.y -= tankHeight * 0.3;

                            // МУЛЬТИПЛЕЕР: Пропускаем все силы climb assist
                            if (!this.isMultiplayerMode && body && isFinite(frontLiftForce)) {
                                const liftVec = new Vector3(0, frontLiftForce, 0);
                                try {
                                    body.applyForce(liftVec, frontPoint);
                                } catch (e) { /* ignore */ }
                            }

                            // === СИЛА 3: ПРОТАЛКИВАНИЕ ВПЕРЁД ===
                            const pushForce = this.wallPushForce * climbIntensity;
                            // МУЛЬТИПЛЕЕР: Пропускаем
                            if (!this.isMultiplayerMode && body && isFinite(pushForce)) {
                                const pushVec = moveDir.scale(pushForce);
                                try {
                                    body.applyForce(pushVec, pos);
                                } catch (e) { /* ignore */ }
                            }

                            // === МОМЕНТ: ПОДНЯТИЕ НОСА ТАНКА ===
                            // Создаём момент чтобы нос танка поднимался при преодолении препятствия
                            // ИНВЕРТИРОВАНО: минус делает нос вверх, а не зад!
                            const climbTorqueValue = -this.climbTorque * climbIntensity * (movingForward ? 1 : -1);
                            // МУЛЬТИПЛЕЕР: Пропускаем
                            if (!this.isMultiplayerMode && body && isFinite(climbTorqueValue)) {
                                // Момент вокруг боковой оси (pitch) - поднимаем нос
                                const rightAxis = Vector3.Cross(Vector3.Up(), forward).normalize();
                                const torqueVec = rightAxis.scale(climbTorqueValue);
                                try {
                                    body.applyAngularImpulse(torqueVec);
                                } catch (e) { /* ignore */ }
                            }

                            if (shouldLog) {
                                physicsLogger.verbose(`  [ROUNDED TRACKS] WallDist: ${wallHit.distance.toFixed(2)} | ObstacleH: ${obstacleHeight.toFixed(2)} | Intensity: ${climbIntensity.toFixed(2)} | LiftF: ${climbForce.toFixed(0)} | FrontF: ${frontLiftForce.toFixed(0)}`);
                            }
                        }
                    } // Закрытие else блока (пологий склон)
                }

                // === ДОПОЛНИТЕЛЬНЫЙ ЛУЧ: НАКЛОННЫЙ ВПЕРЁД-ВНИЗ (склоны) ===
                if (!isClimbingObstacle) {
                    const slopeRayStart = pos.clone();
                    slopeRayStart.y += tankHeight * 0.2;

                    const slopeDir = moveDir.clone();
                    slopeDir.y = -0.5;
                    slopeDir.normalize();

                    const slopeRay = new Ray(slopeRayStart, slopeDir, 4.0);
                    const slopeHit = this.scene.pickWithRay(slopeRay, obstacleFilter);

                    if (slopeHit && slopeHit.hit && slopeHit.pickedPoint) {
                        const slopeHeight = slopeHit.pickedPoint.y - groundHeight;

                        if (slopeHeight > 0.1 && slopeHeight < this.maxClimbHeight) {
                            // Пологий склон - применяем буст
                            const slopeAngle = Math.atan2(slopeHeight, slopeHit.distance);
                            slopeMultiplier = 1.0 + Math.min(slopeAngle * 3.0, this.slopeBoostMax - 1.0);

                            // Небольшая помощь подъёму
                            climbForce += this.climbAssistForce * 0.3 * throttleAbs * Math.min(slopeAngle, 0.8);

                            if (shouldLog) {
                                physicsLogger.verbose(`  [SLOPE BOOST] SlopeH: ${slopeHeight.toFixed(2)} | Angle: ${(slopeAngle * 180 / Math.PI).toFixed(1)}° | Mult: ${slopeMultiplier.toFixed(2)}`);
                            }
                        }
                    }
                }

                // --- ЗАМЕДЛЕНИЕ НА КРУТЫХ СКЛОНАХ ---
                // Если танк поднимается под большим углом - замедляем его
                if (isClimbingObstacle) {
                    // Определяем угол наклона танка
                    const rotMatrix = new Matrix();
                    this.chassis.rotationQuaternion?.toRotationMatrix(rotMatrix);
                    const tankUpTransformed = Vector3.TransformNormal(Vector3.Up(), rotMatrix);
                    const tiltAngle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(tankUpTransformed, Vector3.Up()))));

                    // Если наклон больше 20 градусов (0.35 рад) - замедляем
                    if (tiltAngle > 0.35) {
                        const slowdownFactor = 1.0 - Math.min(0.5, (tiltAngle - 0.35) * 1.5);
                        slopeMultiplier *= slowdownFactor;

                        if (shouldLog) {
                            physicsLogger.verbose(`  [CLIMB SLOWDOWN] TiltAngle: ${(tiltAngle * 180 / Math.PI).toFixed(1)}° | Slowdown: ${slowdownFactor.toFixed(2)}`);
                        }
                    }
                }
            }

            // ИСПРАВЛЕНИЕ: Если танк слишком наклонён (> 45°) - НЕ применяем climb assist
            // Это предотвращает взбирание по стенам
            if (up.y < 0.7) { // cos(45°) ≈ 0.707
                climbForce = 0;
                isClimbingObstacle = false;
            }

            // Применяем основную силу подъёма к центру танка
            // МУЛЬТИПЛЕЕР: Пропускаем climb assist (это управление движением)
            if (!this.isMultiplayerMode && climbForce > 0 && body && isFinite(climbForce)) {
                const climbForceVec = this._tmpVector6;
                climbForceVec.set(0, climbForce, 0);
                try {
                    body.applyForce(climbForceVec, pos);
                } catch (e) { /* ignore */ }
            }

            // --- 3. MOVEMENT (Forward/Backward acceleration) ---
            // =========================================================================
            // CLIENT-SIDE PREDICTION: Локальная физика работает ВСЕГДА
            // Танк должен ощущаться ОДИНАКОВО в одиночном и мультиплеерном режимах.
            // Клиент применяет физику локально для мгновенного отклика.
            // Сервер валидирует и корректирует позицию при необходимости.
            // =========================================================================
            const applyLocalMovementForces = true; // Always apply local physics

            // Проверяем топливо - если пусто, танк не едет
            if (this.isFuelEmpty) {
                this.smoothThrottle = 0;
                this.smoothSteer = 0;
            } else {
                // Потребляем топливо при движении
                const isMovingNow = Math.abs(this.throttleTarget) > 0.1 || Math.abs(this.steerTarget) > 0.1;
                if (isMovingNow) {
                    const deltaTime = 1 / 60; // Приблизительно 60 FPS
                    this.currentFuel -= this.fuelConsumptionRate * deltaTime;
                    if (this.currentFuel <= 0) {
                        this.currentFuel = 0;
                        this.isFuelEmpty = true;
                        if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                            tankLogger.debug("[TANK] Out of fuel!");
                        }
                    }
                }
            }

            // Плавная интерполяция throttle (увеличена плавность)
            this.smoothThrottle += (this.throttleTarget - this.smoothThrottle) * 0.12;
            this.smoothSteer += (this.steerTarget - this.smoothSteer) * 0.18;

            // Вычисляем целевую скорость вперед
            // Используем кэшированное значение fwdSpeed для оптимизации
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const speedDiff = targetSpeed - fwdSpeed;

            // Применяем силу для достижения целевой скорости (УЛУЧШЕНО для пересечённой местности)
            if (Math.abs(this.smoothThrottle) > 0.05) {
                let movementDirection = forward.clone();

                // Если танк на вертикальной стене - проецируем движение на плоскость стены
                if (this._isOnVerticalWall && this._wallNormal) {
                    // Проекция: projected = v - (v · n) * n
                    const dot = Vector3.Dot(movementDirection, this._wallNormal);
                    const projectedDir = movementDirection.subtract(
                        this._wallNormal.scale(dot)
                    );

                    // Проверяем длину проекции
                    const projectedLength = projectedDir.length();
                    if (projectedLength > 0.01) {
                        projectedDir.normalize();

                        // Проверяем, не пытается ли танк двигаться вверх
                        const verticalComponent = Vector3.Dot(projectedDir, Vector3.Up());
                        if (verticalComponent > 0.05) {
                            // Блокируем движение вверх - оставляем только горизонтальную компоненту
                            const horizontalDir = new Vector3(projectedDir.x, 0, projectedDir.z);
                            const horizontalLength = horizontalDir.length();
                            if (horizontalLength > 0.1) {
                                horizontalDir.normalize();
                                movementDirection = horizontalDir;
                            } else {
                                // Если нет горизонтальной компоненты - используем направление вдоль стены
                                const wallRight = Vector3.Cross(this._wallNormal, Vector3.Up());
                                const wallRightLength = wallRight.length();
                                if (wallRightLength > 0.1) {
                                    wallRight.normalize();
                                    movementDirection = wallRight.scale(Math.sign(this.smoothThrottle));
                                }
                            }
                        } else {
                            // Разрешаем движение вдоль стены (включая небольшое движение вниз)
                            movementDirection = projectedDir;
                        }
                    } else {
                        // Если проекция слишком мала - используем направление вдоль стены
                        const wallRight = Vector3.Cross(this._wallNormal, Vector3.Up());
                        const wallRightLength = wallRight.length();
                        if (wallRightLength > 0.1) {
                            wallRight.normalize();
                            movementDirection = wallRight.scale(Math.sign(this.smoothThrottle));
                        }
                    }
                }

                // ТАНКОВАЯ МОЩЬ: Применяем slopeMultiplier для усиления тяги на склонах
                const accelForce = speedDiff * this.acceleration * slopeMultiplier;
                // ТАНКОВАЯ МОЩЬ: Увеличена максимальная сила для преодоления препятствий
                const maxAccelForce = this.moveSpeed * this.mass * 4.0; // УВЕЛИЧЕНО с 2.5 до 4.0
                const clampedAccelForce = Math.max(-maxAccelForce, Math.min(maxAccelForce, accelForce));
                // Use scaleToRef to avoid corrupting forward vector
                // МУЛЬТИПЛЕЕР: Пропускаем силу движения
                if (applyLocalMovementForces && body && isFinite(clampedAccelForce)) {
                    movementDirection.scaleToRef(clampedAccelForce, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        logger.warn("[TANK] Error applying movement force:", e);
                    }
                }

                if (shouldLog) {
                    physicsLogger.verbose(`  [MOVEMENT] TargetSpeed: ${targetSpeed.toFixed(2)} | Current: ${fwdSpeed.toFixed(2)} | Diff: ${speedDiff.toFixed(2)} | Force: ${clampedAccelForce.toFixed(0)} | SlopeMult: ${slopeMultiplier.toFixed(2)}`);
                }
            }

            // --- 3.5. PITCH EFFECT: Наклон танка при движении ---
            // При движении вперёд - поднимается перед (pitch назад)
            // При движении назад - поднимается зад (pitch вперёд)
            // МУЛЬТИПЛЕЕР: Пропускаем pitch effect
            if (applyLocalMovementForces) {
                const pitchTorque = PHYSICS_CONFIG.tank.movement.pitchTorque;
                if (Math.abs(this.smoothThrottle) > 0.1 && pitchTorque > 0 && body) {
                    // Направление torque: отрицательный X = перед вверх, положительный X = зад вверх
                    const pitchDirection = -this.smoothThrottle; // Инвертируем для правильного эффекта
                    const speedFactor = Math.min(1.0, absFwdSpeed / this.moveSpeed); // Пропорционально скорости
                    const effectivePitchTorque = pitchDirection * pitchTorque * speedFactor;

                    // Применяем torque в локальных координатах танка (вокруг оси Right)
                    const right = this.chassis.getDirection(Vector3.Right());
                    const torqueVec = right.scale(effectivePitchTorque);
                    try {
                        const physicsBody = body as any;
                        if (physicsBody.applyTorque) {
                            physicsBody.applyTorque(torqueVec);
                        } else if (physicsBody.applyAngularImpulse) {
                            physicsBody.applyAngularImpulse(torqueVec.scale(0.016));
                        }
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                }
            }

            // --- 4. ENHANCED TURN (Speed-dependent turning) ---
            // Поворот зависит от скорости: на месте поворачивается быстрее
            // НА СТЕНЕ: значительно уменьшаем поворот для предотвращения вращения
            const speedRatio = absFwdSpeed / this.moveSpeed;
            let turnSpeedMultiplier = 1.0 + (1.0 - speedRatio) * 0.5; // +50% скорости поворота на месте

            // КРИТИЧНО: На стене уменьшаем поворот в 3 раза для предотвращения вращения
            if (this._isOnVerticalWall) {
                turnSpeedMultiplier *= 0.3; // Уменьшаем поворот на 70%
            }

            const effectiveTurnSpeed = this.turnSpeed * turnSpeedMultiplier;

            const targetTurnRate = this.smoothSteer * effectiveTurnSpeed;
            const currentTurnRate = angVel.y;

            // Адаптивное угловое ускорение
            const isTurning = Math.abs(this.smoothSteer) > 0.1;
            let angularAccelMultiplier = isTurning ? 1.2 : 1.5; // Быстрее останавливаем поворот

            // На стене увеличиваем демпфирование поворота
            if (this._isOnVerticalWall) {
                angularAccelMultiplier *= 2.0; // Увеличиваем демпфирование в 2 раза
            }

            const turnAccelVal = (targetTurnRate - currentTurnRate) * this.turnAccel * angularAccelMultiplier;

            // Накопление всех угловых моментов для предотвращения конфликтов
            let totalAngularTorqueY = turnAccelVal;

            // Дополнительная стабилизация при повороте на скорости (объединена)
            if (Math.abs(speedRatio) > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                let stabilityMultiplier = speedRatio * 0.5; // Уменьшено
                // На стене увеличиваем стабилизацию
                if (this._isOnVerticalWall) {
                    stabilityMultiplier *= 2.0;
                }
                const stabilityTorqueVal = -angVel.y * this.stabilityTorque * stabilityMultiplier;
                totalAngularTorqueY += stabilityTorqueVal;
            }

            // Yaw damping when not turning (объединен)
            if (Math.abs(this.smoothSteer) < 0.05) {
                let yawDampingMultiplier = 0.7; // Уменьшено
                // На стене увеличиваем демпфирование
                if (this._isOnVerticalWall) {
                    yawDampingMultiplier *= 2.0;
                }
                totalAngularTorqueY += -angVel.y * this.yawDamping * yawDampingMultiplier;
            }

            // Применяем ВСЕ угловые моменты одной командой (предотвращает конфликты)
            // МУЛЬТИПЛЕЕР: Пропускаем поворот корпуса
            if (applyLocalMovementForces) {
                const totalAngularTorque = this._tmpVector7;
                totalAngularTorque.set(0, totalAngularTorqueY, 0);
                this.applyTorque(totalAngularTorque);
            }

            if (shouldLog) {
                physicsLogger.verbose(`  [TURN] Target: ${targetTurnRate.toFixed(2)} rad/s | Current: ${currentTurnRate.toFixed(2)} rad/s`);
                physicsLogger.verbose(`    Accel: ${turnAccelVal.toFixed(0)} | Mult: ${angularAccelMultiplier.toFixed(2)} | SpeedRatio: ${speedRatio.toFixed(2)}`);
            }

            // --- HEAVY & RESPONSIVE: ANTI-ROLL FACTOR ---
            // Перенос нагрузки с внешнего колеса на внутреннее в повороте
            // Удерживает танк параллельно земле, не давая крениться как обычному авто
            if (Math.abs(this.smoothSteer) > 0.1 && absFwdSpeed > 0.5) {
                const antiRollFactor = PHYSICS_CONFIG.tank.arcade.antiRollFactor;
                // Вычисляем крен (наклон в сторону поворота)
                const rollAngle = this.smoothSteer > 0 ? tiltZ : -tiltZ; // Крен в сторону поворота

                // Применяем корректирующий момент для противодействия крену
                // Чем больше крен и скорость поворота, тем сильнее корректирующий момент
                const rollCorrection = -rollAngle * antiRollFactor * absFwdSpeed * this.mass * 50;

                // МУЛЬТИПЛЕЕР: Пропускаем anti-roll
                if (applyLocalMovementForces && isFinite(rollCorrection) && Math.abs(rollCorrection) > 0.1) {
                    const rollTorque = this._tmpVector6;
                    rollTorque.set(rollCorrection, 0, 0); // Момент вокруг оси X (крен)
                    this.applyTorque(rollTorque);

                    if (shouldLog) {
                        physicsLogger.verbose(`  [ANTI-ROLL] RollAngle: ${(rollAngle * 180 / Math.PI).toFixed(1)}° | Correction: ${rollCorrection.toFixed(0)} | Factor: ${antiRollFactor}`);
                    }
                }
            }

            // --- ARCADE MODIFIERS: AIR CONTROL & ANGULAR DRAG ---
            // Определяем, находится ли танк в воздухе (выше целевой высоты + порог)
            const targetHeight = groundHeight + this.hoverHeight;
            const isInAir = pos.y > targetHeight + 0.3; // Порог 0.3 м для определения "в воздухе"

            if (isInAir) {
                const arcadeConfig = PHYSICS_CONFIG.tank.arcade;

                // ARCADE MODIFIERS: Air Control - позволяет доворачивать корпус в прыжке
                // МУЛЬТИПЛЕЕР: Пропускаем air control
                if (applyLocalMovementForces && Math.abs(this.smoothSteer) > 0.1 && arcadeConfig.airControl > 0) {
                    const airControlTorque = this.smoothSteer * this.turnAccel * arcadeConfig.airControl;
                    const airTorque = this._tmpVector7;
                    airTorque.set(0, airControlTorque, 0);
                    this.applyTorque(airTorque);

                    if (shouldLog) {
                        physicsLogger.verbose(`  [AIR CONTROL] Steer: ${this.smoothSteer.toFixed(2)} | Torque: ${airControlTorque.toFixed(0)} | Factor: ${arcadeConfig.airControl}`);
                    }
                }

                // ARCADE MODIFIERS: Angular Drag в воздухе - предотвращает бесконечное вращение
                // МУЛЬТИПЛЕЕР: Пропускаем air damping
                if (applyLocalMovementForces && arcadeConfig.angularDragAir > 0) {
                    const airAngularDamping = this._tmpVector6;
                    airAngularDamping.copyFrom(angVel);
                    airAngularDamping.scaleInPlace(-arcadeConfig.angularDragAir);
                    if (isFinite(airAngularDamping.x) && isFinite(airAngularDamping.y) && isFinite(airAngularDamping.z)) {
                        this.applyTorque(airAngularDamping);
                    }
                }
            }

            // --- WALL SLIDING (соскальзывание на вертикальной стене) ---
            // МУЛЬТИПЛЕЕР: Пропускаем wall sliding
            if (applyLocalMovementForces && this._isOnVerticalWall && this._wallNormal && body) {
                // КРИТИЧНО: Сильное демпфирование угловой скорости на стене для предотвращения вращения
                const wallAngularDamping = 0.85; // Сильное демпфирование (оставляем только 15% скорости)
                if (Math.abs(angVel.y) > 0.1) {
                    angVel.y *= wallAngularDamping;
                    try {
                        body.setAngularVelocity(angVel);
                    } catch (e) { /* ignore */ }
                }

                // Также демпфируем угловую скорость по X и Z осям (наклон)
                if (Math.abs(angVel.x) > 0.1 || Math.abs(angVel.z) > 0.1) {
                    angVel.x *= wallAngularDamping;
                    angVel.z *= wallAngularDamping;
                    try {
                        body.setAngularVelocity(angVel);
                    } catch (e) { /* ignore */ }
                }

                // Вычисляем горизонтальную скорость вдоль стены
                const wallRight = Vector3.Cross(this._wallNormal, Vector3.Up());
                if (wallRight.length() > 0.1) {
                    wallRight.normalize();
                    const wallForward = Vector3.Cross(wallRight, this._wallNormal);
                    if (wallForward.length() > 0.1) {
                        wallForward.normalize();

                        const horizontalVelX = Vector3.Dot(vel, wallRight);
                        const horizontalVelZ = Vector3.Dot(vel, wallForward);
                        const horizontalSpeed = Math.sqrt(horizontalVelX * horizontalVelX + horizontalVelZ * horizontalVelZ);

                        // Если горизонтальная скорость слишком мала И танк не движется - соскальзываем вниз
                        const isNotMoving = Math.abs(this.smoothThrottle) < 0.1;
                        if (horizontalSpeed < this.wallMinHorizontalSpeed && isNotMoving) {
                            // Применяем умеренную гравитацию для соскальзывания
                            const slideForce = this.mass * 19.6 * this.wallSlideGravityMultiplier * 0.5; // Уменьшено
                            if (isFinite(slideForce) && slideForce > 0) {
                                const slideDir = Vector3.Down().scale(slideForce);
                                try {
                                    body.applyForce(slideDir, pos);
                                } catch (e) { /* ignore */ }
                            }
                        }
                    }
                }

                // Мягко ограничиваем вертикальную скорость вверх (если танк пытается подняться)
                if (vel.y > 1.0) { // Увеличен порог с 0.5 до 1.0
                    const downwardForce = -vel.y * this.mass * 30; // Уменьшено с 50 до 30 для более плавного поведения
                    if (isFinite(downwardForce)) {
                        try {
                            body.applyForce(new Vector3(0, downwardForce, 0), pos);
                        } catch (e) { /* ignore */ }
                    }
                }
            }

            // --- 5. ENHANCED SIDE FRICTION (Improved lateral stability) ---
            // МУЛЬТИПЛЕЕР: Пропускаем боковое трение
            let sideSpeed: number | undefined;
            let sideFrictionForce: number | undefined;
            let sideFrictionMultiplier: number | undefined;

            if (applyLocalMovementForces) {
                sideSpeed = Vector3.Dot(vel, right);
                // Боковое сопротивление зависит от скорости движения
                // Используем кэшированное значение absFwdSpeed для оптимизации
                sideFrictionMultiplier = 1.0 + absFwdSpeed / this.moveSpeed * 0.5;
                sideFrictionForce = -sideSpeed * this.sideFriction * sideFrictionMultiplier;
                // Use scaleToRef to avoid mutating right vector
                if (body && isFinite(sideFrictionForce)) {
                    right.scaleToRef(sideFrictionForce, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        logger.warn("[TANK] Error applying side friction:", e);
                    }
                }
            }

            if (shouldLog && sideSpeed !== undefined && sideFrictionForce !== undefined && sideFrictionMultiplier !== undefined) {
                physicsLogger.verbose(`  [SIDE FRICTION] SideSpeed: ${sideSpeed.toFixed(2)} | Force: ${sideFrictionForce.toFixed(0)} | Mult: ${sideFrictionMultiplier.toFixed(2)}`);
            }

            // --- 6. ENHANCED DRAG (Improved stopping) ---
            // МУЛЬТИПЛЕЕР: Пропускаем все drag силы
            if (applyLocalMovementForces && Math.abs(this.smoothThrottle) < 0.05) {
                // Боковое сопротивление для предотвращения скольжения
                const sideVel = Vector3.Dot(vel, right);
                const sideDragVal = -sideVel * this.sideDrag;
                // Use scaleToRef to avoid mutating right vector
                if (body && isFinite(sideDragVal)) {
                    right.scaleToRef(sideDragVal, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        logger.warn("[TANK] Error applying side drag:", e);
                    }
                }

                // Продольное сопротивление
                const fwdVel = Vector3.Dot(vel, forward);
                const fwdDragVal = -fwdVel * this.fwdDrag;
                // Use scaleToRef to avoid mutating forward vector
                if (body && isFinite(fwdDragVal)) {
                    forward.scaleToRef(fwdDragVal, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        logger.warn("[TANK] Error applying forward drag:", e);
                    }
                }

                // Угловое сопротивление
                const angularDragVal = -angVel.y * this.angularDrag;
                if (isFinite(angularDragVal)) {
                    this.applyTorque(new Vector3(0, angularDragVal, 0));
                }

                if (shouldLog) {
                    physicsLogger.verbose(`  [DRAG] Side: ${sideDragVal.toFixed(0)} | Fwd: ${fwdDragVal.toFixed(0)} | Angular: ${angularDragVal.toFixed(0)}`);
                }
            }

            // --- AUTO RESET DISABLED (защита от падений отключена) ---
            // Проверка автосброса при падении/переворачивании отключена по запросу пользователя
            // if (!this.isInvulnerable && this.isAlive) {
            //     const isFallen = pos.y < -10 || up.y < 0.3 || Math.abs(tiltX) > 1.0 || Math.abs(tiltZ) > 1.0;
            //     const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.5;
            //     
            //     if (isFallen || isStuck) {
            //         console.log(`[TANK] Auto-reset triggered! (fallen: ${isFallen}, stuck: ${isStuck})`);
            //         this.respawn();
            //     }
            // }

            // --- 7. MOVEMENT SOUNDS (Track sounds when moving) ---
            if (Math.abs(this.smoothThrottle) > 0.2) {
                const now = Date.now();
                if (!this._lastMovementSoundTime) this._lastMovementSoundTime = 0;
                if (now - this._lastMovementSoundTime > 300) {
                    if (this.soundManager) {
                        this.soundManager.playMovement();
                    }
                    // Movement dust removed - replaced with low health smoke effect
                    this._lastMovementSoundTime = now;
                }
            }

            // === ПЛАВНЫЙ РАЗГОН БАШНИ: от 1% до 100% за 1 СЕКУНДУ ===
            const now = performance.now();

            if (this.turretTurnTarget !== 0) {
                // Начало вращения - запоминаем время старта
                if (this.turretAccelStartTime === 0) {
                    this.turretAccelStartTime = now;
                }
                // Линейный разгон за 1 секунду (1000мс): от 0.01 до 1.0
                const elapsed = now - this.turretAccelStartTime;
                this.turretAcceleration = Math.min(1.0, 0.01 + (elapsed / 1000) * 0.99);
            } else {
                // Остановка - сбрасываем
                this.turretAccelStartTime = 0;
                this.turretAcceleration *= 0.8; // Плавное торможение
            }

            // Применяем скорость башни при клавиатурном управлении (Z/X) ИЛИ автоцентрировании (C)
            // Когда isKeyboardTurretControl = false И isAutoCentering = false, game.ts управляет башней через мышь/камеру
            // ИСПРАВЛЕНИЕ: Добавлена проверка isAutoCentering для работы центровки башни (C key)
            // КРИТИЧНО: Проверяем, что башня существует и не удалена, И что танк жив (не респавнится)
            if (this.isAlive && this.turret && !this.turret.isDisposed()) {
                if (this.isKeyboardTurretControl || this.isAutoCentering) {
                    // КРИТИЧНО: Проверяем и ограничиваем baseTurretSpeed перед использованием
                    let baseTurretSpeed = this.baseTurretSpeed;
                    if (!isFinite(baseTurretSpeed) || isNaN(baseTurretSpeed) || baseTurretSpeed === Infinity || baseTurretSpeed === -Infinity || baseTurretSpeed <= 0) {
                        baseTurretSpeed = 0.08;
                        this.baseTurretSpeed = 0.08;
                        logger.warn(`[TANK] baseTurretSpeed was invalid in updatePhysics, resetting to 0.08`);
                    }
                    const maxTurretSpeed = 0.15;
                    if (baseTurretSpeed > maxTurretSpeed) {
                        baseTurretSpeed = maxTurretSpeed;
                        this.baseTurretSpeed = maxTurretSpeed;
                        logger.warn(`[TANK] baseTurretSpeed exceeded max in updatePhysics, clamping to ${maxTurretSpeed}`);
                    }

                    // Плавная интерполяция цели вращения
                    this.turretTurnSmooth += (this.turretTurnTarget - this.turretTurnSmooth) * this.turretLerpSpeed;

                    // Применяем поворот с ускорением
                    let rotationDelta = this.turretTurnSmooth * baseTurretSpeed * this.turretAcceleration;

                    // КРИТИЧНО: Ограничиваем максимальную скорость поворота
                    // Защита от слишком быстрого поворота (например, если baseTurretSpeed стал слишком большим)
                    const maxRotationDelta = 0.15; // Максимальная скорость поворота за кадр
                    if (Math.abs(rotationDelta) > maxRotationDelta) {
                        rotationDelta = Math.sign(rotationDelta) * maxRotationDelta;
                        logger.warn(`[TANK] rotationDelta (${rotationDelta.toFixed(4)}) exceeded max (${maxRotationDelta}), clamping`);
                    }

                    // КРИТИЧНО: Проверяем на NaN и Infinity
                    if (!isFinite(rotationDelta) || isNaN(rotationDelta)) {
                        logger.error(`[TANK] rotationDelta is invalid (${rotationDelta}), skipping rotation`);
                        rotationDelta = 0;
                    }

                    // ЛОГИРОВАНИЕ: Состояние поворота башни (только если есть значительное вращение)
                    if (Math.abs(rotationDelta) > 0.0001 && Math.random() < 0.01) { // Логируем 1% кадров
                        console.log(`[TANK] [updatePhysics] Turret rotation:`, {
                            turretTurnTarget: this.turretTurnTarget.toFixed(4),
                            turretTurnSmooth: this.turretTurnSmooth.toFixed(4),
                            rotationDelta: rotationDelta.toFixed(4),
                            turretSpeed: this.turretSpeed,
                            baseTurretSpeed: this.baseTurretSpeed,
                            turretAcceleration: this.turretAcceleration.toFixed(4),
                            isKeyboardTurretControl: this.isKeyboardTurretControl,
                            isAutoCentering: this.isAutoCentering,
                            turretRotationY: this.turret.rotation.y.toFixed(4)
                        });
                    }

                    if (isFinite(rotationDelta) && !isNaN(rotationDelta) && Math.abs(rotationDelta) > 0.0001) {
                        const oldRot = this.turret.rotation.y;
                        this.turret.rotation.y += rotationDelta;

                        // КРИТИЧНО: Проверяем что поворот не сбросился и восстанавливаем если нужно
                        const newRot = this.turret.rotation.y;
                        const expectedRot = oldRot + rotationDelta;
                        if (Math.abs(newRot - expectedRot) > 0.0001) {
                            // Поворот был сброшен - восстанавливаем
                            this.turret.rotation.y = expectedRot;
                        }

                        // Синхронизируем rotationQuaternion если используется
                        if (this.turret.rotationQuaternion) {
                            this.turret.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                                this.turret.rotation.y,
                                this.turret.rotation.x,
                                this.turret.rotation.z
                            );
                        }
                    }
                }
            }

            // === ПЛАВНЫЙ НАКЛОН СТВОЛА КЛАВИАТУРОЙ (R/F) ===
            // Работает только вне режима прицеливания (в режиме прицеливания game.ts управляет aimPitch)
            if (!this.isAiming && this.barrel && !this.barrel.isDisposed() && this.barrel.parent === this.turret) {
                if (this.barrelPitchTarget !== 0) {
                    // Начало наклона - запоминаем время старта
                    if (this.barrelPitchAccelStartTime === 0) {
                        this.barrelPitchAccelStartTime = now;
                    }
                    // Линейный разгон за 0.2 секунды (200мс): от 0.3 до 1.0 для МГНОВЕННОЙ реакции
                    const elapsed = now - this.barrelPitchAccelStartTime;
                    this.barrelPitchAcceleration = Math.min(1.0, 0.3 + (elapsed / 200) * 0.7);
                } else {
                    // Остановка - сбрасываем
                    this.barrelPitchAccelStartTime = 0;
                    this.barrelPitchAcceleration *= 0.8; // Плавное торможение
                }

                // Применяем скорость наклона ствола (с проверкой валидности)
                this.barrelPitchSmooth += (this.barrelPitchTarget - this.barrelPitchSmooth) * this.barrelPitchLerpSpeed;
                const pitchDelta = this.barrelPitchSmooth * this.baseBarrelPitchSpeed * this.barrelPitchAcceleration;
                if (isFinite(pitchDelta) && isFinite(this.aimPitch)) {
                    // Обновляем aimPitch: F (barrelPitchTarget = -1, pitchDelta < 0) поднимает ствол (aimPitch увеличивается)
                    // R (barrelPitchTarget = +1, pitchDelta > 0) опускает ствол (aimPitch уменьшается)
                    this.aimPitch -= pitchDelta;
                    // Ограничиваем угол от -12.5° до +12.5° (симметричный диапазон)
                    const PITCH_LIMIT = Math.PI * 12.5 / 180; // ±12.5° в радианах (≈0.218)
                    this.aimPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.aimPitch));
                }
            } else {
                // В режиме прицеливания - сбрасываем ускорение и smooth значение
                this.barrelPitchAccelStartTime = 0;
                this.barrelPitchAcceleration = 0;
                this.barrelPitchSmooth = 0;
            }

            // === ОТКАТ ПУШКИ ПРИ ВЫСТРЕЛЕ ===
            // Плавно возвращаем пушку в исходное положение (горизонтальный откат)
            this.barrelRecoilOffset += (this.barrelRecoilTarget - this.barrelRecoilOffset) * this.barrelRecoilSpeed;

            // Вертикальный откат (подъем при выстреле, затем возврат в исходное положение)
            this._barrelRecoilY += (this._barrelRecoilYTarget - this._barrelRecoilY) * this.barrelRecoilSpeed;

            // Обновляем визуализацию траектории при прицеливании
            if (this.isAiming && this.showProjectileTrajectory) {
                this.updateAimTrajectory();
            }

            // ИСПРАВЛЕНИЕ: Применяем вертикальное движение ствола при прицеливании (aimPitch) с плавной интерполяцией
            // КРИТИЧНО: Восстанавливаем parent если он потерялся (например, после переодевания)
            if (this.barrel && !this.barrel.isDisposed() && this.turret && !this.turret.isDisposed()) {
                if (this.barrel.parent !== this.turret) {
                    logger.warn(`[TankController] Barrel parent lost, restoring to turret`);
                    this.barrel.parent = this.turret;
                }
            }
            // Применяем вертикальное движение ствола (aimPitch)
            if (this.barrel && !this.barrel.isDisposed() && this.barrel.parent === this.turret) {
                // Проверяем, что aimPitch валиден
                if (!isFinite(this.aimPitch)) {
                    this.aimPitch = 0; // Сбрасываем если невалиден
                }

                // Применяем aimPitch к rotation.x ствола (вертикальный поворот)
                // Ограничиваем угол от -12.5° до +12.5° (симметричный диапазон)
                const PITCH_LIMIT = Math.PI * 12.5 / 180; // ±12.5° в радианах (≈0.218)
                const clampedPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.aimPitch));
                if (isFinite(clampedPitch)) {
                    // ИСПРАВЛЕНИЕ: В Babylon.js rotation.x положительный = вниз, отрицательный = вверх
                    // Поэтому инвертируем знак, чтобы визуал ствола соответствовал направлению снаряда
                    this._barrelTargetRotationX = -clampedPitch;

                    // Плавная интерполяция rotation.x ствола для устранения дёрганий
                    const rotationDiff = this._barrelTargetRotationX - this._barrelCurrentRotationX;
                    // Используем адаптивное сглаживание: быстрее при больших изменениях, медленнее при малых
                    const rotationEasing = Math.min(1.0, Math.abs(rotationDiff) * 8);
                    const adaptiveSmoothing = this._barrelRotationXSmoothing * (0.5 + rotationEasing * 0.5);
                    this._barrelCurrentRotationX += rotationDiff * adaptiveSmoothing;

                    // КРИТИЧНО: Применяем сглаженное значение к стволу
                    // Для всех типов пушек
                    this.barrel.rotation.x = this._barrelCurrentRotationX;
                }
            }

            // Применяем откат к позиции пушки (относительно башни)
            if (this.barrel && !this.barrel.isDisposed() && this._baseBarrelZ > 0) {
                if (isFinite(this.barrelRecoilOffset) && isFinite(this._barrelRecoilY)) {
                    // Сначала применяем откат
                    const baseZ = this._baseBarrelZ + this.barrelRecoilOffset;
                    // Ствол всегда по центру башни по X
                    this.barrel.position = new Vector3(0, this._baseBarrelY + this._barrelRecoilY, baseZ);

                    // Затем проверяем и скрываем части ствола, которые пересекаются с башней или корпусом
                    // Это изменит позицию и масштаб для скрытия пересечений
                    this.visualsModule.updateBarrelVisibility(baseZ);
                }
            }

            // Обновляем гильзы
            this.projectilesModule.updateShellCasings();

            // Animate Cannon (for animated cannons)
            this.updateCannonAnimations();

            // Animate Chassis (for animated chassis)
            this.updateChassisAnimations();

            // Animate Wheels (оптимизировано с for циклом)
            // Используем кэшированное значение fwdSpeed для оптимизации
            if (isFinite(fwdSpeed)) {
                const wheelRotationDelta = fwdSpeed * 0.05;
                if (isFinite(wheelRotationDelta)) {
                    const wheelCount = this.visualWheels.length;
                    for (let i = 0; i < wheelCount; i++) {
                        const wheel = this.visualWheels[i];
                        if (wheel && !wheel.isDisposed()) {
                            wheel.rotation.x += wheelRotationDelta;
                        }
                    }
                }
            }

            // === UPDATE INVULNERABILITY (каждые 2 кадра для оптимизации) ===
            this._tick++;
            if (this._tick % 2 === 0) {
                this.updateInvulnerability();
            }

            // === UPDATE MODULES (каждые 2 кадра для оптимизации) ===
            if (this._tick % 2 === 0) {
                this.updateModules();
            }

            // Модуль 9: Обновление платформы КАЖДЫЙ КАДР для максимальной плавности
            this.updateModule9Platform();

            // FIX: УБРАНО принудительное обновление видимости дочерних мешей каждый кадр
            // Дочерние меши (turret, barrel) наследуют видимость от родителя (chassis)
            // Принудительная установка isVisible/setEnabled может вызывать проблемы с рендерингом
            // Вместо этого полагаемся на parent-child hierarchy в Babylon.js

            // === UPDATE HUD (every 6th frame for optimization) ===
            // ИСПРАВЛЕНО: updateReload() вызывается в updateHUD() с правильными параметрами
            // Не вызываем updateReload() здесь, чтобы не перезаписывать правильное состояние
            if (this._tick % 6 === 0 && this.hud && isFinite(fwdSpeed)) {
                this.hud.setSpeed(fwdSpeed);
                if (isFinite(pos.x) && isFinite(pos.z)) {
                    this.hud.setPosition(pos.x, pos.z, pos.y);
                }
                // ИСПРАВЛЕНО: updateReload() вызывается в updateHUD() (строка 4709)
                // Не вызываем здесь, чтобы не перезаписывать правильное состояние
            }

            // === UPDATE ENGINE SOUND (каждые 2 кадра для оптимизации) with 3D positioning ===
            // Обновляем звук мотора каждые 2 кадра для оптимизации
            if (this._tick % 2 === 0 && this.soundManager && isFinite(fwdSpeed)) {
                const speedRatio = Math.abs(fwdSpeed) / this.moveSpeed;
                if (isFinite(speedRatio) && isFinite(pos.x) && isFinite(pos.y) && isFinite(pos.z)) {
                    // Убеждаемся, что звук работает даже на холостом ходу (speedRatio = 0)
                    this.soundManager.updateEngine(speedRatio, Math.abs(this.smoothThrottle), pos);
                }
            }

            // КЭШИРОВАНИЕ ПОЗИЦИЙ ПЕРЕНЕСЕНО в updatePositionCache() 
            // который вызывается в onAfterPhysicsObservable
            // Это исправляет проблему "двойного танка" при движении
        } catch (e) {
            // Улучшенная обработка ошибок с детальной информацией (только с троттлингом)
            const now = performance.now();
            if (now - this.lastPhysicsErrorMs > 2000) {
                this.lastPhysicsErrorMs = now;
                logger.error("[PhysicsError] updatePhysics failed:", e);
                if (e instanceof Error) {
                    logger.error("[PhysicsError] Stack:", e.stack);
                }
                // Проверяем состояние объектов при ошибке
                logger.error("[PhysicsError] State check:", {
                    chassis: !!this.chassis,
                    chassisDisposed: this.chassis?.isDisposed(),
                    physicsBody: !!this.physicsBody,
                    isAlive: this.isAlive
                });
            }
        }
    }

    // Get current speed for external use
    getSpeed(): number {
        const vel = this.physicsBody.getLinearVelocity();
        if (!vel) return 0;
        const rotMatrix = this.chassis.getWorldMatrix();
        const forward = Vector3.TransformNormal(Vector3.Forward(), rotMatrix).normalize();
        return Vector3.Dot(vel, forward);
    }

    // === КЭШИРОВАННЫЕ ПОЗИЦИИ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ ===
    // Публичные методы для получения кэшированных позиций
    // Используйте эти методы вместо getAbsolutePosition() для лучшей производительности

    /**
     * Обновить кэш позиций ПОСЛЕ шага физики
     * Вызывается из onAfterPhysicsObservable для синхронизации с физикой
     * КРИТИЧНО: Принудительно обновляем WorldMatrix для получения актуальных absolutePosition
     */
    updatePositionCache(): void {
        if (!this.chassis || this.chassis.isDisposed()) return;

        // КРИТИЧНО: После шага физики Havok обновляет mesh.position напрямую,
        // но WorldMatrix НЕ обновляется автоматически.
        // Без computeWorldMatrix, absolutePosition будет устаревшей!
        // Это вызывает эффект "двойного танка" при движении.
        this.chassis.computeWorldMatrix(true);

        // Используем absolutePosition (мировые координаты) вместо position (локальные)
        // После computeWorldMatrix это гарантированно актуальные данные
        this._cachedChassisPosition.copyFrom(this.chassis.absolutePosition);

        if (this.turret && !this.turret.isDisposed()) {
            // computeWorldMatrix для дочерних элементов обновляет их абсолютные позиции
            this.turret.computeWorldMatrix(true);
            if (!this._cachedTurretPosition) {
                this._cachedTurretPosition = new Vector3();
            }
            this._cachedTurretPosition.copyFrom(this.turret.absolutePosition);
        }

        if (this.barrel && !this.barrel.isDisposed()) {
            this.barrel.computeWorldMatrix(true);
            if (!this._cachedBarrelPosition) {
                this._cachedBarrelPosition = new Vector3();
            }
            this._cachedBarrelPosition.copyFrom(this.barrel.absolutePosition);
        }

        this._positionCacheFrame = this._tick;

        // ДИАГНОСТИКА: Логируем обновление кэша раз в 60 кадров
        if (this._tick % 60 === 0) {
            logger.log(`[TankController] ✅ [updatePositionCache] Кэш обновлен: frame=${this._tick}, pos=(${this._cachedChassisPosition.x.toFixed(1)}, ${this._cachedChassisPosition.y.toFixed(1)}, ${this._cachedChassisPosition.z.toFixed(1)})`);
        }
    }

    /**
     * Получить кэшированную позицию корпуса
     * Возвращает absolutePosition (мировые координаты), синхронизированную с физикой
     * ПОСЛЕ шага физики
     */
    getCachedChassisPosition(): Vector3 {
        // ДИАГНОСТИКА: Проверяем что кэш актуален
        const cacheFrame = this._positionCacheFrame;
        const currentFrame = this._tick;
        if (cacheFrame !== undefined && cacheFrame < currentFrame - 1 && currentFrame % 60 === 0) {
            logger.warn(`[TankController] ⚠️ [getCachedChassisPosition] Кэш может быть устаревшим! cacheFrame=${cacheFrame}, currentFrame=${currentFrame}`);
        }
        return this._cachedChassisPosition;
    }

    /**
     * Получить кэшированную позицию башни
     * Возвращает position (локальная позиция относительно корпуса)
     */
    getCachedTurretPosition(): Vector3 | null {
        return this._cachedTurretPosition;
    }

    /**
     * Получить кэшированную позицию ствола
     * Возвращает position (локальная позиция относительно башни)
     */
    getCachedBarrelPosition(): Vector3 | null {
        return this._cachedBarrelPosition;
    }

    // === МОДУЛИ (кнопки 6-0) ===

    // Модуль 6: Временная защитная стенка цвета поверхности (10 секунд)
    private activateModule6(): void {
        const now = Date.now();
        // Проверка кулдауна
        if (now - this.module6LastUse < this.module6Cooldown) {
            const remaining = ((this.module6Cooldown - (now - this.module6LastUse)) / 1000).toFixed(1);
            if (this.chatSystem) {
                this.chatSystem.log(`Модуль 6 на кулдауне: ${remaining}с`);
            }
            return;
        }
        this.module6LastUse = now;

        // Если уже есть максимальное количество стенок, удаляем самую старую (первую)
        if (this.module6Walls.length >= this.MAX_WALLS) {
            const oldestWall = this.module6Walls.shift(); // Удаляем первую (самую старую)
            if (oldestWall) {
                if (oldestWall.timeout) {
                    clearTimeout(oldestWall.timeout);
                }
                // Удаляем без анимации, так как это принудительное удаление при достижении лимита
                if (oldestWall.physics) {
                    oldestWall.physics.dispose();
                }
                if (oldestWall.mesh && !oldestWall.mesh.isDisposed()) {
                    oldestWall.mesh.dispose();
                }
            }
        }

        if (!this.chassis || !this.barrel) return;

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

        // Создаём стенку
        const newWall = MeshBuilder.CreateBox(`protectiveWall_${Date.now()}`, {
            width: 6,
            height: 4,
            depth: 0.5
        }, this.scene);

        // Начинаем с позиции под полом
        newWall.position.copyFrom(startWallPos);
        // Поворачиваем стенку в направлении пушки (горизонтальное направление)
        newWall.rotation.y = Math.atan2(barrelForward.x, barrelForward.z);

        // Материал стенки с цветом поверхности
        const wallMat = new StandardMaterial(`wallMat_${Date.now()}`, this.scene);
        wallMat.diffuseColor = surfaceColor;
        wallMat.emissiveColor = surfaceColor.scale(0.3);
        wallMat.specularColor = Color3.Black();
        newWall.material = wallMat;

        // Создаём объект для хранения данных стенки (объявляем ДО использования в metadata)
        const wallData: { mesh: Mesh; physics: PhysicsBody | null; timeout: number; health: number; maxHealth: number } = {
            mesh: newWall,
            physics: null,
            timeout: 0,
            health: this.WALL_MAX_HEALTH,
            maxHealth: this.WALL_MAX_HEALTH
        };

        // Метаданные для распознавания стенки и хранения HP
        newWall.metadata = {
            type: "protectiveWall",
            wallData: wallData, // Ссылка на данные стенки для доступа из других классов
            tankController: this // Ссылка на TankController для вызова damageWall
        };

        // Анимация появления из пола (1 секунда)
        const animationDuration = 1000; // 1 секунда
        const startTime = Date.now();
        const startPos = startWallPos.clone();
        const endPos = finalWallPos.clone();

        const animateWall = () => {
            if (!newWall || newWall.isDisposed()) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            // Используем easing функцию для плавности (ease-out)
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Интерполируем позицию
            newWall.position.y = startPos.y + (endPos.y - startPos.y) * easeProgress;

            if (progress < 1) {
                // Продолжаем анимацию
                requestAnimationFrame(animateWall);
            } else {
                // Анимация завершена, создаём физику
                newWall.position.y = endPos.y;

                // Физика стенки (статическая, непроходимая и непростреливаемая - блокирует всё)
                const shape = new PhysicsShape({
                    type: PhysicsShapeType.BOX,
                    parameters: { extents: new Vector3(6, 4, 0.5) }
                }, this.scene);
                shape.filterMembershipMask = 32; // Группа стенки (32, чтобы не конфликтовать с пулями врагов 16)
                shape.filterCollideMask = 1 | 2 | 4 | 8 | 16; // Столкновение со всем: игрок (1), окружение (2), пули игрока (4), враги (8), пули врагов (16)

                wallData.physics = new PhysicsBody(newWall, PhysicsMotionType.STATIC, false, this.scene);
                wallData.physics.shape = shape;
            }
        };

        // Запускаем анимацию
        animateWall();

        // Добавляем стенку в массив
        this.module6Walls.push(wallData);

        // Добавляем эффект в HUD только если это первая стенка
        if (this.hud && this.module6Walls.length === 1) {
            this.hud.addActiveEffect("Защитная стенка", "🛡️", "#0ff", 10000);
        }
        if (this.hud) {
            this.hud.setModuleCooldown(6, this.module6Cooldown);
        }
        if (this.chatSystem) {
            this.chatSystem.success(`🛡️ Защитная стенка создана! (${this.module6Walls.length}/${this.MAX_WALLS})`);
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }

        // Send to server
        const game = (window as any).game;
        const multiplayerManager = game?.multiplayerManager;
        if (multiplayerManager && multiplayerManager.isConnected()) {
            const playerId = multiplayerManager.getPlayerId();
            if (playerId) {
                multiplayerManager.send(createClientMessage(ClientMessageType.WALL_SPAWN, {
                    position: finalWallPos,
                    rotation: newWall.rotation.y,
                    duration: 10000,
                    ownerId: playerId
                }));
            }
        }

        // Удаляем через 10 секунд с анимацией разрушения
        wallData.timeout = window.setTimeout(() => {
            // Удаляем стенку из массива
            const index = this.module6Walls.indexOf(wallData);
            if (index !== -1) {
                this.module6Walls.splice(index, 1);
            }
            this.destroyWall(wallData);
        }, 10000);
    }

    // Публичный метод для нанесения урона стенке (вызывается из других классов)
    // Вспомогательная функция для проверки, находится ли точка внутри стены
    private checkPointInWall(pos: Vector3, wallMesh: Mesh, wallType: "protectiveWall" | "enemyWall"): boolean {
        if (!wallMesh || wallMesh.isDisposed()) return false;

        const wallPos = wallMesh.absolutePosition;
        const wallRotation = wallMesh.rotation.y;

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

    // Проверка столкновения со стеной с помощью рейкаста
    private checkWallCollisionRaycast(startPos: Vector3, direction: Vector3, maxDistance: number = 0.5): { hit: boolean; wallMesh: Mesh | null; hitPoint: Vector3 | null; wallType: "protectiveWall" | "enemyWall" | null } {
        const ray = new Ray(startPos, direction, maxDistance);

        // Проверяем защитные стены игрока
        for (const wallData of this.module6Walls) {
            if (!wallData.mesh || wallData.mesh.isDisposed()) continue;

            // Используем рейкаст для проверки столкновения
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                return mesh === wallData.mesh;
            });

            if (pick && pick.hit && pick.pickedPoint) {
                // Дополнительная проверка: точка попадания должна быть внутри стены
                if (this.checkPointInWall(pick.pickedPoint, wallData.mesh, "protectiveWall")) {
                    return { hit: true, wallMesh: wallData.mesh, hitPoint: pick.pickedPoint, wallType: "protectiveWall" };
                }
            }

            // Также проверяем, находится ли стартовая позиция внутри стены
            if (this.checkPointInWall(startPos, wallData.mesh, "protectiveWall")) {
                return { hit: true, wallMesh: wallData.mesh, hitPoint: startPos.clone(), wallType: "protectiveWall" };
            }
        }

        // Проверяем стены врагов
        // ОПТИМИЗАЦИЯ: Кэшируем результат filter для enemyWalls
        if (!this._cachedEnemyWalls || this._enemyWallsCacheFrame !== this._logFrameCounter) {
            this._cachedEnemyWalls = this.scene.meshes.filter(mesh =>
                mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
            );
            this._enemyWallsCacheFrame = this._logFrameCounter;
        }
        const enemyWalls = this._cachedEnemyWalls;

        for (const wall of enemyWalls) {
            const wallMesh = wall as Mesh;
            const pick = this.scene.pickWithRay(ray, (mesh) => {
                return mesh === wallMesh;
            });

            if (pick && pick.hit && pick.pickedPoint) {
                if (this.checkPointInWall(pick.pickedPoint, wallMesh, "enemyWall")) {
                    return { hit: true, wallMesh, hitPoint: pick.pickedPoint, wallType: "enemyWall" };
                }
            }

            // Также проверяем, находится ли стартовая позиция внутри стены
            if (this.checkPointInWall(startPos, wallMesh, "enemyWall")) {
                return { hit: true, wallMesh, hitPoint: startPos.clone(), wallType: "enemyWall" };
            }
        }

        return { hit: false, wallMesh: null, hitPoint: null, wallType: null };
    }

    /**
     * Проверяет, блокирует ли защитная стенка взрывную волну между двумя точками
     * Используется для защиты от AOE урона взрывов
     */
    private isExplosionBlockedByWall(explosionCenter: Vector3, targetPos: Vector3): boolean {
        // Направление от взрыва к цели
        const direction = targetPos.subtract(explosionCenter).normalize();
        const distance = Vector3.Distance(explosionCenter, targetPos);

        // Проверяем защитные стены игрока
        for (const wallData of this.module6Walls) {
            if (!wallData.mesh || wallData.mesh.isDisposed()) continue;

            const wallMesh = wallData.mesh;
            const wallPos = wallMesh.absolutePosition;
            const wallRotation = wallMesh.rotation.y;

            // Размеры защитной стенки: width=6, height=4, depth=0.5
            const wallHalfWidth = 3;
            const wallHalfHeight = 2;

            // Проверяем пересечение луча со стенкой
            // Упрощённая проверка: стенка как плоскость
            const toWall = wallPos.subtract(explosionCenter);
            const wallNormal = new Vector3(
                Math.sin(wallRotation),
                0,
                Math.cos(wallRotation)
            );

            // Проверяем, пересекает ли луч плоскость стенки
            const denom = Vector3.Dot(direction, wallNormal);
            if (Math.abs(denom) < 0.0001) continue; // Луч параллелен стенке

            const t = Vector3.Dot(toWall, wallNormal) / denom;
            if (t < 0 || t > distance) continue; // Пересечение за пределами отрезка

            // Точка пересечения
            const hitPoint = explosionCenter.add(direction.scale(t));

            // Проверяем, находится ли точка пересечения в пределах стенки
            const localHit = hitPoint.subtract(wallPos);
            const cosY = Math.cos(-wallRotation);
            const sinY = Math.sin(-wallRotation);
            const localX = localHit.x * cosY - localHit.z * sinY;
            const localY = localHit.y;

            if (Math.abs(localX) < wallHalfWidth && Math.abs(localY) < wallHalfHeight) {
                return true; // Стенка блокирует взрывную волну
            }
        }

        // Проверяем стены врагов
        const enemyWalls = this.scene.meshes.filter(mesh =>
            mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
        );

        for (const wall of enemyWalls) {
            const wallMesh = wall as Mesh;
            const wallPos = wallMesh.absolutePosition;
            const wallRotation = wallMesh.rotation.y;

            // Размеры стенки врага: width=6, height=4, depth=0.5 (те же, что и у игрока!)
            const wallHalfWidth = 3;
            const wallHalfHeight = 2;

            const toWall = wallPos.subtract(explosionCenter);
            const wallNormal = new Vector3(
                Math.sin(wallRotation),
                0,
                Math.cos(wallRotation)
            );

            const denom = Vector3.Dot(direction, wallNormal);
            if (Math.abs(denom) < 0.0001) continue;

            const t = Vector3.Dot(toWall, wallNormal) / denom;
            if (t < 0 || t > distance) continue;

            const hitPoint = explosionCenter.add(direction.scale(t));
            const localHit = hitPoint.subtract(wallPos);
            const cosY = Math.cos(-wallRotation);
            const sinY = Math.sin(-wallRotation);
            const localX = localHit.x * cosY - localHit.z * sinY;
            const localY = localHit.y;

            if (Math.abs(localX) < wallHalfWidth && Math.abs(localY) < wallHalfHeight) {
                return true;
            }
        }

        return false; // Ничего не блокирует взрывную волну
    }

    // Вспомогательная функция для рекурсивной проверки принадлежности части танку
    private isPartOf(mesh: any, parent: any): boolean {
        if (!mesh || !parent) return false;
        if (mesh === parent) return true;

        let p = mesh.parent;
        while (p) {
            if (p === parent) return true;
            p = p.parent;
        }
        return false;
    }

    // Проверка препятствий перед стволом перед выстрелом
    private checkBarrelObstacle(muzzlePos: Vector3, direction: Vector3, maxDistance: number = 1.5): boolean {
        const ray = new Ray(muzzlePos, direction, maxDistance);

        const pick = this.scene.pickWithRay(ray, (mesh: any) => {
            // Ранний выход: проверки в порядке частоты
            if (!mesh || !mesh.isEnabled()) return false;
            if (mesh.visibility <= 0.5) return false; // Прозрачные/невидимые объекты
            if (!mesh.isPickable) return false; // Объекты без коллизий

            // Игнорируем части самого танка (рекурсивно)
            if (this.isPartOf(mesh, this.chassis) || this.isPartOf(mesh, this.turret) || this.isPartOf(mesh, this.barrel)) return false;

            // Проверка через isPartOf если метод доступен (для вражеских танков)
            // Для игрока проверяем напрямую через parent

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

    public damageWall(wallMesh: Mesh, damage: number): boolean {
        // Находим стенку в массиве
        for (const wallData of this.module6Walls) {
            if (wallData.mesh === wallMesh && !wallData.mesh.isDisposed()) {
                wallData.health = Math.max(0, wallData.health - damage);

                if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                    combatLogger.debug(`[WALL] Damage taken: ${damage}, HP: ${wallData.health}/${wallData.maxHealth}`);
                }

                // Обновляем визуальный вид
                this.updateWallVisuals(wallData);

                // Если HP <= 0, разрушаем стенку
                if (wallData.health <= 0) {
                    // Удаляем стенку из массива
                    const index = this.module6Walls.indexOf(wallData);
                    if (index !== -1) {
                        this.module6Walls.splice(index, 1);
                    }
                    if (wallData.timeout) {
                        clearTimeout(wallData.timeout);
                    }
                    this.destroyWall(wallData);
                    return true; // Стенка разрушена
                }
                return false; // Стенка повреждена, но не разрушена
            }
        }
        return false; // Стенка не найдена
    }

    // Обновление визуального вида стенки в зависимости от HP
    private updateWallVisuals(wallData: { mesh: Mesh; physics: PhysicsBody | null; timeout: number; health: number; maxHealth: number }): void {
        if (!wallData.mesh || wallData.mesh.isDisposed() || !wallData.mesh.material) return;

        const material = wallData.mesh.material as StandardMaterial;
        const healthPercent = wallData.health / wallData.maxHealth;

        // Получаем исходный цвет (из diffuseColor)
        const baseColor = material.diffuseColor.clone();

        // Изменяем цвет в зависимости от HP:
        // 100% - исходный цвет
        // 50% - желтоватый
        // 25% - оранжевый
        // 0% - красный
        if (healthPercent > 0.5) {
            // Здоровье > 50% - исходный цвет
            material.diffuseColor = baseColor;
            material.emissiveColor = baseColor.scale(0.3);
        } else if (healthPercent > 0.25) {
            // Здоровье 25-50% - желтоватый
            const yellow = new Color3(1, 0.8, 0.3);
            material.diffuseColor = Color3.Lerp(baseColor, yellow, 0.5);
            material.emissiveColor = material.diffuseColor.scale(0.4);
        } else if (healthPercent > 0) {
            // Здоровье 0-25% - оранжево-красный
            const orange = new Color3(1, 0.4, 0.1);
            material.diffuseColor = Color3.Lerp(baseColor, orange, 0.7);
            material.emissiveColor = material.diffuseColor.scale(0.5);
        } else {
            // 0 HP - красный
            material.diffuseColor = new Color3(1, 0.2, 0.2);
            material.emissiveColor = material.diffuseColor.scale(0.6);
        }
    }

    // Разрушение стенки на кусочки
    private destroyWall(wallData: { mesh: Mesh; physics: PhysicsBody | null; timeout: number; health: number; maxHealth: number }): void {
        if (!wallData || !wallData.mesh || wallData.mesh.isDisposed()) {
            return;
        }

        const wallPos = wallData.mesh.absolutePosition.clone();
        const wallMat = wallData.mesh.material as StandardMaterial;
        const wallColor = wallMat ? wallMat.diffuseColor.clone() : new Color3(0.5, 0.5, 0.5);

        // ОПТИМИЗАЦИЯ: Создаём ОДИН материал для всех кусочков debris
        // Используем кэшированный материал или создаём новый если нужен конкретный цвет
        let debrisMat = this.scene.getMaterialByName("wallDebrisMat") as StandardMaterial | null;
        if (!debrisMat) {
            debrisMat = new StandardMaterial("wallDebrisMat", this.scene);
            debrisMat.specularColor = Color3.Black();
        }
        // Обновляем цвет для текущей стенки (материал общий, но цвет может меняться)
        debrisMat.diffuseColor = wallColor;
        debrisMat.emissiveColor = wallColor.scale(0.2);

        // Создаём кусочки (8-12 кусочков)
        const debrisCount = 8 + Math.floor(Math.random() * 5);
        const debrisPieces: Mesh[] = [];

        for (let i = 0; i < debrisCount; i++) {
            const size = 0.3 + Math.random() * 0.4;
            const debris = MeshBuilder.CreateBox(`wallDebris_${Date.now()}_${i}`, {
                width: size,
                height: size,
                depth: size
            }, this.scene);

            // Позиция кусочка (случайная точка внутри стенки)
            const offsetX = (Math.random() - 0.5) * 6;
            const offsetY = (Math.random() - 0.5) * 4;
            const offsetZ = (Math.random() - 0.5) * 0.5;
            debris.position = wallPos.add(new Vector3(offsetX, offsetY, offsetZ));

            // Используем общий материал
            debris.material = debrisMat;

            debrisPieces.push(debris);
        }

        // Удаляем физику и основную стенку
        if (wallData.physics) {
            wallData.physics.dispose();
        }
        wallData.mesh.dispose();

        // Анимация разлёта кусочков
        const animationDuration = 1500; // 1.5 секунды
        const startTime = Date.now();

        // Случайные скорости для каждого кусочка
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо map
        const velocities: Array<{ vx: number, vy: number, vz: number, rotX: number, rotY: number, rotZ: number }> = [];
        const startPositions: Vector3[] = [];
        const startRotations: Array<{ x: number, y: number, z: number }> = [];
        const debrisPiecesCount = debrisPieces.length;
        for (let i = 0; i < debrisPiecesCount; i++) {
            velocities.push({
                vx: (Math.random() - 0.5) * 8,
                vy: Math.random() * 6 + 2,
                vz: (Math.random() - 0.5) * 8,
                rotX: (Math.random() - 0.5) * 10,
                rotY: (Math.random() - 0.5) * 10,
                rotZ: (Math.random() - 0.5) * 10
            });
            // ОПТИМИЗАЦИЯ: Переиспользуем Vector3 вместо clone()
            const debris = debrisPieces[i];
            if (debris) {
                const pos = debris.position;
                startPositions.push(new Vector3(pos.x, pos.y, pos.z));
            }
            startRotations.push({
                x: Math.random() * Math.PI * 2,
                y: Math.random() * Math.PI * 2,
                z: Math.random() * Math.PI * 2
            });
        }

        const animateDebris = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            for (let i = 0; i < debrisPiecesCount; i++) {
                const debris = debrisPieces[i];
                if (!debris || debris.isDisposed()) continue;

                const vel = velocities[i];
                const startPos = startPositions[i];
                const startRot = startRotations[i];
                if (!vel || !startPos || !startRot) continue;

                // Физика падения (гравитация)
                const gravity = -15; // Ускорение свободного падения
                const t = progress;

                // Позиция с учётом гравитации
                debris.position.x = startPos.x + vel.vx * t;
                debris.position.y = startPos.y + vel.vy * t + 0.5 * gravity * t * t;
                debris.position.z = startPos.z + vel.vz * t;

                // Вращение
                debris.rotation.x = startRot.x + vel.rotX * t;
                debris.rotation.y = startRot.y + vel.rotY * t;
                debris.rotation.z = startRot.z + vel.rotZ * t;

                // Прозрачность (исчезает к концу)
                if (debris.material instanceof StandardMaterial) {
                    debris.material.alpha = 1 - progress;
                }
            }

            if (progress < 1) {
                requestAnimationFrame(animateDebris);
            } else {
                // Удаляем все кусочки
                // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
                const debrisCount4 = debrisPieces.length;
                for (let j = 0; j < debrisCount4; j++) {
                    const debris = debrisPieces[j];
                    if (debris && !debris.isDisposed()) {
                        debris.dispose();
                    }
                }
            }
        };

        animateDebris();

        // Обновляем HUD только если это была последняя стенка
        if (this.module6Walls.length === 0) {
            if (this.hud) {
                this.hud.removeActiveEffect("Защитная стенка");
            }
        }
        if (this.chatSystem) {
            this.chatSystem.log(`Защитная стенка исчезла (осталось: ${this.module6Walls.length}/${this.MAX_WALLS})`);
        }
    }

    // Модуль 7: Ускоренная стрельба в 2 раза (10 секунд)
    private activateModule7(): void {
        const now = Date.now();
        // Проверка кулдауна
        if (now - this.module7LastUse < this.module7Cooldown) {
            const remaining = ((this.module7Cooldown - (now - this.module7LastUse)) / 1000).toFixed(1);
            if (this.chatSystem) {
                this.chatSystem.log(`Модуль 7 на кулдауне: ${remaining}с`);
            }
            return;
        }
        this.module7LastUse = now;

        if (this.module7Active) return; // Уже активен

        // Очищаем предыдущий timeout если есть
        if (this.module7Timeout !== null) {
            clearTimeout(this.module7Timeout);
            this.module7Timeout = null;
        }

        this.module7Active = true;
        this.cooldown = Math.floor(this.baseCooldown / 2); // Ускоряем в 2 раза

        if (this.hud) {
            this.hud.addActiveEffect("Ускоренная стрельба", "⚡", "#ff0", 10000);
            this.hud.setModuleCooldown(7, this.module7Cooldown);
        }
        if (this.chatSystem) {
            this.chatSystem.success("⚡ Ускоренная стрельба активирована!");
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }

        // Визуальный эффект
        if (this.effectsManager && this.chassis) {
            const color = Color3.FromHexString("#ffff00");
            this.effectsManager.createConsumableEffect(this.chassis.absolutePosition, color, "speed");
        }

        // Отключаем через 10 секунд
        this.module7Timeout = window.setTimeout(() => {
            this.cooldown = this.baseCooldown;
            this.module7Active = false;
            this.module7Timeout = null;
            if (this.hud) {
                this.hud.removeActiveEffect("Ускоренная стрельба");
            }
            if (this.chatSystem) {
                this.chatSystem.log("Ускоренная стрельба закончилась");
            }
        }, 10000);
    }

    // Модуль 8: Автоматическая наводка и стрельба на ближайшего врага (10 секунд)
    private activateModule8(): void {
        const now = Date.now();
        // Проверка кулдауна
        if (now - this.module8LastUse < this.module8Cooldown) {
            const remaining = ((this.module8Cooldown - (now - this.module8LastUse)) / 1000).toFixed(1);
            if (this.chatSystem) {
                this.chatSystem.log(`Модуль 8 на кулдауне: ${remaining}с`);
            }
            return;
        }
        this.module8LastUse = now;

        if (this.module8Active) return;

        // Очищаем предыдущий timeout если есть
        if (this.module8Timeout !== null) {
            clearTimeout(this.module8Timeout);
            this.module8Timeout = null;
        }

        this.module8Active = true;
        this.module8LastAutoFire = 0;

        if (this.hud) {
            this.hud.addActiveEffect("Автонаводка + Стрельба", "🎯", "#f0f", 10000);
            this.hud.setModuleCooldown(8, this.module8Cooldown);
        }
        if (this.chatSystem) {
            this.chatSystem.success("🎯 Автонаводка и автострельба активированы!");
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }

        // Отключаем через 10 секунд
        this.module8Timeout = window.setTimeout(() => {
            this.module8Active = false;
            this.module8Timeout = null;
            if (this.hud) {
                this.hud.removeActiveEffect("Автонаводка + Стрельба");
            }
            if (this.chatSystem) {
                this.chatSystem.log("Автонаводка и автострельба закончились");
            }
        }, 10000);
    }

    // Модуль 9: Платформа - поднимает платформу под танком пока зажата кнопка (макс 10 сек)
    private activateModule9(): void {
        // Проверка кулдауна
        const now = Date.now();
        if (now - this.module9LastUse < this.module9Cooldown) {
            const remaining = ((this.module9Cooldown - (now - this.module9LastUse)) / 1000).toFixed(1);
            if (this.chatSystem) {
                this.chatSystem.log(`Модуль 9 на кулдауне: ${remaining}с`);
            }
            return;
        }

        if (this.module9Active) return;
        if (!this.chassis) return;

        this.module9Active = true;
        this.module9State = "rising";
        this.module9LastUse = now;
        this.module9StartTime = now;

        // Определяем высоту поверхности под танком
        const tankPos = this.chassis.absolutePosition;
        const rayStart = new Vector3(tankPos.x, tankPos.y + 2, tankPos.z);
        const rayDirection = new Vector3(0, -1, 0);
        const ray = new Ray(rayStart, rayDirection, 30);

        let groundY = 0;
        let surfaceColor = new Color3(0.4, 0.4, 0.4);

        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "platform")) return false;
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
            return mesh.isPickable && mesh.visibility > 0.5;
        });

        if (pick && pick.hit && pick.pickedPoint) {
            groundY = pick.pickedPoint.y;
            if (pick.pickedMesh && pick.pickedMesh.material) {
                const material = pick.pickedMesh.material;
                if (material instanceof StandardMaterial) {
                    surfaceColor = material.diffuseColor.clone();
                }
            }
        }

        this.module9GroundY = groundY;

        // Создаём платформу (прямоугольник под танком) - размер 1.2x от размера танка
        const platformWidth = this.chassisType.width * 1.2;
        const platformDepth = this.chassisType.depth * 1.2;
        const platformHeight = 0.5;

        // Начальная высота - чуть ниже танка (под его дном)
        // Это гарантирует что платформа сразу начнёт поднимать танк
        const tankBottomY = tankPos.y - this.chassisType.height / 2;
        // ИСПРАВЛЕНО: Спавним платформу СТРОГО ниже танка с зазором 10см, чтобы избежать пересечения физики
        const startY = tankBottomY - platformHeight / 2 - 0.1;
        this.module9CurrentY = startY;

        this.module9Platform = MeshBuilder.CreateBox(`platform_${Date.now()}`, {
            width: platformWidth,
            height: platformHeight,
            depth: platformDepth
        }, this.scene);

        // Начальная позиция
        this.module9Platform.position = new Vector3(
            tankPos.x,
            startY, // Центр платформы
            tankPos.z
        );

        // Поворачиваем платформу в направлении танка
        const chassisRot = this.chassis.rotationQuaternion
            ? this.chassis.rotationQuaternion.toEulerAngles().y
            : this.chassis.rotation.y;
        this.module9Platform.rotation.y = chassisRot;

        // Материал платформы - цвет поверхности
        const platformMat = new StandardMaterial(`platformMat_${Date.now()}`, this.scene);
        platformMat.diffuseColor = surfaceColor.scale(1.1); // Немного светлее поверхности
        platformMat.emissiveColor = surfaceColor.scale(0.15);
        platformMat.specularColor = Color3.Black();
        this.module9Platform.material = platformMat;

        // Метаданные
        this.module9Platform.metadata = { type: "platform", owner: this };

        // Физика платформы (ANIMATED для движения с коллизиями)
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: { extents: new Vector3(platformWidth, platformHeight, platformDepth) }
        }, this.scene);
        shape.filterMembershipMask = 2; // Как окружение/terrain
        shape.filterCollideMask = 1 | 8; // Игрок (1), враги (8)

        this.module9PlatformPhysics = new PhysicsBody(this.module9Platform, PhysicsMotionType.ANIMATED, false, this.scene);
        this.module9PlatformPhysics.shape = shape;

        // КРИТИЧНО: Отключаем preStep для ручного контроля
        this.module9PlatformPhysics.disablePreStep = true;

        if (this.hud) {
            this.hud.addActiveEffect("Платформа", "⬆️", "#f80", this.MODULE9_MAX_DURATION);
            this.hud.setModuleCooldown(9, this.module9Cooldown);
        }
        if (this.chatSystem) {
            this.chatSystem.success("⬆️ Платформа поднимается!");
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }
    }

    /**
     * Вызывается при отпускании кнопки 9 - переводит платформу в состояние "staying"
     */
    private deactivateModule9Platform(): void {
        if (!this.module9Active) return;

        // Если уже падает - ничего не делаем, пусть падает
        if (this.module9State === "falling") return;

        // Переходим в состояние удержания (платформа остаётся на месте 1 секунду перед падением)
        this.module9State = "staying";
        this.module9ReleaseTime = Date.now();

        if (this.chatSystem) {
            this.chatSystem.log("Платформа удерживается...");
        }

        // Safety cleanup: Force destroy after 15 seconds if something goes wrong
        setTimeout(() => {
            if (this.module9Active) {
                this.destroyModule9Platform();
            }
        }, 15000);
    }

    /**
     * Полностью удаляет платформу и сбрасывает состояние
     */
    private destroyModule9Platform(): void {
        console.log("[TANK] Destroying platform module");

        // Удаляем физику
        if (this.module9PlatformPhysics) {
            this.module9PlatformPhysics.dispose();
            this.module9PlatformPhysics = null;
        }

        // Удаляем меш
        if (this.module9Platform && !this.module9Platform.isDisposed()) {
            this.module9Platform.dispose();
            this.module9Platform = null;
        }

        // Сбрасываем состояние
        this.module9Active = false;
        this.module9State = "idle";

        if (this.hud) {
            this.hud.removeActiveEffect("Платформа");
        }
        if (this.chatSystem) {
            this.chatSystem.log("Платформа исчезла");
        }
    }

    /**
     * Обновление платформы (вызывается каждый кадр)
     * State machine: idle → rising → staying → falling → idle
     * ОПТИМИЗИРОВАНО: Максимально плавное движение с интерполяцией
     */
    private updateModule9Platform(): void {
        if (!this.module9Active || !this.module9Platform || this.module9Platform.isDisposed()) {
            if (this.module9State !== "idle") {
                this.module9State = "idle";
            }
            return;
        }
        if (!this.chassis) return;

        const now = Date.now();
        // КРИТИЧНО: Используем реальное время кадра для максимально плавного движения
        const deltaTimeMs = this.scene.getEngine().getDeltaTime();
        const deltaTime = deltaTimeMs / 1000; // Конвертируем в секунды

        // Защита от слишком больших deltaTime (например, при паузе или табе)
        const clampedDeltaTime = Math.min(deltaTime, 0.1); // Максимум 100мс за кадр

        const platformHeight = 0.5;

        switch (this.module9State) {
            case "rising": {
                // Платформа поднимается пока кнопка зажата
                const elapsed = now - this.module9StartTime;

                // Проверяем максимальную длительность подъёма (10 секунд)
                if (elapsed >= this.MODULE9_MAX_DURATION) {
                    // Автоматически переходим в staying
                    this.module9State = "staying";
                    this.module9ReleaseTime = now;
                    if (this.chatSystem) {
                        this.chatSystem.log("Максимальная высота достигнута!");
                    }
                    return;
                }

                // Плавно поднимаем платформу каждый кадр с использованием clampedDeltaTime
                const maxY = this.module9GroundY + this.MODULE9_MAX_HEIGHT;
                this.module9CurrentY += this.MODULE9_LIFT_SPEED * clampedDeltaTime;

                // Ограничиваем максимальную высоту
                if (this.module9CurrentY >= maxY) {
                    this.module9CurrentY = maxY;
                    this.module9State = "staying";
                    this.module9ReleaseTime = now;
                    if (this.chatSystem) {
                        this.chatSystem.log("Максимальная высота достигнута!");
                    }
                }
                break;
            }

            case "staying": {
                // Платформа стоит на месте 3 секунды после отпускания
                const stayElapsed = now - this.module9ReleaseTime;

                if (stayElapsed >= this.MODULE9_STAY_DURATION) {
                    // Переходим к опусканию
                    this.module9State = "falling";
                    if (this.chatSystem) {
                        this.chatSystem.log("Платформа опускается...");
                    }
                }
                // Высота не меняется во время staying
                break;
            }

            case "falling": {
                // Платформа опускается обратно в землю с использованием clampedDeltaTime
                this.module9CurrentY -= this.MODULE9_FALL_SPEED * clampedDeltaTime;

                // Если достигли уровня земли (или чуть ниже для гарантии) - удаляем платформу
                // Добавляем запас 0.5 метра для надежности
                if (this.module9CurrentY <= this.module9GroundY - 0.5) {
                    this.module9CurrentY = this.module9GroundY - 0.5;
                    this.destroyModule9Platform();
                    return;
                }
                break;
            }

            case "idle":
            default:
                return;
        }

        // КРИТИЧНО: Обновляем позицию платформы КАЖДЫЙ КАДР для максимальной плавности
        // Центр платформы = groundY + высота
        const targetPlatformCenterY = this.module9CurrentY;

        // Плавная интерполяция позиции для устранения дёрганий
        const currentY = this.module9Platform.position.y;
        const yDiff = targetPlatformCenterY - currentY;

        // Используем линейную интерполяцию с коэффициентом для плавности
        const lerpFactor = Math.min(1.0, clampedDeltaTime * 30); // 30x для быстрой, но плавной интерполяции
        const newY = currentY + yDiff * lerpFactor;

        // КРИТИЧНО: Обновляем физику КАЖДЫЙ КАДР для максимальной плавности
        if (this.module9PlatformPhysics && this.chassis) {
            const chassisRot = this.chassis.rotationQuaternion
                ? this.chassis.rotationQuaternion.toEulerAngles().y
                : this.chassis.rotation.y;

            // ИСПРАВЛЕНО: Синхронизируем X и Z позицию платформы с танком
            const tankPos = this.chassis.absolutePosition;
            this.module9Platform.position.x = tankPos.x;
            this.module9Platform.position.z = tankPos.z;
            this.module9Platform.position.y = newY;

            // ИСПРАВЛЕНО: Обновляем физику с правильной позицией и поворотом
            // Вычисляем абсолютную позицию для физики
            this.module9Platform.computeWorldMatrix(true);
            const worldPos = this.module9Platform.getAbsolutePosition();

            this.module9PlatformPhysics.setTargetTransform(
                worldPos,
                Quaternion.FromEulerAngles(0, chassisRot, 0)
            );
        }
    }

    // Модуль 0: Выполнение прыжка с накопленной силой
    private executeModule0Jump(): void {
        logger.log(`[TANK] executeModule0Jump called: module0Charging=${this.module0Charging}, hasPhysics=${!!this.physicsBody}, isAlive=${this.isAlive}`);

        if (!this.module0Charging) {
            logger.warn(`[TANK] Jump failed: module0Charging is false`);
            return;
        }
        if (!this.physicsBody) {
            logger.warn(`[TANK] Jump failed: physicsBody is null`);
            return;
        }
        if (!this.isAlive) {
            logger.warn(`[TANK] Jump failed: tank is not alive`);
            return;
        }

        // УЛУЧШЕНО: Вычисляем силу прыжка на основе времени зарядки (максимум 5 секунд для быстрого прыжка)
        const chargeTime = Math.max(Date.now() - this.module0ChargeStart, 100); // Минимум 100мс зарядки
        const maxChargeTime = 5000; // УЛУЧШЕНО: Уменьшено с 10000 до 5000 для быстрой зарядки
        const chargeRatio = Math.min(chargeTime / maxChargeTime, 1.0); // 0.0 - 1.0

        // УЛУЧШЕНО: Более мощная минимальная и максимальная сила прыжка
        const basePower = 50000; // УЛУЧШЕНО: Увеличено с 30000 до 50000 для мощного прыжка
        const maxPower = 800000; // УЛУЧШЕНО: Увеличено с 500000 до 800000 для супер-прыжков!
        const jumpPower = basePower + (maxPower - basePower) * chargeRatio;

        // Получаем текущую вертикальную скорость
        const vel = this.physicsBody.getLinearVelocity();
        const currentVerticalVel = vel ? vel.y : 0;

        // Если падаем, компенсируем падение и добавляем силу прыжка
        // Если уже летим вверх, добавляем дополнительную силу
        let jumpForceY = jumpPower;
        if (currentVerticalVel < 0) {
            // Компенсируем падение: добавляем силу, равную скорости падения * массу
            const compensation = Math.abs(currentVerticalVel) * 3500; // УЛУЧШЕНО: Увеличено с 3000 до 3500
            jumpForceY += compensation;
        }

        // УЛУЧШЕНО: Направленный прыжок - добавляем горизонтальную силу в направлении движения
        let jumpForceX = 0;
        let jumpForceZ = 0;

        // Если зажат throttle (W/S), добавляем горизонтальную силу
        if (this.chassis && Math.abs(this.smoothThrottle) > 0.1) {
            const chassisQuat = this.chassis.rotationQuaternion;
            const chassisAngle = chassisQuat ? chassisQuat.toEulerAngles().y : this.chassis.rotation.y;

            // Направление движения танка
            const directionX = Math.sin(chassisAngle);
            const directionZ = Math.cos(chassisAngle);

            // Сила горизонтального прыжка - 30% от вертикальной силы
            const horizontalPower = jumpPower * 0.30 * Math.sign(this.smoothThrottle);
            jumpForceX = directionX * horizontalPower;
            jumpForceZ = directionZ * horizontalPower;
        }

        // Проверяем режим физики - должен быть DYNAMIC для применения импульса
        if (this.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
            logger.warn(`[TANK] Physics body is not DYNAMIC (${this.physicsBody.motionType}), setting to DYNAMIC`);
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }

        // Устанавливаем флаг прыжка
        this.isJumping = true;
        this.jumpStartTime = Date.now();

        // УЛУЧШЕНО: Применяем 3D силу для направленного прыжка!
        const jumpForce = new Vector3(jumpForceX, jumpForceY, jumpForceZ);
        const jumpPosition = this.chassis.absolutePosition.clone();

        logger.log(`[TANK] Applying jump impulse: force=(${jumpForceX.toFixed(0)}, ${jumpForceY.toFixed(0)}, ${jumpForceZ.toFixed(0)}), position=(${jumpPosition.x.toFixed(2)}, ${jumpPosition.y.toFixed(2)}, ${jumpPosition.z.toFixed(2)})`);

        this.physicsBody.applyImpulse(jumpForce, jumpPosition);

        // Проверяем, что импульс применился
        const velAfter = this.physicsBody.getLinearVelocity();
        logger.log(`[TANK] Jump executed: power=${jumpPower.toFixed(0)}, force=${jumpForceY.toFixed(0)}, velY before=${currentVerticalVel.toFixed(2)}, velY after=${velAfter ? velAfter.y.toFixed(2) : 'null'}`);

        this.module0Charging = false;

        // Сбрасываем флаг прыжка через заданное время
        setTimeout(() => {
            this.isJumping = false;
            logger.log(`[TANK] Jump flag reset`);
        }, this.jumpDuration);
        this.module0LastUse = Date.now();

        // Восстанавливаем canJump сразу после прыжка (для быстрых прыжков)
        // Но проверяем кулдаун модуля 0
        this.canJump = false;
        setTimeout(() => {
            this.canJump = true;
        }, Math.max(this.jumpCooldown, 500)); // Минимум 500мс между прыжками

        if (this.hud) {
            this.hud.setModuleCooldown(0, this.module0Cooldown);
        }
        if (this.chatSystem) {
            const powerPercent = Math.floor(chargeRatio * 100);
            this.chatSystem.combat(`🚀 Прыжок! (${powerPercent}% силы)`);
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }

        // Визуальный эффект
        if (this.effectsManager && this.chassis) {
            const color = Color3.FromHexString("#00ffff");
            this.effectsManager.createConsumableEffect(this.chassis.absolutePosition, color, "jump");
        }
    }

    // Обновление гильз
    // ============ CANNON ANIMATIONS ============
    private updateCannonAnimations(): void {
        if (!this.cannonAnimationElements || !this.barrel || this.barrel.isDisposed()) return;

        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000; // Convert to seconds
        if (!this.cannonAnimationElements.animationTime) this.cannonAnimationElements.animationTime = 0;
        this.cannonAnimationElements.animationTime += deltaTime;

        const time = this.cannonAnimationElements.animationTime;

        // Gatling - вращение стволов
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.gatlingBarrels) {
            const rotationSpeed = 10; // Radians per second
            const gatlingBarrels = this.cannonAnimationElements.gatlingBarrels;
            const barrelCount = gatlingBarrels.length;
            for (let i = 0; i < barrelCount; i++) {
                const barrel = gatlingBarrels[i];
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += rotationSpeed * deltaTime;
                }
            }
        }

        // Gatling - пульсация блока питания
        if (this.cannonAnimationElements.gatlingPowerBlock) {
            const powerBlock = this.cannonAnimationElements.gatlingPowerBlock;
            if (!powerBlock.isDisposed()) {
                const pulse = Math.sin(time * 2) * 0.05 + 1.0;
                powerBlock.scaling.setAll(pulse);
                const mat = powerBlock.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 2) + 1) * 0.5;
                    mat.emissiveColor.set(intensity * 0.1, intensity * 0.1, intensity * 0.1);
                }
            }
        }

        // Sniper - пульсация линзы прицела
        if (this.cannonAnimationElements.sniperLens) {
            const lens = this.cannonAnimationElements.sniperLens;
            if (!lens.isDisposed()) {
                const pulse = Math.sin(time * 1.5) * 0.1 + 1.0;
                lens.scaling.setAll(pulse);
                const mat = lens.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 1.5) + 1) * 0.5;
                    mat.emissiveColor.set(intensity * 0.1, intensity * 0.2, intensity * 0.3);
                }
            }
        }

        // Tesla - пульсация катушек и генератора
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.teslaCoils) {
            const teslaCoils = this.cannonAnimationElements.teslaCoils;
            const teslaCoilCount = teslaCoils.length;
            for (let i = 0; i < teslaCoilCount; i++) {
                const coil = teslaCoils[i];
                if (coil && !coil.isDisposed()) {
                    const pulse = Math.sin(time * 3 + i * 0.5) * 0.15 + 1.0;
                    coil.scaling.setAll(pulse);
                    // Rotate coils
                    coil.rotation.y += deltaTime * (2.5 + i * 0.3);
                    const mat = coil.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 3 + i * 0.5) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0, 0.4 * intensity, 0.5 * intensity);
                    }
                }
            }
        }
        if (this.cannonAnimationElements.teslaGen) {
            const gen = this.cannonAnimationElements.teslaGen;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 5) * 0.2 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 4;
                gen.rotation.x += deltaTime * 3;
                const mat = gen.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0, 0.5 * intensity, 0.7 * intensity);
                }
            }
        }

        // Railgun - пульсация конденсаторов
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.railgunCapacitors) {
            const railgunCapacitors = this.cannonAnimationElements.railgunCapacitors;
            const capCount = railgunCapacitors.length;
            for (let i = 0; i < capCount; i++) {
                const cap = railgunCapacitors[i];
                if (cap && !cap.isDisposed()) {
                    const pulse = Math.sin(time * 2 + i * 0.6) * 0.1 + 1.0;
                    cap.scaling.setAll(pulse);
                    const mat = cap.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 2 + i * 0.6) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.05 * intensity, 0.15 * intensity, 0.5 * intensity);
                    }
                }
            }
        }

        // Plasma - пульсация ядра и вращение катушек
        if (this.cannonAnimationElements.plasmaCore) {
            const core = this.cannonAnimationElements.plasmaCore;
            if (!core.isDisposed()) {
                const pulse = Math.sin(time * 4) * 0.2 + 1.0;
                core.scaling.setAll(pulse);
                // Rotate core
                core.rotation.y += deltaTime * 3;
                core.rotation.x += deltaTime * 2;
                // Update emissive color
                const mat = core.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 4) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.6 * intensity, 0, 0.6 * intensity);
                }
            }
        }
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.plasmaCoils) {
            const plasmaCoils = this.cannonAnimationElements.plasmaCoils;
            const plasmaCoilCount = plasmaCoils.length;
            for (let i = 0; i < plasmaCoilCount; i++) {
                const coil = plasmaCoils[i];
                if (coil && !coil.isDisposed()) {
                    coil.rotation.y += deltaTime * (2 + i * 0.5);
                    const pulse = Math.sin(time * 3 + i * 0.8) * 0.1 + 1.0;
                    coil.scaling.setAll(pulse);
                    const mat = coil.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 3 + i * 0.8) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.4 * intensity, 0, 0.4 * intensity);
                    }
                }
            }
        }

        // Laser - мерцание линзы и вращение колец
        if (this.cannonAnimationElements.laserLens) {
            const lens = this.cannonAnimationElements.laserLens;
            if (!lens.isDisposed()) {
                const flicker = Math.sin(time * 8) * 0.15 + 1.0;
                lens.scaling.setAll(flicker);
                // Update emissive color
                const mat = lens.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 8) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.4 * intensity, 0, 0);
                }
            }
        }
        if (this.cannonAnimationElements.laserRings) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const laserRings2 = this.cannonAnimationElements.laserRings;
            const laserRingCount2 = laserRings2.length;
            for (let i = 0; i < laserRingCount2; i++) {
                const ring = laserRings2[i];
                if (ring && !ring.isDisposed()) {
                    ring.rotation.y += deltaTime * (1.5 + i * 0.3);
                    const pulse = Math.sin(time * 5 + i * 0.5) * 0.08 + 1.0;
                    ring.scaling.setAll(pulse);
                }
            }
        }

        // Vortex - вращение колец и генератора
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.vortexRings) {
            const vortexRings = this.cannonAnimationElements.vortexRings;
            const vortexRingCount = vortexRings.length;
            for (let i = 0; i < vortexRingCount; i++) {
                const ring = vortexRings[i];
                if (ring && !ring.isDisposed()) {
                    const speed = (i + 1) * 2.5; // Different speeds for each ring
                    ring.rotation.x += deltaTime * speed;
                    ring.rotation.z += deltaTime * speed * 0.5;
                    // Pulsing size
                    const pulse = Math.sin(time * 2 + i * 0.8) * 0.1 + 1.0;
                    ring.scaling.setAll(pulse);
                    const mat = ring.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 2 + i * 0.8) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.1 * intensity, 0.05 * intensity, 0.2 * intensity);
                    }
                }
            }
        }
        if (this.cannonAnimationElements.vortexGen) {
            const gen = this.cannonAnimationElements.vortexGen;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 3) * 0.2 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 4;
                gen.rotation.x += deltaTime * 3;
                const mat = gen.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 3) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.15 * intensity, 0.075 * intensity, 0.25 * intensity);
                }
            }
        }

        // Support - вращение колец и пульсация эмиттера
        if (this.cannonAnimationElements.supportEmitter) {
            const emitter = this.cannonAnimationElements.supportEmitter;
            if (!emitter.isDisposed()) {
                const pulse = Math.sin(time * 3) * 0.15 + 1.0;
                emitter.scaling.setAll(pulse);
                emitter.rotation.y += deltaTime * 2;
                // Update emissive color
                const mat = emitter.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 3) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0, 0.4 * intensity, 0.2 * intensity);
                }
            }
        }
        if (this.cannonAnimationElements.supportRings) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const supportRings2 = this.cannonAnimationElements.supportRings;
            const supportRingCount2 = supportRings2.length;
            for (let i = 0; i < supportRingCount2; i++) {
                const ring = supportRings2[i];
                if (ring && !ring.isDisposed()) {
                    ring.rotation.y += deltaTime * (3 + i * 1);
                    const pulse = Math.sin(time * 4 + i * 0.5) * 0.1 + 1.0;
                    ring.scaling.setAll(pulse);
                }
            }
        }
        if (this.cannonAnimationElements.repairGen) {
            const gen = this.cannonAnimationElements.repairGen;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 2.5) * 0.15 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 3;
                gen.rotation.x += deltaTime * 2;
            }
        }

        // Rocket - пульсация трубы
        if (this.cannonAnimationElements.rocketTube) {
            const tube = this.cannonAnimationElements.rocketTube;
            if (!tube.isDisposed()) {
                const pulse = Math.sin(time * 2) * 0.05 + 1.0;
                tube.scaling.y = pulse;
            }
        }

        // Mortar - вибрация базы
        if (this.cannonAnimationElements.mortarBase) {
            const base = this.cannonAnimationElements.mortarBase;
            if (!base.isDisposed()) {
                const shake = Math.sin(time * 5) * 0.02;
                base.rotation.z = shake;
            }
        }

        // Cluster - вращение трубок
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.clusterTubes) {
            const clusterTubes = this.cannonAnimationElements.clusterTubes;
            const clusterTubeCount = clusterTubes.length;
            for (let i = 0; i < clusterTubeCount; i++) {
                const tube = clusterTubes[i];
                if (tube && !tube.isDisposed()) {
                    tube.rotation.z += deltaTime * (2 + i * 0.5);
                }
            }
        }

        // Acid - пульсация резервуара
        if (this.cannonAnimationElements.acidTank) {
            const tank = this.cannonAnimationElements.acidTank;
            if (!tank.isDisposed()) {
                const pulse = Math.sin(time * 1.5) * 0.08 + 1.0;
                tank.scaling.y = pulse;
                // Slight rotation
                tank.rotation.y += deltaTime * 0.5;
            }
        }

        // Freeze - вибрация рёбер охлаждения
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.freezeFins) {
            const freezeFins = this.cannonAnimationElements.freezeFins;
            const freezeFinCount = freezeFins.length;
            for (let i = 0; i < freezeFinCount; i++) {
                const fin = freezeFins[i];
                if (fin && !fin.isDisposed()) {
                    const shake = Math.sin(time * 4 + i * 0.5) * 0.03;
                    fin.rotation.x = shake;
                }
            }
        }

        // EMP - вращение и пульсация излучателя
        if (this.cannonAnimationElements.empDish) {
            const dish = this.cannonAnimationElements.empDish;
            if (!dish.isDisposed()) {
                dish.rotation.y += deltaTime * 1.5;
                const pulse = Math.sin(time * 3) * 0.1 + 1.0;
                dish.scaling.setAll(pulse);
            }
        }

        // Rocket - пульсация направляющих
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.rocketGuides) {
            const rocketGuides = this.cannonAnimationElements.rocketGuides;
            const rocketGuideCount = rocketGuides.length;
            for (let i = 0; i < rocketGuideCount; i++) {
                const guide = rocketGuides[i];
                if (guide && !guide.isDisposed()) {
                    const pulse = Math.sin(time * 2 + i * 0.3) * 0.05 + 1.0;
                    guide.scaling.setAll(pulse);
                }
            }
        }

        // Acid - пульсация резервуара
        if (this.cannonAnimationElements.acidTank) {
            const tank = this.cannonAnimationElements.acidTank;
            if (!tank.isDisposed()) {
                const pulse = Math.sin(time * 1.5) * 0.1 + 1.0;
                tank.scaling.y = pulse;
                tank.rotation.y += deltaTime * 0.5;
                const mat = tank.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 1.5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.05 * intensity, 0.2 * intensity, 0.05 * intensity);
                }
            }
        }

        // Freeze - вибрация рёбер и пульсация резервуара
        if (this.cannonAnimationElements.freezeFins) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const freezeFins2 = this.cannonAnimationElements.freezeFins;
            const freezeFinCount2 = freezeFins2.length;
            for (let i = 0; i < freezeFinCount2; i++) {
                const fin = freezeFins2[i];
                if (fin && !fin.isDisposed()) {
                    const shake = Math.sin(time * 4 + i * 0.5) * 0.05;
                    fin.rotation.x = shake;
                    const mat = fin.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 4 + i * 0.5) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.05 * intensity, 0.1 * intensity, 0.15 * intensity);
                    }
                }
            }
        }
        if (this.cannonAnimationElements.cryoTank) {
            const cryo = this.cannonAnimationElements.cryoTank;
            if (!cryo.isDisposed()) {
                const pulse = Math.sin(time * 2) * 0.1 + 1.0;
                cryo.scaling.setAll(pulse);
                cryo.rotation.y += deltaTime * 1;
            }
        }

        // Poison - пульсация инжектора
        if (this.cannonAnimationElements.poisonInjector) {
            const injector = this.cannonAnimationElements.poisonInjector;
            if (!injector.isDisposed()) {
                const pulse = Math.sin(time * 3) * 0.1 + 1.0;
                injector.scaling.setAll(pulse);
                injector.rotation.y += deltaTime * 2;
            }
        }

        // EMP - вращение катушек и генератора
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.empCoils) {
            const empCoils = this.cannonAnimationElements.empCoils;
            const empCoilCount = empCoils.length;
            for (let i = 0; i < empCoilCount; i++) {
                const coil = empCoils[i];
                if (coil && !coil.isDisposed()) {
                    coil.rotation.y += deltaTime * (2 + i * 0.5);
                    const pulse = Math.sin(time * 3 + i * 0.6) * 0.1 + 1.0;
                    coil.scaling.setAll(pulse);
                }
            }
        }
        if (this.cannonAnimationElements.empGen) {
            const gen = this.cannonAnimationElements.empGen;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 4) * 0.15 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 3;
                gen.rotation.x += deltaTime * 2;
                const mat = gen.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 4) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.25 * intensity, 0.25 * intensity, 0.075 * intensity);
                }
            }
        }

        // Flamethrower - пульсация сопла
        if (this.cannonAnimationElements.flamethrowerNozzle) {
            const nozzle = this.cannonAnimationElements.flamethrowerNozzle;
            if (!nozzle.isDisposed()) {
                const pulse = Math.sin(time * 5) * 0.1 + 1.0;
                nozzle.scaling.setAll(pulse);
                const mat = nozzle.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.15 * intensity, 0.05 * intensity, 0);
                }
            }
        }

        // Shotgun - вращение стволов
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.shotgunBarrels) {
            const shotgunBarrels = this.cannonAnimationElements.shotgunBarrels;
            const shotgunBarrelCount = shotgunBarrels.length;
            for (let i = 0; i < shotgunBarrelCount; i++) {
                const barrel = shotgunBarrels[i];
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += deltaTime * (1 + i * 0.1);
                }
            }
        }

        // Multishot - вращение стволов
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        if (this.cannonAnimationElements.multishotBarrels) {
            const multishotBarrels = this.cannonAnimationElements.multishotBarrels;
            const multishotBarrelCount = multishotBarrels.length;
            for (let i = 0; i < multishotBarrelCount; i++) {
                const barrel = multishotBarrels[i];
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += deltaTime * (1 + i * 0.3);
                }
            }
        }

        // Homing - пульсация системы наведения
        if (this.cannonAnimationElements.homingGuidance) {
            const guidance = this.cannonAnimationElements.homingGuidance;
            if (!guidance.isDisposed()) {
                const pulse = Math.sin(time * 4) * 0.1 + 1.0;
                guidance.scaling.setAll(pulse);
                guidance.rotation.y += deltaTime * 3;
                // Update color
                const mat = guidance.material as StandardMaterial;
                if (mat && mat.diffuseColor) {
                    const intensity = (Math.sin(time * 4) + 1) * 0.5;
                    mat.diffuseColor = new Color3(0.2, 0.8 * intensity, 0.2 * intensity);
                }
            }
        }

        // Piercing - вращение острия
        if (this.cannonAnimationElements.piercingTip) {
            const tip = this.cannonAnimationElements.piercingTip;
            if (!tip.isDisposed()) {
                tip.rotation.y += deltaTime * 5;
            }
        }

        // Shockwave - пульсация усилителя
        if (this.cannonAnimationElements.shockwaveAmp) {
            const amp = this.cannonAnimationElements.shockwaveAmp;
            if (!amp.isDisposed()) {
                const pulse = Math.sin(time * 2.5) * 0.12 + 1.0;
                amp.scaling.setAll(pulse);
                amp.rotation.y += deltaTime * 1;
            }
        }

        // Beam - вращение и пульсация фокусировщика и линз
        if (this.cannonAnimationElements.beamFocuser) {
            const focuser = this.cannonAnimationElements.beamFocuser;
            if (!focuser.isDisposed()) {
                focuser.rotation.y += deltaTime * 4;
                const pulse = Math.sin(time * 5) * 0.1 + 1.0;
                focuser.scaling.setAll(pulse);
                const mat = focuser.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.2 * intensity, 0.1 * intensity, 0);
                }
            }
        }
        if (this.cannonAnimationElements.beamLenses) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const beamLenses2 = this.cannonAnimationElements.beamLenses;
            const beamLensCount2 = beamLenses2.length;
            for (let i = 0; i < beamLensCount2; i++) {
                const lens = beamLenses2[i];
                if (lens && !lens.isDisposed()) {
                    lens.rotation.y += deltaTime * (2 + i * 0.5);
                    const pulse = Math.sin(time * 4 + i * 0.3) * 0.05 + 1.0;
                    lens.scaling.setAll(pulse);
                }
            }
        }

        // Shockwave - пульсация усилителя (обновлено)
        if (this.cannonAnimationElements.shockwaveAmp) {
            const amp = this.cannonAnimationElements.shockwaveAmp;
            if (!amp.isDisposed()) {
                const pulse = Math.sin(time * 2.5) * 0.15 + 1.0;
                amp.scaling.setAll(pulse);
            }
        }

        // Standard, Rapid, Heavy, Sniper, Explosive, Flamethrower, Poison, Shotgun - subtle idle animations
        if (this.barrel && !this.barrel.isDisposed()) {
            const cannonId = this.cannonType.id;
            if (["standard", "rapid", "heavy", "sniper", "explosive", "flamethrower", "poison", "shotgun"].includes(cannonId)) {
                // Subtle breathing/pulsing effect
                const breath = Math.sin(time * 0.5) * 0.01 + 1.0;
                this.barrel.scaling.y = breath;
            }
        }
    }

    // ============ CHASSIS ANIMATIONS ============
    private updateChassisAnimations(): void {
        if (!this.chassisAnimationElements || !this.chassis || this.chassis.isDisposed()) return;

        const deltaTime = this.scene.getEngine().getDeltaTime() / 1000;
        if (!this.chassisAnimationElements.animationTime) this.chassisAnimationElements.animationTime = 0;
        this.chassisAnimationElements.animationTime += deltaTime;

        const time = this.chassisAnimationElements.animationTime;

        // Stealth - пульсация генератора невидимости
        if (this.chassisAnimationElements.stealthMesh) {
            const gen = this.chassisAnimationElements.stealthMesh;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 2) * 0.1 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 2;
                const mat = gen.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 2) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.1 * intensity, 0.1 * intensity, 0.1 * intensity);
                }
            }
        }

        // Hover - пульсация реактивных двигателей
        if (this.chassisAnimationElements.hoverThrusters) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const hoverThrusters2 = this.chassisAnimationElements.hoverThrusters;
            const hoverThrusterCount2 = hoverThrusters2.length;
            for (let i = 0; i < hoverThrusterCount2; i++) {
                const thruster = hoverThrusters2[i];
                if (thruster && !thruster.isDisposed()) {
                    const pulse = Math.sin(time * 3 + i * 0.5) * 0.15 + 1.0;
                    thruster.scaling.setAll(pulse);
                    const mat = thruster.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 3 + i * 0.5) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0, 0.3 * intensity, 0.6 * intensity);
                    }
                }
            }
        }

        // Shield - пульсация генератора щита
        if (this.chassisAnimationElements.shieldMesh) {
            const gen = this.chassisAnimationElements.shieldMesh;
            if (!gen.isDisposed()) {
                const pulse = Math.sin(time * 2.5) * 0.12 + 1.0;
                gen.scaling.setAll(pulse);
                gen.rotation.y += deltaTime * 3;
                gen.rotation.x += deltaTime * 2;
                const mat = gen.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 2.5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0, 0.5 * intensity, 0.25 * intensity);
                }
            }
        }

        // Drone - пульсация платформ
        if (this.chassisAnimationElements.droneMeshes) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const droneMeshes2 = this.chassisAnimationElements.droneMeshes;
            const droneMeshCount2 = droneMeshes2.length;
            for (let i = 0; i < droneMeshCount2; i++) {
                const platform = droneMeshes2[i];
                if (platform && !platform.isDisposed()) {
                    const pulse = Math.sin(time * 2 + i * 0.8) * 0.1 + 1.0;
                    platform.scaling.setAll(pulse);
                    platform.rotation.y += deltaTime * (1 + i * 0.5);
                    const mat = platform.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 2 + i * 0.8) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.3 * intensity, 0, 0.6 * intensity);
                    }
                }
            }
        }

        // Command - вращение ауры
        if (this.chassisAnimationElements.commandAura) {
            const aura = this.chassisAnimationElements.commandAura;
            if (!aura.isDisposed()) {
                aura.rotation.y += deltaTime * 1.5;
                const pulse = Math.sin(time * 1.5) * 0.08 + 1.0;
                aura.scaling.setAll(pulse);
                const mat = aura.material as StandardMaterial;
                if (mat && mat.emissiveColor) {
                    const intensity = (Math.sin(time * 1.5) + 1) * 0.5;
                    mat.emissiveColor = new Color3(0.5 * intensity, 0.42 * intensity, 0);
                }
            }
        }
    }

    // ============ CHASSIS SPECIAL ABILITIES ============
    private activateChassisAbility(): void {
        if (!this.isAlive) return;

        const ability = this.chassisType.specialAbility;
        if (!ability) return;

        const now = Date.now();

        switch (ability) {
            case "stealth":
                if (this.stealthCooldown > now) {
                    if (this.chatSystem) {
                        const remaining = ((this.stealthCooldown - now) / 1000).toFixed(1);
                        this.chatSystem.warning(`Stealth cooldown: ${remaining}s`);
                    }
                    return;
                }
                this.activateStealth();
                break;

            case "shield":
                if (this.shieldCooldown > now) {
                    if (this.chatSystem) {
                        const remaining = ((this.shieldCooldown - now) / 1000).toFixed(1);
                        this.chatSystem.warning(`Shield cooldown: ${remaining}s`);
                    }
                    return;
                }
                this.activateShield();
                break;

            case "drone":
                if (this.droneCooldown > now) {
                    if (this.chatSystem) {
                        const remaining = ((this.droneCooldown - now) / 1000).toFixed(1);
                        this.chatSystem.warning(`Drone cooldown: ${remaining}s`);
                    }
                    return;
                }
                this.activateDrones();
                break;

            case "command":
                if (this.commandCooldown > now) {
                    if (this.chatSystem) {
                        const remaining = ((this.commandCooldown - now) / 1000).toFixed(1);
                        this.chatSystem.warning(`Command cooldown: ${remaining}s`);
                    }
                    return;
                }
                this.activateCommandAura();
                break;

            case "racer":
                this.activateRacerBoost();
                break;

            case "siege":
                this.activateSiegeRegen();
                break;
        }
    }

    private activateStealth(): void {
        this.chassisAnimationElements.stealthActive = true;
        this.stealthCooldown = Date.now() + 20000;
        if (this.chassis && !this.chassis.isDisposed()) {
            const mat = this.chassis.material as StandardMaterial;
            if (mat) mat.alpha = 0.3;
        }
        if (this.hud) this.hud.addActiveEffect("Невидимость", "👁️", "#333", 5000);
        if (this.chatSystem) this.chatSystem.success("👁️ Невидимость активирована!");
        setTimeout(() => {
            this.chassisAnimationElements.stealthActive = false;
            if (this.chassis && !this.chassis.isDisposed()) {
                const mat = this.chassis.material as StandardMaterial;
                if (mat) mat.alpha = 1.0;
            }
            if (this.hud) this.hud.removeActiveEffect("Невидимость");
        }, 5000);
    }

    private activateShield(): void {
        this.chassisAnimationElements.shieldActive = true;
        this.shieldCooldown = Date.now() + 30000;
        if (this.chassis && !this.chassis.isDisposed() && this.effectsManager) {
            const shield = MeshBuilder.CreateSphere("energyShield", {
                diameter: this.chassisType.width * 1.5,
                segments: 16
            }, this.scene);
            shield.position = this.chassis.absolutePosition.clone();
            shield.parent = this.chassis;
            const shieldMat = new StandardMaterial("energyShieldMat", this.scene);
            shieldMat.diffuseColor = new Color3(0, 1, 0.5);
            shieldMat.emissiveColor = new Color3(0, 0.5, 0.25);
            shieldMat.disableLighting = true;
            shield.material = shieldMat;
            let frame = 0;
            const animate = () => {
                if (!this.chassisAnimationElements.shieldActive || shield.isDisposed()) {
                    shield.dispose();
                    return;
                }
                frame++;
                shield.scaling.setAll(Math.sin(frame * 0.1) * 0.05 + 1.0);
                shield.rotation.y += 0.02;
                const timeoutId = setTimeout(animate, 50);
                this.tankTimeouts.push(timeoutId);
            };
            animate();
            (this.chassisAnimationElements as any).shieldVisual = shield;
        }
        if (this.hud) this.hud.addActiveEffect("Энергощит", "🛡️", "#0f5", 8000);
        if (this.chatSystem) this.chatSystem.success("🛡️ Энергощит активирован!");
        const timeoutId = setTimeout(() => {
            this.chassisAnimationElements.shieldActive = false;
            if (this.hud) this.hud.removeActiveEffect("Энергощит");
        }, 8000);
        this.tankTimeouts.push(timeoutId);
    }

    private activateDrones(): void {
        this.droneCooldown = Date.now() + 25000;
        if (this.chatSystem) this.chatSystem.success("🚁 Боевые дроны выпущены!");
        if (this.hud) this.hud.addActiveEffect("Дроны", "🚁", "#a0f", 15000);
        if (this.chassis && !this.chassis.isDisposed()) {
            for (let i = 0; i < 2; i++) {
                const drone = MeshBuilder.CreateBox(`drone${i}`, { width: 0.3, height: 0.2, depth: 0.3 }, this.scene);
                drone.position = this.chassis.absolutePosition.clone();
                drone.position.y += 2;
                drone.position.x += (i === 0 ? -1 : 1) * 1.5;
                const droneMat = new StandardMaterial(`droneMat${i}`, this.scene);
                droneMat.diffuseColor = new Color3(0.5, 0, 1);
                droneMat.emissiveColor = new Color3(0.3, 0, 0.6);
                droneMat.disableLighting = true;
                drone.material = droneMat;
                let t = 0;
                const animate = () => {
                    if (t > 15 || drone.isDisposed()) {
                        drone.dispose();
                        return;
                    }
                    t += 0.1;
                    drone.position.y = this.chassis.absolutePosition.y + 2 + Math.sin(t) * 0.3;
                    drone.rotation.y += 0.1;
                    const timeoutId = setTimeout(animate, 50);
                    this.tankTimeouts.push(timeoutId);
                };
                animate();
            }
        }
        const timeoutId = setTimeout(() => { if (this.hud) this.hud.removeActiveEffect("Дроны"); }, 15000);
        this.tankTimeouts.push(timeoutId);
    }

    private activateCommandAura(): void {
        this.commandCooldown = Date.now() + 20000;
        const originalDamage = this.damage;
        const originalSpeed = this.moveSpeed;
        this.damage = Math.round(originalDamage * 1.2);
        this.moveSpeed = originalSpeed * 1.15;
        if (this.hud) this.hud.addActiveEffect("Командная аура", "⭐", "#ffd700", 10000);
        if (this.chatSystem) this.chatSystem.success("⭐ Командная аура активирована! +20% урон, +15% скорость");
        setTimeout(() => {
            this.damage = originalDamage;
            this.moveSpeed = originalSpeed;
            if (this.hud) this.hud.removeActiveEffect("Командная аура");
        }, 10000);
    }

    private activateRacerBoost(): void {
        const originalSpeed = this.moveSpeed;
        const originalAccel = this.acceleration;
        this.moveSpeed = originalSpeed * 1.5;
        this.acceleration = originalAccel * 1.3;
        if (this.hud) this.hud.addActiveEffect("Ускорение", "⚡", "#f00", 3000);
        if (this.chatSystem) this.chatSystem.success("⚡ Ускорение активировано!");
        setTimeout(() => {
            this.moveSpeed = originalSpeed;
            this.acceleration = originalAccel;
            if (this.hud) this.hud.removeActiveEffect("Ускорение");
        }, 3000);
    }

    private activateSiegeRegen(): void {
        if (this.currentHealth >= this.maxHealth) return;
        const regenAmount = 30;
        this.currentHealth = Math.min(this.currentHealth + regenAmount, this.maxHealth);
        if (this.hud) {
            this.hud.setHealth(this.currentHealth, this.maxHealth);
            this.hud.addActiveEffect("Регенерация", "💚", "#0f0", 2000);
        }
        if (this.chatSystem) this.chatSystem.success(`💚 Восстановлено ${regenAmount} HP`);
        setTimeout(() => { if (this.hud) this.hud.removeActiveEffect("Регенерация"); }, 2000);
    }

    private updateModules(): void {
        // Модуль 7: Обновление ускоренной стрельбы (cooldown уже изменён в activateModule7)
        // module7Timeout используется в activateModule7 setTimeout callback

        // Модуль 8: Автонаводка и автострельба на ближайшего врага
        // module8Timeout используется в activateModule8 setTimeout callback
        if (this.module8Active && this.enemyTanks && this.enemyTanks.length > 0) {
            // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
            const tankPos = this.getCachedChassisPosition();
            let nearestEnemy: any = null;
            let nearestDist = Infinity;

            // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance
            const enemyCount = this.enemyTanks.length;
            let nearestDistSq = Infinity;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = this.enemyTanks[i];
                if (!enemy || !enemy.chassis || !enemy.isAlive) continue;

                // КРИТИЧНО: Используем absolutePosition для правильной позиции в мировых координатах
                const enemyPos = enemy.chassis.absolutePosition;
                const dx = tankPos.x - enemyPos.x;
                const dy = tankPos.y - enemyPos.y;
                const dz = tankPos.z - enemyPos.z;
                const distSq = dx * dx + dy * dy + dz * dz;

                if (distSq < nearestDistSq) {
                    nearestDist = Math.sqrt(distSq);
                    nearestDistSq = distSq;
                    nearestEnemy = enemy;
                }
            }

            if (nearestEnemy && nearestEnemy.chassis) {
                // Поворачиваем башню к врагу
                const enemyPos = nearestEnemy.chassis.absolutePosition;
                const toEnemy = enemyPos.subtract(tankPos).normalize();
                const targetAngle = Math.atan2(toEnemy.x, toEnemy.z);

                // Плавно поворачиваем башню
                let currentAngle = this.turret.rotation.y;
                let angleDiff = targetAngle - currentAngle;

                // Нормализуем угол к [-PI, PI]
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                // Поворачиваем быстрее при активной наводке
                const turnSpeed = 0.15;
                if (Math.abs(angleDiff) > 0.05) {
                    this.turret.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnSpeed);
                } else {
                    this.turret.rotation.y = targetAngle;
                }

                // Автострельба: если башня наведена (угол < 0.1 радиан) и cooldown готов
                if (Math.abs(angleDiff) < 0.1) {
                    const now = Date.now();
                    if (!this.isReloading && now - this.lastShotTime >= this.cooldown && now - this.module8LastAutoFire >= this.cooldown) {
                        this.fire();
                        this.module8LastAutoFire = now;
                    }
                }
            }
        }

        // Модуль 0: Обновление зарядки прыжка
        if (this.module0Charging) {
            const chargeTime = Date.now() - this.module0ChargeStart;
            const maxChargeTime = 10000; // 10 секунд максимум

            if (chargeTime >= maxChargeTime) {
                // Достигнут максимум - автоматически выполняем прыжок
                this.executeModule0Jump();
            } else {
                // Обновляем накопленную силу для визуализации
                const chargeRatio = chargeTime / maxChargeTime;
                this.module0ChargePower = 20000 + (500000 - 20000) * chargeRatio;

                // Можно добавить визуальную индикацию зарядки в HUD
                if (this.hud && this._tick % 30 === 0) { // Каждые 30 кадров
                    // Можно обновить какой-то индикатор зарядки
                    // const powerPercent = Math.floor(chargeRatio * 100); // Зарезервировано для будущего использования
                    // Явное использование module0ChargePower для подавления предупреждения линтера
                    void this.module0ChargePower;
                }
            }
        }
    }

    // Methods for changing tank parts from garage
    setChassisType(chassisId: string): void {
        this.chassisType = getChassisById(chassisId);
        this.mass = this.chassisType.mass;
        this.moveSpeed = this.chassisType.moveSpeed;
        this.turnSpeed = this.chassisType.turnSpeed;
        this.acceleration = this.chassisType.acceleration;
        this.maxHealth = this.chassisType.maxHealth;
        this.currentHealth = Math.min(this.currentHealth, this.maxHealth);
        // Recreate chassis visuals would require full respawn, so we just update stats
    }

    setCannonType(cannonId: string): void {
        this.cannonType = getCannonById(cannonId);
        this.cooldown = this.cannonType.cooldown;
        this.baseCooldown = this.cannonType.cooldown;
        this.damage = this.cannonType.damage;
        this.projectileSpeed = this.cannonType.projectileSpeed;
        this.projectileSize = this.cannonType.projectileSize;
        // Recreate cannon visuals would require full respawn, so we just update stats
    }

    setTrackType(trackId: string): void {
        this.trackType = getTrackById(trackId);
        // Recreate tracks if they exist
        if (this.leftTrack && this.rightTrack) {
            this.leftTrack.dispose();
            this.rightTrack.dispose();
            this.createVisualWheels();
        }
    }

    /**
     * Анимация механической смены частей танка
     * Старые части "слетают" вверх, новые "прилетают" на место
     */
    playPartChangeAnimation(
        applied: { chassis: boolean; cannon: boolean; track: boolean; skin: boolean },
        onComplete?: () => void
    ): void {
        const hasChanges = applied.chassis || applied.cannon || applied.track;
        if (!hasChanges) {
            // Только скин изменился - не нужна механическая анимация
            if (onComplete) onComplete();
            return;
        }

        const animationDuration = 1500; // ИСПРАВЛЕНО: 1.5 секунды
        const dismountPhase = 600; // Фаза демонтажа
        const mountPhase = 900; // Фаза монтажа

        // Сохраняем оригинальные позиции и состояния
        const partsToAnimate: Array<{
            mesh: Mesh;
            originalPos: Vector3;
            originalRot: Vector3;
            type: 'chassis' | 'turret' | 'barrel' | 'track';
        }> = [];

        // Собираем части для анимации
        // КРИТИЧНО: НЕ анимируем chassis - это подбрасывает весь танк вверх
        // Анимируем только визуальные части (turret, barrel, tracks)
        // if (applied.chassis && this.chassis && !this.chassis.isDisposed()) {
        //     partsToAnimate.push({
        //         mesh: this.chassis,
        //         originalPos: this.chassis.position.clone(),
        //         originalRot: this.chassis.rotation.clone(),
        //         type: 'chassis'
        //     });
        // }

        if (applied.cannon) {
            if (this.turret && !this.turret.isDisposed()) {
                partsToAnimate.push({
                    mesh: this.turret,
                    originalPos: this.turret.position.clone(),
                    originalRot: this.turret.rotation.clone(),
                    type: 'turret'
                });
            }
            if (this.barrel && !this.barrel.isDisposed()) {
                partsToAnimate.push({
                    mesh: this.barrel,
                    originalPos: this.barrel.position.clone(),
                    originalRot: this.barrel.rotation.clone(),
                    type: 'barrel'
                });
            }
        }

        if (applied.track) {
            if (this.leftTrack && !this.leftTrack.isDisposed()) {
                partsToAnimate.push({
                    mesh: this.leftTrack,
                    originalPos: this.leftTrack.position.clone(),
                    originalRot: this.leftTrack.rotation.clone(),
                    type: 'track'
                });
            }
            if (this.rightTrack && !this.rightTrack.isDisposed()) {
                partsToAnimate.push({
                    mesh: this.rightTrack,
                    originalPos: this.rightTrack.position.clone(),
                    originalRot: this.rightTrack.rotation.clone(),
                    type: 'track'
                });
            }
        }

        if (partsToAnimate.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        // Воспроизводим звук механизма
        if (this.soundManager) {
            this.soundManager.playReloadComplete?.();
        }

        // Создаём эффект искр в центре танка
        if (this.effectsManager) {
            const sparkPos = this.chassis.getAbsolutePosition().clone();
            sparkPos.y += 1;
            this.effectsManager.createMuzzleFlash?.(sparkPos, Vector3.Up());
        }

        const startTime = Date.now();

        // Функция анимации
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);

            // Фаза 1: Демонтаж (0-40%)
            if (progress < 0.4) {
                const dismountProgress = progress / 0.4;
                const easeOut = 1 - Math.pow(1 - dismountProgress, 3); // Cubic ease out

                for (const part of partsToAnimate) {
                    if (part.mesh.isDisposed()) continue;

                    // Поднимаем часть вверх с вращением (уменьшена высота для меньшего подбрасывания)
                    const maxLiftHeight = 1.0; // Уменьшено с 3 до 1.0 единицы
                    const liftHeight = easeOut * maxLiftHeight;
                    const rotationAmount = easeOut * Math.PI * 0.2; // Уменьшено вращение с 0.3 до 0.2

                    // Применяем в локальных координатах относительно оригинала
                    part.mesh.position.y = part.originalPos.y + liftHeight;
                    part.mesh.rotation.x = part.originalRot.x + rotationAmount * 0.5;
                    part.mesh.rotation.z = part.originalRot.z + rotationAmount;

                    // Fade out эффект
                    if (part.mesh.material && (part.mesh.material as any).alpha !== undefined) {
                        (part.mesh.material as any).alpha = 1 - easeOut * 0.3;
                    }
                }
            }
            // Фаза 2: Пауза/смена (40-50%)
            else if (progress < 0.5) {
                // Части на максимальной высоте
                const maxLiftHeight = 1.0; // Уменьшено с 3 до 1.0 единицы
                for (const part of partsToAnimate) {
                    if (part.mesh.isDisposed()) continue;
                    part.mesh.position.y = part.originalPos.y + maxLiftHeight;
                }
            }
            // Фаза 3: Монтаж (50-100%)
            else {
                const mountProgress = (progress - 0.5) / 0.5;
                const easeIn = Math.pow(mountProgress, 2); // Quadratic ease in

                const maxLiftHeight = 1.0; // Уменьшено с 3 до 1.0 единицы

                for (const part of partsToAnimate) {
                    if (part.mesh.isDisposed()) continue;

                    // Опускаем часть обратно
                    const liftHeight = maxLiftHeight * (1 - easeIn);
                    const rotationAmount = Math.PI * 0.2 * (1 - easeIn); // Уменьшено вращение с 0.3 до 0.2

                    part.mesh.position.y = part.originalPos.y + liftHeight;
                    part.mesh.rotation.x = part.originalRot.x + rotationAmount * 0.5;
                    part.mesh.rotation.z = part.originalRot.z + rotationAmount;

                    // Fade in эффект
                    if (part.mesh.material && (part.mesh.material as any).alpha !== undefined) {
                        (part.mesh.material as any).alpha = 0.7 + easeIn * 0.3;
                    }
                }

                // Искры при установке (в конце анимации)
                if (progress > 0.9 && this.effectsManager) {
                    const sparkPos = this.chassis.getAbsolutePosition().clone();
                    sparkPos.y += 0.5;
                    // Небольшие искры
                    if (Math.random() > 0.7) {
                        this.effectsManager.createMuzzleFlash?.(sparkPos, Vector3.Up());
                    }
                }
            }

            // Продолжаем или завершаем анимацию
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Финальный сброс позиций
                for (const part of partsToAnimate) {
                    if (part.mesh.isDisposed()) continue;
                    part.mesh.position.copyFrom(part.originalPos);
                    part.mesh.rotation.copyFrom(part.originalRot);
                    if (part.mesh.material && (part.mesh.material as any).alpha !== undefined) {
                        (part.mesh.material as any).alpha = 1;
                    }
                }

                // КРИТИЧНО: Принудительно разблокируем башню после анимации
                // Во время анимации игрок мог случайно нажать Z/X, что установило isKeyboardTurretControl = true
                this.isKeyboardTurretControl = false;
                this.isAutoCentering = false;
                this.turretTurnTarget = 0;
                this.turretTurnSmooth = 0;
                if ((this as any).turretAcceleration !== undefined) {
                    (this as any).turretAcceleration = 0;
                }
                if ((this as any).turretAccelStartTime !== undefined) {
                    (this as any).turretAccelStartTime = 0;
                }

                // Также сбрасываем флаги в game.ts если доступен
                if ((window as any).gameInstance) {
                    const game = (window as any).gameInstance;
                    game.virtualTurretTarget = null;
                    game.isFreeLook = false;
                    // КРИТИЧНО: Сбрасываем флаги центрирования камеры (иначе cameraYaw может сбрасываться в 0)
                    game.shouldCenterCamera = false;
                    game.isCenteringActive = false;
                    // Синхронизируем cameraYaw с реальным углом башни
                    if (this.turret && !this.turret.isDisposed()) {
                        game.cameraYaw = this.turret.rotation.y;
                    }
                }

                // Финальный звук установки
                if (this.soundManager) {
                    this.soundManager.playHit?.();
                }

                // Вызываем callback
                if (onComplete) onComplete();
            }
        };

        // Запускаем анимацию
        requestAnimationFrame(animate);
    }

    /**
     * Загрузить кастомную конфигурацию танка из Workshop
     */
    public loadCustomConfiguration(config: {
        movement?: { maxForwardSpeed?: number; turnSpeed?: number; acceleration?: number };
        combat?: { damage?: number; cooldown?: number; projectileSpeed?: number; projectileSize?: number };
        physics?: { mass?: number; hoverHeight?: number; hoverStiffness?: number; hoverDamping?: number; linearDamping?: number; angularDamping?: number; uprightForce?: number; stabilityForce?: number };
        turret?: { turretSpeed?: number; baseTurretSpeed?: number; turretLerpSpeed?: number; barrelPitchSpeed?: number };
        turretPivot?: { x?: number; y?: number; z?: number };
        visual?: { chassisColor?: string; turretColor?: string; barrelColor?: string };
    }): void {
        try {
            // Применяем параметры движения
            if (config.movement) {
                this.moveSpeed = config.movement.maxForwardSpeed || this.moveSpeed;
                this.turnSpeed = (config.movement.turnSpeed || this.turnSpeed) * (Math.PI / 180); // Конвертируем градусы в радианы
                this.acceleration = config.movement.acceleration || this.acceleration;
            }

            // Применяем параметры боя
            if (config.combat) {
                this.damage = config.combat.damage || this.damage;
                this.cooldown = config.combat.cooldown || this.cooldown;
                this.baseCooldown = config.combat.cooldown || this.baseCooldown;
                this.projectileSpeed = config.combat.projectileSpeed || this.projectileSpeed;
                this.projectileSize = config.combat.projectileSize || this.projectileSize;
            }

            // Применяем физику
            if (config.physics) {
                this.mass = config.physics.mass || this.mass;
                this.hoverHeight = config.physics.hoverHeight || this.hoverHeight;
                this.hoverStiffness = config.physics.hoverStiffness || this.hoverStiffness;
                if (config.physics.hoverDamping !== undefined) this.hoverDamping = config.physics.hoverDamping;
                if (config.physics.linearDamping !== undefined) {
                    // Применяем к physicsBody если он существует
                    if (this.physicsBody) {
                        this.physicsBody.setLinearDamping(config.physics.linearDamping);
                    }
                }
                if (config.physics.angularDamping !== undefined) {
                    if (this.physicsBody) {
                        this.physicsBody.setAngularDamping(config.physics.angularDamping);
                    }
                }
                if (config.physics.uprightForce !== undefined) this.uprightForce = config.physics.uprightForce;
                if (config.physics.stabilityForce !== undefined) this.stabilityForce = config.physics.stabilityForce;
            }

            // Применяем башню
            if (config.turret) {
                this.turretSpeed = config.turret.turretSpeed || this.turretSpeed;
                if (config.turret.baseTurretSpeed !== undefined) this.baseTurretSpeed = config.turret.baseTurretSpeed;
                if (config.turret.turretLerpSpeed !== undefined) this.turretLerpSpeed = config.turret.turretLerpSpeed;
                this.baseBarrelPitchSpeed = config.turret.barrelPitchSpeed || this.baseBarrelPitchSpeed;
            }

            // Применяем attachment point (при следующем rebuild)
            if (config.turretPivot) {
                (this as any).customTurretPivot = new Vector3(
                    config.turretPivot.x || 0,
                    config.turretPivot.y || 0,
                    config.turretPivot.z || 0
                );
            }

            // Применяем цвета (если есть визуальный модуль)
            if (config.visual && this.visualsModule) {
                // Применяем цвета через visualsModule если есть такой метод
                if ((this.visualsModule as any).setColors) {
                    (this.visualsModule as any).setColors(config.visual);
                }
            }

            // Обновляем физику тела если оно существует
            if (this.physicsBody) {
                this.physicsBody.setMassProperties({
                    mass: this.mass,
                    centerOfMass: new Vector3(0, 0, 0)
                });
            }

            logger.log(`[TankController] Custom configuration loaded`);
        } catch (e) {
            logger.error('[TankController] Failed to load custom configuration:', e);
        }
    }
}

