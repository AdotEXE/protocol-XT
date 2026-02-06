/**
 * @module tank/aircraftPhysics
 * @description Продвинутая авиационная физика с Mouse-Aim системой
 * 
 * Реализует:
 * - Mouse-Aim (Fly-by-Wire) контроль
 * - PID регулятор для плавного управления
 * - Реалистичные аэродинамические силы
 * - Систему переопределения клавиатуры
 * - Интеграцию с Havok Physics
 */

import {
    Mesh,
    Vector3,
    PhysicsBody,
    Quaternion,
    PhysicsMotionType,
    Scalar,
    Scene,
    Camera,
    Matrix
} from "@babylonjs/core";
import { MouseAimSystem } from "./mouseAimSystem";
import { PIDController } from "./pidController";
import { AerodynamicsSystem } from "./aerodynamicsSystem";
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

    // Состояние
    private controller: any; // TankController reference for accessing _inputMap
    private mouseScreenX: number = 0.5;
    private mouseScreenY: number = 0.5;

    // Кэш для производительности
    private cachedForward: Vector3 = Vector3.Forward();
    private cachedUp: Vector3 = Vector3.Up();
    private cachedRight: Vector3 = Vector3.Right();
    private cachedPosition: Vector3 = Vector3.Zero();
    private cachedVelocity: Vector3 = Vector3.Zero();
    private lastUpdateTime: number = 0;
    private _debugCounter: number = 0; // Debug counter for periodic logging

    // Сглаженный ввод мыши для следования за курсором без дёрганий (приоритет №1)
    private _smoothedMousePitch: number = 0;
    private _smoothedMouseRoll: number = 0;
    private _smoothedMouseYaw: number = 0;

    // Задержка включения mouse aim после спавна (2.5 секунды)
    private _spawnTime: number = 0;
    private _mouseAimDelay: number = 2500; // мс - увеличено для стабильного спавна

    // Двойное нажатие для автоматического газа
    private _lastQPressTime: number = 0;
    private _lastEPressTime: number = 0;
    private _autoThrottleTarget: number = -1; // -1 = выключено, 0 = к нулю, 1 = к максимуму
    private _autoThrottleSpeed: number = 0.5; // Скорость изменения газа в секунду (0-1 за 2 сек)

    constructor(
        mesh: Mesh,
        physicsBody: PhysicsBody,
        scene: Scene,
        camera: Camera,
        controller: any,  // TankController for accessing _inputMap
        config?: Partial<AircraftPhysicsConfig>
    ) {
        this.mesh = mesh;
        this.physicsBody = physicsBody;
        this.scene = scene;
        this.camera = camera;
        this.controller = controller; // Сохраняем ссылку на контроллер для доступа к _inputMap
        this.config = { ...DEFAULT_AIRCRAFT_PHYSICS_CONFIG, ...config };

        // Инициализация меша
        this.mesh.computeWorldMatrix(true);
        if (!this.mesh.rotationQuaternion) {
            this.mesh.rotationQuaternion = Quaternion.FromEulerVector(this.mesh.rotation);
        }

        // Устанавливаем DYNAMIC режим для физики (вместо ANIMATED)
        this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);

        // Настраиваем массу и центр масс
        // КРИТИЧНО: Центр масс должен быть в (0,0,0) чтобы избежать самопроизвольного вращения!
        this.physicsBody.setMassProperties({
            mass: 1500, // Уменьшенная масса для лучшей манёвренности
            centerOfMass: new Vector3(0, 0, 0), // Точно в центре!
            inertia: new Vector3(5000, 5000, 5000) // Равномерная инерция
        });

        // Устанавливаем демпфирование для плавного движения
        this.physicsBody.setLinearDamping(0.1);
        this.physicsBody.setAngularDamping(0.5); // Умеренное демпфирование вращения

        // КРИТИЧНО: Отключаем pre-step для правильной синхронизации
        this.physicsBody.disablePreStep = false;

        // КРИТИЧНО: Обнуляем начальную угловую скорость!
        try {
            const body = this.physicsBody as any;
            if (body.setAngularVelocity) {
                body.setAngularVelocity(new Vector3(0, 0, 0));
            }
            if (body.setLinearVelocity) {
                body.setLinearVelocity(new Vector3(0, 0, 0));
            }
            // Отключаем гравитацию для самолёта
            if (body.setGravityFactor) {
                body.setGravityFactor(0); // Полностью отключаем гравитацию
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Failed to reset velocities:", e);
        }

        // Инициализация подсистем
        this.mouseAimSystem = new MouseAimSystem(scene, camera, this.config.mouseAim);
        this.pidController = new PIDController(this.config.pid);


        this.aerodynamicsSystem = new AerodynamicsSystem(this.config.aerodynamics);

        // Запоминаем время спавна для задержки mouse aim
        this._spawnTime = Date.now();

        // Стартовая тяга 0% при спавне (как просил пользователь)
        this.aerodynamicsSystem.setThrottle(0.0);
        // const initialSpeed = 55.0;
        // const forward = this.mesh.forward;
        // const initialVelocity = new Vector3(
        //     forward.x * initialSpeed,
        //     forward.y * initialSpeed,
        //     forward.z * initialSpeed
        // );
        // this.physicsBody.setLinearVelocity(initialVelocity);

        // Самолёт спавнится на земле (y~1.2) — поднимаем в воздух сразу
        const pos = this.mesh.getAbsolutePosition();
        if (pos.y < this.config.minAltitude) {
            this.mesh.setAbsolutePosition(new Vector3(pos.x, this.config.minAltitude, pos.z));
        }

        // СОБСТВЕННЫЙ обработчик клавиатуры для самолёта (не зависит от TankController)
        this._keyboardState = {};

        this._keyDownHandler = (e: KeyboardEvent) => {
            if (this._keyboardState[e.code]) return; // Ignore repeat
            this._keyboardState[e.code] = true;

            // DEBUG: Log W/S press
            if (e.code === "KeyW" || e.code === "KeyS") {
                console.log(`[Aircraft] Key pressed: ${e.code}`);
            }

            const now = performance.now();
            const DOUBLE_TAP_WINDOW = 300; // мс для двойного нажатия

            // Двойное нажатие R = автоматический газ до максимума
            if (e.code === "KeyR") {
                if (now - this._lastQPressTime < DOUBLE_TAP_WINDOW) {
                    this._autoThrottleTarget = 1; // К максимуму
                    console.log("[Aircraft] Auto-throttle: MAX");
                }
                this._lastQPressTime = now;
            }

            // Двойное нажатие F = автоматический сброс газа до нуля
            if (e.code === "KeyF") {
                if (now - this._lastEPressTime < DOUBLE_TAP_WINDOW) {
                    this._autoThrottleTarget = 0; // К нулю
                    console.log("[Aircraft] Auto-throttle: IDLE");
                }
                this._lastEPressTime = now;
            }

            // Обработка Shift для свободного обзора
            if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
                this._isFreeLookActive = true;
                if (this.camera) {
                    const canvas = this.scene.getEngine().getRenderingCanvas();
                    this.camera.attachControl(canvas, true);
                }
            }
        };
        this._keyUpHandler = (e: KeyboardEvent) => {
            this._keyboardState[e.code] = false;

            // Обработка Shift для отключения свободного обзора
            if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
                this._isFreeLookActive = false;
                if (this.camera) {
                    this.camera.detachControl();

                    // Сброс камеры в дефолтное положение (сзади)
                    // (alpha = -Math.PI / 2 - сзади для ArcRotateCamera)
                    if ("alpha" in this.camera) {
                        const arcCam = this.camera as any;
                        // Плавный возврат можно сделать через update, но пока мгновенно
                        // arcCam.alpha = -Math.PI / 2;
                        // arcCam.beta = Math.PI / 3;
                        // Пользователь может хотеть чтобы камера оставалась там где была?
                        // Обычно она возвращается.
                        // Оставим пока без возврата, если попросит - добавим.
                    }
                }
            }
        };

        window.addEventListener("keydown", this._keyDownHandler);
        window.addEventListener("keyup", this._keyUpHandler);

        // По умолчанию отключаем управление камерой (свободный обзор только через Shift)
        try {
            if (this.camera) {
                this.camera.detachControl();
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Failed to detach camera:", e);
        }

        // ZERO BOUNCE FIX: Set restitution to 0
        try {
            if (this.physicsBody && (this.physicsBody as any).shape) {
                (this.physicsBody as any).shape.material = { restitution: 0.0, friction: 0.5 };
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Failed to set restitution:", e);
        }
    }

    // Собственное состояние клавиатуры
    private _keyboardState: Record<string, boolean> = {};
    private _keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
    private _keyUpHandler: ((e: KeyboardEvent) => void) | null = null;

    private _isFreeLookActive: boolean = false; // Флаг свободного обзора

    /**
     * Обновить позицию мыши на экране (вызывается из Game.ts)
     * @param screenX X координата мыши на экране (0-1)
     * @param screenY Y координата мыши на экране (0-1)
     */
    public updateMouseScreenPosition(screenX: number, screenY: number): void {
        this.mouseScreenX = Math.max(0, Math.min(1, screenX));
        this.mouseScreenY = Math.max(0, Math.min(1, screenY));
        this.mouseAimSystem.updateMousePosition(this.mouseScreenX, this.mouseScreenY);
    }

    /** Множитель чувствительности мыши при pointer lock (для Game.ts) */
    public getPointerLockSensitivityMultiplier(): number {
        return this.config.mouseAim.pointerLockSensitivityMultiplier ?? 0.4;
    }

    /**
     * Set explicit target override for AI (skips mouse unproject)
     */
    public setTargetOverride(target: Vector3 | null): void {
        this.mouseAimSystem.setOverrideTarget(target);
    }

    /** Минимальная скорость (м/с) для показа STALL — ниже не показываем (для Game/HUD) */
    public getStallWarningMinSpeed(): number {
        return this.config.stallWarningMinSpeed ?? 8;
    }

    /**
     * Обновить позицию мыши для Mouse Aim (0-1)
     */
    public updateMousePosition(x: number, y: number): void {
        this.mouseScreenX = x;
        this.mouseScreenY = y;
        this.mouseAimSystem.updateMousePosition(x, y);
    }

    public dispose(): void {
        // Очищаем обработчики клавиатуры
        if (this._keyDownHandler) {
            window.removeEventListener("keydown", this._keyDownHandler);
            this._keyDownHandler = null;
        }
        if (this._keyUpHandler) {
            window.removeEventListener("keyup", this._keyUpHandler);
            this._keyUpHandler = null;
        }

        if (this.physicsBody) {
            this.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
        }
    }

    public update(dt: number): void {
        if (!this.mesh || !this.physicsBody || this.physicsBody.isDisposed) return;

        const clampedDt = Math.min(dt, 0.033);
        this.updateCache();

        const body = this.physicsBody as any;
        const speed = this.cachedVelocity?.length?.() ?? 0;

        // ==== 1. THROTTLE (R/F keys) ====
        this.updateThrottle(clampedDt);

        // ==== 2. KEYBOARD CONTROL ====
        // Read keyboard state directly
        const W = this._keyboardState["KeyW"] ?? false;
        const S = this._keyboardState["KeyS"] ?? false;
        const A = this._keyboardState["KeyA"] ?? false;
        const D = this._keyboardState["KeyD"] ?? false;
        const Q = this._keyboardState["KeyQ"] ?? false;
        const E = this._keyboardState["KeyE"] ?? false;

        let pitchInput = 0;
        let rollInput = 0;
        let yawInput = 0;

        // WASD controls
        if (W) pitchInput = 1.0;   // Pitch up
        if (S) pitchInput = -1.0;  // Pitch down
        if (A) rollInput = 1.0;    // Roll left
        if (D) rollInput = -1.0;   // Roll right
        if (Q) yawInput = -1.0;    // Yaw left
        if (E) yawInput = 1.0;     // Yaw right

        const hasKeyboardInput = W || S || A || D || Q || E;

        // ==== 3. APPLY ROTATION ====
        try {
            // Get current angular velocity
            const currentAngVel = body.getAngularVelocity ? body.getAngularVelocity() : new Vector3(0, 0, 0);

            // IMPACT PROTECTION: Limit angular velocity to prevent spinning on hit
            const MAX_ANG_VEL = 3.0; // rad/s
            if (currentAngVel.length() > MAX_ANG_VEL) {
                const clamped = currentAngVel.normalize().scale(MAX_ANG_VEL);
                body.setAngularVelocity(clamped);
            }

            if (hasKeyboardInput) {
                // Apply keyboard rotation
                const PITCH_SPEED = 12.0;
                const ROLL_SPEED = 14.0;
                const YAW_SPEED = 25.0;
                const MAX_SPEED = 3.0;

                // Calculate delta rotation in local space
                const localDelta = new Vector3(
                    pitchInput * PITCH_SPEED * clampedDt,
                    yawInput * YAW_SPEED * clampedDt,
                    rollInput * ROLL_SPEED * clampedDt
                );

                // Transform to world space
                const worldDelta = this.transformToWorldSpace(localDelta);

                // Add to current angular velocity
                let newAngVel = new Vector3(
                    currentAngVel.x + worldDelta.x,
                    currentAngVel.y + worldDelta.y,
                    currentAngVel.z + worldDelta.z
                );

                // Clamp max rotation speed
                if (newAngVel.length() > MAX_SPEED) {
                    newAngVel = newAngVel.normalize().scale(MAX_SPEED);
                }

                body.setAngularVelocity(newAngVel);
                body.setAngularDamping(0.5);
            } else {
                // No input - Auto-level (Vertical Stabilization / Wings Level ONLY)
                // Стабилизация "Только по вертикали" = Держим крылья в уровне, но нос (Pitch) не трогаем!
                // Это позволяет делать петли и летать вверх/вниз без борьбы с авто-левелом.

                const currentUp = this.cachedUp;
                const targetUp = Vector3.Up();

                // Вектор нужного вращения для совмещения Up -> WorldUp
                const levelingAxis = Vector3.Cross(currentUp, targetUp);

                // ПРОЕЦИРУЕМ коррекцию только на ось Roll (Forward axis)
                // Pitch (вращение вокруг Right) игнорируем!
                const forward = this.cachedForward;
                const rollComponent = Vector3.Dot(levelingAxis, forward);
                const rollCorrection = forward.scale(rollComponent);

                // Gain уменьшен для плавности (Smoothness)
                const STAB_GAIN = 1.0;
                const correction = rollCorrection.scale(STAB_GAIN);

                // Плавное затухание (Smoother damping)
                // Уменьшаем текущее вращение (Damping), но слабее чем раньше (для плавности)
                // Было: dampedCurrent = scale(0.9) -> это резкая остановка.
                // Сделаем более плавную инерцию.
                const dampingFactor = 0.96; // Меньше тормозим, больше инерции = плавнее
                const dampedCurrent = currentAngVel.scale(dampingFactor);

                // Применяем коррекцию
                body.setAngularVelocity(dampedCurrent.add(correction));

                // Damping физического движка тоже мягче
                body.setAngularDamping(0.8);
            }
        } catch (e) {
            console.warn("[AircraftPhysics] rotation error:", e);
        }

        // ==== 4. THRUST ====
        const throttle = this.aerodynamicsSystem.getThrottle();
        if (throttle > 0) {
            try {
                const thrustMag = this.config.aerodynamics.maxThrust * throttle;
                const thrustDir = this.cachedForward.clone().normalize();
                const thrustForce = thrustDir.scale(thrustMag * clampedDt / this.config.mass);

                const currentVel = body.getLinearVelocity ? body.getLinearVelocity() : new Vector3(0, 0, 0);
                const newVel = currentVel.add(thrustForce);

                // Clamp max speed
                if (newVel.length() > this.config.maxSpeed) {
                    body.setLinearVelocity(newVel.normalize().scale(this.config.maxSpeed));
                } else {
                    body.setLinearVelocity(newVel);
                }
            } catch (e) { }
        }

        // ==== 5. DRAG ====
        if (speed > 1.0) {
            try {
                const dragCoef = this.config.aerodynamics.zeroLiftDragCoefficient;
                const dragForce = speed * speed * dragCoef * 0.001;
                const currentVel = body.getLinearVelocity();
                const brakeFactor = Math.max(0.9, 1.0 - dragForce * clampedDt);
                body.setLinearVelocity(currentVel.scale(brakeFactor));
            } catch (e) { }
        }

        // ==== 6. GRAVITY OFF ====
        try {
            if (body.setGravityFactor) body.setGravityFactor(0);
        } catch (e) { }
    }









    /**
     * Обновить кэш для производительности
     */
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
            console.warn("[AircraftPhysics] updateCache error:", e);
            this.cachedPosition = this.cachedPosition || Vector3.Zero();
            this.cachedForward = this.cachedForward || Vector3.Forward();
            this.cachedUp = this.cachedUp || Vector3.Up();
            this.cachedRight = this.cachedRight || Vector3.Right();
            this.cachedVelocity = this.cachedVelocity || Vector3.Zero();
        }
    }


    /**
     * Обновить тягу на основе ввода
     */
    private updateThrottle(dt: number): void {
        const key = (code: string) => !!(this._keyboardState[code] ?? this.controller?._inputMap?.[code]);

        // Автоматическое изменение газа (двойное нажатие Q/E)
        if (this._autoThrottleTarget >= 0) {
            const currentThrottle = this.aerodynamicsSystem.getThrottle();
            const targetThrottle = this._autoThrottleTarget;
            const diff = targetThrottle - currentThrottle;

            if (Math.abs(diff) < 0.01) {
                // Достигли цели
                this._autoThrottleTarget = -1;
                if (targetThrottle === 1) {
                    this.aerodynamicsSystem.setThrottle(1.0);
                } else {
                    this.aerodynamicsSystem.setThrottle(0.0);
                }
            } else {
                // Плавное изменение
                const step = this._autoThrottleSpeed * dt;
                if (diff > 0) {
                    this.aerodynamicsSystem.setThrottle(Math.min(1.0, currentThrottle + step));
                } else {
                    this.aerodynamicsSystem.setThrottle(Math.max(0.0, currentThrottle - step));
                }
            }
        }

        // Ручное управление газом (отменяет авто-газ)
        // ИЗМЕНЕНО: R — увеличение тяги, F — уменьшение + активный тормоз
        if (key("KeyR")) {
            this._autoThrottleTarget = -1; // Отменяем авто-газ
            this.aerodynamicsSystem.increaseThrottle(dt);
        }
        if (key("KeyF")) {
            this._autoThrottleTarget = -1; // Отменяем авто-газ
            this.aerodynamicsSystem.decreaseThrottle(dt);

            // Активный airbrake при E — уменьшаем скорость напрямую
            try {
                const body = this.physicsBody as any;
                if (body && body.getLinearVelocity && body.setLinearVelocity) {
                    const vel = body.getLinearVelocity();
                    if (vel && isFinite(vel.x) && isFinite(vel.y) && isFinite(vel.z)) {
                        const brakeFactor = Math.max(0, 1 - 0.15 * dt);
                        const newVel = vel.scale(brakeFactor);
                        body.setLinearVelocity(newVel);
                    }
                }
            } catch (e) {
                // Ignore errors
            }
        }

    }



    /**
     * Получить переопределение клавиатуры
     */
    private getKeyboardOverride(dt: number): { pitch: number; yaw: number; roll: number } {
        let pitch = 0;
        let yaw = 0;
        let roll = 0;

        const inputMap = this.controller?._inputMap;
        if (!inputMap) return { pitch, yaw, roll };

        // W/S — тяга (не pitch); обрабатывается в updateThrottle

        // A/D - Roll
        if (inputMap["KeyA"]) {
            roll = this.config.keyboard.rollSensitivity * dt;
        } else if (inputMap["KeyD"]) {
            roll = -this.config.keyboard.rollSensitivity * dt;
        }

        // W/S - Pitch (не Q/E - Q/E теперь управляют тягой!)
        if (inputMap["KeyW"]) {
            pitch = this.config.keyboard.pitchSensitivity * dt;   // Нос вверх
        } else if (inputMap["KeyS"]) {
            pitch = -this.config.keyboard.pitchSensitivity * dt;   // Нос вниз
        }

        return { pitch, yaw, roll };
    }

    /**
     * Преобразовать вектор из локального пространства в мировое
     */
    private transformToWorldSpace(localVector: Vector3): Vector3 {
        // Защитные проверки
        if (!localVector || !isFinite(localVector.x) || !isFinite(localVector.y) || !isFinite(localVector.z)) {
            return Vector3.Zero();
        }

        if (!this.mesh || !this.mesh.rotationQuaternion) {
            // Если нет кватерниона, возвращаем новый вектор (не мутируем исходный)
            return new Vector3(localVector.x, localVector.y, localVector.z);
        }

        try {
            // Проверяем кватернион на валидность перед преобразованием
            const quat = this.mesh.rotationQuaternion;
            if (!quat || !isFinite(quat.x) || !isFinite(quat.y) || !isFinite(quat.z) || !isFinite(quat.w)) {
                return new Vector3(localVector.x, localVector.y, localVector.z);
            }

            // Используем правильный метод для преобразования кватерниона в матрицу
            const rotationMatrix = Matrix.Identity();
            Matrix.FromQuaternionToRef(quat, rotationMatrix);

            // Преобразуем вектор через матрицу поворота
            const result = Vector3.TransformNormal(localVector, rotationMatrix);

            // Проверяем результат на валидность и создаём новый вектор для безопасности
            if (result && isFinite(result.x) && isFinite(result.y) && isFinite(result.z)) {
                // Создаём новый вектор вместо возврата результата напрямую
                // Это гарантирует, что Havok получит валидный объект Vector3
                return new Vector3(result.x, result.y, result.z);
            } else {
                return Vector3.Zero();
            }
        } catch (e) {
            console.warn("[AircraftPhysics] transformToWorldSpace error:", e);
            return Vector3.Zero();
        }
    }

    /**
     * Проверить, нет ли ввода
     */
    /** Нет ввода по крену/тангажу/рысканию (Q/E — тяга, не учитываем) */
    private isNoInput(): boolean {
        const inputMap = this._keyboardState;
        return !inputMap["KeyA"] && !inputMap["KeyD"] &&
            !inputMap["KeyW"] && !inputMap["KeyS"];
    }

    /**
     * Применить автовыравнивание
     */
    private applyAutoLevel(dt: number): void {
        const body = this.physicsBody as any;
        if (!body || !body.setAngularVelocity) return;

        // Векторная стабилизация
        const right = this.cachedRight;
        const forward = this.cachedForward;

        const STABILITY_SPEED = 2.0;

        // 1. ROLL STABILIZATION
        // Если right.y > 0 (левое крыло задрано), надо крутить ВПРАВО (Roll Input = -1)
        // Если right.y < 0 (правое крыло задрано), надо крутить ВЛЕВО (Roll Input = 1)
        // Формула: -right.y * speed
        let rollCorrection = -right.y * STABILITY_SPEED;

        // 2. PITCH STABILIZATION (Выравнивание носа в горизонт)
        // Если forward.y > 0 (нос вверх), надо PITCH DOWN (Pitch Input = -1 за счет W)
        // Если forward.y < 0 (нос вниз), надо PITCH UP (Pitch Input = 1 за счет S)
        // В моей системе Pitch Input = 1 -> S -> Нос Вверх.
        // Значит если forward.y < 0, нам нужен +Input.
        // Формула: -forward.y * speed
        let pitchCorrection = -forward.y * STABILITY_SPEED;

        // Коррекция вращения (в локальных координатах)
        // x: pitch, y: yaw, z: roll
        const localCorrection = new Vector3(
            pitchCorrection,
            0,
            rollCorrection
        );

        // Преобразуем в мир
        const worldCorrection = this.transformToWorldSpace(localCorrection);

        // Применяем
        body.setAngularVelocity(worldCorrection);
    }

    /**
     * Получить текущую скорость
     */
    public getSpeed(): number {
        return this.cachedVelocity.length();
    }

    /**
     * Получить целевую точку Mouse-Aim
     */
    public getTargetPoint(): Vector3 {
        return this.mouseAimSystem.getTargetPoint();
    }

    /**
     * Получить текущее направление самолёта
     */
    public getForwardDirection(): Vector3 {
        return this.cachedForward.clone();
    }

    /**
     * Получить процент тяги
     */
    public getThrottle(): number {
        return this.aerodynamicsSystem.getThrottle();
    }

    /**
     * Получить текущий угол атаки
     */
    public getAngleOfAttack(): number {
        const velocity = this.cachedVelocity.length();
        const velocityDirection = velocity > 0.1 ? this.cachedVelocity.normalize() : this.cachedForward;
        return this.aerodynamicsSystem.calculateAngleOfAttack(this.cachedForward, velocityDirection);
    }

    /**
     * Проверить, находится ли самолёт в сваливании
     */
    public isStalling(): boolean {
        const angleOfAttack = this.getAngleOfAttack();
        return this.aerodynamicsSystem.isStalling(angleOfAttack);
    }

    /**
     * Вычислить текущую перегрузку (G-force)
     */
    public calculateGForce(): number {
        if (!this.physicsBody) return 1.0;

        try {
            // Получаем ускорение из изменения скорости
            const currentVelocity = this.cachedVelocity;
            const speed = currentVelocity.length();

            // Аппроксимируем G-force через угол наклона и скорость поворота
            // G = 1 + (v² / (r * g)) где r - радиус поворота
            // Упрощённо: используем угловую скорость
            const angularVelocity = this.physicsBody.getAngularVelocity();
            const angularSpeed = angularVelocity.length();

            // Базовая перегрузка от гравитации
            let gForce = 1.0;

            // Добавляем перегрузку от поворотов (центробежная сила)
            if (speed > 0.1 && angularSpeed > 0.1) {
                // Упрощённая модель: G увеличивается при поворотах
                const turnG = Math.min(5.0, angularSpeed * speed * 0.01);
                gForce += turnG;
            }

            // Добавляем перегрузку от изменения pitch (подъём/пикирование)
            const pitchRate = Math.abs(angularVelocity.x);
            if (pitchRate > 0.1) {
                const pitchG = Math.min(3.0, pitchRate * speed * 0.005);
                gForce += pitchG;
            }

            return Math.max(0.1, Math.min(15.0, gForce)); // Ограничиваем диапазон
        } catch (e) {
            // Если физическое тело удалено, возвращаем 1.0
            return 1.0;
        }
    }

    /**
     * Получить текущее направление "вверх" самолёта
     */
    public getUpDirection(): Vector3 {
        return this.cachedUp.clone();
    }

    /**
     * Получить текущее направление "вправо" самолёта
     */
    public getRightDirection(): Vector3 {
        return this.cachedRight.clone();
    }
}
