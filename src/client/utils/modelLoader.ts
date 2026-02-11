/**
 * @module utils/modelLoader
 * @description Централизованная система загрузки всех моделей из json_models
 * 
 * Загружает:
 * - Базовые типы (chassis, cannon, tracks, modules)
 * - Кастомные конфигурации танков
 * - Сгенерированные модели
 * 
 * Если json_models недоступны (сервер не запущен, production без файлов) —
 * автоматически переключается на хардкод из исходного кода.
 */

import { loadAllModelsFromCategory } from './modelFileLoader';
import type { ChassisType, CannonType } from '../tankTypes';
import type { TrackType } from '../trackTypes';
import type { ModuleType } from '../tank/modules/ModuleTypes';
import type { CustomTankConfiguration } from '../workshop/types';
import { logger } from './logger';

// Кэш загруженных моделей
let chassisCache: ChassisType[] | null = null;
let cannonCache: CannonType[] | null = null;
let trackCache: TrackType[] | null = null;
let moduleCache: ModuleType[] | null = null;
let customTanksCache: CustomTankConfiguration[] | null = null;

// Кэш всех base-types моделей (загружаем один раз, раздаём всем)
let baseTypesRawCache: any[] | null = null;

/**
 * Загружает ВСЕ base-types один раз и кэширует.
 * Раньше каждый loader вызывал loadAllModelsFromCategory('base-types') отдельно.
 */
async function getBaseTypesRaw(): Promise<any[]> {
    if (baseTypesRawCache !== null) return baseTypesRawCache;
    try {
        baseTypesRawCache = await loadAllModelsFromCategory<any>('base-types');
    } catch {
        baseTypesRawCache = [];
    }
    return baseTypesRawCache;
}

/**
 * Загружает все базовые типы корпусов из json_models
 */
export async function loadChassisTypes(): Promise<ChassisType[]> {
    if (chassisCache) return chassisCache;

    try {
        const models = await getBaseTypesRaw();
        // Фильтруем только chassis: есть width и moveSpeed (отличает от tracks)
        const chassis = models.filter((model: any) => {
            if (Array.isArray(model)) {
                return model.every((item: any) => item.id && item.width !== undefined && item.moveSpeed !== undefined);
            }
            return model.id && model.width !== undefined && model.moveSpeed !== undefined;
        }).flatMap((model: any) => Array.isArray(model) ? model : [model]);

        if (chassis.length > 0) {
            chassisCache = chassis as ChassisType[];
            logger.log(`[ModelLoader] Loaded ${chassisCache.length} chassis types from json_models`);
            return chassisCache;
        }
    } catch (e) {
        logger.warn('[ModelLoader] Error loading chassis from json_models:', e);
    }

    // Fallback на хардкод
    const { CHASSIS_TYPES } = await import('../tankTypes');
    chassisCache = CHASSIS_TYPES;
    logger.warn(`[ModelLoader] Using fallback chassis types from code (${chassisCache.length})`);
    return chassisCache;
}

/**
 * Загружает все базовые типы пушек из json_models
 */
export async function loadCannonTypes(): Promise<CannonType[]> {
    if (cannonCache) return cannonCache;

    try {
        const models = await getBaseTypesRaw();
        const cannons = models.filter((model: any) => {
            if (Array.isArray(model)) {
                return model.every((item: any) => item.id && item.damage !== undefined);
            }
            return model.id && model.damage !== undefined;
        }).flatMap((model: any) => Array.isArray(model) ? model : [model]);

        if (cannons.length > 0) {
            cannonCache = cannons as CannonType[];
            logger.log(`[ModelLoader] Loaded ${cannonCache.length} cannon types from json_models`);
            return cannonCache;
        }
    } catch (e) {
        logger.warn('[ModelLoader] Error loading cannons from json_models:', e);
    }

    // Fallback на хардкод
    const { CANNON_TYPES } = await import('../tankTypes');
    cannonCache = CANNON_TYPES;
    logger.warn(`[ModelLoader] Using fallback cannon types from code (${cannonCache.length})`);
    return cannonCache;
}

/**
 * Загружает все базовые типы гусениц из json_models
 */
export async function loadTrackTypes(): Promise<TrackType[]> {
    if (trackCache) return trackCache;

    try {
        const models = await getBaseTypesRaw();
        // Фильтруем tracks: есть width и style (отличает от chassis)
        const tracks = models.filter((model: any) => {
            if (Array.isArray(model)) {
                return model.every((item: any) => item.id && item.width !== undefined && item.style !== undefined);
            }
            return model.id && model.width !== undefined && model.style !== undefined;
        }).flatMap((model: any) => Array.isArray(model) ? model : [model]);

        if (tracks.length > 0) {
            trackCache = tracks as TrackType[];
            logger.log(`[ModelLoader] Loaded ${trackCache.length} track types from json_models`);
            return trackCache;
        }
    } catch (e) {
        logger.warn('[ModelLoader] Error loading tracks from json_models:', e);
    }

    // Fallback на хардкод
    const { TRACK_TYPES } = await import('../trackTypes');
    trackCache = TRACK_TYPES;
    logger.warn(`[ModelLoader] Using fallback track types from code (${trackCache.length})`);
    return trackCache;
}

/**
 * Загружает все модули из json_models
 */
export async function loadModuleTypes(): Promise<ModuleType[]> {
    if (moduleCache) return moduleCache;

    try {
        const models = await getBaseTypesRaw();
        // Фильтруем modules: есть type === 'module' или rarity
        const modules = models.filter((model: any) => {
            if (Array.isArray(model)) {
                return model.every((item: any) => item.id && (item.type === 'module' || item.rarity !== undefined));
            }
            return model.id && (model.type === 'module' || model.rarity !== undefined);
        }).flatMap((model: any) => Array.isArray(model) ? model : [model]);

        if (modules.length > 0) {
            moduleCache = modules as ModuleType[];
            logger.log(`[ModelLoader] Loaded ${moduleCache.length} module types from json_models`);
            return moduleCache;
        }
    } catch (e) {
        logger.warn('[ModelLoader] Error loading modules from json_models:', e);
    }

    // Fallback на хардкод
    const { MODULE_PRESETS } = await import('../tank/modules/ModuleTypes');
    moduleCache = MODULE_PRESETS;
    logger.warn(`[ModelLoader] Using fallback module types from code (${moduleCache.length})`);
    return moduleCache;
}

/**
 * Загружает все кастомные конфигурации танков из json_models
 */
export async function loadCustomTankConfigs(): Promise<CustomTankConfiguration[]> {
    if (customTanksCache) return customTanksCache;

    try {
        const configs = await loadAllModelsFromCategory<CustomTankConfiguration>('custom-tanks');
        customTanksCache = configs;
        logger.log(`[ModelLoader] Loaded ${customTanksCache.length} custom tank configs from json_models`);
        return customTanksCache;
    } catch (e) {
        logger.warn('[ModelLoader] Error loading custom tank configs:', e);
        customTanksCache = [];
        return customTanksCache;
    }
}

/**
 * Загружает все базовые типы (chassis, cannon, tracks, modules) одновременно
 */
export async function loadAllBaseTypes(): Promise<{
    chassis: ChassisType[];
    cannons: CannonType[];
    tracks: TrackType[];
    modules: ModuleType[];
}> {
    // Предзагружаем общий кэш base-types один раз
    await getBaseTypesRaw();

    const [chassis, cannons, tracks, modules] = await Promise.all([
        loadChassisTypes(),
        loadCannonTypes(),
        loadTrackTypes(),
        loadModuleTypes()
    ]);

    return { chassis, cannons, tracks, modules };
}

/**
 * Очищает кэш (для перезагрузки моделей)
 */
export function clearModelCache(): void {
    chassisCache = null;
    cannonCache = null;
    trackCache = null;
    moduleCache = null;
    customTanksCache = null;
    logger.log('[ModelLoader] Model cache cleared');
}

/**
 * Получает корпус по ID (из кэша или загружает)
 */
export async function getChassisById(id: string): Promise<ChassisType | null> {
    const chassis = await loadChassisTypes();
    return chassis.find(c => c.id === id) || null;
}

/**
 * Получает пушку по ID (из кэша или загружает)
 */
export async function getCannonById(id: string): Promise<CannonType | null> {
    const cannons = await loadCannonTypes();
    return cannons.find(c => c.id === id) || null;
}

/**
 * Получает гусеницу по ID (из кэша или загружает)
 */
export async function getTrackById(id: string): Promise<TrackType | null> {
    const tracks = await loadTrackTypes();
    return tracks.find(t => t.id === id) || null;
}

/**
 * Получает модуль по ID (из кэша или загружает)
 */
export async function getModuleById(id: string): Promise<ModuleType | null> {
    const modules = await loadModuleTypes();
    return modules.find(m => m.id === id) || null;
}

/**
 * Синхронные функции для обратной совместимости
 * Используют кэш, если он загружен, иначе fallback на хардкод
 */
export function getChassisByIdSync(id: string): ChassisType | null {
    if (chassisCache) {
        return chassisCache.find(c => c.id === id) || null;
    }
    // Fallback на хардкод если кэш не загружен
    const { CHASSIS_TYPES } = require('../tankTypes');
    return CHASSIS_TYPES.find((c: ChassisType) => c.id === id) || CHASSIS_TYPES[1] || null;
}

export function getCannonByIdSync(id: string): CannonType | null {
    if (cannonCache) {
        return cannonCache.find(c => c.id === id) || null;
    }
    // Fallback на хардкод если кэш не загружен
    const { CANNON_TYPES } = require('../tankTypes');
    return CANNON_TYPES.find((c: CannonType) => c.id === id) || CANNON_TYPES[1] || null;
}

export function getTrackByIdSync(id: string): TrackType | null {
    if (trackCache) {
        return trackCache.find(t => t.id === id) || null;
    }
    // Fallback на хардкод если кэш не загружен
    const { TRACK_TYPES } = require('../trackTypes');
    return TRACK_TYPES.find((t: TrackType) => t.id === id) || TRACK_TYPES[0] || null;
}

/**
 * Получить все загруженные типы синхронно (из кэша)
 */
export function getChassisTypesSync(): ChassisType[] {
    if (chassisCache) {
        return chassisCache;
    }
    const { CHASSIS_TYPES } = require('../tankTypes');
    return CHASSIS_TYPES;
}

export function getCannonTypesSync(): CannonType[] {
    if (cannonCache) {
        return cannonCache;
    }
    const { CANNON_TYPES } = require('../tankTypes');
    return CANNON_TYPES;
}

export function getTrackTypesSync(): TrackType[] {
    if (trackCache) {
        return trackCache;
    }
    const { TRACK_TYPES } = require('../trackTypes');
    return TRACK_TYPES;
}

