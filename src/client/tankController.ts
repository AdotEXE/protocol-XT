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
    PhysicsRaycastResult,
    StandardMaterial,
    Color3,
    ActionManager
} from "@babylonjs/core";
import { HUD } from "./hud";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import type { EnemyManager } from "./enemy";

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
    
    // Callback для получения позиции респавна (гараж)
    private respawnPositionCallback: (() => Vector3 | null) | null = null;
    
    // Респавн с таймером
    private respawnCountdown = 0; // Секунды до респавна
    private respawnIntervalId: number | null = null;
    
    // Config
    mass = 1500;
    hoverHeight = 1.0;  // Hover height
    
    // Movement Settings
    moveSpeed = 12;         // Slower max speed
    turnSpeed = 2.5;        // Moderate turning
    acceleration = 8000;    // Smooth acceleration (was 20000!)
    
    // Stability
    hoverStiffness = 30000; 
    hoverDamping = 8000;    // More damping for stability

    // Health System
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;

    // State
    private _tmpVector = new Vector3();
    private _raycastResult = new PhysicsRaycastResult();
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
    private isAutoCentering = false; // Флаг автоматического центрирования башни
    
    // Shooting
    lastShotTime = 0;
    cooldown = 2000; // 2 seconds reload
    isReloading = false;

    // Visuals
    visualWheels: Mesh[] = [];
    
    // Pre-created materials for optimization
    bulletMat: StandardMaterial;

    private _inputMap: { [key: string]: boolean } = {};
    
    // Load tank configuration from localStorage
    private loadTankConfig(): { color: string, turretColor: string, speed: number, armor: number, firepower: number } {
        const saved = localStorage.getItem("tankConfig");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to load tank config");
            }
        }
        return { color: "#00ff00", turretColor: "#888888", speed: 2, armor: 2, firepower: 2 };
    }

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
        
        // Load tank config from localStorage
        const tankConfig = this.loadTankConfig();
        
        // 1. Visuals
        this.chassis = MeshBuilder.CreateBox("tankHull", { width: 2.2, height: 0.8, depth: 3.5 }, scene);
        this.chassis.position.copyFrom(position);
        
        const mat = new StandardMaterial("tankMat", scene);
        mat.diffuseColor = Color3.FromHexString(tankConfig.color);
        mat.specularColor = Color3.Black();
        this.chassis.material = mat;
        
        // ВАЖНО: Metadata для обнаружения снарядами врагов
        this.chassis.metadata = { type: "playerTank", instance: this };

        this.createVisualWheels();

        this.turret = MeshBuilder.CreateBox("turret", { width: 1.4, height: 0.6, depth: 2.0 }, scene);
        this.turret.position.y = 0.7;
        this.turret.parent = this.chassis;
        
        const turretMat = new StandardMaterial("turretMat", scene);
        turretMat.diffuseColor = Color3.FromHexString(tankConfig.turretColor);
        turretMat.specularColor = Color3.Black();
        this.turret.material = turretMat;
        // Render after hull to avoid artifacts
        this.turret.renderingGroupId = 1;
        
        // BOX instead of cylinder
        this.barrel = MeshBuilder.CreateBox("barrel", { width: 0.2, height: 0.2, depth: 2.5 }, scene);
        this.barrel.position.z = 1.5;
        this.barrel.position.y = 0.2;
        this.barrel.parent = this.turret;
        this.barrel.renderingGroupId = 2;
        
        // 2. Physics
        const shape = new PhysicsShape({ 
            type: PhysicsShapeType.BOX, 
            parameters: { 
                center: new Vector3(0, 0, 0), 
                rotation: Quaternion.Identity(), 
                extents: new Vector3(2.2, 0.8, 3.5) 
            } 
        }, scene);
        
        shape.filterMembershipMask = 1;
        shape.filterCollideMask = 2;
        
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
        
        // Показываем начальное сообщение (duration = 0 - не скрывать автоматически)
        if (this.hud) {
            const minutes = Math.floor(this.respawnCountdown / 60);
            const seconds = this.respawnCountdown % 60;
            this.hud.showMessage(`DESTROYED! RESPAWN IN ${minutes}:${seconds.toString().padStart(2, '0')}`, "#f00", 0);
        }
        
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
                // Обновляем сообщение
                if (this.hud) {
                    const minutes = Math.floor(this.respawnCountdown / 60);
                    const seconds = this.respawnCountdown % 60;
                    // Меняем цвет в зависимости от времени
                    let color = "#f00"; // Красный
                    if (this.respawnCountdown <= 30) {
                        color = "#ff0"; // Жёлтый - скоро респавн
                    }
                    if (this.respawnCountdown <= 10) {
                        color = "#0f0"; // Зелёный - почти респавн
                    }
                    this.hud.showMessage(`RESPAWN IN ${minutes}:${seconds.toString().padStart(2, '0')}`, color, 0);
                }
            }
        }, 1000);
    }

    takeDamage(amount: number) {
        if (!this.isAlive) return;
        
        this.currentHealth = Math.max(0, this.currentHealth - amount);
        if (this.hud) {
            this.hud.damage(amount);
        }
        
        // Play hit sound
        if (this.soundManager) {
            this.soundManager.playHit();
        }
        
        console.log(`[DAMAGE] Tank took ${amount} damage! HP: ${this.currentHealth}/${this.maxHealth}`);
        
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
        
        // Play explosion sound
        if (this.soundManager) {
            this.soundManager.playExplosion();
        }
        
        // Create explosion effect
        if (this.effectsManager) {
            this.effectsManager.createExplosion(this.chassis.position.clone(), 2);
        }
        
        // Show death message
        if (this.hud) {
            this.hud.showDeathMessage();
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

    respawn() {
        console.log("[TANK] Respawning...");
        
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
        // КРИТИЧЕСКИ ВАЖНО: Респавн ВСЕГДА в гараже (0, 2, 0)!
        // Гараж находится в центре: X=0, Z=0, внутри от X=-8 до X=+8, Z=-10 до Z=+10
        
        // ПРИНУДИТЕЛЬНО используем центр гаража!
        const respawnPos = new Vector3(0, 2.0, 0);
        console.log(`[TANK] === RESPAWN TO GARAGE CENTER: (0, 2, 0) ===`);
        
        // ТЕЛЕПОРТИРУЕМ ТАНК В ГАРАЖ - ЖЁСТКО И ПРИНУДИТЕЛЬНО!
        if (this.chassis && this.physicsBody) {
            const targetX = respawnPos.x;
            const targetY = respawnPos.y;
            const targetZ = respawnPos.z;
            
            
            // 1. ОТКЛЮЧАЕМ физику временно
            this.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
            
            // 2. Сбрасываем ВСЕ скорости
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // 3. Устанавливаем позицию НАПРЯМУЮ
            this.chassis.position.x = targetX;
            this.chassis.position.y = targetY;
            this.chassis.position.z = targetZ;
            
            // 4. Сбрасываем вращение
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.chassis.rotation.set(0, 0, 0);
            this.turret.rotation.set(0, 0, 0);
            this.barrel.rotation.set(0, 0, 0);
            
            // 5. Обновляем матрицы
            this.chassis.computeWorldMatrix(true);
            this.turret.computeWorldMatrix(true);
            this.barrel.computeWorldMatrix(true);
            
            // 6. Включаем физику обратно через небольшую задержку
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    // Ещё раз устанавливаем позицию
                    this.chassis.position.x = targetX;
                    this.chassis.position.y = targetY;
                    this.chassis.position.z = targetZ;
                    this.chassis.rotationQuaternion = Quaternion.Identity();
                    this.chassis.computeWorldMatrix(true);
                    
                    // Сбрасываем скорости
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                    
                    // Включаем физику
                    this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                    
                }
            }, 100);
            
            // 7. Ещё один сброс через 200мс для надёжности
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                }
            }, 200);
        } else {
            console.error("[TANK] Cannot respawn - chassis or physics body missing!");
        }
        
        // Обновляем HUD
        if (this.hud) {
            this.hud.setHealth(this.currentHealth, this.maxHealth);
            this.hud.showRespawnMessage();
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
        const leftTrack = MeshBuilder.CreateBox("leftTrack", {
            width: 0.5,
            height: 0.6,
            depth: 3.8
        }, this.scene);
        leftTrack.position = new Vector3(-1.3, -0.15, 0);
        leftTrack.parent = this.chassis;
        leftTrack.material = trackMat;
        
        // Right track - just 1 box
        const rightTrack = MeshBuilder.CreateBox("rightTrack", {
            width: 0.5,
            height: 0.6,
            depth: 3.8
        }, this.scene);
        rightTrack.position = new Vector3(1.3, -0.15, 0);
        rightTrack.parent = this.chassis;
        rightTrack.material = trackMat;
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
        };
        
        const handleKeyUp = (evt: KeyboardEvent) => {
            this._inputMap[evt.code] = false;
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

        // Mouse yaw disabled for now to avoid physics issues
        
        // Left click - enter pointer lock and shoot
        this.scene.onPointerDown = (evt) => {
             if (evt.button === 0) { // Left click
                 this.scene.getEngine().enterPointerlock();
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
        if (this._tick % 120 === 0 && (this.throttle !== 0 || this.steer !== 0)) {
            console.log(`[Input] Throttle: ${this.throttle}, Steer: ${this.steer}, W: ${this._inputMap["KeyW"]}, S: ${this._inputMap["KeyS"]}, A: ${this._inputMap["KeyA"]}, D: ${this._inputMap["KeyD"]}`);
        }
        
        // Turret Control (smoothed; mouse disabled)
        this.turretTurnTarget = 0;
        
        // Ручное управление (отменяет авто-центрирование)
        if (this._inputMap["KeyZ"]) {
            this.turretTurnTarget -= 1;
            this.isAutoCentering = false;
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
        if (this._inputMap["KeyX"]) {
            this.turretTurnTarget += 1;
            this.isAutoCentering = false;
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }

        // Автоматическое ПЛАВНОЕ центрирование (активируется по C)
        if (this.isAutoCentering || this._inputMap["KeyC"]) {
            if (this._inputMap["KeyC"]) this.isAutoCentering = true;
            
            // Нормализуем угол к [-PI, PI] для кратчайшего пути
            let currentRot = this.turret.rotation.y;
            while (currentRot > Math.PI) currentRot -= Math.PI * 2;
            while (currentRot < -Math.PI) currentRot += Math.PI * 2;
            this.turret.rotation.y = currentRot;
            
            // ПЛАВНОЕ центрирование с помощью lerp (интерполяция)
            const lerpSpeed = 0.08; // Скорость плавного перехода
            
            if (Math.abs(currentRot) > 0.005) {
                // Плавно интерполируем к нулю
                this.turret.rotation.y = currentRot * (1 - lerpSpeed);
                
                // Сбрасываем ручное управление
                this.turretTurnTarget = 0;
                this.turretTurnSmooth = 0;
                this.turretAcceleration = 0;
                this.turretAccelStartTime = 0;
                
                // Камера следует с ТОЙ ЖЕ плавностью
                window.dispatchEvent(new CustomEvent("centerCamera", { 
                    detail: { 
                        turretRotY: this.turret.rotation.y, 
                        lerpSpeed: lerpSpeed,
                        isActive: true
                    } 
                }));
            } else {
                // Достигли центра
                this.turret.rotation.y = 0;
                this.turretTurnTarget = 0;
                this.turretTurnSmooth = 0;
                this.turretAcceleration = 0;
                this.turretAccelStartTime = 0;
                this.isAutoCentering = false;
                
                window.dispatchEvent(new CustomEvent("centerCamera", { 
                    detail: { turretRotY: 0, lerpSpeed: lerpSpeed, isActive: false } 
                }));
                window.dispatchEvent(new CustomEvent("stopCenterCamera"));
            }
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
            const zero = Vector3.Zero();
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
            
            // Play shooting sound
            if (this.soundManager) {
                this.soundManager.playShoot();
            }
            
            console.log("[FIRE] Cannon fired!");

            // Get muzzle position and direction (exactly along barrel forward)
            // КРИТИЧЕСКИ ВАЖНО: Временно включаем barrel если он скрыт, чтобы получить правильное направление!
            const wasBarrelEnabled = this.barrel.isEnabled();
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(true);
                this.barrel.computeWorldMatrix(true); // Принудительно обновляем матрицу
            }
            
            const dir = this.barrel.getDirection(Vector3.Forward()).normalize();
            const muzzlePos = this.barrel.getAbsolutePosition().add(dir.scale(1.6));
            const shootDirection = dir;
            
            // Возвращаем состояние barrel обратно
            if (!wasBarrelEnabled) {
                this.barrel.setEnabled(false);
            }
            
            // Create muzzle flash effect
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos, shootDirection);
                this.effectsManager.createDustCloud(this.chassis.position.clone());
            }

            // Create projectile - BIGGER and VISIBLE
            const forward = dir;
            
            // BIGGER bullet for visibility!
            const ball = MeshBuilder.CreateBox("bullet", { width: 0.8, height: 0.8, depth: 3.0 }, this.scene);
            ball.position.copyFrom(muzzlePos);
            ball.lookAt(ball.position.add(forward));
            ball.material = this.bulletMat; // Bright glowing yellow
            ball.metadata = { type: "bullet", owner: "player" }; // Metadata для идентификации

            const shape = new PhysicsShape({ type: PhysicsShapeType.BOX, parameters: { extents: new Vector3(0.6, 0.6, 2.0) } }, this.scene);
            shape.filterMembershipMask = 4; // Player bullet group
            shape.filterCollideMask = 2 | 8; // Can collide with environment (2) and enemy tanks (8)
            
            const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            body.setMassProperties({ mass: 15 });
            body.setLinearDamping(0.01);

            // Projectile velocity - УВЕЛИЧЕНА СКОРОСТЬ для большей дальности
            body.applyImpulse(forward.scale(1800), ball.position); 

            // === STRONG RECOIL ===
            // Push tank backward
            const recoilForce = forward.scale(-600);
            this.physicsBody.applyImpulse(recoilForce, this.chassis.absolutePosition);
            
            // Also apply angular impulse (tank rocks back)
            const barrelWorldPos = this.barrel.getAbsolutePosition();
            const chassisPos = this.chassis.absolutePosition;
            const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
            this.applyTorque(new Vector3(-torqueDir.z * 3000, 0, torqueDir.x * 3000));

            // === ПРОВЕРКА ПОПАДАНИЙ ===
            const projectileDamage = 25;
            let hasHit = false;
            let ricochetCount = 0;
            const maxRicochets = 3; // До 3 рикошетов!

            // === ОСНОВНАЯ ПРОВЕРКА ПО РАССТОЯНИЮ (надёжнее чем физика!) ===
            const HIT_RADIUS_TANK = 4.0;   // Радиус попадания в танк
            const HIT_RADIUS_TURRET = 2.5; // Радиус попадания в турель
            
            const checkHit = () => {
                if (hasHit || ball.isDisposed()) return;
                
                const bulletPos = ball.absolutePosition;
                
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
                            if (this.soundManager) this.soundManager.playHit();
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
                        if (this.soundManager) this.soundManager.playHit();
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
        const body = this.physicsBody as any;
        if (body.applyTorque) {
            body.applyTorque(torque);
        } else if (body.applyAngularImpulse) {
            body.applyAngularImpulse(torque.scale(0.016));
        }
    }

    updatePhysics() {
        if (!this.chassis || !this.physicsBody) return;
        
        // КРИТИЧЕСКИ ВАЖНО: Физика НЕ работает когда танк мёртв!
        if (!this.isAlive) {
            // Когда мёртв - останавливаем всю физику
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
            return;
        }
        
        try {
            // КРИТИЧЕСКИ ВАЖНО: Физика танка НЕ зависит от режима прицеливания!
            // isAiming влияет ТОЛЬКО на камеру и прицел, НЕ на физику, позицию, скорость или вращение танка!
            // Танк должен вести себя одинаково независимо от режима прицеливания!
            this.updateInputs();

            const body = this.physicsBody;
            const pos = this.chassis.position.clone();
            const vel = body.getLinearVelocity();
            const angVel = body.getAngularVelocity();
            
            if (!vel || !angVel) return;

            // Get tank orientation vectors (in world space)
            const rotMatrix = this.chassis.getWorldMatrix();
            const forward = Vector3.TransformNormal(Vector3.Forward(), rotMatrix).normalize();
            const right = Vector3.TransformNormal(Vector3.Right(), rotMatrix).normalize();
            const up = Vector3.TransformNormal(Vector3.Up(), rotMatrix).normalize();

            // --- 1. SIMPLE HOVER (No raycast - just keep at fixed height) ---
            const targetY = this.hoverHeight;
            const deltaY = targetY - pos.y;
            const velY = vel.y;
            
            // Spring force to maintain height
            const hoverForce = (deltaY * this.hoverStiffness) - (velY * this.hoverDamping);
            body.applyForce(new Vector3(0, hoverForce, 0), pos);

            // --- 2. KEEP UPRIGHT (ОЧЕНЬ СИЛЬНАЯ система выравнивания!) ---
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));  // Forward/back tilt
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x))); // Left/right tilt
            
            // ОЧЕНЬ СИЛЬНАЯ корректирующая сила для предотвращения опрокидывания
            const uprightForce = 15000;   // УВЕЛИЧЕНО с 8000 до 15000!
            const uprightDamp = 8000;     // УВЕЛИЧЕНО с 5000 до 8000!
            const correctiveX = -tiltX * uprightForce - angVel.x * uprightDamp;
            const correctiveZ = -tiltZ * uprightForce - angVel.z * uprightDamp;
            
            this.applyTorque(new Vector3(correctiveX, 0, correctiveZ));
            
            // ДОПОЛНИТЕЛЬНО: Если танк сильно наклонён, применяем экстренное выравнивание
            if (up.y < 0.7 || Math.abs(tiltX) > 0.3 || Math.abs(tiltZ) > 0.3) {
                // Экстренное выравнивание - очень сильная сила
                const emergencyForce = 25000;
                const emergencyX = -tiltX * emergencyForce;
                const emergencyZ = -tiltZ * emergencyForce;
                this.applyTorque(new Vector3(emergencyX, 0, emergencyZ));
                
                // Также применяем вертикальную силу для поднятия
                if (up.y < 0.5) {
                    const liftForce = (0.9 - up.y) * 50000;
                    body.applyForce(new Vector3(0, liftForce, 0), pos);
                }
            }

            // --- 3. MOVEMENT (Smooth acceleration) ---
        // Smooth throttle/steer (even gentler start)
        this.smoothThrottle += (this.throttleTarget - this.smoothThrottle) * 0.1;
        this.smoothSteer += (this.steerTarget - this.smoothSteer) * 0.15;
            
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const currentSpeed = Vector3.Dot(vel, forward);
            const speedDiff = targetSpeed - currentSpeed;
            
            // Gradual acceleration
            const accel = speedDiff * this.acceleration;
            // Apply force at ground level (below center) to reduce tipping
            const forcePoint = pos.add(new Vector3(0, -0.5, 0));
            body.applyForce(forward.scale(accel), forcePoint);

            // --- 4. TURN ---
            const targetTurnRate = this.smoothSteer * this.turnSpeed;
            const currentTurnRate = angVel.y;
            const turnAccel = (targetTurnRate - currentTurnRate) * 10000;
            this.applyTorque(new Vector3(0, turnAccel, 0));
            
            // Yaw damping when not turning
            if (this.steer === 0) {
                this.applyTorque(new Vector3(0, -angVel.y * 4000, 0));
            }

            // --- 5. SIDE FRICTION ---
            const sideSpeed = Vector3.Dot(vel, right);
            body.applyForce(right.scale(-sideSpeed * 12000), pos);

            // --- 6. DRAG when no input ---
            if (this.throttle === 0) {
                const dragForce = -Vector3.Dot(vel, forward) * 6000;
                body.applyForce(forward.scale(dragForce), pos);
            }

            // --- AUTO RESET if fallen или сильно наклонён ---
            if (pos.y < -10 || up.y < 0.3 || Math.abs(tiltX) > 1.0 || Math.abs(tiltZ) > 1.0) {
                console.log(`[TANK] Auto-reset triggered: y=${pos.y.toFixed(1)}, up.y=${up.y.toFixed(2)}, tiltX=${tiltX.toFixed(2)}, tiltZ=${tiltZ.toFixed(2)}`);
                this.reset();
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
            
            // Применяем скорость башни
            this.turretTurnSmooth += (this.turretTurnTarget - this.turretTurnSmooth) * 0.15;
            const baseTurretSpeed = 0.06;
            const rotationDelta = this.turretTurnSmooth * baseTurretSpeed * this.turretAcceleration;
            this.turret.rotation.y += rotationDelta;

            // Animate Wheels
            const fwdSpeed = Vector3.Dot(vel, forward);
            this.visualWheels.forEach(w => {
                w.rotation.x += fwdSpeed * 0.05;
            });

            // === UPDATE HUD (every 6th frame for optimization) ===
            this._tick++;
            if (this._tick % 6 === 0 && this.hud) {
                this.hud.setSpeed(fwdSpeed);
                this.hud.setPosition(pos.x, pos.z);
                this.hud.updateReload();
            }
            
            // === UPDATE ENGINE SOUND (every 10th frame) ===
            if (this._tick % 10 === 0 && this.soundManager) {
                const speedRatio = Math.abs(fwdSpeed) / this.moveSpeed;
                this.soundManager.updateEngine(speedRatio, Math.abs(this.throttle));
            }
        } catch (e) {
            console.error("[PhysicsError]", e);
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
}