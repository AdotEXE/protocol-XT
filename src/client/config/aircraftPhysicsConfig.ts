/**
 * @module config/aircraftPhysicsConfig
 * @description Конфигурация для продвинутой авиационной физики с Mouse-Aim системой
 * 
 * Реализует:
 * - Mouse-Aim (Fly-by-Wire) контроль
 * - PID регулятор для плавного управления
 * - Реалистичные аэродинамические силы (Lift, Drag, Thrust)
 * - Систему переопределения клавиатуры
 */

import { Vector3 } from "@babylonjs/core";

/**
 * Конфигурация PID контроллера
 */
export interface PIDConfig {
    /** Proportional gain для pitch */
    pitchKp: number;
    /** Integral gain для pitch */
    pitchKi: number;
    /** Derivative gain для pitch */
    pitchKd: number;

    /** Proportional gain для yaw */
    yawKp: number;
    /** Integral gain для yaw */
    yawKi: number;
    /** Derivative gain для yaw */
    yawKd: number;

    /** Proportional gain для roll */
    rollKp: number;
    /** Integral gain для roll */
    rollKi: number;
    /** Derivative gain для roll */
    rollKd: number;

    /** Максимальный интегральный накопитель (предотвращает windup) */
    maxIntegral: number;
}

/**
 * Конфигурация аэродинамики
 */
export interface AerodynamicsConfig {
    /** Плотность воздуха на уровне моря (кг/м³) */
    airDensitySeaLevel: number;
    /** Коэффициент уменьшения плотности с высотой (1/м) */
    airDensityDecay: number;

    /** Площадь крыла (м²) */
    wingArea: number;
    /** Базовый коэффициент подъёмной силы */
    baseLiftCoefficient: number;
    /** Максимальный коэффициент подъёмной силы */
    maxLiftCoefficient: number;
    /** Критический угол атаки (радианы) */
    criticalAngleOfAttack: number;
    /** Коэффициент сопротивления при нулевой подъёмной силе */
    zeroLiftDragCoefficient: number;
    /** Коэффициент индуцированного сопротивления */
    inducedDragFactor: number;

    /** Максимальная тяга двигателя (Н) */
    maxThrust: number;
    /** Минимальная тяга (idle) */
    minThrust: number;
    /** Скорость изменения тяги (%/сек) */
    throttleRate: number;
}

/**
 * Конфигурация Mouse-Aim системы
 */
export interface MouseAimConfig {
    /** Расстояние до цели по лучу мыши (м) */
    lookAheadDistance: number;
    /** Минимальное расстояние до цели */
    minLookAheadDistance: number;
    /** Максимальное расстояние до цели */
    maxLookAheadDistance: number;

    /** Максимальный угол крена для координированного поворота (радианы) */
    maxBankAngle: number;
    /** Скорость перехода к целевому крену */
    bankTransitionSpeed: number;

    /** Ограничение угла атаки (предотвращает сваливание) */
    alphaLimit: number;
    /** Включить автоматическое ограничение угла атаки */
    enableAlphaLimiter: boolean;

    /** Усиление отклика на угловую ошибку (меньше = плавнее, без осцилляций) */
    mouseAimGain: number;
    /** Мёртвая зона по ошибке в радианах (больше = игнорировать микро-ошибки, плавнее) */
    mouseAimDeadzone: number;
    /** Множитель чувствительности мыши при pointer lock (накладывается на общую mouseSensitivity) */
    pointerLockSensitivityMultiplier: number;
    /** Сглаживание следования за курсором (0=макс. сглаживание, 1=без сглаживания). Меньше = плавнее */
    mouseAimSmoothing: number;
    /** Макс. изменение сглаженного pitch/roll/yaw за кадр — rate limit для строгого плавного следования */
    maxSmoothedDeltaPerFrame: number;
    /** Макс. угловая скорость вращения (рад/с) — плавнее при меньшем значении */
    maxRotationSpeedRadPerSec: number;
    /** Режим «следование за центром»: целевая угловая скорость = ошибка * gain (рад/с на рад), без накопления — замедление у центра */
    mouseAimFollowGain: number;
    /** Скорость приближения текущей угловой скорости к целевой за кадр (0–1). Больше = быстрее отклик */
    mouseAimBlendToTarget: number;
}

/**
 * Конфигурация управления клавиатурой
 */
export interface KeyboardOverrideConfig {
    /** Ускорение pitch (рад/с²) при нажатии Q/E — заметные изменения */
    pitchSensitivity: number;
    /** Ускорение roll (рад/с²) при нажатии A/D */
    rollSensitivity: number;
    /** Ускорение yaw (рад/с²) при нажатии Q/E (в коде не W/S) */
    yawSensitivity: number;
    /** Макс. угловая скорость (рад/с) при управлении клавишами — выше чем у мыши, чтобы A/D/Q/E были заметны */
    maxRotationSpeedRadPerSec: number;

    /** Приоритет клавиатуры над Mouse-Aim */
    keyboardOverridesMouseAim: boolean;
}

/**
 * Конфигурация камеры для самолёта
 */
export interface AircraftCameraConfig {
    /** Расстояние камеры от самолёта (м) */
    chaseDistance: number;
    /** Высота камеры над самолётом (м) */
    chaseHeight: number;
    /** Скорость сглаживания камеры (0-1) */
    smoothness: number;
    /** Задержка камеры при резких манёврах */
    lagFactor: number;
    /** Выравнивание камеры по миру (true) или по самолёту (false) */
    worldUpAlignment: boolean;
}

/**
 * Основная конфигурация авиационной физики
 */
export interface AircraftPhysicsConfig {
    /** Режим управления: "mouseAim" | "direct" | "hybrid" */
    controlMode: "mouseAim" | "direct" | "hybrid";

    /** Минимальная скорость (м/с) */
    minSpeed: number;
    /** Максимальная скорость (м/с) */
    maxSpeed: number;
    /** Базовая скорость (м/с) */
    baseSpeed: number;

    /** Масса самолёта (кг) */
    mass: number;
    /** Центр масс относительно центра меша */
    centerOfMass: Vector3;
    /** Момент инерции (упрощённый, кг·м²) */
    inertiaTensor: Vector3;

    /** PID конфигурация */
    pid: PIDConfig;
    /** Аэродинамика */
    aerodynamics: AerodynamicsConfig;
    /** Mouse-Aim */
    mouseAim: MouseAimConfig;
    /** Клавиатура */
    keyboard: KeyboardOverrideConfig;
    /** Камера */
    camera: AircraftCameraConfig;

    /** Включить автовыравнивание при отсутствии ввода */
    enableAutoLevel: boolean;
    /** Сила автовыравнивания (крен + тангаж в уровень) */
    autoLevelStrength: number;
    /** Сила разворота носом к центру камеры при отсутствии ввода */
    cameraAlignGain: number;
    /** Затухание угловой скорости при отпускании (0–1). Больше — быстрее плавный возврат к уровню и центру */
    noInputAngularDamping: number;
    /** Сила «подтяжки» в уровень при активном вводе (0=выкл., 0.2–0.25=слабая постоянная тяга к горизонту) */
    levelAssistStrength: number;

    /** Минимальная скорость (м/с) для показа предупреждения STALL — ниже не показываем */
    stallWarningMinSpeed: number;

    /** Минимальная высота над землёй (м) */
    minAltitude: number;
}

/**
 * Конфигурация по умолчанию (гибридный режим: реалистичная физика + аркадное управление)
 */
export const DEFAULT_AIRCRAFT_PHYSICS_CONFIG: AircraftPhysicsConfig = {
    controlMode: "mouseAim",

    minSpeed: 20.0,
    maxSpeed: 80.0,
    baseSpeed: 50.0,

    mass: 15000, // 15 тонн (истребитель)
    centerOfMass: new Vector3(0, -0.2, -0.5), // Смещён назад и вниз
    inertiaTensor: new Vector3(5000, 8000, 3000), // Больше инерция по pitch/yaw

    pid: {
        pitchKp: 8.0,
        pitchKi: 0.5,
        pitchKd: 12.0,
        yawKp: 6.0,
        yawKi: 0.3,
        yawKd: 10.0,
        rollKp: 10.0,
        rollKi: 0.4,
        rollKd: 15.0,
        maxIntegral: 50.0
    },

    aerodynamics: {
        airDensitySeaLevel: 1.225, // кг/м³ на уровне моря
        airDensityDecay: 0.0001, // Уменьшение на 0.01% на метр высоты

        wingArea: 50.0, // м²
        baseLiftCoefficient: 0.1,
        maxLiftCoefficient: 1.8,
        criticalAngleOfAttack: 0.26, // ~15 градусов
        zeroLiftDragCoefficient: 0.02,
        inducedDragFactor: 0.05,

        // ИСПРАВЛЕНО: Уменьшено для плавного разгона
        maxThrust: 75000, // Н (75 кН) — было 150кН, слишком резкий разгон
        minThrust: 10000, // Н (idle) — уменьшено
        throttleRate: 0.3 // 30% в секунду — плавнее (было 0.5)
    },

    mouseAim: {
        lookAheadDistance: 1000.0,
        minLookAheadDistance: 200.0,
        maxLookAheadDistance: 2000.0,
        maxBankAngle: 0.785, // 45 градусов
        bankTransitionSpeed: 3.0,
        alphaLimit: 0.35, // ~20° — мягче, меньше ложных сваливаний
        enableAlphaLimiter: true,
        mouseAimGain: 2.2,      // плавнее чем 4.0 — меньше осцилляций
        mouseAimDeadzone: 0.05,  // больше чем 0.02 — игнорируем микро-дрожание
        pointerLockSensitivityMultiplier: 0.4,
        mouseAimSmoothing: 0.18,  // усиленное сглаживание — строго плавное следование за центром
        maxSmoothedDeltaPerFrame: 0.018,  // rate limit: макс. изменение сглаженного ввода за кадр
        maxRotationSpeedRadPerSec: 1.5,  // плавное вращение
        mouseAimFollowGain: 1.2,          // целевая угл. скорость от ошибки — у центра естественное замедление
        mouseAimBlendToTarget: 0.14       // плавный переход к целевой угловой скорости за кадр
    },

    keyboard: {
        pitchSensitivity: 14.0,   // рад/с² — заметный отклик на Q/E
        rollSensitivity: 16.0,    // рад/с² — заметный отклик на A/D
        yawSensitivity: 10.0,      // рад/с² — заметный отклик на Q/E
        maxRotationSpeedRadPerSec: 2.8,  // при клавишах выше лимит, чем у мыши
        keyboardOverridesMouseAim: true
    },

    camera: {
        chaseDistance: 25.0,  // Расстояние камеры сзади самолёта (м)
        chaseHeight: 8.0,     // Высота камеры над самолётом (м)
        smoothness: 0.3,     // Быстрее реакция
        lagFactor: 0.05,    // Минимальная задержка — камера сразу на месте
        worldUpAlignment: true
    },

    enableAutoLevel: true,
    autoLevelStrength: 3.5,
    cameraAlignGain: 2.0,
    noInputAngularDamping: 0.82,  // при отпускании клавиш/мыши — плавный возврат к уровню и центру
    levelAssistStrength: 0.22,  // слабая подтяжка в уровень при активном вводе (только мышь)
    stallWarningMinSpeed: 8.0,  // ниже этой скорости (м/с) STALL! не показываем
    minAltitude: 15.0  // Самолёт должен стартовать выше земли (спавн ~1.2м)
};



