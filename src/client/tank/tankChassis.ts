/**
 * Tank Chassis Creation Module
 * Вынесенная логика создания корпусов танков из tankController.ts
 * 
 * ВАЖНО: Все позиции деталей должны использовать addZFightingOffset() для предотвращения z-fighting!
 * Никогда не используйте прямой new Vector3() для позиций деталей, которые могут соприкасаться с основным мешем.
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
// All shapes use CreateBox for rectangular design
import { ChassisType } from "../tankTypes";
import { addZFightingOffset } from "./zFightingFix";

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
    
    // Add visual details based on type
    addChassisDetails(chassis, chassisType, scene, color, animationElements);
    
    return chassis;
}

/**
 * Добавляет детали к корпусу танка
 */
export function addChassisDetails(
    chassis: Mesh,
    chassisType: ChassisType,
    scene: Scene,
    baseColor: Color3,
    animationElements: ChassisAnimationElements
): void {
    const w = chassisType.width;
    const h = chassisType.height;
    const d = chassisType.depth;
    
    // Armor plates material (darker) - улучшенный low-poly
    const armorMat = new StandardMaterial("armorMat", scene);
    armorMat.diffuseColor = baseColor.scale(0.65);
    armorMat.specularColor = Color3.Black();
    armorMat.freeze();
    
    // Light material (brighter accents)
    const accentMat = new StandardMaterial("accentMat", scene);
    accentMat.diffuseColor = baseColor.scale(1.2);
    accentMat.specularColor = Color3.Black();
    accentMat.freeze();
    
    switch (chassisType.id) {
        case "light":
            // Light - Прототип: БТ-7 - Наклонная лобовая броня, воздухозаборники, спойлер
            // Наклонная лобовая плита (угол 60°)
            const lightFront = MeshBuilder.CreateBox("lightFront", {
                width: w * 0.88,
                height: h * 0.6,
                depth: 0.2
            }, scene);
            lightFront.position = addZFightingOffset(new Vector3(0, h * 0.15, d * 0.52), "forward");
            lightFront.rotation.x = -Math.PI / 6;  // Наклон 30°
            lightFront.parent = chassis;
            lightFront.material = armorMat;
            
            // Воздухозаборники (угловатые)
            for (let i = 0; i < 2; i++) {
                const intake = MeshBuilder.CreateBox(`intake${i}`, {
                    width: 0.3,
                    height: h * 0.65,
                    depth: 0.35
                }, scene);
                intake.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45), "forward");
                intake.parent = chassis;
                intake.material = accentMat;
            }
            
            // Задний спойлер (угловатый)
            const lightSpoiler = MeshBuilder.CreateBox("lightSpoiler", {
                width: w * 1.2,
                height: 0.2,
                depth: 0.25
            }, scene);
            lightSpoiler.position = addZFightingOffset(new Vector3(0, h * 0.5, -d * 0.48), "backward");
            lightSpoiler.parent = chassis;
            lightSpoiler.material = accentMat;
            
            // Боковые обтекатели (угловатые)
            for (let i = 0; i < 2; i++) {
                const fairing = MeshBuilder.CreateBox(`lightFairing${i}`, {
                    width: 0.15,
                    height: h * 0.75,
                    depth: d * 0.55
                }, scene);
                fairing.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2), "x");
                fairing.parent = chassis;
                fairing.material = accentMat;
            }
            
            // Люки на крыше (2 штуки)
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`lightHatch${i}`, {
                    width: 0.2,
                    height: 0.08,
                    depth: 0.2
                }, scene);
                hatch.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1), "up");
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Выхлопная труба сзади
            const exhaust = MeshBuilder.CreateBox("lightExhaust", {
                width: 0.15,
                height: 0.15,
                depth: 0.2
            }, scene);
            exhaust.position = addZFightingOffset(new Vector3(w * 0.35, h * 0.2, -d * 0.48), "forward");
            exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Фары спереди (маленькие, угловатые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`lightHeadlight${i}`, {
                    width: 0.08,
                    height: 0.08,
                    depth: 0.06
                }, scene);
                headlight.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`lightHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Инструменты: лопата и топор на корме
            const shovel = MeshBuilder.CreateBox("lightShovel", {
                width: 0.12,
                height: 0.3,
                depth: 0.02
            }, scene);
            shovel.position = addZFightingOffset(new Vector3(-w * 0.4, h * 0.2, -d * 0.48), "forward");
            shovel.parent = chassis;
            shovel.material = armorMat;
            
            const axe = MeshBuilder.CreateBox("lightAxe", {
                width: 0.25,
                height: 0.08,
                depth: 0.02
            }, scene);
            axe.position = addZFightingOffset(new Vector3(-w * 0.3, h * 0.25, -d * 0.48), "forward");
            axe.parent = chassis;
            axe.material = armorMat;
            
            // Вентиляционные решетки по бокам (улучшенные)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`lightVent${i}`, {
                    width: 0.05,
                    height: 0.12,
                    depth: 0.15
                }, scene);
                vent.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1), "x");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`lightVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
                
                // Детали решетки
                for (let j = 0; j < 3; j++) {
                    const ventDetail = MeshBuilder.CreateBox(`lightVentDetail${i}_${j}`, {
                        width: 0.03,
                        height: 0.1,
                        depth: 0.02
                    }, scene);
                    ventDetail.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1 + (j - 1) * 0.05), "x");
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископ на люке
            const periscope = MeshBuilder.CreateBox("lightPeriscope", {
                width: 0.06,
                height: 0.15,
                depth: 0.06
            }, scene);
            periscope.position = addZFightingOffset(new Vector3(0, h * 0.55, -d * 0.1), "up");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial("lightPeriscopeMat", scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
            
            // Дополнительная оптика - бинокль на корпусе
            const binocular = MeshBuilder.CreateBox("lightBinocular", {
                width: 0.2,
                height: 0.08,
                depth: 0.12
            }, scene);
            binocular.position = addZFightingOffset(new Vector3(0, h * 0.48, d * 0.4), "up");
            binocular.parent = chassis;
            const binocularMat = new StandardMaterial("lightBinocularMat", scene);
            binocularMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            binocular.material = binocularMat;
            
            // Линзы бинокля
            for (let i = 0; i < 2; i++) {
                const lens = MeshBuilder.CreateBox(`lightLens${i}`, {
                    width: 0.06,
                    height: 0.02,
                    depth: 0.06
                }, scene);
                lens.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * 0.06, 0, 0.06), "forward");
                lens.parent = binocular;
                const lensMat = new StandardMaterial(`lightLensMat${i}`, scene);
                lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                lens.material = lensMat;
            }
            
            // Дополнительные броневые накладки на лобовой части
            for (let i = 0; i < 3; i++) {
                const armorPlate = MeshBuilder.CreateBox(`lightArmorPlate${i}`, {
                    width: w * 0.25,
                    height: h * 0.15,
                    depth: 0.08
                }, scene);
                armorPlate.position = addZFightingOffset(new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48), "forward");
                armorPlate.parent = chassis;
                armorPlate.material = armorMat;
            }
            
            // Верхние вентиляционные решетки на крыше (улучшенные)
            for (let i = 0; i < 3; i++) {
                const roofVent = MeshBuilder.CreateBox(`lightRoofVent${i}`, {
                    width: 0.2,
                    height: 0.05,
                    depth: 0.15
                }, scene);
                roofVent.position = addZFightingOffset(new Vector3((i - 1) * w * 0.3, h * 0.47, d * 0.2), "up");
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`lightRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
                
                // Детали решетки
                for (let j = 0; j < 5; j++) {
                    const ventBar = MeshBuilder.CreateBox(`lightRoofVentBar${i}_${j}`, {
                        width: 0.02,
                        height: 0.04,
                        depth: 0.13
                    }, scene);
                    ventBar.position = addZFightingOffset(new Vector3((i - 1) * w * 0.3 + (j - 2) * 0.04, h * 0.47, d * 0.2), "up");
                    ventBar.parent = chassis;
                    ventBar.material = roofVentMat;
                }
            }
            
            // Радиоантенна сзади
            const antenna = MeshBuilder.CreateBox("lightAntenna", {
                width: 0.02,
                height: 0.4,
                depth: 0.02
            }, scene);
            antenna.position = addZFightingOffset(new Vector3(0, h * 0.6, -d * 0.4), "up");
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial("lightAntennaMat", scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
            
            // Основание антенны
            const antennaBase = MeshBuilder.CreateBox("lightAntennaBase", {
                width: 0.08,
                height: 0.08,
                depth: 0.08
            }, scene);
            antennaBase.position = addZFightingOffset(new Vector3(0, h * 0.52, -d * 0.4), "up");
            antennaBase.parent = chassis;
            antennaBase.material = armorMat;
            
            // Боковые броневые экраны - уменьшены для избежания глитчей
            for (let i = 0; i < 2; i++) {
                const sideArmor = MeshBuilder.CreateBox(`lightSideArmor${i}`, {
                    width: 0.08,         // Уменьшено с 0.12
                    height: h * 0.35,    // Уменьшено с h * 0.5
                    depth: d * 0.2       // Уменьшено с d * 0.3
                }, scene);
                sideArmor.position = addZFightingOffset(new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, d * 0.05), "x");
                sideArmor.parent = chassis;
                sideArmor.material = armorMat;
            }
            
            // Дополнительные фары на боковых панелях
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`lightSideLight${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.04
                }, scene);
                sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.05,
                    -d * 0.2
                ), "backward");
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`lightSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.8, 0.7, 0.4);
                sideLightMat.emissiveColor = new Color3(0.2, 0.15, 0.1);
                sideLight.material = sideLightMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`lightTailLight${i}`, {
                    width: 0.05,
                    height: 0.08,
                    depth: 0.03
                }, scene);
                tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.15,
                    -d * 0.49
                ), "forward");
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`lightTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Детали гусениц - катки и поддерживающие ролики
            for (let i = 0; i < 6; i++) {
                const wheel = MeshBuilder.CreateBox(`lightWheel${i}`, {
                    width: 0.2,
                    height: 0.2,
                    depth: 0.15
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.52,
                    -h * 0.3,
                    -d * 0.4 + i * d * 0.15
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки на бронеплитах (детали брони)
            for (let i = 0; i < 12; i++) {
                const rivet = MeshBuilder.CreateBox(`lightRivet${i}`, {
                    width: 0.04,
                    height: 0.04,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 12;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.4,
                    h * 0.2 + Math.sin(angle) * h * 0.2,
                    d * 0.3
                ), "x");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони (линии соединения плит)
            for (let i = 0; i < 4; i++) {
                const seam = MeshBuilder.CreateBox(`lightSeam${i}`, {
                    width: i < 2 ? w * 0.9 : 0.05,
                    height: i < 2 ? 0.03 : h * 0.8,
                    depth: i < 2 ? 0.03 : 0.05
                }, scene);
                if (i < 2) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.3, d * 0.4), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 2 ? -1 : 1) * w * 0.45,
                    0,
                    d * 0.2
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`lightSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "scout":
            // Scout - Прототип: Т-70 - Острый клиновидный нос, минимальный профиль
            // Острый клиновидный нос (угол 45°)
            const scoutNose = MeshBuilder.CreateBox("scoutNose", {
                width: w * 0.8,
                height: h * 0.7,
                depth: 0.4
            }, scene);
            scoutNose.position = addZFightingOffset(new Vector3(0, 0, d * 0.5), "forward");
            scoutNose.rotation.x = -Math.PI / 4;  // Наклон 45°
            scoutNose.parent = chassis;
            scoutNose.material = accentMat;
            
            // Боковые крылья (угловатые)
            for (let i = 0; i < 2; i++) {
                const wing = MeshBuilder.CreateBox(`scoutWing${i}`, {
                    width: 0.15,
                    height: h * 0.85,
                    depth: d * 0.6
                }, scene);
                wing.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    -h * 0.05,
                    d * 0.3
                ), "down");
                wing.parent = chassis;
                wing.material = accentMat;
            }
            
            // Задний диффузор (угловатый)
            const diffuser = MeshBuilder.CreateBox("scoutDiffuser", {
                width: w * 0.9,
                height: 0.15,
                depth: 0.2
            }, scene);
            diffuser.position = addZFightingOffset(new Vector3(0, -h * 0.42, -d * 0.45), "forward");
            diffuser.parent = chassis;
            diffuser.material = accentMat;
            
            // Один люк на крыше
            const scoutHatch = MeshBuilder.CreateBox("scoutHatch", {
                width: 0.18,
                height: 0.06,
                depth: 0.18
            }, scene);
            scoutHatch.position = addZFightingOffset(new Vector3(0, h * 0.42, 0), "up");
            scoutHatch.parent = chassis;
            scoutHatch.material = armorMat;
            
            // Радиоантенна на корме (угловатая)
            const scoutAntenna = MeshBuilder.CreateBox("scoutAntenna", {
                width: 0.02,
                height: 0.3,
                depth: 0.02
            }, scene);
            scoutAntenna.position = addZFightingOffset(new Vector3(0, h * 0.45, -d * 0.45), "forward");
            scoutAntenna.parent = chassis;
            scoutAntenna.material = armorMat;
            
            // Две фары (очень маленькие, скрытые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`scoutHeadlight${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.04
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.1,
                    d * 0.48
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`scoutHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.8, 0.8, 0.6);
                headlightMat.emissiveColor = new Color3(0.2, 0.2, 0.15);
                headlight.material = headlightMat;
            }
            
            // Скрытые вентиляционные решетки
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`scoutVent${i}`, {
                    width: 0.04,
                    height: 0.08,
                    depth: 0.12
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.05,
                    d * 0.15
                ), "x");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`scoutVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                vent.material = ventMat;
                
                // Детали решетки
                for (let j = 0; j < 3; j++) {
                    const ventBar = MeshBuilder.CreateBox(`scoutVentBar${i}_${j}`, {
                        width: 0.02,
                        height: 0.06,
                        depth: 0.1
                    }, scene);
                    ventBar.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.05,
                    d * 0.15 + (j - 1) * 0.04
                ), "x");
                    ventBar.parent = chassis;
                    ventBar.material = ventMat;
                }
            }
            
            // Перископ на люке
            const scoutPeriscope = MeshBuilder.CreateBox("scoutPeriscope", {
                width: 0.05,
                height: 0.12,
                depth: 0.05
            }, scene);
            scoutPeriscope.position = addZFightingOffset(new Vector3(0, h * 0.5, 0), "up");
            scoutPeriscope.parent = chassis;
            const scoutPeriscopeMat = new StandardMaterial("scoutPeriscopeMat", scene);
            scoutPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            scoutPeriscope.material = scoutPeriscopeMat;
            
            // Оптический прицел на передней части
            const scoutSight = MeshBuilder.CreateBox("scoutSight", {
                width: 0.1,
                height: 0.06,
                depth: 0.08
            }, scene);
            scoutSight.position = addZFightingOffset(new Vector3(0, h * 0.2, d * 0.48), "forward");
            scoutSight.parent = chassis;
            const scoutSightMat = new StandardMaterial("scoutSightMat", scene);
            scoutSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            scoutSight.material = scoutSightMat;
            
            // Линза прицела
            const scoutSightLens = MeshBuilder.CreateBox("scoutSightLens", {
                width: 0.05,
                height: 0.02,
                depth: 0.05
            }, scene);
            scoutSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.05), "forward");
            scoutSightLens.parent = scoutSight;
            const scoutLensMat = new StandardMaterial("scoutSightLensMat", scene);
            scoutLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            scoutLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            scoutSightLens.material = scoutLensMat;
            
            // Легкие броневые накладки на лобовой части
            for (let i = 0; i < 2; i++) {
                const frontArmor = MeshBuilder.CreateBox(`scoutFrontArmor${i}`, {
                    width: w * 0.25,
                    height: h * 0.12,
                    depth: 0.06
                }, scene);
                frontArmor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.2,
                    h * 0.02,
                    d * 0.48
                ), "forward");
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Выхлопная труба сзади (маленькая)
            const scoutExhaust = MeshBuilder.CreateBox("scoutExhaust", {
                width: 0.1,
                height: 0.1,
                depth: 0.15
            }, scene);
            scoutExhaust.position = addZFightingOffset(new Vector3(w * 0.3, h * 0.15, -d * 0.48), "forward");
            scoutExhaust.parent = chassis;
            scoutExhaust.material = armorMat;
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`scoutTailLight${i}`, {
                    width: 0.04,
                    height: 0.06,
                    depth: 0.03
                }, scene);
                tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.12,
                    -d * 0.49
                ), "forward");
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`scoutTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`scoutSideLight${i}`, {
                    width: 0.04,
                    height: 0.05,
                    depth: 0.04
                }, scene);
                sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.05,
                    -d * 0.2
                ), "backward");
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`scoutSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Верхняя вентиляционная решетка на крыше
            const scoutRoofVent = MeshBuilder.CreateBox("scoutRoofVent", {
                width: 0.15,
                height: 0.04,
                depth: 0.1
            }, scene);
            scoutRoofVent.position = addZFightingOffset(new Vector3(0, h * 0.44, d * 0.2), "up");
            scoutRoofVent.parent = chassis;
            const scoutRoofVentMat = new StandardMaterial("scoutRoofVentMat", scene);
            scoutRoofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            scoutRoofVent.material = scoutRoofVentMat;
            
            // Детали решетки
            for (let i = 0; i < 4; i++) {
                const ventBar = MeshBuilder.CreateBox(`scoutRoofVentBar${i}`, {
                    width: 0.02,
                    height: 0.03,
                    depth: 0.08
                }, scene);
                ventBar.position = addZFightingOffset(new Vector3(
                    (i - 1.5) * 0.04,
                    h * 0.44,
                    d * 0.2
                ), "up");
                ventBar.parent = chassis;
                ventBar.material = scoutRoofVentMat;
            }
            
            // Легкие броневые экраны по бокам - уменьшены для избежания глитчей
            for (let i = 0; i < 2; i++) {
                const sideArmor = MeshBuilder.CreateBox(`scoutSideArmor${i}`, {
                    width: 0.07,         // Уменьшено с 0.1
                    height: h * 0.3,     // Уменьшено с h * 0.4
                    depth: d * 0.18      // Уменьшено с d * 0.25
                }, scene);
                sideArmor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.06,
                    d * 0.08
                ), "x");
                sideArmor.parent = chassis;
                sideArmor.material = armorMat;
            }
            
            // Детали гусениц - катки (маленькие для scout)
            for (let i = 0; i < 6; i++) {
                const wheel = MeshBuilder.CreateBox(`scoutWheel${i}`, {
                    width: 0.18,
                    height: 0.18,
                    depth: 0.14
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.48,
                    -h * 0.28,
                    -d * 0.38 + i * d * 0.13
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки на бронеплитах (мало для scout)
            for (let i = 0; i < 10; i++) {
                const rivet = MeshBuilder.CreateBox(`scoutRivet${i}`, {
                    width: 0.04,
                    height: 0.04,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 10;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.38,
                    h * 0.15 + Math.sin(angle) * h * 0.15,
                    d * 0.3
                ), "x");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 4; i++) {
                const seam = MeshBuilder.CreateBox(`scoutSeam${i}`, {
                    width: i < 2 ? w * 0.85 : 0.04,
                    height: i < 2 ? 0.02 : h * 0.8,
                    depth: i < 2 ? 0.02 : 0.04
                }, scene);
                if (i < 2) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.08 + i * h * 0.2, d * 0.42), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 2 ? -1 : 1) * w * 0.46,
                    0,
                    d * 0.15
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`scoutSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "heavy":
            // Heavy - Прототип: ИС-2 / ИС-7 - Массивный тяжелый танк с мощной броней
            // Массивные бронеплиты со всех сторон
            const heavyPlates = [
                { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.35, h * 0.95, d * 0.8) },
                { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.35, h * 0.95, d * 0.8) },
                { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.4, 0.25) },
                { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 1.05, 0.3, d * 1.05) }
            ];
            heavyPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`heavyPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            // Верхняя бронеплита - ОЧЕНЬ БОЛЬШАЯ
            const topPlate = MeshBuilder.CreateBox("heavyTop", {
                width: w * 0.95,
                height: 0.25,
                depth: d * 0.85
            }, scene);
            topPlate.position = addZFightingOffset(new Vector3(0, h * 0.65, 0), "up");
            topPlate.parent = chassis;
            topPlate.material = armorMat;
            // Угловые усиления - БОЛЬШЕ
            for (let i = 0; i < 4; i++) {
                const corner = MeshBuilder.CreateBox(`heavyCorner${i}`, {
                    width: 0.3,
                    height: 0.3,
                    depth: 0.3
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.58;
                const posZ = (i < 2 ? -1 : 1) * d * 0.58;
                corner.position = addZFightingOffset(new Vector3(posX, h * 0.55, posZ), "up");
                corner.parent = chassis;
                corner.material = armorMat;
            }
            
            // Две фары спереди
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`heavyHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.15,
                    d * 0.5
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`heavyHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Две выхлопные трубы
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`heavyExhaust${i}`, {
                    width: 0.14,
                    height: 0.14,
                    depth: 0.2
                }, scene);
                exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.2,
                    -d * 0.48
                ), "forward");
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Инструменты: лопата, топор, канистра
            const heavyShovel = MeshBuilder.CreateBox("heavyShovel", {
                width: 0.15,
                height: 0.4,
                depth: 0.02
            }, scene);
            heavyShovel.position = addZFightingOffset(new Vector3(-w * 0.45, h * 0.2, -d * 0.45), "forward");
            heavyShovel.parent = chassis;
            heavyShovel.material = armorMat;
            
            const heavyAxe = MeshBuilder.CreateBox("heavyAxe", {
                width: 0.3,
                height: 0.1,
                depth: 0.02
            }, scene);
            heavyAxe.position = addZFightingOffset(new Vector3(-w * 0.35, h * 0.25, -d * 0.45), "forward");
            heavyAxe.parent = chassis;
            heavyAxe.material = armorMat;
            
            const heavyCanister = MeshBuilder.CreateBox("heavyCanister", {
                width: 0.14,
                height: 0.25,
                depth: 0.14
            }, scene);
            heavyCanister.position = addZFightingOffset(new Vector3(w * 0.45, h * 0.22, -d * 0.4), "forward");
            heavyCanister.parent = chassis;
            heavyCanister.material = armorMat;
            
            // Вентиляционные решетки (большие)
            for (let i = 0; i < 4; i++) {
                const vent = MeshBuilder.CreateBox(`heavyVent${i}`, {
                    width: 0.1,
                    height: 0.06,
                    depth: 0.12
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
                const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                vent.position = addZFightingOffset(new Vector3(posX, h * 0.5, posZ), "up");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`heavyVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
                
                // Детали решетки
                for (let j = 0; j < 5; j++) {
                    const ventDetail = MeshBuilder.CreateBox(`heavyVentDetail${i}_${j}`, {
                        width: 0.08,
                        height: 0.04,
                        depth: 0.02
                    }, scene);
                    ventDetail.position = addZFightingOffset(new Vector3(
                    posX,
                    h * 0.5,
                    posZ + (j - 2) * 0.025
                ), "up");
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы на люках (три штуки)
            for (let i = 0; i < 3; i++) {
                const periscope = MeshBuilder.CreateBox(`heavyPeriscope${i}`, {
                    width: 0.08,
                    height: 0.2,
                    depth: 0.08
                }, scene);
                periscope.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.75,
                    -d * 0.1
                ), "backward");
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`heavyPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Энергетические усилители брони (футуристические элементы)
            for (let i = 0; i < 2; i++) {
                const energyBooster = MeshBuilder.CreateBox(`heavyEnergyBooster${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.12
                }, scene);
                energyBooster.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.5,
                    h * 0.3,
                    d * 0.4
                ), "forward");
                energyBooster.parent = chassis;
                const boosterMat = new StandardMaterial(`heavyBoosterMat${i}`, scene);
                boosterMat.diffuseColor = new Color3(0.2, 0.4, 0.8);
                boosterMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
                energyBooster.material = boosterMat;
                animationElements.energyBoosters = animationElements.energyBoosters || [];
                animationElements.energyBoosters.push(energyBooster);
            }
            
            // Детали гусениц - катки (большие для тяжелого танка)
            for (let i = 0; i < 10; i++) {
                const wheel = MeshBuilder.CreateBox(`heavyWheel${i}`, {
                    width: 0.3,
                    height: 0.3,
                    depth: 0.22
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.6,
                    -h * 0.4,
                    -d * 0.5 + i * d * 0.1
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки на бронеплитах (много для тяжелого танка)
            for (let i = 0; i < 24; i++) {
                const rivet = MeshBuilder.CreateBox(`heavyRivet${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.03
                }, scene);
                const angle = (i * Math.PI * 2) / 24;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.5,
                    h * 0.3 + Math.sin(angle) * h * 0.3,
                    d * 0.4
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони (толстые для тяжелого танка)
            for (let i = 0; i < 8; i++) {
                const seam = MeshBuilder.CreateBox(`heavySeam${i}`, {
                    width: i < 4 ? w * 1.0 : 0.06,
                    height: i < 4 ? 0.04 : h * 1.0,
                    depth: i < 4 ? 0.04 : 0.06
                }, scene);
                if (i < 4) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.2, d * 0.45), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 4 ? -1 : i === 5 ? 1 : 0) * w * 0.55,
                    0,
                    d * 0.2
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`heavySeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
                seam.material = seamMat;
            }
            break;
            
        case "assault":
            // Assault - агрессивные угловые бронеплиты, шипы
            const assaultPlates = [
                { pos: new Vector3(0, h * 0.25, d * 0.52), size: new Vector3(w * 0.8, h * 0.35, 0.15) },
                { pos: new Vector3(-w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) },
                { pos: new Vector3(w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) }
            ];
            assaultPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`assaultPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            // Шипы спереди
            for (let i = 0; i < 3; i++) {
                const spike = MeshBuilder.CreateBox(`spike${i}`, {
                    width: 0.08,
                    height: 0.15,
                    depth: 0.12
                }, scene);
                spike.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.25,
                    h * 0.3,
                    d * 0.52
                ), "forward");
                spike.parent = chassis;
                spike.material = accentMat;
            }
            
            // Фары с защитой
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`assaultHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.13,
                    d * 0.48
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`assaultHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
                
                // Защита фары
                const headlightGuard = MeshBuilder.CreateBox(`assaultHeadlightGuard${i}`, {
                    width: 0.14,
                    height: 0.14,
                    depth: 0.06
                }, scene);
                headlightGuard.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.13,
                    d * 0.46
                ), "forward");
                headlightGuard.parent = chassis;
                headlightGuard.material = armorMat;
            }
            
            // Выхлоп
            const assaultExhaust = MeshBuilder.CreateBox("assaultExhaust", {
                width: 0.13,
                height: 0.13,
                depth: 0.18
            }, scene);
            assaultExhaust.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.18, -d * 0.45), "forward");
            assaultExhaust.parent = chassis;
            assaultExhaust.material = armorMat;
            
            // Инструменты
            const assaultShovel = MeshBuilder.CreateBox("assaultShovel", {
                width: 0.13,
                height: 0.32,
                depth: 0.02
            }, scene);
            assaultShovel.position = addZFightingOffset(new Vector3(-w * 0.4, h * 0.18, -d * 0.45), "forward");
            assaultShovel.parent = chassis;
            assaultShovel.material = armorMat;
            
            // Дополнительные инструменты
            const assaultCanister = MeshBuilder.CreateBox("assaultCanister", {
                width: 0.11,
                height: 0.18,
                depth: 0.11
            }, scene);
            assaultCanister.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.2, -d * 0.4), "forward");
            assaultCanister.parent = chassis;
            assaultCanister.material = armorMat;
            
            // Вентиляционные решетки (улучшенные)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`assaultVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.35,
                    -d * 0.25
                ), "backward");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`assaultVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
                
                // Детали решетки
                for (let j = 0; j < 4; j++) {
                    const ventDetail = MeshBuilder.CreateBox(`assaultVentDetail${i}_${j}`, {
                        width: 0.06,
                        height: 0.03,
                        depth: 0.02
                    }, scene);
                    ventDetail.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.35,
                    -d * 0.25 + (j - 1.5) * 0.03
                ), "backward");
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы (улучшенные)
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateBox(`assaultPeriscope${i}`, {
                    width: 0.07,
                    height: 0.16,
                    depth: 0.07
                }, scene);
                periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.52,
                    -d * 0.1
                ), "backward");
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`assaultPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Агрессивные боковые шипы (дополнительные)
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 3; j++) {
                    const sideSpike = MeshBuilder.CreateBox(`assaultSideSpike${i}_${j}`, {
                        width: 0.06,
                        height: 0.12,
                        depth: 0.1
                    }, scene);
                    sideSpike.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.52,
                    h * 0.05 + j * h * 0.2,
                    d * 0.1 + (j - 1) * d * 0.15
                ), "x");
                    sideSpike.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                    sideSpike.parent = chassis;
                    sideSpike.material = accentMat;
                }
            }
            
            // Броневые экраны на лобовой части (угловатые)
            for (let i = 0; i < 4; i++) {
                const frontScreen = MeshBuilder.CreateBox(`assaultFrontScreen${i}`, {
                    width: w * 0.22,
                    height: h * 0.18,
                    depth: 0.1
                }, scene);
                frontScreen.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.28,
                    h * 0.08 + (i < 2 ? 0 : h * 0.15),
                    d * 0.5
                ), "forward");
                frontScreen.rotation.x = -Math.PI / 12;
                frontScreen.parent = chassis;
                frontScreen.material = armorMat;
            }
            
            // Угловые броневые накладки (агрессивный стиль)
            for (let i = 0; i < 4; i++) {
                const cornerArmor = MeshBuilder.CreateBox(`assaultCornerArmor${i}`, {
                    width: 0.2,
                    height: 0.25,
                    depth: 0.2
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.55;
                const posZ = (i < 2 ? -1 : 1) * d * 0.5;
                cornerArmor.position = addZFightingOffset(new Vector3(posX, h * 0.45, posZ), "up");
                cornerArmor.parent = chassis;
                cornerArmor.material = armorMat;
            }
            
            // Верхние вентиляционные решетки (агрессивные, угловатые)
            for (let i = 0; i < 5; i++) {
                const roofVent = MeshBuilder.CreateBox(`assaultRoofVent${i}`, {
                    width: 0.15,
                    height: 0.05,
                    depth: 0.12
                }, scene);
                roofVent.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.25,
                    h * 0.54,
                    (i < 3 ? -1 : 1) * d * 0.25
                ), "up");
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`assaultRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
            }
            
            // Задние шипы (агрессивный стиль)
            for (let i = 0; i < 4; i++) {
                const rearSpike = MeshBuilder.CreateBox(`assaultRearSpike${i}`, {
                    width: 0.08,
                    height: 0.18,
                    depth: 0.1
                }, scene);
                rearSpike.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.35,
                    h * 0.3 + (i < 2 ? 0 : h * 0.15),
                    -d * 0.48
                ), "forward");
                rearSpike.parent = chassis;
                rearSpike.material = accentMat;
            }
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`assaultTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`assaultTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Оптический прицел на лобовой части
            const assaultSight = MeshBuilder.CreateBox("assaultSight", {
                width: 0.14,
                height: 0.09,
                depth: 0.11
            }, scene);
            assaultSight.position = addZFightingOffset(new Vector3(0, h * 0.22, d * 0.49), "forward");
            assaultSight.parent = chassis;
            const assaultSightMat = new StandardMaterial("assaultSightMat", scene);
            assaultSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            assaultSight.material = assaultSightMat;
            
            // Линза прицела
            const assaultSightLens = MeshBuilder.CreateBox("assaultSightLens", { width: 0.07, height: 0.02, depth: 0.07 }, scene);
            assaultSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.06), "forward");
            assaultSightLens.parent = assaultSight;
            const assaultLensMat = new StandardMaterial("assaultSightLensMat", scene);
            assaultLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            assaultLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            assaultSightLens.material = assaultLensMat;
            
            // Радиоантенна сзади
            const assaultAntenna = MeshBuilder.CreateBox("assaultAntenna", {
                width: 0.025,
                height: 0.45,
                depth: 0.025
            }, scene);
            assaultAntenna.position = addZFightingOffset(new Vector3(0, h * 0.65, -d * 0.3), "up");
            assaultAntenna.parent = chassis;
            const assaultAntennaMat = new StandardMaterial("assaultAntennaMat", scene);
            assaultAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            assaultAntenna.material = assaultAntennaMat;
            
            // Основание антенны
            const assaultAntennaBase = MeshBuilder.CreateBox("assaultAntennaBase", {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            }, scene);
            assaultAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.54, -d * 0.3), "up");
            assaultAntennaBase.parent = chassis;
            assaultAntennaBase.material = armorMat;
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`assaultSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.1,
                    -d * 0.2
                ), "backward");
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`assaultSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Выхлопная труба (улучшенная, больше)
            const assaultExhaustUpgraded = MeshBuilder.CreateBox("assaultExhaustUpgraded", {
                width: 0.13,
                height: 0.22,
                depth: 0.13
            }, scene);
            assaultExhaustUpgraded.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.2, -d * 0.48), "forward");
            assaultExhaustUpgraded.parent = chassis;
            assaultExhaustUpgraded.material = armorMat;
            
            // Выхлопное отверстие
            const assaultExhaustHole = MeshBuilder.CreateBox("assaultExhaustHole", {
                width: 0.11,
                height: 0.04,
                depth: 0.11
            }, scene);
            assaultExhaustHole.position = addZFightingOffset(new Vector3(w * 0.38, h * 0.2, -d * 0.52), "forward");
                        assaultExhaustHole.parent = chassis;
            const assaultExhaustHoleMat = new StandardMaterial("assaultExhaustHoleMat", scene);
            assaultExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            assaultExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
            assaultExhaustHole.material = assaultExhaustHoleMat;
            
            // Детали гусениц - катки
            for (let i = 0; i < 8; i++) {
                const wheel = MeshBuilder.CreateBox(`assaultWheel${i}`, {
                    width: 0.26,
                    height: 0.26,
                    depth: 0.19
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.58,
                    -h * 0.38,
                    -d * 0.48 + i * d * 0.12
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки на бронеплитах
            for (let i = 0; i < 18; i++) {
                const rivet = MeshBuilder.CreateBox(`assaultRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 18;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.5,
                    h * 0.28 + Math.sin(angle) * h * 0.28,
                    d * 0.38
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`assaultSeam${i}`, {
                    width: i < 3 ? w * 0.98 : 0.05,
                    height: i < 3 ? 0.03 : h * 0.95,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.24, d * 0.42), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.56,
                    0,
                    d * 0.22
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`assaultSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "medium": {
            // Medium - Прототип: Т-34 - Классический средний танк, наклонная броня
            // Наклонная лобовая броня (45°)
            const mediumFront = MeshBuilder.CreateBox("mediumFront", {
                width: w * 0.9,  // Уже корпуса чтобы не было z-fighting по бокам
                height: h * 0.7,
                depth: 0.18
            }, scene);
            mediumFront.position = addZFightingOffset(new Vector3(0, h * 0.1, d * 0.5), "forward");
            mediumFront.rotation.x = -Math.PI / 4;  // Наклон 45°
            mediumFront.parent = chassis;
            mediumFront.material = armorMat;
            
            // Вентиляционные решетки (угловатые)
            for (let i = 0; i < 3; i++) {
                const vent = MeshBuilder.CreateBox(`vent${i}`, {
                    width: 0.06,
                    height: 0.04,
                    depth: 0.08
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.28,
                    h * 0.38,
                    -d * 0.28
                ), "backward");
                vent.parent = chassis;
                vent.material = armorMat;
            }
            
            // Два люка на крыше
            for (let i = 0; i < 2; i++) {
                const hatch = MeshBuilder.CreateBox(`mediumHatch${i}`, {
                    width: 0.22,
                    height: 0.08,
                    depth: 0.22
                }, scene);
                hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.48,
                    -d * 0.1
                ), "backward");
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Выхлопные трубы сзади
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`mediumExhaust${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.18
                }, scene);
                exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.18,
                    -d * 0.45
                ), "backward");
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Фары спереди
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`mediumHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.12,
                    d * 0.48
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`mediumHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Инструменты: лопата, канистра
            const mediumShovel = MeshBuilder.CreateBox("mediumShovel", {
                width: 0.14,
                height: 0.35,
                depth: 0.02
            }, scene);
            mediumShovel.position = addZFightingOffset(new Vector3(-w * 0.42, h * 0.18, -d * 0.45), "forward");
            mediumShovel.parent = chassis;
            mediumShovel.material = armorMat;
            
            const mediumCanister = MeshBuilder.CreateBox("mediumCanister", {
                width: 0.12,
                height: 0.2,
                depth: 0.12
            }, scene);
            mediumCanister.position = addZFightingOffset(new Vector3(w * 0.42, h * 0.2, -d * 0.4), "forward");
            mediumCanister.parent = chassis;
            mediumCanister.material = armorMat;
            
            // Вентиляционные решетки (улучшенные)
            for (let i = 0; i < 3; i++) {
                const vent = MeshBuilder.CreateBox(`mediumVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.4,
                    -d * 0.3
                ), "backward");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`mediumVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                vent.material = ventMat;
                
                // Детали решетки
                for (let j = 0; j < 4; j++) {
                    const ventDetail = MeshBuilder.CreateBox(`mediumVentDetail${i}_${j}`, {
                        width: 0.06,
                        height: 0.03,
                        depth: 0.02
                    }, scene);
                    ventDetail.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.4,
                    -d * 0.3 + (j - 1.5) * 0.03
                ), "backward");
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы на люках
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateBox(`mediumPeriscope${i}`, { width: 0.07, height: 0.18, depth: 0.07 }, scene);
                periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.55,
                    -d * 0.1
                ), "backward");
                periscope.parent = chassis;
                const periscopeMat = new StandardMaterial(`mediumPeriscopeMat${i}`, scene);
                periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                periscope.material = periscopeMat;
            }
            
            // Броневые накладки на лобовой части (характерные для Т-34)
            for (let i = 0; i < 2; i++) {
                const frontArmor = MeshBuilder.CreateBox(`mediumFrontArmor${i}`, {
                    width: w * 0.3,
                    height: h * 0.2,
                    depth: 0.1
                }, scene);
                frontArmor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.25,
                    h * 0.05,
                    d * 0.48
                ), "forward");
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Центральная броневая накладка на лбу
            const centerArmor = MeshBuilder.CreateBox("mediumCenterArmor", {
                width: w * 0.2,
                height: h * 0.15,
                depth: 0.12
            }, scene);
            centerArmor.position = addZFightingOffset(new Vector3(0, h * 0.2, d * 0.49), "forward");
            centerArmor.parent = chassis;
            centerArmor.material = armorMat;
            
            // Боковые броневые экраны (противокумулятивные) - уменьшены для избежания глитчей
            for (let i = 0; i < 2; i++) {
                const sideScreen = MeshBuilder.CreateBox(`mediumSideScreen${i}`, {
                    width: 0.1,          // Уменьшено с 0.15
                    height: h * 0.45,    // Уменьшено с h * 0.6
                    depth: d * 0.25      // Уменьшено с d * 0.35
                }, scene);
                sideScreen.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,  // Ближе к корпусу (было 0.52)
                    h * 0.12,
                    d * 0.15
                ), "x");
                sideScreen.parent = chassis;
                sideScreen.material = armorMat;
            }
            
            // Дополнительные вентиляционные решетки на крыше
            for (let i = 0; i < 4; i++) {
                const roofVent = MeshBuilder.CreateBox(`mediumRoofVent${i}`, {
                    width: 0.15,
                    height: 0.04,
                    depth: 0.12
                }, scene);
                roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.25,
                    h * 0.46,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`mediumRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
            }
            
            // Радиоантенна сзади (характерная для Т-34)
            const antenna = MeshBuilder.CreateBox("mediumAntenna", { width: 0.025, height: 0.5, depth: 0.025 }, scene);
            antenna.position = addZFightingOffset(new Vector3(0, h * 0.65, -d * 0.35), "up");
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial("mediumAntennaMat", scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
            
            // Основание антенны
            const antennaBase = MeshBuilder.CreateBox("mediumAntennaBase", {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            }, scene);
            antennaBase.position = addZFightingOffset(new Vector3(0, h * 0.54, -d * 0.35), "up");
            antennaBase.parent = chassis;
            antennaBase.material = armorMat;
            
            // Оптический прицел на лобовой части
            const sight = MeshBuilder.CreateBox("mediumSight", {
                width: 0.12,
                height: 0.08,
                depth: 0.1
            }, scene);
            sight.position = addZFightingOffset(new Vector3(0, h * 0.25, d * 0.48), "forward");
            sight.parent = chassis;
            const sightMat = new StandardMaterial("mediumSightMat", scene);
            sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            sight.material = sightMat;
            
            // Линза прицела
            const sightLens = MeshBuilder.CreateBox("mediumSightLens", { width: 0.06, height: 0.02, depth: 0.06 }, scene);
            sightLens.position = addZFightingOffset(new Vector3(0, 0, 0.06), "forward");
            sightLens.parent = sight;
            const lensMat = new StandardMaterial("mediumSightLensMat", scene);
            lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            sightLens.material = lensMat;
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`mediumTailLight${i}`, {
                    width: 0.06,
                    height: 0.1,
                    depth: 0.04
                }, scene);
                tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`mediumTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Дополнительные инструменты на корме
            const toolBox = MeshBuilder.CreateBox("mediumToolBox", {
                width: 0.18,
                height: 0.12,
                depth: 0.14
            }, scene);
            toolBox.position = addZFightingOffset(new Vector3(0, h * 0.22, -d * 0.42), "forward");
            toolBox.parent = chassis;
            toolBox.material = armorMat;
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`mediumSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.08,
                    -d * 0.25
                ), "backward");
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`mediumSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Детали гусениц - катки
            for (let i = 0; i < 8; i++) {
                const wheel = MeshBuilder.CreateBox(`mediumWheel${i}`, {
                    width: 0.25,
                    height: 0.25,
                    depth: 0.18
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.55,
                    -h * 0.35,
                    -d * 0.45 + i * d * 0.12
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки на бронеплитах
            for (let i = 0; i < 16; i++) {
                const rivet = MeshBuilder.CreateBox(`mediumRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 16;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.45,
                    h * 0.25 + Math.sin(angle) * h * 0.25,
                    d * 0.35
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`mediumSeam${i}`, {
                    width: i < 3 ? w * 0.95 : 0.05,
                    height: i < 3 ? 0.03 : h * 0.9,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.25, d * 0.4), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.5,
                    0,
                    d * 0.2
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`mediumSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
        }
            
        // === NEW CHASSIS TYPES ===
        case "stealth":
            // Stealth - угловатые панели, низкий профиль
            // Наклонная лобовая броня (угловатая)
            const stealthFront = MeshBuilder.CreateBox("stealthFront", {
                width: w * 0.95,
                height: h * 0.5,
                depth: 0.15
            }, scene);
            stealthFront.position = addZFightingOffset(new Vector3(0, h * 0.1, d * 0.52), "forward");
            stealthFront.rotation.x = -Math.PI / 8;
            stealthFront.parent = chassis;
            stealthFront.material = armorMat;
            
            // Угловатые боковые панели
            for (let i = 0; i < 2; i++) {
                const sidePanel = MeshBuilder.CreateBox(`stealthSidePanel${i}`, {
                    width: 0.1,
                    height: h * 0.7,
                    depth: d * 0.6
                }, scene);
                sidePanel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.52,
                    0,
                    d * 0.15
                ), "x");
                sidePanel.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 12;
                sidePanel.parent = chassis;
                sidePanel.material = armorMat;
            }
            
            // Фары (маленькие, скрытые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`stealthHeadlight${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.05
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.08,
                    d * 0.5
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`stealthHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.2, 0.2, 0.15);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки (скрытые)
            for (let i = 0; i < 3; i++) {
                const vent = MeshBuilder.CreateBox(`stealthVent${i}`, {
                    width: 0.08,
                    height: 0.04,
                    depth: 0.06
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.3,
                    -d * 0.3
                ), "backward");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`stealthVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                vent.material = ventMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 7; i++) {
                const wheel = MeshBuilder.CreateBox(`stealthWheel${i}`, {
                    width: 0.2,
                    height: 0.2,
                    depth: 0.16
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.53,
                    -h * 0.3,
                    -d * 0.5 + i * d * 0.14
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 12; i++) {
                const rivet = MeshBuilder.CreateBox(`stealthRivet${i}`, {
                    width: 0.04,
                    height: 0.04,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 12;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.48,
                    h * 0.2 + Math.sin(angle) * h * 0.2,
                    d * 0.35
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 5; i++) {
                const seam = MeshBuilder.CreateBox(`stealthSeam${i}`, {
                    width: i < 3 ? w * 0.9 : 0.04,
                    height: i < 3 ? 0.02 : h * 0.85,
                    depth: i < 3 ? 0.02 : 0.04
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.08 + i * h * 0.22, d * 0.45), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : 1) * w * 0.51,
                    0,
                    d * 0.2
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`stealthSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
                seam.material = seamMat;
            }
            break;
            
        case "hover":
            // Hover - обтекаемый футуристический дизайн с реактивными двигателями
            // Плавные скошенные углы - лобовая броня (плавная)
            const hoverFront = MeshBuilder.CreateBox("hoverFront", {
                width: w * 0.92,  // Уже корпуса чтобы не было z-fighting по бокам
                height: h * 0.6,
                depth: 0.18
            }, scene);
            hoverFront.position = addZFightingOffset(new Vector3(0, h * 0.12, d * 0.5), "forward");
            hoverFront.rotation.x = -Math.PI / 10;
            hoverFront.parent = chassis;
            hoverFront.material = armorMat;
            
            // Плавные боковые панели (скошенные углы)
            for (let i = 0; i < 2; i++) {
                const sidePanel = MeshBuilder.CreateBox(`hoverSidePanel${i}`, {
                    width: 0.12,
                    height: h * 0.8,
                    depth: d * 0.65
                }, scene);
                sidePanel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.54,
                    0,
                    d * 0.12
                ), "x");
                sidePanel.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 15;
                sidePanel.parent = chassis;
                sidePanel.material = armorMat;
            }
            
            // Реактивные двигатели (hover thrusters)
            animationElements.hoverThrusters = [];
            for (let i = 0; i < 4; i++) {
                const thruster = MeshBuilder.CreateBox(`hoverThruster${i}`, {
                    width: 0.2,
                    height: 0.2,
                    depth: 0.15
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
                const posZ = (i < 2 ? -1 : 1) * d * 0.4;
                thruster.position = addZFightingOffset(new Vector3(posX, -h * 0.4, posZ), "forward");
                thruster.parent = chassis;
                const thrusterMat = new StandardMaterial(`hoverThrusterMat${i}`, scene);
                thrusterMat.diffuseColor = new Color3(0.2, 0.4, 0.8);
                thrusterMat.emissiveColor = new Color3(0.1, 0.2, 0.5);
                thruster.material = thrusterMat;
                animationElements.hoverThrusters.push(thruster);
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`hoverHeadlight${i}`, {
                    width: 0.1,
                    height: 0.1,
                    depth: 0.08
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.15,
                    d * 0.48
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`hoverHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки
            for (let i = 0; i < 4; i++) {
                const vent = MeshBuilder.CreateBox(`hoverVent${i}`, {
                    width: 0.1,
                    height: 0.05,
                    depth: 0.08
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.35;
                const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                vent.position = addZFightingOffset(new Vector3(posX, h * 0.4, posZ), "forward");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`hoverVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                vent.material = ventMat;
            }
            
            // Детали гусениц (минимум для hover)
            for (let i = 0; i < 6; i++) {
                const wheel = MeshBuilder.CreateBox(`hoverWheel${i}`, {
                    width: 0.22,
                    height: 0.22,
                    depth: 0.17
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.52,
                    -h * 0.35,
                    -d * 0.45 + i * d * 0.15
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 14; i++) {
                const rivet = MeshBuilder.CreateBox(`hoverRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 14;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.5,
                    h * 0.25 + Math.sin(angle) * h * 0.25,
                    d * 0.38
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`hoverSeam${i}`, {
                    width: i < 3 ? w * 1.0 : 0.05,
                    height: i < 3 ? 0.03 : h * 0.9,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.24, d * 0.42), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.53,
                    0,
                    d * 0.2
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`hoverSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            
            // Антенны (сенсоры)
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`hoverAntenna${i}`, {
                    width: 0.02,
                    height: 0.3,
                    depth: 0.02
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.6,
                    -d * 0.3
                ), "backward");
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`hoverAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            break;
            
        case "siege":
            // Siege - массивный, очень большой, угловатые бронеплиты
            // Массивные угловатые лобовые бронеплиты
            const siegeFrontPlates = [
                { pos: new Vector3(-w * 0.35, h * 0.15, d * 0.55), size: new Vector3(w * 0.3, h * 0.4, 0.2), rot: -Math.PI / 8 },
                { pos: new Vector3(0, h * 0.2, d * 0.55), size: new Vector3(w * 0.35, h * 0.45, 0.22), rot: -Math.PI / 10 },
                { pos: new Vector3(w * 0.35, h * 0.15, d * 0.55), size: new Vector3(w * 0.3, h * 0.4, 0.2), rot: -Math.PI / 8 }
            ];
            siegeFrontPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`siegeFrontPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.rotation.x = plate.rot;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Угловатые боковые бронеплиты
            for (let i = 0; i < 2; i++) {
                const sidePlate = MeshBuilder.CreateBox(`siegeSidePlate${i}`, {
                    width: 0.25,
                    height: h * 1.1,
                    depth: d * 0.7
                }, scene);
                sidePlate.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.62,
                    0,
                    d * 0.15
                ), "x");
                sidePlate.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 20;
                sidePlate.parent = chassis;
                sidePlate.material = armorMat;
            }
            
            // Верхние угловатые бронеплиты
            const siegeTopPlates = [
                { pos: new Vector3(-w * 0.4, h * 0.7, d * 0.4), size: new Vector3(w * 0.35, 0.3, d * 0.5) },
                { pos: new Vector3(0, h * 0.75, d * 0.4), size: new Vector3(w * 0.4, 0.35, d * 0.5) },
                { pos: new Vector3(w * 0.4, h * 0.7, d * 0.4), size: new Vector3(w * 0.35, 0.3, d * 0.5) }
            ];
            siegeTopPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`siegeTopPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Фары (большие)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`siegeHeadlight${i}`, {
                    width: 0.14,
                    height: 0.14,
                    depth: 0.12
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.18,
                    d * 0.52
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`siegeHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Выхлопные трубы (большие)
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`siegeExhaust${i}`, {
                    width: 0.16,
                    height: 0.24,
                    depth: 0.22
                }, scene);
                exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.25,
                    -d * 0.52
                ), "forward");
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Вентиляционные решетки (большие)
            for (let i = 0; i < 6; i++) {
                const vent = MeshBuilder.CreateBox(`siegeVent${i}`, {
                    width: 0.12,
                    height: 0.08,
                    depth: 0.14
                }, scene);
                const posX = (i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 1) * w * 0.4;
                const posZ = (i < 3 ? -1 : 1) * d * 0.35;
                vent.position = addZFightingOffset(new Vector3(posX, h * 0.6, posZ), "up");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`siegeVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                vent.material = ventMat;
            }
            
            // Детали гусениц (большие катки)
            for (let i = 0; i < 12; i++) {
                const wheel = MeshBuilder.CreateBox(`siegeWheel${i}`, {
                    width: 0.35,
                    height: 0.35,
                    depth: 0.25
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.65,
                    -h * 0.45,
                    -d * 0.55 + i * d * 0.09
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки (много для siege)
            for (let i = 0; i < 30; i++) {
                const rivet = MeshBuilder.CreateBox(`siegeRivet${i}`, {
                    width: 0.07,
                    height: 0.07,
                    depth: 0.03
                }, scene);
                const angle = (i * Math.PI * 2) / 30;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.55,
                    h * 0.35 + Math.sin(angle) * h * 0.35,
                    d * 0.45
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони (толстые)
            for (let i = 0; i < 10; i++) {
                const seam = MeshBuilder.CreateBox(`siegeSeam${i}`, {
                    width: i < 5 ? w * 1.1 : 0.07,
                    height: i < 5 ? 0.05 : h * 1.1,
                    depth: i < 5 ? 0.05 : 0.07
                }, scene);
                if (i < 5) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.18, d * 0.48), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 5 ? -1 : i === 6 ? 1 : 0) * w * 0.6,
                    0,
                    d * 0.25
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`siegeSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
                seam.material = seamMat;
            }
            
            // Антенны (большие)
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`siegeAntenna${i}`, {
                    width: 0.03,
                    height: 0.6,
                    depth: 0.03
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.85,
                    -d * 0.35
                ), "backward");
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`siegeAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            break;
            
        case "racer":
            // Racer - очень низкий, спортивный - гонщик
            // Передний спойлер
            const racerFrontSpoiler = MeshBuilder.CreateBox("racerFrontSpoiler", {
                width: w * 0.9,
                height: 0.12,
                depth: 0.15
            }, scene);
            racerFrontSpoiler.position = addZFightingOffset(new Vector3(0, -h * 0.4, d * 0.48), "forward");
            racerFrontSpoiler.parent = chassis;
            racerFrontSpoiler.material = accentMat;
            
            // Задний спойлер (большой)
            const racerRearSpoiler = MeshBuilder.CreateBox("racerRearSpoiler", {
                width: w * 1.1,
                height: 0.25,
                depth: 0.2
            }, scene);
            racerRearSpoiler.position = addZFightingOffset(new Vector3(0, h * 0.45, -d * 0.48), "forward");
            racerRearSpoiler.parent = chassis;
            racerRearSpoiler.material = accentMat;
            
            // Боковые обтекатели (низкопрофильные)
            for (let i = 0; i < 2; i++) {
                const sideFairing = MeshBuilder.CreateBox(`racerSideFairing${i}`, {
                    width: 0.12,
                    height: h * 0.6,
                    depth: d * 0.7
                }, scene);
                sideFairing.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    0,
                    d * 0.1
                ), "x");
                sideFairing.parent = chassis;
                sideFairing.material = accentMat;
            }
            
            // Передние фары (большие, агрессивные)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`racerHeadlight${i}`, {
                    width: 0.15,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.32,
                    h * 0.1,
                    d * 0.49
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`racerHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(1.0, 1.0, 0.8);
                headlightMat.emissiveColor = new Color3(0.5, 0.5, 0.3);
                headlight.material = headlightMat;
            }
            
            // Центральная воздухозаборная решетка
            const racerIntake = MeshBuilder.CreateBox("racerIntake", {
                width: w * 0.4,
                height: h * 0.25,
                depth: 0.08
            }, scene);
            racerIntake.position = addZFightingOffset(new Vector3(0, h * 0.15, d * 0.48), "forward");
            racerIntake.parent = chassis;
            const intakeMat = new StandardMaterial("racerIntakeMat", scene);
            intakeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
            racerIntake.material = intakeMat;
            
            // Детали решетки
            for (let i = 0; i < 5; i++) {
                const intakeBar = MeshBuilder.CreateBox(`racerIntakeBar${i}`, {
                    width: 0.02,
                    height: h * 0.2,
                    depth: 0.06
                }, scene);
                intakeBar.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.09,
                    h * 0.15,
                    d * 0.48
                ), "forward");
                intakeBar.parent = chassis;
                intakeBar.material = intakeMat;
            }
            
            // Верхние воздухозаборники на крыше
            for (let i = 0; i < 2; i++) {
                const roofIntake = MeshBuilder.CreateBox(`racerRoofIntake${i}`, {
                    width: 0.18,
                    height: 0.08,
                    depth: 0.12
                }, scene);
                roofIntake.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.25,
                    h * 0.42,
                    d * 0.3
                ), "up");
                roofIntake.parent = chassis;
                roofIntake.material = intakeMat;
            }
            
            // Выхлопные трубы (большие, по бокам)
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`racerExhaust${i}`, { width: 0.1, height: 0.3, depth: 0.1 }, scene);
                exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.08,
                    -d * 0.48
                ), "forward");
                                exhaust.parent = chassis;
                exhaust.material = armorMat;
                
                // Выхлопное отверстие
                const exhaustHole = MeshBuilder.CreateBox(`racerExhaustHole${i}`, { width: 0.08, height: 0.05, depth: 0.08 }, scene);
                exhaustHole.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.08,
                    -d * 0.52
                ), "forward");
                                exhaustHole.parent = chassis;
                const exhaustHoleMat = new StandardMaterial(`racerExhaustHoleMat${i}`, scene);
                exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                exhaustHole.material = exhaustHoleMat;
            }
            
            // Боковые зеркала
            for (let i = 0; i < 2; i++) {
                const mirror = MeshBuilder.CreateBox(`racerMirror${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.04
                }, scene);
                mirror.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.52,
                    h * 0.35,
                    d * 0.35
                ), "forward");
                mirror.parent = chassis;
                const mirrorMat = new StandardMaterial(`racerMirrorMat${i}`, scene);
                mirrorMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
                mirror.material = mirrorMat;
            }
            
            // Задние огни (большие стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`racerTailLight${i}`, {
                    width: 0.08,
                    height: 0.12,
                    depth: 0.04
                }, scene);
                tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.12,
                    -d * 0.49
                ), "forward");
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`racerTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.7, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.4, 0.05, 0.05);
                tailLight.material = tailLightMat;
            }
            
            // Вентиляционные отверстия на боковых панелях
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 3; j++) {
                    const sideVent = MeshBuilder.CreateBox(`racerSideVent${i}_${j}`, {
                        width: 0.04,
                        height: 0.1,
                        depth: 0.04
                    }, scene);
                    sideVent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.05,
                    d * 0.1 + (j - 1) * d * 0.15
                ), "x");
                    sideVent.parent = chassis;
                    sideVent.material = intakeMat;
                }
            }
            
            // Люк на крыше (спортивный стиль)
            const racerHatch = MeshBuilder.CreateBox("racerHatch", {
                width: 0.3,
                height: 0.06,
                depth: 0.25
            }, scene);
            racerHatch.position = addZFightingOffset(new Vector3(0, h * 0.46, -d * 0.1), "up");
            racerHatch.parent = chassis;
            racerHatch.material = armorMat;
            
            // Перископ на люке
            const racerPeriscope = MeshBuilder.CreateBox("racerPeriscope", { width: 0.06, height: 0.2, depth: 0.06 }, scene);
            racerPeriscope.position = addZFightingOffset(new Vector3(0, h * 0.56, -d * 0.1), "up");
            racerPeriscope.parent = chassis;
            const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
            racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            racerPeriscope.material = racerPeriscopeMat;
            
            // Детали гусениц (маленькие для racer)
            for (let i = 0; i < 8; i++) {
                const wheel = MeshBuilder.CreateBox(`racerWheel${i}`, {
                    width: 0.2,
                    height: 0.2,
                    depth: 0.15
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.5,
                    -h * 0.25,
                    -d * 0.6 + i * d * 0.15
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 10; i++) {
                const rivet = MeshBuilder.CreateBox(`racerRivet${i}`, {
                    width: 0.04,
                    height: 0.04,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 10;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.4,
                    h * 0.12 + Math.sin(angle) * h * 0.12,
                    d * 0.5
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 4; i++) {
                const seam = MeshBuilder.CreateBox(`racerSeam${i}`, {
                    width: i < 2 ? w * 0.85 : 0.04,
                    height: i < 2 ? 0.02 : h * 0.75,
                    depth: i < 2 ? 0.02 : 0.04
                }, scene);
                if (i < 2) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.05 + i * h * 0.18, d * 0.48), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 2 ? -1 : 1) * w * 0.49,
                    0,
                    d * 0.3
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`racerSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "amphibious":
            // Amphibious - с поплавками, плавные скошенные углы
            // Плавная лобовая броня (скошенные углы)
            const amphibiousFront = MeshBuilder.CreateBox("amphibiousFront", {
                width: w * 1.1,
                height: h * 0.65,
                depth: 0.2
            }, scene);
            amphibiousFront.position = addZFightingOffset(new Vector3(0, h * 0.15, d * 0.52), "forward");
            amphibiousFront.rotation.x = -Math.PI / 12;
            amphibiousFront.parent = chassis;
            amphibiousFront.material = armorMat;
            
            // Плавные боковые панели (скошенные углы)
            for (let i = 0; i < 2; i++) {
                const sidePanel = MeshBuilder.CreateBox(`amphibiousSidePanel${i}`, {
                    width: 0.15,
                    height: h * 0.85,
                    depth: d * 0.7
                }, scene);
                sidePanel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.58,
                    0,
                    d * 0.1
                ), "x");
                sidePanel.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 18;
                sidePanel.parent = chassis;
                sidePanel.material = armorMat;
            }
            
            // Поплавки (водонепроницаемые)
            for (let i = 0; i < 2; i++) {
                const pontoon = MeshBuilder.CreateBox(`amphibiousPontoon${i}`, {
                    width: 0.25,
                    height: h * 0.6,
                    depth: d * 0.4
                }, scene);
                pontoon.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.65,
                    -h * 0.2,
                    d * 0.2
                ), "down");
                pontoon.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 20;
                pontoon.parent = chassis;
                pontoon.material = armorMat;
            }
            
            // Фары (водонепроницаемые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`amphibiousHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.18,
                    d * 0.5
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`amphibiousHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Выхлопные трубы (водонепроницаемые)
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateBox(`amphibiousExhaust${i}`, {
                    width: 0.14,
                    height: 0.18,
                    depth: 0.2
                }, scene);
                exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.22,
                    -d * 0.5
                ), "forward");
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Вентиляционные решетки (водонепроницаемые)
            for (let i = 0; i < 4; i++) {
                const vent = MeshBuilder.CreateBox(`amphibiousVent${i}`, {
                    width: 0.1,
                    height: 0.06,
                    depth: 0.1
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
                const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                vent.position = addZFightingOffset(new Vector3(posX, h * 0.45, posZ), "up");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`amphibiousVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                vent.material = ventMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 9; i++) {
                const wheel = MeshBuilder.CreateBox(`amphibiousWheel${i}`, {
                    width: 0.26,
                    height: 0.26,
                    depth: 0.19
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.58,
                    -h * 0.38,
                    -d * 0.5 + i * d * 0.11
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 18; i++) {
                const rivet = MeshBuilder.CreateBox(`amphibiousRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 18;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.52,
                    h * 0.28 + Math.sin(angle) * h * 0.28,
                    d * 0.4
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`amphibiousSeam${i}`, {
                    width: i < 3 ? w * 1.05 : 0.05,
                    height: i < 3 ? 0.03 : h * 0.95,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.24, d * 0.45), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.59,
                    0,
                    d * 0.22
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`amphibiousSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            
            // Антенны
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`amphibiousAntenna${i}`, {
                    width: 0.025,
                    height: 0.5,
                    depth: 0.025
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.7,
                    -d * 0.35
                ), "backward");
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`amphibiousAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            break;
            
        case "shield":
            // Shield - с генератором щита, угловатые щиты
            // Угловатые щиты спереди
            const shieldFrontPlates = [
                { pos: new Vector3(-w * 0.4, h * 0.2, d * 0.54), size: new Vector3(w * 0.35, h * 0.4, 0.18), rot: -Math.PI / 10 },
                { pos: new Vector3(0, h * 0.25, d * 0.54), size: new Vector3(w * 0.4, h * 0.45, 0.2), rot: -Math.PI / 12 },
                { pos: new Vector3(w * 0.4, h * 0.2, d * 0.54), size: new Vector3(w * 0.35, h * 0.4, 0.18), rot: -Math.PI / 10 }
            ];
            shieldFrontPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`shieldFrontPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.rotation.x = plate.rot;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Угловатые боковые щиты
            for (let i = 0; i < 2; i++) {
                const sideShield = MeshBuilder.CreateBox(`shieldSideShield${i}`, {
                    width: 0.2,
                    height: h * 0.9,
                    depth: d * 0.65
                }, scene);
                sideShield.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.6,
                    0,
                    d * 0.12
                ), "x");
                sideShield.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 22;
                sideShield.parent = chassis;
                sideShield.material = armorMat;
            }
            
            // Генератор щита
            const shieldGen = MeshBuilder.CreateBox("shieldGen", {
                width: w * 0.4,
                height: h * 0.5,
                depth: w * 0.4
            }, scene);
            shieldGen.position = addZFightingOffset(new Vector3(0, h * 0.4, -d * 0.35), "forward");
            shieldGen.parent = chassis;
            const shieldGenMat = new StandardMaterial("shieldGenMat", scene);
            shieldGenMat.diffuseColor = new Color3(0.2, 0.6, 0.8);
            shieldGenMat.emissiveColor = new Color3(0.1, 0.3, 0.5);
            shieldGen.material = shieldGenMat;
            animationElements.shieldMesh = shieldGen;
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`shieldHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.2,
                    d * 0.52
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`shieldHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 9; i++) {
                const wheel = MeshBuilder.CreateBox(`shieldWheel${i}`, {
                    width: 0.28,
                    height: 0.28,
                    depth: 0.2
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.62,
                    -h * 0.4,
                    -d * 0.5 + i * d * 0.11
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 20; i++) {
                const rivet = MeshBuilder.CreateBox(`shieldRivet${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 20;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.55,
                    h * 0.3 + Math.sin(angle) * h * 0.3,
                    d * 0.42
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 7; i++) {
                const seam = MeshBuilder.CreateBox(`shieldSeam${i}`, {
                    width: i < 4 ? w * 1.05 : 0.05,
                    height: i < 4 ? 0.04 : h * 1.0,
                    depth: i < 4 ? 0.04 : 0.05
                }, scene);
                if (i < 4) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.22, d * 0.46), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 4 ? -1 : i === 5 ? 1 : 0) * w * 0.61,
                    0,
                    d * 0.24
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`shieldSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "drone":
            // Drone - с платформами для дронов, технический вид
            // Платформы для дронов
            for (let i = 0; i < 2; i++) {
                const dronePlatform = MeshBuilder.CreateBox(`dronePlatform${i}`, {
                    width: w * 0.35,
                    height: 0.15,
                    depth: d * 0.3
                }, scene);
                dronePlatform.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.6,
                    d * 0.3
                ), "up");
                dronePlatform.parent = chassis;
                dronePlatform.material = armorMat;
            }
            
            // Крепления для дронов
            for (let i = 0; i < 4; i++) {
                const droneMount = MeshBuilder.CreateBox(`droneMount${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.12
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.3;
                const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                droneMount.position = addZFightingOffset(new Vector3(posX, h * 0.68, posZ), "up");
                droneMount.parent = chassis;
                droneMount.material = accentMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`droneHeadlight${i}`, {
                    width: 0.11,
                    height: 0.11,
                    depth: 0.09
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.2,
                    d * 0.5
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`droneHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Вентиляционные решетки
            for (let i = 0; i < 4; i++) {
                const vent = MeshBuilder.CreateBox(`droneVent${i}`, {
                    width: 0.1,
                    height: 0.06,
                    depth: 0.1
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
                const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                vent.position = addZFightingOffset(new Vector3(posX, h * 0.5, posZ), "up");
                vent.parent = chassis;
                const ventMat = new StandardMaterial(`droneVentMat${i}`, scene);
                ventMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                vent.material = ventMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 8; i++) {
                const wheel = MeshBuilder.CreateBox(`droneWheel${i}`, {
                    width: 0.26,
                    height: 0.26,
                    depth: 0.19
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.56,
                    -h * 0.4,
                    -d * 0.48 + i * d * 0.12
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 16; i++) {
                const rivet = MeshBuilder.CreateBox(`droneRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 16;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.5,
                    h * 0.3 + Math.sin(angle) * h * 0.3,
                    d * 0.38
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`droneSeam${i}`, {
                    width: i < 3 ? w * 1.05 : 0.05,
                    height: i < 3 ? 0.03 : h * 1.0,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.24, d * 0.44), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.57,
                    0,
                    d * 0.22
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`droneSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "artillery":
            // Artillery - с стабилизаторами, массивные угловатые бронеплиты
            // Массивные угловатые лобовые бронеплиты
            const artilleryFrontPlates = [
                { pos: new Vector3(-w * 0.4, h * 0.2, d * 0.56), size: new Vector3(w * 0.35, h * 0.5, 0.22), rot: -Math.PI / 9 },
                { pos: new Vector3(0, h * 0.25, d * 0.56), size: new Vector3(w * 0.4, h * 0.55, 0.24), rot: -Math.PI / 11 },
                { pos: new Vector3(w * 0.4, h * 0.2, d * 0.56), size: new Vector3(w * 0.35, h * 0.5, 0.22), rot: -Math.PI / 9 }
            ];
            artilleryFrontPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`artilleryFrontPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.rotation.x = plate.rot;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Угловатые боковые бронеплиты
            for (let i = 0; i < 2; i++) {
                const sidePlate = MeshBuilder.CreateBox(`artillerySidePlate${i}`, {
                    width: 0.28,
                    height: h * 1.15,
                    depth: d * 0.75
                }, scene);
                sidePlate.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.64,
                    0,
                    d * 0.18
                ), "x");
                sidePlate.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 18;
                sidePlate.parent = chassis;
                sidePlate.material = armorMat;
            }
            
            // Стабилизаторы
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`artilleryStabilizer${i}`, {
                    width: 0.15,
                    height: 0.4,
                    depth: 0.15
                }, scene);
                const posX = (i % 2 === 0 ? -1 : 1) * w * 0.55;
                const posZ = (i < 2 ? -1 : 1) * d * 0.45;
                stabilizer.position = addZFightingOffset(new Vector3(posX, -h * 0.5, posZ), "up");
                stabilizer.parent = chassis;
                stabilizer.material = armorMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`artilleryHeadlight${i}`, {
                    width: 0.13,
                    height: 0.13,
                    depth: 0.11
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.22,
                    d * 0.54
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`artilleryHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 10; i++) {
                const wheel = MeshBuilder.CreateBox(`artilleryWheel${i}`, {
                    width: 0.32,
                    height: 0.32,
                    depth: 0.23
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.64,
                    -h * 0.42,
                    -d * 0.52 + i * d * 0.1
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 24; i++) {
                const rivet = MeshBuilder.CreateBox(`artilleryRivet${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.03
                }, scene);
                const angle = (i * Math.PI * 2) / 24;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.55,
                    h * 0.35 + Math.sin(angle) * h * 0.35,
                    d * 0.48
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 8; i++) {
                const seam = MeshBuilder.CreateBox(`artillerySeam${i}`, {
                    width: i < 4 ? w * 1.1 : 0.06,
                    height: i < 4 ? 0.04 : h * 1.15,
                    depth: i < 4 ? 0.04 : 0.06
                }, scene);
                if (i < 4) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.22, d * 0.5), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 4 ? -1 : i === 5 ? 1 : 0) * w * 0.65,
                    0,
                    d * 0.28
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`artillerySeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
                seam.material = seamMat;
            }
            
            // Антенны
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`artilleryAntenna${i}`, {
                    width: 0.03,
                    height: 0.55,
                    depth: 0.03
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.9,
                    -d * 0.38
                ), "backward");
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`artilleryAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            break;
            
        case "destroyer":
            // Destroyer - длинный, низкий - tank destroyer стиль, агрессивные углы
            // Агрессивные угловатые лобовые бронеплиты
            const destroyerFrontPlates = [
                { pos: new Vector3(-w * 0.3, h * 0.12, d * 0.58), size: new Vector3(w * 0.28, h * 0.35, 0.2), rot: -Math.PI / 7 },
                { pos: new Vector3(0, h * 0.15, d * 0.58), size: new Vector3(w * 0.32, h * 0.4, 0.22), rot: -Math.PI / 8 },
                { pos: new Vector3(w * 0.3, h * 0.12, d * 0.58), size: new Vector3(w * 0.28, h * 0.35, 0.2), rot: -Math.PI / 7 }
            ];
            destroyerFrontPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`destroyerFrontPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.rotation.x = plate.rot;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Агрессивные боковые клинья
            for (let i = 0; i < 2; i++) {
                const sideWedge = MeshBuilder.CreateBox(`destroyerSideWedge${i}`, {
                    width: 0.18,
                    height: h * 0.7,
                    depth: d * 0.8
                }, scene);
                sideWedge.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.52,
                    0,
                    d * 0.15
                ), "x");
                sideWedge.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 10;
                sideWedge.parent = chassis;
                sideWedge.material = armorMat;
            }
            
            // Фары (агрессивные)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`destroyerHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.15,
                    d * 0.58
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`destroyerHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Детали гусениц (длинные)
            for (let i = 0; i < 12; i++) {
                const wheel = MeshBuilder.CreateBox(`destroyerWheel${i}`, {
                    width: 0.24,
                    height: 0.24,
                    depth: 0.18
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.5,
                    -h * 0.32,
                    -d * 0.65 + i * d * 0.11
                ), "backward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 18; i++) {
                const rivet = MeshBuilder.CreateBox(`destroyerRivet${i}`, {
                    width: 0.05,
                    height: 0.05,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 18;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.45,
                    h * 0.22 + Math.sin(angle) * h * 0.22,
                    d * 0.6
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 6; i++) {
                const seam = MeshBuilder.CreateBox(`destroyerSeam${i}`, {
                    width: i < 3 ? w * 0.9 : 0.05,
                    height: i < 3 ? 0.03 : h * 0.85,
                    depth: i < 3 ? 0.03 : 0.05
                }, scene);
                if (i < 3) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.1 + i * h * 0.2, d * 0.55), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 3 ? -1 : i === 4 ? 1 : 0) * w * 0.51,
                    0,
                    d * 0.3
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`destroyerSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        case "command":
            // Command - с антеннами и аурой, респектабельные углы
            // Респектабельные угловатые лобовые бронеплиты
            const commandFrontPlates = [
                { pos: new Vector3(-w * 0.35, h * 0.18, d * 0.54), size: new Vector3(w * 0.32, h * 0.42, 0.19), rot: -Math.PI / 11 },
                { pos: new Vector3(0, h * 0.22, d * 0.54), size: new Vector3(w * 0.38, h * 0.48, 0.21), rot: -Math.PI / 13 },
                { pos: new Vector3(w * 0.35, h * 0.18, d * 0.54), size: new Vector3(w * 0.32, h * 0.42, 0.19), rot: -Math.PI / 11 }
            ];
            commandFrontPlates.forEach((plate, i) => {
                const plateMesh = MeshBuilder.CreateBox(`commandFrontPlate${i}`, {
                    width: plate.size.x,
                    height: plate.size.y,
                    depth: plate.size.z
                }, scene);
                plateMesh.position = plate.pos;
                plateMesh.rotation.x = plate.rot;
                plateMesh.parent = chassis;
                plateMesh.material = armorMat;
            });
            
            // Респектабельные боковые панели (четкие углы)
            for (let i = 0; i < 2; i++) {
                const sidePanel = MeshBuilder.CreateBox(`commandSidePanel${i}`, {
                    width: 0.16,
                    height: h * 1.0,
                    depth: d * 0.7
                }, scene);
                sidePanel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.58,
                    0,
                    d * 0.14
                ), "x");
                sidePanel.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 25;
                sidePanel.parent = chassis;
                sidePanel.material = armorMat;
            }
            
            // Командная аура (энергетическая)
            const commandAura = MeshBuilder.CreateBox("commandAura", {
                width: w * 0.5,
                height: h * 0.6,
                depth: w * 0.5
            }, scene);
            commandAura.position = addZFightingOffset(new Vector3(0, h * 0.45, -d * 0.3), "up");
            commandAura.parent = chassis;
            const commandAuraMat = new StandardMaterial("commandAuraMat", scene);
            commandAuraMat.diffuseColor = new Color3(1.0, 0.84, 0.0);
            commandAuraMat.emissiveColor = new Color3(0.5, 0.42, 0.0);
            commandAuraMat.alpha = 0.3;
            commandAura.material = commandAuraMat;
            animationElements.commandAura = commandAura;
            
            // Антенны связи (большие)
            for (let i = 0; i < 3; i++) {
                const antenna = MeshBuilder.CreateBox(`commandAntenna${i}`, {
                    width: 0.03,
                    height: 0.7,
                    depth: 0.03
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.4,
                    h * 0.85,
                    -d * 0.35
                ), "backward");
                antenna.parent = chassis;
                const antennaMat = new StandardMaterial(`commandAntennaMat${i}`, scene);
                antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
                antenna.material = antennaMat;
            }
            
            // Фары
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`commandHeadlight${i}`, {
                    width: 0.12,
                    height: 0.12,
                    depth: 0.1
                }, scene);
                headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.2,
                    d * 0.52
                ), "forward");
                headlight.parent = chassis;
                const headlightMat = new StandardMaterial(`commandHeadlightMat${i}`, scene);
                headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                headlight.material = headlightMat;
            }
            
            // Детали гусениц
            for (let i = 0; i < 9; i++) {
                const wheel = MeshBuilder.CreateBox(`commandWheel${i}`, {
                    width: 0.27,
                    height: 0.27,
                    depth: 0.2
                }, scene);
                wheel.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.56,
                    -h * 0.4,
                    -d * 0.5 + i * d * 0.11
                ), "forward");
                wheel.parent = chassis;
                wheel.material = armorMat;
            }
            
            // Заклепки
            for (let i = 0; i < 20; i++) {
                const rivet = MeshBuilder.CreateBox(`commandRivet${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.02
                }, scene);
                const angle = (i * Math.PI * 2) / 20;
                rivet.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.52,
                    h * 0.32 + Math.sin(angle) * h * 0.32,
                    d * 0.4
                ), "forward");
                rivet.parent = chassis;
                rivet.material = accentMat;
            }
            
            // Швы брони
            for (let i = 0; i < 7; i++) {
                const seam = MeshBuilder.CreateBox(`commandSeam${i}`, {
                    width: i < 4 ? w * 1.05 : 0.05,
                    height: i < 4 ? 0.04 : h * 1.05,
                    depth: i < 4 ? 0.04 : 0.05
                }, scene);
                if (i < 4) {
                    seam.position = addZFightingOffset(new Vector3(0, h * 0.12 + i * h * 0.22, d * 0.46), "forward");
                } else {
                    seam.position = addZFightingOffset(new Vector3(
                    (i === 4 ? -1 : i === 5 ? 1 : 0) * w * 0.59,
                    0,
                    d * 0.24
                ), "x");
                }
                seam.parent = chassis;
                const seamMat = new StandardMaterial(`commandSeamMat${i}`, scene);
                seamMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                seam.material = seamMat;
            }
            break;
            
        default:
            // Default case - minimal details
            break;
    }
    
    // === NEW CHASSIS TYPES DETAILS ===
    // These are handled separately after the switch statement
    
    if (chassisType.id === "stealth") {
        // Stealth - угловатые панели, генератор невидимости, низкий профиль
        const stealthPanels = [
            { pos: new Vector3(-w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
            { pos: new Vector3(w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
            { pos: new Vector3(0, h * 0.35, -d * 0.35), size: new Vector3(w * 0.4, h * 0.25, w * 0.3) }
        ];
        stealthPanels.forEach((panel, i) => {
            const panelMesh = MeshBuilder.CreateBox(`stealthPanel${i}`, {
                width: panel.size.x,
                height: panel.size.y,
                depth: panel.size.z
            }, scene);
            panelMesh.position = panel.pos;
            panelMesh.parent = chassis;
            panelMesh.material = armorMat;
        });
        
        // Генератор невидимости
        const stealthGen = MeshBuilder.CreateBox("stealthGen", {
            width: w * 0.35,
            height: h * 0.45,
            depth: w * 0.35
        }, scene);
        stealthGen.position = addZFightingOffset(new Vector3(0, h * 0.35, -d * 0.35), "forward");
        stealthGen.parent = chassis;
        const stealthMat = new StandardMaterial("stealthMat", scene);
        stealthMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        stealthMat.emissiveColor = new Color3(0.08, 0.08, 0.12);
        stealthGen.material = stealthMat;
        animationElements.stealthMesh = stealthGen;
    }
    
    if (chassisType.id === "hover") {
        // Hover - обтекаемые панели, реактивные двигатели
        const hoverPanels = [];
        for (let i = 0; i < 2; i++) {
            const panel = MeshBuilder.CreateBox(`hoverPanel${i}`, {
                width: 0.06,
                height: h * 0.6,
                depth: d * 0.5
            }, scene);
            panel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    0,
                    0
                ), "x");
            panel.parent = chassis;
            panel.material = accentMat;
            hoverPanels.push(panel);
        }
        
        // Реактивные двигатели (4 штуки)
        animationElements.hoverThrusters = [];
        for (let i = 0; i < 4; i++) {
            const thruster = MeshBuilder.CreateBox(`thruster${i}`, { width: 0.18, height: 0.25, depth: 0.18 }, scene);
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
            const posZ = (i < 2 ? -1 : 1) * d * 0.38;
            thruster.position = addZFightingOffset(new Vector3(posX, -h * 0.45, posZ), "up");
            thruster.parent = chassis;
            const thrusterMat = new StandardMaterial(`thrusterMat${i}`, scene);
            thrusterMat.diffuseColor = new Color3(0, 0.6, 1);
            thrusterMat.emissiveColor = new Color3(0, 0.4, 0.7);
            thruster.material = thrusterMat;
            animationElements.hoverThrusters.push(thruster);
        }
        
        // Обтекаемые фары спереди
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`hoverHeadlight${i}`, { width: 0.12, height: 0.08, depth: 0.12 }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.rotation.x = Math.PI / 2;
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`hoverHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(1.0, 1.0, 0.9);
            headlightMat.emissiveColor = new Color3(0.5, 0.5, 0.3);
            headlight.material = headlightMat;
        }
        
        // Обтекаемый люк на крыше
        const hoverHatch = MeshBuilder.CreateBox("hoverHatch", { width: 0.28, height: 0.08, depth: 0.28 }, scene);
        hoverHatch.position = addZFightingOffset(new Vector3(0, h * 0.52, -d * 0.1), "up");
        hoverHatch.parent = chassis;
        hoverHatch.material = armorMat;
        
        // Перископ на люке (обтекаемый)
        const hoverPeriscope = MeshBuilder.CreateBox("hoverPeriscope", { width: 0.06, height: 0.18, depth: 0.06 }, scene);
        hoverPeriscope.position = addZFightingOffset(new Vector3(0, h * 0.58, -d * 0.1), "up");
        hoverPeriscope.parent = chassis;
        const hoverPeriscopeMat = new StandardMaterial("hoverPeriscopeMat", scene);
        hoverPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        hoverPeriscope.material = hoverPeriscopeMat;
        
        // Вентиляционные решетки на крыше (обтекаемые)
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`hoverRoofVent${i}`, { width: 0.12, height: 0.05, depth: 0.12 }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.28,
                    h * 0.5,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
            roofVent.rotation.x = Math.PI / 2;
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`hoverRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
        }
        
        // Оптические сенсоры (округлые)
        for (let i = 0; i < 2; i++) {
            const sensor = MeshBuilder.CreateBox(`hoverSensor${i}`, { width: 0.08, height: 0.06, depth: 0.08 }, scene);
            sensor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.2,
                    d * 0.45
                ), "forward");
            sensor.rotation.x = Math.PI / 2;
            sensor.parent = chassis;
            const sensorMat = new StandardMaterial(`hoverSensorMat${i}`, scene);
            sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
            sensorMat.emissiveColor = new Color3(0.05, 0.08, 0.1);
            sensor.material = sensorMat;
        }
        
        // Задние огни (округлые)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`hoverTailLight${i}`, { width: 0.08, height: 0.04, depth: 0.08 }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.18,
                    -d * 0.49
                ), "forward");
            tailLight.rotation.x = Math.PI / 2;
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`hoverTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Обтекаемые воздухозаборники по бокам
        for (let i = 0; i < 2; i++) {
            const intake = MeshBuilder.CreateBox(`hoverIntake${i}`, { width: 0.14, height: 0.15, depth: 0.14 }, scene);
            intake.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    h * 0.1,
                    d * 0.2
                ), "x");
                        intake.parent = chassis;
            const intakeMat = new StandardMaterial(`hoverIntakeMat${i}`, scene);
            intakeMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
            intake.material = intakeMat;
        }
        
        // Стабилизационные панели (обтекаемые)
        for (let i = 0; i < 2; i++) {
            const stabilizer = MeshBuilder.CreateBox(`hoverStabilizer${i}`, {
                width: 0.08,
                height: h * 0.4,
                depth: d * 0.3
            }, scene);
            stabilizer.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.1,
                    -d * 0.15
                ), "backward");
            stabilizer.parent = chassis;
            stabilizer.material = accentMat;
        }
    }
    
    if (chassisType.id === "siege") {
        // Siege - массивные многослойные бронеплиты
        const siegePlates = [
            { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
            { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
            { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.25, 0.18) },
            { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 0.98, 0.2, d * 0.98) },
            { pos: new Vector3(0, h * 0.6, 0), size: new Vector3(w * 0.9, 0.15, d * 0.8) }
        ];
        siegePlates.forEach((plate, i) => {
            const plateMesh = MeshBuilder.CreateBox(`siegePlate${i}`, {
                width: plate.size.x,
                height: plate.size.y,
                depth: plate.size.z
            }, scene);
            plateMesh.position = plate.pos;
            plateMesh.parent = chassis;
            plateMesh.material = armorMat;
        });
        // Дополнительные угловые бронеплиты
        for (let i = 0; i < 4; i++) {
            const cornerPlate = MeshBuilder.CreateBox(`cornerPlate${i}`, {
                width: 0.15,
                height: h * 0.4,
                depth: 0.15
            }, scene);
            const angle = (i * Math.PI * 2) / 4;
            cornerPlate.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.55,
                    h * 0.2,
                    Math.sin(angle) * d * 0.55
                ), "forward");
            cornerPlate.parent = chassis;
            cornerPlate.material = armorMat;
        }
        
        // Три люка
        for (let i = 0; i < 3; i++) {
            const hatch = MeshBuilder.CreateBox(`siegeHatch${i}`, {
                width: 0.25,
                height: 0.1,
                depth: 0.25
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.7,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`siegeHeadlight${i}`, {
                width: 0.14,
                height: 0.14,
                depth: 0.12
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.18,
                    d * 0.5
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`siegeHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Две выхлопные трубы
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`siegeExhaust${i}`, {
                width: 0.16,
                height: 0.16,
                depth: 0.22
            }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.22,
                    -d * 0.48
                ), "forward");
            exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
        
        // Множество инструментов
        const siegeShovel = MeshBuilder.CreateBox("siegeShovel", {
            width: 0.16,
            height: 0.45,
            depth: 0.02
        }, scene);
        siegeShovel.position = addZFightingOffset(new Vector3(-w * 0.48, h * 0.22, -d * 0.45), "forward");
        siegeShovel.parent = chassis;
        siegeShovel.material = armorMat;
        
        const siegeAxe = MeshBuilder.CreateBox("siegeAxe", {
            width: 0.35,
            height: 0.12,
            depth: 0.02
        }, scene);
        siegeAxe.position = addZFightingOffset(new Vector3(-w * 0.38, h * 0.28, -d * 0.45), "forward");
        siegeAxe.parent = chassis;
        siegeAxe.material = armorMat;
        
        const siegeCanister = MeshBuilder.CreateBox("siegeCanister", {
            width: 0.16,
            height: 0.3,
            depth: 0.16
        }, scene);
        siegeCanister.position = addZFightingOffset(new Vector3(w * 0.48, h * 0.25, -d * 0.4), "forward");
        siegeCanister.parent = chassis;
        siegeCanister.material = armorMat;
        
        // Антенны (большие)
        for (let i = 0; i < 2; i++) {
            const antenna = MeshBuilder.CreateBox(`siegeAntenna${i}`, { width: 0.03, height: 0.5, depth: 0.03 }, scene);
            antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.8,
                    -d * 0.4
                ), "backward");
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial(`siegeAntennaMat${i}`, scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 3; i++) {
            const periscope = MeshBuilder.CreateBox(`siegePeriscope${i}`, { width: 0.09, height: 0.22, depth: 0.09 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.8,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`siegePeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Большие вентиляционные решетки на крыше
        for (let i = 0; i < 5; i++) {
            const roofVent = MeshBuilder.CreateBox(`siegeRoofVent${i}`, {
                width: 0.3,
                height: 0.08,
                depth: 0.2
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.25,
                    h * 0.68,
                    d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`siegeRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
            
            // Детали решетки (много планок)
            for (let j = 0; j < 8; j++) {
                const ventBar = MeshBuilder.CreateBox(`siegeRoofVentBar${i}_${j}`, {
                    width: 0.04,
                    height: 0.07,
                    depth: 0.18
                }, scene);
                ventBar.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.25 + (j - 3.5) * 0.04,
                    h * 0.68,
                    d * 0.25
                ), "up");
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Массивные выхлопные трубы (большие)
        for (let i = 0; i < 3; i++) {
            const exhaust = MeshBuilder.CreateBox(`siegeExhaustCyl${i}`, { width: 0.16, height: 0.3, depth: 0.16 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.25,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Выхлопное отверстие
            const exhaustHole = MeshBuilder.CreateBox(`siegeExhaustHole${i}`, { width: 0.14, height: 0.05, depth: 0.14 }, scene);
            exhaustHole.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.3,
                    h * 0.25,
                    -d * 0.52
                ), "forward");
                        exhaustHole.parent = chassis;
            const exhaustHoleMat = new StandardMaterial(`siegeExhaustHoleMat${i}`, scene);
            exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
            exhaustHole.material = exhaustHoleMat;
        }
        
        // Оптический прицел на лобовой части (огромный)
        const siegeSight = MeshBuilder.CreateBox("siegeSight", {
            width: 0.22,
            height: 0.15,
            depth: 0.18
        }, scene);
        siegeSight.position = addZFightingOffset(new Vector3(0, h * 0.3, d * 0.5), "forward");
        siegeSight.parent = chassis;
        const siegeSightMat = new StandardMaterial("siegeSightMat", scene);
        siegeSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        siegeSight.material = siegeSightMat;
        
        // Линза прицела (большая)
        const siegeSightLens = MeshBuilder.CreateBox("siegeSightLens", { width: 0.12, height: 0.02, depth: 0.12 }, scene);
        siegeSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.1), "forward");
        siegeSightLens.parent = siegeSight;
        const siegeLensMat = new StandardMaterial("siegeSightLensMat", scene);
        siegeLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        siegeLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        siegeSightLens.material = siegeLensMat;
        
        // Дополнительные броневые накладки на лобовой части (огромные)
        for (let i = 0; i < 3; i++) {
            const frontArmor = MeshBuilder.CreateBox(`siegeFrontArmor${i}`, {
                width: w * 0.35,
                height: h * 0.25,
                depth: 0.15
            }, scene);
            frontArmor.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.32,
                    h * 0.1,
                    d * 0.5
                ), "forward");
            frontArmor.parent = chassis;
            frontArmor.material = armorMat;
        }
        
        // Задние огни (стоп-сигналы, большие)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`siegeTailLight${i}`, {
                width: 0.1,
                height: 0.15,
                depth: 0.06
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.22,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`siegeTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Боковые вентиляционные решетки (большие)
        for (let i = 0; i < 2; i++) {
            const sideVent = MeshBuilder.CreateBox(`siegeSideVent${i}`, {
                width: 0.08,
                height: 0.15,
                depth: 0.2
            }, scene);
            sideVent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.12,
                    d * 0.15
                ), "x");
            sideVent.parent = chassis;
            const sideVentMat = new StandardMaterial(`siegeSideVentMat${i}`, scene);
            sideVentMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            sideVent.material = sideVentMat;
        }
    }
    
    if (chassisType.id === "racer") {
        // Racer - большой спойлер, боковые крылья, воздухозаборники
        const spoiler = MeshBuilder.CreateBox("spoiler", {
            width: w * 1.15,
            height: 0.12,
            depth: 0.18
        }, scene);
        spoiler.position = addZFightingOffset(new Vector3(0, h * 0.55, -d * 0.48), "forward");
        spoiler.parent = chassis;
        spoiler.material = accentMat;
        
        // Боковые крылья
        for (let i = 0; i < 2; i++) {
            const wing = MeshBuilder.CreateBox(`racerWing${i}`, {
                width: 0.1,
                height: h * 0.6,
                depth: d * 0.45
            }, scene);
            wing.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.52,
                    0,
                    d * 0.25
                ), "x");
            wing.parent = chassis;
            wing.material = accentMat;
        }
        
        // Воздухозаборники спереди
        for (let i = 0; i < 2; i++) {
            const intake = MeshBuilder.CreateBox(`racerIntake${i}`, {
                width: 0.1,
                height: h * 0.4,
                depth: 0.15
            }, scene);
            intake.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.1,
                    d * 0.48
                ), "forward");
            intake.parent = chassis;
            intake.material = armorMat;
        }
        
        // Один люк
        const racerHatch = MeshBuilder.CreateBox("racerHatch", {
            width: 0.18,
            height: 0.06,
            depth: 0.18
        }, scene);
        racerHatch.position = addZFightingOffset(new Vector3(0, h * 0.38, 0), "forward");
        racerHatch.parent = chassis;
        racerHatch.material = armorMat;
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`racerHeadlight${i}`, {
                width: 0.08,
                height: 0.08,
                depth: 0.06
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.28,
                    h * 0.08,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`racerHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Выхлоп
        const racerExhaust = MeshBuilder.CreateBox("racerExhaust", {
            width: 0.12,
            height: 0.12,
            depth: 0.18
        }, scene);
        racerExhaust.position = addZFightingOffset(new Vector3(w * 0.32, h * 0.1, -d * 0.48), "forward");
        racerExhaust.parent = chassis;
        racerExhaust.material = armorMat;
        
        // Вентиляционные решетки (спортивные)
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`racerVent${i}`, {
                width: 0.06,
                height: 0.04,
                depth: 0.08
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.25,
                    h * 0.25,
                    d * 0.2
                ), "x");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`racerVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископ
        const racerPeriscope = MeshBuilder.CreateBox("racerPeriscope", { width: 0.06, height: 0.12, depth: 0.06 }, scene);
        racerPeriscope.position = addZFightingOffset(new Vector3(0, h * 0.42, 0), "up");
        racerPeriscope.parent = chassis;
        const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
        racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        racerPeriscope.material = racerPeriscopeMat;
    }
    
    if (chassisType.id === "amphibious") {
        // Amphibious - большие поплавки, водонепроницаемые панели
        for (let i = 0; i < 2; i++) {
            const float = MeshBuilder.CreateBox(`float${i}`, { width: w * 0.35, height: h * 0.7, depth: w * 0.35 }, scene);
            float.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.42,
                    -h * 0.25,
                    0
                ), "down");
            float.parent = chassis;
            float.material = accentMat;
        }
        
        // Водонепроницаемые панели
        const waterSeal = MeshBuilder.CreateBox("waterSeal", {
            width: w * 1.05,
            height: 0.08,
            depth: d * 1.05
        }, scene);
        waterSeal.position = addZFightingOffset(new Vector3(0, h * 0.5, 0), "up");
        waterSeal.parent = chassis;
        waterSeal.material = armorMat;
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`amphibiousHatch${i}`, {
                width: 0.2,
                height: 0.08,
                depth: 0.2
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.52,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`amphibiousHeadlight${i}`, {
                width: 0.1,
                height: 0.1,
                depth: 0.08
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`amphibiousHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Вентиляционные решетки (водонепроницаемые)
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`amphibiousVent${i}`, {
                width: 0.08,
                height: 0.05,
                depth: 0.1
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.3,
                    -d * 0.25
                ), "backward");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`amphibiousVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`amphibiousPeriscope${i}`, { width: 0.07, height: 0.18, depth: 0.07 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.58,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`amphibiousPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
    }
    
    if (chassisType.id === "shield") {
        // Shield - генератор щита, энергетические панели
        const shieldGen = MeshBuilder.CreateBox("shieldGen", { width: w * 0.45, height: w * 0.45, depth: w * 0.45 }, scene);
        shieldGen.position = addZFightingOffset(new Vector3(0, h * 0.45, -d * 0.25), "up");
        shieldGen.parent = chassis;
        const shieldGenMat = new StandardMaterial("shieldGenMat", scene);
        shieldGenMat.diffuseColor = new Color3(0, 1, 0.6);
        shieldGenMat.emissiveColor = new Color3(0, 0.6, 0.3);
        shieldGen.material = shieldGenMat;
        animationElements.shieldMesh = shieldGen;
        
        // Энергетические панели по бокам
        for (let i = 0; i < 2; i++) {
            const energyPanel = MeshBuilder.CreateBox(`energyPanel${i}`, {
                width: 0.1,
                height: h * 0.5,
                depth: d * 0.3
            }, scene);
            energyPanel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.55,
                    h * 0.15,
                    0
                ), "x");
            energyPanel.parent = chassis;
            const panelMat = new StandardMaterial(`energyPanelMat${i}`, scene);
            panelMat.diffuseColor = new Color3(0, 0.8, 0.4);
            panelMat.emissiveColor = new Color3(0, 0.3, 0.15);
            energyPanel.material = panelMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`shieldHatch${i}`, {
                width: 0.2,
                height: 0.08,
                depth: 0.2
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.52,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`shieldHeadlight${i}`, {
                width: 0.1,
                height: 0.1,
                depth: 0.08
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`shieldHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Вентиляционные решетки (энергетические)
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`shieldVent${i}`, {
                width: 0.08,
                height: 0.05,
                depth: 0.1
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.3,
                    -d * 0.25
                ), "backward");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`shieldVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            ventMat.emissiveColor = new Color3(0.05, 0.1, 0.05);
            vent.material = ventMat;
        }
        
        // Энергетические катушки вокруг генератора
        for (let i = 0; i < 4; i++) {
            const coil = MeshBuilder.CreateBox(`shieldCoil${i}`, { width: w * 0.5, height: 0.06, depth: w * 0.5 }, scene);
            const angle = (i * Math.PI * 2) / 4;
            coil.position = addZFightingOffset(new Vector3(0, h * 0.45, -d * 0.25), "up");
            coil.rotation.x = angle;
            coil.parent = chassis;
            const coilMat = new StandardMaterial(`shieldCoilMat${i}`, scene);
            coilMat.diffuseColor = new Color3(0, 0.7, 0.5);
            coilMat.emissiveColor = new Color3(0, 0.4, 0.25);
            coil.material = coilMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`shieldPeriscope${i}`, { width: 0.07, height: 0.18, depth: 0.07 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.6,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`shieldPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Энергетические порты (для зарядки щита)
        for (let i = 0; i < 4; i++) {
            const port = MeshBuilder.CreateBox(`shieldPort${i}`, { width: 0.1, height: 0.08, depth: 0.1 }, scene);
            const angle = (i * Math.PI * 2) / 4;
            port.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.4,
                    h * 0.25,
                    -d * 0.25 + Math.sin(angle) * d * 0.2
                ), "backward");
            port.rotation.x = angle + Math.PI / 2;
            port.parent = chassis;
            const portMat = new StandardMaterial(`shieldPortMat${i}`, scene);
            portMat.diffuseColor = new Color3(0, 0.6, 0.4);
            portMat.emissiveColor = new Color3(0, 0.3, 0.2);
            port.material = portMat;
        }
        
        // Верхние вентиляционные решетки (энергетические)
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`shieldRoofVent${i}`, {
                width: 0.15,
                height: 0.04,
                depth: 0.12
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.25,
                    h * 0.54,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`shieldRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.15, 0.12);
            roofVentMat.emissiveColor = new Color3(0.03, 0.05, 0.03);
            roofVent.material = roofVentMat;
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`shieldTailLight${i}`, {
                width: 0.06,
                height: 0.1,
                depth: 0.04
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`shieldTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Радиоантенна сзади
        const shieldAntenna = MeshBuilder.CreateBox("shieldAntenna", { width: 0.025, height: 0.5, depth: 0.025 }, scene);
        shieldAntenna.position = addZFightingOffset(new Vector3(0, h * 0.65, -d * 0.3), "up");
        shieldAntenna.parent = chassis;
        const shieldAntennaMat = new StandardMaterial("shieldAntennaMat", scene);
        shieldAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        shieldAntenna.material = shieldAntennaMat;
        
        // Основание антенны
        const shieldAntennaBase = MeshBuilder.CreateBox("shieldAntennaBase", {
            width: 0.1,
            height: 0.1,
            depth: 0.1
        }, scene);
        shieldAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.54, -d * 0.3), "up");
        shieldAntennaBase.parent = chassis;
        shieldAntennaBase.material = armorMat;
        
        // Оптический прицел на лобовой части
        const shieldSight = MeshBuilder.CreateBox("shieldSight", {
            width: 0.14,
            height: 0.09,
            depth: 0.11
        }, scene);
        shieldSight.position = addZFightingOffset(new Vector3(0, h * 0.22, d * 0.49), "forward");
        shieldSight.parent = chassis;
        const shieldSightMat = new StandardMaterial("shieldSightMat", scene);
        shieldSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        shieldSight.material = shieldSightMat;
        
        // Линза прицела
        const shieldSightLens = MeshBuilder.CreateBox("shieldSightLens", { width: 0.07, height: 0.02, depth: 0.07 }, scene);
        shieldSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.06), "forward");
        shieldSightLens.parent = shieldSight;
        const shieldLensMat = new StandardMaterial("shieldSightLensMat", scene);
        shieldLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        shieldLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        shieldSightLens.material = shieldLensMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`shieldExhaust${i}`, { width: 0.12, height: 0.2, depth: 0.12 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.2,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
    }
    
    if (chassisType.id === "drone") {
        // Drone - платформы для дронов, антенны связи
        animationElements.droneMeshes = [];
        for (let i = 0; i < 2; i++) {
            const platform = MeshBuilder.CreateBox(`dronePlatform${i}`, {
                width: w * 0.45,
                height: 0.12,
                depth: w * 0.45
            }, scene);
            platform.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.65,
                    0
                ), "up");
            platform.parent = chassis;
            const platformMat = new StandardMaterial(`platformMat${i}`, scene);
            platformMat.diffuseColor = new Color3(0.6, 0, 1);
            platformMat.emissiveColor = new Color3(0.35, 0, 0.7);
            platform.material = platformMat;
            animationElements.droneMeshes.push(platform);
            
            // Антенны на платформах
            const antenna = MeshBuilder.CreateBox(`droneAntenna${i}`, { width: 0.03, height: 0.15, depth: 0.03 }, scene);
            antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.72,
                    0
                ), "up");
            antenna.parent = chassis;
            antenna.material = platformMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`droneHatch${i}`, {
                width: 0.2,
                height: 0.08,
                depth: 0.2
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.6,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`droneHeadlight${i}`, {
                width: 0.1,
                height: 0.1,
                depth: 0.08
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`droneHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Вентиляционные решетки (для охлаждения систем управления дронами)
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`droneVent${i}`, {
                width: 0.08,
                height: 0.05,
                depth: 0.1
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.3,
                    -d * 0.25
                ), "backward");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`droneVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`dronePeriscope${i}`, { width: 0.07, height: 0.18, depth: 0.07 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.66,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`dronePeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Сенсорные панели на платформах
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const sensor = MeshBuilder.CreateBox(`droneSensor${i}_${j}`, {
                    width: 0.08,
                    height: 0.04,
                    depth: 0.08
                }, scene);
                sensor.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38 + (j === 0 ? -1 : 1) * 0.1,
                    h * 0.68,
                    (j === 0 ? -1 : 1) * 0.1
                ), "up");
                sensor.parent = chassis;
                const sensorMat = new StandardMaterial(`droneSensorMat${i}_${j}`, scene);
                sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.25);
                sensorMat.emissiveColor = new Color3(0.2, 0, 0.4);
                sensor.material = sensorMat;
            }
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`droneRoofVent${i}`, {
                width: 0.12,
                height: 0.04,
                depth: 0.1
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.25,
                    h * 0.58,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`droneRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.15);
            roofVent.material = roofVentMat;
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`droneTailLight${i}`, {
                width: 0.06,
                height: 0.1,
                depth: 0.04
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`droneTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Оптический прицел на лобовой части
        const droneSight = MeshBuilder.CreateBox("droneSight", {
            width: 0.14,
            height: 0.09,
            depth: 0.11
        }, scene);
        droneSight.position = addZFightingOffset(new Vector3(0, h * 0.22, d * 0.49), "forward");
        droneSight.parent = chassis;
        const droneSightMat = new StandardMaterial("droneSightMat", scene);
        droneSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        droneSight.material = droneSightMat;
        
        // Линза прицела
        const droneSightLens = MeshBuilder.CreateBox("droneSightLens", { width: 0.07, height: 0.02, depth: 0.07 }, scene);
        droneSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.06), "forward");
        droneSightLens.parent = droneSight;
        const droneLensMat = new StandardMaterial("droneSightLensMat", scene);
        droneLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        droneLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        droneSightLens.material = droneLensMat;
        
        // Радиоантенна сзади (для связи с дронами)
        const droneAntenna = MeshBuilder.CreateBox("droneAntenna", { width: 0.025, height: 0.55, depth: 0.025 }, scene);
        droneAntenna.position = addZFightingOffset(new Vector3(0, h * 0.72, -d * 0.3), "up");
        droneAntenna.parent = chassis;
        const droneAntennaMat = new StandardMaterial("droneAntennaMat", scene);
        droneAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        droneAntenna.material = droneAntennaMat;
        
        // Основание антенны
        const droneAntennaBase = MeshBuilder.CreateBox("droneAntennaBase", {
            width: 0.1,
            height: 0.1,
            depth: 0.1
        }, scene);
        droneAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.6, -d * 0.3), "up");
        droneAntennaBase.parent = chassis;
        droneAntennaBase.material = armorMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`droneExhaust${i}`, { width: 0.12, height: 0.2, depth: 0.12 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.2,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
    }
    
    if (chassisType.id === "artillery") {
        // Artillery - массивные стабилизаторы, опорные лапы
        for (let i = 0; i < 4; i++) {
            const stabilizer = MeshBuilder.CreateBox(`stabilizer${i}`, { width: 0.25, height: 0.35, depth: 0.25 }, scene);
            const angle = (i * Math.PI * 2) / 4;
            stabilizer.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.65,
                    -h * 0.45,
                    Math.sin(angle) * d * 0.65
                ), "forward");
            stabilizer.parent = chassis;
            stabilizer.material = armorMat;
        }
        
        // Опорные лапы
        for (let i = 0; i < 4; i++) {
            const leg = MeshBuilder.CreateBox(`artilleryLeg${i}`, {
                width: 0.12,
                height: 0.2,
                depth: 0.12
            }, scene);
            const angle = (i * Math.PI * 2) / 4;
            leg.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * w * 0.7,
                    -h * 0.55,
                    Math.sin(angle) * d * 0.7
                ), "forward");
            leg.parent = chassis;
            leg.material = armorMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`artilleryHatch${i}`, {
                width: 0.22,
                height: 0.1,
                depth: 0.22
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.7,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`artilleryHeadlight${i}`, {
                width: 0.12,
                height: 0.12,
                depth: 0.1
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.2,
                    d * 0.5
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`artilleryHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Выхлоп
        const artilleryExhaust = MeshBuilder.CreateBox("artilleryExhaust", {
            width: 0.14,
            height: 0.14,
            depth: 0.2
        }, scene);
        artilleryExhaust.position = addZFightingOffset(new Vector3(w * 0.4, h * 0.22, -d * 0.48), "forward");
        artilleryExhaust.parent = chassis;
        artilleryExhaust.material = armorMat;
        
        // Вентиляционные решетки (большие для артиллерии)
        for (let i = 0; i < 3; i++) {
            const vent = MeshBuilder.CreateBox(`artilleryVent${i}`, {
                width: 0.12,
                height: 0.08,
                depth: 0.14
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.35,
                    h * 0.6,
                    -d * 0.3
                ), "backward");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`artilleryVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`artilleryPeriscope${i}`, { width: 0.09, height: 0.22, depth: 0.09 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.85,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`artilleryPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Системы наведения (оптические прицелы)
        for (let i = 0; i < 2; i++) {
            const sight = MeshBuilder.CreateBox(`artillerySight${i}`, {
                width: 0.16,
                height: 0.12,
                depth: 0.14
            }, scene);
            sight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.75,
                    d * 0.45
                ), "forward");
            sight.parent = chassis;
            const sightMat = new StandardMaterial(`artillerySightMat${i}`, scene);
            sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            sight.material = sightMat;
            
            // Линза прицела
            const sightLens = MeshBuilder.CreateBox(`artillerySightLens${i}`, { width: 0.08, height: 0.02, depth: 0.08 }, scene);
            sightLens.position = addZFightingOffset(new Vector3(0, 0, 0.08), "forward");
            sightLens.parent = sight;
            const lensMat = new StandardMaterial(`artillerySightLensMat${i}`, scene);
            lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            lensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            sightLens.material = lensMat;
        }
        
        // Верхние вентиляционные решетки на крыше (большие)
        for (let i = 0; i < 5; i++) {
            const roofVent = MeshBuilder.CreateBox(`artilleryRoofVent${i}`, {
                width: 0.2,
                height: 0.06,
                depth: 0.16
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.28,
                    h * 0.72,
                    d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`artilleryRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
            
            // Детали решетки
            for (let j = 0; j < 5; j++) {
                const ventBar = MeshBuilder.CreateBox(`artilleryRoofVentBar${i}_${j}`, {
                    width: 0.03,
                    height: 0.05,
                    depth: 0.14
                }, scene);
                ventBar.position = addZFightingOffset(new Vector3(
                    (i - 2) * w * 0.28 + (j - 2) * 0.04,
                    h * 0.72,
                    d * 0.25
                ), "up");
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Радиоантенна сзади
        const artilleryAntenna = MeshBuilder.CreateBox("artilleryAntenna", { width: 0.03, height: 0.6, depth: 0.03 }, scene);
        artilleryAntenna.position = addZFightingOffset(new Vector3(0, h * 0.9, -d * 0.3), "up");
        artilleryAntenna.parent = chassis;
        const artilleryAntennaMat = new StandardMaterial("artilleryAntennaMat", scene);
        artilleryAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        artilleryAntenna.material = artilleryAntennaMat;
        
        // Основание антенны
        const artilleryAntennaBase = MeshBuilder.CreateBox("artilleryAntennaBase", {
            width: 0.12,
            height: 0.12,
            depth: 0.12
        }, scene);
        artilleryAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.76, -d * 0.3), "up");
        artilleryAntennaBase.parent = chassis;
        artilleryAntennaBase.material = armorMat;
        
        // Задние огни (стоп-сигналы, большие)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`artilleryTailLight${i}`, {
                width: 0.08,
                height: 0.14,
                depth: 0.06
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.45,
                    h * 0.22,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`artilleryTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`artillerySideLight${i}`, {
                width: 0.06,
                height: 0.09,
                depth: 0.06
            }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.15,
                    -d * 0.25
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`artillerySideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Выхлопная труба (большая)
        const artilleryExhaustUpgraded = MeshBuilder.CreateBox("artilleryExhaustUpgraded", { width: 0.18, height: 0.28, depth: 0.18 }, scene);
        artilleryExhaustUpgraded.position = addZFightingOffset(new Vector3(0, h * 0.25, -d * 0.48), "forward");
                artilleryExhaustUpgraded.parent = chassis;
        artilleryExhaustUpgraded.material = armorMat;
        
        // Выхлопное отверстие
        const artilleryExhaustHole = MeshBuilder.CreateBox("artilleryExhaustHole", { width: 0.16, height: 0.05, depth: 0.16 }, scene);
        artilleryExhaustHole.position = addZFightingOffset(new Vector3(0, h * 0.25, -d * 0.52), "forward");
                artilleryExhaustHole.parent = chassis;
        const artilleryExhaustHoleMat = new StandardMaterial("artilleryExhaustHoleMat", scene);
        artilleryExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
        artilleryExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
        artilleryExhaustHole.material = artilleryExhaustHoleMat;
    }
    
    if (chassisType.id === "destroyer") {
        // Destroyer - длинный клиновидный нос, низкий профиль
        const destroyerNose = MeshBuilder.CreateBox("destroyerNose", {
            width: w * 0.85,
            height: h * 0.55,
            depth: 0.35
        }, scene);
        destroyerNose.position = addZFightingOffset(new Vector3(0, 0, d * 0.52), "forward");
        destroyerNose.parent = chassis;
        destroyerNose.material = accentMat;
        
        // Боковые бронеплиты
        for (let i = 0; i < 2; i++) {
            const sidePlate = MeshBuilder.CreateBox(`destroyerSide${i}`, {
                width: 0.12,
                height: h * 0.7,
                depth: d * 0.5
            }, scene);
            sidePlate.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    0,
                    d * 0.15
                ), "x");
            sidePlate.parent = chassis;
            sidePlate.material = armorMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`destroyerHatch${i}`, {
                width: 0.18,
                height: 0.06,
                depth: 0.18
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.48,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`destroyerHeadlight${i}`, {
                width: 0.1,
                height: 0.1,
                depth: 0.08
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.1,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`destroyerHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Вентиляционные решетки
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`destroyerVent${i}`, {
                width: 0.08,
                height: 0.05,
                depth: 0.1
            }, scene);
            vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.25,
                    -d * 0.25
                ), "backward");
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`destroyerVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`destroyerPeriscope${i}`, { width: 0.07, height: 0.14, depth: 0.07 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.54,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`destroyerPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Оптический прицел на лобовой части (большой)
        const destroyerSight = MeshBuilder.CreateBox("destroyerSight", {
            width: 0.15,
            height: 0.1,
            depth: 0.12
        }, scene);
        destroyerSight.position = addZFightingOffset(new Vector3(0, h * 0.2, d * 0.48), "forward");
        destroyerSight.parent = chassis;
        const destroyerSightMat = new StandardMaterial("destroyerSightMat", scene);
        destroyerSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        destroyerSight.material = destroyerSightMat;
        
        // Линза прицела
        const destroyerSightLens = MeshBuilder.CreateBox("destroyerSightLens", { width: 0.08, height: 0.02, depth: 0.08 }, scene);
        destroyerSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.07), "forward");
        destroyerSightLens.parent = destroyerSight;
        const destroyerLensMat = new StandardMaterial("destroyerSightLensMat", scene);
        destroyerLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        destroyerLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        destroyerSightLens.material = destroyerLensMat;
        
        // Дополнительные броневые накладки на лобовой части
        for (let i = 0; i < 3; i++) {
            const frontArmor = MeshBuilder.CreateBox(`destroyerFrontArmor${i}`, {
                width: w * 0.28,
                height: h * 0.18,
                depth: 0.1
            }, scene);
            frontArmor.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.28,
                    h * 0.05,
                    d * 0.48
                ), "forward");
            frontArmor.parent = chassis;
            frontArmor.material = armorMat;
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`destroyerRoofVent${i}`, {
                width: 0.12,
                height: 0.04,
                depth: 0.1
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.28,
                    h * 0.46,
                    (i < 2 ? -1 : 1) * d * 0.2
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`destroyerRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
            
            // Детали решетки
            for (let j = 0; j < 3; j++) {
                const ventBar = MeshBuilder.CreateBox(`destroyerRoofVentBar${i}_${j}`, {
                    width: 0.02,
                    height: 0.03,
                    depth: 0.08
                }, scene);
                ventBar.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.28,
                    h * 0.46,
                    (i < 2 ? -1 : 1) * d * 0.2 + (j - 1) * 0.03
                ), "up");
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Выхлопные трубы сзади (большие)
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`destroyerExhaust${i}`, { width: 0.12, height: 0.25, depth: 0.12 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.18,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Выхлопное отверстие
            const exhaustHole = MeshBuilder.CreateBox(`destroyerExhaustHole${i}`, { width: 0.1, height: 0.04, depth: 0.1 }, scene);
            exhaustHole.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.18,
                    -d * 0.52
                ), "forward");
                        exhaustHole.parent = chassis;
            const exhaustHoleMat = new StandardMaterial(`destroyerExhaustHoleMat${i}`, scene);
            exhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            exhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
            exhaustHole.material = exhaustHoleMat;
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`destroyerTailLight${i}`, {
                width: 0.06,
                height: 0.1,
                depth: 0.04
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.14,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`destroyerTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`destroyerSideLight${i}`, {
                width: 0.05,
                height: 0.07,
                depth: 0.05
            }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.08,
                    -d * 0.2
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`destroyerSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Радиоантенна сзади
        const destroyerAntenna = MeshBuilder.CreateBox("destroyerAntenna", { width: 0.025, height: 0.45, depth: 0.025 }, scene);
        destroyerAntenna.position = addZFightingOffset(new Vector3(0, h * 0.65, -d * 0.3), "up");
        destroyerAntenna.parent = chassis;
        const destroyerAntennaMat = new StandardMaterial("destroyerAntennaMat", scene);
        destroyerAntennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        destroyerAntenna.material = destroyerAntennaMat;
        
        // Основание антенны
        const destroyerAntennaBase = MeshBuilder.CreateBox("destroyerAntennaBase", {
            width: 0.1,
            height: 0.1,
            depth: 0.1
        }, scene);
        destroyerAntennaBase.position = addZFightingOffset(new Vector3(0, h * 0.54, -d * 0.3), "up");
        destroyerAntennaBase.parent = chassis;
        destroyerAntennaBase.material = armorMat;
        
        // Дополнительные инструменты на корме
        const destroyerToolBox = MeshBuilder.CreateBox("destroyerToolBox", {
            width: 0.2,
            height: 0.14,
            depth: 0.16
        }, scene);
        destroyerToolBox.position = addZFightingOffset(new Vector3(0, h * 0.24, -d * 0.42), "forward");
        destroyerToolBox.parent = chassis;
        destroyerToolBox.material = armorMat;
    }
    
    if (chassisType.id === "command") {
        // Command - аура, множественные антенны, командный модуль
        const commandAura = MeshBuilder.CreateBox("commandAura", { width: w * 1.6, height: 0.06, depth: w * 1.6 }, scene);
        commandAura.position = addZFightingOffset(new Vector3(0, h * 0.55, 0), "up");
        commandAura.rotation.x = Math.PI / 2;
        commandAura.parent = chassis;
        const auraMat = new StandardMaterial("auraMat", scene);
        auraMat.diffuseColor = new Color3(1, 0.88, 0);
        auraMat.emissiveColor = new Color3(0.6, 0.5, 0);
        auraMat.disableLighting = true;
        commandAura.material = auraMat;
        animationElements.commandAura = commandAura;
        
        // Командный модуль сверху
        const commandModule = MeshBuilder.CreateBox("commandModule", {
            width: w * 0.6,
            height: h * 0.3,
            depth: d * 0.4
        }, scene);
        commandModule.position = addZFightingOffset(new Vector3(0, h * 0.6, -d * 0.3), "up");
        commandModule.parent = chassis;
        const moduleMat = new StandardMaterial("moduleMat", scene);
        moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
        moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
        commandModule.material = moduleMat;
        
        // Множественные антенны
        for (let i = 0; i < 4; i++) {
            const antenna = MeshBuilder.CreateBox(`cmdAntenna${i}`, { width: 0.025, height: 0.5, depth: 0.025 }, scene);
            antenna.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.35,
                    h * 0.7,
                    (i < 2 ? -1 : 1) * d * 0.35
                ), "forward");
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial(`cmdAntennaMat${i}`, scene);
            antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
            antenna.material = antennaMat;
        }
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`commandHatch${i}`, {
                width: 0.22,
                height: 0.08,
                depth: 0.22
            }, scene);
            hatch.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.6,
                    -d * 0.1
                ), "backward");
            hatch.parent = chassis;
            hatch.material = armorMat;
        }
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`commandHeadlight${i}`, {
                width: 0.1,
                height: 0.1,
                depth: 0.08
            }, scene);
            headlight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.38,
                    h * 0.15,
                    d * 0.48
                ), "forward");
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`commandHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateBox(`commandPeriscope${i}`, { width: 0.08, height: 0.2, depth: 0.08 }, scene);
            periscope.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.3,
                    h * 0.68,
                    -d * 0.1
                ), "backward");
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`commandPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Радиостанции на командном модуле
        for (let i = 0; i < 2; i++) {
            const radio = MeshBuilder.CreateBox(`commandRadio${i}`, {
                width: 0.15,
                height: 0.12,
                depth: 0.1
            }, scene);
            radio.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.22,
                    h * 0.72,
                    -d * 0.3
                ), "backward");
            radio.parent = chassis;
            const radioMat = new StandardMaterial(`commandRadioMat${i}`, scene);
            radioMat.diffuseColor = new Color3(0.8, 0.7, 0.2);
            radioMat.emissiveColor = new Color3(0.2, 0.15, 0.05);
            radio.material = radioMat;
        }
        
        // Сенсорные панели на командном модуле
        for (let i = 0; i < 3; i++) {
            const sensor = MeshBuilder.CreateBox(`commandSensor${i}`, {
                width: 0.1,
                height: 0.06,
                depth: 0.08
            }, scene);
            sensor.position = addZFightingOffset(new Vector3(
                    (i - 1) * w * 0.18,
                    h * 0.72,
                    -d * 0.2
                ), "backward");
            sensor.parent = chassis;
            const sensorMat = new StandardMaterial(`commandSensorMat${i}`, scene);
            sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
            sensorMat.emissiveColor = new Color3(0.3, 0.25, 0);
            sensor.material = sensorMat;
        }
        
        // Верхние вентиляционные решетки на крыше
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateBox(`commandRoofVent${i}`, {
                width: 0.15,
                height: 0.04,
                depth: 0.12
            }, scene);
            roofVent.position = addZFightingOffset(new Vector3(
                    (i % 2 === 0 ? -1 : 1) * w * 0.25,
                    h * 0.58,
                    (i < 2 ? -1 : 1) * d * 0.25
                ), "up");
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`commandRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
        }
        
        // Задние огни (стоп-сигналы)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`commandTailLight${i}`, {
                width: 0.06,
                height: 0.1,
                depth: 0.04
            }, scene);
            tailLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.4,
                    h * 0.16,
                    -d * 0.49
                ), "forward");
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`commandTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Оптический прицел на лобовой части
        const commandSight = MeshBuilder.CreateBox("commandSight", {
            width: 0.14,
            height: 0.09,
            depth: 0.11
        }, scene);
        commandSight.position = addZFightingOffset(new Vector3(0, h * 0.22, d * 0.49), "forward");
        commandSight.parent = chassis;
        const commandSightMat = new StandardMaterial("commandSightMat", scene);
        commandSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        commandSight.material = commandSightMat;
        
        // Линза прицела
        const commandSightLens = MeshBuilder.CreateBox("commandSightLens", { width: 0.07, height: 0.02, depth: 0.07 }, scene);
        commandSightLens.position = addZFightingOffset(new Vector3(0, 0, 0.06), "forward");
        commandSightLens.parent = commandSight;
        const commandLensMat = new StandardMaterial("commandSightLensMat", scene);
        commandLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        commandLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        commandSightLens.material = commandLensMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateBox(`commandExhaust${i}`, { width: 0.12, height: 0.22, depth: 0.12 }, scene);
            exhaust.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.35,
                    h * 0.2,
                    -d * 0.48
                ), "forward");
                        exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
        
        // Боковые фары (сигнальные)
        for (let i = 0; i < 2; i++) {
            const sideLight = MeshBuilder.CreateBox(`commandSideLight${i}`, {
                width: 0.05,
                height: 0.07,
                depth: 0.05
            }, scene);
            sideLight.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * w * 0.48,
                    h * 0.1,
                    -d * 0.2
                ), "backward");
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`commandSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
    }
    
    // Антенны для medium/heavy/assault
    if (chassisType.id === "medium" || chassisType.id === "heavy" || chassisType.id === "assault") {
        const antenna = MeshBuilder.CreateBox("antenna", { width: 0.025, height: 0.35, depth: 0.025 }, scene);
        antenna.position = addZFightingOffset(new Vector3(w * 0.42, h * 0.65, -d * 0.42), "forward");
        antenna.parent = chassis;
        const antennaMat = new StandardMaterial("antennaMat", scene);
        antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        antenna.material = antennaMat;
    }
}


