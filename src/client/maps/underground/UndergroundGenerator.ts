/**
 * @module maps/underground/UndergroundGenerator
 * @description Генератор контента для карты "Подземелье"
 * 
 * Шахты и туннели с опорными столбами и рельсами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";

export interface UndergroundConfig {
    tunnelWidth: number;
    pillarDensity: number;
    trackDensity: number;
}

export const DEFAULT_UNDERGROUND_CONFIG: UndergroundConfig = {
    tunnelWidth: 15,
    pillarDensity: 0.5,
    trackDensity: 0.3
};

export class UndergroundGenerator extends BaseMapGenerator {
    readonly mapType = "underground";
    readonly displayName = "Подземелье";
    readonly description = "Шахты и туннели с рельсами";
    
    private config: UndergroundConfig;
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<UndergroundConfig> = {}) {
        super();
        this.config = { ...DEFAULT_UNDERGROUND_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateUndergroundContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
        this.generateCeiling(context);
        this.generatePillars(context);
        this.generateTracks(context);
        this.generateCrystals(context);
    }
    
    private generateCeiling(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания потолка
    }
    
    private generatePillars(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        const pillarCount = random.int(4, 10);
        
        for (let i = 0; i < pillarCount; i++) {
            if (!random.chance(this.config.pillarDensity)) continue;
            
            const px = random.range(5, size - 5);
            const pz = random.range(5, size - 5);
            const pWorldX = chunkX * size + px;
            const pWorldZ = chunkZ * size + pz;
            
            if (this.isPositionInGarageArea(pWorldX, pWorldZ, 2)) continue;
            
            const height = random.range(8, 15);
            
            this.createCylinder(
                "pillar",
                { diameter: random.range(1, 2), height },
                new Vector3(px, height / 2, pz),
                random.pick(["rock", "rockDark", "concrete"]),
                chunkParent,
                true
            );
        }
    }
    
    private generateTracks(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания рельсов
    }
    
    private generateCrystals(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания кристаллов
    }
}

export default UndergroundGenerator;

