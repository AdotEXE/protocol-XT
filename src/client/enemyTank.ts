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
    Ray
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control } from "@babylonjs/gui";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";

// === AI States ===
type AIState = "idle" | "patrol" | "chase" | "attack" | "flank" | "retreat" | "evade";

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
    private mass = 1875;
    private hoverHeight = 1.0;
    private hoverStiffness = 30000;
    private hoverDamping = 8000;
    
    // Movement (same as TankController)
    private moveSpeed = 20;        // Slightly slower than player
    private turnSpeed = 2.2;
    private acceleration = 8750;
    
    // Smooth inputs (like player)
    private throttleTarget = 0;
    private steerTarget = 0;
    private smoothThrottle = 0;
    private smoothSteer = 0;
    
    // Turret control (smooth like player)
    private turretTargetAngle = 0;
    private turretCurrentAngle = 0;
    private turretSpeed = 0.06;
    private turretAcceleration = 0;
    private turretAccelStartTime = 0;
    
    // === AI State ===
    private target: { chassis: Mesh, isAlive: boolean, currentHealth?: number } | null = null;
    private state: AIState = "idle";
    private patrolPoints: Vector3[] = [];
    private currentPatrolIndex = 0;
    private lastStateChange = 0;
    private stateTimer = 0;
    
    // AI Decisions
    private lastDecisionTime = 0;
    private decisionInterval = 500; // Make decisions every 500ms
    private flankDirection = 1; // 1 = right, -1 = left
    private evadeDirection = new Vector3(0, 0, 0);
    private lastTargetPos = new Vector3(0, 0, 0);
    private targetVelocity = new Vector3(0, 0, 0);
    
    // === Stats ===
    maxHealth = 100;
    currentHealth = 100;
    isAlive = true;
    
    // === Combat ===
    private lastShotTime = 0;
    private cooldown = 2500; // 2.5 seconds reload
    private isReloading = false;
    private range = 60;           // Дальность атаки
    private detectRange = 200;    // Радиус обнаружения (200м)
    private optimalRange = 35;     // Оптимальная дистанция боя
    private aimAccuracy = 0.95;   // 95% точность
    
    // === Difficulty ===
    private difficulty: "easy" | "medium" | "hard" = "hard"; // По умолчанию сложная сложность
    
    // Pre-created materials
    private bulletMat: StandardMaterial;
    
    // Events
    onDeathObservable = new Observable<EnemyTank>();
    
    private static count = 0;
    private static sharedBulletMat: StandardMaterial | null = null;
    private id: number;
    
    // Tick counter
    private _tick = 0;
    
    // Raycast caching для оптимизации
    private raycastCache: { result: boolean, frame: number } | null = null;
    private readonly RAYCAST_CACHE_FRAMES = 4; // Кэшируем на 4 кадра
    
    // Переиспользуемые векторы для оптимизации памяти
    private _tmpPos?: Vector3;
    private _tmpForward?: Vector3;
    private _tmpRight?: Vector3;
    private _tmpUp?: Vector3;
    
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
        difficulty: "easy" | "medium" | "hard" = "hard"
    ) {
        this.scene = scene;
        this.soundManager = soundManager;
        this.effectsManager = effectsManager;
        this.difficulty = difficulty;
        this.id = EnemyTank.count++;
        
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
        
        console.log(`[EnemyTank ${this.id}] Created at ${position.x.toFixed(0)}, ${position.z.toFixed(0)} with difficulty: ${difficulty}`);
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
                this.turretSpeed = 0.045; // Медленнее поворачивает башню
                this.moveSpeed = 10; // Медленнее (было 8)
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
                this.turretSpeed = 0.055;
                break;
            case "hard":
                // Сложная сложность: быстрая реакция, высокая точность
                this.cooldown = 2000; // 2 секунды перезарядка (было 2500)
                this.aimAccuracy = 0.95; // 95% точность
                this.detectRange = 220; // Увеличенный радиус обнаружения (было 200)
                this.range = 70;
                this.optimalRange = 38;
                this.decisionInterval = 300; // Решения каждые 300мс (было 500)
                this.turretSpeed = 0.07;
                this.moveSpeed = 18; // Значительно быстрее (было 12)
                break;
        }
    }
    
    // === VISUALS (same as player) ===
    
    private createChassis(position: Vector3): Mesh {
        // Same size as player tank!
        const chassis = MeshBuilder.CreateBox(`enemyTank_${this.id}`, {
            width: 2.2,
            height: 0.8,
            depth: 3.5
        }, this.scene);
        chassis.position = position.add(new Vector3(0, 0.5, 0));  // Spawn close to ground
        
        const mat = new StandardMaterial(`enemyTankMat_${this.id}`, this.scene);
        mat.diffuseColor = new Color3(0.5, 0.15, 0.1); // Dark red/brown
        mat.specularColor = Color3.Black();
        mat.freeze();
        chassis.material = mat;
        chassis.metadata = { type: "enemyTank", instance: this };
        
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
        turret.renderingGroupId = 1;
        turret.metadata = { type: "enemyTank", instance: this };
        
        return turret;
    }
    
    private createBarrel(): Mesh {
        // Same as player barrel!
        const barrel = MeshBuilder.CreateBox(`enemyBarrel_${this.id}`, {
            width: 0.2,
            height: 0.2,
            depth: 2.5
        }, this.scene);
        barrel.parent = this.turret;
        barrel.position = new Vector3(0, 0.2, 1.5);
        
        const mat = new StandardMaterial(`enemyBarrelMat_${this.id}`, this.scene);
        mat.diffuseColor = new Color3(0.25, 0.08, 0.05);
        mat.specularColor = Color3.Black();
        mat.freeze();
        barrel.material = mat;
        barrel.renderingGroupId = 2;
        barrel.metadata = { type: "enemyTank", instance: this };
        
        return barrel;
    }

    private createTracks(): void {
        const trackMat = new StandardMaterial(`enemyTrackMat_${this.id}`, this.scene);
        trackMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        trackMat.specularColor = Color3.Black();
        trackMat.freeze();
        
        // Left track (same as player)
        const leftTrack = MeshBuilder.CreateBox(`eTrackL_${this.id}`, {
            width: 0.5, height: 0.6, depth: 3.8
        }, this.scene);
        leftTrack.position = new Vector3(-1.3, -0.15, 0);
        leftTrack.parent = this.chassis;
        leftTrack.material = trackMat;
        this.wheels.push(leftTrack);
        
        // Right track (same as player)
        const rightTrack = MeshBuilder.CreateBox(`eTrackR_${this.id}`, {
            width: 0.5, height: 0.6, depth: 3.8
        }, this.scene);
        rightTrack.position = new Vector3(1.3, -0.15, 0);
        rightTrack.parent = this.chassis;
        rightTrack.material = trackMat;
        this.wheels.push(rightTrack);
    }
    
    // === HP Billboard ===
    private hpTexture: AdvancedDynamicTexture | null = null;
    private hpBarFill: Rectangle | null = null;
    
    private createHpBillboard() {
        // Увеличен размер для лучшей видимости
        const plane = MeshBuilder.CreatePlane(`enemyHp_${this.id}`, { size: 2.8 }, this.scene);
        plane.parent = this.turret;
        plane.position = new Vector3(0, 1.6, 0); // Немного выше
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.isVisible = false;
        plane.renderingGroupId = 3; // В группе рендеринга для видимости через стены
        
        const tex = AdvancedDynamicTexture.CreateForMesh(plane, 240, 32); // Увеличен размер текстуры
        
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
        
        this.hpBillboard = plane;
        this.hpTexture = tex;
    }

    setHpVisible(visible: boolean) {
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
        }
    }

    isPartOf(mesh: Mesh): boolean {
        return mesh === this.chassis || mesh === this.turret || mesh === this.barrel || this.wheels.includes(mesh);
    }
    
    // === PHYSICS (SAME AS PLAYER!) ===
    
    private setupPhysics(): void {
        const shape = new PhysicsShape({
            type: PhysicsShapeType.BOX,
            parameters: {
                center: new Vector3(0, 0, 0),
                rotation: Quaternion.Identity(),
                extents: new Vector3(2.2, 0.8, 3.5) // Same as player!
            }
        }, this.scene);
        
        shape.filterMembershipMask = 8; // Enemy tank group
        shape.filterCollideMask = 2 | 4 | 32; // Environment, player bullets, and protective walls
        
        this.physicsBody = new PhysicsBody(this.chassis, PhysicsMotionType.DYNAMIC, false, this.scene);
        this.physicsBody.shape = shape;
        this.physicsBody.setMassProperties({
            mass: this.mass,
            centerOfMass: new Vector3(0, -0.4, 0) // Low COM like player
        });
        this.physicsBody.setLinearDamping(0.5);
        this.physicsBody.setAngularDamping(3.0);
    }
    
    // === MAIN UPDATE ===
    
    update(): void {
        if (!this.isAlive) return;
        if (!this.chassis || this.chassis.isDisposed()) return;
        
        this._tick++;
        
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
        
        if (this._tick % aiUpdateInterval === 0) {
            this.updateAI();
        }
        
        // Turret always updates (smooth)
        this.updateTurret();
    }
    
    // === PHYSICS UPDATE (SAME AS PLAYER!) ===
    
    private updatePhysics(): void {
        if (!this.isAlive || !this.chassis || this.chassis.isDisposed() || !this.physicsBody) return;
        
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
            
            // --- 1. ENHANCED HOVER (same improvements as player) ---
            const targetY = this.hoverHeight;
            const deltaY = targetY - pos.y;
            const velY = vel.y;
            
            // Адаптивная жесткость
            const stiffnessMultiplier = 1.0 + Math.abs(deltaY) * 0.5;
            const hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping);
            // Используем переиспользуемый вектор для силы (используем _tmpUp который уже создан)
            this._tmpUp!.set(0, hoverForce, 0);
            body.applyForce(this._tmpUp!, pos);
            
            // Дополнительная стабилизация при движении
            if (Math.abs(Vector3.Dot(vel, forward)) > 2) {
                const stabilityForce = -velY * 3000;
                this._tmpUp!.set(0, stabilityForce, 0);
                body.applyForce(this._tmpUp!, pos);
            }
            
            // --- 2. ENHANCED KEEP UPRIGHT (same as player!) ---
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
            
            // Улучшенные значения как у игрока
            const uprightForce = 15000;
            const uprightDamp = 8000;
            const correctiveX = -tiltX * uprightForce - angVel.x * uprightDamp;
            const correctiveZ = -tiltZ * uprightForce - angVel.z * uprightDamp;
            
            // Используем переиспользуемый вектор для torque
            const correctiveTorque = this._tmpRight!;
            correctiveTorque.set(correctiveX, 0, correctiveZ);
            this.applyTorque(correctiveTorque);
            
            // Экстренное выравнивание
            if (up.y < 0.7 || Math.abs(tiltX) > 0.3 || Math.abs(tiltZ) > 0.3) {
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
            
            // --- 3. ENHANCED MOVEMENT (same improvements as player) ---
            const throttleLerpSpeed = Math.abs(this.throttleTarget) > 0 ? 0.12 : 0.08;
            const steerLerpSpeed = Math.abs(this.steerTarget) > 0 ? 0.18 : 0.12;
            
            this.smoothThrottle += (this.throttleTarget - this.smoothThrottle) * throttleLerpSpeed;
            this.smoothSteer += (this.steerTarget - this.smoothSteer) * steerLerpSpeed;
            
            const targetSpeed = this.smoothThrottle * this.moveSpeed;
            const currentSpeed = Vector3.Dot(vel, forward);
            const speedDiff = targetSpeed - currentSpeed;
            
            const isAccelerating = Math.sign(speedDiff) === Math.sign(this.smoothThrottle);
            const accelMultiplier = isAccelerating ? 1.0 : 1.5;
            const accel = speedDiff * this.acceleration * accelMultiplier;
            
            // Используем переиспользуемый вектор для forcePoint
            const forcePoint = this._tmpPos!;
            forcePoint.copyFrom(pos);
            forcePoint.y -= 0.6;
            // Используем переиспользуемый вектор для силы
            forceVec.copyFrom(forward);
            forceVec.scaleInPlace(accel);
            body.applyForce(forceVec, forcePoint);
            
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const downForce = Math.abs(this.smoothThrottle) * 2000;
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
            const turnAccel = (targetTurnRate - currentTurnRate) * 11000 * angularAccelMultiplier;
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
            if (vel.y > 6) {
                body.setLinearVelocity(new Vector3(vel.x, 6, vel.z));
            }
            // Ограничиваем максимальную высоту
            if (pos.y > 4.0) {
                // Сильная сила вниз
                this._tmpUp!.set(0, -20000, 0);
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
        
        // Проверка 1: Высота выше нормы (застряли на крыше гаража ~3м высота)
        // Снижаем порог до 3.5 - нормальный hover height = 1.0-2.0
        if (pos.y > 3.5) {
            console.log(`[EnemyTank ${this.id}] Too high (y=${pos.y.toFixed(2)}), resetting to ground`);
            this.forceResetToGround();
            this.consecutiveStuckCount = 0;
            this.stuckTimer = now;
            return true;
        }
        
        // Проверка 2: Летим вверх слишком быстро (анти-полёт)
        if (vel && vel.y > 8) {
            console.log(`[EnemyTank ${this.id}] Flying up too fast (velY=${vel.y.toFixed(2)}), clamping`);
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
                console.log(`[EnemyTank ${this.id}] Stuck in place (moved ${moved.toFixed(2)}), forcing unstuck`);
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
        pos.y = 1.2; // Стандартная высота hover (близко к земле)
        
        // Сбрасываем скорости
        this.physicsBody.setLinearVelocity(Vector3.Zero());
        this.physicsBody.setAngularVelocity(Vector3.Zero());
        
        // Телепортируем на землю
        this.chassis.position.copyFrom(pos);
        this.chassis.rotationQuaternion = Quaternion.Identity();
        
        // Небольшой импульс вниз для стабилизации
        this.physicsBody.applyImpulse(new Vector3(0, -5000, 0), pos);
        
        // Сбрасываем цели движения
        this.throttleTarget = 0;
        this.steerTarget = 0;
    }
    
    private forceUnstuck(): void {
        if (!this.chassis || !this.physicsBody) return;
        
        // Пробуем двигаться в случайном направлении (назад чаще - чтобы отъехать от препятствия)
        const randomAngle = Math.random() * Math.PI * 2;
        const unstuckDir = new Vector3(Math.cos(randomAngle), 0, Math.sin(randomAngle));
        
        // Умеренный импульс в случайном направлении (снижено с 15000)
        this.physicsBody.applyImpulse(unstuckDir.scale(8000), this.chassis.absolutePosition);
        
        // Минимальный импульс вверх только для подскока (снижено с 8000 до 2000)
        this.physicsBody.applyImpulse(new Vector3(0, 2000, 0), this.chassis.absolutePosition);
        
        // Меняем направление обхода препятствий
        this.obstacleAvoidanceDir = Math.random() > 0.5 ? 1 : -1;
        
        // Даём команду двигаться назад
        this.throttleTarget = -0.8;
        this.steerTarget = (Math.random() - 0.5) * 2;
        
        // Если застряли слишком много раз подряд, телепортируемся
        if (this.consecutiveStuckCount > 5) {
            this.forceResetToGround();
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
        
        const rayLength = 15; // Увеличена дальность для лучшего обнаружения
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
        const centerHit = hits[0];
        const leftHits = Math.min(hits[1], hits[3]);
        const rightHits = Math.min(hits[2], hits[4]);
        
        // Выбираем направление с наибольшим свободным пространством
        if (centerHit < 10) { // Препятствие впереди ближе 10м
            // Выбираем сторону с большим пространством
            if (leftHits > rightHits + 2) {
                this.obstacleAvoidanceDir = -1; // Влево
            } else if (rightHits > leftHits + 2) {
                this.obstacleAvoidanceDir = 1;  // Вправо
            } else {
                // Примерно одинаково - выбираем случайно но консистентно
                this.obstacleAvoidanceDir = this.obstacleAvoidanceDir !== 0 ? this.obstacleAvoidanceDir : (Math.random() > 0.5 ? 1 : -1);
            }
        } else if (centerHit < 6) {
            // Очень близко - резкий манёвр
            this.obstacleAvoidanceDir = leftHits > rightHits ? -1 : 1;
            this.throttleTarget = -0.5; // Отъезжаем назад
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
        
        // Добавляем точку выезда из гаража (вперёд от старта)
        const exitAngle = Math.random() * Math.PI * 2;
        const exitX = center.x + Math.cos(exitAngle) * 30;
        const exitZ = center.z + Math.sin(exitAngle) * 30;
        this.patrolPoints.push(new Vector3(exitX, center.y, exitZ));
        
        // Генерируем случайные точки по карте
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
            
            this.patrolPoints.push(new Vector3(clampedX, center.y, clampedZ));
        }
        
        // Перемешиваем точки для непредсказуемости
        for (let i = this.patrolPoints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.patrolPoints[i], this.patrolPoints[j]] = [this.patrolPoints[j], this.patrolPoints[i]];
        }
        
        // Начинаем патруль сразу!
        this.state = "patrol";
        console.log(`[EnemyTank ${this.id}] Generated ${this.patrolPoints.length} patrol points, radius: ${patrolRadius.toFixed(0)}`);
    }
    
    setTarget(target: { chassis: Mesh, isAlive: boolean, currentHealth?: number }): void {
        this.target = target;
    }
    
    private updateAI(): void {
        const now = Date.now();
        
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
                // Track target velocity for prediction
                if (this.lastTargetPos.length() > 0) {
                    this.targetVelocity = targetPos.subtract(this.lastTargetPos).scale(30); // ~30 fps
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
        
        // Priority 3: In range - attack or flank (улучшенная логика)
        if (distance < this.range) {
            // Более умный выбор тактики - больше фланга
            const shouldFlank = distance > 25 && distance < this.optimalRange * 1.5 && healthPercent > 0.4;
            const flankChance = shouldFlank ? 0.35 : 0.20; // Больше шанс фланга (было 25%/10%)
            
            if (Math.random() < flankChance) {
                this.state = "flank";
                this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                this.stateTimer = 2500;
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
        }
    }
    
    private doPatrol(): void {
        if (this.patrolPoints.length === 0) {
            // Генерируем новые точки если их нет
            this.generatePatrolPoints(this.chassis.absolutePosition);
            return;
        }
        
        const target = this.patrolPoints[this.currentPatrolIndex];
        const myPos = this.chassis.absolutePosition;
        const distance = Vector3.Distance(myPos, target);
        
        if (distance < 8) {
            // Достигли точки - переходим к следующей
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
            
            // Иногда генерируем новую точку для разнообразия
            if (Math.random() < 0.15) {
                const newAngle = Math.random() * Math.PI * 2;
                const newDist = 100 + Math.random() * 200;
                const newX = Math.cos(newAngle) * newDist;
                const newZ = Math.sin(newAngle) * newDist;
                this.patrolPoints[this.currentPatrolIndex] = new Vector3(
                    Math.max(-400, Math.min(400, newX)),
                    myPos.y,
                    Math.max(-400, Math.min(400, newZ))
                );
            }
        } else {
            // Едем к точке на ПОЛНОЙ скорости
            this.driveToward(target, 0.85);
        }
        
        // Крутим башню по сторонам во время патруля (сканирование)
        const scanAngle = Math.sin(Date.now() * 0.001) * 0.5; // ±0.5 радиан
        this.turretTargetAngle = scanAngle;
    }
    
    private doChase(): void {
        if (!this.target) return;
        
        const targetPos = this.target.chassis.absolutePosition;
        this.driveToward(targetPos, 1.0);
        this.aimAtTarget();
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
        
        // Check if we can shoot - более агрессивная стрельба!
        const canShoot = this.isAimedAtTarget() && !this.isReloading;
        
        if (canShoot) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown) {
                // Стреляем почти всегда когда можем
                const shouldFire = targetHealthPercent < 0.6 || healthPercent > 0.4 || Math.random() < 0.9;
                
                if (shouldFire) {
                    this.fire();
                    this.lastShotTime = now;
                }
            }
        }
        
        // === МИКРО-МАНЕВРЫ для живости ===
        if (this._tick % 60 === 0) {
            const microManeuver = (Math.random() - 0.5) * 0.6;
            this.steerTarget += microManeuver;
        }
        
        // === АГРЕССИВНОЕ СБЛИЖЕНИЕ при преимуществе HP ===
        if (healthPercent > 0.6 && targetHealthPercent < 0.4) {
            // Добить раненую цель - приближаемся агрессивно!
            this.driveToward(targetPos, 0.8);
            return;
        }
        
        // Улучшенное поддержание оптимальной дистанции
        if (distance < this.optimalRange * 0.4) {
            // Слишком близко - отступаем быстрее с зигзагом
            this.throttleTarget = -0.7;
            this.steerTarget = Math.sin(this._tick * 0.04) * 0.5;
        } else if (distance < this.optimalRange * 0.7) {
            // Близко - активный зигзаг
            this.throttleTarget = -0.3;
            this.steerTarget = Math.sin(this._tick * 0.03) * 0.4;
        } else if (distance > this.optimalRange * 1.4) {
            // Слишком далеко - быстро приближаемся
            this.driveToward(targetPos, 0.7);
        } else if (distance > this.optimalRange * 1.1) {
            // Немного далеко - приближаемся
            this.driveToward(targetPos, 0.4);
        } else {
            // Оптимальная дистанция - активное маневрирование
            const strafeSpeed = healthPercent > 0.5 ? 0.5 : 0.3;
            this.throttleTarget = Math.sin(this._tick * 0.02) * strafeSpeed;
            this.steerTarget = Math.cos(this._tick * 0.025) * 0.5;
        }
    }
    
    private doFlank(): void {
        if (!this.target) return;
        
        const targetPos = this.target.chassis.absolutePosition;
        const myPos = this.chassis.absolutePosition;
        
        // Calculate flank position (perpendicular to target)
        const toTarget = targetPos.subtract(myPos);
        toTarget.y = 0;
        toTarget.normalize();
        
        // Perpendicular direction
        const perpendicular = new Vector3(toTarget.z * this.flankDirection, 0, -toTarget.x * this.flankDirection);
        const flankPos = myPos.clone().add(perpendicular.scale(15));
        
        this.driveToward(flankPos, 0.8);
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
        
        // Run away!
        const awayDir = myPos.subtract(targetPos);
        awayDir.y = 0;
        awayDir.normalize();
        
        const retreatPos = myPos.clone().add(awayDir.scale(30));
        this.driveToward(retreatPos, 1.0);
        
        // Still aim at enemy while retreating (fighting retreat)
        this.aimAtTarget();
        
        // Try to shoot while retreating
        if (this.isAimedAtTarget()) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown) {
                this.fire();
                this.lastShotTime = now;
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
        
        // Обновляем направление уклонения периодически
        if (this._tick % 30 === 0) {
            const toTarget = targetPos.subtract(myPos);
            toTarget.y = 0;
            toTarget.normalize();
            
            // Перпендикулярное направление
            const perpendicular = new Vector3(toTarget.z, 0, -toTarget.x);
            this.evadeDirection = perpendicular.scale(Math.random() > 0.5 ? 1 : -1);
        }
        
        // Движение в направлении уклонения
        const evadePos = myPos.clone().add(this.evadeDirection.scale(15));
        this.driveToward(evadePos, 1.0);
        
        // Все ещё целимся в цель (боевое уклонение)
        this.aimAtTarget();
        
        // Попытка стрельбы при уклонении
        if (this.isAimedAtTarget() && !this.isReloading) {
            const now = Date.now();
            if (now - this.lastShotTime > this.cooldown * 1.2) { // Немного медленнее при уклонении
                if (Math.random() < 0.3) { // 30% шанс стрельбы при уклонении
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
        
        // Steer toward target
        this.steerTarget = Math.max(-1, Math.min(1, angleDiff * 2));
        
        // Move forward if mostly facing target
        if (Math.abs(angleDiff) < Math.PI / 2.5) {
            this.throttleTarget = speedMult;
        } else if (Math.abs(angleDiff) < Math.PI / 1.5) {
            this.throttleTarget = speedMult * 0.3;
        } else {
            this.throttleTarget = 0; // Turn in place
        }
    }
    
    // === AIMING ===
    
    private aimAtTarget(): void {
        if (!this.target || !this.target.chassis) return;
        
        const targetPos = this.target.chassis.absolutePosition.clone();
        const myPos = this.chassis.absolutePosition;
        
        // === PREDICTION: Lead the target! ===
        const distance = Vector3.Distance(targetPos, myPos);
        const bulletSpeed = 240; // Approximate bullet speed (doubled)
        const flightTime = distance / bulletSpeed;
        
        // Predict where target will be
        const predictedPos = targetPos.add(this.targetVelocity.scale(flightTime * 0.7)); // 70% prediction
        
        // Add slight inaccuracy
        if (this.aimAccuracy < 1.0) {
            const spread = (1 - this.aimAccuracy) * distance * 0.1;
            predictedPos.x += (Math.random() - 0.5) * spread;
            predictedPos.z += (Math.random() - 0.5) * spread;
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
        
        // Check if turret is pointing at target (within tolerance)
        let angleDiff = this.turretTargetAngle - this.turretCurrentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        return Math.abs(angleDiff) < 0.15; // ~8.5 degrees tolerance
    }
    
    // === FIRE (from barrel, in barrel direction!) ===
    
    private fire(): void {
        if (!this.isAlive) return;
        
        this.isReloading = true;
        setTimeout(() => { this.isReloading = false; }, this.cooldown);
        
        console.log(`[EnemyTank ${this.id}] FIRE!`);
        
        // === GET MUZZLE POSITION AND DIRECTION FROM BARREL ===
        const barrelDir = this.barrel.getDirection(Vector3.Forward()).normalize();
        const muzzlePos = this.barrel.getAbsolutePosition().add(barrelDir.scale(1.5));
        
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
        ball.metadata = { type: "enemyBullet", damage: 20, owner: this };
        
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
        const damage = 20;
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
                    
                    // Получаем урон из metadata пули
                    const bulletDamage = (ball.metadata && (ball.metadata as any).damage) ? (ball.metadata as any).damage : 20;
                    
                    // Наносим урон стенке через metadata
                    const wallMeta = wall.metadata as any;
                    if (wallMeta && wallMeta.tankController && typeof wallMeta.tankController.damageWall === 'function') {
                        wallMeta.tankController.damageWall(wall, bulletDamage);
                    }
                    
                    console.log(`[EnemyTank ${this.id}] Bullet hit protective wall! Damage: ${bulletDamage}`);
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
                    console.log(`[EnemyTank ${this.id}] HIT PLAYER! Damage: ${damage}`);
                    (target as any).takeDamage(damage);
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
        
        // Stop physics
        this.physicsBody.setMotionType(PhysicsMotionType.STATIC);
        
        // Death animation
        let t = 0;
        const interval = setInterval(() => {
            t += 0.1;
            this.chassis.scaling.y = Math.max(0.1, 1 - t);
            this.chassis.position.y -= 0.03;
            
            if (t >= 1) {
                clearInterval(interval);
                this.dispose();
            }
        }, 50);
        
        this.onDeathObservable.notifyObservers(this);
    }
    
    private reset(): void {
        if (this.patrolPoints.length > 0) {
            const spawnPos = this.patrolPoints[0].add(new Vector3(0, 3, 0));
            this.chassis.position.copyFrom(spawnPos);
            this.chassis.rotationQuaternion = Quaternion.Identity();
            this.physicsBody.setLinearVelocity(Vector3.Zero());
            this.physicsBody.setAngularVelocity(Vector3.Zero());
        }
    }
    
    dispose(): void {
        this.isAlive = false;
        
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
}
