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
import { SeededRandom } from "../shared/SeededRandom";

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
        this.ensureMaterials();
        this.generateCeiling(context);
        this.generatePillars(context);
        this.generateTracks(context);
        this.generateCrystals(context);
    }

    private ensureMaterials(): void {
        // Ensure standard materials exist to prevent crashes
        try { this.getMat("rock"); } catch { this.createMaterial("rock", new Color3(0.3, 0.25, 0.2)); }
        try { this.getMat("rockDark"); } catch { this.createMaterial("rockDark", new Color3(0.2, 0.15, 0.1)); }
        try { this.getMat("concrete"); } catch { this.createMaterial("concrete", new Color3(0.4, 0.4, 0.4)); }
        try { this.getMat("metal"); } catch { this.createMaterial("metal", new Color3(0.35, 0.35, 0.4)); }
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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        // Детерминированная генерация столбов
        const pillarSpacing = 25;
        const pillarSize = 2;

        const startGridX = Math.floor(chunkMinX / pillarSpacing) * pillarSpacing;
        const startGridZ = Math.floor(chunkMinZ / pillarSpacing) * pillarSpacing;

        for (let gridX = startGridX; gridX < chunkMaxX + pillarSpacing; gridX += pillarSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + pillarSpacing; gridZ += pillarSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, pillarSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 2)) continue;

                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(this.config.pillarDensity)) continue;

                const px = gridX - worldX;
                const pz = gridZ - worldZ;
                const height = localRandom.range(8, 15);

                this.createCylinder(
                    "pillar",
                    { diameter: localRandom.range(1, 2), height },
                    new Vector3(px, height / 2, pz),
                    localRandom.pick(["rock", "rockDark", "concrete"]),
                    chunkParent,
                    true
                );
            }
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
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        // Детерминированная генерация кристаллов
        const crystalSpacing = 20;
        const crystalSize = 0.8;

        const startGridX = Math.floor(chunkMinX / crystalSpacing) * crystalSpacing;
        const startGridZ = Math.floor(chunkMinZ / crystalSpacing) * crystalSpacing;

        for (let gridX = startGridX; gridX < chunkMaxX + crystalSpacing; gridX += crystalSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + crystalSpacing; gridZ += crystalSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, crystalSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 1)) continue;

                const localRandom = this.getDeterministicRandom(gridX, gridZ, 5000);
                if (!localRandom.chance(0.3)) continue; // 30% шанс создать кристалл

                const cx = gridX - worldX;
                const cz = gridZ - worldZ;
                const crystalH = localRandom.range(1, 3);
                const crystal = MeshBuilder.CreateBox("crystal", {
                    width: localRandom.range(0.3, 0.8),
                    height: crystalH,
                    depth: localRandom.range(0.3, 0.8)
                }, this.scene);
                crystal.position = new Vector3(cx, crystalH / 2, cz);
                crystal.rotation.y = localRandom.range(0, Math.PI);
                crystal.rotation.x = localRandom.range(-0.2, 0.2);

                const crystalMat = new StandardMaterial("crystalMat", this.scene);
                crystalMat.diffuseColor = localRandom.pick([
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
}

export default UndergroundGenerator;

