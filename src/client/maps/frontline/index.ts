/**
 * @module maps/frontline
 * @description Генератор карты "Линия фронта" - поле боя с окопами
 * 
 * Содержит:
 * - FrontlineGenerator - основной класс генератора
 * - FrontlineConfig - конфигурация генератора
 * - FRONTLINE_MAP_INFO - метаданные карты
 */

export { FrontlineGenerator, DEFAULT_FRONTLINE_CONFIG } from './FrontlineGenerator';
export type { FrontlineConfig, FrontlineZone } from './FrontlineGenerator';

/** Метаданные карты "Линия фронта" */
export const FRONTLINE_MAP_INFO = {
    id: "frontline" as const,
    name: "Линия фронта",
    description: "Окопы, траншеи, бункеры и нейтральная полоса"
};

