/**
 * Physics Visualizer - Визуализация физики (векторы, коллизии, центр масс)
 */

import { Scene, Vector3, MeshBuilder, StandardMaterial, Color3, LinesMesh, Mesh } from "@babylonjs/core";
import { logger } from "./utils/logger";

export interface PhysicsVisualizationOptions {
    showVectors: boolean;
    showCollisions: boolean;
    showCenterOfMass: boolean;
    showVelocity: boolean;
    showAngularVelocity: boolean;
    vectorScale: number;
    colorScheme: 'default' | 'rainbow' | 'heat';
}

export class PhysicsVisualizer {
    private scene: Scene;
    private options: PhysicsVisualizationOptions;
    private visualizationMeshes: Map<string, Mesh[]> = new Map();
    private enabled: boolean = false;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.options = this.getDefaultOptions();
        this.loadOptions();
    }
    
    /**
     * Получить настройки по умолчанию
     */
    private getDefaultOptions(): PhysicsVisualizationOptions {
        return {
            showVectors: false,
            showCollisions: false,
            showCenterOfMass: false,
            showVelocity: false,
            showAngularVelocity: false,
            vectorScale: 1.0,
            colorScheme: 'default'
        };
    }
    
    /**
     * Включение/выключение визуализации
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.clearVisualizations();
        }
    }
    
    /**
     * Обновление опций
     */
    updateOptions(options: Partial<PhysicsVisualizationOptions>): void {
        this.options = { ...this.options, ...options };
        this.saveOptions();
        this.clearVisualizations();
    }
    
    /**
     * Визуализация физики объекта
     */
    visualizePhysics(mesh: Mesh, physicsBody: any): void {
        if (!this.enabled) return;
        
        const key = mesh.id || mesh.name;
        this.clearObjectVisualization(key);
        
        const meshes: Mesh[] = [];
        
        // Векторы сил
        if (this.options.showVectors && physicsBody) {
            const force = physicsBody.getAppliedForce?.() || new Vector3(0, 0, 0);
            if (force.length() > 0.01) {
                const forceMesh = this.createVector(mesh.position, force, Color3.Green(), "force");
                meshes.push(forceMesh);
            }
        }
        
        // Скорость
        if (this.options.showVelocity && physicsBody) {
            const velocity = physicsBody.getLinearVelocity?.() || new Vector3(0, 0, 0);
            if (velocity.length() > 0.01) {
                const velocityMesh = this.createVector(mesh.position, velocity, Color3.Blue(), "velocity");
                meshes.push(velocityMesh);
            }
        }
        
        // Угловая скорость
        if (this.options.showAngularVelocity && physicsBody) {
            const angularVel = physicsBody.getAngularVelocity?.() || new Vector3(0, 0, 0);
            if (angularVel.length() > 0.01) {
                const angularMesh = this.createVector(mesh.position, angularVel, Color3.Red(), "angular");
                meshes.push(angularMesh);
            }
        }
        
        // Центр масс
        if (this.options.showCenterOfMass) {
            const com = physicsBody?.getCenterOfMass?.() || mesh.position;
            const comMesh = this.createCenterOfMassMarker(com);
            meshes.push(comMesh);
        }
        
        // Коллизии (упрощённая версия)
        if (this.options.showCollisions && physicsBody) {
            // Можно добавить визуализацию точек контакта
        }
        
        this.visualizationMeshes.set(key, meshes);
    }
    
    /**
     * Визуализация силы (для совместимости с планом)
     */
    visualizeForce(mesh: Mesh, force: Vector3, color: Color3 = Color3.Green()): void {
        if (!this.enabled) return;
        const key = `${mesh.id || mesh.name}_force`;
        this.clearObjectVisualization(key);
        const forceMesh = this.createVector(mesh.position, force, color, "force");
        this.visualizationMeshes.set(key, [forceMesh]);
    }
    
    /**
     * Визуализация коллизии (для совместимости с планом)
     */
    visualizeCollision(point: Vector3, normal: Vector3): void {
        if (!this.enabled) return;
        
        const sphere = MeshBuilder.CreateSphere(`collision_${Date.now()}`, { diameter: 0.2, segments: 8 }, this.scene);
        sphere.position = point;
        const material = new StandardMaterial(`collision_mat_${Date.now()}`, this.scene);
        material.emissiveColor = Color3.Red();
        material.disableLighting = true;
        sphere.material = material;
        
        // Линия нормали
        const normalLine = MeshBuilder.CreateLines(`normal_${Date.now()}`, {
            points: [point, point.add(normal.scale(1))]
        }, this.scene);
        normalLine.color = Color3.Yellow();
        
        const key = `collision_${Date.now()}`;
        this.visualizationMeshes.set(key, [sphere, normalLine]);
        
        // Автоматическое удаление через 2 секунды
        setTimeout(() => {
            sphere.dispose();
            normalLine.dispose();
            this.visualizationMeshes.delete(key);
        }, 2000);
    }
    
    /**
     * Визуализация центра масс (для совместимости с планом)
     */
    visualizeCenterOfMass(mesh: Mesh, physicsBody: any): void {
        if (!this.enabled) return;
        const com = physicsBody?.getCenterOfMass?.() || mesh.position;
        const comMesh = this.createCenterOfMassMarker(com);
        const key = `${mesh.id || mesh.name}_com`;
        this.clearObjectVisualization(key);
        this.visualizationMeshes.set(key, [comMesh]);
    }
    
    /**
     * Установка цели для визуализации (для совместимости с PhysicsPanel)
     */
    setTarget(mesh: Mesh, physicsBody: any): void {
        this.visualizePhysics(mesh, physicsBody);
    }
    
    /**
     * Создание вектора
     */
    private createVector(start: Vector3, direction: Vector3, color: Color3, name: string): Mesh {
        const scale = this.options.vectorScale;
        const scaledDir = direction.scale(scale);
        const end = start.add(scaledDir);
        
        const points = [start, end];
        const line = MeshBuilder.CreateLines(`vector_${name}_${Date.now()}`, { points }, this.scene);
        line.color = color;
        
        // Стрелка на конце
        const arrowSize = scaledDir.length() * 0.1;
        const arrowDir = scaledDir.normalize();
        const arrowBase = end.subtract(arrowDir.scale(arrowSize));
        
        // Создаём стрелку из линий
        const arrowPoints = [
            end,
            arrowBase.add(arrowDir.scale(arrowSize * 0.3).add(new Vector3(0, arrowSize * 0.3, 0))),
            end,
            arrowBase.add(arrowDir.scale(arrowSize * 0.3).add(new Vector3(0, -arrowSize * 0.3, 0)))
        ];
        const arrow = MeshBuilder.CreateLines(`arrow_${name}_${Date.now()}`, { points: arrowPoints }, this.scene);
        arrow.color = color;
        
        // Группируем в один mesh (упрощённо)
        return line;
    }
    
    /**
     * Создание маркера центра масс
     */
    private createCenterOfMassMarker(position: Vector3): Mesh {
        const sphere = MeshBuilder.CreateSphere(`com_${Date.now()}`, { diameter: 0.2 }, this.scene);
        sphere.position = position;
        
        const material = new StandardMaterial(`com_mat_${Date.now()}`, this.scene);
        material.emissiveColor = Color3.Yellow();
        material.disableLighting = true;
        sphere.material = material;
        
        return sphere;
    }
    
    /**
     * Очистка визуализации объекта
     */
    private clearObjectVisualization(key: string): void {
        const meshes = this.visualizationMeshes.get(key);
        if (meshes) {
            meshes.forEach(mesh => mesh.dispose());
            this.visualizationMeshes.delete(key);
        }
    }
    
    /**
     * Очистка всех визуализаций
     */
    clearVisualizations(): void {
        this.visualizationMeshes.forEach((meshes) => {
            meshes.forEach(mesh => mesh.dispose());
        });
        this.visualizationMeshes.clear();
    }
    
    /**
     * Получить опции
     */
    getOptions(): PhysicsVisualizationOptions {
        return { ...this.options };
    }
    
    /**
     * Загрузка опций из localStorage
     */
    private loadOptions(): void {
        try {
            const saved = localStorage.getItem('ptx_physics_visualization');
            if (saved) {
                this.options = { ...this.options, ...JSON.parse(saved) };
            }
        } catch (error) {
            logger.warn("[PhysicsVisualizer] Failed to load options:", error);
        }
    }
    
    /**
     * Сохранение опций в localStorage
     */
    private saveOptions(): void {
        try {
            localStorage.setItem('ptx_physics_visualization', JSON.stringify(this.options));
        } catch (error) {
            logger.warn("[PhysicsVisualizer] Failed to save options:", error);
        }
    }
    
    /**
     * Очистка при уничтожении
     */
    dispose(): void {
        this.clearVisualizations();
    }
}

