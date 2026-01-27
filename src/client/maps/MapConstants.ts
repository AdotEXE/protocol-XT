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
 * ВСЕ КАРТЫ ТЕПЕРЬ 500x500! Ничего не должно спавниться за границами!
 */
export const MAP_SIZES: Record<string, MapSizeConfig> = {
    // Полигон - военный тренировочный полигон
    polygon: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [-50, -50], // Юго-западный угол
        wallHeight: 6
    },

    // Передовая - поле боя WW1 стиля
    frontline: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [-100, 0], // Западная сторона
        wallHeight: 8
    },

    // Каньон - горное ущелье
    canyon: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, -200], // Южная сторона
        wallHeight: 10
    },

    // Песочница - тестовая зона
    sandbox: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 0
    },

    // Нормальная карта
    normal: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 6
    },

    // Тартария
    tartaria: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 6
    },

    // Песок - компактная двухуровневая арена
    sand: {
        size: 150,
        minX: -75,
        maxX: 75,
        minZ: -75,
        maxZ: 75,
        playerGaragePosition: [-50, -50], // Юго-западная база
        wallHeight: 4
    },

    // Безумие - многоуровневая арена с мостиками и рампами
    madness: {
        size: 150,
        minX: -75,
        maxX: 75,
        minZ: -75,
        maxZ: 75,
        playerGaragePosition: [-50, -50], // Юго-западная база
        wallHeight: 4
    },

    // Экспо - расширенная киберспортивная арена
    expo: {
        size: 200,
        minX: -100,
        maxX: 100,
        minZ: -100,
        maxZ: 100,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 5
    },
    // Брест - симметричная арена с крепостью
    brest: {
        size: 180,
        minX: -90,
        maxX: 90,
        minZ: -90,
        maxZ: 90,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 6
    },

    // Арена - киберспортивная арена с симметричной структурой
    arena: {
        size: 160,
        minX: -80,
        maxX: 80,
        minZ: -80,
        maxZ: 80,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 6
    },

    // Пользовательская карта (размер определяется при загрузке)
    custom: {
        size: 200,
        minX: -100,
        maxX: 100,
        minZ: -100,
        maxZ: 100,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 6
    },

    // Руины - разрушенный город
    ruins: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 8
    },

    // Индустриальная зона - заводы и склады
    industrial: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [-100, -100], // Угол
        wallHeight: 6
    },

    // Городская война - городская среда
    urban_warfare: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 10
    },

    // Подземелье - подземные туннели
    underground: {
        size: 400,
        minX: -200,
        maxX: 200,
        minZ: -200,
        maxZ: 200,
        playerGaragePosition: [0, 0], // Центр
        wallHeight: 0 // Подземелье без видимых стен
    },

    // Прибрежная зона - береговая линия
    coastal: {
        size: 500,
        minX: -250,
        maxX: 250,
        minZ: -250,
        maxZ: 250,
        playerGaragePosition: [0, -200], // Южная сторона (ближе к берегу)
        wallHeight: 5
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
