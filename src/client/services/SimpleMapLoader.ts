/**
 * SimpleMapLoader - Простой загрузчик карт из редактора
 * 
 * ПРИНЦИП: WYSIWYG - What You See In Editor = What You Get In Game
 * 
 * Читает JSON из localStorage и создаёт ТОЧНО такие же боксы как в редакторе.
 * БЕЗ ЛЮБЫХ трансформаций, смещений или масштабирования.
 */

import {
    Scene,
    Vector3,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    TransformNode,
    GroundMesh
} from "@babylonjs/core";
import { PhysicsAggregate, PhysicsShapeType } from "@babylonjs/core/Physics";
import { logger } from "../utils/logger";

/** Простой интерфейс объекта - КАК В РЕДАКТОРЕ */
interface SimpleObject {
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    color: string;
    rotation?: { x: number; y: number; z: number };
}

/** Данные карты */
interface SimpleMapData {
    name: string;
    objects: SimpleObject[];
}

/**
 * SimpleMapLoader - загружает карту ТОЧНО как в редакторе
 */
export class SimpleMapLoader {
    private scene: Scene;
    private meshes: Mesh[] = [];
    private root: TransformNode;
    private floor: GroundMesh | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        this.root = new TransformNode("SimpleMapRoot", scene);
        logger.log("[SimpleMapLoader] ✅ Initialized");
    }

    /**
     * Загрузить карту из localStorage
     */
    public load(): { success: boolean; count: number; error?: string } {
        logger.log("[SimpleMapLoader] === LOADING MAP ===");

        // Читаем данные
        const dataStr = localStorage.getItem('selectedCustomMapData');
        if (!dataStr) {
            logger.warn("[SimpleMapLoader] No map data in localStorage");
            return { success: false, count: 0, error: "No map data" };
        }

        let mapData: any;
        try {
            mapData = JSON.parse(dataStr);
        } catch (e) {
            logger.error("[SimpleMapLoader] Failed to parse JSON:", e);
            return { success: false, count: 0, error: "Invalid JSON" };
        }

        const mapName = mapData.name || "Unknown";
        const objects = mapData.placedObjects || [];

        logger.log(`[SimpleMapLoader] Map: "${mapName}"`);
        logger.log(`[SimpleMapLoader] Objects: ${objects.length}`);

        // Создаём пол
        this.createFloor();

        // Создаём объекты
        let created = 0;
        for (const obj of objects) {
            if (this.createBox(obj)) {
                created++;
            }
        }

        logger.log(`[SimpleMapLoader] ✅ Created ${created}/${objects.length} objects`);
        return { success: true, count: created };
    }

    /**
     * Создать пол с 3D сеткой (wireframe) как на скриншоте GitHub
     */
    private createFloor(): void {
        // 1. Чёрный пол для физики
        this.floor = MeshBuilder.CreateBox("simpleMapFloor", {
            width: 2000,
            height: 0.1,
            depth: 2000
        }, this.scene);

        const floorMat = new StandardMaterial("floorMat", this.scene);
        floorMat.diffuseColor = new Color3(0.02, 0.02, 0.02); // Почти чёрный
        floorMat.specularColor = Color3.Black();
        floorMat.emissiveColor = new Color3(0, 0, 0);
        this.floor.material = floorMat;

        new PhysicsAggregate(this.floor, PhysicsShapeType.BOX, {
            mass: 0,
            friction: 0.8
        }, this.scene);

        // 2. Создаём 3D wireframe сетку поверх пола
        this.createWireframeGrid();

        logger.log("[SimpleMapLoader] 3D Grid floor created");
    }

    /**
     * Создать 3D wireframe сетку - яркая зелёная в стиле киберпанк
     */
    private createWireframeGrid(): void {
        const gridSize = 1000; // Размер сетки
        const cellSize = 25;   // Размер ячейки (меньше = больше линий)
        const gridY = 0.05;    // Немного выше пола чтобы не z-fighting
        const halfSize = gridSize / 2;
        const linePoints: Vector3[][] = [];

        // Горизонтальные линии (по X)
        for (let z = -halfSize; z <= halfSize; z += cellSize) {
            linePoints.push([
                new Vector3(-halfSize, gridY, z),
                new Vector3(halfSize, gridY, z)
            ]);
        }

        // Вертикальные линии (по Z)
        for (let x = -halfSize; x <= halfSize; x += cellSize) {
            linePoints.push([
                new Vector3(x, gridY, -halfSize),
                new Vector3(x, gridY, halfSize)
            ]);
        }

        // Создаём LineSystem для всех линий сразу (оптимизация)
        const gridLines = MeshBuilder.CreateLineSystem("gridLines", {
            lines: linePoints
        }, this.scene);

        // Цвет линий - ЯРКИЙ ЗЕЛЁНЫЙ (киберпанк стиль)
        gridLines.color = new Color3(0, 1, 0); // #00ff00
        gridLines.isPickable = false;
        gridLines.parent = this.root;
    }

    /**
     * Создать бокс - ТОЧНО как в редакторе
     */
    private createBox(obj: any): boolean {
        // Читаем данные БЕЗ изменений
        const pos = obj.position || { x: 0, y: 0, z: 0 };
        const scale = obj.scale || { x: 1, y: 1, z: 1 };
        const rot = obj.rotation || { x: 0, y: 0, z: 0 };
        const color = obj.properties?.color || '#808080';
        const name = obj.properties?.name || obj.id || 'box';

        // Размеры
        const width = Math.max(0.5, scale.x);
        const height = Math.max(0.5, scale.y);
        const depth = Math.max(0.5, scale.z);

        // Лог первых 10 объектов
        if (this.meshes.length < 10) {
            logger.log(`[SimpleMapLoader] #${this.meshes.length + 1} "${name}": ` +
                `pos(${pos.x.toFixed(0)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(0)}) ` +
                `size(${width.toFixed(1)}x${height.toFixed(1)}x${depth.toFixed(1)}) ` +
                `color=${color}`);
        }

        // Пропускаем слишком маленькие объекты
        if (width < 0.5 && height < 0.5 && depth < 0.5) {
            return false;
        }

        // Создаём меш
        const meshName = `box_${obj.id}`;
        const mesh = MeshBuilder.CreateBox(meshName, {
            width: width,
            height: height,
            depth: depth
        }, this.scene);

        // Позиция - ТОЧНО как в данных
        mesh.position = new Vector3(pos.x, pos.y, pos.z);

        // Поворот (градусы -> радианы)
        mesh.rotation = new Vector3(
            (rot.x || 0) * Math.PI / 180,
            (rot.y || 0) * Math.PI / 180,
            (rot.z || 0) * Math.PI / 180
        );

        // Материал
        const mat = new StandardMaterial(`mat_${obj.id}`, this.scene);
        mat.diffuseColor = this.hexToColor(color);
        mat.specularColor = new Color3(0.1, 0.1, 0.1);
        mesh.material = mat;

        // Родитель
        mesh.parent = this.root;

        // Физика
        try {
            new PhysicsAggregate(mesh, PhysicsShapeType.BOX, {
                mass: 0,
                friction: 0.5
            }, this.scene);
        } catch (e) {
            // Игнорируем ошибки физики
        }

        this.meshes.push(mesh);
        return true;
    }

    /**
     * Конвертация hex в Color3
     */
    private hexToColor(hex: string): Color3 {
        try {
            const clean = hex.replace('#', '');
            const val = parseInt(clean, 16);
            return new Color3(
                ((val >> 16) & 255) / 255,
                ((val >> 8) & 255) / 255,
                (val & 255) / 255
            );
        } catch {
            return new Color3(0.5, 0.5, 0.5);
        }
    }

    /**
     * Очистить все объекты
     */
    public clear(): void {
        for (const mesh of this.meshes) {
            if (mesh && !mesh.isDisposed()) {
                mesh.dispose();
            }
        }
        this.meshes = [];

        if (this.floor && !this.floor.isDisposed()) {
            this.floor.dispose();
            this.floor = null;
        }
    }

    /**
     * Dispose
     */
    public dispose(): void {
        this.clear();
        if (this.root) {
            this.root.dispose();
        }
    }
}

/**
 * Глобальная функция для загрузки карты
 */
export function loadSimpleMap(scene: Scene): { success: boolean; count: number } {
    const loader = new SimpleMapLoader(scene);
    return loader.load();
}
