/**
 * CustomMapRunner - Полностью изолированный запуск custom карт из PolyGenStudio
 * 
 * КРИТИЧНО: Этот модуль создаёт ПУСТУЮ сцену и добавляет ТОЛЬКО объекты из редактора!
 * Никакой процедурной генерации. Никаких зданий. Никаких гаражей.
 * 
 * Использование:
 * 1. При получении POLYGEN_TEST_MAP сообщения, вызывается CustomMapRunner.run()
 * 2. Он полностью заменяет ChunkSystem на пустую сцену
 * 3. Загружает объекты из localStorage (selectedCustomMapData)
 * 4. Спавнит танк игрока
 */

import {
    Scene,
    Vector3,
    Vector2,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Color4,
    HemisphericLight,
    DirectionalLight,
    TransformNode,
    GroundMesh
} from "@babylonjs/core";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";
import { logger } from "./utils/logger";
import earcut from "earcut";

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

/** Результат запуска карты */
export interface RunResult {
    success: boolean;
    objectsCreated: number;
    mapName: string;
    error?: string;
}

/**
 * CustomMapRunner - запускает custom карты в изолированной пустой сцене
 */
export class CustomMapRunner {
    private scene: Scene;
    private parentNode: TransformNode;
    private createdMeshes: Mesh[] = [];
    private floor: GroundMesh | null = null;
    private spawnPosition: Vector3 | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        this.parentNode = new TransformNode("CustomMapRoot", scene);

        logger.log("[CustomMapRunner] ========================================");
        logger.log("[CustomMapRunner] CUSTOM MAP RUNNER INITIALIZED");
        logger.log("[CustomMapRunner] ========================================");
    }

    /**
     * ГЛАВНАЯ ФУНКЦИЯ: Запустить custom карту
     * 1. Удаляет ВСЕ меши кроме танка/камеры
     * 2. Создаёт пустой пол
     * 3. Загружает объекты из localStorage
     */
    public run(): RunResult {
        logger.log("[CustomMapRunner] ===== STARTING CUSTOM MAP =====");

        try {
            // ШАГ 1: Очистить сцену от ВСЕГО лишнего
            this.clearScene();

            // ШАГ 2: Создать базовую среду (пол, свет)
            this.createEnvironment();

            // ШАГ 3: Загрузить объекты из редактора
            const result = this.loadEditorObjects();

            logger.log(`[CustomMapRunner] ===== CUSTOM MAP READY =====`);
            logger.log(`[CustomMapRunner] Objects created: ${result.objectsCreated}`);

            return result;

        } catch (error) {
            logger.error("[CustomMapRunner] FATAL ERROR:", error);
            return {
                success: false,
                objectsCreated: 0,
                mapName: "error",
                error: String(error)
            };
        }
    }

    /**
     * ШАГ 1: Полная очистка сцены
     * Удаляем ВСЕ кроме: танка, камеры, освещения, UI
     */
    private clearScene(): void {
        logger.log("[CustomMapRunner] Step 1: Clearing scene...");

        const protectedKeywords = [
            // Танк и его части
            'tank', 'hull', 'turret', 'barrel', 'gun', 'track', 'wheel',
            // Camera and UI
            'camera', 'light', 'skybox', 'hud', 'ui', 'gui',
            // Root nodes
            '__root__', 'node', 'transform',
            // Наши custom объекты (не удаляем свои)
            'custommaproot', 'customobj_', 'custommapfloor'
        ];

        const meshesToRemove: Mesh[] = [];

        for (const mesh of this.scene.meshes) {
            const name = mesh.name.toLowerCase();

            // Проверяем защищённые ключевые слова
            let isProtected = false;
            for (const keyword of protectedKeywords) {
                if (name.includes(keyword)) {
                    isProtected = true;
                    break;
                }
            }

            if (!isProtected) {
                meshesToRemove.push(mesh as Mesh);
            }
        }

        logger.log(`[CustomMapRunner] Removing ${meshesToRemove.length} meshes...`);

        for (const mesh of meshesToRemove) {
            try {
                mesh.dispose();
            } catch (e) {
                // Игнорируем ошибки при удалении
            }
        }

        logger.log(`[CustomMapRunner] Scene cleared. Remaining: ${this.scene.meshes.length} meshes`);
    }

    /**
     * ШАГ 2: Создать базовую среду
     * - Тёмный пол 500x500
     * - Ambient освещение
     */
    private createEnvironment(): void {
        logger.log("[CustomMapRunner] Step 2: Creating environment...");

        // Создаём большой тёмный пол
        this.floor = MeshBuilder.CreateGround("customMapFloor", {
            width: 500,
            height: 500,
            subdivisions: 1
        }, this.scene);

        const floorMat = new StandardMaterial("customFloorMat", this.scene);
        floorMat.diffuseColor = new Color3(0.1, 0.1, 0.12); // Тёмно-серый
        floorMat.specularColor = new Color3(0, 0, 0);
        this.floor.material = floorMat;

        // Физика для пола
        new PhysicsAggregate(this.floor, PhysicsShapeType.BOX, {
            mass: 0,
            friction: 0.8
        }, this.scene);

        this.floor.metadata = { customMapFloor: true, isGround: true };
        this.floor.parent = this.parentNode;

        logger.log("[CustomMapRunner] Floor created (500x500)");
    }

    /**
     * ШАГ 3: Загрузить объекты из localStorage
     */
    private loadEditorObjects(): RunResult {
        logger.log("[CustomMapRunner] Step 3: Loading editor objects...");

        // Читаем данные из localStorage
        const mapDataStr = localStorage.getItem('selectedCustomMapData');

        if (!mapDataStr) {
            logger.warn("[CustomMapRunner] No map data in localStorage!");
            return {
                success: false,
                objectsCreated: 0,
                mapName: "none",
                error: "No map data in localStorage"
            };
        }

        // ЛОГИРОВАНИЕ РАЗМЕРА ДАННЫХ
        const dataSizeKB = (mapDataStr.length / 1024).toFixed(2);
        const dataSizeMB = (mapDataStr.length / 1024 / 1024).toFixed(2);
        logger.log(`[CustomMapRunner] 📦 localStorage data: ${dataSizeKB}KB (${dataSizeMB}MB, ${mapDataStr.length} chars)`);

        let mapData: CustomMapData;
        try {
            mapData = JSON.parse(mapDataStr);
        } catch (e) {
            logger.error("[CustomMapRunner] Failed to parse map data:", e);
            return {
                success: false,
                objectsCreated: 0,
                mapName: "error",
                error: "Invalid JSON in localStorage"
            };
        }

        logger.log(`[CustomMapRunner] Map: "${mapData.name}"`);
        logger.log(`[CustomMapRunner] Objects to create: ${mapData.placedObjects?.length || 0}`);

        if (!mapData.placedObjects || mapData.placedObjects.length === 0) {
            logger.warn("[CustomMapRunner] Map has no objects!");
            return {
                success: true,
                objectsCreated: 0,
                mapName: mapData.name
            };
        }

        // Find spawn point from map objects
        const spawnObj = mapData.placedObjects.find(obj =>
            obj.type === 'spawn' ||
            obj.properties?.txType === 'spawn' ||
            (obj.properties?.name || '').toLowerCase().includes('spawn')
        );
        if (spawnObj) {
            const pos = spawnObj.position || { x: 0, y: 0, z: 0 };
            this.spawnPosition = new Vector3(pos.x, pos.y + 2, pos.z); // +2m above ground
            logger.log(`[CustomMapRunner] 🎯 Found spawn point at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
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
                logger.error(`[CustomMapRunner] Failed to create object ${obj.id}:`, e);
            }
        }

        logger.log(`[CustomMapRunner] ✅ Created ${created}/${mapData.placedObjects.length} objects`);

        return {
            success: true,
            objectsCreated: created,
            mapName: mapData.name
        };
    }

    /**
     * Создать один объект из данных редактора
     */
    private createObject(obj: PlacedObject): Mesh | null {
        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        const rot = obj.rotation || { x: 0, y: 0, z: 0 };
        const colorHex = obj.properties?.color || '#808080';

        // DEBUG: Log first 5 objects to see actual data
        if (this.createdMeshes.length < 5) {
            console.log(`[CustomMapRunner] Object #${this.createdMeshes.length + 1}: ` +
                `pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) ` +
                `scale=(${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}) ` +
                `color=${colorHex} type=${obj.type} isPolygon=${obj.isPolygon || false}`);
        }

        const meshName = `customObj_${obj.id}`;
        let mesh: Mesh;

        // Проверяем если это polygon-объект (здание/дорога из Real World Generator)
        if (obj.isPolygon && obj.polygon && obj.polygon.length >= 3) {
            try {
                // КРИТИЧНО: Сначала вычисляем ЦЕНТР полигона
                let sumX = 0, sumZ = 0;
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

                for (const v of obj.polygon) {
                    sumX += v.x;
                    sumZ += v.z;
                    if (v.x < minX) minX = v.x;
                    if (v.x > maxX) maxX = v.x;
                    if (v.z < minZ) minZ = v.z;
                    if (v.z > maxZ) maxZ = v.z;
                }

                const centerX = sumX / obj.polygon.length;
                const centerZ = sumZ / obj.polygon.length;
                const shapeWidth = maxX - minX;
                const shapeDepth = maxZ - minZ;

                // КРИТИЧНО: Конвертируем в ЛОКАЛЬНЫЕ координаты (относительно центра)
                const shape: Vector2[] = obj.polygon.map(v =>
                    new Vector2(v.x - centerX, v.z - centerZ)
                );

                // Создаём extruded polygon
                const height = obj.height || 1;
                mesh = MeshBuilder.ExtrudePolygon(meshName, {
                    shape: shape,
                    depth: height,
                    sideOrientation: Mesh.DOUBLESIDE
                }, this.scene, earcut);

                // КРИТИЧНО: Позиционируем меш В ЦЕНТРЕ полигона
                // Extrude идёт вниз по Y, поэтому сдвигаем на height
                mesh.position = new Vector3(centerX, pos.y + height, centerZ);

                console.log(`[CustomMapRunner] ✅ POLYGON: ${meshName} | ${shape.length} verts | size: ${shapeWidth.toFixed(1)}x${shapeDepth.toFixed(1)} | height: ${height} | worldPos: (${centerX.toFixed(1)}, ${centerZ.toFixed(1)})`);
            } catch (e) {
                console.warn(`[CustomMapRunner] Polygon creation failed for ${obj.id}, falling back to box:`, e);
                // Fallback to box
                mesh = MeshBuilder.CreateBox(meshName, {
                    width: Math.max(0.1, scale.x),
                    height: Math.max(0.1, scale.y),
                    depth: Math.max(0.1, scale.z)
                }, this.scene);
                mesh.position = new Vector3(pos.x, pos.y, pos.z);
            }
        } else {
            // Стандартный бокс
            mesh = MeshBuilder.CreateBox(meshName, {
                width: Math.max(0.1, scale.x),
                height: Math.max(0.1, scale.y),
                depth: Math.max(0.1, scale.z)
            }, this.scene);
            mesh.position = new Vector3(pos.x, pos.y, pos.z);
        }

        // Поворот (конвертируем градусы в радианы)
        mesh.rotation = new Vector3(
            (rot.x || 0) * Math.PI / 180,
            (rot.y || 0) * Math.PI / 180,
            (rot.z || 0) * Math.PI / 180
        );

        // Материал с цветом из редактора
        const mat = new StandardMaterial(`customMat_${obj.id}`, this.scene);
        mat.diffuseColor = this.hexToColor3(colorHex);
        mat.specularColor = new Color3(0.1, 0.1, 0.1);
        mesh.material = mat;

        // Родительский узел
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
                // Ignore physics errors
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
     * Конвертация hex цвета в Color3
     */
    private hexToColor3(hex: string): Color3 {
        try {
            const cleanHex = hex.replace('#', '');
            const colorVal = parseInt(cleanHex, 16);
            const r = ((colorVal >> 16) & 255) / 255;
            const g = ((colorVal >> 8) & 255) / 255;
            const b = (colorVal & 255) / 255;
            return new Color3(r, g, b);
        } catch {
            return new Color3(0.5, 0.5, 0.5);
        }
    }

    /**
     * Получить spawn позицию для танка
     */
    public getSpawnPosition(): Vector3 {
        // Use spawn point from map if found, otherwise center
        if (this.spawnPosition) {
            logger.log(`[CustomMapRunner] Using custom spawn: (${this.spawnPosition.x.toFixed(1)}, ${this.spawnPosition.y.toFixed(1)}, ${this.spawnPosition.z.toFixed(1)})`);
            return this.spawnPosition.clone();
        }
        // Default: center, above floor
        return new Vector3(0, 2, 0);
    }

    /**
     * Очистить все созданные объекты
     */
    public dispose(): void {
        for (const mesh of this.createdMeshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.dispose();
            }
        }
        this.createdMeshes = [];

        if (this.floor && !this.floor.isDisposed()) {
            this.floor.dispose();
            this.floor = null;
        }

        if (this.parentNode) {
            this.parentNode.dispose();
        }
    }
}

/**
 * Глобальная функция для запуска custom карты
 */
export function runCustomMap(scene: Scene): RunResult {
    const runner = new CustomMapRunner(scene);
    return runner.run();
}
