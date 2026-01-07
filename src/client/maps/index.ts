/**
 * @module maps
 * @description Maps Module - централизованный экспорт всех карт и генераторов
 * 
 * Этот модуль предоставляет:
 * - Генераторы карт (PolygonGenerator, FrontlineGenerator, и т.д.)
 * - Метаданные карт (POLYGON_MAP_INFO, и т.д.)
 * - Общие утилиты (SeededRandom, MapGeneratorFactory)
 */

// Shared utilities
export { SeededRandom, MAP_TYPES, MapGeneratorFactory, BaseMapGenerator } from './shared';
export type { 
    ChunkData, 
    ChunkConfig, 
    BiomeType, 
    MapType,
    IMapGenerator,
    ChunkGenerationContext,
    GenerationContext
} from './shared';

// Generators
export { PolygonGenerator, DEFAULT_POLYGON_CONFIG } from './polygon';
export { FrontlineGenerator, DEFAULT_FRONTLINE_CONFIG } from './frontline';
export { RuinsGenerator, DEFAULT_RUINS_CONFIG } from './ruins';
export { CanyonGenerator, DEFAULT_CANYON_CONFIG } from './canyon';
export { IndustrialGenerator, DEFAULT_INDUSTRIAL_CONFIG } from './industrial';
export { UrbanWarfareGenerator, DEFAULT_URBAN_CONFIG } from './urban_warfare';
export { UndergroundGenerator, DEFAULT_UNDERGROUND_CONFIG } from './underground';
export { CoastalGenerator, DEFAULT_COASTAL_CONFIG } from './coastal';
export { SandGenerator, DEFAULT_SAND_CONFIG } from './sand';

// Map info exports
export { POLYGON_MAP_INFO } from './polygon';
export { FRONTLINE_MAP_INFO } from './frontline';
export { RUINS_MAP_INFO } from './ruins';
export { CANYON_MAP_INFO } from './canyon';
export { INDUSTRIAL_MAP_INFO } from './industrial';
export { URBAN_WARFARE_MAP_INFO } from './urban_warfare';
export { UNDERGROUND_MAP_INFO } from './underground';
export { COASTAL_MAP_INFO } from './coastal';
export { SANDBOX_MAP_INFO } from './sandbox';
export { SAND_MAP_INFO } from './sand';
export { NORMAL_MAP_INFO, BIOME_WEIGHTS } from './normal';

/**
 * Все доступные карты
 */
export const ALL_MAPS = [
    'normal',
    'polygon',
    'frontline',
    'ruins',
    'canyon',
    'industrial',
    'urban_warfare',
    'underground',
    'coastal',
    'sandbox',
    'sand',
    'tartaria'
] as const;

export type MapId = typeof ALL_MAPS[number];
