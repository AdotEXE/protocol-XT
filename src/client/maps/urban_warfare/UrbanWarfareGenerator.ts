/**
 * @module maps/urban_warfare/UrbanWarfareGenerator
 * @description Генератор контента для карты "Городской бой"
 * 
 * Городские улицы с зданиями, баррикадами и припаркованными машинами.
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

export interface UrbanWarfareConfig {
    buildingDensity: number;
    barricadeDensity: number;
    carDensity: number;
}

export const DEFAULT_URBAN_CONFIG: UrbanWarfareConfig = {
    buildingDensity: 0.6,
    barricadeDensity: 0.4,
    carDensity: 0.5
};

export class UrbanWarfareGenerator extends BaseMapGenerator {
    readonly mapType = "urban_warfare";
    readonly displayName = "Городской бой";
    readonly description = "Городские улицы с зданиями и баррикадами";
    
    private config: UrbanWarfareConfig;
    
    constructor(config: Partial<UrbanWarfareConfig> = {}) {
        super();
        this.config = { ...DEFAULT_URBAN_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        this.generateBuildings(context);
        this.generateStreets(context);
        this.generateBarricades(context);
        this.generateCars(context);
    }
    
    private generateBuildings(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация на основе world координат
        const buildingSpacing = 50; // Расстояние между зданиями
        const buildingSize = 15;
        
        const startGridX = Math.floor(chunkMinX / buildingSpacing) * buildingSpacing;
        const startGridZ = Math.floor(chunkMinZ / buildingSpacing) * buildingSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + buildingSpacing; gridX += buildingSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + buildingSpacing; gridZ += buildingSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, buildingSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 10)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(this.config.buildingDensity)) continue;
                
                const bx = gridX - worldX;
                const bz = gridZ - worldZ;
                const width = localRandom.range(8, 15);
                const height = localRandom.range(10, 25);
                const depth = localRandom.range(8, 15);
                
                this.createBox(
                    "building",
                    { width, height, depth },
                    new Vector3(bx, height / 2, bz),
                    localRandom.pick(["concrete", "brick", "brickDark"]),
                    chunkParent,
                    true
                );
            }
        }
    }
    
    private generateStreets(context: ChunkGenerationContext): void {
        const { size, random, chunkParent } = context;
        
        // Сетка улиц - правильная планировка
        const gridSize = 4;
        const cellSize = size / gridSize;
        const streetWidth = random.range(6, 8);
        
        // Горизонтальные улицы
        for (let i = 1; i < gridSize; i++) {
            const streetZ = i * cellSize;
            const street = this.createBox(
                "grid_street_h",
                { width: size, height: 0.2, depth: streetWidth },
                new Vector3(size / 2, 0.1, streetZ),
                "asphalt",
                chunkParent,
                false
            );
        }
        
        // Вертикальные улицы
        for (let i = 1; i < gridSize; i++) {
            const streetX = i * cellSize;
            const street = this.createBox(
                "grid_street_v",
                { width: streetWidth, height: 0.2, depth: size },
                new Vector3(streetX, 0.1, size / 2),
                "asphalt",
                chunkParent,
                false
            );
        }
    }
    
    private generateBarricades(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация баррикад
        const barricadeSpacing = 15;
        const barricadeSize = 6;
        
        const startGridX = Math.floor(chunkMinX / barricadeSpacing) * barricadeSpacing;
        const startGridZ = Math.floor(chunkMinZ / barricadeSpacing) * barricadeSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + barricadeSpacing; gridX += barricadeSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + barricadeSpacing; gridZ += barricadeSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, barricadeSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 5)) continue;
                if (!this.isPositionNearRoad(gridX, gridZ, 2)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 3000);
                if (!localRandom.chance(this.config.barricadeDensity)) continue;
                
                const bx = gridX - worldX;
                const bz = gridZ - worldZ;
                const blockW = localRandom.range(3, 6);
                const blockH = localRandom.range(1.5, 2.5);
                const block = this.createBox(
                    "barricade",
                    { width: blockW, height: blockH, depth: 1.5 },
                    new Vector3(bx, blockH / 2, bz),
                    "concrete",
                    chunkParent,
                    true
                );
                block.rotation.y = localRandom.range(-0.3, 0.3);
            }
        }
    }
    
    private generateCars(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация машин
        const carSpacing = 10;
        const carSize = 4;
        
        const startGridX = Math.floor(chunkMinX / carSpacing) * carSpacing;
        const startGridZ = Math.floor(chunkMinZ / carSpacing) * carSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + carSpacing; gridX += carSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + carSpacing; gridZ += carSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, carSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 2)) continue;
                if (!this.isPositionNearRoad(gridX, gridZ, 3)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 4000);
                if (!localRandom.chance(this.config.carDensity)) continue;
                
                const vx = gridX - worldX;
                const vz = gridZ - worldZ;
                const car = this.createBox(
                    "parkedCar",
                    { width: 2, height: 1.5, depth: 4 },
                    new Vector3(vx, 0.75, vz),
                    localRandom.pick(["red", "metal", "brickDark"]),
                    chunkParent,
                    false
                );
                car.rotation.y = localRandom.range(0, Math.PI * 2);
            }
        }
    }
}

export default UrbanWarfareGenerator;

