/**
 * @module maps/industrial/IndustrialGenerator
 * @description Генератор контента для карты "Индустриальная зона"
 * 
 * Промышленная зона с заводами, контейнерами и кранами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { SeededRandom } from "../shared/SeededRandom";

export interface IndustrialConfig {
    factoryDensity: number;
    containerDensity: number;
    craneDensity: number;
}

export const DEFAULT_INDUSTRIAL_CONFIG: IndustrialConfig = {
    factoryDensity: 0.4,
    containerDensity: 0.7,
    craneDensity: 0.2
};

export class IndustrialGenerator extends BaseMapGenerator {
    readonly mapType = "industrial";
    readonly displayName = "Промзона";
    readonly description = "Заводы, контейнеры и краны";
    
    private config: IndustrialConfig;
    
    constructor(config: Partial<IndustrialConfig> = {}) {
        super();
        this.config = { ...DEFAULT_INDUSTRIAL_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        // Генерируем элементы только если чанк попадает в область карты
        // Используем детерминированную генерацию на основе worldX/worldZ
        this.generateFactories(context);
        this.generateContainers(context);
        this.generateCranes(context);
    }
    
    private generateFactories(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Используем детерминированную генерацию на основе world координат
        // Создаем сетку заводов по всей карте, но только те, что попадают в чанк
        const factorySpacing = 60; // Расстояние между заводами
        const factorySize = 25; // Средний размер завода
        
        // Находим ближайшую сетку к началу чанка
        const startGridX = Math.floor(chunkMinX / factorySpacing) * factorySpacing;
        const startGridZ = Math.floor(chunkMinZ / factorySpacing) * factorySpacing;
        
        // Генерируем только заводы, которые попадают в этот чанк
        for (let gridX = startGridX; gridX < chunkMaxX + factorySpacing; gridX += factorySpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + factorySpacing; gridZ += factorySpacing) {
                // Проверяем, попадает ли завод в чанк
                if (gridX + factorySize / 2 < chunkMinX || gridX - factorySize / 2 > chunkMaxX ||
                    gridZ + factorySize / 2 < chunkMinZ || gridZ - factorySize / 2 > chunkMaxZ) {
                    continue;
                }
                
                // Детерминированный random на основе координат
                const seed = Math.floor(gridX * 1000 + gridZ);
                const localRandom = new SeededRandom(seed);
                
                if (this.isPositionInGarageArea(gridX, gridZ, 15)) continue;
                
                const fx = gridX - worldX;
                const fz = gridZ - worldZ;
                
                const factory = this.createBox(
                    "factory",
                    { width: localRandom.range(20, 30), height: localRandom.range(8, 15), depth: localRandom.range(25, 35) },
                    new Vector3(fx, localRandom.range(4, 7.5), fz),
                    localRandom.pick(["metal", "concrete", "metalRust"]),
                    chunkParent,
                    true
                );
                
                // Add smokestacks
                if (localRandom.chance(0.7)) {
                    const stack = this.createBox(
                        "stack",
                        { width: 2, height: localRandom.range(10, 18), depth: 2 },
                        new Vector3(fx + localRandom.range(-10, 10), localRandom.range(5, 9), fz + localRandom.range(-10, 10)),
                        "brickDark",
                        chunkParent,
                        true
                    );
                }
            }
        }
    }
    
    private generateContainers(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Используем детерминированную генерацию на основе world координат
        const containerSpacing = 12; // Расстояние между контейнерами
        const containerSize = 6;
        
        const startGridX = Math.floor(chunkMinX / containerSpacing) * containerSpacing;
        const startGridZ = Math.floor(chunkMinZ / containerSpacing) * containerSpacing;
        
        // Генерируем только контейнеры, которые попадают в этот чанк
        for (let gridX = startGridX; gridX < chunkMaxX + containerSpacing; gridX += containerSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + containerSpacing; gridZ += containerSpacing) {
                // Проверяем, попадает ли контейнер в чанк
                if (gridX + containerSize / 2 < chunkMinX || gridX - containerSize / 2 > chunkMaxX ||
                    gridZ + containerSize / 2 < chunkMinZ || gridZ - containerSize / 2 > chunkMaxZ) {
                    continue;
                }
                
                // Детерминированный random на основе координат
                const seed = Math.floor(gridX * 1000 + gridZ);
                const localRandom = new SeededRandom(seed);
                
                if (!localRandom.chance(this.config.containerDensity)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 5)) continue;
                
                const cx = gridX - worldX;
                const cz = gridZ - worldZ;
                
                const containerHeight = localRandom.pick([2.5, 2.5, 5]);
                const stacked = localRandom.chance(0.3);
                const yPos = stacked ? containerHeight * 1.5 : containerHeight / 2;
                
                this.createBox(
                    "container",
                    { width: 2.4, height: containerHeight, depth: 6 },
                    new Vector3(cx, yPos, cz),
                    localRandom.pick(["containerRed", "containerBlue", "containerGreen", "metalRust"]),
                    chunkParent,
                    true
                );
            }
        }
    }
    
    private generateCranes(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Используем детерминированную генерацию на основе world координат
        const craneSpacing = 80; // Расстояние между кранами
        const craneSize = 10;
        
        const startGridX = Math.floor(chunkMinX / craneSpacing) * craneSpacing;
        const startGridZ = Math.floor(chunkMinZ / craneSpacing) * craneSpacing;
        
        // Генерируем только краны, которые попадают в этот чанк
        for (let gridX = startGridX; gridX < chunkMaxX + craneSpacing; gridX += craneSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + craneSpacing; gridZ += craneSpacing) {
                // Проверяем, попадает ли кран в чанк
                if (gridX + craneSize / 2 < chunkMinX || gridX - craneSize / 2 > chunkMaxX ||
                    gridZ + craneSize / 2 < chunkMinZ || gridZ - craneSize / 2 > chunkMaxZ) {
                    continue;
                }
                
                // Детерминированный random на основе координат
                const seed = Math.floor(gridX * 1000 + gridZ);
                const localRandom = new SeededRandom(seed);
                
                if (!localRandom.chance(this.config.craneDensity)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 10)) continue;
                
                const craneX = gridX - worldX;
                const craneZ = gridZ - worldZ;
                
                const tower = this.createBox(
                    "craneTower",
                    { width: 2, height: 15, depth: 2 },
                    new Vector3(craneX, 7.5, craneZ),
                    "yellow",
                    chunkParent,
                    false
                );
                
                const arm = this.createBox(
                    "craneArm",
                    { width: 1, height: 1, depth: 18 },
                    new Vector3(craneX, 14, craneZ + 8),
                    "yellow",
                    chunkParent,
                    false
                );
            }
        }
    }
}

export default IndustrialGenerator;

