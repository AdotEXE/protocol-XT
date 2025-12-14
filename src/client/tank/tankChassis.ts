/**
 * Tank Chassis Creation Module
 * Вынесенная логика создания корпусов танков из tankController.ts
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
// Note: CreateSphere and CreateTorus are accessed via MeshBuilder.CreateSphere and MeshBuilder.CreateTorus
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
            chassis = MeshBuilder.CreateCylinder("tankHull", { 
                diameter: Math.max(w, d) * 1.1,
                height: h * 0.95, 
                tessellation: 8
            }, scene);
            chassis.rotation.z = Math.PI / 2;
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
            chassis = MeshBuilder.CreateCylinder("tankHull", { 
                diameter: Math.max(w, d) * 1.2,
                height: h * 1.1,
                tessellation: 8
            }, scene);
            chassis.rotation.z = Math.PI / 2;
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
            lightFront.position = new Vector3(0, h * 0.15, d * 0.52);
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
                intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45);
                intake.parent = chassis;
                intake.material = accentMat;
            }
            
            // Задний спойлер (угловатый)
            const lightSpoiler = MeshBuilder.CreateBox("lightSpoiler", {
                width: w * 1.2,
                height: 0.2,
                depth: 0.25
            }, scene);
            lightSpoiler.position = new Vector3(0, h * 0.5, -d * 0.48);
            lightSpoiler.parent = chassis;
            lightSpoiler.material = accentMat;
            
            // Боковые обтекатели (угловатые)
            for (let i = 0; i < 2; i++) {
                const fairing = MeshBuilder.CreateBox(`lightFairing${i}`, {
                    width: 0.15,
                    height: h * 0.75,
                    depth: d * 0.55
                }, scene);
                fairing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2);
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
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1);
                hatch.parent = chassis;
                hatch.material = armorMat;
            }
            
            // Выхлопная труба сзади
            const exhaust = MeshBuilder.CreateBox("lightExhaust", {
                width: 0.15,
                height: 0.15,
                depth: 0.2
            }, scene);
            exhaust.position = new Vector3(w * 0.35, h * 0.2, -d * 0.48);
            exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Фары спереди (маленькие, угловатые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`lightHeadlight${i}`, {
                    width: 0.08,
                    height: 0.08,
                    depth: 0.06
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5);
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
            shovel.position = new Vector3(-w * 0.4, h * 0.2, -d * 0.48);
            shovel.parent = chassis;
            shovel.material = armorMat;
            
            const axe = MeshBuilder.CreateBox("lightAxe", {
                width: 0.25,
                height: 0.08,
                depth: 0.02
            }, scene);
            axe.position = new Vector3(-w * 0.3, h * 0.25, -d * 0.48);
            axe.parent = chassis;
            axe.material = armorMat;
            
            // Вентиляционные решетки по бокам (улучшенные)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`lightVent${i}`, {
                    width: 0.05,
                    height: 0.12,
                    depth: 0.15
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1);
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
                    ventDetail.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1 + (j - 1) * 0.05);
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископ на люке
            const periscope = MeshBuilder.CreateCylinder("lightPeriscope", {
                height: 0.15,
                diameter: 0.06,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3(0, h * 0.55, -d * 0.1);
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
            binocular.position = new Vector3(0, h * 0.48, d * 0.4);
            binocular.parent = chassis;
            const binocularMat = new StandardMaterial("lightBinocularMat", scene);
            binocularMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            binocular.material = binocularMat;
            
            // Линзы бинокля
            for (let i = 0; i < 2; i++) {
                const lens = MeshBuilder.CreateCylinder(`lightLens${i}`, {
                    height: 0.02,
                    diameter: 0.06,
                    tessellation: 8
                }, scene);
                lens.position = new Vector3((i === 0 ? -1 : 1) * 0.06, 0, 0.06);
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
                armorPlate.position = new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48);
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
                roofVent.position = new Vector3((i - 1) * w * 0.3, h * 0.47, d * 0.2);
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
                    ventBar.position = new Vector3((i - 1) * w * 0.3 + (j - 2) * 0.04, h * 0.47, d * 0.2);
                    ventBar.parent = chassis;
                    ventBar.material = roofVentMat;
                }
            }
            
            // Радиоантенна сзади
            const antenna = MeshBuilder.CreateCylinder("lightAntenna", {
                height: 0.4,
                diameter: 0.02,
                tessellation: 8
            }, scene);
            antenna.position = new Vector3(0, h * 0.6, -d * 0.4);
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
            antennaBase.position = new Vector3(0, h * 0.52, -d * 0.4);
            antennaBase.parent = chassis;
            antennaBase.material = armorMat;
            
            // Боковые броневые экраны
            for (let i = 0; i < 2; i++) {
                const sideArmor = MeshBuilder.CreateBox(`lightSideArmor${i}`, {
                    width: 0.12,
                    height: h * 0.5,
                    depth: d * 0.3
                }, scene);
                sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, d * 0.05);
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
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, -d * 0.2);
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
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, -d * 0.49);
                tailLight.parent = chassis;
                const tailLightMat = new StandardMaterial(`lightTailLightMat${i}`, scene);
                tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                tailLight.material = tailLightMat;
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
            scoutNose.position = new Vector3(0, 0, d * 0.5);
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
                wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3);
                wing.parent = chassis;
                wing.material = accentMat;
            }
            
            // Задний диффузор (угловатый)
            const diffuser = MeshBuilder.CreateBox("scoutDiffuser", {
                width: w * 0.9,
                height: 0.15,
                depth: 0.2
            }, scene);
            diffuser.position = new Vector3(0, -h * 0.42, -d * 0.45);
            diffuser.parent = chassis;
            diffuser.material = accentMat;
            
            // Один люк на крыше
            const scoutHatch = MeshBuilder.CreateBox("scoutHatch", {
                width: 0.18,
                height: 0.06,
                depth: 0.18
            }, scene);
            scoutHatch.position = new Vector3(0, h * 0.42, 0);
            scoutHatch.parent = chassis;
            scoutHatch.material = armorMat;
            
            // Радиоантенна на корме (угловатая)
            const scoutAntenna = MeshBuilder.CreateBox("scoutAntenna", {
                width: 0.02,
                height: 0.3,
                depth: 0.02
            }, scene);
            scoutAntenna.position = new Vector3(0, h * 0.45, -d * 0.45);
            scoutAntenna.parent = chassis;
            scoutAntenna.material = armorMat;
            
            // Две фары (очень маленькие, скрытые)
            for (let i = 0; i < 2; i++) {
                const headlight = MeshBuilder.CreateBox(`scoutHeadlight${i}`, {
                    width: 0.06,
                    height: 0.06,
                    depth: 0.04
                }, scene);
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48);
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
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15);
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
                    ventBar.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15 + (j - 1) * 0.04);
                    ventBar.parent = chassis;
                    ventBar.material = ventMat;
                }
            }
            
            // Перископ на люке
            const scoutPeriscope = MeshBuilder.CreateCylinder("scoutPeriscope", {
                height: 0.12,
                diameter: 0.05,
                tessellation: 8
            }, scene);
            scoutPeriscope.position = new Vector3(0, h * 0.5, 0);
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
            scoutSight.position = new Vector3(0, h * 0.2, d * 0.48);
            scoutSight.parent = chassis;
            const scoutSightMat = new StandardMaterial("scoutSightMat", scene);
            scoutSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            scoutSight.material = scoutSightMat;
            
            // Линза прицела
            const scoutSightLens = MeshBuilder.CreateCylinder("scoutSightLens", {
                height: 0.02,
                diameter: 0.05,
                tessellation: 8
            }, scene);
            scoutSightLens.position = new Vector3(0, 0, 0.05);
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
                frontArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.2, h * 0.02, d * 0.48);
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Выхлопная труба сзади (маленькая)
            const scoutExhaust = MeshBuilder.CreateBox("scoutExhaust", {
                width: 0.1,
                height: 0.1,
                depth: 0.15
            }, scene);
            scoutExhaust.position = new Vector3(w * 0.3, h * 0.15, -d * 0.48);
            scoutExhaust.parent = chassis;
            scoutExhaust.material = armorMat;
            
            // Задние огни (стоп-сигналы)
            for (let i = 0; i < 2; i++) {
                const tailLight = MeshBuilder.CreateBox(`scoutTailLight${i}`, {
                    width: 0.04,
                    height: 0.06,
                    depth: 0.03
                }, scene);
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.12, -d * 0.49);
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
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.05, -d * 0.2);
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
            scoutRoofVent.position = new Vector3(0, h * 0.44, d * 0.2);
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
                ventBar.position = new Vector3((i - 1.5) * 0.04, h * 0.44, d * 0.2);
                ventBar.parent = chassis;
                ventBar.material = scoutRoofVentMat;
            }
            
            // Легкие броневые экраны по бокам
            for (let i = 0; i < 2; i++) {
                const sideArmor = MeshBuilder.CreateBox(`scoutSideArmor${i}`, {
                    width: 0.1,
                    height: h * 0.4,
                    depth: d * 0.25
                }, scene);
                sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.08, d * 0.08);
                sideArmor.parent = chassis;
                sideArmor.material = armorMat;
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
            topPlate.position = new Vector3(0, h * 0.65, 0);
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
                corner.position = new Vector3(posX, h * 0.55, posZ);
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
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.5);
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
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, -d * 0.48);
                exhaust.parent = chassis;
                exhaust.material = armorMat;
            }
            
            // Инструменты: лопата, топор, канистра
            const heavyShovel = MeshBuilder.CreateBox("heavyShovel", {
                width: 0.15,
                height: 0.4,
                depth: 0.02
            }, scene);
            heavyShovel.position = new Vector3(-w * 0.45, h * 0.2, -d * 0.45);
            heavyShovel.parent = chassis;
            heavyShovel.material = armorMat;
            
            const heavyAxe = MeshBuilder.CreateBox("heavyAxe", {
                width: 0.3,
                height: 0.1,
                depth: 0.02
            }, scene);
            heavyAxe.position = new Vector3(-w * 0.35, h * 0.25, -d * 0.45);
            heavyAxe.parent = chassis;
            heavyAxe.material = armorMat;
            
            const heavyCanister = MeshBuilder.CreateBox("heavyCanister", {
                width: 0.14,
                height: 0.25,
                depth: 0.14
            }, scene);
            heavyCanister.position = new Vector3(w * 0.45, h * 0.22, -d * 0.4);
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
                vent.position = new Vector3(posX, h * 0.5, posZ);
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
                    ventDetail.position = new Vector3(posX, h * 0.5, posZ + (j - 2) * 0.025);
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы на люках (три штуки)
            for (let i = 0; i < 3; i++) {
                const periscope = MeshBuilder.CreateCylinder(`heavyPeriscope${i}`, {
                    height: 0.2,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i - 1) * w * 0.3, h * 0.75, -d * 0.1);
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
                energyBooster.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, h * 0.3, d * 0.4);
                energyBooster.parent = chassis;
                const boosterMat = new StandardMaterial(`heavyBoosterMat${i}`, scene);
                boosterMat.diffuseColor = new Color3(0.2, 0.4, 0.8);
                boosterMat.emissiveColor = new Color3(0.1, 0.2, 0.4);
                energyBooster.material = boosterMat;
                animationElements.energyBoosters = animationElements.energyBoosters || [];
                animationElements.energyBoosters.push(energyBooster);
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
                spike.position = new Vector3((i - 1) * w * 0.25, h * 0.3, d * 0.52);
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
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.48);
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
                headlightGuard.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.46);
                headlightGuard.parent = chassis;
                headlightGuard.material = armorMat;
            }
            
            // Выхлоп
            const assaultExhaust = MeshBuilder.CreateBox("assaultExhaust", {
                width: 0.13,
                height: 0.13,
                depth: 0.18
            }, scene);
            assaultExhaust.position = new Vector3(w * 0.38, h * 0.18, -d * 0.45);
            assaultExhaust.parent = chassis;
            assaultExhaust.material = armorMat;
            
            // Инструменты
            const assaultShovel = MeshBuilder.CreateBox("assaultShovel", {
                width: 0.13,
                height: 0.32,
                depth: 0.02
            }, scene);
            assaultShovel.position = new Vector3(-w * 0.4, h * 0.18, -d * 0.45);
            assaultShovel.parent = chassis;
            assaultShovel.material = armorMat;
            
            // Дополнительные инструменты
            const assaultCanister = MeshBuilder.CreateBox("assaultCanister", {
                width: 0.11,
                height: 0.18,
                depth: 0.11
            }, scene);
            assaultCanister.position = new Vector3(w * 0.38, h * 0.2, -d * 0.4);
            assaultCanister.parent = chassis;
            assaultCanister.material = armorMat;
            
            // Вентиляционные решетки (улучшенные)
            for (let i = 0; i < 2; i++) {
                const vent = MeshBuilder.CreateBox(`assaultVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25);
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
                    ventDetail.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25 + (j - 1.5) * 0.03);
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы (улучшенные)
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`assaultPeriscope${i}`, {
                    height: 0.16,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
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
                    sideSpike.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.05 + j * h * 0.2, d * 0.1 + (j - 1) * d * 0.15);
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
                frontScreen.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.08 + (i < 2 ? 0 : h * 0.15), d * 0.5);
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
                cornerArmor.position = new Vector3(posX, h * 0.45, posZ);
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
                roofVent.position = new Vector3((i - 2) * w * 0.25, h * 0.54, (i < 3 ? -1 : 1) * d * 0.25);
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
                rearSpike.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.3 + (i < 2 ? 0 : h * 0.15), -d * 0.48);
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
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
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
            assaultSight.position = new Vector3(0, h * 0.22, d * 0.49);
            assaultSight.parent = chassis;
            const assaultSightMat = new StandardMaterial("assaultSightMat", scene);
            assaultSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            assaultSight.material = assaultSightMat;
            
            // Линза прицела
            const assaultSightLens = MeshBuilder.CreateCylinder("assaultSightLens", {
                height: 0.02,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            assaultSightLens.position = new Vector3(0, 0, 0.06);
            assaultSightLens.parent = assaultSight;
            const assaultLensMat = new StandardMaterial("assaultSightLensMat", scene);
            assaultLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            assaultLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
            assaultSightLens.material = assaultLensMat;
            
            // Радиоантенна сзади
            const assaultAntenna = MeshBuilder.CreateCylinder("assaultAntenna", {
                height: 0.45,
                diameter: 0.025,
                tessellation: 8
            }, scene);
            assaultAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
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
            assaultAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
            assaultAntennaBase.parent = chassis;
            assaultAntennaBase.material = armorMat;
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`assaultSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`assaultSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            
            // Выхлопная труба (улучшенная, больше)
            const assaultExhaustUpgraded = MeshBuilder.CreateCylinder("assaultExhaustUpgraded", {
                height: 0.22,
                diameter: 0.13,
                tessellation: 8
            }, scene);
            assaultExhaustUpgraded.position = new Vector3(w * 0.38, h * 0.2, -d * 0.48);
            assaultExhaustUpgraded.rotation.z = Math.PI / 2;
            assaultExhaustUpgraded.parent = chassis;
            assaultExhaustUpgraded.material = armorMat;
            
            // Выхлопное отверстие
            const assaultExhaustHole = MeshBuilder.CreateCylinder("assaultExhaustHole", {
                height: 0.04,
                diameter: 0.11,
                tessellation: 8
            }, scene);
            assaultExhaustHole.position = new Vector3(w * 0.38, h * 0.2, -d * 0.52);
            assaultExhaustHole.rotation.z = Math.PI / 2;
            assaultExhaustHole.parent = chassis;
            const assaultExhaustHoleMat = new StandardMaterial("assaultExhaustHoleMat", scene);
            assaultExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
            assaultExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
            assaultExhaustHole.material = assaultExhaustHoleMat;
            break;
            
        case "medium": {
            // Medium - Прототип: Т-34 - Классический средний танк, наклонная броня
            // Наклонная лобовая броня (45°)
            const mediumFront = MeshBuilder.CreateBox("mediumFront", {
                width: w * 1.0,
                height: h * 0.7,
                depth: 0.18
            }, scene);
            mediumFront.position = new Vector3(0, h * 0.1, d * 0.5);
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
                vent.position = new Vector3((i - 1) * w * 0.28, h * 0.38, -d * 0.28);
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
                hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1);
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
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45);
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
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.12, d * 0.48);
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
            mediumShovel.position = new Vector3(-w * 0.42, h * 0.18, -d * 0.45);
            mediumShovel.parent = chassis;
            mediumShovel.material = armorMat;
            
            const mediumCanister = MeshBuilder.CreateBox("mediumCanister", {
                width: 0.12,
                height: 0.2,
                depth: 0.12
            }, scene);
            mediumCanister.position = new Vector3(w * 0.42, h * 0.2, -d * 0.4);
            mediumCanister.parent = chassis;
            mediumCanister.material = armorMat;
            
            // Вентиляционные решетки (улучшенные)
            for (let i = 0; i < 3; i++) {
                const vent = MeshBuilder.CreateBox(`mediumVent${i}`, {
                    width: 0.08,
                    height: 0.05,
                    depth: 0.1
                }, scene);
                vent.position = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3);
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
                    ventDetail.position = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3 + (j - 1.5) * 0.03);
                    ventDetail.parent = chassis;
                    ventDetail.material = ventMat;
                }
            }
            
            // Перископы на люках
            for (let i = 0; i < 2; i++) {
                const periscope = MeshBuilder.CreateCylinder(`mediumPeriscope${i}`, {
                    height: 0.18,
                    diameter: 0.07,
                    tessellation: 8
                }, scene);
                periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.55, -d * 0.1);
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
                frontArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.05, d * 0.48);
                frontArmor.parent = chassis;
                frontArmor.material = armorMat;
            }
            
            // Центральная броневая накладка на лбу
            const centerArmor = MeshBuilder.CreateBox("mediumCenterArmor", {
                width: w * 0.2,
                height: h * 0.15,
                depth: 0.12
            }, scene);
            centerArmor.position = new Vector3(0, h * 0.2, d * 0.49);
            centerArmor.parent = chassis;
            centerArmor.material = armorMat;
            
            // Боковые броневые экраны (противокумулятивные)
            for (let i = 0; i < 2; i++) {
                const sideScreen = MeshBuilder.CreateBox(`mediumSideScreen${i}`, {
                    width: 0.15,
                    height: h * 0.6,
                    depth: d * 0.35
                }, scene);
                sideScreen.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.15, d * 0.1);
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
                roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.46, (i < 2 ? -1 : 1) * d * 0.25);
                roofVent.parent = chassis;
                const roofVentMat = new StandardMaterial(`mediumRoofVentMat${i}`, scene);
                roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                roofVent.material = roofVentMat;
            }
            
            // Радиоантенна сзади (характерная для Т-34)
            const antenna = MeshBuilder.CreateCylinder("mediumAntenna", {
                height: 0.5,
                diameter: 0.025,
                tessellation: 8
            }, scene);
            antenna.position = new Vector3(0, h * 0.65, -d * 0.35);
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
            antennaBase.position = new Vector3(0, h * 0.54, -d * 0.35);
            antennaBase.parent = chassis;
            antennaBase.material = armorMat;
            
            // Оптический прицел на лобовой части
            const sight = MeshBuilder.CreateBox("mediumSight", {
                width: 0.12,
                height: 0.08,
                depth: 0.1
            }, scene);
            sight.position = new Vector3(0, h * 0.25, d * 0.48);
            sight.parent = chassis;
            const sightMat = new StandardMaterial("mediumSightMat", scene);
            sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            sight.material = sightMat;
            
            // Линза прицела
            const sightLens = MeshBuilder.CreateCylinder("mediumSightLens", {
                height: 0.02,
                diameter: 0.06,
                tessellation: 8
            }, scene);
            sightLens.position = new Vector3(0, 0, 0.06);
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
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.16, -d * 0.49);
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
            toolBox.position = new Vector3(0, h * 0.22, -d * 0.42);
            toolBox.parent = chassis;
            toolBox.material = armorMat;
            
            // Боковые фары (сигнальные)
            for (let i = 0; i < 2; i++) {
                const sideLight = MeshBuilder.CreateBox(`mediumSideLight${i}`, {
                    width: 0.05,
                    height: 0.07,
                    depth: 0.05
                }, scene);
                sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.25);
                sideLight.parent = chassis;
                const sideLightMat = new StandardMaterial(`mediumSideLightMat${i}`, scene);
                sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                sideLight.material = sideLightMat;
            }
            break;
        }
            
        // === NEW CHASSIS TYPES ===
        case "stealth":
            // Stealth - угловатые панели, низкий профиль
            break; // Visual details added below
            
        case "hover":
            // Hover - обтекаемый футуристический дизайн с реактивными двигателями
            break; // Visual details added below
            
        case "siege":
            // Siege - массивный, очень большой
            break; // Visual details added below
            
        case "racer":
            // Racer - очень низкий, спортивный - гонщик
            // Передний спойлер
            const racerFrontSpoiler = MeshBuilder.CreateBox("racerFrontSpoiler", {
                width: w * 0.9,
                height: 0.12,
                depth: 0.15
            }, scene);
            racerFrontSpoiler.position = new Vector3(0, -h * 0.4, d * 0.48);
            racerFrontSpoiler.parent = chassis;
            racerFrontSpoiler.material = accentMat;
            
            // Задний спойлер (большой)
            const racerRearSpoiler = MeshBuilder.CreateBox("racerRearSpoiler", {
                width: w * 1.1,
                height: 0.25,
                depth: 0.2
            }, scene);
            racerRearSpoiler.position = new Vector3(0, h * 0.45, -d * 0.48);
            racerRearSpoiler.parent = chassis;
            racerRearSpoiler.material = accentMat;
            
            // Боковые обтекатели (низкопрофильные)
            for (let i = 0; i < 2; i++) {
                const sideFairing = MeshBuilder.CreateBox(`racerSideFairing${i}`, {
                    width: 0.12,
                    height: h * 0.6,
                    depth: d * 0.7
                }, scene);
                sideFairing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1);
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
                headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.32, h * 0.1, d * 0.49);
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
            racerIntake.position = new Vector3(0, h * 0.15, d * 0.48);
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
                intakeBar.position = new Vector3((i - 2) * w * 0.09, h * 0.15, d * 0.48);
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
                roofIntake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.42, d * 0.3);
                roofIntake.parent = chassis;
                roofIntake.material = intakeMat;
            }
            
            // Выхлопные трубы (большие, по бокам)
            for (let i = 0; i < 2; i++) {
                const exhaust = MeshBuilder.CreateCylinder(`racerExhaust${i}`, {
                    height: 0.3,
                    diameter: 0.1,
                    tessellation: 8
                }, scene);
                exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.48);
                exhaust.rotation.z = Math.PI / 2;
                exhaust.parent = chassis;
                exhaust.material = armorMat;
                
                // Выхлопное отверстие
                const exhaustHole = MeshBuilder.CreateCylinder(`racerExhaustHole${i}`, {
                    height: 0.05,
                    diameter: 0.08,
                    tessellation: 8
                }, scene);
                exhaustHole.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.52);
                exhaustHole.rotation.z = Math.PI / 2;
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
                mirror.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.35, d * 0.35);
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
                tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.12, -d * 0.49);
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
                    sideVent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.05, d * 0.1 + (j - 1) * d * 0.15);
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
            racerHatch.position = new Vector3(0, h * 0.46, -d * 0.1);
            racerHatch.parent = chassis;
            racerHatch.material = armorMat;
            
            // Перископ на люке
            const racerPeriscope = MeshBuilder.CreateCylinder("racerPeriscope", {
                height: 0.2,
                diameter: 0.06,
                tessellation: 8
            }, scene);
            racerPeriscope.position = new Vector3(0, h * 0.56, -d * 0.1);
            racerPeriscope.parent = chassis;
            const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
            racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            racerPeriscope.material = racerPeriscopeMat;
            break; // Visual details added below
            
        case "amphibious":
            // Amphibious - с поплавками
            break; // Visual details added below
            
        case "shield":
            // Shield - с генератором щита
            break; // Visual details added below
            
        case "drone":
            // Drone - с платформами для дронов
            break; // Visual details added below
            
        case "artillery":
            // Artillery - с стабилизаторами
            break; // Visual details added below
            
        case "destroyer":
            // Destroyer - длинный, низкий - tank destroyer стиль
            break; // Visual details added below
            
        case "command":
            // Command - с антеннами и аурой
            break; // Visual details added below
            
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
        stealthGen.position = new Vector3(0, h * 0.35, -d * 0.35);
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
            panel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, 0, 0);
            panel.parent = chassis;
            panel.material = accentMat;
            hoverPanels.push(panel);
        }
        
        // Реактивные двигатели (4 штуки)
        animationElements.hoverThrusters = [];
        for (let i = 0; i < 4; i++) {
            const thruster = MeshBuilder.CreateCylinder(`thruster${i}`, {
                height: 0.25,
                diameter: 0.18
            }, scene);
            const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
            const posZ = (i < 2 ? -1 : 1) * d * 0.38;
            thruster.position = new Vector3(posX, -h * 0.45, posZ);
            thruster.parent = chassis;
            const thrusterMat = new StandardMaterial(`thrusterMat${i}`, scene);
            thrusterMat.diffuseColor = new Color3(0, 0.6, 1);
            thrusterMat.emissiveColor = new Color3(0, 0.4, 0.7);
            thruster.material = thrusterMat;
            animationElements.hoverThrusters.push(thruster);
        }
        
        // Обтекаемые фары спереди
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateCylinder(`hoverHeadlight${i}`, {
                height: 0.08,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.48);
            headlight.rotation.x = Math.PI / 2;
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`hoverHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(1.0, 1.0, 0.9);
            headlightMat.emissiveColor = new Color3(0.5, 0.5, 0.3);
            headlight.material = headlightMat;
        }
        
        // Обтекаемый люк на крыше
        const hoverHatch = MeshBuilder.CreateCylinder("hoverHatch", {
            height: 0.08,
            diameter: 0.28,
            tessellation: 8
        }, scene);
        hoverHatch.position = new Vector3(0, h * 0.52, -d * 0.1);
        hoverHatch.parent = chassis;
        hoverHatch.material = armorMat;
        
        // Перископ на люке (обтекаемый)
        const hoverPeriscope = MeshBuilder.CreateCylinder("hoverPeriscope", {
            height: 0.18,
            diameter: 0.06,
            tessellation: 8
        }, scene);
        hoverPeriscope.position = new Vector3(0, h * 0.58, -d * 0.1);
        hoverPeriscope.parent = chassis;
        const hoverPeriscopeMat = new StandardMaterial("hoverPeriscopeMat", scene);
        hoverPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        hoverPeriscope.material = hoverPeriscopeMat;
        
        // Вентиляционные решетки на крыше (обтекаемые)
        for (let i = 0; i < 4; i++) {
            const roofVent = MeshBuilder.CreateCylinder(`hoverRoofVent${i}`, {
                height: 0.05,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.5, (i < 2 ? -1 : 1) * d * 0.25);
            roofVent.rotation.x = Math.PI / 2;
            roofVent.parent = chassis;
            const roofVentMat = new StandardMaterial(`hoverRoofVentMat${i}`, scene);
            roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
            roofVent.material = roofVentMat;
        }
        
        // Оптические сенсоры (округлые)
        for (let i = 0; i < 2; i++) {
            const sensor = MeshBuilder.CreateCylinder(`hoverSensor${i}`, {
                height: 0.06,
                diameter: 0.08,
                tessellation: 8
            }, scene);
            sensor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, d * 0.45);
            sensor.rotation.x = Math.PI / 2;
            sensor.parent = chassis;
            const sensorMat = new StandardMaterial(`hoverSensorMat${i}`, scene);
            sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
            sensorMat.emissiveColor = new Color3(0.05, 0.08, 0.1);
            sensor.material = sensorMat;
        }
        
        // Задние огни (округлые)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateCylinder(`hoverTailLight${i}`, {
                height: 0.04,
                diameter: 0.08,
                tessellation: 8
            }, scene);
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.49);
            tailLight.rotation.x = Math.PI / 2;
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`hoverTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Обтекаемые воздухозаборники по бокам
        for (let i = 0; i < 2; i++) {
            const intake = MeshBuilder.CreateCylinder(`hoverIntake${i}`, {
                height: 0.15,
                diameter: 0.14,
                tessellation: 8
            }, scene);
            intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.1, d * 0.2);
            intake.rotation.z = Math.PI / 2;
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
            stabilizer.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.15);
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
            cornerPlate.position = new Vector3(
                Math.cos(angle) * w * 0.55,
                h * 0.2,
                Math.sin(angle) * d * 0.55
            );
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
            hatch.position = new Vector3((i - 1) * w * 0.3, h * 0.7, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.18, d * 0.5);
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
            exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.48);
            exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
        
        // Множество инструментов
        const siegeShovel = MeshBuilder.CreateBox("siegeShovel", {
            width: 0.16,
            height: 0.45,
            depth: 0.02
        }, scene);
        siegeShovel.position = new Vector3(-w * 0.48, h * 0.22, -d * 0.45);
        siegeShovel.parent = chassis;
        siegeShovel.material = armorMat;
        
        const siegeAxe = MeshBuilder.CreateBox("siegeAxe", {
            width: 0.35,
            height: 0.12,
            depth: 0.02
        }, scene);
        siegeAxe.position = new Vector3(-w * 0.38, h * 0.28, -d * 0.45);
        siegeAxe.parent = chassis;
        siegeAxe.material = armorMat;
        
        const siegeCanister = MeshBuilder.CreateBox("siegeCanister", {
            width: 0.16,
            height: 0.3,
            depth: 0.16
        }, scene);
        siegeCanister.position = new Vector3(w * 0.48, h * 0.25, -d * 0.4);
        siegeCanister.parent = chassis;
        siegeCanister.material = armorMat;
        
        // Антенны (большие)
        for (let i = 0; i < 2; i++) {
            const antenna = MeshBuilder.CreateCylinder(`siegeAntenna${i}`, {
                height: 0.5,
                diameter: 0.03,
                tessellation: 8
            }, scene);
            antenna.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.8, -d * 0.4);
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial(`siegeAntennaMat${i}`, scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 3; i++) {
            const periscope = MeshBuilder.CreateCylinder(`siegePeriscope${i}`, {
                height: 0.22,
                diameter: 0.09,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i - 1) * w * 0.3, h * 0.8, -d * 0.1);
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
            roofVent.position = new Vector3((i - 2) * w * 0.25, h * 0.68, d * 0.25);
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
                ventBar.position = new Vector3((i - 2) * w * 0.25 + (j - 3.5) * 0.04, h * 0.68, d * 0.25);
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Массивные выхлопные трубы (большие)
        for (let i = 0; i < 3; i++) {
            const exhaust = MeshBuilder.CreateCylinder(`siegeExhaustCyl${i}`, {
                height: 0.3,
                diameter: 0.16,
                tessellation: 8
            }, scene);
            exhaust.position = new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.48);
            exhaust.rotation.z = Math.PI / 2;
            exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Выхлопное отверстие
            const exhaustHole = MeshBuilder.CreateCylinder(`siegeExhaustHole${i}`, {
                height: 0.05,
                diameter: 0.14,
                tessellation: 8
            }, scene);
            exhaustHole.position = new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.52);
            exhaustHole.rotation.z = Math.PI / 2;
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
        siegeSight.position = new Vector3(0, h * 0.3, d * 0.5);
        siegeSight.parent = chassis;
        const siegeSightMat = new StandardMaterial("siegeSightMat", scene);
        siegeSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        siegeSight.material = siegeSightMat;
        
        // Линза прицела (большая)
        const siegeSightLens = MeshBuilder.CreateCylinder("siegeSightLens", {
            height: 0.02,
            diameter: 0.12,
            tessellation: 8
        }, scene);
        siegeSightLens.position = new Vector3(0, 0, 0.1);
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
            frontArmor.position = new Vector3((i - 1) * w * 0.32, h * 0.1, d * 0.5);
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
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49);
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
            sideVent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.12, d * 0.15);
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
        spoiler.position = new Vector3(0, h * 0.55, -d * 0.48);
        spoiler.parent = chassis;
        spoiler.material = accentMat;
        
        // Боковые крылья
        for (let i = 0; i < 2; i++) {
            const wing = MeshBuilder.CreateBox(`racerWing${i}`, {
                width: 0.1,
                height: h * 0.6,
                depth: d * 0.45
            }, scene);
            wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, 0, d * 0.25);
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
            intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48);
            intake.parent = chassis;
            intake.material = armorMat;
        }
        
        // Один люк
        const racerHatch = MeshBuilder.CreateBox("racerHatch", {
            width: 0.18,
            height: 0.06,
            depth: 0.18
        }, scene);
        racerHatch.position = new Vector3(0, h * 0.38, 0);
        racerHatch.parent = chassis;
        racerHatch.material = armorMat;
        
        // Фары
        for (let i = 0; i < 2; i++) {
            const headlight = MeshBuilder.CreateBox(`racerHeadlight${i}`, {
                width: 0.08,
                height: 0.08,
                depth: 0.06
            }, scene);
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.28, h * 0.08, d * 0.48);
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
        racerExhaust.position = new Vector3(w * 0.32, h * 0.1, -d * 0.48);
        racerExhaust.parent = chassis;
        racerExhaust.material = armorMat;
        
        // Вентиляционные решетки (спортивные)
        for (let i = 0; i < 2; i++) {
            const vent = MeshBuilder.CreateBox(`racerVent${i}`, {
                width: 0.06,
                height: 0.04,
                depth: 0.08
            }, scene);
            vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.25, d * 0.2);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`racerVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископ
        const racerPeriscope = MeshBuilder.CreateCylinder("racerPeriscope", {
            height: 0.12,
            diameter: 0.06,
            tessellation: 8
        }, scene);
        racerPeriscope.position = new Vector3(0, h * 0.42, 0);
        racerPeriscope.parent = chassis;
        const racerPeriscopeMat = new StandardMaterial("racerPeriscopeMat", scene);
        racerPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        racerPeriscope.material = racerPeriscopeMat;
    }
    
    if (chassisType.id === "amphibious") {
        // Amphibious - большие поплавки, водонепроницаемые панели
        for (let i = 0; i < 2; i++) {
            const float = MeshBuilder.CreateCylinder(`float${i}`, {
                height: h * 0.7,
                diameter: w * 0.35
            }, scene);
            float.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, -h * 0.25, 0);
            float.parent = chassis;
            float.material = accentMat;
        }
        
        // Водонепроницаемые панели
        const waterSeal = MeshBuilder.CreateBox("waterSeal", {
            width: w * 1.05,
            height: 0.08,
            depth: d * 1.05
        }, scene);
        waterSeal.position = new Vector3(0, h * 0.5, 0);
        waterSeal.parent = chassis;
        waterSeal.material = armorMat;
        
        // Люки
        for (let i = 0; i < 2; i++) {
            const hatch = MeshBuilder.CreateBox(`amphibiousHatch${i}`, {
                width: 0.2,
                height: 0.08,
                depth: 0.2
            }, scene);
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
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
            vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`amphibiousVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`amphibiousPeriscope${i}`, {
                height: 0.18,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.58, -d * 0.1);
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`amphibiousPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
    }
    
    if (chassisType.id === "shield") {
        // Shield - генератор щита, энергетические панели
        const shieldGen = MeshBuilder.CreateSphere("shieldGen", {
            diameter: w * 0.45,
            segments: 16
        }, scene);
        shieldGen.position = new Vector3(0, h * 0.45, -d * 0.25);
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
            energyPanel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.55, h * 0.15, 0);
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
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
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
            vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`shieldVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            ventMat.emissiveColor = new Color3(0.05, 0.1, 0.05);
            vent.material = ventMat;
        }
        
        // Энергетические катушки вокруг генератора
        for (let i = 0; i < 4; i++) {
            const coil = MeshBuilder.CreateTorus(`shieldCoil${i}`, {
                diameter: w * 0.5,
                thickness: 0.06,
                tessellation: 16
            }, scene);
            const angle = (i * Math.PI * 2) / 4;
            coil.position = new Vector3(0, h * 0.45, -d * 0.25);
            coil.rotation.x = angle;
            coil.parent = chassis;
            const coilMat = new StandardMaterial(`shieldCoilMat${i}`, scene);
            coilMat.diffuseColor = new Color3(0, 0.7, 0.5);
            coilMat.emissiveColor = new Color3(0, 0.4, 0.25);
            coil.material = coilMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`shieldPeriscope${i}`, {
                height: 0.18,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
            periscope.parent = chassis;
            const periscopeMat = new StandardMaterial(`shieldPeriscopeMat${i}`, scene);
            periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
            periscope.material = periscopeMat;
        }
        
        // Энергетические порты (для зарядки щита)
        for (let i = 0; i < 4; i++) {
            const port = MeshBuilder.CreateCylinder(`shieldPort${i}`, {
                height: 0.08,
                diameter: 0.1,
                tessellation: 8
            }, scene);
            const angle = (i * Math.PI * 2) / 4;
            port.position = new Vector3(Math.cos(angle) * w * 0.4, h * 0.25, -d * 0.25 + Math.sin(angle) * d * 0.2);
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
            roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.54, (i < 2 ? -1 : 1) * d * 0.25);
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
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
            tailLight.parent = chassis;
            const tailLightMat = new StandardMaterial(`shieldTailLightMat${i}`, scene);
            tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
            tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
            tailLight.material = tailLightMat;
        }
        
        // Радиоантенна сзади
        const shieldAntenna = MeshBuilder.CreateCylinder("shieldAntenna", {
            height: 0.5,
            diameter: 0.025,
            tessellation: 8
        }, scene);
        shieldAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
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
        shieldAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
        shieldAntennaBase.parent = chassis;
        shieldAntennaBase.material = armorMat;
        
        // Оптический прицел на лобовой части
        const shieldSight = MeshBuilder.CreateBox("shieldSight", {
            width: 0.14,
            height: 0.09,
            depth: 0.11
        }, scene);
        shieldSight.position = new Vector3(0, h * 0.22, d * 0.49);
        shieldSight.parent = chassis;
        const shieldSightMat = new StandardMaterial("shieldSightMat", scene);
        shieldSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        shieldSight.material = shieldSightMat;
        
        // Линза прицела
        const shieldSightLens = MeshBuilder.CreateCylinder("shieldSightLens", {
            height: 0.02,
            diameter: 0.07,
            tessellation: 8
        }, scene);
        shieldSightLens.position = new Vector3(0, 0, 0.06);
        shieldSightLens.parent = shieldSight;
        const shieldLensMat = new StandardMaterial("shieldSightLensMat", scene);
        shieldLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        shieldLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        shieldSightLens.material = shieldLensMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateCylinder(`shieldExhaust${i}`, {
                height: 0.2,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
            exhaust.rotation.z = Math.PI / 2;
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
            platform.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.65, 0);
            platform.parent = chassis;
            const platformMat = new StandardMaterial(`platformMat${i}`, scene);
            platformMat.diffuseColor = new Color3(0.6, 0, 1);
            platformMat.emissiveColor = new Color3(0.35, 0, 0.7);
            platform.material = platformMat;
            animationElements.droneMeshes.push(platform);
            
            // Антенны на платформах
            const antenna = MeshBuilder.CreateCylinder(`droneAntenna${i}`, {
                height: 0.15,
                diameter: 0.03
            }, scene);
            antenna.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.72, 0);
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
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48);
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
            vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`droneVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`dronePeriscope${i}`, {
                height: 0.18,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.66, -d * 0.1);
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
                sensor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38 + (j === 0 ? -1 : 1) * 0.1, h * 0.68, (j === 0 ? -1 : 1) * 0.1);
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
            roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25);
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
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
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
        droneSight.position = new Vector3(0, h * 0.22, d * 0.49);
        droneSight.parent = chassis;
        const droneSightMat = new StandardMaterial("droneSightMat", scene);
        droneSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        droneSight.material = droneSightMat;
        
        // Линза прицела
        const droneSightLens = MeshBuilder.CreateCylinder("droneSightLens", {
            height: 0.02,
            diameter: 0.07,
            tessellation: 8
        }, scene);
        droneSightLens.position = new Vector3(0, 0, 0.06);
        droneSightLens.parent = droneSight;
        const droneLensMat = new StandardMaterial("droneSightLensMat", scene);
        droneLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        droneLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        droneSightLens.material = droneLensMat;
        
        // Радиоантенна сзади (для связи с дронами)
        const droneAntenna = MeshBuilder.CreateCylinder("droneAntenna", {
            height: 0.55,
            diameter: 0.025,
            tessellation: 8
        }, scene);
        droneAntenna.position = new Vector3(0, h * 0.72, -d * 0.3);
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
        droneAntennaBase.position = new Vector3(0, h * 0.6, -d * 0.3);
        droneAntennaBase.parent = chassis;
        droneAntennaBase.material = armorMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateCylinder(`droneExhaust${i}`, {
                height: 0.2,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
            exhaust.rotation.z = Math.PI / 2;
            exhaust.parent = chassis;
            exhaust.material = armorMat;
        }
    }
    
    if (chassisType.id === "artillery") {
        // Artillery - массивные стабилизаторы, опорные лапы
        for (let i = 0; i < 4; i++) {
            const stabilizer = MeshBuilder.CreateCylinder(`stabilizer${i}`, {
                height: 0.35,
                diameter: 0.25
            }, scene);
            const angle = (i * Math.PI * 2) / 4;
            stabilizer.position = new Vector3(
                Math.cos(angle) * w * 0.65,
                -h * 0.45,
                Math.sin(angle) * d * 0.65
            );
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
            leg.position = new Vector3(
                Math.cos(angle) * w * 0.7,
                -h * 0.55,
                Math.sin(angle) * d * 0.7
            );
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
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.7, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.2, d * 0.5);
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
        artilleryExhaust.position = new Vector3(w * 0.4, h * 0.22, -d * 0.48);
        artilleryExhaust.parent = chassis;
        artilleryExhaust.material = armorMat;
        
        // Вентиляционные решетки (большие для артиллерии)
        for (let i = 0; i < 3; i++) {
            const vent = MeshBuilder.CreateBox(`artilleryVent${i}`, {
                width: 0.12,
                height: 0.08,
                depth: 0.14
            }, scene);
            vent.position = new Vector3((i - 1) * w * 0.35, h * 0.6, -d * 0.3);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`artilleryVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`artilleryPeriscope${i}`, {
                height: 0.22,
                diameter: 0.09,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.85, -d * 0.1);
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
            sight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.75, d * 0.45);
            sight.parent = chassis;
            const sightMat = new StandardMaterial(`artillerySightMat${i}`, scene);
            sightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            sight.material = sightMat;
            
            // Линза прицела
            const sightLens = MeshBuilder.CreateCylinder(`artillerySightLens${i}`, {
                height: 0.02,
                diameter: 0.08,
                tessellation: 8
            }, scene);
            sightLens.position = new Vector3(0, 0, 0.08);
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
            roofVent.position = new Vector3((i - 2) * w * 0.28, h * 0.72, d * 0.25);
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
                ventBar.position = new Vector3((i - 2) * w * 0.28 + (j - 2) * 0.04, h * 0.72, d * 0.25);
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Радиоантенна сзади
        const artilleryAntenna = MeshBuilder.CreateCylinder("artilleryAntenna", {
            height: 0.6,
            diameter: 0.03,
            tessellation: 8
        }, scene);
        artilleryAntenna.position = new Vector3(0, h * 0.9, -d * 0.3);
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
        artilleryAntennaBase.position = new Vector3(0, h * 0.76, -d * 0.3);
        artilleryAntennaBase.parent = chassis;
        artilleryAntennaBase.material = armorMat;
        
        // Задние огни (стоп-сигналы, большие)
        for (let i = 0; i < 2; i++) {
            const tailLight = MeshBuilder.CreateBox(`artilleryTailLight${i}`, {
                width: 0.08,
                height: 0.14,
                depth: 0.06
            }, scene);
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49);
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
            sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.15, -d * 0.25);
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`artillerySideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Выхлопная труба (большая)
        const artilleryExhaustUpgraded = MeshBuilder.CreateCylinder("artilleryExhaustUpgraded", {
            height: 0.28,
            diameter: 0.18,
            tessellation: 8
        }, scene);
        artilleryExhaustUpgraded.position = new Vector3(0, h * 0.25, -d * 0.48);
        artilleryExhaustUpgraded.rotation.z = Math.PI / 2;
        artilleryExhaustUpgraded.parent = chassis;
        artilleryExhaustUpgraded.material = armorMat;
        
        // Выхлопное отверстие
        const artilleryExhaustHole = MeshBuilder.CreateCylinder("artilleryExhaustHole", {
            height: 0.05,
            diameter: 0.16,
            tessellation: 8
        }, scene);
        artilleryExhaustHole.position = new Vector3(0, h * 0.25, -d * 0.52);
        artilleryExhaustHole.rotation.z = Math.PI / 2;
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
        destroyerNose.position = new Vector3(0, 0, d * 0.52);
        destroyerNose.parent = chassis;
        destroyerNose.material = accentMat;
        
        // Боковые бронеплиты
        for (let i = 0; i < 2; i++) {
            const sidePlate = MeshBuilder.CreateBox(`destroyerSide${i}`, {
                width: 0.12,
                height: h * 0.7,
                depth: d * 0.5
            }, scene);
            sidePlate.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.15);
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
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.1, d * 0.48);
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
            vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.25, -d * 0.25);
            vent.parent = chassis;
            const ventMat = new StandardMaterial(`destroyerVentMat${i}`, scene);
            ventMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
            vent.material = ventMat;
        }
        
        // Перископы
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`destroyerPeriscope${i}`, {
                height: 0.14,
                diameter: 0.07,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.54, -d * 0.1);
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
        destroyerSight.position = new Vector3(0, h * 0.2, d * 0.48);
        destroyerSight.parent = chassis;
        const destroyerSightMat = new StandardMaterial("destroyerSightMat", scene);
        destroyerSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        destroyerSight.material = destroyerSightMat;
        
        // Линза прицела
        const destroyerSightLens = MeshBuilder.CreateCylinder("destroyerSightLens", {
            height: 0.02,
            diameter: 0.08,
            tessellation: 8
        }, scene);
        destroyerSightLens.position = new Vector3(0, 0, 0.07);
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
            frontArmor.position = new Vector3((i - 1) * w * 0.28, h * 0.05, d * 0.48);
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
            roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2);
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
                ventBar.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2 + (j - 1) * 0.03);
                ventBar.parent = chassis;
                ventBar.material = roofVentMat;
            }
        }
        
        // Выхлопные трубы сзади (большие)
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateCylinder(`destroyerExhaust${i}`, {
                height: 0.25,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.48);
            exhaust.rotation.z = Math.PI / 2;
            exhaust.parent = chassis;
            exhaust.material = armorMat;
            
            // Выхлопное отверстие
            const exhaustHole = MeshBuilder.CreateCylinder(`destroyerExhaustHole${i}`, {
                height: 0.04,
                diameter: 0.1,
                tessellation: 8
            }, scene);
            exhaustHole.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.52);
            exhaustHole.rotation.z = Math.PI / 2;
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
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.14, -d * 0.49);
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
            sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.08, -d * 0.2);
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`destroyerSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
        
        // Радиоантенна сзади
        const destroyerAntenna = MeshBuilder.CreateCylinder("destroyerAntenna", {
            height: 0.45,
            diameter: 0.025,
            tessellation: 8
        }, scene);
        destroyerAntenna.position = new Vector3(0, h * 0.65, -d * 0.3);
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
        destroyerAntennaBase.position = new Vector3(0, h * 0.54, -d * 0.3);
        destroyerAntennaBase.parent = chassis;
        destroyerAntennaBase.material = armorMat;
        
        // Дополнительные инструменты на корме
        const destroyerToolBox = MeshBuilder.CreateBox("destroyerToolBox", {
            width: 0.2,
            height: 0.14,
            depth: 0.16
        }, scene);
        destroyerToolBox.position = new Vector3(0, h * 0.24, -d * 0.42);
        destroyerToolBox.parent = chassis;
        destroyerToolBox.material = armorMat;
    }
    
    if (chassisType.id === "command") {
        // Command - аура, множественные антенны, командный модуль
        const commandAura = MeshBuilder.CreateTorus("commandAura", {
            diameter: w * 1.6,
            thickness: 0.06,
            tessellation: 20
        }, scene);
        commandAura.position = new Vector3(0, h * 0.55, 0);
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
        commandModule.position = new Vector3(0, h * 0.6, -d * 0.3);
        commandModule.parent = chassis;
        const moduleMat = new StandardMaterial("moduleMat", scene);
        moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
        moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
        commandModule.material = moduleMat;
        
        // Множественные антенны
        for (let i = 0; i < 4; i++) {
            const antenna = MeshBuilder.CreateCylinder(`cmdAntenna${i}`, {
                height: 0.5,
                diameter: 0.025
            }, scene);
            antenna.position = new Vector3(
                (i % 2 === 0 ? -1 : 1) * w * 0.35,
                h * 0.7,
                (i < 2 ? -1 : 1) * d * 0.35
            );
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
            hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
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
            headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, d * 0.48);
            headlight.parent = chassis;
            const headlightMat = new StandardMaterial(`commandHeadlightMat${i}`, scene);
            headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
            headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
            headlight.material = headlightMat;
        }
        
        // Перископы на люках
        for (let i = 0; i < 2; i++) {
            const periscope = MeshBuilder.CreateCylinder(`commandPeriscope${i}`, {
                height: 0.2,
                diameter: 0.08,
                tessellation: 8
            }, scene);
            periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.68, -d * 0.1);
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
            radio.position = new Vector3((i === 0 ? -1 : 1) * w * 0.22, h * 0.72, -d * 0.3);
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
            sensor.position = new Vector3((i - 1) * w * 0.18, h * 0.72, -d * 0.2);
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
            roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25);
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
            tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
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
        commandSight.position = new Vector3(0, h * 0.22, d * 0.49);
        commandSight.parent = chassis;
        const commandSightMat = new StandardMaterial("commandSightMat", scene);
        commandSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        commandSight.material = commandSightMat;
        
        // Линза прицела
        const commandSightLens = MeshBuilder.CreateCylinder("commandSightLens", {
            height: 0.02,
            diameter: 0.07,
            tessellation: 8
        }, scene);
        commandSightLens.position = new Vector3(0, 0, 0.06);
        commandSightLens.parent = commandSight;
        const commandLensMat = new StandardMaterial("commandSightLensMat", scene);
        commandLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        commandLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        commandSightLens.material = commandLensMat;
        
        // Выхлопные трубы сзади
        for (let i = 0; i < 2; i++) {
            const exhaust = MeshBuilder.CreateCylinder(`commandExhaust${i}`, {
                height: 0.22,
                diameter: 0.12,
                tessellation: 8
            }, scene);
            exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
            exhaust.rotation.z = Math.PI / 2;
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
            sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
            sideLight.parent = chassis;
            const sideLightMat = new StandardMaterial(`commandSideLightMat${i}`, scene);
            sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
            sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
            sideLight.material = sideLightMat;
        }
    }
    
    // Антенны для medium/heavy/assault
    if (chassisType.id === "medium" || chassisType.id === "heavy" || chassisType.id === "assault") {
        const antenna = MeshBuilder.CreateCylinder("antenna", {
            height: 0.35,
            diameter: 0.025
        }, scene);
        antenna.position = new Vector3(w * 0.42, h * 0.65, -d * 0.42);
        antenna.parent = chassis;
        const antennaMat = new StandardMaterial("antennaMat", scene);
        antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        antenna.material = antennaMat;
    }
}


