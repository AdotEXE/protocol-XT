/**
 * @module maps/urban_warfare
 * @description Генератор карты "Городской бой"
 */

export { UrbanWarfareGenerator, DEFAULT_URBAN_CONFIG } from './UrbanWarfareGenerator';
export type { UrbanWarfareConfig } from './UrbanWarfareGenerator';

export const URBAN_WARFARE_MAP_INFO = {
    id: "urban_warfare" as const,
    name: "Городские бои",
    description: "Плотная городская застройка с баррикадами и укреплениями"
};
