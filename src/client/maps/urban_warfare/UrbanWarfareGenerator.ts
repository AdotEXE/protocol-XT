/**
 * @module maps/urban_warfare/UrbanWarfareGenerator
 * @description Генератор контента для карты "Городской бой"
 * 
 * Городские улицы с зданиями, баррикадами и припаркованными машинами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<UrbanWarfareConfig> = {}) {
        super();
        this.config = { ...DEFAULT_URBAN_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateUrbanWarfareContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
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
    
    private generateStreets(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания дорог
    }
    
    private generateBarricades(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания баррикад
    }
    
    private generateCars(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания машин
    }
}

export default UrbanWarfareGenerator;

