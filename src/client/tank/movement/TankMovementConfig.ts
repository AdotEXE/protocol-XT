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
        maxForwardSpeed: 22, // +2
        maxBackwardSpeed: 14, // +2
        acceleration: 30, // +5: компенсация веса для легких
        turnSpeed: 90 // +10
    },
    medium: {
        maxForwardSpeed: 16, // +1
        maxBackwardSpeed: 9, // +1
        acceleration: 22, // +2
        turnSpeed: 65 // +5
    },
    heavy: {
        maxForwardSpeed: 11, // +1
        maxBackwardSpeed: 6, // +1
        acceleration: 15, // +3: чтобы не был слишком вялым
        turnSpeed: 45 // +5
    },
    superheavy: {
        maxForwardSpeed: 7, // +1
        maxBackwardSpeed: 4, // +1
        acceleration: 10, // +2
        turnSpeed: 30 // +5
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

