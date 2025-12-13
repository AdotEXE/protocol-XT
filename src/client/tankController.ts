import { 
    Scene, 
    Vector3, 
    Mesh, 
    MeshBuilder, 
    PhysicsBody, 
    PhysicsMotionType, 
    PhysicsShape, 
    PhysicsShapeType,
    Quaternion,
    StandardMaterial,
    Color3,
    ActionManager,
    Ray
} from "@babylonjs/core";
import { HUD } from "./hud";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import type { EnemyManager } from "./enemy";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "./tankTypes";
import { 
    TankHealthModule, 
    TankMovementModule, 
    TankProjectilesModule, 
    TankVisualsModule 
} from "./tank";

export class TankController {
    scene: Scene;
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    physicsBody: PhysicsBody;
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
    
    // Callback для отправки выстрела на сервер (мультиплеер)
    private onShootCallback: ((data: any) => void) | null = null;
    
    // Reference to network players for hit detection
    networkPlayers: Map<string, any> | null = null; // NetworkPlayerTank instances
    
    // Респавн с таймером
    private respawnCountdown = 0; // Секунды до респавна
    private respawnIntervalId: number | null = null;
    
    // Модули
    private healthModule: TankHealthModule;
    private movementModule: TankMovementModule;
    private projectilesModule: TankProjectilesModule;
    private visualsModule: TankVisualsModule;
    
    // Эффекты движения
    private _lastMovementSoundTime: number = 0;
    private _lastSmokeTime: number = 0;
    
    // Special chassis abilities
    chassisAnimationElements: {
        stealthActive?: boolean;
        stealthMesh?: Mesh;
        hoverThrusters?: Mesh[];
        shieldMesh?: Mesh;
        shieldActive?: boolean;
        droneMeshes?: Mesh[];
        commandAura?: Mesh;
        animationTime?: number;
    } = { animationTime: 0 };
    
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
    recoilForce = 2500; // Сила отдачи (уменьшено для предотвращения опрокидывания)
    recoilTorque = 10000; // Сила угловой отдачи (уменьшено для предотвращения опрокидывания)
    private _baseBarrelZ = 0; // Исходная позиция Z пушки
    private _baseBarrelY = 0; // Исходная позиция Y пушки
    private _barrelRecoilY = 0; // Вертикальный откат пушки (подъем при выстреле)
    private _barrelRecoilYTarget = 0; // Целевой вертикальный откат
    
    // Массив активных гильз для анимации
    shellCasings: ShellCasing[] = [];
    
    // Cannon animation elements (for animated cannons)
    private cannonAnimationElements: {
        gatlingBarrels?: Mesh[];
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
    chassisType: ChassisType;
    cannonType: CannonType;
    
    // Config (будут переопределены типом корпуса)
    mass = 2100;
    hoverHeight = 1.0;  // Hover height
    
    // Movement Settings (будут переопределены типом корпуса)
    moveSpeed = 24;         // Slower max speed
    turnSpeed = 2.5;        // Moderate turning
    acceleration = 10000;    // Smooth acceleration (was 20000!)
    turnAccel = 11000;      // Угловое ускорение поворота
    stabilityTorque = 2000; // Стабилизация при повороте на скорости
    yawDamping = 4500;      // Демпфирование рыскания
    sideFriction = 17000;   // Боковое трение
    sideDrag = 8000;        // Боковое сопротивление при остановке
    fwdDrag = 7000;         // Продольное сопротивление при остановке
    angularDrag = 5000;     // Угловое сопротивление при остановке
    
    // Stability
    hoverStiffness = 5000;  // Еще снижено для предотвращения осцилляций и тряски
    hoverDamping = 20000;   // Увеличено для сильного демпфирования и предотвращения осцилляций
    uprightForce = 10000;   // Снижено для уменьшения тряски
    uprightDamp = 7000;     // Увеличено для лучшего демпфирования
    stabilityForce = 2500;  // Увеличено для стабильности
    emergencyForce = 15000; // Снижено для уменьшения тряски
    liftForce = 30000;      // Снижено для уменьшения тряски
    downForce = 1500;       // Снижено для уменьшения тряски

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
    
    // Tracer System (T key)
    tracerCount = 5; // Количество трассеров
    maxTracerCount = 5; // Максимум трассеров
    tracerDamage = 10; // Урон трассера (меньше обычного)
    tracerMarkDuration = 15000; // Время метки на враге (15 секунд)
    private tracerMat: StandardMaterial | null = null; // Материал трассера (яркий)

    // State
    private _tmpVector = new Vector3();
    private _tmpVector2 = new Vector3();
    private _tmpVector3 = new Vector3();
    private lastPhysicsErrorMs = 0;
    private _tmpVector4 = new Vector3();
    private _tmpVector5 = new Vector3(); // For torque scaling to avoid mutations
    private _tmpVector6 = new Vector3(); // For hoverForceVec (to avoid corrupting up)
    private _tmpVector7 = new Vector3(); // For correctiveTorque (to avoid corrupting forward)
    private _tmpVector8 = new Vector3(); // For obstacle raycast
    
    private _resetTimer: number = 0; // Таймер для автоматического сброса при опрокидывания
    private _logFrameCounter = 0; // Счетчик кадров для логирования
    
    // Obstacle climbing cache
    private _obstacleRaycastCache: { hasObstacle: boolean, obstacleHeight: number, frame: number } | null = null;
    private readonly OBSTACLE_RAYCAST_CACHE_FRAMES = 3; // Кэшируем на 3 кадра
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию для производительности
    private _tick = 0;
    
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
    turretSpeed = 0.04; // Базовая скорость вращения башни (рад/кадр)
    baseTurretSpeed = 0.06; // Базовая скорость башни для центрирования
    turretLerpSpeed = 0.15; // Скорость интерполяции башни
    
    // Aiming pitch (vertical angle for aiming) - set from game.ts
    aimPitch = 0;
    
    // Mouse control for turret
    mouseSensitivity = 0.003; // Чувствительность мыши для башни (публичная для game.ts)
    private isPointerLocked = false; // Флаг блокировки указателя
    private lastMouseX = 0; // Последняя позиция мыши X (используется в pointerlockchange handler)
    
    // Shooting (будут переопределены типом пушки)
    lastShotTime = 0;
    cooldown = 1800; // УЛУЧШЕНО: Уменьшено с 2000 до 1800 мс для более быстрой перезарядки
    baseCooldown = 2000; // Базовый cooldown для модулей
    isReloading = false;
    projectileSpeed = 200;
    projectileSize = 0.2;
    
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
    private module7Active = false; // Ускоренная стрельба (кнопка 7)
    private module7Timeout: number | null = null; // Используется в setTimeout callback
    private module7Cooldown = 15000; // Кулдаун модуля 7 (15 секунд)
    private module8Active = false; // Автонаводка + автострельба (кнопка 8)
    private module8Timeout: number | null = null; // Используется в setTimeout callback
    private module8Cooldown = 20000; // Кулдаун модуля 8 (20 секунд)
    private module8LastAutoFire = 0; // Время последнего автострельбы
    private module9Active = false; // Маневрирование (кнопка 9)
    private module9Timeout: number | null = null; // Используется в setTimeout callback
    private module9Cooldown = 12000; // Кулдаун модуля 9 (12 секунд)
    private module9LastUse = 0; // Время последнего использования модуля 9
    private module9ManeuverDirection = 1; // Направление маневрирования (-1 или 1)
    private module9LastManeuverChange = 0; // Время последней смены направления
    private module0Charging = false; // Прыжок с зажатием (кнопка 0)
    private module0ChargeStart = 0; // Время начала зарядки
    private module0ChargePower = 0; // Накопленная сила прыжка (используется в updateModules)
    private module0LastUse = 0; // Время последнего использования модуля 0
    private module0Cooldown = 5000; // Кулдаун модуля 0 (5 секунд)
    private canJump = true; // Прыжок (cooldown)
    private jumpCooldown = 2000; // 2 секунды между прыжками

    // Visuals
    visualWheels: Mesh[] = [];
    leftTrack: Mesh | null = null;
    rightTrack: Mesh | null = null;
    
    // Pre-created materials for optimization
    bulletMat: StandardMaterial;

    private _inputMap: { [key: string]: boolean } = {};
    
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
        console.log("TankController: Init Start");
        this.scene = scene;
        
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
        
        // Загружаем типы корпуса и пушки из localStorage или используем по умолчанию
        const savedChassisId = localStorage.getItem("selectedChassis") || "medium";
        const savedCannonId = localStorage.getItem("selectedCannon") || "standard";
        
        this.chassisType = getChassisById(savedChassisId);
        this.cannonType = getCannonById(savedCannonId);
        
        // Применяем параметры корпуса
        this.mass = this.chassisType.mass;
        this.moveSpeed = this.chassisType.moveSpeed;
        this.turnSpeed = this.chassisType.turnSpeed;
        this.acceleration = this.chassisType.acceleration;
        this.maxHealth = this.chassisType.maxHealth;
        this.currentHealth = this.chassisType.maxHealth;
        
        // Применяем параметры пушки
        this.cooldown = this.cannonType.cooldown;
        this.baseCooldown = this.cannonType.cooldown; // Сохраняем базовый cooldown
        this.damage = this.cannonType.damage;
        this.projectileSpeed = this.cannonType.projectileSpeed;
        this.projectileSize = this.cannonType.projectileSize;
        
        // Применяем улучшения из гаража
        this.applyUpgrades();
        
        // 5. Initialize modules (before visuals to use them)
        this.healthModule = new TankHealthModule(this);
        this.movementModule = new TankMovementModule(this);
        this.projectilesModule = new TankProjectilesModule(this);
        this.visualsModule = new TankVisualsModule(this);
        
        // 1. Visuals - создаём уникальные формы для каждого типа корпуса
        this.chassis = this.visualsModule.createUniqueChassis(scene, position);
        
        // ВАЖНО: Metadata для обнаружения снарядами врагов
        this.chassis.metadata = { type: "playerTank", instance: this };

        this.visualsModule.createVisualWheels();

        // Башня - размер зависит от типа корпуса
        const turretWidth = this.chassisType.width * 0.65;
        const turretHeight = this.chassisType.height * 0.75;
        const turretDepth = this.chassisType.depth * 0.6;
        
        this.turret = MeshBuilder.CreateBox("turret", { 
            width: turretWidth, 
            height: turretHeight, 
            depth: turretDepth 
        }, scene);
        this.turret.position.y = this.chassisType.height / 2 + turretHeight / 2;
        this.turret.parent = this.chassis;
        
        const turretMat = new StandardMaterial("turretMat", scene);
        // Башня немного темнее корпуса
        const turretColor = Color3.FromHexString(this.chassisType.color);
        turretMat.diffuseColor = turretColor.scale(0.8);
        turretMat.specularColor = Color3.Black();
        this.turret.material = turretMat;
        // Render after hull to avoid artifacts
        this.turret.renderingGroupId = 1;
        
        // Пушка - создаём уникальные формы для каждого типа
        const barrelWidth = this.cannonType.barrelWidth;
        const barrelLength = this.cannonType.barrelLength;
        const baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        
        this.barrel = this.visualsModule.createUniqueCannon(scene, barrelWidth, barrelLength);
        this.barrel.position.z = baseBarrelZ;
        this.barrel.position.y = 0;
        this.barrel.parent = this.turret;
        this.barrel.renderingGroupId = 1;
        this.barrel.scaling.set(1.0, 1.0, 1.0);
        
        // Сохраняем исходную позицию пушки для отката
        this._baseBarrelZ = baseBarrelZ;
        this._baseBarrelY = 0;
        
        // Переменные для анимации отката ствола (подъем/опускание)
        this._barrelRecoilY = 0;
        this._barrelRecoilYTarget = 0;
        
        // 2. Physics - используем размеры из типа корпуса
        const shape = new PhysicsShape({ 
            type: PhysicsShapeType.BOX, 
            parameters: { 
                center: new Vector3(0, 0, 0), 
                rotation: Quaternion.Identity(), 
                extents: new Vector3(this.chassisType.width, this.chassisType.height, this.chassisType.depth) 
            } 
        }, scene);
        
        shape.filterMembershipMask = 1;
        shape.filterCollideMask = 2 | 32; // Environment and protective walls
        
        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, scene);
        this.physicsBody.shape = shape;
        this.physicsBody.setMassProperties({ mass: this.mass, centerOfMass: new Vector3(0, -0.55, 0) }); // Lower COM for stability
        this.physicsBody.setLinearDamping(0.6);   // More damping
        this.physicsBody.setAngularDamping(3.5);  // Prevent wild rotations 
        // this.physicsBody.setActivationState(PhysicsMotionType.ALWAYS_ACTIVE); // Removed: Not supported in V2

        // 3. Loop
        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());
        
        // 4. Inputs
        this.setupInput();
        
        // 5. Initialize modules
        this.healthModule = new TankHealthModule(this);
        this.movementModule = new TankMovementModule(this);
        
        console.log("TankController: Init Success");
    }

    setHUD(hud: HUD) {
        this.hud = hud;
        this.hud.setHealth(this.currentHealth, this.maxHealth);
        this.hud.reloadTime = this.cooldown;
    }

    setSoundManager(soundManager: SoundManager) {
        this.soundManager = soundManager;
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

    // Запуск обратного отсчёта респавна
    startRespawnCountdown() {
        // Очищаем предыдущий таймер если есть
        if (this.respawnIntervalId !== null) {
            clearInterval(this.respawnIntervalId);
        }
        
        // Без сообщения о смерти - тихий респавн
        
        // Обратный отсчёт каждую секунду
        this.respawnIntervalId = window.setInterval(() => {
            this.respawnCountdown--;
            
            if (this.respawnCountdown <= 0) {
                // Останавливаем таймер
                if (this.respawnIntervalId !== null) {
                    clearInterval(this.respawnIntervalId);
                    this.respawnIntervalId = null;
                }
                
                // Респавн!
                console.log("[TANK] Respawn timer complete!");
                if (!this.isAlive) {
                    this.respawn();
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
        return this.healthModule.heal(amount);
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
        return this.healthModule.die();
    }

    // Применить улучшения из гаража и бонусы от уровня опыта
    applyUpgrades(): void {
        try {
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
                console.log(`[Tank] Experience bonuses applied: Chassis Lv.${chassisLevel}, Cannon Lv.${cannonLevel}`);
            }
            
            // Обновляем текущее здоровье
            this.currentHealth = this.maxHealth;
            
            console.log(`[Tank] Final stats: HP=${this.maxHealth}, Speed=${this.moveSpeed.toFixed(1)}, Damage=${this.damage}, Reload=${this.cooldown}ms, ProjSpeed=${this.projectileSpeed}`);
        } catch (e) {
            console.warn("[Tank] Failed to apply upgrades:", e);
        }
    }

    respawn() {
        console.log("[TANK] Respawning...");
        
        // Перезагружаем конфигурацию корпуса и пушки (на случай если игрок выбрал новые)
        // Применяем улучшения заново
        this.applyUpgrades();
        
        // ВОССТАНАВЛИВАЕМ здоровье и состояние
        this.currentHealth = this.maxHealth;
        this.currentFuel = this.maxFuel;
        this.isFuelEmpty = false;
        this.isAlive = true;
        this.isReloading = false;
        this.lastShotTime = 0;
        
        // Сбрасываем все инпуты
        this.throttleTarget = 0;
        this.steerTarget = 0;
        this.smoothThrottle = 0;
        this.smoothSteer = 0;
        this.turretTurnTarget = 0;
        this.turretTurnSmooth = 0;
        this.turretAcceleration = 0;
        this.turretAccelStartTime = 0;
        
        // Сбрасываем режим прицеливания
        if (this.isAiming) {
            this.toggleAimMode(false);
        }
        
        // Сбрасываем позицию и физику
        // КРИТИЧЕСКИ ВАЖНО: Респавн ВСЕГДА в гараже!
        // Используем callback для получения позиции гаража
        let respawnPos: Vector3;
        
        if (this.respawnPositionCallback) {
            const garagePos = this.respawnPositionCallback();
            if (garagePos) {
                // Используем позицию гаража
                respawnPos = garagePos.clone();
                console.log(`[TANK] === RESPAWN TO GARAGE: (${respawnPos.x.toFixed(1)}, ${respawnPos.y.toFixed(1)}, ${respawnPos.z.toFixed(1)}) ===`);
            } else {
                // Fallback на центр гаража по умолчанию
                respawnPos = new Vector3(0, 1.2, 0);
                console.log(`[TANK] === RESPAWN TO DEFAULT GARAGE: (0, 1.2, 0) ===`);
            }
        } else {
            // Если callback не установлен, используем центр гаража по умолчанию
            respawnPos = new Vector3(0, 1.2, 0);
            console.log(`[TANK] === RESPAWN TO DEFAULT GARAGE (no callback): (0, 1.2, 0) ===`);
        }
        
        // Сообщение в чат о респавне (БЕЗ визуальных эффектов - пункт 16!)
        if (this.chatSystem) {
            this.chatSystem.success("Респавн в гараже", 1);
        }
        
        // БЕЗ звука респавна - моментальный телепорт
        // БЕЗ визуальных эффектов - моментальный телепорт (пункт 16)
        
        // ТЕЛЕПОРТИРУЕМ ТАНК В ГАРАЖ - ЖЁСТКО И ПРИНУДИТЕЛЬНО!
        if (this.chassis && this.physicsBody) {
            const targetX = respawnPos.x;
            const targetY = respawnPos.y;
            const targetZ = respawnPos.z;
            
            console.log(`[TANK] Teleporting to garage: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Z=${targetZ.toFixed(2)}`);
            
            // 1. ОТКЛЮЧАЕМ физику временно
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
            
            // 2. Сбрасываем ВСЕ скорости СРАЗУ
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // 3. Устанавливаем позицию
            this.chassis.position.set(targetX, targetY, targetZ);
            
            // 4. Сбрасываем вращение
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.rotation.set(0, 0, 0);
            this.turret.rotation.set(0, 0, 0);
            this.barrel.rotation.set(0, 0, 0);
            
            // 5. Обновляем матрицы ПРИНУДИТЕЛЬНО
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);
            
            // 6. Синхронизируем физическое тело с визуальным
            this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
            
            // 7. Активируем защиту от урона ПОСЛЕ установки позиции (чтобы эффект появился в правильном месте)
            this.activateInvulnerability();
            
            // 8. Включаем физику обратно через задержку (ОДИН раз, чтобы избежать конфликтов)
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    // Убеждаемся, что позиция правильная
                    this.chassis.position.set(targetX, targetY, targetZ);
                    this.chassis.rotationQuaternion = Quaternion.Identity();
                    this.chassis.computeWorldMatrix(true);
                    
                    // Синхронизируем физическое тело
                    this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
                    
                    // Сбрасываем скорости ПЕРЕД включением физики
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                    
                    // Включаем физику
                    this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                    
                    // Ещё раз сбрасываем скорости после включения (на всякий случай)
                    setTimeout(() => {
                        if (this.physicsBody) {
                            this.physicsBody.setLinearVelocity(Vector3.Zero());
                            this.physicsBody.setAngularVelocity(Vector3.Zero());
                        }
                    }, 10);
                    
                    console.log(`[TANK] Physics re-enabled at garage position`);
                }
            }, 100);
        } else {
            console.error("[TANK] Cannot respawn - chassis or physics body missing!");
        }
        
        // Обновляем HUD
        if (this.hud) {
            this.hud.setHealth(this.currentHealth, this.maxHealth);
            // Без сообщения о респавне - просто телепорт
        }
        
        console.log("[TANK] Respawned!");
    }

    // ============ UNIQUE CHASSIS CREATION ============
    private createUniqueChassis(scene: Scene, position: Vector3): Mesh {
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;
        const color = Color3.FromHexString(this.chassisType.color);
        
        // Base chassis mesh - более выразительные пропорции
        let chassis: Mesh;
        
        switch (this.chassisType.id) {
            case "light":
                // Light - Прототип: БТ-7 / Т-70 - Узкий, низкий, обтекаемый
                // Основной корпус - узкий и длинный с наклонной лобовой броней
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 0.75, 
                    height: h * 0.7, 
                    depth: d * 1.2 
                }, scene);
                break;
                
            case "scout":
                // Scout - Прототип: Т-70 / БТ-7 - Очень маленький, клиновидный
                // Основной корпус - очень маленький с острым носом
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 0.7, 
                    height: h * 0.65, 
                    depth: d * 0.85 
                }, scene);
                break;
                
            case "heavy":
                // Heavy - Прототип: ИС-2 / ИС-7 - Огромный, массивный, квадратный
                // Основной корпус - огромный и квадратный
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.08, 
                    height: h * 1.2, 
                    depth: d * 1.08 
                }, scene);
                break;
                
            case "assault":
                // Assault - ШИРОКИЙ, АГРЕССИВНЫЙ, УГЛОВАТЫЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - широкий и угловатый
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.12, 
                    height: h * 1.1, 
                    depth: d * 1.05 
                }, scene);
                break;
                
            case "stealth":
                // Stealth - ОЧЕНЬ НИЗКИЙ, ПЛОСКИЙ, УГЛОВАТЫЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - очень низкий и плоский
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.05, 
                    height: h * 0.7, 
                    depth: d * 1.15 
                }, scene);
                break;
                
            case "hover":
                // Hover - Прототип: Концепт на воздушной подушке - Округлый, обтекаемый
                // Основной корпус - округлый цилиндр (low-poly)
                chassis = MeshBuilder.CreateCylinder("tankHull", { 
                    diameter: Math.max(w, d) * 1.1,
                    height: h * 0.95, 
                    tessellation: 8  // Low-poly
                }, scene);
                chassis.rotation.z = Math.PI / 2;
                break;
                
            case "siege":
                // Siege - ОГРОМНЫЙ, МАССИВНЫЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - огромный и квадратный
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.25, 
                    height: h * 1.35, 
                    depth: d * 1.2 
                }, scene);
                break;
                
            case "racer":
                // Racer - ЭКСТРЕМАЛЬНО НИЗКИЙ, ДЛИННЫЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - очень низкий и длинный
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 0.75, 
                    height: h * 0.55, 
                    depth: d * 1.3 
                }, scene);
                break;
                
            case "amphibious":
                // Amphibious - ШИРОКИЙ, С ПОПЛАВКАМИ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - широкий и округлый
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.15, 
                    height: h * 1.1, 
                    depth: d * 1.1 
                }, scene);
                break;
                
            case "shield":
                // Shield - Прототип: Т-72 + генератор щита - Широкий, с генератором
                // Основной корпус - широкий и округлый (октаэдр, low-poly)
                chassis = MeshBuilder.CreateCylinder("tankHull", { 
                    diameter: Math.max(w, d) * 1.2,
                    height: h * 1.1,
                    tessellation: 8  // Low-poly
                }, scene);
                chassis.rotation.z = Math.PI / 2;
                break;
                
            case "drone":
                // Drone - СРЕДНИЙ, С ПЛАТФОРМАМИ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - средний с платформами
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.1, 
                    height: h * 1.12, 
                    depth: d * 1.05 
                }, scene);
                break;
                
            case "artillery":
                // Artillery - ШИРОКИЙ, ВЫСОКИЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - широкий и высокий
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.2, 
                    height: h * 1.25, 
                    depth: d * 1.15 
                }, scene);
                break;
                
            case "destroyer":
                // Destroyer - ОЧЕНЬ ДЛИННЫЙ, НИЗКИЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - очень длинный и низкий
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 0.85, 
                    height: h * 0.75, 
                    depth: d * 1.4 
                }, scene);
                break;
                
            case "command":
                // Command - ВЫСОКИЙ, С АНТЕННАМИ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - высокий с антеннами
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.1, 
                    height: h * 1.2, 
                    depth: d * 1.1 
                }, scene);
                break;
                
            default: // medium
                // Medium - СБАЛАНСИРОВАННЫЙ, КЛАССИЧЕСКИЙ - УНИКАЛЬНАЯ ФОРМА
                // Основной корпус - сбалансированный
                chassis = MeshBuilder.CreateBox("tankHull", { 
                    width: w * 1.0, 
                    height: h * 1.0, 
                    depth: d * 1.0 
                }, scene);
        }
        
        chassis.position.copyFrom(position);
        
        // Base material - улучшенный low-poly стиль
        const mat = new StandardMaterial("tankMat", scene);
        mat.diffuseColor = color;
        mat.specularColor = Color3.Black();
        mat.disableLighting = false;
        mat.freeze();
        chassis.material = mat;
        
        // Add visual details based on type
        this.addChassisDetails(chassis, scene, color);
        
        return chassis;
    }
    
    private addChassisDetails(chassis: Mesh, scene: Scene, baseColor: Color3): void {
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;
        
        // Armor plates material (darker) - улучшенный low-poly
        const armorMat = new StandardMaterial("armorMat", scene);
        armorMat.diffuseColor = baseColor.scale(0.65);
        armorMat.specularColor = Color3.Black();
        armorMat.freeze();
        
        // Light material (brighter accents)
        const accentMat = new StandardMaterial("accentMat", scene);
        accentMat.diffuseColor = baseColor.scale(1.2);
        accentMat.specularColor = Color3.Black();
        accentMat.freeze();
        
        switch (this.chassisType.id) {
            case "light":
                // Light - Прототип: БТ-7 - Наклонная лобовая броня, воздухозаборники, спойлер
                // Наклонная лобовая плита (угол 60°)
                const lightFront = MeshBuilder.CreateBox("lightFront", {
                    width: w * 0.88,
                    height: h * 0.6,
                    depth: 0.2
                }, scene);
                lightFront.position = new Vector3(0, h * 0.15, d * 0.52);
                lightFront.rotation.x = -Math.PI / 6;  // Наклон 30°
                lightFront.parent = chassis;
                lightFront.material = armorMat;
                
                // Воздухозаборники (угловатые)
                for (let i = 0; i < 2; i++) {
                    const intake = MeshBuilder.CreateBox(`intake${i}`, {
                        width: 0.3,
                        height: h * 0.65,
                        depth: 0.35
                    }, scene);
                    intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45);
                    intake.parent = chassis;
                    intake.material = accentMat;
                }
                
                // Задний спойлер (угловатый)
                const lightSpoiler = MeshBuilder.CreateBox("lightSpoiler", {
                    width: w * 1.2,
                    height: 0.2,
                    depth: 0.25
                }, scene);
                lightSpoiler.position = new Vector3(0, h * 0.5, -d * 0.48);
                lightSpoiler.parent = chassis;
                lightSpoiler.material = accentMat;
                
                // Боковые обтекатели (угловатые)
                for (let i = 0; i < 2; i++) {
                    const fairing = MeshBuilder.CreateBox(`lightFairing${i}`, {
                    width: 0.15,
                        height: h * 0.75,
                        depth: d * 0.55
                }, scene);
                    fairing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2);
                    fairing.parent = chassis;
                    fairing.material = accentMat;
                }
                
                // Люки на крыше (2 штуки)
                for (let i = 0; i < 2; i++) {
                    const hatch = MeshBuilder.CreateBox(`lightHatch${i}`, {
                        width: 0.2,
                        height: 0.08,
                        depth: 0.2
                    }, scene);
                    hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1);
                    hatch.parent = chassis;
                    hatch.material = armorMat;
                }
                
                // Выхлопная труба сзади
                const exhaust = MeshBuilder.CreateBox("lightExhaust", {
                    width: 0.15,
                    height: 0.15,
                    depth: 0.2
                }, scene);
                exhaust.position = new Vector3(w * 0.35, h * 0.2, -d * 0.48);
                exhaust.parent = chassis;
                exhaust.material = armorMat;
                
                // Фары спереди (маленькие, угловатые)
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`lightHeadlight${i}`, {
                        width: 0.08,
                        height: 0.08,
                        depth: 0.06
                    }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`lightHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                    headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                    headlight.material = headlightMat;
                }
                
                // Инструменты: лопата и топор на корме
                const shovel = MeshBuilder.CreateBox("lightShovel", {
                    width: 0.12,
                    height: 0.3,
                    depth: 0.02
                }, scene);
                shovel.position = new Vector3(-w * 0.4, h * 0.2, -d * 0.48);
                shovel.parent = chassis;
                shovel.material = armorMat;
                
                const axe = MeshBuilder.CreateBox("lightAxe", {
                    width: 0.25,
                    height: 0.08,
                    depth: 0.02
                }, scene);
                axe.position = new Vector3(-w * 0.3, h * 0.25, -d * 0.48);
                axe.parent = chassis;
                axe.material = armorMat;
                
                // Вентиляционные решетки по бокам (улучшенные)
                for (let i = 0; i < 2; i++) {
                    const vent = MeshBuilder.CreateBox(`lightVent${i}`, {
                        width: 0.05,
                        height: 0.12,
                        depth: 0.15
                    }, scene);
                    vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`lightVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                    vent.material = ventMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 3; j++) {
                        const ventDetail = MeshBuilder.CreateBox(`lightVentDetail${i}_${j}`, {
                            width: 0.03,
                            height: 0.1,
                            depth: 0.02
                        }, scene);
                        ventDetail.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1 + (j - 1) * 0.05);
                        ventDetail.parent = chassis;
                        ventDetail.material = ventMat;
                    }
                }
                
                // Перископ на люке
                const periscope = MeshBuilder.CreateCylinder("lightPeriscope", {
                    height: 0.15,
                    diameter: 0.06,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3(0, h * 0.55, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial("lightPeriscopeMat", scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
                
                // Дополнительная оптика - бинокль на корпусе
                const binocular = MeshBuilder.CreateBox("lightBinocular", {
                    width: 0.2,
                    height: 0.08,
                    depth: 0.12
                }, scene);
                binocular.position = new Vector3(0, h * 0.48, d * 0.4);
                binocular.parent = chassis;
                const binocularMat = new StandardMaterial("lightBinocularMat", scene);
                binocularMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                binocular.material = binocularMat;
                
                // Линзы бинокля
                for (let i = 0; i < 2; i++) {
                    const lens = MeshBuilder.CreateCylinder(`lightLens${i}`, {
                        height: 0.02,
                        diameter: 0.06,
                        tessellation: 8
                    }, scene);
                    lens.position = new Vector3((i === 0 ? -1 : 1) * 0.06, 0, 0.06);
                    lens.parent = binocular;
                    const lensMat = new StandardMaterial(`lightLensMat${i}`, scene);
                    lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                    lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                    lens.material = lensMat;
                }
                
                // Дополнительные броневые накладки на лобовой части
                for (let i = 0; i < 3; i++) {
                    const armorPlate = MeshBuilder.CreateBox(`lightArmorPlate${i}`, {
                        width: w * 0.25,
                        height: h * 0.15,
                        depth: 0.08
                    }, scene);
                    armorPlate.position = new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48);
                    armorPlate.parent = chassis;
                    armorPlate.material = armorMat;
                }
                
                // Верхние вентиляционные решетки на крыше (улучшенные)
                for (let i = 0; i < 3; i++) {
                    const roofVent = MeshBuilder.CreateBox(`lightRoofVent${i}`, {
                        width: 0.2,
                        height: 0.05,
                        depth: 0.15
                    }, scene);
                    roofVent.position = new Vector3((i - 1) * w * 0.3, h * 0.47, d * 0.2);
                    roofVent.parent = chassis;
                    const roofVentMat = new StandardMaterial(`lightRoofVentMat${i}`, scene);
                    roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                    roofVent.material = roofVentMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 5; j++) {
                        const ventBar = MeshBuilder.CreateBox(`lightRoofVentBar${i}_${j}`, {
                            width: 0.02,
                            height: 0.04,
                            depth: 0.13
                        }, scene);
                        ventBar.position = new Vector3((i - 1) * w * 0.3 + (j - 2) * 0.04, h * 0.47, d * 0.2);
                        ventBar.parent = chassis;
                        ventBar.material = roofVentMat;
                    }
                }
                
                // Радиоантенна сзади
                const antenna = MeshBuilder.CreateCylinder("lightAntenna", {
                    height: 0.4,
                    diameter: 0.02,
                    tessellation: 8
                }, scene);
                antenna.position = new Vector3(0, h * 0.6, -d * 0.4);
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial("lightAntennaMat", scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
                
                // Основание антенны
                const antennaBase = MeshBuilder.CreateBox("lightAntennaBase", {
                    width: 0.08,
                    height: 0.08,
                    depth: 0.08
                }, scene);
                antennaBase.position = new Vector3(0, h * 0.52, -d * 0.4);
                antennaBase.parent = chassis;
                antennaBase.material = armorMat;
                
                // Боковые броневые экраны
                for (let i = 0; i < 2; i++) {
                    const sideArmor = MeshBuilder.CreateBox(`lightSideArmor${i}`, {
                        width: 0.12,
                        height: h * 0.5,
                        depth: d * 0.3
                    }, scene);
                    sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, d * 0.05);
                    sideArmor.parent = chassis;
                    sideArmor.material = armorMat;
                }
                
                // Дополнительные фары на боковых панелях
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`lightSideLight${i}`, {
                        width: 0.06,
                        height: 0.06,
                        depth: 0.04
                    }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`lightSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.8, 0.7, 0.4);
                    sideLightMat.emissiveColor = new Color3(0.2, 0.15, 0.1);
                    sideLight.material = sideLightMat;
                }
                
                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`lightTailLight${i}`, {
                        width: 0.05,
                        height: 0.08,
                        depth: 0.03
                    }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`lightTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }
                break;
                
            case "scout":
                // Scout - Прототип: Т-70 - Острый клиновидный нос, минимальный профиль
                // Острый клиновидный нос (угол 45°)
                const scoutNose = MeshBuilder.CreateBox("scoutNose", {
                    width: w * 0.8,
                    height: h * 0.7,
                    depth: 0.4
                }, scene);
                scoutNose.position = new Vector3(0, 0, d * 0.5);
                scoutNose.rotation.x = -Math.PI / 4;  // Наклон 45°
                scoutNose.parent = chassis;
                scoutNose.material = accentMat;
                
                // Боковые крылья (угловатые)
                for (let i = 0; i < 2; i++) {
                    const wing = MeshBuilder.CreateBox(`scoutWing${i}`, {
                        width: 0.15,
                        height: h * 0.85,
                    depth: d * 0.6
                }, scene);
                    wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3);
                    wing.parent = chassis;
                    wing.material = accentMat;
                }
                
                // Задний диффузор (угловатый)
                const diffuser = MeshBuilder.CreateBox("scoutDiffuser", {
                    width: w * 0.9,
                    height: 0.15,
                    depth: 0.2
                }, scene);
                diffuser.position = new Vector3(0, -h * 0.42, -d * 0.45);
                diffuser.parent = chassis;
                diffuser.material = accentMat;
                
                // Один люк на крыше
                const scoutHatch = MeshBuilder.CreateBox("scoutHatch", {
                    width: 0.18,
                    height: 0.06,
                    depth: 0.18
                }, scene);
                scoutHatch.position = new Vector3(0, h * 0.42, 0);
                scoutHatch.parent = chassis;
                scoutHatch.material = armorMat;
                
                // Радиоантенна на корме (угловатая)
                const scoutAntenna = MeshBuilder.CreateBox("scoutAntenna", {
                    width: 0.02,
                    height: 0.3,
                    depth: 0.02
                }, scene);
                scoutAntenna.position = new Vector3(0, h * 0.45, -d * 0.45);
                scoutAntenna.parent = chassis;
                scoutAntenna.material = armorMat;
                
                // Две фары (очень маленькие, скрытые)
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`scoutHeadlight${i}`, {
                        width: 0.06,
                        height: 0.06,
                        depth: 0.04
                    }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`scoutHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.8, 0.8, 0.6);
                    headlightMat.emissiveColor = new Color3(0.2, 0.2, 0.15);
                    headlight.material = headlightMat;
                }
                
                // Скрытые вентиляционные решетки
                for (let i = 0; i < 2; i++) {
                    const vent = MeshBuilder.CreateBox(`scoutVent${i}`, {
                        width: 0.04,
                        height: 0.08,
                        depth: 0.12
                    }, scene);
                    vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`scoutVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                    vent.material = ventMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 3; j++) {
                        const ventBar = MeshBuilder.CreateBox(`scoutVentBar${i}_${j}`, {
                            width: 0.02,
                            height: 0.06,
                            depth: 0.1
                        }, scene);
                        ventBar.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15 + (j - 1) * 0.04);
                        ventBar.parent = chassis;
                        ventBar.material = ventMat;
                    }
                }
                
                // Перископ на люке
                const scoutPeriscope = MeshBuilder.CreateCylinder("scoutPeriscope", {
                    height: 0.12,
                    diameter: 0.05,
                    tessellation: 8
                }, scene);
                scoutPeriscope.position = new Vector3(0, h * 0.5, 0);
                scoutPeriscope.parent = chassis;
                const scoutPeriscopeMat = new StandardMaterial("scoutPeriscopeMat", scene);
                scoutPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                scoutPeriscope.material = scoutPeriscopeMat;
                
                // Оптический прицел на передней части
                const scoutSight = MeshBuilder.CreateBox("scoutSight", {
                    width: 0.1,
                    height: 0.06,
                    depth: 0.08
                }, scene);
                scoutSight.position = new Vector3(0, h * 0.2, d * 0.48);
                scoutSight.parent = chassis;
                const scoutSightMat = new StandardMaterial("scoutSightMat", scene);
                scoutSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                scoutSight.material = scoutSightMat;
                
                // Линза прицела
                const scoutSightLens = MeshBuilder.CreateCylinder("scoutSightLens", {
                    height: 0.02,
                    diameter: 0.05,
                    tessellation: 8
                }, scene);
                scoutSightLens.position = new Vector3(0, 0, 0.05);
                scoutSightLens.parent = scoutSight;
                const scoutLensMat = new StandardMaterial("scoutSightLensMat", scene);
                scoutLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                scoutLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                scoutSightLens.material = scoutLensMat;
                
                // Легкие броневые накладки на лобовой части
                for (let i = 0; i < 2; i++) {
                    const frontArmor = MeshBuilder.CreateBox(`scoutFrontArmor${i}`, {
                        width: w * 0.25,
                        height: h * 0.12,
                        depth: 0.06
                    }, scene);
                    frontArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.2, h * 0.02, d * 0.48);
                    frontArmor.parent = chassis;
                    frontArmor.material = armorMat;
                }
                
                // Выхлопная труба сзади (маленькая)
                const scoutExhaust = MeshBuilder.CreateBox("scoutExhaust", {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.15
                }, scene);
                scoutExhaust.position = new Vector3(w * 0.3, h * 0.15, -d * 0.48);
                scoutExhaust.parent = chassis;
                scoutExhaust.material = armorMat;
                
                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`scoutTailLight${i}`, {
                        width: 0.04,
                        height: 0.06,
                        depth: 0.03
                    }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.12, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`scoutTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }
                
                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`scoutSideLight${i}`, {
                        width: 0.04,
                        height: 0.05,
                        depth: 0.04
                    }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.05, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`scoutSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }
                
                // Верхняя вентиляционная решетка на крыше
                const scoutRoofVent = MeshBuilder.CreateBox("scoutRoofVent", {
                    width: 0.15,
                    height: 0.04,
                    depth: 0.1
                }, scene);
                scoutRoofVent.position = new Vector3(0, h * 0.44, d * 0.2);
                scoutRoofVent.parent = chassis;
                const scoutRoofVentMat = new StandardMaterial("scoutRoofVentMat", scene);
                scoutRoofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                scoutRoofVent.material = scoutRoofVentMat;
                
                // Детали решетки
                for (let i = 0; i < 4; i++) {
                    const ventBar = MeshBuilder.CreateBox(`scoutRoofVentBar${i}`, {
                        width: 0.02,
                        height: 0.03,
                        depth: 0.08
                    }, scene);
                    ventBar.position = new Vector3((i - 1.5) * 0.04, h * 0.44, d * 0.2);
                    ventBar.parent = chassis;
                    ventBar.material = scoutRoofVentMat;
                }
                
                // Легкие броневые экраны по бокам
                for (let i = 0; i < 2; i++) {
                    const sideArmor = MeshBuilder.CreateBox(`scoutSideArmor${i}`, {
                        width: 0.1,
                        height: h * 0.4,
                        depth: d * 0.25
                    }, scene);
                    sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.08, d * 0.08);
                    sideArmor.parent = chassis;
                    sideArmor.material = armorMat;
                }
                break;
            case "heavy":
                // Heavy - Прототип: ИС-2 / ИС-7 - Массивный тяжелый танк с мощной броней
                // Массивные бронеплиты со всех сторон
                const heavyPlates = [
                    { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.35, h * 0.95, d * 0.8) },
                    { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.35, h * 0.95, d * 0.8) },
                    { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.4, 0.25) },
                    { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 1.05, 0.3, d * 1.05) }
                ];
                heavyPlates.forEach((plate, i) => {
                    const plateMesh = MeshBuilder.CreateBox(`heavyPlate${i}`, {
                        width: plate.size.x,
                        height: plate.size.y,
                        depth: plate.size.z
                }, scene);
                    plateMesh.position = plate.pos;
                    plateMesh.parent = chassis;
                    plateMesh.material = armorMat;
                });
                // Верхняя бронеплита - ОЧЕНЬ БОЛЬШАЯ
                const topPlate = MeshBuilder.CreateBox("heavyTop", {
                    width: w * 0.95,
                    height: 0.25,
                    depth: d * 0.85
                }, scene);
                topPlate.position = new Vector3(0, h * 0.65, 0);
                topPlate.parent = chassis;
                topPlate.material = armorMat;
                // Угловые усиления - БОЛЬШЕ
                for (let i = 0; i < 4; i++) {
                    const corner = MeshBuilder.CreateBox(`heavyCorner${i}`, {
                        width: 0.3,
                        height: 0.3,
                        depth: 0.3
                    }, scene);
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.58;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.58;
                    corner.position = new Vector3(posX, h * 0.55, posZ);
                    corner.parent = chassis;
                    corner.material = armorMat;
                }
                
                // Две фары спереди
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`heavyHeadlight${i}`, {
                        width: 0.12,
                        height: 0.12,
                    depth: 0.1
                }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.5);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`heavyHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                    headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                    headlight.material = headlightMat;
                }
                
                // Две выхлопные трубы
                for (let i = 0; i < 2; i++) {
                    const exhaust = MeshBuilder.CreateBox(`heavyExhaust${i}`, {
                        width: 0.14,
                        height: 0.14,
                        depth: 0.2
                    }, scene);
                    exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, -d * 0.48);
                    exhaust.parent = chassis;
                    exhaust.material = armorMat;
                }
                
                // Инструменты: лопата, топор, канистра
                const heavyShovel = MeshBuilder.CreateBox("heavyShovel", {
                    width: 0.15,
                    height: 0.4,
                    depth: 0.02
                }, scene);
                heavyShovel.position = new Vector3(-w * 0.45, h * 0.2, -d * 0.45);
                heavyShovel.parent = chassis;
                heavyShovel.material = armorMat;
                
                const heavyAxe = MeshBuilder.CreateBox("heavyAxe", {
                    width: 0.3,
                    height: 0.1,
                    depth: 0.02
                }, scene);
                heavyAxe.position = new Vector3(-w * 0.35, h * 0.25, -d * 0.45);
                heavyAxe.parent = chassis;
                heavyAxe.material = armorMat;
                
                const heavyCanister = MeshBuilder.CreateBox("heavyCanister", {
                    width: 0.14,
                    height: 0.25,
                    depth: 0.14
                }, scene);
                heavyCanister.position = new Vector3(w * 0.45, h * 0.22, -d * 0.4);
                heavyCanister.parent = chassis;
                heavyCanister.material = armorMat;
                
                // Вентиляционные решетки (большие)
                for (let i = 0; i < 4; i++) {
                    const vent = MeshBuilder.CreateBox(`heavyVent${i}`, {
                        width: 0.1,
                        height: 0.06,
                        depth: 0.12
                    }, scene);
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                    vent.position = new Vector3(posX, h * 0.5, posZ);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`heavyVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                    vent.material = ventMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 5; j++) {
                        const ventDetail = MeshBuilder.CreateBox(`heavyVentDetail${i}_${j}`, {
                            width: 0.08,
                            height: 0.04,
                            depth: 0.02
                        }, scene);
                        ventDetail.position = new Vector3(posX, h * 0.5, posZ + (j - 2) * 0.025);
                        ventDetail.parent = chassis;
                        ventDetail.material = ventMat;
                    }
                }
                
                // Перископы на люках (три штуки)
                for (let i = 0; i < 3; i++) {
                    const periscope = MeshBuilder.CreateCylinder(`heavyPeriscope${i}`, {
                        height: 0.2,
                        diameter: 0.08,
                        tessellation: 8
                    }, scene);
                    periscope.position = new Vector3((i - 1) * w * 0.3, h * 0.75, -d * 0.1);
                    periscope.parent = chassis;
                    const periscopeMat = new StandardMaterial(`heavyPeriscopeMat${i}`, scene);
                    periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                    periscope.material = periscopeMat;
                }
                
                // Энергетические усилители брони (футуристические элементы)
                for (let i = 0; i < 2; i++) {
                    const energyBooster = MeshBuilder.CreateBox(`heavyEnergyBooster${i}`, {
                        width: 0.12,
                        height: 0.12,
                        depth: 0.12
                    }, scene);
                    energyBooster.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, h * 0.3, d * 0.4);
                    energyBooster.parent = chassis;
                    const boosterMat = new StandardMaterial(`heavyBoosterMat${i}`, scene);
                    boosterMat.diffuseColor = new Color3(0.2, 0.4, 0.8);
                    boosterMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
                    energyBooster.material = boosterMat;
                    this.chassisAnimationElements.energyBoosters = this.chassisAnimationElements.energyBoosters || [];
                    this.chassisAnimationElements.energyBoosters.push(energyBooster);
                }
                break;
                
            case "assault":
                // Assault - агрессивные угловые бронеплиты, шипы
                const assaultPlates = [
                    { pos: new Vector3(0, h * 0.25, d * 0.52), size: new Vector3(w * 0.8, h * 0.35, 0.15) },
                    { pos: new Vector3(-w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) },
                    { pos: new Vector3(w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) }
                ];
                assaultPlates.forEach((plate, i) => {
                    const plateMesh = MeshBuilder.CreateBox(`assaultPlate${i}`, {
                        width: plate.size.x,
                        height: plate.size.y,
                        depth: plate.size.z
                }, scene);
                    plateMesh.position = plate.pos;
                    plateMesh.parent = chassis;
                    plateMesh.material = armorMat;
                });
                // Шипы спереди
                for (let i = 0; i < 3; i++) {
                    const spike = MeshBuilder.CreateBox(`spike${i}`, {
                        width: 0.08,
                        height: 0.15,
                        depth: 0.12
                    }, scene);
                    spike.position = new Vector3((i - 1) * w * 0.25, h * 0.3, d * 0.52);
                    spike.parent = chassis;
                    spike.material = accentMat;
                }
                
                // Фары с защитой
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`assaultHeadlight${i}`, {
                        width: 0.1,
                        height: 0.1,
                        depth: 0.08
                }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.48);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`assaultHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                    headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                    headlight.material = headlightMat;
                    
                    // Защита фары
                    const headlightGuard = MeshBuilder.CreateBox(`assaultHeadlightGuard${i}`, {
                        width: 0.14,
                        height: 0.14,
                        depth: 0.06
                    }, scene);
                    headlightGuard.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.46);
                    headlightGuard.parent = chassis;
                    headlightGuard.material = armorMat;
                }
                
                // Выхлоп
                const assaultExhaust = MeshBuilder.CreateBox("assaultExhaust", {
                    width: 0.13,
                    height: 0.13,
                    depth: 0.18
                }, scene);
                assaultExhaust.position = new Vector3(w * 0.38, h * 0.18, -d * 0.45);
                assaultExhaust.parent = chassis;
                assaultExhaust.material = armorMat;
                
                // Инструменты
                const assaultShovel = MeshBuilder.CreateBox("assaultShovel", {
                    width: 0.13,
                    height: 0.32,
                    depth: 0.02
                }, scene);
                assaultShovel.position = new Vector3(-w * 0.4, h * 0.18, -d * 0.45);
                assaultShovel.parent = chassis;
                assaultShovel.material = armorMat;
                
                // Дополнительные инструменты
                const assaultCanister = MeshBuilder.CreateBox("assaultCanister", {
                    width: 0.11,
                    height: 0.18,
                    depth: 0.11
                }, scene);
                assaultCanister.position = new Vector3(w * 0.38, h * 0.2, -d * 0.4);
                assaultCanister.parent = chassis;
                assaultCanister.material = armorMat;
                
                // Вентиляционные решетки (улучшенные)
                for (let i = 0; i < 2; i++) {
                    const vent = MeshBuilder.CreateBox(`assaultVent${i}`, {
                        width: 0.08,
                        height: 0.05,
                        depth: 0.1
                    }, scene);
                    vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`assaultVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                    vent.material = ventMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 4; j++) {
                        const ventDetail = MeshBuilder.CreateBox(`assaultVentDetail${i}_${j}`, {
                            width: 0.06,
                            height: 0.03,
                            depth: 0.02
                        }, scene);
                        ventDetail.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25 + (j - 1.5) * 0.03);
                        ventDetail.parent = chassis;
                        ventDetail.material = ventMat;
                    }
                }
                
                // Перископы (улучшенные)
                for (let i = 0; i < 2; i++) {
                    const periscope = MeshBuilder.CreateCylinder(`assaultPeriscope${i}`, {
                        height: 0.16,
                        diameter: 0.07,
                        tessellation: 8
                    }, scene);
                    periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
                    periscope.parent = chassis;
                    const periscopeMat = new StandardMaterial(`assaultPeriscopeMat${i}`, scene);
                    periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                    periscope.material = periscopeMat;
                }
                
                // Агрессивные боковые шипы (дополнительные)
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 3; j++) {
                        const sideSpike = MeshBuilder.CreateBox(`assaultSideSpike${i}_${j}`, {
                            width: 0.06,
                            height: 0.12,
                            depth: 0.1
                        }, scene);
                        sideSpike.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.05 + j * h * 0.2, d * 0.1 + (j - 1) * d * 0.15);
                        sideSpike.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                        sideSpike.parent = chassis;
                        sideSpike.material = accentMat;
                    }
                }
                
                // Броневые экраны на лобовой части (угловатые)
                for (let i = 0; i < 4; i++) {
                    const frontScreen = MeshBuilder.CreateBox(`assaultFrontScreen${i}`, {
                        width: w * 0.22,
                        height: h * 0.18,
                        depth: 0.1
                    }, scene);
                    frontScreen.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.08 + (i < 2 ? 0 : h * 0.15), d * 0.5);
                    frontScreen.rotation.x = -Math.PI / 12;
                    frontScreen.parent = chassis;
                    frontScreen.material = armorMat;
                }
                
                // Угловые броневые накладки (агрессивный стиль)
                for (let i = 0; i < 4; i++) {
                    const cornerArmor = MeshBuilder.CreateBox(`assaultCornerArmor${i}`, {
                        width: 0.2,
                        height: 0.25,
                        depth: 0.2
                    }, scene);
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.55;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.5;
                    cornerArmor.position = new Vector3(posX, h * 0.45, posZ);
                    cornerArmor.parent = chassis;
                    cornerArmor.material = armorMat;
                }
                
                // Верхние вентиляционные решетки (агрессивные, угловатые)
                for (let i = 0; i < 5; i++) {
                    const roofVent = MeshBuilder.CreateBox(`assaultRoofVent${i}`, {
                        width: 0.15,
                        height: 0.05,
                        depth: 0.12
                    }, scene);
                    roofVent.position = new Vector3((i - 2) * w * 0.25, h * 0.54, (i < 3 ? -1 : 1) * d * 0.25);
                    roofVent.parent = chassis;
                    const roofVentMat = new StandardMaterial(`assaultRoofVentMat${i}`, scene);
                    roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                    roofVent.material = roofVentMat;
                }
                
                // Задние шипы (агрессивный стиль)
                for (let i = 0; i < 4; i++) {
                    const rearSpike = MeshBuilder.CreateBox(`assaultRearSpike${i}`, {
                        width: 0.08,
                        height: 0.18,
                        depth: 0.1
                    }, scene);
                    rearSpike.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.3 + (i < 2 ? 0 : h * 0.15), -d * 0.48);
                    rearSpike.parent = chassis;
                    rearSpike.material = accentMat;
                }
                
                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`assaultTailLight${i}`, {
                        width: 0.06,
                        height: 0.1,
                        depth: 0.04
                    }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`assaultTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }
                
                // Оптический прицел на лобовой части
                const assaultSight = MeshBuilder.CreateBox("assaultSight", {
                    width: 0.14,
                    height: 0.09,
                    depth: 0.11
                }, scene);
                assaultSight.position = new Vector3(0, h * 0.22, d * 0.49);
                assaultSight.parent = chassis;
                const assaultSightMat = new StandardMaterial("assaultSightMat", scene);
                assaultSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                assaultSight.material = assaultSightMat;
                
                // Линза прицела
                const assaultSightLens = MeshBuilder.CreateCylinder("assaultSightLens", {
                    height: 0.02,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                assaultSightLens.position = new Vector3(0, 0, 0.06);
                assaultSightLens.parent = assaultSight;
                const assaultLensMat = new StandardMaterial("assaultSightLensMat", scene);
                assaultLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                assaultLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                assaultSightLens.material = assaultLensMat;
                
                // Радиоантенна сзади
                const assaultAntenna = MeshBuilder.CreateCylinder("assaultAntenna", {
                    height: 0.45,
                    diameter: 0.025,
                    tessellation: 8
                }, scene);
                assaultAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
                assaultAntenna.parent = chassis;
                const assaultAntennaMat = new StandardMaterial("assaultAntennaMat", scene);
                assaultAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                assaultAntenna.material = assaultAntennaMat;
                
                // Основание антенны
                const assaultAntennaBase = MeshBuilder.CreateBox("assaultAntennaBase", {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.1
                }, scene);
                assaultAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
                assaultAntennaBase.parent = chassis;
                assaultAntennaBase.material = armorMat;
                
                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`assaultSideLight${i}`, {
                        width: 0.05,
                        height: 0.07,
                        depth: 0.05
                    }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`assaultSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }
                
                // Выхлопная труба (улучшенная, больше)
                const assaultExhaustUpgraded = MeshBuilder.CreateCylinder("assaultExhaustUpgraded", {
                    height: 0.22,
                    diameter: 0.13,
                    tessellation: 8
                }, scene);
                assaultExhaustUpgraded.position = new Vector3(w * 0.38, h * 0.2, -d * 0.48);
                assaultExhaustUpgraded.rotation.z = Math.PI / 2;
                assaultExhaustUpgraded.parent = chassis;
                assaultExhaustUpgraded.material = armorMat;
                
                // Выхлопное отверстие
                const assaultExhaustHole = MeshBuilder.CreateCylinder("assaultExhaustHole", {
                    height: 0.04,
                    diameter: 0.11,
                    tessellation: 8
                }, scene);
                assaultExhaustHole.position = new Vector3(w * 0.38, h * 0.2, -d * 0.52);
                assaultExhaustHole.rotation.z = Math.PI / 2;
                assaultExhaustHole.parent = chassis;
                const assaultExhaustHoleMat = new StandardMaterial("assaultExhaustHoleMat", scene);
                assaultExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                assaultExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                assaultExhaustHole.material = assaultExhaustHoleMat;
                break;
                
            case "medium": {
                // Medium - Прототип: Т-34 - Классический средний танк, наклонная броня
                // Наклонная лобовая броня (45°)
                const mediumFront = MeshBuilder.CreateBox("mediumFront", {
                    width: w * 1.0,
                    height: h * 0.7,
                    depth: 0.18
                }, scene);
                mediumFront.position = new Vector3(0, h * 0.1, d * 0.5);
                mediumFront.rotation.x = -Math.PI / 4;  // Наклон 45°
                mediumFront.parent = chassis;
                mediumFront.material = armorMat;
                
                // Вентиляционные решетки (угловатые)
                for (let i = 0; i < 3; i++) {
                    const vent = MeshBuilder.CreateBox(`vent${i}`, {
                        width: 0.06,
                        height: 0.04,
                        depth: 0.08
                }, scene);
                    vent.position = new Vector3((i - 1) * w * 0.28, h * 0.38, -d * 0.28);
                    vent.parent = chassis;
                    vent.material = armorMat;
                }
                
                // Два люка на крыше
                for (let i = 0; i < 2; i++) {
                    const hatch = MeshBuilder.CreateBox(`mediumHatch${i}`, {
                        width: 0.22,
                        height: 0.08,
                        depth: 0.22
                    }, scene);
                    hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1);
                    hatch.parent = chassis;
                    hatch.material = armorMat;
                }
                
                // Выхлопные трубы сзади
                for (let i = 0; i < 2; i++) {
                    const exhaust = MeshBuilder.CreateBox(`mediumExhaust${i}`, {
                        width: 0.12,
                        height: 0.12,
                        depth: 0.18
                    }, scene);
                    exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45);
                    exhaust.parent = chassis;
                    exhaust.material = armorMat;
                }
                
                // Фары спереди
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`mediumHeadlight${i}`, {
                        width: 0.1,
                        height: 0.1,
                        depth: 0.08
                    }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.12, d * 0.48);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`mediumHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                    headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                    headlight.material = headlightMat;
                }
                
                // Инструменты: лопата, канистра
                const mediumShovel = MeshBuilder.CreateBox("mediumShovel", {
                    width: 0.14,
                    height: 0.35,
                    depth: 0.02
                }, scene);
                mediumShovel.position = new Vector3(-w * 0.42, h * 0.18, -d * 0.45);
                mediumShovel.parent = chassis;
                mediumShovel.material = armorMat;
                
                const mediumCanister = MeshBuilder.CreateBox("mediumCanister", {
                    width: 0.12,
                    height: 0.2,
                    depth: 0.12
                }, scene);
                mediumCanister.position = new Vector3(w * 0.42, h * 0.2, -d * 0.4);
                mediumCanister.parent = chassis;
                mediumCanister.material = armorMat;
                
                // Вентиляционные решетки (улучшенные)
                for (let i = 0; i < 3; i++) {
                    const vent = MeshBuilder.CreateBox(`mediumVent${i}`, {
                        width: 0.08,
                        height: 0.05,
                        depth: 0.1
                    }, scene);
                    vent.position = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`mediumVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                    vent.material = ventMat;
                    
                    // Детали решетки
                    for (let j = 0; j < 4; j++) {
                        const ventDetail = MeshBuilder.CreateBox(`mediumVentDetail${i}_${j}`, {
                            width: 0.06,
                            height: 0.03,
                            depth: 0.02
                        }, scene);
                        ventDetail.position = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3 + (j - 1.5) * 0.03);
                        ventDetail.parent = chassis;
                        ventDetail.material = ventMat;
                    }
                }
                
                // Перископы на люках
                for (let i = 0; i < 2; i++) {
                    const periscope = MeshBuilder.CreateCylinder(`mediumPeriscope${i}`, {
                        height: 0.18,
                        diameter: 0.07,
                        tessellation: 8
                    }, scene);
                    periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.55, -d * 0.1);
                    periscope.parent = chassis;
                    const periscopeMat = new StandardMaterial(`mediumPeriscopeMat${i}`, scene);
                    periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                    periscope.material = periscopeMat;
                }
                
                // Броневые накладки на лобовой части (характерные для Т-34)
                for (let i = 0; i < 2; i++) {
                    const frontArmor = MeshBuilder.CreateBox(`mediumFrontArmor${i}`, {
                        width: w * 0.3,
                        height: h * 0.2,
                        depth: 0.1
                    }, scene);
                    frontArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.05, d * 0.48);
                    frontArmor.parent = chassis;
                    frontArmor.material = armorMat;
                }
                
                // Центральная броневая накладка на лбу
                const centerArmor = MeshBuilder.CreateBox("mediumCenterArmor", {
                    width: w * 0.2,
                    height: h * 0.15,
                    depth: 0.12
                }, scene);
                centerArmor.position = new Vector3(0, h * 0.2, d * 0.49);
                centerArmor.parent = chassis;
                centerArmor.material = armorMat;
                
                // Боковые броневые экраны (противокумулятивные)
                for (let i = 0; i < 2; i++) {
                    const sideScreen = MeshBuilder.CreateBox(`mediumSideScreen${i}`, {
                        width: 0.15,
                        height: h * 0.6,
                        depth: d * 0.35
                    }, scene);
                    sideScreen.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.15, d * 0.1);
                    sideScreen.parent = chassis;
                    sideScreen.material = armorMat;
                }
                
                // Дополнительные вентиляционные решетки на крыше
                for (let i = 0; i < 4; i++) {
                    const roofVent = MeshBuilder.CreateBox(`mediumRoofVent${i}`, {
                        width: 0.15,
                        height: 0.04,
                        depth: 0.12
                    }, scene);
                    roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.46, (i < 2 ? -1 : 1) * d * 0.25);
                    roofVent.parent = chassis;
                    const roofVentMat = new StandardMaterial(`mediumRoofVentMat${i}`, scene);
                    roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                    roofVent.material = roofVentMat;
                }
                
                // Радиоантенна сзади (характерная для Т-34)
                const antenna = MeshBuilder.CreateCylinder("mediumAntenna", {
                    height: 0.5,
                    diameter: 0.025,
                    tessellation: 8
                }, scene);
                antenna.position = new Vector3(0, h * 0.65, -d * 0.35);
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial("mediumAntennaMat", scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
                
                // Основание антенны
                const antennaBase = MeshBuilder.CreateBox("mediumAntennaBase", {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.1
                }, scene);
                antennaBase.position = new Vector3(0, h * 0.54, -d * 0.35);
                antennaBase.parent = chassis;
                antennaBase.material = armorMat;
                
                // Оптический прицел на лобовой части
                const sight = MeshBuilder.CreateBox("mediumSight", {
                    width: 0.12,
                    height: 0.08,
                    depth: 0.1
                }, scene);
                sight.position = new Vector3(0, h * 0.25, d * 0.48);
                sight.parent = chassis;
                const sightMat = new StandardMaterial("mediumSightMat", scene);
                sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                sight.material = sightMat;
                
                // Линза прицела
                const sightLens = MeshBuilder.CreateCylinder("mediumSightLens", {
                    height: 0.02,
                    diameter: 0.06,
                    tessellation: 8
                }, scene);
                sightLens.position = new Vector3(0, 0, 0.06);
                sightLens.parent = sight;
                const lensMat = new StandardMaterial("mediumSightLensMat", scene);
                lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                sightLens.material = lensMat;
                
                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`mediumTailLight${i}`, {
                        width: 0.06,
                        height: 0.1,
                        depth: 0.04
                    }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.16, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`mediumTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }
                
                // Дополнительные инструменты на корме
                const toolBox = MeshBuilder.CreateBox("mediumToolBox", {
                    width: 0.18,
                    height: 0.12,
                    depth: 0.14
                }, scene);
                toolBox.position = new Vector3(0, h * 0.22, -d * 0.42);
                toolBox.parent = chassis;
                toolBox.material = armorMat;
                
                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`mediumSideLight${i}`, {
                        width: 0.05,
                        height: 0.07,
                        depth: 0.05
                    }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.25);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`mediumSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }
                break;
            }
                
            // === NEW CHASSIS TYPES ===
            case "stealth":
                // Stealth - угловатые панели, низкий профиль
                break; // Visual details added below
                
            case "hover":
                // Hover - обтекаемый футуристический дизайн с реактивными двигателями
                // Дополнительные детали будут добавлены в отдельном блоке ниже
                break; // Visual details added below
                
            case "siege":
                // Siege - массивный, очень большой
                break; // Visual details added below
                
            case "racer":
                // Racer - очень низкий, спортивный - гонщик
                // Передний спойлер
                const racerFrontSpoiler = MeshBuilder.CreateBox("racerFrontSpoiler", {
                    width: w * 0.9,
                    height: 0.12,
                    depth: 0.15
                }, scene);
                racerFrontSpoiler.position = new Vector3(0, -h * 0.4, d * 0.48);
                racerFrontSpoiler.parent = chassis;
                racerFrontSpoiler.material = accentMat;
                
                // Задний спойлер (большой)
                const racerRearSpoiler = MeshBuilder.CreateBox("racerRearSpoiler", {
                    width: w * 1.1,
                    height: 0.25,
                    depth: 0.2
                }, scene);
                racerRearSpoiler.position = new Vector3(0, h * 0.45, -d * 0.48);
                racerRearSpoiler.parent = chassis;
                racerRearSpoiler.material = accentMat;
                
                // Боковые обтекатели (низкопрофильные)
                for (let i = 0; i < 2; i++) {
                    const sideFairing = MeshBuilder.CreateBox(`racerSideFairing${i}`, {
                        width: 0.12,
                        height: h * 0.6,
                        depth: d * 0.7
                    }, scene);
                    sideFairing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1);
                    sideFairing.parent = chassis;
                    sideFairing.material = accentMat;
                }
                
                // Передние фары (большие, агрессивные)
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`racerHeadlight${i}`, {
                        width: 0.15,
                        height: 0.12,
                        depth: 0.1
                    }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.32, h * 0.1, d * 0.49);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`racerHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(1.0, 1.0, 0.8);
                    headlightMat.emissiveColor = new Color3(0.5, 0.5, 0.3);
                    headlight.material = headlightMat;
                }
                
                // Центральная воздухозаборная решетка
                const racerIntake = MeshBuilder.CreateBox("racerIntake", {
                    width: w * 0.4,
                    height: h * 0.25,
                    depth: 0.08
                }, scene);
                racerIntake.position = new Vector3(0, h * 0.15, d * 0.48);
                racerIntake.parent = chassis;
                const intakeMat = new StandardMaterial("racerIntakeMat", scene);
                intakeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                racerIntake.material = intakeMat;
                
                // Детали решетки
                for (let i = 0; i < 5; i++) {
                    const intakeBar = MeshBuilder.CreateBox(`racerIntakeBar${i}`, {
                        width: 0.02,
                        height: h * 0.2,
                        depth: 0.06
                    }, scene);
                    intakeBar.position = new Vector3((i - 2) * w * 0.09, h * 0.15, d * 0.48);
                    intakeBar.parent = chassis;
                    intakeBar.material = intakeMat;
                }
                
                // Верхние воздухозаборники на крыше
                for (let i = 0; i < 2; i++) {
                    const roofIntake = MeshBuilder.CreateBox(`racerRoofIntake${i}`, {
                        width: 0.18,
                        height: 0.08,
                        depth: 0.12
                    }, scene);
                    roofIntake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.42, d * 0.3);
                    roofIntake.parent = chassis;
                    roofIntake.material = intakeMat;
                }
                
                // Выхлопные трубы (большие, по бокам)
                for (let i = 0; i < 2; i++) {
                    const exhaust = MeshBuilder.CreateCylinder(`racerExhaust${i}`, {
                        height: 0.3,
                        diameter: 0.1,
                        tessellation: 8
                    }, scene);
                    exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.48);
                    exhaust.rotation.z = Math.PI / 2;
                    exhaust.parent = chassis;
                    exhaust.material = armorMat;
                    
                    // Выхлопное отверстие
                    const exhaustHole = MeshBuilder.CreateCylinder(`racerExhaustHole${i}`, {
                        height: 0.05,
                        diameter: 0.08,
                        tessellation: 8
                    }, scene);
                    exhaustHole.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.52);
                    exhaustHole.rotation.z = Math.PI / 2;
                    exhaustHole.parent = chassis;
                    const exhaustHoleMat = new StandardMaterial(`racerExhaustHoleMat${i}`, scene);
                    exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                    exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                    exhaustHole.material = exhaustHoleMat;
                }
                
                // Боковые зеркала
                for (let i = 0; i < 2; i++) {
                    const mirror = MeshBuilder.CreateBox(`racerMirror${i}`, {
                        width: 0.08,
                        height: 0.05,
                        depth: 0.04
                    }, scene);
                    mirror.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.35, d * 0.35);
                    mirror.parent = chassis;
                    const mirrorMat = new StandardMaterial(`racerMirrorMat${i}`, scene);
                    mirrorMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
                    mirror.material = mirrorMat;
                }
                
                // Задние огни (большие стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`racerTailLight${i}`, {
                        width: 0.08,
                        height: 0.12,
                        depth: 0.04
                    }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.12, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`racerTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.7, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.4, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }
                
                // Вентиляционные отверстия на боковых панелях
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 3; j++) {
                        const sideVent = MeshBuilder.CreateBox(`racerSideVent${i}_${j}`, {
                            width: 0.04,
                            height: 0.1,
                            depth: 0.04
                        }, scene);
                        sideVent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.05, d * 0.1 + (j - 1) * d * 0.15);
                        sideVent.parent = chassis;
                        sideVent.material = intakeMat;
                    }
                }
                
                // Люк на крыше (спортивный стиль)
                const racerHatch = MeshBuilder.CreateBox("racerHatch", {
                    width: 0.3,
                    height: 0.06,
                    depth: 0.25
                }, scene);
                racerHatch.position = new Vector3(0, h * 0.46, -d * 0.1);
                racerHatch.parent = chassis;
                racerHatch.material = armorMat;
                
                // Перископ на люке
                const racerPeriscope = MeshBuilder.CreateCylinder("racerPeriscope", {
                    height: 0.2,
                    diameter: 0.06,
                    tessellation: 8
                }, scene);
                racerPeriscope.position = new Vector3(0, h * 0.56, -d * 0.1);
                racerPeriscope.parent = chassis;
                const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
                racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                racerPeriscope.material = racerPeriscopeMat;
                break; // Visual details added below
                
            case "amphibious":
                // Amphibious - с поплавками
                break; // Visual details added below
                
            case "shield":
                // Shield - с генератором щита
                break; // Visual details added below
                
            case "drone":
                // Drone - с платформами для дронов
                break; // Visual details added below
                
            case "artillery":
                // Artillery - с стабилизаторами
                break; // Visual details added below
                
            case "destroyer":
                // Destroyer - длинный, низкий - tank destroyer стиль
                // Дополнительные детали будут добавлены в отдельном блоке ниже
                break; // Visual details added below
                
            case "command":
                // Command - с антеннами и аурой
                break; // Visual details added below
        }
        
        // === NEW CHASSIS TYPES DETAILS ===
        
        if (this.chassisType.id === "stealth") {
            // Stealth - угловатые панели, генератор невидимости, низкий профиль
            const stealthPanels = [
                { pos: new Vector3(-w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
                { pos: new Vector3(w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
                { pos: new Vector3(0, h * 0.35, -d * 0.35), size: new Vector3(w * 0.4, h * 0.25, w * 0.3) }
            ];
            stealthPanels.forEach((panel, i) => {
                const panelMesh = MeshBuilder.CreateBox(`stealthPanel${i}`, {
                    width: panel.size.x,
                    height: panel.size.y,
                    depth: panel.size.z
                }, scene);
                panelMesh.position = panel.pos;
                panelMesh.parent = chassis;
                panelMesh.material = armorMat;
            });
            
            // Генератор невидимости
            const stealthGen = MeshBuilder.CreateBox("stealthGen", {
                width: w * 0.35,
                height: h * 0.45,
                depth: w * 0.35
            }, scene);
            stealthGen.position = new Vector3(0, h * 0.35, -d * 0.35);
            stealthGen.parent = chassis;
            const stealthMat = new StandardMaterial("stealthMat", scene);
            stealthMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            stealthMat.emissiveColor = new Color3(0.08, 0.08, 0.12);
            stealthGen.material = stealthMat;
            this.chassisAnimationElements.stealthMesh = stealthGen;
        }
        
        if (this.chassisType.id === "hover") {
            // Hover - обтекаемые панели, реактивные двигатели
            const hoverPanels = [];
            for (let i = 0; i < 2; i++) {
                const panel = MeshBuilder.CreateBox(`hoverPanel${i}`, {
                    width: 0.06,
                    height: h * 0.6,
                    depth: d * 0.5
                }, scene);
                panel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, 0, 0);
                panel.parent = chassis;
                panel.material = accentMat;
                hoverPanels.push(panel);
            }
            
            // Реактивные двигатели (4 штуки)
            this.chassisAnimationElements.hoverThrusters = [];
            for (let i = 0; i < 4; i++) {
                const thruster = MeshBuilder.CreateCylinder(`thruster${i}`, {
                    height: 0.25,
                    diameter: 0.18
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
                const posZ = (i < 2 ? -1 : 1) * d * 0.38;
                thruster.position = new Vector3(posX, -h * 0.45, posZ);
                thruster.parent = chassis;
                const thrusterMat = new StandardMaterial(`thrusterMat${i}`, scene);
                thrusterMat.diffuseColor = new Color3(0, 0.6, 1);
                thrusterMat.emissiveColor = new Color3(0, 0.4, 0.7);
                thruster.material = thrusterMat;
                this.chassisAnimationElements.hoverThrusters.push(thruster);
            }
            
            // Обтекаемые фары спереди
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateCylinder(`hoverHeadlight${i}`, {
                    height: 0.08,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.48);
                headlight.rotation.x = Math.PI / 2;
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`hoverHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(1.0, 1.0, 0.9);
                headlightMat.emissiveColor = new Color3(0.5, 0.5, 0.3);
                headlight.material = headlightMat;
            }
            
            // Обтекаемый люк на крыше
            const hoverHatch = MeshBuilder.CreateCylinder("hoverHatch", {
                height: 0.08,
                diameter: 0.28,
                tessellation: 8
            }, scene);
            hoverHatch.position = new Vector3(0, h * 0.52, -d * 0.1);
            hoverHatch.parent = chassis;
            hoverHatch.material = armorMat;
            
            // Перископ на люке (обтекаемый)
            const hoverPeriscope = MeshBuilder.CreateCylinder("hoverPeriscope", {
                height: 0.18,
                diameter: 0.06,
                tessellation: 8
            }, scene);
            hoverPeriscope.position = new Vector3(0, h * 0.58, -d * 0.1);
            hoverPeriscope.parent = chassis;
            const hoverPeriscopeMat = new StandardMaterial("hoverPeriscopeMat", scene);
            hoverPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            hoverPeriscope.material = hoverPeriscopeMat;
            
            // Вентиляционные решетки на крыше (обтекаемые)
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateCylinder(`hoverRoofVent${i}`, {
                    height: 0.05,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.5, (i < 2 ? -1 : 1) * d * 0.25);
                roofVent.rotation.x = Math.PI / 2;
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`hoverRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
            }
            
            // Оптические сенсоры (округлые)
            for (let i = 0; i < 2; i++) {
                const sensor = MeshBuilder.CreateCylinder(`hoverSensor${i}`, {
                    height: 0.06,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                sensor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, d * 0.45);
                sensor.rotation.x = Math.PI / 2;
                sensor.parent = chassis;
                const sensorMat = new StandardMaterial(`hoverSensorMat${i}`, scene);
                sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
                sensorMat.emissiveColor = new Color3(0.05, 0.08, 0.1);
                sensor.material = sensorMat;
            }
            
            // Задние огни (округлые)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateCylinder(`hoverTailLight${i}`, {
                    height: 0.04,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.49);
                tailLight.rotation.x = Math.PI / 2;
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`hoverTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Обтекаемые воздухозаборники по бокам
            for (let i = 0; i < 2; i++) {
                const intake = MeshBuilder.CreateCylinder(`hoverIntake${i}`, {
                    height: 0.15,
                    diameter: 0.14,
                    tessellation: 8
                }, scene);
                intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.1, d * 0.2);
                intake.rotation.z = Math.PI / 2;
                intake.parent = chassis;
                const intakeMat = new StandardMaterial(`hoverIntakeMat${i}`, scene);
                intakeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                intake.material = intakeMat;
            }
            
            // Стабилизационные панели (обтекаемые)
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`hoverStabilizer${i}`, {
                    width: 0.08,
                    height: h * 0.4,
                    depth: d * 0.3
                }, scene);
                stabilizer.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.15);
                stabilizer.parent = chassis;
                stabilizer.material = accentMat;
            }
        }
        
        if (this.chassisType.id === "siege") {
            // Siege - массивные многослойные бронеплиты
            const siegePlates = [
                { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
                { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
                { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.25, 0.18) },
                { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 0.98, 0.2, d * 0.98) },
                { pos: new Vector3(0, h * 0.6, 0), size: new Vector3(w * 0.9, 0.15, d * 0.8) }
            ];
            siegePlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`siegePlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            // Дополнительные угловые бронеплиты
            for (let i = 0; i < 4; i++) {
                const cornerPlate = MeshBuilder.CreateBox(`cornerPlate${i}`, {
                    width: 0.15,
                    height: h * 0.4,
                    depth: 0.15
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                cornerPlate.position = new Vector3(
                    Math.cos(angle) * w * 0.55,
                    h * 0.2,
                    Math.sin(angle) * d * 0.55
                );
                cornerPlate.parent = chassis;
                cornerPlate.material = armorMat;
            }
            
            // Три люка
            for (let i = 0; i < 3; i++) {
                const hatch = MeshBuilder.CreateBox(`siegeHatch${i}`, {
                    width: 0.25,
                    height: 0.1,
                    depth: 0.25
                }, scene);
                hatch.position = new Vector3((i - 1) * w * 0.3, h * 0.7, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`siegeHeadlight${i}`, {
                    width: 0.14,
                    height: 0.14,
                    depth: 0.12
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.18, d * 0.5);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`siegeHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Две выхлопные трубы
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`siegeExhaust${i}`, {
                    width: 0.16,
                    height: 0.16,
                    depth: 0.22
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.48);
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Множество инструментов
            const siegeShovel = MeshBuilder.CreateBox("siegeShovel", {
                width: 0.16,
                height: 0.45,
                depth: 0.02
            }, scene);
            siegeShovel.position = new Vector3(-w * 0.48, h * 0.22, -d * 0.45);
            siegeShovel.parent = chassis;
            siegeShovel.material = armorMat;
            
            const siegeAxe = MeshBuilder.CreateBox("siegeAxe", {
                width: 0.35,
                height: 0.12,
                depth: 0.02
            }, scene);
            siegeAxe.position = new Vector3(-w * 0.38, h * 0.28, -d * 0.45);
            siegeAxe.parent = chassis;
            siegeAxe.material = armorMat;
            
            const siegeCanister = MeshBuilder.CreateBox("siegeCanister", {
                width: 0.16,
                height: 0.3,
                depth: 0.16
            }, scene);
            siegeCanister.position = new Vector3(w * 0.48, h * 0.25, -d * 0.4);
            siegeCanister.parent = chassis;
            siegeCanister.material = armorMat;
            
            // Антенны (большие)
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateCylinder(`siegeAntenna${i}`, {
                    height: 0.5,
                    diameter: 0.03,
                    tessellation: 8
                }, scene);
                antenna.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.8, -d * 0.4);
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`siegeAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            
            // Перископы на люках
            for (let i = 0; i < 3; i++) {
                const periscope = MeshBuilder.CreateCylinder(`siegePeriscope${i}`, {
                    height: 0.22,
                    diameter: 0.09,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i - 1) * w * 0.3, h * 0.8, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`siegePeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Большие вентиляционные решетки на крыше
            for (let i = 0; i < 5; i++) {
                const roofVent = MeshBuilder.CreateBox(`siegeRoofVent${i}`, {
                    width: 0.3,
                    height: 0.08,
                    depth: 0.2
                }, scene);
                roofVent.position = new Vector3((i - 2) * w * 0.25, h * 0.68, d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`siegeRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
                
                // Детали решетки (много планок)
                for (let j = 0; j < 8; j++) {
                    const ventBar = MeshBuilder.CreateBox(`siegeRoofVentBar${i}_${j}`, {
                        width: 0.04,
                        height: 0.07,
                        depth: 0.18
                    }, scene);
                    ventBar.position = new Vector3((i - 2) * w * 0.25 + (j - 3.5) * 0.04, h * 0.68, d * 0.25);
                    ventBar.parent = chassis;
                    ventBar.material = roofVentMat;
                }
            }
            
            // Массивные выхлопные трубы (большие)
            for (let i = 0; i < 3; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`siegeExhaust${i}`, {
                    height: 0.3,
                    diameter: 0.16,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
                
                // Выхлопное отверстие
                const exhaustHole = MeshBuilder.CreateCylinder(`siegeExhaustHole${i}`, {
                    height: 0.05,
                    diameter: 0.14,
                    tessellation: 8
                }, scene);
                exhaustHole.position = new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.52);
                exhaustHole.rotation.z = Math.PI / 2;
                exhaustHole.parent = chassis;
                const exhaustHoleMat = new StandardMaterial(`siegeExhaustHoleMat${i}`, scene);
                exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                exhaustHole.material = exhaustHoleMat;
            }
            
            // Оптический прицел на лобовой части (огромный)
            const siegeSight = MeshBuilder.CreateBox("siegeSight", {
                width: 0.22,
                height: 0.15,
                depth: 0.18
            }, scene);
            siegeSight.position = new Vector3(0, h * 0.3, d * 0.5);
            siegeSight.parent = chassis;
            const siegeSightMat = new StandardMaterial("siegeSightMat", scene);
            siegeSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            siegeSight.material = siegeSightMat;
            
            // Линза прицела (большая)
            const siegeSightLens = MeshBuilder.CreateCylinder("siegeSightLens", {
                height: 0.02,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            siegeSightLens.position = new Vector3(0, 0, 0.1);
            siegeSightLens.parent = siegeSight;
            const siegeLensMat = new StandardMaterial("siegeSightLensMat", scene);
            siegeLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            siegeLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            siegeSightLens.material = siegeLensMat;
            
            // Дополнительные броневые накладки на лобовой части (огромные)
            for (let i = 0; i < 3; i++) {
                const frontArmor = MeshBuilder.CreateBox(`siegeFrontArmor${i}`, {
                    width: w * 0.35,
                    height: h * 0.25,
                    depth: 0.15
                }, scene);
                frontArmor.position = new Vector3((i - 1) * w * 0.32, h * 0.1, d * 0.5);
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Задние огни (стоп-сигналы, большие)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`siegeTailLight${i}`, {
                    width: 0.1,
                    height: 0.15,
                    depth: 0.06
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`siegeTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Боковые вентиляционные решетки (большие)
            for (let i = 0; i < 2; i++) {
                const sideVent = MeshBuilder.CreateBox(`siegeSideVent${i}`, {
                    width: 0.08,
                    height: 0.15,
                    depth: 0.2
                }, scene);
                sideVent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.12, d * 0.15);
                sideVent.parent = chassis;
                const sideVentMat = new StandardMaterial(`siegeSideVentMat${i}`, scene);
                sideVentMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                sideVent.material = sideVentMat;
            }
        }
        
        if (this.chassisType.id === "racer") {
            // Racer - большой спойлер, боковые крылья, воздухозаборники
            const spoiler = MeshBuilder.CreateBox("spoiler", {
                width: w * 1.15,
                height: 0.12,
                depth: 0.18
            }, scene);
            spoiler.position = new Vector3(0, h * 0.55, -d * 0.48);
            spoiler.parent = chassis;
            spoiler.material = accentMat;
            
            // Боковые крылья
            for (let i = 0; i < 2; i++) {
                const wing = MeshBuilder.CreateBox(`racerWing${i}`, {
                    width: 0.1,
                    height: h * 0.6,
                    depth: d * 0.45
                }, scene);
                wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, 0, d * 0.25);
                wing.parent = chassis;
                wing.material = accentMat;
            }
            
            // Воздухозаборники спереди
            for (let i = 0; i < 2; i++) {
                const intake = MeshBuilder.CreateBox(`racerIntake${i}`, {
                    width: 0.1,
                    height: h * 0.4,
                    depth: 0.15
                }, scene);
                intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48);
                intake.parent = chassis;
                intake.material = armorMat;
            }
            
            // Один люк
            const racerHatch = MeshBuilder.CreateBox("racerHatch", {
                width: 0.18,
                height: 0.06,
                depth: 0.18
            }, scene);
            racerHatch.position = new Vector3(0, h * 0.38, 0);
            racerHatch.parent = chassis;
            racerHatch.material = armorMat;
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`racerHeadlight${i}`, {
                    width: 0.08,
                    height: 0.08,
                    depth: 0.06
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.28, h * 0.08, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`racerHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Выхлоп
            const racerExhaust = MeshBuilder.CreateBox("racerExhaust", {
                width: 0.12,
                height: 0.12,
                depth: 0.18
            }, scene);
            racerExhaust.position = new Vector3(w * 0.32, h * 0.1, -d * 0.48);
            racerExhaust.parent = chassis;
            racerExhaust.material = armorMat;
            
            // Вентиляционные решетки (спортивные)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`racerVent${i}`, {
                    width: 0.06,
                    height: 0.04,
                    depth: 0.08
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.25, d * 0.2);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`racerVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
            }
            
            // Перископ
            const racerPeriscope = MeshBuilder.CreateCylinder("racerPeriscope", {
                height: 0.12,
                diameter: 0.06,
                tessellation: 8
            }, scene);
            racerPeriscope.position = new Vector3(0, h * 0.42, 0);
            racerPeriscope.parent = chassis;
            const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
            racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            racerPeriscope.material = racerPeriscopeMat;
        }
        
        if (this.chassisType.id === "amphibious") {
            // Amphibious - большие поплавки, водонепроницаемые панели
            for (let i = 0; i < 2; i++) {
                const float = MeshBuilder.CreateCylinder(`float${i}`, {
                    height: h * 0.7,
                    diameter: w * 0.35
                }, scene);
                float.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, -h * 0.25, 0);
                float.parent = chassis;
                float.material = accentMat;
            }
            
            // Водонепроницаемые панели
            const waterSeal = MeshBuilder.CreateBox("waterSeal", {
                width: w * 1.05,
                height: 0.08,
                depth: d * 1.05
            }, scene);
            waterSeal.position = new Vector3(0, h * 0.5, 0);
            waterSeal.parent = chassis;
            waterSeal.material = armorMat;
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`amphibiousHatch${i}`, {
                    width: 0.2,
                    height: 0.08,
                    depth: 0.2
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`amphibiousHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`amphibiousHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки (водонепроницаемые)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`amphibiousVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`amphibiousVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
            }
            
            // Перископы
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`amphibiousPeriscope${i}`, {
                    height: 0.18,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.58, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`amphibiousPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
        }
        
        if (this.chassisType.id === "shield") {
            // Shield - генератор щита, энергетические панели
            const shieldGen = MeshBuilder.CreateSphere("shieldGen", {
                diameter: w * 0.45,
                segments: 16
            }, scene);
            shieldGen.position = new Vector3(0, h * 0.45, -d * 0.25);
            shieldGen.parent = chassis;
            const shieldGenMat = new StandardMaterial("shieldGenMat", scene);
            shieldGenMat.diffuseColor = new Color3(0, 1, 0.6);
            shieldGenMat.emissiveColor = new Color3(0, 0.6, 0.3);
            shieldGen.material = shieldGenMat;
            this.chassisAnimationElements.shieldMesh = shieldGen;
            
            // Энергетические панели по бокам
            for (let i = 0; i < 2; i++) {
                const energyPanel = MeshBuilder.CreateBox(`energyPanel${i}`, {
                    width: 0.1,
                    height: h * 0.5,
                    depth: d * 0.3
                }, scene);
                energyPanel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.55, h * 0.15, 0);
                energyPanel.parent = chassis;
                const panelMat = new StandardMaterial(`energyPanelMat${i}`, scene);
                panelMat.diffuseColor = new Color3(0, 0.8, 0.4);
                panelMat.emissiveColor = new Color3(0, 0.3, 0.15);
                energyPanel.material = panelMat;
            }
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`shieldHatch${i}`, {
                    width: 0.2,
                    height: 0.08,
                    depth: 0.2
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`shieldHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`shieldHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки (энергетические)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`shieldVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`shieldVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                ventMat.emissiveColor = new Color3(0.05, 0.1, 0.05);
                vent.material = ventMat;
            }
            
            // Энергетические катушки вокруг генератора
            for (let i = 0; i < 4; i++) {
                const coil = MeshBuilder.CreateTorus(`shieldCoil${i}`, {
                    diameter: w * 0.5,
                    thickness: 0.06,
                    tessellation: 16
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                coil.position = new Vector3(0, h * 0.45, -d * 0.25);
                coil.rotation.x = angle;
                coil.parent = chassis;
                const coilMat = new StandardMaterial(`shieldCoilMat${i}`, scene);
                coilMat.diffuseColor = new Color3(0, 0.7, 0.5);
                coilMat.emissiveColor = new Color3(0, 0.4, 0.25);
                coil.material = coilMat;
            }
            
            // Перископы на люках
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`shieldPeriscope${i}`, {
                    height: 0.18,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`shieldPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Энергетические порты (для зарядки щита)
            for (let i = 0; i < 4; i++) {
                const port = MeshBuilder.CreateCylinder(`shieldPort${i}`, {
                    height: 0.08,
                    diameter: 0.1,
                    tessellation: 8
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                port.position = new Vector3(Math.cos(angle) * w * 0.4, h * 0.25, -d * 0.25 + Math.sin(angle) * d * 0.2);
                port.rotation.x = angle + Math.PI / 2;
                port.parent = chassis;
                const portMat = new StandardMaterial(`shieldPortMat${i}`, scene);
                portMat.diffuseColor = new Color3(0, 0.6, 0.4);
                portMat.emissiveColor = new Color3(0, 0.3, 0.2);
                port.material = portMat;
            }
            
            // Верхние вентиляционные решетки (энергетические)
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateBox(`shieldRoofVent${i}`, {
                    width: 0.15,
                    height: 0.04,
                    depth: 0.12
                }, scene);
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.54, (i < 2 ? -1 : 1) * d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`shieldRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.15, 0.12);
                roofVentMat.emissiveColor = new Color3(0.03, 0.05, 0.03);
                roofVent.material = roofVentMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`shieldTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`shieldTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Радиоантенна сзади
            const shieldAntenna = MeshBuilder.CreateCylinder("shieldAntenna", {
                height: 0.5,
                diameter: 0.025,
                tessellation: 8
            }, scene);
            shieldAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
            shieldAntenna.parent = chassis;
            const shieldAntennaMat = new StandardMaterial("shieldAntennaMat", scene);
            shieldAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            shieldAntenna.material = shieldAntennaMat;
            
            // Основание антенны
            const shieldAntennaBase = MeshBuilder.CreateBox("shieldAntennaBase", {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            }, scene);
            shieldAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
            shieldAntennaBase.parent = chassis;
            shieldAntennaBase.material = armorMat;
            
            // Оптический прицел на лобовой части
            const shieldSight = MeshBuilder.CreateBox("shieldSight", {
                width: 0.14,
                height: 0.09,
                depth: 0.11
            }, scene);
            shieldSight.position = new Vector3(0, h * 0.22, d * 0.49);
            shieldSight.parent = chassis;
            const shieldSightMat = new StandardMaterial("shieldSightMat", scene);
            shieldSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            shieldSight.material = shieldSightMat;
            
            // Линза прицела
            const shieldSightLens = MeshBuilder.CreateCylinder("shieldSightLens", {
                height: 0.02,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            shieldSightLens.position = new Vector3(0, 0, 0.06);
            shieldSightLens.parent = shieldSight;
            const shieldLensMat = new StandardMaterial("shieldSightLensMat", scene);
            shieldLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            shieldLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            shieldSightLens.material = shieldLensMat;
            
            // Выхлопные трубы сзади
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`shieldExhaust${i}`, {
                    height: 0.2,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Перископы
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`shieldPeriscope${i}`, {
                    height: 0.18,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.58, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`shieldPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
        }
        
        if (this.chassisType.id === "drone") {
            // Drone - платформы для дронов, антенны связи
            this.chassisAnimationElements.droneMeshes = [];
            for (let i = 0; i < 2; i++) {
                const platform = MeshBuilder.CreateBox(`dronePlatform${i}`, {
                    width: w * 0.45,
                    height: 0.12,
                    depth: w * 0.45
                }, scene);
                platform.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.65, 0);
                platform.parent = chassis;
                const platformMat = new StandardMaterial(`platformMat${i}`, scene);
                platformMat.diffuseColor = new Color3(0.6, 0, 1);
                platformMat.emissiveColor = new Color3(0.35, 0, 0.7);
                platform.material = platformMat;
                this.chassisAnimationElements.droneMeshes.push(platform);
                
                // Антенны на платформах
                const antenna = MeshBuilder.CreateCylinder(`droneAntenna${i}`, {
                    height: 0.15,
                    diameter: 0.03
                }, scene);
                antenna.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.72, 0);
                antenna.parent = chassis;
                antenna.material = platformMat;
            }
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`droneHatch${i}`, {
                    width: 0.2,
                    height: 0.08,
                    depth: 0.2
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`droneHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`droneHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки (для охлаждения систем управления дронами)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`droneVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`droneVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
            }
            
            // Перископы
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`dronePeriscope${i}`, {
                    height: 0.18,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.66, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`dronePeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Сенсорные панели на платформах
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 2; j++) {
                    const sensor = MeshBuilder.CreateBox(`droneSensor${i}_${j}`, {
                        width: 0.08,
                        height: 0.04,
                        depth: 0.08
                    }, scene);
                    sensor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38 + (j === 0 ? -1 : 1) * 0.1, h * 0.68, (j === 0 ? -1 : 1) * 0.1);
                    sensor.parent = chassis;
                    const sensorMat = new StandardMaterial(`droneSensorMat${i}_${j}`, scene);
                    sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.25);
                    sensorMat.emissiveColor = new Color3(0.2, 0, 0.4);
                    sensor.material = sensorMat;
                }
            }
            
            // Верхние вентиляционные решетки на крыше
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateBox(`droneRoofVent${i}`, {
                    width: 0.12,
                    height: 0.04,
                    depth: 0.1
                }, scene);
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`droneRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.15);
                roofVent.material = roofVentMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`droneTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`droneTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Оптический прицел на лобовой части
            const droneSight = MeshBuilder.CreateBox("droneSight", {
                width: 0.14,
                height: 0.09,
                depth: 0.11
            }, scene);
            droneSight.position = new Vector3(0, h * 0.22, d * 0.49);
            droneSight.parent = chassis;
            const droneSightMat = new StandardMaterial("droneSightMat", scene);
            droneSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            droneSight.material = droneSightMat;
            
            // Линза прицела
            const droneSightLens = MeshBuilder.CreateCylinder("droneSightLens", {
                height: 0.02,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            droneSightLens.position = new Vector3(0, 0, 0.06);
            droneSightLens.parent = droneSight;
            const droneLensMat = new StandardMaterial("droneSightLensMat", scene);
            droneLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            droneLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            droneSightLens.material = droneLensMat;
            
            // Радиоантенна сзади (для связи с дронами)
            const droneAntenna = MeshBuilder.CreateCylinder("droneAntenna", {
                height: 0.55,
                diameter: 0.025,
                tessellation: 8
            }, scene);
            droneAntenna.position = new Vector3(0, h * 0.72, -d * 0.3);
            droneAntenna.parent = chassis;
            const droneAntennaMat = new StandardMaterial("droneAntennaMat", scene);
            droneAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            droneAntenna.material = droneAntennaMat;
            
            // Основание антенны
            const droneAntennaBase = MeshBuilder.CreateBox("droneAntennaBase", {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            }, scene);
            droneAntennaBase.position = new Vector3(0, h * 0.6, -d * 0.3);
            droneAntennaBase.parent = chassis;
            droneAntennaBase.material = armorMat;
            
            // Выхлопные трубы сзади
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`droneExhaust${i}`, {
                    height: 0.2,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
        }
        
        if (this.chassisType.id === "artillery") {
            // Artillery - массивные стабилизаторы, опорные лапы
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateCylinder(`stabilizer${i}`, {
                    height: 0.35,
                    diameter: 0.25
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                stabilizer.position = new Vector3(
                    Math.cos(angle) * w * 0.65,
                    -h * 0.45,
                    Math.sin(angle) * d * 0.65
                );
                stabilizer.parent = chassis;
                stabilizer.material = armorMat;
            }
            
            // Опорные лапы
            for (let i = 0; i < 4; i++) {
                const leg = MeshBuilder.CreateBox(`artilleryLeg${i}`, {
                    width: 0.12,
                    height: 0.2,
                    depth: 0.12
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                leg.position = new Vector3(
                    Math.cos(angle) * w * 0.7,
                    -h * 0.55,
                    Math.sin(angle) * d * 0.7
                );
                leg.parent = chassis;
                leg.material = armorMat;
            }
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`artilleryHatch${i}`, {
                    width: 0.22,
                    height: 0.1,
                    depth: 0.22
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.7, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`artilleryHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.2, d * 0.5);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`artilleryHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Выхлоп
            const artilleryExhaust = MeshBuilder.CreateBox("artilleryExhaust", {
                width: 0.14,
                height: 0.14,
                depth: 0.2
            }, scene);
            artilleryExhaust.position = new Vector3(w * 0.4, h * 0.22, -d * 0.48);
            artilleryExhaust.parent = chassis;
            artilleryExhaust.material = armorMat;
            
            // Вентиляционные решетки (большие для артиллерии)
            for (let i = 0; i < 3; i++) {
                const vent = MeshBuilder.CreateBox(`artilleryVent${i}`, {
                    width: 0.12,
                    height: 0.08,
                    depth: 0.14
                }, scene);
                vent.position = new Vector3((i - 1) * w * 0.35, h * 0.6, -d * 0.3);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`artilleryVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
            }
            
            // Перископы
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`artilleryPeriscope${i}`, {
                    height: 0.22,
                    diameter: 0.09,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.85, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`artilleryPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Системы наведения (оптические прицелы)
            for (let i = 0; i < 2; i++) {
                const sight = MeshBuilder.CreateBox(`artillerySight${i}`, {
                    width: 0.16,
                    height: 0.12,
                    depth: 0.14
                }, scene);
                sight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.75, d * 0.45);
                sight.parent = chassis;
                const sightMat = new StandardMaterial(`artillerySightMat${i}`, scene);
                sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                sight.material = sightMat;
                
                // Линза прицела
                const sightLens = MeshBuilder.CreateCylinder(`artillerySightLens${i}`, {
                    height: 0.02,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                sightLens.position = new Vector3(0, 0, 0.08);
                sightLens.parent = sight;
                const lensMat = new StandardMaterial(`artillerySightLensMat${i}`, scene);
                lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                sightLens.material = lensMat;
            }
            
            // Верхние вентиляционные решетки на крыше (большие)
            for (let i = 0; i < 5; i++) {
                const roofVent = MeshBuilder.CreateBox(`artilleryRoofVent${i}`, {
                    width: 0.2,
                    height: 0.06,
                    depth: 0.16
                }, scene);
                roofVent.position = new Vector3((i - 2) * w * 0.28, h * 0.72, d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`artilleryRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
                
                // Детали решетки
                for (let j = 0; j < 5; j++) {
                    const ventBar = MeshBuilder.CreateBox(`artilleryRoofVentBar${i}_${j}`, {
                        width: 0.03,
                        height: 0.05,
                        depth: 0.14
                    }, scene);
                    ventBar.position = new Vector3((i - 2) * w * 0.28 + (j - 2) * 0.04, h * 0.72, d * 0.25);
                    ventBar.parent = chassis;
                    ventBar.material = roofVentMat;
                }
            }
            
            // Радиоантенна сзади
            const artilleryAntenna = MeshBuilder.CreateCylinder("artilleryAntenna", {
                height: 0.6,
                diameter: 0.03,
                tessellation: 8
            }, scene);
            artilleryAntenna.position = new Vector3(0, h * 0.9, -d * 0.3);
            artilleryAntenna.parent = chassis;
            const artilleryAntennaMat = new StandardMaterial("artilleryAntennaMat", scene);
            artilleryAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            artilleryAntenna.material = artilleryAntennaMat;
            
            // Основание антенны
            const artilleryAntennaBase = MeshBuilder.CreateBox("artilleryAntennaBase", {
                width: 0.12,
                height: 0.12,
                depth: 0.12
            }, scene);
            artilleryAntennaBase.position = new Vector3(0, h * 0.76, -d * 0.3);
            artilleryAntennaBase.parent = chassis;
            artilleryAntennaBase.material = armorMat;
            
            // Задние огни (стоп-сигналы, большие)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`artilleryTailLight${i}`, {
                    width: 0.08,
                    height: 0.14,
                    depth: 0.06
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`artilleryTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`artillerySideLight${i}`, {
                    width: 0.06,
                    height: 0.09,
                    depth: 0.06
                }, scene);
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.15, -d * 0.25);
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`artillerySideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Выхлопная труба (большая)
            const artilleryExhaustUpgraded = MeshBuilder.CreateCylinder("artilleryExhaustUpgraded", {
                height: 0.28,
                diameter: 0.18,
                tessellation: 8
            }, scene);
            artilleryExhaustUpgraded.position = new Vector3(0, h * 0.25, -d * 0.48);
            artilleryExhaustUpgraded.rotation.z = Math.PI / 2;
            artilleryExhaustUpgraded.parent = chassis;
            artilleryExhaustUpgraded.material = armorMat;
            
            // Выхлопное отверстие
            const artilleryExhaustHole = MeshBuilder.CreateCylinder("artilleryExhaustHole", {
                height: 0.05,
                diameter: 0.16,
                tessellation: 8
            }, scene);
            artilleryExhaustHole.position = new Vector3(0, h * 0.25, -d * 0.52);
            artilleryExhaustHole.rotation.z = Math.PI / 2;
            artilleryExhaustHole.parent = chassis;
            const artilleryExhaustHoleMat = new StandardMaterial("artilleryExhaustHoleMat", scene);
            artilleryExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            artilleryExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
            artilleryExhaustHole.material = artilleryExhaustHoleMat;
        }
        
        if (this.chassisType.id === "destroyer") {
            // Destroyer - длинный клиновидный нос, низкий профиль
            const destroyerNose = MeshBuilder.CreateBox("destroyerNose", {
                width: w * 0.85,
                height: h * 0.55,
                depth: 0.35
            }, scene);
            destroyerNose.position = new Vector3(0, 0, d * 0.52);
            destroyerNose.parent = chassis;
            destroyerNose.material = accentMat;
            
            // Боковые бронеплиты
            for (let i = 0; i < 2; i++) {
                const sidePlate = MeshBuilder.CreateBox(`destroyerSide${i}`, {
                    width: 0.12,
                    height: h * 0.7,
                    depth: d * 0.5
                }, scene);
                sidePlate.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.15);
                sidePlate.parent = chassis;
                sidePlate.material = armorMat;
            }
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`destroyerHatch${i}`, {
                    width: 0.18,
                    height: 0.06,
                    depth: 0.18
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`destroyerHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.1, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`destroyerHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`destroyerVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.25, -d * 0.25);
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`destroyerVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
            }
            
            // Перископы
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`destroyerPeriscope${i}`, {
                    height: 0.14,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.54, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`destroyerPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Оптический прицел на лобовой части (большой)
            const destroyerSight = MeshBuilder.CreateBox("destroyerSight", {
                width: 0.15,
                height: 0.1,
                depth: 0.12
            }, scene);
            destroyerSight.position = new Vector3(0, h * 0.2, d * 0.48);
            destroyerSight.parent = chassis;
            const destroyerSightMat = new StandardMaterial("destroyerSightMat", scene);
            destroyerSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            destroyerSight.material = destroyerSightMat;
            
            // Линза прицела
            const destroyerSightLens = MeshBuilder.CreateCylinder("destroyerSightLens", {
                height: 0.02,
                diameter: 0.08,
                tessellation: 8
            }, scene);
            destroyerSightLens.position = new Vector3(0, 0, 0.07);
            destroyerSightLens.parent = destroyerSight;
            const destroyerLensMat = new StandardMaterial("destroyerSightLensMat", scene);
            destroyerLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            destroyerLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            destroyerSightLens.material = destroyerLensMat;
            
            // Дополнительные броневые накладки на лобовой части
            for (let i = 0; i < 3; i++) {
                const frontArmor = MeshBuilder.CreateBox(`destroyerFrontArmor${i}`, {
                    width: w * 0.28,
                    height: h * 0.18,
                    depth: 0.1
                }, scene);
                frontArmor.position = new Vector3((i - 1) * w * 0.28, h * 0.05, d * 0.48);
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Верхние вентиляционные решетки на крыше
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateBox(`destroyerRoofVent${i}`, {
                    width: 0.12,
                    height: 0.04,
                    depth: 0.1
                }, scene);
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`destroyerRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
                
                // Детали решетки
                for (let j = 0; j < 3; j++) {
                    const ventBar = MeshBuilder.CreateBox(`destroyerRoofVentBar${i}_${j}`, {
                        width: 0.02,
                        height: 0.03,
                        depth: 0.08
                    }, scene);
                    ventBar.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2 + (j - 1) * 0.03);
                    ventBar.parent = chassis;
                    ventBar.material = roofVentMat;
                }
            }
            
            // Выхлопные трубы сзади (большие)
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`destroyerExhaust${i}`, {
                    height: 0.25,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
                
                // Выхлопное отверстие
                const exhaustHole = MeshBuilder.CreateCylinder(`destroyerExhaustHole${i}`, {
                    height: 0.04,
                    diameter: 0.1,
                    tessellation: 8
                }, scene);
                exhaustHole.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.52);
                exhaustHole.rotation.z = Math.PI / 2;
                exhaustHole.parent = chassis;
                const exhaustHoleMat = new StandardMaterial(`destroyerExhaustHoleMat${i}`, scene);
                exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                exhaustHole.material = exhaustHoleMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`destroyerTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.14, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`destroyerTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`destroyerSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.08, -d * 0.2);
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`destroyerSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Радиоантенна сзади
            const destroyerAntenna = MeshBuilder.CreateCylinder("destroyerAntenna", {
                height: 0.45,
                diameter: 0.025,
                tessellation: 8
            }, scene);
            destroyerAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
            destroyerAntenna.parent = chassis;
            const destroyerAntennaMat = new StandardMaterial("destroyerAntennaMat", scene);
            destroyerAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            destroyerAntenna.material = destroyerAntennaMat;
            
            // Основание антенны
            const destroyerAntennaBase = MeshBuilder.CreateBox("destroyerAntennaBase", {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            }, scene);
            destroyerAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
            destroyerAntennaBase.parent = chassis;
            destroyerAntennaBase.material = armorMat;
            
            // Дополнительные инструменты на корме
            const destroyerToolBox = MeshBuilder.CreateBox("destroyerToolBox", {
                width: 0.2,
                height: 0.14,
                depth: 0.16
            }, scene);
            destroyerToolBox.position = new Vector3(0, h * 0.24, -d * 0.42);
            destroyerToolBox.parent = chassis;
            destroyerToolBox.material = armorMat;
        }
        
        if (this.chassisType.id === "command") {
            // Command - аура, множественные антенны, командный модуль
            const commandAura = MeshBuilder.CreateTorus("commandAura", {
                diameter: w * 1.6,
                thickness: 0.06,
                tessellation: 20
            }, scene);
            commandAura.position = new Vector3(0, h * 0.55, 0);
            commandAura.rotation.x = Math.PI / 2;
            commandAura.parent = chassis;
            const auraMat = new StandardMaterial("auraMat", scene);
            auraMat.diffuseColor = new Color3(1, 0.88, 0);
            auraMat.emissiveColor = new Color3(0.6, 0.5, 0);
            auraMat.disableLighting = true;
            commandAura.material = auraMat;
            this.chassisAnimationElements.commandAura = commandAura;
            
            // Командный модуль сверху
            const commandModule = MeshBuilder.CreateBox("commandModule", {
                width: w * 0.6,
                height: h * 0.3,
                depth: d * 0.4
            }, scene);
            commandModule.position = new Vector3(0, h * 0.6, -d * 0.3);
            commandModule.parent = chassis;
            const moduleMat = new StandardMaterial("moduleMat", scene);
            moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
            moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
            commandModule.material = moduleMat;
            
            // Множественные антенны
            for (let i = 0; i < 4; i++) {
                const antenna = MeshBuilder.CreateCylinder(`cmdAntenna${i}`, {
                    height: 0.5,
                    diameter: 0.025
                }, scene);
                antenna.position = new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.35,
                    h * 0.7,
                    (i < 2 ? -1 : 1) * d * 0.35
                );
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`cmdAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
                antenna.material = antennaMat;
            }
            
            // Люки
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`commandHatch${i}`, {
                    width: 0.22,
                    height: 0.08,
                    depth: 0.22
                }, scene);
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`commandHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, d * 0.48);
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`commandHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Перископы на люках
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`commandPeriscope${i}`, {
                    height: 0.2,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.68, -d * 0.1);
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`commandPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Радиостанции на командном модуле
            for (let i = 0; i < 2; i++) {
                const radio = MeshBuilder.CreateBox(`commandRadio${i}`, {
                    width: 0.15,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                radio.position = new Vector3((i === 0 ? -1 : 1) * w * 0.22, h * 0.72, -d * 0.3);
                radio.parent = chassis;
                const radioMat = new StandardMaterial(`commandRadioMat${i}`, scene);
                radioMat.diffuseColor = new Color3(0.8, 0.7, 0.2);
                radioMat.emissiveColor = new Color3(0.2, 0.15, 0.05);
                radio.material = radioMat;
            }
            
            // Сенсорные панели на командном модуле
            for (let i = 0; i < 3; i++) {
                const sensor = MeshBuilder.CreateBox(`commandSensor${i}`, {
                    width: 0.1,
                    height: 0.06,
                    depth: 0.08
                }, scene);
                sensor.position = new Vector3((i - 1) * w * 0.18, h * 0.72, -d * 0.2);
                sensor.parent = chassis;
                const sensorMat = new StandardMaterial(`commandSensorMat${i}`, scene);
                sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
                sensorMat.emissiveColor = new Color3(0.3, 0.25, 0);
                sensor.material = sensorMat;
            }
            
            // Верхние вентиляционные решетки на крыше
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateBox(`commandRoofVent${i}`, {
                    width: 0.15,
                    height: 0.04,
                    depth: 0.12
                }, scene);
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`commandRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`commandTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`commandTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Оптический прицел на лобовой части
            const commandSight = MeshBuilder.CreateBox("commandSight", {
                width: 0.14,
                height: 0.09,
                depth: 0.11
            }, scene);
            commandSight.position = new Vector3(0, h * 0.22, d * 0.49);
            commandSight.parent = chassis;
            const commandSightMat = new StandardMaterial("commandSightMat", scene);
            commandSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            commandSight.material = commandSightMat;
            
            // Линза прицела
            const commandSightLens = MeshBuilder.CreateCylinder("commandSightLens", {
                height: 0.02,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            commandSightLens.position = new Vector3(0, 0, 0.06);
            commandSightLens.parent = commandSight;
            const commandLensMat = new StandardMaterial("commandSightLensMat", scene);
            commandLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            commandLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            commandSightLens.material = commandLensMat;
            
            // Выхлопные трубы сзади
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`commandExhaust${i}`, {
                    height: 0.22,
                    diameter: 0.12,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`commandSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`commandSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
        }
        
        // Антенны для medium/heavy/assault
        if (this.chassisType.id === "medium" || this.chassisType.id === "heavy" || this.chassisType.id === "assault") {
            const antenna = MeshBuilder.CreateCylinder("antenna", {
                height: 0.35,
                diameter: 0.025
            }, scene);
            antenna.position = new Vector3(w * 0.42, h * 0.65, -d * 0.42);
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial("antennaMat", scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
        }
    }
    
    // ============ UNIQUE CANNON CREATION ============
    private createUniqueCannon(scene: Scene, barrelWidth: number, barrelLength: number): Mesh {
        const cannonColor = Color3.FromHexString(this.cannonType.color);
        
        let barrel: Mesh;
        
        switch (this.cannonType.id) {
            case "sniper":
                // Sniper - Прототип: ПТРД / Д-44 - Длинная противотанковая пушка
                // Основной ствол - прямоугольный Box (очень длинный и тонкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.5,
                    depth: barrelLength * 2.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                const scopeMat = new StandardMaterial("scopeMat", scene);
                scopeMat.diffuseColor = new Color3(0.15, 0.15, 0.15);  // Советский темно-зеленый
                scopeMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
                
                // ОГРОМНЫЙ прицел (угловатый дизайн из нескольких Box)
                // Основная труба прицела
                const scopeTube = MeshBuilder.CreateBox("scopeTube", {
                    width: barrelWidth * 0.4,
                    height: barrelWidth * 0.4,
                    depth: barrelWidth * 1.5
                }, scene);
                scopeTube.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.7);
                scopeTube.parent = barrel;
                scopeTube.material = scopeMat;
                
                // Угловые пластины для создания угловатого вида (4 Box с наклоном)
                for (let i = 0; i < 4; i++) {
                    const angularPlate = MeshBuilder.CreateBox(`scopePlate${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelWidth * 0.4,
                        depth: barrelWidth * 1.5
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    angularPlate.position = new Vector3(
                        barrelWidth * 0.7 + Math.cos(angle) * barrelWidth * 0.25,
                        barrelWidth * 0.6 + Math.sin(angle) * barrelWidth * 0.25,
                        barrelLength * 0.7
                    );
                    angularPlate.rotation.z = angle;
                    angularPlate.parent = barrel;
                    angularPlate.material = scopeMat;
                }
                
                // Линза прицела (прямоугольный Box с emissive)
                const scopeLens = MeshBuilder.CreateBox("scopeLens", {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * 0.2
                }, scene);
                scopeLens.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.85);
                scopeLens.parent = barrel;
                const lensMat = new StandardMaterial("scopeLensMat", scene);
                lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                lensMat.emissiveColor = new Color3(0.1, 0.2, 0.3);
                scopeLens.material = lensMat;
                this.cannonAnimationElements.sniperLens = scopeLens;  // Для анимации
                
                // Регулировочный блок
                const scopeAdjustment = MeshBuilder.CreateBox("scopeAdjustment", {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.3
                }, scene);
                scopeAdjustment.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.6);
                scopeAdjustment.parent = barrel;
                scopeAdjustment.material = scopeMat;
                
                // Сошки (характерные для ПТРД) - прямоугольные Box с наклоном
                for (let i = 0; i < 2; i++) {
                    const bipod = MeshBuilder.CreateBox(`bipod${i}`, {
                        width: 0.12,
                        height: barrelWidth * 1.0,
                        depth: 0.12
                    }, scene);
                    bipod.position = new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.45, 
                        -barrelWidth * 0.5, 
                        barrelLength * 0.75
                    );
                    bipod.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                    bipod.parent = barrel;
                    bipod.material = scopeMat;
                }
                
                // Стабилизаторы по бокам (тонкие Box)
                for (let i = 0; i < 3; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`sniperStabilizer${i}`, {
                        width: 0.06,
                        height: barrelLength * 0.35,
                        depth: 0.06
                    }, scene);
                    stabilizer.position = new Vector3(
                        (i === 0 ? -1 : i === 1 ? 1 : 0) * barrelWidth * 0.3, 
                        (i === 2 ? 1 : 0) * barrelWidth * 0.3,
                        barrelLength * 0.25 + i * barrelLength * 0.2
                    );
                    stabilizer.parent = barrel;
                    stabilizer.material = scopeMat;
                }
                
                // Дульный тормоз - 2 слоя прямоугольных коробок
                for (let i = 0; i < 2; i++) {
                    const muzzleLayer = MeshBuilder.CreateBox(`sniperMuzzle${i}`, {
                        width: barrelWidth * (0.75 - i * 0.1),
                        height: barrelWidth * (0.75 - i * 0.1),
                        depth: barrelWidth * 0.2
                    }, scene);
                    muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.95 + i * barrelWidth * 0.2);
                    muzzleLayer.parent = barrel;
                    muzzleLayer.material = scopeMat;
                }
                
                // Детали дульного тормоза (отверстия) - 6 маленьких Box вместо отверстий
                for (let i = 0; i < 6; i++) {
                    const brakeHole = MeshBuilder.CreateBox(`brakeHole${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelWidth * 0.08,
                        depth: barrelWidth * 0.5
                    }, scene);
                    const angle = (i * Math.PI * 2) / 6;
                    brakeHole.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.25,
                        Math.sin(angle) * barrelWidth * 0.25,
                        barrelLength * 0.95
                    );
                    brakeHole.parent = barrel;
                    brakeHole.material = scopeMat;
                }
                break;
                
            case "gatling":
                // Gatling - Прототип: ГШ-6-30 / многоствольная система - Советская скорострельная пушка
                // Основной корпус - прямоугольный Box (короткий и широкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 2.0,
                    height: barrelWidth * 2.0,
                    depth: barrelLength * 0.8
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Вращающиеся стволы - 6 прямоугольных Box в круге (стиль ГШ-6-30) - ANIMATED
                this.cannonAnimationElements.gatlingBarrels = [];
                for (let i = 0; i < 6; i++) {
                    const miniBarrel = MeshBuilder.CreateBox(`minibarrel${i}`, {
                        width: barrelWidth * 0.35,
                        height: barrelWidth * 0.35,
                        depth: barrelLength * 1.1
                    }, scene);
                    const angle = (i * Math.PI * 2 / 6);
                    miniBarrel.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.6,
                        Math.sin(angle) * barrelWidth * 0.6,
                        0
                    );
                    miniBarrel.parent = barrel;
                    const miniMat = new StandardMaterial(`minibarrelMat${i}`, scene);
                    miniMat.diffuseColor = cannonColor.scale(0.8);
                    miniBarrel.material = miniMat;
                    this.cannonAnimationElements.gatlingBarrels.push(miniBarrel);
                }
                
                // Система охлаждения - 4 прямоугольных вентиляционных коробки (Box) вокруг корпуса
                for (let i = 0; i < 4; i++) {
                    const coolingVent = MeshBuilder.CreateBox(`coolingVent${i}`, {
                        width: barrelWidth * 0.25,
                        height: barrelWidth * 0.25,
                        depth: barrelLength * 0.12
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    coolingVent.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.95,
                        Math.sin(angle) * barrelWidth * 0.95,
                        -barrelLength * 0.35 + (i % 2) * barrelLength * 0.12
                    );
                    coolingVent.parent = barrel;
                    const ventMat = new StandardMaterial(`coolingVentMat${i}`, scene);
                    ventMat.diffuseColor = cannonColor.scale(0.6);
                    ventMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
                    coolingVent.material = ventMat;
                }
                
                // Центральный блок питания - 3 слоя прямоугольных коробок (layered_cube) - ANIMATED
                const powerMat = new StandardMaterial("gatlingPowerMat", scene);
                powerMat.diffuseColor = cannonColor.scale(0.5);
                powerMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
                for (let i = 0; i < 3; i++) {
                    const powerLayer = MeshBuilder.CreateBox(`gatlingPowerBlock${i}`, {
                        width: barrelWidth * (1.3 - i * 0.1),
                        height: barrelWidth * (1.3 - i * 0.1),
                        depth: barrelWidth * 0.3
                    }, scene);
                    powerLayer.position = new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.3);
                    powerLayer.parent = barrel;
                    powerLayer.material = powerMat;
                    if (i === 0) {
                        this.cannonAnimationElements.gatlingPowerBlock = powerLayer;  // Для анимации
                    }
                }
                
                // Детали блока питания - 4 прямоугольных Box по углам
                for (let i = 0; i < 4; i++) {
                    const powerDetail = MeshBuilder.CreateBox(`powerDetail${i}`, {
                        width: barrelWidth * 0.15,
                        height: barrelWidth * 0.15,
                        depth: barrelWidth * 0.1
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    powerDetail.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.5,
                        Math.sin(angle) * barrelWidth * 0.5,
                        -barrelLength * 0.5
                    );
                    powerDetail.parent = barrel;
                    powerDetail.material = powerMat;
                }
                
                // Вентиляционные отверстия (угловатые) - 8 прямоугольных Box вокруг корпуса
                for (let i = 0; i < 8; i++) {
                    const vent = MeshBuilder.CreateBox(`gatlingVent${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelWidth * 0.3,
                        depth: barrelWidth * 0.12
                    }, scene);
                    const angle = (i * Math.PI * 2) / 8;
                    vent.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.85,
                        Math.sin(angle) * barrelWidth * 0.85,
                        -barrelLength * 0.2
                    );
                    vent.parent = barrel;
                    vent.material = powerMat;
                }
                break;
                
            case "heavy":
                // Heavy - Прототип: ИС-2 / Д-25Т - Массивная пушка с дульным тормозом
                // Основной ствол - прямоугольный Box (толстый)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.5,
                    height: barrelWidth * 1.5,
                    depth: barrelLength * 1.2
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Массивный казённик (стиль ИС-2) - 4 слоя прямоугольных коробок
                const breechMat = new StandardMaterial("breechMat", scene);
                breechMat.diffuseColor = cannonColor.scale(0.55);
                for (let i = 0; i < 4; i++) {
                    const breechLayer = MeshBuilder.CreateBox(`heavyBreech${i}`, {
                        width: barrelWidth * (1.8 - i * 0.15),
                        height: barrelWidth * (1.8 - i * 0.15),
                        depth: barrelWidth * 0.35
                    }, scene);
                    breechLayer.position = new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.35);
                    breechLayer.parent = barrel;
                    breechLayer.material = breechMat;
                }
                
                // Дульный тормоз (характерный для ИС-2) - 3 слоя прямоугольных коробок
                for (let i = 0; i < 3; i++) {
                    const muzzleLayer = MeshBuilder.CreateBox(`heavyMuzzle${i}`, {
                        width: barrelWidth * (1.6 - i * 0.15),
                        height: barrelWidth * (1.6 - i * 0.15),
                        depth: barrelWidth * 0.17
                    }, scene);
                    muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.55 + i * barrelWidth * 0.17);
                    muzzleLayer.parent = barrel;
                    muzzleLayer.material = breechMat;
                }
                
                // Усилители по бокам ствола (толстые)
                for (let i = 0; i < 2; i++) {
                    const reinforcement = MeshBuilder.CreateBox(`heavyReinforcement${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.8,
                        depth: barrelWidth * 0.12
                    }, scene);
                    reinforcement.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.7, 0, barrelLength * 0.1);
                    reinforcement.parent = barrel;
                    reinforcement.material = breechMat;
                }
                break;
                
            case "rapid":
                // Rapid - Прототип: Т-34-76 / ЗИС-3 - Быстрая пушка
                // Основной ствол - прямоугольный Box (короткий и компактный)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.8,
                    height: barrelWidth * 0.8,
                    depth: barrelLength * 0.7
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Компактный казённик - 2 слоя прямоугольных коробок
                for (let i = 0; i < 2; i++) {
                    const breechLayer = MeshBuilder.CreateBox(`rapidBreech${i}`, {
                        width: barrelWidth * (1.2 - i * 0.1),
                        height: barrelWidth * (1.2 - i * 0.1),
                        depth: barrelWidth * 0.35
                    }, scene);
                    breechLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.35);
                    breechLayer.parent = barrel;
                    breechLayer.material = barrel.material;
                }
                
                // Небольшой дульный тормоз - 1 слой прямоугольной коробки
                const rapidMuzzle = MeshBuilder.CreateBox("rapidMuzzle", {
                    width: barrelWidth * 0.9,
                    height: barrelWidth * 0.9,
                    depth: barrelWidth * 0.25
                }, scene);
                rapidMuzzle.position = new Vector3(0, 0, barrelLength * 0.35);
                rapidMuzzle.parent = barrel;
                rapidMuzzle.material = barrel.material;
                
                // Стабилизаторы - 2 тонких Box по бокам
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`rapidStabilizer${i}`, {
                        width: barrelWidth * 0.06,
                        height: barrelLength * 0.5,
                        depth: barrelWidth * 0.06
                    }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, 0, barrelLength * 0.1);
                    stabilizer.parent = barrel;
                    stabilizer.material = barrel.material;
                }
                break;
                
            // === ENERGY WEAPONS ===
            case "plasma":
                // Plasma - Прототип: Футуристическая плазменная пушка (советский стиль)
                // Основной ствол - прямоугольный Box с расширением к концу (создать из нескольких Box)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.0,
                    height: barrelWidth * 1.0,
                    depth: barrelLength * 1.2
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Расширение ствола к концу (создать из нескольких Box)
                for (let i = 0; i < 3; i++) {
                    const expansion = MeshBuilder.CreateBox(`plasmaExpansion${i}`, {
                        width: barrelWidth * (1.0 + i * 0.25),
                        height: barrelWidth * (1.0 + i * 0.25),
                        depth: barrelLength * 0.4
                    }, scene);
                    expansion.position = new Vector3(0, 0, barrelLength * 0.2 + i * barrelLength * 0.4);
                    expansion.parent = barrel;
                    expansion.material = barrel.material;
                }
                
                // Энергетическое ядро - 3 слоя кубических Box (layered_cube) - ANIMATED
                const coreMat = new StandardMaterial("plasmaCoreMat", scene);
                coreMat.diffuseColor = new Color3(0.8, 0.2, 0.8);  // Советский фиолетовый
                coreMat.emissiveColor = new Color3(0.6, 0, 0.6);
                coreMat.disableLighting = true;
                for (let i = 0; i < 3; i++) {
                    const coreLayer = MeshBuilder.CreateBox(`plasmaCore${i}`, {
                        width: barrelWidth * (1.2 - i * 0.1),
                        height: barrelWidth * (1.2 - i * 0.1),
                        depth: barrelWidth * (1.2 - i * 0.1)
                    }, scene);
                    coreLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
                    coreLayer.parent = barrel;
                    coreLayer.material = coreMat;
                    if (i === 0) {
                        this.cannonAnimationElements.plasmaCore = coreLayer;  // Для анимации
                    }
                }
                
                // Энергетические катушки - 3 квадратных кольца из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.plasmaCoils = [];
                for (let i = 0; i < 3; i++) {
                    const ringSize = barrelWidth * 1.4;
                    const ringThickness = barrelWidth * 0.12;
                    const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`plasmaCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`plasmaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`plasmaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`plasmaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    const coilMat = new StandardMaterial(`plasmaCoilMat${i}`, scene);
                    coilMat.diffuseColor = new Color3(0.7, 0, 0.7);
                    coilMat.emissiveColor = new Color3(0.4, 0, 0.4);
                    ringParts.forEach(part => part.material = coilMat);
                    this.cannonAnimationElements.plasmaCoils.push(...ringParts);
                }
                
                // Энергетические стабилизаторы (тонкие Box)
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`plasmaStabilizer${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.6,
                        depth: barrelWidth * 0.12
                    }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.65, 0, barrelLength * 0.1);
                    stabilizer.parent = barrel;
                    stabilizer.material = coreMat;
                }
                
                // Энергетический эмиттер - комбинация из 4 прямоугольных Box (multi_box_emitters)
                for (let j = 0; j < 4; j++) {
                    const emitterPart = MeshBuilder.CreateBox(`plasmaEmitter${j}`, {
                        width: barrelWidth * 0.9,
                        height: barrelWidth * 0.1,
                        depth: barrelWidth * 0.9
                    }, scene);
                    emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1);
                    emitterPart.parent = barrel;
                    emitterPart.material = coreMat;
                }
                break;
                
            case "laser":
                // Laser - Прототип: Футуристический лазер (советский стиль)
                // Основной ствол - прямоугольный Box (очень длинный и тонкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.6,
                    height: barrelWidth * 0.6,
                    depth: barrelLength * 1.8
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Линза на конце (прямоугольный Box) - ANIMATED
                const lens = MeshBuilder.CreateBox("lens", {
                    width: barrelWidth * 0.9,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 0.9
                }, scene);
                lens.position = new Vector3(0, 0, barrelLength * 0.6);
                lens.parent = barrel;
                const laserLensMat = new StandardMaterial("laserLensMat", scene);
                laserLensMat.diffuseColor = new Color3(0.8, 0.15, 0);  // Советский красный
                laserLensMat.emissiveColor = new Color3(0.5, 0, 0);
                laserLensMat.disableLighting = true;
                lens.material = laserLensMat;
                this.cannonAnimationElements.laserLens = lens;
                
                // Фокусирующие кольца - 3 квадратных кольца из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.laserRings = [];
                for (let i = 0; i < 3; i++) {
                    const ringSize = barrelWidth * 1.0;
                    const ringThickness = barrelWidth * 0.08;
                    const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.25;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`laserRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`laserRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`laserRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`laserRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    const ringMat = new StandardMaterial(`focusRingMat${i}`, scene);
                    ringMat.diffuseColor = new Color3(0.7, 0, 0);
                    ringMat.emissiveColor = new Color3(0.25, 0, 0);
                    ringParts.forEach(part => part.material = ringMat);
                    this.cannonAnimationElements.laserRings.push(...ringParts);
                }
                
                // Энергетические каналы (тонкие Box)
                for (let i = 0; i < 2; i++) {
                    const channel = MeshBuilder.CreateBox(`laserChannel${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 1.1,
                        depth: barrelWidth * 0.08
                    }, scene);
                    channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, 0, barrelLength * 0.1);
                    channel.parent = barrel;
                    channel.material = laserLensMat;
                }
                
                // Защитный кожух (прямоугольная пластина)
                const housing = MeshBuilder.CreateBox("laserHousing", {
                    width: barrelWidth * 0.85,
                    height: barrelWidth * 0.25,
                    depth: barrelLength * 1.2
                }, scene);
                housing.position = new Vector3(0, barrelWidth * 0.35, barrelLength * 0.05);
                housing.parent = barrel;
                const housingMat = new StandardMaterial("laserHousingMat", scene);
                housingMat.diffuseColor = cannonColor.scale(0.6);
                housing.material = housingMat;
                break;
                
            case "tesla":
                // Tesla - Прототип: Футуристическая катушка Тесла (советский стиль)
                // Основной корпус - прямоугольный Box (широкий и короткий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.8,
                    height: barrelWidth * 1.8,
                    depth: barrelLength * 0.9
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Вращающиеся катушки Тесла - 5 квадратных колец из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.teslaCoils = [];
                for (let i = 0; i < 5; i++) {
                    const ringSize = barrelWidth * 0.8;
                    const ringThickness = barrelWidth * 0.15;
                    const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`teslaCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`teslaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`teslaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`teslaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    const coilMat = new StandardMaterial(`teslaCoilMat${i}`, scene);
                    coilMat.diffuseColor = new Color3(0, 0.7, 0.9);  // Советский голубой
                    coilMat.emissiveColor = new Color3(0, 0.4, 0.6);
                    ringParts.forEach(part => part.material = coilMat);
                    this.cannonAnimationElements.teslaCoils.push(...ringParts);
                }
                
                // Электрические разрядники (прямоугольные Box)
                for (let i = 0; i < 4; i++) {
                    const discharger = MeshBuilder.CreateBox(`teslaDischarger${i}`, {
                        width: barrelWidth * 0.2,
                        height: barrelWidth * 0.4,
                        depth: barrelWidth * 0.2
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    discharger.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.45,
                        barrelLength * 0.2
                    );
                    discharger.parent = barrel;
                    const dischargerMat = new StandardMaterial(`teslaDischargerMat${i}`, scene);
                    dischargerMat.diffuseColor = new Color3(0, 0.7, 0.9);
                    dischargerMat.emissiveColor = new Color3(0, 0.4, 0.6);
                    discharger.material = dischargerMat;
                }
                
                // Центральный генератор - 3 слоя кубических Box (layered_cube) - ANIMATED
                const genMat = new StandardMaterial("teslaGenMat", scene);
                genMat.diffuseColor = new Color3(0, 0.9, 1);
                genMat.emissiveColor = new Color3(0, 0.6, 0.8);
                genMat.disableLighting = true;
                for (let i = 0; i < 3; i++) {
                    const genLayer = MeshBuilder.CreateBox(`teslaGen${i}`, {
                        width: barrelWidth * (0.6 - i * 0.05),
                        height: barrelWidth * (0.6 - i * 0.05),
                        depth: barrelWidth * (0.6 - i * 0.05)
                    }, scene);
                    genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
                    genLayer.parent = barrel;
                    genLayer.material = genMat;
                    if (i === 0) {
                        this.cannonAnimationElements.teslaGen = genLayer;  // Для анимации
                    }
                }
                break;
                
            case "railgun":
                // Railgun - Прототип: Футуристический рельсотрон (советский стиль)
                // Основной ствол - прямоугольный Box (очень длинный и узкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.6,
                    height: barrelWidth * 0.6,
                    depth: barrelLength * 2.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Рельсы (угловатые, low-poly)
                const rail1 = MeshBuilder.CreateBox("rail1", {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.8,
                    depth: barrelLength * 2.0
                }, scene);
                rail1.position = new Vector3(-barrelWidth * 0.45, 0, 0);
                rail1.parent = barrel;
                const railMat = new StandardMaterial("railMat", scene);
                railMat.diffuseColor = new Color3(0.1, 0.3, 0.8);  // Советский синий
                railMat.emissiveColor = new Color3(0.05, 0.15, 0.4);
                rail1.material = railMat;
                
                const rail2 = MeshBuilder.CreateBox("rail2", {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.8,
                    depth: barrelLength * 2.0
                }, scene);
                rail2.position = new Vector3(barrelWidth * 0.45, 0, 0);
                rail2.parent = barrel;
                rail2.material = railMat;
                
                // Конденсаторы (угловатые, low-poly)
                this.cannonAnimationElements.railgunCapacitors = [];
                for (let i = 0; i < 3; i++) {
                    const capacitor = MeshBuilder.CreateBox(`capacitor${i}`, {
                        width: barrelWidth * 0.5,
                        height: barrelWidth * 0.5,
                        depth: barrelWidth * 0.5
                    }, scene);
                    capacitor.position = new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.4 + i * barrelLength * 0.3);
                    capacitor.parent = barrel;
                    capacitor.material = railMat;
                    this.cannonAnimationElements.railgunCapacitors.push(capacitor);
                }
                
                // Энергетические каналы (угловатые)
                for (let i = 0; i < 3; i++) {
                    const channel = MeshBuilder.CreateBox(`railChannel${i}`, {
                        width: barrelWidth * 0.25,
                        height: barrelWidth * 0.12,
                        depth: barrelLength * 0.25
                    }, scene);
                    channel.position = new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.3);
                    channel.parent = barrel;
                    channel.material = railMat;
                }
                
                // Дульный усилитель (угловатый)
                const muzzleAmp = MeshBuilder.CreateBox("railgunMuzzleAmp", {
                    width: barrelWidth * 1.2,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 1.2
                }, scene);
                muzzleAmp.position = new Vector3(0, 0, barrelLength * 0.95);
                muzzleAmp.parent = barrel;
                muzzleAmp.material = railMat;
                break;
                
            // === EXPLOSIVE WEAPONS ===
            case "rocket":
                // Rocket - Прототип: РПГ / РПГ-7 - Ракетная установка
                // Основной корпус - широкий и короткий (угловатый)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.7, 
                    height: barrelWidth * 1.7, 
                    depth: barrelLength * 1.1 
                }, scene);
                
                // Пусковая труба (угловатая, low-poly) - ANIMATED
                const tube = MeshBuilder.CreateBox("tube", {
                    width: barrelWidth * 1.5,
                    height: barrelWidth * 1.5,
                    depth: barrelLength * 1.0 
                }, scene);
                tube.position = new Vector3(0, 0, 0);
                tube.parent = barrel;
                const tubeMat = new StandardMaterial("rocketTubeMat", scene);
                tubeMat.diffuseColor = cannonColor.scale(0.8);
                tube.material = tubeMat;
                this.cannonAnimationElements.rocketTube = tube;
                
                // Направляющие рельсы (угловатые, low-poly)
                this.cannonAnimationElements.rocketGuides = [];
                for (let i = 0; i < 6; i++) {
                    const guide = MeshBuilder.CreateBox(`guide${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelLength * 0.85,
                        depth: barrelWidth * 0.1
                    }, scene);
                    const angle = (i * Math.PI * 2) / 6;
                    guide.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.65,
                        0
                    );
                    guide.parent = barrel;
                    guide.material = tubeMat;
                    this.cannonAnimationElements.rocketGuides.push(guide);
                }
                
                // Стабилизаторы на конце (угловатые)
                for (let i = 0; i < 4; i++) {
                    const fin = MeshBuilder.CreateBox(`rocketFin${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelWidth * 0.25,
                        depth: barrelWidth * 0.08
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    fin.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.75,
                        Math.sin(angle) * barrelWidth * 0.75,
                        barrelLength * 0.4
                    );
                    fin.parent = barrel;
                    fin.material = tubeMat;
                }
                
                // Система наведения (угловатая)
                const guidance = MeshBuilder.CreateBox("rocketGuidance", {
                    width: barrelWidth * 0.45,
                    height: barrelWidth * 0.25,
                    depth: barrelWidth * 0.45
                }, scene);
                guidance.position = new Vector3(0, barrelWidth * 0.65, -barrelLength * 0.2);
                guidance.parent = barrel;
                const guidanceMat = new StandardMaterial("rocketGuidanceMat", scene);
                guidanceMat.diffuseColor = new Color3(0.15, 0.7, 0.15);  // Советский зеленый
                guidanceMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
                guidance.material = guidanceMat;
                break;
                
            case "mortar":
                // Mortar - Прототип: Миномет / 2Б9 Василек - Короткая, очень толстая
                // Основной ствол - прямоугольный Box (ОГРОМНЫЙ и короткий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 2.5,
                    height: barrelWidth * 2.5,
                    depth: barrelLength * 0.6
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Массивное основание - 3 слоя прямоугольных коробок (layered_base) - ANIMATED
                const baseMat = new StandardMaterial("mortarBaseMat", scene);
                baseMat.diffuseColor = cannonColor.scale(0.6);
                for (let i = 0; i < 3; i++) {
                    const baseLayer = MeshBuilder.CreateBox(`mortarBase${i}`, {
                        width: barrelWidth * (2.4 - i * 0.2),
                        height: barrelWidth * 0.2,
                        depth: barrelWidth * (2.4 - i * 0.2)
                    }, scene);
                    baseLayer.position = new Vector3(0, -barrelWidth * 0.7 - i * barrelWidth * 0.2, 0);
                    baseLayer.parent = barrel;
                    baseLayer.material = baseMat;
                    if (i === 0) {
                        this.cannonAnimationElements.mortarBase = baseLayer;  // Для анимации
                    }
                }
                
                // Опорные ноги (прямоугольные Box под углом с rotation)
                this.cannonAnimationElements.mortarLegs = [];
                for (let i = 0; i < 3; i++) {
                    const leg = MeshBuilder.CreateBox(`mortarLeg${i}`, {
                        width: barrelWidth * 0.18,
                        height: barrelWidth * 0.45,
                        depth: barrelWidth * 0.18
                    }, scene);
                    const angle = (i * Math.PI * 2) / 3;
                    leg.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.95,
                        -barrelWidth * 0.95,
                        Math.sin(angle) * barrelWidth * 0.25
                    );
                    leg.rotation.y = angle;
                    leg.parent = barrel;
                    leg.material = baseMat;
                    this.cannonAnimationElements.mortarLegs.push(leg);
                }
                
                // Усилители по бокам (прямоугольные Box)
                for (let i = 0; i < 2; i++) {
                    const reinforcement = MeshBuilder.CreateBox(`mortarReinforcement${i}`, {
                        width: barrelWidth * 0.25,
                        height: barrelLength * 0.5,
                        depth: barrelWidth * 0.25
                    }, scene);
                    reinforcement.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 1.05, 0, 0);
                    reinforcement.parent = barrel;
                    reinforcement.material = baseMat;
                }
                break;
                
            case "cluster":
                // Cluster - Прототип: РСЗО / Катюша - Множественные стволы
                // Основной корпус - широкий (угловатый)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.8, 
                    height: barrelWidth * 1.8, 
                    depth: barrelLength * 1.1 
                }, scene);
                
                // Множественные трубы кластера (угловатые, low-poly) - ANIMATED
                this.cannonAnimationElements.clusterTubes = [];
                for (let i = 0; i < 6; i++) {
                    const clusterTube = MeshBuilder.CreateBox(`cluster${i}`, {
                        width: barrelWidth * 0.35,
                        height: barrelWidth * 0.35,
                        depth: barrelLength * 0.9
                    }, scene);
                    const angle = (i * Math.PI * 2 / 6);
                    clusterTube.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.5,
                        Math.sin(angle) * barrelWidth * 0.5,
                        0
                    );
                    clusterTube.parent = barrel;
                    const tubeMat = new StandardMaterial(`clusterTubeMat${i}`, scene);
                    tubeMat.diffuseColor = cannonColor.scale(0.9);
                    clusterTube.material = tubeMat;
                    this.cannonAnimationElements.clusterTubes.push(clusterTube);
                }
                
                // Центральная труба (угловатая)
                const centerTube = MeshBuilder.CreateBox("clusterCenter", {
                    width: barrelWidth * 0.4,
                    height: barrelWidth * 0.4,
                    depth: barrelLength * 0.95
                }, scene);
                centerTube.position = new Vector3(0, 0, 0);
                centerTube.parent = barrel;
                centerTube.material = barrel.material;
                this.cannonAnimationElements.clusterCenterTube = centerTube;
                
                // Стабилизаторы между трубами (угловатые)
                for (let i = 0; i < 6; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`clusterStabilizer${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 0.6,
                        depth: barrelWidth * 0.08
                    }, scene);
                    const angle = (i * Math.PI * 2 / 6) + Math.PI / 6;
                    stabilizer.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.65,
                        barrelLength * 0.1
                    );
                    stabilizer.parent = barrel;
                    stabilizer.material = barrel.material;
                }
                break;
                
            case "explosive":
                // Explosive - Прототип: ИСУ-152 / МЛ-20 - Толстая гаубица
                // Основной ствол - прямоугольный Box (толстый)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.6,
                    height: barrelWidth * 1.6,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Усиленный казённик (угловатый)
                const explosiveBreech = MeshBuilder.CreateBox("explosiveBreech", {
                    width: barrelWidth * 1.9,
                    height: barrelWidth * 1.9,
                    depth: barrelWidth * 1.3
                }, scene);
                explosiveBreech.position = new Vector3(0, 0, -barrelLength * 0.5);
                explosiveBreech.parent = barrel;
                const explosiveBreechMat = new StandardMaterial("explosiveBreechMat", scene);
                explosiveBreechMat.diffuseColor = cannonColor.scale(0.7);
                explosiveBreech.material = explosiveBreechMat;
                
                // Дульный усилитель (угловатый)
                const explosiveMuzzle = MeshBuilder.CreateBox("explosiveMuzzle", {
                    width: barrelWidth * 1.6,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 1.6
                }, scene);
                explosiveMuzzle.position = new Vector3(0, 0, barrelLength * 0.5);
                explosiveMuzzle.parent = barrel;
                explosiveMuzzle.material = explosiveBreechMat;
                
                // Взрывные каналы по бокам (угловатые)
                for (let i = 0; i < 4; i++) {
                    const channel = MeshBuilder.CreateBox(`explosiveChannel${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelLength * 0.7,
                        depth: barrelWidth * 0.1
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    channel.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.65,
                        barrelLength * 0.05
                    );
                    channel.parent = barrel;
                    channel.material = explosiveBreechMat;
                }
                break;
                
            // === SPECIAL EFFECT WEAPONS ===
            case "flamethrower":
                // Flamethrower - Прототип: Огнемет / РПО-А - Короткая, широкая с соплом
                // Основной корпус - прямоугольный Box (широкий и короткий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.6,
                    height: barrelWidth * 1.6,
                    depth: barrelLength * 0.8
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Сопло - комбинация из 4 прямоугольных Box (multi_box_emitters) - ANIMATED
                const nozzleMat = new StandardMaterial("flamethrowerNozzleMat", scene);
                nozzleMat.diffuseColor = new Color3(0.7, 0.25, 0);  // Советский оранжевый
                nozzleMat.emissiveColor = new Color3(0.25, 0.08, 0);
                for (let j = 0; j < 4; j++) {
                    const nozzlePart = MeshBuilder.CreateBox(`flamethrowerNozzle${j}`, {
                        width: barrelWidth * (1.0 - j * 0.1),
                        height: barrelWidth * (1.0 - j * 0.1),
                        depth: barrelLength * 0.1
                    }, scene);
                    nozzlePart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelLength * 0.1);
                    nozzlePart.parent = barrel;
                    nozzlePart.material = nozzleMat;
                    if (j === 0) {
                        this.cannonAnimationElements.flamethrowerNozzle = nozzlePart;  // Для анимации
                    }
                }
                
                // Топливные баки по бокам (прямоугольные Box с деталями: вентили, шланги)
                for (let i = 0; i < 2; i++) {
                    const tank = MeshBuilder.CreateBox(`flamethrowerTank${i}`, {
                        width: barrelWidth * 0.4,
                        height: barrelWidth * 0.4,
                        depth: barrelLength * 0.7
                    }, scene);
                    tank.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.6, 0, -barrelLength * 0.1);
                    tank.parent = barrel;
                    const tankMat = new StandardMaterial(`flamethrowerTankMat${i}`, scene);
                    tankMat.diffuseColor = cannonColor.scale(0.8);
                    tank.material = tankMat;
                    
                    // Детали бака: вентиль
                    const vent = MeshBuilder.CreateBox(`flamethrowerVent${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelWidth * 0.08,
                        depth: barrelWidth * 0.08
                    }, scene);
                    vent.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.6, barrelWidth * 0.25, -barrelLength * 0.15);
                    vent.parent = barrel;
                    vent.material = tankMat;
                }
                
                // Топливные шланги (угловатые)
                for (let i = 0; i < 2; i++) {
                    const hose = MeshBuilder.CreateBox(`flamethrowerHose${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelWidth * 0.5,
                        depth: barrelWidth * 0.1
                    }, scene);
                    hose.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.35, barrelWidth * 0.25, barrelLength * 0.1);
                    hose.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                    hose.parent = barrel;
                    hose.material = nozzleMat;
                }
                break;
                
            case "acid":
                // Acid - Прототип: Химический распылитель (советский стиль)
                // Основной ствол - прямоугольный Box (средний)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.2,
                    height: barrelWidth * 1.2,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Резервуар с кислотой (прямоугольный Box с деталями: вентили, индикаторы) - ANIMATED
                const tankMat = new StandardMaterial("acidTankMat", scene);
                tankMat.diffuseColor = new Color3(0.15, 0.7, 0.15);  // Советский зеленый
                tankMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
                const acidTank = MeshBuilder.CreateBox("acidTank", {
                    width: barrelWidth * 1.0,
                    height: barrelWidth * 1.8,
                    depth: barrelWidth * 1.0
                }, scene);
                acidTank.position = new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.3);
                acidTank.parent = barrel;
                acidTank.material = tankMat;
                this.cannonAnimationElements.acidTank = acidTank;
                
                // Детали резервуара: вентиль и индикатор
                const vent = MeshBuilder.CreateBox("acidVent", {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.1
                }, scene);
                vent.position = new Vector3(0, barrelWidth * 1.0, -barrelLength * 0.3);
                vent.parent = barrel;
                vent.material = tankMat;
                
                const indicator = MeshBuilder.CreateBox("acidIndicator", {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.05
                }, scene);
                indicator.position = new Vector3(barrelWidth * 0.5, barrelWidth * 0.4, -barrelLength * 0.3);
                indicator.parent = barrel;
                const indicatorMat = new StandardMaterial("acidIndicatorMat", scene);
                indicatorMat.diffuseColor = new Color3(0, 1, 0);
                indicatorMat.emissiveColor = new Color3(0, 0.5, 0);
                indicator.material = indicatorMat;
                
                // Кислотные каналы (угловатые)
                for (let i = 0; i < 3; i++) {
                    const channel = MeshBuilder.CreateBox(`acidChannel${i}`, {
                        width: barrelWidth * 0.15,
                        height: barrelWidth * 0.15,
                        depth: barrelLength * 0.6
                    }, scene);
                    channel.position = new Vector3(
                        (i - 1) * barrelWidth * 0.25,
                        barrelWidth * 0.15,
                        barrelLength * 0.1
                    );
                    channel.parent = barrel;
                    channel.material = tankMat;
                }
                
                // Распылитель - комбинация из нескольких Box (multi_box_emitters) - ANIMATED
                for (let j = 0; j < 3; j++) {
                    const sprayerPart = MeshBuilder.CreateBox(`acidSprayer${j}`, {
                        width: barrelWidth * (1.3 - j * 0.1),
                        height: barrelWidth * 0.1,
                        depth: barrelWidth * (1.3 - j * 0.1)
                    }, scene);
                    sprayerPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1);
                    sprayerPart.parent = barrel;
                    sprayerPart.material = tankMat;
                    if (j === 0) {
                        this.cannonAnimationElements.acidSprayer = sprayerPart;  // Для анимации
                    }
                }
                break;
                
            case "freeze":
                // Freeze - Прототип: Криогенная установка (советский стиль)
                // Основной ствол - прямоугольный Box
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.2,
                    height: barrelWidth * 1.2,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Охлаждающие рёбра - 6 прямоугольных вентиляционных коробок (vent_boxes) вокруг ствола - ANIMATED
                this.cannonAnimationElements.freezeFins = [];
                for (let i = 0; i < 6; i++) {
                    const fin = MeshBuilder.CreateBox(`freezeFin${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.75,
                        depth: barrelWidth * 0.35
                    }, scene);
                    const angle = (i * Math.PI * 2 / 6);
                    fin.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.55,
                        Math.sin(angle) * barrelWidth * 0.55,
                        barrelLength * 0.05
                    );
                    fin.parent = barrel;
                    const finMat = new StandardMaterial(`freezeFinMat${i}`, scene);
                    finMat.diffuseColor = new Color3(0.4, 0.6, 0.9);  // Советский голубой
                    finMat.emissiveColor = new Color3(0.08, 0.15, 0.25);
                    fin.material = finMat;
                    this.cannonAnimationElements.freezeFins.push(fin);
                }
                
                // Криогенный резервуар (прямоугольный Box с деталями) - ANIMATED
                const cryoMat = new StandardMaterial("cryoTankMat", scene);
                cryoMat.diffuseColor = new Color3(0.25, 0.5, 0.9);
                cryoMat.emissiveColor = new Color3(0.08, 0.15, 0.3);
                const cryoTank = MeshBuilder.CreateBox("cryoTank", {
                    width: barrelWidth * 0.7,
                    height: barrelWidth * 0.6,
                    depth: barrelWidth * 0.7
                }, scene);
                cryoTank.position = new Vector3(0, barrelWidth * 0.45, -barrelLength * 0.3);
                cryoTank.parent = barrel;
                cryoTank.material = cryoMat;
                this.cannonAnimationElements.cryoTank = cryoTank;
                
                // Детали резервуара: вентиль
                const cryoVent = MeshBuilder.CreateBox("cryoVent", {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.08
                }, scene);
                cryoVent.position = new Vector3(0, barrelWidth * 0.75, -barrelLength * 0.3);
                cryoVent.parent = barrel;
                cryoVent.material = cryoMat;
                
                // Эмиттер холода - комбинация из нескольких Box (multi_box_emitters)
                for (let j = 0; j < 3; j++) {
                    const emitterPart = MeshBuilder.CreateBox(`freezeEmitter${j}`, {
                        width: barrelWidth * (1.3 - j * 0.1),
                        height: barrelWidth * 0.13,
                        depth: barrelWidth * (1.3 - j * 0.1)
                    }, scene);
                    emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.13);
                    emitterPart.parent = barrel;
                    emitterPart.material = cryoMat;
                }
                break;
                
            case "poison":
                // Poison - Прототип: Химический инжектор (советский стиль)
                // Основной ствол - прямоугольный Box (средний)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.1,
                    height: barrelWidth * 1.1,
                    depth: barrelLength * 0.95
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Резервуар с ядом (прямоугольный Box с деталями) - ANIMATED
                const poisonMat = new StandardMaterial("poisonTankMat", scene);
                poisonMat.diffuseColor = new Color3(0.3, 0.7, 0.15);  // Советский зеленый
                poisonMat.emissiveColor = new Color3(0.15, 0.35, 0.08);
                const poisonTank = MeshBuilder.CreateBox("poisonTank", {
                    width: barrelWidth * 0.6,
                    height: barrelWidth * 1.2,
                    depth: barrelWidth * 0.6
                }, scene);
                poisonTank.position = new Vector3(0, barrelWidth * 0.4, -barrelLength * 0.25);
                poisonTank.parent = barrel;
                poisonTank.material = poisonMat;
                
                // Детали резервуара: вентиль
                const poisonVent = MeshBuilder.CreateBox("poisonVent", {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.08
                }, scene);
                poisonVent.position = new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.25);
                poisonVent.parent = barrel;
                poisonVent.material = poisonMat;
                
                // Инжектор - комбинация из нескольких Box (multi_box_emitters) - ANIMATED
                for (let j = 0; j < 3; j++) {
                    const injectorPart = MeshBuilder.CreateBox(`poisonInjector${j}`, {
                        width: barrelWidth * (0.5 - j * 0.05),
                        height: barrelWidth * 0.2,
                        depth: barrelWidth * (0.5 - j * 0.05)
                    }, scene);
                    injectorPart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2);
                    injectorPart.parent = barrel;
                    injectorPart.material = poisonMat;
                    if (j === 0) {
                        this.cannonAnimationElements.poisonInjector = injectorPart;  // Для анимации
                    }
                }
                
                // Иглы инжектора (угловатые)
                for (let i = 0; i < 4; i++) {
                    const needle = MeshBuilder.CreateBox(`poisonNeedle${i}`, {
                        width: barrelWidth * 0.06,
                        height: barrelWidth * 0.3,
                        depth: barrelWidth * 0.06
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    needle.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.25,
                        Math.sin(angle) * barrelWidth * 0.25,
                        barrelLength * 0.5
                    );
                    needle.parent = barrel;
                    needle.material = poisonMat;
                }
                
                // Каналы подачи яда (угловатые)
                for (let i = 0; i < 2; i++) {
                    const channel = MeshBuilder.CreateBox(`poisonChannel${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelLength * 0.5,
                        depth: barrelWidth * 0.1
                    }, scene);
                    channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.3, barrelWidth * 0.15, barrelLength * 0.1);
                    channel.parent = barrel;
                    channel.material = poisonMat;
                }
                break;
                
            case "emp":
                // EMP - Прототип: ЭМИ излучатель (советский стиль)
                // Основной корпус - прямоугольный Box (широкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.6,
                    height: barrelWidth * 1.6,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Излучатель (угловатый, low-poly) - ANIMATED
                const dish = MeshBuilder.CreateBox("empDish", {
                    width: barrelWidth * 1.8,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 1.8
                }, scene);
                dish.position = new Vector3(0, 0, barrelLength * 0.5);
                dish.parent = barrel;
                const dishMat = new StandardMaterial("empDishMat", scene);
                dishMat.diffuseColor = new Color3(0.7, 0.7, 0.15);  // Советский желтый
                dishMat.emissiveColor = new Color3(0.3, 0.3, 0.08);
                dish.material = dishMat;
                this.cannonAnimationElements.empDish = dish;
                
                // Энергетические катушки - 3 квадратных кольца из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.empCoils = [];
                for (let i = 0; i < 3; i++) {
                    const ringSize = barrelWidth * 1.3;
                    const ringThickness = barrelWidth * 0.1;
                    const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`empCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`empCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`empCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`empCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    ringParts.forEach(part => part.material = dishMat);
                    this.cannonAnimationElements.empCoils.push(...ringParts);
                }
                
                // Генератор EMP - 3 слоя кубических Box (layered_cube) - ANIMATED
                const empGenMat = new StandardMaterial("empGenMat", scene);
                empGenMat.diffuseColor = new Color3(0.9, 0.9, 0.25);
                empGenMat.emissiveColor = new Color3(0.4, 0.4, 0.12);
                empGenMat.disableLighting = true;
                for (let i = 0; i < 3; i++) {
                    const genLayer = MeshBuilder.CreateBox(`empGen${i}`, {
                        width: barrelWidth * (0.7 - i * 0.05),
                        height: barrelWidth * (0.7 - i * 0.05),
                        depth: barrelWidth * (0.7 - i * 0.05)
                    }, scene);
                    genLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
                    genLayer.parent = barrel;
                    genLayer.material = empGenMat;
                    if (i === 0) {
                        this.cannonAnimationElements.empGen = genLayer;  // Для анимации
                    }
                }
                break;
                
            // === MULTI-SHOT WEAPONS ===
            case "shotgun":
                // Shotgun - Прототип: Дробовик / КС-23 - Огромная, множественные стволы
                // Основной корпус - прямоугольный Box (ОГРОМНЫЙ)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 2.2,
                    height: barrelWidth * 2.2,
                    depth: barrelLength * 0.75
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Множественные стволы для дроби (угловатые, low-poly) - ANIMATED
                this.cannonAnimationElements.shotgunBarrels = [];
                for (let i = 0; i < 10; i++) {
                    const pelletBarrel = MeshBuilder.CreateBox(`pelletBarrel${i}`, {
                        width: barrelWidth * 0.18,
                        height: barrelWidth * 0.18,
                    depth: barrelLength * 0.7 
                }, scene);
                    const angle = (i * Math.PI * 2) / 10;
                    pelletBarrel.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.55,
                        Math.sin(angle) * barrelWidth * 0.55,
                        0
                    );
                    pelletBarrel.parent = barrel;
                    const barrelMat = new StandardMaterial(`shotgunBarrelMat${i}`, scene);
                    barrelMat.diffuseColor = cannonColor.scale(0.9);
                    pelletBarrel.material = barrelMat;
                    this.cannonAnimationElements.shotgunBarrels.push(pelletBarrel);
                }
                
                // Центральный ствол (угловатый)
                const centerBarrel = MeshBuilder.CreateBox("shotgunCenter", {
                    width: barrelWidth * 0.25,
                    height: barrelWidth * 0.25,
                    depth: barrelLength * 0.75
                }, scene);
                centerBarrel.position = new Vector3(0, 0, 0);
                centerBarrel.parent = barrel;
                centerBarrel.material = barrel.material;
                
                // Усилители между стволами (угловатые)
                for (let i = 0; i < 5; i++) {
                    const reinforcement = MeshBuilder.CreateBox(`shotgunReinforcement${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 0.45,
                        depth: barrelWidth * 0.08
                    }, scene);
                    const angle = (i * Math.PI * 2) / 5 + Math.PI / 10;
                    reinforcement.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.75,
                        Math.sin(angle) * barrelWidth * 0.75,
                        barrelLength * 0.1
                    );
                    reinforcement.parent = barrel;
                    reinforcement.material = barrel.material;
                }
                break;
                
            case "multishot":
                // Multishot - Прототип: Трехствольная пушка (советский стиль)
                // Основной корпус - широкий прямоугольный
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 2.2, 
                    height: barrelWidth * 1.6, 
                    depth: barrelLength * 1.0 
                }, scene);
                
                // Три ствола (угловатые, low-poly) - ANIMATED
                this.cannonAnimationElements.multishotBarrels = [];
                for (let i = 0; i < 3; i++) {
                    const multiBarrel = MeshBuilder.CreateBox(`multi${i}`, {
                        width: barrelWidth * 0.5,
                        height: barrelWidth * 0.5,
                        depth: barrelLength * 1.05
                    }, scene);
                    multiBarrel.position = new Vector3(
                        (i - 1) * barrelWidth * 0.55,
                        0,
                        0
                    );
                    multiBarrel.parent = barrel;
                    const barrelMat = new StandardMaterial(`multishotBarrelMat${i}`, scene);
                    barrelMat.diffuseColor = cannonColor.scale(0.9);
                    multiBarrel.material = barrelMat;
                    this.cannonAnimationElements.multishotBarrels.push(multiBarrel);
                }
                
                // Объединяющий блок (угловатый)
                const connector = MeshBuilder.CreateBox("multishotConnector", {
                    width: barrelWidth * 1.9,
                    height: barrelWidth * 0.9,
                    depth: barrelWidth * 0.7
                }, scene);
                connector.position = new Vector3(0, 0, -barrelLength * 0.4);
                connector.parent = barrel;
                connector.material = barrel.material;
                this.cannonAnimationElements.multishotConnector = connector;
                
                // Стабилизаторы между стволами (угловатые)
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`multishotStabilizer${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.65,
                        depth: barrelWidth * 0.12
                    }, scene);
                    stabilizer.position = new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.25,
                        0,
                        barrelLength * 0.15
                    );
                    stabilizer.parent = barrel;
                    stabilizer.material = barrel.material;
                }
                break;
                
            // === ADVANCED WEAPONS ===
            case "homing":
                // Homing - Прототип: ПТУР / Конкурс - С системой наведения
                // Основной ствол - прямоугольный Box (средний)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.3,
                    height: barrelWidth * 1.3,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Система наведения - комбинация из нескольких Box (multi_box_guidance) - ANIMATED
                const homingGuidanceMat = new StandardMaterial("homingGuidanceMat", scene);
                homingGuidanceMat.diffuseColor = new Color3(0.08, 0.8, 0.08);  // Советский зеленый
                homingGuidanceMat.emissiveColor = new Color3(0.03, 0.35, 0.03);
                
                // Основной блок
                const homingGuidance = MeshBuilder.CreateBox("homingGuidance", {
                    width: barrelWidth * 0.75,
                    height: barrelWidth * 0.55,
                    depth: barrelWidth * 0.75
                }, scene);
                homingGuidance.position = new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.2);
                homingGuidance.parent = barrel;
                homingGuidance.material = homingGuidanceMat;
                this.cannonAnimationElements.homingGuidance = homingGuidance;
                
                // Блок управления
                const controlBlock = MeshBuilder.CreateBox("homingControl", {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 0.5
                }, scene);
                controlBlock.position = new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.2);
                controlBlock.parent = barrel;
                controlBlock.material = homingGuidanceMat;
                
                // Радарные антенны (тонкие Box)
                this.cannonAnimationElements.homingAntennas = [];
                for (let i = 0; i < 2; i++) {
                    const antenna = MeshBuilder.CreateBox(`homingAntenna${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelWidth * 0.35,
                        depth: barrelWidth * 0.08
                    }, scene);
                    antenna.position = new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.45,
                        barrelWidth * 0.75,
                        -barrelLength * 0.15
                    );
                    antenna.parent = barrel;
                    antenna.material = homingGuidanceMat;
                    this.cannonAnimationElements.homingAntennas.push(antenna);
                }
                
                // Стабилизаторы наведения (угловатые)
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`homingStabilizer${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.55,
                        depth: barrelWidth * 0.12
                    }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.55, 0, barrelLength * 0.1);
                    stabilizer.parent = barrel;
                    stabilizer.material = homingGuidanceMat;
                }
                break;
                
            case "piercing":
                // Piercing - Прототип: Бронебойная пушка / БС-3 - Экстремально длинная и тонкая
                // Основной ствол - прямоугольный Box (ОЧЕНЬ длинный и тонкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.55,
                    height: barrelWidth * 0.55,
                    depth: barrelLength * 2.2
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Острый наконечник - комбинация из нескольких Box с угловыми скосами (multi_box_emitters) - ANIMATED
                const tipMat = new StandardMaterial("piercingTipMat", scene);
                tipMat.diffuseColor = new Color3(0.85, 0.85, 0.85);  // Советский серый
                tipMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
                for (let j = 0; j < 4; j++) {
                    const tipPart = MeshBuilder.CreateBox(`piercingTip${j}`, {
                        width: barrelWidth * (0.3 - j * 0.05),
                        height: barrelWidth * (0.3 - j * 0.05),
                        depth: barrelLength * 0.075
                    }, scene);
                    tipPart.position = new Vector3(0, 0, barrelLength * 0.7 + j * barrelLength * 0.075);
                    tipPart.rotation.y = (j % 2 === 0 ? 1 : -1) * Math.PI / 8;  // Угловой скос
                    tipPart.parent = barrel;
                    tipPart.material = tipMat;
                    if (j === 0) {
                        this.cannonAnimationElements.piercingTip = tipPart;  // Для анимации
                    }
                }
                
                // Усилители прочности (угловатые)
                this.cannonAnimationElements.piercingConduits = [];
                for (let i = 0; i < 2; i++) {
                    const conduit = MeshBuilder.CreateBox(`piercingConduit${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 1.1,
                        depth: barrelWidth * 0.08
                    }, scene);
                    conduit.position = new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.35,
                        0,
                        barrelLength * 0.2
                    );
                    conduit.parent = barrel;
                    conduit.material = barrel.material;
                    this.cannonAnimationElements.piercingConduits.push(conduit);
                }
                
                // Стабилизаторы - 3 квадратных кольца из 4 угловых Box (corner_boxes)
                for (let i = 0; i < 3; i++) {
                    const ringSize = barrelWidth * 0.75;
                    const ringThickness = barrelWidth * 0.06;
                    const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                    
                    // Создаем квадратное кольцо из 4 Box
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`piercingStabilizerTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    top.material = barrel.material;
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`piercingStabilizerBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    bottom.material = barrel.material;
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`piercingStabilizerLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    left.material = barrel.material;
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`piercingStabilizerRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    right.material = barrel.material;
                }
                break;
                
            case "shockwave":
                // Shockwave - Прототип: Ударная волна (советский стиль)
                // Основной корпус - прямоугольный Box (ОГРОМНЫЙ и короткий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 2.2,
                    height: barrelWidth * 2.2,
                    depth: barrelLength * 0.85
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Усилитель - комбинация из нескольких Box (multi_box_emitters) - ANIMATED
                const ampMat = new StandardMaterial("shockwaveAmpMat", scene);
                ampMat.diffuseColor = cannonColor.scale(0.8);
                ampMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
                for (let j = 0; j < 3; j++) {
                    const ampPart = MeshBuilder.CreateBox(`shockwaveAmp${j}`, {
                        width: barrelWidth * (2.2 - j * 0.1),
                        height: barrelWidth * 0.2,
                        depth: barrelWidth * (2.2 - j * 0.1)
                    }, scene);
                    ampPart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2);
                    ampPart.parent = barrel;
                    ampPart.material = ampMat;
                    if (j === 0) {
                        this.cannonAnimationElements.shockwaveAmp = ampPart;  // Для анимации
                    }
                }
                
                // Волновые каналы (угловатые)
                this.cannonAnimationElements.shockwaveEmitters = [];
                for (let i = 0; i < 4; i++) {
                    const emitter = MeshBuilder.CreateBox(`shockwaveEmitter${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.6,
                        depth: barrelWidth * 0.12
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    emitter.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.85,
                        Math.sin(angle) * barrelWidth * 0.85,
                        barrelLength * 0.1
                    );
                    emitter.parent = barrel;
                    emitter.material = ampMat;
                    this.cannonAnimationElements.shockwaveEmitters.push(emitter);
                }
                
                // Генератор ударной волны - 2 слоя прямоугольных коробок
                for (let i = 0; i < 2; i++) {
                    const genLayer = MeshBuilder.CreateBox(`shockwaveGen${i}`, {
                        width: barrelWidth * (0.8 - i * 0.1),
                        height: barrelWidth * (0.8 - i * 0.1),
                        depth: barrelWidth * (0.8 - i * 0.1)
                    }, scene);
                    genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
                    genLayer.parent = barrel;
                    genLayer.material = ampMat;
                }
                break;
                
            case "beam":
                // Beam - Прототип: Лучовая пушка (советский стиль)
                // Основной ствол - прямоугольный Box (длинный)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 0.85,
                    height: barrelWidth * 0.85,
                    depth: barrelLength * 1.6
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Фокусировщик - комбинация из нескольких Box (multi_box_emitters) - ANIMATED
                const focuserMat = new StandardMaterial("beamFocuserMat", scene);
                focuserMat.diffuseColor = new Color3(0.9, 0.4, 0);  // Советский оранжевый
                focuserMat.emissiveColor = new Color3(0.35, 0.15, 0);
                focuserMat.disableLighting = true;
                for (let j = 0; j < 4; j++) {
                    const focuserPart = MeshBuilder.CreateBox(`beamFocuser${j}`, {
                        width: barrelWidth * (0.9 - j * 0.05),
                        height: barrelWidth * 0.125,
                        depth: barrelWidth * (0.9 - j * 0.05)
                    }, scene);
                    focuserPart.position = new Vector3(0, 0, barrelLength * 0.65 + j * barrelWidth * 0.125);
                    focuserPart.parent = barrel;
                    focuserPart.material = focuserMat;
                    if (j === 0) {
                        this.cannonAnimationElements.beamFocuser = focuserPart;  // Для анимации
                    }
                }
                
                // Фокусирующие линзы (угловатые, low-poly)
                this.cannonAnimationElements.beamLenses = [];
                for (let i = 0; i < 3; i++) {
                    const lens = MeshBuilder.CreateBox(`beamLens${i}`, {
                        width: barrelWidth * 0.85,
                        height: barrelWidth * 0.2,
                        depth: barrelWidth * 0.85
                    }, scene);
                    lens.position = new Vector3(0, 0, barrelLength * 0.25 + i * barrelLength * 0.15);
                    lens.parent = barrel;
                    lens.material = focuserMat;
                    this.cannonAnimationElements.beamLenses.push(lens);
                }
                
                // Энергетические каналы (угловатые)
                this.cannonAnimationElements.beamConduits = [];
                for (let i = 0; i < 2; i++) {
                    const channel = MeshBuilder.CreateBox(`beamChannel${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 1.1,
                        depth: barrelWidth * 0.08
                    }, scene);
                    channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, 0, barrelLength * 0.1);
                    channel.parent = barrel;
                    channel.material = focuserMat;
                    this.cannonAnimationElements.beamConduits.push(channel);
                }
                break;
                
            case "vortex":
                // Vortex - Прототип: Вихревой генератор (советский стиль)
                // Основной корпус - прямоугольный Box (широкий)
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.7,
                    height: barrelWidth * 1.7,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Вихревые кольца - 5 квадратных колец из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.vortexRings = [];
                for (let i = 0; i < 5; i++) {
                    const ringSize = barrelWidth * (1.2 + i * 0.15);
                    const ringThickness = barrelWidth * 0.12;
                    const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.15;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`vortexRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`vortexRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`vortexRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`vortexRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    const ringMat = new StandardMaterial(`vortexRingMat${i}`, scene);
                    ringMat.diffuseColor = new Color3(0.4, 0.15, 0.7);  // Советский фиолетовый
                    ringMat.emissiveColor = new Color3(0.15, 0.08, 0.3);
                    ringParts.forEach(part => part.material = ringMat);
                    this.cannonAnimationElements.vortexRings.push(...ringParts);
                }
                
                // Центральный генератор вихря - 3 слоя кубических Box (layered_cube) - ANIMATED
                const vortexGenMat = new StandardMaterial("vortexGenMat", scene);
                vortexGenMat.diffuseColor = new Color3(0.5, 0.25, 0.9);
                vortexGenMat.emissiveColor = new Color3(0.25, 0.12, 0.4);
                vortexGenMat.disableLighting = true;
                for (let i = 0; i < 3; i++) {
                    const genLayer = MeshBuilder.CreateBox(`vortexGen${i}`, {
                        width: barrelWidth * (0.7 - i * 0.05),
                        height: barrelWidth * (0.7 - i * 0.05),
                        depth: barrelWidth * (0.7 - i * 0.05)
                    }, scene);
                    genLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
                    genLayer.parent = barrel;
                    genLayer.material = vortexGenMat;
                    if (i === 0) {
                        this.cannonAnimationElements.vortexGen = genLayer;  // Для анимации
                    }
                }
                break;
                
            case "support":
                // Support - Прототип: Ремонтный луч (советский стиль)
                // Основной ствол - прямоугольный Box
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.3,
                    height: barrelWidth * 1.3,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Ремонтный эмиттер - комбинация из нескольких Box (multi_box_emitters) - ANIMATED
                const supportEmitterMat = new StandardMaterial("supportEmitterMat", scene);
                supportEmitterMat.diffuseColor = new Color3(0, 0.9, 0.45);  // Советский зеленый
                supportEmitterMat.emissiveColor = new Color3(0, 0.35, 0.18);
                supportEmitterMat.disableLighting = true;
                for (let j = 0; j < 4; j++) {
                    const emitterPart = MeshBuilder.CreateBox(`supportEmitter${j}`, {
                        width: barrelWidth * (0.9 - j * 0.05),
                        height: barrelWidth * 0.15,
                        depth: barrelWidth * (0.9 - j * 0.05)
                    }, scene);
                    emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.15);
                    emitterPart.parent = barrel;
                    emitterPart.material = supportEmitterMat;
                    if (j === 0) {
                        this.cannonAnimationElements.supportEmitter = emitterPart;  // Для анимации
                    }
                }
                
                // Лечебные кольца - 3 квадратных кольца из 4 угловых Box (corner_boxes) - ANIMATED
                this.cannonAnimationElements.supportHealingRings = [];
                for (let i = 0; i < 3; i++) {
                    const ringSize = barrelWidth * (0.9 + i * 0.15);
                    const ringThickness = barrelWidth * 0.1;
                    const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.15;
                    
                    // Создаем квадратное кольцо из 4 Box
                    const ringParts: Mesh[] = [];
                    // Верхняя часть
                    const top = MeshBuilder.CreateBox(`supportRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    top.position = new Vector3(0, ringSize / 2, ringZ);
                    top.parent = barrel;
                    ringParts.push(top);
                    // Нижняя часть
                    const bottom = MeshBuilder.CreateBox(`supportRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                    bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                    bottom.parent = barrel;
                    ringParts.push(bottom);
                    // Левая часть
                    const left = MeshBuilder.CreateBox(`supportRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    left.position = new Vector3(-ringSize / 2, 0, ringZ);
                    left.parent = barrel;
                    ringParts.push(left);
                    // Правая часть
                    const right = MeshBuilder.CreateBox(`supportRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                    right.position = new Vector3(ringSize / 2, 0, ringZ);
                    right.parent = barrel;
                    ringParts.push(right);
                    
                    ringParts.forEach(part => part.material = supportEmitterMat);
                    this.cannonAnimationElements.supportHealingRings.push(...ringParts);
                }
                
                // Генератор ремонта - 2 слоя прямоугольных коробок - ANIMATED
                for (let i = 0; i < 2; i++) {
                    const genLayer = MeshBuilder.CreateBox(`repairGen${i}`, {
                        width: barrelWidth * (0.6 - i * 0.05),
                        height: barrelWidth * (0.6 - i * 0.05),
                        depth: barrelWidth * (0.6 - i * 0.05)
                    }, scene);
                    genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
                    genLayer.parent = barrel;
                    genLayer.material = supportEmitterMat;
                    if (i === 0) {
                        this.cannonAnimationElements.repairGen = genLayer;  // Для анимации
                    }
                }
                break;
                
            default: // standard
                // Standard - Прототип: Т-34-85 / Д-5Т - Классическая советская пушка
                // Основной ствол - прямоугольный Box
                barrel = MeshBuilder.CreateBox("barrel", { 
                    width: barrelWidth * 1.0,
                    height: barrelWidth * 1.0,
                    depth: barrelLength * 1.0
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                // Классический казённик (стиль Т-34) - 3 слоя прямоугольных коробок
                const standardBreechMat = new StandardMaterial("standardBreechMat", scene);
                standardBreechMat.diffuseColor = cannonColor.scale(0.7);
                for (let i = 0; i < 3; i++) {
                    const breechLayer = MeshBuilder.CreateBox(`standardBreech${i}`, {
                        width: barrelWidth * (1.4 - i * 0.1),
                        height: barrelWidth * (1.4 - i * 0.1),
                        depth: barrelWidth * 0.3
                    }, scene);
                    breechLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.3);
                    breechLayer.parent = barrel;
                    breechLayer.material = standardBreechMat;
                }
                
                // Дульный тормоз - 2 слоя прямоугольных коробок
                for (let i = 0; i < 2; i++) {
                    const muzzleLayer = MeshBuilder.CreateBox(`standardMuzzle${i}`, {
                        width: barrelWidth * (1.1 - i * 0.1),
                        height: barrelWidth * (1.1 - i * 0.1),
                        depth: barrelWidth * 0.15
                    }, scene);
                    muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.5 + i * barrelWidth * 0.15);
                    muzzleLayer.parent = barrel;
                    muzzleLayer.material = standardBreechMat;
                }
                
                // Защитный кожух ствола
                const barrelShield = MeshBuilder.CreateBox("standardShield", {
                    width: barrelWidth * 1.1,
                    height: barrelWidth * 0.3,
                    depth: barrelLength * 0.6
                }, scene);
                barrelShield.position = new Vector3(0, barrelWidth * 0.4, barrelLength * 0.1);
                barrelShield.parent = barrel;
                barrelShield.material = standardBreechMat;
                
                // Стабилизаторы - 2 тонких Box по бокам
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`standardStabilizer${i}`, {
                        width: barrelWidth * 0.08,
                        height: barrelLength * 0.6,
                        depth: barrelWidth * 0.08
                    }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.5, 0, barrelLength * 0.1);
                    stabilizer.parent = barrel;
                    stabilizer.material = standardBreechMat;
                }
        }
        
        // Barrel material - улучшенный low-poly стиль
        const barrelMat = new StandardMaterial("barrelMat", scene);
        barrelMat.diffuseColor = cannonColor;
        barrelMat.specularColor = Color3.Black();
        barrelMat.freeze();
        barrel.material = barrelMat;
        
        return barrel;
    }

    createVisualWheels() {
        // === SIMPLIFIED TRACKS (optimization!) ===
        const trackMat = new StandardMaterial("trackMat", this.scene);
        trackMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        trackMat.specularColor = Color3.Black();
        trackMat.freeze();
        
        // Left track - just 1 box
        this.leftTrack = MeshBuilder.CreateBox("leftTrack", {
            width: 0.5,
            height: 0.6,
            depth: 3.8
        }, this.scene);
        this.leftTrack.position = new Vector3(-1.3, -0.15, 0);
        this.leftTrack.parent = this.chassis;
        this.leftTrack.material = trackMat;
        
        // Right track - just 1 box
        this.rightTrack = MeshBuilder.CreateBox("rightTrack", {
            width: 0.5,
            height: 0.6,
            depth: 3.8
        }, this.scene);
        this.rightTrack.position = new Vector3(1.3, -0.15, 0);
        this.rightTrack.parent = this.chassis;
        this.rightTrack.material = trackMat;
    }
    

    setupInput() {
        this.scene.actionManager = new ActionManager(this.scene);
        
        // Use window events for better reliability
        const handleKeyDown = (evt: KeyboardEvent) => {
            const code = evt.code;
            this._inputMap[code] = true;
            
            // Debug: Log key presses for movement keys
            if (code === "KeyW" || code === "KeyS" || code === "KeyA" || code === "KeyD" || 
                code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
                console.log(`[KeyPress] ${code} pressed`);
            }
            
            // Активация авто-центрирования по нажатию C
            if (code === "KeyC") {
                this.isAutoCentering = true;
            }
            // Отмена авто-центрирования при ручном управлении башней
            if (code === "KeyZ" || code === "KeyX") {
                this.isAutoCentering = false;
                window.dispatchEvent(new CustomEvent("stopCenterCamera"));
            }
            
            if (code === "Space") this.fire();
            
            // Tracer (T key) - fires tracer round if available and not reloading
            if (code === "KeyT") this.fireTracer();
            
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
            if (code === "Digit0" || code === "Numpad0") {
                // Начинаем зарядку прыжка
                const now = Date.now();
                if (!this.module0Charging && this.canJump && this.physicsBody && this.isAlive) {
                    // Проверка кулдауна
                    if (now - this.module0LastUse < this.module0Cooldown) {
                        const remaining = ((this.module0Cooldown - (now - this.module0LastUse)) / 1000).toFixed(1);
                        if (this.chatSystem) {
                            this.chatSystem.log(`Модуль 0 на кулдауне: ${remaining}с`);
                        }
                        return;
                    }
                    this.module0Charging = true;
                    this.module0ChargeStart = Date.now();
                    this.module0ChargePower = 0;
                }
            }
        };
        
        const handleKeyUp = (evt: KeyboardEvent) => {
            this._inputMap[evt.code] = false;
            
            // Модуль 0: Выполняем прыжок при отпускании кнопки
            if ((evt.code === "Digit0" || evt.code === "Numpad0") && this.module0Charging) {
                this.executeModule0Jump();
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
            
            if (code === "Space" && isPressed) this.fire();
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
        
        // Left click - enter pointer lock and ALWAYS shoot
        this.scene.onPointerDown = (evt) => {
             if (evt.button === 0) { // Left click
                 // Pointer lock handled by browser
                 if (canvas) {
                     canvas.requestPointerLock();
                 }
                 // LMB ALWAYS fires in all modes
                 this.fire();
             }
             if (evt.button === 2) { // Right click - AIM MODE
                 this.toggleAimMode(true);
             }
        };
        
        this.scene.onPointerUp = (evt) => {
            if (evt.button === 2) { // Release right click
                this.toggleAimMode(false);
            }
        };
        
        // Ctrl key for aim mode too
        window.addEventListener("keydown", (e) => {
            if (e.code === "ControlLeft" || e.code === "ControlRight") {
                this.toggleAimMode(true);
            }
        });
        window.addEventListener("keyup", (e) => {
            if (e.code === "ControlLeft" || e.code === "ControlRight") {
                this.toggleAimMode(false);
            }
        });
    }
    
    // === AIM MODE ===
    isAiming = false;
    
    toggleAimMode(enabled: boolean) {
        if (this.isAiming === enabled) return;
        this.isAiming = enabled;
        
        // Dispatch event for camera to handle zoom
        window.dispatchEvent(new CustomEvent("aimModeChanged", { detail: { aiming: enabled } }));
        
        if (this.hud) {
            this.hud.setAimMode(enabled);
        }
    }

    // ============ MOVEMENT MODULE DELEGATION ============
    private updateInputs() {
        return this.movementModule.updateInputs();
    }

    reset() {
        return this.movementModule.reset();
    }

    fire() {
        try {
            if (!this.isAlive) return;
            
            const now = Date.now();
            if (this.isReloading || now - this.lastShotTime < this.cooldown) return;
            
            this.lastShotTime = now;
            this.isReloading = true;
            
            // Start reload on HUD
            if (this.hud) {
                this.hud.startReload(this.cooldown);
                this.hud.notifyPlayerShot(); // Tutorial notification
            }
            
            // End reload after cooldown
            setTimeout(() => {
                this.isReloading = false;
                if (this.soundManager) {
                    this.soundManager.playReloadComplete();
                }
            }, this.cooldown);
            
            // Get muzzle position and direction (exactly along barrel forward)
            // КРИТИЧЕСКИ ВАЖНО: Временно включаем barrel если он скрыт, чтобы получить правильное направление!
            const wasBarrelEnabled = this.barrel.isEnabled();
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(true);
            }
            
            // Force compute world matrix for accurate direction
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);
            
            // Get barrel horizontal direction
            const barrelDir = this.barrel.getDirection(Vector3.Forward()).normalize();
            
            // Apply aimPitch to shooting direction (vertical aiming)
            // This ensures shots go where the camera is aiming
            const shootDirection = new Vector3(
                barrelDir.x * Math.cos(this.aimPitch),
                Math.sin(this.aimPitch),
                barrelDir.z * Math.cos(this.aimPitch)
            ).normalize();
            
            const muzzlePos = this.barrel.getAbsolutePosition().add(barrelDir.scale(1.6));
            
            // Возвращаем состояние barrel обратно
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(false);
            }
            
            // Play shooting sound (с учётом типа пушки) with 3D positioning
            if (this.soundManager) {
                this.soundManager.playShoot(this.cannonType.id, muzzlePos.clone());
            }
            
            // Записываем выстрел для опыта пушки
            if (this.experienceSystem) {
                this.experienceSystem.recordShot(this.cannonType.id);
            }
            // Записываем выстрел в статистику игрока
            if (this.playerProgression) {
                this.playerProgression.recordShot(false);
            }
            
            console.log("[FIRE] Cannon fired!");
            
            // Send shoot event to multiplayer server
            if (this.onShootCallback) {
                this.onShootCallback({
                    position: { x: muzzlePos.x, y: muzzlePos.y, z: muzzlePos.z },
                    direction: { x: shootDirection.x, y: shootDirection.y, z: shootDirection.z },
                    aimPitch: this.aimPitch,
                    cannonType: this.cannonType.id,
                    damage: this.damage,
                    timestamp: Date.now()
                });
            }
            
            // Create muzzle flash effect with cannon type
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos, shootDirection, this.cannonType.id);
            }

            // Special handling for Support cannon
            if (this.cannonType.id === "support") {
                this.fireSupportBeam(muzzlePos, shootDirection);
                return; // Support doesn't create regular projectile
            }
            
            // Create projectile - используем параметры пушки
            const forward = shootDirection;
            
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
            projectileMaterial.metallicFactor = 0.3;
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
            body.setMassProperties({ mass: 15 });
            body.setLinearDamping(0.01);

            // Скорость снаряда из типа пушки
            const impulse = this.projectileSpeed * 18; // Масштабируем для физики
            body.applyImpulse(forward.scale(impulse), ball.position); 

            // === УСИЛЕННАЯ ОТДАЧА ===
            // 1. Физическая отдача - отталкиваем танк назад
            const recoilForceVec = forward.scale(-this.recoilForce);
            this.physicsBody.applyImpulse(recoilForceVec, this.chassis.absolutePosition);
            
            // 2. Угловая отдача - танк наклоняется назад
            const barrelWorldPos = this.barrel.getAbsolutePosition();
            const chassisPos = this.chassis.absolutePosition;
            const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
            this.applyTorque(new Vector3(-torqueDir.z * this.recoilTorque, 0, torqueDir.x * this.recoilTorque));
            
            // 3. Визуальный откат пушки - пушка откатывается назад и поднимается
            // Устанавливаем текущие значения отката (мгновенно)
            this.barrelRecoilOffset = this.barrelRecoilAmount; // Откат пушки назад
            this._barrelRecoilY = 0.15; // Пушка поднимается при отдаче
            // Целевые значения - возврат в исходное положение (0)
            this.barrelRecoilTarget = 0;
            this._barrelRecoilYTarget = 0;
            
            // 4. Выброс гильзы
            this.projectilesModule.createShellCasing(muzzlePos, barrelDir);
            
            // ВАЖНО: Отдача НЕ влияет на камеру - только физика танка и визуальный откат пушки

            // === ПРОВЕРКА ПОПАДАНИЙ ===
            const projectileDamage = this.damage; // Урон из типа пушки
            let hasHit = false;
            let ricochetCount = 0;
            const maxRicochets = 3; // До 3 рикошетов!

            // === ОСНОВНАЯ ПРОВЕРКА ПО РАССТОЯНИЮ (надёжнее чем физика!) ===
            const HIT_RADIUS_TANK = 4.0;   // Радиус попадания в танк
            const HIT_RADIUS_TURRET = 2.5; // Радиус попадания в турель
            
            const checkHit = () => {
                if (hasHit || ball.isDisposed()) return;
                
                const bulletPos = ball.absolutePosition;
                const bulletMeta = ball.metadata as any;
                
                // Homing projectile guidance
                if (bulletMeta?.isHoming && this.enemyTanks && this.enemyTanks.length > 0) {
                    // Find nearest enemy
                    let nearestEnemy: any = null;
                    let nearestDist = 50; // Max homing range
                    
                    for (const enemy of this.enemyTanks) {
                        if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;
                        
                        const dist = Vector3.Distance(bulletPos, enemy.chassis.absolutePosition);
                        if (dist < nearestDist) {
                            nearestDist = dist;
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
                
                // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКАМИ ===
                for (const wallData of this.module6Walls) {
                    if (!wallData.mesh || wallData.mesh.isDisposed()) continue;
                    
                    const wallPos = wallData.mesh.absolutePosition;
                    const wallRotation = wallData.mesh.rotation.y;
                    
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
                        
                        // Получаем урон из metadata пули
                        const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                        
                        // Наносим урон стенке через метод
                        this.damageWall(wallData.mesh, bulletDamage);
                        
                        if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                        if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                        ball.dispose();
                        
                        return;
                    }
                }
                
                // === ПРОВЕРКА ПОПАДАНИЯ В СТЕНКИ ВРАГОВ ===
                const enemyWalls = this.scene.meshes.filter(mesh => 
                    mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                );
                for (const wall of enemyWalls) {
                    const wallPos = wall.absolutePosition;
                    const wallRotation = wall.rotation.y;
                    
                    // Размеры стенки врага: width=5, height=3.5, depth=0.4
                    const wallHalfWidth = 2.5;
                    const wallHalfHeight = 1.75;
                    const wallHalfDepth = 0.2;
                    
                    // Переводим позицию пули в локальную систему координат стенки
                    const localPos = bulletPos.subtract(wallPos);
                    const cosY = Math.cos(-wallRotation);
                    const sinY = Math.sin(-wallRotation);
                    
                    const localX = localPos.x * cosY - localPos.z * sinY;
                    const localY = localPos.y;
                    const localZ = localPos.x * sinY + localPos.z * cosY;
                    
                    // Проверяем, находится ли пуля внутри границ стенки
                    if (Math.abs(localX) < wallHalfWidth && 
                        Math.abs(localY) < wallHalfHeight && 
                        Math.abs(localZ) < wallHalfDepth) {
                        hasHit = true;
                        
                        const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
                        
                        // Наносим урон стенке врага через owner
                        const wallMeta = wall.metadata as any;
                        if (wallMeta && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                            wallMeta.owner.damageEnemyWall(bulletDamage);
                        }
                        
                        console.log(`[TANK] Hit enemy wall! Damage: ${bulletDamage}`);
                        if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                        if (this.soundManager) this.soundManager.playHit("armor", bulletPos);
                        ball.dispose();
                        
                        return;
                    }
                }
                
                // === ПРОВЕРКА ПОПАДАНИЯ В ТУРЕЛИ ===
                if (this.enemyManager) {
                    for (const turret of this.enemyManager.turrets) {
                        if (!turret.isAlive || !turret.base) continue;
                        const dist = Vector3.Distance(bulletPos, turret.base.absolutePosition);
                        if (dist < HIT_RADIUS_TURRET) {
                            hasHit = true;
                            console.log("%c[HIT] TURRET! Damage: " + projectileDamage, "color: red; font-weight: bold");
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
                        // Show hit marker on HUD
                        if (this.hud) {
                            this.hud.showHitMarker(false);
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
                    const dist = Vector3.Distance(bulletPos, enemyPos);
                    
                    if (dist < HIT_RADIUS_TANK) {
                        hasHit = true;
                        const bulletMeta = ball.metadata as any;
                        const cannonTypeId = bulletMeta?.cannonType || this.cannonType.id;
                        const effectType = bulletMeta?.effectType || cannonTypeId;
                        
                        console.log("%c[HIT] ENEMY TANK! Damage: " + projectileDamage + " | Distance: " + dist.toFixed(1), "color: red; font-weight: bold");
                        
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
                
                // === РИКОШЕТ ОТ ЗЕМЛИ ===
                if (bulletPos.y < 0.6 && ricochetCount < maxRicochets) {
                    const velocity = body.getLinearVelocity();
                    if (velocity && velocity.length() > 15) {
                        const direction = velocity.normalize();
                        const groundNormal = new Vector3(0, 1, 0);
                        const incidenceAngle = Math.abs(Vector3.Dot(direction, groundNormal));
                        
                        // Рикошет если угол < 50° (пологий удар)
                        if (incidenceAngle < 0.65) {
                            ricochetCount++;
                            const speed = velocity.length();
                            const reflection = direction.subtract(groundNormal.scale(2 * Vector3.Dot(direction, groundNormal)));
                            body.setLinearVelocity(reflection.scale(speed * 0.8)); // 80% скорости сохраняется
                            ball.position.y = 0.7; // Поднимаем над землёй
                            ball.lookAt(ball.position.add(reflection));
                            if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                            console.log("[RICOCHET] Земля #" + ricochetCount);
                        }
                    }
                }
                
                // === РИКОШЕТ ОТ ГРАНИЦ КАРТЫ (стены) ===
                const mapBorder = 1000; // Увеличено максимальное расстояние для выстрела
                if (Math.abs(bulletPos.x) > mapBorder || Math.abs(bulletPos.z) > mapBorder) {
                    if (ricochetCount < maxRicochets) {
                        const velocity = body.getLinearVelocity();
                        if (velocity && velocity.length() > 15) {
                            ricochetCount++;
                            const speed = velocity.length();
                            const direction = velocity.normalize();
                            
                            // Определяем нормаль стены
                            let wallNormal: Vector3;
                            if (Math.abs(bulletPos.x) > mapBorder) {
                                wallNormal = new Vector3(-Math.sign(bulletPos.x), 0, 0);
                            } else {
                                wallNormal = new Vector3(0, 0, -Math.sign(bulletPos.z));
                            }
                            
                            const reflection = direction.subtract(wallNormal.scale(2 * Vector3.Dot(direction, wallNormal)));
                            body.setLinearVelocity(reflection.scale(speed * 0.8));
                            ball.lookAt(ball.position.add(reflection));
                            if (this.effectsManager) this.effectsManager.createHitSpark(bulletPos);
                            console.log("[RICOCHET] Стена #" + ricochetCount);
                        }
                    }
                }
                
                // Удаление за границами (увеличено максимальное расстояние)
                if (bulletPos.y < -10 || bulletPos.y > 100 || 
                    Math.abs(bulletPos.x) > 1200 || Math.abs(bulletPos.z) > 1200) {
                    ball.dispose();
                    return;
                }
                
                // Продолжаем проверку КАЖДЫЙ КАДР
                requestAnimationFrame(checkHit);
            };
            
            // Запускаем проверку СРАЗУ
            checkHit();
            
            // Авто-удаление через 6 секунд (дольше для большей дальности)
            setTimeout(() => {
                if (!ball.isDisposed()) ball.dispose();
            }, 6000);
        } catch (e) { console.error("[FIRE ERROR]", e); }
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
            const spreadDir = direction.clone();
            spreadDir.addInPlace(right.scale(Math.sin(angle)));
            spreadDir.addInPlace(up.scale(Math.sin(angle * 0.5)));
            spreadDir.normalize();
            
            // Create smaller projectile
            const pellet = MeshBuilder.CreateBox("shotgunPellet", {
                width: this.projectileSize * 0.6,
                height: this.projectileSize * 0.6,
                depth: this.projectileSize * 2
            }, this.scene);
            pellet.position = muzzlePos.clone();
            pellet.lookAt(pellet.position.add(spreadDir));
            
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
            body.setMassProperties({ mass: 10 });
            body.setLinearDamping(0.01);
            body.applyImpulse(spreadDir.scale(this.projectileSpeed * 18), pellet.position);
            
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
        
        const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        body.setMassProperties({ mass: 15 });
        body.setLinearDamping(0.01);
        body.applyImpulse(dir.scale(this.projectileSpeed * 18), ball.position);
        
        this.setupProjectileHitDetection(ball, body);
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
            
            // Check enemy hits
            const enemies = this.enemyTanks || [];
            for (const enemy of enemies) {
                if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;
                
                const dist = Vector3.Distance(bulletPos, enemy.chassis.absolutePosition);
                if (dist < HIT_RADIUS_TANK) {
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
                const estimatedPing = 100; // Could be measured from multiplayer manager
                const rewindTime = shootTime - estimatedPing; // Rewind to when shot was fired
                
                for (const [, networkTank] of this.networkPlayers.entries()) {
                    if (!networkTank || !networkTank.chassis) continue;
                    
                    // Get position at time of shot (lag compensation)
                    const targetPos = networkTank.getPositionAtTime?.(rewindTime) || networkTank.chassis.position;
                    
                    const dist = Vector3.Distance(bulletPos, targetPos);
                    if (dist < HIT_RADIUS_TANK) {
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
        
        for (const enemy of enemies) {
            if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;
            
            const dist = Vector3.Distance(center, enemy.chassis.absolutePosition);
            if (dist <= radius) {
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
        
        console.log(`[EXPLOSIVE] Hit ${hitCount} enemies in ${radius}m radius`);
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
            
            for (const enemy of enemies) {
                if (!enemy || !enemy.isAlive || hitTargets.has(enemy) || !enemy.chassis || enemy.chassis.isDisposed()) continue;
                
                const dist = Vector3.Distance(currentPos, enemy.chassis.absolutePosition);
                if (dist < nearestDist) {
                    nearestDist = dist;
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
        console.log(`[CHAIN] Hit ${hitTargets.size} enemies`);
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
                    console.log(`[SUPPORT] Damaged enemy for ${this.damage} damage`);
                    
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
                    console.log(`[SUPPORT] Repaired ${healAmount} HP`);
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
            setTimeout(() => {
                this.isReloading = false;
                if (this.soundManager) {
                    this.soundManager.playReloadComplete();
                }
            }, this.cooldown);
            
            console.log(`[TRACER] Fired! ${this.tracerCount}/${this.maxTracerCount} remaining`);
            
            // Get muzzle position and direction
            const wasBarrelEnabled = this.barrel.isEnabled();
            if (!wasBarrelEnabled) this.barrel.setEnabled(true);
            
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);
            
            const barrelDir = this.barrel.getDirection(Vector3.Forward()).normalize();
            const shootDirection = new Vector3(
                barrelDir.x * Math.cos(this.aimPitch),
                Math.sin(this.aimPitch),
                barrelDir.z * Math.cos(this.aimPitch)
            ).normalize();
            
            const muzzlePos = this.barrel.getAbsolutePosition().add(barrelDir.scale(1.6));
            
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
            const shape = new PhysicsShape({ 
                type: PhysicsShapeType.BOX, 
                parameters: { extents: new Vector3(tracerSize * 0.75, tracerSize * 0.75, tracerSize * 3) } 
            }, this.scene);
            shape.filterMembershipMask = 4;
            shape.filterCollideMask = 2 | 8 | 32;
            
            const body = new PhysicsBody(tracer, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            body.setMassProperties({ mass: 10 });
            body.setLinearDamping(0.01);
            
            // Faster than normal projectile for better tracking
            const impulse = this.projectileSpeed * 22;
            body.applyImpulse(shootDirection.scale(impulse), tracer.position);
            
            // Light recoil for tracer
            const recoilForceVec = shootDirection.scale(-this.recoilForce * 0.3);
            this.physicsBody.applyImpulse(recoilForceVec, this.chassis.absolutePosition);
            
            // === TRACER HIT DETECTION ===
            const tracerDamage = this.tracerDamage;
            const markDuration = this.tracerMarkDuration;
            const HIT_RADIUS = 4.5; // Slightly larger hit radius for tracer
            
            const checkInterval = setInterval(() => {
                if (tracer.isDisposed()) {
                    clearInterval(checkInterval);
                    return;
                }
                
                const tracerPos = tracer.absolutePosition;
                
                // Check enemy tanks
                const enemies = this.enemyTanks || [];
                for (let i = 0; i < enemies.length; i++) {
                    const enemy = enemies[i];
                    if (!enemy || !enemy.isAlive || !enemy.chassis || enemy.chassis.isDisposed()) continue;
                    
                    const enemyPos = enemy.chassis.absolutePosition;
                    const dist = Vector3.Distance(tracerPos, enemyPos);
                    
                    if (dist < HIT_RADIUS) {
                        console.log("%c[TRACER HIT] Enemy marked for " + (markDuration/1000) + "s!", "color: orange; font-weight: bold");
                        
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
                            this.chatSystem.log(`Enemy marked for ${markDuration/1000}s!`);
                        }
                        
                        tracer.dispose();
                        clearInterval(checkInterval);
                        return;
                    }
                }
                
                // Dispose if too far or too old
                if (tracerPos.y < -10 || Vector3.Distance(tracerPos, muzzlePos) > 500) {
                    tracer.dispose();
                    clearInterval(checkInterval);
                }
            }, 16);
            
            // Auto-dispose after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!tracer.isDisposed()) tracer.dispose();
            }, 5000);
            
        } catch (e) { console.error("[TRACER ERROR]", e); }
    }
    
    // Refill tracers (can be called from consumables or pickups)
    refillTracers(amount: number = this.maxTracerCount): void {
        this.tracerCount = Math.min(this.tracerCount + amount, this.maxTracerCount);
        console.log(`[TRACER] Refilled! ${this.tracerCount}/${this.maxTracerCount}`);
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
            
            // Обновляем время игры для системы опыта
            if (this.experienceSystem) {
                this.experienceSystem.updatePlayTime(this.chassisType.id, this.cannonType.id);
            }
            
            // Low health smoke effect - subtle, barely visible
            const healthPercent = this.currentHealth / this.maxHealth;
            if (healthPercent < 0.3 && this.effectsManager && this.chassis) {
                // Only create smoke occasionally (every 2 seconds) to keep it subtle
                const now = performance.now();
                if (!this._lastSmokeTime || now - this._lastSmokeTime > 2000) {
                    const smokePos = this.chassis.getAbsolutePosition().clone();
                    smokePos.y = 0.5;
                    this.effectsManager.createLowHealthSmoke(smokePos);
                    this._lastSmokeTime = now;
                }
            }
            
            // КРИТИЧЕСКИ ВАЖНО: Физика танка НЕ зависит от режима прицеливания!
            // isAiming влияет ТОЛЬКО на камеру и прицел, НЕ на физику, позицию, скорость или вращение танка!
            // Танк должен вести себя одинаково независимо от режима прицеливания!
            this.updateInputs();

            const body = this.physicsBody;
            
            // Проверка валидности перед получением скорости
            if (!body) return;
            
            // КРИТИЧЕСКИ ВАЖНО: В onBeforePhysicsObservable физика еще не обновилась!
            // Физическое тело автоматически синхронизирует позицию меша ПОСЛЕ шага физики
            // Но мы находимся ДО шага физики, поэтому используем позицию меша, которая уже синхронизирована
            // с ПРЕДЫДУЩИМ шагом физики. Это правильная позиция для применения сил.
            // ИСПОЛЬЗУЕМ getAbsolutePosition() для получения актуальной позиции после предыдущего шага физики
            // Это предотвращает эффект "нескольких танков" из-за рассинхронизации
            const pos = this._tmpVector;
            pos.copyFrom(this.chassis.getAbsolutePosition());
            
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

            // Ограничиваем вертикальную скорость и угловую скорость, чтобы исключить "взлёты"
            let velocityClamped = false;
            const maxUpwardSpeed = 12;
            const maxDownwardSpeed = 35;
            if (vel.y > maxUpwardSpeed) {
                vel.y = maxUpwardSpeed;
                velocityClamped = true;
            } else if (vel.y < -maxDownwardSpeed) {
                vel.y = -maxDownwardSpeed;
                velocityClamped = true;
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
            
            if (velocityClamped) {
                try {
                    body.setLinearVelocity(vel);
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
            
            // Кэшируем часто используемые значения для оптимизации
            const fwdSpeed = Vector3.Dot(vel, forward);
            const absFwdSpeed = Math.abs(fwdSpeed);
            const isMoving = absFwdSpeed > 0.5;
            
            // === ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ===
            this._logFrameCounter++;
            const shouldLog = this._enableDetailedLogging && (this._logFrameCounter % 30 === 0 || up.y < 0.7 || Math.abs(vel.length()) > 30);
            
            if (shouldLog) {
                const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
                const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
                const speed = vel.length();
                // Используем кэшированное значение fwdSpeed
                
                console.log("═══════════════════════════════════════════════════════");
                console.log(`[TANK PHYSICS] Frame ${this._logFrameCounter}`);
                console.log(`  POSITION:     [${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}]`);
                console.log(`  VELOCITY:     [${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)}] | Speed: ${speed.toFixed(2)} m/s | Fwd: ${fwdSpeed.toFixed(2)} m/s`);
                console.log(`  ANGULAR VEL:  [${angVel.x.toFixed(2)}, ${angVel.y.toFixed(2)}, ${angVel.z.toFixed(2)}]`);
                console.log(`  ORIENTATION:`);
                console.log(`    Forward:    [${forward.x.toFixed(2)}, ${forward.y.toFixed(2)}, ${forward.z.toFixed(2)}]`);
                console.log(`    Up:         [${up.x.toFixed(2)}, ${up.y.toFixed(2)}, ${up.z.toFixed(2)}] | Up.y: ${up.y.toFixed(3)}`);
                console.log(`    Right:      [${right.x.toFixed(2)}, ${right.y.toFixed(2)}, ${right.z.toFixed(2)}]`);
                console.log(`  TILT:         X: ${(tiltX * 180 / Math.PI).toFixed(1)}° | Z: ${(tiltZ * 180 / Math.PI).toFixed(1)}°`);
                console.log(`  INPUTS:       Throttle: ${this.throttleTarget.toFixed(2)} → ${this.smoothThrottle.toFixed(2)} | Steer: ${this.steerTarget.toFixed(2)} → ${this.smoothSteer.toFixed(2)}`);
                console.log("═══════════════════════════════════════════════════════");
            }

            // --- 1. OPTIMIZED HOVER (Simplified height control) ---
            // КРИТИЧЕСКИ ВАЖНО: Hover работает ТОЛЬКО когда танк ниже минимальной высоты!
            // Танк НЕ должен летать - hover только предотвращает падение ниже hoverHeight
            const minHeight = this.hoverHeight; // Минимальная высота (обычно 1.0)
            const deltaY = minHeight - pos.y; // Положительно когда танк ниже минимума
            const velY = vel.y;
            const absVelY = Math.abs(velY);
            
            // Оптимизированная система hover - упрощенные вычисления
            // УВЕЛИЧЕНО демпфирование при движении для устранения дрожания
            let hoverForce = 0;
            if (deltaY > 0) {
                // Танк ниже минимума - применяем hover для поднятия
                // Упрощенная логика: используем кэшированное значение isMoving
                const hoverSensitivity = isMoving ? 0.2 : 1.0; // Еще больше уменьшено при движении (было 0.25)
                const stiffnessMultiplier = 1.0 + Math.min(Math.abs(deltaY) * 0.03, 0.15) * hoverSensitivity;
                // Увеличено демпфирование при движении для предотвращения осцилляций
                hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping * (isMoving ? 2.0 : 1.0));
                
                // Упрощенное динамическое ограничение
                const movementReduction = isMoving ? 0.3 : 1.0; // Еще больше уменьшено при движении (было 0.4)
                const dynamicMaxForce = (absVelY > 50 ? 1000 : (absVelY > 20 ? 2000 : 3500)) * movementReduction;
                hoverForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
            } else {
                // Танк выше минимума - только демпфирование (увеличено при движении)
                hoverForce = -velY * this.hoverDamping * (isMoving ? 0.7 : 0.5);
            }
            const clampedHoverForce = hoverForce;
            
            // Накопление всех вертикальных сил в одну для предотвращения конфликтов
            let totalVerticalForce = clampedHoverForce;
            
            if (shouldLog) {
                console.log(`  [HOVER] TargetY: ${minHeight.toFixed(2)} | DeltaY: ${deltaY.toFixed(3)} | VelY: ${velY.toFixed(2)} | Force: ${clampedHoverForce.toFixed(0)}`);
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
                console.log(`  [UPRIGHT] Tilt: X=${(tiltX * 180 / Math.PI).toFixed(1)}° Z=${(tiltZ * 180 / Math.PI).toFixed(1)}°`);
                console.log(`    States: Slight=${isSlightlyTilted} Moderate=${isModeratelyTilted} Severe=${isSeverelyTilted} Critical=${isCriticallyTilted}`);
                console.log(`    Base Torque: [${baseCorrectiveX.toFixed(0)}, ${baseCorrectiveZ.toFixed(0)}] | Mult: ${multiplier.toFixed(2)}`);
                console.log(`    Total Torque: [${totalCorrectiveX.toFixed(0)}, ${totalCorrectiveZ.toFixed(0)}] | Mag: ${totalCorrectiveMagnitude.toFixed(0)}`);
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
                
                // Вертикальная сила для поднятия при опрокидывании (добавляется к общей вертикальной силе)
                if (up.y < 0.7) {
                    const liftMultiplier = isCriticallyTilted ? 1.5 : (isSeverelyTilted ? 1.2 : 1.0); // Уменьшено
                    const liftForceVal = Math.min(30000, (0.9 - up.y) * this.liftForce * liftMultiplier * 0.6); // Уменьшено
                    totalVerticalForce += liftForceVal; // Добавляем к общей вертикальной силе
                    
                    if (shouldLog) {
                        console.log(`  [EMERGENCY] Torque: [${emergencyX.toFixed(0)}, ${emergencyZ.toFixed(0)}] | Mult: ${emergencyMultiplier.toFixed(2)} | Clamped: ${emergencyWasClamped}`);
                        console.log(`  [LIFT] Force: ${liftForceVal.toFixed(0)} | Mult: ${liftMultiplier.toFixed(2)}`);
                    }
                } else if (shouldLog) {
                    console.log(`  [EMERGENCY] Torque: [${emergencyX.toFixed(0)}, ${emergencyZ.toFixed(0)}] | Mult: ${emergencyMultiplier.toFixed(2)} | Clamped: ${emergencyWasClamped}`);
                }
            }
            
            // Дополнительная стабилизация: прижимная сила при движении (объединена с hover)
            // Используем кэшированное значение absFwdSpeed для оптимизации
            if (absFwdSpeed > 1) {
                const downForceVal = this.downForce * (1.0 - up.y) * 0.3; // Уменьшено для плавности
                totalVerticalForce -= downForceVal; // Добавляем к общей вертикальной силе
                
                if (shouldLog) {
                    console.log(`  [DOWNFORCE] Force: ${downForceVal.toFixed(0)}`);
                }
            }
            
            // Автоматический сброс при критическом опрокидывании или застревании
            const isFallen = pos.y < -10 || up.y < 0.2 || Math.abs(tiltX) > 1.2 || Math.abs(tiltZ) > 1.2;
            const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.4;
            
            if (isFallen || isStuck) {
                if (shouldLog) {
                    console.log(`  [RESET] Fallen: ${isFallen} | Stuck: ${isStuck} | Timer: ${this._resetTimer ? ((Date.now() - this._resetTimer) / 1000).toFixed(1) + 's' : 'none'}`);
                }
                // Небольшая задержка перед сбросом, чтобы дать системе выравнивания шанс
                if (!this._resetTimer) {
                    this._resetTimer = Date.now();
                } else if (Date.now() - this._resetTimer > 2000) { // 2 секунды
                    console.log(`  [RESET] Executing reset!`);
                    this.reset();
                    this._resetTimer = 0;
                }
            } else {
                this._resetTimer = 0; // Сбрасываем таймер если танк восстановился
            }

            // Добавляем небольшую силу вниз при движении для лучшего сцепления (объединена с hover)
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const throttleDownForceVal = Math.abs(this.smoothThrottle) * this.downForce * 0.2; // Уменьшено
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
                    console.warn("[TANK] Error applying vertical force:", e);
                }
            }

            // --- 3. MOVEMENT (Forward/Backward acceleration) ---
            // Проверяем топливо - если пусто, танк не едет
            if (this.isFuelEmpty) {
                this.smoothThrottle = 0;
                this.smoothSteer = 0;
            } else {
                // Потребляем топливо при движении
                const isMoving = Math.abs(this.throttleTarget) > 0.1 || Math.abs(this.steerTarget) > 0.1;
                if (isMoving) {
                    const deltaTime = 1 / 60; // Приблизительно 60 FPS
                    this.currentFuel -= this.fuelConsumptionRate * deltaTime;
                    if (this.currentFuel <= 0) {
                        this.currentFuel = 0;
                        this.isFuelEmpty = true;
                        console.log("[TANK] Out of fuel!");
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
            
            // Применяем силу для достижения целевой скорости (с ограничением для плавности)
            if (Math.abs(this.smoothThrottle) > 0.05) {
                // Уменьшаем силу ускорения для более плавного движения
                const accelForce = speedDiff * this.acceleration * 0.8;
                // Ограничиваем максимальную силу для предотвращения тряски
                const maxAccelForce = this.moveSpeed * this.mass * 2;
                const clampedAccelForce = Math.max(-maxAccelForce, Math.min(maxAccelForce, accelForce));
                // Use scaleToRef to avoid corrupting forward vector
                if (body && isFinite(clampedAccelForce)) {
                    forward.scaleToRef(clampedAccelForce, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        console.warn("[TANK] Error applying movement force:", e);
                    }
                }
                
                if (shouldLog) {
                    console.log(`  [MOVEMENT] TargetSpeed: ${targetSpeed.toFixed(2)} | Current: ${fwdSpeed.toFixed(2)} | Diff: ${speedDiff.toFixed(2)} | Force: ${clampedAccelForce.toFixed(0)}`);
                }
                
                // --- OBSTACLE CLIMBING (преодоление небольших препятствий, включая тротуары) ---
                if (this.smoothThrottle > 0.05) { // Только при движении вперед
                    const chassisHeight = this.chassisType.height;
                    const currentFrame = this._logFrameCounter;
                    
                    // Проверяем препятствие с кэшированием
                    let obstacleData = this._obstacleRaycastCache;
                    if (!obstacleData || (currentFrame - obstacleData.frame) >= this.OBSTACLE_RAYCAST_CACHE_FRAMES) {
                        // Множественные проверки для лучшего обнаружения препятствий
                        // 1. Горизонтальный луч вперед (на уровне земли)
                        // 2. Луч вперед-вверх (под углом для обнаружения препятствий)
                        // 3. Луч немного выше земли
                        
                        let maxObstacleHeight = 0;
                        let hasObstacle = false;
                        
                        const filter = (mesh: any) => {
                            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                            const meta = mesh.metadata;
                            // Игнорируем снаряды, припасы, сам танк
                            if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "playerTank")) return false;
                            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
                            // Игнорируем сам танк и его части
                            if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
                            if (mesh.parent === this.chassis || mesh.parent === this.turret) return false;
                            return true;
                        };
                        
                        // Проверка 1: Горизонтально вперед на уровне земли (для тротуаров)
                        const rayStart1 = pos.clone();
                        rayStart1.y += 0.2; // Очень низко, для обнаружения тротуаров
                        const rayDir1 = forward.clone();
                        const rayLength1 = 2.5; // Ближе, чтобы быстрее реагировать
                        const ray1 = new Ray(rayStart1, rayDir1, rayLength1);
                        const pick1 = this.scene.pickWithRay(ray1, filter);
                        
                        // Проверка 2: Вперед под небольшим углом вверх (для препятствий)
                        const rayStart2 = pos.clone();
                        rayStart2.y += 0.3;
                        const rayDir2 = forward.clone();
                        rayDir2.y += 0.3; // Угол вверх
                        rayDir2.normalize();
                        const rayLength2 = 2.0;
                        const ray2 = new Ray(rayStart2, rayDir2, rayLength2);
                        const pick2 = this.scene.pickWithRay(ray2, filter);
                        
                        // Проверка 3: Немного выше, горизонтально (для высоких препятствий)
                        const rayStart3 = pos.clone();
                        rayStart3.y += chassisHeight * 0.3;
                        const rayDir3 = forward.clone();
                        const rayLength3 = 1.5;
                        const ray3 = new Ray(rayStart3, rayDir3, rayLength3);
                        const pick3 = this.scene.pickWithRay(ray3, filter);
                        
                        // Находим максимальную высоту препятствия
                        if (pick1 && pick1.hit && pick1.pickedPoint) {
                            const height1 = pick1.pickedPoint.y - pos.y;
                            if (height1 > maxObstacleHeight) maxObstacleHeight = height1;
                            hasObstacle = true;
                        }
                        if (pick2 && pick2.hit && pick2.pickedPoint) {
                            const height2 = pick2.pickedPoint.y - pos.y;
                            if (height2 > maxObstacleHeight) maxObstacleHeight = height2;
                            hasObstacle = true;
                        }
                        if (pick3 && pick3.hit && pick3.pickedPoint) {
                            const height3 = pick3.pickedPoint.y - pos.y;
                            if (height3 > maxObstacleHeight) maxObstacleHeight = height3;
                            hasObstacle = true;
                        }
                        
                        obstacleData = {
                            hasObstacle: hasObstacle,
                            obstacleHeight: maxObstacleHeight,
                            frame: currentFrame
                        };
                        this._obstacleRaycastCache = obstacleData;
                    }
                    
                    // Если есть препятствие и оно не выше корпуса, помогаем преодолеть
                    // Увеличена максимальная высота до полной высоты корпуса + небольшой запас
                    if (obstacleData.hasObstacle && obstacleData.obstacleHeight > 0.05 && obstacleData.obstacleHeight <= chassisHeight * 1.1) {
                        // Вычисляем силу для подъема (более агрессивная формула)
                        // Базовое усилие + пропорциональное препятствию
                        const baseClimbForce = this.mass * 500; // Базовая сила для любых препятствий
                        const proportionalForce = obstacleData.obstacleHeight * this.mass * 250; // Пропорциональная часть (снижено)
                        const climbForce = baseClimbForce + proportionalForce;
                        const maxClimbForce = this.mass * 2200; // Ограниченная максимальная сила
                        const clampedClimbForce = Math.min(climbForce, maxClimbForce);
                        
                        // Применяем силу вверх (более сильную)
                        if (body && isFinite(clampedClimbForce)) {
                            Vector3.Up().scaleToRef(clampedClimbForce, this._tmpVector8);
                            try {
                                body.applyForce(this._tmpVector8, pos);
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                        
                        // Значительно усиливаем движение вперед для преодоления
                        // Чем выше препятствие, тем больше дополнительной силы
                        const extraForceMultiplier = 0.4 + (obstacleData.obstacleHeight / chassisHeight) * 0.4; // От +40% до +80%
                        const extraForwardForce = clampedAccelForce * extraForceMultiplier;
                        if (body && isFinite(extraForwardForce) && clampedAccelForce > 0) {
                            forward.scaleToRef(extraForwardForce, this._tmpVector8);
                            try {
                                body.applyForce(this._tmpVector8, pos);
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                        
                        // Дополнительный импульс вверх-вперед для более плавного подъема
                        const upwardForward = forward.clone();
                        upwardForward.y += 0.2; // Направление вверх-вперед
                        upwardForward.normalize();
                        const boostForce = this.mass * 150 * Math.min(obstacleData.obstacleHeight / chassisHeight, 1.0);
                        if (body && isFinite(boostForce)) {
                            upwardForward.scaleToRef(boostForce, this._tmpVector8);
                            try {
                                body.applyForce(this._tmpVector8, pos);
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                        
                        if (shouldLog) {
                            console.log(`  [OBSTACLE] Height: ${obstacleData.obstacleHeight.toFixed(2)} | ClimbForce: ${clampedClimbForce.toFixed(0)} | ExtraForward: ${(extraForceMultiplier * 100).toFixed(0)}%`);
                        }
                    }
                }
            }

            // --- 4. ENHANCED TURN (Speed-dependent turning) ---
            // Поворот зависит от скорости: на месте поворачивается быстрее
            // Используем кэшированное значение fwdSpeed для оптимизации
            const speedRatio = absFwdSpeed / this.moveSpeed;
            const turnSpeedMultiplier = 1.0 + (1.0 - speedRatio) * 0.5; // +50% скорости поворота на месте
            const effectiveTurnSpeed = this.turnSpeed * turnSpeedMultiplier;
            
            const targetTurnRate = this.smoothSteer * effectiveTurnSpeed;
            const currentTurnRate = angVel.y;
            
            // Адаптивное угловое ускорение
            const isTurning = Math.abs(this.smoothSteer) > 0.1;
            const angularAccelMultiplier = isTurning ? 1.2 : 1.5; // Быстрее останавливаем поворот
            const turnAccelVal = (targetTurnRate - currentTurnRate) * this.turnAccel * angularAccelMultiplier;
            
            // Накопление всех угловых моментов для предотвращения конфликтов
            let totalAngularTorqueY = turnAccelVal;
            
            // Дополнительная стабилизация при повороте на скорости (объединена)
            if (Math.abs(speedRatio) > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                const stabilityTorqueVal = -angVel.y * this.stabilityTorque * speedRatio * 0.5; // Уменьшено
                totalAngularTorqueY += stabilityTorqueVal;
            }
            
            // Yaw damping when not turning (объединен)
            if (Math.abs(this.smoothSteer) < 0.05) {
                totalAngularTorqueY += -angVel.y * this.yawDamping * 0.7; // Уменьшено
            }
            
            // Применяем ВСЕ угловые моменты одной командой (предотвращает конфликты)
            const totalAngularTorque = this._tmpVector7;
            totalAngularTorque.set(0, totalAngularTorqueY, 0);
            this.applyTorque(totalAngularTorque);
            
            if (shouldLog) {
                console.log(`  [TURN] Target: ${targetTurnRate.toFixed(2)} rad/s | Current: ${currentTurnRate.toFixed(2)} rad/s`);
                console.log(`    Accel: ${turnAccelVal.toFixed(0)} | Mult: ${angularAccelMultiplier.toFixed(2)} | SpeedRatio: ${speedRatio.toFixed(2)}`);
            }

            // --- 5. ENHANCED SIDE FRICTION (Improved lateral stability) ---
            const sideSpeed = Vector3.Dot(vel, right);
            // Боковое сопротивление зависит от скорости движения
            // Используем кэшированное значение absFwdSpeed для оптимизации
            const sideFrictionMultiplier = 1.0 + absFwdSpeed / this.moveSpeed * 0.5;
            const sideFrictionForce = -sideSpeed * this.sideFriction * sideFrictionMultiplier;
            // Use scaleToRef to avoid mutating right vector
            if (body && isFinite(sideFrictionForce)) {
                right.scaleToRef(sideFrictionForce, this._tmpVector5);
                try {
                    body.applyForce(this._tmpVector5, pos);
                } catch (e) {
                    console.warn("[TANK] Error applying side friction:", e);
                }
            }
            
            if (shouldLog) {
                console.log(`  [SIDE FRICTION] SideSpeed: ${sideSpeed.toFixed(2)} | Force: ${sideFrictionForce.toFixed(0)} | Mult: ${sideFrictionMultiplier.toFixed(2)}`);
            }

            // --- 6. ENHANCED DRAG (Improved stopping) ---
            if (Math.abs(this.smoothThrottle) < 0.05) {
                // Боковое сопротивление для предотвращения скольжения
                const sideVel = Vector3.Dot(vel, right);
                const sideDragVal = -sideVel * this.sideDrag;
                // Use scaleToRef to avoid mutating right vector
                if (body && isFinite(sideDragVal)) {
                    right.scaleToRef(sideDragVal, this._tmpVector5);
                    try {
                        body.applyForce(this._tmpVector5, pos);
                    } catch (e) {
                        console.warn("[TANK] Error applying side drag:", e);
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
                        console.warn("[TANK] Error applying forward drag:", e);
                    }
                }
                
                // Угловое сопротивление
                const angularDragVal = -angVel.y * this.angularDrag;
                if (isFinite(angularDragVal)) {
                    this.applyTorque(new Vector3(0, angularDragVal, 0));
                }
                
                if (shouldLog) {
                    console.log(`  [DRAG] Side: ${sideDragVal.toFixed(0)} | Fwd: ${fwdDragVal.toFixed(0)} | Angular: ${angularDragVal.toFixed(0)}`);
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
            
            // Применяем скорость башни (с проверкой валидности)
            if (this.turret && !this.turret.isDisposed()) {
                this.turretTurnSmooth += (this.turretTurnTarget - this.turretTurnSmooth) * this.turretLerpSpeed;
                const rotationDelta = this.turretTurnSmooth * this.baseTurretSpeed * this.turretAcceleration;
                if (isFinite(rotationDelta)) {
                    this.turret.rotation.y += rotationDelta;
                }
            }
            
            // === ОТКАТ ПУШКИ ПРИ ВЫСТРЕЛЕ ===
            // Плавно возвращаем пушку в исходное положение (горизонтальный откат)
            this.barrelRecoilOffset += (this.barrelRecoilTarget - this.barrelRecoilOffset) * this.barrelRecoilSpeed;
            
            // Вертикальный откат (подъем при выстреле, затем возврат в исходное положение)
            this._barrelRecoilY += (this._barrelRecoilYTarget - this._barrelRecoilY) * this.barrelRecoilSpeed;
            
            // Применяем откат к позиции пушки (относительно башни)
            if (this.barrel && !this.barrel.isDisposed() && this._baseBarrelZ > 0) {
                if (isFinite(this.barrelRecoilOffset) && isFinite(this._barrelRecoilY)) {
                    // Сначала применяем откат
                    const baseZ = this._baseBarrelZ + this.barrelRecoilOffset;
                    this.barrel.position.z = baseZ;
                    this.barrel.position.y = this._baseBarrelY + this._barrelRecoilY;
                    
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
                        if (this.visualWheels[i] && !this.visualWheels[i].isDisposed()) {
                            this.visualWheels[i].rotation.x += wheelRotationDelta;
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

            // === UPDATE HUD (every 6th frame for optimization) ===
            if (this._tick % 6 === 0 && this.hud && isFinite(fwdSpeed)) {
                this.hud.setSpeed(fwdSpeed);
                if (isFinite(pos.x) && isFinite(pos.z)) {
                    this.hud.setPosition(pos.x, pos.z);
                }
                this.hud.updateReload();
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
        } catch (e) {
            // Улучшенная обработка ошибок с детальной информацией (только с троттлингом)
            const now = performance.now();
            if (now - this.lastPhysicsErrorMs > 2000) {
                this.lastPhysicsErrorMs = now;
                console.error("[PhysicsError] updatePhysics failed:", e);
                if (e instanceof Error) {
                    console.error("[PhysicsError] Stack:", e.stack);
                }
                // Проверяем состояние объектов при ошибке
                console.error("[PhysicsError] State check:", {
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
    
    // === МОДУЛИ (кнопки 6-0) ===
    
    // Модуль 6: Временная защитная стенка цвета поверхности (10 секунд)
    private activateModule6(): void {
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
        
        // Создаём стенку перед пушкой
        const wallPos = barrelPos.add(barrelForward.scale(8));
        
        // Определяем высоту пола через raycast вниз
        let groundY = 0; // Высота пола по умолчанию
        const rayStart = wallPos.clone();
        rayStart.y = barrelPos.y + 5; // Начинаем сверху
        const rayDirection = new Vector3(0, -1, 0); // Направление вниз
        const ray = new Ray(rayStart, rayDirection, 20);
        
        const pick = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;
            const meta = mesh.metadata;
            if (meta && (meta.type === "playerTank" || meta.type === "bullet" || meta.type === "consumable" || meta.type === "protectiveWall")) return false;
            if (mesh.name.includes("billboard") || mesh.name.includes("hp")) return false;
            return mesh.isPickable && mesh.visibility > 0.5;
        });
        
        // Определяем цвет поверхности и высоту пола
        let surfaceColor = new Color3(0.5, 0.5, 0.5); // Цвет по умолчанию (серый)
        if (pick && pick.hit && pick.pickedPoint) {
            groundY = pick.pickedPoint.y;
            if (pick.pickedMesh && pick.pickedMesh.material) {
            const material = pick.pickedMesh.material;
            if (material instanceof StandardMaterial) {
                surfaceColor = material.diffuseColor.clone();
            }
            }
        } else {
            groundY = 0; // Если не нашли пол, используем Y=0
        }
        
        // Финальная позиция стенки (центр на высоте groundY + 2)
        const finalY = groundY + 2;
        const finalWallPos = new Vector3(wallPos.x, finalY, wallPos.z);
        
        // Начальная позиция (под полом, чтобы стенка полностью была скрыта)
        const startY = groundY - 4; // Стенка высотой 4, так что начинаем на 4 единицы ниже пола
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
    public damageWall(wallMesh: Mesh, damage: number): boolean {
        // Находим стенку в массиве
        for (const wallData of this.module6Walls) {
            if (wallData.mesh === wallMesh && !wallData.mesh.isDisposed()) {
                wallData.health = Math.max(0, wallData.health - damage);
                
                console.log(`[WALL] Damage taken: ${damage}, HP: ${wallData.health}/${wallData.maxHealth}`);
                
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
            
            // Материал кусочка
            const debrisMat = new StandardMaterial(`debrisMat_${Date.now()}_${i}`, this.scene);
            debrisMat.diffuseColor = wallColor;
            debrisMat.emissiveColor = wallColor.scale(0.2);
            debrisMat.specularColor = Color3.Black();
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
        const velocities = debrisPieces.map(() => ({
            vx: (Math.random() - 0.5) * 8,
            vy: Math.random() * 6 + 2,
            vz: (Math.random() - 0.5) * 8,
            rotX: (Math.random() - 0.5) * 10,
            rotY: (Math.random() - 0.5) * 10,
            rotZ: (Math.random() - 0.5) * 10
        }));
        
        const startPositions = debrisPieces.map(d => d.position.clone());
        const startRotations = debrisPieces.map(() => ({
            x: Math.random() * Math.PI * 2,
            y: Math.random() * Math.PI * 2,
            z: Math.random() * Math.PI * 2
        }));
        
        const animateDebris = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            
            debrisPieces.forEach((debris, i) => {
                if (debris.isDisposed()) return;
                
                const vel = velocities[i];
                const startPos = startPositions[i];
                const startRot = startRotations[i];
                
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
            });
            
            if (progress < 1) {
                requestAnimationFrame(animateDebris);
            } else {
                // Удаляем все кусочки
                debrisPieces.forEach(debris => {
                    if (!debris.isDisposed()) {
                        debris.dispose();
                    }
                });
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
    
    // Модуль 9: Автоматическое маневрирование от выстрелов (10 секунд)
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
        
        // Очищаем предыдущий timeout если есть
        if (this.module9Timeout !== null) {
            clearTimeout(this.module9Timeout);
            this.module9Timeout = null;
        }
        
        this.module9Active = true;
        this.module9LastUse = now;
        this.module9ManeuverDirection = 1;
        this.module9LastManeuverChange = Date.now();
        
        if (this.hud) {
            this.hud.addActiveEffect("Маневрирование", "💨", "#0f0", 10000);
            this.hud.setModuleCooldown(9, this.module9Cooldown);
        }
        if (this.chatSystem) {
            this.chatSystem.success("💨 Маневрирование активировано!");
        }
        if (this.soundManager) {
            this.soundManager.playShoot();
        }
        
        // Отключаем через 10 секунд
        this.module9Timeout = window.setTimeout(() => {
            this.module9Active = false;
            this.module9Timeout = null;
            if (this.hud) {
                this.hud.removeActiveEffect("Маневрирование");
            }
            if (this.chatSystem) {
                this.chatSystem.log("Маневрирование закончилось");
            }
        }, 10000);
    }
    
    // Модуль 0: Выполнение прыжка с накопленной силой
    private executeModule0Jump(): void {
        if (!this.module0Charging || !this.physicsBody || !this.isAlive) return;
        
        // Проверяем вертикальную скорость (если падаем слишком быстро, не прыгаем)
        const vel = this.physicsBody.getLinearVelocity();
        if (vel && vel.y < -5) {
            this.module0Charging = false;
            return; // Падаем слишком быстро
        }
        
        // Вычисляем силу прыжка на основе времени зарядки (максимум 10 секунд)
        const chargeTime = Math.min(Date.now() - this.module0ChargeStart, 10000); // Максимум 10 секунд
        const chargeRatio = chargeTime / 10000; // 0.0 - 1.0
        const basePower = 20000;
        const maxPower = 500000; // 25x от базовой (увеличено в 5 раз)
        const jumpPower = basePower + (maxPower - basePower) * chargeRatio;
        
        // Применяем вертикальную силу для прыжка
        const jumpForce = new Vector3(0, jumpPower, 0);
        this.physicsBody.applyImpulse(jumpForce, this.chassis.absolutePosition);
        
        this.module0Charging = false;
        this.canJump = false;
        this.module0LastUse = Date.now();
        
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
        
        // Восстанавливаем возможность прыжка через cooldown
        setTimeout(() => {
            this.canJump = true;
        }, this.jumpCooldown);
    }
    
    // Обновление модулей (вызывается из update)
    // Создание гильзы при выстреле
    private createShellCasing(muzzlePos: Vector3, barrelDir: Vector3): void {
        // Размеры гильзы соответствуют размерам снаряда
        const bulletSize = this.projectileSize;
        const casingDiameter = bulletSize; // Диаметр гильзы = размер снаряда
        const casingLength = bulletSize * 3; // Длина гильзы = длина снаряда
        
        // Создаем гильзу как цилиндр того же размера, что и снаряд
        const casing = MeshBuilder.CreateCylinder("shellCasing", {
            height: casingLength,
            diameter: casingDiameter
        }, this.scene);
        
        // Позиция гильзы - немного сбоку от ствола
        const right = Vector3.Cross(barrelDir, Vector3.Up()).normalize();
        const casingStartPos = muzzlePos.subtract(barrelDir.scale(0.3)).add(right.scale(0.2));
        casing.position.copyFrom(casingStartPos);
        
        // Материал гильзы - латунный цвет
        const casingMat = new StandardMaterial("shellCasingMat", this.scene);
        casingMat.diffuseColor = new Color3(0.8, 0.7, 0.4); // Латунный цвет
        casingMat.specularColor = new Color3(0.5, 0.5, 0.3);
        casing.material = casingMat;
        casing.renderingGroupId = 2;
        
        // Физика гильзы (используем BOX для простоты, размеры соответствуют снаряду)
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: Vector3.Zero(),
                rotation: Quaternion.Identity(),
                extents: new Vector3(bulletSize * 0.75, casingLength * 0.5, bulletSize * 0.75)
            }
        }, this.scene);
        shape.filterMembershipMask = 64; // Shell casing group
        shape.filterCollideMask = 2; // Только с окружением
        
        const body = new PhysicsBody(casing, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        body.setMassProperties({ mass: 0.1 });
        body.setLinearDamping(0.5);
        body.setAngularDamping(0.8);
        
        // Выбрасываем гильзу в сторону и назад
        const ejectDirection = right.add(barrelDir.scale(-0.5)).add(Vector3.Up().scale(0.3)).normalize();
        const ejectSpeed = 8 + Math.random() * 4; // Случайная скорость выброса
        body.applyImpulse(ejectDirection.scale(ejectSpeed), casing.position);
        
        // Добавляем случайное вращение
        const randomRotation = new Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );
        body.applyAngularImpulse(randomRotation);
        
        // Сохраняем гильзу для обновления
        this.shellCasings.push({
            mesh: casing,
            physics: body,
            lifetime: 5000 // 5 секунд жизни
        });
    }
    
    // Обновление видимости ствола - скрываем части, которые пересекаются с башней или корпусом
    private updateBarrelVisibility(baseZ: number): void {
        if (!this.barrel || !this.turret || !this.chassis || this.barrel.isDisposed()) return;
        
        // Вычисляем мировые матрицы
        this.chassis.computeWorldMatrix(true);
        this.turret.computeWorldMatrix(true);
        this.barrel.computeWorldMatrix(true);
        
        // Получаем размеры башни и корпуса
        const turretWidth = this.chassisType.width * 0.65;
        const turretHeight = this.chassisType.height * 0.75;
        const turretDepth = this.chassisType.depth * 0.6;
        const chassisWidth = this.chassisType.width;
        const chassisHeight = this.chassisType.height;
        const chassisDepth = this.chassisType.depth;
        
        // Получаем размеры ствола
        const barrelWidth = this.cannonType.barrelWidth;
        let barrelLength = this.cannonType.barrelLength;
        if (this.cannonType.id === "sniper") {
            barrelLength *= 1.2;
        } else if (this.cannonType.id === "gatling") {
            barrelLength *= 0.8;
        }
        
        // Ствол находится в локальных координатах башни
        const barrelCenterZ = baseZ;
        const barrelStartZ = barrelCenterZ - barrelLength / 2;
        const barrelEndZ = barrelCenterZ + barrelLength / 2;
        
        // Получаем матрицы для преобразования координат
        const turretWorldMatrix = this.turret.getWorldMatrix();
        const turretInvMatrix = turretWorldMatrix.clone();
        turretInvMatrix.invert();
        
        const chassisWorldMatrix = this.chassis.getWorldMatrix();
        const chassisInvMatrix = chassisWorldMatrix.clone();
        chassisInvMatrix.invert();
        
        // Проверяем множество точек вдоль и поперек ствола
        const checkPointsZ = 30; // Точки вдоль ствола
        const checkPointsXY = 5; // Точки по ширине/высоте ствола
        
        let maxHiddenZ = barrelStartZ; // Максимальная Z координата скрытой части
        
        for (let iz = 0; iz <= checkPointsZ; iz++) {
            const tz = iz / checkPointsZ;
            const checkZ = barrelStartZ + (barrelEndZ - barrelStartZ) * tz;
            
            // Проверяем несколько точек по ширине и высоте ствола
            let pointHidden = false;
            
            for (let ix = 0; ix <= checkPointsXY; ix++) {
                for (let iy = 0; iy <= checkPointsXY; iy++) {
                    const tx = (ix / checkPointsXY - 0.5) * 0.8; // От -0.4 до 0.4
                    const ty = (iy / checkPointsXY - 0.5) * 0.8;
                    
                    // Точка в локальных координатах ствола
                    const barrelLocalPoint = new Vector3(
                        tx * barrelWidth,
                        this.barrel.position.y + ty * barrelWidth,
                        checkZ
                    );
                    
                    // Преобразуем в мировые координаты
                    const worldPoint = Vector3.TransformCoordinates(barrelLocalPoint, this.barrel.getWorldMatrix());
                    
                    // Преобразуем в локальные координаты башни
                    const turretLocalPoint = Vector3.TransformCoordinates(worldPoint, turretInvMatrix);
                    
                    // Преобразуем в локальные координаты корпуса
                    const chassisLocalPoint = Vector3.TransformCoordinates(worldPoint, chassisInvMatrix);
                    
                    // Проверяем, находится ли точка внутри башни (по всем осям!)
                    const inTurret = Math.abs(turretLocalPoint.x) < turretWidth / 2 &&
                                    Math.abs(turretLocalPoint.y - this.turret.position.y) < turretHeight / 2 &&
                                    Math.abs(turretLocalPoint.z) < turretDepth / 2;
                    
                    // Проверяем, находится ли точка внутри корпуса (по всем осям!)
                    const inChassis = Math.abs(chassisLocalPoint.x) < chassisWidth / 2 &&
                                    Math.abs(chassisLocalPoint.y) < chassisHeight / 2 &&
                                    Math.abs(chassisLocalPoint.z) < chassisDepth / 2;
                    
                    if (inTurret || inChassis) {
                        pointHidden = true;
                        break;
                    }
                }
                if (pointHidden) break;
            }
            
            // Если точка скрыта, обновляем максимальную скрытую Z координату
            if (pointHidden && checkZ > maxHiddenZ) {
                maxHiddenZ = checkZ;
            }
        }
        
        // Видимая часть ствола начинается после скрытой части
        const visibleStartZ = maxHiddenZ;
        const visibleLength = barrelEndZ - visibleStartZ;
        const originalLength = barrelLength;
        
        // Вычисляем процент скрытой части
        const hiddenLength = visibleStartZ - barrelStartZ;
        const hiddenPercent = hiddenLength / originalLength;
        
        if (hiddenPercent > 0.01) {
            // Есть пересечение - скрываем часть ствола
            if (hiddenPercent > 0.95) {
                // Почти весь ствол скрыт - полностью скрываем его
                this.barrel.setEnabled(false);
                this.barrel.scaling.z = 1.0;
                this.barrel.position.z = baseZ;
            } else if (visibleLength > 0.01 && visibleStartZ < barrelEndZ) {
                // Частично скрыт - используем масштабирование
                const scaleZ = Math.max(visibleLength / originalLength, 0.01); // Минимум 1% длины
                
                // Вычисляем смещение центра ствола для правильного масштабирования
                const newCenterZ = visibleStartZ + visibleLength / 2;
                const offsetZ = newCenterZ - barrelCenterZ;
                
                // Применяем масштабирование и смещение поверх позиции отката
                this.barrel.setEnabled(true);
                this.barrel.scaling.z = scaleZ;
                this.barrel.position.z = baseZ + offsetZ;
            } else {
                // Нет видимой части - скрываем полностью
                this.barrel.setEnabled(false);
                this.barrel.scaling.z = 1.0;
                this.barrel.position.z = baseZ;
            }
        } else {
            // Нет пересечения - возвращаем нормальный размер
            this.barrel.setEnabled(true);
            this.barrel.scaling.z = 1.0;
            this.barrel.position.z = baseZ;
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
        if (this.cannonAnimationElements.gatlingBarrels) {
            const rotationSpeed = 10; // Radians per second
            this.cannonAnimationElements.gatlingBarrels.forEach((barrel) => {
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += rotationSpeed * deltaTime;
                }
            });
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
        if (this.cannonAnimationElements.teslaCoils) {
            this.cannonAnimationElements.teslaCoils.forEach((coil, i) => {
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
            });
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
        if (this.cannonAnimationElements.railgunCapacitors) {
            this.cannonAnimationElements.railgunCapacitors.forEach((cap, i) => {
                if (cap && !cap.isDisposed()) {
                    const pulse = Math.sin(time * 2 + i * 0.6) * 0.1 + 1.0;
                    cap.scaling.setAll(pulse);
                    const mat = cap.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 2 + i * 0.6) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.05 * intensity, 0.15 * intensity, 0.5 * intensity);
                    }
                }
            });
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
        if (this.cannonAnimationElements.plasmaCoils) {
            this.cannonAnimationElements.plasmaCoils.forEach((coil, i) => {
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
            });
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
            this.cannonAnimationElements.laserRings.forEach((ring, i) => {
                if (ring && !ring.isDisposed()) {
                    ring.rotation.y += deltaTime * (1.5 + i * 0.3);
                    const pulse = Math.sin(time * 5 + i * 0.5) * 0.08 + 1.0;
                    ring.scaling.setAll(pulse);
                }
            });
        }
        
        // Vortex - вращение колец и генератора
        if (this.cannonAnimationElements.vortexRings) {
            this.cannonAnimationElements.vortexRings.forEach((ring, i) => {
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
            });
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
            this.cannonAnimationElements.supportRings.forEach((ring, i) => {
                if (ring && !ring.isDisposed()) {
                    ring.rotation.y += deltaTime * (3 + i * 1);
                    const pulse = Math.sin(time * 4 + i * 0.5) * 0.1 + 1.0;
                    ring.scaling.setAll(pulse);
                }
            });
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
        if (this.cannonAnimationElements.clusterTubes) {
            this.cannonAnimationElements.clusterTubes.forEach((tube, i) => {
                if (tube && !tube.isDisposed()) {
                    tube.rotation.z += deltaTime * (2 + i * 0.5);
                }
            });
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
        if (this.cannonAnimationElements.freezeFins) {
            this.cannonAnimationElements.freezeFins.forEach((fin, i) => {
                if (fin && !fin.isDisposed()) {
                    const shake = Math.sin(time * 4 + i * 0.5) * 0.03;
                    fin.rotation.x = shake;
                }
            });
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
        if (this.cannonAnimationElements.rocketGuides) {
            this.cannonAnimationElements.rocketGuides.forEach((guide, i) => {
                if (guide && !guide.isDisposed()) {
                    const pulse = Math.sin(time * 2 + i * 0.3) * 0.05 + 1.0;
                    guide.scaling.setAll(pulse);
                }
            });
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
            this.cannonAnimationElements.freezeFins.forEach((fin, i) => {
                if (fin && !fin.isDisposed()) {
                    const shake = Math.sin(time * 4 + i * 0.5) * 0.05;
                    fin.rotation.x = shake;
                    const mat = fin.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 4 + i * 0.5) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0.05 * intensity, 0.1 * intensity, 0.15 * intensity);
                    }
                }
            });
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
        if (this.cannonAnimationElements.empCoils) {
            this.cannonAnimationElements.empCoils.forEach((coil, i) => {
                if (coil && !coil.isDisposed()) {
                    coil.rotation.y += deltaTime * (2 + i * 0.5);
                    const pulse = Math.sin(time * 3 + i * 0.6) * 0.1 + 1.0;
                    coil.scaling.setAll(pulse);
                }
            });
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
        if (this.cannonAnimationElements.shotgunBarrels) {
            this.cannonAnimationElements.shotgunBarrels.forEach((barrel, i) => {
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += deltaTime * (1 + i * 0.1);
                }
            });
        }
        
        // Multishot - вращение стволов
        if (this.cannonAnimationElements.multishotBarrels) {
            this.cannonAnimationElements.multishotBarrels.forEach((barrel, i) => {
                if (barrel && !barrel.isDisposed()) {
                    barrel.rotation.z += deltaTime * (1 + i * 0.3);
                }
            });
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
            this.cannonAnimationElements.beamLenses.forEach((lens, i) => {
                if (lens && !lens.isDisposed()) {
                    lens.rotation.y += deltaTime * (2 + i * 0.5);
                    const pulse = Math.sin(time * 4 + i * 0.3) * 0.05 + 1.0;
                    lens.scaling.setAll(pulse);
                }
            });
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
            this.chassisAnimationElements.hoverThrusters.forEach((thruster, i) => {
                if (thruster && !thruster.isDisposed()) {
                    const pulse = Math.sin(time * 3 + i * 0.5) * 0.15 + 1.0;
                    thruster.scaling.setAll(pulse);
                    const mat = thruster.material as StandardMaterial;
                    if (mat && mat.emissiveColor) {
                        const intensity = (Math.sin(time * 3 + i * 0.5) + 1) * 0.5;
                        mat.emissiveColor = new Color3(0, 0.3 * intensity, 0.6 * intensity);
                    }
                }
            });
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
            this.chassisAnimationElements.droneMeshes.forEach((platform, i) => {
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
            });
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
                setTimeout(animate, 50);
            };
            animate();
            (this.chassisAnimationElements as any).shieldVisual = shield;
        }
        if (this.hud) this.hud.addActiveEffect("Энергощит", "🛡️", "#0f5", 8000);
        if (this.chatSystem) this.chatSystem.success("🛡️ Энергощит активирован!");
        setTimeout(() => {
            this.chassisAnimationElements.shieldActive = false;
            if (this.hud) this.hud.removeActiveEffect("Энергощит");
        }, 8000);
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
                    setTimeout(animate, 50);
                };
                animate();
            }
        }
        setTimeout(() => { if (this.hud) this.hud.removeActiveEffect("Дроны"); }, 15000);
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
    
    private updateShellCasings(): void {
        for (let i = this.shellCasings.length - 1; i >= 0; i--) {
            const casing = this.shellCasings[i];
            
            if (!casing.mesh || casing.mesh.isDisposed()) {
                this.shellCasings.splice(i, 1);
                continue;
            }
            
            // Уменьшаем время жизни (используем deltaTime если доступен)
            const deltaTime = this.scene.getEngine().getDeltaTime();
            casing.lifetime -= deltaTime;
            
            if (casing.lifetime <= 0 || casing.mesh.absolutePosition.y < -1) {
                // Удаляем гильзу
                if (casing.physics) {
                    casing.physics.dispose();
                }
                casing.mesh.dispose();
                this.shellCasings.splice(i, 1);
            }
        }
    }
    
    private updateModules(): void {
        // Модуль 7: Обновление ускоренной стрельбы (cooldown уже изменён в activateModule7)
        // module7Timeout используется в activateModule7 setTimeout callback
        
        // Модуль 8: Автонаводка и автострельба на ближайшего врага
        // module8Timeout используется в activateModule8 setTimeout callback
        if (this.module8Active && this.enemyTanks && this.enemyTanks.length > 0) {
            const tankPos = this.chassis.absolutePosition;
            let nearestEnemy: any = null;
            let nearestDist = Infinity;
            
            for (const enemy of this.enemyTanks) {
                if (!enemy || !enemy.chassis || !enemy.isAlive) continue;
                
                const enemyPos = enemy.chassis.absolutePosition;
                const dist = Vector3.Distance(tankPos, enemyPos);
                
                if (dist < nearestDist) {
                    nearestDist = dist;
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
        
        // Модуль 9: Маневрирование от выстрелов
        if (this.module9Active && this.enemyTanks && this.enemyTanks.length > 0) {
            const tankPos = this.chassis.absolutePosition;
            const now = Date.now();
            
            // Меняем направление маневрирования каждые 1.5 секунды
            if (now - this.module9LastManeuverChange > 1500) {
                this.module9ManeuverDirection *= -1;
                this.module9LastManeuverChange = now;
            }
            
            // Находим ближайшего врага
            let nearestEnemy: any = null;
            let nearestDist = Infinity;
            
            for (const enemy of this.enemyTanks) {
                if (!enemy || !enemy.chassis || !enemy.isAlive) continue;
                
                const enemyPos = enemy.chassis.absolutePosition;
                const dist = Vector3.Distance(tankPos, enemyPos);
                
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestEnemy = enemy;
                }
            }
            
            // Если враг близко, маневрируем
            if (nearestEnemy && nearestDist < 80) {
                const enemyPos = nearestEnemy.chassis.absolutePosition;
                const toPlayer = tankPos.subtract(enemyPos).normalize();
                
                // Вычисляем перпендикулярное направление для маневрирования
                const right = Vector3.Cross(toPlayer, Vector3.Up()).normalize();
                
                // Применяем силу в направлении маневрирования (зигзаг)
                const maneuverForce = right.scale(10000 * this.module9ManeuverDirection);
                this.physicsBody.applyImpulse(maneuverForce, tankPos);
                
                // Также добавляем небольшое движение вперёд/назад для более сложного маневрирования
                const forwardComponent = toPlayer.scale(-5000); // Отдаляемся от врага
                this.physicsBody.applyImpulse(forwardComponent, tankPos);
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
}