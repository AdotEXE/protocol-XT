/**
 * @module maps/brest/BrestGenerator
 * @description Генератор карты "Брест" - фиксированная арена в стиле Tanki Online
 * 
 * Карта вдохновлена "Брестом" из Tanki Online:
 * - Среднего размера симметричная арена
 * - Центральная крепость/форт
 * - Базы по углам
 * - Множество построек и укрытий
 * - Фиксированный layout без рандомной генерации
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

/**
 * Конфигурация карты Брест
 */
export interface BrestConfig {
    /** Размер арены в единицах */
    arenaSize: number;
    /** Высота центральной крепости */
    fortressHeight: number;
    /** Размер центральной крепости */
    fortressSize: number;
    /** Высота угловых баз */
    baseHeight: number;
    /** Размер угловых баз */
    baseSize: number;
}

/**
 * Конфигурация по умолчанию
 */
export const DEFAULT_BREST_CONFIG: BrestConfig = {
    arenaSize: MAP_SIZES.brest?.size ?? 180,
    fortressHeight: 4.0,
    fortressSize: 50,
    baseHeight: 3.0,
    baseSize: 25
};

/**
 * Генератор карты "Брест"
 * 
 * Фиксированная арена с центральной крепостью, угловыми базами,
 * постройками и укрытиями в симметричном расположении.
 */
export class BrestGenerator extends BaseMapGenerator {
    readonly mapType = "brest";
    readonly displayName = "Брест";
    readonly description = "Симметричная арена с крепостью в центре и базами по углам";
    
    /** Конфигурация генератора */
    private config: BrestConfig;
    
    constructor(config: Partial<BrestConfig> = {}) {
        super();
        this.config = { ...DEFAULT_BREST_CONFIG, ...config };
    }
    
    /**
     * Основной метод генерации контента чанка
     */
    generateContent(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        // Проверяем, находится ли чанк в области карты
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        const mapMinX = -arenaHalf;
        const mapMaxX = arenaHalf;
        const mapMinZ = -arenaHalf;
        const mapMaxZ = arenaHalf;
        
        // Если чанк не пересекается с картой, ничего не генерируем
        if (chunkMaxX < mapMinX || chunkMinX > mapMaxX ||
            chunkMaxZ < mapMinZ || chunkMinZ > mapMaxZ) {
            return;
        }
        
        // Упрощено: только основные элементы
        this.generateCentralFortress(context);
        this.generateCornerBases(context);
        // Убрано: generateBuildings для упрощения
        // Убрано: generateWalls для упрощения
        this.generateRamps(context); // Рампы для заезда на крепость
        // Убрано: generateCover для упрощения
        this.generatePerimeter(context);
    }
    
    /**
     * Генерация центральной крепости (с проверкой попадания в чанк)
     */
    private generateCentralFortress(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const fortressHalf = this.config.fortressSize / 2;
        
        // Проверяем, пересекается ли крепость с чанком
        const fortressMinX = -fortressHalf;
        const fortressMaxX = fortressHalf;
        const fortressMinZ = -fortressHalf;
        const fortressMaxZ = fortressHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        if (chunkMaxX < fortressMinX || chunkMinX > fortressMaxX ||
            chunkMaxZ < fortressMinZ || chunkMinZ > fortressMaxZ) {
            return; // Крепость не попадает в этот чанк
        }
        
        // Основание крепости
        const fortress = MeshBuilder.CreateBox("fortress_base", {
            width: this.config.fortressSize,
            height: 0.5,
            depth: this.config.fortressSize
        }, chunkParent.getScene());
        
        fortress.position.x = 0;
        fortress.position.y = this.config.fortressHeight;
        fortress.position.z = 0;
        
        // КРЫША КРЕПОСТИ УБРАНА для упрощения
        
        // Упрощено: убраны все декоративные элементы крепости
        
        // Материал крепости
        const fortressMaterial = new StandardMaterial("fortress_material", chunkParent.getScene());
        fortressMaterial.diffuseColor = new Color3(0.5, 0.45, 0.4);
        fortressMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
        fortress.material = fortressMaterial;
        
        // Физика для платформы
        const physicsAggregate = new PhysicsAggregate(
            fortress,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Создание угловой опоры (небольшая стена в углу)
     */
    private createCornerWall(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        size: number,
        wallHeight: number,
        wallThickness: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        // Создаем небольшую опору
        const pillar = MeshBuilder.CreateBox(name, {
            width: size,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        
        pillar.position.x = x;
        pillar.position.y = y;
        pillar.position.z = z;
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.5, 0.45, 0.4);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        pillar.material = material;
        
        // Физика
        const physicsAggregate = new PhysicsAggregate(
            pillar,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Генерация угловых баз (с проверкой попадания в чанк)
     */
    private generateCornerBases(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const basePos = arenaHalf - 40;
        const baseHalf = this.config.baseSize / 2;
        
        // 4 угловые базы
        const bases = [
            { x: basePos, z: basePos, name: "base_ne" },
            { x: -basePos, z: basePos, name: "base_nw" },
            { x: -basePos, z: -basePos, name: "base_sw" },
            { x: basePos, z: -basePos, name: "base_se" }
        ];
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        bases.forEach(base => {
            // Проверяем, попадает ли база в чанк
            const baseMinX = base.x - baseHalf;
            const baseMaxX = base.x + baseHalf;
            const baseMinZ = base.z - baseHalf;
            const baseMaxZ = base.z + baseHalf;
            
            if (chunkMaxX < baseMinX || chunkMinX > baseMaxX ||
                chunkMaxZ < baseMinZ || chunkMinZ > baseMaxZ) {
                return; // База не попадает в этот чанк
            }
            
            // Платформа базы
            const platform = MeshBuilder.CreateBox(`${base.name}_platform`, {
                width: this.config.baseSize,
                height: 0.5,
                depth: this.config.baseSize
            }, chunkParent.getScene());
            
            platform.position.x = base.x;
            platform.position.y = this.config.baseHeight;
            platform.position.z = base.z;
            
            // Стены базы
            const wallHeight = this.config.baseHeight + 1.5;
            const wallThickness = 1.5;
            
            // Стены (3 стены, одна открыта)
            const wallN = MeshBuilder.CreateBox(`${base.name}_wall_n`, {
                width: this.config.baseSize,
                height: wallHeight,
                depth: wallThickness
            }, chunkParent.getScene());
            wallN.position.x = base.x;
            wallN.position.y = wallHeight / 2;
            wallN.position.z = base.z + baseHalf;
            
            const wallE = MeshBuilder.CreateBox(`${base.name}_wall_e`, {
                width: wallThickness,
                height: wallHeight,
                depth: this.config.baseSize
            }, chunkParent.getScene());
            wallE.position.x = base.x + baseHalf;
            wallE.position.y = wallHeight / 2;
            wallE.position.z = base.z;
            
            const wallW = MeshBuilder.CreateBox(`${base.name}_wall_w`, {
                width: wallThickness,
                height: wallHeight,
                depth: this.config.baseSize
            }, chunkParent.getScene());
            wallW.position.x = base.x - baseHalf;
            wallW.position.y = wallHeight / 2;
            wallW.position.z = base.z;
            
            // Материал
            const baseMaterial = new StandardMaterial(`${base.name}_material`, chunkParent.getScene());
            baseMaterial.diffuseColor = new Color3(0.4, 0.4, 0.45);
            baseMaterial.specularColor = new Color3(0.15, 0.15, 0.15);
            platform.material = baseMaterial;
            wallN.material = baseMaterial;
            wallE.material = baseMaterial;
            wallW.material = baseMaterial;
            
            // Физика
            [platform, wallN, wallE, wallW].forEach(mesh => {
                const physicsAggregate = new PhysicsAggregate(
                    mesh,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            });
        });
    }
    
    /**
     * Генерация построек
     */
    private generateBuildings(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        
        // Упрощено: только 4 постройки вокруг крепости
        const buildings = [
            { x: 30, z: 30, w: 12, d: 12, h: 6, name: "building_1" },
            { x: -30, z: 30, w: 12, d: 12, h: 6, name: "building_2" },
            { x: -30, z: -30, w: 12, d: 12, h: 6, name: "building_3" },
            { x: 30, z: -30, w: 12, d: 12, h: 6, name: "building_4" }
        ];
        
        buildings.forEach(building => {
            this.createBuilding(context, building.x, building.z, 0, building.w, building.d, building.h, building.name);
        });
    }
    
    /**
     * Создание одного здания
     */
    private createBuilding(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        width: number,
        depth: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        // Основание
        const base = MeshBuilder.CreateBox(`${name}_base`, {
            width: width,
            height: 0.3,
            depth: depth
        }, chunkParent.getScene());
        base.position.x = x;
        base.position.y = y;
        base.position.z = z;
        
        // Стены
        const wallThickness = 0.5;
        const wallHeight = height;
        
        const wallN = MeshBuilder.CreateBox(`${name}_wall_n`, {
            width: width,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        wallN.position.x = x;
        wallN.position.y = y + wallHeight / 2;
        wallN.position.z = z + depth / 2;
        
        const wallS = MeshBuilder.CreateBox(`${name}_wall_s`, {
            width: width,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        wallS.position.x = x;
        wallS.position.y = y + wallHeight / 2;
        wallS.position.z = z - depth / 2;
        
        const wallE = MeshBuilder.CreateBox(`${name}_wall_e`, {
            width: wallThickness,
            height: wallHeight,
            depth: depth
        }, chunkParent.getScene());
        wallE.position.x = x + width / 2;
        wallE.position.y = y + wallHeight / 2;
        wallE.position.z = z;
        
        const wallW = MeshBuilder.CreateBox(`${name}_wall_w`, {
            width: wallThickness,
            height: wallHeight,
            depth: depth
        }, chunkParent.getScene());
        wallW.position.x = x - width / 2;
        wallW.position.y = y + wallHeight / 2;
        wallW.position.z = z;
        
        // Крыша убрана для упрощения
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.55, 0.5, 0.45);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        base.material = material;
        wallN.material = material;
        wallS.material = material;
        wallE.material = material;
        wallW.material = material;
        
        // Физика
        [base, wallN, wallS, wallE, wallW].forEach(mesh => {
            const physicsAggregate = new PhysicsAggregate(
                mesh,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
    
    /**
     * Генерация стен и барьеров
     */
    private generateWalls(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Упрощено: только 2 стены между крепостью и базами
        const walls = [
            { x: 0, z: 45, w: 15, h: 2, d: 1, name: "wall_1" },
            { x: 0, z: -45, w: 15, h: 2, d: 1, name: "wall_2" }
        ];
        
        walls.forEach(wall => {
            this.createWall(context, wall.x, wall.z, 0, wall.w, wall.h, wall.d, wall.name);
        });
    }
    
    /**
     * Создание стены
     */
    private createWall(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        width: number,
        height: number,
        depth: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        const wall = MeshBuilder.CreateBox(name, {
            width: width,
            height: height,
            depth: depth
        }, chunkParent.getScene());
        
        wall.position.x = x;
        wall.position.y = y + height / 2;
        wall.position.z = z;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.5, 0.5, 0.55);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        wall.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            wall,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Генерация рамп для заезда на крепость и крыши
     */
    private generateRamps(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const fortressHalf = this.config.fortressSize / 2;
        const groundLevel = 0;
        const rampWidth = 12;
        const rampDepth = 8;
        
        // Упрощено: только 2 основные рампы к крепости
        this.createRamp(context, 0, fortressHalf + 10, groundLevel, 0, fortressHalf, this.config.fortressHeight, rampWidth, rampDepth, "ramp_north");
        this.createRamp(context, fortressHalf + 10, 0, groundLevel, fortressHalf, 0, this.config.fortressHeight, rampWidth, rampDepth, "ramp_east");
    }
    
    /**
     * Генерация рамп на крыши построек
     */
    private generateBuildingRoofRamps(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const rampWidth = 8;
        const rampDepth = 5;
        
        // Рампы на крыши построек вокруг крепости
        const buildings = [
            { x: 30, z: 30, h: 6, name: "building_1" },
            { x: -30, z: 30, h: 6, name: "building_2" },
            { x: -30, z: -30, h: 6, name: "building_3" },
            { x: 30, z: -30, h: 6, name: "building_4" },
            { x: 60, z: 0, h: 5, name: "building_5" },
            { x: -60, z: 0, h: 5, name: "building_6" },
            { x: 0, z: 60, h: 5, name: "building_7" },
            { x: 0, z: -60, h: 5, name: "building_8" }
        ];
        
        buildings.forEach(building => {
            const roofHeight = building.h;
            const buildingHalf = 6; // Половина размера здания
            
            // Рампы на крышу с разных сторон
            this.createRamp(context, building.x + buildingHalf + 5, building.z, 0, building.x + buildingHalf * 0.5, building.z, roofHeight, rampWidth, rampDepth, `ramp_roof_${building.name}_e`);
            this.createRamp(context, building.x - buildingHalf - 5, building.z, 0, building.x - buildingHalf * 0.5, building.z, roofHeight, rampWidth, rampDepth, `ramp_roof_${building.name}_w`);
            this.createRamp(context, building.x, building.z + buildingHalf + 5, 0, building.x, building.z + buildingHalf * 0.5, roofHeight, rampWidth, rampDepth, `ramp_roof_${building.name}_n`);
            this.createRamp(context, building.x, building.z - buildingHalf - 5, 0, building.x, building.z - buildingHalf * 0.5, roofHeight, rampWidth, rampDepth, `ramp_roof_${building.name}_s`);
        });
    }
    
    /**
     * Создание одной рампы (с проверкой попадания в чанк)
     */
    private createRamp(
        context: ChunkGenerationContext,
        x1: number,
        z1: number,
        y1: number,
        x2: number,
        z2: number,
        y2: number,
        width: number,
        depth: number,
        name: string
    ): void {
        const { worldX, worldZ, size, chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const rampX = (x1 + x2) / 2;
        const rampZ = (z1 + z2) / 2;
        const rampY = (y1 + y2) / 2;
        
        // Проверяем, попадает ли рампа в чанк
        const rampHalf = Math.max(width, totalDistance) / 2;
        const rampMinX = rampX - rampHalf;
        const rampMaxX = rampX + rampHalf;
        const rampMinZ = rampZ - rampHalf;
        const rampMaxZ = rampZ + rampHalf;
        
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;
        
        if (chunkMaxX < rampMinX || chunkMinX > rampMaxX ||
            chunkMaxZ < rampMinZ || chunkMinZ > rampMaxZ) {
            return; // Рампа не попадает в этот чанк
        }
        
        const ramp = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        ramp.position.x = rampX;
        ramp.position.y = rampY;
        ramp.position.z = rampZ;
        
        const yawAngle = Math.atan2(dx, dz);
        ramp.rotation.y = yawAngle;
        ramp.rotation.x = pitchAngle;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.65, 0.65, 0.7);
        material.specularColor = new Color3(0.25, 0.25, 0.25);
        ramp.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            ramp,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Генерация укрытий и контейнеров
     */
    private generateCover(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        
        // Упрощено: только половина контейнеров
        const containers = [
            { x: 20, z: 20, name: "container_1" },
            { x: -20, z: 20, name: "container_2" },
            { x: -20, z: -20, name: "container_3" },
            { x: 20, z: -20, name: "container_4" }
        ];
        
        containers.forEach(container => {
            this.createContainer(context, container.x, container.z, 0.25, 3, 3, 2.5, container.name);
        });
        
        // Низкие стены-укрытия
        const coverWalls = [
            { x: 15, z: 0, w: 8, h: 1.5, d: 0.5, name: "cover_1" },
            { x: -15, z: 0, w: 8, h: 1.5, d: 0.5, name: "cover_2" },
            { x: 0, z: 15, w: 0.5, h: 1.5, d: 8, name: "cover_3" },
            { x: 0, z: -15, w: 0.5, h: 1.5, d: 8, name: "cover_4" }
        ];
        
        coverWalls.forEach(cover => {
            this.createWall(context, cover.x, cover.z, 0, cover.w, cover.h, cover.d, cover.name);
        });
    }
    
    /**
     * Создание контейнера
     */
    private createContainer(
        context: ChunkGenerationContext,
        x: number,
        z: number,
        y: number,
        width: number,
        depth: number,
        height: number,
        name: string
    ): void {
        const { chunkParent } = context;
        
        const container = MeshBuilder.CreateBox(name, {
            width: width,
            height: height,
            depth: depth
        }, chunkParent.getScene());
        
        container.position.x = x;
        container.position.y = y + height / 2;
        container.position.z = z;
        
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.3, 0.35, 0.4);
        material.specularColor = new Color3(0.1, 0.1, 0.1);
        container.material = material;
        
        const physicsAggregate = new PhysicsAggregate(
            container,
            PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.1 },
            chunkParent.getScene()
        );
        physicsAggregate.body.setMassProperties({ mass: 0 });
    }
    
    /**
     * Генерация периметра (стены по краям арены) - создается только частично в каждом чанке
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { worldX, worldZ, size, chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = 6;
        const wallThickness = 2;

        const chunkLeft = worldX;
        const chunkRight = worldX + size;
        const chunkBottom = worldZ;
        const chunkTop = worldZ + size;

        const wallMaterial = new StandardMaterial("wall_material", chunkParent.getScene());
        wallMaterial.diffuseColor = new Color3(0.6, 0.55, 0.5);
        wallMaterial.specularColor = new Color3(0.2, 0.2, 0.2);

        // Северная стена
        if (chunkBottom <= arenaHalf && chunkTop >= arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2;
                const northWall = MeshBuilder.CreateBox("wall_north", {
                    width: wallLength,
                    height: wallHeight,
                    depth: wallThickness
                }, chunkParent.getScene());
                northWall.position.x = wallX;
                northWall.position.y = wallHeight / 2;
                northWall.position.z = arenaHalf;
                northWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    northWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Южная стена
        if (chunkBottom <= -arenaHalf && chunkTop >= -arenaHalf) {
            const wallLength = Math.min(chunkRight, arenaHalf) - Math.max(chunkLeft, -arenaHalf);
            if (wallLength > 0) {
                const wallX = (Math.max(chunkLeft, -arenaHalf) + Math.min(chunkRight, arenaHalf)) / 2;
                const southWall = MeshBuilder.CreateBox("wall_south", {
                    width: wallLength,
                    height: wallHeight,
                    depth: wallThickness
                }, chunkParent.getScene());
                southWall.position.x = wallX;
                southWall.position.y = wallHeight / 2;
                southWall.position.z = -arenaHalf;
                southWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    southWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Восточная стена
        if (chunkLeft <= arenaHalf && chunkRight >= arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2;
                const eastWall = MeshBuilder.CreateBox("wall_east", {
                    width: wallThickness,
                    height: wallHeight,
                    depth: wallLength
                }, chunkParent.getScene());
                eastWall.position.x = arenaHalf;
                eastWall.position.y = wallHeight / 2;
                eastWall.position.z = wallZ;
                eastWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    eastWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }

        // Западная стена
        if (chunkLeft <= -arenaHalf && chunkRight >= -arenaHalf) {
            const wallLength = Math.min(chunkTop, arenaHalf) - Math.max(chunkBottom, -arenaHalf);
            if (wallLength > 0) {
                const wallZ = (Math.max(chunkBottom, -arenaHalf) + Math.min(chunkTop, arenaHalf)) / 2;
                const westWall = MeshBuilder.CreateBox("wall_west", {
                    width: wallThickness,
                    height: wallHeight,
                    depth: wallLength
                }, chunkParent.getScene());
                westWall.position.x = -arenaHalf;
                westWall.position.y = wallHeight / 2;
                westWall.position.z = wallZ;
                westWall.material = wallMaterial;

                const physicsAggregate = new PhysicsAggregate(
                    westWall,
                    PhysicsShapeType.BOX,
                    { mass: 0, restitution: 0.1 },
                    chunkParent.getScene()
                );
                physicsAggregate.body.setMassProperties({ mass: 0 });
            }
        }
    }
}

