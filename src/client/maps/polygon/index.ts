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

/** Метаданные карты полигон */
export const POLYGON_MAP_INFO = {
    id: "polygon" as const,
    name: "Полигон",
    description: "Военный полигон с ангарами, техникой, складами, кранами и вышками",
    arenaSize: 600,
    wallHeight: 4
};

