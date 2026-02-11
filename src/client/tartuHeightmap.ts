/**
 * Tartu Heightmap - Реальные данные высот города Тарту
 * 
 * Данные основаны на реальных топографических картах:
 * - Минимальная высота: 27м
 * - Максимальная высота: 82м
 * - Средняя высота: 53м
 * 
 * Система генерирует процедурную карту высот на основе реальных характеристик местности Тарту
 */

import { NoiseGenerator } from "./noiseGenerator";

/**
 * Параметры высот для Тарту
 */
export interface TartuElevationParams {
    minElevation: number;  // 27м
    maxElevation: number;  // 82м
    avgElevation: number;  // 53м
    mapSize: number;       // Размер карты в игровых единицах
    scale: number;         // Масштаб для процедурной генерации
}

/**
 * Параметры по умолчанию для Тарту
 */
const DEFAULT_TARTU_PARAMS: TartuElevationParams = {
    minElevation: 27,
    maxElevation: 82,
    avgElevation: 53,
    mapSize: 1000,  // 1000 игровых единиц (ограничено для тестов)
    scale: 0.003    // Масштаб для создания холмистой местности
};

/**
 * Кэш для высотных данных
 */
class TartuHeightmapCache {
    private cache: Map<string, number> = new Map();
    private noise: NoiseGenerator;
    private params: TartuElevationParams;
    
    constructor(seed: number, params: TartuElevationParams = DEFAULT_TARTU_PARAMS) {
        this.noise = new NoiseGenerator(seed);
        this.params = params;
    }
    
    /**
     * Получить высоту в точке на основе реальных данных Тарту
     * Использует процедурную генерацию, имитирующую реальный рельеф города
     */
    getHeight(worldX: number, worldZ: number): number {
        const cacheKey = `${Math.floor(worldX / 10)}_${Math.floor(worldZ / 10)}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }
        
        // Нормализуем координаты к центру карты
        const centerX = this.params.mapSize / 2;
        const centerZ = this.params.mapSize / 2;
        const normalizedX = (worldX - centerX) / this.params.mapSize;
        const normalizedZ = (worldZ - centerZ) / this.params.mapSize;
        
        // Базовый рельеф - холмистая местность с долинами
        // Используем несколько слоёв шума для реалистичности
        
        // Крупномасштабный рельеф (холмы и долины)
        const largeScale = this.noise.fbm(
            worldX * this.params.scale * 0.5,
            worldZ * this.params.scale * 0.5,
            4, 2, 0.5
        );
        
        // Среднемасштабный рельеф (склоны)
        const midScale = this.noise.fbm(
            worldX * this.params.scale * 1.5,
            worldZ * this.params.scale * 1.5,
            3, 2, 0.5
        );
        
        // Мелкомасштабный рельеф (детали)
        const fineScale = this.noise.fbm(
            worldX * this.params.scale * 4,
            worldZ * this.params.scale * 4,
            2, 2, 0.5
        );
        
        // Комбинируем слои с весами
        const combinedNoise = largeScale * 0.6 + midScale * 0.3 + fineScale * 0.1;
        
        // Вычисляем финальную высоту
        // Нормализуем шум от -1..1 к 0..1, затем масштабируем к диапазону высот
        const normalizedNoise = (combinedNoise + 1) / 2; // 0..1
        const elevationRange = this.params.maxElevation - this.params.minElevation;
        let height = this.params.minElevation + normalizedNoise * elevationRange;
        
        // Добавляем Toomemägi (Домская гора) - холм в центре города
        const toomemagiX = -200;
        const toomemagiZ = -100;
        const toomemagiRadius = 120;
        const toomemagiHeight = 25; // Высота холма в игровых единицах
        
        const dxToomemagi = worldX - toomemagiX;
        const dzToomemagi = worldZ - toomemagiZ;
        const distToomemagi = Math.sqrt(dxToomemagi * dxToomemagi + dzToomemagi * dzToomemagi);
        
        if (distToomemagi < toomemagiRadius) {
            // Гауссова функция для плавного холма
            const sigma = toomemagiRadius / 2; // Стандартное отклонение
            const toomemagiInfluence = Math.exp(-(distToomemagi * distToomemagi) / (2 * sigma * sigma));
            height += toomemagiInfluence * toomemagiHeight;
        }
        
        // Улучшенная модель реки Эмайыги
        // Река идёт примерно по оси Z через центр (z=0)
        const riverZ = 0; // Центр реки
        const riverWidth = 80; // Ширина реки в метрах
        const riverDepth = 5; // Глубина долины
        
        const distFromRiver = Math.abs(worldZ - riverZ);
        
        if (distFromRiver < riverWidth / 2) {
            // Параболическая форма долины
            const normalizedDist = (distFromRiver / (riverWidth / 2));
            const valleyDepth = riverDepth * (1 - normalizedDist * normalizedDist);
            height -= valleyDepth;
            
            // Дополнительное понижение для русла
            if (distFromRiver < 20) {
                height -= 2; // Дополнительные 2 единицы для русла
            }
        }
        
        // Ограничиваем диапазон
        height = Math.max(this.params.minElevation - 5, Math.min(this.params.maxElevation, height));
        
        // Квантуем для низкополигонального стиля (шаг 1м)
        height = Math.round(height);
        
        // Конвертируем из метров в игровые единицы (1м = 1 игровая единица)
        // Но можно масштабировать для более драматичного рельефа
        const gameHeight = height * 0.3; // Масштабируем для игрового баланса
        
        this.cache.set(cacheKey, gameHeight);
        
        // Ограничиваем размер кэша
        if (this.cache.size > 50000) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        
        return gameHeight;
    }
    
    /**
     * Очистить кэш
     */
    clearCache(): void {
        this.cache.clear();
    }
}

/**
 * Глобальный экземпляр кэша для карты Тарту
 */
let tartuHeightmapCache: TartuHeightmapCache | null = null;

/**
 * Инициализировать систему высот для Тарту
 */
export function initTartuHeightmap(seed: number, params?: Partial<TartuElevationParams>): void {
    const fullParams = { ...DEFAULT_TARTU_PARAMS, ...params };
    tartuHeightmapCache = new TartuHeightmapCache(seed, fullParams);
}

/**
 * Получить высоту для карты Тарту
 */
export function getTartuHeight(worldX: number, worldZ: number): number {
    if (!tartuHeightmapCache) {
        // Инициализируем с дефолтным seed, если не инициализировано
        initTartuHeightmap(12345);
    }
    return tartuHeightmapCache!.getHeight(worldX, worldZ);
}

/**
 * Проверить, инициализирована ли система
 */
export function isTartuHeightmapInitialized(): boolean {
    return tartuHeightmapCache !== null;
}

/**
 * Очистить кэш высот Тарту
 * Вызывается при смене карты на не-Тартарию
 */
export function clearTartuHeightmapCache(): void {
    if (tartuHeightmapCache) {
        tartuHeightmapCache.clearCache();
    }
    tartuHeightmapCache = null;
}

