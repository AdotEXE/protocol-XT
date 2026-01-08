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
        
        // Генерируем элементы
        this.generateCentralFortress(context);
        this.generateCornerBases(context);
        this.generateBuildings(context);
        this.generateWalls(context);
        this.generateRamps(context); // Рампы для заезда на крепость
        this.generateCover(context);
        this.generatePerimeter(context);
    }
    
    /**
     * Генерация центральной крепости
     */
    private generateCentralFortress(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const fortressHalf = this.config.fortressSize / 2;
        
        // Основание крепости
        const fortress = MeshBuilder.CreateBox("fortress_base", {
            width: this.config.fortressSize,
            height: 0.5,
            depth: this.config.fortressSize
        }, chunkParent.getScene());
        
        fortress.position.x = 0;
        fortress.position.y = this.config.fortressHeight;
        fortress.position.z = 0;
        
        // КРЫША КРЕПОСТИ (для заезда)
        const roofHeight = this.config.fortressHeight + 2;
        const roof = MeshBuilder.CreateBox("fortress_roof", {
            width: this.config.fortressSize - 4, // Немного меньше для визуального эффекта
            height: 0.5,
            depth: this.config.fortressSize - 4
        }, chunkParent.getScene());
        
        roof.position.x = 0;
        roof.position.y = roofHeight;
        roof.position.z = 0;
        
        // СТЕНЫ КРЕПОСТИ УБРАНЫ - ЦЕНТР ПОЛНОСТЬЮ ОТКРЫТ
        // Только декоративные угловые опоры (не блокируют проход)
        const wallHeight = this.config.fortressHeight + 2;
        const wallThickness = 1.5;
        const cornerPillarSize = 4; // Маленькие угловые опоры
        
        // Только 4 угловые опоры для визуального эффекта (не блокируют центр)
        // Северо-восточный угол
        this.createCornerWall(context, fortressHalf - 2, fortressHalf - 2, wallHeight / 2, cornerPillarSize, wallHeight, wallThickness, "corner_ne");
        // Северо-западный угол
        this.createCornerWall(context, -fortressHalf + 2, fortressHalf - 2, wallHeight / 2, cornerPillarSize, wallHeight, wallThickness, "corner_nw");
        // Юго-восточный угол
        this.createCornerWall(context, fortressHalf - 2, -fortressHalf + 2, wallHeight / 2, cornerPillarSize, wallHeight, wallThickness, "corner_se");
        // Юго-западный угол
        this.createCornerWall(context, -fortressHalf + 2, -fortressHalf + 2, wallHeight / 2, cornerPillarSize, wallHeight, wallThickness, "corner_sw");
        
        // Материал крепости
        const fortressMaterial = new StandardMaterial("fortress_material", chunkParent.getScene());
        fortressMaterial.diffuseColor = new Color3(0.5, 0.45, 0.4);
        fortressMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
        fortress.material = fortressMaterial;
        roof.material = fortressMaterial;
        
        // Физика для платформы и крыши
        [fortress, roof].forEach(mesh => {
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
     * Генерация угловых баз
     */
    private generateCornerBases(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
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
        
        bases.forEach(base => {
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
        
        // Постройки вокруг крепости
        const buildings = [
            { x: 30, z: 30, w: 12, d: 12, h: 6, name: "building_1" },
            { x: -30, z: 30, w: 12, d: 12, h: 6, name: "building_2" },
            { x: -30, z: -30, w: 12, d: 12, h: 6, name: "building_3" },
            { x: 30, z: -30, w: 12, d: 12, h: 6, name: "building_4" },
            { x: 60, z: 0, w: 10, d: 10, h: 5, name: "building_5" },
            { x: -60, z: 0, w: 10, d: 10, h: 5, name: "building_6" },
            { x: 0, z: 60, w: 10, d: 10, h: 5, name: "building_7" },
            { x: 0, z: -60, w: 10, d: 10, h: 5, name: "building_8" }
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
        
        // Крыша
        const roof = MeshBuilder.CreateBox(`${name}_roof`, {
            width: width + 0.5,
            height: 0.3,
            depth: depth + 0.5
        }, chunkParent.getScene());
        roof.position.x = x;
        roof.position.y = y + height;
        roof.position.z = z;
        
        // Материал
        const material = new StandardMaterial(`${name}_mat`, chunkParent.getScene());
        material.diffuseColor = new Color3(0.55, 0.5, 0.45);
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        base.material = material;
        wallN.material = material;
        wallS.material = material;
        wallE.material = material;
        wallW.material = material;
        roof.material = material;
        
        // Физика
        [base, wallN, wallS, wallE, wallW, roof].forEach(mesh => {
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
        
        // Стены между крепостью и базами
        const walls = [
            { x: 0, z: 45, w: 15, h: 2, d: 1, name: "wall_1" },
            { x: 0, z: -45, w: 15, h: 2, d: 1, name: "wall_2" },
            { x: 45, z: 0, w: 1, h: 2, d: 15, name: "wall_3" },
            { x: -45, z: 0, w: 1, h: 2, d: 15, name: "wall_4" }
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
        
        // Рампы от земли к крепости (4 основные)
        this.createRamp(context, 0, fortressHalf + 10, groundLevel, 0, fortressHalf, this.config.fortressHeight, rampWidth, rampDepth, "ramp_north");
        this.createRamp(context, 0, -fortressHalf - 10, groundLevel, 0, -fortressHalf, this.config.fortressHeight, rampWidth, rampDepth, "ramp_south");
        this.createRamp(context, fortressHalf + 10, 0, groundLevel, fortressHalf, 0, this.config.fortressHeight, rampWidth, rampDepth, "ramp_east");
        this.createRamp(context, -fortressHalf - 10, 0, groundLevel, -fortressHalf, 0, this.config.fortressHeight, rampWidth, rampDepth, "ramp_west");
        
        // Дополнительные рампы (диагональные)
        this.createRamp(context, fortressHalf + 8, fortressHalf + 8, groundLevel, fortressHalf * 0.7, fortressHalf * 0.7, this.config.fortressHeight, rampWidth * 0.8, rampDepth, "ramp_ne");
        this.createRamp(context, -fortressHalf - 8, fortressHalf + 8, groundLevel, -fortressHalf * 0.7, fortressHalf * 0.7, this.config.fortressHeight, rampWidth * 0.8, rampDepth, "ramp_nw");
        this.createRamp(context, -fortressHalf - 8, -fortressHalf - 8, groundLevel, -fortressHalf * 0.7, -fortressHalf * 0.7, this.config.fortressHeight, rampWidth * 0.8, rampDepth, "ramp_sw");
        this.createRamp(context, fortressHalf + 8, -fortressHalf - 8, groundLevel, fortressHalf * 0.7, -fortressHalf * 0.7, this.config.fortressHeight, rampWidth * 0.8, rampDepth, "ramp_se");
        
        // РАМПЫ НА КРЫШУ КРЕПОСТИ
        const roofHeight = this.config.fortressHeight + 2; // Высота крыши крепости
        const roofRampWidth = 10;
        const roofRampDepth = 6;
        
        // Рампы на крышу крепости (от платформы крепости на крышу)
        this.createRamp(context, 0, fortressHalf * 0.8, this.config.fortressHeight, 0, fortressHalf * 0.5, roofHeight, roofRampWidth, roofRampDepth, "ramp_roof_north");
        this.createRamp(context, 0, -fortressHalf * 0.8, this.config.fortressHeight, 0, -fortressHalf * 0.5, roofHeight, roofRampWidth, roofRampDepth, "ramp_roof_south");
        this.createRamp(context, fortressHalf * 0.8, 0, this.config.fortressHeight, fortressHalf * 0.5, 0, roofHeight, roofRampWidth, roofRampDepth, "ramp_roof_east");
        this.createRamp(context, -fortressHalf * 0.8, 0, this.config.fortressHeight, -fortressHalf * 0.5, 0, roofHeight, roofRampWidth, roofRampDepth, "ramp_roof_west");
        
        // РАМПЫ НА КРЫШИ ПОСТРОЕК
        this.generateBuildingRoofRamps(context);
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
     * Создание одной рампы
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
        const { chunkParent } = context;
        
        const dx = x2 - x1;
        const dz = z2 - z1;
        const dy = y2 - y1;
        const totalDistance = Math.sqrt(dx * dx + dz * dz);
        const pitchAngle = Math.atan2(dy, totalDistance);
        
        const ramp = MeshBuilder.CreateBox(name, {
            width: width,
            height: 0.5,
            depth: totalDistance
        }, chunkParent.getScene());
        
        ramp.position.x = (x1 + x2) / 2;
        ramp.position.y = (y1 + y2) / 2;
        ramp.position.z = (z1 + z2) / 2;
        
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
        
        // Контейнеры
        const containers = [
            { x: 20, z: 20, name: "container_1" },
            { x: -20, z: 20, name: "container_2" },
            { x: -20, z: -20, name: "container_3" },
            { x: 20, z: -20, name: "container_4" },
            { x: 40, z: 40, name: "container_5" },
            { x: -40, z: 40, name: "container_6" },
            { x: -40, z: -40, name: "container_7" },
            { x: 40, z: -40, name: "container_8" }
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
     * Генерация периметра (стены по краям арены)
     */
    private generatePerimeter(context: ChunkGenerationContext): void {
        const { chunkParent } = context;
        const arenaHalf = this.config.arenaSize / 2;
        const wallHeight = 6;
        const wallThickness = 2;
        
        // Стены по периметру
        const northWall = MeshBuilder.CreateBox("wall_north", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        northWall.position.x = 0;
        northWall.position.y = wallHeight / 2;
        northWall.position.z = arenaHalf;
        
        const southWall = MeshBuilder.CreateBox("wall_south", {
            width: this.config.arenaSize,
            height: wallHeight,
            depth: wallThickness
        }, chunkParent.getScene());
        southWall.position.x = 0;
        southWall.position.y = wallHeight / 2;
        southWall.position.z = -arenaHalf;
        
        const eastWall = MeshBuilder.CreateBox("wall_east", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        eastWall.position.x = arenaHalf;
        eastWall.position.y = wallHeight / 2;
        eastWall.position.z = 0;
        
        const westWall = MeshBuilder.CreateBox("wall_west", {
            width: wallThickness,
            height: wallHeight,
            depth: this.config.arenaSize
        }, chunkParent.getScene());
        westWall.position.x = -arenaHalf;
        westWall.position.y = wallHeight / 2;
        westWall.position.z = 0;
        
        // Материал стен
        const wallMaterial = new StandardMaterial("wall_material", chunkParent.getScene());
        wallMaterial.diffuseColor = new Color3(0.6, 0.55, 0.5);
        wallMaterial.specularColor = new Color3(0.2, 0.2, 0.2);
        northWall.material = wallMaterial;
        southWall.material = wallMaterial;
        eastWall.material = wallMaterial;
        westWall.material = wallMaterial;
        
        // Физика для всех стен
        [northWall, southWall, eastWall, westWall].forEach(wall => {
            const physicsAggregate = new PhysicsAggregate(
                wall,
                PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.1 },
                chunkParent.getScene()
            );
            physicsAggregate.body.setMassProperties({ mass: 0 });
        });
    }
}

