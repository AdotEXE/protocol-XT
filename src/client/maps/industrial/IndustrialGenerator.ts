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
        this.generateFactories(context);
        this.generateContainers(context);
        this.generateCranes(context);
    }
    
    private generateFactories(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Несколько средних заводов (2-4 на чанк)
        const factoryCount = random.int(2, 4);
        for (let i = 0; i < factoryCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunkX * size + fx;
            const fWorldZ = chunkZ * size + fz;
            
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 15)) continue;
            
            const factory = this.createBox(
                "factory",
                { width: random.range(20, 30), height: random.range(8, 15), depth: random.range(25, 35) },
                new Vector3(fx, random.range(4, 7.5), fz),
                random.pick(["metal", "concrete", "metalRust"]),
                chunkParent,
                true
            );
            
            // Add smokestacks
            if (random.chance(0.7)) {
                const stack = this.createBox(
                    "stack",
                    { width: 2, height: random.range(10, 18), depth: 2 },
                    new Vector3(fx + random.range(-10, 10), random.range(5, 9), fz + random.range(-10, 10)),
                    "brickDark",
                    chunkParent,
                    true
                );
            }
        }
    }
    
    private generateContainers(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        const containerCount = random.int(5, 15);
        
        for (let i = 0; i < containerCount; i++) {
            if (!random.chance(this.config.containerDensity)) continue;
            
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * size + cx;
            const cWorldZ = chunkZ * size + cz;
            
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 5)) continue;
            
            const containerHeight = random.pick([2.5, 2.5, 5]); // Стандартные или высокие
            const stacked = random.chance(0.3);
            const yPos = stacked ? containerHeight * 1.5 : containerHeight / 2;
            
            this.createBox(
                "container",
                { width: 2.4, height: containerHeight, depth: 6 },
                new Vector3(cx, yPos, cz),
                random.pick(["containerRed", "containerBlue", "containerGreen", "metalRust"]),
                chunkParent,
                true
            );
        }
    }
    
    private generateCranes(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Несколько кранов (4-6 на чанк)
        const craneCount = random.int(4, 6);
        for (let i = 0; i < craneCount; i++) {
            const craneX = random.range(15, size - 15);
            const craneZ = random.range(15, size - 15);
            const cWorldX = chunkX * size + craneX;
            const cWorldZ = chunkZ * size + craneZ;
            
            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
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

