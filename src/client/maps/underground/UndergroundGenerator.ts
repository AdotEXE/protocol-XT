/**
 * @module maps/underground/UndergroundGenerator
 * @description Генератор контента для карты "Подземелье"
 * 
 * Шахты и туннели с опорными столбами и рельсами.
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
    
    constructor(config: Partial<UndergroundConfig> = {}) {
        super();
        this.config = { ...DEFAULT_UNDERGROUND_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        this.generateCeiling(context);
        this.generatePillars(context);
        this.generateTracks(context);
        this.generateCrystals(context);
    }
    
    private generateCeiling(context: ChunkGenerationContext): void {
        const { size, chunkParent } = context;
        
        // Потолок пещеры - большой плоский блок сверху
        const ceiling = MeshBuilder.CreateBox("cave_ceiling", {
            width: size,
            height: 1,
            depth: size
        }, this.scene);
        ceiling.position = new Vector3(size / 2, 8, size / 2);
        ceiling.material = this.getMat("rock");
        ceiling.parent = chunkParent;
        ceiling.freezeWorldMatrix();
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
    
    private generateTracks(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Mine carts/tracks (70% шанс)
        if (random.chance(0.7)) {
            const trackLen = random.range(20, 40);
            const trackX = random.range(5, size - 5);
            const trackZ = random.range(5, size - 5);
            const angle = random.pick([0, Math.PI / 2]);
            
            const track = this.createBox(
                "mineTrack",
                { width: trackLen, height: 0.3, depth: 0.5 },
                new Vector3(trackX, 0.15, trackZ),
                "metal",
                chunkParent,
                false
            );
            track.rotation.y = angle;
        }
    }
    
    private generateCrystals(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Кристаллы (5-10 штук)
        const count = random.int(5, 10);
        for (let i = 0; i < count; i++) {
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * size + cx;
            const cWorldZ = chunkZ * size + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 1)) continue;
            
            const crystalH = random.range(1, 3);
            const crystal = MeshBuilder.CreateBox("crystal", {
                width: random.range(0.3, 0.8),
                height: crystalH,
                depth: random.range(0.3, 0.8)
            }, this.scene);
            crystal.position = new Vector3(cx, crystalH / 2, cz);
            crystal.rotation.y = random.range(0, Math.PI);
            crystal.rotation.x = random.range(-0.2, 0.2);
            
            const crystalMat = new StandardMaterial("crystalMat", this.scene);
            crystalMat.diffuseColor = random.pick([
                new Color3(0.3, 0.8, 0.9),
                new Color3(0.9, 0.3, 0.8),
                new Color3(0.4, 0.9, 0.4),
                new Color3(0.9, 0.9, 0.4)
            ]);
            crystalMat.emissiveColor = crystalMat.diffuseColor.scale(0.5);
            crystalMat.alpha = 0.8;
            crystal.material = crystalMat;
            crystal.parent = chunkParent;
            crystal.freezeWorldMatrix();
        }
    }
}

export default UndergroundGenerator;

