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
    GroundMesh,
    DynamicTexture
} from "@babylonjs/core";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";
import { logger } from "./utils/logger";
import { EnemyTank } from "./enemyTank";
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
        txType?: string;
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
    // ОПТИМИЗАЦИЯ: Кэш материалов по цвету для уменьшения draw calls
    private materialCache: Map<string, StandardMaterial> = new Map();

    constructor(scene: Scene) {
        this.scene = scene;
        this.parentNode = new TransformNode("CustomMapRoot", scene);

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] CUSTOM MAP RUNNER INITIALIZED");
        }
    }

    /**
     * ГЛАВНАЯ ФУНКЦИЯ: Запустить custom карту
     * 1. Удаляет ВСЕ меши кроме танка/камеры (если не skipClear)
     * 2. Создаёт пустой пол (если не skipEnvironment)
     * 3. Загружает объекты из localStorage или переданных данных
     */
    public run(mapData?: CustomMapData, options?: { skipClear?: boolean; skipEnvironment?: boolean }): RunResult {
        const { skipClear = false, skipEnvironment = false } = options || {};

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] ===== STARTING CUSTOM MAP =====");
        }

        try {
            // ШАГ 1: Очистить сцену от ВСЕГО лишнего (если нужно)
            if (!skipClear) {
                this.clearScene();
            }

            // ШАГ 2: Создать базовую среду - пол, свет (если нужно)
            if (!skipEnvironment) {
                this.createEnvironment();
            }

            // ШАГ 3: Загрузить объекты
            const result = this.loadEditorObjects(mapData);

            // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                logger.log(`[CustomMapRunner] ===== CUSTOM MAP READY =====`);
                logger.log(`[CustomMapRunner] Objects created: ${result.objectsCreated}`);
            }

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
        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] Step 1: Clearing scene...");
        }

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

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log(`[CustomMapRunner] Removing ${meshesToRemove.length} meshes...`);
        }

        for (const mesh of meshesToRemove) {
            try {
                mesh.dispose();
            } catch (e) {
                // Игнорируем ошибки при удалении
            }
        }

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log(`[CustomMapRunner] Scene cleared. Remaining: ${this.scene.meshes.length} meshes`);
        }
    }

    /**
     * ШАГ 2: Создать базовую среду
     * - Чёрный пол с зелёной wireframe сеткой
     * - Ambient освещение
     */
    private createEnvironment(): void {
        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] Step 2: Creating environment with wireframe grid...");
        }

        // Создаём чёрный пол
        this.floor = MeshBuilder.CreateBox("customMapFloor", {
            width: 1000,
            height: 0.1,
            depth: 1000
        }, this.scene);

        const floorMat = new StandardMaterial("customFloorMat", this.scene);
        floorMat.diffuseColor = new Color3(0.02, 0.02, 0.02); // Почти чёрный
        floorMat.specularColor = new Color3(0, 0, 0);
        floorMat.emissiveColor = new Color3(0, 0, 0);
        this.floor.material = floorMat;

        // Физика для пола
        new PhysicsAggregate(this.floor, PhysicsShapeType.BOX, {
            mass: 0,
            friction: 0.8
        }, this.scene);

        this.floor.metadata = { customMapFloor: true, isGround: true };
        this.floor.parent = this.parentNode;

        // Создаём 3D wireframe сетку - яркая зелёная
        this.createWireframeGrid();

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] Floor created with green wireframe grid");
        }
    }

    /**
     * Создать 3D wireframe сетку - яркая зелёная в стиле киберпанк
     */
    private createWireframeGrid(): void {
        const gridSize = 1000;
        const cellSize = 25; // Меньше = больше линий
        const gridY = 0.05;
        const halfSize = gridSize / 2;
        const linePoints: Vector3[][] = [];

        // Горизонтальные линии
        for (let z = -halfSize; z <= halfSize; z += cellSize) {
            linePoints.push([
                new Vector3(-halfSize, gridY, z),
                new Vector3(halfSize, gridY, z)
            ]);
        }

        // Вертикальные линии
        for (let x = -halfSize; x <= halfSize; x += cellSize) {
            linePoints.push([
                new Vector3(x, gridY, -halfSize),
                new Vector3(x, gridY, halfSize)
            ]);
        }

        const gridLines = MeshBuilder.CreateLineSystem("customGridLines", {
            lines: linePoints
        }, this.scene);

        // Яркий зелёный цвет
        gridLines.color = new Color3(0, 1, 0); // #00ff00
        gridLines.isPickable = false;
        gridLines.parent = this.parentNode;
    }

    /**
     * ШАГ 3: Загрузить объекты из данных или localStorage
     */
    private loadEditorObjects(providedMapData?: CustomMapData): RunResult {
        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log("[CustomMapRunner] Step 3: Loading editor objects...");
        }

        let mapData: CustomMapData;

        if (providedMapData) {
            mapData = providedMapData;
            // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                logger.log(`[CustomMapRunner] Using provided map data: "${mapData.name}"`);
            }
        } else {
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

            // ОПТИМИЗАЦИЯ: Логируем размер данных только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                const dataSizeKB = (mapDataStr.length / 1024).toFixed(2);
                const dataSizeMB = (mapDataStr.length / 1024 / 1024).toFixed(2);
                logger.log(`[CustomMapRunner] 📦 localStorage data: ${dataSizeKB}KB (${dataSizeMB}MB, ${mapDataStr.length} chars)`);
            }

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
        }

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log(`[CustomMapRunner] Map: "${mapData.name}"`);
            logger.log(`[CustomMapRunner] Objects to create: ${mapData.placedObjects?.length || 0}`);
        }

        if (!mapData.placedObjects || mapData.placedObjects.length === 0) {
            logger.warn("[CustomMapRunner] Map has no objects!");
            return {
                success: true,
                objectsCreated: 0,
                mapName: mapData.name
            };
        }

        // ИСПРАВЛЕНО: Find spawn point from map objects and recalculate Y using findSafeSpawnPositionAt()
        const spawnObj = mapData.placedObjects.find(obj =>
            obj.type === 'spawn' ||
            obj.properties?.txType === 'spawn' ||
            (obj.properties?.name || '').toLowerCase().includes('spawn')
        );
        if (spawnObj) {
            const pos = spawnObj.position || { x: 0, y: 0, z: 0 };

            // Используем findSafeSpawnPositionAt() для пересчёта Y координаты
            const game = (window as any).gameInstance;
            let safePos: Vector3 | null = null;

            if (game && typeof game.findSafeSpawnPositionAt === 'function') {
                safePos = game.findSafeSpawnPositionAt(pos.x, pos.z, 2.0, 5);
            }

            if (safePos) {
                this.spawnPosition = safePos;
                // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
                if (process.env.NODE_ENV === 'development') {
                    logger.log(`[CustomMapRunner] 🎯 Found spawn point at (${safePos.x.toFixed(1)}, ${safePos.y.toFixed(1)}, ${safePos.z.toFixed(1)}) - adjusted from (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
                }
            } else {
                // Fallback: используем getTopSurfaceHeight или фиксированный отступ
                let spawnY = pos.y + 2;
                if (game && typeof game.getTopSurfaceHeight === 'function') {
                    const surfaceHeight = game.getTopSurfaceHeight(pos.x, pos.z);
                    spawnY = surfaceHeight + 2.0;
                }
                this.spawnPosition = new Vector3(pos.x, spawnY, pos.z);
                // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
                if (process.env.NODE_ENV === 'development') {
                    logger.log(`[CustomMapRunner] 🎯 Found spawn point at (${pos.x.toFixed(1)}, ${spawnY.toFixed(1)}, ${pos.z.toFixed(1)}) - using fallback`);
                }
            }
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

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development') {
            logger.log(`[CustomMapRunner] ✅ Created ${created}/${mapData.placedObjects.length} objects`);
        }

        // ОПТИМИЗАЦИЯ: Merge meshes по материалам для уменьшения draw calls
        // DISABLED: Физика требует отдельных мешей (для PhysicsAggregate)
        // this.mergeMeshesByMaterial();

        return {
            success: true,
            objectsCreated: created,
            mapName: mapData.name
        };
    }

    /**
     * ОПТИМИЗАЦИЯ: Объединяет меши с одинаковым материалом для уменьшения draw calls
     */
    private mergeMeshesByMaterial(): void {
        // Группируем меши по материалу
        const meshesByMaterial = new Map<string, Mesh[]>();

        for (const mesh of this.createdMeshes) {
            if (!mesh.material) continue;
            const matName = mesh.material.name;
            if (!meshesByMaterial.has(matName)) {
                meshesByMaterial.set(matName, []);
            }
            meshesByMaterial.get(matName)!.push(mesh);
        }

        let mergedCount = 0;
        for (const [matName, meshes] of meshesByMaterial) {
            if (meshes.length < 2) continue; // Нечего мержить

            try {
                // Babylon's Mesh.MergeMeshes объединяет меши в один
                const merged = Mesh.MergeMeshes(
                    meshes,
                    true,  // disposeSource - удалить исходные меши
                    true,  // allow32BitsIndices
                    undefined, // parent
                    false, // subdivideWithSubMeshes
                    true   // multiMultiMaterials
                );

                if (merged) {
                    merged.name = `merged_${matName}`;
                    merged.parent = this.parentNode;
                    mergedCount += meshes.length;
                }
            } catch (e) {
                // Если merge падает - оставляем как есть
                if (process.env.NODE_ENV === 'development') {
                    logger.warn(`[CustomMapRunner] Failed to merge meshes for ${matName}:`, e);
                }
            }
        }

        if (process.env.NODE_ENV === 'development') {
            logger.log(`[CustomMapRunner] 🔨 Merged ${mergedCount} meshes into ${meshesByMaterial.size} groups`);
        }
    }



    /**
     * Создать один объект из данных редактора
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

                    if (obj.type === 'enemy_turret') {
                        // NOTE: для enemy_turret при необходимости добавить логику обездвиживания (immobilize)
                    }

                    // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
                    if (process.env.NODE_ENV === 'development') {
                        logger.log(`[CustomMapRunner] Spawned enemy ${obj.type} at ${pos}`);
                    }

                    if (enemy.chassis) {
                        return enemy.chassis;
                    }
                } catch (e) {
                    logger.error(`[CustomMapRunner] Failed to spawn enemy:`, e);
                }
            }
            return null;
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
            mesh.visibility = 0.3;

            const mat = new StandardMaterial(`triggerMat_${obj.id}`, this.scene);
            if (obj.type === 'zone_damage') mat.diffuseColor = new Color3(1, 0, 0);
            else if (obj.type === 'zone_heal') mat.diffuseColor = new Color3(0, 1, 0);
            else if (obj.type === 'zone_teleport') mat.diffuseColor = new Color3(0, 0.5, 1);
            else mat.diffuseColor = new Color3(1, 1, 0);

            mat.alpha = 0.3;
            mesh.material = mat;

            mesh.metadata = {
                isTrigger: true,
                triggerType: obj.type.replace('zone_', ''),
                customMapObject: true
            };

            return mesh;
        }

        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        const rot = obj.rotation || { x: 0, y: 0, z: 0 };
        const colorHex = obj.properties?.color || '#808080';

        // DEBUG: Log first 5 objects to see actual data
        if (this.createdMeshes.length < 5) {
            // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
            if (process.env.NODE_ENV === 'development') {
                logger.log(`[CustomMapRunner] Object #${this.createdMeshes.length + 1}: ` +
                    `pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) ` +
                    `scale=(${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}) ` +
                    `color=${colorHex} type=${obj.type} isPolygon=${obj.isPolygon || false}`);
            }
        }

        const meshName = `customObj_${obj.id}`;
        let mesh: Mesh;

        // SIMPLIFIED: Всегда используем BOX для надёжности
        const width = Math.max(0.5, scale.x);
        const height = Math.max(0.5, scale.y);
        const depth = Math.max(0.5, scale.z);

        // ОПТИМИЗАЦИЯ: Логируем только в dev режиме
        if (process.env.NODE_ENV === 'development' && this.createdMeshes.length < 50) {
            logger.log(`[CustomMapRunner] #${this.createdMeshes.length + 1} "${obj.properties?.name || obj.id}": ` +
                `pos=(${pos.x.toFixed(0)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(0)}) ` +
                `size=(${width.toFixed(1)}x${height.toFixed(1)}x${depth.toFixed(1)}) ` +
                `color=${colorHex}`);
        }

        // GARAGE support
        if (obj.type === 'garage') {
            const width = 8;
            const height = 5;
            const depth = 12; // Standard garage size

            mesh = MeshBuilder.CreateBox(meshName, {
                width, height, depth
            }, this.scene);
            mesh.position = new Vector3(pos.x, pos.y, pos.z);
            mesh.rotation = new Vector3((rot.x || 0) * Math.PI / 180, (rot.y || 0) * Math.PI / 180, (rot.z || 0) * Math.PI / 180);

            const garageMat = new StandardMaterial(`customGarageMat_${obj.id}`, this.scene);
            garageMat.diffuseColor = new Color3(0.3, 0.3, 0.5);
            garageMat.emissiveColor = new Color3(0.1, 0.1, 0.2);
            mesh.material = garageMat;

            // Label "G"
            // Use DynamicTexture
            const plane = MeshBuilder.CreateBox(`garageLabel_${obj.id}`, { width: 4, height: 4, depth: 0.01 }, this.scene);
            plane.parent = mesh;
            plane.position.y = 3;
            plane.position.x = 0;
            plane.position.z = 0;
            plane.rotation.x = Math.PI / 2;
            plane.rotation.y = Math.PI;

            // Dynamic texture needs to be created safely
            try {
                const dt = new DynamicTexture(`garageLabelTex_${obj.id}`, { width: 128, height: 128 }, this.scene);
                const ctx = dt.getContext() as CanvasRenderingContext2D;
                ctx.fillStyle = "transparent";
                ctx.fillRect(0, 0, 128, 128);
                ctx.font = "bold 80px Arial";
                ctx.fillStyle = "white";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("G", 64, 64);
                dt.update();

                const planeMat = new StandardMaterial(`garageLabelMat_${obj.id}`, this.scene);
                planeMat.diffuseTexture = dt;
                planeMat.disableLighting = true;
                planeMat.useAlphaFromDiffuseTexture = true;
                plane.material = planeMat;
            } catch (e) {
                // Ignore texture error
            }

            mesh.parent = this.parentNode;
            mesh.metadata = {
                objectType: 'garage'
            };

            // Physics for Garage
            new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.5 }, this.scene);

            return mesh;
        }

        mesh = MeshBuilder.CreateBox(meshName, {
            width: width,
            height: height,
            depth: depth
        }, this.scene);

        // Позиция уже включает правильный Y offset из экспортёра
        mesh.position = new Vector3(pos.x, pos.y, pos.z);



        // Поворот (конвертируем градусы в радианы)
        mesh.rotation = new Vector3(
            (rot.x || 0) * Math.PI / 180,
            (rot.y || 0) * Math.PI / 180,
            (rot.z || 0) * Math.PI / 180
        );

        // Материал с цветом из редактора - ИСПОЛЬЗУЕМ КЭШ для batching!
        let mat = this.materialCache.get(colorHex);
        if (!mat) {
            mat = new StandardMaterial(`sharedMat_${colorHex}`, this.scene);
            mat.diffuseColor = this.hexToColor3(colorHex);
            mat.specularColor = new Color3(0.1, 0.1, 0.1);
            this.materialCache.set(colorHex, mat);
        }
        mesh.material = mat;

        // Родительский узел
        mesh.parent = this.parentNode;

        // Физика - ВСЕГДА BOX (MESH может падать)
        if (obj.properties?.hasCollision !== false) {
            try {
                new PhysicsAggregate(mesh, PhysicsShapeType.BOX, {
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
