// Модуль управления движением и физикой танка
import { Vector3, PhysicsMotionType, Quaternion } from "@babylonjs/core";
import type { ITankController } from "./types";

export class TankMovementModule {
    private tank: ITankController;
    
    constructor(tank: ITankController) {
        this.tank = tank;
    }
    
    /**
     * Обновление ввода (вызывается каждый кадр)
     */
    updateInputs(): void {
        // КРИТИЧНО: Не обрабатываем ввод если танк мёртв/респавнится
        if (!(this.tank as any).isAlive) {
            return;
        }
        
        // ВАЖНО: updateInputs() НЕ зависит от isAiming!
        // Управление танком работает одинаково в любом режиме!
        this.tank.throttleTarget = 0;
        if ((this.tank as any)._inputMap["KeyW"] || (this.tank as any)._inputMap["ArrowUp"]) {
            this.tank.throttleTarget += 1;
        }
        if ((this.tank as any)._inputMap["KeyS"] || (this.tank as any)._inputMap["ArrowDown"]) {
            this.tank.throttleTarget -= 1;
        }

        this.tank.steerTarget = 0;
        if ((this.tank as any)._inputMap["KeyA"] || (this.tank as any)._inputMap["ArrowLeft"]) {
            this.tank.steerTarget -= 1;
        }
        if ((this.tank as any)._inputMap["KeyD"] || (this.tank as any)._inputMap["ArrowRight"]) {
            this.tank.steerTarget += 1;
        }
        
        // Notify HUD about movement (for tutorial)
        if ((this.tank.throttleTarget !== 0 || this.tank.steerTarget !== 0) && this.tank.hud) {
            this.tank.hud.notifyPlayerMoved();
        }
        
        // Debug: Log input changes
        
        // Turret Control (smoothed; mouse disabled)
        this.tank.turretTurnTarget = 0;
        (this.tank as any).isKeyboardTurretControl = false; // Сбрасываем флаг каждый кадр
        
        // Ручное управление (отменяет авто-центрирование)
        const inputMap = (this.tank as any)._inputMap;
        if (inputMap["KeyZ"]) {
            this.tank.turretTurnTarget -= 1;
            (this.tank as any).isAutoCentering = false;
            (this.tank as any).isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
        if (inputMap["KeyX"]) {
            this.tank.turretTurnTarget += 1;
            (this.tank as any).isAutoCentering = false;
            (this.tank as any).isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }

        // Автоматическое центрирование (активируется по C) - с ОБЫЧНОЙ скоростью вращения
        // НО ТОЛЬКО если игрок не управляет башней вручную (Z/X)
        const isAutoCentering = (this.tank as any).isAutoCentering;
        const shouldCenter = (isAutoCentering || inputMap["KeyC"]) && !(this.tank as any).isKeyboardTurretControl;
        
        if (inputMap["KeyC"] && !isAutoCentering) {
            // Нажата C и центрирование ещё не активно - активируем
            (this.tank as any).isAutoCentering = true;
            console.log("[TankMovement] KeyC pressed - центровка АКТИВИРОВАНА");
        }
        
        if (shouldCenter) {
            // Нормализуем угол к [-PI, PI] для кратчайшего пути
            let currentRot = this.tank.turret.rotation.y;
            while (currentRot > Math.PI) currentRot -= Math.PI * 2;
            while (currentRot < -Math.PI) currentRot += Math.PI * 2;
            
            // Если башня уже в центре - завершаем центрирование
            if (Math.abs(currentRot) < 0.02) {
                // Достигли центра - останавливаем вращение
                this.tank.turret.rotation.y = 0;
                this.tank.turretTurnTarget = 0;
                this.tank.turretTurnSmooth = 0;
                (this.tank as any).turretAcceleration = 0;
                (this.tank as any).turretAccelStartTime = 0;
                (this.tank as any).isAutoCentering = false;
                
                // Синхронизируем cameraYaw с углом башни (0 когда башня в центре)
                window.dispatchEvent(new CustomEvent("syncCameraYaw", { 
                    detail: { turretRotY: 0 } 
                }));
                
                window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                console.log("[TankMovement] Центровка ЗАВЕРШЕНА - башня в центре");
            } else {
                // Башня не в центре - продолжаем центрирование
                const baseTurretSpeed = (this.tank as any).baseTurretSpeed || 2.0;
                
                // Вычисляем направление к центру
                const targetDirection = -Math.sign(currentRot); // -1 или 1, в зависимости от направления
                
                // Устанавливаем цель вращения (как при ручном управлении)
                this.tank.turretTurnTarget = targetDirection;
                
                // Включаем ускорение башни (как при обычном вращении)
                if ((this.tank as any).turretAccelStartTime === 0) {
                    (this.tank as any).turretAccelStartTime = performance.now();
                }
                
                // Камера следует за башней
                window.dispatchEvent(new CustomEvent("centerCamera", { 
                    detail: { 
                        turretRotY: this.tank.turret.rotation.y, 
                        lerpSpeed: baseTurretSpeed,
                        isActive: true
                    } 
                }));
            }
        } else if ((this.tank as any).isKeyboardTurretControl) {
            // Если игрок управляет башней вручную - отменяем центрирование
            (this.tank as any).isAutoCentering = false;
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
        
        // Barrel Pitch Control (R/F - vertical tilt of barrel)
        this.tank.barrelPitchTarget = 0;
        if (inputMap["KeyR"]) {
            // R - вверх (увеличивает угол pitch, ствол поднимается)
            this.tank.barrelPitchTarget = -1;
        }
        if (inputMap["KeyF"]) {
            // F - вниз (уменьшает угол pitch, ствол опускается)
            this.tank.barrelPitchTarget = 1;
        }
    }
    
    /**
     * Сброс позиции и состояния танка
     */
    reset(): void {
        if (!this.tank.chassis || !this.tank.physicsBody) {
            console.error("[TANK] Reset failed - chassis or physicsBody is null!");
            return;
        }
        
        // Убеждаемся что физика активна ПЕРЕД сбросом скорости
        if (this.tank.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
            this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
        
        // ПОЛНЫЙ сброс физики ПЕРВЫМ (чтобы не было прыжков!)
        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
        
        // Полный сброс позиции (будет установлена из гаража при респавне)
        const spawnPos = new Vector3(0, 3, 0);
        this.tank.chassis.position.copyFrom(spawnPos);
        
        // Сброс вращения корпуса
        this.tank.chassis.rotationQuaternion = Quaternion.Identity();
        this.tank.chassis.rotation.set(0, 0, 0);
        
        // Сброс вращения башни
        this.tank.turret.rotation.set(0, 0, 0);
        
        // Принудительно обновляем матрицу
        this.tank.chassis.computeWorldMatrix(true);
        this.tank.turret.computeWorldMatrix(true);
        this.tank.barrel.computeWorldMatrix(true);
        
        // КРИТИЧЕСКИ ВАЖНО: Ждём один кадр перед повторным сбросом скорости (чтобы избежать прыжков!)
        setTimeout(() => {
            if (this.tank.physicsBody && this.tank.chassis) {
                this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            }
        }, 16); // Один кадр (16ms)
        
        // Дополнительно: сбрасываем все силы и импульсы
        // (Havok может не поддерживать напрямую, но попробуем)
        try {
            // Применяем противоположные силы чтобы остановить всё
            const vel = this.tank.physicsBody.getLinearVelocity();
            const angVel = this.tank.physicsBody.getAngularVelocity();
            if (vel && vel.length() > 0.01) {
                const mass = (this.tank as any).mass || 2100;
                this.tank.physicsBody.applyImpulse(vel.scale(-mass), this.tank.chassis.absolutePosition);
            }
            if (angVel && angVel.length() > 0.01) {
                const mass = (this.tank as any).mass || 2100;
                this.tank.physicsBody.applyAngularImpulse(angVel.scale(-mass * 0.1));
            }
        } catch (e) {
            // Игнорируем если не поддерживается
        }
        
        console.log("[TANK] Reset complete - Position:", spawnPos, "Alive:", this.tank.isAlive);
    }
    
    /**
     * Применить момент (torque) к физическому телу
     */
    applyTorque(torque: Vector3): void {
        // Защитные проверки перед применением момента
        if (!this.tank.physicsBody || !this.tank.chassis || this.tank.chassis.isDisposed()) return;
        
        // Проверка на валидность вектора момента
        if (!isFinite(torque.x) || !isFinite(torque.y) || !isFinite(torque.z)) return;
        
        try {
            const body = this.tank.physicsBody as any;
            if (body && body.applyTorque) {
                body.applyTorque(torque);
            } else if (body && body.applyAngularImpulse) {
                // Use scaleToRef to avoid mutating the input vector
                const tmpVector = (this.tank as any)._tmpVector5 || new Vector3();
                torque.scaleToRef(0.016, tmpVector);
                body.applyAngularImpulse(tmpVector);
            }
        } catch (e) {
            // Игнорируем ошибки применения момента для предотвращения крашей
            console.warn("[TANK] applyTorque error:", e);
        }
    }
}

