/**
 * @module tank/aircraftPhysics
 * @description Продвинутая авиационная физика с Mouse-Aim системой
 * 
 * Реализует:
 * - Mouse-Aim (Fly-by-Wire) контроль с keyboard override
 * - Реалистичные аэродинамические силы (Lift, Drag, Thrust, Stall)
 * - Зависимость управления от скорости (Control Authority)
 * - Collision damping (анти-кручение при попадании)
 * - Воздушные тормоза (Airbrakes)
 * - Конденсационные следы (Contrails)
 * - Интеграцию с Havok Physics (post-physics update)
 */

import {
    Mesh,
    Vector3,
    PhysicsBody,
    Quaternion,
    PhysicsMotionType,
    Scene,
    Camera,
    Matrix,
    TrailMesh,
    StandardMaterial,
    Color3
} from "@babylonjs/core";
import { MouseAimSystem } from "./mouseAimSystem";
import { PIDController } from "./pidController";
import { AerodynamicsSystem } from "./aerodynamicsSystem";
import { logger } from "../utils/logger";
import {
    DEFAULT_AIRCRAFT_PHYSICS_CONFIG,
    type AircraftPhysicsConfig
} from "../config/aircraftPhysicsConfig";

/**
 * Продвинутая авиационная физика с Mouse-Aim системой
 */
export class AircraftPhysics {
    private mesh: Mesh;
    private physicsBody: PhysicsBody;
    private scene: Scene;
    private camera: Camera;
    private config: AircraftPhysicsConfig;

    // Подсистемы
    private mouseAimSystem: MouseAimSystem;
    private pidController: PIDController;
    private aerodynamicsSystem: AerodynamicsSystem;

    // Controller reference (единый источник ввода)
    private controller: any;
    private mouseScreenX: number = 0.5;
    private mouseScreenY: number = 0.5;

    // Кэш для производительности
    private cachedForward: Vector3 = Vector3.Forward();
    private cachedUp: Vector3 = Vector3.Up();
    private cachedRight: Vector3 = Vector3.Right();
    private cachedPosition: Vector3 = Vector3.Zero();
    private cachedVelocity: Vector3 = Vector3.Zero();
    private lastUpdateTime: number = 0;

    // Double-tap автогаз (R/F)
    private _prevKeyR: boolean = false;
    private _prevKeyF: boolean = false;
    private _lastRTapTime: number = 0;
    private _lastFTapTime: number = 0;
    private _autoThrottleTarget: number = -1;
    private _autoThrottleSpeed: number = 0.5;

    // Воздушные тормоза
    private _airBrakesActive: boolean = false;

    // Free look (Shift)
    private _isFreeLookActive: boolean = false;
    private _prevShift: boolean = false;

    // Phase 1.4: Collision damping
    private _collisionDampingTimer: number = 0;
    private _collisionObserver: any = null;

    // Phase 2: Аэродинамическое состояние
    private _currentAoA: number = 0;
    private _isStalling: boolean = false;
    private _currentGForce: number = 1.0;
    private _lastVelocity: Vector3 = Vector3.Zero();

    // Phase 3.1: Конденсационные следы
    private _contrailLeft: TrailMesh | null = null;
    private _contrailRight: TrailMesh | null = null;
    private _contrailSourceLeft: Mesh | null = null;
    private _contrailSourceRight: Mesh | null = null;

    // Phase 3.2: Дым повреждений
    private _damageSmokeTimer: number = 0;

    constructor(
        mesh: Mesh,
        physicsBody: PhysicsBody,
        scene: Scene,
        camera: Camera,
        controller: any,
        config?: Partial<AircraftPhysicsConfig>
    ) {
        this.mesh = mesh;
        this.physicsBody = physicsBody;
        this.scene = scene;
        this.camera = camera;
        this.controller = controller;
        this.config = { ...DEFAULT_AIRCRAFT_PHYSICS_CONFIG, ...config };

        // Инициализация меша
        this.mesh.computeWorldMatrix(true);
        if (!this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = Quaternion.FromEulerVector(this.mesh.rotation);
        }

        // DYNAMIC режим
        this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);

        // Масса и инерция
        this.physicsBody.setMassProperties({
            mass: 1500,
            centerOfMass: new Vector3(0, 0, 0),
            inertia: new Vector3(5000, 5000, 5000)
        });

        // Демпфирование
        this.physicsBody.setLinearDamping(0.1);
        this.physicsBody.setAngularDamping(0.5);
        this.physicsBody.disablePreStep = false;

        // Обнуляем начальные скорости
        try {
            const body = this.physicsBody as any;
            if (body.setAngularVelocity) body.setAngularVelocity(new Vector3(0, 0, 0));
            if (body.setLinearVelocity) body.setLinearVelocity(new Vector3(0, 0, 0));
            if (body.setGravityFactor) body.setGravityFactor(0);
        } catch (e) {
            logger.warn("[AircraftPhysics] Failed to reset velocities:", e);
        }

        // Подсистемы
        this.mouseAimSystem = new MouseAimSystem(scene, camera, this.config.mouseAim);
        this.pidController = new PIDController(this.config.pid);
        this.aerodynamicsSystem = new AerodynamicsSystem(this.config.aerodynamics);

        // Стартовая тяга 0%
        this.aerodynamicsSystem.setThrottle(0.0);

        // Спавн на минимальной высоте
        const pos = this.mesh.getAbsolutePosition();
        if (pos.y < this.config.minAltitude) {
            this.mesh.setAbsolutePosition(new Vector3(pos.x, this.config.minAltitude, pos.z));
        }

        // Отключаем управление камерой (свободный обзор через Shift)
        try {
            if (this.camera) this.camera.detachControl();
        } catch (e) { }

        // Zero bounce
        try {
            if (this.physicsBody && (this.physicsBody as any).shape) {
                (this.physicsBody as any).shape.material = { restitution: 0.0, friction: 0.5 };
            }
        } catch (e) { }

        // Phase 1.4: Collision damping
        this.setupCollisionDamping();

        // Phase 3.1: Contrails
        this.initContrails();
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    public updateMouseScreenPosition(screenX: number, screenY: number): void {
        this.mouseScreenX = Math.max(0, Math.min(1, screenX));
        this.mouseScreenY = Math.max(0, Math.min(1, screenY));
        this.mouseAimSystem.updateMousePosition(this.mouseScreenX, this.mouseScreenY);
    }

    public getPointerLockSensitivityMultiplier(): number {
        return this.config.mouseAim.pointerLockSensitivityMultiplier ?? 0.4;
    }

    public setTargetOverride(target: Vector3 | null): void {
        this.mouseAimSystem.setOverrideTarget(target);
    }

    public getStallWarningMinSpeed(): number {
        return this.config.stallWarningMinSpeed ?? 8;
    }

    public updateMousePosition(x: number, y: number): void {
        this.mouseScreenX = x;
        this.mouseScreenY = y;
        this.mouseAimSystem.updateMousePosition(x, y);
    }

    public dispose(): void {
        if (this._collisionObserver) {
            try { this._collisionObserver.dispose?.(); } catch (e) { }
            this._collisionObserver = null;
        }
        this.disposeContrails();
        if (this.physicsBody) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
    }

    // ==========================================
    // MAIN UPDATE LOOP
    // ==========================================

    public update(dt: number): void {
        if (!this.mesh || !this.physicsBody || this.physicsBody.isDisposed) return;

        const clampedDt = Math.min(dt, 0.033);
        this.updateCache();

        const body = this.physicsBody as any;
        const speed = this.cachedVelocity?.length?.() ?? 0;

        // ===== 1. READ INPUT (единый источник: controller._inputMap) =====
        const inputMap = this.controller?._inputMap || {};
        const W = !!inputMap["KeyW"];
        const S = !!inputMap["KeyS"];
        const A = !!inputMap["KeyA"];
        const D = !!inputMap["KeyD"];
        const Q = !!inputMap["KeyQ"];
        const E = !!inputMap["KeyE"];
        const R = !!inputMap["KeyR"];
        const F = !!inputMap["KeyF"];
        const Space = !!inputMap["Space"];
        const Shift = !!(inputMap["ShiftLeft"] || inputMap["ShiftRight"]);

        // ===== 2. FREE LOOK (Shift) =====
        this.handleFreeLook(Shift);

        // ===== 3. THROTTLE (R/F + double-tap auto-throttle) =====
        this.updateThrottle(clampedDt, R, F);

        // ===== 4. AIRBRAKES (Space) =====
        this._airBrakesActive = Space;

        // ===== 5. DETERMINE CONTROL INPUT =====
        let pitchInput = 0;
        let rollInput = 0;
        let yawInput = 0;
        let hasDirectInput = false;

        // Keyboard input (приоритет)
        if (W) pitchInput = 1.0;   // Pitch up
        if (S) pitchInput = -1.0;  // Pitch down
        if (A) rollInput = 1.0;    // Roll left
        if (D) rollInput = -1.0;   // Roll right
        if (Q) yawInput = -1.0;    // Yaw left
        if (E) yawInput = 1.0;     // Yaw right
        const hasKeyboardInput = W || S || A || D || Q || E;

        // Phase 1.2: Mouse Aim fallback (когда нет клавиатурного ввода)
        if (!hasKeyboardInput && !this._isFreeLookActive) {
            this.mouseAimSystem.updateTarget(this.cachedPosition, this.cachedForward);

            const error = this.mouseAimSystem.getAngularError(
                this.cachedForward, this.cachedUp, this.cachedRight
            );

            const gain = this.config.mouseAim.mouseAimGain;
            const deadzone = this.config.mouseAim.mouseAimDeadzone;

            if (Math.abs(error.pitch) > deadzone) {
                pitchInput = Math.max(-1, Math.min(1, error.pitch * gain));
            }
            if (Math.abs(error.roll) > deadzone) {
                rollInput = Math.max(-1, Math.min(1, error.roll * gain));
            }
            if (Math.abs(error.yaw) > deadzone) {
                yawInput = Math.max(-1, Math.min(1, error.yaw * gain * 0.5));
            }
        }

        hasDirectInput = Math.abs(pitchInput) > 0.01 || Math.abs(rollInput) > 0.01 || Math.abs(yawInput) > 0.01;

        // Phase 2.3: Control authority зависимая от скорости
        const minSpeedFraction = this.config.controlAuthorityMinSpeed ?? 0.3;
        const minFactor = this.config.controlAuthorityMinFactor ?? 0.3;
        const controlAuth = Math.max(
            minFactor,
            Math.min(1.0, speed / (this.config.maxSpeed * minSpeedFraction))
        );
        pitchInput *= controlAuth;
        rollInput *= controlAuth;
        yawInput *= controlAuth;

        // ===== 6. APPLY ROTATION =====
        try {
            const currentAngVel = body.getAngularVelocity ? body.getAngularVelocity() : new Vector3(0, 0, 0);

            // Phase 1.4: Collision damping (мягче чем жёсткий clamp)
            const baseDamping = hasDirectInput ? 0.3 : 0.8;
            let effectiveDamping = baseDamping;
            if (this._collisionDampingTimer > 0) {
                effectiveDamping = Math.min(5.0, baseDamping + 4.0 * (this._collisionDampingTimer / 1.0));
                this._collisionDampingTimer = Math.max(0, this._collisionDampingTimer - clampedDt);
            }

            // Safety net: Ограничение angular velocity
            const MAX_ANG_VEL = 3.0;
            if (currentAngVel.length() > MAX_ANG_VEL) {
                const clamped = currentAngVel.lengthSquared() > 0.0001 ? currentAngVel.normalize().scale(MAX_ANG_VEL) : Vector3.Zero();
                body.setAngularVelocity(clamped);
            }

            if (hasDirectInput) {
                // Применяем управление
                const PITCH_SPEED = 20.0;
                const ROLL_SPEED = 20.0;
                const YAW_SPEED = 20.0;
                const MAX_SPEED = 5.0;

                const localDelta = new Vector3(
                    pitchInput * PITCH_SPEED * clampedDt,
                    yawInput * YAW_SPEED * clampedDt,
                    rollInput * ROLL_SPEED * clampedDt
                );

                const worldDelta = this.transformToWorldSpace(localDelta);

                let newAngVel = new Vector3(
                    currentAngVel.x + worldDelta.x,
                    currentAngVel.y + worldDelta.y,
                    currentAngVel.z + worldDelta.z
                );

                if (newAngVel.length() > MAX_SPEED) {
                    newAngVel = newAngVel.lengthSquared() > 0.0001 ? newAngVel.normalize().scale(MAX_SPEED) : Vector3.Zero();
                }

                body.setAngularVelocity(newAngVel);
                body.setAngularDamping(effectiveDamping);
            } else {
                // No input — Auto-level (Roll-only стабилизация, Pitch не трогаем)
                const currentUp = this.cachedUp;
                const targetUp = Vector3.Up();
                const levelingAxis = Vector3.Cross(currentUp, targetUp);

                const forward = this.cachedForward;
                const rollComponent = Vector3.Dot(levelingAxis, forward);
                const rollCorrection = forward.scale(rollComponent);

                const STAB_GAIN = 1.0;
                const correction = rollCorrection.scale(STAB_GAIN);

                const dampingFactor = 0.96;
                const dampedCurrent = currentAngVel.scale(dampingFactor);

                body.setAngularVelocity(dampedCurrent.add(correction));
                body.setAngularDamping(effectiveDamping);
            }
        } catch (e) {
            logger.warn("[AircraftPhysics] rotation error:", e);
        }

        // ===== 7. THRUST =====
        const throttle = this.aerodynamicsSystem.getThrottle();
        if (throttle > 0) {
            try {
                const thrustMag = this.config.aerodynamics.maxThrust * throttle * 2.0;
                const thrustDir = this.cachedForward.lengthSquared() > 0.0001 ? this.cachedForward.clone().normalize() : Vector3.Forward();
                const thrustForce = thrustDir.scale(thrustMag * clampedDt / this.config.mass);

                const currentVel = body.getLinearVelocity ? body.getLinearVelocity() : new Vector3(0, 0, 0);
                const newVel = currentVel.add(thrustForce);

                if (newVel.length() > this.config.maxSpeed) {
                    body.setLinearVelocity(newVel.lengthSquared() > 0.0001 ? newVel.normalize().scale(this.config.maxSpeed) : Vector3.Zero());
                } else {
                    body.setLinearVelocity(newVel);
                }
            } catch (e) { }
        }

        // ===== 8. DRAG (+ airbrake + stall multipliers) =====
        if (speed > 1.0) {
            try {
                let dragCoef = this.config.aerodynamics.zeroLiftDragCoefficient;

                if (this._airBrakesActive) {
                    dragCoef *= (this.config.airbrakeDragMultiplier ?? 8.0);
                }
                if (this._isStalling) {
                    dragCoef *= (this.config.stallDragMultiplier ?? 3.0);
                }

                const dragForce = speed * speed * dragCoef * 0.001;
                const currentVel = body.getLinearVelocity();
                const brakeFactor = Math.max(0.85, 1.0 - dragForce * clampedDt);
                body.setLinearVelocity(currentVel.scale(brakeFactor));
            } catch (e) { }
        }

        // ===== 9. AERODYNAMICS (Lift, Stall, AoA) =====
        this.updateAerodynamics(body, speed, clampedDt);

        // ===== 10. VELOCITY ALIGNMENT (скоростно-зависимый) =====
        if (speed > 5.0) {
            try {
                const currentVel = body.getLinearVelocity();
                const forward = this.cachedForward.lengthSquared() > 0.0001 ? this.cachedForward.clone().normalize() : Vector3.Forward();

                const speedRatio = Math.min(1.0, speed / this.config.maxSpeed);
                const minAlign = this.config.alignmentStrengthMin ?? 0.05;
                const maxAlign = this.config.alignmentStrengthMax ?? 0.30;
                const ALIGNMENT_STRENGTH = minAlign + (maxAlign - minAlign) * speedRatio;

                const targetVel = forward.scale(speed);
                const alignedVel = new Vector3(
                    currentVel.x + (targetVel.x - currentVel.x) * ALIGNMENT_STRENGTH,
                    currentVel.y + (targetVel.y - currentVel.y) * ALIGNMENT_STRENGTH,
                    currentVel.z + (targetVel.z - currentVel.z) * ALIGNMENT_STRENGTH
                );

                body.setLinearVelocity(alignedVel);
            } catch (e) { }
        }

        // ===== 11. GRAVITY (1.0 — lift компенсирует) =====
        try {
            if (body.setGravityFactor) body.setGravityFactor(1.0);
        } catch (e) { }

        // ===== 12. G-FORCE =====
        this.updateGForce(clampedDt);

        // ===== 13. CONTRAILS =====
        this.updateContrails(speed);

        // Сохраняем предыдущее состояние клавиш для double-tap
        this._prevKeyR = R;
        this._prevKeyF = F;
        this._prevShift = Shift;
    }

    // ==========================================
    // THROTTLE
    // ==========================================

    private updateThrottle(dt: number, R: boolean, F: boolean): void {
        const DOUBLE_TAP_WINDOW = 300;
        const now = performance.now();

        // Обнаружение rising edge для R (double-tap -> auto-throttle MAX)
        if (R && !this._prevKeyR) {
            if (now - this._lastRTapTime < DOUBLE_TAP_WINDOW) {
                this._autoThrottleTarget = 1;
                logger.log("[Aircraft] Auto-throttle: MAX");
            }
            this._lastRTapTime = now;
        }

        // Обнаружение rising edge для F (double-tap -> auto-throttle IDLE)
        if (F && !this._prevKeyF) {
            if (now - this._lastFTapTime < DOUBLE_TAP_WINDOW) {
                this._autoThrottleTarget = 0;
                logger.log("[Aircraft] Auto-throttle: IDLE");
            }
            this._lastFTapTime = now;
        }

        // Автоматическое изменение газа
        if (this._autoThrottleTarget >= 0) {
            const currentThrottle = this.aerodynamicsSystem.getThrottle();
            const targetThrottle = this._autoThrottleTarget;
            const diff = targetThrottle - currentThrottle;

            if (Math.abs(diff) < 0.01) {
                this._autoThrottleTarget = -1;
                this.aerodynamicsSystem.setThrottle(targetThrottle === 1 ? 1.0 : 0.0);
            } else {
                const step = this._autoThrottleSpeed * dt;
                if (diff > 0) {
                    this.aerodynamicsSystem.setThrottle(Math.min(1.0, currentThrottle + step));
                } else {
                    this.aerodynamicsSystem.setThrottle(Math.max(0.0, currentThrottle - step));
                }
            }
        }

        // Ручное управление газом (отменяет авто)
        if (R) {
            this._autoThrottleTarget = -1;
            this.aerodynamicsSystem.increaseThrottle(dt);
        }
        if (F) {
            this._autoThrottleTarget = -1;
            this.aerodynamicsSystem.decreaseThrottle(dt);
        }
    }

    // ==========================================
    // FREE LOOK (Shift)
    // ==========================================

    private handleFreeLook(shift: boolean): void {
        // Rising edge: Shift нажата
        if (shift && !this._prevShift) {
            this._isFreeLookActive = true;
            if (this.camera) {
                const canvas = this.scene.getEngine().getRenderingCanvas();
                this.camera.attachControl(canvas, true);
            }
        }
        // Falling edge: Shift отпущена
        if (!shift && this._prevShift) {
            this._isFreeLookActive = false;
            if (this.camera) {
                this.camera.detachControl();
            }
        }
    }

    // ==========================================
    // Phase 1.4: COLLISION DAMPING
    // ==========================================

    private setupCollisionDamping(): void {
        try {
            const observable = this.physicsBody.getCollisionObservable?.();
            if (observable) {
                this._collisionObserver = observable.add((event: any) => {
                    // Проверяем импульс столкновения
                    const impulse = event?.impulse ?? 0;
                    const impulseMag = typeof impulse === 'number' ? impulse :
                        (impulse?.length?.() ?? 0);

                    if (impulseMag > 5) {
                        // Значительный импульс — включаем временное повышенное damping
                        this._collisionDampingTimer = Math.min(1.0, this._collisionDampingTimer + 0.5);
                    }
                });
            }
        } catch (e) {
            // Collision observable может не поддерживаться
        }
    }

    // ==========================================
    // Phase 2: AERODYNAMICS (Lift, Stall, AoA)
    // ==========================================

    private updateAerodynamics(body: any, speed: number, dt: number): void {
        if (speed < 1.0) {
            this._currentAoA = 0;
            this._isStalling = false;
            return;
        }

        try {
            const velDir = this.cachedVelocity.lengthSquared() > 0.0001 ? this.cachedVelocity.normalize() : Vector3.Forward();
            const forward = this.cachedForward;
            const up = this.cachedUp;

            // Angle of Attack (угол между forward и velocity)
            const dot = Math.max(-1, Math.min(1, Vector3.Dot(forward, velDir)));
            this._currentAoA = Math.acos(dot);

            // Stall check
            const criticalAoA = this.config.aerodynamics.criticalAngleOfAttack ?? 0.35;
            this._isStalling = this._currentAoA > criticalAoA && speed > (this.config.stallWarningMinSpeed ?? 8);

            // LIFT: speed² * liftCoefficient * cos(AoA)
            const liftMult = this.config.liftMultiplier ?? 1.0;
            const baseLift = this.config.aerodynamics.baseLiftCoefficient;
            let liftCoeff = baseLift * Math.cos(this._currentAoA);

            // Stall: lift drops dramatically
            if (this._isStalling) {
                const stallFactor = Math.max(0.1, 1.0 - (this._currentAoA - criticalAoA) * 3.0);
                liftCoeff *= stallFactor;
            }

            // Lift force magnitude
            const liftMag = speed * speed * liftCoeff * 0.0001 * liftMult;

            // Apply lift (вдоль up вектора самолёта)
            const currentVel = body.getLinearVelocity();
            const liftForce = up.scale(liftMag * dt);
            const newVel = currentVel.add(liftForce);
            body.setLinearVelocity(newVel);

            // Stall: nose-down torque (самолёт опускает нос при сваливании)
            if (this._isStalling) {
                const stallTorqueMag = (this._currentAoA - criticalAoA) * 2.0;
                const rightAxis = this.cachedRight;
                // Нос вниз = положительный pitch вокруг right axis
                const stallTorque = rightAxis.scale(-stallTorqueMag * dt);
                const currentAngVel = body.getAngularVelocity();
                body.setAngularVelocity(currentAngVel.add(stallTorque));
            }
        } catch (e) { }
    }

    // ==========================================
    // G-FORCE COMPUTATION
    // ==========================================

    private updateGForce(dt: number): void {
        if (!this.physicsBody || dt < 0.001) {
            this._currentGForce = 1.0;
            return;
        }

        try {
            const currentVel = this.cachedVelocity;
            
            // ИСПРАВЛЕНО: Инициализация при первом вызове
            if (this._lastVelocity.lengthSquared() < 0.0001) {
                this._lastVelocity = currentVel.clone();
                this._currentGForce = 1.0;
                return;
            }
            
            const deltaVel = currentVel.subtract(this._lastVelocity);
            const speedChange = deltaVel.length();
            
            // ИСПРАВЛЕНО: Игнорируем микроскопические изменения (< 0.1 м/с)
            // Это предотвращает показ перегрузки в покое из-за ошибок округления
            const MIN_SPEED_CHANGE = 0.1;
            if (speedChange < MIN_SPEED_CHANGE) {
                this._currentGForce = 1.0; // Базовый 1G в покое
                return;
            }
            
            const safeDt = Math.max(dt, 0.001);
            const acceleration = speedChange / safeDt;

            // G = acceleration / 9.81 + 1.0 (базовая гравитация)
            this._currentGForce = 1.0 + acceleration / 9.81;

            // Сглаживание
            this._currentGForce = Math.max(0.1, Math.min(15.0, this._currentGForce));

            this._lastVelocity = currentVel.clone();
        } catch (e) {
            this._currentGForce = 1.0;
        }
    }

    // ==========================================
    // Phase 3.1: CONTRAILS
    // ==========================================

    private initContrails(): void {
        try {
            // Создаём невидимые source-меши на кончиках крыльев
            const wingSpan = 3.0; // Половина размаха крыла

            this._contrailSourceLeft = Mesh.CreateBox("contrailSrcL", 0.01, this.scene);
            this._contrailSourceLeft.parent = this.mesh;
            this._contrailSourceLeft.position = new Vector3(-wingSpan, 0, -0.5);
            this._contrailSourceLeft.isVisible = false;

            this._contrailSourceRight = Mesh.CreateBox("contrailSrcR", 0.01, this.scene);
            this._contrailSourceRight.parent = this.mesh;
            this._contrailSourceRight.position = new Vector3(wingSpan, 0, -0.5);
            this._contrailSourceRight.isVisible = false;

            const trailLength = this.config.contrailLength ?? 60;

            this._contrailLeft = new TrailMesh("contrailL", this._contrailSourceLeft, this.scene, 0.15, trailLength, true);
            this._contrailRight = new TrailMesh("contrailR", this._contrailSourceRight, this.scene, 0.15, trailLength, true);

            // Белый полупрозрачный материал
            const contrailMat = new StandardMaterial("contrailMat", this.scene);
            contrailMat.diffuseColor = Color3.White();
            contrailMat.emissiveColor = new Color3(0.8, 0.8, 0.8);
            contrailMat.alpha = 0.3;
            contrailMat.backFaceCulling = false;

            this._contrailLeft.material = contrailMat;
            this._contrailRight.material = contrailMat;

            // Начально скрыты
            this._contrailLeft.isVisible = false;
            this._contrailRight.isVisible = false;
        } catch (e) {
            // TrailMesh может быть недоступен
            logger.warn("[AircraftPhysics] Failed to init contrails:", e);
        }
    }

    private updateContrails(speed: number): void {
        const minSpeed = this.config.contrailMinSpeed ?? 80;
        const shouldShow = speed > minSpeed || this._currentGForce > 3.0;

        if (this._contrailLeft) this._contrailLeft.isVisible = shouldShow;
        if (this._contrailRight) this._contrailRight.isVisible = shouldShow;
    }

    private disposeContrails(): void {
        try {
            if (this._contrailLeft) { this._contrailLeft.dispose(); this._contrailLeft = null; }
            if (this._contrailRight) { this._contrailRight.dispose(); this._contrailRight = null; }
            if (this._contrailSourceLeft) { this._contrailSourceLeft.dispose(); this._contrailSourceLeft = null; }
            if (this._contrailSourceRight) { this._contrailSourceRight.dispose(); this._contrailSourceRight = null; }
        } catch (e) { }
    }

    // ==========================================
    // CACHE
    // ==========================================

    private updateCache(): void {
        if (!this.mesh) return;

        try {
            this.mesh.computeWorldMatrix(true);

            const position = this.mesh.getAbsolutePosition();
            const forward = this.mesh.forward;
            const up = this.mesh.up;

            if (position && isFinite(position.x) && isFinite(position.y) && isFinite(position.z)) {
                this.cachedPosition = position;
            }
            if (forward && isFinite(forward.x) && isFinite(forward.y) && isFinite(forward.z)) {
                this.cachedForward = forward;
            }
            if (up && isFinite(up.x) && isFinite(up.y) && isFinite(up.z)) {
                this.cachedUp = up;
                const right = Vector3.Cross(up, forward);
                if (right && isFinite(right.x) && isFinite(right.y) && isFinite(right.z)) {
                    this.cachedRight = right;
                }
            }

            if (this.physicsBody) {
                const velocity = this.physicsBody.getLinearVelocity();
                if (velocity && isFinite(velocity.x) && isFinite(velocity.y) && isFinite(velocity.z)) {
                    this.cachedVelocity = velocity;
                }
            }
        } catch (e) {
            logger.warn("[AircraftPhysics] updateCache error:", e);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    private transformToWorldSpace(localVector: Vector3): Vector3 {
        if (!localVector || !isFinite(localVector.x) || !isFinite(localVector.y) || !isFinite(localVector.z)) {
            return Vector3.Zero();
        }

        if (!this.mesh || !this.mesh.rotationQuaternion) {
            return new Vector3(localVector.x, localVector.y, localVector.z);
        }

        try {
            const quat = this.mesh.rotationQuaternion;
            if (!quat || !isFinite(quat.x) || !isFinite(quat.y) || !isFinite(quat.z) || !isFinite(quat.w)) {
                return new Vector3(localVector.x, localVector.y, localVector.z);
            }

            const rotationMatrix = Matrix.Identity();
            Matrix.FromQuaternionToRef(quat, rotationMatrix);
            const result = Vector3.TransformNormal(localVector, rotationMatrix);

            if (result && isFinite(result.x) && isFinite(result.y) && isFinite(result.z)) {
                return new Vector3(result.x, result.y, result.z);
            } else {
                return Vector3.Zero();
            }
        } catch (e) {
            return Vector3.Zero();
        }
    }

    // ==========================================
    // PUBLIC GETTERS
    // ==========================================

    public getSpeed(): number {
        return this.cachedVelocity.length();
    }

    public getTargetPoint(): Vector3 {
        return this.mouseAimSystem.getTargetPoint();
    }

    // [Opus 4.6] Return cached refs directly to avoid per-frame allocations
    // Callers must NOT modify the returned vector — use .clone() if mutation needed
    public getForwardDirection(): Vector3 {
        return this.cachedForward;
    }

    public getThrottle(): number {
        return this.aerodynamicsSystem.getThrottle();
    }

    public isBrakingActive(): boolean {
        return this._airBrakesActive;
    }

    public getAngleOfAttack(): number {
        return this._currentAoA;
    }

    public isStalling(): boolean {
        return this._isStalling;
    }

    public calculateGForce(): number {
        return this._currentGForce;
    }

    public getUpDirection(): Vector3 {
        return this.cachedUp;
    }

    public getRightDirection(): Vector3 {
        return this.cachedRight;
    }

    public getPosition(): Vector3 {
        return this.cachedPosition;
    }

    public getVelocity(): Vector3 {
        return this.cachedVelocity;
    }
}
