/**
 * @module maps/canyon/CanyonGenerator
 * @description Генератор контента для карты "Каньон"
 * 
 * Каньон - горное ущелье с реками и мостами.
 * Размер арены: определяется в MapConstants.ts (по умолчанию 800x800)
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { MAP_SIZES } from "../MapConstants";
import { SeededRandom } from "../shared/SeededRandom";

export interface CanyonConfig {
    /** Размер арены (из MapConstants.ts) */
    arenaSize: number;
    mountainHeight: number;
    riverWidth: number;
    bridgeDensity: number;
}

/**
 * Конфигурация по умолчанию
 * Использует централизованные константы из MapConstants.ts
 */
export const DEFAULT_CANYON_CONFIG: CanyonConfig = {
    arenaSize: MAP_SIZES.canyon?.size ?? 800,  // Из централизованных констант
    mountainHeight: 30,
    riverWidth: 10,
    bridgeDensity: 0.3
};

export class CanyonGenerator extends BaseMapGenerator {
    readonly mapType = "canyon";
    readonly displayName = "Каньон";
    readonly description = "Горное ущелье с реками и мостами";
    
    private config: CanyonConfig;
    
    constructor(config: Partial<CanyonConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CANYON_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        this.generateMountains(context);
        this.generateRivers(context);
        this.generateBridges(context);
    }
    
    private generateMountains(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация на основе world координат
        const mountainSpacing = 100; // Расстояние между горами
        const mountainSize = 30; // Средний размер горы
        
        const startGridX = Math.floor(chunkMinX / mountainSpacing) * mountainSpacing;
        const startGridZ = Math.floor(chunkMinZ / mountainSpacing) * mountainSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + mountainSpacing; gridX += mountainSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + mountainSpacing; gridZ += mountainSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, mountainSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 15)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(0.5)) continue; // 50% шанс создать гору
                
                const mx = gridX - worldX;
                const mz = gridZ - worldZ;
                const baseSize = localRandom.range(15, 30);
                const height = localRandom.range(10, this.config.mountainHeight);
                
                this.createCylinder(
                    "mountain",
                    { diameterTop: baseSize * 0.1, diameterBottom: baseSize, height },
                    new Vector3(mx, height / 2, mz),
                    localRandom.pick(["rock", "rockDark"]),
                    chunkParent,
                    true
                );
            }
        }
    }
    
    private generateRivers(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
        
        // Несколько рек (35% шанс)
        if (random.chance(0.35)) {
            const startX = random.range(0, size);
            const startZ = random.range(0, size);
            const endX = random.range(0, size);
            const endZ = random.range(0, size);
            this.createRiver(startX, startZ, endX, endZ, random.range(3, 6), random, chunkParent);
        }
    }
    
    /**
     * Создать реку
     */
    private createRiver(startX: number, startZ: number, endX: number, endZ: number, width: number, random: any, chunkParent: any): void {
        const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
        const angle = Math.atan2(endZ - startZ, endX - startX);
        const centerX = (startX + endX) / 2;
        const centerZ = (startZ + endZ) / 2;
        
        // Create rectangular river valley (LOW POLY)
        const river = MeshBuilder.CreateBox("river", {
            width: length,
            height: 1.5,
            depth: width
        }, this.scene);
        
        river.position = new Vector3(centerX, -1.5 / 2, centerZ);
        river.rotation.y = angle;
        
        const waterMat = this.getMat("water");
        river.material = waterMat;
        river.parent = chunkParent;
        river.freezeWorldMatrix();
    }
    
    private generateBridges(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Мосты (20% шанс)
        if (random.chance(0.2)) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);
            const bWorldX = chunkX * size + bx;
            const bWorldZ = chunkZ * size + bz;
            if (this.isPositionInGarageArea(bWorldX, bWorldZ, 8)) return;
            
            const bridgeLength = random.range(12, 20);
            const bridgeHeight = random.range(4, 8);
            
            // Опоры моста
            const pillar1 = this.createBox(
                "bridgePillar",
                { width: 2, height: bridgeHeight, depth: 2 },
                new Vector3(bx - bridgeLength / 2 + 1, bridgeHeight / 2, bz),
                "rock",
                chunkParent,
                true
            );
            
            const pillar2 = this.createBox(
                "bridgePillar",
                { width: 2, height: bridgeHeight, depth: 2 },
                new Vector3(bx + bridgeLength / 2 - 1, bridgeHeight / 2, bz),
                "rock",
                chunkParent,
                true
            );
            
            // Полотно моста
            const deck = this.createBox(
                "bridgeDeck",
                { width: bridgeLength, height: 0.5, depth: 4 },
                new Vector3(bx, bridgeHeight, bz),
                "wood",
                chunkParent,
                true
            );
            
            // Перила
            const rail1 = this.createBox(
                "bridgeRail",
                { width: bridgeLength, height: 1, depth: 0.2 },
                new Vector3(bx, bridgeHeight + 0.75, bz - 1.9),
                "wood",
                chunkParent,
                false
            );
            
            const rail2 = this.createBox(
                "bridgeRail",
                { width: bridgeLength, height: 1, depth: 0.2 },
                new Vector3(bx, bridgeHeight + 0.75, bz + 1.9),
                "wood",
                chunkParent,
                false
            );
        }
    }
}

export default CanyonGenerator;

