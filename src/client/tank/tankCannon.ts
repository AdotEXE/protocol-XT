/**
 * Tank Cannon Creation Module
 * Вынесенная логика создания пушек из tankController.ts
 * 
 * ВАЖНО: Все позиции деталей должны использовать addZFightingOffset() для предотвращения z-fighting!
 * Никогда не используйте прямой new Vector3() для позиций деталей, которые могут соприкасаться с основным мешем.
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import { addZFightingOffset } from "./zFightingFix";
import { CannonType } from "../tankTypes";

/**
 * Элементы для анимации пушек
 */
export interface CannonAnimationElements {
    sniperLens?: Mesh;
    gatlingBarrels?: Mesh[];
    gatlingPowerBlock?: Mesh;
    plasmaCore?: Mesh;
    plasmaCoils?: Mesh[];
    laserLens?: Mesh;
    laserRings?: Mesh[];
    teslaCoils?: Mesh[];
    teslaGen?: Mesh;
    railgunCapacitors?: Mesh[];
    vortexRings?: Mesh[];
    vortexGen?: Mesh;
    supportEmitter?: Mesh;
    supportRings?: Mesh[];
    supportHealingRings?: Mesh[];
    repairGen?: Mesh;
    rocketTube?: Mesh;
    rocketGuides?: Mesh[];
    mortarBase?: Mesh;
    mortarLegs?: Mesh[];
    clusterTubes?: Mesh[];
    clusterCenterTube?: Mesh;
    acidTank?: Mesh;
    acidSprayer?: Mesh;
    freezeFins?: Mesh[];
    cryoTank?: Mesh;
    poisonInjector?: Mesh;
    empDish?: Mesh;
    empCoils?: Mesh[];
    empGen?: Mesh;
    multishotBarrels?: Mesh[];
    multishotConnector?: Mesh;
    shotgunBarrels?: Mesh[];
    homingGuidance?: Mesh;
    homingAntennas?: Mesh[];
    piercingTip?: Mesh;
    piercingConduits?: Mesh[];
    shockwaveAmp?: Mesh;
    shockwaveEmitters?: Mesh[];
    beamFocuser?: Mesh;
    beamLenses?: Mesh[];
    beamConduits?: Mesh[];
    flamethrowerNozzle?: Mesh;
    animationTime?: number;
}

/**
 * Создает уникальную пушку по типу
 */
export function createUniqueCannon(
    cannonType: CannonType,
    scene: Scene,
    barrelWidth: number,
    barrelLength: number,
    animationElements: CannonAnimationElements
): Mesh {
    const cannonColor = Color3.FromHexString(cannonType.color);
    
    let barrel: Mesh;
    
    switch (cannonType.id) {
        case "sniper":
            // Sniper - Прототип: ПТРД / Д-44 - Длинная противотанковая пушка
            // Основной ствол - прямоугольный Box (толще, чем раньше)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.75,
                height: barrelWidth * 0.75,
                depth: barrelLength * 2.0
            }, scene);
            
            const scopeMat = new StandardMaterial("scopeMat", scene);
            scopeMat.diffuseColor = new Color3(0.15, 0.15, 0.15);  // Советский темно-зеленый
            scopeMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
            
            // ОГРОМНЫЙ прицел (угловатый дизайн из нескольких Box)
            // Основная труба прицела
            const scopeTube = MeshBuilder.CreateBox("scopeTube", {
                width: barrelWidth * 0.4,
                height: barrelWidth * 0.4,
                depth: barrelWidth * 1.5
            }, scene);
            scopeTube.position = addZFightingOffset(new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.7), "up");
            scopeTube.parent = barrel;
            scopeTube.material = scopeMat;
            
            // Угловые пластины для создания угловатого вида (4 Box с наклоном)
            for (let i = 0; i < 4; i++) {
                const angularPlate = MeshBuilder.CreateBox(`scopePlate${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.4,
                    depth: barrelWidth * 1.5
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                angularPlate.position = addZFightingOffset(new Vector3(
                    barrelWidth * 0.7 + Math.cos(angle) * barrelWidth * 0.25,
                    barrelWidth * 0.6 + Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.7
                ), "forward");
                angularPlate.rotation.z = angle;
                angularPlate.parent = barrel;
                angularPlate.material = scopeMat;
            }
            
            // Линза прицела (прямоугольный Box с emissive)
            const scopeLens = MeshBuilder.CreateBox("scopeLens", {
                width: barrelWidth * 0.5,
                height: barrelWidth * 0.2,
                depth: barrelWidth * 0.2
            }, scene);
            scopeLens.position = addZFightingOffset(new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.85), "up");
            scopeLens.parent = barrel;
            const lensMat = new StandardMaterial("scopeLensMat", scene);
            lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            lensMat.emissiveColor = new Color3(0.1, 0.2, 0.3);
            scopeLens.material = lensMat;
            animationElements.sniperLens = scopeLens;  // Для анимации
            
            // Регулировочный блок
            const scopeAdjustment = MeshBuilder.CreateBox("scopeAdjustment", {
                width: barrelWidth * 0.15,
                height: barrelWidth * 0.1,
                depth: barrelWidth * 0.3
            }, scene);
            scopeAdjustment.position = addZFightingOffset(new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.6), "up");
            scopeAdjustment.parent = barrel;
            scopeAdjustment.material = scopeMat;
            
            // Сошки (характерные для ПТРД) - прямоугольные Box с наклоном
            for (let i = 0; i < 2; i++) {
                const bipod = MeshBuilder.CreateBox(`bipod${i}`, {
                    width: 0.12,
                    height: barrelWidth * 1.0,
                    depth: 0.12
                }, scene);
                bipod.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.45, 
                    -barrelWidth * 0.5, 
                    barrelLength * 0.75
                ), "down");
                bipod.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                bipod.parent = barrel;
                bipod.material = scopeMat;
            }
            
            // Утолщение у основания ствола
            const baseThickening = MeshBuilder.CreateBox("sniperBaseThickening", {
                width: barrelWidth * 0.9,
                height: barrelWidth * 0.9,
                depth: barrelWidth * 0.4
            }, scene);
            baseThickening.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.3), "forward");
            baseThickening.parent = barrel;
            baseThickening.material = scopeMat;
            
            // Глушитель на конце ствола (средний размер)
            const suppressor = MeshBuilder.CreateBox("sniperSuppressor", {
                width: barrelWidth * 1.125,
                height: barrelWidth * 1.125,
                depth: barrelLength * 0.3
            }, scene);
            suppressor.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 1.0), "forward");
            suppressor.parent = barrel;
            suppressor.material = scopeMat;
            
            // Детали глушителя (вентиляционные отверстия) - 8 маленьких Box
            for (let i = 0; i < 8; i++) {
                const ventHole = MeshBuilder.CreateBox(`suppressorVent${i}`, {
                    width: barrelWidth * 0.06,
                    height: barrelWidth * 0.06,
                    depth: barrelLength * 0.25
                }, scene);
                const angle = (i * Math.PI * 2) / 8;
                ventHole.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.4,
                    Math.sin(angle) * barrelWidth * 0.4,
                    barrelLength * 1.0
                ), "up");
                ventHole.parent = barrel;
                ventHole.material = scopeMat;
            }
            break;
            
        case "gatling":
            // Gatling - Прототип: ГШ-6-30 / многоствольная система - Советская скорострельная пушка
            // Основной корпус - прямоугольный Box (короткий и широкий)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 2.0,
                height: barrelWidth * 2.0,
                depth: barrelLength * 0.8
            }, scene);
            
            // Вращающиеся стволы - 6 прямоугольных Box в круге (стиль ГШ-6-30) - ANIMATED
            animationElements.gatlingBarrels = [];
            for (let i = 0; i < 6; i++) {
                const miniBarrel = MeshBuilder.CreateBox(`minibarrel${i}`, {
                    width: barrelWidth * 0.35,
                    height: barrelWidth * 0.35,
                    depth: barrelLength * 1.1
                }, scene);
                const angle = (i * Math.PI * 2 / 6);
                miniBarrel.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.6,
                    Math.sin(angle) * barrelWidth * 0.6,
                    0
                ), "up");
                miniBarrel.parent = barrel;
                const miniMat = new StandardMaterial(`minibarrelMat${i}`, scene);
                miniMat.diffuseColor = cannonColor.scale(0.8);
                miniBarrel.material = miniMat;
                animationElements.gatlingBarrels.push(miniBarrel);
            }
            
            // Система охлаждения - 4 прямоугольных вентиляционных коробки (Box) вокруг корпуса
            for (let i = 0; i < 4; i++) {
                const coolingVent = MeshBuilder.CreateBox(`coolingVent${i}`, {
                    width: barrelWidth * 0.25,
                    height: barrelWidth * 0.25,
                    depth: barrelLength * 0.12
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                coolingVent.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.95,
                    Math.sin(angle) * barrelWidth * 0.95,
                    -barrelLength * 0.35 + (i % 2) * barrelLength * 0.12
                ), "up");
                coolingVent.parent = barrel;
                const ventMat = new StandardMaterial(`coolingVentMat${i}`, scene);
                ventMat.diffuseColor = cannonColor.scale(0.6);
                ventMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
                coolingVent.material = ventMat;
            }
            
            // Центральный блок питания - 3 слоя прямоугольных коробок (layered_cube) - ANIMATED
            const powerMat = new StandardMaterial("gatlingPowerMat", scene);
            powerMat.diffuseColor = cannonColor.scale(0.5);
            powerMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
            for (let i = 0; i < 3; i++) {
                const powerLayer = MeshBuilder.CreateBox(`gatlingPowerBlock${i}`, {
                    width: barrelWidth * (1.3 - i * 0.1),
                    height: barrelWidth * (1.3 - i * 0.1),
                    depth: barrelWidth * 0.3
                }, scene);
                powerLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.3), "forward");
                powerLayer.parent = barrel;
                powerLayer.material = powerMat;
                if (i === 0) {
                    animationElements.gatlingPowerBlock = powerLayer;  // Для анимации
                }
            }
            
            // Детали блока питания - 4 прямоугольных Box по углам
            for (let i = 0; i < 4; i++) {
                const powerDetail = MeshBuilder.CreateBox(`powerDetail${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.1
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                powerDetail.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.5,
                    Math.sin(angle) * barrelWidth * 0.5,
                    -barrelLength * 0.5
                ), "up");
                powerDetail.parent = barrel;
                powerDetail.material = powerMat;
            }
            
            // Вентиляционные отверстия (угловатые) - 8 прямоугольных Box вокруг корпуса
            for (let i = 0; i < 8; i++) {
                const vent = MeshBuilder.CreateBox(`gatlingVent${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 0.12
                }, scene);
                const angle = (i * Math.PI * 2) / 8;
                vent.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.85,
                    Math.sin(angle) * barrelWidth * 0.85,
                    -barrelLength * 0.2
                ), "up");
                vent.parent = barrel;
                vent.material = powerMat;
            }
            break;
            
        case "heavy":
            // Heavy - Прототип: ИС-2 / Д-25Т - Массивная пушка с дульным тормозом
            // Основной ствол - прямоугольный Box (толстый)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.5,
                height: barrelWidth * 1.5,
                depth: barrelLength * 1.2
            }, scene);
            
            // Массивный казённик (стиль ИС-2) - 4 слоя прямоугольных коробок
            const heavyBreechMat = new StandardMaterial("heavyBreechMat", scene);
            heavyBreechMat.diffuseColor = cannonColor.scale(0.55);
            for (let i = 0; i < 4; i++) {
                const breechLayer = MeshBuilder.CreateBox(`heavyBreech${i}`, {
                    width: barrelWidth * (1.8 - i * 0.15),
                    height: barrelWidth * (1.8 - i * 0.15),
                    depth: barrelWidth * 0.35
                }, scene);
                breechLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.35), "forward");
                breechLayer.parent = barrel;
                breechLayer.material = heavyBreechMat;
            }
            
            // Дульный тормоз (характерный для ИС-2) - 3 слоя прямоугольных коробок
            for (let i = 0; i < 3; i++) {
                const muzzleLayer = MeshBuilder.CreateBox(`heavyMuzzle${i}`, {
                    width: barrelWidth * (1.6 - i * 0.15),
                    height: barrelWidth * (1.6 - i * 0.15),
                    depth: barrelWidth * 0.17
                }, scene);
                muzzleLayer.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.55 + i * barrelWidth * 0.17), "forward");
                muzzleLayer.parent = barrel;
                muzzleLayer.material = heavyBreechMat;
            }
            
            // Усилители по бокам ствола (короткие горизонтальные детали вместо длинных вертикальных)
            for (let i = 0; i < 4; i++) {
                const reinforcement = MeshBuilder.CreateBox(`heavyReinforcement${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.3  // Короткие детали вместо длинных
                }, scene);
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.4;
                reinforcement.position = addZFightingOffset(new Vector3(
                    side * barrelWidth * 0.7,
                    0,
                    barrelLength * 0.1 + zOffset
                ), "forward");
                reinforcement.parent = barrel;
                reinforcement.material = heavyBreechMat;
            }
            break;
            
        case "rapid":
            // Rapid - Прототип: Т-34-76 / ЗИС-3 - Быстрая пушка
            // Основной ствол - прямоугольный Box (короткий и компактный)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.8,
                height: barrelWidth * 0.8,
                depth: barrelLength * 0.7
            }, scene);
            
            // Компактный казённик - 2 слоя прямоугольных коробок
            for (let i = 0; i < 2; i++) {
                const breechLayer = MeshBuilder.CreateBox(`rapidBreech${i}`, {
                    width: barrelWidth * (1.2 - i * 0.1),
                    height: barrelWidth * (1.2 - i * 0.1),
                    depth: barrelWidth * 0.35
                }, scene);
                breechLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.35), "forward");
                breechLayer.parent = barrel;
                breechLayer.material = barrel.material;
            }
            
            // Небольшой дульный тормоз - 1 слой прямоугольной коробки
            const rapidMuzzle = MeshBuilder.CreateBox("rapidMuzzle", {
                width: barrelWidth * 0.9,
                height: barrelWidth * 0.9,
                depth: barrelWidth * 0.25
            }, scene);
            rapidMuzzle.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.35), "forward");
            rapidMuzzle.parent = barrel;
            rapidMuzzle.material = barrel.material;
            
            // Стабилизаторы - 2 тонких Box по бокам
            // Стабилизаторы - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`rapidStabilizer${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.25  // Короткие детали
                }, scene);
                stabilizer.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.4,
                    0,
                    barrelLength * 0.1
                ), "forward");
                stabilizer.parent = barrel;
                stabilizer.material = barrel.material;
            }
            break;
            
        // === ENERGY WEAPONS ===
        case "plasma":
            // Plasma - Прототип: Футуристическая плазменная пушка (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.0,
                height: barrelWidth * 1.0,
                depth: barrelLength * 1.2
            }, scene);
            
            for (let i = 0; i < 3; i++) {
                const expansion = MeshBuilder.CreateBox(`plasmaExpansion${i}`, {
                    width: barrelWidth * (1.0 + i * 0.25),
                    height: barrelWidth * (1.0 + i * 0.25),
                    depth: barrelLength * 0.4
                }, scene);
                expansion.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.2 + i * barrelLength * 0.4), "forward");
                expansion.parent = barrel;
                expansion.material = barrel.material;
            }
            
            const coreMat = new StandardMaterial("plasmaCoreMat", scene);
            coreMat.diffuseColor = new Color3(0.8, 0.2, 0.8);
            coreMat.emissiveColor = new Color3(0.6, 0, 0.6);
            coreMat.disableLighting = true;
            for (let i = 0; i < 3; i++) {
                const coreLayer = MeshBuilder.CreateBox(`plasmaCore${i}`, {
                    width: barrelWidth * (1.2 - i * 0.1),
                    height: barrelWidth * (1.2 - i * 0.1),
                    depth: barrelWidth * (1.2 - i * 0.1)
                }, scene);
                coreLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1), "forward");
                coreLayer.parent = barrel;
                coreLayer.material = coreMat;
                if (i === 0) {
                    animationElements.plasmaCore = coreLayer;
                }
            }
            
            animationElements.plasmaCoils = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.4;
                const ringThickness = barrelWidth * 0.12;
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`plasmaCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`plasmaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`plasmaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`plasmaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                const coilMat = new StandardMaterial(`plasmaCoilMat${i}`, scene);
                coilMat.diffuseColor = new Color3(0.7, 0, 0.7);
                coilMat.emissiveColor = new Color3(0.4, 0, 0.4);
                ringParts.forEach(part => part.material = coilMat);
                animationElements.plasmaCoils.push(...ringParts);
            }
            
            // Стабилизаторы плазмы - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`plasmaStabilizer${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.35;
                stabilizer.position = addZFightingOffset(new Vector3(
                    side * barrelWidth * 0.65,
                    0,
                    barrelLength * 0.1 + zOffset
                ), "forward");
                stabilizer.parent = barrel;
                stabilizer.material = coreMat;
            }
            
            for (let j = 0; j < 4; j++) {
                const emitterPart = MeshBuilder.CreateBox(`plasmaEmitter${j}`, {
                    width: barrelWidth * 0.9,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.9
                }, scene);
                emitterPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1), "forward");
                emitterPart.parent = barrel;
                emitterPart.material = coreMat;
            }
            
            // Дополнительные детали: ребра охлаждения
            for (let i = 0; i < 8; i++) {
                const fin = MeshBuilder.CreateBox(`plasmaFin${i}`, {
                    width: barrelWidth * 0.14,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.05
                }, scene);
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.2 + (i % 4) * barrelLength * 0.5;
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.55,
                    Math.sin(finAngle) * barrelWidth * 0.55,
                    finZ
                ), "up");
                fin.rotation.z = finAngle;
                fin.parent = barrel;
                fin.material = barrel.material;
            }
            
            // Пластины энергоблока
            for (let i = 0; i < 6; i++) {
                const plate = MeshBuilder.CreateBox(`plasmaPlate${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.12
                }, scene);
                const plateAngle = (i * Math.PI * 2) / 6;
                plate.position = addZFightingOffset(new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.5,
                    Math.sin(plateAngle) * barrelWidth * 0.5,
                    -barrelLength * 0.35
                ), "up");
                plate.parent = barrel;
                plate.material = coreMat;
            }
            break;
            
        case "laser":
            // Laser - Прототип: Футуристический лазер (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.6,
                height: barrelWidth * 0.6,
                depth: barrelLength * 1.8
            }, scene);
            
            const lens = MeshBuilder.CreateBox("lens", {
                width: barrelWidth * 0.9,
                height: barrelWidth * 0.5,
                depth: barrelWidth * 0.9
            }, scene);
            lens.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.6), "forward");
            lens.parent = barrel;
            const laserLensMat = new StandardMaterial("laserLensMat", scene);
            laserLensMat.diffuseColor = new Color3(0.8, 0.15, 0);
            laserLensMat.emissiveColor = new Color3(0.5, 0, 0);
            laserLensMat.disableLighting = true;
            lens.material = laserLensMat;
            animationElements.laserLens = lens;
            
            animationElements.laserRings = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.0;
                const ringThickness = barrelWidth * 0.08;
                const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.25;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`laserRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`laserRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`laserRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`laserRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                const ringMat = new StandardMaterial(`focusRingMat${i}`, scene);
                ringMat.diffuseColor = new Color3(0.7, 0, 0);
                ringMat.emissiveColor = new Color3(0.25, 0, 0);
                ringParts.forEach(part => part.material = ringMat);
                animationElements.laserRings.push(...ringParts);
            }
            
            // Короткие горизонтальные детали вокруг ствола (без вертикальных полосок)
            // Маленькие кольца вокруг ствола (6 штук, короткие)
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.1 + i * barrelLength * 0.35;
                const ringSize = barrelWidth * 0.95;
                const ringThickness = barrelWidth * 0.05;
                const ringParts: Mesh[] = [];
                
                const top = MeshBuilder.CreateBox(`laserRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                
                const bottom = MeshBuilder.CreateBox(`laserRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                
                const left = MeshBuilder.CreateBox(`laserRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                
                const right = MeshBuilder.CreateBox(`laserRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                
                ringParts.forEach(part => part.material = laserLensMat);
            }
            
            const housing = MeshBuilder.CreateBox("laserHousing", {
                width: barrelWidth * 0.85,
                height: barrelWidth * 0.25,
                depth: barrelLength * 1.2
            }, scene);
            housing.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.35, barrelLength * 0.05), "forward");
            housing.parent = barrel;
            const housingMat = new StandardMaterial("laserHousingMat", scene);
            housingMat.diffuseColor = cannonColor.scale(0.6);
            housing.material = housingMat;
            break;
            
        case "tesla":
            // Tesla - Прототип: Футуристическая катушка Тесла (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.8,
                height: barrelWidth * 1.8,
                depth: barrelLength * 0.9
            }, scene);
            
            animationElements.teslaCoils = [];
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * 0.8;
                const ringThickness = barrelWidth * 0.15;
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`teslaCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`teslaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`teslaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`teslaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                const coilMat = new StandardMaterial(`teslaCoilMat${i}`, scene);
                coilMat.diffuseColor = new Color3(0, 0.7, 0.9);
                coilMat.emissiveColor = new Color3(0, 0.4, 0.6);
                ringParts.forEach(part => part.material = coilMat);
                animationElements.teslaCoils.push(...ringParts);
            }
            
            for (let i = 0; i < 4; i++) {
                const discharger = MeshBuilder.CreateBox(`teslaDischarger${i}`, {
                    width: barrelWidth * 0.2,
                    height: barrelWidth * 0.4,
                    depth: barrelWidth * 0.2
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                discharger.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.45,
                    barrelLength * 0.2
                ), "up");
                discharger.parent = barrel;
                const dischargerMat = new StandardMaterial(`teslaDischargerMat${i}`, scene);
                dischargerMat.diffuseColor = new Color3(0, 0.7, 0.9);
                dischargerMat.emissiveColor = new Color3(0, 0.4, 0.6);
                discharger.material = dischargerMat;
            }
            
            const genMat = new StandardMaterial("teslaGenMat", scene);
            genMat.diffuseColor = new Color3(0, 0.9, 1);
            genMat.emissiveColor = new Color3(0, 0.6, 0.8);
            genMat.disableLighting = true;
            for (let i = 0; i < 3; i++) {
                const genLayer = MeshBuilder.CreateBox(`teslaGen${i}`, {
                    width: barrelWidth * (0.6 - i * 0.05),
                    height: barrelWidth * (0.6 - i * 0.05),
                    depth: barrelWidth * (0.6 - i * 0.05)
                }, scene);
                genLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1), "forward");
                genLayer.parent = barrel;
                genLayer.material = genMat;
                if (i === 0) {
                    animationElements.teslaGen = genLayer;
                }
            }
            
            // Дополнительные детали: энергоблоки
            for (let i = 0; i < 6; i++) {
                const energyBlock = MeshBuilder.CreateBox(`teslaEnergyBlock${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.15
                }, scene);
                const blockAngle = (i * Math.PI * 2) / 6;
                energyBlock.position = addZFightingOffset(new Vector3(
                    Math.cos(blockAngle) * barrelWidth * 0.75,
                    Math.sin(blockAngle) * barrelWidth * 0.75,
                    -barrelLength * 0.2 + (i % 3) * barrelLength * 0.3
                ), "up");
                energyBlock.parent = barrel;
                energyBlock.material = genMat;
            }
            break;
            
        case "railgun":
            // Railgun - Прототип: Футуристический рельсотрон (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.6,
                height: barrelWidth * 0.6,
                depth: barrelLength * 2.0
            }, scene);
            
            const railMat = new StandardMaterial("railMat", scene);
            railMat.diffuseColor = new Color3(0.1, 0.3, 0.8);
            railMat.emissiveColor = new Color3(0.05, 0.15, 0.4);
            
            // Короткие детали вокруг ствола вместо вертикальных рельсов
            // Кольца вокруг ствола (6 штук)
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.4;
                const ringSize = barrelWidth * 0.75;
                const ringThickness = barrelWidth * 0.06;
                const ringParts: Mesh[] = [];
                
                const top = MeshBuilder.CreateBox(`railgunRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                
                const bottom = MeshBuilder.CreateBox(`railgunRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                
                const left = MeshBuilder.CreateBox(`railgunRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                
                const right = MeshBuilder.CreateBox(`railgunRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                
                ringParts.forEach(part => part.material = railMat);
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (12 штук)
            for (let i = 0; i < 12; i++) {
                const plateAngle = (i * Math.PI * 2) / 12;
                const plateZ = -barrelLength * 0.25 + (i % 6) * barrelLength * 0.4;
                const plate = MeshBuilder.CreateBox(`railgunPlate${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.12
                }, scene);
                plate.position = addZFightingOffset(new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.42,
                    Math.sin(plateAngle) * barrelWidth * 0.42,
                    plateZ
                ), "up");
                plate.parent = barrel;
                plate.material = railMat;
            }
            
            // Ребра охлаждения (10 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 10; i++) {
                const finAngle = (i * Math.PI * 2) / 10;
                const finZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
                const fin = MeshBuilder.CreateBox(`railgunFin${i}`, {
                    width: barrelWidth * 0.14,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.05
                }, scene);
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.4,
                    Math.sin(finAngle) * barrelWidth * 0.4,
                    finZ
                ), "up");
                fin.rotation.z = finAngle;
                fin.parent = barrel;
                fin.material = railMat;
            }
            
            animationElements.railgunCapacitors = [];
            for (let i = 0; i < 3; i++) {
                const capacitor = MeshBuilder.CreateBox(`capacitor${i}`, {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 0.5
                }, scene);
                capacitor.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.4 + i * barrelLength * 0.3), "up");
                capacitor.parent = barrel;
                capacitor.material = railMat;
                animationElements.railgunCapacitors.push(capacitor);
            }
            
            for (let i = 0; i < 3; i++) {
                const channel = MeshBuilder.CreateBox(`railChannel${i}`, {
                    width: barrelWidth * 0.25,
                    height: barrelWidth * 0.12,
                    depth: barrelLength * 0.25
                }, scene);
                channel.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.3), "forward");
                channel.parent = barrel;
                channel.material = railMat;
            }
            
            const muzzleAmp = MeshBuilder.CreateBox("railgunMuzzleAmp", {
                width: barrelWidth * 1.2,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 1.2
            }, scene);
            muzzleAmp.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.95), "forward");
            muzzleAmp.parent = barrel;
            muzzleAmp.material = railMat;
            break;
            
        // === EXPLOSIVE WEAPONS ===
        case "rocket":
            // Rocket - Прототип: РПГ / РПГ-7 - Ракетная установка
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.7, 
                height: barrelWidth * 1.7, 
                depth: barrelLength * 1.1 
            }, scene);
            
            const tube = MeshBuilder.CreateBox("tube", {
                width: barrelWidth * 1.5,
                height: barrelWidth * 1.5,
                depth: barrelLength * 1.0 
            }, scene);
            tube.position = addZFightingOffset(new Vector3(0, 0, 0), "forward");
            tube.parent = barrel;
            const tubeMat = new StandardMaterial("rocketTubeMat", scene);
            tubeMat.diffuseColor = cannonColor.scale(0.8);
            tube.material = tubeMat;
            animationElements.rocketTube = tube;
            
            // Направляющие ракет - короткие детали вместо длинных вертикальных
            animationElements.rocketGuides = [];
            for (let i = 0; i < 8; i++) {
                const guide = MeshBuilder.CreateBox(`guide${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                const angle = (i * Math.PI * 2) / 8;
                const zOffset = (i % 4) * barrelWidth * 0.25;
                guide.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    zOffset
                ), "forward");
                guide.parent = barrel;
                guide.material = tubeMat;
                animationElements.rocketGuides.push(guide);
            }
            
            for (let i = 0; i < 4; i++) {
                const fin = MeshBuilder.CreateBox(`rocketFin${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.25,
                    depth: barrelWidth * 0.08
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.75,
                    Math.sin(angle) * barrelWidth * 0.75,
                    barrelLength * 0.4
                ), "up");
                fin.parent = barrel;
                fin.material = tubeMat;
            }
            
            const guidance = MeshBuilder.CreateBox("rocketGuidance", {
                width: barrelWidth * 0.45,
                height: barrelWidth * 0.25,
                depth: barrelWidth * 0.45
            }, scene);
            guidance.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.65, -barrelLength * 0.2), "up");
            guidance.parent = barrel;
            const guidanceMat = new StandardMaterial("rocketGuidanceMat", scene);
            guidanceMat.diffuseColor = new Color3(0.15, 0.7, 0.15);
            guidanceMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
            guidance.material = guidanceMat;
            break;
            
        case "mortar":
            // Mortar - Прототип: Миномет / 2Б9 Василек
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 2.5,
                height: barrelWidth * 2.5,
                depth: barrelLength * 0.6
            }, scene);
            
            const mortarBaseMat = new StandardMaterial("mortarBaseMat", scene);
            mortarBaseMat.diffuseColor = cannonColor.scale(0.6);
            for (let i = 0; i < 3; i++) {
                const baseLayer = MeshBuilder.CreateBox(`mortarBase${i}`, {
                    width: barrelWidth * (2.4 - i * 0.2),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (2.4 - i * 0.2)
                }, scene);
                baseLayer.position = addZFightingOffset(new Vector3(0, -barrelWidth * 0.7 - i * barrelWidth * 0.2, 0), "up");
                baseLayer.parent = barrel;
                baseLayer.material = mortarBaseMat;
                if (i === 0) {
                    animationElements.mortarBase = baseLayer;
                }
            }
            
            animationElements.mortarLegs = [];
            for (let i = 0; i < 3; i++) {
                const leg = MeshBuilder.CreateBox(`mortarLeg${i}`, {
                    width: barrelWidth * 0.18,
                    height: barrelWidth * 0.45,
                    depth: barrelWidth * 0.18
                }, scene);
                const angle = (i * Math.PI * 2) / 3;
                leg.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.95,
                    -barrelWidth * 0.95,
                    Math.sin(angle) * barrelWidth * 0.25
                ), "up");
                leg.rotation.y = angle;
                leg.parent = barrel;
                leg.material = mortarBaseMat;
                animationElements.mortarLegs.push(leg);
            }
            
            // Усилители миномета - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const reinforcement = MeshBuilder.CreateBox(`mortarReinforcement${i}`, {
                    width: barrelWidth * 0.3,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.4;
                reinforcement.position = addZFightingOffset(new Vector3(
                    side * barrelWidth * 1.05,
                    0,
                    zOffset
                ), "forward");
                reinforcement.parent = barrel;
                reinforcement.material = mortarBaseMat;
            }
            break;
            
        case "cluster":
            // Cluster - Прототип: РСЗО / Катюша
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.8, 
                height: barrelWidth * 1.8, 
                depth: barrelLength * 1.1 
            }, scene);
            
            animationElements.clusterTubes = [];
            for (let i = 0; i < 6; i++) {
                const clusterTube = MeshBuilder.CreateBox(`cluster${i}`, {
                    width: barrelWidth * 0.35,
                    height: barrelWidth * 0.35,
                    depth: barrelLength * 0.9
                }, scene);
                const angle = (i * Math.PI * 2 / 6);
                clusterTube.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.5,
                    Math.sin(angle) * barrelWidth * 0.5,
                    0
                ), "up");
                clusterTube.parent = barrel;
                const tubeMat = new StandardMaterial(`clusterTubeMat${i}`, scene);
                tubeMat.diffuseColor = cannonColor.scale(0.9);
                clusterTube.material = tubeMat;
                animationElements.clusterTubes.push(clusterTube);
            }
            
            const centerTube = MeshBuilder.CreateBox("clusterCenter", {
                width: barrelWidth * 0.4,
                height: barrelWidth * 0.4,
                depth: barrelLength * 0.95
            }, scene);
            centerTube.position = addZFightingOffset(new Vector3(0, 0, 0), "forward");
            centerTube.parent = barrel;
            centerTube.material = barrel.material;
            animationElements.clusterCenterTube = centerTube;
            
            // Стабилизаторы кластера - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const stabilizer = MeshBuilder.CreateBox(`clusterStabilizer${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.25  // Короткие детали
                }, scene);
                const angle = (i * Math.PI * 2 / 6) + Math.PI / 6;
                stabilizer.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    barrelLength * 0.1
                ), "up");
                stabilizer.parent = barrel;
                stabilizer.material = barrel.material;
            }
            break;
            
        case "explosive":
            // Explosive - Прототип: ИСУ-152 / МЛ-20
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6,
                height: barrelWidth * 1.6,
                depth: barrelLength * 1.0
            }, scene);
            
            const explosiveBreech = MeshBuilder.CreateBox("explosiveBreech", {
                width: barrelWidth * 1.9,
                height: barrelWidth * 1.9,
                depth: barrelWidth * 1.3
            }, scene);
            explosiveBreech.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.5), "forward");
            explosiveBreech.parent = barrel;
            const explosiveBreechMat = new StandardMaterial("explosiveBreechMat", scene);
            explosiveBreechMat.diffuseColor = cannonColor.scale(0.7);
            explosiveBreech.material = explosiveBreechMat;
            
            const explosiveMuzzle = MeshBuilder.CreateBox("explosiveMuzzle", {
                width: barrelWidth * 1.6,
                height: barrelWidth * 0.5,
                depth: barrelWidth * 1.6
            }, scene);
            explosiveMuzzle.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5), "forward");
            explosiveMuzzle.parent = barrel;
            explosiveMuzzle.material = explosiveBreechMat;
            
            // Каналы взрывной пушки - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 6; i++) {
                const channel = MeshBuilder.CreateBox(`explosiveChannel${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                const angle = (i * Math.PI * 2) / 6;
                channel.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    barrelLength * 0.05
                ), "up");
                channel.parent = barrel;
                channel.material = explosiveBreechMat;
            }
            break;
            
        // === SPECIAL EFFECT WEAPONS ===
        case "flamethrower":
            // Flamethrower - Прототип: Огнемет / РПО-А
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6,
                height: barrelWidth * 1.6,
                depth: barrelLength * 0.8
            }, scene);
            
            const nozzleMat = new StandardMaterial("flamethrowerNozzleMat", scene);
            nozzleMat.diffuseColor = new Color3(0.7, 0.25, 0);
            nozzleMat.emissiveColor = new Color3(0.25, 0.08, 0);
            for (let j = 0; j < 4; j++) {
                const nozzlePart = MeshBuilder.CreateBox(`flamethrowerNozzle${j}`, {
                    width: barrelWidth * (1.0 - j * 0.1),
                    height: barrelWidth * (1.0 - j * 0.1),
                    depth: barrelLength * 0.1
                }, scene);
                nozzlePart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.45 + j * barrelLength * 0.1), "forward");
                nozzlePart.parent = barrel;
                nozzlePart.material = nozzleMat;
                if (j === 0) {
                    animationElements.flamethrowerNozzle = nozzlePart;
                }
            }
            
            for (let i = 0; i < 2; i++) {
                const tank = MeshBuilder.CreateBox(`flamethrowerTank${i}`, {
                    width: barrelWidth * 0.4,
                    height: barrelWidth * 0.4,
                    depth: barrelLength * 0.7
                }, scene);
                tank.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.6,
                    0,
                    -barrelLength * 0.1
                ), "forward");
                tank.parent = barrel;
                const tankMat = new StandardMaterial(`flamethrowerTankMat${i}`, scene);
                tankMat.diffuseColor = cannonColor.scale(0.8);
                tank.material = tankMat;
                
                const vent = MeshBuilder.CreateBox(`flamethrowerVent${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.08
                }, scene);
                vent.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.6,
                    barrelWidth * 0.25,
                    -barrelLength * 0.15
                ), "forward");
                vent.parent = barrel;
                vent.material = tankMat;
            }
            
            for (let i = 0; i < 2; i++) {
                const hose = MeshBuilder.CreateBox(`flamethrowerHose${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 0.1
                }, scene);
                hose.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.35,
                    barrelWidth * 0.25,
                    barrelLength * 0.1
                ), "forward");
                hose.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                hose.parent = barrel;
                hose.material = nozzleMat;
            }
            break;
            
        case "acid":
            // Acid - Прототип: Химический распылитель
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.2,
                height: barrelWidth * 1.2,
                depth: barrelLength * 1.0
            }, scene);
            
            const acidTankMat = new StandardMaterial("acidTankMat", scene);
            acidTankMat.diffuseColor = new Color3(0.15, 0.7, 0.15);
            acidTankMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
            const acidTank = MeshBuilder.CreateBox("acidTank", {
                width: barrelWidth * 1.0,
                height: barrelWidth * 1.8,
                depth: barrelWidth * 1.0
            }, scene);
            acidTank.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.3), "up");
            acidTank.parent = barrel;
            acidTank.material = acidTankMat;
            animationElements.acidTank = acidTank;
            
            const acidVent = MeshBuilder.CreateBox("acidVent", {
                width: barrelWidth * 0.1,
                height: barrelWidth * 0.1,
                depth: barrelWidth * 0.1
            }, scene);
            acidVent.position = addZFightingOffset(new Vector3(0, barrelWidth * 1.0, -barrelLength * 0.3), "up");
            acidVent.parent = barrel;
            acidVent.material = acidTankMat;
            
            const indicator = MeshBuilder.CreateBox("acidIndicator", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.05
            }, scene);
            indicator.position = addZFightingOffset(new Vector3(barrelWidth * 0.5, barrelWidth * 0.4, -barrelLength * 0.3), "forward");
            indicator.parent = barrel;
            const indicatorMat = new StandardMaterial("acidIndicatorMat", scene);
            indicatorMat.diffuseColor = new Color3(0, 1, 0);
            indicatorMat.emissiveColor = new Color3(0, 0.5, 0);
            indicator.material = indicatorMat;
            
            for (let i = 0; i < 3; i++) {
                const channel = MeshBuilder.CreateBox(`acidChannel${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelLength * 0.6
                }, scene);
                channel.position = addZFightingOffset(new Vector3(
                    (i - 1) * barrelWidth * 0.25,
                    barrelWidth * 0.15,
                    barrelLength * 0.1
                ), "forward");
                channel.parent = barrel;
                channel.material = acidTankMat;
            }
            
            for (let j = 0; j < 3; j++) {
                const sprayerPart = MeshBuilder.CreateBox(`acidSprayer${j}`, {
                    width: barrelWidth * (1.3 - j * 0.1),
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * (1.3 - j * 0.1)
                }, scene);
                sprayerPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1), "forward");
                sprayerPart.parent = barrel;
                sprayerPart.material = acidTankMat;
                if (j === 0) {
                    animationElements.acidSprayer = sprayerPart;
                }
            }
            break;
            
        case "freeze":
            // Freeze - Прототип: Криогенная установка
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.2,
                height: barrelWidth * 1.2,
                depth: barrelLength * 1.0
            }, scene);
            
            animationElements.freezeFins = [];
            // Ребра замораживателя - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const fin = MeshBuilder.CreateBox(`freezeFin${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.4  // Короткие детали
                }, scene);
                const angle = (i * Math.PI * 2 / 8);
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.55,
                    Math.sin(angle) * barrelWidth * 0.55,
                    barrelLength * 0.05
                ), "up");
                fin.parent = barrel;
                const finMat = new StandardMaterial(`freezeFinMat${i}`, scene);
                finMat.diffuseColor = new Color3(0.4, 0.6, 0.9);
                finMat.emissiveColor = new Color3(0.08, 0.15, 0.25);
                fin.material = finMat;
                animationElements.freezeFins.push(fin);
            }
            
            const cryoMat = new StandardMaterial("cryoTankMat", scene);
            cryoMat.diffuseColor = new Color3(0.25, 0.5, 0.9);
            cryoMat.emissiveColor = new Color3(0.08, 0.15, 0.3);
            const cryoTank = MeshBuilder.CreateBox("cryoTank", {
                width: barrelWidth * 0.7,
                height: barrelWidth * 0.6,
                depth: barrelWidth * 0.7
            }, scene);
            cryoTank.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.45, -barrelLength * 0.3), "up");
            cryoTank.parent = barrel;
            cryoTank.material = cryoMat;
            animationElements.cryoTank = cryoTank;
            
            const cryoVent = MeshBuilder.CreateBox("cryoVent", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.08
            }, scene);
            cryoVent.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.75, -barrelLength * 0.3), "up");
            cryoVent.parent = barrel;
            cryoVent.material = cryoMat;
            
            for (let j = 0; j < 3; j++) {
                const emitterPart = MeshBuilder.CreateBox(`freezeEmitter${j}`, {
                    width: barrelWidth * (1.3 - j * 0.1),
                    height: barrelWidth * 0.13,
                    depth: barrelWidth * (1.3 - j * 0.1)
                }, scene);
                emitterPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.13), "forward");
                emitterPart.parent = barrel;
                emitterPart.material = cryoMat;
            }
            break;
            
        case "poison":
            // Poison - Прототип: Химический инжектор
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.1,
                height: barrelWidth * 1.1,
                depth: barrelLength * 0.95
            }, scene);
            
            const poisonTankMat = new StandardMaterial("poisonTankMat", scene);
            poisonTankMat.diffuseColor = new Color3(0.3, 0.7, 0.15);
            poisonTankMat.emissiveColor = new Color3(0.15, 0.35, 0.08);
            const poisonTank = MeshBuilder.CreateBox("poisonTank", {
                width: barrelWidth * 0.6,
                height: barrelWidth * 1.2,
                depth: barrelWidth * 0.6
            }, scene);
            poisonTank.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.4, -barrelLength * 0.25), "forward");
            poisonTank.parent = barrel;
            poisonTank.material = poisonTankMat;
            
            const poisonVent = MeshBuilder.CreateBox("poisonVent", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.08
            }, scene);
            poisonVent.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.25), "up");
            poisonVent.parent = barrel;
            poisonVent.material = poisonTankMat;
            
            for (let j = 0; j < 3; j++) {
                const injectorPart = MeshBuilder.CreateBox(`poisonInjector${j}`, {
                    width: barrelWidth * (0.5 - j * 0.05),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (0.5 - j * 0.05)
                }, scene);
                injectorPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2), "forward");
                injectorPart.parent = barrel;
                injectorPart.material = poisonTankMat;
                if (j === 0) {
                    animationElements.poisonInjector = injectorPart;
                }
            }
            
            for (let i = 0; i < 4; i++) {
                const needle = MeshBuilder.CreateBox(`poisonNeedle${i}`, {
                    width: barrelWidth * 0.06,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 0.06
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                needle.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.25,
                    Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.5
                ), "forward");
                needle.parent = barrel;
                needle.material = poisonTankMat;
            }
            
            // Каналы яда - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const channel = MeshBuilder.CreateBox(`poisonChannel${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                channel.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.3,
                    barrelWidth * 0.15,
                    barrelLength * 0.1
                ), "forward");
                channel.parent = barrel;
                channel.material = poisonTankMat;
            }
            break;
            
        case "emp":
            // EMP - Прототип: ЭМИ излучатель
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6,
                height: barrelWidth * 1.6,
                depth: barrelLength * 1.0
            }, scene);
            
            const empDish = MeshBuilder.CreateBox("empDish", {
                width: barrelWidth * 1.8,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 1.8
            }, scene);
            empDish.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5), "forward");
            empDish.parent = barrel;
            const empDishMat = new StandardMaterial("empDishMat", scene);
            empDishMat.diffuseColor = new Color3(0.7, 0.7, 0.15);
            empDishMat.emissiveColor = new Color3(0.3, 0.3, 0.08);
            empDish.material = empDishMat;
            animationElements.empDish = empDish;
            
            animationElements.empCoils = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.3;
                const ringThickness = barrelWidth * 0.1;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`empCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`empCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`empCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`empCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                ringParts.forEach(part => part.material = empDishMat);
                animationElements.empCoils.push(...ringParts);
            }
            
            const empGenMat = new StandardMaterial("empGenMat", scene);
            empGenMat.diffuseColor = new Color3(0.9, 0.9, 0.25);
            empGenMat.emissiveColor = new Color3(0.4, 0.4, 0.12);
            empGenMat.disableLighting = true;
            for (let i = 0; i < 3; i++) {
                const genLayer = MeshBuilder.CreateBox(`empGen${i}`, {
                    width: barrelWidth * (0.7 - i * 0.05),
                    height: barrelWidth * (0.7 - i * 0.05),
                    depth: barrelWidth * (0.7 - i * 0.05)
                }, scene);
                genLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1), "forward");
                genLayer.parent = barrel;
                genLayer.material = empGenMat;
                if (i === 0) {
                    animationElements.empGen = genLayer;
                }
            }
            break;
            
        // === MULTI-SHOT WEAPONS ===
        case "shotgun":
            // Shotgun - Прототип: Дробовик / КС-23
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 2.2,
                height: barrelWidth * 2.2,
                depth: barrelLength * 0.75
            }, scene);
            
            animationElements.shotgunBarrels = [];
            for (let i = 0; i < 10; i++) {
                const pelletBarrel = MeshBuilder.CreateBox(`pelletBarrel${i}`, {
                    width: barrelWidth * 0.18,
                    height: barrelWidth * 0.18,
                    depth: barrelLength * 0.7 
                }, scene);
                const angle = (i * Math.PI * 2) / 10;
                pelletBarrel.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.55,
                    Math.sin(angle) * barrelWidth * 0.55,
                    0
                ), "up");
                pelletBarrel.parent = barrel;
                const barrelMat = new StandardMaterial(`shotgunBarrelMat${i}`, scene);
                barrelMat.diffuseColor = cannonColor.scale(0.9);
                pelletBarrel.material = barrelMat;
                animationElements.shotgunBarrels.push(pelletBarrel);
            }
            
            const centerBarrel = MeshBuilder.CreateBox("shotgunCenter", {
                width: barrelWidth * 0.25,
                height: barrelWidth * 0.25,
                depth: barrelLength * 0.75
            }, scene);
            centerBarrel.position = addZFightingOffset(new Vector3(0, 0, 0), "forward");
            centerBarrel.parent = barrel;
            centerBarrel.material = barrel.material;
            
            // Усилители дробовика - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const reinforcement = MeshBuilder.CreateBox(`shotgunReinforcement${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.25  // Короткие детали
                }, scene);
                const angle = (i * Math.PI * 2) / 8;
                reinforcement.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.75,
                    Math.sin(angle) * barrelWidth * 0.75,
                    barrelLength * 0.1
                ), "up");
                reinforcement.parent = barrel;
                reinforcement.material = barrel.material;
            }
            break;
            
        case "multishot":
            // Multishot - Прототип: Трехствольная пушка
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 2.2, 
                height: barrelWidth * 1.6, 
                depth: barrelLength * 1.0 
            }, scene);
            
            animationElements.multishotBarrels = [];
            for (let i = 0; i < 3; i++) {
                const multiBarrel = MeshBuilder.CreateBox(`multi${i}`, {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.5,
                    depth: barrelLength * 1.05
                }, scene);
                multiBarrel.position = addZFightingOffset(new Vector3(
                    (i - 1) * barrelWidth * 0.55,
                    0,
                    0
                ), "forward");
                multiBarrel.parent = barrel;
                const barrelMat = new StandardMaterial(`multishotBarrelMat${i}`, scene);
                barrelMat.diffuseColor = cannonColor.scale(0.9);
                multiBarrel.material = barrelMat;
                animationElements.multishotBarrels.push(multiBarrel);
            }
            
            const connector = MeshBuilder.CreateBox("multishotConnector", {
                width: barrelWidth * 1.9,
                height: barrelWidth * 0.9,
                depth: barrelWidth * 0.7
            }, scene);
            connector.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.4), "forward");
            connector.parent = barrel;
            connector.material = barrel.material;
            animationElements.multishotConnector = connector;
            
            // Стабилизаторы мульти-выстрела - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`multishotStabilizer${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                stabilizer.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.25,
                    0,
                    barrelLength * 0.15
                ), "forward");
                stabilizer.parent = barrel;
                stabilizer.material = barrel.material;
            }
            break;
            
        // === ADVANCED WEAPONS ===
        case "homing":
            // Homing - Прототип: ПТУР / Конкурс
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.3,
                height: barrelWidth * 1.3,
                depth: barrelLength * 1.0
            }, scene);
            
            const homingGuidanceMat = new StandardMaterial("homingGuidanceMat", scene);
            homingGuidanceMat.diffuseColor = new Color3(0.08, 0.8, 0.08);
            homingGuidanceMat.emissiveColor = new Color3(0.03, 0.35, 0.03);
            
            const homingGuidance = MeshBuilder.CreateBox("homingGuidance", {
                width: barrelWidth * 0.75,
                height: barrelWidth * 0.55,
                depth: barrelWidth * 0.75
            }, scene);
            homingGuidance.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.2), "up");
            homingGuidance.parent = barrel;
            homingGuidance.material = homingGuidanceMat;
            animationElements.homingGuidance = homingGuidance;
            
            const controlBlock = MeshBuilder.CreateBox("homingControl", {
                width: barrelWidth * 0.5,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 0.5
            }, scene);
            controlBlock.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.2), "up");
            controlBlock.parent = barrel;
            controlBlock.material = homingGuidanceMat;
            
            animationElements.homingAntennas = [];
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`homingAntenna${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.35,
                    depth: barrelWidth * 0.08
                }, scene);
                antenna.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.45,
                    barrelWidth * 0.75,
                    -barrelLength * 0.15
                ), "up");
                antenna.parent = barrel;
                antenna.material = homingGuidanceMat;
                animationElements.homingAntennas.push(antenna);
            }
            
            // Стабилизаторы самонаведения - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`homingStabilizer${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.3  // Короткие детали
                }, scene);
                stabilizer.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.55,
                    0,
                    barrelLength * 0.1
                ), "forward");
                stabilizer.parent = barrel;
                stabilizer.material = homingGuidanceMat;
            }
            break;
            
        case "piercing":
            // Piercing - Прототип: Бронебойная пушка / БС-3
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.55,
                height: barrelWidth * 0.55,
                depth: barrelLength * 1.8
            }, scene);
            
            const piercingTipMat = new StandardMaterial("piercingTipMat", scene);
            piercingTipMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
            piercingTipMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
            for (let j = 0; j < 4; j++) {
                const tipPart = MeshBuilder.CreateBox(`piercingTip${j}`, {
                    width: barrelWidth * (0.3 - j * 0.05),
                    height: barrelWidth * (0.3 - j * 0.05),
                    depth: barrelLength * 0.075
                }, scene);
                tipPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.7 + j * barrelLength * 0.075), "forward");
                tipPart.rotation.y = (j % 2 === 0 ? 1 : -1) * Math.PI / 8;
                tipPart.parent = barrel;
                tipPart.material = piercingTipMat;
                if (j === 0) {
                    animationElements.piercingTip = tipPart;
                }
            }
            
            // Короткие детали вокруг ствола вместо вертикальных кондуитов
            // Кольца вокруг ствола (6 штук)
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.4;
                const ringSize = barrelWidth * 0.7;
                const ringThickness = barrelWidth * 0.05;
                const ringParts: Mesh[] = [];
                
                const top = MeshBuilder.CreateBox(`piercingRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                
                const bottom = MeshBuilder.CreateBox(`piercingRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                
                const left = MeshBuilder.CreateBox(`piercingRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                
                const right = MeshBuilder.CreateBox(`piercingRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                
                ringParts.forEach(part => part.material = barrel.material);
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
            for (let i = 0; i < 10; i++) {
                const plateAngle = (i * Math.PI * 2) / 10;
                const plateZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
                const plate = MeshBuilder.CreateBox(`piercingPlate${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.07,
                    depth: barrelWidth * 0.1
                }, scene);
                plate.position = addZFightingOffset(new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.38,
                    Math.sin(plateAngle) * barrelWidth * 0.38,
                    plateZ
                ), "up");
                plate.parent = barrel;
                plate.material = barrel.material;
            }
            
            // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 8; i++) {
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.15 + (i % 4) * barrelLength * 0.5;
                const fin = MeshBuilder.CreateBox(`piercingFin${i}`, {
                    width: barrelWidth * 0.13,
                    height: barrelWidth * 0.09,
                    depth: barrelWidth * 0.04
                }, scene);
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.36,
                    Math.sin(finAngle) * barrelWidth * 0.36,
                    finZ
                ), "up");
                fin.rotation.z = finAngle;
                fin.parent = barrel;
                fin.material = barrel.material;
            }
            
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 0.75;
                const ringThickness = barrelWidth * 0.06;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                const top = MeshBuilder.CreateBox(`piercingStabilizerTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                top.material = barrel.material;
                const bottom = MeshBuilder.CreateBox(`piercingStabilizerBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                bottom.material = barrel.material;
                const left = MeshBuilder.CreateBox(`piercingStabilizerLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                left.material = barrel.material;
                const right = MeshBuilder.CreateBox(`piercingStabilizerRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                right.material = barrel.material;
            }
            break;
            
        case "shockwave":
            // Shockwave - Прототип: Ударная волна
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 2.2,
                height: barrelWidth * 2.2,
                depth: barrelLength * 0.85
            }, scene);
            // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что ствол смотрит прямо (не вверх)
            barrel.rotation.x = 0;
            barrel.rotation.y = 0;
            barrel.rotation.z = 0;
            
            const shockwaveAmpMat = new StandardMaterial("shockwaveAmpMat", scene);
            shockwaveAmpMat.diffuseColor = cannonColor.scale(0.8);
            shockwaveAmpMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
            for (let j = 0; j < 3; j++) {
                const ampPart = MeshBuilder.CreateBox(`shockwaveAmp${j}`, {
                    width: barrelWidth * (2.2 - j * 0.1),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (2.2 - j * 0.1)
                }, scene);
                ampPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2), "forward");
                ampPart.parent = barrel;
                ampPart.material = shockwaveAmpMat;
                if (j === 0) {
                    animationElements.shockwaveAmp = ampPart;
                }
            }
            
            // УБРАНЫ длинные вертикальные эмиттеры - заменены на короткие горизонтальные детали
            animationElements.shockwaveEmitters = [];
            for (let i = 0; i < 6; i++) {
                const emitter = MeshBuilder.CreateBox(`shockwaveEmitter${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.3  // Короткие детали вместо длинных вертикальных
                }, scene);
                const angle = (i * Math.PI * 2) / 6;
                emitter.position = addZFightingOffset(new Vector3(
                    Math.cos(angle) * barrelWidth * 0.85,
                    Math.sin(angle) * barrelWidth * 0.85,
                    barrelLength * 0.1 + (i % 3) * barrelWidth * 0.15
                ), "forward");
                emitter.parent = barrel;
                emitter.material = shockwaveAmpMat;
                animationElements.shockwaveEmitters.push(emitter);
            }
            
            for (let i = 0; i < 2; i++) {
                const genLayer = MeshBuilder.CreateBox(`shockwaveGen${i}`, {
                    width: barrelWidth * (0.8 - i * 0.1),
                    height: barrelWidth * (0.8 - i * 0.1),
                    depth: barrelWidth * (0.8 - i * 0.1)
                }, scene);
                genLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1), "forward");
                genLayer.parent = barrel;
                genLayer.material = shockwaveAmpMat;
            }
            break;
            
        case "beam":
            // Beam - Прототип: Лучовая пушка
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.85,
                height: barrelWidth * 0.85,
                depth: barrelLength * 1.6
            }, scene);
            
            const beamFocuserMat = new StandardMaterial("beamFocuserMat", scene);
            beamFocuserMat.diffuseColor = new Color3(0.9, 0.4, 0);
            beamFocuserMat.emissiveColor = new Color3(0.35, 0.15, 0);
            beamFocuserMat.disableLighting = true;
            for (let j = 0; j < 4; j++) {
                const focuserPart = MeshBuilder.CreateBox(`beamFocuser${j}`, {
                    width: barrelWidth * (0.9 - j * 0.05),
                    height: barrelWidth * 0.125,
                    depth: barrelWidth * (0.9 - j * 0.05)
                }, scene);
                focuserPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.65 + j * barrelWidth * 0.125), "forward");
                focuserPart.parent = barrel;
                focuserPart.material = beamFocuserMat;
                if (j === 0) {
                    animationElements.beamFocuser = focuserPart;
                }
            }
            
            animationElements.beamLenses = [];
            for (let i = 0; i < 3; i++) {
                const lens = MeshBuilder.CreateBox(`beamLens${i}`, {
                    width: barrelWidth * 0.85,
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * 0.85
                }, scene);
                lens.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.25 + i * barrelLength * 0.15), "forward");
                lens.parent = barrel;
                lens.material = beamFocuserMat;
                animationElements.beamLenses.push(lens);
            }
            
            // Короткие детали вокруг ствола вместо вертикальных каналов
            // Кольца вокруг ствола (5 штук)
            for (let i = 0; i < 5; i++) {
                const ringZ = -barrelLength * 0.2 + i * barrelLength * 0.35;
                const ringSize = barrelWidth * 1.05;
                const ringThickness = barrelWidth * 0.06;
                const ringParts: Mesh[] = [];
                
                const top = MeshBuilder.CreateBox(`beamRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                
                const bottom = MeshBuilder.CreateBox(`beamRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                
                const left = MeshBuilder.CreateBox(`beamRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                
                const right = MeshBuilder.CreateBox(`beamRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                
                ringParts.forEach(part => part.material = beamFocuserMat);
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
            for (let i = 0; i < 10; i++) {
                const plateAngle = (i * Math.PI * 2) / 10;
                const plateZ = -barrelLength * 0.15 + (i % 5) * barrelLength * 0.3;
                const plate = MeshBuilder.CreateBox(`beamPlate${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.12
                }, scene);
                plate.position = addZFightingOffset(new Vector3(
                    Math.cos(plateAngle) * barrelWidth * 0.5,
                    Math.sin(plateAngle) * barrelWidth * 0.5,
                    plateZ
                ), "up");
                plate.parent = barrel;
                plate.material = beamFocuserMat;
            }
            
            // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 8; i++) {
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.1 + (i % 4) * barrelLength * 0.4;
                const fin = MeshBuilder.CreateBox(`beamFin${i}`, {
                    width: barrelWidth * 0.15,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.05
                }, scene);
                fin.position = addZFightingOffset(new Vector3(
                    Math.cos(finAngle) * barrelWidth * 0.48,
                    Math.sin(finAngle) * barrelWidth * 0.48,
                    finZ
                ), "up");
                fin.rotation.z = finAngle;
                fin.parent = barrel;
                fin.material = beamFocuserMat;
            }
            break;
            
        case "vortex":
            // Vortex - Прототип: Вихревой генератор
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.7,
                height: barrelWidth * 1.7,
                depth: barrelLength * 1.0
            }, scene);
            
            animationElements.vortexRings = [];
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * (1.2 + i * 0.15);
                const ringThickness = barrelWidth * 0.12;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`vortexRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`vortexRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`vortexRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`vortexRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                const ringMat = new StandardMaterial(`vortexRingMat${i}`, scene);
                ringMat.diffuseColor = new Color3(0.4, 0.15, 0.7);
                ringMat.emissiveColor = new Color3(0.15, 0.08, 0.3);
                ringParts.forEach(part => part.material = ringMat);
                animationElements.vortexRings.push(...ringParts);
            }
            
            const vortexGenMat = new StandardMaterial("vortexGenMat", scene);
            vortexGenMat.diffuseColor = new Color3(0.5, 0.25, 0.9);
            vortexGenMat.emissiveColor = new Color3(0.25, 0.12, 0.4);
            vortexGenMat.disableLighting = true;
            for (let i = 0; i < 3; i++) {
                const genLayer = MeshBuilder.CreateBox(`vortexGen${i}`, {
                    width: barrelWidth * (0.7 - i * 0.05),
                    height: barrelWidth * (0.7 - i * 0.05),
                    depth: barrelWidth * (0.7 - i * 0.05)
                }, scene);
                genLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1), "forward");
                genLayer.parent = barrel;
                genLayer.material = vortexGenMat;
                if (i === 0) {
                    animationElements.vortexGen = genLayer;
                }
            }
            break;
            
        case "support":
            // Support - Прототип: Ремонтный луч
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.3,
                height: barrelWidth * 1.3,
                depth: barrelLength * 1.0
            }, scene);
            
            const supportEmitterMat = new StandardMaterial("supportEmitterMat", scene);
            supportEmitterMat.diffuseColor = new Color3(0, 0.9, 0.45);
            supportEmitterMat.emissiveColor = new Color3(0, 0.35, 0.18);
            supportEmitterMat.disableLighting = true;
            for (let j = 0; j < 4; j++) {
                const emitterPart = MeshBuilder.CreateBox(`supportEmitter${j}`, {
                    width: barrelWidth * (0.9 - j * 0.05),
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * (0.9 - j * 0.05)
                }, scene);
                emitterPart.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.15), "forward");
                emitterPart.parent = barrel;
                emitterPart.material = supportEmitterMat;
                if (j === 0) {
                    animationElements.supportEmitter = emitterPart;
                }
            }
            
            animationElements.supportHealingRings = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * (0.9 + i * 0.15);
                const ringThickness = barrelWidth * 0.1;
                const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`supportRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = addZFightingOffset(new Vector3(0, ringSize / 2, ringZ), "forward");
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`supportRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = addZFightingOffset(new Vector3(0, -ringSize / 2, ringZ), "forward");
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`supportRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = addZFightingOffset(new Vector3(-ringSize / 2, 0, ringZ), "forward");
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`supportRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = addZFightingOffset(new Vector3(ringSize / 2, 0, ringZ), "forward");
                right.parent = barrel;
                ringParts.push(right);
                ringParts.forEach(part => part.material = supportEmitterMat);
                animationElements.supportHealingRings.push(...ringParts);
            }
            
            for (let i = 0; i < 2; i++) {
                const genLayer = MeshBuilder.CreateBox(`repairGen${i}`, {
                    width: barrelWidth * (0.6 - i * 0.05),
                    height: barrelWidth * (0.6 - i * 0.05),
                    depth: barrelWidth * (0.6 - i * 0.05)
                }, scene);
                genLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1), "forward");
                genLayer.parent = barrel;
                genLayer.material = supportEmitterMat;
                if (i === 0) {
                    animationElements.repairGen = genLayer;
                }
            }
            break;
            
        default: // standard and all other types
            // Standard - Прототип: Т-34-85 / Д-5Т - Классическая советская пушка
            // Основной ствол - прямоугольный Box (горизонтальный, смотрит вперед)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.0,
                height: barrelWidth * 1.0,
                depth: barrelLength * 1.0
            }, scene);
            // Убеждаемся, что ствол смотрит прямо (не вверх)
            barrel.rotation.x = 0;
            barrel.rotation.y = 0;
            barrel.rotation.z = 0;
            
            // Классический казённик (стиль Т-34) - 3 слоя прямоугольных коробок
            const standardBreechMat = new StandardMaterial("standardBreechMat", scene);
            standardBreechMat.diffuseColor = cannonColor.scale(0.7);
            for (let i = 0; i < 3; i++) {
                const breechLayer = MeshBuilder.CreateBox(`standardBreech${i}`, {
                    width: barrelWidth * (1.4 - i * 0.1),
                    height: barrelWidth * (1.4 - i * 0.1),
                    depth: barrelWidth * 0.3
                }, scene);
                breechLayer.position = addZFightingOffset(new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.3), "forward");
                breechLayer.parent = barrel;
                breechLayer.material = standardBreechMat;
            }
            
            // Дульный тормоз - 2 слоя прямоугольных коробок
            for (let i = 0; i < 2; i++) {
                const muzzleLayer = MeshBuilder.CreateBox(`standardMuzzle${i}`, {
                    width: barrelWidth * (1.1 - i * 0.1),
                    height: barrelWidth * (1.1 - i * 0.1),
                    depth: barrelWidth * 0.15
                }, scene);
                muzzleLayer.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.5 + i * barrelWidth * 0.15), "forward");
                muzzleLayer.parent = barrel;
                muzzleLayer.material = standardBreechMat;
            }
            
            // Защитный кожух ствола
            const barrelShield = MeshBuilder.CreateBox("standardShield", {
                width: barrelWidth * 1.1,
                height: barrelWidth * 0.3,
                depth: barrelLength * 0.6
            }, scene);
            barrelShield.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.4, barrelLength * 0.1), "forward");
            barrelShield.parent = barrel;
            barrelShield.material = standardBreechMat;
            
            // Стабилизаторы - 2 тонких Box по бокам
            // Стабилизаторы стандартной пушки - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const stabilizer = MeshBuilder.CreateBox(`standardStabilizer${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.25  // Короткие детали
                }, scene);
                stabilizer.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.5,
                    0,
                    barrelLength * 0.1
                ), "forward");
                stabilizer.parent = barrel;
                stabilizer.material = standardBreechMat;
            }
    }
    
    // Barrel material - улучшенный low-poly стиль
    const barrelMat = new StandardMaterial("barrelMat", scene);
    barrelMat.diffuseColor = cannonColor;
    barrelMat.specularColor = Color3.Black();
    barrelMat.freeze();
    barrel.material = barrelMat;
    
    return barrel;
}
