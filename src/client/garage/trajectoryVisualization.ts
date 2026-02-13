/**
 * Trajectory Visualization Module for Garage
 * Визуализация траектории выбранной пушки в гараже с тестовыми целями
 */

import {
    Scene,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    LinesMesh,
    CreateLines
} from "@babylonjs/core";
import { getCannonById, type CannonType } from "../tankTypes";
import { calculateTrajectory, calculateFlightTime } from "../tank/tankShooting";

/**
 * Тестовая цель для демонстрации траектории
 */
export interface TestTarget {
    mesh: Mesh;
    position: Vector3;
    distance: number;
}

/**
 * Визуализация траектории
 */
export interface TrajectoryVisualization {
    line: LinesMesh | null;
    targets: TestTarget[];
    isVisible: boolean;
}

/**
 * Создает тестовые цели для демонстрации траектории
 */
export function createTestTargets(
    scene: Scene,
    cannonType: CannonType,
    tankPosition: Vector3,
    barrelDirection: Vector3
): TestTarget[] {
    const targets: TestTarget[] = [];
    
    // Создаем цели на разных расстояниях: 50м, 100м, 150м, 200м
    const distances = [50, 100, 150, 200];
    
    distances.forEach((distance, index) => {
        // Вычисляем позицию цели
        const targetPos = tankPosition.add(barrelDirection.scale(distance));
        targetPos.y = tankPosition.y; // На той же высоте
        
        // Создаем меш цели (box вместо cylinder)
        const target = MeshBuilder.CreateBox(
            `testTarget_${index}`,
            {
                width: 1.5,
                height: 2,
                depth: 1.5
            },
            scene
        );
        
        target.position = targetPos.clone();
        
        // Материал цели
        const material = new StandardMaterial(`testTargetMat_${index}`, scene);
        material.diffuseColor = new Color3(1, 0.2, 0.2); // Красный
        material.emissiveColor = new Color3(0.3, 0, 0);
        material.specularColor = Color3.Black();
        target.material = material;
        
        // Добавляем кольцо для лучшей видимости (box вместо torus)
        const ring = MeshBuilder.CreateBox(
            `testTargetRing_${index}`,
            {
                width: 1.8,
                height: 0.1,
                depth: 1.8
            },
            scene
        );
        ring.position = targetPos.clone();
        ring.position.y += 1;
        ring.parent = target;
        
        const ringMat = new StandardMaterial(`testTargetRingMat_${index}`, scene);
        ringMat.diffuseColor = new Color3(1, 1, 0); // Желтый
        ringMat.emissiveColor = new Color3(0.2, 0.2, 0);
        ring.material = ringMat;
        
        targets.push({
            mesh: target,
            position: targetPos.clone(),
            distance: distance
        });
    });
    
    return targets;
}

/**
 * Вычисляет и визуализирует траекторию снаряда
 */
export function visualizeTrajectory(
    scene: Scene,
    cannonType: CannonType,
    startPosition: Vector3,
    direction: Vector3,
    maxDistance: number = 200
): LinesMesh | null {
    if (!scene) return null;
    
    // Параметры снаряда из типа пушки
    const speed = cannonType.projectileSpeed || 800; // м/с
    // ИСПРАВЛЕНО: Используем стандартную гравитацию (9.81 м/с²) с коэффициентом 0.3
    // Это соответствует стандартному поведению снарядов в игре
    const gravity = 0.3; // коэффициент гравитации (стандартное значение)
    
    // Вычисляем точки траектории
    const points: Vector3[] = [];
    const timeStep = 0.1; // секунды
    const maxTime = maxDistance / speed; // максимальное время полета
    
    for (let t = 0; t <= maxTime; t += timeStep) {
        const point = calculateTrajectory(startPosition, direction, speed, gravity, t);
        points.push(point);
        
        // Останавливаемся, если снаряд упал на землю
        if (point.y < startPosition.y - 0.5) {
            break;
        }
    }
    
    if (points.length < 2) return null;
    
    // Создаем линию траектории
    const trajectoryLine = CreateLines(
        "trajectoryLine",
        {
            points: points,
            updatable: false
        },
        scene
    );
    
    // Материал траектории
    const material = new StandardMaterial("trajectoryMat", scene);
    material.emissiveColor = new Color3(0, 1, 0); // Зеленый
    material.diffuseColor = new Color3(0, 0.8, 0);
    material.alpha = 0.8;
    trajectoryLine.color = new Color3(0, 1, 0);
    trajectoryLine.material = material;
    
    return trajectoryLine;
}

/**
 * Обновляет визуализацию траектории при изменении пушки
 */
export function updateTrajectoryVisualization(
    visualization: TrajectoryVisualization | null,
    scene: Scene | null,
    cannonType: CannonType | null,
    tankPosition: Vector3 | null,
    barrelDirection: Vector3 | null
): TrajectoryVisualization | null {
    if (!scene || !cannonType || !tankPosition || !barrelDirection) {
        // Очищаем существующую визуализацию
        if (visualization) {
            if (visualization.line) {
                visualization.line.dispose();
            }
            visualization.targets.forEach(target => {
                target.mesh.dispose();
            });
        }
        return null;
    }
    
    // Очищаем старую визуализацию
    if (visualization) {
        if (visualization.line) {
            visualization.line.dispose();
        }
        visualization.targets.forEach(target => {
            target.mesh.dispose();
        });
    }
    
    // Вычисляем позицию дула
    const barrelLength = cannonType.barrelLength || 2;
    const muzzlePosition = tankPosition.add(barrelDirection.scale(barrelLength));
    muzzlePosition.y += 0.5; // Немного выше
    
    // Создаем новую визуализацию
    const line = visualizeTrajectory(scene, cannonType, muzzlePosition, barrelDirection);
    const targets = createTestTargets(scene, cannonType, muzzlePosition, barrelDirection);
    
    return {
        line,
        targets,
        isVisible: true
    };
}

/**
 * Скрывает/показывает визуализацию траектории
 */
export function setTrajectoryVisibility(
    visualization: TrajectoryVisualization | null,
    visible: boolean
): void {
    if (!visualization) return;
    
    visualization.isVisible = visible;
    
    if (visualization.line) {
        visualization.line.setEnabled(visible);
    }
    
    visualization.targets.forEach(target => {
        target.mesh.setEnabled(visible);
    });
}

/**
 * Очищает визуализацию траектории
 */
export function disposeTrajectoryVisualization(
    visualization: TrajectoryVisualization | null
): void {
    if (!visualization) return;
    
    if (visualization.line) {
        visualization.line.dispose();
    }
    
    visualization.targets.forEach(target => {
        target.mesh.dispose();
    });
}

