/**
 * @module maps/shared
 * @description Общие утилиты и базовые классы для генераторов карт
 */

// Базовые классы
export { SeededRandom } from './SeededRandom';
export { BaseMapGenerator } from './BaseMapGenerator';
export { MapGeneratorFactory } from './MapGenerator';

// Типы
export type { ChunkData, ChunkConfig, BiomeType, MapType, GenerationContext, BuildingType, ObjectPosition, MapTypeInfo } from './MapTypes';
export type { IMapGenerator, ChunkGenerationContext } from './MapGenerator';

// Константы
export { MAP_TYPES } from './MapTypes';

// Хелперы
export * from './ChunkHelpers';
