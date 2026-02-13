/**
 * @module maps/polygon/PolygonGenerator
 * @description Генератор контента для карты "Полигон"
 * 
 * Полигон - это военная тренировочная база с различными зонами:
 * - Стрельбище (shooting) - мишени и тиры
 * - Полоса препятствий (obstacles) - преграды и рампы
 * - Боевая зона (combat) - укрытия для тренировки
 * - Военная база (base) - ангары и здания
 * 
 * Размер арены: определяется в MapConstants.ts (по умолчанию 1000x1000)
 * 
 * @example
 * ```typescript
 * const generator = new PolygonGenerator();
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
 * Тип зоны полигона
 */
export type PolygonZone = "shooting" | "obstacles" | "combat" | "base" | "empty";

/**
 * Конфигурация полигона
 */
export interface PolygonConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Высота периметра */
    fenceHeight: number;
    /** Плотность препятствий (0-1) */
    obstacleDensity: number;
    /** Плотность мишеней (0-1) */
    targetDensity: number;
}

/**
 * Конфигурация по умолчанию
 * Использует централизованные константы из MapConstants.ts
 */
export const DEFAULT_POLYGON_CONFIG: PolygonConfig = {
    arenaSize: MAP_SIZES.polygon?.size ?? 1000,  // Из централизованных констант
    fenceHeight: 3,
    obstacleDensity: 0.7,
    targetDensity: 0.8
};

/**
 * Высота стен периметра - из централизованных констант
 */
const POLYGON_WALL_HEIGHT = MAP_SIZES.polygon?.wallHeight ?? 6;

/**
 * Генератор карты "Полигон"
 * 
 * Военный полигон с ангарами, техникой, складами, кранами и вышками.
 * Разделён на функциональные зоны для разных типов тренировок.
 */
export class PolygonGenerator extends BaseMapGenerator {
    readonly mapType = "polygon";
    readonly displayName = "Полигон";
    readonly description = "Военный полигон с ангарами, техникой, складами, кранами и вышками";
    
    /** Конфигурация генератора */
    private config: PolygonConfig;
    
    constructor(config: Partial<PolygonConfig> = {}) {
        super();
        this.config = { ...DEFAULT_POLYGON_CONFIG, ...config };
    }
    
    /**
     * Определить зону полигона по мировым координатам
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     */
    getZone(x: number, z: number): PolygonZone {
        const arenaHalf = this.config.arenaSize / 2;
        
        // За пределами арены
        if (Math.abs(x) > arenaHalf || Math.abs(z) > arenaHalf) {
            return "empty";
        }
        
        // Квадранты арены для 600x600:
        // Северо-восток (x > 50, z > 50) - стрельбище
        // Северо-запад (x < -50, z > 50) - полоса препятствий
        // Юго-восток (x > 50, z < -50) - зона боя
        // Юго-запад (x < -50, z < -50) - военная база
        
        if (x > 50 && z > 50) return "shooting";
        if (x < -50 && z > 50) return "obstacles";
        if (x > 50 && z < -50) return "combat";
        if (x < -50 && z < -50) return "base";
        
        return "empty";
    }
    
    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        
        // Генерация рельефа и периметра
        this.generateTerrain(context);
        this.generatePerimeter(context);
        
        // Определяем зону и генерируем соответствующий контент
        const chunkCenterX = worldX + size / 2;
        const chunkCenterZ = worldZ + size / 2;
        const zone = this.getZone(chunkCenterX, chunkCenterZ);
        
        switch (zone) {
            case "shooting":
                this.generateShootingRange(context);
                break;
            case "obstacles":
                this.generateObstacleCourse(context);
                break;
            case "combat":
                this.generateCombatZone(context);
                break;
            case "base":
                this.generateMilitaryBase(context);
                break;
        }
    }
    
    /**
     * Генерация рельефа (холмы, равнины) - детерминированная генерация
     */
    private generateTerrain(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация холмов
        const hillSpacing = 80;
        const hillSize = 15;
        
        const startGridX = Math.floor(chunkMinX / hillSpacing) * hillSpacing;
        const startGridZ = Math.floor(chunkMinZ / hillSpacing) * hillSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + hillSpacing; gridX += hillSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + hillSpacing; gridZ += hillSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, hillSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 5)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ);
                if (!localRandom.chance(0.35)) continue;
                
                const hx = gridX - worldX;
                const hz = gridZ - worldZ;
                const terrainHeight = this.getTerrainHeight(gridX, gridZ, "wasteland");
                const hillSizeVal = localRandom.range(8, 15);
                const hillHeight = localRandom.range(2, 5);
                
                this.createBox(
                    "polygon_hill",
                    { width: hillSizeVal, height: hillHeight, depth: hillSizeVal },
                    new Vector3(hx, terrainHeight + hillHeight / 2, hz),
                    "dirt",
                    chunkParent,
                    true
                );
            }
        }
    }
    
    /**
     * Генерация периметра арены
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, worldX, worldZ, size, random, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const fenceHeight = this.config.fenceHeight;
        const fenceThickness = 0.2;
        const wallHeight = POLYGON_WALL_HEIGHT;
        const wallThickness = 1;
        
        // Проверяем, находится ли чанк на границе арены
        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;
        
        // Северная стена (z = arenaHalf) - забор с столбами
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                // Столбы забора
                const postSpacing = 5;
                const postCount = Math.floor(wallLength / postSpacing);
                for (let i = 0; i < postCount; i++) {
                    const postX = wallX + (i - postCount / 2) * postSpacing;
                    const post = this.createBox(
                        "fencePost",
                        { width: 0.3, height: fenceHeight, depth: 0.3 },
                        new Vector3(postX, fenceHeight / 2, arenaHalf - worldZ),
                        "metal",
                        chunkParent,
                        false
                    );
                }
                
                // Полотно забора между столбами
                const fence = MeshBuilder.CreateBox("pfence_n", {
                    width: wallLength,
                    height: fenceHeight * 0.7,
                    depth: fenceThickness
                }, this.scene);
                fence.position = new Vector3(wallX, fenceHeight * 0.5, arenaHalf - worldZ);
                fence.material = this.getMat("metal");
                fence.parent = chunkParent;
                fence.freezeWorldMatrix();
                new PhysicsAggregate(fence, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
        
        // Южная стена (z = -arenaHalf) - бетонная стена
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "pwall_s",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
        
        // Восточная стена (x = arenaHalf)
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "pwall_e",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
        
        // Западная стена (x = -arenaHalf)
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2 - worldZ;
                this.createBox(
                    "pwall_w",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    chunkParent,
                    true
                );
            }
        }
    }
    
    /**
     * Генерация стрельбища - детерминированная генерация
     */
    private generateShootingRange(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        // Детерминированная генерация мишеней
        const targetSpacing = 40;
        const targetSize = 5;
        
        const startGridX = Math.floor(chunkMinX / targetSpacing) * targetSpacing;
        const startGridZ = Math.floor(chunkMinZ / targetSpacing) * targetSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + targetSpacing; gridX += targetSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + targetSpacing; gridZ += targetSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, targetSize / 2, context)) continue;
                if (this.isPositionInGarageArea(gridX, gridZ, 3)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 7000);
                if (!localRandom.chance(0.4)) continue; // 40% шанс создать мишень
                
                const x = gridX - worldX;
                const z = gridZ - worldZ;
                
                // Получаем высоту террейна в этой точке
                const terrainHeight = this.getTerrainHeight(gridX, gridZ, "wasteland");
                
                // Основа мишени - вертикальный столб
                const pole = this.createBox(
                    "target_pole",
                    { width: 0.3, height: 3, depth: 0.3 },
                    new Vector3(x, terrainHeight + 1.5, z),
                    "metal",
                    chunkParent,
                    false
                );
                
                // Силуэт танка (упрощённый - прямоугольник)
                const targetWidth = localRandom.range(3, 5);
                const targetHeight = localRandom.range(2, 3);
                const target = MeshBuilder.CreateBox("target", {
                    width: targetWidth,
                    height: targetHeight,
                    depth: 0.2
                }, this.scene);
                target.position = new Vector3(x, terrainHeight + targetHeight / 2 + 1, z + 0.3);
                
                // Красная мишень
                const targetMat = new StandardMaterial("targetMat", this.scene);
                targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
                targetMat.emissiveColor = new Color3(0.3, 0, 0);
                target.material = targetMat;
                target.parent = chunkParent;
                target.freezeWorldMatrix();
                
                // Квадратные рамки на мишени (LOW POLY)
                for (let ring = 1; ring <= 3; ring++) {
                    const ringSize = ring * 0.4;
                    const ringThickness = 0.1;
                    const ringColor = ring % 2 === 0 ? new Color3(1, 1, 1) : new Color3(0, 0, 0);
                    const ringMat = new StandardMaterial("ringMat", this.scene);
                    ringMat.diffuseColor = ringColor;
                    
                    // Верх
                    const top = this.createBox(
                        "ring_top",
                        { width: ringSize * 2, height: ringThickness, depth: ringThickness },
                        new Vector3(x, terrainHeight + 2 + targetHeight / 2, z + 0.35 - ringSize),
                        ringMat,
                        chunkParent,
                        false
                    );
                    
                    // Низ
                    const bottom = this.createBox(
                        "ring_bottom",
                        { width: ringSize * 2, height: ringThickness, depth: ringThickness },
                        new Vector3(x, terrainHeight + 2 + targetHeight / 2, z + 0.35 + ringSize),
                        ringMat,
                        chunkParent,
                        false
                    );
                    
                    // Лево
                    const left = this.createBox(
                        "ring_left",
                        { width: ringThickness, height: ringThickness, depth: ringSize * 2 },
                        new Vector3(x - ringSize, terrainHeight + 2 + targetHeight / 2, z + 0.35),
                        ringMat,
                        chunkParent,
                        false
                    );
                    
                    // Право
                    const right = this.createBox(
                        "ring_right",
                        { width: ringThickness, height: ringThickness, depth: ringSize * 2 },
                        new Vector3(x + ringSize, terrainHeight + 2 + targetHeight / 2, z + 0.35),
                        ringMat,
                        chunkParent,
                        false
                    );
                }
            }
        }
        
        // Добавляем рельсы для движущихся мишеней - детерминированная генерация
        this.generateOnGrid(context, 200, size / 2, 0.5, (worldX, worldZ, localRandom, x, z) => {
            const railZ = localRandom.range(size * 0.3, size * 0.7);
            const railTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const rail = this.createBox("rail", { width: size - 20, height: 0.1, depth: 0.5 },
                new Vector3(size / 2, railTerrainHeight + 0.05, railZ), "metalRust", chunkParent, false);
        }, 33000);
        
        // Генерируем движущиеся мишени - детерминированная генерация
        this.generateMovingTargets(context);
    }
    
    /**
     * Генерация движущихся мишеней - детерминированная генерация
     */
    private generateMovingTargets(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        const movingTargetSpacing = 150;
        const targetSize = 5;
        
        const startGridX = Math.floor(chunkMinX / movingTargetSpacing) * movingTargetSpacing;
        const startGridZ = Math.floor(chunkMinZ / movingTargetSpacing) * movingTargetSpacing;
        
        for (let gridX = startGridX; gridX < chunkMaxX + movingTargetSpacing; gridX += movingTargetSpacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + movingTargetSpacing; gridZ += movingTargetSpacing) {
                if (!this.isElementInChunk(gridX, gridZ, targetSize / 2, context)) continue;
                
                const localRandom = this.getDeterministicRandom(gridX, gridZ, 34000);
                if (!localRandom.chance(0.3)) continue; // 30% шанс создать движущуюся мишень
                
                const railZ = localRandom.range(size * 0.3, size * 0.7);
                const startX = localRandom.range(15, size - 15);
                const endX = localRandom.range(15, size - 15);
                
                const worldX = gridX;
                const worldZ = gridZ;
                if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
                
                const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
                const railLength = Math.abs(endX - startX);
                const rail = this.createBox("moving_rail", { width: railLength, height: 0.1, depth: 0.5 },
                    new Vector3((startX + endX) / 2, terrainHeight + 0.05, railZ), "metalRust", chunkParent, false);
                
                const targetWidth = localRandom.range(3, 5);
                const targetHeight = localRandom.range(2, 3);
                const target = MeshBuilder.CreateBox("moving_target", {
                    width: targetWidth, height: targetHeight, depth: 0.2
                }, this.scene);
                target.position = new Vector3(startX, terrainHeight + targetHeight / 2 + 1, railZ + 0.3);
                
                const targetMat = new StandardMaterial("movingTargetMat", this.scene);
                targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
                targetMat.emissiveColor = new Color3(0.3, 0, 0);
                target.material = targetMat;
                target.parent = chunkParent;
                
                let animDirection = 1;
                const animSpeed = 0.15;
                const animObserver = this.scene.onBeforeRenderObservable.add(() => {
                    if (target && !target.isDisposed() && target.parent === chunkParent) {
                        const currentX = target.position.x;
                        if (animDirection > 0 && currentX >= endX) {
                            animDirection = -1;
                        } else if (animDirection < 0 && currentX <= startX) {
                            animDirection = 1;
                        }
                        target.position.x += animDirection * animSpeed;
                    } else {
                        this.scene.onBeforeRenderObservable.remove(animObserver);
                    }
                });
            }
        }
    }
    
    /**
     * Генерация полосы препятствий
     */
    /**
     * Генерация полосы препятствий - детерминированная генерация
     */
    private generateObstacleCourse(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Рампы - детерминированная генерация
        this.generateOnGrid(context, 50, 10, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const rampWidth = localRandom.range(4, 8);
            const rampHeight = localRandom.range(1, 2.5);
            const rampDepth = localRandom.range(6, 10);
            
            const ramp = MeshBuilder.CreateBox("ramp", { width: rampWidth, height: rampHeight, depth: rampDepth }, this.scene);
            ramp.position = new Vector3(x, terrainHeight + rampHeight / 2, z);
            ramp.rotation.x = -Math.PI * 0.1;
            ramp.material = this.getMat("concrete");
            ramp.parent = chunkParent;
            ramp.freezeWorldMatrix();
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 8000);
        
        // Бетонные блоки - детерминированная генерация
        this.generateOnGrid(context, 20, 4, 0.4, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const blockTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const blockW = localRandom.range(2, 4);
            const blockH = localRandom.range(1, 2);
            const blockD = localRandom.range(2, 4);
            
            const block = this.createBox("block", { width: blockW, height: blockH, depth: blockD },
                new Vector3(x, blockTerrainHeight + blockH / 2, z), "concrete", chunkParent, true);
            block.rotation.y = localRandom.range(0, Math.PI);
        }, 9000);
        
        // Противотанковые ежи - детерминированная генерация
        this.generateOnGrid(context, 15, 3, 0.5, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const hedgehogTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const beamLength = 3;
            const beamThickness = 0.3;
            
            for (let j = 0; j < 3; j++) {
                const beam = MeshBuilder.CreateBox("hedgehog", { width: beamThickness, height: beamLength, depth: beamThickness }, this.scene);
                beam.position = new Vector3(x, hedgehogTerrainHeight + beamLength / 2 * 0.7, z);
                beam.rotation.x = Math.PI / 4;
                beam.rotation.y = (j * Math.PI) / 3;
                beam.material = this.getMat("metalRust");
                beam.parent = chunkParent;
                beam.freezeWorldMatrix();
            }
            
            const hedgehogPhysics = MeshBuilder.CreateBox("hedgehog_phys", { width: 2, height: 2, depth: 2 }, this.scene);
            hedgehogPhysics.position = new Vector3(x, hedgehogTerrainHeight + 1, z);
            hedgehogPhysics.isVisible = false;
            hedgehogPhysics.parent = chunkParent;
            new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 10000);
        
        // Бетонные надолбы - детерминированная генерация
        this.generateOnGrid(context, 12, 1.5, 0.6, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const toothTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const tooth = this.createBox("dragonTooth", { width: 1.5, height: 1.5, depth: 1.5 },
                new Vector3(x, toothTerrainHeight + 0.75, z), "concrete", chunkParent, true);
            tooth.rotation.y = Math.PI / 4;
        }, 11000);
        
        // Траншеи - детерминированная генерация
        this.generateOnGrid(context, 60, 30, 0.2, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            const trenchTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const trenchLength = localRandom.range(15, 30);
            const trenchWidth = localRandom.range(3, 5);
            const trench = this.createBox("trench", { width: trenchWidth, height: 1.5, depth: trenchLength },
                new Vector3(x, trenchTerrainHeight - 0.5, z), "dirt", chunkParent, false);
            trench.rotation.y = localRandom.range(0, Math.PI);
        }, 12000);
        
        // Колючая проволока - детерминированная генерация
        this.generateOnGrid(context, 25, 12, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const wireTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const wireLength = localRandom.range(5, 12);
            for (let p = 0; p <= wireLength / 2; p++) {
                const post = this.createBox("wirePost", { width: 0.1, height: 1.2, depth: 0.1 },
                    new Vector3(x + p * 2, wireTerrainHeight + 0.6, z), "metalRust", chunkParent, false);
            }
            const wire = this.createBox("wire", { width: wireLength, height: 0.05, depth: 0.05 },
                new Vector3(x + wireLength / 2, wireTerrainHeight + 1, z), "metalRust", chunkParent, false);
            const wire2 = this.createBox("wire2", { width: wireLength, height: 0.05, depth: 0.05 },
                new Vector3(x + wireLength / 2, wireTerrainHeight + 0.5, z), "metalRust", chunkParent, false);
        }, 13000);
        
        // Рампы для прыжков - детерминированная генерация
        this.generateOnGrid(context, 80, 8, 0.25, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 6)) return;
            const jumpRampTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const jumpRamp = MeshBuilder.CreateBox("jumpRamp", { width: 6, height: 2, depth: 8 }, this.scene);
            jumpRamp.position = new Vector3(x, jumpRampTerrainHeight + 0.5, z);
            jumpRamp.rotation.x = -0.3;
            jumpRamp.rotation.y = localRandom.range(0, Math.PI * 2);
            jumpRamp.material = this.getMat("concrete");
            jumpRamp.parent = chunkParent;
            jumpRamp.freezeWorldMatrix();
            new PhysicsAggregate(jumpRamp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 14000);
    }
    
    /**
     * Генерация боевой зоны - детерминированная генерация
     */
    private generateCombatZone(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Низкие укрытия - детерминированная генерация
        this.generateOnGrid(context, 30, 8, 0.5, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const terrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const coverWidth = localRandom.range(4, 8);
            const coverHeight = localRandom.range(1.5, 2.5);
            
            const cover = this.createBox(
                "cover",
                { width: coverWidth, height: coverHeight, depth: 1 },
                new Vector3(x, terrainHeight + coverHeight / 2, z),
                "concrete",
                chunkParent,
                true
            );
            cover.rotation.y = localRandom.range(0, Math.PI);
        }, 14000);
        
        // Песчаные мешки - детерминированная генерация
        this.generateOnGrid(context, 40, 4, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const sandbagTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    this.createSandbag(
                        new Vector3(
                            x + col * 1.3 - (3 - row) * 0.65 + 0.65,
                            sandbagTerrainHeight + row * 0.4 + 0.2,
                            z
                        ),
                        chunkParent, "sand", false
                    );
                }
            }
            
            const sandbagPhysics = MeshBuilder.CreateBox("sandbag_phys", {
                width: 4,
                height: 1.2,
                depth: 1
            }, this.scene);
            sandbagPhysics.position = new Vector3(x, sandbagTerrainHeight + 0.6, z);
            sandbagPhysics.isVisible = false;
            sandbagPhysics.parent = chunkParent;
            new PhysicsAggregate(sandbagPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 15000);
        
        // Стопки шин - детерминированная генерация
        this.generateOnGrid(context, 35, 1.5, 0.4, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const tireTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const stackHeight = localRandom.int(2, 4);
            for (let h = 0; h < stackHeight; h++) {
                const tire = MeshBuilder.CreateBox("tire", {
                    width: 1.5,
                    height: 0.4,
                    depth: 1.5
                }, this.scene);
                tire.position = new Vector3(
                    x + localRandom.range(-0.1, 0.1),
                    tireTerrainHeight + h * 0.4 + 0.2,
                    z + localRandom.range(-0.1, 0.1)
                );
                tire.material = this.getMat("black");
                tire.parent = chunkParent;
                tire.freezeWorldMatrix();
            }
            
            const tirePhysics = MeshBuilder.CreateBox("tire_phys", {
                width: 2,
                height: stackHeight * 0.4,
                depth: 2
            }, this.scene);
            tirePhysics.position = new Vector3(x, tireTerrainHeight + stackHeight * 0.2, z);
            tirePhysics.isVisible = false;
            tirePhysics.parent = chunkParent;
            new PhysicsAggregate(tirePhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 16000);
        
        // Бочки - детерминированная генерация
        this.generateOnGrid(context, 20, 0.8, 0.4, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const barrelTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const barrel = MeshBuilder.CreateBox("barrel", {
                width: 0.8,
                height: 1.2,
                depth: 0.8
            }, this.scene);
            barrel.position = new Vector3(x, barrelTerrainHeight + 0.6, z);
            const barrelMat = new StandardMaterial("barrelMat", this.scene);
            barrelMat.diffuseColor = localRandom.chance(0.5) ? new Color3(0.1, 0.4, 0.1) : new Color3(0.6, 0.1, 0.1);
            barrel.material = barrelMat;
            barrel.parent = chunkParent;
            barrel.freezeWorldMatrix();
            new PhysicsAggregate(barrel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 17000);
        
        // Ящики с боеприпасами - детерминированная генерация
        this.generateOnGrid(context, 25, 1.5, 0.3, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const crateTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const crate = MeshBuilder.CreateBox("ammoCrate", {
                width: 1.5,
                height: 0.8,
                depth: 1
            }, this.scene);
            crate.position = new Vector3(x, crateTerrainHeight + 0.4, z);
            crate.rotation.y = localRandom.range(0, Math.PI);
            const crateMat = new StandardMaterial("crateMat", this.scene);
            crateMat.diffuseColor = new Color3(0.3, 0.25, 0.1);
            crate.material = crateMat;
            crate.parent = chunkParent;
            crate.freezeWorldMatrix();
            new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 18000);
        
        // Тренировочные манекены - детерминированная генерация
        this.generateOnGrid(context, 50, 1, 0.2, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const dummyTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const dummy = MeshBuilder.CreateBox("dummy", {
                width: 0.6,
                height: 1.6,
                depth: 0.4
            }, this.scene);
            dummy.position = new Vector3(x, dummyTerrainHeight + 0.8, z);
            dummy.rotation.y = localRandom.range(0, Math.PI * 2);
            dummy.material = this.getMat("yellow");
            dummy.parent = chunkParent;
            dummy.freezeWorldMatrix();
        }, 19000);
        
        // Разрушенная техника - детерминированная генерация
        this.generateOnGrid(context, 100, 5, 0.6, (worldX, worldZ, localRandom, x, z) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            const wreckTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            
            const hull = MeshBuilder.CreateBox("wreckHull", { width: 3, height: 1.2, depth: 5 }, this.scene);
            hull.position = new Vector3(x, wreckTerrainHeight + 0.6, z);
            hull.rotation.y = localRandom.range(0, Math.PI * 2);
            const wreckMat = new StandardMaterial("wreckMat", this.scene);
            wreckMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
            hull.material = wreckMat;
            hull.parent = chunkParent;
            hull.freezeWorldMatrix();
            new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }, 20000);
    }
    
    /**
     * Генерация военной базы - детерминированная генерация
     */
    private generateMilitaryBase(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Hangars - детерминированная генерация
        this.generateOnGrid(context, 200, 35, 0.2, (worldX, worldZ, localRandom, hx, hz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 15)) return;
            const hangarTerrainHeight = this.getTerrainHeight(worldX, worldZ, "wasteland");
            const hangarW = localRandom.range(20, 30);
            const hangarH = localRandom.range(6, 10);
            const hangarD = localRandom.range(25, 35);
            
            const hangar = this.createBox(
                "hangar",
                { width: hangarW, height: hangarH, depth: hangarD },
                new Vector3(hx, hangarTerrainHeight + hangarH / 2, hz),
                "metal",
                chunkParent,
                true
            );
            
            const doorHeight = hangarH * 0.7;
            const leftFrame = this.createBox("doorFrame", { width: 1, height: doorHeight, depth: 1 },
                new Vector3(hx - hangarW / 2 + 1, hangarTerrainHeight + doorHeight / 2, hz - hangarD / 2),
                "metal", chunkParent, false);
            const rightFrame = this.createBox("doorFrame", { width: 1, height: doorHeight, depth: 1 },
                new Vector3(hx + hangarW / 2 - 1, hangarTerrainHeight + doorHeight / 2, hz - hangarD / 2),
                "metal", chunkParent, false);
            const topFrame = this.createBox("doorFrame", { width: hangarW - 2, height: 1, depth: 1 },
                new Vector3(hx, hangarTerrainHeight + doorHeight, hz - hangarD / 2),
                "metal", chunkParent, false);
            
            if (localRandom.chance(0.5)) {
                this.createMilitaryVehicle(hx, hz, localRandom, localRandom.pick(["tank", "truck", "apc"]), chunkParent, hangarTerrainHeight);
            }
        }, 20000);
        
        // Warehouses - детерминированная генерация
        this.generateOnGrid(context, 150, 30, 0.15, (worldX, worldZ, localRandom, wx, wz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 12)) return;
            const warehouse = MeshBuilder.CreateBox("warehouse", {
                width: localRandom.range(15, 25),
                height: localRandom.range(5, 8),
                depth: localRandom.range(20, 30)
            }, this.scene);
            warehouse.position = new Vector3(wx, localRandom.range(2.5, 4), wz);
            warehouse.material = this.getMat("metalRust");
            warehouse.parent = chunkParent;
            warehouse.freezeWorldMatrix();
            new PhysicsAggregate(warehouse, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Containers near warehouse
            for (let j = 0; j < localRandom.int(2, 5); j++) {
                const cx = wx + localRandom.range(-12, 12);
                const cz = wz + localRandom.range(-12, 12);
                const cWorldX = worldX + (cx - wx);
                const cWorldZ = worldZ + (cz - wz);
                if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) continue;
                const container = this.createBox("warehouseContainer", { width: 2.5, height: 2.5, depth: 6 },
                    new Vector3(cx, 1.26, cz), localRandom.pick(["red", "yellow", "blue", "metal"]),
                    chunkParent, true);
                container.rotation.y = localRandom.pick([0, Math.PI / 2]);
            }
        }, 21000);
        
        // Watchtowers - детерминированная генерация
        this.generateOnGrid(context, 120, 5, 0.25, (worldX, worldZ, localRandom, tx, tz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            this.createWatchtower(tx, tz, localRandom, chunkParent);
        }, 22000);
        
        // Cranes - детерминированная генерация
        this.generateOnGrid(context, 180, 20, 0.15, (worldX, worldZ, localRandom, cx, cz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            const tower = this.createBox("craneTower", { width: 2, height: 15, depth: 2 },
                new Vector3(cx, 7.5, cz), "yellow", chunkParent, false);
            const arm = this.createBox("craneArm", { width: 1, height: 1, depth: 20 },
                new Vector3(cx, 14, cz + 10), "yellow", chunkParent, false);
        }, 23000);
        
        // Military vehicles - детерминированная генерация
        this.generateOnGrid(context, 80, 4, 0.3, (worldX, worldZ, localRandom, vx, vz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) return;
            this.createMilitaryVehicle(vx, vz, localRandom, localRandom.pick(["tank", "truck", "apc"]), chunkParent);
        }, 24000);
        
        // Barracks - детерминированная генерация
        this.generateOnGrid(context, 160, 20, 0.2, (worldX, worldZ, localRandom, kx, kz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
            const barrackW = localRandom.range(12, 20);
            const barrackH = 4;
            const barrackD = 8;
            const barrack = this.createBox("barrack", { width: barrackW, height: barrackH, depth: barrackD },
                new Vector3(kx, barrackH / 2, kz), "metalRust", chunkParent, true);
        }, 25000);
        
        // Бункеры - детерминированная генерация
        this.generateOnGrid(context, 140, 12, 0.2, (worldX, worldZ, localRandom, bx, bz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;
            const bunkerW = localRandom.range(8, 12);
            const bunkerH = localRandom.range(3, 4);
            const bunkerD = localRandom.range(6, 10);
            const bunker = this.createBox("bunker", { width: bunkerW, height: bunkerH, depth: bunkerD },
                new Vector3(bx, bunkerH / 2, bz), "concrete", chunkParent, true);
            
            const slit = MeshBuilder.CreateBox("slit", { width: bunkerW * 0.6, height: 0.5, depth: 0.5 }, this.scene);
            slit.position = new Vector3(bx, bunkerH - 0.5, bz + bunkerD / 2);
            const slitMat = new StandardMaterial("slitMat", this.scene);
            slitMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
            slit.material = slitMat;
            slit.parent = chunkParent;
            slit.freezeWorldMatrix();
        }, 26000);
        
        // Смотровые башни - детерминированная генерация
        this.generateOnGrid(context, 130, 6, 0.15, (worldX, worldZ, localRandom, tx, tz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            const towerH = localRandom.range(8, 12);
            const base = this.createBox("tower_base", { width: 4, height: towerH, depth: 4 },
                new Vector3(tx, towerH / 2, tz), "metal", chunkParent, true);
            const platform = this.createBox("tower_platform", { width: 6, height: 0.5, depth: 6 },
                new Vector3(tx, towerH + 0.25, tz), "metal", chunkParent, false);
            
            // Ограждение
            const railH = 1.2;
            for (let side = 0; side < 4; side++) {
                const rail = this.createBox(
                    "rail",
                    { width: side % 2 === 0 ? 6 : 0.1, height: railH, depth: side % 2 === 0 ? 0.1 : 6 },
                    new Vector3(
                        tx + (side === 1 ? 3 : (side === 3 ? -3 : 0)),
                        towerH + 0.5 + railH / 2,
                        tz + (side === 0 ? 3 : (side === 2 ? -3 : 0))
                    ),
                    "metalRust",
                    chunkParent,
                    false
                );
            }
        }, 27000);
        
        // Флагштоки - детерминированная генерация
        this.generateOnGrid(context, 80, 2.5, 0.3, (worldX, worldZ, localRandom, fx, fz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) return;
            const pole = this.createBox("flagPole", { width: 0.15, height: 10, depth: 0.15 },
                new Vector3(fx, 5, fz), "metal", chunkParent, false);
            const flag = MeshBuilder.CreateBox("flag", { width: 2.5, height: 1.5, depth: 0.05 }, this.scene);
            flag.position = new Vector3(fx + 1.25, 9, fz);
            const flagMat = new StandardMaterial("flagMat", this.scene);
            flagMat.diffuseColor = localRandom.pick([new Color3(1, 0, 0), new Color3(0, 0.5, 0), new Color3(0, 0, 0.8)]);
            flag.material = flagMat;
            flag.parent = chunkParent;
            flag.freezeWorldMatrix();
        }, 28000);
        
        // Прожекторные вышки - детерминированная генерация
        this.generateOnGrid(context, 90, 1, 0.25, (worldX, worldZ, localRandom, sx, sz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const lightPole = this.createBox("lightPole", { width: 0.3, height: 8, depth: 0.3 },
                new Vector3(sx, 4, sz), "metal", chunkParent, false);
            const spotlight = MeshBuilder.CreateBox("spotlight", { width: 1, height: 0.5, depth: 0.8 }, this.scene);
            spotlight.position = new Vector3(sx, 8, sz);
            spotlight.rotation.x = 0.3;
            const spotMat = new StandardMaterial("spotMat", this.scene);
            spotMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
            spotlight.material = spotMat;
            spotlight.parent = chunkParent;
            spotlight.freezeWorldMatrix();
        }, 29000);
        
        // Радарные станции - детерминированная генерация
        this.generateOnGrid(context, 150, 5, 0.6, (worldX, worldZ, localRandom, rx, rz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) return;
            const radarBase = this.createBox("radarBase", { width: 5, height: 1, depth: 5 },
                new Vector3(rx, 0.5, rz), "concrete", chunkParent, true);
            const radarPole = this.createBox("radarPole", { width: 0.5, height: 6, depth: 0.5 },
                new Vector3(rx, 4, rz), "metal", chunkParent, false);
            const radarDish = this.createBox("radarDish", { width: 3, height: 2, depth: 0.3 },
                new Vector3(rx, 7, rz), "metal", chunkParent, false);
        }, 30000);
        
        // Топливный склад - детерминированная генерация
        this.generateOnGrid(context, 180, 16, 0.5, (worldX, worldZ, localRandom, fuelX, fuelZ) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) return;
            const tankCount = localRandom.int(2, 4);
            for (let t = 0; t < tankCount; t++) {
                const tank = MeshBuilder.CreateBox("fuelTank", { width: 3, height: 8, depth: 3 }, this.scene);
                tank.position = new Vector3(fuelX + t * 4 - tankCount * 2, 1.5, fuelZ);
                tank.rotation.z = Math.PI / 2;
                const tankMat = new StandardMaterial("tankMat", this.scene);
                tankMat.diffuseColor = new Color3(0.2, 0.3, 0.2);
                tank.material = tankMat;
                tank.parent = chunkParent;
                tank.freezeWorldMatrix();
                new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
            }
        }, 31000);
        
        // Заграждения из мешков - детерминированная генерация
        this.generateOnGrid(context, 70, 8, 0.3, (worldX, worldZ, localRandom, wx, wz) => {
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) return;
            const wallLength = localRandom.int(4, 8);
            const wallAngle = localRandom.range(0, Math.PI);
            for (let s = 0; s < wallLength; s++) {
                for (let h = 0; h < 2; h++) {
                    const bag = this.createSandbag(
                        new Vector3(wx + Math.cos(wallAngle) * s * 1.3, h * 0.4 + 0.2, wz + Math.sin(wallAngle) * s * 1.3),
                        chunkParent, "sand", false
                    );
                    bag.rotation.y = wallAngle;
                }
            }
        }, 32000);
    }
    
    /**
     * Создать сторожевую вышку
     */
    private createWatchtower(x: number, z: number, random: any, chunkParent: any): void {
        const towerHeight = random.range(8, 12);
        const baseSize = 2;
        
        // Base
        const base = this.createBox(
            "towerBase",
            { width: baseSize, height: 3, depth: baseSize },
            new Vector3(x, 1.5, z),
            "concrete",
            chunkParent,
            true
        );
        
        // Tower
        const tower = this.createBox(
            "tower",
            { width: 1.5, height: towerHeight - 3, depth: 1.5 },
            new Vector3(x, 3 + (towerHeight - 3) / 2, z),
            "metal",
            chunkParent,
            true
        );
        
        // Top platform
        const platform = this.createBox(
            "towerPlatform",
            { width: 2.5, height: 0.3, depth: 2.5 },
            new Vector3(x, towerHeight, z),
            "concrete",
            chunkParent,
            false
        );
    }
    
    /**
     * Создать военную технику
     */
    private createMilitaryVehicle(x: number, z: number, random: any, type: "tank" | "truck" | "apc" = "tank", chunkParent: any, terrainHeight: number = 0): void {
        if (type === "tank") {
            // Tank wreck
            const body = this.createBox(
                "tankWreck",
                { width: 4, height: 2, depth: 6 },
                new Vector3(x, terrainHeight + 1, z),
                "metalRust",
                chunkParent,
                true
            );
            body.rotation.y = random.range(0, Math.PI * 2);
            
            // Turret (fallen off)
            if (random.chance(0.5)) {
                const turret = this.createBox(
                    "tankTurret",
                    { width: 2.5, height: 1.5, depth: 2.5 },
                    new Vector3(x + random.range(-2, 2), terrainHeight + 0.75, z + random.range(-2, 2)),
                    "metalRust",
                    chunkParent,
                    false
                );
                turret.rotation.y = random.range(0, Math.PI * 2);
            }
        } else if (type === "truck") {
            const cab = this.createBox(
                "truckCab",
                { width: 2.5, height: 2, depth: 3 },
                new Vector3(x, terrainHeight + 1, z),
                "metalRust",
                chunkParent,
                false
            );
            cab.rotation.y = random.range(0, Math.PI * 2);
            
            const trailer = this.createBox(
                "truckTrailer",
                { width: 2.5, height: 2.5, depth: 6 },
                new Vector3(x, terrainHeight + 1.25, z - 4.5),
                "metalRust",
                chunkParent,
                false
            );
            trailer.rotation.y = random.range(0, Math.PI * 2);
        }
    }
}

export default PolygonGenerator;

