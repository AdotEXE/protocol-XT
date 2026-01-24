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
        console.log("[SimpleMapLoader] ✅ Initialized");
    }

    /**
     * Загрузить карту из localStorage
     */
    public load(): { success: boolean; count: number; error?: string } {
        console.log("[SimpleMapLoader] === LOADING MAP ===");

        // Читаем данные
        const dataStr = localStorage.getItem('selectedCustomMapData');
        if (!dataStr) {
            console.warn("[SimpleMapLoader] No map data in localStorage");
            return { success: false, count: 0, error: "No map data" };
        }

        let mapData: any;
        try {
            mapData = JSON.parse(dataStr);
        } catch (e) {
            console.error("[SimpleMapLoader] Failed to parse JSON:", e);
            return { success: false, count: 0, error: "Invalid JSON" };
        }

        const mapName = mapData.name || "Unknown";
        const objects = mapData.placedObjects || [];

        console.log(`[SimpleMapLoader] Map: "${mapName}"`);
        console.log(`[SimpleMapLoader] Objects: ${objects.length}`);

        // Создаём пол
        this.createFloor();

        // Создаём объекты
        let created = 0;
        for (const obj of objects) {
            if (this.createBox(obj)) {
                created++;
            }
        }

        console.log(`[SimpleMapLoader] ✅ Created ${created}/${objects.length} objects`);
        return { success: true, count: created };
    }

    /**
     * Создать пол
     */
    private createFloor(): void {
        this.floor = MeshBuilder.CreateGround("simpleMapFloor", {
            width: 1000,
            height: 1000,
            subdivisions: 1
        }, this.scene);

        const mat = new StandardMaterial("floorMat", this.scene);
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        mat.specularColor = Color3.Black();
        this.floor.material = mat;

        new PhysicsAggregate(this.floor, PhysicsShapeType.BOX, {
            mass: 0,
            friction: 0.8
        }, this.scene);

        console.log("[SimpleMapLoader] Floor created");
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
            console.log(`[SimpleMapLoader] #${this.meshes.length + 1} "${name}": ` +
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
