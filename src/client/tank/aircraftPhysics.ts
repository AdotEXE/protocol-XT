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

    // Задержка включения mouse aim после спавна (1 секунда)
    private _spawnTime: number = 0;
    private _mouseAimDelay: number = 1000; // мс

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

    /** Минимальная скорость (м/с) для показа STALL — ниже не показываем (для Game/HUD) */
    public getStallWarningMinSpeed(): number {
        return this.config.stallWarningMinSpeed ?? 8;
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

        // 2. Обработка тяги (W/S)
        this.updateThrottle(clampedDt);

        // ========== MOUSE AIM + DIRECT CONTROL ==========

        // ВРЕМЕННО ОТКЛЮЧЕНО: Mouse Aim для тестирования только клавиатуры
        const MOUSE_AIM_ENABLED = true; // Установить true для включения мыши

        // 1. Update Mouse Aim System (только если включено)
        let angularError = { pitch: 0, yaw: 0, roll: 0 };
        if (MOUSE_AIM_ENABLED) {
            this.mouseAimSystem.updateTarget(this.cachedPosition, this.cachedForward);
            angularError = this.mouseAimSystem.getAngularError(this.cachedForward, this.cachedUp, this.cachedRight);
        }

        // Плавный Mouse-Aim: gain и deadzone из конфига (меньше дрожание, плавнее следование)
        const MOUSE_AIM_GAIN = this.config.mouseAim.mouseAimGain ?? 2.2;
        const MOUSE_AIM_DEADZONE = this.config.mouseAim.mouseAimDeadzone ?? 0.05;

        const linearResponse = (value: number): number => {
            const absVal = Math.abs(value);
            if (absVal < MOUSE_AIM_DEADZONE) return 0;
            const response = (absVal - MOUSE_AIM_DEADZONE) * MOUSE_AIM_GAIN;
            return Math.sign(value) * Math.min(1, response);
        };

        const rawMousePitch = linearResponse(angularError.pitch);
        const rawMouseRoll = linearResponse(angularError.roll);
        const rawMouseYaw = linearResponse(angularError.yaw);

        // Приоритет №1: строго плавное следование за центральной точкой камеры без дёрганий
        const oldSmoothedPitch = this._smoothedMousePitch;
        const oldSmoothedRoll = this._smoothedMouseRoll;
        const oldSmoothedYaw = this._smoothedMouseYaw;
        const smooth = Math.max(0.05, Math.min(1, this.config.mouseAim.mouseAimSmoothing ?? 0.18));
        this._smoothedMousePitch += (rawMousePitch - this._smoothedMousePitch) * smooth;
        this._smoothedMouseRoll += (rawMouseRoll - this._smoothedMouseRoll) * smooth;
        this._smoothedMouseYaw += (rawMouseYaw - this._smoothedMouseYaw) * smooth;

        // Rate limit: макс. изменение сглаженного ввода за кадр — жёсткое ограничение плавности
        const maxDelta = this.config.mouseAim.maxSmoothedDeltaPerFrame ?? 0.018;
        const clampDelta = (prev: number, next: number) => {
            const d = next - prev;
            if (Math.abs(d) <= maxDelta) return next;
            return prev + Math.sign(d) * maxDelta;
        };
        this._smoothedMousePitch = clampDelta(oldSmoothedPitch, this._smoothedMousePitch);
        this._smoothedMouseRoll = clampDelta(oldSmoothedRoll, this._smoothedMouseRoll);
        this._smoothedMouseYaw = clampDelta(oldSmoothedYaw, this._smoothedMouseYaw);

        // У центра: замедлять и останавливаться, а не ускоряться. Когда ошибка мала (курсор у центра),
        // сбрасываем сглаженный ввод к нулю, чтобы самолёт перестал крутиться и точно держал центр.
        const NEAR_CENTER_THRESHOLD = 0.035;
        const nearCenter = Math.abs(rawMousePitch) < NEAR_CENTER_THRESHOLD &&
            Math.abs(rawMouseRoll) < NEAR_CENTER_THRESHOLD &&
            Math.abs(rawMouseYaw) < NEAR_CENTER_THRESHOLD;
        if (nearCenter) {
            const decay = 0.82;  // быстро гасим команду у центра
            this._smoothedMousePitch *= decay;
            this._smoothedMouseRoll *= decay;
            this._smoothedMouseYaw *= decay;
        }

        const mouseInput = {
            pitch: this._smoothedMousePitch,
            yaw: this._smoothedMouseYaw,
            roll: this._smoothedMouseRoll
        };

        // 2. Get Keyboard Input — свой _keyboardState + подстраховка из TankController._inputMap
        const key = (code: string) => !!(this._keyboardState[code] ?? this.controller?._inputMap?.[code]);

        let pitchInput = 0;
        let rollInput = 0;
        let yawInput = 0;

        // DEBUG: Check keyboard state directly
        const wPressed = this._keyboardState["KeyW"];
        const sPressed = this._keyboardState["KeyS"];

        if (key("KeyA")) rollInput = 1.0;
        if (key("KeyD")) rollInput = -1.0;

        // Q/E управляют рысканием (YAW)
        // Q/E управляют рысканием (YAW) - ПОМЕНЯЛИ МЕСТАМИ по просьбе
        if (key("KeyQ")) yawInput = -1.0; // Рыскание ВПРАВО (было влево)
        if (key("KeyE")) yawInput = 1.0;  // Рыскание ВЛЕВО (было вправо)

        // ИЗМЕНЕНО: W/S управляют тангажом
        if (wPressed || key("KeyW")) {
            pitchInput = 1.0;  // Нос вверх
        }
        if (sPressed || key("KeyS")) {
            pitchInput = -1.0; // Нос вниз
        }

        // Клавиш нет — используем сглаженный Mouse Aim (следование за курсором без дёрганий)
        const keyboardActive = wPressed || sPressed || key("KeyA") || key("KeyD") || key("KeyW") || key("KeyS") || key("KeyQ") || key("KeyE");

        // ЗАДЕРЖКА 1 СЕК: Mouse aim включается через секунду после спавна
        const mouseAimEnabled = (Date.now() - this._spawnTime) > this._mouseAimDelay;

        if (mouseAimEnabled) {
            if (pitchInput === 0) pitchInput = mouseInput.pitch;
            if (rollInput === 0) rollInput = mouseInput.roll;
            if (yawInput === 0) yawInput = mouseInput.yaw;
        }
        // До включения mouse aim - самолёт управляется только клавиатурой

        const hasInput = pitchInput !== 0 || rollInput !== 0 || yawInput !== 0;
        const MAX_ROTATION_SPEED = this.config.mouseAim.maxRotationSpeedRadPerSec ?? 1.5;

        if (hasInput) {
            try {
                const body = this.physicsBody as any;
                const currentAngVel = body.getAngularVelocity ? body.getAngularVelocity() : new Vector3(0, 0, 0);

                // ИСПРАВЛЕНО: Низкий damping чтобы самолёт мог нормально вращаться
                // Было 2.0-3.5 что полностью гасило вращение!
                const speedFactor = Math.min(1, speed / this.config.maxSpeed);
                const basAngDamp = 0.5;  // Снижено с 2.0
                const baseLinDamp = 0.2;
                const dynamicAngularDamping = basAngDamp + speedFactor * 1.0; // 0.5 - 1.5 (было 2.0-3.5)
                const dynamicLinearDamping = baseLinDamp + speedFactor * 0.3;

                if (body.setAngularDamping) body.setAngularDamping(dynamicAngularDamping);
                if (body.setLinearDamping) body.setLinearDamping(dynamicLinearDamping);

                let newAngVel: Vector3;

                if (keyboardActive) {
                    // Клавиатура: заметные изменения при нажатии A/D/Q/E — ускорения и лимит из config.keyboard
                    const PITCH_ACCEL = this.config.keyboard.pitchSensitivity ?? 14;
                    const ROLL_ACCEL = this.config.keyboard.rollSensitivity ?? 16;
                    const YAW_ACCEL = (this.config.keyboard.yawSensitivity ?? 10) * 3; // Усилен в 3 раза
                    const keyboardMaxSpeed = this.config.keyboard.maxRotationSpeedRadPerSec ?? 2.8;
                    const deltaAngVel = new Vector3(
                        pitchInput * PITCH_ACCEL * clampedDt,
                        yawInput * YAW_ACCEL * clampedDt,
                        rollInput * ROLL_ACCEL * clampedDt
                    );
                    const worldDeltaAngVel = this.transformToWorldSpace(deltaAngVel);
                    newAngVel = new Vector3(
                        currentAngVel.x + worldDeltaAngVel.x,
                        currentAngVel.y + worldDeltaAngVel.y,
                        currentAngVel.z + worldDeltaAngVel.z
                    );
                    if (newAngVel.length() > keyboardMaxSpeed) {
                        newAngVel = newAngVel.normalize().scale(keyboardMaxSpeed);
                    }
                } else {
                    // Только мышь: следование за центром — целевая угловая скорость = ошибка * gain, без накопления.
                    // У центра ошибка мала → целевая скорость мала → самолёт замедляется и останавливается (не ускоряется).
                    // Основное управление мышью:
                    const followGain = this.config.mouseAim.mouseAimFollowGain ?? 1.2;
                    const blend = Math.max(0.05, Math.min(1, this.config.mouseAim.mouseAimBlendToTarget ?? 0.14));
                    const errDeadzone = this.config.mouseAim.mouseAimDeadzone ?? 0.05;
                    const clampErr = (e: number) => Math.abs(e) < errDeadzone ? 0 : e;

                    // ИСПРАВЛЕНО: Сняты жесткие ограничения ("Отключить ограничения для круглого прицела")
                    // Теперь можно крутить головой/самолётом намного свободнее
                    const UNLIMITED_ROTATION = 10.0; // Практически безлимит

                    const targetLocalPitch = Math.max(-UNLIMITED_ROTATION, Math.min(UNLIMITED_ROTATION, clampErr(angularError.pitch) * followGain));
                    const targetLocalYaw = Math.max(-UNLIMITED_ROTATION, Math.min(UNLIMITED_ROTATION, clampErr(angularError.yaw) * followGain));
                    const targetLocalRoll = Math.max(-UNLIMITED_ROTATION, Math.min(UNLIMITED_ROTATION, clampErr(angularError.roll) * followGain));
                    const targetLocalAngVel = new Vector3(targetLocalPitch, targetLocalYaw, targetLocalRoll);
                    const targetWorldAngVel = this.transformToWorldSpace(targetLocalAngVel);
                    newAngVel = new Vector3(
                        currentAngVel.x * (1 - blend) + targetWorldAngVel.x * blend,
                        currentAngVel.y * (1 - blend) + targetWorldAngVel.y * blend,
                        currentAngVel.z * (1 - blend) + targetWorldAngVel.z * blend
                    );
                    if (newAngVel.length() > MAX_ROTATION_SPEED) {
                        newAngVel = newAngVel.normalize().scale(MAX_ROTATION_SPEED);
                    }
                }

                // Level assist при активном вводе
                const levelAssist = keyboardActive ? 0 : (this.config.levelAssistStrength ?? 0.05);
                if (levelAssist > 0) {
                    const right = this.cachedRight;
                    const forward = this.cachedForward.clone().normalize();
                    const up = this.cachedUp;
                    const targetUp = Vector3.Up();
                    const levelErrorAxis = Vector3.Cross(up, targetUp);
                    let rollErr = Vector3.Dot(levelErrorAxis, forward);
                    // let pitchErr = Vector3.Dot(levelErrorAxis, right); // ОТКЛЮЧЕНО: Pitch не трогаем
                    const STAB_GAIN = this.config.autoLevelStrength;
                    // ИСПРАВЛЕНО: Корректируем ТОЛЬКО Roll (0 по pitch)
                    const levelCorrectionLocal = new Vector3(0, 0, rollErr * STAB_GAIN);
                    const levelCorrectionVel = this.transformToWorldSpace(levelCorrectionLocal);
                    newAngVel = newAngVel.add(levelCorrectionVel.scale(levelAssist));
                    if (newAngVel.length() > MAX_ROTATION_SPEED) {
                        newAngVel = newAngVel.normalize().scale(MAX_ROTATION_SPEED);
                    }
                }

                if (body.setAngularVelocity) body.setAngularVelocity(newAngVel);
                else console.warn("[AircraftPhysics] NO setAngularVelocity method!");
            } catch (e) {
                console.warn("[AircraftPhysics] setAngularVelocity error:", e);
            }
        }

        if (hasInput) {
            try {
                // ... (existing code) ...
                if (body.setAngularVelocity) body.setAngularVelocity(newAngVel);
            } catch (e) { }
        } else {
            // Apply Trim when no input (passive stability)
            // ИСПРАВЛЕНО: Триммирование для компенсации "клевка носом"
            const trim = this.config.aerodynamics.pitchTrim ?? 0;
            if (trim !== 0 && !keyboardActive) {
                try {
                    const body = this.physicsBody as any;
                    const currentAngVel = body.getAngularVelocity ? body.getAngularVelocity() : Vector3.Zero();
                    const right = this.cachedRight;
                    // Триммирование - это постоянный крутящий момент вверх (вокруг оси право)
                    // Но мы работаем со скоростью, так что добавляем "дрейф" скорости
                    // Нужно аккуратно, чтобы не раскрутило

                    // Просто добавляем небольшой компонент к pitch если он слишком мал?
                    // Или прикладываем силу? Лучше всего просто "приподнимать" нос
                    // Используем applyImpulse/Force если бы могли, но тут velocity control

                    // Вариант 2: Просто "смещаем" желаемый авто-левел
                } catch (e) { }
            }
        }

        // ВМЕСТО ОТДЕЛЬНОГО БЛОКА ВЫШЕ, ДОБАВИМ TRIM К STABILIZATION LOGIC (Line 609)
        // См. следующий шаг редактирования

        const angleOfAttack = this.aerodynamicsSystem.calculateAngleOfAttack(
            this.cachedForward,
            velocityDir
        );

        // 9. ОТКЛЮЧЕНО: Анти-гравитация вызывала нежелательное вращение!
        // Сила применялась не в центре масс, создавая крутящий момент

        // Thrust (направление "вперёд" относительно самолёта)
        // Применяем тягу только при throttle > 0
        if (this.aerodynamicsSystem.getThrottle() > 0) {
            const thrustForceLocal = this.aerodynamicsSystem.calculateThrust(Vector3.Forward()).scale(1.0);
            const thrustForce = this.transformToWorldSpace(thrustForceLocal);

            if (thrustForce && isFinite(thrustForce.x) && isFinite(thrustForce.y) && isFinite(thrustForce.z)) {
                try {
                    // Применяем тягу в центре масс чтобы избежать вращения
                    const body = this.physicsBody as any;
                    if (body.getLinearVelocity && body.setLinearVelocity) {
                        // Вместо applyForce используем прямое изменение скорости
                        const currentVel = body.getLinearVelocity();
                        const thrustAccel = thrustForce.scale(0.001); // Очень маленький множитель
                        const newVel = currentVel.add(thrustAccel);
                        body.setLinearVelocity(newVel);
                    }
                } catch (e) {
                    console.warn("[AircraftPhysics] thrust error:", e);
                }
            }
        }

        // ИСПРАВЛЕНО: Ограничитель максимальной скорости
        // Если превышена maxSpeed, плавно уменьшаем скорость
        // ИСПРАВЛЕНО: Ограничитель максимальной скорости ОТКЛЮЧЕН
        // Пусть физика (Drag) сама ограничивает скорость
        /*
        if (speed > this.config.maxSpeed) {
            try {
                const body = this.physicsBody as any;
                if (body.getLinearVelocity && body.setLinearVelocity) {
                    const currentVel = body.getLinearVelocity();
                    // Плавное торможение: 20% превышения в секунду
                    const excessRatio = speed / this.config.maxSpeed;
                    const brakeFactor = Math.max(0.9, 1 - (excessRatio - 1) * 0.2 * clampedDt * 60);
                    const newVel = currentVel.scale(brakeFactor);
                    body.setLinearVelocity(newVel);
                }
            } catch (e) {
            }
        }
        */

        // 11. Стабилизация
        // Стабилизация ПОЛНОСТЬЮ ВЫКЛЮЧЕНА пока зажаты клавиши управления!
        const AUTO_STABILIZATION_ENABLED = true;

        // Проверяем нажаты ли клавиши управления (W/S/A/D)
        const isKeyboardActive = this._keyboardState["KeyW"] || this._keyboardState["KeyS"] ||
            this._keyboardState["KeyA"] || this._keyboardState["KeyD"];

        // Стабилизация работает ТОЛЬКО если клавиши НЕ нажаты
        // БЕЗ ИСКЛЮЧЕНИЙ - никакой "экстренной коррекции"
        const shouldStabilize = AUTO_STABILIZATION_ENABLED && this.config.enableAutoLevel && !isKeyboardActive;

        if (shouldStabilize) {
            const body = this.physicsBody as any;

            // 1) Самовыравнивание в уровень (крен + тангаж)  2) Разворот носом к центру камеры
            if (body.getAngularVelocity && body.setAngularVelocity) {
                const currentAngVel = body.getAngularVelocity();
                const right = this.cachedRight;
                const forward = this.cachedForward.clone().normalize();
                const up = this.cachedUp;

                const targetUp = Vector3.Up();
                const levelErrorAxis = Vector3.Cross(up, targetUp);
                let rollError = Vector3.Dot(levelErrorAxis, forward);
                let pitchError = Vector3.Dot(levelErrorAxis, right);

                // === КРИТИЧНО: КОРРЕКЦИЯ PITCH К ГОРИЗОНТАЛИ ===
                // ОТКЛЮЧЕНО ПО ПРОСЬБЕ ("roll не должен влиять на pitch")
                // Было: pitchError += pitchToHorizontal * 3.0;
                // Теперь: убираем принудительную коррекцию тангажа при крене
                // const pitchToHorizontal = forward.y; 
                // pitchError += pitchToHorizontal * 3.0; // ВЫКЛЮЧЕНО

                // ANTI-INVERT: Если самолёт перевёрнут (up.y < 0), АГРЕССИВНО крутим в правильную сторону
                // up.y < 0 означает что "верх" самолёта направлен вниз (инвертирован)
                const isInverted = up.y < 0;

                if (isInverted) {
                    // АГРЕССИВНАЯ коррекция при инверсии
                    // Сильный roll чтобы выйти из перевёрнутого положения
                    rollError = right.y > 0 ? 4.0 : -4.0; // Очень сильный roll
                    // Также добавляем pitch чтобы нос поднялся вверх
                    pitchError = -Math.abs(forward.y) * 2.0; // Тянем нос вниз (относительно перевёрнутого) = вверх в мире
                } else if (up.y < 0.3) {
                    // Сильный крен - усиленная коррекция
                    rollError = rollError * 2.0;
                    pitchError = pitchError * 1.5;
                }

                // Разворот к камере — только когда уже почти в уровне (up.y > 0.85), иначе не конфликтовать с выравниванием

                // ИСПРАВЛЕНИЕ "КЛЕВКА НОСОМ" (Bobber effect)
                // Добавляем постоянный TRIM (0.05..0.1) чтобы нос тянуло вверх
                const trim = this.config.aerodynamics.pitchTrim ?? 0.05;

                // ВОССТАНОВЛЕНО: Определение STAB_GAIN
                const STAB_GAIN = this.config.autoLevelStrength;

                // Добавляем к pitchError (pitchError - это "насколько надо повернуть")
                // Нам надо повернуть "наверх" -> значит уменьшаем pitchError (или добавляем отрицательное)
                // pitchError расчитывается как Dot(levelErrorAxis, right).
                // Если мы хотим "поднять нос", мы хотим чтобы самолёт думал что он "клюнул" и исправлял это.

                // Просто добавим константу к коррекции
                // correctionLocal.x = Pitch velocity
                // Хотим вращаться ВВЕРХ -> -X angular velocity

                const correctionLocal = new Vector3(
                    -trim, // ВЕРТИКАЛЬНОЕ АВТОВЫРАВНИВАНИЕ ОТКЛЮЧЕНО (pitchError убран), только TRIM
                    0,
                    rollError * STAB_GAIN
                );
                const levelCorrectionVel = this.transformToWorldSpace(correctionLocal);

                // Разворот к камере — только когда уже почти в уровне (up.y > 0.85), иначе не конфликтовать с выравниванием
                let cameraCorrectionVel = Vector3.Zero();
                const nearlyLevel = up.y > 0.85;
                if (nearlyLevel) {
                    const cameraAlignGain = this.config.cameraAlignGain ?? 2.0;
                    try {
                        const camRay = this.camera.getForwardRay();
                        if (camRay && camRay.direction) {
                            const camForward = camRay.direction.normalize();
                            const cameraErrorAxis = Vector3.Cross(forward, camForward);
                            const len = cameraErrorAxis.length();
                            if (len > 0.001) {
                                cameraCorrectionVel = cameraErrorAxis.normalize().scale(len * cameraAlignGain);
                            }
                        }
                    } catch (_) { }
                }

                // При отпускании клавиш/мыши — плавный возврат к уровню и к центру прицела (скорость, крен, нос)
                const noInputDamping = Math.max(0.5, Math.min(1, this.config.noInputAngularDamping ?? 0.82));
                const newAngVel = new Vector3(
                    currentAngVel.x * noInputDamping + levelCorrectionVel.x + cameraCorrectionVel.x,
                    currentAngVel.y * noInputDamping + levelCorrectionVel.y + cameraCorrectionVel.y,
                    currentAngVel.z * noInputDamping + levelCorrectionVel.z + cameraCorrectionVel.z
                );

                body.setAngularVelocity(newAngVel);
            }

            if (body.setAngularDamping) body.setAngularDamping(1.0);
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
