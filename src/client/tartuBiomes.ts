/**
 * Tartu Biomes - Система определения биомов для города Тарту
 * 
 * Определяет биомы на основе реальных зон города Тарту:
 * - Центр города (Raekoja plats)
 * - Toomemägi (Домская гора)
 * - Университетский район
 * - Река Эмайыги
 * - Промышленные зоны
 * - Жилые районы
 */

export interface TartuZone {
    name: string;
    biome: "city" | "residential" | "industrial" | "park" | "university" | "river";
    centerX: number;
    centerZ: number;
    radius: number;
    priority: number; // Для перекрывающихся зон (больше = выше приоритет)
}

/**
 * Зоны города Тарту
 */
export const TARTU_ZONES: TartuZone[] = [
    // Центр города (Raekoja plats)
    {
        name: "City Center",
        biome: "city",
        centerX: 0,
        centerZ: 0,
        radius: 150,
        priority: 10
    },
    // Toomemägi (Домская гора)
    {
        name: "Toomemägi",
        biome: "park",
        centerX: -200,
        centerZ: -100,
        radius: 120,
        priority: 9
    },
    // Университетский район
    {
        name: "University District",
        biome: "university",
        centerX: -150,
        centerZ: -50,
        radius: 100,
        priority: 8
    },
    // Река Эмайыги (полоса вдоль реки) - высший приоритет
    {
        name: "Emajõgi River",
        biome: "river",
        centerX: 0,
        centerZ: 0,
        radius: 50, // Ширина реки
        priority: 11 // Высший приоритет
    },
    // Промышленная зона (восток, вдоль Narva maantee)
    {
        name: "Industrial East",
        biome: "industrial",
        centerX: 400,
        centerZ: 0,
        radius: 200,
        priority: 7
    }
];

// Кэш для результатов определения биомов
const biomeCache: Map<string, string> = new Map();
const CACHE_SIZE_LIMIT = 10000;

/**
 * Определить биом для заданных координат в Тарту
 * 
 * @param worldX Координата X в игровом пространстве
 * @param worldZ Координата Z в игровом пространстве
 * @returns Название биома
 */
export function getTartuBiome(worldX: number, worldZ: number): string {
    // Используем кэш для производительности
    const cacheKey = `${Math.floor(worldX / 10)}_${Math.floor(worldZ / 10)}`;
    if (biomeCache.has(cacheKey)) {
        return biomeCache.get(cacheKey)!;
    }
    
    // 1. Проверяем реку (высший приоритет)
    // Река Эмайыги идёт примерно по оси Z через центр (z=0)
    const riverDistance = Math.abs(worldZ);
    if (riverDistance < 50) {
        biomeCache.set(cacheKey, "river");
        // Ограничиваем размер кэша
        if (biomeCache.size > CACHE_SIZE_LIMIT) {
            const firstKey = biomeCache.keys().next().value;
            if (firstKey) biomeCache.delete(firstKey);
        }
        return "river";
    }
    
    // 2. Проверяем зоны по приоритету (от большего к меньшему)
    const sortedZones = [...TARTU_ZONES].sort((a, b) => b.priority - a.priority);
    
    for (const zone of sortedZones) {
        const dx = worldX - zone.centerX;
        const dz = worldZ - zone.centerZ;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance <= zone.radius) {
            biomeCache.set(cacheKey, zone.biome);
            // Ограничиваем размер кэша
            if (biomeCache.size > CACHE_SIZE_LIMIT) {
                const firstKey = biomeCache.keys().next().value;
                if (firstKey) biomeCache.delete(firstKey);
            }
            return zone.biome;
        }
    }
    
    // 3. Определяем по расстоянию от центра (для периферии)
    const distFromCenter = Math.sqrt(worldX * worldX + worldZ * worldZ);
    
    let biome: string;
    if (distFromCenter < 200) {
        biome = "city";
    } else if (distFromCenter < 400) {
        biome = "residential";
    } else {
        biome = "residential"; // Периферия - жилые районы
    }
    
    biomeCache.set(cacheKey, biome);
    // Ограничиваем размер кэша
    if (biomeCache.size > CACHE_SIZE_LIMIT) {
        const firstKey = biomeCache.keys().next().value;
        if (firstKey) biomeCache.delete(firstKey);
    }
    
    return biome;
}

/**
 * Очистить кэш биомов (полезно при смене карты или seed)
 */
export function clearBiomeCache(): void {
    biomeCache.clear();
}

