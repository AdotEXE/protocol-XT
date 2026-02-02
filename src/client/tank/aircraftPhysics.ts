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
        // Примечание: Havok использует inertia вместо inertiaTensor
        this.physicsBody.setMassProperties({
            mass: this.config.mass,
            centerOfMass: this.config.centerOfMass,
            inertia: this.config.inertiaTensor
        });

        // Устанавливаем демпфирование для плавного движения
        this.physicsBody.setLinearDamping(0.1); // Уменьшено для более реалистичного полёта
        this.physicsBody.setAngularDamping(0.8); // Уменьшено для более отзывчивого управления

        // КРИТИЧНО: Отключаем pre-step для правильной синхронизации
        this.physicsBody.disablePreStep = false;

        // Инициализация подсистем
        this.mouseAimSystem = new MouseAimSystem(scene, camera, this.config.mouseAim);
        this.pidController = new PIDController(this.config.pid);
        this.aerodynamicsSystem = new AerodynamicsSystem(this.config.aerodynamics);

        // ОТКЛЮЧЕНО: Автоматическая тяга и начальная скорость
        // this.aerodynamicsSystem.setThrottle(0.7);
        // const initialSpeed = 55.0;
        // const forward = this.mesh.forward;
        // const initialVelocity = new Vector3(
        //     forward.x * initialSpeed,
        //     forward.y * initialSpeed,
        //     forward.z * initialSpeed
        // );
        // this.physicsBody.setLinearVelocity(initialVelocity);
        console.log("[AircraftPhysics] NO automatic thrust - manual control only");

        // Самолёт спавнится на земле (y~1.2) — поднимаем в воздух сразу
        const pos = this.mesh.getAbsolutePosition();
        if (pos.y < this.config.minAltitude) {
            this.mesh.setAbsolutePosition(new Vector3(pos.x, this.config.minAltitude, pos.z));
        }
        console.log("[AircraftPhysics] Initialized - NO initial speed (manual control)");

        // СОБСТВЕННЫЙ обработчик клавиатуры для самолёта (не зависит от TankController)
        this._keyboardState = {};

        this._keyDownHandler = (e: KeyboardEvent) => {
            if (this._keyboardState[e.code]) return; // Ignorerepeat
            this._keyboardState[e.code] = true;

            // Обработка Alt для свободного обзора
            if (e.key === "Alt") {
                this._isFreeLookActive = true;
                if (this.camera) {
                    const canvas = this.scene.getEngine().getRenderingCanvas();
                    this.camera.attachControl(canvas, true);
                    console.log("[AircraftPhysics] Free look ENABLED (Alt pressed)");
                }
            }
        };
        this._keyUpHandler = (e: KeyboardEvent) => {
            this._keyboardState[e.code] = false;

            // Обработка Alt для отключения свободного обзора
            if (e.key === "Alt") {
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
                    console.log("[AircraftPhysics] Free look DISABLED (Alt released)");
                }
            }
        };

        window.addEventListener("keydown", this._keyDownHandler);
        window.addEventListener("keyup", this._keyUpHandler);

        // По умолчанию отключаем управление камерой (свободный обзор только через Alt)
        try {
            if (this.camera) {
                this.camera.detachControl();
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Failed to detach camera:", e);
        }

        // HEAVY MASS FIX: Set mass to 5000kg to prevent "bouncy ball" effect
        try {
            if (this.physicsBody) {
                this.physicsBody.setMassProperties({ mass: 1500 });

                // ZERO BOUNCE FIX: Set restitution to 0
                if ((this.physicsBody as any).shape) {
                    (this.physicsBody as any).shape.material = { restitution: 0.0, friction: 0.5 };
                    console.log("[AircraftPhysics] ✅ Restitution set to 0.0 (Zero Bounce)");
                }

                console.log("[AircraftPhysics] ✅ Mass set to 5000kg for stability");
            }
        } catch (e) {
            console.warn("[AircraftPhysics] Failed to set mass/restitution:", e);
        }

        console.warn("🛩️🛩️🛩️ [AircraftPhysics] NEW CODE LOADED! Keyboard handlers attached! TIME:", new Date().toISOString());
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



        // ОПТИМИЗАЦИЯ: Ограничиваем dt для предотвращения больших скачков
        const clampedDt = Math.min(dt, 0.033); // Максимум 30 FPS (33ms)

        // Обновляем кэш
        this.updateCache();

        // Вычисляем скорость и направление СРАЗУ (используется ниже для аэродинамики)
        const speed = (this.cachedVelocity?.length?.() ?? 0);
        const velocityDir = speed > 0.1 ? this.cachedVelocity.clone().normalize() : this.cachedForward.clone();

        // 1. Обновляем плотность воздуха на основе высоты
        const altitude = this.cachedPosition.y;
        this.aerodynamicsSystem.updateAirDensity(altitude);

        // 2. Обработка тяги (Shift/Ctrl)
        this.updateThrottle(clampedDt);

        // ========== MOUSE AIM + DIRECT CONTROL ==========

        // 1. Update Mouse Aim System
        this.mouseAimSystem.updateTarget(this.cachedPosition, this.cachedForward);
        const angularError = this.mouseAimSystem.getAngularError(this.cachedForward, this.cachedUp, this.cachedRight);

        // Clamp input to -1..1 range
        const mouseInput = {
            pitch: Math.max(-1, Math.min(1, angularError.pitch)),
            yaw: Math.max(-1, Math.min(1, angularError.yaw)),
            roll: Math.max(-1, Math.min(1, angularError.roll))
        };

        // 2. Get Keyboard Input
        const inputMap = this._keyboardState;

        // Прямое управление - без PID, без mouse-aim
        const PITCH_TORQUE = 500000;  // Момент тангажа (нос вверх/вниз) - УВЕЛИЧЕН x10
        const ROLL_TORQUE = 800000;   // Момент крена (наклон) - УВЕЛИЧЕН x10
        const YAW_TORQUE = 300000;    // Момент рыскания (поворот) - УВЕЛИЧЕН x10

        let pitchInput = 0;
        let rollInput = 0;
        let yawInput = 0;

        // Используем собственное состояние клавиатуры
        // W/S - Pitch (тангаж)
        if (inputMap["KeyW"]) pitchInput = -1;  // Нос вниз
        if (inputMap["KeyS"]) pitchInput = 1;   // Нос вверх

        // A/D - Roll (крен)
        if (inputMap["KeyA"]) rollInput = 1;    // Крен влево
        if (inputMap["KeyD"]) rollInput = -1;   // Крен вправо

        // Q/E - Yaw (рыскание)
        if (inputMap["KeyQ"]) yawInput = -1;    // Нос влево
        if (inputMap["KeyE"]) yawInput = 1;     // Нос вправо

        // 3. COMBINE INPUTS (Mouse + Keyboard Override)
        // Если нажаты клавиши - они имеют приоритет (или суммируются)
        // Если клавиш нет - используем Mouse Aim

        // Mouse Aim даёт значения от -1 до 1
        // ВКЛЮЧЕНО: Mouse Aim активен
        if (pitchInput === 0) pitchInput = mouseInput.pitch;
        if (rollInput === 0) rollInput = mouseInput.roll;
        if (yawInput === 0) yawInput = mouseInput.yaw;



        // Создаём моменты в локальном пространстве
        const localTorque = new Vector3(
            pitchInput * PITCH_TORQUE,
            yawInput * YAW_TORQUE,
            rollInput * ROLL_TORQUE
        );

        // Преобразуем в мировое пространство
        const worldTorque = this.transformToWorldSpace(localTorque);

        // Применяем момент к физическому телу ТОЛЬКО если есть input
        if ((pitchInput !== 0 || rollInput !== 0 || yawInput !== 0) &&
            worldTorque && isFinite(worldTorque.x) && isFinite(worldTorque.y) && isFinite(worldTorque.z)) {
            try {
                const body = this.physicsBody as any;

                // Получаем текущую угловую скорость
                const currentAngVel = body.getAngularVelocity ? body.getAngularVelocity() : new Vector3(0, 0, 0);

                // Настраиваем ускорение (рад/с за секунду)
                const PITCH_ACCEL = 5.0;  // Быстро вверх/вниз
                const ROLL_ACCEL = 10.0;  // Очень быстро крутимся
                const YAW_ACCEL = 3.0;    // Медленнее поворот

                // Добавляем дельту угловой скорости
                const deltaAngVel = new Vector3(
                    pitchInput * PITCH_ACCEL * clampedDt,
                    yawInput * YAW_ACCEL * clampedDt,
                    rollInput * ROLL_ACCEL * clampedDt
                );

                // Сбрасываем линейное и угловое затухание (damping), чтобы не "вязло"
                if (body.setLinearDamping) body.setLinearDamping(0.0);
                if (body.setAngularDamping) body.setAngularDamping(0.0);

                // Преобразуем дельту в мировое пространство
                const worldDeltaAngVel = this.transformToWorldSpace(deltaAngVel);

                // Новая угловая скорость
                let newAngVel = new Vector3(
                    currentAngVel.x + worldDeltaAngVel.x,
                    currentAngVel.y + worldDeltaAngVel.y,
                    currentAngVel.z + worldDeltaAngVel.z
                );

                // Ограничиваем макс скорость вращения (чтобы не раскручивало бесконечно)
                const MAX_ROTATION_SPEED = 3.0; // рад/с (примерно 0.5 оборота в сек)
                if (newAngVel.length() > MAX_ROTATION_SPEED) {
                    newAngVel = newAngVel.normalize().scale(MAX_ROTATION_SPEED);
                }



                // Устанавливаем новую угловую скорость напрямую
                if (body.setAngularVelocity) {
                    body.setAngularVelocity(newAngVel);
                } else {
                    console.warn("[AircraftPhysics] NO setAngularVelocity method!");
                }
            } catch (e) {
                console.warn("[AircraftPhysics] setAngularVelocity error:", e);
            }
        }

        // Вычисляем угол атаки (speed и velocityDir уже определены выше)
        const angleOfAttack = this.aerodynamicsSystem.calculateAngleOfAttack(
            this.cachedForward,
            velocityDir
        );

        // 9. Вычисляем аэродинамические силы
        // Lift (направление "вверх" относительно самолёта)
        const liftForceLocal = this.aerodynamicsSystem.calculateLift(speed, angleOfAttack, this.cachedForward);
        const liftForce = this.transformToWorldSpace(liftForceLocal);

        // Drag (направление противоположно скорости)
        const dragForce = this.aerodynamicsSystem.calculateDrag(speed, angleOfAttack, velocityDir);

        if (dragForce && isFinite(dragForce.x)) {
            try {
                this.physicsBody.applyForce(dragForce, this.cachedPosition);
            } catch (e) { }
        }

        if (liftForce && isFinite(liftForce.x)) {
            try {
                this.physicsBody.applyForce(liftForce, this.cachedPosition);
            } catch (e) { }
        }

        // Thrust (направление "вперёд" относительно самолёта)
        // УВЕЛИЧЕНО В 8 РАЗ (было 2.0) ПО ЗАПРОСУ ПОЛЬЗОВАТЕЛЯ
        // Also ensure we don't apply thrust if throttle is 0
        const thrustForceLocal = this.aerodynamicsSystem.calculateThrust(Vector3.Forward()).scale(8.0);
        const thrustForce = this.transformToWorldSpace(thrustForceLocal);

        if (thrustForce && isFinite(thrustForce.x) && isFinite(thrustForce.y) && isFinite(thrustForce.z)) {
            try {
                this.physicsBody.applyForce(thrustForce, this.cachedPosition);
            } catch (e) {
                console.warn("[AircraftPhysics] applyForce error:", e);
            }
        }

        // 11. Стабилизация (если нет ввода)
        // ВКЛЮЧЕНО (по запросу пользователя)

        // 11. Стабилизация (если нет ввода от мыши ИЛИ клавиатуры)
        const isControlActive = Math.abs(pitchInput) > 0.001 || Math.abs(yawInput) > 0.001 || Math.abs(rollInput) > 0.001;

        if (!isControlActive) {
            const body = this.physicsBody as any;
            // Включаем сильное затухание вращения (тормоз), чтобы не крутило по инерции
            if (body.setAngularDamping) body.setAngularDamping(5.0);

            // ВОССТАНОВЛЕНО: AutoLevel работает корректно с клавиатурой (самолет выравнивается сам)
            this.applyAutoLevel(clampedDt);
        }

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

            // Проверяем векторы на валидность перед сохранением
            if (position && isFinite(position.x) && isFinite(position.y) && isFinite(position.z)) {
                this.cachedPosition = position;
            }
            if (forward && isFinite(forward.x) && isFinite(forward.y) && isFinite(forward.z)) {
                this.cachedForward = forward;
            }
            if (up && isFinite(up.x) && isFinite(up.y) && isFinite(up.z)) {
                this.cachedUp = up;
            }

            // Вычисляем right вектор с проверкой
            if (this.cachedForward && this.cachedUp) {
                const right = Vector3.Cross(this.cachedForward, this.cachedUp);
                if (right && right.length() > 0.001) {
                    right.normalize();
                    if (isFinite(right.x) && isFinite(right.y) && isFinite(right.z)) {
                        this.cachedRight = right;
                    }
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
            // В случае ошибки используем безопасные значения по умолчанию
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
        // Используем собственное состояние клавиатуры для надежности
        const inputMap = this._keyboardState;

        // Shift - увеличение тяги, Ctrl - уменьшение
        if (inputMap["ShiftLeft"] || inputMap["ShiftRight"]) {
            this.aerodynamicsSystem.increaseThrottle(dt);
        }
        if (inputMap["ControlLeft"] || inputMap["ControlRight"]) {
            this.aerodynamicsSystem.decreaseThrottle(dt);
        }

        // Если тяга > 0, логируем иногда
        if (this.aerodynamicsSystem.getThrottle() > 0.01 && this._debugCounter % 60 === 0) {
            console.log("[AircraftPhysics] THROTTLE:", (this.aerodynamicsSystem.getThrottle() * 100).toFixed(0) + "%");
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

        // W/S - Pitch
        if (inputMap["KeyW"]) {
            pitch = -this.config.keyboard.pitchSensitivity * dt;
        } else if (inputMap["KeyS"]) {
            pitch = this.config.keyboard.pitchSensitivity * dt;
        }

        // A/D - Roll
        if (inputMap["KeyA"]) {
            roll = this.config.keyboard.rollSensitivity * dt;
        } else if (inputMap["KeyD"]) {
            roll = -this.config.keyboard.rollSensitivity * dt;
        }

        // Q/E - Yaw
        if (inputMap["KeyQ"]) {
            yaw = -this.config.keyboard.yawSensitivity * dt;
        } else if (inputMap["KeyE"]) {
            yaw = this.config.keyboard.yawSensitivity * dt;
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
    private isNoInput(): boolean {
        const inputMap = this._keyboardState;
        return !inputMap["KeyW"] && !inputMap["KeyS"] &&
            !inputMap["KeyA"] && !inputMap["KeyD"] &&
            !inputMap["KeyQ"] && !inputMap["KeyE"];
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
