/**
 * @module maps/underground
 * @description Генератор карты "Подземелье" - шахты и туннели
 */

export { UndergroundGenerator, DEFAULT_UNDERGROUND_CONFIG } from './UndergroundGenerator';
export type { UndergroundConfig } from './UndergroundGenerator';

export const UNDERGROUND_MAP_INFO = {
    id: "underground" as const,
    name: "Подземелье",
    description: "Система пещер, шахт и туннелей под землёй"
};
