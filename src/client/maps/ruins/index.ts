/**
 * @module maps/ruins
 * @description Генератор карты "Руины" - разрушенный город
 */

export { RuinsGenerator, DEFAULT_RUINS_CONFIG } from './RuinsGenerator';
export type { RuinsConfig } from './RuinsGenerator';

export const RUINS_MAP_INFO = {
    id: "ruins" as const,
    name: "Руины",
    description: "Полуразрушенный город военного времени с обрушенными зданиями"
};
