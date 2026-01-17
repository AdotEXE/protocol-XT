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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация рек
        const riverSpacing = 300; // Одна река на большую область
        const riverSize = 100;
        
        const startGridX = Math.floor(chunkMinX / riverSpacing) * riverSpacing;
        const startGridZ = Math.floor(chunkMinZ / riverSpacing) * riverSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + riverSpacing; gridX += riverSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + riverSpacing; gridZ += riverSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, riverSize / 2, context)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 3000);
                if (!localRandom.chance(0.35)) continue;
                
                const startX = localRandom.range(0, size);
                const startZ = localRandom.range(0, size);
                const endX = localRandom.range(0, size);
                const endZ = localRandom.range(0, size);
                this.createRiver(startX, startZ, endX, endZ, localRandom.range(3, 6), localRandom, chunkParent);
            }
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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация мостов
        const bridgeSpacing = 150;
        const bridgeSize = 20;
        
        const startGridX = Math.floor(chunkMinX / bridgeSpacing) * bridgeSpacing;
        const startGridZ = Math.floor(chunkMinZ / bridgeSpacing) * bridgeSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + bridgeSpacing; gridX += bridgeSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + bridgeSpacing; gridZ += bridgeSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, bridgeSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 8)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 4000);
                if (!localRandom.chance(0.2)) continue;
                
                const bx = gridX - worldX;
                const bz = gridZ - worldZ;
                const bridgeLength = localRandom.range(12, 20);
                const bridgeHeight = localRandom.range(4, 8);
                
                const pillar1 = this.createBox("bridgePillar", { width: 2, height: bridgeHeight, depth: 2 },
                    new Vector3(bx - bridgeLength / 2 + 1, bridgeHeight / 2, bz), "rock", chunkParent, true);
                const pillar2 = this.createBox("bridgePillar", { width: 2, height: bridgeHeight, depth: 2 },
                    new Vector3(bx + bridgeLength / 2 - 1, bridgeHeight / 2, bz), "rock", chunkParent, true);
                const deck = this.createBox("bridgeDeck", { width: bridgeLength, height: 0.5, depth: 4 },
                    new Vector3(bx, bridgeHeight, bz), "wood", chunkParent, true);
                const rail1 = this.createBox("bridgeRail", { width: bridgeLength, height: 1, depth: 0.2 },
                    new Vector3(bx, bridgeHeight + 0.75, bz - 1.9), "wood", chunkParent, false);
                const rail2 = this.createBox("bridgeRail", { width: bridgeLength, height: 1, depth: 0.2 },
                    new Vector3(bx, bridgeHeight + 0.75, bz + 1.9), "wood", chunkParent, false);
            }
        }
    }
}

export default CanyonGenerator;

