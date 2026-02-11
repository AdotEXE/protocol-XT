/**
 * @module maps/polygon
 * @description Генератор карты "Полигон" - военная тренировочная база
 * 
 * Содержит:
 * - PolygonGenerator - основной класс генератора
 * - PolygonConfig - конфигурация генератора
 * - POLYGON_MAP_INFO - метаданные карты
 */

export { PolygonGenerator, DEFAULT_POLYGON_CONFIG } from './PolygonGenerator';
export type { PolygonConfig, PolygonZone } from './PolygonGenerator';
import { MAP_SIZES } from '../MapConstants';

/** Метаданные карты полигон - использует MapConstants.ts */
export const POLYGON_MAP_INFO = {
    id: "polygon" as const,
    name: "Полигон",
    description: "Военный полигон с ангарами, техникой, складами, кранами и вышками",
    arenaSize: MAP_SIZES.polygon?.size ?? 1000,  // Из централизованных констант
    wallHeight: MAP_SIZES.polygon?.wallHeight ?? 4
};

