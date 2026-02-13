/**
 * @module mapEditor/GizmoSystem
 * @description 3D Gizmo система для трансформации объектов в MapEditor
 * 
 * Поддерживает Translate, Rotate, Scale манипуляторы с визуализацией и интерактивностью
 */

import {
    Scene,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    Ray,
    PickingInfo,
    AbstractMesh,
    LinesMesh,
    TransformNode,
    Space
} from "@babylonjs/core";

export type GizmoMode = "translate" | "rotate" | "scale" | "none";
export type GizmoAxis = "x" | "y" | "z" | "xy" | "xz" | "yz" | "xyz" | "none";

export interface GizmoTransform {
    position: Vector3;
    rotation: Vector3;
    scale: Vector3;
}

export class GizmoSystem {
    private scene: Scene;
    private targetMesh: Mesh | null = null;
    private gizmoRoot: TransformNode | null = null;
    
    // Gizmo meshes (используем TransformNode как контейнер)
    private translateGizmo: TransformNode | null = null;
    private rotateGizmo: TransformNode | null = null;
    private scaleGizmo: TransformNode | null = null;
    
    // Axis handles
    private translateHandles: Map<string, Mesh> = new Map();
    private rotateHandles: Map<string, Mesh> = new Map();
    private scaleHandles: Map<string, Mesh> = new Map();
    
    private currentMode: GizmoMode = "none";
    private selectedAxis: GizmoAxis = "none";
    private isDragging: boolean = false;
    private dragStartPos: Vector3 | null = null;
    private dragStartMouse: { x: number; y: number } | null = null;
    private dragStartTransform: GizmoTransform | null = null;
    
    // Callbacks
    private onTransformChange: ((transform: GizmoTransform) => void) | null = null;
    
    // Materials
    private xMaterial: StandardMaterial | null = null;
    private yMaterial: StandardMaterial | null = null;
    private zMaterial: StandardMaterial | null = null;
    private selectedMaterial: StandardMaterial | null = null;
    
    // Constants
    private readonly GIZMO_SIZE = 2.0; // Размер gizmo относительно объекта
    private readonly ARROW_LENGTH = 1.5;
    private readonly ARROW_RADIUS = 0.05;
    private readonly HANDLE_SIZE = 0.15;
    private readonly RING_RADIUS = 1.2;
    private readonly RING_THICKNESS = 0.03;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.createMaterials();
        this.createGizmoRoot();
    }
    
    private createMaterials(): void {
        // X axis - красный
        this.xMaterial = new StandardMaterial("gizmoXMat", this.scene);
        this.xMaterial.diffuseColor = new Color3(1, 0.2, 0.2);
        this.xMaterial.emissiveColor = new Color3(0.5, 0, 0);
        this.xMaterial.disableLighting = true;
        
        // Y axis - зелёный
        this.yMaterial = new StandardMaterial("gizmoYMat", this.scene);
        this.yMaterial.diffuseColor = new Color3(0.2, 1, 0.2);
        this.yMaterial.emissiveColor = new Color3(0, 0.5, 0);
        this.yMaterial.disableLighting = true;
        
        // Z axis - синий
        this.zMaterial = new StandardMaterial("gizmoZMat", this.scene);
        this.zMaterial.diffuseColor = new Color3(0.2, 0.2, 1);
        this.zMaterial.emissiveColor = new Color3(0, 0, 0.5);
        this.zMaterial.disableLighting = true;
        
        // Selected - жёлтый
        this.selectedMaterial = new StandardMaterial("gizmoSelectedMat", this.scene);
        this.selectedMaterial.diffuseColor = new Color3(1, 1, 0);
        this.selectedMaterial.emissiveColor = new Color3(0.5, 0.5, 0);
        this.selectedMaterial.disableLighting = true;
    }
    
    private createGizmoRoot(): void {
        this.gizmoRoot = new TransformNode("gizmoRoot", this.scene);
        this.gizmoRoot.setEnabled(false);
    }
    
    /**
     * Установить целевой меш для редактирования
     */
    setTarget(mesh: Mesh | null): void {
        this.targetMesh = mesh;
        
        if (mesh) {
            this.updateGizmoPosition();
            this.gizmoRoot?.setEnabled(true);
        } else {
            this.gizmoRoot?.setEnabled(false);
        }
    }
    
    /**
     * Установить режим gizmo
     */
    setMode(mode: GizmoMode): void {
        if (this.currentMode === mode) return;
        
        this.currentMode = mode;
        this.hideAllGizmos();
        
        switch (mode) {
            case "translate":
                this.showTranslateGizmo();
                break;
            case "rotate":
                this.showRotateGizmo();
                break;
            case "scale":
                this.showScaleGizmo();
                break;
            case "none":
                // Все скрыто
                break;
        }
    }
    
    /**
     * Обновить позицию gizmo относительно целевого объекта
     */
    private updateGizmoPosition(): void {
        if (!this.gizmoRoot || !this.targetMesh) return;
        
        const worldMatrix = this.targetMesh.getWorldMatrix();
        const position = Vector3.TransformCoordinates(Vector3.Zero(), worldMatrix);
        this.gizmoRoot.position = position;
        
        // Масштабируем gizmo в зависимости от размера объекта
        const boundingInfo = this.targetMesh.getBoundingInfo();
        const size = boundingInfo.boundingBox.extendSizeWorld;
        const maxSize = Math.max(size.x, size.y, size.z);
        const scale = Math.max(0.5, Math.min(2.0, maxSize * 0.3));
        this.gizmoRoot.scaling = new Vector3(scale, scale, scale);
    }
    
    private hideAllGizmos(): void {
        if (this.translateGizmo) this.translateGizmo.setEnabled(false);
        if (this.rotateGizmo) this.rotateGizmo.setEnabled(false);
        if (this.scaleGizmo) this.scaleGizmo.setEnabled(false);
    }
    
    private showTranslateGizmo(): void {
        if (!this.gizmoRoot) return;
        
        if (!this.translateGizmo) {
            this.createTranslateGizmo();
        }
        
        if (this.translateGizmo) {
            this.translateGizmo.setEnabled(true);
            this.updateGizmoPosition();
        }
    }
    
    private showRotateGizmo(): void {
        if (!this.gizmoRoot) return;
        
        if (!this.rotateGizmo) {
            this.createRotateGizmo();
        }
        
        if (this.rotateGizmo) {
            this.rotateGizmo.setEnabled(true);
            this.updateGizmoPosition();
        }
    }
    
    private showScaleGizmo(): void {
        if (!this.gizmoRoot) return;
        
        if (!this.scaleGizmo) {
            this.createScaleGizmo();
        }
        
        if (this.scaleGizmo) {
            this.scaleGizmo.setEnabled(true);
            this.updateGizmoPosition();
        }
    }
    
    private createTranslateGizmo(): void {
        if (!this.gizmoRoot) return;
        
        this.translateGizmo = new TransformNode("translateGizmo", this.scene);
        this.translateGizmo.parent = this.gizmoRoot;
        
        // X axis (красный)
        const xArrow = this.createArrow("x", new Vector3(1, 0, 0), this.xMaterial!);
        xArrow.parent = this.translateGizmo;
        this.translateHandles.set("x", xArrow);
        
        // Y axis (зелёный)
        const yArrow = this.createArrow("y", new Vector3(0, 1, 0), this.yMaterial!);
        yArrow.parent = this.translateGizmo;
        this.translateHandles.set("y", yArrow);
        
        // Z axis (синий)
        const zArrow = this.createArrow("z", new Vector3(0, 0, 1), this.zMaterial!);
        zArrow.parent = this.translateGizmo;
        this.translateHandles.set("z", zArrow);
    }
    
    private createArrow(name: string, direction: Vector3, material: StandardMaterial): Mesh {
        const arrow = MeshBuilder.CreateBox(`arrow_${name}`, {
            width: this.ARROW_RADIUS * 2,
            height: this.ARROW_LENGTH,
            depth: this.ARROW_RADIUS * 2
        }, this.scene);
        
        arrow.material = material;
        arrow.renderingGroupId = 1; // Поверх всего
        
        if (direction.x !== 0) {
            arrow.rotation.z = Math.PI / 2;
        } else if (direction.z !== 0) {
            arrow.rotation.x = Math.PI / 2;
        }
        
        const offset = direction.scale(this.ARROW_LENGTH / 2);
        arrow.position = offset;
        
        const coneSize = this.ARROW_RADIUS * 2.5;
        const cone = MeshBuilder.CreateBox(`arrowCone_${name}`, {
            width: coneSize,
            height: this.ARROW_RADIUS * 3,
            depth: coneSize
        }, this.scene);
        
        cone.material = material;
        cone.renderingGroupId = 1;
        cone.parent = arrow;
        
        if (direction.x !== 0) {
            cone.rotation.z = Math.PI / 2;
        } else if (direction.z !== 0) {
            cone.rotation.x = Math.PI / 2;
        }
        
        const coneOffset = direction.scale(this.ARROW_LENGTH / 2 + this.ARROW_RADIUS * 1.5);
        cone.position = coneOffset;
        
        return arrow;
    }
    
    private createRotateGizmo(): void {
        if (!this.gizmoRoot) return;
        
        this.rotateGizmo = new TransformNode("rotateGizmo", this.scene);
        this.rotateGizmo.parent = this.gizmoRoot;
        
        // X ring (красный)
        const xRing = this.createRing("x", new Vector3(1, 0, 0), this.xMaterial!);
        xRing.parent = this.rotateGizmo;
        this.rotateHandles.set("x", xRing);
        
        // Y ring (зелёный)
        const yRing = this.createRing("y", new Vector3(0, 1, 0), this.yMaterial!);
        yRing.parent = this.rotateGizmo;
        this.rotateHandles.set("y", yRing);
        
        // Z ring (синий)
        const zRing = this.createRing("z", new Vector3(0, 0, 1), this.zMaterial!);
        zRing.parent = this.rotateGizmo;
        this.rotateHandles.set("z", zRing);
    }
    
    private createRing(name: string, normal: Vector3, material: StandardMaterial): Mesh {
        const ring = MeshBuilder.CreateBox(`ring_${name}`, {
            width: this.RING_RADIUS * 2,
            height: this.RING_THICKNESS,
            depth: this.RING_RADIUS * 2
        }, this.scene);
        
        ring.material = material;
        ring.renderingGroupId = 1;
        
        if (normal.x !== 0) {
            ring.rotation.z = Math.PI / 2;
        } else if (normal.z !== 0) {
            ring.rotation.x = Math.PI / 2;
        }
        
        return ring;
    }
    
    private createScaleGizmo(): void {
        if (!this.gizmoRoot) return;
        
        this.scaleGizmo = new TransformNode("scaleGizmo", this.scene);
        this.scaleGizmo.parent = this.gizmoRoot;
        
        // X handle (красный)
        const xHandle = this.createScaleHandle("x", new Vector3(1, 0, 0), this.xMaterial!);
        xHandle.parent = this.scaleGizmo;
        this.scaleHandles.set("x", xHandle);
        
        // Y handle (зелёный)
        const yHandle = this.createScaleHandle("y", new Vector3(0, 1, 0), this.yMaterial!);
        yHandle.parent = this.scaleGizmo;
        this.scaleHandles.set("y", yHandle);
        
        // Z handle (синий)
        const zHandle = this.createScaleHandle("z", new Vector3(0, 0, 1), this.zMaterial!);
        zHandle.parent = this.scaleGizmo;
        this.scaleHandles.set("z", zHandle);
        
        // Центральный handle для uniform scale (жёлтый)
        const d = this.HANDLE_SIZE * 1.5;
        const centerHandle = MeshBuilder.CreateBox("scaleCenter", {
            width: d,
            height: d,
            depth: d
        }, this.scene);
        centerHandle.material = this.selectedMaterial!;
        centerHandle.renderingGroupId = 1;
        centerHandle.parent = this.scaleGizmo;
        this.scaleHandles.set("xyz", centerHandle);
    }
    
    private createScaleHandle(name: string, direction: Vector3, material: StandardMaterial): Mesh {
        // Создаём куб для ручки
        const handle = MeshBuilder.CreateBox(`scaleHandle_${name}`, {
            size: this.HANDLE_SIZE
        }, this.scene);
        
        handle.material = material;
        handle.renderingGroupId = 1;
        
        // Позиционируем
        const offset = direction.scale(this.RING_RADIUS);
        handle.position = offset;
        
        return handle;
    }
    
    /**
     * Проверить, является ли меш потомком узла
     */
    private isDescendantOf(mesh: AbstractMesh, parent: TransformNode): boolean {
        let current: AbstractMesh | null = mesh;
        while (current) {
            if (current.parent === parent) {
                return true;
            }
            current = current.parent as AbstractMesh | null;
        }
        return false;
    }
    
    /**
     * Обработка клика мыши для выбора оси
     */
    handlePointerDown(x: number, y: number): GizmoAxis {
        if (!this.targetMesh || this.currentMode === "none") return "none";
        
        const pickInfo = this.scene.pick(x, y, (mesh) => {
            // Проверяем, является ли меш дочерним элементом gizmo
            if (this.translateGizmo && (mesh.parent === this.translateGizmo || this.isDescendantOf(mesh, this.translateGizmo))) {
                return true;
            }
            if (this.rotateGizmo && (mesh.parent === this.rotateGizmo || this.isDescendantOf(mesh, this.rotateGizmo))) {
                return true;
            }
            if (this.scaleGizmo && (mesh.parent === this.scaleGizmo || this.isDescendantOf(mesh, this.scaleGizmo))) {
                return true;
            }
            return false;
        });
        
        if (pickInfo && pickInfo.pickedMesh) {
            const mesh = pickInfo.pickedMesh;
            const meshName = mesh.name;
            
            // Определяем ось по имени меша
            if (meshName.includes("x") && !meshName.includes("y") && !meshName.includes("z")) {
                this.selectedAxis = "x";
            } else if (meshName.includes("y") && !meshName.includes("x") && !meshName.includes("z")) {
                this.selectedAxis = "y";
            } else if (meshName.includes("z") && !meshName.includes("x") && !meshName.includes("y")) {
                this.selectedAxis = "z";
            } else if (meshName.includes("xyz") || meshName.includes("Center")) {
                this.selectedAxis = "xyz";
            } else {
                this.selectedAxis = "none";
            }
            
            if (this.selectedAxis !== "none") {
                this.isDragging = true;
                this.dragStartMouse = { x, y };
                this.dragStartPos = this.targetMesh.position.clone();
                this.dragStartTransform = {
                    position: this.targetMesh.position.clone(),
                    rotation: this.targetMesh.rotation.clone(),
                    scale: this.targetMesh.scaling.clone()
                };
                
                // Подсвечиваем выбранную ось
                this.highlightAxis(this.selectedAxis);
            }
            
            return this.selectedAxis;
        }
        
        return "none";
    }
    
    /**
     * Обработка перемещения мыши при перетаскивании
     */
    handlePointerMove(x: number, y: number): void {
        if (!this.isDragging || !this.targetMesh || !this.dragStartMouse || !this.dragStartTransform) return;
        
        const deltaX = x - this.dragStartMouse.x;
        const deltaY = y - this.dragStartMouse.y;
        
        switch (this.currentMode) {
            case "translate":
                this.handleTranslate(deltaX, deltaY);
                break;
            case "rotate":
                this.handleRotate(deltaX, deltaY);
                break;
            case "scale":
                this.handleScale(deltaX, deltaY);
                break;
        }
    }
    
    /**
     * Обработка отпускания мыши
     */
    handlePointerUp(): void {
        if (this.isDragging) {
            this.isDragging = false;
            this.selectedAxis = "none";
            this.dragStartMouse = null;
            this.dragStartPos = null;
            this.dragStartTransform = null;
            this.clearHighlight();
        }
    }
    
    private handleTranslate(deltaX: number, deltaY: number): void {
        if (!this.targetMesh || !this.dragStartTransform) return;
        
        // Получаем камеру
        const camera = this.scene.activeCamera;
        if (!camera) return;
        
        // Вычисляем направление движения в зависимости от выбранной оси
        const sensitivity = 0.01;
        let delta = Vector3.Zero();
        
        switch (this.selectedAxis) {
            case "x":
                // Движение по X (красная ось)
                const right = Vector3.Right();
                delta = right.scale(deltaX * sensitivity);
                break;
            case "y":
                // Движение по Y (зелёная ось)
                const up = Vector3.Up();
                delta = up.scale(-deltaY * sensitivity); // Инвертируем Y
                break;
            case "z":
                // Движение по Z (синяя ось)
                const forward = Vector3.Forward();
                delta = forward.scale(deltaY * sensitivity);
                break;
            case "xyz":
                // Движение в плоскости камеры
                const cameraRight = camera.getDirection(Vector3.Right());
                const cameraUp = camera.getDirection(Vector3.Up());
                delta = cameraRight.scale(deltaX * sensitivity)
                    .add(cameraUp.scale(-deltaY * sensitivity));
                break;
        }
        
        // Применяем изменение
        const newPos = this.dragStartTransform.position.add(delta);
        this.targetMesh.position = newPos;
        this.updateGizmoPosition();
        
        // Вызываем callback
        if (this.onTransformChange) {
            this.onTransformChange({
                position: newPos.clone(),
                rotation: this.targetMesh.rotation.clone(),
                scale: this.targetMesh.scaling.clone()
            });
        }
    }
    
    private handleRotate(deltaX: number, deltaY: number): void {
        if (!this.targetMesh || !this.dragStartTransform) return;
        
        const sensitivity = 0.01;
        let deltaRotation = Vector3.Zero();
        
        switch (this.selectedAxis) {
            case "x":
                deltaRotation.x = deltaY * sensitivity;
                break;
            case "y":
                deltaRotation.y = deltaX * sensitivity;
                break;
            case "z":
                deltaRotation.z = deltaX * sensitivity;
                break;
        }
        
        const newRotation = this.dragStartTransform.rotation.add(deltaRotation);
        this.targetMesh.rotation = newRotation;
        this.updateGizmoPosition();
        
        if (this.onTransformChange) {
            this.onTransformChange({
                position: this.targetMesh.position.clone(),
                rotation: newRotation.clone(),
                scale: this.targetMesh.scaling.clone()
            });
        }
    }
    
    private handleScale(deltaX: number, deltaY: number): void {
        if (!this.targetMesh || !this.dragStartTransform) return;
        
        const sensitivity = 0.01;
        const delta = (deltaX + deltaY) * sensitivity;
        let newScale = this.dragStartTransform.scale.clone();
        
        switch (this.selectedAxis) {
            case "x":
                newScale.x = Math.max(0.1, this.dragStartTransform.scale.x + delta);
                break;
            case "y":
                newScale.y = Math.max(0.1, this.dragStartTransform.scale.y + delta);
                break;
            case "z":
                newScale.z = Math.max(0.1, this.dragStartTransform.scale.z + delta);
                break;
            case "xyz":
                const uniformDelta = delta;
                newScale.x = Math.max(0.1, this.dragStartTransform.scale.x + uniformDelta);
                newScale.y = Math.max(0.1, this.dragStartTransform.scale.y + uniformDelta);
                newScale.z = Math.max(0.1, this.dragStartTransform.scale.z + uniformDelta);
                break;
        }
        
        this.targetMesh.scaling = newScale;
        this.updateGizmoPosition();
        
        if (this.onTransformChange) {
            this.onTransformChange({
                position: this.targetMesh.position.clone(),
                rotation: this.targetMesh.rotation.clone(),
                scale: newScale.clone()
            });
        }
    }
    
    private highlightAxis(axis: GizmoAxis): void {
        this.clearHighlight();
        
        let handle: Mesh | null = null;
        
        switch (this.currentMode) {
            case "translate":
                handle = this.translateHandles.get(axis) || null;
                break;
            case "rotate":
                handle = this.rotateHandles.get(axis) || null;
                break;
            case "scale":
                handle = this.scaleHandles.get(axis) || null;
                break;
        }
        
        if (handle && handle.material) {
            (handle.material as StandardMaterial).emissiveColor = new Color3(1, 1, 0.5);
        }
    }
    
    private clearHighlight(): void {
        const allHandles = [
            ...Array.from(this.translateHandles.values()),
            ...Array.from(this.rotateHandles.values()),
            ...Array.from(this.scaleHandles.values())
        ];
        
        allHandles.forEach(handle => {
            if (handle.material) {
                const mat = handle.material as StandardMaterial;
                if (handle.name.includes("x")) {
                    mat.emissiveColor = new Color3(0.5, 0, 0);
                } else if (handle.name.includes("y")) {
                    mat.emissiveColor = new Color3(0, 0.5, 0);
                } else if (handle.name.includes("z")) {
                    mat.emissiveColor = new Color3(0, 0, 0.5);
                }
            }
        });
    }
    
    /**
     * Установить callback для изменений трансформации
     */
    setOnTransformChange(callback: (transform: GizmoTransform) => void): void {
        this.onTransformChange = callback;
    }
    
    /**
     * Обновить gizmo (вызывать каждый кадр)
     */
    update(): void {
        if (this.targetMesh && this.gizmoRoot) {
            this.updateGizmoPosition();
        }
    }
    
    /**
     * Показать/скрыть gizmo
     */
    setVisible(visible: boolean): void {
        if (this.gizmoRoot) {
            this.gizmoRoot.setEnabled(visible && this.targetMesh !== null);
        }
    }
    
    /**
     * Очистить ресурсы
     */
    dispose(): void {
        if (this.translateGizmo) {
            this.translateGizmo.dispose();
            this.translateGizmo = null;
        }
        if (this.rotateGizmo) {
            this.rotateGizmo.dispose();
            this.rotateGizmo = null;
        }
        if (this.scaleGizmo) {
            this.scaleGizmo.dispose();
            this.scaleGizmo = null;
        }
        if (this.gizmoRoot) {
            this.gizmoRoot.dispose();
            this.gizmoRoot = null;
        }
        
        this.translateHandles.clear();
        this.rotateHandles.clear();
        this.scaleHandles.clear();
        
        if (this.xMaterial) this.xMaterial.dispose();
        if (this.yMaterial) this.yMaterial.dispose();
        if (this.zMaterial) this.zMaterial.dispose();
        if (this.selectedMaterial) this.selectedMaterial.dispose();
    }
}

export default GizmoSystem;

