/**
 * CustomMapLoader - Загрузчик пользовательских карт из PolyGenStudio
 * 
 * Этот модуль отвечает за:
 * 1. Загрузку данных карты из localStorage
 * 2. Создание мешей для всех объектов
 * 3. Добавление физики к объектам
 * 
 * ВАЖНО: Custom карты должны быть ПОЛНОСТЬЮ пустыми изначально!
 * Никакого процедурного контента - только объекты из редактора.
 */

import { Scene, Vector3, Vector2, Mesh, MeshBuilder, StandardMaterial, Color3, TransformNode, GroundMesh, PolygonMeshBuilder } from "@babylonjs/core";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";
import earcut from "earcut";
import { EnemyTank } from "./enemyTank"; // [Opus 4.6] Added missing import
import { logger } from "./utils/logger";

/** Интерфейс для объекта из карты */
interface PlacedObject {
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
    properties?: {
        color?: string;
        name?: string;
        hasCollision?: boolean;
    };
    // Polygon support for Real World Generator buildings/roads
    polygon?: { x: number; y: number; z: number }[];
    height?: number;
    isPolygon?: boolean;
}

/** Интерфейс данных карты */
interface CustomMapData {
    version: number;
    name: string;
    mapType: string;
    placedObjects: PlacedObject[];
    triggers?: any[];
    metadata?: any;
}

/** Результат загрузки карты */
export interface LoadResult {
    success: boolean;
    objectsCreated: number;
    error?: string;
}

/**
 * Класс загрузчика custom карт
 */
export class CustomMapLoader {
    private scene: Scene;
    private createdMeshes: Mesh[] = [];
    private parentNode: TransformNode;

    constructor(scene: Scene) {
        this.scene = scene;
        this.parentNode = new TransformNode("customMapObjects", scene);
    }

    /**
     * Загрузить и создать объекты из localStorage
     */
    public loadFromLocalStorage(): LoadResult {
        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapLoader] === LOADING CUSTOM MAP ===");
        }

        // Очищаем предыдущие объекты
        this.clearAllObjects();

        try {
            // Читаем данные из localStorage
            const mapDataStr = localStorage.getItem('selectedCustomMapData');

            if (!mapDataStr) {
                if (process.env.NODE_ENV === 'development') {
                    logger.warn("[CustomMapLoader] No map data in localStorage (selectedCustomMapData)");
                }
                return { success: false, objectsCreated: 0, error: "No map data in localStorage" };
            }

            const mapData: CustomMapData = JSON.parse(mapDataStr);
            // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                logger.log(`[CustomMapLoader] Map: "${mapData.name}", Version: ${mapData.version}`);
                logger.log(`[CustomMapLoader] Objects to load: ${mapData.placedObjects?.length || 0}`);
            }

            if (!mapData.placedObjects || mapData.placedObjects.length === 0) {
                logger.warn("[CustomMapLoader] Map has no objects");
                return { success: true, objectsCreated: 0 };
            }

            // Создаём объекты
            let created = 0;
            for (const obj of mapData.placedObjects) {
                try {
                    const mesh = this.createObject(obj);
                    if (mesh) {
                        this.createdMeshes.push(mesh);
                        created++;
                    }
                } catch (e) {
                    logger.error(`[CustomMapLoader] Failed to create object ${obj.id}:`, e);
                }
            }

            // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                logger.log(`[CustomMapLoader] ✅ Created ${created}/${mapData.placedObjects.length} objects`);
            }
            return { success: true, objectsCreated: created };

        } catch (e) {
            logger.error("[CustomMapLoader] Failed to load map:", e);
            return { success: false, objectsCreated: 0, error: String(e) };
        }
    }



    /**
     * Создать один объект
     */
    private createObject(obj: PlacedObject): Mesh | null {
        // Handle Enemy Spawning
        if (obj.type === 'enemy_tank' || obj.type === 'enemy_turret' || obj.type === 'npc') {
            const game = (window as any).gameInstance;
            if (game && game.soundManager && game.effectsManager) {
                const pos = new Vector3(obj.position.x, obj.position.y || 2, obj.position.z);
                try {
                    // Spawn EnemyTank
                    const enemy = new EnemyTank(
                        this.scene,
                        pos,
                        game.soundManager,
                        game.effectsManager,
                        "medium", // Default difficulty
                        1
                    );

                    // If turret, maybe disable movement? (Need to check EnemyTank API)
                    if (obj.type === 'enemy_turret') {
                        // Assuming we can lock it or it's just a visual distinction for now
                        // enemy.immobilize(); // Hypothetical method
                    }

                    logger.log(`[CustomMapLoader] Spawned enemy ${obj.type} at ${pos}`);

                    // Return chassis mesh for tracking
                    if (enemy.chassis) {
                        enemy.chassis.metadata = { ...enemy.chassis.metadata, customMapObject: true };
                        return enemy.chassis;
                    }
                } catch (e) {
                    logger.error(`[CustomMapLoader] Failed to spawn enemy:`, e);
                }
            }
            return null; // Logic handled, or failed
        }

        // Handle Triggers (Zones)
        if (obj.type.startsWith('zone_')) {
            const scale = obj.scale || { x: 1, y: 1, z: 1 };
            const pos = obj.position || { x: 0, y: 0, z: 0 };
            const meshName = `trigger_${obj.type}_${obj.id}`;

            const mesh = MeshBuilder.CreateBox(meshName, {
                width: scale.x,
                height: scale.y,
                depth: scale.z
            }, this.scene);

            mesh.position = new Vector3(pos.x, pos.y, pos.z);
            mesh.visibility = 0.3; // Semi-transparent for debug, or 0 for invisible game

            const mat = new StandardMaterial(`triggerMat_${obj.id}`, this.scene);
            if (obj.type === 'zone_damage') mat.diffuseColor = new Color3(1, 0, 0);
            else if (obj.type === 'zone_heal') mat.diffuseColor = new Color3(0, 1, 0);
            else if (obj.type === 'zone_teleport') mat.diffuseColor = new Color3(0, 0.5, 1);
            else mat.diffuseColor = new Color3(1, 1, 0);

            mat.alpha = 0.3;
            mesh.material = mat;

            // Trigger Logic Metadata
            mesh.metadata = {
                isTrigger: true,
                triggerType: obj.type.replace('zone_', ''),
                customMapObject: true
            };

            // Add to scene triggers list? 
            // relying on metadata scanning for now.

            return mesh;
        }

        // ... existing legacy object creation ...
        // Позиция
        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const rot = obj.rotation || { x: 0, y: 0, z: 0 };
        const colorHex = obj.properties?.color || '#808080';
        const color = this.parseColor(colorHex);
        const meshName = `customObj_${obj.id}`;

        let mesh: Mesh;

        // SIMPLIFIED: Всегда используем BOX для надёжности
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        const width = Math.max(0.5, scale.x);
        const height = Math.max(0.5, scale.y);
        const depth = Math.max(0.5, scale.z);

        mesh = MeshBuilder.CreateBox(meshName, {
            width: width,
            height: height,
            depth: depth
        }, this.scene);

        // Позиция уже включает правильный Y offset из экспортёра
        mesh.position = new Vector3(pos.x, pos.y, pos.z);


        // Поворот (в радианах)
        mesh.rotation = new Vector3(
            (rot.x || 0) * Math.PI / 180,
            (rot.y || 0) * Math.PI / 180,
            (rot.z || 0) * Math.PI / 180
        );

        // Материал
        const mat = new StandardMaterial(`customMat_${obj.id}`, this.scene);
        mat.diffuseColor = color;
        mat.specularColor = new Color3(0.1, 0.1, 0.1);
        mesh.material = mat;

        // Привязываем к родительскому узлу
        mesh.parent = this.parentNode;

        // Физика (статический объект) - используем MESH для polygon
        if (obj.properties?.hasCollision !== false) {
            try {
                const physicsType = obj.isPolygon ? PhysicsShapeType.MESH : PhysicsShapeType.BOX;
                new PhysicsAggregate(mesh, physicsType, {
                    mass: 0,
                    friction: 0.5,
                    restitution: 0.1
                }, this.scene);
            } catch (e) {
                logger.warn(`[CustomMapLoader] Physics failed for ${obj.id}:`, e);
            }
        }

        // Метаданные
        mesh.metadata = {
            customMapObject: true,
            objectId: obj.id,
            objectType: obj.type,
            objectName: obj.properties?.name || obj.id,
            isPolygon: obj.isPolygon || false
        };

        return mesh;
    }

    /**
     * Парсинг hex цвета в Color3
     */
    private parseColor(hex: string): Color3 {
        try {
            const cleanHex = hex.replace('#', '');
            const colorVal = parseInt(cleanHex, 16);
            const r = ((colorVal >> 16) & 255) / 255;
            const g = ((colorVal >> 8) & 255) / 255;
            const b = (colorVal & 255) / 255;
            return new Color3(r, g, b);
        } catch {
            return new Color3(0.5, 0.5, 0.5); // Серый по умолчанию
        }
    }


    /**
     * Очистить все созданные объекты
     */
    public clearAllObjects(): void {
        logger.log(`[CustomMapLoader] Clearing ${this.createdMeshes.length} own objects`);

        for (const mesh of this.createdMeshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.dispose();
            }
        }
        this.createdMeshes = [];
    }

    /**
     * Очистить ВСЕ меши в сцене (кроме танка, UI и камеры)
     * Вызывается перед загрузкой custom карты чтобы убрать ВСЕ процедурные объекты
     */
    public clearAllSceneMeshes(): void {
        logger.log(`[CustomMapLoader] === CLEARING ALL SCENE MESHES ===`);

        // Список имён мешей которые НЕ удалять
        const protectedNames = [
            'tank', 'hull', 'turret', 'barrel', 'gun',  // Танк
            'track', 'wheel', 'suspension',              // Гусеницы
            'camera', 'light', 'skybox',                 // Камера и свет
            'customMapFloor', 'customObj_',              // Наши объекты (пол и custom)
            'hud', 'ui', 'gui',                          // UI элементы
            '__root__',                                  // Корневые ноды
        ];

        const meshesToRemove: Mesh[] = [];

        for (const mesh of this.scene.meshes) {
            const name = mesh.name.toLowerCase();

            // Проверяем защищённые имена
            let isProtected = false;
            for (const prot of protectedNames) {
                if (name.includes(prot.toLowerCase())) {
                    isProtected = true;
                    break;
                }
            }

            // Если уже customObj - не удаляем (наши объекты)
            if (name.startsWith('customobj_')) {
                isProtected = true;
            }

            if (!isProtected) {
                meshesToRemove.push(mesh as Mesh);
            }
        }

        logger.log(`[CustomMapLoader] Removing ${meshesToRemove.length} scene meshes`);

        for (const mesh of meshesToRemove) {
            try {
                mesh.dispose();
            } catch (e) {
                // Ignore disposal errors
            }
        }

        logger.log(`[CustomMapLoader] Scene cleared, remaining meshes: ${this.scene.meshes.length}`);
    }

    /**
     * Создать базовую плоскую поверхность для карты
     */
    public createFloorPlane(size: number = 500, color: string = '#1a1a1a'): Mesh {
        const ground = MeshBuilder.CreateBox("customMapFloor", {
            width: size,
            height: 0.1,
            depth: size
        }, this.scene);

        const mat = new StandardMaterial("customFloorMat", this.scene);
        mat.diffuseColor = this.parseColor(color);
        mat.specularColor = new Color3(0, 0, 0);
        ground.material = mat;

        // Физика для пола
        new PhysicsAggregate(ground, PhysicsShapeType.BOX, {
            mass: 0,
            friction: 0.8
        }, this.scene);

        ground.metadata = { customMapFloor: true };

        return ground;
    }

    /**
     * Полная загрузка custom карты с полом
     */
    public loadCompleteMap(floorSize: number = 500): LoadResult {
        logger.log("[CustomMapLoader] === COMPLETE MAP LOAD ===");

        // 0. КРИТИЧНО: Очищаем ВСЕ старые меши в сцене
        this.clearAllSceneMeshes();

        // 1. Создаём пол
        this.createFloorPlane(floorSize);

        // 2. Загружаем объекты
        return this.loadFromLocalStorage();
    }

    /**
     * Получить количество созданных объектов
     */
    public getObjectCount(): number {
        return this.createdMeshes.length;
    }

    /**
     * Dispose всех ресурсов
     */
    public dispose(): void {
        this.clearAllObjects();
        if (this.parentNode) {
            this.parentNode.dispose();
        }
    }
}

/**
 * Глобальная функция для быстрой загрузки custom карты
 */
export function loadCustomMap(scene: Scene): LoadResult {
    const loader = new CustomMapLoader(scene);
    return loader.loadCompleteMap();
}
