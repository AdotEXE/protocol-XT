/**
 * @module maps/coastal/CoastalGenerator
 * @description Генератор контента для карты "Побережье"
 * 
 * Прибрежная зона с портом, маяком и пляжами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<CoastalConfig> = {}) {
        super();
        this.config = { ...DEFAULT_COASTAL_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateCoastalContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
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
    
    private generateBeach(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания пляжа
    }
    
    private generatePort(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания порта
    }
    
    private generateLighthouse(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания маяка
    }
}

export default CoastalGenerator;

