import { TransformNode, Scene, Mesh, StandardMaterial } from "@babylonjs/core";
import { SeededRandom } from "./SeededRandom";

/**
 * Типы биомов для normal карты
 */
export type BiomeType = "city" | "industrial" | "residential" | "park" | "wasteland" | "military";

/**
 * Интерфейс для данных чанка
 */
export interface ChunkData {
    x: number;
    z: number;
    node: TransformNode;
    meshes: Mesh[];
    loaded: boolean;
    lastAccess: number;
}

/**
 * Конфигурация системы чанков
 */
export interface ChunkConfig {
    chunkSize: number;
    renderDistance: number;
    unloadDistance: number;
    worldSeed: number;
    mapType?: string;
}

/**
 * Интерфейс для генератора карты
 */
export interface IMapGenerator {
    /**
     * Генерирует контент чанка
     */
    generateContent(
        chunkX: number,
        chunkZ: number,
        worldX: number,
        worldZ: number,
        size: number,
        random: SeededRandom,
        chunkParent: TransformNode
    ): void;

    /**
     * Возвращает имя карты
     */
    getName(): string;
}

/**
 * Контекст генерации для передачи в генераторы
 */
export interface GenerationContext {
    scene: Scene;
    config: ChunkConfig;
    materials: Map<string, StandardMaterial>;
    garagePositions: Array<{ x: number, z: number }>;
    isPositionInGarageArea: (x: number, z: number, margin: number) => boolean;
    isPositionNearRoad: (x: number, z: number, distance: number) => boolean;
    getTerrainHeight: (x: number, z: number, biome: string) => number;
    getMat: (name: string) => StandardMaterial;
}

/**
 * Типы зданий для генерации
 */
export interface BuildingType {
    w: number;
    h: number;
    d: number;
    mat: string;
}

/**
 * Позиция объекта с радиусом
 */
export interface ObjectPosition {
    pos: { x: number, z: number };
    radius: number;
}

/**
 * Тип карты
 */
export type MapType =
    | "normal"
    | "sandbox"
    | "sand"
    | "madness"
    | "expo"
    | "brest"
    | "arena"
    | "polygon"
    | "frontline"
    | "ruins"
    | "canyon"
    | "industrial"
    | "urban_warfare"
    | "underground"
    | "coastal"
    | "tartaria"
    | "islands"
    | "custom";

/**
 * Информация о типе карты
 */
export interface MapTypeInfo {
    id: MapType;
    name: string;
    description: string;
    icon?: string;
}

/**
 * Список всех доступных типов карт
 */
export const MAP_TYPES: MapTypeInfo[] = [
    { id: "sand", name: "Песок", description: "Компактная двухуровневая арена для танковых боёв" },
    { id: "normal", name: "Обычная", description: "Стандартная карта с городами и природой" },
    { id: "custom", name: "Кастомная", description: "Пользовательская карта из редактора" }
];

