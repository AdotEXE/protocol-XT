// Модуль управления здоровьем, топливом и неуязвимостью танка
import { Vector3, Mesh, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import type { ITankController } from "./types";
import { TANK_CONSTANTS } from "./constants";

export class TankHealthModule {
    private tank: ITankController;
    
    // Защита от урона после респавна
    private isInvulnerable = false;
    private invulnerabilityDuration = TANK_CONSTANTS.INVULNERABILITY_DURATION;
    private invulnerabilityStartTime = 0;
    private invulnerabilityGlow: Mesh | null = null;
    
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
            
            // Показываем индикатор направления урона, если известна позиция атакующего
            if (attackerPosition && this.tank.chassis) {
                const playerPos = this.tank.chassis.position;
                const playerRotation = this.tank.chassis.rotation.y;
                this.tank.hud.showDamageFromPosition(attackerPosition, playerPos, playerRotation);
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
        glow.rotation.x = Math.PI / 2;
        
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
}

