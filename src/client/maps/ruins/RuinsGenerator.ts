/**
 * @module maps/ruins/RuinsGenerator
 * @description Генератор контента для карты "Руины"
 * 
 * Руины - разрушенный город с обломками зданий.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";

export interface RuinsConfig {
    destructionLevel: number;
    rubbleDensity: number;
    buildingDensity: number;
}

export const DEFAULT_RUINS_CONFIG: RuinsConfig = {
    destructionLevel: 0.7,
    rubbleDensity: 0.8,
    buildingDensity: 0.6
};

export class RuinsGenerator extends BaseMapGenerator {
    readonly mapType = "ruins";
    readonly displayName = "Руины";
    readonly description = "Разрушенный город с обломками зданий";
    
    private config: RuinsConfig;
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<RuinsConfig> = {}) {
        super();
        this.config = { ...DEFAULT_RUINS_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateRuinsContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
        this.generateRubble(context);
        this.generateBuildings(context);
        this.generateDebris(context);
    }
    
    private generateRubble(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        const rubbleCount = random.int(5, 15);
        
        for (let i = 0; i < rubbleCount; i++) {
            if (!random.chance(this.config.rubbleDensity)) continue;
            
            const rx = random.range(5, size - 5);
            const rz = random.range(5, size - 5);
            const rWorldX = chunkX * size + rx;
            const rWorldZ = chunkZ * size + rz;
            
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 2)) continue;
            
            const rubbleSize = random.range(1, 4);
            const rubbleHeight = random.range(0.5, 2);
            
            this.createBox(
                "rubble",
                { width: rubbleSize, height: rubbleHeight, depth: rubbleSize },
                new Vector3(rx, rubbleHeight / 2, rz),
                random.pick(["concrete", "brick", "brickDark"]),
                chunkParent,
                true
            );
        }
    }
    
    private generateBuildings(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания разрушенных зданий
    }
    
    private generateDebris(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания обломков
    }
}

export default RuinsGenerator;

