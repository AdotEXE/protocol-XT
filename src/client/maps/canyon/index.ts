/**
 * @module maps/canyon
 * @description Генератор карты "Каньон" - горное ущелье
 */

export { CanyonGenerator, DEFAULT_CANYON_CONFIG } from './CanyonGenerator';
export type { CanyonConfig } from './CanyonGenerator';

export const CANYON_MAP_INFO = {
    id: "canyon" as const,
    name: "Ущелье",
    description: "Горная местность с проходами, реками, озёрами, лесами и деревнями"
};
