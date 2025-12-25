/**
 * @module maps/industrial/IndustrialGenerator
 * @description Генератор контента для карты "Индустриальная зона"
 * 
 * Промышленная зона с заводами, контейнерами и кранами.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
    private chunkSystemDelegate: any = null;
    
    constructor(config: Partial<IndustrialConfig> = {}) {
        super();
        this.config = { ...DEFAULT_INDUSTRIAL_CONFIG, ...config };
    }
    
    setChunkSystemDelegate(chunkSystem: any): void {
        this.chunkSystemDelegate = chunkSystem;
    }
    
    generateContent(context: ChunkGenerationContext): void {
        if (this.chunkSystemDelegate) {
            const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
            this.chunkSystemDelegate.generateIndustrialMapContentExternal(
                chunkX, chunkZ, worldX, worldZ, size, random, chunkParent
            );
            return;
        }
        
        this.generateFactories(context);
        this.generateContainers(context);
        this.generateCranes(context);
    }
    
    private generateFactories(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания заводов
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
    
    private generateCranes(_context: ChunkGenerationContext): void {
        // TODO: Перенести логику создания кранов
    }
}

export default IndustrialGenerator;

