/**
 * @module world
 * @description World generation modules
 * 
 * Модули:
 * - GarageGenerator - генерация гаражей
 * - BuildingGenerator - генерация зданий
 * - ChunkHelpers - вспомогательные функции для чанков
 */

// Garage Generator
export { GarageGenerator, DEFAULT_GARAGE_CONFIG } from './GarageGenerator';
export type { GarageConfig, GarageData, GarageDoorData, GarageWallData, GarageCapturePoint } from './GarageGenerator';

// Building Generator
export { BuildingGenerator, BUILDING_CONFIGS } from './BuildingGenerator';
export type { BuildingConfig, BuildingData, BuildingType } from './BuildingGenerator';

// Chunk Helpers
export { ChunkHelpers, SeededRandom } from './ChunkHelpers';

