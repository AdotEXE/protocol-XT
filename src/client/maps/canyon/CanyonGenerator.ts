/**
 * @module maps/canyon/CanyonGenerator
 * @description Генератор контента для карты "Каньон"
 * 
 * Каньон - горное ущелье с реками и мостами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";

export interface CanyonConfig {
    mountainHeight: number;
    riverWidth: number;
    bridgeDensity: number;
}

export const DEFAULT_CANYON_CONFIG: CanyonConfig = {
    mountainHeight: 30,
    riverWidth: 10,
    bridgeDensity: 0.3
};

export class CanyonGenerator extends BaseMapGenerator {
    readonly mapType = "canyon";
    readonly displayName = "Каньон";
    readonly description = "Горное ущелье с реками и мостами";
    
    private config: CanyonConfig;
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<CanyonConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CANYON_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateCanyonContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
        this.generateMountains(context);
        this.generateRivers(context);
        this.generateBridges(context);
    }
    
    private generateMountains(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        const mountainCount = random.int(1, 3);
        
        for (let i = 0; i < mountainCount; i++) {
            const mx = random.range(10, size - 10);
            const mz = random.range(10, size - 10);
            const mWorldX = chunkX * size + mx;
            const mWorldZ = chunkZ * size + mz;
            
            if (this.isPositionInGarageArea(mWorldX, mWorldZ, 15)) continue;
            
            const baseSize = random.range(15, 30);
            const height = random.range(10, this.config.mountainHeight);
            
            this.createCylinder(
                "mountain",
                { diameterTop: baseSize * 0.1, diameterBottom: baseSize, height },
                new Vector3(mx, height / 2, mz),
                random.pick(["rock", "rockDark"]),
                chunkParent,
                true
            );
        }
    }
    
    private generateRivers(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания рек
    }
    
    private generateBridges(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания мостов
    }
}

export default CanyonGenerator;

