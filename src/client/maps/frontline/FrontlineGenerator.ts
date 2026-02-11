/**
 * @module maps/frontline/FrontlineGenerator
 * @description Генератор контента для карты "Линия фронта"
 * 
 * Линия фронта - это карта с окопами, траншеями и укреплениями.
 * Поле боя разделено на три зоны:
 * - Союзная территория (allied) - укрепления обороняющихся
 * - Нейтральная полоса (nomansland) - воронки и разрушения
 * - Вражеская территория (enemy) - вражеские позиции
 * 
 * Размер арены: определяется в MapConstants.ts (по умолчанию 1000x1000)
 * 
 * @example
 * ```typescript
 * const generator = new FrontlineGenerator();
 * generator.initialize(generationContext);
 * generator.generateContent(chunkContext);
 * ```
 * 
 * @see {@link BaseMapGenerator} - базовый класс
 * @see {@link ChunkGenerationContext} - контекст генерации
 */

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { BaseMapGenerator } from "../shared/BaseMapGenerator";
import { ChunkGenerationContext } from "../shared/MapGenerator";
import { MAP_SIZES } from "../MapConstants";
import { SeededRandom } from "../shared/SeededRandom";

/**
 * Тип зоны линии фронта
 */
export type FrontlineZone = "allied" | "nomansland" | "enemy" | "outside";

/**
 * Конфигурация линии фронта
 */
export interface FrontlineConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Ширина нейтральной полосы */
    noMansLandWidth: number;
    /** Плотность траншей */
    trenchDensity: number;
    /** Плотность воронок */
    craterDensity: number;
    /** Плотность проволочных заграждений */
    wireDensity: number;
}

/**
 * Конфигурация по умолчанию
 * Использует централизованные константы из MapConstants.ts
 */
export const DEFAULT_FRONTLINE_CONFIG: FrontlineConfig = {
    arenaSize: MAP_SIZES.frontline?.size ?? 1000,  // Из централизованных констант
    noMansLandWidth: 100,
    trenchDensity: 0.6,
    craterDensity: 0.8,
    wireDensity: 0.5
};

/**
 * Высота стен периметра - из централизованных констант
 */
const FRONTLINE_WALL_HEIGHT = MAP_SIZES.frontline?.wallHeight ?? 8;

/**
 * Генератор карты "Линия фронта"
 * 
 * Поле боя с окопами, траншеями, бункерами и разрушенной техникой.
 * Атмосфера Первой мировой войны.
 */
export class FrontlineGenerator extends BaseMapGenerator {
    readonly mapType = "frontline";
    readonly displayName = "Линия фронта";
    readonly description = "Окопы, траншеи, бункеры и нейтральная полоса";
    
    /** Конфигурация генератора */
    private config: FrontlineConfig;
    
    constructor(config: Partial<FrontlineConfig> = {}) {
        super();
        this.config = { ...DEFAULT_FRONTLINE_CONFIG, ...config };
    }
    
    /**
     * Определить зону по X координате
     * @param x - Мировая X координата
     */
    getZone(x: number): FrontlineZone {
        const arenaHalf = this.config.arenaSize / 2;
        const nmWidth = this.config.noMansLandWidth / 2;
        
        if (Math.abs(x) > arenaHalf) return "outside";
        if (x > nmWidth) return "enemy";
        if (x < -nmWidth) return "allied";
        return "nomansland";
    }
    
    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, size } = context;
        
        // Генерация рельефа и периметра
        this.generateTerrain(context);
        this.generatePerimeter(context);
        
        // Определяем зону и генерируем соответствующий контент
        const chunkCenterX = worldX + size / 2;
        const zone = this.getZone(chunkCenterX);
        
        switch (zone) {
            case "allied":
                this.generateTrenches(context, "allied");
                this.generateBunkers(context, "allied");
                break;
            case "nomansland":
                this.generateCraters(context);
                this.generateTrenches(context, "neutral");
                this.generateRuins(context);
                this.generateWire(context);
                this.generateWrecks(context);
                this.generateAllBarriers(context);
                break;
            case "enemy":
                this.generateTrenches(context, "enemy");
                this.generateBunkers(context, "enemy");
                this.generateBarricades(context);
                break;
        }
    }
    
    /**
     * Генерация рельефа - детерминированная генерация
     */
    private generateTerrain(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Воронки - детерминированная генерация
        this.generateOnGrid(context, 30, 5, this.config.craterDensity * 0.3, (worldX, worldZ, localRandom, cx, cz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const craterRadius = localRandom.range(2, 5);
            this.createCylinder("frontline_crater", { diameter: craterRadius * 2, height: 0.3 },
                new Vector3(cx, 0.15, cz), "dirt", chunkParent, false);
        }, 27000);
    }
    
    /**
     * Генерация периметра
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = FRONTLINE_WALL_HEIGHT;
        const wallThickness = 3;
        
        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;
        
        // Северная стена (z = arenaHalf)
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createWallSegment("fwall_n", wallLength, wallHeight, wallThickness,
                    new Vector3(wallX, wallHeight / 2, arenaHalf - worldZ), "concrete", context.chunkParent);
            }
        }
        
        // Южная стена (z = -arenaHalf)
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createWallSegment("fwall_s", wallLength, wallHeight, wallThickness,
                    new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ), "concrete", context.chunkParent);
            }
        }
        
        // Восточная стена (x = arenaHalf)
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createWallSegment("fwall_e", wallThickness, wallHeight, wallLength,
                    new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ), "concrete", context.chunkParent);
            }
        }
        
        // Западная стена (x = -arenaHalf)
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createWallSegment("fwall_w", wallThickness, wallHeight, wallLength,
                    new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ), "concrete", context.chunkParent);
            }
        }
    }
    
    /**
     * Генерация траншей - детерминированная генерация
     */
    private generateTrenches(context: ChunkGenerationContext, side: "allied" | "enemy" | "neutral"): void {
        const { chunkParent } = context;
        const density = side === "neutral" ? 0.6 : 0.4;
        
        // Окопы - детерминированная генерация
        this.generateOnGrid(context, 50, 30, density, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const trenchLength = localRandom.range(15, 30);
            const trenchWidth = 3;
            const trenchDepth = 1.5;
            
            const leftWall = this.createBox("trench_l", { width: trenchLength, height: trenchDepth, depth: 0.8 },
                new Vector3(x, terrainHeight + trenchDepth / 2, z - trenchWidth / 2), "dirt", chunkParent, true);
            const rightWall = this.createBox("trench_r", { width: trenchLength, height: trenchDepth, depth: 0.8 },
                new Vector3(x, terrainHeight + trenchDepth / 2, z + trenchWidth / 2), "dirt", chunkParent, true);
            
            if (localRandom.chance(0.6)) {
                for (let bag = 0; bag < 3; bag++) {
                    this.createSandbag(
                        new Vector3(x - trenchLength / 2 + bag * 2 + localRandom.range(-0.5, 0.5),
                            terrainHeight + trenchDepth + 0.2, z - trenchWidth / 2),
                        chunkParent, "sand", false
                    );
                }
            }
        }, 28000 + (side === "neutral" ? 1000 : side === "allied" ? 2000 : 3000));
    }
    
    /**
     * Генерация бункеров
     */
    private generateBunkers(context: ChunkGenerationContext, side: "allied" | "enemy"): void {
        const { chunkParent } = context;
        
        // Бункеры - детерминированная генерация
        this.generateOnGrid(context, 150, 14, 0.15, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const bunkerW = localRandom.range(8, 14);
            const bunkerH = localRandom.range(3, 5);
            const bunkerD = localRandom.range(6, 10);
            
            const bunker = this.createBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD },
                new Vector3(x, terrainHeight + bunkerH / 2, z), "concrete", chunkParent, true);
            
            // Амбразура
            const slitW = bunkerW * 0.5;
            const slit = MeshBuilder.CreateBox("slit", {
                width: slitW,
                height: 0.6,
                depth: 0.5
            }, this.scene);
            // Амбразура направлена к центру карты
            const slitZ = side === "allied" ? z + bunkerD / 2 : z - bunkerD / 2;
            slit.position = new Vector3(x, terrainHeight + bunkerH - 0.6, slitZ);
            const slitMat = new StandardMaterial("slitMat", this.scene);
            slitMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            slit.material = slitMat;
            slit.parent = chunkParent;
            slit.freezeWorldMatrix();
        }, 31000 + (side === "allied" ? 1000 : 2000));
    }
    
    /**
     * Генерация воронок - детерминированная генерация
     */
    private generateCraters(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Воронки - детерминированная генерация
        this.generateOnGrid(context, 25, 8, this.config.craterDensity, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const craterRadius = localRandom.range(3, 8);
            const craterDepth = localRandom.range(0.5, 1.5);
            const rimHeight = craterDepth * 0.5;
            const rimW = craterRadius * 0.4;
            
            const rimN = this.createBox("crater_rim_n", { width: craterRadius * 2.2, height: rimHeight, depth: rimW },
                new Vector3(x, terrainHeight + rimHeight / 2, z - craterRadius - rimW / 2), "dirt", chunkParent, false);
            const rimS = this.createBox("crater_rim_s", { width: craterRadius * 2.2, height: rimHeight, depth: rimW },
                new Vector3(x, terrainHeight + rimHeight / 2, z + craterRadius + rimW / 2), "dirt", chunkParent, false);
            const rimE = this.createBox("crater_rim_e", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 },
                new Vector3(x + craterRadius + rimW / 2, terrainHeight + rimHeight / 2, z), "dirt", chunkParent, false);
            const rimWest = this.createBox("crater_rim_w", { width: rimW, height: rimHeight, depth: craterRadius * 2.2 },
                new Vector3(x - craterRadius - rimW / 2, terrainHeight + rimHeight / 2, z), "dirt", chunkParent, false);
        }, 35000);
    }
    
    /**
     * Генерация проволочных заграждений - детерминированная генерация
     */
    private generateWire(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Колючая проволока - детерминированная генерация
        this.generateOnGrid(context, 40, 20, this.config.wireDensity, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const wireLength = localRandom.range(8, 20);
            const wireHeight = 1.2;
            
            for (let post = 0; post < 3; post++) {
                const postX = x - wireLength / 2 + post * wireLength / 2;
                const postMesh = this.createBox("wire_post", { width: 0.15, height: wireHeight + 0.3, depth: 0.15 },
                    new Vector3(postX, terrainHeight + (wireHeight + 0.3) / 2, z), "metalRust", chunkParent, false);
            }
            
            for (let line = 0; line < 3; line++) {
                const lineY = terrainHeight + 0.3 + line * 0.4;
                const wireMesh = MeshBuilder.CreateBox("wire", { width: wireLength, height: 0.05, depth: 0.05 }, this.scene);
                wireMesh.position = new Vector3(x, lineY, z);
                const wireMat = new StandardMaterial("wireMat", this.scene);
                wireMat.diffuseColor = new Color3(0.3, 0.25, 0.2);
                wireMat.specularColor = new Color3(0.5, 0.5, 0.5);
                wireMesh.material = wireMat;
                wireMesh.parent = chunkParent;
                wireMesh.freezeWorldMatrix();
            }
            
            const wirePhysics = MeshBuilder.CreateBox("wire_phys", { width: wireLength, height: wireHeight, depth: 0.5 }, this.scene);
            wirePhysics.position = new Vector3(x, terrainHeight + wireHeight / 2, z);
            wirePhysics.isVisible = false;
            wirePhysics.parent = chunkParent;
            new PhysicsAggregate(wirePhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 36000);
    }
    
    /**
     * Генерация разбитой техники - детерминированная генерация
     */
    private generateWrecks(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Подбитая техника - детерминированная генерация
        this.generateOnGrid(context, 80, 9, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const hullW = localRandom.range(4, 6);
            const hullH = localRandom.range(1.5, 2.5);
            const hullD = localRandom.range(6, 9);
            
            const hull = MeshBuilder.CreateBox("wreck_hull", { width: hullW, height: hullH, depth: hullD }, this.scene);
            hull.position = new Vector3(x, terrainHeight + hullH / 2, z);
            hull.rotation.y = localRandom.range(0, Math.PI * 2);
            
            const wreckMat = new StandardMaterial("wreckMat", this.scene);
            wreckMat.diffuseColor = new Color3(0.15, 0.12, 0.1);
            wreckMat.specularColor = new Color3(0, 0, 0);
            hull.material = wreckMat;
            hull.parent = chunkParent;
            hull.freezeWorldMatrix();
            new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            if (localRandom.chance(0.6)) {
                const turretSize = hullW * 0.6;
                const turret = MeshBuilder.CreateBox("wreck_turret", {
                    width: turretSize, height: turretSize * 0.7, depth: turretSize
                }, this.scene);
                
                if (localRandom.chance(0.4)) {
                    turret.position = new Vector3(x + localRandom.range(-3, 3), terrainHeight + turretSize * 0.35, z + localRandom.range(-3, 3));
                    turret.rotation.x = localRandom.range(-0.5, 0.5);
                    turret.rotation.z = localRandom.range(-0.5, 0.5);
                } else {
                    turret.position = new Vector3(x, terrainHeight + hullH + turretSize * 0.35, z);
                }
                turret.rotation.y = localRandom.range(0, Math.PI * 2);
                turret.material = wreckMat;
                turret.parent = chunkParent;
                turret.freezeWorldMatrix();
            }
            
            if (localRandom.chance(0.3)) {
                const smoke = MeshBuilder.CreateCylinder("smoke", { diameter: 1.5, height: 4 }, this.scene);
                smoke.position = new Vector3(x, terrainHeight + hullH + 2, z);
                const smokeMat = new StandardMaterial("smokeMat", this.scene);
                smokeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                smokeMat.alpha = 0.4;
                smoke.material = smokeMat;
                smoke.parent = chunkParent;
                smoke.freezeWorldMatrix();
            }
        }, 32000);
    }
    
    /**
     * Генерация баррикад
     */
    private generateBarricades(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Баррикады - детерминированная генерация
        this.generateOnGrid(context, 35, 6, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const barricadeType = localRandom.int(0, 2);
            
            if (barricadeType === 0) {
                const blockW = localRandom.range(3, 6);
                const blockH = localRandom.range(1.5, 2.5);
                const block = this.createBox("barricade", { width: blockW, height: blockH, depth: 1.5 },
                    new Vector3(x, terrainHeight + blockH / 2, z), "concrete", chunkParent, true);
                block.rotation.y = localRandom.range(-0.3, 0.3);
            } else if (barricadeType === 1) {
                const beamLength = 3;
                const beamThickness = 0.25;
                
                for (let j = 0; j < 3; j++) {
                    const beam = MeshBuilder.CreateBox("hedgehog", {
                        width: beamThickness,
                        height: beamLength,
                        depth: beamThickness
                    }, this.scene);
                    beam.position = new Vector3(x, terrainHeight + beamLength / 2 * 0.7, z);
                    beam.rotation.x = Math.PI / 4;
                    beam.rotation.y = (j * Math.PI) / 3;
                    beam.material = this.getMat("metalRust");
                    beam.parent = chunkParent;
                    beam.freezeWorldMatrix();
                }
                
                // Физика (LOW POLY - box)
                const hedgehogPhysics = MeshBuilder.CreateBox("hh_phys", {
                    width: 2.5,
                    height: 2.5,
                    depth: 2.5
                }, this.scene);
                hedgehogPhysics.position = new Vector3(x, terrainHeight + 1.2, z);
                hedgehogPhysics.isVisible = false;
                hedgehogPhysics.parent = chunkParent;
                new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Мешки с песком
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < 4; col++) {
                        this.createSandbag(
                            new Vector3(x + col * 1.3 - 2, terrainHeight + row * 0.4 + 0.2, z),
                            chunkParent, "sand", false
                        );
                    }
                }
                
                // Физика для мешков
                const sbPhysics = MeshBuilder.CreateBox("sb_phys", {
                    width: 5,
                    height: 0.8,
                    depth: 1
                }, this.scene);
                sbPhysics.position = new Vector3(x, terrainHeight + 0.4, z);
                sbPhysics.isVisible = false;
                sbPhysics.parent = chunkParent;
                new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }, 33000);
    }
    
    /**
     * Генерация руин - детерминированная генерация
     */
    private generateRuins(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Разрушенные здания - детерминированная генерация
        this.generateOnGrid(context, 120, 15, 0.7, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const ruinW = localRandom.range(8, 15);
            const ruinH = localRandom.range(2, 5);
            const ruinD = localRandom.range(8, 12);
            
            const backWall = this.createBox("ruin_back", { width: ruinW, height: ruinH, depth: 0.5 },
                new Vector3(x, terrainHeight + ruinH / 2, z - ruinD / 2), "brick", chunkParent, true);
            
            if (localRandom.chance(0.7)) {
                const leftH = ruinH * localRandom.range(0.4, 0.8);
                const leftWall = this.createBox("ruin_left", { width: 0.5, height: leftH, depth: ruinD * 0.7 },
                    new Vector3(x - ruinW / 2, terrainHeight + leftH / 2, z), "brick", chunkParent, true);
            }
            
            if (localRandom.chance(0.5)) {
                const rightH = ruinH * localRandom.range(0.3, 0.6);
                const rightWall = this.createBox("ruin_right", { width: 0.5, height: rightH, depth: ruinD * 0.5 },
                    new Vector3(x + ruinW / 2, terrainHeight + rightH / 2, z + ruinD * 0.2), "brickDark", chunkParent, true);
            }
            
            const debrisCount = localRandom.int(2, 5);
            for (let i = 0; i < debrisCount; i++) {
                const debrisX = x + localRandom.range(-ruinW / 2, ruinW / 2);
                const debrisZ = z + localRandom.range(-ruinD / 2, ruinD / 2);
                const debrisW = localRandom.range(1, 3);
                const debrisH = localRandom.range(0.3, 1);
                const debrisD = localRandom.range(1, 3);
                
                const debris = this.createBox("debris",
                    { width: debrisW, height: debrisH, depth: debrisD },
                    new Vector3(debrisX, terrainHeight + debrisH / 2, debrisZ),
                    localRandom.pick(["brick", "concrete", "brickDark"]),
                    chunkParent,
                    true
                );
                debris.rotation.y = localRandom.range(0, Math.PI);
            }
        }, 40000);
    }
    
    /**
     * Генерация всех барьеров (для нейтральной полосы)
     */
    private generateAllBarriers(context: ChunkGenerationContext): void {
        this.generateSandbags(context);
        this.generateWire(context);
        this.generateBarricades(context);
        this.generateArtillery(context);
        this.generateDugouts(context);
        this.generateWaterCraters(context);
    }
    
    /**
     * Генерация мешков с песком - детерминированная генерация
     */
    private generateSandbags(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Мешки с песком - детерминированная генерация
        this.generateOnGrid(context, 40, 4, 0.4, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    this.createSandbag(
                        new Vector3(x + (col - (3 - row - 1) / 2) * 1.2, terrainHeight + row * 0.4, z + localRandom.range(-0.5, 0.5)),
                        chunkParent, "dirt", false
                    );
                }
            }
        }, 38000);
    }
    
    /**
     * Генерация артиллерийских позиций - детерминированная генерация
     */
    private generateArtillery(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Артиллерия - детерминированная генерация
        this.generateOnGrid(context, 120, 4, 0.25, (worldX, worldZ, localRandom, ax, az) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const base = this.createBox("artilleryBase", { width: 3, height: 0.5, depth: 4 },
                new Vector3(ax, terrainHeight + 0.25, az), "metalRust", chunkParent, true);
            base.rotation.y = localRandom.range(0, Math.PI * 2);
            
            const barrel = this.createBox("artilleryBarrel", { width: 0.4, height: 0.4, depth: 4 },
                new Vector3(ax, terrainHeight + 1.2, az + 2), "metal", chunkParent, false);
            barrel.rotation.x = -0.2;
            
            const shield = this.createBox("artilleryShield", { width: 2.5, height: 1.5, depth: 0.1 },
                new Vector3(ax, terrainHeight + 1, az), "metalRust", chunkParent, false);
            
            const crateCount = localRandom.int(2, 5);
            for (let c = 0; c < crateCount; c++) {
                const crate = MeshBuilder.CreateBox("ammoCrate", { width: 0.8, height: 0.5, depth: 0.6 }, this.scene);
                crate.position = new Vector3(ax + localRandom.range(-2, 2), terrainHeight + 0.25, az + localRandom.range(-2, 2));
                const crateMat = new StandardMaterial("crateMat", this.scene);
                crateMat.diffuseColor = new Color3(0.25, 0.2, 0.1);
                crate.material = crateMat;
                crate.parent = chunkParent;
                crate.freezeWorldMatrix();
            }
        }, 39000);
    }
    
    /**
     * Генерация блиндажей - детерминированная генерация
     */
    private generateDugouts(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Блиндажи - детерминированная генерация
        this.generateOnGrid(context, 100, 6, 0.2, (worldX, worldZ, localRandom, dx, dz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 6)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            // Блиндаж - полузаглублённое укрытие
            const dugoutW = localRandom.range(6, 10);
            const dugoutD = localRandom.range(8, 12);
            
            // Крыша (бревенчатый накат)
            const roof = MeshBuilder.CreateBox("dugoutRoof", {
                width: dugoutW,
                height: 0.8,
                depth: dugoutD
            }, this.scene);
            roof.position = new Vector3(dx, terrainHeight + 0.8, dz);
            const roofMat = new StandardMaterial("roofMat", this.scene);
            roofMat.diffuseColor = new Color3(0.35, 0.25, 0.15);
            roof.material = roofMat;
            roof.parent = chunkParent;
            roof.freezeWorldMatrix();
            new PhysicsAggregate(roof, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Земляная насыпь вокруг
            const embankment = this.createBox(
                "embankment",
                { width: dugoutW + 2, height: 1.2, depth: dugoutD + 2 },
                new Vector3(dx, terrainHeight + 0.2, dz),
                "dirt",
                chunkParent,
                false
            );
            
            // Вход
            const entrance = this.createBox(
                "entrance",
                { width: 2, height: 1.5, depth: 1 },
                new Vector3(dx, terrainHeight + 0.5, dz + dugoutD / 2 + 0.5),
                "dirt",
                chunkParent,
                false
            );
        }, 41000);
    }
    
    /**
     * Генерация затопленных воронок - детерминированная генерация
     */
    private generateWaterCraters(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Затопленные воронки - детерминированная генерация
        this.generateOnGrid(context, 60, 5, 0.3, (worldX, worldZ, localRandom, cx, cz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) return;
            
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const radius = localRandom.range(3, 6);
            
            const water = MeshBuilder.CreateCylinder("waterCrater", { diameter: radius * 2, height: 0.1 }, this.scene);
            water.position = new Vector3(cx, terrainHeight - 0.3, cz);
            water.material = this.getMat("water");
            water.parent = chunkParent;
            water.freezeWorldMatrix();
            
            for (let e = 0; e < 6; e++) {
                const angle = (e / 6) * Math.PI * 2;
                const mud = this.createBox("mud", { width: 1.5, height: 0.4, depth: 1.5 },
                    new Vector3(cx + Math.cos(angle) * (radius - 0.5), terrainHeight + 0.1, cz + Math.sin(angle) * (radius - 0.5)),
                    "dirt", chunkParent, false);
            }
        }, 37000);
    }
}

export default FrontlineGenerator;

