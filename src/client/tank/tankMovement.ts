// Модуль управления движением и физикой танка
import { Vector3, PhysicsMotionType, Quaternion } from "@babylonjs/core";
import { tankLogger } from "../utils/logger";
import type { ITankController } from "./types";
import { AircraftPhysics } from "./aircraftPhysics";
import { getAircraftPhysicsConfig } from "../config/aircraftVehicleConfig";

export class TankMovementModule {
    private tank: ITankController;
    private aircraftPhysics: AircraftPhysics | null = null;
    private _physicsObserver: any = null;

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

        // Получаем touch input (если есть)
        const touchThrottle = (this.tank as any).getTouchThrottle?.() ?? 0;
        const touchSteer = (this.tank as any).getTouchSteer?.() ?? 0;
        const touchTurret = (this.tank as any).getTouchTurret?.() ?? { left: false, right: false };

        // Keyboard input
        let keyboardThrottle = 0;
        let keyboardSteer = 0;

        if ((this.tank as any)._inputMap["KeyW"] || (this.tank as any)._inputMap["ArrowUp"]) {
            keyboardThrottle += 1;
        }
        if ((this.tank as any)._inputMap["KeyS"] || (this.tank as any)._inputMap["ArrowDown"]) {
            keyboardThrottle -= 1;
        }
        if ((this.tank as any)._inputMap["KeyA"] || (this.tank as any)._inputMap["ArrowLeft"]) {
            keyboardSteer -= 1;
        }
        if ((this.tank as any)._inputMap["KeyD"] || (this.tank as any)._inputMap["ArrowRight"]) {
            keyboardSteer += 1;
        }

        // Объединяем keyboard и touch input (приоритет клавиатуре если нажата)
        this.tank.throttleTarget = keyboardThrottle !== 0 ? keyboardThrottle : touchThrottle;
        this.tank.steerTarget = keyboardSteer !== 0 ? keyboardSteer : touchSteer;

        // Notify HUD about movement (for tutorial)
        if ((this.tank.throttleTarget !== 0 || this.tank.steerTarget !== 0) && this.tank.hud) {
            this.tank.hud.notifyPlayerMoved();
        }

        // Debug: Log input changes

        // Turret Control (smoothed; mouse disabled)
        // Turret Control (smoothed; mouse disabled)
        this.tank.turretTurnTarget = 0;
        (this.tank as any).isKeyboardTurretControl = false; // Сбрасываем флаг каждый кадр

        // Check if current chassis is "plane" (включая mig31 и др.)
        const chassisType = (this.tank as any).chassisType;
        const isPlane = chassisType === "plane" ||
            (typeof chassisType === 'object' && (
                chassisType?.id === "plane" ||
                chassisType?.id?.includes?.("plane") ||
                chassisType?.id?.includes?.("mig31")
            ));

        // Для самолёта скрываем башню и пушку - показываем только модель МиГ-31
        // КРИТИЧНО: Полностью отключаем танковую физику для самолёта!
        // AircraftPhysics полностью управляет движением
        if (isPlane) {
            // ИСПРАВЛЕНО: Не скрываем башню и пушку, чтобы игрок мог ими управлять (Z/X)
            // if (this.tank.turret) this.tank.turret.isVisible = false;
            // if (this.tank.barrel) this.tank.barrel.isVisible = false;

            // ОТКЛЮЧАЕМ танковую физику - AircraftPhysics контролирует самолёт!
            this.tank.throttleTarget = 0;
            this.tank.steerTarget = 0;
        }

        // Debug logging (throttled) - REMOVED
        // if (Math.random() < 0.05) { ... }

        // Ручное управление (отменяет авто-центрирование)
        const inputMap = (this.tank as any)._inputMap;

        // DISABLE manual turret control for Planes (camera locked to front)
        // ИСПРАВЛЕНО: Разрешаем управление башней для самолётов (Z/X)
        const turretLeftPressed = (inputMap["KeyZ"] || touchTurret.left);
        const turretRightPressed = (inputMap["KeyX"] || touchTurret.right);

        // Аналоговое управление башней с джойстика (если есть)
        const touchTurretRotation = (this.tank as any).getTouchTurretRotation?.() ?? 0;
        const touchAimPitch = (this.tank as any).getTouchAimPitch?.() ?? 0;

        if (turretLeftPressed) {
            this.tank.turretTurnTarget -= 1;
            (this.tank as any).isAutoCentering = false;
            (this.tank as any).isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }
        if (turretRightPressed) {
            this.tank.turretTurnTarget += 1;
            (this.tank as any).isAutoCentering = false;
            (this.tank as any).isKeyboardTurretControl = true; // Активируем клавиатурное управление
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }

        // Аналоговое управление башней с правого джойстика (плавнее чем кнопки)
        if (!isPlane && Math.abs(touchTurretRotation) > 0.1) {
            this.tank.turretTurnTarget += touchTurretRotation;
            (this.tank as any).isAutoCentering = false;
            (this.tank as any).isKeyboardTurretControl = true;
            window.dispatchEvent(new CustomEvent("stopCenterCamera"));
        }

        // Автоматическое центрирование (активируется по C) - с ОБЫЧНОЙ скоростью вращения
        // НО ТОЛЬКО если игрок не управляет башней вручную (Z/X)
        // FOR PLANES: Do NOT force auto-center (Allow Free Camera for Mouse Aim)
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
            // For planes, we want TIGHT locking, so maybe threshold needs to be small or logic robust
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
                // console.log("[TankMovement] Центровка ЗАВЕРШЕНА - башня в центре");
            } else {
                // Башня не в центре - продолжаем центрирование
                // For Plane, make it snap faster/harder? Using baseTurretSpeed from controller.
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

        // Аналоговый наклон пушки с правого джойстика
        if (Math.abs(touchAimPitch) > 0.1) {
            this.tank.barrelPitchTarget = -touchAimPitch; // Инвертируем: вверх джойстика = ствол вверх
        }

        // =========================================================================
        // FLIGHT MECHANICS (Plane & FlyMode)
        // Q - вверх, E - вниз
        // =========================================================================
        const flyMode = (this.tank as any).flyMode;
        // Check if current chassis is "plane"
        // (isPlane is already defined above)

        // Initialize aircraft physics subsystem if needed
        // Reverting to single check to fix Syntax/Build Error
        if (isPlane && !this.aircraftPhysics && this.tank.physicsBody && this.tank.chassis) {
            console.log("[TankMovement] Initializing AircraftPhysics for Plane");
            try {
                // Get camera from scene (required for Mouse-Aim system)
                const camera = this.tank.scene.activeCamera;
                if (!camera) {
                    console.error("[TankMovement] Cannot initialize AircraftPhysics: no active camera");
                } else {
                    // ИСПРАВЛЕНИЕ: Передаём ссылку на сам танк (контроллер), 
                    // чтобы AircraftPhysics мог читать _inputMap каждый кадр
                    this.aircraftPhysics = new AircraftPhysics(
                        this.tank.chassis,
                        this.tank.physicsBody,
                        this.tank.scene,
                        camera,
                        this.tank as any,  // Передаём контроллер для доступа к _inputMap
                        getAircraftPhysicsConfig()
                    );
                    // Phase 1.3: Регистрируем update ПОСЛЕ physics step
                    this.registerPhysicsObserver();
                }
            } catch (e) {
                console.error("[TankMovement] Failed to init AircraftPhysics:", e);
            }
        }

        // Removed cleanup logic for now to restore boot

        if (this.aircraftPhysics) {
            // Phase 1.3: Только передаём мышь. update() вызывается через onAfterPhysicsObservable
            if (this.tank.scene) {
                const engine = this.tank.scene.getEngine();
                const width = engine.getRenderWidth();
                const height = engine.getRenderHeight();

                const mouseX = this.tank.scene.pointerX / width;
                const mouseY = this.tank.scene.pointerY / height;

                this.aircraftPhysics.updateMousePosition(mouseX, mouseY);
            }
        } else if (flyMode && this.tank.physicsBody) {
            // Fallback for debug flyMode
            const currentVel = this.tank.physicsBody.getLinearVelocity();
            if (inputMap["KeyQ"]) this.tank.physicsBody.setLinearVelocity(new Vector3(currentVel.x, 15, currentVel.z));
            if (inputMap["KeyE"]) this.tank.physicsBody.setLinearVelocity(new Vector3(currentVel.x, -15, currentVel.z));
        }
    }

    /**
     * Phase 1.3: Регистрирует observer для вызова aircraftPhysics.update() ПОСЛЕ physics step.
     * Это решает проблему "Havok добавил impulse, а мы читаем старое значение".
     */
    private registerPhysicsObserver(): void {
        if (this._physicsObserver) return;
        this._physicsObserver = this.tank.scene.onAfterPhysicsObservable.add(() => {
            if (this.aircraftPhysics && (this.tank as any).isAlive) {
                const dt = this.tank.scene.getEngine().getDeltaTime() / 1000;
                this.aircraftPhysics.update(Math.min(dt || 0.016, 0.05));
            }
        });
    }

    /**
     * Set inputs manually (used for disabling controls)
     */
    public setInputs(throttle: number, steer: number): void {
        this.tank.throttleTarget = throttle;
        this.tank.steerTarget = steer;
        this.tank.turretTurnTarget = 0;

        // Also reset internal flags
        (this.tank as any).smoothThrottle = 0;
        (this.tank as any).smoothSteer = 0;
        (this.tank as any).turretTurnSmooth = 0;
    }

    /**
     * Update movement state (physics forces are currently handled in TankController)
     * This method is called from TankController.updatePhysics loop
     */
    updateMovement(dt: number): void {
        // Movement physics logic is currently inside TankController.updatePhysics
        // This method exists to satisfy the interface and allow future refactoring
    }

    /**
     * Сброс позиции и состояния танка
     */
    reset(): void {
        if (!this.tank.chassis || !this.tank.physicsBody) {
            console.error("[TANK] Reset failed - chassis or physicsBody is null!");
            return;
        }

        // КРИТИЧНО: Сбрасываем физику самолета при респавне, чтобы она пересоздалась с новым телом/состоянием
        if (this._physicsObserver) {
            this.tank.scene.onAfterPhysicsObservable.remove(this._physicsObserver);
            this._physicsObserver = null;
        }
        if (this.aircraftPhysics) {
            this.aircraftPhysics.dispose();
            this.aircraftPhysics = null;
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

        tankLogger.info(`[TANK] Reset complete - Position: ${spawnPos}, Alive: ${this.tank.isAlive}`);
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

