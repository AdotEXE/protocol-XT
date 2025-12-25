/**
 * @module maps/industrial
 * @description Генератор карты "Промзона" - индустриальная зона
 */

export { IndustrialGenerator, DEFAULT_INDUSTRIAL_CONFIG } from './IndustrialGenerator';
export type { IndustrialConfig } from './IndustrialGenerator';

export const INDUSTRIAL_MAP_INFO = {
    id: "industrial" as const,
    name: "Промзона",
    description: "Крупная промышленная зона с заводами, портом и ж/д терминалом"
};
