/**
 * @module maps/ruins/RuinsGenerator
 * @description Генератор контента для карты "Руины"
 * 
 * Руины - разрушенный город с обломками зданий.
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { SeededRandom } from "../shared/SeededRandom";

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
    
    constructor(config: Partial<RuinsConfig> = {}) {
        super();
        this.config = { ...DEFAULT_RUINS_CONFIG, ...config };
    }
    
    generateContent(context: ChunkGenerationContext): void {
        this.generateRubble(context);
        this.generateBuildings(context);
        this.generateDebris(context);
    }
    
    private generateRubble(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация на основе world координат
        const rubbleSpacing = 8; // Расстояние между обломками
        const rubbleSize = 4;
        
        const startGridX = Math.floor(chunkMinX / rubbleSpacing) * rubbleSpacing;
        const startGridZ = Math.floor(chunkMinZ / rubbleSpacing) * rubbleSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + rubbleSpacing; gridX += rubbleSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + rubbleSpacing; gridZ += rubbleSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, rubbleSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 2)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(this.config.rubbleDensity)) continue;
                
                const rx = gridX - worldX;
                const rz = gridZ - worldZ;
                const rubbleSizeVal = localRandom.range(1, 4);
                const rubbleHeight = localRandom.range(0.5, 2);
                
                this.createBox(
                    "rubble",
                    { width: rubbleSizeVal, height: rubbleHeight, depth: rubbleSizeVal },
                    new Vector3(rx, rubbleHeight / 2, rz),
                    localRandom.pick(["concrete", "brick", "brickDark"]),
                    chunkParent,
                    true
                );
            }
        }
    }
    
    private generateBuildings(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация на основе world координат
        const buildingSpacing = 40; // Расстояние между зданиями
        const buildingSize = 15;
        
        const startGridX = Math.floor(chunkMinX / buildingSpacing) * buildingSpacing;
        const startGridZ = Math.floor(chunkMinZ / buildingSpacing) * buildingSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + buildingSpacing; gridX += buildingSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + buildingSpacing; gridZ += buildingSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, buildingSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 10)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(this.config.buildingDensity)) continue;
                
                const x = gridX - worldX;
                const z = gridZ - worldZ;
                
                // Распределение: 40% жилые, 30% коммерческие, 20% промышленные, 10% военные
                const buildingType = localRandom.next();
                let w: number, h: number, d: number;
                let material: string;
                
                if (buildingType < 0.4) {
                    w = localRandom.range(5, 7);
                    h = localRandom.range(3, 5);
                    d = localRandom.range(5, 7);
                    material = localRandom.pick(["brick", "plaster"]);
                } else if (buildingType < 0.7) {
                    w = localRandom.range(10, 14);
                    h = localRandom.range(6, 10);
                    d = localRandom.range(10, 14);
                    material = localRandom.pick(["concrete", "brick"]);
                } else if (buildingType < 0.9) {
                    w = localRandom.range(13, 17);
                    h = localRandom.range(8, 12);
                    d = localRandom.range(13, 17);
                    material = localRandom.pick(["metal", "concrete"]);
                } else {
                    w = localRandom.range(8, 12);
                    h = localRandom.range(4, 8);
                    d = localRandom.range(8, 12);
                    material = localRandom.pick(["concrete", "brickDark"]);
                }
                
                this.createRuinedBuilding(x, z, w, h, d, localRandom, chunkParent, localRandom.range(0.3, 0.7));
            }
        }
    }
    
    /**
     * Создать разрушенное здание
     */
    private createRuinedBuilding(x: number, z: number, w: number, h: number, d: number, random: any, chunkParent: any, destructionLevel: number): void {
        const destruction = destructionLevel;
        
        // Передняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = this.createBox(
                "ruinWall_front",
                { width: wallW, height: wallH, depth: 0.3 },
                new Vector3(x, wallH / 2, z - d / 2),
                random.pick(["brick", "concrete", "brickDark"]),
                chunkParent,
                true
            );
        }
        
        // Задняя стена
        if (random.chance(destruction)) {
            const wallW = w * random.range(0.6, 1.0);
            const wallH = h * random.range(0.7, 1.0);
            const wall = this.createBox(
                "ruinWall_back",
                { width: wallW, height: wallH, depth: 0.3 },
                new Vector3(x, wallH / 2, z + d / 2),
                random.pick(["brick", "concrete", "brickDark"]),
                chunkParent,
                true
            );
        }
        
        // Левая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = this.createBox(
                "ruinWall_left",
                { width: 0.3, height: wallH, depth: wallD },
                new Vector3(x - w / 2, wallH / 2, z),
                random.pick(["brick", "concrete", "brickDark"]),
                chunkParent,
                true
            );
        }
        
        // Правая стена
        if (random.chance(destruction)) {
            const wallH = h * random.range(0.7, 1.0);
            const wallD = d * random.range(0.6, 1.0);
            const wall = this.createBox(
                "ruinWall_right",
                { width: 0.3, height: wallH, depth: wallD },
                new Vector3(x + w / 2, wallH / 2, z),
                random.pick(["brick", "concrete", "brickDark"]),
                chunkParent,
                true
            );
        }
        
        // Крыша (частично)
        if (random.chance(destruction * 0.8)) {
            const roofW = w * random.range(0.5, 0.9);
            const roofD = d * random.range(0.5, 0.9);
            const roof = this.createBox(
                "ruinRoof",
                { width: roofW, height: 0.2, depth: roofD },
                new Vector3(x, h, z),
                "roof",
                chunkParent,
                false
            );
        }
    }
    
    private generateDebris(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация обломков
        const debrisSpacing = 12;
        const debrisSize = 4;
        
        const startGridX = Math.floor(chunkMinX / debrisSpacing) * debrisSpacing;
        const startGridZ = Math.floor(chunkMinZ / debrisSpacing) * debrisSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + debrisSpacing; gridX += debrisSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + debrisSpacing; gridZ += debrisSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, debrisSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 2)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 1000);
                if (!localRandom.chance(0.3)) continue; // 30% шанс создать обломок
                
                const rx = gridX - worldX;
                const rz = gridZ - worldZ;
                
                const rubble = MeshBuilder.CreateBox("rubble", {
                    width: localRandom.range(1, 4),
                    height: localRandom.range(0.5, 2),
                    depth: localRandom.range(1, 4)
                }, this.scene);
                rubble.position = new Vector3(rx, localRandom.range(0.25, 1), rz);
                rubble.rotation.y = localRandom.range(0, Math.PI * 2);
                rubble.material = this.getMat(localRandom.pick(["concrete", "brick", "brickDark"]));
                rubble.parent = chunkParent;
                rubble.freezeWorldMatrix();
            }
        }
        
        // Детерминированная генерация подбитой техники
        const wreckSpacing = 60;
        const wreckSize = 9;
        
        const startWreckX = Math.floor(chunkMinX / wreckSpacing) * wreckSpacing;
        const startWreckZ = Math.floor(chunkMinZ / wreckSpacing) * wreckSpacing;
        
        for (let gridX = startWreckX; gridX < chunkMaxX + wreckSpacing; gridX += wreckSpacing) {
            for (let gridZ = startWreckZ; gridZ < chunkMaxZ + wreckSpacing; gridZ += wreckSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, wreckSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 4)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 2000);
                if (!localRandom.chance(0.2)) continue; // 20% шанс создать технику
                
                const vx = gridX - worldX;
                const vz = gridZ - worldZ;
                
                const hull = MeshBuilder.CreateBox("wreck_hull", {
                    width: localRandom.range(4, 6),
                    height: localRandom.range(1.5, 2.5),
                    depth: localRandom.range(6, 9)
                }, this.scene);
                hull.position = new Vector3(vx, localRandom.range(0.75, 1.25), vz);
                hull.rotation.y = localRandom.range(0, Math.PI * 2);
                hull.material = this.getMat("metalRust");
                hull.parent = chunkParent;
                hull.freezeWorldMatrix();
                new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
}

export default RuinsGenerator;

