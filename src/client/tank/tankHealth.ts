// Модуль управления здоровьем, топливом и неуязвимостью танка
import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeType, PhysicsShapeContainer, Quaternion, Ray } from "@babylonjs/core";
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
    
    // Позиция смерти танка (для плавной анимации камеры)
    private deathPosition: Vector3 | null = null;
    
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
            
            // Показываем плавающее число полученного урона над танком игрока
            if (this.tank.chassis) {
                const damagePos = this.tank.chassis.position.clone();
                damagePos.y += 3; // Немного выше танка
                const isCritical = finalDamage >= 50;
                this.tank.hud.showDamageNumber(damagePos, finalDamage, 'received', isCritical);
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
        // Визуальный эффект отключен - голубой кружок больше не отображается
        // Логика неуязвимости продолжает работать
        if (this.invulnerabilityGlow && !this.invulnerabilityGlow.isDisposed()) {
            this.invulnerabilityGlow.dispose();
            this.invulnerabilityGlow = null;
        }
    }
    
    // Обновить таймер защиты (вызывается каждый кадр)
    updateInvulnerability(): void {
        if (!this.isInvulnerable) return;
        
        const elapsed = Date.now() - this.invulnerabilityStartTime;
        const timeLeft = this.invulnerabilityDuration - elapsed;
        
        if (timeLeft <= 0) {
            this.deactivateInvulnerability();
        } else {
            // Визуальный эффект отключен - обновление позиции не требуется
            
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
        
        // КРИТИЧНО: Сохраняем позицию смерти для плавной анимации камеры
        if (this.tank.chassis) {
            this.deathPosition = this.tank.chassis.position.clone();
            console.log(`[TANK] Death position saved: (${this.deathPosition.x.toFixed(2)}, ${this.deathPosition.y.toFixed(2)}, ${this.deathPosition.z.toFixed(2)})`);
        }
        
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
        
        // Show death message with callback for garage respawn
        // После 3 секунд обратного отсчёта будет вызван startGarageRespawn()
        if (this.tank.hud) {
            this.tank.hud.showDeathMessage(() => {
                this.startGarageRespawn();
            });
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
        
        // НОВЫЙ ПОРЯДОК: Показываем экран смерти на 3 секунды,
        // затем телепортируем в гараж и запускаем анимацию сборки
        // Callback будет вызван из HUD после 3 секунд обратного отсчёта
        console.log("[TANK] Death screen will be shown for 3 seconds, then respawn in garage");
    }
    
    /**
     * Плавно анимирует камеру от точки смерти к точке респавна
     * @param targetPos - целевая позиция респавна (точка B)
     * @param duration - длительность анимации в мс (по умолчанию 1500мс)
     * @param onComplete - callback после завершения анимации
     */
    private animateCameraToPosition(targetPos: Vector3, duration: number = 1500, onComplete?: () => void): void {
        const game = (window as any).gameInstance;
        if (!game || !game.camera) {
            if (onComplete) onComplete();
            return;
        }
        
        const camera = game.camera;
        
        // КРИТИЧНО: Начальная позиция - точка смерти (точка A)
        // Если позиция смерти не сохранена, используем текущую позицию камеры
        const startPos = this.deathPosition 
            ? this.deathPosition.clone() 
            : (this.tank.chassis ? this.tank.chassis.position.clone() : camera.position.clone());
        
        // Начальная позиция камеры и target
        const startCameraPos = camera.position.clone();
        const startTarget = camera.getTarget().clone();
        
        // Конечная позиция камеры - немного выше и сзади точки респавна
        // Для ArcRotateCamera это будет позиция относительно target
        const endCameraPos = new Vector3(
            targetPos.x - 8,
            targetPos.y + 3,
            targetPos.z - 8
        );
        
        // Конечная target - точка респавна
        const endTarget = targetPos.clone();
        
        const startTime = Date.now();
        
        // КРИТИЧНО: Блокируем updateCamera на время анимации (предотвращает дёрганья)
        game.isCameraAnimating = true;
        
        console.log(`[TANK] Starting smooth camera transition from death (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}) to respawn (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            
            // Ease-in-out для плавности (медленно в начале и конце, быстро в середине)
            const eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Плавно перемещаем target камеры от точки A к точке B
            const currentTarget = Vector3.Lerp(startTarget, endTarget, eased);
            camera.setTarget(currentTarget);
            
            // Плавно перемещаем позицию камеры от точки A к точке B
            // Для ArcRotateCamera используем setPosition, который автоматически пересчитает углы
            const currentCameraPos = Vector3.Lerp(startCameraPos, endCameraPos, eased);
            if (camera.setPosition) {
                camera.setPosition(currentCameraPos);
            } else {
                camera.position.copyFrom(currentCameraPos);
            }
            
            if (progress < 1.0) {
                requestAnimationFrame(animate);
            } else {
                console.log("[TANK] Camera transition complete");
                // Разблокируем updateCamera
                game.isCameraAnimating = false;
                // Очищаем сохранённую позицию смерти
                this.deathPosition = null;
                if (onComplete) onComplete();
            }
        };
        
        animate();
    }
    
    /**
     * Телепортирует камеру и части танка в гараж, запускает анимацию сборки.
     * Вызывается из HUD после 3 секунд обратного отсчёта на экране смерти.
     */
    public startGarageRespawn(): void {
        console.log("[TANK] Starting garage respawn sequence...");
        
        // Получаем позицию респавна (гараж или случайная безопасная позиция)
        let respawnPos: Vector3;
        let hasGarage = false;
        
        if (this.tank.respawnPositionCallback) {
            const garagePos = this.tank.respawnPositionCallback();
            if (garagePos) {
                respawnPos = garagePos.clone();
                hasGarage = true;
                console.log("[TANK] Respawning in garage");
            } else {
                // Гаража нет - случайная безопасная позиция
                respawnPos = this.findSafeRandomSpawnPosition();
                console.log("[TANK] No garage found, using random safe spawn");
            }
        } else {
            // Нет callback - случайная безопасная позиция
            respawnPos = this.findSafeRandomSpawnPosition();
            console.log("[TANK] No respawn callback, using random safe spawn");
        }
        
        // Вычисляем правильную высоту
        const game = (window as any).gameInstance;
        let targetY = respawnPos.y;
        if (game && typeof game.getGroundHeight === 'function') {
            const groundHeight = game.getGroundHeight(respawnPos.x, respawnPos.z);
            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            targetY = groundHeight + 1.0;
            console.log(`[TANK] Spawn height: Y=${targetY.toFixed(2)} (ground: ${groundHeight.toFixed(2)}, hasGarage: ${hasGarage})`);
        }
        
        // Целевая позиция для камеры (где будет танк)
        const cameraTarget = new Vector3(respawnPos.x, targetY + 1, respawnPos.z);
        
        // ШАГ 1: Телепортируем части вокруг целевой позиции (ДО анимации камеры)
        this.teleportPartsAroundTarget(respawnPos, targetY);
        
        // ШАГ 2: Запускаем ПЛАВНУЮ анимацию камеры к целевой позиции
        // После завершения анимации камеры - запускаем анимацию сборки
        this.animateCameraToPosition(cameraTarget, 1500, () => {
            console.log("[TANK] Camera arrived at spawn, starting assembly...");
            
            // ШАГ 3: Телепортируем chassis в целевую позицию (чтобы камера следила за ним)
            if (this.tank.chassis) {
                this.tank.chassis.position.set(respawnPos.x, targetY, respawnPos.z);
                this.tank.chassis.rotationQuaternion = Quaternion.Identity();
                this.tank.chassis.rotation.set(0, 0, 0);
                this.tank.chassis.computeWorldMatrix(true);
            }
            
            // Устанавливаем флаг что части телепортированы
            (this.tank as any)._wasTeleportedToGarage = true;
            
            // ШАГ 4: Небольшая пауза, затем анимация сборки
            setTimeout(() => {
                if (!this.tank.isAlive && this.tank.respawn) {
                    console.log("[TANK] Starting assembly animation...");
                    this.tank.respawn();
                }
            }, 200);
        });
    }
    
    /**
     * Телепортирует разрушенные части вокруг целевой позиции для анимации сборки
     */
    private teleportPartsAroundTarget(respawnPos: Vector3, targetY: number): void {
        if (!this.destroyedParts || this.destroyedParts.length === 0) {
            console.log("[TANK] No destroyed parts to teleport");
            return;
        }
        
        const spreadRadius = 8; // Радиус разброса частей
        const spreadHeight = 6; // Высота разброса над полом
        
        console.log(`[TANK] Teleporting ${this.destroyedParts.length} parts around spawn point...`);
        
        for (let i = 0; i < this.destroyedParts.length; i++) {
            const part = this.destroyedParts[i]!;
            
            // Отключаем физику частей для анимации
            if (part.physicsBody) {
                part.physicsBody.setLinearVelocity(Vector3.Zero());
                part.physicsBody.setAngularVelocity(Vector3.Zero());
            }
            
            // Равномерно распределяем части по кругу
            const angle = (i / this.destroyedParts.length) * Math.PI * 2;
            const radius = spreadRadius * (0.8 + Math.random() * 0.4);
            const teleportPos = new Vector3(
                respawnPos.x + Math.cos(angle) * radius,
                targetY + spreadHeight + Math.random() * 3,
                respawnPos.z + Math.sin(angle) * radius
            );
            
            part.mesh.position.copyFrom(teleportPos);
            
            // Случайное начальное вращение
            part.mesh.rotationQuaternion = Quaternion.FromEulerAngles(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            );
            
            // КРИТИЧНО: Восстанавливаем видимость и прозрачность ВСЕХ частей
            part.mesh.isVisible = true;
            if (part.mesh.material) {
                (part.mesh.material as any).alpha = 1;
            }
            
            console.log(`[TANK] Part ${part.name} teleported to (${teleportPos.x.toFixed(2)}, ${teleportPos.y.toFixed(2)}, ${teleportPos.z.toFixed(2)})`);
        }
    }
    
    /**
     * Находит случайную безопасную позицию для респавна (если гаража нет)
     * Танк спавнится на ВЕРХНЕЙ поверхности (крыша здания или террейн)
     */
    private findSafeRandomSpawnPosition(): Vector3 {
        const game = (window as any).gameInstance;
        
        // Используем новую функцию из Game для спавна на верхней поверхности
        if (game && typeof game.findSafeSpawnPosition === 'function') {
            const safePos = game.findSafeSpawnPosition(0, 0, 50, 200, 1);
            console.log(`[TANK] Spawn on top surface via Game: (${safePos.x.toFixed(2)}, ${safePos.y.toFixed(2)}, ${safePos.z.toFixed(2)})`);
            return safePos;
        }
        
        // Fallback: генерируем позицию и находим верхнюю поверхность
        const mapRadius = 200;
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * (mapRadius - 50);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        // Получаем высоту верхней поверхности
        let surfaceY = 5;
        if (game && typeof game.getTopSurfaceHeight === 'function') {
            surfaceY = game.getTopSurfaceHeight(x, z);
        } else if (game && typeof game.getGroundHeight === 'function') {
            surfaceY = game.getGroundHeight(x, z);
        } else {
            // Используем локальный raycast
            surfaceY = this.getTopSurfaceHeightLocal(x, z);
        }
        
        const spawnY = surfaceY + 1.5;
        console.log(`[TANK] Spawn on top surface: (${x.toFixed(2)}, ${spawnY.toFixed(2)}, ${z.toFixed(2)})`);
        return new Vector3(x, spawnY, z);
    }
    
    /**
     * Локальный метод получения высоты САМОЙ ВЕРХНЕЙ поверхности
     * Использует multiPickWithRay для нахождения крыши
     */
    private getTopSurfaceHeightLocal(x: number, z: number): number {
        // Raycast сверху вниз чтобы найти ВСЕ поверхности
        const rayStart = new Vector3(x, 200, z);
        const ray = new Ray(rayStart, new Vector3(0, -1, 0), 250);
        
        const hits = this.tank.scene.multiPickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const name = mesh.name.toLowerCase();
            
            // Пропускаем служебные меши
            if (name.includes("trigger") || 
                name.includes("collider") || 
                name.includes("invisible") ||
                name.includes("skybox") ||
                name.includes("bullet") ||
                name.includes("projectile")) {
                return false;
            }
            
            return true;
        });
        
        if (hits && hits.length > 0) {
            // Находим САМУЮ ВЫСОКУЮ точку (крышу)
            let maxHeight = -Infinity;
            for (const hit of hits) {
                if (hit.hit && hit.pickedPoint && hit.pickedPoint.y > maxHeight) {
                    maxHeight = hit.pickedPoint.y;
                }
            }
            if (maxHeight > -Infinity) {
                return maxHeight;
            }
        }
        
        return 5; // Fallback
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
        const duration = 1500; // ИСПРАВЛЕНО: 1.5 секунды анимации сборки
        
        // КРИТИЧНО: Если танк уже был телепортирован в гараж (через startGarageRespawn), 
        // просто запускаем анимацию сборки без дополнительного телепорта частей
        // НЕ сбрасываем флаг здесь - он нужен для completeRespawn чтобы не пересчитывать позицию
        const wasTeleported = (tank as any)._wasTeleportedToGarage;
        if (wasTeleported) {
            // Танк уже в гараже - запускаем анимацию сразу
            this.startAssemblyAnimation(respawnPos, duration, onComplete);
            return;
        }
        
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
        
        // Находим части по именам для правильного вычисления иерархии
        const chassisPart = this.destroyedParts.find(p => p.name === "chassis");
        const turretPart = this.destroyedParts.find(p => p.name === "turret");
        
        // Вычисляем целевые позиции с учётом иерархии: chassis → turret → barrel
        const targetPositions: Vector3[] = [];
        const targetRotations: Quaternion[] = [];
        
        for (const part of this.destroyedParts) {
            let targetWorldPos: Vector3;
            
            if (part.name === "chassis") {
                // Chassis - корневой элемент, позиция = respawnPos
                targetWorldPos = respawnPos.clone();
            } else if (part.name === "turret") {
                // Turret - дочерний к chassis
                targetWorldPos = respawnPos.add(part.originalLocalPos);
            } else if (part.name === "barrel") {
                // Barrel - дочерний к turret, нужно учитывать позицию turret
                if (turretPart) {
                    const turretWorldPos = respawnPos.add(turretPart.originalLocalPos);
                    targetWorldPos = turretWorldPos.add(part.originalLocalPos);
                } else {
                    targetWorldPos = respawnPos.add(part.originalLocalPos);
                }
            } else if (part.name === "leftTrack" || part.name === "rightTrack") {
                // Гусеницы - дочерние к chassis
                targetWorldPos = respawnPos.add(part.originalLocalPos);
            } else {
                // Fallback для других частей
                targetWorldPos = respawnPos.clone();
            }
            
            targetPositions.push(targetWorldPos);
            
            // КРИТИЧНО: Для башни и ствола целевое вращение = Identity (фикс бага с залипанием башни после респавна)
            // Для остальных частей (chassis, tracks) можно использовать оригинальное вращение
            if (part.name === "turret" || part.name === "barrel") {
                targetRotations.push(Quaternion.Identity());
            } else {
                targetRotations.push(part.originalLocalRot || Quaternion.Identity());
            }
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
                
                // Интерполируем позицию плавно (без swirl эффекта - он мешает)
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
            // КРИТИЧНО: Всегда сбрасываем вращение башни на Identity (фикс бага с залипанием башни после респавна)
            // completeRespawn также сбросит вращение, но делаем это здесь для надёжности
            turretPart.mesh.rotationQuaternion = Quaternion.Identity();
            turretPart.mesh.rotation.set(0, 0, 0);
            
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
            // КРИТИЧНО: Всегда сбрасываем вращение ствола на Identity (фикс бага с залипанием башни после респавна)
            barrelPart.mesh.rotationQuaternion = Quaternion.Identity();
            barrelPart.mesh.rotation.set(0, 0, 0);
            
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

