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
}

/**
 * Конфигурация управления клавиатурой
 */
export interface KeyboardOverrideConfig {
    /** Чувствительность pitch при нажатии W/S */
    pitchSensitivity: number;
    /** Чувствительность roll при нажатии A/D */
    rollSensitivity: number;
    /** Чувствительность yaw при нажатии Q/E */
    yawSensitivity: number;

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
    /** Сила автовыравнивания */
    autoLevelStrength: number;

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
        enableAlphaLimiter: true
    },

    keyboard: {
        pitchSensitivity: 8.0,
        rollSensitivity: 10.0,
        yawSensitivity: 5.0,
        keyboardOverridesMouseAim: true
    },

    camera: {
        chaseDistance: 150.0, // Очень далеко сзади — самолёт виден целиком
        chaseHeight: 35.0,   // Высоко для обзора
        smoothness: 0.3,     // Быстрее реакция
        lagFactor: 0.05,    // Минимальная задержка — камера сразу на месте
        worldUpAlignment: true
    },

    enableAutoLevel: true,
    autoLevelStrength: 2.0,
    minAltitude: 15.0  // Самолёт должен стартовать выше земли (спавн ~1.2м)
};



