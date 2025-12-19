/**
 * Tank Chassis Creation Module
 * Вынесенная логика создания корпусов танков из tankController.ts
 * 
 * ВАЖНО: Только простой прямоугольный корпус без деталей!
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { ChassisType } from "../tankTypes";

export interface ChassisAnimationElements {
    stealthActive?: boolean;
    stealthMesh?: Mesh;
    hoverThrusters?: Mesh[];
    shieldMesh?: Mesh;
    shieldActive?: boolean;
    droneMeshes?: Mesh[];
    commandAura?: Mesh;
    energyBoosters?: Mesh[];
    animationTime?: number;
}

/**
 * Создает уникальный корпус танка по типу
 */
export function createUniqueChassis(
    chassisType: ChassisType,
    scene: Scene,
    position: Vector3,
    animationElements: ChassisAnimationElements
): Mesh {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    const color = Color3.FromHexString(chassisType.color);
    
    // Base chassis mesh - более выразительные пропорции
    let chassis: Mesh;
    
    switch (chassisType.id) {
        case "light":
            // Light - Прототип: БТ-7 / Т-70 - Узкий, низкий, обтекаемый
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 0.75, 
                height: h * 0.7, 
                depth: d * 1.2 
            }, scene);
            break;
            
        case "scout":
            // Scout - Прототип: Т-70 / БТ-7 - Очень маленький, клиновидный
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 0.7, 
                height: h * 0.65, 
                depth: d * 0.85 
            }, scene);
            break;
            
        case "heavy":
            // Heavy - Прототип: ИС-2 / ИС-7 - Огромный, массивный, квадратный
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.08, 
                height: h * 1.2, 
                depth: d * 1.08 
            }, scene);
            break;
            
        case "assault":
            // Assault - ШИРОКИЙ, АГРЕССИВНЫЙ, УГЛОВАТЫЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.12, 
                height: h * 1.1, 
                depth: d * 1.05 
            }, scene);
            break;
            
        case "stealth":
            // Stealth - ОЧЕНЬ НИЗКИЙ, ПЛОСКИЙ, УГЛОВАТЫЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.05, 
                height: h * 0.7, 
                depth: d * 1.15 
            }, scene);
            break;
            
        case "hover":
            // Hover - Прототип: Концепт на воздушной подушке - Округлый, обтекаемый
            const hoverSize = Math.max(w, d) * 1.1;
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: hoverSize,
                height: h * 0.95,
                depth: hoverSize
            }, scene);
            break;
            
        case "siege":
            // Siege - ОГРОМНЫЙ, МАССИВНЫЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.25, 
                height: h * 1.35, 
                depth: d * 1.2 
            }, scene);
            break;
            
        case "racer":
            // Racer - ЭКСТРЕМАЛЬНО НИЗКИЙ, ДЛИННЫЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 0.75, 
                height: h * 0.55, 
                depth: d * 1.3 
            }, scene);
            break;
            
        case "amphibious":
            // Amphibious - ШИРОКИЙ, С ПОПЛАВКАМИ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.15, 
                height: h * 1.1, 
                depth: d * 1.1 
            }, scene);
            break;
            
        case "shield":
            // Shield - Прототип: Т-72 + генератор щита - Широкий, с генератором
            const shieldSize = Math.max(w, d) * 1.2;
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: shieldSize,
                height: h * 1.1,
                depth: shieldSize
            }, scene);
            break;
            
        case "drone":
            // Drone - СРЕДНИЙ, С ПЛАТФОРМАМИ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.1, 
                height: h * 1.12, 
                depth: d * 1.05 
            }, scene);
            break;
            
        case "artillery":
            // Artillery - ШИРОКИЙ, ВЫСОКИЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.2, 
                height: h * 1.25, 
                depth: d * 1.15 
            }, scene);
            break;
            
        case "destroyer":
            // Destroyer - ОЧЕНЬ ДЛИННЫЙ, НИЗКИЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 0.85, 
                height: h * 0.75, 
                depth: d * 1.4 
            }, scene);
            break;
            
        case "command":
            // Command - ВЫСОКИЙ, С АНТЕННАМИ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.1, 
                height: h * 1.2, 
                depth: d * 1.1 
            }, scene);
            break;
            
        default: // medium
            // Medium - СБАЛАНСИРОВАННЫЙ, КЛАССИЧЕСКИЙ
            chassis = MeshBuilder.CreateBox("tankHull", { 
                width: w * 1.0, 
                height: h * 1.0, 
                depth: d * 1.0 
            }, scene);
    }
    
    chassis.position.copyFrom(position);
    
    // Base material - улучшенный low-poly стиль
    const mat = new StandardMaterial("tankMat", scene);
    mat.diffuseColor = color;
    mat.specularColor = Color3.Black();
    mat.disableLighting = false;
    mat.freeze();
    chassis.material = mat;
    
    // Add visual details based on type - ОТКЛЮЧЕНО: оставляем только простой прямоугольник
    // addChassisDetails(chassis, chassisType, scene, color, animationElements);
    
    return chassis;
}

/**
 * Добавляет детали к корпусу танка
 * ОТКЛЮЧЕНО: оставляем только простой прямоугольник корпуса
 * ВСЕ ДЕТАЛИ УДАЛЕНЫ - функция оставлена для совместимости, но ничего не делает
 */
export function addChassisDetails(
    chassis: Mesh,
    chassisType: ChassisType,
    scene: Scene,
    baseColor: Color3,
    animationElements: ChassisAnimationElements
): void {
    // ВСЕ ДЕТАЛИ УДАЛЕНЫ - оставляем только простой прямоугольник корпуса
    return;
}
