/**
 * @module world/ChunkHelpers
 * @description Вспомогательные функции для работы с чанками
 */

import { Vector3 } from "@babylonjs/core";

/**
 * SeededRandom - Генератор псевдослучайных чисел с сидом
 */
export class SeededRandom {
    private seed: number;
    
    constructor(seed: number) {
        this.seed = seed;
    }
    
    /**
     * Следующее случайное число [0, 1)
     */
    next(): number {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    
    /**
     * Случайное число в диапазоне [min, max)
     */
    range(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
    
    /**
     * Случайное целое число в диапазоне [min, max]
     */
    int(min: number, max: number): number {
        return Math.floor(this.range(min, max + 1));
    }
    
    /**
     * Проверка шанса
     */
    chance(probability: number): boolean {
        return this.next() < probability;
    }
    
    /**
     * Выбор случайного элемента из массива
     */
    pick<T>(arr: T[]): T {
        if (arr.length === 0) throw new Error("Cannot pick from empty array");
        return arr[Math.floor(this.next() * arr.length)]!;
    }
    
    /**
     * Перемешивание массива (Fisher-Yates)
     */
    shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
    
    /**
     * Получение текущего сида (для сохранения состояния)
     */
    getSeed(): number {
        return this.seed;
    }
    
    /**
     * Установка сида
     */
    setSeed(seed: number): void {
        this.seed = seed;
    }
}

/**
 * ChunkHelpers - Вспомогательные функции для чанков
 */
export class ChunkHelpers {
    /**
     * Преобразование мировых координат в координаты чанка
     */
    static worldToChunk(worldX: number, worldZ: number, chunkSize: number): { chunkX: number; chunkZ: number } {
        return {
            chunkX: Math.floor(worldX / chunkSize),
            chunkZ: Math.floor(worldZ / chunkSize)
        };
    }
    
    /**
     * Преобразование координат чанка в мировые
     */
    static chunkToWorld(chunkX: number, chunkZ: number, chunkSize: number): { worldX: number; worldZ: number } {
        return {
            worldX: chunkX * chunkSize,
            worldZ: chunkZ * chunkSize
        };
    }
    
    /**
     * Получение ключа чанка
     */
    static getChunkKey(chunkX: number, chunkZ: number): string {
        return `${chunkX},${chunkZ}`;
    }
    
    /**
     * Парсинг ключа чанка
     */
    static parseChunkKey(key: string): { chunkX: number; chunkZ: number } {
        const [x, z] = key.split(",").map(Number);
        return { chunkX: x, chunkZ: z };
    }
    
    /**
     * Получение соседних чанков
     */
    static getNeighborChunks(chunkX: number, chunkZ: number): Array<{ chunkX: number; chunkZ: number }> {
        return [
            { chunkX: chunkX - 1, chunkZ: chunkZ - 1 },
            { chunkX: chunkX, chunkZ: chunkZ - 1 },
            { chunkX: chunkX + 1, chunkZ: chunkZ - 1 },
            { chunkX: chunkX - 1, chunkZ: chunkZ },
            { chunkX: chunkX + 1, chunkZ: chunkZ },
            { chunkX: chunkX - 1, chunkZ: chunkZ + 1 },
            { chunkX: chunkX, chunkZ: chunkZ + 1 },
            { chunkX: chunkX + 1, chunkZ: chunkZ + 1 }
        ];
    }
    
    /**
     * Получение чанков в радиусе
     */
    static getChunksInRadius(
        centerX: number,
        centerZ: number,
        radius: number
    ): Array<{ chunkX: number; chunkZ: number }> {
        const chunks: Array<{ chunkX: number; chunkZ: number }> = [];
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                if (Math.sqrt(dx * dx + dz * dz) <= radius) {
                    chunks.push({
                        chunkX: centerX + dx,
                        chunkZ: centerZ + dz
                    });
                }
            }
        }
        
        return chunks;
    }
    
    /**
     * Расстояние между чанками
     */
    static chunkDistance(
        chunk1X: number,
        chunk1Z: number,
        chunk2X: number,
        chunk2Z: number
    ): number {
        const dx = chunk1X - chunk2X;
        const dz = chunk1Z - chunk2Z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    /**
     * Проверка, находится ли чанк в пределах видимости
     */
    static isChunkVisible(
        chunkX: number,
        chunkZ: number,
        playerChunkX: number,
        playerChunkZ: number,
        renderDistance: number
    ): boolean {
        return this.chunkDistance(chunkX, chunkZ, playerChunkX, playerChunkZ) <= renderDistance;
    }
    
    /**
     * Линейная интерполяция
     */
    static lerp(a: number, b: number, t: number): number {
        return a + (b - a) * t;
    }
    
    /**
     * Плавный шаг (smoothstep)
     */
    static smoothstep(edge0: number, edge1: number, x: number): number {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }
    
    /**
     * Билинейная интерполяция для высоты террейна
     */
    static bilinearInterpolation(
        x: number,
        z: number,
        x0: number,
        z0: number,
        x1: number,
        z1: number,
        h00: number,
        h10: number,
        h01: number,
        h11: number
    ): number {
        const tx = (x - x0) / (x1 - x0);
        const tz = (z - z0) / (z1 - z0);
        
        const h0 = this.lerp(h00, h10, tx);
        const h1 = this.lerp(h01, h11, tx);
        
        return this.lerp(h0, h1, tz);
    }
    
    /**
     * Проверка пересечения AABB
     */
    static aabbIntersects(
        aX: number, aZ: number, aWidth: number, aDepth: number,
        bX: number, bZ: number, bWidth: number, bDepth: number
    ): boolean {
        return (
            aX - aWidth / 2 < bX + bWidth / 2 &&
            aX + aWidth / 2 > bX - bWidth / 2 &&
            aZ - aDepth / 2 < bZ + bDepth / 2 &&
            aZ + aDepth / 2 > bZ - bDepth / 2
        );
    }
    
    /**
     * Проверка, находится ли точка внутри AABB
     */
    static pointInAABB(
        px: number, pz: number,
        aX: number, aZ: number, aWidth: number, aDepth: number
    ): boolean {
        return (
            px >= aX - aWidth / 2 &&
            px <= aX + aWidth / 2 &&
            pz >= aZ - aDepth / 2 &&
            pz <= aZ + aDepth / 2
        );
    }
    
    /**
     * Генерация сида для чанка на основе мирового сида и позиции
     */
    static getChunkSeed(worldSeed: number, chunkX: number, chunkZ: number): number {
        return (worldSeed * 31 + chunkX) * 31 + chunkZ;
    }
    
    /**
     * Определение биома по координатам (простой noise-based)
     */
    static getBiome(
        x: number, 
        z: number, 
        seed: number
    ): "city" | "industrial" | "residential" | "park" | "wasteland" | "military" {
        const random = new SeededRandom(seed + Math.floor(x / 100) * 1000 + Math.floor(z / 100));
        const value = random.next();
        
        if (value < 0.15) return "park";
        if (value < 0.35) return "residential";
        if (value < 0.55) return "city";
        if (value < 0.7) return "industrial";
        if (value < 0.85) return "wasteland";
        return "military";
    }
}

