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
    /** Триммирование тангажа (Pitch Trim) для компенсации веса носа. > 0 поднимает нос. */
    pitchTrim?: number;
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
    maxSpeed: 300.0, // Увеличено до 1080 км/ч (физический лимит, а не программный)
    baseSpeed: 50.0,

    mass: 15000, // 15 тонн (истребитель)
    centerOfMass: new Vector3(0, 0, 0), // ИСПРАВЛЕНО: Центр масс в центре меша для стабильности
    inertiaTensor: new Vector3(10000, 10000, 10000), // ИСПРАВЛЕНО: Равномерная высокая инерция для стабильности

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

        wingArea: 25.0, // м²

        // УВЕЛИЧЕНО для большего сопротивления (чтобы самолет не летел быстро на малом газу)
        baseLiftCoefficient: 0.5, // Было 0.3
        maxLiftCoefficient: 1.5, // Было 1.2
        criticalAngleOfAttack: 0.35,

        // ЗНАЧИТЕЛЬНО УВЕЛИЧЕНО сопротивление
        zeroLiftDragCoefficient: 0.08, // Было 0.02 (в 4 раза больше)
        inducedDragFactor: 0.1, // Было 0.05 (в 2 раза больше)

        // СБАЛАНСИРОВАНА ТЯГА
        maxThrust: 180000, // Увеличена тяга (было 120000), чтобы компенсировать возросший Drag на макс скорости
        minThrust: 0,
        throttleRate: 0.8,
        pitchTrim: 0.05,
    },

    mouseAim: {
        lookAheadDistance: 1000.0,
        minLookAheadDistance: 200.0,
        maxLookAheadDistance: 2000.0,
        maxBankAngle: 1.0, // Увеличено до ~60 градусов для маневренности
        bankTransitionSpeed: 3.0,
        alphaLimit: 0.35,
        enableAlphaLimiter: true,
        mouseAimGain: 2.0,       // Вернул к 2.0 для отзывчивости
        mouseAimDeadzone: 0.05,
        pointerLockSensitivityMultiplier: 0.4,
        mouseAimSmoothing: 0.05,  // ОЧЕНЬ плавное (было 0.18)
        maxSmoothedDeltaPerFrame: 0.008,  // Медленнее изменения (было 0.018)
        maxRotationSpeedRadPerSec: 1.2,  // Немного медленнее
        mouseAimFollowGain: 0.5,          // Уменьшено для плавности (было 1.2)
        mouseAimBlendToTarget: 0.05       // ОЧЕНЬ плавный переход (было 0.14)
    },

    keyboard: {
        pitchSensitivity: 12.0,   // Увеличено для отзывчивости (было 6)
        rollSensitivity: 14.0,    // Увеличено для отзывчивости (было 8)
        yawSensitivity: 25.0,      // УСИЛЕНО x3 по просьбе игрока (было 8)
        maxRotationSpeedRadPerSec: 3.5,  // Увеличено для манёвренности (было 2.5)
        keyboardOverridesMouseAim: true
    },

    camera: {
        chaseDistance: 25.0,  // Расстояние камеры сзади самолёта (м)
        chaseHeight: 8.0,     // Высота камеры над самолётом (м)
        smoothness: 0.3,     // Быстрее реакция
        lagFactor: 0.05,    // Минимальная задержка — камера сразу на месте
        worldUpAlignment: true
    },

    enableAutoLevel: true,   // ВКЛЮЧЕНО обратно
    autoLevelStrength: 1.0,   // Увеличено до 1.0 - сильное выравнивание в горизонт
    cameraAlignGain: 0.1,     // Очень мягкое следование за камерой
    noInputAngularDamping: 0.3,  // Мягкое затухание
    levelAssistStrength: 0.05,  // Минимальная подтяжка
    stallWarningMinSpeed: 8.0,  // ниже этой скорости (м/с) STALL! не показываем
    minAltitude: 15.0  // Самолёт должен стартовать выше земли (спавн ~1.2м)
};



