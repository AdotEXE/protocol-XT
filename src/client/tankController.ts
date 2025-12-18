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
import { logger } from "./utils/logger";
import { getChassisById, getCannonById, type ChassisType, type CannonType } from "./tankTypes";
import { getTrackById, type TrackType } from "./trackTypes";
import { TankHealthModule } from "./tank/tankHealth";
import { TankMovementModule } from "./tank/tankMovement";
import { TankProjectilesModule } from "./tank/tankProjectiles";
import { TankVisualsModule } from "./tank/tankVisuals";
import type { ChassisAnimationElements } from "./tank/tankChassis";
import type { ShellCasing } from "./tank/types";
import { getSkinById, loadSelectedSkin, applySkinToTank } from "./tank/tankSkins";

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
    chassisAnimationElements: ChassisAnimationElements & {
        stealthActive?: boolean;
        shieldActive?: boolean;
        energyBoosters?: Mesh[];
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
    chassisType: ChassisType;
    cannonType: CannonType;
    trackType: TrackType;
    
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
    hoverStiffness = 3500;   // Снижено с 4000 для плавности
    hoverDamping = 30000;    // Увеличено с 20000 для сильного демпфирования
    uprightForce = 10000;    // Без изменений
    uprightDamp = 7000;     // Без изменений
    stabilityForce = 2500;  // Без изменений
    emergencyForce = 15000; // Без изменений
    liftForce = 0;          // УСТАНОВЛЕНО В 0 - полностью отключено для предотвращения взлета
    downForce = 4000;       // Увеличено с 2000 для лучшего сцепления с землей

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
    
    private _resetTimer: number = 0; // Таймер для автоматического сброса при опрокидывания
    private _logFrameCounter = 0; // Счетчик кадров для логирования
    
    // Ground clamping cache
    private _groundRaycastCache: { groundHeight: number, frame: number } | null = null;
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
    
    // Module visuals - визуальные меши для модулей (6-0)
    private moduleVisuals: Map<number, Mesh[]> = new Map();
    
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
        logger.log("TankController: Init Start");
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
        
        // Загружаем типы корпуса, пушки и гусениц из localStorage или используем по умолчанию
        const savedChassisId = localStorage.getItem("selectedChassis") || "medium";
        const savedCannonId = localStorage.getItem("selectedCannon") || "standard";
        const savedTrackId = localStorage.getItem("selectedTrack") || "standard";
        
        this.chassisType = getChassisById(savedChassisId);
        this.cannonType = getCannonById(savedCannonId);
        this.trackType = getTrackById(savedTrackId);
        
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
        
        // Применяем скин к корпусу, если выбран
        const selectedSkinId = loadSelectedSkin();
        if (selectedSkinId && this.chassis.material) {
            const skin = getSkinById(selectedSkinId);
            if (skin) {
                const skinColors = applySkinToTank(skin);
                (this.chassis.material as StandardMaterial).diffuseColor = skinColors.chassisColor;
            }
        }
        
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
        // Башня строго по центру корпуса (X=0, Z=0) и на нужной высоте
        this.turret.position = new Vector3(0, this.chassisType.height / 2 + turretHeight / 2, 0);
        this.turret.parent = this.chassis;
        
        const turretMat = new StandardMaterial("turretMat", scene);
        // Башня - применяем скин если выбран, иначе используем цвет из chassisType
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
        this.turret.material = turretMat;
        // All tank parts use same renderingGroupId for proper z-buffer depth testing
        this.turret.renderingGroupId = 0;
        
        // Пушка - создаём уникальные формы для каждого типа
        const barrelWidth = this.cannonType.barrelWidth;
        const barrelLength = this.cannonType.barrelLength;
        const baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        
        this.barrel = this.visualsModule.createUniqueCannon(scene, barrelWidth, barrelLength);
        // Ствол строго по центру башни по X и Y, и выдвинут вперед по Z
        this.barrel.position = new Vector3(0, 0, baseBarrelZ);
        this.barrel.parent = this.turret;
        this.barrel.renderingGroupId = 0;
        this.barrel.scaling.set(1.0, 1.0, 1.0);
        
        // Сохраняем исходную позицию пушки для отката
        this._baseBarrelZ = baseBarrelZ;
        this._baseBarrelY = 0;
        
        // Переменные для анимации отката ствола (подъем/опускание)
        this._barrelRecoilY = 0;
        this._barrelRecoilYTarget = 0;
        
        // 2. Physics - корпус (chassis)
        const chassisShape = new PhysicsShape({ 
            type: PhysicsShapeType.BOX, 
            parameters: { 
                center: new Vector3(0, 0, 0), 
                rotation: Quaternion.Identity(), 
                extents: new Vector3(this.chassisType.width, this.chassisType.height, this.chassisType.depth) 
            } 
        }, scene);
        chassisShape.filterMembershipMask = 1;
        chassisShape.filterCollideMask = 2 | 32;
        
        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, scene);
        this.physicsBody.shape = chassisShape;
        this.physicsBody.setMassProperties({ mass: this.mass, centerOfMass: new Vector3(0, -0.55, 0) });
        this.physicsBody.setLinearDamping(0.8);
        this.physicsBody.setAngularDamping(4.0);

        // 3. Loop
        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());
        
        // 4. Inputs
        this.setupInput();
        
        // 5. Initialize modules
        this.healthModule = new TankHealthModule(this);
        this.movementModule = new TankMovementModule(this);
        
        // 6. Create module visuals
        this.createModuleVisuals();
        
        logger.log("TankController: Init Success");
    }
    
    // Создать визуальные меши для модулей
    // Модули размещаются в фиксированных слотах:
    // - На корпусе: модули 6 (щит), 9 (маневрирование), 0 (прыжок)
    // - На башне: модуль 8 (автонаводка)
    // - На пушке: модуль 7 (ускоренная стрельба)
    private createModuleVisuals(): void {
        if (!this.chassis || !this.turret || !this.barrel) return;
        
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        const d = this.chassisType.depth;
        
        // Создаём визуализацию для каждого модуля
        this.createModule6Visual(w, h, d);  // Щит на корпусе (перед)
        this.createModule7Visual();         // Индикатор на пушке
        this.createModule8Visual(w);        // Радар на башне (использует только ширину)
        this.createModule9Visual(w, h, d);  // Ускорители на корпусе (по бокам)
        this.createModule0Visual(w, h, d);  // Двигатели на корпусе (сзади)
        
        // Обновляем видимость модулей в зависимости от установки
        this.updateModuleVisuals();
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
    
    // Модуль 9 - Маневрирование (реактивные ускорители по бокам)
    private createModule9Visual(w: number, h: number, d: number): void {
        const meshes: Mesh[] = [];
        
        // Реактивные ускорители по бокам корпуса
        for (let i = 0; i < 2; i++) {
            const thruster = MeshBuilder.CreateBox(`module9_thruster_${i}`, {
                width: 0.4,
                height: 0.4,
                depth: 0.6
            }, this.scene);
            thruster.position = new Vector3(
                (i === 0 ? -1 : 1) * w * 0.45,
                h * 0.2,
                -d * 0.3
            );
            thruster.parent = this.chassis;
            
            const thrusterMat = new StandardMaterial(`module9Mat_${i}`, this.scene);
            thrusterMat.diffuseColor = new Color3(0.2, 0.8, 0.8); // Голубой/циан
            thrusterMat.emissiveColor = new Color3(0.1, 0.4, 0.4);
            thrusterMat.specularColor = Color3.Black();
            thruster.material = thrusterMat;
            meshes.push(thruster);
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
            meshes.forEach(mesh => {
                mesh.isVisible = isInstalled;
            });
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
                modules.forEach(id => installed.add(id));
            } else {
                // По умолчанию все модули установлены для тестирования
                // В будущем можно будет добавить систему покупки/установки модулей через гараж
                installed.add(6);
                installed.add(7);
                installed.add(8);
                installed.add(9);
                installed.add(0);
                // Сохраняем по умолчанию
                this.saveInstalledModules(installed);
            }
        } catch (e) {
            logger.warn("[TankController] Failed to load installed modules:", e);
            // По умолчанию все модули установлены
            installed.add(6);
            installed.add(7);
            installed.add(8);
            installed.add(9);
            installed.add(0);
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
    }
    
    // Удалить модуль (вызывается из гаража)
    public uninstallModule(moduleId: number): void {
        const installed = this.getInstalledModules();
        installed.delete(moduleId);
        this.saveInstalledModules(installed);
        this.updateModuleVisuals();
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
                logger.log(`[Tank] Experience bonuses applied: Chassis Lv.${chassisLevel}, Cannon Lv.${cannonLevel}`);
            }
            
            // === 3. БОНУСЫ ОТ НАВЫКОВ ИГРОКА ===
            if (this.playerProgression) {
                const skillBonuses = this.playerProgression.getSkillBonuses();
                this.maxHealth += skillBonuses.healthBonus;
                this.damage += skillBonuses.damageBonus;
                this.moveSpeed += skillBonuses.speedBonus;
                this.cooldown = Math.max(300, this.cooldown - skillBonuses.reloadBonus);
                this.turnSpeed += skillBonuses.turretSpeedBonus;
                
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
            
            // Обновляем текущее здоровье
            this.currentHealth = this.maxHealth;
            
            logger.log(`[Tank] Final stats: HP=${this.maxHealth}, Speed=${this.moveSpeed.toFixed(1)}, Damage=${this.damage}, Reload=${this.cooldown}ms, ProjSpeed=${this.projectileSpeed}`);
        } catch (e) {
            logger.warn("[Tank] Failed to apply upgrades:", e);
        }
    }

    respawn() {
        logger.log("[TANK] Respawning...");
        
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
                logger.log(`[TANK] === RESPAWN TO GARAGE: (${respawnPos.x.toFixed(1)}, ${respawnPos.y.toFixed(1)}, ${respawnPos.z.toFixed(1)}) ===`);
            } else {
                // Fallback на центр гаража по умолчанию
                respawnPos = new Vector3(0, 1.2, 0);
                logger.log(`[TANK] === RESPAWN TO DEFAULT GARAGE: (0, 1.2, 0) ===`);
            }
        } else {
            // Если callback не установлен, используем центр гаража по умолчанию
            respawnPos = new Vector3(0, 1.2, 0);
            logger.log(`[TANK] === RESPAWN TO DEFAULT GARAGE (no callback): (0, 1.2, 0) ===`);
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
            
            logger.log(`[TANK] Teleporting to garage: X=${targetX.toFixed(2)}, Y=${targetY.toFixed(2)}, Z=${targetZ.toFixed(2)}`);
            
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
        
        console.log("[TANK] Respawned!");
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
        
        // Используем размеры из выбранного типа гусениц
        const trackWidth = this.trackType.width;
        const trackHeight = this.trackType.height;
        const trackDepth = this.trackType.depth;
        
        // Позиционирование относительно корпуса
        const w = this.chassisType.width;
        const h = this.chassisType.height;
        
        // Left track - позиционирование ближе к корпусу для избежания глитчей
        this.leftTrack = MeshBuilder.CreateBox("leftTrack", {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.leftTrack.position = new Vector3(-w * 0.55, -h * 0.25, 0); // Ближе к центру и ниже
        this.leftTrack.parent = this.chassis;
        this.leftTrack.material = trackMat;
        
        // Right track - позиционирование ближе к корпусу для избежания глитчей
        this.rightTrack = MeshBuilder.CreateBox("rightTrack", {
            width: trackWidth,
            height: trackHeight,
            depth: trackDepth
        }, this.scene);
        this.rightTrack.position = new Vector3(w * 0.55, -h * 0.25, 0); // Ближе к центру и ниже
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
            
            // Получаем горизонтальное направление ствола (без учёта вертикального наклона)
            // Это направление башни в горизонтальной плоскости
            const barrelWorldMatrix = this.barrel.getWorldMatrix();
            const barrelForward = Vector3.TransformNormal(Vector3.Forward(), barrelWorldMatrix).normalize();
            
            // КРИТИЧЕСКИ ВАЖНО: Используем aimPitch напрямую для правильного направления выстрела
            // Горизонтальное направление (без Y компонента)
            const horizontalForward = new Vector3(barrelForward.x, 0, barrelForward.z).normalize();
            
            // Применяем aimPitch для создания правильного направления выстрела
            // clampedPitch учитывает ограничения угла наклона
            const clampedPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, this.aimPitch));
            const cosPitch = Math.cos(clampedPitch);
            const sinPitch = Math.sin(clampedPitch);
            
            // Направление выстрела: горизонтальное направление * cos(pitch) + вертикальная компонента * sin(pitch)
            const shootDirection = new Vector3(
                horizontalForward.x * cosPitch,
                sinPitch,
                horizontalForward.z * cosPitch
            ).normalize();
            
            // Получаем позицию конца ствола (дульный срез)
            // Используем реальную длину ствола для точного позиционирования
            const barrelLength = this.cannonType.barrelLength;
            const barrelCenter = this.barrel.getAbsolutePosition();
            const muzzlePos = barrelCenter.add(shootDirection.scale(barrelLength / 2));
            
            // Возвращаем состояние barrel обратно
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(false);
            }
            
            // === ПРОВЕРКА ПРЕПЯТСТВИЙ ПЕРЕД СТВОЛОМ ===
            // Проверяем, не упирается ли ствол в препятствие (стена, здание и т.д.)
            if (this.checkBarrelObstacle(muzzlePos, shootDirection, 1.5)) {
                console.log("[FIRE] Shot blocked by obstacle in front of barrel!");
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
            
            // Special handling for Support cannon
            if (this.cannonType.id === "support") {
                this.fireSupportBeam(muzzlePos, shootDirection);
                return; // Support doesn't create regular projectile
            }
            
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
            
            // === ПРОВЕРКА СТЕНЫ ПЕРЕД СОЗДАНИЕМ СНАРЯДА ===
            // Проверяем, не упирается ли ствол в стену
            const wallCheck = this.checkWallCollisionRaycast(muzzlePos, shootDirection, 0.5);
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
                
                console.log("[FIRE] Shot blocked by wall!");
                return; // Не создаём снаряд - выстрел заблокирован
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
            this.projectilesModule.createShellCasing(muzzlePos, shootDirection);
            
            // ВАЖНО: Отдача НЕ влияет на камеру - только физика танка и визуальный откат пушки

            // === ПРОВЕРКА ПОПАДАНИЙ ===
            const projectileDamage = this.damage; // Урон из типа пушки
            let hasHit = false;
            let ricochetCount = 0;
            const maxRicochets = 3; // До 3 рикошетов!

            // === ОСНОВНАЯ ПРОВЕРКА ПО РАССТОЯНИЮ (надёжнее чем физика!) ===
            const HIT_RADIUS_TANK = 4.0;   // Радиус попадания в танк
            const HIT_RADIUS_TURRET = 2.5; // Радиус попадания в турель
            
            // Сохраняем предыдущую позицию для рейкаста
            let prevBulletPos = ball.absolutePosition.clone();
            
            const checkHit = () => {
                if (hasHit || ball.isDisposed()) return;
                
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
                const enemyWalls = this.scene.meshes.filter(mesh => 
                    mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                );
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
                const enemyWalls = this.scene.meshes.filter(mesh => 
                    mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
                );
                for (const wall of enemyWalls) {
                    const wallMesh = wall as Mesh;
                    if (this.checkPointInWall(bulletPos, wallMesh, "enemyWall")) {
                        hasHit = true;
                        const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 25;
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
                
                // Сохраняем текущую позицию для следующего кадра (для рейкаста)
                prevBulletPos = bulletPos.clone();
                
                // Продолжаем проверку КАЖДЫЙ КАДР
                requestAnimationFrame(checkHit);
            };
            
            // Запускаем проверку СРАЗУ
            checkHit();
            
            // Авто-удаление через 6 секунд (дольше для большей дальности)
            setTimeout(() => {
                if (!ball.isDisposed()) ball.dispose();
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
            const enemyWalls = this.scene.meshes.filter(mesh => 
                mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
            );
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
                // Get real RTT from multiplayer manager if available
                const multiplayerManager = (this as any).multiplayerManager || (window as any).game?.multiplayerManager;
                const estimatedPing = multiplayerManager?.getRTT?.() || 100; // Fallback to 100ms
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
            
        } catch (e) { logger.error("[TRACER ERROR]", e); }
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
            
            // КРИТИЧНО: Убеждаемся, что иерархия мешей НЕ сломана!
            // Башня ДОЛЖНА быть дочерним элементом корпуса
            if (this.turret && this.turret.parent !== this.chassis) {
                this.turret.parent = this.chassis;
                // Восстанавливаем позицию башни строго по центру корпуса
                this.turret.position = new Vector3(0, this.turret.position.y, 0);
            }
            // Ствол ДОЛЖЕН быть дочерним элементом башни
            if (this.barrel && this.turret && this.barrel.parent !== this.turret) {
                this.barrel.parent = this.turret;
                // Восстанавливаем позицию ствола строго по центру башни по X и Y
                this.barrel.position = new Vector3(0, this.barrel.position.y, this.barrel.position.z);
            }
            
            // КРИТИЧНО: Убеждаемся, что башня всегда по центру корпуса по X и Z
            if (this.turret && (this.turret.position.x !== 0 || this.turret.position.z !== 0)) {
                this.turret.position.x = 0;
                this.turret.position.z = 0;
            }
            
            // КРИТИЧНО: Убеждаемся, что ствол всегда по центру башни по X
            if (this.barrel && this.barrel.position.x !== 0) {
                this.barrel.position.x = 0;
            }
            
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

            // --- GROUND CLAMPING (определение высоты земли) ---
            // СНАЧАЛА определяем высоту земли, чтобы hover система работала относительно неё
            // Raycast вниз для определения высоты земли (кэшируем каждые 3 кадра)
            let groundHeight = pos.y - this.hoverHeight; // Значение по умолчанию
            if (!this._groundRaycastCache || (this._logFrameCounter - this._groundRaycastCache.frame) >= 3) {
                const groundRayStart = pos.clone();
                groundRayStart.y += 0.5; // Немного выше танка
                const groundRayDir = Vector3.Down();
                const groundRayLength = 10.0; // Достаточно для любой высоты
                const groundRay = new Ray(groundRayStart, groundRayDir, groundRayLength);

                const groundFilter = (mesh: any) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    const meta = mesh.metadata;
                    if (meta && (meta.type === "bullet" || meta.type === "consumable" || meta.type === "playerTank")) return false;
                    if (mesh === this.chassis || mesh === this.turret || mesh === this.barrel) return false;
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
            const targetHeight = groundHeight + this.hoverHeight;
            const deltaY = targetHeight - pos.y; // Положительно когда танк ниже цели
            const velY = vel.y;
            const absVelY = Math.abs(velY);
            
            // Улучшенная система hover - усиленное демпфирование для предотвращения подпрыгиваний
            let hoverForce = 0;
            if (deltaY > 0) {
                // Танк ниже цели - применяем hover для поднятия
                // УМЕНЬШЕНА чувствительность при движении для предотвращения взлета
                const hoverSensitivity = isMoving ? 0.15 : 1.0; // Еще больше уменьшено с 0.2
                const stiffnessMultiplier = 1.0 + Math.min(Math.abs(deltaY) * 0.015, 0.08) * hoverSensitivity; // Уменьшено
                const dampingMultiplier = isMoving ? 4.0 : 2.0; // Увеличено демпфирование при движении
                hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping * dampingMultiplier);
                
                // Более строгое динамическое ограничение при движении
                const movementReduction = isMoving ? 0.2 : 1.0; // Еще больше уменьшено с 0.3
                const dynamicMaxForce = Math.min(
                    (absVelY > 30 ? 600 : (absVelY > 15 ? 1200 : 2000)) * movementReduction,
                    this.hoverStiffness * 0.4 // Уменьшено с 0.5
                );
                hoverForce = Math.max(-dynamicMaxForce, Math.min(dynamicMaxForce, hoverForce));
            } else {
                // Танк выше цели - ТОЛЬКО демпфирование вниз (усилено)
                hoverForce = -velY * this.hoverDamping * 3.0; // Увеличено с 2.5
                
                // Дополнительная прижимная сила если танк слишком высоко
                if (deltaY < -0.15) {
                    hoverForce -= Math.abs(deltaY) * this.mass * 100; // Усилено прижимание
                }
            }
            const clampedHoverForce = hoverForce;
            
            // Накопление всех вертикальных сил в одну для предотвращения конфликтов
            let totalVerticalForce = clampedHoverForce;
            
            // Добавляем экстренное демпфирование при слишком быстром подъеме (из ограничения скорости)
            if (emergencyDampingForce !== 0) {
                totalVerticalForce += emergencyDampingForce;
            }
            
            // Дополнительное прижимание если танк выше цели более чем на 0.1м (уменьшен порог)
            const heightDiff = pos.y - targetHeight;
            if (heightDiff > 0.1) {
                const clampForce = -heightDiff * this.mass * 120; // Усилена прижимная сила
                const maxClampForce = -this.mass * 400; // Увеличен максимум
                const clampedForce = Math.max(maxClampForce, clampForce);
                totalVerticalForce += clampedForce;
                
                // Дополнительное демпфирование при полете (даже при малой скорости вверх)
                if (vel.y > 0.5) {
                    totalVerticalForce -= vel.y * this.mass * 25; // Усилено демпфирование вверх
                }
            }
            
            // КРИТИЧЕСКАЯ ЗАЩИТА: Если танк выше цели более чем на 0.5м - экстренное прижимание
            if (heightDiff > 0.5) {
                const emergencyClampForce = -this.mass * 500; // Очень сильная прижимная сила
                totalVerticalForce += emergencyClampForce;
                // Принудительно ограничиваем вертикальную скорость
                if (vel.y > 0) {
                    const emergencyVelDamping = -vel.y * this.mass * 50;
                    totalVerticalForce += emergencyVelDamping;
                }
            }
            
            if (shouldLog) {
                console.log(`  [HOVER] GroundY: ${groundHeight.toFixed(2)} | TargetY: ${targetHeight.toFixed(2)} | CurrentY: ${pos.y.toFixed(2)} | DeltaY: ${deltaY.toFixed(3)} | VelY: ${velY.toFixed(2)} | Force: ${clampedHoverForce.toFixed(0)}`);
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
                
                // Lift force полностью отключен для предотвращения подпрыгиваний
                // (liftForce = 0 в параметрах физики)
                
                if (shouldLog) {
                    console.log(`  [EMERGENCY] Torque: [${emergencyX.toFixed(0)}, ${emergencyZ.toFixed(0)}] | Mult: ${emergencyMultiplier.toFixed(2)} | Clamped: ${emergencyWasClamped}`);
                }
            }
            
            // Дополнительная стабилизация: прижимная сила при движении (объединена с hover)
            // Используем кэшированное значение absFwdSpeed для оптимизации
            if (absFwdSpeed > 1) {
                const downForceVal = this.downForce * (1.0 - up.y) * 0.5; // Увеличено с 0.3 для лучшего сцепления
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
                const throttleDownForceVal = Math.abs(this.smoothThrottle) * this.downForce * 0.4; // Увеличено с 0.2 для лучшего сцепления
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
                        logger.warn("[TANK] Error applying movement force:", e);
                    }
                }
                
                if (shouldLog) {
                    console.log(`  [MOVEMENT] TargetSpeed: ${targetSpeed.toFixed(2)} | Current: ${fwdSpeed.toFixed(2)} | Diff: ${speedDiff.toFixed(2)} | Force: ${clampedAccelForce.toFixed(0)}`);
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
                    logger.warn("[TANK] Error applying side friction:", e);
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
            
                // ИСПРАВЛЕНИЕ: Применяем вертикальное движение ствола при прицеливании (aimPitch)
            if (this.barrel && !this.barrel.isDisposed()) {
                // Применяем aimPitch к rotation.x ствола (вертикальный поворот)
                // Ограничиваем угол от -Math.PI/3 (вниз) до Math.PI/4 (вверх)
                const clampedPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, this.aimPitch));
                // Изменён верхний предел с Math.PI/6 (30°) на Math.PI/4 (45°)
                this.barrel.rotation.x = clampedPitch;
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
            // Размеры стенки врага: width=5, height=3.5, depth=0.4
            wallHalfWidth = 2.5;
            wallHalfHeight = 1.75;
            wallHalfDepth = 0.2;
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
        const enemyWalls = this.scene.meshes.filter(mesh => 
            mesh.metadata && mesh.metadata.type === "enemyWall" && !mesh.isDisposed()
        );
        
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
                if (!vel || !startPos || !startRot) return;
                
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
        
        // Создаем гильзу как прямоугольную коробку (не цилиндр)
        const casing = MeshBuilder.CreateBox("shellCasing", {
            width: casingDiameter,
            height: casingLength,
            depth: casingDiameter
        }, this.scene);
        // Повернуть на 90° по X для горизонтального положения
        casing.rotation.x = Math.PI / 2;
        
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
                // Ствол всегда по центру башни по X
                this.barrel.position = new Vector3(0, this.barrel.position.y, baseZ);
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
                // Ствол всегда по центру башни по X
                this.barrel.position = new Vector3(0, this.barrel.position.y, baseZ);
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
}