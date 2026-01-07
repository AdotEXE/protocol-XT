// Модуль управления здоровьем, топливом и неуязвимостью танка
import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeType, PhysicsShapeContainer, Quaternion } from "@babylonjs/core";
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
        
        // СУПЕР: Щит ПОЛНОСТЬЮ блокирует урон!
        if (this.tank.chassisAnimationElements?.shieldActive) {
            const blockedDamage = amount;
            amount = Math.round(amount * TANK_CONSTANTS.SHIELD_DAMAGE_REDUCTION);
            
            // Если щит полностью блокирует урон, показываем визуальный эффект и выходим
            if (amount <= 0) {
                console.log(`[SHIELD] 🛡️ Щит полностью заблокировал ${blockedDamage} урона!`);
                
                // Визуальный эффект блокировки щита
                if (this.tank.hud) {
                    this.tank.hud.showShieldBlock(blockedDamage);
                }
                
                // Звук блокировки щита
                if (this.tank.soundManager) {
                    this.tank.soundManager.playHit("armor", this.tank.chassis?.position || Vector3.Zero());
                }
                
                // Создаём визуальный эффект на щите
                if (this.tank.effectsManager && this.tank.chassis) {
                    const em = this.tank.effectsManager as any;
                    if (typeof em.createShieldHitEffect === "function") {
                        em.createShieldHitEffect(this.tank.chassis.position);
                    } else if (typeof em.createHitSpark === "function") {
                        em.createHitSpark(this.tank.chassis.position);
                    }
                }
                
                return; // Урон полностью заблокирован - не проходит дальше!
            }
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
        
        // ОТКЛЮЧЕНО: Тряска камеры при получении урона (аркадный стиль)
        // if (this.tank.cameraShakeCallback) {
        //     const intensity = Math.min(0.5, finalDamage / 50);
        //     this.tank.cameraShakeCallback(intensity);
        // }
        
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
    
    // Деактивировать защиту от урона (публичный метод для вызова из die())
    deactivateInvulnerability(): void {
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
        
        // ВАЖНО: Сначала удаляем старый эффект если он есть (предотвращаем дублирование)
        if (this.invulnerabilityGlow && !this.invulnerabilityGlow.isDisposed()) {
            this.invulnerabilityGlow.dispose();
            this.invulnerabilityGlow = null;
        }
        
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
        
        // ВАЖНО: Деактивируем неуязвимость при смерти (чтобы голубой элемент не остался)
        if (this.isInvulnerable) {
            this.deactivateInvulnerability();
        }
        
        // Respawn после 4 секунд:
        // 3 секунды обратный отсчёт + 0.5 сек "RESPAWNING..." + 0.5 сек задержка после скрытия экрана смерти
        console.log("[TANK] Scheduling respawn in 4 seconds (after death screen closes)...");
        setTimeout(() => {
            console.log("[TANK] Respawn timer fired!");
            if (!this.tank.isAlive && this.tank.respawn) {
                this.tank.respawn();
            } else {
                console.log("[TANK] Already alive, skipping respawn");
            }
        }, 4000);
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
        
        // Разбрасываем каждую часть - ТОЛЬКО ВИЗУАЛЬНАЯ АНИМАЦИЯ БЕЗ ФИЗИКИ
        for (const part of parts) {
            const mesh = part.mesh;
            
            // ВАЖНО: Сохраняем родителя ДО отсоединения!
            const originalParent = mesh.parent as Mesh | null;
            const originalLocalPos = mesh.position.clone();
            const originalLocalRot = mesh.rotationQuaternion ? mesh.rotationQuaternion.clone() : null;
            
            // Отделяем от родителя, сохраняя мировую позицию
            const worldPos = mesh.absolutePosition.clone();
            const worldRot = mesh.absoluteRotationQuaternion ? mesh.absoluteRotationQuaternion.clone() : null;
            mesh.setParent(null);
            mesh.position.copyFrom(worldPos);
            if (worldRot) {
                mesh.rotationQuaternion = worldRot;
            }
            
            // === ВИЗУАЛЬНАЯ АНИМАЦИЯ РАЗБРОСА (без физики!) ===
            // Рассчитываем направление и скорость разброса
            const direction = new Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 0.5 + 0.5, // Вверх
                (Math.random() - 0.5) * 2
            ).normalize();
            
            const velocity = direction.scale(15 + Math.random() * 10); // Скорость разброса
            const angularVelocity = new Vector3(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );
            
            // Запускаем визуальную анимацию разброса
            this.animatePartScatter(mesh, velocity, angularVelocity, 2000);
            
            // Сохраняем информацию о части для последующей сборки (БЕЗ physicsBody)
            this.destroyedParts.push({
                mesh: mesh,
                name: part.name,
                originalParent: originalParent,
                originalLocalPos: originalLocalPos,
                originalLocalRot: originalLocalRot,
                physicsBody: null as any // Нет физики!
            });
        }
        
        // Отключаем основное физическое тело танка (но не удаляем, нужно для респавна)
        if (tank.physicsBody) {
            tank.physicsBody.dispose();
            (tank as any).physicsBody = null; // Временно обнуляем, восстановим при респавне
        }
    }
    
    /**
     * Визуальная анимация разброса части (без физики)
     */
    private animatePartScatter(mesh: Mesh, velocity: Vector3, angularVelocity: Vector3, duration: number): void {
        const startTime = Date.now();
        const startPos = mesh.position.clone();
        const gravity = -15; // Гравитация
        
        const animate = () => {
            if (mesh.isDisposed()) return;
            
            const elapsed = (Date.now() - startTime) / 1000; // в секундах
            const progress = Math.min(elapsed / (duration / 1000), 1.0);
            
            // Позиция с гравитацией: pos = startPos + vel*t + 0.5*g*t^2
            const newPos = startPos.add(velocity.scale(elapsed));
            newPos.y += 0.5 * gravity * elapsed * elapsed;
            
            // Не даём уйти под землю
            if (newPos.y < 0.1) {
                newPos.y = 0.1;
                velocity.y = 0;
                velocity.x *= 0.9; // Затухание при касании земли
                velocity.z *= 0.9;
            }
            
            mesh.position.copyFrom(newPos);
            
            // Вращение
            if (mesh.rotationQuaternion) {
                const rotDelta = Quaternion.FromEulerAngles(
                    angularVelocity.x * 0.016,
                    angularVelocity.y * 0.016,
                    angularVelocity.z * 0.016
                );
                mesh.rotationQuaternion = mesh.rotationQuaternion.multiply(rotDelta);
            }
            
            // Затухание угловой скорости
            angularVelocity.scaleInPlace(0.98);
            
            // Прозрачность в конце (плавное исчезновение)
            if (progress > 0.7 && mesh.material) {
                const fadeProgress = (progress - 0.7) / 0.3;
                mesh.material.alpha = 1 - fadeProgress * 0.3; // Немного прозрачнее
            }
            
            if (progress < 1.0) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    /**
     * Анимирует сборку танка обратно - телепортирует части в гараж и собирает за 1 секунду
     */
    public animateReassembly(respawnPos: Vector3, onComplete?: () => void): void {
        if (this.destroyedParts.length === 0) {
            // Если частей нет, просто восстанавливаем физику
            this.restoreTankPhysics(respawnPos);
            if (onComplete) onComplete();
            return;
        }
        
        const tank = this.tank;
        const duration = 1000; // 1 секунда анимации сборки
        
        // === ШАГ 1: ТЕЛЕПОРТИРУЕМ ВСЕ ЧАСТИ К ГАРАЖУ (разбросанные вокруг) ===
        const spreadRadius = 8; // Радиус разброса частей вокруг гаража
        const spreadHeight = 4; // Высота разброса
        
        for (let i = 0; i < this.destroyedParts.length; i++) {
            const part = this.destroyedParts[i]!;
            
            // Отключаем физику частей для анимации
            if (part.physicsBody) {
                part.physicsBody.setLinearVelocity(Vector3.Zero());
                part.physicsBody.setAngularVelocity(Vector3.Zero());
            }
            
            // Телепортируем часть к гаражу (случайное положение вокруг)
            const angle = (i / this.destroyedParts.length) * Math.PI * 2;
            const radius = spreadRadius * (0.5 + Math.random() * 0.5);
            const teleportPos = new Vector3(
                respawnPos.x + Math.cos(angle) * radius,
                respawnPos.y + spreadHeight + Math.random() * 2,
                respawnPos.z + Math.sin(angle) * radius
            );
            
            part.mesh.position.copyFrom(teleportPos);
            
            // Случайное начальное вращение
            part.mesh.rotationQuaternion = Quaternion.FromEulerAngles(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
        }
        
        // === ШАГ 2: НЕБОЛЬШАЯ ЗАДЕРЖКА ПЕРЕД СБОРКОЙ (визуальный эффект) ===
        setTimeout(() => {
            this.startAssemblyAnimation(respawnPos, duration, onComplete);
        }, 200); // 200мс задержка для драматичности
    }
    
    /**
     * Запускает анимацию сборки частей
     */
    private startAssemblyAnimation(respawnPos: Vector3, duration: number, onComplete?: () => void): void {
        const startTime = Date.now();
        
        // Сохраняем начальные позиции всех частей (после телепортации)
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
        
        // Анимация сборки с эффектом "притягивания"
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            
            // Используем ease-in-out для плавности (медленный старт, быстрая середина, плавный конец)
            const easedProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Анимируем каждую часть
            for (let i = 0; i < this.destroyedParts.length; i++) {
                const part = this.destroyedParts[i]!;
                const startPos = startPositions[i]!;
                const targetPos = targetPositions[i]!;
                const startRot = startRotations[i]!;
                const targetRot = targetRotations[i]!;
                
                // Интерполируем позицию с небольшим "притягиванием" к центру
                const currentPos = Vector3.Lerp(startPos, targetPos, easedProgress);
                
                // Добавляем эффект "вращения" к центру в начале анимации
                if (progress < 0.3) {
                    const swirl = (0.3 - progress) * 0.5;
                    const offset = new Vector3(
                        Math.sin(elapsed * 0.01 + i) * swirl,
                        Math.cos(elapsed * 0.015 + i * 2) * swirl * 0.5,
                        Math.cos(elapsed * 0.01 + i) * swirl
                    );
                    currentPos.addInPlace(offset);
                }
                
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
        
        // ВАЖНО: Сначала восстанавливаем chassis (корневой элемент)
        const chassisPart = this.destroyedParts.find(p => p.name === "chassis");
        if (chassisPart && chassisPart.mesh && !chassisPart.mesh.isDisposed()) {
            chassisPart.mesh.position.copyFrom(respawnPos);
            chassisPart.mesh.rotationQuaternion = Quaternion.Identity();
            
            // Восстанавливаем прозрачность
            if (chassisPart.mesh.material) {
                chassisPart.mesh.material.alpha = 1;
            }
        }
        
        // Затем восстанавливаем turret (привязан к chassis)
        const turretPart = this.destroyedParts.find(p => p.name === "turret");
        if (turretPart && turretPart.mesh && !turretPart.mesh.isDisposed()) {
            turretPart.mesh.setParent(tank.chassis);
            turretPart.mesh.position.copyFrom(turretPart.originalLocalPos);
            if (turretPart.originalLocalRot) {
                turretPart.mesh.rotationQuaternion = turretPart.originalLocalRot.clone();
            } else {
                turretPart.mesh.rotationQuaternion = Quaternion.Identity();
            }
            
            // Восстанавливаем прозрачность
            if (turretPart.mesh.material) {
                turretPart.mesh.material.alpha = 1;
            }
        }
        
        // Затем barrel (привязан к turret)
        const barrelPart = this.destroyedParts.find(p => p.name === "barrel");
        if (barrelPart && barrelPart.mesh && !barrelPart.mesh.isDisposed()) {
            barrelPart.mesh.setParent(tank.turret);
            barrelPart.mesh.position.copyFrom(barrelPart.originalLocalPos);
            if (barrelPart.originalLocalRot) {
                barrelPart.mesh.rotationQuaternion = barrelPart.originalLocalRot.clone();
            } else {
                barrelPart.mesh.rotationQuaternion = Quaternion.Identity();
            }
            
            // Восстанавливаем прозрачность
            if (barrelPart.mesh.material) {
                barrelPart.mesh.material.alpha = 1;
            }
        }
        
        // Гусеницы (привязаны к chassis)
        for (const part of this.destroyedParts) {
            if ((part.name === "leftTrack" || part.name === "rightTrack") && 
                part.mesh && !part.mesh.isDisposed()) {
                part.mesh.setParent(tank.chassis);
                part.mesh.position.copyFrom(part.originalLocalPos);
                if (part.originalLocalRot) {
                    part.mesh.rotationQuaternion = part.originalLocalRot.clone();
                }
                
                // Восстанавливаем прозрачность
                if (part.mesh.material) {
                    part.mesh.material.alpha = 1;
                }
            }
        }
        
        // Очищаем список разрушенных частей
        this.destroyedParts = [];
        
        // Восстанавливаем физику танка
        this.restoreTankPhysics(respawnPos);
    }
    
    /**
     * Восстанавливает физическое тело танка с РЕАЛИСТИЧНЫМ ГУСЕНИЧНЫМ ХИТБОКСОМ
     */
    private restoreTankPhysics(respawnPos: Vector3): void {
        const tank = this.tank;
        
        // Восстанавливаем физическое тело, если его нет
        if (!tank.physicsBody && tank.chassis) {
            // Используем размеры из типа шасси танка
            const chassisWidth = tank.chassisType.width;
            const chassisHeight = tank.chassisType.height;
            const chassisDepth = tank.chassisType.depth;
            
            // Compound shape: центральный BOX + скруглённые CYLINDER спереди и сзади
            const chassisShape = new PhysicsShapeContainer(tank.scene);
            
            // Размеры для скруглённых краёв гусениц
            const cylinderRadius = chassisHeight * 0.45;
            const cylinderOffset = chassisDepth * 0.42;
            const chassisLowering = -chassisHeight * 0.1;
            
            // 1. Центральный BOX (укороченный, без острых углов)
            const centerBox = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: {
                    center: new Vector3(0, chassisLowering, 0),
                    rotation: Quaternion.Identity(),
                    extents: new Vector3(chassisWidth, chassisHeight * 0.7, chassisDepth * 0.7)
                }
            }, tank.scene);
            centerBox.material = { friction: 0.1, restitution: 0.0 };
            chassisShape.addChildFromParent(tank.chassis, centerBox, tank.chassis);
            
            // 2. Передний CYLINDER (скруглённый край)
            const frontCylinder = new PhysicsShape({
                type: PhysicsShapeType.CYLINDER,
                parameters: {
                    pointA: new Vector3(-chassisWidth * 0.5, chassisLowering, cylinderOffset),
                    pointB: new Vector3(chassisWidth * 0.5, chassisLowering, cylinderOffset),
                    radius: cylinderRadius
                }
            }, tank.scene);
            frontCylinder.material = { friction: 0.15, restitution: 0.0 };
            chassisShape.addChildFromParent(tank.chassis, frontCylinder, tank.chassis);
            
            // 3. Задний CYLINDER (скруглённый край)
            const backCylinder = new PhysicsShape({
                type: PhysicsShapeType.CYLINDER,
                parameters: {
                    pointA: new Vector3(-chassisWidth * 0.5, chassisLowering, -cylinderOffset),
                    pointB: new Vector3(chassisWidth * 0.5, chassisLowering, -cylinderOffset),
                    radius: cylinderRadius
                }
            }, tank.scene);
            backCylinder.material = { friction: 0.15, restitution: 0.0 };
            chassisShape.addChildFromParent(tank.chassis, backCylinder, tank.chassis);
            
            chassisShape.filterMembershipMask = 1;
            chassisShape.filterCollideMask = 2 | 32;
            
            tank.physicsBody = new PhysicsBody(tank.chassis, PhysicsMotionType.DYNAMIC, false, tank.scene);
            tank.physicsBody.shape = chassisShape;
            tank.physicsBody.setMassProperties({ 
                mass: tank.chassisType.mass || 3000, 
                centerOfMass: new Vector3(0, -0.55, -0.3) 
            });
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

