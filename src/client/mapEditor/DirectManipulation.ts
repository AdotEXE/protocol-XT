/**
 * @module mapEditor/DirectManipulation
 * @description Прямое перетаскивание объектов мышью без gizmo
 * 
 * Raycasting для определения плоскости перемещения, привязка к сетке, ограничения по осям
 */

import {
    Scene,
    Mesh,
    Vector3,
    Ray,
    PickingInfo,
    GroundMesh,
    Plane,
    Matrix
} from "@babylonjs/core";

export interface DirectManipulationOptions {
    snapToGrid?: boolean;
    gridSize?: number;
    lockAxis?: "x" | "y" | "z" | null;
    plane?: "xy" | "xz" | "yz" | "camera";
}

export class DirectManipulation {
    private scene: Scene;
    private targetMesh: Mesh | null = null;
    private isDragging: boolean = false;
    private dragStartPos: Vector3 | null = null;
    private dragStartMouse: { x: number; y: number } | null = null;
    private dragPlane: Plane | null = null;
    private dragOffset: Vector3 | null = null;
    
    private options: DirectManipulationOptions = {
        snapToGrid: false,
        gridSize: 1.0,
        lockAxis: null,
        plane: "xz"
    };
    
    // Callbacks
    private onTransformChange: ((position: Vector3) => void) | null = null;
    
    constructor(scene: Scene) {
        this.scene = scene;
    }
    
    /**
     * Установить целевой меш для перетаскивания
     */
    setTarget(mesh: Mesh | null): void {
        this.targetMesh = mesh;
    }
    
    /**
     * Установить опции манипуляции
     */
    setOptions(options: Partial<DirectManipulationOptions>): void {
        this.options = { ...this.options, ...options };
    }
    
    /**
     * Начать перетаскивание
     */
    startDrag(x: number, y: number): boolean {
        if (!this.targetMesh) return false;
        
        // Проверяем, что клик по целевому объекту
        const pickInfo = this.scene.pick(x, y, (mesh) => {
            if (mesh === this.targetMesh) return true;
            if (this.targetMesh && this.targetMesh.getChildren) {
                const children = this.targetMesh.getChildren();
                return children && children.some(child => child === mesh);
            }
            return false;
        });
        
        if (!pickInfo || !pickInfo.pickedMesh) {
            // Если клик не по объекту, но объект выбран - начинаем перетаскивание
            // (для перетаскивания уже выбранного объекта)
            if (this.targetMesh) {
                this.isDragging = true;
                this.dragStartMouse = { x, y };
                this.dragStartPos = this.targetMesh.position.clone();
                this.setupDragPlane();
                return true;
            }
            return false;
        }
        
        this.isDragging = true;
        this.dragStartMouse = { x, y };
        this.dragStartPos = this.targetMesh.position.clone();
        this.setupDragPlane();
        
        return true;
    }
    
    /**
     * Настроить плоскость для перетаскивания
     */
    private setupDragPlane(): void {
        if (!this.targetMesh) return;
        
        const camera = this.scene.activeCamera;
        if (!camera) return;
        
        const objectPos = this.targetMesh.getAbsolutePosition();
        let normal: Vector3;
        
        switch (this.options.plane) {
            case "xy":
                normal = Vector3.Forward(); // Z axis
                break;
            case "xz":
                normal = Vector3.Up(); // Y axis
                break;
            case "yz":
                normal = Vector3.Right(); // X axis
                break;
            case "camera":
            default:
                // Плоскость перпендикулярна камере
                const cameraDir = camera.getForwardRay().direction;
                normal = cameraDir.normalize();
                break;
        }
        
        this.dragPlane = Plane.FromPositionAndNormal(objectPos, normal);
        
        // Вычисляем offset от центра объекта до точки пересечения
        if (this.dragStartMouse && this.dragPlane) {
            const ray = this.createRayFromScreen(this.dragStartMouse.x, this.dragStartMouse.y);
            if (ray) {
                // Вычисляем пересечение луча с плоскостью
                // Формула: t = -(dot(normal, origin) + d) / dot(normal, direction)
                const planeNormal = this.dragPlane.normal;
                const planeD = this.dragPlane.d;
                const dotNormalDir = Vector3.Dot(planeNormal, ray.direction);
                
                if (Math.abs(dotNormalDir) > 0.0001) {
                    const dotNormalOrigin = Vector3.Dot(planeNormal, ray.origin);
                    const t = -(dotNormalOrigin + planeD) / dotNormalDir;
                    const intersection = ray.origin.add(ray.direction.scale(t));
                    this.dragOffset = objectPos.subtract(intersection);
                } else {
                    this.dragOffset = Vector3.Zero();
                }
            } else {
                this.dragOffset = Vector3.Zero();
            }
        } else {
            this.dragOffset = Vector3.Zero();
        }
    }
    
    /**
     * Обновить перетаскивание
     */
    updateDrag(x: number, y: number): void {
        if (!this.isDragging || !this.targetMesh || !this.dragPlane || !this.dragStartPos) return;
        
        const ray = this.createRayFromScreen(x, y);
        if (!ray || !this.dragPlane) return;
        
        // Находим пересечение луча с плоскостью
        // Формула: t = -(dot(normal, origin) + d) / dot(normal, direction)
        const planeNormal = this.dragPlane.normal;
        const planeD = this.dragPlane.d;
        const dotNormalDir = Vector3.Dot(planeNormal, ray.direction);
        
        if (Math.abs(dotNormalDir) < 0.0001) return; // Луч параллелен плоскости
        
        const dotNormalOrigin = Vector3.Dot(planeNormal, ray.origin);
        const t = -(dotNormalOrigin + planeD) / dotNormalDir;
        const intersection = ray.origin.add(ray.direction.scale(t));
        let newPos = intersection.add(this.dragOffset || Vector3.Zero());
        
        // Применяем ограничения по осям
        if (this.options.lockAxis) {
            switch (this.options.lockAxis) {
                case "x":
                    newPos.x = this.dragStartPos.x;
                    break;
                case "y":
                    newPos.y = this.dragStartPos.y;
                    break;
                case "z":
                    newPos.z = this.dragStartPos.z;
                    break;
            }
        }
        
        // Привязка к сетке
        if (this.options.snapToGrid && this.options.gridSize) {
            newPos.x = Math.round(newPos.x / this.options.gridSize) * this.options.gridSize;
            newPos.y = Math.round(newPos.y / this.options.gridSize) * this.options.gridSize;
            newPos.z = Math.round(newPos.z / this.options.gridSize) * this.options.gridSize;
        }
        
        // Обновляем позицию объекта
        this.targetMesh.position = newPos;
        
        // Вызываем callback
        if (this.onTransformChange) {
            this.onTransformChange(newPos.clone());
        }
    }
    
    /**
     * Завершить перетаскивание
     */
    endDrag(): void {
        this.isDragging = false;
        this.dragStartMouse = null;
        this.dragStartPos = null;
        this.dragPlane = null;
        this.dragOffset = null;
    }
    
    /**
     * Создать луч из экранных координат
     */
    private createRayFromScreen(x: number, y: number): Ray | null {
        const camera = this.scene.activeCamera;
        if (!camera) return null;
        
        // Используем scene.createPickingRay для создания луча из экранных координат
        try {
            return this.scene.createPickingRay(x, y, Matrix.Identity(), camera);
        } catch (e) {
            // Fallback: используем getForwardRay без параметров
            return camera.getForwardRay();
        }
    }
    
    /**
     * Установить callback для изменений позиции
     */
    setOnTransformChange(callback: (position: Vector3) => void): void {
        this.onTransformChange = callback;
    }
    
    /**
     * Проверить, активно ли перетаскивание
     */
    isActive(): boolean {
        return this.isDragging;
    }
    
    /**
     * Получить текущую позицию объекта
     */
    getPosition(): Vector3 | null {
        return this.targetMesh ? this.targetMesh.position.clone() : null;
    }
}

export default DirectManipulation;

