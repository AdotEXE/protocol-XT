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
    
    // Tank type configuration
    chassisType: ChassisType;
    cannonType: CannonType;
    
    // Config (будут переопределены типом корпуса)
    mass = 1500;
    hoverHeight = 1.0;  // Hover height
    
    // Movement Settings (будут переопределены типом корпуса)
    moveSpeed = 12;         // Slower max speed
    turnSpeed = 2.5;        // Moderate turning
    acceleration = 8000;    // Smooth acceleration (was 20000!)
    
    // Stability
    hoverStiffness = 30000; 
    hoverDamping = 8000;    // More damping for stability

    // Health System (будет переопределено типом корпуса)
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;
    
    // Shooting (будет переопределено типом пушки)
    damage = 25; // Базовый урон

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
    
    // Shooting (будут переопределены типом пушки)
    lastShotTime = 0;
    cooldown = 2000; // 2 seconds reload
    isReloading = false;
    projectileSpeed = 100;
    projectileSize = 0.2;

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
        // Позиция ствола зависит от размера башни
        this.barrel.position.z = turretDepth / 2 + barrelLength / 2;
        this.barrel.position.y = 0;
        this.barrel.parent = this.turret;
        this.barrel.renderingGroupId = 2;
        
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
        
        // Сообщение в чат о респавне
        if (this.chatSystem) {
            this.chatSystem.success("Респавн в гараже", 1);
        }
        // Звук респавна
        if (this.soundManager) {
            this.soundManager.playRespawn();
        }
        
        // Визуальные эффекты респавна
        if (this.effectsManager && respawnPos) {
            this.effectsManager.createRespawnEffect(respawnPos);
        }
        
        // Активируем защиту от урона после респавна
        this.activateInvulnerability();
        
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
            
            // 3. Устанавливаем позицию НАПРЯМУЮ (несколько раз для надёжности)
            this.chassis.position.set(targetX, targetY, targetZ);
            this.chassis.position.x = targetX;
            this.chassis.position.y = targetY;
            this.chassis.position.z = targetZ;
            
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
            
            // 7. Включаем физику обратно через небольшую задержку
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    // ЕЩЁ РАЗ устанавливаем позицию для надёжности
                    this.chassis.position.set(targetX, targetY, targetZ);
                    this.chassis.rotationQuaternion = Quaternion.Identity();
                    this.chassis.computeWorldMatrix(true);
                    
                    // Синхронизируем физическое тело
                    this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
                    
                    // Сбрасываем скорости
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                    
                    // Включаем физику
                    this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
                    
                    console.log(`[TANK] Physics re-enabled at garage position`);
                }
            }, 50);
            
            // 8. Ещё один сброс через 100мс для надёжности
            setTimeout(() => {
                if (this.physicsBody && this.chassis) {
                    this.chassis.position.set(targetX, targetY, targetZ);
                    this.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.physicsBody.setAngularVelocity(Vector3.Zero());
                    this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
                    console.log(`[TANK] Final position reset at garage`);
                }
            }, 100);
            
            // 9. Финальная проверка через 200мс
            setTimeout(() => {
                if (this.chassis) {
                    const actualPos = this.chassis.position;
                    const distance = Vector3.Distance(actualPos, respawnPos);
                    if (distance > 0.5) {
                        console.warn(`[TANK] Position mismatch! Expected: (${targetX.toFixed(2)}, ${targetY.toFixed(2)}, ${targetZ.toFixed(2)}), Actual: (${actualPos.x.toFixed(2)}, ${actualPos.y.toFixed(2)}, ${actualPos.z.toFixed(2)}), Distance: ${distance.toFixed(2)}`);
                        // Принудительно устанавливаем позицию ещё раз
                        this.chassis.position.set(targetX, targetY, targetZ);
                        this.chassis.computeWorldMatrix(true);
                        if (this.physicsBody) {
                            this.physicsBody.setTargetTransform(this.chassis.position, Quaternion.Identity());
                        }
                    } else {
                        console.log(`[TANK] Respawn successful! Position verified: (${actualPos.x.toFixed(2)}, ${actualPos.y.toFixed(2)}, ${actualPos.z.toFixed(2)})`);
                    }
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
                 // Pointer lock handled by browser
                 if (this.scene.getEngine().getRenderingCanvas()) {
                     (this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement).requestPointerLock();
                 }
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
            
            // Play shooting sound (с учётом типа пушки) with 3D positioning
            if (this.soundManager) {
                const muzzlePos = muzzlePosWorld.clone();
                this.soundManager.playShoot(this.cannonType.id, muzzlePos);
            }
            
            // Записываем выстрел для опыта пушки
            if (this.experienceSystem) {
                this.experienceSystem.recordShot(this.cannonType.id);
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
            }

            // Create projectile - используем параметры пушки
            const forward = dir;
            
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
            shape.filterCollideMask = 2 | 8; // Can collide with environment (2) and enemy tanks (8)
            
            const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            body.setMassProperties({ mass: 15 });
            body.setLinearDamping(0.01);

            // Скорость снаряда из типа пушки
            const impulse = this.projectileSpeed * 18; // Масштабируем для физики
            body.applyImpulse(forward.scale(impulse), ball.position); 

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
            // Обновляем время игры для системы опыта
            if (this.experienceSystem) {
                this.experienceSystem.updatePlayTime(this.chassisType.id, this.cannonType.id);
            }
            
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

            // --- 1. ENHANCED HOVER (Improved height control) ---
            const targetY = this.hoverHeight;
            const deltaY = targetY - pos.y;
            const velY = vel.y;
            
            // Адаптивная жесткость: сильнее когда далеко от цели
            const stiffnessMultiplier = 1.0 + Math.abs(deltaY) * 0.5;
            const hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping);
            body.applyForce(new Vector3(0, hoverForce, 0), pos);

            // Дополнительная стабилизация при движении
            if (Math.abs(Vector3.Dot(vel, forward)) > 2) {
                const stabilityForce = -velY * 3000; // Дополнительное демпфирование при движении
                body.applyForce(new Vector3(0, stabilityForce, 0), pos);
            }

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

            // --- 3. MOVEMENT (Enhanced smooth acceleration) ---
            // Улучшенная плавность с адаптивной скоростью интерполяции
            const throttleLerpSpeed = Math.abs(this.throttleTarget) > 0 ? 0.12 : 0.08; // Быстрее при нажатии
            const steerLerpSpeed = Math.abs(this.steerTarget) > 0 ? 0.18 : 0.12; // Быстрее при повороте
            
            this.smoothThrottle += (this.throttleTarget - this.smoothThrottle) * throttleLerpSpeed;
            this.smoothSteer += (this.steerTarget - this.smoothSteer) * steerLerpSpeed;
            
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const currentSpeed = Vector3.Dot(vel, forward);
            const speedDiff = targetSpeed - currentSpeed;
            
            // Адаптивное ускорение: быстрее при разгоне, медленнее при торможении
            const isAccelerating = Math.sign(speedDiff) === Math.sign(this.smoothThrottle);
            const accelMultiplier = isAccelerating ? 1.0 : 1.5; // Быстрее тормозим
            const accel = speedDiff * this.acceleration * accelMultiplier;
            
            // Применяем силу ближе к земле для лучшей стабильности
            const forcePoint = pos.add(new Vector3(0, -0.6, 0));
            body.applyForce(forward.scale(accel), forcePoint);

            // Добавляем небольшую силу вниз при движении для лучшего сцепления
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const downForce = Math.abs(this.smoothThrottle) * 2000;
                body.applyForce(new Vector3(0, -downForce, 0), pos);
            }

            // --- 4. ENHANCED TURN (Speed-dependent turning) ---
            // Поворот зависит от скорости: на месте поворачивается быстрее
            const speedRatio = Math.abs(currentSpeed) / this.moveSpeed;
            const turnSpeedMultiplier = 1.0 + (1.0 - speedRatio) * 0.5; // +50% скорости поворота на месте
            const effectiveTurnSpeed = this.turnSpeed * turnSpeedMultiplier;
            
            const targetTurnRate = this.smoothSteer * effectiveTurnSpeed;
            const currentTurnRate = angVel.y;
            
            // Адаптивное угловое ускорение
            const isTurning = Math.abs(this.smoothSteer) > 0.1;
            const angularAccelMultiplier = isTurning ? 1.2 : 1.5; // Быстрее останавливаем поворот
            const turnAccel = (targetTurnRate - currentTurnRate) * 11000 * angularAccelMultiplier;
            this.applyTorque(new Vector3(0, turnAccel, 0));
            
            // Дополнительная стабилизация при повороте на скорости
            if (Math.abs(speedRatio) > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                const stabilityTorque = -angVel.y * 2000 * speedRatio;
                this.applyTorque(new Vector3(0, stabilityTorque, 0));
            }
            
            // Yaw damping when not turning
            if (Math.abs(this.smoothSteer) < 0.05) {
                this.applyTorque(new Vector3(0, -angVel.y * 4500, 0));
            }

            // --- 5. ENHANCED SIDE FRICTION (Improved lateral stability) ---
            const sideSpeed = Vector3.Dot(vel, right);
            // Боковое сопротивление зависит от скорости движения
            const sideFrictionMultiplier = 1.0 + Math.abs(currentSpeed) / this.moveSpeed * 0.5;
            body.applyForce(right.scale(-sideSpeed * 13000 * sideFrictionMultiplier), pos);

            // --- 6. ENHANCED DRAG (Improved stopping) ---
            if (Math.abs(this.smoothThrottle) < 0.05) {
                // Боковое сопротивление для предотвращения скольжения
                const sideVel = Vector3.Dot(vel, right);
                const sideDrag = -sideVel * 8000;
                body.applyForce(right.scale(sideDrag), pos);
                
                // Продольное сопротивление
                const fwdVel = Vector3.Dot(vel, forward);
                const fwdDrag = -fwdVel * 7000;
                body.applyForce(forward.scale(fwdDrag), pos);
                
                // Угловое сопротивление
                const angularDrag = -angVel.y * 5000;
                this.applyTorque(new Vector3(0, angularDrag, 0));
            }

            // --- AUTO RESET if fallen или сильно наклонён (Enhanced detection) ---
            const isFallen = pos.y < -10 || up.y < 0.3 || Math.abs(tiltX) > 1.0 || Math.abs(tiltZ) > 1.0;
            const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.5;
            
            if (isFallen || isStuck) {
                console.log(`[TANK] Auto-reset triggered! (fallen: ${isFallen}, stuck: ${isStuck})`);
                this.respawn();
            }
            
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

            // === UPDATE INVULNERABILITY (every frame) ===
            this.updateInvulnerability();

            // === UPDATE HUD (every 6th frame for optimization) ===
            this._tick++;
            if (this._tick % 6 === 0 && this.hud) {
                this.hud.setSpeed(fwdSpeed);
                this.hud.setPosition(pos.x, pos.z);
                this.hud.updateReload();
            }
            
            // === UPDATE ENGINE SOUND (every 10th frame) with 3D positioning ===
            if (this._tick % 10 === 0 && this.soundManager) {
                const speedRatio = Math.abs(fwdSpeed) / this.moveSpeed;
                this.soundManager.updateEngine(speedRatio, Math.abs(this.smoothThrottle), pos);
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