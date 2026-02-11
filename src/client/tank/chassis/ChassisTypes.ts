/**
 * Интерфейс типа шасси танка
 */
export interface ChassisType {
    id: string;
    name: string;
    width: number;
    height: number;
    depth: number;
    mass: number;
    maxHealth: number;
    moveSpeed: number;
    turnSpeed: number;
    acceleration: number;
    color: string; // Hex цвет
    description: string;
    specialAbility?: string; // Специальная способность
}

/**
 * Все типы шасси
 * Re-export из tankTypes.ts для обратной совместимости
 */
export { CHASSIS_TYPES, getChassisById } from '../../tankTypes';
