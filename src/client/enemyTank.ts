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
    Observable
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle } from "@babylonjs/gui";
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
    private mass = 1500;
    private hoverHeight = 1.0;
    private hoverStiffness = 30000;
    private hoverDamping = 8000;
    
    // Movement (same as TankController)
    private moveSpeed = 10;        // Slightly slower than player
    private turnSpeed = 2.2;
    private acceleration = 7000;
    
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
    private range = 50;
    private detectRange = 80;
    private optimalRange = 30; // Best fighting distance
    private aimAccuracy = 0.95; // 95% accuracy (adds slight randomness)
    
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
                this.cooldown = 4000; // 4 секунды перезарядка
                this.aimAccuracy = 0.65; // 65% точность
                this.detectRange = 50; // Меньший радиус обнаружения
                this.range = 40;
                this.optimalRange = 25;
                this.decisionInterval = 1000; // Решения каждую секунду
                this.turretSpeed = 0.04; // Медленнее поворачивает башню
                break;
            case "medium":
                // Средняя сложность: средняя реакция, средняя точность
                this.cooldown = 3000; // 3 секунды перезарядка
                this.aimAccuracy = 0.80; // 80% точность
                this.detectRange = 65;
                this.range = 45;
                this.optimalRange = 28;
                this.decisionInterval = 700;
                this.turretSpeed = 0.05;
                break;
            case "hard":
                // Сложная сложность: быстрая реакция, высокая точность (по умолчанию)
                this.cooldown = 2500; // 2.5 секунды перезарядка
                this.aimAccuracy = 0.95; // 95% точность
                this.detectRange = 80;
                this.range = 50;
                this.optimalRange = 30;
                this.decisionInterval = 500; // Решения каждые 500мс
                this.turretSpeed = 0.06;
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
        chassis.position = position.add(new Vector3(0, 2, 0));
        
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
        const plane = MeshBuilder.CreatePlane(`enemyHp_${this.id}`, { size: 2.2 }, this.scene);
        plane.parent = this.turret;
        plane.position = new Vector3(0, 1.4, 0);
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.isVisible = false;
        
        const tex = AdvancedDynamicTexture.CreateForMesh(plane, 200, 24);
        
        const container = new Rectangle();
        container.width = "180px";
        container.height = "16px";
        container.background = "#300";
        container.color = "#f00";
        container.thickness = 2;
        container.cornerRadius = 0;
        tex.addControl(container);
        
        const barFill = new Rectangle();
        barFill.width = "176px";
        barFill.height = "12px";
        barFill.background = "#f00";
        barFill.thickness = 0;
        barFill.horizontalAlignment = 0;
        container.addControl(barFill);
        this.hpBarFill = barFill;
        
        this.hpBillboard = plane;
        this.hpTexture = tex;
    }

    setHpVisible(visible: boolean) {
        if (!this.hpBillboard || !this.hpBarFill) return;
        this.hpBillboard.isVisible = visible;
        if (visible) {
            const healthPercent = Math.max(0, Math.min(100, (this.currentHealth / this.maxHealth) * 100));
            const fillWidth = (healthPercent / 100) * 176;
            this.hpBarFill.width = `${fillWidth}px`;
            
            if (healthPercent > 60) {
                this.hpBarFill.background = "#0f0";
            } else if (healthPercent > 30) {
                this.hpBarFill.background = "#ff0";
            } else {
                this.hpBarFill.background = "#f00";
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
        shape.filterCollideMask = 2 | 4; // Environment and player bullets
        
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
        
        // Оптимизация: далёкие враги обновляются реже
        const distToPlayer = (this.target && this.target.chassis) ? 
            Vector3.Distance(this.chassis.position, this.target.chassis.position) : 1000;
        
        // Далёкие враги (>150) обновляют AI каждые 4 кадра
        // Средние (50-150) - каждые 2 кадра
        // Близкие (<50) - каждый кадр
        const aiUpdateInterval = distToPlayer > 150 ? 4 : (distToPlayer > 50 ? 2 : 1);
        
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
            const pos = this.chassis.position.clone();
            const vel = body.getLinearVelocity();
            const angVel = body.getAngularVelocity();
            
            if (!vel || !angVel) return;
            
            // Get orientation
            const rotMatrix = this.chassis.getWorldMatrix();
            const forward = Vector3.TransformNormal(Vector3.Forward(), rotMatrix).normalize();
            const right = Vector3.TransformNormal(Vector3.Right(), rotMatrix).normalize();
            const up = Vector3.TransformNormal(Vector3.Up(), rotMatrix).normalize();
            
            // --- 1. ENHANCED HOVER (same improvements as player) ---
            const targetY = this.hoverHeight;
            const deltaY = targetY - pos.y;
            const velY = vel.y;
            
            // Адаптивная жесткость
            const stiffnessMultiplier = 1.0 + Math.abs(deltaY) * 0.5;
            const hoverForce = (deltaY * this.hoverStiffness * stiffnessMultiplier) - (velY * this.hoverDamping);
            body.applyForce(new Vector3(0, hoverForce, 0), pos);
            
            // Дополнительная стабилизация при движении
            if (Math.abs(Vector3.Dot(vel, forward)) > 2) {
                const stabilityForce = -velY * 3000;
                body.applyForce(new Vector3(0, stabilityForce, 0), pos);
            }
            
            // --- 2. ENHANCED KEEP UPRIGHT (same as player!) ---
            const tiltX = Math.asin(Math.max(-1, Math.min(1, up.z)));
            const tiltZ = Math.asin(Math.max(-1, Math.min(1, -up.x)));
            
            // Улучшенные значения как у игрока
            const uprightForce = 15000;
            const uprightDamp = 8000;
            const correctiveX = -tiltX * uprightForce - angVel.x * uprightDamp;
            const correctiveZ = -tiltZ * uprightForce - angVel.z * uprightDamp;
            
            this.applyTorque(new Vector3(correctiveX, 0, correctiveZ));
            
            // Экстренное выравнивание
            if (up.y < 0.7 || Math.abs(tiltX) > 0.3 || Math.abs(tiltZ) > 0.3) {
                const emergencyForce = 25000;
                const emergencyX = -tiltX * emergencyForce;
                const emergencyZ = -tiltZ * emergencyForce;
                this.applyTorque(new Vector3(emergencyX, 0, emergencyZ));
                
                if (up.y < 0.5) {
                    const liftForce = (0.9 - up.y) * 50000;
                    body.applyForce(new Vector3(0, liftForce, 0), pos);
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
            
            const forcePoint = pos.add(new Vector3(0, -0.6, 0));
            body.applyForce(forward.scale(accel), forcePoint);
            
            if (Math.abs(this.smoothThrottle) > 0.1) {
                const downForce = Math.abs(this.smoothThrottle) * 2000;
                body.applyForce(new Vector3(0, -downForce, 0), pos);
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
            this.applyTorque(new Vector3(0, turnAccel, 0));
            
            if (Math.abs(speedRatio) > 0.3 && Math.abs(this.smoothSteer) > 0.2) {
                const stabilityTorque = -angVel.y * 2000 * speedRatio;
                this.applyTorque(new Vector3(0, stabilityTorque, 0));
            }
            
            if (Math.abs(this.smoothSteer) < 0.05) {
                this.applyTorque(new Vector3(0, -angVel.y * 4500, 0));
            }
            
            // --- 5. ENHANCED SIDE FRICTION ---
            const sideSpeed = Vector3.Dot(vel, right);
            const sideFrictionMultiplier = 1.0 + Math.abs(currentSpeed) / this.moveSpeed * 0.5;
            body.applyForce(right.scale(-sideSpeed * 13000 * sideFrictionMultiplier), pos);
            
            // --- 6. ENHANCED DRAG ---
            if (Math.abs(this.throttleTarget) < 0.05) {
                const sideVel = Vector3.Dot(vel, right);
                const sideDrag = -sideVel * 8000;
                body.applyForce(right.scale(sideDrag), pos);
                
                const fwdVel = Vector3.Dot(vel, forward);
                const fwdDrag = -fwdVel * 7000;
                body.applyForce(forward.scale(fwdDrag), pos);
                
                const angularDrag = -angVel.y * 5000;
                this.applyTorque(new Vector3(0, angularDrag, 0));
            }
            
            // --- Auto reset if fallen (Enhanced detection) ---
            const isFallen = pos.y < -10 || up.y < 0.3 || Math.abs(tiltX) > 1.0 || Math.abs(tiltZ) > 1.0;
            const isStuck = Math.abs(vel.length()) < 0.5 && Math.abs(angVel.length()) < 0.1 && up.y < 0.5;
            
            if (isFallen || isStuck) {
                this.reset();
            }
            
        } catch (e) {
            // Silent fail
        }
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
        const radius = 25;
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI * 2 / 5) * i + Math.random() * 0.8;
            const x = center.x + Math.cos(angle) * radius * (0.6 + Math.random() * 0.4);
            const z = center.z + Math.sin(angle) * radius * (0.6 + Math.random() * 0.4);
            this.patrolPoints.push(new Vector3(x, center.y, z));
        }
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
                this.state = "patrol";
            }
        
        // Execute current state
        this.executeState();
    }
    
    private makeDecision(distance: number): void {
        const healthPercent = this.currentHealth / this.maxHealth;
        const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;
        
        // Улучшенная логика принятия решений
        // Priority 1: Retreat if very low health (улучшенная логика)
        if (healthPercent < 0.15) {
            this.state = "retreat";
            this.stateTimer = 5000; // Отступаем дольше
            return;
        }
        
        // Priority 2: Evade if taking heavy damage
        if (healthPercent < 0.4 && distance < 25) {
            if (Math.random() < 0.3) {
                this.state = "evade";
                this.stateTimer = 2000;
                // Выбираем направление уклонения
                const angle = Math.random() * Math.PI * 2;
                this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
                return;
            }
        }
        
        // Priority 3: In range - attack or flank (улучшенная логика)
        if (distance < this.range) {
            // Более умный выбор тактики
            const shouldFlank = distance > 20 && distance < this.optimalRange && healthPercent > 0.5;
            const flankChance = shouldFlank ? 0.25 : 0.1; // Больше шанс фланга в оптимальной дистанции
            
            if (Math.random() < flankChance) {
                this.state = "flank";
                this.flankDirection = Math.random() > 0.5 ? 1 : -1;
                this.stateTimer = 3000; // Flank дольше
        } else {
                this.state = "attack";
                // Если цель слабая - агрессивнее атакуем
                if (targetHealthPercent < 0.3) {
                    this.stateTimer = 0; // Не переключаемся на другую тактику
                }
            }
        } 
        // Priority 4: Detected but not in range - chase (улучшенная логика)
        else if (distance < this.detectRange) {
            this.state = "chase";
            // Если цель далеко и у нас мало здоровья - не преследуем слишком агрессивно
            if (healthPercent < 0.3 && distance > 60) {
                this.state = "patrol"; // Возвращаемся к патрулированию
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
        if (this.patrolPoints.length === 0) return;
        
        const target = this.patrolPoints[this.currentPatrolIndex];
        const distance = Vector3.Distance(this.chassis.absolutePosition, target);
        
        if (distance < 4) {
            this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
        } else {
            this.driveToward(target, 0.5); // Half speed patrol
        }
        
        // Look forward while patrolling
        this.turretTargetAngle = 0;
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
        
        // Aim at target (with prediction!)
        this.aimAtTarget();
        
        // Check if we can shoot (улучшенная логика стрельбы)
        const canShoot = this.isAimedAtTarget() && !this.isReloading;
        
        if (canShoot) {
        const now = Date.now();
        if (now - this.lastShotTime > this.cooldown) {
                // Улучшенная логика: более агрессивная стрельба при низком здоровье цели
                const targetHealthPercent = this.target?.currentHealth ? this.target.currentHealth / 100 : 1.0;
                const shouldFire = targetHealthPercent < 0.5 || healthPercent > 0.6 || Math.random() < 0.8;
                
                if (shouldFire) {
            this.fire();
            this.lastShotTime = now;
                }
            }
        }
        
        // Улучшенное поддержание оптимальной дистанции
        if (distance < this.optimalRange * 0.5) {
            // Слишком близко - отступаем быстрее
            this.throttleTarget = -0.6;
            this.steerTarget = Math.sin(this._tick * 0.03) * 0.4; // Зигзаг при отступлении
        } else if (distance < this.optimalRange * 0.8) {
            // Близко - медленно отступаем
            this.throttleTarget = -0.2;
            this.steerTarget = Math.sin(this._tick * 0.02) * 0.2;
        } else if (distance > this.optimalRange * 1.5) {
            // Слишком далеко - приближаемся
            this.driveToward(targetPos, 0.5);
        } else if (distance > this.optimalRange * 1.2) {
            // Немного далеко - медленно приближаемся
            this.driveToward(targetPos, 0.3);
        } else {
            // Оптимальная дистанция - активное маневрирование
            const strafeSpeed = healthPercent > 0.5 ? 0.4 : 0.2; // Меньше маневров при низком HP
            this.throttleTarget = Math.sin(this._tick * 0.015) * strafeSpeed;
            this.steerTarget = Math.cos(this._tick * 0.02) * 0.4;
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
        const flankPos = myPos.add(perpendicular.scale(15));
        
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
        
        const retreatPos = myPos.add(awayDir.scale(30));
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
        const evadePos = myPos.add(this.evadeDirection.scale(15));
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
        const direction = targetPos.subtract(pos);
        direction.y = 0;
        
        if (direction.length() < 0.5) {
            this.throttleTarget = 0;
            this.steerTarget = 0;
            return;
        }
        
        direction.normalize();
        
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
        const bulletSpeed = 120; // Approximate bullet speed
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
        shape.filterCollideMask = 1 | 2;  // Player (1) and environment (2)
        
        const body = new PhysicsBody(ball, PhysicsMotionType.DYNAMIC, false, this.scene);
        body.shape = shape;
        body.setMassProperties({ mass: 15 });
        body.setLinearDamping(0.01);
        
        // Fire in BARREL direction!
        body.applyImpulse(barrelDir.scale(1500), ball.position);
        
        // === RECOIL (like player!) ===
        const recoilForce = barrelDir.scale(-400);
        this.physicsBody.applyImpulse(recoilForce, this.chassis.absolutePosition);
        
        // Angular recoil (tank rocks back)
        const barrelWorldPos = this.barrel.getAbsolutePosition();
        const chassisPos = this.chassis.absolutePosition;
        const torqueDir = barrelWorldPos.subtract(chassisPos).normalize();
        this.applyTorque(new Vector3(-torqueDir.z * 2000, 0, torqueDir.x * 2000));
        
        // === HIT DETECTION ===
        const damage = 20;
        let hasHit = false;
        let ricochetCount = 0;
        const maxRicochets = 2;
        
        const target = this.target;
        
        const checkHit = () => {
            if (hasHit || ball.isDisposed()) return;
            
            const bulletPos = ball.absolutePosition;
            
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
        
        // React to damage - evade!
        if (this.currentHealth > 0 && Math.random() < 0.4) {
            this.state = "evade";
            this.stateTimer = 1000;
            // Random evade direction
            const angle = Math.random() * Math.PI * 2;
            this.evadeDirection = new Vector3(Math.cos(angle), 0, Math.sin(angle));
        }
        
        if (this.currentHealth <= 0) {
            this.die();
        }
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
        if (this.chassis && !this.chassis.isDisposed()) {
        this.chassis.dispose();
        }
        if (this.hpBillboard && !this.hpBillboard.isDisposed()) {
            this.hpBillboard.dispose();
        }
        this.onDeathObservable.clear();
    }
}
