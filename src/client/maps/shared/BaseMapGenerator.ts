/**
 * @module maps/shared/BaseMapGenerator
 * @description Базовый класс для всех генераторов карт
 * 
 * Предоставляет общую функциональность для генерации контента карт:
 * - Доступ к сцене и материалам
 * - Проверка позиций (гаражи, дороги)
 * - Общие методы создания объектов
 * 
 * @example
 * ```typescript
 * class MyMapGenerator extends BaseMapGenerator {
 *     readonly mapType = "mymap";
 *     readonly displayName = "My Map";
 *     readonly description = "Custom map";
 *     
 *     generateContent(context: ChunkGenerationContext): void {
 *         // Implementation
 *     }
 * }
 * ```
 */

import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { IMapGenerator, ChunkGenerationContext } from "./MapGenerator";
import { SeededRandom } from "./SeededRandom";
import { GenerationContext, BiomeType } from "./MapTypes";

/**
 * Базовый класс генератора карты
 * Все конкретные генераторы карт наследуются от этого класса
 */
export abstract class BaseMapGenerator implements IMapGenerator {
    /** Идентификатор типа карты */
    abstract readonly mapType: string;
    
    /** Отображаемое название карты */
    abstract readonly displayName: string;
    
    /** Описание карты */
    abstract readonly description: string;
    
    /** Контекст генерации с доступом к общим ресурсам */
    protected generationContext: GenerationContext | null = null;
    
    /**
     * Инициализирует генератор с контекстом
     * @param context - Контекст генерации с общими ресурсами
     */
    initialize(context: GenerationContext): void {
        this.generationContext = context;
    }
    
    /**
     * Получить сцену
     */
    protected get scene(): Scene {
        if (!this.generationContext) {
            throw new Error("Generator not initialized. Call initialize() first.");
        }
        return this.generationContext.scene;
    }
    
    /**
     * Получить материал по имени
     * @param name - Имя материала
     */
    protected getMat(name: string): StandardMaterial {
        if (!this.generationContext) {
            throw new Error("Generator not initialized");
        }
        return this.generationContext.getMat(name);
    }
    
    /**
     * Проверить, находится ли позиция в зоне гаража
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     * @param margin - Отступ от границы гаража
     */
    protected isPositionInGarageArea(x: number, z: number, margin: number = 0): boolean {
        if (!this.generationContext) return false;
        return this.generationContext.isPositionInGarageArea(x, z, margin);
    }
    
    /**
     * Проверить, находится ли позиция рядом с дорогой
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     * @param distance - Максимальное расстояние до дороги
     */
    protected isPositionNearRoad(x: number, z: number, distance: number = 5): boolean {
        if (!this.generationContext) return false;
        return this.generationContext.isPositionNearRoad(x, z, distance);
    }
    
    /**
     * Получить высоту рельефа в точке
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     * @param biome - Тип биома
     */
    protected getTerrainHeight(x: number, z: number, biome: string): number {
        if (!this.generationContext) return 0;
        return this.generationContext.getTerrainHeight(x, z, biome);
    }
    
    /**
     * Создать простой бокс с физикой
     * @param name - Имя меша
     * @param options - Параметры бокса (width, height, depth)
     * @param position - Позиция в локальных координатах чанка
     * @param material - Материал или имя материала
     * @param parent - Родительский узел
     * @param addPhysics - Добавить физику
     */
    protected createBox(
        name: string,
        options: { width: number; height: number; depth: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode,
        addPhysics: boolean = true
    ): Mesh {
        const box = MeshBuilder.CreateBox(name, options, this.scene);
        box.position = position;
        box.material = typeof material === "string" ? this.getMat(material) : material;
        box.parent = parent;
        
        if (addPhysics) {
            new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, this.scene);
        }
        
        box.freezeWorldMatrix();
        return box;
    }
    
    /**
     * Создать цилиндр с физикой
     */
    protected createCylinder(
        name: string,
        options: { diameter?: number; diameterTop?: number; diameterBottom?: number; height: number; tessellation?: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode,
        addPhysics: boolean = true
    ): Mesh {
        const cylinder = MeshBuilder.CreateCylinder(name, options, this.scene);
        cylinder.position = position;
        cylinder.material = typeof material === "string" ? this.getMat(material) : material;
        cylinder.parent = parent;
        
        if (addPhysics) {
            new PhysicsAggregate(cylinder, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.5 }, this.scene);
        }
        
        cylinder.freezeWorldMatrix();
        return cylinder;
    }
    
    /**
     * Создать сферу
     */
    protected createSphere(
        name: string,
        options: { diameter: number; segments?: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode,
        addPhysics: boolean = false
    ): Mesh {
        const sphere = MeshBuilder.CreateSphere(name, options, this.scene);
        sphere.position = position;
        sphere.material = typeof material === "string" ? this.getMat(material) : material;
        sphere.parent = parent;
        
        if (addPhysics) {
            new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, { mass: 0, friction: 0.5 }, this.scene);
        }
        
        sphere.freezeWorldMatrix();
        return sphere;
    }
    
    /**
     * Создать плоскость (ground)
     */
    protected createGround(
        name: string,
        options: { width: number; height: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode
    ): Mesh {
        const ground = MeshBuilder.CreateGround(name, options, this.scene);
        ground.position = position;
        ground.material = typeof material === "string" ? this.getMat(material) : material;
        ground.parent = parent;
        ground.freezeWorldMatrix();
        return ground;
    }
    
    /**
     * Создать материал с заданным цветом
     */
    protected createMaterial(name: string, color: Color3, emissive?: Color3): StandardMaterial {
        const mat = new StandardMaterial(name, this.scene);
        mat.diffuseColor = color;
        if (emissive) {
            mat.emissiveColor = emissive;
        }
        mat.freeze();
        return mat;
    }
    
    /**
     * Генерировать случайные позиции с минимальным расстоянием между объектами
     * @param count - Количество позиций
     * @param size - Размер области
     * @param margin - Отступ от краёв
     * @param minDistance - Минимальное расстояние между объектами
     * @param random - Генератор случайных чисел
     * @param chunkX - X координата чанка
     * @param chunkZ - Z координата чанка
     * @param chunkSize - Размер чанка
     */
    protected generatePositions(
        count: number,
        size: number,
        margin: number,
        minDistance: number,
        random: SeededRandom,
        chunkX: number,
        chunkZ: number,
        chunkSize: number
    ): Array<{ x: number; z: number }> {
        const positions: Array<{ x: number; z: number }> = [];
        const maxAttempts = count * 10;
        let attempts = 0;
        
        while (positions.length < count && attempts < maxAttempts) {
            attempts++;
            const x = random.range(margin, size - margin);
            const z = random.range(margin, size - margin);
            
            // Check world position for garage
            const worldX = chunkX * chunkSize + x;
            const worldZ = chunkZ * chunkSize + z;
            
            if (this.isPositionInGarageArea(worldX, worldZ, minDistance)) {
                continue;
            }
            
            // Check distance from other positions
            let tooClose = false;
            for (const pos of positions) {
                const dx = x - pos.x;
                const dz = z - pos.z;
                if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                positions.push({ x, z });
            }
        }
        
        return positions;
    }
    
    /**
     * Основной метод генерации контента чанка
     * Должен быть реализован в конкретных генераторах
     */
    abstract generateContent(context: ChunkGenerationContext): void;
}

export default BaseMapGenerator;

