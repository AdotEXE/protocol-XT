/**
 * Maps Module - централизованный экспорт всех карт
 */

// Shared utilities
export { SeededRandom, MAP_TYPES, MapGeneratorFactory } from './shared';
export type { 
    ChunkData, 
    ChunkConfig, 
    BiomeType, 
    MapType,
    IMapGenerator,
    ChunkGenerationContext
} from './shared';

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
    'tartaria'
] as const;

export type MapId = typeof ALL_MAPS[number];
