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
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        const buildingCount = random.int(2, 5);
        
        for (let i = 0; i < buildingCount; i++) {
            if (!random.chance(this.config.buildingDensity)) continue;
            
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * size + bx;
            const bWorldZ = chunkZ * size + bz;
            
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 10)) continue;
            
            const width = random.range(8, 15);
            const height = random.range(10, 25);
            const depth = random.range(8, 15);
            
            this.createBox(
                "building",
                { width, height, depth },
                new Vector3(bx, height / 2, bz),
                random.pick(["concrete", "brick", "brickDark"]),
                chunkParent,
                true
            );
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
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Barricades on roads
        for (let i = 0; i < random.int(6, 12); i++) {
            const bx = random.range(10, size - 10);
            const bz = random.range(10, size - 10);
            const bWorldX = chunkX * size + bx;
            const bWorldZ = chunkZ * size + bz;
            
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 5)) continue;
            if (this.isPositionNearRoad(bWorldX, bWorldZ, 2)) {
                // Бетонные блоки
                const blockW = random.range(3, 6);
                const blockH = random.range(1.5, 2.5);
                const block = this.createBox(
                    "barricade",
                    { width: blockW, height: blockH, depth: 1.5 },
                    new Vector3(bx, blockH / 2, bz),
                    "concrete",
                    chunkParent,
                    true
                );
                block.rotation.y = random.range(-0.3, 0.3);
            }
        }
    }
    
    private generateCars(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Parked vehicles as cover
        for (let i = 0; i < random.int(8, 15); i++) {
            const vx = random.range(5, size - 5);
            const vz = random.range(5, size - 5);
            const vWorldX = chunkX * size + vx;
            const vWorldZ = chunkZ * size + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 2)) continue;
            if (this.isPositionNearRoad(vWorldX, vWorldZ, 3)) {
                const car = this.createBox(
                    "parkedCar",
                    { width: 2, height: 1.5, depth: 4 },
                    new Vector3(vx, 0.75, vz),
                    random.pick(["red", "metal", "brickDark"]),
                    chunkParent,
                    false
                );
                car.rotation.y = random.range(0, Math.PI * 2);
            }
        }
    }
}

export default UrbanWarfareGenerator;

