/**
 * Интерфейс для генератора карты
 * Каждый тип карты реализует этот интерфейс
 */

import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SeededRandom } from "./SeededRandom";
import { BiomeType } from "./MapTypes";

/**
 * Контекст генерации чанка
 */
export interface ChunkGenerationContext {
    scene: Scene;
    chunkX: number;
    chunkZ: number;
    worldX: number;
    worldZ: number;
    size: number;
    random: SeededRandom;
    chunkParent: TransformNode;
    biome: BiomeType | string;
}

/**
 * Базовый интерфейс генератора карты
 */
export interface IMapGenerator {
    /**
     * Идентификатор типа карты
     */
    readonly mapType: string;
    
    /**
     * Название карты для отображения
     */
    readonly displayName: string;
    
    /**
     * Описание карты
     */
    readonly description: string;
    
    /**
     * Генерировать контент чанка
     */
    generateContent(context: ChunkGenerationContext): void;
}

/**
 * Фабрика генераторов карт
 */
export class MapGeneratorFactory {
    private static generators: Map<string, IMapGenerator> = new Map();
    
    /**
     * Зарегистрировать генератор карты
     */
    static register(generator: IMapGenerator): void {
        this.generators.set(generator.mapType, generator);
    }
    
    /**
     * Получить генератор по типу карты
     */
    static get(mapType: string): IMapGenerator | undefined {
        return this.generators.get(mapType);
    }
    
    /**
     * Получить все зарегистрированные генераторы
     */
    static getAll(): IMapGenerator[] {
        return Array.from(this.generators.values());
    }
    
    /**
     * Получить список доступных типов карт
     */
    static getAvailableMapTypes(): string[] {
        return Array.from(this.generators.keys());
    }
}

