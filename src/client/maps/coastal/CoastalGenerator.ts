/**
 * @module maps/coastal/CoastalGenerator
 * @description Генератор контента для карты "Побережье"
 * 
 * Прибрежная зона с портом, маяком и пляжами.
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

export interface CoastalConfig {
    waterLevel: number;
    beachWidth: number;
    portDensity: number;
}

export const DEFAULT_COASTAL_CONFIG: CoastalConfig = {
    waterLevel: 0,
    beachWidth: 30,
    portDensity: 0.3
};

export class CoastalGenerator extends BaseMapGenerator {
    readonly mapType = "coastal";
    readonly displayName = "Побережье";
    readonly description = "Прибрежная зона с портом и пляжами";
    
    private config: CoastalConfig;
    
    constructor(config: Partial<CoastalConfig> = {}) {
        super();
        this.config = { ...DEFAULT_COASTAL_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        this.generateWater(context);
        this.generateBeach(context);
        this.generatePort(context);
        this.generateLighthouse(context);
    }
    
    private generateWater(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ, worldZ } = context;
        
        // Вода на юге карты
        if (worldZ < 0) {
            const waterDepth = Math.min(size, Math.abs(worldZ));
            
            this.createBox(
                "water",
                { width: size, height: 0.5, depth: waterDepth },
                new Vector3(size / 2, this.config.waterLevel, waterDepth / 2),
                "water",
                chunkParent,
                false
            );
        }
    }
    
    private generateBeach(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Смешанный берег: песчаные пляжи + скалистые участки
        if (random.chance(0.7)) {
            const beachX = random.range(10, size - 10);
            const beachZ = random.range(10, size - 10);
            const beachSize = random.range(15, 25);
            
            const beach = this.createBox(
                "beach",
                { width: beachSize, height: 0.1, depth: beachSize },
                new Vector3(beachX, 0.05, beachZ),
                "sand",
                chunkParent,
                false
            );
        }
        
        // Скалистые участки
        if (random.chance(0.6)) {
            const rockX = random.range(10, size - 10);
            const rockZ = random.range(10, size - 10);
            const rockSize = random.range(10, 20);
            
            const rocks = this.createBox(
                "coastal_rocks",
                { width: rockSize, height: random.range(1, 3), depth: rockSize },
                new Vector3(rockX, random.range(0.5, 1.5), rockZ),
                "rock",
                chunkParent,
                false
            );
        }
    }
    
    private generatePort(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Большой порт (30% шанс)
        if (random.chance(0.3)) {
            const portX = random.range(25, size - 25);
            const portZ = random.range(25, size - 25);
            const portWorldX = chunkX * size + portX;
            const portWorldZ = chunkZ * size + portZ;
            
            if (!this.isPositionInGarageArea(portWorldX, portWorldZ, 20)) {
                const pierCount = random.int(3, 5);
                for (let i = 0; i < pierCount; i++) {
                    const pier = this.createBox(
                        "coastal_pier",
                        { width: random.range(30, 50), height: 1, depth: 8 },
                        new Vector3(portX + (i - pierCount/2) * 20, 0.5, portZ),
                        "concrete",
                        chunkParent,
                        false
                    );
                }
                
                const warehouseCount = random.int(3, 5);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = this.createBox(
                        "coastal_warehouse",
                        { width: 15, height: 8, depth: 10 },
                        new Vector3(portX + random.range(-20, 20), 4, portZ + random.range(-15, 15)),
                        "metalRust",
                        chunkParent,
                        false
                    );
                }
                
                const portCraneCount = random.int(4, 6);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + random.range(-25, 25);
                    const craneZ = portZ + random.range(-10, 10);
                    const tower = this.createBox(
                        "coastal_crane",
                        { width: 2, height: 18, depth: 2 },
                        new Vector3(craneX, 9, craneZ),
                        "yellow",
                        chunkParent,
                        false
                    );
                }
            }
        }
    }
    
    private generateLighthouse(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Несколько маяков (35% шанс)
        if (random.chance(0.35)) {
            const lx = random.range(15, size - 15);
            const lz = random.range(15, size - 15);
            const lWorldX = chunkX * size + lx;
            const lWorldZ = chunkZ * size + lz;
            
            if (!this.isPositionInGarageArea(lWorldX, lWorldZ, 5)) {
                const base = this.createBox(
                    "lighthouseBase",
                    { width: 4, height: 3, depth: 4 },
                    new Vector3(lx, 1.5, lz),
                    "concrete",
                    chunkParent,
                    false
                );
                
                const tower = this.createBox(
                    "lighthouseTower",
                    { width: 2, height: 12, depth: 2 },
                    new Vector3(lx, 9, lz),
                    "white",
                    chunkParent,
                    false
                );
                
                const top = this.createBox(
                    "lighthouseTop",
                    { width: 3, height: 1, depth: 3 },
                    new Vector3(lx, 16.5, lz),
                    "yellow",
                    chunkParent,
                    false
                );
            }
        }
    }
}

export default CoastalGenerator;

