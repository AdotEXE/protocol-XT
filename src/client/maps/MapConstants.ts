/**
 * @module maps/MapConstants
 * @description Централизованные константы размеров всех карт
 * 
 * ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для размеров карт.
 * Все системы должны использовать эти константы для согласованности:
 * - ChunkSystem.getMapBounds()
 * - Генераторы карт (Frontline, Polygon, Canyon и др.)
 * - Позиции спавна гаражей
 * - Спавн игроков и ботов
 * 
 * ПРАВИЛО: Если карта имеет размер NxN, то:
 * - bounds = { minX: -N/2, maxX: N/2, minZ: -N/2, maxZ: N/2 }
 * - Все элементы карты должны находиться в этих границах
 * - Гаражи размещаются внутри границ
 */

import type { MapType } from "../menu";

/**
 * Конфигурация размеров карты
 */
export interface MapSizeConfig {
    /** Полный размер карты (ширина и глубина одинаковы) */
    size: number;
    /** Минимальная X координата (обычно -size/2) */
    minX: number;
    /** Максимальная X координата (обычно +size/2) */
    maxX: number;
    /** Минимальная Z координата (обычно -size/2) */
    minZ: number;
    /** Максимальная Z координата (обычно +size/2) */
    maxZ: number;
    /** Позиция гаража игрока [x, z] */
    playerGaragePosition: [number, number];
    /** Высота стен периметра (если есть) */
    wallHeight?: number;
}

/**
 * Размеры всех карт - ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ
 */
export const MAP_SIZES: Record<string, MapSizeConfig> = {
    // Полигон - военный тренировочный полигон
    polygon: {
        size: 1000,
        minX: -500,
        maxX: 500,
        minZ: -500,
        maxZ: 500,
        playerGaragePosition: [-70, -70], // Юго-западный угол
        wallHeight: 6
    },
    
    // Передовая - поле боя WW1 стиля
    frontline: {
        size: 1000,
        minX: -500,
        maxX: 500,
        minZ: -500,
        maxZ: 500,
        playerGaragePosition: [-400, 0], // Западная сторона (база игрока)
        wallHeight: 8
    },
    
    // Каньон - горное ущелье
    canyon: {
        size: 800,
        minX: -400,
        maxX: 400,
        minZ: -400,
        maxZ: 400,
        playerGaragePosition: [0, -350], // Южная сторона
        wallHeight: 10
    },
    
    // Песочница - маленькая тестовая зона
    sandbox: {
        size: 400,
        minX: -200,
        maxX: 200,
        minZ: -200,
        maxZ: 200,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 0
    },
    
    // Нормальная карта - большой открытый мир
    normal: {
        size: 2500,
        minX: -1250,
        maxX: 1250,
        minZ: -1250,
        maxZ: 1250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 0 // Естественные горные барьеры
    },
    
    // Тартария - большой открытый мир с городом
    tartaria: {
        size: 2500,
        minX: -1250,
        maxX: 1250,
        minZ: -1250,
        maxZ: 1250,
        playerGaragePosition: [0, 0], // Случайный спавн
        wallHeight: 0 // Естественные горные барьеры
    }
};

/**
 * Получить конфигурацию размеров для типа карты
 * @param mapType - Тип карты
 * @returns Конфигурация размеров или undefined если карта не найдена
 */
export function getMapSizeConfig(mapType: MapType | string): MapSizeConfig | undefined {
    return MAP_SIZES[mapType];
}

/**
 * Получить границы карты в формате { minX, maxX, minZ, maxZ }
 * @param mapType - Тип карты
 * @returns Границы карты или null если карта не найдена
 */
export function getMapBoundsFromConfig(mapType: MapType | string): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
    const config = MAP_SIZES[mapType];
    if (!config) return null;
    
    return {
        minX: config.minX,
        maxX: config.maxX,
        minZ: config.minZ,
        maxZ: config.maxZ
    };
}

/**
 * Получить позицию гаража игрока для типа карты
 * @param mapType - Тип карты
 * @returns Позиция [x, z] или null если карта не найдена
 */
export function getPlayerGaragePosition(mapType: MapType | string): [number, number] | null {
    const config = MAP_SIZES[mapType];
    if (!config) return null;
    
    return config.playerGaragePosition;
}

/**
 * Проверить, находится ли позиция в границах карты
 * @param mapType - Тип карты
 * @param x - X координата
 * @param z - Z координата
 * @returns true если позиция в границах
 */
export function isPositionInMapBounds(mapType: MapType | string, x: number, z: number): boolean {
    const config = MAP_SIZES[mapType];
    if (!config) return true; // Бесконечный мир по умолчанию
    
    return x >= config.minX && x <= config.maxX && 
           z >= config.minZ && z <= config.maxZ;
}

/**
 * Получить размер карты (одна сторона квадрата)
 * @param mapType - Тип карты
 * @returns Размер или 2500 по умолчанию
 */
export function getMapSize(mapType: MapType | string): number {
    const config = MAP_SIZES[mapType];
    return config?.size ?? 2500;
}

/**
 * Получить высоту стен периметра
 * @param mapType - Тип карты
 * @returns Высота стен или 0 если нет стен
 */
export function getWallHeight(mapType: MapType | string): number {
    const config = MAP_SIZES[mapType];
    return config?.wallHeight ?? 0;
}

