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
 * Информация о коллайдере для отложенного создания физики
 */
interface PendingCollider {
    position: Vector3;
    width: number;
    height: number;
    depth: number;
}

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

    // ОПТИМИЗАЦИЯ: Mesh merging - сбор мешей для последующего объединения
    /** Меши для объединения, сгруппированные по материалу */
    protected pendingMeshes: Map<string, Mesh[]> = new Map();
    /** Информация о коллайдерах для создания после объединения */
    protected pendingColliders: PendingCollider[] = [];

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
     * Проверить, доступна ли физика в сцене
     */
    protected hasPhysics(): boolean {
        const scene = this.scene;
        // Проверяем, что физика включена и явно не помечена как недоступная
        if (!scene.physicsEnabled) {
            return false;
        }
        // Если флаг __physicsAvailable установлен явно, используем его
        if ((scene as any).__physicsAvailable !== undefined) {
            return (scene as any).__physicsAvailable === true;
        }
        // По умолчанию считаем, что если physicsEnabled = true, то физика доступна
        return true;
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
     * Проверить, попадает ли элемент в текущий чанк
     * @param worldX - Мировая X координата элемента
     * @param worldZ - Мировая Z координата элемента
     * @param elementSize - Размер элемента (радиус или половина размера)
     * @param context - Контекст генерации чанка
     */
    protected isElementInChunk(
        worldX: number,
        worldZ: number,
        elementSize: number,
        context: ChunkGenerationContext
    ): boolean {
        const { worldX: chunkWorldX, worldZ: chunkWorldZ, size } = context;
        const chunkMinX = chunkWorldX;
        const chunkMaxX = chunkWorldX + size;
        const chunkMinZ = chunkWorldZ;
        const chunkMaxZ = chunkWorldZ + size;

        const elementMinX = worldX - elementSize;
        const elementMaxX = worldX + elementSize;
        const elementMinZ = worldZ - elementSize;
        const elementMaxZ = worldZ + elementSize;

        return !(chunkMaxX < elementMinX || chunkMinX > elementMaxX ||
            chunkMaxZ < elementMinZ || chunkMinZ > elementMaxZ);
    }

    /**
     * Получить детерминированный SeededRandom на основе world координат
     * Используется для создания одинаковых элементов в разных чанках
     * @param worldX - Мировая X координата
     * @param worldZ - Мировая Z координата
     * @param baseSeed - Базовый seed (опционально)
     */
    protected getDeterministicRandom(worldX: number, worldZ: number, baseSeed: number = 0): SeededRandom {
        const seed = Math.floor(worldX * 1000 + worldZ * 100 + baseSeed);
        return new SeededRandom(seed);
    }

    /**
     * Универсальный метод для детерминированной генерации элементов на сетке
     * @param context - Контекст генерации чанка
     * @param spacing - Расстояние между элементами на сетке
     * @param elementSize - Размер элемента (радиус)
     * @param density - Плотность (0-1), вероятность создания элемента
     * @param callback - Функция создания элемента (worldX, worldZ, localRandom, localX, localZ)
     * @param baseSeed - Базовый seed для random
     */
    protected generateOnGrid(
        context: ChunkGenerationContext,
        spacing: number,
        elementSize: number,
        density: number,
        callback: (worldX: number, worldZ: number, localRandom: SeededRandom, localX: number, localZ: number) => void,
        baseSeed: number = 0
    ): void {
        const { worldX, worldZ, size } = context;
        const chunkMinX = worldX;
        const chunkMaxX = worldX + size;
        const chunkMinZ = worldZ;
        const chunkMaxZ = worldZ + size;

        const startGridX = Math.floor(chunkMinX / spacing) * spacing;
        const startGridZ = Math.floor(chunkMinZ / spacing) * spacing;

        for (let gridX = startGridX; gridX < chunkMaxX + spacing; gridX += spacing) {
            for (let gridZ = startGridZ; gridZ < chunkMaxZ + spacing; gridZ += spacing) {
                if (!this.isElementInChunk(gridX, gridZ, elementSize / 2, context)) continue;

                const localRandom = this.getDeterministicRandom(gridX, gridZ, baseSeed);
                if (!localRandom.chance(density)) continue;

                const localX = gridX - worldX;
                const localZ = gridZ - worldZ;

                callback(gridX, gridZ, localRandom, localX, localZ);
            }
        }
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
     * @param deferMerge - ОПТИМИЗАЦИЯ: Отложить объединение мешей (true = собрать для merge, false = создать сразу)
     */
    protected createBox(
        name: string,
        options: { width: number; height: number; depth: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode,
        addPhysics: boolean = true,
        deferMerge: boolean = false
    ): Mesh {
        const box = MeshBuilder.CreateBox(name, options, this.scene);
        box.position = position;

        const matName = typeof material === "string" ? material : material.name;
        box.material = typeof material === "string" ? this.getMat(material) : material;
        box.parent = parent;

        if (deferMerge) {
            // ОПТИМИЗАЦИЯ: Собираем меши для последующего объединения
            if (!this.pendingMeshes.has(matName)) {
                this.pendingMeshes.set(matName, []);
            }
            this.pendingMeshes.get(matName)!.push(box);

            // Сохраняем информацию о коллайдере для создания после merge
            if (addPhysics) {
                this.pendingColliders.push({
                    position: position.clone(),
                    width: options.width,
                    height: options.height,
                    depth: options.depth
                });
            }
            // НЕ создаём физику сейчас - она будет создана в mergePendingMeshes
        } else {
            // Стандартное поведение - создаём физику сразу (только если доступна)
            if (addPhysics && this.hasPhysics()) {
                try {
                    new PhysicsAggregate(box, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, this.scene);
                } catch (error) {
                    console.warn("[BaseMapGenerator] Failed to create physics for box:", error);
                }
            }
            box.freezeWorldMatrix();
        }

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

        if (addPhysics && this.hasPhysics()) {
            try {
                new PhysicsAggregate(cylinder, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.5 }, this.scene);
            } catch (error) {
                console.warn("[BaseMapGenerator] Failed to create physics for cylinder:", error);
            }
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

        if (addPhysics && this.hasPhysics()) {
            try {
                new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, { mass: 0, friction: 0.5 }, this.scene);
            } catch (error) {
                console.warn("[BaseMapGenerator] Failed to create physics for sphere:", error);
            }
        }

        sphere.freezeWorldMatrix();
        return sphere;
    }

    /**
     * Создать плоскость (ground)
     * @param addPhysics - Добавить физику для коллизии (по умолчанию true)
     */
    protected createGround(
        name: string,
        options: { width: number; height: number },
        position: Vector3,
        material: StandardMaterial | string,
        parent: TransformNode,
        addPhysics: boolean = true
    ): Mesh {
        const ground = MeshBuilder.CreateGround(name, options, this.scene);
        ground.position = position;
        ground.material = typeof material === "string" ? this.getMat(material) : material;
        ground.parent = parent;
        ground.freezeWorldMatrix();

        if (addPhysics && this.hasPhysics()) {
            try {
                new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, this.scene);
            } catch (error) {
                console.warn("[BaseMapGenerator] Failed to create physics for ground:", error);
            }
        }

        return ground;
    }

    /**
     * ОПТИМИЗАЦИЯ: Объединить накопленные меши в один меш на материал
     * Вызывать в конце generateContent() для уменьшения draw calls
     * @param parent - Родительский узел для объединённых мешей
     */
    protected mergePendingMeshes(parent: TransformNode): void {
        // Объединяем меши по материалам
        for (const [matName, meshes] of this.pendingMeshes) {
            if (meshes.length === 0) continue;

            if (meshes.length === 1) {
                // Один меш - просто замораживаем
                meshes[0]!.freezeWorldMatrix();
                continue;
            }

            // Объединяем все меши с одинаковым материалом
            try {
                const merged = Mesh.MergeMeshes(
                    meshes,
                    true,  // disposeSource - удалить исходные меши
                    true,  // allow32BitsIndices
                    undefined, // parent - установим позже
                    false, // subdivideWithSubMeshes
                    true   // multiMultiMaterials
                );

                if (merged) {
                    merged.name = `merged_${matName}`;
                    merged.parent = parent;
                    merged.material = this.getMat(matName);
                    merged.freezeWorldMatrix();
                    merged.doNotSyncBoundingInfo = true;
                    merged.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
                }
            } catch (e) {
                // Если merge не удался, просто замораживаем исходные меши
                console.warn(`[BaseMapGenerator] Failed to merge meshes for material ${matName}:`, e);
                for (const mesh of meshes) {
                    mesh.freezeWorldMatrix();
                }
            }
        }

        // Создаём невидимые коллайдеры для физики
        for (let i = 0; i < this.pendingColliders.length; i++) {
            const col = this.pendingColliders[i]!;
            const collider = MeshBuilder.CreateBox(`collider_${i}`, {
                width: col.width,
                height: col.height,
                depth: col.depth
            }, this.scene);
            collider.position = col.position;
            collider.isVisible = false;
            collider.parent = parent;
            // Создаем физику только если доступна
            if (this.hasPhysics()) {
                try {
                    new PhysicsAggregate(collider, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, this.scene);
                } catch (error) {
                    console.warn("[BaseMapGenerator] Failed to create physics for merged collider:", error);
                }
            }
        }

        // Очищаем списки
        this.pendingMeshes.clear();
        this.pendingColliders = [];
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
     * УЛУЧШЕНО: Создать группу объектов с вариациями размера и позиции
     * @param count - Количество объектов
     * @param createFn - Функция создания объекта
     * @param context - Контекст генерации
     * @param minDistance - Минимальное расстояние между объектами
     */
    protected createObjectGroup<T>(
        count: number,
        createFn: (pos: Vector3, random: SeededRandom) => T,
        context: ChunkGenerationContext,
        minDistance: number = 5
    ): T[] {
        const objects: T[] = [];
        const positions = this.generatePositions(
            count,
            context.size,
            2,
            minDistance,
            context.random,
            context.chunkX,
            context.chunkZ,
            context.size
        );

        for (const pos of positions) {
            const worldPos = new Vector3(
                pos.x - context.size / 2,
                this.getTerrainHeight(context.worldX + pos.x, context.worldZ + pos.z, context.biome),
                pos.z - context.size / 2
            );
            objects.push(createFn(worldPos, context.random));
        }

        return objects;
    }

    /**
     * УЛУЧШЕНО: Создать объект с случайным поворотом
     * @param mesh - Меш для поворота
     * @param random - Генератор случайных чисел
     * @param allowFullRotation - Разрешить полный поворот (360°) или только 90° шаги
     */
    protected applyRandomRotation(mesh: Mesh, random: SeededRandom, allowFullRotation: boolean = false): void {
        if (allowFullRotation) {
            mesh.rotation.y = random.range(0, Math.PI * 2);
        } else {
            const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
            mesh.rotation.y = random.pick(angles);
        }
    }

    /**
     * УЛУЧШЕНО: Создать объект с вариацией размера
     * @param baseSize - Базовый размер
     * @param variation - Вариация (0.0 - 1.0)
     * @param random - Генератор случайных чисел
     */
    protected getVariedSize(baseSize: number, variation: number, random: SeededRandom): number {
        return baseSize * (1 + random.range(-variation, variation));
    }

    /**
     * УЛУЧШЕНО: Проверить, можно ли разместить объект в позиции
     * @param x - Мировая X координата
     * @param z - Мировая Z координата
     * @param radius - Радиус объекта
     */
    protected canPlaceObject(x: number, z: number, radius: number): boolean {
        if (this.isPositionInGarageArea(x, z, radius)) {
            return false;
        }
        if (this.isPositionNearRoad(x, z, radius)) {
            return false;
        }
        return true;
    }

    /**
     * УЛУЧШЕНО: Создать материал с вариацией цвета
     * @param baseColor - Базовый цвет
     * @param variation - Вариация цвета (0.0 - 1.0)
     * @param random - Генератор случайных чисел
     */
    protected createVariedMaterial(
        name: string,
        baseColor: Color3,
        variation: number,
        random: SeededRandom
    ): StandardMaterial {
        const r = Math.max(0, Math.min(1, baseColor.r + random.range(-variation, variation)));
        const g = Math.max(0, Math.min(1, baseColor.g + random.range(-variation, variation)));
        const b = Math.max(0, Math.min(1, baseColor.b + random.range(-variation, variation)));
        return this.createMaterial(name, new Color3(r, g, b));
    }

    /**
     * УЛУЧШЕНО: Создать LOD группу объектов (разные уровни детализации)
     * @param nearObjects - Объекты для близкого расстояния
     * @param farObjects - Объекты для дальнего расстояния
     * @param distance - Расстояние переключения LOD
     */
    protected createLODGroup(
        nearObjects: Mesh[],
        farObjects: Mesh[],
        distance: number = 100
    ): { near: Mesh[]; far: Mesh[]; distance: number } {
        return { near: nearObjects, far: farObjects, distance };
    }

    /**
     * Create a cylinder or cone/pyramid
     */
    protected createCylinder(
        name: string,
        size: { height: number, diameterTop: number, diameterBottom: number, tessellation?: number },
        position: Vector3,
        material: Material,
        parent: TransformNode,
        addPhysics: boolean = true,
        deferMerge: boolean = false
    ): Mesh {
        const mesh = MeshBuilder.CreateCylinder(name, {
            height: size.height,
            diameterTop: size.diameterTop,
            diameterBottom: size.diameterBottom,
            tessellation: size.tessellation || 24
        }, this.scene);

        mesh.position = position;
        mesh.material = material;
        mesh.parent = parent;
        mesh.receiveShadows = true;

        if (addPhysics) {
            // Use cylinder shape or hull
            // Note: PhysicsShapeType.CYLINDER fits best
            this.addPhysicsIfAvailable(mesh, PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.1 });
        }

        if (deferMerge && this.useMergeMeshes) {
            this.pendingMeshes.push(mesh);
        }

        return mesh;
    }

    /**
     * Create a prism (triangular or other polygon extrusion) via Cylinder
     */
    protected createPrism(
        name: string,
        size: { height: number, width: number, depth: number }, // Width/Depth approx
        position: Vector3,
        material: Material,
        parent: TransformNode,
        addPhysics: boolean = true,
        deferMerge: boolean = false
    ): Mesh {
        // A triangular prism can be made with a cylinder of tessellation 3
        const diameter = Math.max(size.width, size.depth);
        const mesh = MeshBuilder.CreateCylinder(name, {
            height: size.height,
            diameter: diameter,
            tessellation: 3
        }, this.scene);

        // Rotating it to sit flat requires adjustment, but default cylinder stands up.
        // Roofs usually lay horizontal? No, a roof on top of a box stands up (pointy top).
        // Cylinder orientation: Y is up (height).
        // So a prism roof (like a tent) needs to be rotated.
        // But for <pyramid> roofs, we want Y up.
        // For standard "house" roof (wedge), we want a triangular prism lying down?
        // Let's create a generic 'Prism' standing up (triangular tower).

        mesh.position = position;
        mesh.material = material;
        mesh.parent = parent;

        if (addPhysics) {
            this.addPhysicsIfAvailable(mesh, PhysicsShapeType.CONVEX_HULL, { mass: 0 });
        }

        if (deferMerge && this.useMergeMeshes) {
            this.pendingMeshes.push(mesh);
        }

        return mesh;
    }

    /**
     * Безопасное добавление физики к мешу
     * @param mesh - Меш для добавления физики
     * @param shapeType - Тип формы физического тела
     * @param options - Параметры физики
     */
    protected addPhysicsIfAvailable(mesh: TransformNode, shapeType: PhysicsShapeType, options: any): void {
        if (this.hasPhysics()) {
            try {
                // Ensure Mesh is valid
                if (mesh instanceof Mesh) {
                    new PhysicsAggregate(mesh, shapeType, options, this.scene);
                }
            } catch (e) {
                console.warn("[BaseMapGenerator] Physics creation failed:", e);
            }
        }
    }

    /**
     * Основной метод генерации контента чанка
     * Должен быть реализован в конкретных генераторах
     */
    abstract generateContent(context: ChunkGenerationContext): void;
}

export default BaseMapGenerator;

