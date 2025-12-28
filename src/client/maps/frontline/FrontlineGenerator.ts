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
 * Размер арены: 800x800 единиц
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
 */
export const DEFAULT_FRONTLINE_CONFIG: FrontlineConfig = {
    arenaSize: 1000,  // Ограничено для тестов
    noMansLandWidth: 100,
    trenchDensity: 0.6,
    craterDensity: 0.8,
    wireDensity: 0.5
};

/**
 * Высота стен периметра
 */
const FRONTLINE_WALL_HEIGHT = 8;

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
     * Генерация рельефа
     */
    private generateTerrain(context: ChunkGenerationContext): void {
        const { size, random, chunkParent, chunkX, chunkZ } = context;
        
        // Воронки и неровности
        const craterCount = random.int(3, 8);
        for (let i = 0; i < craterCount; i++) {
            if (!random.chance(this.config.craterDensity * 0.3)) continue;
            
            const cx = random.range(5, size - 5);
            const cz = random.range(5, size - 5);
            const cWorldX = chunkX * size + cx;
            const cWorldZ = chunkZ * size + cz;
            
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 3)) continue;
            
            const craterRadius = random.range(2, 5);
            
            // Создаём простое углубление
            this.createCylinder(
                "frontline_crater",
                { diameter: craterRadius * 2, height: 0.3 },
                new Vector3(cx, 0.15, cz),
                "dirt",
                chunkParent,
                false
            );
        }
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
                this.createBox(
                    "fwall_n",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, arenaHalf - worldZ),
                    "concrete",
                    context.chunkParent,
                    true
                );
            }
        }
        
        // Южная стена (z = -arenaHalf)
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2 - worldX;
                this.createBox(
                    "fwall_s",
                    { width: wallLength, height: wallHeight, depth: wallThickness },
                    new Vector3(wallX, wallHeight / 2, -arenaHalf - worldZ),
                    "concrete",
                    context.chunkParent,
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
                    "fwall_e",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    context.chunkParent,
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
                    "fwall_w",
                    { width: wallThickness, height: wallHeight, depth: wallLength },
                    new Vector3(-arenaHalf - worldX, wallHeight / 2, wallZ),
                    "concrete",
                    context.chunkParent,
                    true
                );
            }
        }
    }
    
    /**
     * Генерация траншей
     */
    private generateTrenches(context: ChunkGenerationContext, side: "allied" | "enemy" | "neutral"): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Окопы - длинные траншеи с земляными валами
        const trenchCount = side === "neutral" ? random.int(6, 10) : random.int(4, 6);
        
        for (let i = 0; i < trenchCount; i++) {
            const x = random.range(10, size - 10);
            const z = random.range(10, size - 10);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) continue;
            
            const trenchLength = random.range(15, 30);
            const trenchWidth = 3;
            const trenchDepth = 1.5;
            
            // Сам окоп (углубление в земле - представлено низкими стенами по бокам)
            // Левый вал
            const leftWall = this.createBox(
                "trench_l",
                { width: trenchLength, height: trenchDepth, depth: 0.8 },
                new Vector3(x, trenchDepth / 2, z - trenchWidth / 2),
                "dirt",
                chunkParent,
                true
            );
            
            // Правый вал
            const rightWall = this.createBox(
                "trench_r",
                { width: trenchLength, height: trenchDepth, depth: 0.8 },
                new Vector3(x, trenchDepth / 2, z + trenchWidth / 2),
                "dirt",
                chunkParent,
                true
            );
            
            // Мешки с песком на валах
            if (random.chance(0.6)) {
                for (let bag = 0; bag < 3; bag++) {
                    const sandbag = this.createBox(
                        "sb",
                        { width: 1.2, height: 0.4, depth: 0.6 },
                        new Vector3(
                            x - trenchLength / 2 + bag * 2 + random.range(-0.5, 0.5),
                            trenchDepth + 0.2,
                            z - trenchWidth / 2
                        ),
                        "sand",
                        chunkParent,
                        false
                    );
                }
            }
        }
    }
    
    /**
     * Генерация бункеров
     */
    private generateBunkers(context: ChunkGenerationContext, side: "allied" | "enemy"): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Бункеры на позициях - несколько бункеров (1-2 на зону)
        const bunkerCount = random.int(1, 2);
        
        for (let i = 0; i < bunkerCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 10)) continue;
            
            const bunkerW = random.range(8, 14);
            const bunkerH = random.range(3, 5);
            const bunkerD = random.range(6, 10);
            
            const bunker = this.createBox(
                "bunker",
                { width: bunkerW, height: bunkerH, depth: bunkerD },
                new Vector3(x, bunkerH / 2, z),
                "concrete",
                chunkParent,
                true
            );
            
            // Амбразура
            const slitW = bunkerW * 0.5;
            const slit = MeshBuilder.CreateBox("slit", {
                width: slitW,
                height: 0.6,
                depth: 0.5
            }, this.scene);
            // Амбразура направлена к центру карты
            const slitZ = side === "allied" ? z + bunkerD / 2 : z - bunkerD / 2;
            slit.position = new Vector3(x, bunkerH - 0.6, slitZ);
            const slitMat = new StandardMaterial("slitMat", this.scene);
            slitMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            slit.material = slitMat;
            slit.parent = chunkParent;
            slit.freezeWorldMatrix();
        }
    }
    
    /**
     * Генерация воронок
     */
    private generateCraters(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Воронки от взрывов в нейтральной полосе
        const craterCount = random.int(10, 18);
        
        for (let i = 0; i < craterCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 5)) continue;
            
            const craterRadius = random.range(3, 8);
            const craterDepth = random.range(0.5, 1.5);
            
            // Воронка представлена как прямоугольные блоки вокруг центра (LOW POLY)
            const rimHeight = craterDepth * 0.5;
            const rimW = craterRadius * 0.4;
            
            // Создаём квадратный обод из 4 прямоугольных блоков
            // Север
            const rimN = this.createBox(
                "crater_rim_n",
                { width: craterRadius * 2.2, height: rimHeight, depth: rimW },
                new Vector3(x, rimHeight / 2, z - craterRadius - rimW / 2),
                "dirt",
                chunkParent,
                false
            );
            
            // Юг
            const rimS = this.createBox(
                "crater_rim_s",
                { width: craterRadius * 2.2, height: rimHeight, depth: rimW },
                new Vector3(x, rimHeight / 2, z + craterRadius + rimW / 2),
                "dirt",
                chunkParent,
                false
            );
            
            // Восток
            const rimE = this.createBox(
                "crater_rim_e",
                { width: rimW, height: rimHeight, depth: craterRadius * 2.2 },
                new Vector3(x + craterRadius + rimW / 2, rimHeight / 2, z),
                "dirt",
                chunkParent,
                false
            );
            
            // Запад
            const rimWest = this.createBox(
                "crater_rim_w",
                { width: rimW, height: rimHeight, depth: craterRadius * 2.2 },
                new Vector3(x - craterRadius - rimW / 2, rimHeight / 2, z),
                "dirt",
                chunkParent,
                false
            );
        }
    }
    
    /**
     * Генерация проволочных заграждений
     */
    private generateWire(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Колючая проволока в нейтральной полосе
        const wireCount = random.int(2, 5);
        
        for (let i = 0; i < wireCount; i++) {
            const x = random.range(5, size - 5);
            const z = random.range(5, size - 5);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            const wireLength = random.range(8, 20);
            const wireHeight = 1.2;
            
            // Столбы
            for (let post = 0; post < 3; post++) {
                const postX = x - wireLength / 2 + post * wireLength / 2;
                const postMesh = this.createBox(
                    "wire_post",
                    { width: 0.15, height: wireHeight + 0.3, depth: 0.15 },
                    new Vector3(postX, (wireHeight + 0.3) / 2, z),
                    "metalRust",
                    chunkParent,
                    false
                );
            }
            
            // Проволока (несколько горизонтальных линий)
            for (let line = 0; line < 3; line++) {
                const lineY = 0.3 + line * 0.4;
                const wireMesh = MeshBuilder.CreateBox("wire", {
                    width: wireLength,
                    height: 0.05,
                    depth: 0.05
                }, this.scene);
                wireMesh.position = new Vector3(x, lineY, z);
                
                const wireMat = new StandardMaterial("wireMat", this.scene);
                wireMat.diffuseColor = new Color3(0.3, 0.25, 0.2);
                wireMat.specularColor = new Color3(0.5, 0.5, 0.5);
                wireMesh.material = wireMat;
                wireMesh.parent = chunkParent;
                wireMesh.freezeWorldMatrix();
            }
            
            // Физика - невидимый барьер (замедляет танк)
            const wirePhysics = MeshBuilder.CreateBox("wire_phys", {
                width: wireLength,
                height: wireHeight,
                depth: 0.5
            }, this.scene);
            wirePhysics.position = new Vector3(x, wireHeight / 2, z);
            wirePhysics.isVisible = false;
            wirePhysics.parent = chunkParent;
            new PhysicsAggregate(wirePhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        }
    }
    
    /**
     * Генерация разбитой техники
     */
    private generateWrecks(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Подбитая техника (декорации)
        const wreckCount = random.int(3, 6);
        
        for (let i = 0; i < wreckCount; i++) {
            const x = random.range(15, size - 15);
            const z = random.range(15, size - 15);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 8)) continue;
            
            // Подбитый танк (силуэт)
            const hullW = random.range(4, 6);
            const hullH = random.range(1.5, 2.5);
            const hullD = random.range(6, 9);
            
            const hull = MeshBuilder.CreateBox("wreck_hull", {
                width: hullW,
                height: hullH,
                depth: hullD
            }, this.scene);
            hull.position = new Vector3(x, hullH / 2, z);
            hull.rotation.y = random.range(0, Math.PI * 2);
            
            // Тёмный обгоревший материал
            const wreckMat = new StandardMaterial("wreckMat", this.scene);
            wreckMat.diffuseColor = new Color3(0.15, 0.12, 0.1);
            wreckMat.specularColor = new Color3(0, 0, 0);
            hull.material = wreckMat;
            hull.parent = chunkParent;
            hull.freezeWorldMatrix();
            new PhysicsAggregate(hull, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            
            // Башня (может быть сбита)
            if (random.chance(0.6)) {
                const turretSize = hullW * 0.6;
                const turret = MeshBuilder.CreateBox("wreck_turret", {
                    width: turretSize,
                    height: turretSize * 0.7,
                    depth: turretSize
                }, this.scene);
                
                if (random.chance(0.4)) {
                    // Башня сбита - лежит рядом
                    turret.position = new Vector3(
                        x + random.range(-3, 3),
                        turretSize * 0.35,
                        z + random.range(-3, 3)
                    );
                    turret.rotation.x = random.range(-0.5, 0.5);
                    turret.rotation.z = random.range(-0.5, 0.5);
                } else {
                    // Башня на месте
                    turret.position = new Vector3(x, hullH + turretSize * 0.35, z);
                }
                turret.rotation.y = random.range(0, Math.PI * 2);
                turret.material = wreckMat;
                turret.parent = chunkParent;
                turret.freezeWorldMatrix();
            }
            
            // Дым / огонь (простой визуальный эффект - вертикальный столб)
            if (random.chance(0.3)) {
                const smoke = MeshBuilder.CreateCylinder("smoke", {
                    diameter: 1.5,
                    height: 4
                }, this.scene);
                smoke.position = new Vector3(x, hullH + 2, z);
                const smokeMat = new StandardMaterial("smokeMat", this.scene);
                smokeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                smokeMat.alpha = 0.4;
                smoke.material = smokeMat;
                smoke.parent = chunkParent;
                smoke.freezeWorldMatrix();
            }
        }
    }
    
    /**
     * Генерация баррикад
     */
    private generateBarricades(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Баррикады на вражеской стороне
        const barricadeCount = random.int(2, 5);
        
        for (let i = 0; i < barricadeCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            const barricadeType = random.int(0, 2);
            
            if (barricadeType === 0) {
                // Бетонные блоки
                const blockW = random.range(3, 6);
                const blockH = random.range(1.5, 2.5);
                const block = this.createBox(
                    "barricade",
                    { width: blockW, height: blockH, depth: 1.5 },
                    new Vector3(x, blockH / 2, z),
                    "concrete",
                    chunkParent,
                    true
                );
                block.rotation.y = random.range(-0.3, 0.3);
            } else if (barricadeType === 1) {
                // Противотанковые ежи
                const beamLength = 3;
                const beamThickness = 0.25;
                
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
                
                // Физика (LOW POLY - box)
                const hedgehogPhysics = MeshBuilder.CreateBox("hh_phys", {
                    width: 2.5,
                    height: 2.5,
                    depth: 2.5
                }, this.scene);
                hedgehogPhysics.position = new Vector3(x, 1.2, z);
                hedgehogPhysics.isVisible = false;
                hedgehogPhysics.parent = chunkParent;
                new PhysicsAggregate(hedgehogPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            } else {
                // Мешки с песком
                for (let row = 0; row < 2; row++) {
                    for (let col = 0; col < 4; col++) {
                        const bag = this.createBox(
                            "sandbag",
                            { width: 1.2, height: 0.4, depth: 0.6 },
                            new Vector3(x + col * 1.3 - 2, row * 0.4 + 0.2, z),
                            "sand",
                            chunkParent,
                            false
                        );
                    }
                }
                
                // Физика для мешков
                const sbPhysics = MeshBuilder.CreateBox("sb_phys", {
                    width: 5,
                    height: 0.8,
                    depth: 1
                }, this.scene);
                sbPhysics.position = new Vector3(x, 0.4, z);
                sbPhysics.isVisible = false;
                sbPhysics.parent = chunkParent;
                new PhysicsAggregate(sbPhysics, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
            }
        }
    }
    
    /**
     * Генерация руин
     */
    private generateRuins(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Разрушенные здания
        if (!random.chance(0.7)) return;
        
        const x = random.range(15, size - 15);
        const z = random.range(15, size - 15);
        
        const worldX = chunkX * size + x;
        const worldZ = chunkZ * size + z;
        if (this.isPositionInGarageArea(worldX, worldZ, 10)) return;
        
        const ruinW = random.range(8, 15);
        const ruinH = random.range(2, 5);
        const ruinD = random.range(8, 12);
        
        // Остатки стен (неполный прямоугольник)
        // Задняя стена
        const backWall = this.createBox(
            "ruin_back",
            { width: ruinW, height: ruinH, depth: 0.5 },
            new Vector3(x, ruinH / 2, z - ruinD / 2),
            "brick",
            chunkParent,
            true
        );
        
        // Левая стена (частичная)
        if (random.chance(0.7)) {
            const leftH = ruinH * random.range(0.4, 0.8);
            const leftWall = this.createBox(
                "ruin_left",
                { width: 0.5, height: leftH, depth: ruinD * 0.7 },
                new Vector3(x - ruinW / 2, leftH / 2, z),
                "brick",
                chunkParent,
                true
            );
        }
        
        // Правая стена (частичная)
        if (random.chance(0.5)) {
            const rightH = ruinH * random.range(0.3, 0.6);
            const rightWall = this.createBox(
                "ruin_right",
                { width: 0.5, height: rightH, depth: ruinD * 0.5 },
                new Vector3(x + ruinW / 2, rightH / 2, z + ruinD * 0.2),
                "brickDark",
                chunkParent,
                true
            );
        }
        
        // Обломки на земле
        const debrisCount = random.int(2, 5);
        for (let i = 0; i < debrisCount; i++) {
            const debrisX = x + random.range(-ruinW / 2, ruinW / 2);
            const debrisZ = z + random.range(-ruinD / 2, ruinD / 2);
            const debrisW = random.range(1, 3);
            const debrisH = random.range(0.3, 1);
            const debrisD = random.range(1, 3);
            
            const debris = this.createBox(
                "debris",
                { width: debrisW, height: debrisH, depth: debrisD },
                new Vector3(debrisX, debrisH / 2, debrisZ),
                random.pick(["brick", "concrete", "brickDark"]),
                chunkParent,
                true
            );
            debris.rotation.y = random.range(0, Math.PI);
        }
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
     * Генерация мешков с песком
     */
    private generateSandbags(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        // Sandbag piles and barriers in no man's land
        const sandbagCount = random.int(3, 7);
        
        for (let i = 0; i < sandbagCount; i++) {
            const x = random.range(8, size - 8);
            const z = random.range(8, size - 8);
            const worldX = chunkX * size + x;
            const worldZ = chunkZ * size + z;
            
            if (this.isPositionInGarageArea(worldX, worldZ, 3)) continue;
            
            // Create sandbag pile
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3 - row; col++) {
                    const bag = this.createBox(
                        "sandbag",
                        { width: 1.2, height: 0.4, depth: 0.6 },
                        new Vector3(
                            x + (col - (3 - row - 1) / 2) * 1.2,
                            row * 0.4,
                            z + random.range(-0.5, 0.5)
                        ),
                        "dirt",
                        chunkParent,
                        false
                    );
                }
            }
        }
    }
    
    /**
     * Генерация артиллерийских позиций
     */
    private generateArtillery(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        const artilleryCount = random.int(2, 4);
        for (let i = 0; i < artilleryCount; i++) {
            const ax = random.range(15, size - 15);
            const az = random.range(15, size - 15);
            const aWorldX = chunkX * size + ax;
            const aWorldZ = chunkZ * size + az;
            if (this.isPositionInGarageArea(aWorldX, aWorldZ, 5)) continue;
            
            // Основание орудия
            const base = this.createBox(
                "artilleryBase",
                { width: 3, height: 0.5, depth: 4 },
                new Vector3(ax, 0.25, az),
                "metalRust",
                chunkParent,
                true
            );
            base.rotation.y = random.range(0, Math.PI * 2);
            
            // Ствол орудия
            const barrel = this.createBox(
                "artilleryBarrel",
                { width: 0.4, height: 0.4, depth: 4 },
                new Vector3(ax, 1.2, az + 2),
                "metal",
                chunkParent,
                false
            );
            barrel.rotation.x = -0.2;
            
            // Щит
            const shield = this.createBox(
                "artilleryShield",
                { width: 2.5, height: 1.5, depth: 0.1 },
                new Vector3(ax, 1, az),
                "metalRust",
                chunkParent,
                false
            );
            
            // Ящики с боеприпасами рядом
            const crateCount = random.int(2, 5);
            for (let c = 0; c < crateCount; c++) {
                const crate = MeshBuilder.CreateBox("ammoCrate", {
                    width: 0.8,
                    height: 0.5,
                    depth: 0.6
                }, this.scene);
                crate.position = new Vector3(
                    ax + random.range(-2, 2),
                    0.25,
                    az + random.range(-2, 2)
                );
                const crateMat = new StandardMaterial("crateMat", this.scene);
                crateMat.diffuseColor = new Color3(0.25, 0.2, 0.1);
                crate.material = crateMat;
                crate.parent = chunkParent;
                crate.freezeWorldMatrix();
            }
        }
    }
    
    /**
     * Генерация блиндажей
     */
    private generateDugouts(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        const dugoutCount = random.int(1, 3);
        for (let i = 0; i < dugoutCount; i++) {
            const dx = random.range(15, size - 15);
            const dz = random.range(15, size - 15);
            const dWorldX = chunkX * size + dx;
            const dWorldZ = chunkZ * size + dz;
            if (this.isPositionInGarageArea(dWorldX, dWorldZ, 6)) continue;
            
            // Блиндаж - полузаглублённое укрытие
            const dugoutW = random.range(6, 10);
            const dugoutD = random.range(8, 12);
            
            // Крыша (бревенчатый накат)
            const roof = MeshBuilder.CreateBox("dugoutRoof", {
                width: dugoutW,
                height: 0.8,
                depth: dugoutD
            }, this.scene);
            roof.position = new Vector3(dx, 0.8, dz);
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
                new Vector3(dx, 0.2, dz),
                "dirt",
                chunkParent,
                false
            );
            
            // Вход
            const entrance = this.createBox(
                "entrance",
                { width: 2, height: 1.5, depth: 1 },
                new Vector3(dx, 0.5, dz + dugoutD / 2 + 0.5),
                "dirt",
                chunkParent,
                false
            );
        }
    }
    
    /**
     * Генерация затопленных воронок
     */
    private generateWaterCraters(context: ChunkGenerationContext): void {
        const { chunkX, chunkZ, size, random, chunkParent } = context;
        
        const waterCraterCount = random.int(2, 5);
        for (let i = 0; i < waterCraterCount; i++) {
            const cx = random.range(10, size - 10);
            const cz = random.range(10, size - 10);
            const cWorldX = chunkX * size + cx;
            const cWorldZ = chunkZ * size + cz;
            if (this.isPositionInGarageArea(cWorldX, cWorldZ, 4)) continue;
            
            const radius = random.range(3, 6);
            
            // Затопленная воронка
            const water = MeshBuilder.CreateCylinder("waterCrater", {
                diameter: radius * 2,
                height: 0.1
            }, this.scene);
            water.position = new Vector3(cx, -0.3, cz);
            water.material = this.getMat("water");
            water.parent = chunkParent;
            water.freezeWorldMatrix();
            
            // Грязевые края
            for (let e = 0; e < 6; e++) {
                const angle = (e / 6) * Math.PI * 2;
                const mud = this.createBox(
                    "mud",
                    { width: 1.5, height: 0.4, depth: 1.5 },
                    new Vector3(
                        cx + Math.cos(angle) * (radius - 0.5),
                        0.1,
                        cz + Math.sin(angle) * (radius - 0.5)
                    ),
                    "dirt",
                    chunkParent,
                    false
                );
            }
        }
    }
}

export default FrontlineGenerator;

