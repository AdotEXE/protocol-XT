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
    
    private generateBuildings(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Все типы зданий: жилые, коммерческие, промышленные, военные
        const buildingCount = random.int(6, 12);
        
        for (let i = 0; i < buildingCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) continue;
            
            // Распределение: 40% жилые, 30% коммерческие, 20% промышленные, 10% военные
            const buildingType = random.next();
            let w: number, h: number, d: number;
            let material: string;
            
            if (buildingType < 0.4) {
                // Жилые: 6x6x4
                w = random.range(5, 7);
                h = random.range(3, 5);
                d = random.range(5, 7);
                material = random.pick(["brick", "plaster"]);
            } else if (buildingType < 0.7) {
                // Коммерческие: 12x12x8
                w = random.range(10, 14);
                h = random.range(6, 10);
                d = random.range(10, 14);
                material = random.pick(["concrete", "brick"]);
            } else if (buildingType < 0.9) {
                // Промышленные: 15x15x10
                w = random.range(13, 17);
                h = random.range(8, 12);
                d = random.range(13, 17);
                material = random.pick(["metal", "concrete"]);
            } else {
                // Военные: 10x10x6
                w = random.range(8, 12);
                h = random.range(4, 8);
                d = random.range(8, 12);
                material = random.pick(["concrete", "brickDark"]);
            }
            
            // Создаём частично разрушенное здание (30-70% остаётся)
            this.createRuinedBuilding(x, z, w, h, d, random, chunkParent, random.range(0.3, 0.7));
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
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Обломки и подбитая техника
        // Обломки (5-12 на чанк)
        for (let i = 0; i < random.int(5, 12); i++) {
            const rx = random.range(5, size - 5);
            const rz = random.range(5, size - 5);
            const rWorldX = chunkX * size + rx;
            const rWorldZ = chunkZ * size + rz;
            
            if (this.isPositionInGarageArea(rWorldX, rWorldZ, 2)) continue;
            
            const rubble = MeshBuilder.CreateBox("rubble", {
                width: random.range(1, 4),
                height: random.range(0.5, 2),
                depth: random.range(1, 4)
            }, this.scene);
            rubble.position = new Vector3(rx, random.range(0.25, 1), rz);
            rubble.rotation.y = random.range(0, Math.PI * 2);
            rubble.material = this.getMat(random.pick(["concrete", "brick", "brickDark"]));
            rubble.parent = chunkParent;
            rubble.freezeWorldMatrix();
        }
        
        // Подбитая техника (2-5 на чанк)
        for (let i = 0; i < random.int(2, 5); i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunkX * size + vx;
            const vWorldZ = chunkZ * size + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 4)) continue;
            
            // Подбитый танк
            const hull = MeshBuilder.CreateBox("wreck_hull", {
                width: random.range(4, 6),
                height: random.range(1.5, 2.5),
                depth: random.range(6, 9)
            }, this.scene);
            hull.position = new Vector3(vx, random.range(0.75, 1.25), vz);
            hull.rotation.y = random.range(0, Math.PI * 2);
            hull.material = this.getMat("metalRust");
            hull.parent = chunkParent;
            hull.freezeWorldMatrix();
            new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
}

export default RuinsGenerator;

