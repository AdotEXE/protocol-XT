/**
 * @module maps/custom/CustomMapGenerator
 * @description Генератор для пользовательских карт, созданных в PolyGenStudio
 * 
 * Загружает карты из формата .txmap и создаёт объекты в игре.
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/**
 * Формат данных карты из PolyGenStudio
 */
export interface TXMapData {
    version: number;
    name: string;
    mapType: string;
    mapSize?: number;
    placedObjects: TXPlacedObject[];
    triggers: TXMapTrigger[];
    terrainEdits: TXTerrainEdit[];
    metadata: {
        createdAt?: string;
        description?: string;
        author?: string;
        polygenVersion?: string;
    };
}

export interface TXPlacedObject {
    id: string;
    type: 'building' | 'tree' | 'rock' | 'spawn' | 'garage' | 'custom' | 'npc';
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
    properties: {
        color?: string;
        material?: string;
        name?: string;
        hasCollision?: boolean;
        isDestructible?: boolean;
    };
}

export interface TXMapTrigger {
    id: string;
    type: 'spawn' | 'teleport' | 'damage' | 'heal' | 'custom';
    position: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    properties: Record<string, any>;
}

export interface TXTerrainEdit {
    x: number;
    z: number;
    height: number;
    radius: number;
    operation: 'raise' | 'lower' | 'flatten' | 'smooth';
}

/**
 * Конфигурация пользовательской карты
 */
export interface CustomMapConfig {
    mapData: TXMapData | null;
    mapSize: number;
}

export const DEFAULT_CUSTOM_CONFIG: CustomMapConfig = {
    mapData: null,
    mapSize: 200
};

/**
 * Генератор пользовательских карт
 */
export class CustomMapGenerator extends BaseMapGenerator {
    readonly mapType = "custom";
    readonly displayName = "Пользовательская карта";
    readonly description = "Карта, созданная в PolyGenStudio Map Editor";

    private config: CustomMapConfig;
    private objectsGenerated: Set<string> = new Set();
    private static activeMapData: TXMapData | null = null;

    constructor(config: Partial<CustomMapConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CUSTOM_CONFIG, ...config };

        // If no map data provided in config, try to use the globally active map
        if (!this.config.mapData && CustomMapGenerator.activeMapData) {
            this.config.mapData = CustomMapGenerator.activeMapData;
            this.config.mapSize = CustomMapGenerator.activeMapData.mapSize || 200;
        }
    }

    /**
     * Загрузить данные карты
     */
    loadMapData(mapData: TXMapData): void {
        CustomMapGenerator.activeMapData = mapData;
        this.config.mapData = mapData;
        this.config.mapSize = mapData.mapSize || 200;
        this.objectsGenerated.clear();
        console.log(`[CustomMapGenerator] Loaded map: ${mapData.name} with ${mapData.placedObjects.length} objects`);
    }

    /**
     * Загрузить карту из JSON строки
     */
    loadMapFromJSON(jsonString: string): boolean {
        try {
            const mapData = JSON.parse(jsonString) as TXMapData;
            if (!mapData.version || !mapData.placedObjects) {
                console.error("[CustomMapGenerator] Invalid map format");
                return false;
            }
            this.loadMapData(mapData);
            return true;
        } catch (e) {
            console.error("[CustomMapGenerator] Failed to parse map JSON:", e);
            return false;
        }
    }

    /**
     * Загрузить карту из localStorage
     */
    loadMapFromLocal(mapName: string): boolean {
        const mapsJson = localStorage.getItem('tx_custom_maps');
        if (!mapsJson) {
            console.error("[CustomMapGenerator] No custom maps in localStorage");
            return false;
        }

        try {
            const maps = JSON.parse(mapsJson) as Record<string, TXMapData>;
            if (maps[mapName]) {
                this.loadMapData(maps[mapName]);
                return true;
            }
            console.error(`[CustomMapGenerator] Map '${mapName}' not found`);
            return false;
        } catch (e) {
            console.error("[CustomMapGenerator] Failed to load map from localStorage:", e);
            return false;
        }
    }

    /**
     * Получить список сохранённых карт
     */
    static getAvailableMaps(): string[] {
        const mapsJson = localStorage.getItem('tx_custom_maps');
        if (!mapsJson) return [];

        try {
            const maps = JSON.parse(mapsJson) as Record<string, TXMapData>;
            return Object.keys(maps);
        } catch {
            return [];
        }
    }

    /**
     * Get spawn positions from triggers for the game spawn system
     * This bridges the gap between map triggers and chunkSystem.garagePositions
     */
    getSpawnPositions(): Vector3[] {
        if (!this.config.mapData) {
            console.warn("[CustomMapGenerator] No map data - using default spawns");
            return this.getDefaultSpawnPositions();
        }

        // Extract spawn positions from triggers
        const spawnTriggers = this.config.mapData.triggers.filter(t => t.type === 'spawn');

        // Also check placedObjects for spawn-type objects (legacy support)
        const spawnObjects = this.config.mapData.placedObjects.filter(o => o.type === 'spawn');

        const positions: Vector3[] = [];

        // Add positions from triggers
        for (const trigger of spawnTriggers) {
            positions.push(new Vector3(trigger.position.x, trigger.position.y, trigger.position.z));
        }

        // Add positions from spawn objects
        for (const obj of spawnObjects) {
            positions.push(new Vector3(obj.position.x, obj.position.y, obj.position.z));
        }

        console.log(`[CustomMapGenerator] Found ${positions.length} spawn positions from map data`);

        // If no spawns found, provide defaults
        if (positions.length === 0) {
            console.warn("[CustomMapGenerator] No spawns in map - using defaults");
            return this.getDefaultSpawnPositions();
        }

        return positions;
    }

    /**
     * Generate default spawn positions for maps without explicit spawns
     */
    private getDefaultSpawnPositions(): Vector3[] {
        const half = this.config.mapSize / 2;
        const offset = half * 0.7; // 70% from center to edge

        return [
            new Vector3(-offset, 2, -offset),  // SW corner
            new Vector3(offset, 2, -offset),   // SE corner
            new Vector3(-offset, 2, offset),   // NW corner
            new Vector3(offset, 2, offset),    // NE corner
            new Vector3(0, 2, 0),              // Center
        ];
    }

    /**
     * Get active map data (for external access)
     */
    static getActiveMapData(): TXMapData | null {
        return CustomMapGenerator.activeMapData;
    }

    /**
     * Основной метод генерации контента
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;

        if (!this.config.mapData) {
            console.warn("[CustomMapGenerator] No map data loaded");
            return;
        }

        const mapHalf = this.config.mapSize / 2;
        const mapMinX = -mapHalf;
        const mapMaxX = mapHalf;
        const mapMinZ = -mapHalf;
        const mapMaxZ = mapHalf;

        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        // Skip if chunk is outside map bounds
        if (chunkMaxX < mapMinX || chunkMinX > mapMaxX ||
            chunkMaxZ < mapMinZ || chunkMinZ > mapMaxZ) {
            return;
        }

        // Create content root
        const contentRoot = new TransformNode("custom_content", chunkParent.getScene());
        contentRoot.parent = chunkParent;

        // Generate objects that belong to this chunk
        this.generateObjects(context, contentRoot);

        // Generate triggers (spawn points, etc.)
        this.generateTriggers(context, contentRoot);

        // Generate perimeter walls
        this.generatePerimeter(context, contentRoot);

        // Merge meshes for performance
        this.mergePendingMeshes(contentRoot);
    }

    /**
     * Генерация объектов карты
     */
    private generateObjects(context: ChunkGenerationContext, parent: TransformNode): void {
        if (!this.config.mapData) return;

        for (const obj of this.config.mapData.placedObjects) {
            // Skip if already generated
            if (this.objectsGenerated.has(obj.id)) continue;

            const pos = new Vector3(obj.position.x, obj.position.y, obj.position.z);

            // Check if object center is in this chunk
            if (!this.isObjectInChunk(pos, context)) continue;

            // Mark as generated
            this.objectsGenerated.add(obj.id);

            // Create the object
            this.createMapObject(obj, parent);
        }
    }

    /**
     * Проверка, находится ли объект в текущем чанке
     */
    private isObjectInChunk(pos: Vector3, context: ChunkGenerationContext): boolean {
        const chunkSize = context.size;
        const objChunkX = Math.floor(pos.x / chunkSize);
        const objChunkZ = Math.floor(pos.z / chunkSize);
        return objChunkX === context.chunkX && objChunkZ === context.chunkZ;
    }

    /**
     * Создание объекта карты
     */
    private createMapObject(obj: TXPlacedObject, parent: TransformNode): void {
        const pos = new Vector3(obj.position.x, obj.position.y, obj.position.z);
        const size = {
            width: obj.scale.x,
            height: obj.scale.y,
            depth: obj.scale.z
        };

        // Parse color
        let color = new Color3(0.5, 0.5, 0.5);
        if (obj.properties.color) {
            color = Color3.FromHexString(obj.properties.color);
        }

        // Create material based on object type
        const matName = `custom_${obj.type}_${obj.id.substring(0, 4)}`;
        const material = this.createMaterial(matName, color);

        // Apply type-specific properties
        switch (obj.type) {
            case 'building':
                material.specularColor = new Color3(0.1, 0.1, 0.1);
                break;
            case 'tree':
                material.specularColor = new Color3(0, 0, 0);
                break;
            case 'rock':
                material.specularColor = new Color3(0.2, 0.2, 0.2);
                break;
            case 'spawn':
            case 'garage':
                material.emissiveColor = color.scale(0.3);
                break;
            case 'npc':
                material.emissiveColor = new Color3(1, 0, 0); // Red marker
                material.alpha = 0.5; // Semi-transparent marker
                break;
        }

        // Create the box with physics
        // Disable static physics for NPCs (they are dynamic entities)
        const addPhysics = obj.type === 'npc' ? false : (obj.properties.hasCollision !== false);
        const objectName = obj.properties.name || `${obj.type}_${obj.id.substring(0, 6)}`;

        this.createBox(
            objectName,
            size,
            pos,
            material,
            parent,
            addPhysics,
            true // defer merge for performance
        );
    }

    /**
     * Генерация триггеров (spawn точек и т.д.)
     */
    private generateTriggers(context: ChunkGenerationContext, parent: TransformNode): void {
        if (!this.config.mapData) return;

        for (const trigger of this.config.mapData.triggers) {
            const pos = new Vector3(trigger.position.x, trigger.position.y, trigger.position.z);

            if (!this.isObjectInChunk(pos, context)) continue;

            // Visual marker for triggers (semi-transparent)
            const color = this.getTriggerColor(trigger.type);
            const material = this.createMaterial(`trigger_${trigger.id}`, color, color.scale(0.5));
            material.alpha = 0.3;

            this.createBox(
                `trigger_${trigger.type}_${trigger.id.substring(0, 6)}`,
                { width: trigger.size.x, height: trigger.size.y, depth: trigger.size.z },
                pos,
                material,
                parent,
                false, // No physics for triggers
                false
            );
        }
    }

    /**
     * Получить цвет триггера по типу
     */
    private getTriggerColor(type: string): Color3 {
        switch (type) {
            case 'spawn': return new Color3(0, 1, 0);      // Green
            case 'teleport': return new Color3(0.5, 0, 1); // Purple
            case 'damage': return new Color3(1, 0, 0);     // Red
            case 'heal': return new Color3(0, 1, 0.5);     // Cyan-green
            default: return new Color3(1, 1, 0);           // Yellow
        }
    }

    /**
     * Генерация стен периметра
     */
    private generatePerimeter(context: ChunkGenerationContext, parent: TransformNode): void {
        const half = this.config.mapSize / 2;
        const height = 6;
        const thickness = 2;

        const wallMat = this.createMaterial("custom_wall_mat", new Color3(0.2, 0.2, 0.25));

        const drawWall = (pos: Vector3, w: number, d: number) => {
            if (this.isObjectInChunk(pos, context)) {
                this.createBox(
                    "perimeter_wall",
                    { width: w, height: height, depth: d },
                    new Vector3(pos.x, height / 2, pos.z),
                    wallMat,
                    parent,
                    true,
                    true
                );
            }
        };

        // North/South Walls
        drawWall(new Vector3(0, 0, half), this.config.mapSize + thickness, thickness);
        drawWall(new Vector3(0, 0, -half), this.config.mapSize + thickness, thickness);

        // East/West Walls
        drawWall(new Vector3(half, 0, 0), thickness, this.config.mapSize + thickness);
        drawWall(new Vector3(-half, 0, 0), thickness, this.config.mapSize + thickness);
    }
}

// Singleton instance for easy access
let customMapGeneratorInstance: CustomMapGenerator | null = null;

export function getCustomMapGenerator(): CustomMapGenerator {
    if (!customMapGeneratorInstance) {
        customMapGeneratorInstance = new CustomMapGenerator();
    }
    return customMapGeneratorInstance;
}

export function loadCustomMap(mapDataOrName: TXMapData | string): boolean {
    const generator = getCustomMapGenerator();

    if (typeof mapDataOrName === 'string') {
        return generator.loadMapFromLocal(mapDataOrName);
    } else {
        generator.loadMapData(mapDataOrName);
        return true;
    }
}
