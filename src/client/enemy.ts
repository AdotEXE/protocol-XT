import {
    Scene,
    Vector3,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsBody,
    PhysicsMotionType,
    PhysicsShape
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import { TankController } from "./tankController";
import { EffectsManager } from "./effects";
import { SoundManager } from "./soundManager";

export class EnemyTurret {
    scene: Scene;
    base!: Mesh;
    head!: Mesh;
    barrel!: Mesh;
    
    position: Vector3;
    health = 50;
    maxHealth = 50;
    isAlive = true;
    
    // Targeting
    target: TankController | null = null;
    detectionRange = 40;
    fireRange = 35;
    rotationSpeed = 0.02;
    
    // Shooting
    lastShotTime = 0;
    cooldown = 3000; // 3 seconds between shots - slower than player
    damage = 15;
    
    // HP billboard
    private hpBillboard: Mesh | null = null;
    private _hpTextBlock: any = null;
    
    // References
    effectsManager: EffectsManager | null = null;
    soundManager: SoundManager | null = null;
    
    constructor(scene: Scene, position: Vector3) {
        this.scene = scene;
        this.position = position;
        
        this.createVisuals();
        this.createPhysics();
        
        // Update теперь вызывается из централизованного update в game.ts
    }
    
    private createVisuals() {
        // Base - BOX instead of cylinder
        this.base = MeshBuilder.CreateBox("turretBase", { 
            width: 2, 
            height: 1.5,
            depth: 2 
        }, this.scene);
        this.base.position = this.position.clone();
        this.base.position.y += 0.75;
        
        const baseMat = new StandardMaterial("turretBaseMat", this.scene);
        baseMat.diffuseColor = new Color3(0.3, 0.3, 0.35);
        baseMat.specularColor = Color3.Black();
        this.base.material = baseMat;
        this.base.metadata = { type: "enemyTurret", instance: this };
        
        // Head (box that rotates)
        this.head = MeshBuilder.CreateBox("turretHead", { 
            width: 1.5, 
            height: 0.8, 
            depth: 1.5 
        }, this.scene);
        this.head.position.y = 1.1;
        this.head.parent = this.base;
        
        const headMat = new StandardMaterial("turretHeadMat", this.scene);
        headMat.diffuseColor = new Color3(0.5, 0.2, 0.2);
        headMat.specularColor = Color3.Black();
        this.head.material = headMat;
        this.head.metadata = { type: "enemyTurret", instance: this };
        
        // Barrel - BOX instead of cylinder
        this.barrel = MeshBuilder.CreateBox("turretBarrel", { 
            width: 0.25, 
            height: 0.25,
            depth: 2 
        }, this.scene);
        this.barrel.position.z = 1.2;
        this.barrel.position.y = 0;
        this.barrel.parent = this.head;
        
        const barrelMat = new StandardMaterial("turretBarrelMat", this.scene);
        barrelMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        barrelMat.specularColor = Color3.Black();
        this.barrel.material = barrelMat;
        this.barrel.metadata = { type: "enemyTurret", instance: this };
        
        // Warning light - BOX, FLAT red
        const light = MeshBuilder.CreateBox("warningLight", { size: 0.3 }, this.scene);
        light.position.y = 0.55;
        light.parent = this.head;
        
        const lightMat = new StandardMaterial("lightMat", this.scene);
        lightMat.diffuseColor = new Color3(1, 0, 0); // Pure red, no emissive
        lightMat.specularColor = Color3.Black();
        light.material = lightMat;

        this.createHpBillboard();
    }
    
    private createPhysics() {
        // Static physics for base - BOX with proper collision masks
        const aggregate = new PhysicsAggregate(this.base, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        // Set collision mask so player bullets can hit it
        if (aggregate.shape) {
            aggregate.shape.filterMembershipMask = 2; // Same as environment/static objects
            aggregate.shape.filterCollideMask = 4; // Can collide with player bullets (mask 4)
        }
    }
    
    setTarget(tank: TankController) {
        this.target = tank;
    }
    
    setEffectsManager(em: EffectsManager) {
        this.effectsManager = em;
    }
    
    setSoundManager(sm: SoundManager) {
        this.soundManager = sm;
    }
    
    isPartOf(mesh: Mesh): boolean {
        return mesh === this.base || mesh === this.head || mesh === this.barrel;
    }

    private hpBarContainer: Rectangle | null = null;
    private hpBarFill: Rectangle | null = null;
    private _hpBarText: TextBlock | null = null;
    
    private createHpBillboard() {
        const plane = MeshBuilder.CreatePlane("turretHp", { size: 2.0 }, this.scene);
        plane.parent = this.head;
        plane.position = new Vector3(0, 1.3, 0);
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.isVisible = false;
        
        const tex = AdvancedDynamicTexture.CreateForMesh(plane, 180, 20);
        
        // Контейнер - ТОЛЬКО ШКАЛА, БЕЗ ТЕКСТА
        const container = new Rectangle();
        container.width = "160px";
        container.height = "14px";
        container.background = "#300";
        container.color = "#0f0";
        container.thickness = 2;
        container.cornerRadius = 0;
        tex.addControl(container);
        this.hpBarContainer = container;
        
        // Заполненная часть шкалы
        const barFill = new Rectangle();
        barFill.width = "156px";
        barFill.height = "10px";
        barFill.background = "#0f0";
        barFill.thickness = 0;
        barFill.horizontalAlignment = 0; // LEFT
        container.addControl(barFill);
        this.hpBarFill = barFill;
        
        this.hpBillboard = plane;
    }

    setHpVisible(visible: boolean) {
        if (!this.hpBillboard || !this.hpBarFill) return;
        this.hpBillboard.isVisible = visible;
        if (visible) {
            const healthPercent = Math.max(0, Math.min(100, (this.health / this.maxHealth) * 100));
            const fillWidth = (healthPercent / 100) * 156;
            this.hpBarFill.width = `${fillWidth}px`;
            
            // Цвет шкалы в зависимости от здоровья
            if (healthPercent > 60) {
                this.hpBarFill.background = "#0f0";
            } else if (healthPercent > 30) {
                this.hpBarFill.background = "#ff0";
            } else {
                this.hpBarFill.background = "#f00";
            }
        }
    }
    
    update() {
        if (!this.isAlive) return;
        if (!this.target || !this.target.isAlive) return;
        if (!this.target.chassis || this.target.chassis.isDisposed()) return;
        if (!this.base || this.base.isDisposed()) return;
        
        try {
            const targetPos = this.target.chassis.absolutePosition;
            const myPos = this.base.absolutePosition;
        
        // Calculate distance
        const toTarget = targetPos.subtract(myPos);
        const distance = toTarget.length();
        
        // Check if in detection range
        if (distance > this.detectionRange) return;
        
        // Rotate head towards target
        const targetAngle = Math.atan2(toTarget.x, toTarget.z);
        let currentAngle = this.head.rotation.y;
        
        // Calculate angle difference
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Rotate towards target
        if (Math.abs(angleDiff) > 0.01) {
            this.head.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.rotationSpeed);
        }
        
        // Check if facing target (within 10 degrees)
        const isFacing = Math.abs(angleDiff) < 0.17; // ~10 degrees
        
        // Shoot if in range and facing target
        if (isFacing && distance <= this.fireRange) {
            this.tryShoot();
        }
        } catch (e) {
            console.warn("[Turret] Update error:", e);
        }
    }
    
    private tryShoot() {
        const now = Date.now();
        if (now - this.lastShotTime < this.cooldown) return;
        
        this.lastShotTime = now;
        this.shoot();
    }
    
    private shoot() {
        if (!this.target || !this.target.isAlive) return;
        if (!this.barrel || this.barrel.isDisposed()) return;
        
        try {
            console.log("[TURRET] Firing!");
            
            // Get muzzle position
            const muzzlePos = this.barrel.getAbsolutePosition();
            const forward = this.head.forward;
            
            // Create muzzle flash
            if (this.effectsManager) {
                this.effectsManager.createMuzzleFlash(muzzlePos.add(forward.scale(1)), forward);
            }
            
            // Play sound with 3D positioning
            if (this.soundManager) {
                const shootPos = muzzlePos.add(forward.scale(1));
                this.soundManager.playShoot("standard", shootPos);
            }
            
            // Create projectile
            const bullet = MeshBuilder.CreateBox(`turretBullet_${Date.now()}`, { width: 0.4, height: 0.4, depth: 1.0 }, this.scene);
            bullet.position = muzzlePos.add(forward.scale(1.2));
            
            const bulletMat = new StandardMaterial("turretBulletMat", this.scene);
            bulletMat.diffuseColor = new Color3(1, 0.5, 0);
            bulletMat.specularColor = Color3.Black();
            bullet.material = bulletMat;
            bullet.metadata = { type: "turretBullet", damage: this.damage };
            
            // Physics for bullet
            const shape = new PhysicsShape({ 
                type: PhysicsShapeType.BOX, 
                parameters: { extents: new Vector3(0.4, 0.4, 1.0) } 
            }, this.scene);
            shape.filterMembershipMask = 16; // Enemy bullet group (same as enemy tanks)
            shape.filterCollideMask = 1 | 2 | 32; // Player (1), environment (2), and protective walls (32)
            
            const body = new PhysicsBody(bullet, PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            body.setMassProperties({ mass: 5 });
            body.setLinearDamping(0);
            
            // Shoot towards target with prediction
            const targetPos = this.target.chassis.absolutePosition.clone();
            const targetVel = this.target.physicsBody.getLinearVelocity() || Vector3.Zero();
            
            const bulletSpeed = 35;
            const distance = targetPos.subtract(muzzlePos).length();
            const timeToHit = distance / bulletSpeed;
            const predictedPos = targetPos.add(targetVel.scale(timeToHit * 0.5));
            
            const direction = predictedPos.subtract(muzzlePos).normalize();
            body.applyImpulse(direction.scale(bulletSpeed * 5), bullet.position);
            
            // Проверка попадания по расстоянию
            const target = this.target;
            const damage = this.damage;
            const effects = this.effectsManager;
            // Минимальная скорость снаряда для нанесения урона (м/с)
            const MIN_DAMAGE_SPEED = 5.0;
            const MIN_DAMAGE_SPEED_SQ = MIN_DAMAGE_SPEED * MIN_DAMAGE_SPEED;
            
            const checkHit = () => {
                if (bullet.isDisposed()) return;
                if (!target || !target.isAlive || !target.chassis || target.chassis.isDisposed()) {
                    bullet.dispose();
                    return;
                }
                
                // КРИТИЧНО: Проверяем скорость снаряда перед нанесением урона
                // Если снаряд лежит на земле (низкая скорость) - он НЕ взрывается и не наносит урон
                const velocity = body.getLinearVelocity();
                const speedSq = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z;
                if (speedSq < MIN_DAMAGE_SPEED_SQ) {
                    // Снаряд почти остановился - удаляем его без урона
                    if (!bullet.metadata) bullet.metadata = {};
                    if (!bullet.metadata._lowSpeedStartTime) {
                        bullet.metadata._lowSpeedStartTime = Date.now();
                    }
                    // Если снаряд лежит более 2 секунд - удаляем
                    if (Date.now() - bullet.metadata._lowSpeedStartTime > 2000) {
                        bullet.dispose();
                    }
                    return;
                } else {
                    if (bullet.metadata) bullet.metadata._lowSpeedStartTime = null;
                }
                
                const bulletPos = bullet.absolutePosition;
                
                // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКОЙ ===
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
                        // Получаем урон из metadata пули
                        const bulletDamage = (bullet.metadata && (bullet.metadata as any).damage) ? (bullet.metadata as any).damage : this.damage;
                        
                        // Наносим урон стенке через target (TankController)
                        if (target && typeof (target as any).damageWall === 'function') {
                            (target as any).damageWall(wall, bulletDamage);
                        }
                        
                        console.log(`[TURRET] Bullet hit protective wall! Damage: ${bulletDamage}`);
                        if (effects) effects.createHitSpark(bulletPos);
                        bullet.dispose();
                        return;
                    }
                }
                
                const tankPos = target.chassis.absolutePosition;
                const dist = Vector3.Distance(bulletPos, tankPos);
                
                if (dist < 2.5) {
                    // HIT!
                    console.log(`[TURRET] HIT PLAYER! Damage: ${damage}`);
                    // Передаём позицию турели для индикатора направления урона
                    target.takeDamage(damage, this.base.absolutePosition.clone());
                    if (effects) {
                        effects.createExplosion(bulletPos, 0.5);
                    }
                    bullet.dispose();
                    return;
                }
                
                // Continue checking
                if (bulletPos.y > -5 && bulletPos.y < 50) {
                    requestAnimationFrame(checkHit);
                } else {
                    bullet.dispose();
                }
            };
            
            setTimeout(() => checkHit(), 50);
            
            // Auto dispose
            setTimeout(() => { 
                if (!bullet.isDisposed()) bullet.dispose(); 
            }, 5000);
        } catch (e) {
            console.warn("[Turret] Shoot error:", e);
        }
    }
    
    takeDamage(amount: number) {
        if (!this.isAlive) return;
        
        this.health = Math.max(0, this.health - amount);
        
        // Flash red
        const headMat = this.head.material as StandardMaterial;
        const originalColor = headMat.diffuseColor.clone();
        headMat.diffuseColor = Color3.Red();
        setTimeout(() => { headMat.diffuseColor = originalColor; }, 100);
        
        console.log(`[TURRET] Took ${amount} damage! HP: ${this.health}/${this.maxHealth}`);
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.isAlive = false;
        console.log("[TURRET] Destroyed!");
        
        const explosionPos = this.base.absolutePosition.clone();
        if (this.effectsManager) {
            this.effectsManager.createExplosion(explosionPos, 1.5);
        }
        
        if (this.soundManager) {
            this.soundManager.playExplosion(explosionPos, 1.5);
        }
        
        // Hide turret
        this.base.setEnabled(false);
    }
    
    respawn() {
        this.health = this.maxHealth;
        this.isAlive = true;
        this.base.setEnabled(true);
        this.head.rotation.y = 0;
    }
}

// Enemy manager to handle multiple turrets
export class EnemyManager {
    scene: Scene;
    turrets: EnemyTurret[] = [];
    player: TankController | null = null;
    effectsManager: EffectsManager | null = null;
    soundManager: SoundManager | null = null;
    onTurretDestroyed: (() => void) | null = null;
    
    constructor(scene: Scene) {
        this.scene = scene;
    }
    
    setOnTurretDestroyed(callback: () => void) {
        this.onTurretDestroyed = callback;
    }
    
    setPlayer(tank: TankController) {
        this.player = tank;
        this.turrets.forEach(t => t.setTarget(tank));
    }
    
    setEffectsManager(em: EffectsManager) {
        this.effectsManager = em;
        this.turrets.forEach(t => t.setEffectsManager(em));
    }
    
    setSoundManager(sm: SoundManager) {
        this.soundManager = sm;
        this.turrets.forEach(t => t.setSoundManager(sm));
    }
    
    spawnTurret(position: Vector3): EnemyTurret {
        const turret = new EnemyTurret(this.scene, position);
        
        if (this.player) turret.setTarget(this.player);
        if (this.effectsManager) turret.setEffectsManager(this.effectsManager);
        if (this.soundManager) turret.setSoundManager(this.soundManager);
        
        this.turrets.push(turret);
        console.log(`[EnemyManager] Spawned turret at ${position.toString()}`);
        
        return turret;
    }
    
    spawnMultiple(positions: Vector3[]) {
        positions.forEach(pos => this.spawnTurret(pos));
    }
    
    // Check if a projectile hit any turret
    checkProjectileHit(projectilePos: Vector3, damage: number): boolean {
        for (const turret of this.turrets) {
            if (!turret.isAlive) continue;
            
            const dist = projectilePos.subtract(turret.base.absolutePosition).length();
            if (dist < 2) {
                const wasAlive = turret.isAlive;
                turret.takeDamage(damage);
                
                // Check if this hit killed the turret
                if (wasAlive && !turret.isAlive && this.onTurretDestroyed) {
                    this.onTurretDestroyed();
                }
                return true;
            }
        }
        return false;
    }
    
    // Get enemy positions for minimap
    getEnemyPositions(): {x: number, z: number, alive: boolean}[] {
        return this.turrets.map(t => ({
            x: t.position.x,
            z: t.position.z,
            alive: t.isAlive
        }));
    }
    
    // Get count of alive turrets
    getAliveCount(): number {
        return this.turrets.filter(t => t.isAlive).length;
    }
    
    respawnAll() {
        this.turrets.forEach(t => t.respawn());
    }
    
    // Обновление всех турелей (вызывается из централизованного update)
    update(): void {
        for (const turret of this.turrets) {
            if (turret.isAlive) {
                turret.update();
            }
        }
    }
}

