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
    private cameraShakeCallback: ((intensity: number) => void) | null = null;
    chatSystem: any = null; // ChatSystem для сообщений
    experienceSystem: any = null; // ExperienceSystem для опыта
    playerProgression: any = null; // PlayerProgressionSystem для глобального прогресса
    
    // Callback для получения позиции респавна (гараж)
    private respawnPositionCallback: (() => Vector3 | null) | null = null;
    
    // Респавн с таймером
    private respawnCountdown = 0; // Секунды до респавна
    private respawnIntervalId: number | null = null;
    
    // Защита от урона после респавна
    private isInvulnerable = false;
    private invulnerabilityDuration = 3000; // 3 секунды защиты
    private invulnerabilityStartTime = 0;
    private invulnerabilityGlow: Mesh | null = null;
    
    // Эффекты движения
    private _lastMovementSoundTime: number = 0;
    
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
    private shellCasings: Array<{
        mesh: Mesh;
        physics: PhysicsBody;
        lifetime: number;
    }> = [];
    
    // Tank type configuration
    chassisType: ChassisType;
    cannonType: CannonType;
    
    // Config (будут переопределены типом корпуса)
    mass = 1875;
    hoverHeight = 1.0;  // Hover height
    
    // Movement Settings (будут переопределены типом корпуса)
    moveSpeed = 24;         // Slower max speed
    turnSpeed = 2.5;        // Moderate turning
    acceleration = 10000;    // Smooth acceleration (was 20000!)
    turnAccel = 11000;      // Угловое ускорение поворота
    stabilityTorque = 2000; // Стабилизация при повороте на скорости
    yawDamping = 4500;      // Демпфирование рыскания
    sideFriction = 13000;   // Боковое трение
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
    
    // Shooting (будет переопределено типом пушки)
    damage = 25; // Базовый урон

    // State
    private _tmpVector = new Vector3();
    private _tmpVector2 = new Vector3();
    private _tmpVector3 = new Vector3();
    private _tmpVector4 = new Vector3();
    private _tmpVector5 = new Vector3(); // For torque scaling to avoid mutations
    private _tmpVector6 = new Vector3(); // For hoverForceVec (to avoid corrupting up)
    private _tmpVector7 = new Vector3(); // For correctiveTorque (to avoid corrupting forward)
    private _resetTimer: number = 0; // Таймер для автоматического сброса при опрокидывания
    private _logFrameCounter = 0; // Счетчик кадров для логирования
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
    cooldown = 2000; // 2 seconds reload
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
        
        // 1. Visuals - используем размеры из типа корпуса
        // Разные корпуса имеют разные формы для визуального различия
        if (this.chassisType.id === "light" || this.chassisType.id === "scout") {
            // Лёгкие корпуса - более угловатые
            this.chassis = MeshBuilder.CreateBox("tankHull", { 
                width: this.chassisType.width, 
                height: this.chassisType.height * 0.9, 
                depth: this.chassisType.depth 
            }, scene);
        } else if (this.chassisType.id === "heavy") {
            // Тяжёлые корпуса - более массивные
            this.chassis = MeshBuilder.CreateBox("tankHull", { 
                width: this.chassisType.width, 
                height: this.chassisType.height * 1.1, 
                depth: this.chassisType.depth 
            }, scene);
        } else {
            // Стандартные корпуса
            this.chassis = MeshBuilder.CreateBox("tankHull", { 
                width: this.chassisType.width, 
                height: this.chassisType.height, 
                depth: this.chassisType.depth 
            }, scene);
        }
        this.chassis.position.copyFrom(position);
        
        const mat = new StandardMaterial("tankMat", scene);
        mat.diffuseColor = Color3.FromHexString(this.chassisType.color);
        mat.specularColor = Color3.Black();
        mat.disableLighting = false; // Используем освещение для реализма
        mat.freeze(); // Замораживаем материал для производительности
        this.chassis.material = mat;
        
        // ВАЖНО: Metadata для обнаружения снарядами врагов
        this.chassis.metadata = { type: "playerTank", instance: this };

        this.createVisualWheels();

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
        
        // Пушка - используем размеры из типа пушки
        // Разные пушки имеют разные размеры для визуального различия
        const barrelWidth = this.cannonType.barrelWidth;
        const barrelLength = this.cannonType.barrelLength;
        
        // Снайперская пушка - длиннее и тоньше
        if (this.cannonType.id === "sniper") {
            this.barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.8, 
                height: barrelWidth * 0.8, 
                depth: barrelLength * 1.2 
            }, scene);
        } 
        // Гатлинг - короче и толще
        else if (this.cannonType.id === "gatling") {
            this.barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.3, 
                height: barrelWidth * 1.3, 
                depth: barrelLength * 0.8 
            }, scene);
        }
        // Тяжёлая пушка - толще
        else if (this.cannonType.id === "heavy") {
            this.barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.2, 
                height: barrelWidth * 1.2, 
                depth: barrelLength 
            }, scene);
        }
        // Остальные - стандартные
        else {
            this.barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth, 
                height: barrelWidth, 
                depth: barrelLength 
            }, scene);
        }
        // Позиция ствола - начинается от края башни (логично!)
        // Край башни находится на turretDepth / 2, начало ствола должно быть там же
        // Центр ствола находится на расстоянии barrelLength / 2 от начала
        const baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        this.barrel.position.z = baseBarrelZ;
        this.barrel.position.y = 0;
        this.barrel.parent = this.turret;
        this.barrel.renderingGroupId = 1; // Тот же renderingGroupId что и у башни, чтобы ствол не рендерился поверх
        
        // Устанавливаем начальный масштаб ствола
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
        this.physicsBody.setMassProperties({ mass: this.mass, centerOfMass: new Vector3(0, -0.4, 0) }); // Very low COM
        this.physicsBody.setLinearDamping(0.5);   // More damping
        this.physicsBody.setAngularDamping(3.0);  // Prevent wild rotations 
        // this.physicsBody.setActivationState(PhysicsMotionType.ALWAYS_ACTIVE); // Removed: Not supported in V2

        // 3. Loop
        scene.onBeforePhysicsObservable.add(() => this.updatePhysics());
        
        // 4. Inputs
        this.setupInput();
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

    takeDamage(amount: number) {
        if (!this.isAlive) return;
        
        // Применяем бонус брони от уровня опыта
        let finalDamage = amount;
        if (this.experienceSystem) {
            const chassisBonus = this.experienceSystem.getChassisLevelBonus(this.chassisType.id);
            if (chassisBonus && chassisBonus.armorBonus > 0) {
                const reduction = 1 - chassisBonus.armorBonus;
                finalDamage = Math.round(amount * reduction);
                if (finalDamage < amount) {
                    console.log(`[ARMOR] Damage reduced: ${amount} -> ${finalDamage} (${(chassisBonus.armorBonus * 100).toFixed(0)}% armor)`);
                }
            }
        }
        
        this.currentHealth = Math.max(0, this.currentHealth - finalDamage);
        if (this.hud) {
            this.hud.damage(finalDamage);
        }
        
        // Play hit sound (разные звуки для разных типов попаданий) with 3D positioning
        if (this.soundManager) {
            const hitType = finalDamage > 30 ? "critical" : finalDamage > 15 ? "armor" : "normal";
            const hitPos = this.chassis.position.clone();
            this.soundManager.playHit(hitType, hitPos);
        }
        
        // Тряска камеры при получении урона
        if (this.cameraShakeCallback) {
            const intensity = Math.min(0.5, finalDamage / 50); // Интенсивность зависит от урона
            this.cameraShakeCallback(intensity);
        }
        
        // Записываем полученный урон для опыта корпуса (оригинальный урон)
        if (this.experienceSystem) {
            this.experienceSystem.recordDamageTaken(this.chassisType.id, amount);
        }
        // Записываем полученный урон в статистику игрока
        if (this.playerProgression) {
            this.playerProgression.recordDamageTaken(finalDamage);
        }
        
        console.log(`[DAMAGE] Tank took ${finalDamage} damage! HP: ${this.currentHealth}/${this.maxHealth}`);
        
        if (this.currentHealth <= 0) {
            this.die();
        }
    }

    heal(amount: number) {
        if (!this.isAlive) return;
        
        this.currentHealth = Math.min(this.maxHealth, this.currentHealth + amount);
        if (this.hud) {
            this.hud.heal(amount);
        }
    }
    
    // Активировать защиту от урона
    private activateInvulnerability(): void {
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
        
        // Создаём визуальный эффект защиты (свечение)
        if (this.chassis && this.effectsManager) {
            this.createInvulnerabilityGlow();
        }
        
        // Обновляем HUD
        if (this.hud) {
            this.hud.setInvulnerability(true, this.invulnerabilityDuration);
        }
        
        // Сообщение в чат
        if (this.chatSystem) {
            this.chatSystem.info("Защита активирована", 0);
        }
        
        // Отключаем защиту через заданное время
        setTimeout(() => {
            this.deactivateInvulnerability();
        }, this.invulnerabilityDuration);
    }
    
    // Деактивировать защиту от урона
    private deactivateInvulnerability(): void {
        this.isInvulnerable = false;
        
        // Удаляем визуальный эффект
        if (this.invulnerabilityGlow) {
            this.invulnerabilityGlow.dispose();
            this.invulnerabilityGlow = null;
        }
        
        // Обновляем HUD
        if (this.hud) {
            this.hud.setInvulnerability(false);
        }
    }
    
    // Создать визуальный эффект защиты
    private createInvulnerabilityGlow(): void {
        if (!this.chassis) return;
        
        // Создаём светящееся кольцо вокруг танка
        const glow = MeshBuilder.CreateCylinder("invulnerabilityGlow", { 
            diameter: this.chassisType.width + 2, 
            height: 0.2, 
            tessellation: 32 
        }, this.scene);
        glow.position = this.chassis.position.clone();
        glow.position.y = 1;
        glow.rotation.x = Math.PI / 2;
        
        const mat = new StandardMaterial("invulnerabilityMat", this.scene);
        mat.diffuseColor = new Color3(0, 1, 1); // Голубой
        mat.emissiveColor = new Color3(0, 0.8, 0.8);
        mat.disableLighting = true;
        glow.material = mat;
        
        this.invulnerabilityGlow = glow;
        
        // Анимация пульсации
        let pulsePhase = 0;
        const pulse = () => {
            if (!this.isInvulnerable || !glow || glow.isDisposed()) return;
            
            pulsePhase += 0.1;
            const scale = 1 + Math.sin(pulsePhase) * 0.1;
            glow.scaling.setAll(scale);
            
            if (this.isInvulnerable) {
                requestAnimationFrame(pulse);
            }
        };
        pulse();
    }
    
    // Обновить таймер защиты (вызывается каждый кадр)
    private updateInvulnerability(): void {
        if (!this.isInvulnerable) return;
        
        const elapsed = Date.now() - this.invulnerabilityStartTime;
        const timeLeft = this.invulnerabilityDuration - elapsed;
        
        if (timeLeft <= 0) {
            this.deactivateInvulnerability();
        } else {
            // Обновляем визуальный эффект
            if (this.invulnerabilityGlow && this.chassis) {
                this.invulnerabilityGlow.position = this.chassis.position.clone();
                this.invulnerabilityGlow.position.y = 1;
            }
            
            // Обновляем HUD
            if (this.hud) {
                this.hud.updateInvulnerability(timeLeft);
            }
        }
    }
    
    // Проверить, защищён ли танк
    isInvulnerableNow(): boolean {
        return this.isInvulnerable;
    }
    
    // Получить оставшееся время защиты
    getInvulnerabilityTimeLeft(): number {
        if (!this.isInvulnerable) return 0;
        const elapsed = Date.now() - this.invulnerabilityStartTime;
        return Math.max(0, this.invulnerabilityDuration - elapsed);
    }

    die() {
        if (!this.isAlive) return; // Уже мёртв
        
        this.isAlive = false;
        console.log("[TANK] Destroyed!");
        
        // Останавливаем все движения
        if (this.physicsBody) {
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        // Сбрасываем инпуты
        this.throttleTarget = 0;
        this.steerTarget = 0;
        this.smoothThrottle = 0;
        this.smoothSteer = 0;
        this.turretTurnTarget = 0;
        this.turretTurnSmooth = 0;
        
        // Play explosion sound with 3D positioning
        if (this.soundManager) {
            const explosionPos = this.chassis.position.clone();
            this.soundManager.playExplosion(explosionPos, 1.0);
        }
        
        // Create explosion effect
        if (this.effectsManager) {
            this.effectsManager.createExplosion(this.chassis.position.clone(), 2);
        }
        
        // Show death message
        if (this.hud) {
            this.hud.showDeathMessage();
        }
        
        // Record death in player progression
        if (this.playerProgression) {
            this.playerProgression.recordDeath();
        }
        
        // Сбрасываем серию убийств в системе опыта
        if (this.experienceSystem) {
            this.experienceSystem.recordDeath();
        }
        
        // Respawn after 3 seconds
        console.log("[TANK] Scheduling respawn in 3 seconds...");
        setTimeout(() => {
            console.log("[TANK] Respawn timer fired!");
            if (!this.isAlive) {
            this.respawn();
            } else {
                console.log("[TANK] Already alive, skipping respawn");
            }
        }, 3000);
    }

    // Применить улучшения из гаража и бонусы от уровня опыта
    private applyUpgrades(): void {
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
                respawnPos = new Vector3(0, 2.0, 0);
                console.log(`[TANK] === RESPAWN TO DEFAULT GARAGE: (0, 2, 0) ===`);
            }
        } else {
            // Если callback не установлен, используем центр гаража по умолчанию
            respawnPos = new Vector3(0, 2.0, 0);
            console.log(`[TANK] === RESPAWN TO DEFAULT GARAGE (no callback): (0, 2, 0) ===`);
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

    private updateInputs() {
        // ВАЖНО: updateInputs() НЕ зависит от isAiming!
        // Управление танком работает одинаково в любом режиме!
        this.throttleTarget = 0;
        if (this._inputMap["KeyW"] || this._inputMap["ArrowUp"]) this.throttleTarget += 1;
        if (this._inputMap["KeyS"] || this._inputMap["ArrowDown"]) this.throttleTarget -= 1;

        this.steerTarget = 0;
        if (this._inputMap["KeyA"] || this._inputMap["ArrowLeft"]) this.steerTarget -= 1;
        if (this._inputMap["KeyD"] || this._inputMap["ArrowRight"]) this.steerTarget += 1;
        
        // Debug: Log input changes
        if (this._tick % 120 === 0 && (this.throttleTarget !== 0 || this.steerTarget !== 0)) {
            console.log(`[Input] Throttle: ${this.throttleTarget}, Steer: ${this.steerTarget}, W: ${this._inputMap["KeyW"]}, S: ${this._inputMap["KeyS"]}, A: ${this._inputMap["KeyA"]}, D: ${this._inputMap["KeyD"]}`);
        }
        
        // Turret Control (smoothed; mouse disabled)
        this.turretTurnTarget = 0;
        this.isKeyboardTurretControl = false; // Сбрасываем флаг каждый кадр
        
        // Ручное управление (отменяет авто-центрирование)
        if (this._inputMap["KeyZ"]) {
            this.turretTurnTarget -= 1;
            this.isAutoCentering = false;
            this.isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
        if (this._inputMap["KeyX"]) {
            this.turretTurnTarget += 1;
            this.isAutoCentering = false;
            this.isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }

        // Автоматическое центрирование (активируется по C) - с ОБЫЧНОЙ скоростью вращения
        // НО ТОЛЬКО если игрок не управляет башней вручную (Z/X или мышка)
        if ((this.isAutoCentering || this._inputMap["KeyC"]) && !this.isKeyboardTurretControl) {
            // Нормализуем угол к [-PI, PI] для кратчайшего пути
            let currentRot = this.turret.rotation.y;
            while (currentRot > Math.PI) currentRot -= Math.PI * 2;
            while (currentRot < -Math.PI) currentRot += Math.PI * 2;
            
            // Если башня уже в центре и игрок нажимает C - просто синхронизируем cameraYaw и выходим
            if (Math.abs(currentRot) < 0.01) {
                if (this._inputMap["KeyC"] && !this.isAutoCentering) {
                    // Башня уже в центре, просто синхронизируем cameraYaw через событие
                    this.turret.rotation.y = 0;
                    window.dispatchEvent(new CustomEvent("syncCameraYaw", { 
                        detail: { turretRotY: 0 } 
                    }));
                    // Не запускаем центрирование, если башня уже в центре
                    return;
                }
                // Если уже центрируемся и достигли центра - завершаем
                if (this.isAutoCentering) {
                    // Достигли центра - останавливаем вращение
                    this.turret.rotation.y = 0;
                    this.turretTurnTarget = 0;
                    this.turretTurnSmooth = 0;
                    this.turretAcceleration = 0;
                    this.turretAccelStartTime = 0;
                    this.isAutoCentering = false;
                    
                    // Синхронизируем cameraYaw с углом башни (0 когда башня в центре)
                    window.dispatchEvent(new CustomEvent("syncCameraYaw", { 
                        detail: { turretRotY: 0 } 
                    }));
                    
                    window.dispatchEvent(new CustomEvent("centerCamera", { 
                        detail: { turretRotY: 0, lerpSpeed: 0.06, isActive: false } 
                    }));
                    window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                }
            } else {
                // Башня не в центре - запускаем центрирование
                if (this._inputMap["KeyC"]) this.isAutoCentering = true;
                
                // Используем ОБЫЧНУЮ скорость вращения башни для центровки
                const baseTurretSpeed = this.baseTurretSpeed; // Та же скорость, что и при обычном вращении
                
                // Вычисляем направление к центру
                const targetDirection = -Math.sign(currentRot); // -1 или 1, в зависимости от направления
                
                // Устанавливаем цель вращения (как при ручном управлении)
                this.turretTurnTarget = targetDirection;
                
                // Включаем ускорение башни (как при обычном вращении)
                if (this.turretAccelStartTime === 0) {
                    this.turretAccelStartTime = performance.now();
                }
                
                // Камера следует за башней
                window.dispatchEvent(new CustomEvent("centerCamera", { 
                    detail: { 
                        turretRotY: this.turret.rotation.y, 
                        lerpSpeed: baseTurretSpeed,
                        isActive: true
                    } 
                }));
            }
        } else if (this.isKeyboardTurretControl) {
            // Если игрок управляет башней вручную - отменяем центрирование
            this.isAutoCentering = false;
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
    }

    reset() {
        if (!this.chassis || !this.physicsBody) {
            console.error("[TANK] Reset failed - chassis or physicsBody is null!");
            return;
        }
        
        // Убеждаемся что физика активна ПЕРЕД сбросом скорости
        if (this.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
        
        // ПОЛНЫЙ сброс физики ПЕРВЫМ (чтобы не было прыжков!)
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());
        
        // Полный сброс позиции (будет установлена из гаража при респавне)
        const spawnPos = new Vector3(0, 3, 0);
        this.chassis.position.copyFrom(spawnPos);
        
        // Сброс вращения корпуса
        this.chassis.rotationQuaternion = Quaternion.Identity();
        this.chassis.rotation.set(0, 0, 0);
        
        // Сброс вращения башни
        this.turret.rotation.set(0, 0, 0);
        
        // Принудительно обновляем матрицу
        this.chassis.computeWorldMatrix(true);
        this.turret.computeWorldMatrix(true);
        this.barrel.computeWorldMatrix(true);
        
        // КРИТИЧЕСКИ ВАЖНО: Ждём один кадр перед повторным сбросом скорости (чтобы избежать прыжков!)
        setTimeout(() => {
            if (this.physicsBody && this.chassis) {
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());
            }
        }, 16); // Один кадр (16ms)
        
        // Дополнительно: сбрасываем все силы и импульсы
        // (Havok может не поддерживать напрямую, но попробуем)
        try {
            // Применяем противоположные силы чтобы остановить всё
            const vel = this.physicsBody.getLinearVelocity();
            const angVel = this.physicsBody.getAngularVelocity();
            if (vel && vel.length() > 0.01) {
                this.physicsBody.applyImpulse(vel.scale(-this.mass), this.chassis.absolutePosition);
            }
            if (angVel && angVel.length() > 0.01) {
                this.physicsBody.applyAngularImpulse(angVel.scale(-this.mass * 0.1));
            }
        } catch (e) {
            // Игнорируем если не поддерживается
        }
        
        console.log("[TANK] Reset complete - Position:", spawnPos, "Alive:", this.isAlive);
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
            
            // Create muzzle flash effect
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos, shootDirection);
            }

            // Create projectile - используем параметры пушки
            const forward = shootDirection;
            
            // Размер снаряда из типа пушки
            const bulletSize = this.projectileSize;
            const ball = MeshBuilder.CreateBox("bullet", { 
                width: bulletSize, 
                height: bulletSize, 
                depth: bulletSize * 3 
            }, this.scene);
            ball.position.copyFrom(muzzlePos);
            ball.lookAt(ball.position.add(forward));
            ball.material = this.bulletMat; // Bright glowing yellow
            ball.metadata = { type: "bullet", owner: "player", damage: this.damage }; // Metadata с уроном

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
            this.createShellCasing(muzzlePos, barrelDir);
            
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
                        console.log("%c[HIT] ENEMY TANK! Damage: " + projectileDamage + " | Distance: " + dist.toFixed(1), "color: red; font-weight: bold");
                        enemy.takeDamage(projectileDamage);
                        if (this.effectsManager) this.effectsManager.createExplosion(bulletPos, 1.2);
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
                        // Записываем урон в статистику игрока
                        if (this.playerProgression) {
                            this.playerProgression.recordShot(true);
                            this.playerProgression.recordDamageDealt(projectileDamage);
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

    private applyTorque(torque: Vector3) {
        // Защитные проверки перед применением момента
        if (!this.physicsBody || !this.chassis || this.chassis.isDisposed()) return;
        
        // Проверка на валидность вектора момента
        if (!isFinite(torque.x) || !isFinite(torque.y) || !isFinite(torque.z)) return;
        
        try {
            const body = this.physicsBody as any;
            if (body && body.applyTorque) {
                body.applyTorque(torque);
            } else if (body && body.applyAngularImpulse) {
                // Use scaleToRef to avoid mutating the input vector
                torque.scaleToRef(0.016, this._tmpVector5);
                body.applyAngularImpulse(this._tmpVector5);
            }
        } catch (e) {
            // Игнорируем ошибки применения момента для предотвращения крашей
            console.warn("[TANK] applyTorque error:", e);
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
            
            // Обновляем время игры для системы опыта
            if (this.experienceSystem) {
                this.experienceSystem.updatePlayTime(this.chassisType.id, this.cannonType.id);
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
            if (this.soundManager && Math.abs(this.smoothThrottle) > 0.2) {
                const now = Date.now();
                if (!this._lastMovementSoundTime) this._lastMovementSoundTime = 0;
                if (now - this._lastMovementSoundTime > 300) {
                    this.soundManager.playMovement();
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
                    this.updateBarrelVisibility(baseZ);
                }
            }
            
            // Обновляем гильзы
            this.updateShellCasings();

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
            // Улучшенная обработка ошибок с детальной информацией
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