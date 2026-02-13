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
    PhysicsShape,
    Ray,
    DynamicTexture
} from "@babylonjs/core";
import { AdvancedDynamicTexture, Rectangle, TextBlock } from "@babylonjs/gui";
import { TankController } from "./tankController";
import { EffectsManager } from "./effects";
import { SoundManager } from "./soundManager";
import { logger } from "./utils/logger";

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
    private hpBarFill: Rectangle | null = null;
    private _hpBarText: TextBlock | null = null;

    // HP Bar Refactor: Temporary on-hit display with distance
    private lastHitTime: number = 0;
    private readonly HP_BAR_VISIBLE_DURATION = 3000;
    private distanceTextPlane: Mesh | null = null;
    private distanceTexture: DynamicTexture | null = null;

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

        this.createHpBillboardVisuals();
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

    private createHpBillboardVisuals() {
        const plane = MeshBuilder.CreateBox("turretHp", { width: 2.0, height: 2.0, depth: 0.01 }, this.scene);
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

        // Distance Text Plane
        this.distanceTextPlane = MeshBuilder.CreateBox(
            "turretDistText",
            { width: 1.5, height: 0.5, depth: 0.01 },
            this.scene
        );
        this.distanceTextPlane.position = new Vector3(0, 1.6, 0); // Above HP bar
        this.distanceTextPlane.parent = this.head;
        this.distanceTextPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        this.distanceTextPlane.isVisible = false;

        this.distanceTexture = new DynamicTexture("turretDistTex", { width: 256, height: 85 }, this.scene, false);
        this.distanceTexture.hasAlpha = true;

        const textMat = new StandardMaterial("turretDistTextMat", this.scene);
        textMat.diffuseTexture = this.distanceTexture;
        textMat.emissiveColor = Color3.White();
        textMat.diffuseColor = Color3.White();
        textMat.backFaceCulling = false;
        textMat.disableLighting = true;
        textMat.useAlphaFromDiffuseTexture = true;
        this.distanceTextPlane.material = textMat;
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

    updateHpBar() {
        if (!this.hpBillboard || !this.hpBarFill || !this.distanceTextPlane || !this.base) return;

        const now = Date.now();
        // Visible if hit recently AND alive
        const isVisible = (now - this.lastHitTime < this.HP_BAR_VISIBLE_DURATION) && this.health > 0;

        if (this.hpBillboard.isVisible !== isVisible) {
            this.hpBillboard.isVisible = isVisible;
            if (this.distanceTextPlane) this.distanceTextPlane.isVisible = isVisible;
        }

        if (isVisible) {
            // Update Fill
            const healthPercent = Math.max(0, Math.min(100, (this.health / this.maxHealth) * 100));
            const fillWidth = (healthPercent / 100) * 156;
            this.hpBarFill.width = `${fillWidth}px`;

            // Color
            if (healthPercent > 60) {
                this.hpBarFill.background = "#0f0";
            } else if (healthPercent > 30) {
                this.hpBarFill.background = "#ff0";
            } else {
                this.hpBarFill.background = "#f00";
            }

            // Update Distance Text
            const camera = this.scene.activeCamera;
            if (camera) {
                const dist = Vector3.Distance(camera.position, this.base.absolutePosition);
                const distInt = Math.round(dist);

                // Simple throttling by int check (optimization)
                if ((this as any)._lastDistInt !== distInt) {
                    (this as any)._lastDistInt = distInt;
                    const ctx = this.distanceTexture?.getContext();
                    if (ctx && this.distanceTexture) {
                        ctx.clearRect(0, 0, 256, 85);
                        ctx.font = "bold 48px 'Press Start 2P', monospace";
                        ctx.fillStyle = "white";
                        // ИСПРАВЛЕНО: Приводим к стандартному CanvasRenderingContext2D
                        (ctx as CanvasRenderingContext2D).textAlign = "center"; // Center aligned for turret
                        (ctx as CanvasRenderingContext2D).textBaseline = "middle";
                        ctx.fillText(`${distInt}m`, 128, 42);
                        this.distanceTexture.update();
                    }
                }
            }
        }
    }

    update() {
        if (!this.isAlive) return;

        // Update HP bar visibility and distance text
        this.updateHpBar();

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
            logger.warn("[Turret] Update error:", e);
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
            logger.log("[TURRET] Firing!");

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

            // Сохраняем предыдущую позицию для raycast-проверки (защита от проскока через стенку)
            let prevBulletPos = bullet.absolutePosition.clone();

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

                // === УЛУЧШЕННАЯ ПРОВЕРКА СТЕН С РЕЙКАСТОМ ===
                // Используем рейкаст от предыдущей позиции к текущей для обнаружения быстрых снарядов
                const moveDistance = Vector3.Distance(prevBulletPos, bulletPos);
                if (moveDistance > 0.1) { // Только если снаряд переместился достаточно
                    const moveDirection = bulletPos.subtract(prevBulletPos).normalize();
                    const ray = new Ray(prevBulletPos, moveDirection, moveDistance + 0.5);

                    // КРИТИЧНО: Ищем ВСЕ стенки на сцене (protectiveWall и enemyWall)
                    const walls = this.scene.meshes.filter(mesh =>
                        mesh.metadata &&
                        (mesh.metadata.type === "protectiveWall" || mesh.metadata.type === "enemyWall") &&
                        !mesh.isDisposed()
                    );

                    for (const wall of walls) {
                        // Raycast проверка - ловит быстрые снаряды, проскакивающие через стенку
                        const pick = this.scene.pickWithRay(ray, (mesh) => mesh === wall);

                        if (pick && pick.hit && pick.pickedPoint) {
                            // Проверяем, что точка попадания внутри стенки
                            if (this.checkPointInWall(pick.pickedPoint, wall as Mesh)) {
                                const bulletDamage = (bullet.metadata && (bullet.metadata as any).damage) ? (bullet.metadata as any).damage : this.damage;

                                const wallMeta = wall.metadata as any;
                                if (wallMeta) {
                                    if (wallMeta.type === "protectiveWall" && target && typeof (target as any).damageWall === 'function') {
                                        (target as any).damageWall(wall, bulletDamage);
                                    } else if (wallMeta.type === "enemyWall" && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                                        wallMeta.owner.damageEnemyWall(bulletDamage);
                                    }
                                }

                                logger.log(`[TURRET] Bullet hit wall via raycast (${wallMeta?.type || "unknown"})! Damage: ${bulletDamage}`);
                                if (effects) effects.createHitSpark(pick.pickedPoint);
                                bullet.dispose();
                                return;
                            }
                        }
                    }
                }

                // === ПРОВЕРКА СТОЛКНОВЕНИЯ СО СТЕНКОЙ (дополнительная проверка текущей позиции) ===
                const walls = this.scene.meshes.filter(mesh =>
                    mesh.metadata &&
                    (mesh.metadata.type === "protectiveWall" || mesh.metadata.type === "enemyWall") &&
                    !mesh.isDisposed()
                );
                for (const wall of walls) {
                    // Проверяем, находится ли пуля внутри границ стенки
                    if (this.checkPointInWall(bulletPos, wall as Mesh)) {
                        // Получаем урон из metadata пули
                        const bulletDamage = (bullet.metadata && (bullet.metadata as any).damage) ? (bullet.metadata as any).damage : this.damage;

                        // Наносим урон стенке
                        const wallMeta = wall.metadata as any;
                        if (wallMeta) {
                            if (wallMeta.type === "protectiveWall" && target && typeof (target as any).damageWall === 'function') {
                                (target as any).damageWall(wall, bulletDamage);
                            } else if (wallMeta.type === "enemyWall" && wallMeta.owner && typeof wallMeta.owner.damageEnemyWall === 'function') {
                                wallMeta.owner.damageEnemyWall(bulletDamage);
                            }
                        }

                        logger.log(`[TURRET] Bullet hit wall (${wallMeta?.type || "unknown"})! Damage: ${bulletDamage}`);
                        if (effects) effects.createHitSpark(bulletPos);
                        bullet.dispose();
                        return;
                    }
                }

                const tankPos = target.chassis.absolutePosition;
                const dist = Vector3.Distance(bulletPos, tankPos);

                if (dist < 2.5) {
                    // HIT!
                    logger.log(`[TURRET] HIT PLAYER! Damage: ${damage}`);
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
                    // Обновляем предыдущую позицию для следующей итерации raycast
                    prevBulletPos = bulletPos.clone();
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
            logger.warn("[Turret] Shoot error:", e);
        }
    }

    /**
     * Проверяет, находится ли точка внутри стенки
     * Используется для проверки столкновения снарядов со стенками
     */
    private checkPointInWall(pos: Vector3, wallMesh: Mesh): boolean {
        if (!wallMesh || wallMesh.isDisposed()) return false;

        const wallPos = wallMesh.absolutePosition;
        const wallRotation = wallMesh.rotation.y;
        const wallMeta = wallMesh.metadata as any;
        const wallType = wallMeta?.type || "protectiveWall";

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

    takeDamage(amount: number) {
        if (!this.isAlive) return;

        this.health = Math.max(0, this.health - amount);

        // Show HP bar on damage
        this.lastHitTime = Date.now();
        this.updateHpBar();

        // Flash red
        const headMat = this.head.material as StandardMaterial;
        const originalColor = headMat.diffuseColor.clone();
        headMat.diffuseColor = Color3.Red();
        setTimeout(() => { headMat.diffuseColor = originalColor; }, 100);

        logger.log(`[TURRET] Took ${amount} damage! HP: ${this.health}/${this.maxHealth}`);

        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        this.isAlive = false;
        logger.log("[TURRET] Destroyed!");

        const explosionPos = this.base.absolutePosition.clone();
        if (this.effectsManager) {
            this.effectsManager.createExplosion(explosionPos, 1.5);
        }

        if (this.soundManager) {
            this.soundManager.playExplosion(explosionPos, 1.5);
        }

        // Hide turret
        this.base.setEnabled(false);
        if (this.hpBillboard) this.hpBillboard.isVisible = false;
        if (this.distanceTextPlane) this.distanceTextPlane.isVisible = false;
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
        logger.log(`[EnemyManager] Spawned turret at ${position.toString()}`);

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
    getEnemyPositions(): { x: number, z: number, alive: boolean }[] {
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

