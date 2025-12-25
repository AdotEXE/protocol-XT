// Модуль управления здоровьем, топливом и неуязвимостью танка
import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeType, Quaternion } from "@babylonjs/core";
import type { ITankController } from "./types";
import { TANK_CONSTANTS } from "./constants";

export class TankHealthModule {
    private tank: ITankController;
    
    // Защита от урона после респавна
    private isInvulnerable = false;
    private invulnerabilityDuration = TANK_CONSTANTS.INVULNERABILITY_DURATION;
    private invulnerabilityStartTime = 0;
    private invulnerabilityGlow: Mesh | null = null;
    
    // Информация о разрушенных частях для анимации сборки
    private destroyedParts: Array<{
        mesh: Mesh;
        name: string;
        originalParent: Mesh | null;
        originalLocalPos: Vector3;
        originalLocalRot: Quaternion | null;
        physicsBody: PhysicsBody;
    }> = [];
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    takeDamage(amount: number, attackerPosition?: Vector3) {
        if (!this.tank.isAlive) return;
        
        // Проверка неуязвимости
        if (this.isInvulnerable) {
            return; // Не получаем урон во время защиты
        }
        
        // Shield reduces damage
        if (this.tank.chassisAnimationElements?.shieldActive) {
            amount = Math.round(amount * TANK_CONSTANTS.SHIELD_DAMAGE_REDUCTION);
        }
        
        // Stealth reduces damage (harder to hit)
        if (this.tank.chassisAnimationElements?.stealthActive) {
            amount = Math.round(amount * TANK_CONSTANTS.STEALTH_DAMAGE_REDUCTION);
        }
        
        // Применяем бонус брони от уровня опыта
        let finalDamage = amount;
        if (this.tank.experienceSystem) {
            const chassisBonus = this.tank.experienceSystem.getChassisLevelBonus(this.tank.chassisType.id);
            if (chassisBonus && chassisBonus.armorBonus > 0) {
                const reduction = 1 - chassisBonus.armorBonus;
                finalDamage = Math.round(amount * reduction);
                if (finalDamage < amount) {
                    console.log(`[ARMOR] Damage reduced: ${amount} -> ${finalDamage} (${(chassisBonus.armorBonus * 100).toFixed(0)}% armor)`);
                }
            }
        }
        
        this.tank.currentHealth = Math.max(0, this.tank.currentHealth - finalDamage);
        if (this.tank.hud) {
            this.tank.hud.damage(finalDamage);
            
            // УЛУЧШЕНО: Показываем экранную вспышку вместо объёмного эффекта, если известна позиция атакующего
            if (attackerPosition && this.tank.chassis) {
                const playerPos = this.tank.chassis.position;
                const playerRotation = this.tank.chassis.rotation.y;
                // Передаём finalDamage для вычисления интенсивности вспышки
                this.tank.hud.showDamageFromPosition(attackerPosition, playerPos, playerRotation, finalDamage);
            }
        }
        
        // Play hit sound (разные звуки для разных типов попаданий) with 3D positioning
        if (this.tank.soundManager) {
            const hitType = finalDamage > 30 ? "critical" : finalDamage > 15 ? "armor" : "normal";
            const hitPos = this.tank.chassis.position.clone();
            this.tank.soundManager.playHit(hitType, hitPos);
        }
        
        // Тряска камеры при получении урона
        if (this.tank.cameraShakeCallback) {
            const intensity = Math.min(0.5, finalDamage / 50); // Интенсивность зависит от урона
            this.tank.cameraShakeCallback(intensity);
        }
        
        // Записываем полученный урон для опыта корпуса (оригинальный урон)
        if (this.tank.experienceSystem) {
            this.tank.experienceSystem.recordDamageTaken(this.tank.chassisType.id, amount);
        }
        // Записываем полученный урон в статистику игрока
        if (this.tank.playerProgression) {
            this.tank.playerProgression.recordDamageTaken(finalDamage);
        }
        
        console.log(`[DAMAGE] Tank took ${finalDamage} damage! HP: ${this.tank.currentHealth}/${this.tank.maxHealth}`);
        
        if (this.tank.currentHealth <= 0) {
            this.die();
        }
    }
    
    heal(amount: number) {
        if (!this.tank.isAlive) return;
        
        this.tank.currentHealth = Math.min(this.tank.maxHealth, this.tank.currentHealth + amount);
        if (this.tank.hud) {
            this.tank.hud.heal(amount);
        }
    }
    
    // Топливная система
    addFuel(amount: number): void {
        this.tank.currentFuel = Math.min(this.tank.maxFuel, this.tank.currentFuel + amount);
        this.tank.isFuelEmpty = this.tank.currentFuel <= 0;
    }
    
    consumeFuel(deltaTime: number): void {
        if (this.tank.isFuelEmpty) return;
        
        // Потребляем топливо только при движении
        const isMoving = Math.abs(this.tank.smoothThrottle) > 0.1 || Math.abs(this.tank.smoothSteer) > 0.1;
        if (isMoving) {
            const fuelRate = this.tank.fuelConsumptionRate || TANK_CONSTANTS.FUEL_CONSUMPTION_RATE;
            this.tank.currentFuel -= fuelRate * deltaTime;
            if (this.tank.currentFuel <= 0) {
                this.tank.currentFuel = 0;
                this.tank.isFuelEmpty = true;
                console.log("[TANK] Out of fuel!");
            }
        }
    }
    
    getFuelPercent(): number {
        return this.tank.currentFuel / this.tank.maxFuel;
    }
    
    // Активировать защиту от урона
    activateInvulnerability(): void {
        this.isInvulnerable = true;
        this.invulnerabilityStartTime = Date.now();
        
        // Создаём визуальный эффект защиты (свечение)
        if (this.tank.chassis && this.tank.effectsManager) {
            this.createInvulnerabilityGlow();
        }
        
        // Обновляем HUD
        if (this.tank.hud) {
            this.tank.hud.setInvulnerability(true, this.invulnerabilityDuration);
        }
        
        // Сообщение в чат
        if (this.tank.chatSystem) {
            this.tank.chatSystem.info("Защита активирована", 0);
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
        if (this.tank.hud) {
            this.tank.hud.setInvulnerability(false);
        }
    }
    
    // Создать визуальный эффект защиты
    private createInvulnerabilityGlow(): void {
        if (!this.tank.chassis) return;
        
        // Создаём светящееся кольцо вокруг танка
        const glow = MeshBuilder.CreateCylinder("invulnerabilityGlow", { 
            diameter: this.tank.chassisType.width + 2, 
            height: 0.2, 
            tessellation: 32 
        }, this.tank.scene);
        glow.position = this.tank.chassis.position.clone();
        glow.position.y = 1;
                const mat = new StandardMaterial("invulnerabilityMat", this.tank.scene);
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
    updateInvulnerability(): void {
        if (!this.isInvulnerable) return;
        
        const elapsed = Date.now() - this.invulnerabilityStartTime;
        const timeLeft = this.invulnerabilityDuration - elapsed;
        
        if (timeLeft <= 0) {
            this.deactivateInvulnerability();
        } else {
            // Обновляем визуальный эффект
            if (this.invulnerabilityGlow && this.tank.chassis) {
                this.invulnerabilityGlow.position = this.tank.chassis.position.clone();
                this.invulnerabilityGlow.position.y = 1;
            }
            
            // Обновляем HUD
            if (this.tank.hud) {
                this.tank.hud.updateInvulnerability(timeLeft);
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
        if (!this.tank.isAlive) return; // Уже мёртв
        
        this.tank.isAlive = false;
        console.log("[TANK] Destroyed!");
        
        // Останавливаем все движения
        if (this.tank.physicsBody) {
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
        }
        
        // Сбрасываем инпуты
        this.tank.throttleTarget = 0;
        this.tank.steerTarget = 0;
        this.tank.smoothThrottle = 0;
        this.tank.smoothSteer = 0;
        this.tank.turretTurnTarget = 0;
        this.tank.turretTurnSmooth = 0;
        
        // Анимация разрушения - разброс частей танка
        this.createDestructionAnimation();
        
        // Play explosion sound with 3D positioning
        if (this.tank.soundManager) {
            const explosionPos = this.tank.chassis.position.clone();
            this.tank.soundManager.playExplosion(explosionPos, 1.0);
        }
        
        // Create explosion effect
        if (this.tank.effectsManager) {
            this.tank.effectsManager.createExplosion(this.tank.chassis.position.clone(), 2);
        }
        
        // Show death message
        if (this.tank.hud) {
            this.tank.hud.showDeathMessage();
        }
        
        // Record death in player progression
        if (this.tank.playerProgression) {
            this.tank.playerProgression.recordDeath();
        }
        
        // Сбрасываем серию убийств в системе опыта
        if (this.tank.experienceSystem) {
            this.tank.experienceSystem.recordDeath();
        }
        
        // Respawn after 3 seconds
        console.log("[TANK] Scheduling respawn in 3 seconds...");
        setTimeout(() => {
            console.log("[TANK] Respawn timer fired!");
            if (!this.tank.isAlive && this.tank.respawn) {
                this.tank.respawn();
            } else {
                console.log("[TANK] Already alive, skipping respawn");
            }
        }, 3000);
    }
    
    /**
     * Создает анимацию разрушения - разбрасывает части танка по сторонам
     */
    private createDestructionAnimation(): void {
        const tank = this.tank;
        const scene = tank.scene;
        const explosionCenter = tank.chassis.absolutePosition.clone();
        
        // Список частей для разброса
        const parts: { mesh: Mesh; name: string; mass: number }[] = [];
        
        // Добавляем основные части
        if (tank.chassis && !tank.chassis.isDisposed()) {
            parts.push({ mesh: tank.chassis, name: "chassis", mass: 2000 });
        }
        if (tank.turret && !tank.turret.isDisposed()) {
            parts.push({ mesh: tank.turret, name: "turret", mass: 500 });
        }
        if (tank.barrel && !tank.barrel.isDisposed()) {
            parts.push({ mesh: tank.barrel, name: "barrel", mass: 200 });
        }
        
        // Добавляем гусеницы, если есть
        if ((tank as any).leftTrack && !(tank as any).leftTrack.isDisposed()) {
            parts.push({ mesh: (tank as any).leftTrack, name: "leftTrack", mass: 300 });
        }
        if ((tank as any).rightTrack && !(tank as any).rightTrack.isDisposed()) {
            parts.push({ mesh: (tank as any).rightTrack, name: "rightTrack", mass: 300 });
        }
        
        // Разбрасываем каждую часть
        for (const part of parts) {
            const mesh = part.mesh;
            
            // Отделяем от родителя, сохраняя мировую позицию
            const worldPos = mesh.absolutePosition.clone();
            const worldRot = mesh.absoluteRotationQuaternion ? mesh.absoluteRotationQuaternion.clone() : null;
            mesh.setParent(null);
            mesh.position.copyFrom(worldPos);
            if (worldRot) {
                mesh.rotationQuaternion = worldRot;
            }
            
            // Создаем физическое тело для части
            try {
                // Определяем форму в зависимости от типа части
                let shapeType: PhysicsShapeType;
                let shapeParams: any;
                
                if (part.name === "barrel") {
                    // Пушка - цилиндр
                    shapeType = PhysicsShapeType.CYLINDER;
                    shapeParams = {
                        radius: 0.15,
                        height: 2.5
                    };
                } else {
                    // Остальное - бокс
                    shapeType = PhysicsShapeType.BOX;
                    const boundingInfo = mesh.getBoundingInfo();
                    const size = boundingInfo.boundingBox.extendSizeWorld.scale(2);
                    shapeParams = {
                        center: Vector3.Zero(),
                        size: size
                    };
                }
                
                const shape = new PhysicsShape({
                    type: shapeType,
                    parameters: shapeParams
                }, scene);
                
                const partBody = new PhysicsBody(mesh, PhysicsMotionType.DYNAMIC, false, scene);
                partBody.shape = shape;
                partBody.setMassProperties({ mass: part.mass });
                partBody.setLinearDamping(0.3);
                partBody.setAngularDamping(0.5);
                
                // Применяем случайную силу разброса
                const direction = new Vector3(
                    (Math.random() - 0.5) * 2,
                    Math.random() * 0.5 + 0.5, // Вверх
                    (Math.random() - 0.5) * 2
                ).normalize();
                
                const force = direction.scale(8000 + Math.random() * 4000); // Сила разброса
                const torque = new Vector3(
                    (Math.random() - 0.5) * 5000,
                    (Math.random() - 0.5) * 5000,
                    (Math.random() - 0.5) * 5000
                );
                
                partBody.applyImpulse(force, mesh.absolutePosition);
                // Применяем вращение через угловую скорость
                partBody.setAngularVelocity(torque.scale(0.01));
                
                // Сохраняем информацию о части для последующей сборки
                const originalParent = mesh.parent as Mesh | null;
                const originalLocalPos = originalParent ? mesh.position.clone() : Vector3.Zero();
                const originalLocalRot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;
                
                this.destroyedParts.push({
                    mesh: mesh,
                    name: part.name,
                    originalParent: originalParent,
                    originalLocalPos: originalLocalPos,
                    originalLocalRot: originalLocalRot,
                    physicsBody: partBody
                });
                
            } catch (error) {
                console.error(`[TankHealth] Failed to create destruction physics for ${part.name}:`, error);
            }
        }
        
        // Отключаем основное физическое тело танка (но не удаляем, нужно для респавна)
        if (tank.physicsBody) {
            tank.physicsBody.dispose();
            (tank as any).physicsBody = null; // Временно обнуляем, восстановим при респавне
        }
    }
    
    /**
     * Анимирует сборку танка обратно - возвращает все части на места за 1 секунду
     */
    public animateReassembly(respawnPos: Vector3, onComplete?: () => void): void {
        if (this.destroyedParts.length === 0) {
            // Если частей нет, просто восстанавливаем физику
            this.restoreTankPhysics(respawnPos);
            if (onComplete) onComplete();
            return;
        }
        
        const tank = this.tank;
        const duration = 1000; // 1 секунда
        const startTime = Date.now();
        
        // Сохраняем начальные позиции всех частей
        const startPositions = this.destroyedParts.map(part => part.mesh.position.clone());
        const startRotations = this.destroyedParts.map(part => 
            part.mesh.rotationQuaternion ? part.mesh.rotationQuaternion.clone() : Quaternion.Identity()
        );
        
        // Вычисляем целевые позиции и вращения
        const targetPositions: Vector3[] = [];
        const targetRotations: Quaternion[] = [];
        
        for (const part of this.destroyedParts) {
            if (part.originalParent) {
                // Если часть была дочерней, вычисляем мировую позицию относительно нового родителя
                const targetWorldPos = respawnPos.add(part.originalLocalPos);
                targetPositions.push(targetWorldPos);
            } else {
                // Если часть была корневой (chassis), используем позицию респавна
                targetPositions.push(respawnPos.clone());
            }
            
            targetRotations.push(part.originalLocalRot || Quaternion.Identity());
        }
        
        // Анимация
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            
            // Используем ease-out для плавности
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            
            // Анимируем каждую часть
            for (let i = 0; i < this.destroyedParts.length; i++) {
                const part = this.destroyedParts[i]!;
                const startPos = startPositions[i]!;
                const targetPos = targetPositions[i]!;
                const startRot = startRotations[i]!;
                const targetRot = targetRotations[i]!;
                
                // Интерполируем позицию
                const currentPos = Vector3.Lerp(startPos, targetPos, easedProgress);
                part.mesh.position.copyFrom(currentPos);
                
                // Интерполируем вращение
                const currentRot = Quaternion.Slerp(startRot, targetRot, easedProgress);
                part.mesh.rotationQuaternion = currentRot;
            }
            
            if (progress < 1.0) {
                requestAnimationFrame(animate);
            } else {
                // Анимация завершена - восстанавливаем структуру
                this.finishReassembly(respawnPos);
                if (onComplete) onComplete();
            }
        };
        
        animate();
    }
    
    /**
     * Завершает сборку - восстанавливает родительские связи и физику
     */
    private finishReassembly(respawnPos: Vector3): void {
        const tank = this.tank;
        
        // Восстанавливаем родительские связи и позиции
        for (const part of this.destroyedParts) {
            // Удаляем временное физическое тело
            if (part.physicsBody) {
                part.physicsBody.dispose();
            }
            
            // Восстанавливаем родительскую связь
            if (part.originalParent && !part.originalParent.isDisposed()) {
                part.mesh.setParent(part.originalParent);
                part.mesh.position.copyFrom(part.originalLocalPos);
                if (part.originalLocalRot) {
                    part.mesh.rotationQuaternion = part.originalLocalRot.clone();
                }
            } else if (part.name === "chassis") {
                // Chassis - корневой элемент, устанавливаем позицию респавна
                part.mesh.position.copyFrom(respawnPos);
                part.mesh.rotationQuaternion = Quaternion.Identity();
            }
        }
        
        // Очищаем список разрушенных частей
        this.destroyedParts = [];
        
        // Восстанавливаем физику танка
        this.restoreTankPhysics(respawnPos);
    }
    
    /**
     * Восстанавливает физическое тело танка
     */
    private restoreTankPhysics(respawnPos: Vector3): void {
        const tank = this.tank;
        
        // Восстанавливаем физическое тело, если его нет
        if (!tank.physicsBody && tank.chassis) {
            // Создаем новое физическое тело (используем ту же логику, что и при создании танка)
            const chassisShape = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: {
                    center: Vector3.Zero(),
                    extents: new Vector3(2, 1, 3)
                }
            }, tank.scene);
            
            tank.physicsBody = new PhysicsBody(tank.chassis, PhysicsMotionType.DYNAMIC, false, tank.scene);
            tank.physicsBody.shape = chassisShape;
            tank.physicsBody.setMassProperties({ mass: 3000 });
            tank.physicsBody.setLinearDamping(0.8);
            tank.physicsBody.setAngularDamping(4.0);
        }
        
        // Устанавливаем позицию и сбрасываем скорости
        if (tank.physicsBody && tank.chassis) {
            tank.chassis.position.copyFrom(respawnPos);
            tank.chassis.rotationQuaternion = Quaternion.Identity();
            tank.chassis.computeWorldMatrix(true);
            
            tank.physicsBody.setTargetTransform(respawnPos, Quaternion.Identity());
            tank.physicsBody.setLinearVelocity(Vector3.Zero());
            tank.physicsBody.setAngularVelocity(Vector3.Zero());
        }
    }
}

