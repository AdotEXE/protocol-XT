/**
 * @module maps/sand
 * @description Генератор карты "Песок" - фиксированная двухуровневая арена
 * 
 * Содержит:
 * - SandGenerator - основной класс генератора
 * - SandConfig - конфигурация генератора
 * - SAND_MAP_INFO - метаданные карты
 */

export { SandGenerator, DEFAULT_SAND_CONFIG } from './SandGenerator';
export type { SandConfig } from './SandGenerator';
import { MAP_SIZES } from '../MapConstants';

/** Метаданные карты Песок - использует MapConstants.ts */
export const SAND_MAP_INFO = {
    id: "sand" as const,
    name: "Песок",
    description: "Компактная двухуровневая арена в стиле Песочницы",
    arenaSize: MAP_SIZES.sand?.size ?? 150,
    wallHeight: MAP_SIZES.sand?.wallHeight ?? 4
};

