/**
 * @module maps/madness
 * @description Генератор карты "Безумие" - многоуровневая арена
 * 
 * Содержит:
 * - MadnessGenerator - основной класс генератора
 * - MadnessConfig - конфигурация генератора
 * - MADNESS_MAP_INFO - метаданные карты
 */

export { MadnessGenerator, DEFAULT_MADNESS_CONFIG } from './MadnessGenerator';
export type { MadnessConfig } from './MadnessGenerator';
import { MAP_SIZES } from '../MapConstants';

/** Метаданные карты Безумие */
export const MADNESS_MAP_INFO = {
    id: "madness" as const,
    name: "Безумие",
    description: "Многоуровневая арена с мостиками, рампами и переходами",
    arenaSize: MAP_SIZES.madness?.size ?? 150,
    wallHeight: MAP_SIZES.madness?.wallHeight ?? 4
};


