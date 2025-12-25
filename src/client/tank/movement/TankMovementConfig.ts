/**
 * @module tank/movement/TankMovementConfig
 * @description Конфигурация движения танка
 */

/**
 * Параметры движения танка
 */
export interface TankMovementParams {
    /** Максимальная скорость вперёд */
    maxForwardSpeed: number;
    /** Максимальная скорость назад */
    maxBackwardSpeed: number;
    /** Ускорение */
    acceleration: number;
    /** Замедление (торможение) */
    deceleration: number;
    /** Скорость поворота (градусов/сек) */
    turnSpeed: number;
    /** Множитель скорости поворота на месте */
    pivotTurnMultiplier: number;
    /** Трение */
    friction: number;
}

/**
 * Параметры движения по умолчанию
 */
export const DEFAULT_MOVEMENT_PARAMS: TankMovementParams = {
    maxForwardSpeed: 15,
    maxBackwardSpeed: 8,
    acceleration: 20,
    deceleration: 30,
    turnSpeed: 60,
    pivotTurnMultiplier: 1.5,
    friction: 0.95
};

/**
 * Параметры для разных типов шасси
 */
export const CHASSIS_MOVEMENT_PARAMS: Record<string, Partial<TankMovementParams>> = {
    light: {
        maxForwardSpeed: 20,
        maxBackwardSpeed: 12,
        acceleration: 25,
        turnSpeed: 80
    },
    medium: {
        maxForwardSpeed: 15,
        maxBackwardSpeed: 8,
        acceleration: 20,
        turnSpeed: 60
    },
    heavy: {
        maxForwardSpeed: 10,
        maxBackwardSpeed: 5,
        acceleration: 12,
        turnSpeed: 40
    },
    superheavy: {
        maxForwardSpeed: 6,
        maxBackwardSpeed: 3,
        acceleration: 8,
        turnSpeed: 25
    }
};

/**
 * Состояние движения
 */
export interface TankMovementState {
    /** Текущая скорость */
    currentSpeed: number;
    /** Целевая скорость */
    targetSpeed: number;
    /** Текущий угол поворота */
    currentRotation: number;
    /** Целевой угол поворота */
    targetRotation: number;
    /** Движется ли танк */
    isMoving: boolean;
    /** Вращается ли танк */
    isRotating: boolean;
    /** Идёт ли ускорение */
    isAccelerating: boolean;
    /** Идёт ли торможение */
    isBraking: boolean;
}

export default { DEFAULT_MOVEMENT_PARAMS, CHASSIS_MOVEMENT_PARAMS };

