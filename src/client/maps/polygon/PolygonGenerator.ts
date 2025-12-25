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
 * Размер арены: 600x600 единиц
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
 */
export const DEFAULT_POLYGON_CONFIG: PolygonConfig = {
    arenaSize: 600,
    fenceHeight: 3,
    obstacleDensity: 0.7,
    targetDensity: 0.8
};

/**
 * Высота стен периметра
 */
const POLYGON_WALL_HEIGHT = 6;

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
     * Генерация рельефа (холмы, равнины)
     */
    private generateTerrain(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        
        // Смешанная местность: 30-40% холмы
        const hillCount = random.int(2, 4);
        for (let i = 0; i < hillCount; i++) {
            if (!random.chance(0.35)) continue;
            
            const hx = random.range(10, size - 10);
            const hz = random.range(10, size - 10);
            const hWorldX = chunkX * size + hx;
            const hWorldZ = chunkZ * size + hz;
            
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 5)) continue;
            
            const hillSize = random.range(8, 15);
            const hillHeight = random.range(2, 5);
            
            this.createBox(
                "polygon_hill",
                { width: hillSize, height: hillHeight, depth: hillSize },
                new Vector3(hx, hillHeight / 2, hz),
                "dirt",
                chunkParent,
                true
            );
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
     * Генерация стрельбища
     */
    private generateShootingRange(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Стрельбище - мишени-силуэты танков
        const targetCount = random.int(3, 6);
        
        for (let i = 0; i < targetCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            
            // Проверяем, не в гараже ли
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Основа мишени - вертикальный столб
            const pole = this.createBox(
                "target_pole",
                { width: 0.3, height: 3, depth: 0.3 },
                new Vector3(x, 1.5, z),
                "metal",
                chunkParent,
                false
            );
            
            // Силуэт танка (упрощённый - прямоугольник)
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("target", {
                width: targetWidth,
                height: targetHeight,
                depth: 0.2
            }, this.scene);
            target.position = new Vector3(x, targetHeight / 2 + 1, z + 0.3);
            
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
                    new Vector3(x, 2 + targetHeight / 2, z + 0.35 - ringSize),
                    ringMat,
                    chunkParent,
                    false
                );
                
                // Низ
                const bottom = this.createBox(
                    "ring_bottom",
                    { width: ringSize * 2, height: ringThickness, depth: ringThickness },
                    new Vector3(x, 2 + targetHeight / 2, z + 0.35 + ringSize),
                    ringMat,
                    chunkParent,
                    false
                );
                
                // Лево
                const left = this.createBox(
                    "ring_left",
                    { width: ringThickness, height: ringThickness, depth: ringSize * 2 },
                    new Vector3(x - ringSize, 2 + targetHeight / 2, z + 0.35),
                    ringMat,
                    chunkParent,
                    false
                );
                
                // Право
                const right = this.createBox(
                    "ring_right",
                    { width: ringThickness, height: ringThickness, depth: ringSize * 2 },
                    new Vector3(x + ringSize, 2 + targetHeight / 2, z + 0.35),
                    ringMat,
                    chunkParent,
                    false
                );
            }
        }
        
        // Добавляем рельсы для движущихся мишеней
        if (random.chance(0.5)) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const rail = this.createBox(
                "rail",
                { width: size - 20, height: 0.1, depth: 0.5 },
                new Vector3(size / 2, 0.05, railZ),
                "metalRust",
                chunkParent,
                false
            );
        }
        
        // Генерируем движущиеся мишени
        this.generateMovingTargets(context);
    }
    
    /**
     * Генерация движущихся мишеней
     */
    private generateMovingTargets(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Создаём 2-3 движущиеся мишени на стрельбище
        const movingTargetCount = random.int(2, 3);
        
        for (let i = 0; i < movingTargetCount; i++) {
            const railZ = random.range(size * 0.3, size * 0.7);
            const startX = random.range(15, size - 15);
            const endX = random.range(15, size - 15);
            
            const worldX = chunkX * size + startX;
            const worldZ = chunkZ * size + railZ;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Рельсы для движущейся мишени
            const railLength = Math.abs(endX - startX);
            const rail = this.createBox(
                "moving_rail",
                { width: railLength, height: 0.1, depth: 0.5 },
                new Vector3((startX + endX) / 2, 0.05, railZ),
                "metalRust",
                chunkParent,
                false
            );
            
            // Мишень на рельсах
            const targetWidth = random.range(3, 5);
            const targetHeight = random.range(2, 3);
            const target = MeshBuilder.CreateBox("moving_target", {
                width: targetWidth,
                height: targetHeight,
                depth: 0.2
            }, this.scene);
            target.position = new Vector3(startX, targetHeight / 2 + 1, railZ + 0.3);
            
            const targetMat = new StandardMaterial("movingTargetMat", this.scene);
            targetMat.diffuseColor = new Color3(0.9, 0.1, 0.1);
            targetMat.emissiveColor = new Color3(0.3, 0, 0);
            target.material = targetMat;
            target.parent = chunkParent;
            
            // Анимация движения мишени вдоль рельсов - циклическое движение туда-обратно
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
                    // Если меш удалён, удаляем observer
                    this.scene.onBeforeRenderObservable.remove(animObserver);
                }
            });
        }
    }
    
    /**
     * Генерация полосы препятствий
     */
    private generateObstacleCourse(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Полоса препятствий - танкодром
        
        // Рампы
        const rampCount = random.int(2, 4);
        for (let i = 0; i < rampCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 4)) continue;
            
            const rampWidth = random.range(4, 8);
            const rampHeight = random.range(1, 2.5);
            const rampDepth = random.range(6, 10);
            
            const ramp = MeshBuilder.CreateBox("ramp", {
                width: rampWidth,
                height: rampHeight,
                depth: rampDepth
            }, this.scene);
            ramp.position = new Vector3(x, rampHeight / 2, z);
            ramp.rotation.x = -Math.PI * 0.1; // Небольшой наклон
            ramp.material = this.getMat("concrete");
            ramp.parent = chunkParent;
            ramp.freezeWorldMatrix();
            new PhysicsAggregate(ramp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Бетонные блоки (укрытия)
        const blockCount = random.int(4, 8);
        for (let i = 0; i < blockCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            const blockW = random.range(2, 4);
            const blockH = random.range(1, 2);
            const blockD = random.range(2, 4);
            
            const block = this.createBox(
                "block",
                { width: blockW, height: blockH, depth: blockD },
                new Vector3(x, blockH / 2, z),
                "concrete",
                chunkParent,
                true
            );
            block.rotation.y = random.range(0, Math.PI);
        }
        
        // Противотанковые ежи
        const hedgehogCount = random.int(5, 10);
        for (let i = 0; i < hedgehogCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            // Создаём "ёж" из 3 пересекающихся балок
            const beamLength = 3;
            const beamThickness = 0.3;
            
            for (let j = 0; j < 3; j++) {
                const beam = MeshBuilder.CreateBox("hedgehog", {
                    width: beamThickness,
                    height: beamLength,
                    depth: beamThickness
                }, this.scene);
                beam.position = new Vector3(x, beamLength / 2 * 0.7, z);
                beam.rotation.x = Math.PI / 4;
                beam.rotation.y = (j * Math.PI) / 3;
                beam.material = this.getMat("metalRust");
                beam.parent = chunkParent;
                beam.freezeWorldMatrix();
            }
            
            // Физика для ежа (LOW POLY - box)
            const hedgehogPhysics = MeshBuilder.CreateBox("hedgehog_phys", {
                width: 2,
                height: 2,
                depth: 2
            }, this.scene);
            hedgehogPhysics.position = new Vector3(x, 1, z);
            hedgehogPhysics.isVisible = false;
            hedgehogPhysics.parent = chunkParent;
            new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Бетонные надолбы (пирамидальные блоки)
        const dragonTeethCount = random.int(8, 15);
        for (let i = 0; i < dragonTeethCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            const tooth = this.createBox(
                "dragonTooth",
                { width: 1.5, height: 1.5, depth: 1.5 },
                new Vector3(x, 0.75, z),
                "concrete",
                chunkParent,
                true
            );
            tooth.rotation.y = Math.PI / 4;
        }
        
        // Траншеи (вырытые ямы)
        const trenchCount = random.int(1, 3);
        for (let i = 0; i < trenchCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) continue;
            
            const trenchLength = random.range(15, 30);
            const trenchWidth = random.range(3, 5);
            const trench = this.createBox(
                "trench",
                { width: trenchWidth, height: 1.5, depth: trenchLength },
                new Vector3(x, -0.5, z),
                "dirt",
                chunkParent,
                false
            );
            trench.rotation.y = random.range(0, Math.PI);
        }
        
        // Колючая проволока
        const wireCount = random.int(3, 7);
        for (let i = 0; i < wireCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Столбики
            const wireLength = random.range(5, 12);
            for (let p = 0; p <= wireLength / 2; p++) {
                const post = this.createBox(
                    "wirePost",
                    { width: 0.1, height: 1.2, depth: 0.1 },
                    new Vector3(x + p * 2, 0.6, z),
                    "metalRust",
                    chunkParent,
                    false
                );
            }
            
            // Линии проволоки
            const wire = this.createBox(
                "wire",
                { width: wireLength, height: 0.05, depth: 0.05 },
                new Vector3(x + wireLength / 2, 1, z),
                "metalRust",
                chunkParent,
                false
            );
            
            const wire2 = this.createBox(
                "wire2",
                { width: wireLength, height: 0.05, depth: 0.05 },
                new Vector3(x + wireLength / 2, 0.5, z),
                "metalRust",
                chunkParent,
                false
            );
        }
        
        // Рампы для прыжков (дополнительные)
        const jumpRampCount = random.int(1, 3);
        for (let i = 0; i < jumpRampCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 6)) continue;
            
            const jumpRamp = MeshBuilder.CreateBox("jumpRamp", {
                width: 6,
                height: 2,
                depth: 8
            }, this.scene);
            jumpRamp.position = new Vector3(x, 0.5, z);
            jumpRamp.rotation.x = -0.3; // Наклон
            jumpRamp.rotation.y = random.range(0, Math.PI * 2);
            jumpRamp.material = this.getMat("concrete");
            jumpRamp.parent = chunkParent;
            jumpRamp.freezeWorldMatrix();
            new PhysicsAggregate(jumpRamp, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
    
    /**
     * Генерация боевой зоны
     */
    private generateCombatZone(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Зона боя - открытое пространство с укрытиями для тренировки с ботами
        
        // Низкие укрытия
        const coverCount = random.int(5, 10);
        for (let i = 0; i < coverCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Низкая стена-укрытие
            const coverWidth = random.range(4, 8);
            const coverHeight = random.range(1.5, 2.5);
            
            const cover = this.createBox(
                "cover",
                { width: coverWidth, height: coverHeight, depth: 1 },
                new Vector3(x, coverHeight / 2, z),
                "concrete",
                chunkParent,
                true
            );
            cover.rotation.y = random.range(0, Math.PI);
        }
        
        // Песчаные мешки (декоративные кучи)
        const sandbagCount = random.int(2, 4);
        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            // Куча мешков
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    const bag = this.createBox(
                        "sandbag",
                        { width: 1.2, height: 0.4, depth: 0.6 },
                        new Vector3(
                            x + col * 1.3 - (3 - row) * 0.65 + 0.65,
                            row * 0.4 + 0.2,
                            z
                        ),
                        "sand",
                        chunkParent,
                        false
                    );
                }
            }
            
            // Физика для кучи (один бокс)
            const sandbagPhysics = MeshBuilder.CreateBox("sandbag_phys", {
                width: 4,
                height: 1.2,
                depth: 1
            }, this.scene);
            sandbagPhysics.position = new Vector3(x, 0.6, z);
            sandbagPhysics.isVisible = false;
            sandbagPhysics.parent = chunkParent;
            new PhysicsAggregate(sandbagPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Стопки шин (укрытие)
        const tireStackCount = random.int(2, 5);
        for (let i = 0; i < tireStackCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            const stackHeight = random.int(2, 4);
            for (let h = 0; h < stackHeight; h++) {
                const tire = MeshBuilder.CreateBox("tire", {
                    width: 1.5,
                    height: 0.4,
                    depth: 1.5
                }, this.scene);
                tire.position = new Vector3(
                    x + random.range(-0.1, 0.1),
                    h * 0.4 + 0.2,
                    z + random.range(-0.1, 0.1)
                );
                const tireMat = new StandardMaterial("tireMat", this.scene);
                tireMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                tire.material = tireMat;
                tire.parent = chunkParent;
                tire.freezeWorldMatrix();
            }
            
            // Физика для стопки
            const tirePhys = MeshBuilder.CreateBox("tirePhys", {
                width: 1.5,
                height: stackHeight * 0.4,
                depth: 1.5
            }, this.scene);
            tirePhys.position = new Vector3(x, stackHeight * 0.2, z);
            tirePhys.isVisible = false;
            tirePhys.parent = chunkParent;
            new PhysicsAggregate(tirePhys, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Бочки с топливом
        const barrelCount = random.int(3, 8);
        for (let i = 0; i < barrelCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            const barrel = MeshBuilder.CreateBox("barrel", {
                width: 0.8,
                height: 1.2,
                depth: 0.8
            }, this.scene);
            barrel.position = new Vector3(x, 0.6, z);
            const barrelMat = new StandardMaterial("barrelMat", this.scene);
            barrelMat.diffuseColor = random.chance(0.5) ? new Color3(0.1, 0.4, 0.1) : new Color3(0.6, 0.1, 0.1);
            barrel.material = barrelMat;
            barrel.parent = chunkParent;
            barrel.freezeWorldMatrix();
            new PhysicsAggregate(barrel, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Ящики с боеприпасами
        const crateCount = random.int(2, 6);
        for (let i = 0; i < crateCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            const crate = MeshBuilder.CreateBox("ammoCrate", {
                width: 1.5,
                height: 0.8,
                depth: 1
            }, this.scene);
            crate.position = new Vector3(x, 0.4, z);
            crate.rotation.y = random.range(0, Math.PI);
            const crateMat = new StandardMaterial("crateMat", this.scene);
            crateMat.diffuseColor = new Color3(0.3, 0.25, 0.1);
            crate.material = crateMat;
            crate.parent = chunkParent;
            crate.freezeWorldMatrix();
            new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
        
        // Тренировочные манекены (силуэты солдат)
        const dummyCount = random.int(2, 4);
        for (let i = 0; i < dummyCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 2)) continue;
            
            // Столб
            const pole = this.createBox(
                "dummyPole",
                { width: 0.15, height: 2, depth: 0.15 },
                new Vector3(x, 1, z),
                "metal",
                chunkParent,
                false
            );
            
            // Силуэт
            const dummy = MeshBuilder.CreateBox("dummy", {
                width: 0.8,
                height: 1.6,
                depth: 0.1
            }, this.scene);
            dummy.position = new Vector3(x, 1.3, z + 0.1);
            const dummyMat = new StandardMaterial("dummyMat", this.scene);
            dummyMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
            dummy.material = dummyMat;
            dummy.parent = chunkParent;
            dummy.freezeWorldMatrix();
        }
        
        // Разрушенная техника (укрытие)
        if (random.chance(0.6)) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (!this.isPositionInGarageArea(worldX, worldZ, 5)) {
                // Корпус разрушенного танка
                const hull = MeshBuilder.CreateBox("wreckHull", {
                    width: 3,
                    height: 1.2,
                    depth: 5
                }, this.scene);
                hull.position = new Vector3(x, 0.6, z);
                hull.rotation.y = random.range(0, Math.PI * 2);
                const wreckMat = new StandardMaterial("wreckMat", this.scene);
                wreckMat.diffuseColor = new Color3(0.2, 0.15, 0.1);
                hull.material = wreckMat;
                hull.parent = chunkParent;
                hull.freezeWorldMatrix();
                new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    /**
     * Генерация военной базы
     */
    private generateMilitaryBase(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Военная база - бункеры, башни, казармы, ангары, склады, техника
        
        // Hangars (large enclosed buildings for vehicles)
        const hangarCount = random.int(1, 3);
        for (let i = 0; i < hangarCount; i++) {
            const hx = random.range(15, size - 15);
            const hz = random.range(15, size - 15);
            const hWorldX = chunkX * size + hx;
            const hWorldZ = chunkZ * size + hz;
            
            if (this.isPositionInGarageArea(hWorldX, hWorldZ, 15)) continue;
            
            const hangarW = random.range(20, 30);
            const hangarH = random.range(6, 10);
            const hangarD = random.range(25, 35);
            
            // Main hangar building
            const hangar = this.createBox(
                "hangar",
                { width: hangarW, height: hangarH, depth: hangarD },
                new Vector3(hx, hangarH / 2, hz),
                "metal",
                chunkParent,
                true
            );
            
            // Large door opening (front missing wall) - Door frame
            const doorHeight = hangarH * 0.7;
            const leftFrame = this.createBox(
                "doorFrame",
                { width: 1, height: doorHeight, depth: 1 },
                new Vector3(hx - hangarW / 2 + 1, doorHeight / 2, hz - hangarD / 2),
                "metal",
                chunkParent,
                false
            );
            
            const rightFrame = this.createBox(
                "doorFrame",
                { width: 1, height: doorHeight, depth: 1 },
                new Vector3(hx + hangarW / 2 - 1, doorHeight / 2, hz - hangarD / 2),
                "metal",
                chunkParent,
                false
            );
            
            const topFrame = this.createBox(
                "doorFrame",
                { width: hangarW - 2, height: 1, depth: 1 },
                new Vector3(hx, doorHeight, hz - hangarD / 2),
                "metal",
                chunkParent,
                false
            );
            
            // Vehicles inside hangar (occasionally)
            if (random.chance(0.5)) {
                this.createMilitaryVehicle(hx, hz, random, random.pick(["tank", "truck", "apc"]), chunkParent);
            }
        }
        
        // Warehouses (storage buildings) - 1-2 склада
        const warehouseCount = random.int(1, 2);
        for (let i = 0; i < warehouseCount; i++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunkX * size + wx;
            const wWorldZ = chunkZ * size + wz;
            
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 12)) continue;
            
            const warehouse = MeshBuilder.CreateBox("warehouse", {
                width: random.range(15, 25),
                height: random.range(5, 8),
                depth: random.range(20, 30)
            }, this.scene);
            warehouse.position = new Vector3(wx, random.range(2.5, 4), wz);
            warehouse.material = this.getMat("metalRust");
            warehouse.parent = chunkParent;
            warehouse.freezeWorldMatrix();
            new PhysicsAggregate(warehouse, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Containers near warehouse
            for (let j = 0; j < random.int(2, 5); j++) {
                const cx = wx + random.range(-12, 12);
                const cz = wz + random.range(-12, 12);
                const cWorldX = chunkX * size + cx;
                const cWorldZ = chunkZ * size + cz;
                
                if (this.isPositionInGarageArea(cWorldX, cWorldZ, 2)) continue;
                
                const container = this.createBox(
                    "warehouseContainer",
                    { width: 2.5, height: 2.5, depth: 6 },
                    new Vector3(cx, 1.26, cz),
                    random.pick(["red", "yellow", "blue", "metal"]),
                    chunkParent,
                    true
                );
                container.rotation.y = random.pick([0, Math.PI / 2]);
            }
        }
        
        // Watchtowers - 2-3 вышки
        const towerCount = random.int(2, 3);
        for (let i = 0; i < towerCount; i++) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            const tWorldX = chunkX * size + tx;
            const tWorldZ = chunkZ * size + tz;
            
            if (this.isPositionInGarageArea(tWorldX, tWorldZ, 5)) continue;
            
            this.createWatchtower(tx, tz, random, chunkParent);
        }
        
        // Cranes (for loading/unloading) - 1-2 крана
        const craneCount = random.int(1, 2);
        for (let i = 0; i < craneCount; i++) {
            const cx = random.range(15, size - 15);
            const cz = random.range(15, size - 15);
            const cWorldX = chunkX * size + cx;
            const cWorldZ = chunkZ * size + cz;
            
            if (!this.isPositionInGarageArea(cWorldX, cWorldZ, 10)) {
                const tower = this.createBox(
                    "craneTower",
                    { width: 2, height: 15, depth: 2 },
                    new Vector3(cx, 7.5, cz),
                    "yellow",
                    chunkParent,
                    false
                );
                
                const arm = this.createBox(
                    "craneArm",
                    { width: 1, height: 1, depth: 20 },
                    new Vector3(cx, 14, cz + 10),
                    "yellow",
                    chunkParent,
                    false
                );
            }
        }
        
        // Military vehicles (parked/driving range)
        const vehicleCount = random.int(2, 5);
        for (let i = 0; i < vehicleCount; i++) {
            const vx = random.range(10, size - 10);
            const vz = random.range(10, size - 10);
            const vWorldX = chunkX * size + vx;
            const vWorldZ = chunkZ * size + vz;
            
            if (this.isPositionInGarageArea(vWorldX, vWorldZ, 4)) continue;
            
            this.createMilitaryVehicle(vx, vz, random, random.pick(["tank", "truck", "apc"]), chunkParent);
        }
        
        // Barracks/Administrative buildings
        if (random.chance(0.7)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);
            
            const worldX = chunkX * size + kx;
            const worldZ = chunkZ * size + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 20);
                const barrackH = 4;
                const barrackD = 8;
                
                const barrack = this.createBox(
                    "barrack",
                    { width: barrackW, height: barrackH, depth: barrackD },
                    new Vector3(kx, barrackH / 2, kz),
                    "metalRust",
                    chunkParent,
                    true
                );
            }
        }
        
        // Бункер
        if (random.chance(0.6)) {
            const bx = random.range(15, size - 15);
            const bz = random.range(15, size - 15);
            
            const worldX = chunkX * size + bx;
            const worldZ = chunkZ * size + bz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 8)) {
                const bunkerW = random.range(8, 12);
                const bunkerH = random.range(3, 4);
                const bunkerD = random.range(6, 10);
                
                const bunker = this.createBox(
                    "bunker",
                    { width: bunkerW, height: bunkerH, depth: bunkerD },
                    new Vector3(bx, bunkerH / 2, bz),
                    "concrete",
                    chunkParent,
                    true
                );
                
                // Амбразура на бункере
                const slit = MeshBuilder.CreateBox("slit", {
                    width: bunkerW * 0.6,
                    height: 0.5,
                    depth: 0.5
                }, this.scene);
                slit.position = new Vector3(bx, bunkerH - 0.5, bz + bunkerD / 2);
                const slitMat = new StandardMaterial("slitMat", this.scene);
                slitMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                slit.material = slitMat;
                slit.parent = chunkParent;
                slit.freezeWorldMatrix();
            }
        }
        
        // Смотровая башня
        if (random.chance(0.4)) {
            const tx = random.range(10, size - 10);
            const tz = random.range(10, size - 10);
            
            const worldX = chunkX * size + tx;
            const worldZ = chunkZ * size + tz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 5)) {
                const towerH = random.range(8, 12);
                
                // Основание башни
                const base = this.createBox(
                    "tower_base",
                    { width: 4, height: towerH, depth: 4 },
                    new Vector3(tx, towerH / 2, tz),
                    "metal",
                    chunkParent,
                    true
                );
                
                // Платформа наверху
                const platform = this.createBox(
                    "tower_platform",
                    { width: 6, height: 0.5, depth: 6 },
                    new Vector3(tx, towerH + 0.25, tz),
                    "metal",
                    chunkParent,
                    false
                );
                
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
            }
        }
        
        // Казарма (длинное здание)
        if (random.chance(0.3)) {
            const kx = random.range(15, size - 15);
            const kz = random.range(15, size - 15);
            
            const worldX = chunkX * size + kx;
            const worldZ = chunkZ * size + kz;
            if (!this.isPositionInGarageArea(worldX, worldZ, 10)) {
                const barrackW = random.range(12, 18);
                const barrackH = 4;
                const barrackD = 8;
                
                const barrack = this.createBox(
                    "barrack",
                    { width: barrackW, height: barrackH, depth: barrackD },
                    new Vector3(kx, barrackH / 2, kz),
                    "metalRust",
                    chunkParent,
                    true
                );
                
                // Крыша
                const roof = this.createBox(
                    "roof",
                    { width: barrackW + 1, height: 0.3, depth: barrackD + 1 },
                    new Vector3(kx, barrackH + 0.15, kz),
                    "metal",
                    chunkParent,
                    false
                );
            }
        }
        
        // Флагштоки с флагами (2-4 штуки)
        const flagCount = random.int(2, 4);
        for (let i = 0; i < flagCount; i++) {
            const fx = random.range(10, size - 10);
            const fz = random.range(10, size - 10);
            const fWorldX = chunkX * size + fx;
            const fWorldZ = chunkZ * size + fz;
            if (this.isPositionInGarageArea(fWorldX, fWorldZ, 2)) continue;
            
            // Мачта
            const pole = this.createBox(
                "flagPole",
                { width: 0.15, height: 10, depth: 0.15 },
                new Vector3(fx, 5, fz),
                "metal",
                chunkParent,
                false
            );
            
            // Флаг
            const flag = MeshBuilder.CreateBox("flag", {
                width: 2.5,
                height: 1.5,
                depth: 0.05
            }, this.scene);
            flag.position = new Vector3(fx + 1.25, 9, fz);
            const flagMat = new StandardMaterial("flagMat", this.scene);
            flagMat.diffuseColor = random.pick([new Color3(1, 0, 0), new Color3(0, 0.5, 0), new Color3(0, 0, 0.8)]);
            flag.material = flagMat;
            flag.parent = chunkParent;
            flag.freezeWorldMatrix();
        }
        
        // Прожекторные вышки (2-3 штуки)
        const spotlightCount = random.int(2, 3);
        for (let i = 0; i < spotlightCount; i++) {
            const sx = random.range(10, size - 10);
            const sz = random.range(10, size - 10);
            const sWorldX = chunkX * size + sx;
            const sWorldZ = chunkZ * size + sz;
            if (this.isPositionInGarageArea(sWorldX, sWorldZ, 3)) continue;
            
            // Столб
            const lightPole = this.createBox(
                "lightPole",
                { width: 0.3, height: 8, depth: 0.3 },
                new Vector3(sx, 4, sz),
                "metal",
                chunkParent,
                false
            );
            
            // Прожектор
            const spotlight = MeshBuilder.CreateBox("spotlight", {
                width: 1,
                height: 0.5,
                depth: 0.8
            }, this.scene);
            spotlight.position = new Vector3(sx, 8, sz);
            spotlight.rotation.x = 0.3;
            const spotMat = new StandardMaterial("spotMat", this.scene);
            spotMat.diffuseColor = new Color3(0.3, 0.3, 0.3);
            spotlight.material = spotMat;
            spotlight.parent = chunkParent;
            spotlight.freezeWorldMatrix();
        }
        
        // Радарные станции (1-2 штуки)
        if (random.chance(0.6)) {
            const rx = random.range(15, size - 15);
            const rz = random.range(15, size - 15);
            const rWorldX = chunkX * size + rx;
            const rWorldZ = chunkZ * size + rz;
            if (!this.isPositionInGarageArea(rWorldX, rWorldZ, 5)) {
                // Платформа
                const radarBase = this.createBox(
                    "radarBase",
                    { width: 5, height: 1, depth: 5 },
                    new Vector3(rx, 0.5, rz),
                    "concrete",
                    chunkParent,
                    true
                );
                
                // Мачта
                const radarPole = this.createBox(
                    "radarPole",
                    { width: 0.5, height: 6, depth: 0.5 },
                    new Vector3(rx, 4, rz),
                    "metal",
                    chunkParent,
                    false
                );
                
                // Антенна
                const radarDish = this.createBox(
                    "radarDish",
                    { width: 3, height: 2, depth: 0.3 },
                    new Vector3(rx, 7, rz),
                    "metal",
                    chunkParent,
                    false
                );
            }
        }
        
        // Топливный склад (цистерны)
        if (random.chance(0.5)) {
            const fuelX = random.range(15, size - 15);
            const fuelZ = random.range(15, size - 15);
            const fuelWorldX = chunkX * size + fuelX;
            const fuelWorldZ = chunkZ * size + fuelZ;
            if (!this.isPositionInGarageArea(fuelWorldX, fuelWorldZ, 8)) {
                // Несколько горизонтальных цистерн
                const tankCount = random.int(2, 4);
                for (let t = 0; t < tankCount; t++) {
                    const tank = MeshBuilder.CreateCylinder("fuelTank", {
                        diameter: 3,
                        height: 8
                    }, this.scene);
                    tank.position = new Vector3(fuelX + t * 4 - tankCount * 2, 1.5, fuelZ);
                    tank.rotation.z = Math.PI / 2;
                    const tankMat = new StandardMaterial("tankMat", this.scene);
                    tankMat.diffuseColor = new Color3(0.2, 0.3, 0.2);
                    tank.material = tankMat;
                    tank.parent = chunkParent;
                    tank.freezeWorldMatrix();
                    new PhysicsAggregate(tank, PhysicsShapeType.CYLINDER, { mass: 0 }, this.scene);
                }
            }
        }
        
        // Заграждение из мешков с песком вокруг важных зданий
        const sandbagWallCount = random.int(2, 4);
        for (let w = 0; w < sandbagWallCount; w++) {
            const wx = random.range(10, size - 10);
            const wz = random.range(10, size - 10);
            const wWorldX = chunkX * size + wx;
            const wWorldZ = chunkZ * size + wz;
            if (this.isPositionInGarageArea(wWorldX, wWorldZ, 3)) continue;
            
            const wallLength = random.int(4, 8);
            const wallAngle = random.range(0, Math.PI);
            for (let s = 0; s < wallLength; s++) {
                for (let h = 0; h < 2; h++) {
                    const bag = this.createBox(
                        "sandbagWall",
                        { width: 1.2, height: 0.4, depth: 0.6 },
                        new Vector3(
                            wx + Math.cos(wallAngle) * s * 1.3,
                            h * 0.4 + 0.2,
                            wz + Math.sin(wallAngle) * s * 1.3
                        ),
                        "sand",
                        chunkParent,
                        false
                    );
                    bag.rotation.y = wallAngle;
                }
            }
        }
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
    private createMilitaryVehicle(x: number, z: number, random: any, type: "tank" | "truck" | "apc" = "tank", chunkParent: any): void {
        if (type === "tank") {
            // Tank wreck
            const body = this.createBox(
                "tankWreck",
                { width: 4, height: 2, depth: 6 },
                new Vector3(x, 1, z),
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
                    new Vector3(x + random.range(-2, 2), 0.75, z + random.range(-2, 2)),
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
                new Vector3(x, 1, z),
                "metalRust",
                chunkParent,
                false
            );
            cab.rotation.y = random.range(0, Math.PI * 2);
            
            const trailer = this.createBox(
                "truckTrailer",
                { width: 2.5, height: 2.5, depth: 6 },
                new Vector3(x, 1.25, z - 4.5),
                "metalRust",
                chunkParent,
                false
            );
            trailer.rotation.y = random.range(0, Math.PI * 2);
        }
    }
}

export default PolygonGenerator;

