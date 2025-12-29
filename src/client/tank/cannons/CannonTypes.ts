/**
 * Интерфейс типа пушки танка
 */
export interface CannonType {
    id: string;
    name: string;
    barrelLength: number;
    barrelWidth: number;
    damage: number;
    cooldown: number; // мс
    projectileSpeed: number;
    projectileSize: number;
    color: string; // Hex цвет
    description: string;
    recoilMultiplier: number; // Множитель силы отдачи (1.0 = стандартная)
}

/**
 * Все типы пушек
 * Re-export из tankTypes.ts для обратной совместимости
 */
export { CANNON_TYPES, getCannonById } from '../../tankTypes';
