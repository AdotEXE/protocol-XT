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
import { SeededRandom } from "../shared/SeededRandom";

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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация пляжей
        const beachSpacing = 40;
        const beachSize = 25;
        
        const startGridX = Math.floor(chunkMinX / beachSpacing) * beachSpacing;
        const startGridZ = Math.floor(chunkMinZ / beachSpacing) * beachSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + beachSpacing; gridX += beachSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + beachSpacing; gridZ += beachSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, beachSize / 2, context)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(0.7)) continue;
                
                const beachX = gridX - worldX;
                const beachZ = gridZ - worldZ;
                const beachSizeVal = localRandom.range(15, 25);
                
                const beach = this.createBox(
                    "beach",
                    { width: beachSizeVal, height: 0.1, depth: beachSizeVal },
                    new Vector3(beachX, 0.05, beachZ),
                    "sand",
                    chunkParent,
                    false
                );
            }
        }
        
        // Детерминированная генерация скал
        const rockSpacing = 50;
        const rockSize = 20;
        
        const startRockX = Math.floor(chunkMinX / rockSpacing) * rockSpacing;
        const startRockZ = Math.floor(chunkMinZ / rockSpacing) * rockSpacing;
        
        for (let gridX = startRockX; gridX < chunkMaxX + rockSpacing; gridX += rockSpacing) {
            for (let gridZ = startRockZ; gridZ < chunkMaxZ + rockSpacing; gridZ += rockSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, rockSize / 2, context)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 1000);
                if (!localRandom.chance(0.6)) continue;
                
                const rockX = gridX - worldX;
                const rockZ = gridZ - worldZ;
                const rockSizeVal = localRandom.range(10, 20);
                
                const rocks = this.createBox(
                    "coastal_rocks",
                    { width: rockSizeVal, height: localRandom.range(1, 3), depth: rockSizeVal },
                    new Vector3(rockX, localRandom.range(0.5, 1.5), rockZ),
                    "rock",
                    chunkParent,
                    false
                );
            }
        }
    }
    
    private generatePort(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация портов
        const portSpacing = 200; // Один порт на большую область
        const portSize = 50;
        
        const startGridX = Math.floor(chunkMinX / portSpacing) * portSpacing;
        const startGridZ = Math.floor(chunkMinZ / portSpacing) * portSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + portSpacing; gridX += portSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + portSpacing; gridZ += portSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, portSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 20)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(this.config.portDensity)) continue;
                
                const portX = gridX - worldX;
                const portZ = gridZ - worldZ;
                
                const pierCount = localRandom.int(3, 5);
                for (let i = 0; i < pierCount; i++) {
                    const pier = this.createBox(
                        "coastal_pier",
                        { width: localRandom.range(30, 50), height: 1, depth: 8 },
                        new Vector3(portX + (i - pierCount/2) * 20, 0.5, portZ),
                        "concrete",
                        chunkParent,
                        false
                    );
                }
                
                const warehouseCount = localRandom.int(3, 5);
                for (let i = 0; i < warehouseCount; i++) {
                    const wh = this.createBox(
                        "coastal_warehouse",
                        { width: 15, height: 8, depth: 10 },
                        new Vector3(portX + localRandom.range(-20, 20), 4, portZ + localRandom.range(-15, 15)),
                        "metalRust",
                        chunkParent,
                        false
                    );
                }
                
                const portCraneCount = localRandom.int(4, 6);
                for (let i = 0; i < portCraneCount; i++) {
                    const craneX = portX + localRandom.range(-25, 25);
                    const craneZ = portZ + localRandom.range(-10, 10);
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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация маяков
        const lighthouseSpacing = 150;
        const lighthouseSize = 4;
        
        const startGridX = Math.floor(chunkMinX / lighthouseSpacing) * lighthouseSpacing;
        const startGridZ = Math.floor(chunkMinZ / lighthouseSpacing) * lighthouseSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + lighthouseSpacing; gridX += lighthouseSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + lighthouseSpacing; gridZ += lighthouseSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, lighthouseSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 5)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 6000);
                if (!localRandom.chance(0.35)) continue;
                
                const lx = gridX - worldX;
                const lz = gridZ - worldZ;
                
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

