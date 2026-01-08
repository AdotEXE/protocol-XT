/**
 * @module maps/expo
 * @description Генератор карты "Экспо" - киберспортивная арена среднего размера
 * 
 * Содержит:
 * - ExpoGenerator - основной класс генератора
 * - ExpoConfig - конфигурация генератора
 * - EXPO_MAP_INFO - метаданные карты
 */

export { ExpoGenerator, DEFAULT_EXPO_CONFIG } from './ExpoGenerator';
export type { ExpoConfig } from './ExpoGenerator';
import { MAP_SIZES } from '../MapConstants';

/** Метаданные карты Экспо - использует MapConstants.ts */
export const EXPO_MAP_INFO = {
    id: "expo" as const,
    name: "Экспо",
    description: "Киберспортивная арена среднего размера с множеством уровней",
    arenaSize: MAP_SIZES.expo?.size ?? 120,
    wallHeight: MAP_SIZES.expo?.wallHeight ?? 4
};


