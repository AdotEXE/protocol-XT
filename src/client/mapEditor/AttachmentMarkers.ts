/**
 * @module mapEditor/AttachmentMarkers
 * @description Визуальные маркеры точек крепления с возможностью перетаскивания
 * 
 * Красная сфера для turret pivot, синяя для barrel mount
 */

import {
    Scene,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    Ray
} from "@babylonjs/core";

export interface AttachmentPoints {
    turretPivot: Vector3;
    barrelMount: Vector3;
}

export class AttachmentMarkers {
    private scene: Scene;
    private parentMesh: Mesh | null = null;
    
    private pivotMarker: Mesh | null = null;
    private barrelMarker: Mesh | null = null;
    
    private isDraggingPivot: boolean = false;
    private isDraggingBarrel: boolean = false;
    private dragStartPos: Vector3 | null = null;
    private dragStartMouse: { x: number; y: number } | null = null;
    
    private points: AttachmentPoints = {
        turretPivot: Vector3.Zero(),
        barrelMount: Vector3.Zero()
    };
    
    // Callbacks
    private onChangeCallback: ((points: AttachmentPoints) => void) | null = null;
    
    // Constants
    private readonly MARKER_SIZE = 0.3;
    private readonly MARKER_DRAG_SENSITIVITY = 0.01;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.createMarkers();
    }
    
    private createMarkers(): void {
        // Красный маркер для turret pivot (box вместо sphere)
        this.pivotMarker = MeshBuilder.CreateBox('pivotMarker', {
            width: this.MARKER_SIZE,
            height: this.MARKER_SIZE,
            depth: this.MARKER_SIZE
        }, this.scene);
        
        const pivotMat = new StandardMaterial('pivotMarkerMat', this.scene);
        pivotMat.diffuseColor = new Color3(1, 0, 0); // Красный
        pivotMat.emissiveColor = new Color3(0.5, 0, 0);
        pivotMat.disableLighting = true;
        this.pivotMarker.material = pivotMat;
        this.pivotMarker.renderingGroupId = 2; // Поверх всего
        this.pivotMarker.setEnabled(false);
        
        // Синий маркер для barrel mount (box вместо sphere)
        const barrelSize = this.MARKER_SIZE * 0.8;
        this.barrelMarker = MeshBuilder.CreateBox('barrelMarker', {
            width: barrelSize,
            height: barrelSize,
            depth: barrelSize
        }, this.scene);
        
        const barrelMat = new StandardMaterial('barrelMarkerMat', this.scene);
        barrelMat.diffuseColor = new Color3(0, 0.5, 1); // Синий
        barrelMat.emissiveColor = new Color3(0, 0.2, 0.5);
        barrelMat.disableLighting = true;
        this.barrelMarker.material = barrelMat;
        this.barrelMarker.renderingGroupId = 2;
        this.barrelMarker.setEnabled(false);
    }
    
    /**
     * Установить родительский меш (танк)
     */
    setParentMesh(mesh: Mesh | null): void {
        this.parentMesh = mesh;
        this.updateMarkers();
    }
    
    /**
     * Установить точки крепления
     */
    setAttachmentPoints(points: AttachmentPoints): void {
        this.points = {
            turretPivot: points.turretPivot.clone(),
            barrelMount: points.barrelMount.clone()
        };
        this.updateMarkers();
    }
    
    /**
     * Получить точки крепления
     */
    getAttachmentPoints(): AttachmentPoints {
        return {
            turretPivot: this.points.turretPivot.clone(),
            barrelMount: this.points.barrelMount.clone()
        };
    }
    
    /**
     * Обновить позиции маркеров
     */
    private updateMarkers(): void {
        if (!this.parentMesh) {
            if (this.pivotMarker) this.pivotMarker.setEnabled(false);
            if (this.barrelMarker) this.barrelMarker.setEnabled(false);
            return;
        }
        
        const worldMatrix = this.parentMesh.getWorldMatrix();
        
        // Обновляем pivot marker
        if (this.pivotMarker) {
            const pivotWorld = Vector3.TransformCoordinates(this.points.turretPivot, worldMatrix);
            this.pivotMarker.position = pivotWorld;
            this.pivotMarker.setEnabled(true);
        }
        
        // Обновляем barrel marker (относительно turret, но пока просто относительно chassis)
        if (this.barrelMarker) {
            const barrelWorld = Vector3.TransformCoordinates(this.points.barrelMount, worldMatrix);
            this.barrelMarker.position = barrelWorld;
            this.barrelMarker.setEnabled(true);
        }
    }
    
    /**
     * Обработка клика мыши
     */
    handlePointerDown(x: number, y: number): boolean {
        const pickInfo = this.scene.pick(x, y, (mesh) => {
            return mesh === this.pivotMarker || mesh === this.barrelMarker;
        });
        
        if (pickInfo && pickInfo.pickedMesh) {
            if (pickInfo.pickedMesh === this.pivotMarker) {
                this.isDraggingPivot = true;
                this.dragStartMouse = { x, y };
                this.dragStartPos = this.points.turretPivot.clone();
                return true;
            } else if (pickInfo.pickedMesh === this.barrelMarker) {
                this.isDraggingBarrel = true;
                this.dragStartMouse = { x, y };
                this.dragStartPos = this.points.barrelMount.clone();
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Обработка перемещения мыши
     */
    handlePointerMove(x: number, y: number): void {
        if (!this.parentMesh || !this.dragStartMouse || !this.dragStartPos) return;
        
        const camera = this.scene.activeCamera;
        if (!camera) return;
        
        const deltaX = (x - this.dragStartMouse.x) * this.MARKER_DRAG_SENSITIVITY;
        const deltaY = (y - this.dragStartMouse.y) * this.MARKER_DRAG_SENSITIVITY;
        
        if (this.isDraggingPivot) {
            // Перемещаем pivot относительно родительского объекта
            const right = Vector3.Right();
            const up = Vector3.Up();
            const forward = Vector3.Forward();
            
            // Получаем локальные оси родительского объекта
            const worldMatrix = this.parentMesh.getWorldMatrix();
            const localRight = Vector3.TransformNormal(right, worldMatrix).normalize();
            const localUp = Vector3.TransformNormal(up, worldMatrix).normalize();
            const localForward = Vector3.TransformNormal(forward, worldMatrix).normalize();
            
            const delta = localRight.scale(deltaX)
                .add(localUp.scale(-deltaY));
            
            this.points.turretPivot = this.dragStartPos.add(delta);
            this.updateMarkers();
            
            if (this.onChangeCallback) {
                this.onChangeCallback(this.getAttachmentPoints());
            }
        } else if (this.isDraggingBarrel) {
            // Аналогично для barrel
            const right = Vector3.Right();
            const up = Vector3.Up();
            
            const worldMatrix = this.parentMesh.getWorldMatrix();
            const localRight = Vector3.TransformNormal(right, worldMatrix).normalize();
            const localUp = Vector3.TransformNormal(up, worldMatrix).normalize();
            
            const delta = localRight.scale(deltaX)
                .add(localUp.scale(-deltaY));
            
            this.points.barrelMount = this.dragStartPos.add(delta);
            this.updateMarkers();
            
            if (this.onChangeCallback) {
                this.onChangeCallback(this.getAttachmentPoints());
            }
        }
    }
    
    /**
     * Обработка отпускания мыши
     */
    handlePointerUp(): void {
        this.isDraggingPivot = false;
        this.isDraggingBarrel = false;
        this.dragStartMouse = null;
        this.dragStartPos = null;
    }
    
    /**
     * Установить callback для изменений
     */
    setOnChange(callback: (points: AttachmentPoints) => void): void {
        this.onChangeCallback = callback;
    }
    
    /**
     * Показать/скрыть маркеры
     */
    setVisible(visible: boolean): void {
        if (this.pivotMarker) {
            this.pivotMarker.setEnabled(visible && this.parentMesh !== null);
        }
        if (this.barrelMarker) {
            this.barrelMarker.setEnabled(visible && this.parentMesh !== null);
        }
    }
    
    /**
     * Проверить, видимы ли маркеры
     */
    getVisible(): boolean {
        return this.pivotMarker ? this.pivotMarker.isEnabled() : false;
    }
    
    /**
     * Обновить маркеры (вызывать каждый кадр если объект движется)
     */
    update(): void {
        if (this.parentMesh) {
            this.updateMarkers();
        }
    }
    
    dispose(): void {
        if (this.pivotMarker) {
            this.pivotMarker.dispose();
            this.pivotMarker = null;
        }
        if (this.barrelMarker) {
            this.barrelMarker.dispose();
            this.barrelMarker = null;
        }
        this.onChangeCallback = null;
    }
}

export default AttachmentMarkers;

