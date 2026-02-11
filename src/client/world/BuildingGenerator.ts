/**
 * @module world/BuildingGenerator
 * @description Генератор зданий
 */

import {
    Scene,
    Vector3,
    MeshBuilder,
    StandardMaterial,
    Color3,
    PhysicsAggregate,
    PhysicsShapeType,
    Mesh
} from "@babylonjs/core";
import { logger } from "../utils/logger";

/**
 * Тип здания
 */
export type BuildingType = "residential" | "industrial" | "commercial" | "military" | "ruins";

/**
 * Конфигурация здания
 */
export interface BuildingConfig {
    minWidth: number;
    maxWidth: number;
    minDepth: number;
    maxDepth: number;
    minHeight: number;
    maxHeight: number;
    hasRoof: boolean;
    destructible: boolean;
}

/**
 * Конфигурация по умолчанию для разных типов
 */
export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
    residential: {
        minWidth: 8, maxWidth: 16,
        minDepth: 8, maxDepth: 16,
        minHeight: 8, maxHeight: 24,
        hasRoof: true,
        destructible: false
    },
    industrial: {
        minWidth: 16, maxWidth: 32,
        minDepth: 16, maxDepth: 32,
        minHeight: 8, maxHeight: 16,
        hasRoof: true,
        destructible: false
    },
    commercial: {
        minWidth: 10, maxWidth: 20,
        minDepth: 10, maxDepth: 20,
        minHeight: 10, maxHeight: 30,
        hasRoof: true,
        destructible: false
    },
    military: {
        minWidth: 12, maxWidth: 24,
        minDepth: 12, maxDepth: 24,
        minHeight: 4, maxHeight: 12,
        hasRoof: true,
        destructible: false
    },
    ruins: {
        minWidth: 6, maxWidth: 16,
        minDepth: 6, maxDepth: 16,
        minHeight: 2, maxHeight: 8,
        hasRoof: false,
        destructible: true
    }
};

/**
 * Данные здания
 */
export interface BuildingData {
    mesh: Mesh;
    position: Vector3;
    width: number;
    depth: number;
    height: number;
    type: BuildingType;
    physics?: PhysicsAggregate;
}

/**
 * BuildingGenerator - Генератор зданий
 */
export class BuildingGenerator {
    private scene: Scene;
    private materials: Map<string, StandardMaterial> = new Map();
    private buildings: BuildingData[] = [];
    private idCounter = 0;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.initMaterials();
    }
    
    /**
     * Инициализация материалов
     */
    private initMaterials(): void {
        // Жилые здания
        const residentialMat = new StandardMaterial("residentialMat", this.scene);
        residentialMat.diffuseColor = new Color3(0.6, 0.55, 0.5);
        residentialMat.specularColor = Color3.Black();
        this.materials.set("residential", residentialMat);
        
        // Промышленные здания
        const industrialMat = new StandardMaterial("industrialMat", this.scene);
        industrialMat.diffuseColor = new Color3(0.4, 0.4, 0.45);
        industrialMat.specularColor = Color3.Black();
        this.materials.set("industrial", industrialMat);
        
        // Коммерческие здания
        const commercialMat = new StandardMaterial("commercialMat", this.scene);
        commercialMat.diffuseColor = new Color3(0.5, 0.5, 0.55);
        commercialMat.specularColor = Color3.Black();
        this.materials.set("commercial", commercialMat);
        
        // Военные здания
        const militaryMat = new StandardMaterial("militaryMat", this.scene);
        militaryMat.diffuseColor = new Color3(0.35, 0.4, 0.35);
        militaryMat.specularColor = Color3.Black();
        this.materials.set("military", militaryMat);
        
        // Руины
        const ruinsMat = new StandardMaterial("ruinsMat", this.scene);
        ruinsMat.diffuseColor = new Color3(0.35, 0.32, 0.3);
        ruinsMat.specularColor = Color3.Black();
        this.materials.set("ruins", ruinsMat);
    }
    
    /**
     * Создание здания
     */
    createBuilding(
        x: number,
        z: number,
        type: BuildingType,
        width?: number,
        depth?: number,
        height?: number
    ): BuildingData {
        const config = BUILDING_CONFIGS[type];
        
        // Размеры
        const w = width ?? this.randomRange(config.minWidth, config.maxWidth);
        const d = depth ?? this.randomRange(config.minDepth, config.maxDepth);
        const h = height ?? this.randomRange(config.minHeight, config.maxHeight);
        
        const id = this.idCounter++;
        
        // Основной меш
        const building = MeshBuilder.CreateBox(`building_${type}_${id}`, {
            width: w,
            height: h,
            depth: d
        }, this.scene);
        
        building.position = new Vector3(x, h / 2, z);
        building.material = this.materials.get(type)!;
        building.metadata = { type: "building", buildingType: type };
        
        // Физика
        const physics = new PhysicsAggregate(building, PhysicsShapeType.BOX, { mass: 0 }, this.scene);
        
        const data: BuildingData = {
            mesh: building,
            position: new Vector3(x, 0, z),
            width: w,
            depth: d,
            height: h,
            type,
            physics
        };
        
        this.buildings.push(data);
        
        return data;
    }
    
    /**
     * Создание ряда зданий
     */
    createBuildingRow(
        startX: number,
        startZ: number,
        count: number,
        spacing: number,
        direction: "x" | "z",
        type: BuildingType
    ): BuildingData[] {
        const buildings: BuildingData[] = [];
        
        for (let i = 0; i < count; i++) {
            const offset = i * spacing;
            const x = direction === "x" ? startX + offset : startX;
            const z = direction === "z" ? startZ + offset : startZ;
            
            buildings.push(this.createBuilding(x, z, type));
        }
        
        return buildings;
    }
    
    /**
     * Создание квартала зданий
     */
    createBlock(
        centerX: number,
        centerZ: number,
        blockWidth: number,
        blockDepth: number,
        buildingDensity: number = 0.5,
        type: BuildingType = "residential"
    ): BuildingData[] {
        const buildings: BuildingData[] = [];
        const config = BUILDING_CONFIGS[type];
        const avgSize = (config.minWidth + config.maxWidth) / 2;
        const spacing = avgSize * 1.5;
        
        const countX = Math.floor(blockWidth / spacing);
        const countZ = Math.floor(blockDepth / spacing);
        
        for (let i = 0; i < countX; i++) {
            for (let j = 0; j < countZ; j++) {
                if (Math.random() > buildingDensity) continue;
                
                const x = centerX - blockWidth / 2 + i * spacing + spacing / 2;
                const z = centerZ - blockDepth / 2 + j * spacing + spacing / 2;
                
                buildings.push(this.createBuilding(x, z, type));
            }
        }
        
        return buildings;
    }
    
    /**
     * Случайное число в диапазоне
     */
    private randomRange(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }
    
    /**
     * Получить все здания
     */
    getBuildings(): BuildingData[] {
        return this.buildings;
    }
    
    /**
     * Проверка коллизии с точкой
     */
    checkCollision(position: Vector3, radius: number = 1): BuildingData | null {
        for (const building of this.buildings) {
            const dx = Math.abs(position.x - building.position.x);
            const dz = Math.abs(position.z - building.position.z);
            
            if (dx < building.width / 2 + radius && dz < building.depth / 2 + radius) {
                return building;
            }
        }
        return null;
    }
    
    /**
     * Dispose
     */
    dispose(): void {
        for (const building of this.buildings) {
            building.mesh?.dispose();
        }
        this.buildings = [];
        
        for (const mat of this.materials.values()) {
            mat.dispose();
        }
        this.materials.clear();
        
        logger.log("[BuildingGenerator] Disposed");
    }
}

