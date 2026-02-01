/**
 * Визуализация траектории полёта снаряда в игре
 * Показывает реальную параболическую траекторию при прицеливании
 */

import {
    Scene,
    LinesMesh,
    CreateLines,
    StandardMaterial,
    Color3,
    Vector3
} from "@babylonjs/core";
import { calculateTrajectory } from "./tankShooting";
import { CannonType } from "../tankTypes";

export interface TrajectoryLine {
    mesh: LinesMesh | null;
    material: StandardMaterial | null;
    isVisible: boolean;
}

/**
 * Создает визуализацию траектории снаряда
 */
export function createTrajectoryLine(
    scene: Scene,
    cannonType: CannonType,
    startPosition: Vector3,
    direction: Vector3,
    maxDistance: number = 300
): LinesMesh | null {
    if (!scene) return null;
    
    // Параметры снаряда
    const speed = cannonType.projectileSpeed || 800; // м/с
    const gravity = 0.3; // Коэффициент гравитации (стандартное значение)
    
    // Вычисляем точки траектории
    const points: Vector3[] = [];
    const timeStep = 0.05; // секунды (меньше шаг = более плавная кривая)
    const maxTime = maxDistance / speed; // максимальное время полета
    
    for (let t = 0; t <= maxTime; t += timeStep) {
        const point = calculateTrajectory(startPosition, direction, speed, gravity, t);
        points.push(point);
        
        // Останавливаемся, если снаряд упал на землю
        if (point.y < startPosition.y - 0.5) {
            break;
        }
        
        // Ограничиваем максимальное расстояние
        const distance = Vector3.Distance(startPosition, point);
        if (distance > maxDistance) {
            break;
        }
    }
    
    if (points.length < 2) return null;
    
    // Создаем линию траектории
    const trajectoryLine = CreateLines(
        "gameTrajectoryLine",
        {
            points: points,
            updatable: true // Можно обновлять
        },
        scene
    );
    
    // Материал траектории - яркий зеленый с прозрачностью
    const material = new StandardMaterial("gameTrajectoryMat", scene);
    material.emissiveColor = new Color3(0, 1, 0); // Яркий зеленый
    material.diffuseColor = new Color3(0, 0.8, 0);
    material.alpha = 0.7; // Полупрозрачный
    material.disableLighting = true; // Не зависит от освещения
    
    trajectoryLine.color = new Color3(0, 1, 0);
    trajectoryLine.material = material;
    
    // Делаем линию более заметной
    (trajectoryLine as any).lineWidth = 2;
    
    return trajectoryLine;
}

/**
 * Обновляет существующую линию траектории
 */
export function updateTrajectoryLine(
    line: LinesMesh | null,
    scene: Scene,
    cannonType: CannonType,
    startPosition: Vector3,
    direction: Vector3,
    maxDistance: number = 300
): LinesMesh | null {
    if (!scene) return null;
    
    // Параметры снаряда
    const speed = cannonType.projectileSpeed || 800;
    const gravity = 0.3;
    
    // Вычисляем новые точки траектории
    const points: Vector3[] = [];
    const timeStep = 0.05;
    const maxTime = maxDistance / speed;
    
    for (let t = 0; t <= maxTime; t += timeStep) {
        const point = calculateTrajectory(startPosition, direction, speed, gravity, t);
        points.push(point);
        
        if (point.y < startPosition.y - 0.5) {
            break;
        }
        
        const distance = Vector3.Distance(startPosition, point);
        if (distance > maxDistance) {
            break;
        }
    }
    
    if (points.length < 2) {
        if (line) {
            line.setEnabled(false);
        }
        return line;
    }
    
    // Если линия существует, удаляем её и создаем новую (CreateLines не поддерживает обновление)
    if (line) {
        line.dispose();
    }
    
    // Создаем новую линию
    const newLine = CreateLines(
        "gameTrajectoryLine",
        {
            points: points,
            updatable: true
        },
        scene
    );
    
    // Применяем материал
    const material = new StandardMaterial("gameTrajectoryMat", scene);
    material.emissiveColor = new Color3(0, 1, 0); // Яркий зеленый
    material.diffuseColor = new Color3(0, 0.8, 0);
    material.alpha = 0.7;
    material.disableLighting = true;
    
    newLine.color = new Color3(0, 1, 0);
    newLine.material = material;
    (newLine as any).lineWidth = 2;
    
    newLine.setEnabled(true);
    return newLine;
}

/**
 * Удаляет визуализацию траектории
 */
export function disposeTrajectoryLine(line: LinesMesh | null): void {
    if (line) {
        line.dispose();
    }
}

