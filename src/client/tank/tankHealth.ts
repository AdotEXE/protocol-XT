
// Модуль управления здоровьем, топливом и неуязвимостью танка
import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3, PhysicsBody, PhysicsMotionType, PhysicsShape, PhysicsShapeType, PhysicsShapeContainer, Quaternion, Ray } from "@babylonjs/core";
import type { ITankController } from "./types";
import { TANK_CONSTANTS } from "./constants";
import { CHASSIS_SIZE_MULTIPLIERS } from "./tankChassis";
import { tankLogger } from "../utils/logger";

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

        // EVASION CHECK (Miss chance)
        if (this.tank.evasion > 0) {
            const hitChance = Math.random() * 100;
            if (hitChance < this.tank.evasion) {
                // AVODED!
                if (this.tank.hud && this.tank.chassis) {
                    const missPos = this.tank.chassis.position.clone().add(new Vector3(0, 2, 0));
                    this.tank.hud.showDamageNumber(missPos, 0, 'received', false);
                }
                return;
            }
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


            // УЛУЧШЕНО: Показываем экранную вспышку вместо объёмного эффекта, если известна позиция атакующего
            if (attackerPosition && this.tank.chassis) {
                const playerPos = this.tank.chassis.position;
                // Calculate direction FROM player TO attacker (Source)
                // Calculate direction (legacy, now handled in DamageIndicator)
                // const damageDir = attackerPosition.subtract(playerPos);

                // We need Camera Forward for UI relative rotation
                let playerForward: Vector3 | undefined;
                if (this.tank.scene?.activeCamera) {
                    playerForward = this.tank.scene.activeCamera.getForwardRay().direction;
                }

                // Pass directional data to HUD
                // ИСПРАВЛЕНО: Передаём абсолютную позицию атакующего для Compass-индикатора
                // hud.damage ожидает sourcePosition (ранее damageDir)
                this.tank.hud.damage(finalDamage, attackerPosition);
            } else {
                // Fallback for non-directional damage
                this.tank.hud.damage(finalDamage);
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

        // Вибрация при получении урона (мобильные устройства)
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
                const { getHapticFeedback } = require('./mobile');
                getHapticFeedback().damage();
            } catch (e) {
                // Игнорируем ошибки если модуль не загружен
            }
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

    /**
     * Set health directly (used for synchronization)
     */
    setHealth(current: number, max: number) {
        this.tank.maxHealth = max;
        this.tank.currentHealth = Math.max(0, Math.min(current, max));

        // Update HUD
        if (this.tank.hud) {
            this.tank.hud.updateHealth(this.tank.currentHealth, this.tank.maxHealth);
        }

        // Check for death if health dropped to 0
        if (this.tank.currentHealth <= 0 && this.tank.isAlive) {
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
            let fuelRate = this.tank.fuelConsumptionRate || TANK_CONSTANTS.FUEL_CONSUMPTION_RATE;

            // Apply Fuel Efficiency Bonus
            if (this.tank.fuelEfficiencyBonus > 0) {
                fuelRate *= (1 - this.tank.fuelEfficiencyBonus / 100);
            }

            this.tank.currentFuel -= fuelRate * deltaTime;
            if (this.tank.currentFuel <= 0) {
                this.tank.currentFuel = 0;
                this.tank.isFuelEmpty = true;
                tankLogger.warn("[TANK] Out of fuel!");
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

    // Обновить таймер защиты и пассивный ремонт (вызывается каждый кадр)
    update(deltaTime: number): void {
        this.updateInvulnerability();
        this.updatePassiveRepair(deltaTime);
        this.updateDamageSmoke(deltaTime);
    }

    // Phase 3.2: Прогрессивный дым повреждений для самолётов
    private _damageSmokeTimer: number = 0;
    private updateDamageSmoke(deltaTime: number): void {
        if (!this.tank.isAlive || !this.tank.chassis || !this.tank.effectsManager) return;

        const isPlane = (this.tank as any).chassisType?.id === "plane" ||
            ((this.tank as any).chassisType && typeof (this.tank as any).chassisType === 'object' &&
                (this.tank as any).chassisType?.id?.includes?.("plane"));
        if (!isPlane) return;

        this._damageSmokeTimer += deltaTime;
        const hpPercent = (this.tank.currentHealth / this.tank.maxHealth) * 100;
        const pos = this.tank.chassis.position;
        const em = this.tank.effectsManager as any;

        // HP < 20%: огонь (каждые 0.1с)
        if (hpPercent < 20 && this._damageSmokeTimer > 0.1) {
            this._damageSmokeTimer = 0;
            if (typeof em.createFire === 'function') em.createFire(pos.clone(), 200);
            if (typeof em.createDamageSmoke === 'function') em.createDamageSmoke(pos.clone());
        }
        // HP < 40%: густой дым (каждые 0.15с)
        else if (hpPercent < 40 && this._damageSmokeTimer > 0.15) {
            this._damageSmokeTimer = 0;
            if (typeof em.createDamageSmoke === 'function') em.createDamageSmoke(pos.clone());
            if (typeof em.createDamageSmoke === 'function') em.createDamageSmoke(pos.clone());
        }
        // HP < 75%: лёгкий дым (каждые 0.3с)
        else if (hpPercent < 75 && this._damageSmokeTimer > 0.3) {
            this._damageSmokeTimer = 0;
            if (typeof em.createDamageSmoke === 'function') em.createDamageSmoke(pos.clone());
        }
    }

    private updatePassiveRepair(deltaTime: number): void {
        if (!this.tank.isAlive || this.tank.currentHealth >= this.tank.maxHealth || this.tank.repairRate <= 0) return;

        const healAmount = this.tank.repairRate * deltaTime;
        this.tank.currentHealth = Math.min(this.tank.maxHealth, this.tank.currentHealth + healAmount);

        // Update HUD periodically or if change is significant? 
        // For smooth bars, updating every frame is fine if HUD handles it well.
        if (this.tank.hud) {
            this.tank.hud.updateHealth(this.tank.currentHealth, this.tank.maxHealth);
        }
    }

    public updateInvulnerability(): void {
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

    die(customRespawnCallback?: () => void) {
        if (!this.tank.isAlive) return; // Уже мёртв

        this.tank.isAlive = false;
        console.log("[TANK] Destroyed!");

        // Вибрация при смерти (мобильные устройства)
        if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
                const { getHapticFeedback } = require('./mobile');
                getHapticFeedback().death();
            } catch (e) {
                // Игнорируем ошибки если модуль не загружен
            }
        }

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

        // Show death message with callback
        // После 1 секунды задержки показываем экран смерти
        setTimeout(() => {
            if (this.tank.hud) {
                // Запускаем фейд частей за 1 секунду до конца таймера (таймер 3 сек, значит через 2 сек)
                setTimeout(() => {
                    this.fadeDestroyedParts(1000);
                }, 2000);

                this.tank.hud.showDeathMessage(() => {
                    if (customRespawnCallback) {
                        customRespawnCallback();
                    } else {
                        this.startGarageRespawn();
                    }
                });
            }
        }, 1000);

        // Record death in player progression
        if (this.tank.playerProgression) {
            this.tank.playerProgression.recordDeath();
        }

        // Сбрасываем серию убийств в системе опыта
        if (this.tank.experienceSystem) {
            this.tank.experienceSystem.recordDeath();
        }

        // ВАЖНО: Деактивируем неуязвимость при смерти
        if (this.isInvulnerable) {
            this.deactivateInvulnerability();
        }

        console.log("[TANK] Death sequence initiated");
    }

    /**
     * Плавно скрывает разрушенные части танка (фейд в прозрачность)
     */
    private fadeDestroyedParts(duration: number): void {
        console.log("[TANK] Fading out destroyed parts...");
        const startTime = Date.now();

        const animateFade = () => {
            const progress = Math.min((Date.now() - startTime) / duration, 1.0);
            const alpha = 1.0 - progress;

            for (const part of this.destroyedParts) {
                if (part.mesh && !part.mesh.isDisposed()) {
                    part.mesh.visibility = alpha;
                    if (part.mesh.material) {
                        (part.mesh.material as any).alpha = alpha;
                    }
                }
            }

            if (progress < 1.0) {
                requestAnimationFrame(animateFade);
            } else {
                // Гарантируем полную невидимость в конце
                for (const part of this.destroyedParts) {
                    if (part.mesh && !part.mesh.isDisposed()) {
                        part.mesh.visibility = 0;
                        part.mesh.isVisible = false; // Turn off rendering
                    }
                }
            }
        };

        animateFade();
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

        // Если длительность около 0 - телепортируем мгновенно
        if (duration < 50) {
            const camera = game.camera;
            const endCameraPos = new Vector3(
                targetPos.x - 8,
                targetPos.y + 3,
                targetPos.z - 8
            );
            camera.setTarget(targetPos.clone());
            if (camera.setPosition) {
                camera.setPosition(endCameraPos);
            } else {
                camera.position.copyFrom(endCameraPos);
            }
            // Очищаем deathPosition так как мы уже "прилетели"
            this.deathPosition = null;
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

        tankLogger.info(`[TANK] Starting smooth camera transition from death (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)}, ${startPos.z.toFixed(2)}) to respawn (${targetPos.x.toFixed(2)}, ${targetPos.y.toFixed(2)}, ${targetPos.z.toFixed(2)})`);

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

        // Notify server about respawn immediately
        if (this.tank.onRespawnRequest) {
            this.tank.onRespawnRequest();
            console.log("[TANK] Sent respawn request to server");
        } else {
            console.warn("[TANK] No onRespawnRequest callback available!");
        }

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

        // ИСПРАВЛЕНО: Используем getTopSurfaceHeight чтобы спавниться НА крышах/мостах, а не внутри них
        if (game && typeof game.getTopSurfaceHeight === 'function') {
            const surfaceHeight = game.getTopSurfaceHeight(respawnPos.x, respawnPos.z);
            // Спавн на 1.5 метра над поверхностью для безопасности
            targetY = surfaceHeight + 1.5;
            console.log(`[TANK] Spawn height (TopSurface): Y=${targetY.toFixed(2)} (ground: ${game.getGroundHeight?.(respawnPos.x, respawnPos.z)?.toFixed(2) || 'N/A'}, hasGarage: ${hasGarage})`);
        } else if (game && typeof game.getGroundHeight === 'function') {
            const groundHeight = game.getGroundHeight(respawnPos.x, respawnPos.z);
            targetY = groundHeight + 1.5;
            console.log(`[TANK] Spawn height (Ground): Y=${targetY.toFixed(2)} (hasGarage: ${hasGarage})`);
        }

        // Целевая позиция для камеры (где будет танк)
        const cameraTarget = new Vector3(respawnPos.x, targetY + 1, respawnPos.z);

        // ШАГ 1: Телепортируем части вокруг целевой позиции (ДО анимации камеры)
        this.teleportPartsAroundTarget(respawnPos, targetY);

        // ШАГ 2: МГНОВЕННАЯ телепортация камеры и начало сборки (как запросил пользователь)
        // Используем 0ms для мгновенного перехода
        this.animateCameraToPosition(cameraTarget, 0, () => {
            console.log("[TANK] Camera at spawn, starting assembly...");

            // ШАГ 3: Телепортируем chassis в целевую позицию (чтобы камера следила за ним)
            if (this.tank.chassis) {
                this.tank.chassis.position.set(respawnPos.x, targetY, respawnPos.z);
                this.tank.chassis.rotationQuaternion = Quaternion.Identity();
                this.tank.chassis.rotation.set(0, 0, 0);
                this.tank.chassis.computeWorldMatrix(true);
            }

            // Устанавливаем флаг что части телепортированы
            (this.tank as any)._wasTeleportedToGarage = true;

            // ШАГ 4: Анимация сборки (детали стягиваются в центр)
            this.animateAssembly(respawnPos, () => {
                if (!this.tank.isAlive && this.tank.respawn) {
                    this.tank.respawn();
                }
            });
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

            // КРИТИЧНО: Скрываем части, чтобы они плавно проявились в анимации сборки
            part.mesh.isVisible = true;
            part.mesh.visibility = 0;
            if (part.mesh.material) {
                (part.mesh.material as any).alpha = 0;
            }

            console.log(`[TANK] Part ${part.name} teleported to (${teleportPos.x.toFixed(2)}, ${teleportPos.y.toFixed(2)}, ${teleportPos.z.toFixed(2)})`);
        }
    }

    /**
     * Анимирует сборку танка из деталей (стягивание в центр + проявление)
     */
    private animateAssembly(centerPos: Vector3, onComplete: () => void): void {
        const duration = 1000; // 1 секунда
        const startTime = Date.now();

        // Сохраняем начальные позиции
        const startPositions: Map<Mesh, Vector3> = new Map();
        this.destroyedParts.forEach(part => {
            if (part.mesh && !part.mesh.isDisposed()) {
                startPositions.set(part.mesh, part.mesh.position.clone());
            }
        });

        const animate = () => {
            const now = Date.now();
            const progress = Math.min((now - startTime) / duration, 1.0);

            // Ease Out Cubic
            const ease = 1 - Math.pow(1 - progress, 3);

            this.destroyedParts.forEach(part => {
                if (part.mesh && !part.mesh.isDisposed()) {
                    const startPos = startPositions.get(part.mesh);
                    if (startPos) {
                        // Целевая позиция = Центр респавна + Оригинальное смещение
                        // Танк будет смотреть по дефолту (rotation 0,0,0)
                        const targetPos = centerPos.add(part.originalLocalPos);

                        // Интерполяция позиции
                        Vector3.LerpToRef(startPos, targetPos, ease, part.mesh.position);

                        // Интерполяция прозрачности
                        part.mesh.visibility = progress;
                        if (part.mesh.material) {
                            (part.mesh.material as any).alpha = progress;
                        }
                    }
                }
            });

            if (progress < 1.0) {
                requestAnimationFrame(animate);
            } else {
                onComplete();
            }
        };

        animate();
    }

    /**
     * Находит случайную безопасную позицию для респавна (если гаража нет)
     * ИСПРАВЛЕНО: Использует findSafeSpawnPosition() для поиска безопасной позиции над верхней поверхностью
     * Танк спавнится на ВЕРХНЕЙ поверхности (крыша здания или террейн)
     */
    private findSafeRandomSpawnPosition(): Vector3 {
        const game = (window as any).gameInstance;

        // ИСПРАВЛЕНО: Используем findSafeSpawnPosition() для поиска случайной позиции в радиусе
        if (game && typeof game.findSafeSpawnPosition === 'function') {
            const safePos = game.findSafeSpawnPosition(0, 0, 50, 200, 10);
            console.log(`[TANK] Spawn on top surface via Game.findSafeSpawnPosition: (${safePos.x.toFixed(2)}, ${safePos.y.toFixed(2)}, ${safePos.z.toFixed(2)})`);
            return safePos;
        }

        // Fallback: генерируем позицию и используем findSafeSpawnPositionAt()
        const mapRadius = 200;
        const angle = Math.random() * Math.PI * 2;
        const distance = 50 + Math.random() * (mapRadius - 50);
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        // ИСПРАВЛЕНО: Используем findSafeSpawnPositionAt() для конкретных координат
        if (game && typeof game.findSafeSpawnPositionAt === 'function') {
            const safePos = game.findSafeSpawnPositionAt(x, z, 2.0, 5);
            if (safePos) {
                console.log(`[TANK] Spawn on top surface via Game.findSafeSpawnPositionAt: (${safePos.x.toFixed(2)}, ${safePos.y.toFixed(2)}, ${safePos.z.toFixed(2)})`);
                return safePos;
            }
        }

        // Fallback: получаем высоту верхней поверхности
        let surfaceY = 5;
        if (game && typeof game.getTopSurfaceHeight === 'function') {
            surfaceY = game.getTopSurfaceHeight(x, z);
        } else if (game && typeof game.getGroundHeight === 'function') {
            surfaceY = game.getGroundHeight(x, z);
        } else {
            // Используем локальный raycast
            surfaceY = this.getTopSurfaceHeightLocal(x, z);
        }

        const spawnY = surfaceY + 2.0; // ИСПРАВЛЕНО: Увеличен отступ до 2.0м
        console.log(`[TANK] Spawn on top surface (fallback): (${x.toFixed(2)}, ${spawnY.toFixed(2)}, ${z.toFixed(2)})`);
        return new Vector3(x, spawnY, z);
    }

    /**
     * Локальный метод получения высоты САМОЙ ВЕРХНЕЙ поверхности
     * ИСПРАВЛЕНО: Улучшен по аналогии с основным методом getTopSurfaceHeight() в game.ts
     * Использует multiPickWithRay для нахождения крыши
     */
    private getTopSurfaceHeightLocal(x: number, z: number): number {
        if (!this.tank.scene) return 5.0; // Fallback если сцены нет

        // ИСПРАВЛЕНО: Raycast с очень большой высоты (500м) вниз на 600м для покрытия всех объектов
        const rayStart = new Vector3(x, 500, z);
        const ray = new Ray(rayStart, new Vector3(0, -1, 0), 600);

        const hits = this.tank.scene.multiPickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled()) return false;

            // ИСПРАВЛЕНО: Улучшенный фильтр - исключаем только явно служебные объекты
            const name = mesh.name.toLowerCase();

            // Пропускаем только явно служебные объекты
            if (name.includes("trigger") ||
                name.includes("collider") ||
                name.includes("invisible") ||
                name.includes("skybox") ||
                name.includes("light") ||
                name.includes("particle") ||
                name.includes("bullet") ||
                name.includes("projectile") ||
                name.includes("ui") ||
                name.includes("hud")) {
                return false;
            }

            // Разрешаем все остальные меши (террейн, здания, объекты карты)
            return true;
        });

        if (hits && hits.length > 0) {
            // Находим САМУЮ ВЫСОКУЮ точку (крышу)
            let maxHeight = -Infinity;
            for (const hit of hits) {
                if (hit.hit && hit.pickedPoint) {
                    const h = hit.pickedPoint.y;
                    // ИСПРАВЛЕНО: Расширен диапазон валидных высот до [-10, 500]
                    if (h > maxHeight && h > -10 && h < 500) {
                        maxHeight = h;
                    }
                }
            }

            // ИСПРАВЛЕНО: Проверка валидности результата
            if (maxHeight > -Infinity && maxHeight >= -10 && maxHeight <= 500) {
                return maxHeight;
            }
        }

        return 5.0; // Fallback
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

        // Phase 3.3: Для самолётов — собираем все дочерние меши chassis (крылья, хвост и т.д.)
        const isPlane = (tank as any).chassisType?.id === "plane" ||
            ((tank as any).chassisType && typeof (tank as any).chassisType === 'object' &&
                (tank as any).chassisType?.id?.includes?.("plane"));
        if (isPlane && tank.chassis) {
            const children = tank.chassis.getChildMeshes(true);
            for (const child of children) {
                if (child instanceof Mesh && !child.isDisposed()) {
                    const name = child.name || "part";
                    // Не дублируем уже добавленные части
                    if (!parts.some(p => p.mesh === child)) {
                        parts.push({ mesh: child, name: name, mass: 200 });
                    }
                }
            }
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

        // Очищаем список разрушенных частей (dispose мешей для предотвращения утечек)
        if (this.destroyedParts) {
            for (const part of this.destroyedParts) {
                if (part.mesh && !part.mesh.isDisposed()) {
                    try { part.mesh.dispose(); } catch (e) { /* ignore */ }
                }
            }
        }
        this.destroyedParts = [];

        // Восстанавливаем физику танка
        this.restoreTankPhysics(respawnPos);
    }

    /**
     * Восстанавливает физическое тело танка с РЕАЛИСТИЧНЫМ ГУСЕНИЧНЫМ ХИТБОКСОМ
     */
    public restoreTankPhysics(respawnPos: Vector3): void {
        const tank = this.tank;

        // КРИТИЧНО: Сначала очищаем destroyedParts чтобы остановить анимацию разброса
        // Это нужно для мультиплеерного респавна который вызывает restoreTankPhysics напрямую
        if (this.destroyedParts && this.destroyedParts.length > 0) {
            console.log(`[TankHealth] Clearing ${this.destroyedParts.length} destroyedParts before respawn`);
            for (const part of this.destroyedParts) {
                if (part.mesh && !part.mesh.isDisposed()) {
                    try { part.mesh.dispose(); } catch (e) { /* ignore */ }
                }
            }
            this.destroyedParts = [];
        }

        // КРИТИЧНО: Проверяем валидность текущего физического тела перед восстановлением
        if (tank.physicsBody) {
            // Если тело disposed или привязано к другому (удалённому) мешу - удаляем его
            const body = tank.physicsBody as any;
            if (body._isDisposed || (body.transformNode && body.transformNode !== tank.chassis) || (tank.chassis && tank.chassis.isDisposed())) {
                console.warn("[TankHealth] Detected invalid physics body (disposed or mismatched), removing it.");
                try {
                    tank.physicsBody.dispose();
                } catch (e) { /* ignore */ }
                (tank as any).physicsBody = null;
            }
        }

        // Восстанавливаем физическое тело, если его нет
        if (!tank.physicsBody && tank.chassis) {
            // КРИТИЧНО: Используем множители размеров для синхронизации с визуальной моделью
            const multipliers = CHASSIS_SIZE_MULTIPLIERS[tank.chassisType.id] || CHASSIS_SIZE_MULTIPLIERS["medium"] || { width: 1, height: 1, depth: 1 };
            const realWidth = tank.chassisType.width * multipliers.width;
            const realHeight = tank.chassisType.height * multipliers.height;
            const realDepth = tank.chassisType.depth * multipliers.depth;

            // Для hover и shield используем Math.max для width/depth (как в визуальной модели)
            let finalWidth = realWidth;
            let finalDepth = realDepth;
            if (tank.chassisType.id === "hover" || tank.chassisType.id === "shield") {
                const maxSize = Math.max(tank.chassisType.width, tank.chassisType.depth) * multipliers.width;
                finalWidth = maxSize;
                finalDepth = maxSize;
            }

            // Compound shape: центральный BOX + скруглённые CYLINDER спереди и сзади
            const chassisShape = new PhysicsShapeContainer(tank.scene);

            // Размеры для скруглённых краёв гусениц (используем реальные размеры)
            const cylinderRadius = realHeight * 0.45;
            const cylinderOffset = finalDepth * 0.42;
            const chassisLowering = -realHeight * 0.1;

            // 1. Центральный BOX (укороченный, без острых углов)
            const centerBox = new PhysicsShape({
                type: PhysicsShapeType.BOX,
                parameters: {
                    center: new Vector3(0, chassisLowering, 0),
                    rotation: Quaternion.Identity(),
                    extents: new Vector3(finalWidth, realHeight * 0.7, finalDepth * 0.7)
                }
            }, tank.scene);
            centerBox.material = { friction: 0.1, restitution: 0.0 };
            chassisShape.addChildFromParent(tank.chassis, centerBox, tank.chassis);

            // 2. Передний CYLINDER (скруглённый край)
            const frontCylinder = new PhysicsShape({
                type: PhysicsShapeType.CYLINDER,
                parameters: {
                    pointA: new Vector3(-finalWidth * 0.5, chassisLowering, cylinderOffset),
                    pointB: new Vector3(finalWidth * 0.5, chassisLowering, cylinderOffset),
                    radius: cylinderRadius
                }
            }, tank.scene);
            frontCylinder.material = { friction: 0.15, restitution: 0.0 };
            chassisShape.addChildFromParent(tank.chassis, frontCylinder, tank.chassis);

            // 3. Задний CYLINDER (скруглённый край)
            const backCylinder = new PhysicsShape({
                type: PhysicsShapeType.CYLINDER,
                parameters: {
                    pointA: new Vector3(-finalWidth * 0.5, chassisLowering, -cylinderOffset),
                    pointB: new Vector3(finalWidth * 0.5, chassisLowering, -cylinderOffset),
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
            // КРИТИЧНО: Добавляем небольшой offset по Y чтобы танк не застрял в полу
            const spawnOffset = 1.5; // Поднимаем танк над землёй
            const adjustedSpawnPos = new Vector3(respawnPos.x, respawnPos.y + spawnOffset, respawnPos.z);

            // ПРЯМОЙ телепорт позиции (без интерполяции)
            tank.chassis.position.copyFrom(adjustedSpawnPos);
            tank.chassis.rotationQuaternion = Quaternion.Identity();
            tank.chassis.computeWorldMatrix(true);

            // КРИТИЧНО: disablePreStep = false заставляет физику синхронизироваться с mesh мгновенно
            // Это заменяет setTargetTransform который вызывал интерполяцию!
            tank.physicsBody.disablePreStep = false;
            tank.physicsBody.setLinearVelocity(Vector3.Zero());
            tank.physicsBody.setAngularVelocity(Vector3.Zero());
        }

        // КРИТИЧНО: Восстанавливаем визуальную иерархию танка
        // Башня и ствол должны быть правильно привязаны к chassis/turret
        if (tank.turret && tank.chassis) {
            // Убеждаемся что башня является дочерним элементом корпуса
            if (tank.turret.parent !== tank.chassis) {
                tank.turret.parent = tank.chassis;
            }
            // Сбрасываем локальную позицию башни
            // turretHeight вычисляется так же как в TankController: chassisType.height * 0.75
            const turretHeight = tank.chassisType.height * 0.75;
            tank.turret.position.set(0, tank.chassisType.height / 2 + turretHeight / 2, 0);
            tank.turret.rotation.set(0, 0, 0);
            if (tank.turret.rotationQuaternion) {
                tank.turret.rotationQuaternion = null;
            }
            tank.turret.setEnabled(true);
        }

        if (tank.barrel && tank.turret) {
            if (tank.barrel.parent !== tank.turret) {
                tank.barrel.parent = tank.turret;
            }
            const barrelLength = tank.cannonType.barrelLength;
            const turretDepth = tank.chassisType.depth * 0.6;
            const isPlane = (tank.chassisType as { id?: string })?.id === "plane";
            if (isPlane) {
                const noseZInTurret = (tank.chassisType.depth / 2) - (tank.chassisType.depth * 0.6);
                tank.barrel.position.set(0, 0, noseZInTurret - barrelLength / 2);
            } else {
                tank.barrel.position.set(0, 0, turretDepth / 2 + barrelLength / 2);
            }
            if (tank.barrel.rotationQuaternion) {
                tank.barrel.rotationQuaternion = null;
            }
            tank.barrel.rotation.set(0, 0, 0);
            tank.barrel.setEnabled(true);
        }

        // КРИТИЧНО: Восстанавливаем гусеницы (tracks)
        const chassisWidth = tank.chassisType.width;
        const chassisHeight = tank.chassisType.height;

        if ((tank as any).leftTrack && tank.chassis) {
            const leftTrack = (tank as any).leftTrack as Mesh;
            if (leftTrack.parent !== tank.chassis) {
                leftTrack.parent = tank.chassis;
            }
            leftTrack.position.set(-chassisWidth * 0.55, -chassisHeight * 0.25, 0);
            leftTrack.rotation.set(0, 0, 0);
            if (leftTrack.rotationQuaternion) leftTrack.rotationQuaternion = null;
            leftTrack.setEnabled(true);
        }

        if ((tank as any).rightTrack && tank.chassis) {
            const rightTrack = (tank as any).rightTrack as Mesh;
            if (rightTrack.parent !== tank.chassis) {
                rightTrack.parent = tank.chassis;
            }
            rightTrack.position.set(chassisWidth * 0.55, -chassisHeight * 0.25, 0);
            rightTrack.rotation.set(0, 0, 0);
            if (rightTrack.rotationQuaternion) rightTrack.rotationQuaternion = null;
            rightTrack.setEnabled(true);
        }

        // Пересчитываем world matrix для всех частей
        tank.chassis?.computeWorldMatrix(true);
        tank.turret?.computeWorldMatrix(true);
        tank.barrel?.computeWorldMatrix(true);
        (tank as any).leftTrack?.computeWorldMatrix?.(true);
        (tank as any).rightTrack?.computeWorldMatrix?.(true);

        tankLogger.info("[TankHealth] Tank visual hierarchy restored");
    }
}

