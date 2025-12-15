/**
 * Tank Cannon Creation Module
 * Вынесенная логика создания пушек из tankController.ts
 */

import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
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
            // Основной ствол - прямоугольный Box (очень длинный и тонкий)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.5,
                height: barrelWidth * 0.5,
                depth: barrelLength * 2.0
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
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
            scopeTube.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.7);
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
                angularPlate.position = new Vector3(
                    barrelWidth * 0.7 + Math.cos(angle) * barrelWidth * 0.25,
                    barrelWidth * 0.6 + Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.7
                );
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
            scopeLens.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.85);
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
            scopeAdjustment.position = new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.6);
            scopeAdjustment.parent = barrel;
            scopeAdjustment.material = scopeMat;
            
            // Сошки (характерные для ПТРД) - прямоугольные Box с наклоном
            for (let i = 0; i < 2; i++) {
                const bipod = MeshBuilder.CreateBox(`bipod${i}`, {
                    width: 0.12,
                    height: barrelWidth * 1.0,
                    depth: 0.12
                }, scene);
                bipod.position = new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.45, 
                    -barrelWidth * 0.5, 
                    barrelLength * 0.75
                );
                bipod.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
                bipod.parent = barrel;
                bipod.material = scopeMat;
            }
            
            // Стабилизаторы по бокам (тонкие Box)
            for (let i = 0; i < 3; i++) {
                const stabilizer = MeshBuilder.CreateBox(`sniperStabilizer${i}`, {
                    width: 0.06,
                    height: barrelLength * 0.35,
                    depth: 0.06
                }, scene);
                stabilizer.position = new Vector3(
                    (i === 0 ? -1 : i === 1 ? 1 : 0) * barrelWidth * 0.3, 
                    (i === 2 ? 1 : 0) * barrelWidth * 0.3,
                    barrelLength * 0.25 + i * barrelLength * 0.2
                );
                stabilizer.parent = barrel;
                stabilizer.material = scopeMat;
            }
            
            // Дульный тормоз - 2 слоя прямоугольных коробок
            for (let i = 0; i < 2; i++) {
                const muzzleLayer = MeshBuilder.CreateBox(`sniperMuzzle${i}`, {
                    width: barrelWidth * (0.75 - i * 0.1),
                    height: barrelWidth * (0.75 - i * 0.1),
                    depth: barrelWidth * 0.2
                }, scene);
                muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.95 + i * barrelWidth * 0.2);
                muzzleLayer.parent = barrel;
                muzzleLayer.material = scopeMat;
            }
            
            // Детали дульного тормоза (отверстия) - 6 маленьких Box вместо отверстий
            for (let i = 0; i < 6; i++) {
                const brakeHole = MeshBuilder.CreateBox(`brakeHole${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.5
                }, scene);
                const angle = (i * Math.PI * 2) / 6;
                brakeHole.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.25,
                    Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.95
                );
                brakeHole.parent = barrel;
                brakeHole.material = scopeMat;
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
            barrel.rotation.x = Math.PI / 2;
            
            // Вращающиеся стволы - 6 прямоугольных Box в круге (стиль ГШ-6-30) - ANIMATED
            animationElements.gatlingBarrels = [];
            for (let i = 0; i < 6; i++) {
                const miniBarrel = MeshBuilder.CreateBox(`minibarrel${i}`, {
                    width: barrelWidth * 0.35,
                    height: barrelWidth * 0.35,
                    depth: barrelLength * 1.1
                }, scene);
                const angle = (i * Math.PI * 2 / 6);
                miniBarrel.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.6,
                    Math.sin(angle) * barrelWidth * 0.6,
                    0
                );
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
                coolingVent.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.95,
                    Math.sin(angle) * barrelWidth * 0.95,
                    -barrelLength * 0.35 + (i % 2) * barrelLength * 0.12
                );
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
                powerLayer.position = new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.3);
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
                powerDetail.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.5,
                    Math.sin(angle) * barrelWidth * 0.5,
                    -barrelLength * 0.5
                );
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
                vent.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.85,
                    Math.sin(angle) * barrelWidth * 0.85,
                    -barrelLength * 0.2
                );
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
            barrel.rotation.x = Math.PI / 2;
            
            // Массивный казённик (стиль ИС-2) - 4 слоя прямоугольных коробок
            const heavyBreechMat = new StandardMaterial("heavyBreechMat", scene);
            heavyBreechMat.diffuseColor = cannonColor.scale(0.55);
            for (let i = 0; i < 4; i++) {
                const breechLayer = MeshBuilder.CreateBox(`heavyBreech${i}`, {
                    width: barrelWidth * (1.8 - i * 0.15),
                    height: barrelWidth * (1.8 - i * 0.15),
                    depth: barrelWidth * 0.35
                }, scene);
                breechLayer.position = new Vector3(0, 0, -barrelLength * 0.5 - i * barrelWidth * 0.35);
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
                muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.55 + i * barrelWidth * 0.17);
                muzzleLayer.parent = barrel;
                muzzleLayer.material = heavyBreechMat;
            }
            
            // Усилители по бокам ствола (толстые)
            for (let i = 0; i < 2; i++) {
                const reinforcement = MeshBuilder.CreateBox(`heavyReinforcement${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.8,
                    depth: barrelWidth * 0.12
                }, scene);
                reinforcement.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.7, 0, barrelLength * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            // Компактный казённик - 2 слоя прямоугольных коробок
            for (let i = 0; i < 2; i++) {
                const breechLayer = MeshBuilder.CreateBox(`rapidBreech${i}`, {
                    width: barrelWidth * (1.2 - i * 0.1),
                    height: barrelWidth * (1.2 - i * 0.1),
                    depth: barrelWidth * 0.35
                }, scene);
                breechLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.35);
                breechLayer.parent = barrel;
                breechLayer.material = barrel.material;
            }
            
            // Небольшой дульный тормоз - 1 слой прямоугольной коробки
            const rapidMuzzle = MeshBuilder.CreateBox("rapidMuzzle", {
                width: barrelWidth * 0.9,
                height: barrelWidth * 0.9,
                depth: barrelWidth * 0.25
            }, scene);
            rapidMuzzle.position = new Vector3(0, 0, barrelLength * 0.35);
            rapidMuzzle.parent = barrel;
            rapidMuzzle.material = barrel.material;
            
            // Стабилизаторы - 2 тонких Box по бокам
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`rapidStabilizer${i}`, {
                    width: barrelWidth * 0.06,
                    height: barrelLength * 0.5,
                    depth: barrelWidth * 0.06
                }, scene);
                stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, 0, barrelLength * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            for (let i = 0; i < 3; i++) {
                const expansion = MeshBuilder.CreateBox(`plasmaExpansion${i}`, {
                    width: barrelWidth * (1.0 + i * 0.25),
                    height: barrelWidth * (1.0 + i * 0.25),
                    depth: barrelLength * 0.4
                }, scene);
                expansion.position = new Vector3(0, 0, barrelLength * 0.2 + i * barrelLength * 0.4);
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
                coreLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
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
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`plasmaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`plasmaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`plasmaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
                right.parent = barrel;
                ringParts.push(right);
                const coilMat = new StandardMaterial(`plasmaCoilMat${i}`, scene);
                coilMat.diffuseColor = new Color3(0.7, 0, 0.7);
                coilMat.emissiveColor = new Color3(0.4, 0, 0.4);
                ringParts.forEach(part => part.material = coilMat);
                animationElements.plasmaCoils.push(...ringParts);
            }
            
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`plasmaStabilizer${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.6,
                    depth: barrelWidth * 0.12
                }, scene);
                stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.65, 0, barrelLength * 0.1);
                stabilizer.parent = barrel;
                stabilizer.material = coreMat;
            }
            
            for (let j = 0; j < 4; j++) {
                const emitterPart = MeshBuilder.CreateBox(`plasmaEmitter${j}`, {
                    width: barrelWidth * 0.9,
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * 0.9
                }, scene);
                emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1);
                emitterPart.parent = barrel;
                emitterPart.material = coreMat;
            }
            break;
            
        case "laser":
            // Laser - Прототип: Футуристический лазер (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.6,
                height: barrelWidth * 0.6,
                depth: barrelLength * 1.8
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            const lens = MeshBuilder.CreateBox("lens", {
                width: barrelWidth * 0.9,
                height: barrelWidth * 0.5,
                depth: barrelWidth * 0.9
            }, scene);
            lens.position = new Vector3(0, 0, barrelLength * 0.6);
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
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`laserRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`laserRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`laserRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
                right.parent = barrel;
                ringParts.push(right);
                const ringMat = new StandardMaterial(`focusRingMat${i}`, scene);
                ringMat.diffuseColor = new Color3(0.7, 0, 0);
                ringMat.emissiveColor = new Color3(0.25, 0, 0);
                ringParts.forEach(part => part.material = ringMat);
                animationElements.laserRings.push(...ringParts);
            }
            
            for (let i = 0; i < 2; i++) {
                const channel = MeshBuilder.CreateBox(`laserChannel${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 1.1,
                    depth: barrelWidth * 0.08
                }, scene);
                channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, 0, barrelLength * 0.1);
                channel.parent = barrel;
                channel.material = laserLensMat;
            }
            
            const housing = MeshBuilder.CreateBox("laserHousing", {
                width: barrelWidth * 0.85,
                height: barrelWidth * 0.25,
                depth: barrelLength * 1.2
            }, scene);
            housing.position = new Vector3(0, barrelWidth * 0.35, barrelLength * 0.05);
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
            barrel.rotation.x = Math.PI / 2;
            
            animationElements.teslaCoils = [];
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * 0.8;
                const ringThickness = barrelWidth * 0.15;
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`teslaCoilTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`teslaCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`teslaCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`teslaCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
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
                discharger.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.45,
                    barrelLength * 0.2
                );
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
                genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
                genLayer.parent = barrel;
                genLayer.material = genMat;
                if (i === 0) {
                    animationElements.teslaGen = genLayer;
                }
            }
            break;
            
        case "railgun":
            // Railgun - Прототип: Футуристический рельсотрон (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.6,
                height: barrelWidth * 0.6,
                depth: barrelLength * 2.0
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            const rail1 = MeshBuilder.CreateBox("rail1", {
                width: barrelWidth * 0.15,
                height: barrelWidth * 0.8,
                depth: barrelLength * 2.0
            }, scene);
            rail1.position = new Vector3(-barrelWidth * 0.45, 0, 0);
            rail1.parent = barrel;
            const railMat = new StandardMaterial("railMat", scene);
            railMat.diffuseColor = new Color3(0.1, 0.3, 0.8);
            railMat.emissiveColor = new Color3(0.05, 0.15, 0.4);
            rail1.material = railMat;
            
            const rail2 = MeshBuilder.CreateBox("rail2", {
                width: barrelWidth * 0.15,
                height: barrelWidth * 0.8,
                depth: barrelLength * 2.0
            }, scene);
            rail2.position = new Vector3(barrelWidth * 0.45, 0, 0);
            rail2.parent = barrel;
            rail2.material = railMat;
            
            animationElements.railgunCapacitors = [];
            for (let i = 0; i < 3; i++) {
                const capacitor = MeshBuilder.CreateBox(`capacitor${i}`, {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 0.5
                }, scene);
                capacitor.position = new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.4 + i * barrelLength * 0.3);
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
                channel.position = new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.3);
                channel.parent = barrel;
                channel.material = railMat;
            }
            
            const muzzleAmp = MeshBuilder.CreateBox("railgunMuzzleAmp", {
                width: barrelWidth * 1.2,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 1.2
            }, scene);
            muzzleAmp.position = new Vector3(0, 0, barrelLength * 0.95);
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
            tube.position = new Vector3(0, 0, 0);
            tube.parent = barrel;
            const tubeMat = new StandardMaterial("rocketTubeMat", scene);
            tubeMat.diffuseColor = cannonColor.scale(0.8);
            tube.material = tubeMat;
            animationElements.rocketTube = tube;
            
            animationElements.rocketGuides = [];
            for (let i = 0; i < 6; i++) {
                const guide = MeshBuilder.CreateBox(`guide${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelLength * 0.85,
                    depth: barrelWidth * 0.1
                }, scene);
                const angle = (i * Math.PI * 2) / 6;
                guide.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    0
                );
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
                fin.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.75,
                    Math.sin(angle) * barrelWidth * 0.75,
                    barrelLength * 0.4
                );
                fin.parent = barrel;
                fin.material = tubeMat;
            }
            
            const guidance = MeshBuilder.CreateBox("rocketGuidance", {
                width: barrelWidth * 0.45,
                height: barrelWidth * 0.25,
                depth: barrelWidth * 0.45
            }, scene);
            guidance.position = new Vector3(0, barrelWidth * 0.65, -barrelLength * 0.2);
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
            barrel.rotation.x = Math.PI / 2;
            
            const mortarBaseMat = new StandardMaterial("mortarBaseMat", scene);
            mortarBaseMat.diffuseColor = cannonColor.scale(0.6);
            for (let i = 0; i < 3; i++) {
                const baseLayer = MeshBuilder.CreateBox(`mortarBase${i}`, {
                    width: barrelWidth * (2.4 - i * 0.2),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (2.4 - i * 0.2)
                }, scene);
                baseLayer.position = new Vector3(0, -barrelWidth * 0.7 - i * barrelWidth * 0.2, 0);
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
                leg.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.95,
                    -barrelWidth * 0.95,
                    Math.sin(angle) * barrelWidth * 0.25
                );
                leg.rotation.y = angle;
                leg.parent = barrel;
                leg.material = mortarBaseMat;
                animationElements.mortarLegs.push(leg);
            }
            
            for (let i = 0; i < 2; i++) {
                const reinforcement = MeshBuilder.CreateBox(`mortarReinforcement${i}`, {
                    width: barrelWidth * 0.25,
                    height: barrelLength * 0.5,
                    depth: barrelWidth * 0.25
                }, scene);
                reinforcement.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 1.05, 0, 0);
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
                clusterTube.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.5,
                    Math.sin(angle) * barrelWidth * 0.5,
                    0
                );
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
            centerTube.position = new Vector3(0, 0, 0);
            centerTube.parent = barrel;
            centerTube.material = barrel.material;
            animationElements.clusterCenterTube = centerTube;
            
            for (let i = 0; i < 6; i++) {
                const stabilizer = MeshBuilder.CreateBox(`clusterStabilizer${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 0.6,
                    depth: barrelWidth * 0.08
                }, scene);
                const angle = (i * Math.PI * 2 / 6) + Math.PI / 6;
                stabilizer.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    barrelLength * 0.1
                );
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
            barrel.rotation.x = Math.PI / 2;
            
            const explosiveBreech = MeshBuilder.CreateBox("explosiveBreech", {
                width: barrelWidth * 1.9,
                height: barrelWidth * 1.9,
                depth: barrelWidth * 1.3
            }, scene);
            explosiveBreech.position = new Vector3(0, 0, -barrelLength * 0.5);
            explosiveBreech.parent = barrel;
            const explosiveBreechMat = new StandardMaterial("explosiveBreechMat", scene);
            explosiveBreechMat.diffuseColor = cannonColor.scale(0.7);
            explosiveBreech.material = explosiveBreechMat;
            
            const explosiveMuzzle = MeshBuilder.CreateBox("explosiveMuzzle", {
                width: barrelWidth * 1.6,
                height: barrelWidth * 0.5,
                depth: barrelWidth * 1.6
            }, scene);
            explosiveMuzzle.position = new Vector3(0, 0, barrelLength * 0.5);
            explosiveMuzzle.parent = barrel;
            explosiveMuzzle.material = explosiveBreechMat;
            
            for (let i = 0; i < 4; i++) {
                const channel = MeshBuilder.CreateBox(`explosiveChannel${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelLength * 0.7,
                    depth: barrelWidth * 0.1
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                channel.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.65,
                    Math.sin(angle) * barrelWidth * 0.65,
                    barrelLength * 0.05
                );
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
            barrel.rotation.x = Math.PI / 2;
            
            const nozzleMat = new StandardMaterial("flamethrowerNozzleMat", scene);
            nozzleMat.diffuseColor = new Color3(0.7, 0.25, 0);
            nozzleMat.emissiveColor = new Color3(0.25, 0.08, 0);
            for (let j = 0; j < 4; j++) {
                const nozzlePart = MeshBuilder.CreateBox(`flamethrowerNozzle${j}`, {
                    width: barrelWidth * (1.0 - j * 0.1),
                    height: barrelWidth * (1.0 - j * 0.1),
                    depth: barrelLength * 0.1
                }, scene);
                nozzlePart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelLength * 0.1);
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
                tank.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.6, 0, -barrelLength * 0.1);
                tank.parent = barrel;
                const tankMat = new StandardMaterial(`flamethrowerTankMat${i}`, scene);
                tankMat.diffuseColor = cannonColor.scale(0.8);
                tank.material = tankMat;
                
                const vent = MeshBuilder.CreateBox(`flamethrowerVent${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.08
                }, scene);
                vent.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.6, barrelWidth * 0.25, -barrelLength * 0.15);
                vent.parent = barrel;
                vent.material = tankMat;
            }
            
            for (let i = 0; i < 2; i++) {
                const hose = MeshBuilder.CreateBox(`flamethrowerHose${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelWidth * 0.5,
                    depth: barrelWidth * 0.1
                }, scene);
                hose.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.35, barrelWidth * 0.25, barrelLength * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            const acidTankMat = new StandardMaterial("acidTankMat", scene);
            acidTankMat.diffuseColor = new Color3(0.15, 0.7, 0.15);
            acidTankMat.emissiveColor = new Color3(0.05, 0.3, 0.05);
            const acidTank = MeshBuilder.CreateBox("acidTank", {
                width: barrelWidth * 1.0,
                height: barrelWidth * 1.8,
                depth: barrelWidth * 1.0
            }, scene);
            acidTank.position = new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.3);
            acidTank.parent = barrel;
            acidTank.material = acidTankMat;
            animationElements.acidTank = acidTank;
            
            const acidVent = MeshBuilder.CreateBox("acidVent", {
                width: barrelWidth * 0.1,
                height: barrelWidth * 0.1,
                depth: barrelWidth * 0.1
            }, scene);
            acidVent.position = new Vector3(0, barrelWidth * 1.0, -barrelLength * 0.3);
            acidVent.parent = barrel;
            acidVent.material = acidTankMat;
            
            const indicator = MeshBuilder.CreateBox("acidIndicator", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.05
            }, scene);
            indicator.position = new Vector3(barrelWidth * 0.5, barrelWidth * 0.4, -barrelLength * 0.3);
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
                channel.position = new Vector3(
                    (i - 1) * barrelWidth * 0.25,
                    barrelWidth * 0.15,
                    barrelLength * 0.1
                );
                channel.parent = barrel;
                channel.material = acidTankMat;
            }
            
            for (let j = 0; j < 3; j++) {
                const sprayerPart = MeshBuilder.CreateBox(`acidSprayer${j}`, {
                    width: barrelWidth * (1.3 - j * 0.1),
                    height: barrelWidth * 0.1,
                    depth: barrelWidth * (1.3 - j * 0.1)
                }, scene);
                sprayerPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            animationElements.freezeFins = [];
            for (let i = 0; i < 6; i++) {
                const fin = MeshBuilder.CreateBox(`freezeFin${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.75,
                    depth: barrelWidth * 0.35
                }, scene);
                const angle = (i * Math.PI * 2 / 6);
                fin.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.55,
                    Math.sin(angle) * barrelWidth * 0.55,
                    barrelLength * 0.05
                );
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
            cryoTank.position = new Vector3(0, barrelWidth * 0.45, -barrelLength * 0.3);
            cryoTank.parent = barrel;
            cryoTank.material = cryoMat;
            animationElements.cryoTank = cryoTank;
            
            const cryoVent = MeshBuilder.CreateBox("cryoVent", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.08
            }, scene);
            cryoVent.position = new Vector3(0, barrelWidth * 0.75, -barrelLength * 0.3);
            cryoVent.parent = barrel;
            cryoVent.material = cryoMat;
            
            for (let j = 0; j < 3; j++) {
                const emitterPart = MeshBuilder.CreateBox(`freezeEmitter${j}`, {
                    width: barrelWidth * (1.3 - j * 0.1),
                    height: barrelWidth * 0.13,
                    depth: barrelWidth * (1.3 - j * 0.1)
                }, scene);
                emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.13);
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
            barrel.rotation.x = Math.PI / 2;
            
            const poisonTankMat = new StandardMaterial("poisonTankMat", scene);
            poisonTankMat.diffuseColor = new Color3(0.3, 0.7, 0.15);
            poisonTankMat.emissiveColor = new Color3(0.15, 0.35, 0.08);
            const poisonTank = MeshBuilder.CreateBox("poisonTank", {
                width: barrelWidth * 0.6,
                height: barrelWidth * 1.2,
                depth: barrelWidth * 0.6
            }, scene);
            poisonTank.position = new Vector3(0, barrelWidth * 0.4, -barrelLength * 0.25);
            poisonTank.parent = barrel;
            poisonTank.material = poisonTankMat;
            
            const poisonVent = MeshBuilder.CreateBox("poisonVent", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.08,
                depth: barrelWidth * 0.08
            }, scene);
            poisonVent.position = new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.25);
            poisonVent.parent = barrel;
            poisonVent.material = poisonTankMat;
            
            for (let j = 0; j < 3; j++) {
                const injectorPart = MeshBuilder.CreateBox(`poisonInjector${j}`, {
                    width: barrelWidth * (0.5 - j * 0.05),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (0.5 - j * 0.05)
                }, scene);
                injectorPart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2);
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
                needle.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.25,
                    Math.sin(angle) * barrelWidth * 0.25,
                    barrelLength * 0.5
                );
                needle.parent = barrel;
                needle.material = poisonTankMat;
            }
            
            for (let i = 0; i < 2; i++) {
                const channel = MeshBuilder.CreateBox(`poisonChannel${i}`, {
                    width: barrelWidth * 0.1,
                    height: barrelLength * 0.5,
                    depth: barrelWidth * 0.1
                }, scene);
                channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.3, barrelWidth * 0.15, barrelLength * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            const empDish = MeshBuilder.CreateBox("empDish", {
                width: barrelWidth * 1.8,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 1.8
            }, scene);
            empDish.position = new Vector3(0, 0, barrelLength * 0.5);
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
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`empCoilBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`empCoilLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`empCoilRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
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
                genLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
            animationElements.shotgunBarrels = [];
            for (let i = 0; i < 10; i++) {
                const pelletBarrel = MeshBuilder.CreateBox(`pelletBarrel${i}`, {
                    width: barrelWidth * 0.18,
                    height: barrelWidth * 0.18,
                    depth: barrelLength * 0.7 
                }, scene);
                const angle = (i * Math.PI * 2) / 10;
                pelletBarrel.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.55,
                    Math.sin(angle) * barrelWidth * 0.55,
                    0
                );
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
            centerBarrel.position = new Vector3(0, 0, 0);
            centerBarrel.parent = barrel;
            centerBarrel.material = barrel.material;
            
            for (let i = 0; i < 5; i++) {
                const reinforcement = MeshBuilder.CreateBox(`shotgunReinforcement${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 0.45,
                    depth: barrelWidth * 0.08
                }, scene);
                const angle = (i * Math.PI * 2) / 5 + Math.PI / 10;
                reinforcement.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.75,
                    Math.sin(angle) * barrelWidth * 0.75,
                    barrelLength * 0.1
                );
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
                multiBarrel.position = new Vector3(
                    (i - 1) * barrelWidth * 0.55,
                    0,
                    0
                );
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
            connector.position = new Vector3(0, 0, -barrelLength * 0.4);
            connector.parent = barrel;
            connector.material = barrel.material;
            animationElements.multishotConnector = connector;
            
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`multishotStabilizer${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.65,
                    depth: barrelWidth * 0.12
                }, scene);
                stabilizer.position = new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.25,
                    0,
                    barrelLength * 0.15
                );
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
            barrel.rotation.x = Math.PI / 2;
            
            const homingGuidanceMat = new StandardMaterial("homingGuidanceMat", scene);
            homingGuidanceMat.diffuseColor = new Color3(0.08, 0.8, 0.08);
            homingGuidanceMat.emissiveColor = new Color3(0.03, 0.35, 0.03);
            
            const homingGuidance = MeshBuilder.CreateBox("homingGuidance", {
                width: barrelWidth * 0.75,
                height: barrelWidth * 0.55,
                depth: barrelWidth * 0.75
            }, scene);
            homingGuidance.position = new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.2);
            homingGuidance.parent = barrel;
            homingGuidance.material = homingGuidanceMat;
            animationElements.homingGuidance = homingGuidance;
            
            const controlBlock = MeshBuilder.CreateBox("homingControl", {
                width: barrelWidth * 0.5,
                height: barrelWidth * 0.3,
                depth: barrelWidth * 0.5
            }, scene);
            controlBlock.position = new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.2);
            controlBlock.parent = barrel;
            controlBlock.material = homingGuidanceMat;
            
            animationElements.homingAntennas = [];
            for (let i = 0; i < 2; i++) {
                const antenna = MeshBuilder.CreateBox(`homingAntenna${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.35,
                    depth: barrelWidth * 0.08
                }, scene);
                antenna.position = new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.45,
                    barrelWidth * 0.75,
                    -barrelLength * 0.15
                );
                antenna.parent = barrel;
                antenna.material = homingGuidanceMat;
                animationElements.homingAntennas.push(antenna);
            }
            
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`homingStabilizer${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.55,
                    depth: barrelWidth * 0.12
                }, scene);
                stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.55, 0, barrelLength * 0.1);
                stabilizer.parent = barrel;
                stabilizer.material = homingGuidanceMat;
            }
            break;
            
        case "piercing":
            // Piercing - Прототип: Бронебойная пушка / БС-3
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.55,
                height: barrelWidth * 0.55,
                depth: barrelLength * 2.2
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            const piercingTipMat = new StandardMaterial("piercingTipMat", scene);
            piercingTipMat.diffuseColor = new Color3(0.85, 0.85, 0.85);
            piercingTipMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
            for (let j = 0; j < 4; j++) {
                const tipPart = MeshBuilder.CreateBox(`piercingTip${j}`, {
                    width: barrelWidth * (0.3 - j * 0.05),
                    height: barrelWidth * (0.3 - j * 0.05),
                    depth: barrelLength * 0.075
                }, scene);
                tipPart.position = new Vector3(0, 0, barrelLength * 0.7 + j * barrelLength * 0.075);
                tipPart.rotation.y = (j % 2 === 0 ? 1 : -1) * Math.PI / 8;
                tipPart.parent = barrel;
                tipPart.material = piercingTipMat;
                if (j === 0) {
                    animationElements.piercingTip = tipPart;
                }
            }
            
            animationElements.piercingConduits = [];
            for (let i = 0; i < 2; i++) {
                const conduit = MeshBuilder.CreateBox(`piercingConduit${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 1.1,
                    depth: barrelWidth * 0.08
                }, scene);
                conduit.position = new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.35,
                    0,
                    barrelLength * 0.2
                );
                conduit.parent = barrel;
                conduit.material = barrel.material;
                animationElements.piercingConduits.push(conduit);
            }
            
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 0.75;
                const ringThickness = barrelWidth * 0.06;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                const top = MeshBuilder.CreateBox(`piercingStabilizerTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                top.material = barrel.material;
                const bottom = MeshBuilder.CreateBox(`piercingStabilizerBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                bottom.material = barrel.material;
                const left = MeshBuilder.CreateBox(`piercingStabilizerLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                left.material = barrel.material;
                const right = MeshBuilder.CreateBox(`piercingStabilizerRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
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
            barrel.rotation.x = Math.PI / 2;
            
            const shockwaveAmpMat = new StandardMaterial("shockwaveAmpMat", scene);
            shockwaveAmpMat.diffuseColor = cannonColor.scale(0.8);
            shockwaveAmpMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
            for (let j = 0; j < 3; j++) {
                const ampPart = MeshBuilder.CreateBox(`shockwaveAmp${j}`, {
                    width: barrelWidth * (2.2 - j * 0.1),
                    height: barrelWidth * 0.2,
                    depth: barrelWidth * (2.2 - j * 0.1)
                }, scene);
                ampPart.position = new Vector3(0, 0, barrelLength * 0.45 + j * barrelWidth * 0.2);
                ampPart.parent = barrel;
                ampPart.material = shockwaveAmpMat;
                if (j === 0) {
                    animationElements.shockwaveAmp = ampPart;
                }
            }
            
            animationElements.shockwaveEmitters = [];
            for (let i = 0; i < 4; i++) {
                const emitter = MeshBuilder.CreateBox(`shockwaveEmitter${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelLength * 0.6,
                    depth: barrelWidth * 0.12
                }, scene);
                const angle = (i * Math.PI * 2) / 4;
                emitter.position = new Vector3(
                    Math.cos(angle) * barrelWidth * 0.85,
                    Math.sin(angle) * barrelWidth * 0.85,
                    barrelLength * 0.1
                );
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
                genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
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
                focuserPart.position = new Vector3(0, 0, barrelLength * 0.65 + j * barrelWidth * 0.125);
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
                lens.position = new Vector3(0, 0, barrelLength * 0.25 + i * barrelLength * 0.15);
                lens.parent = barrel;
                lens.material = beamFocuserMat;
                animationElements.beamLenses.push(lens);
            }
            
            animationElements.beamConduits = [];
            for (let i = 0; i < 2; i++) {
                const channel = MeshBuilder.CreateBox(`beamChannel${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 1.1,
                    depth: barrelWidth * 0.08
                }, scene);
                channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, 0, barrelLength * 0.1);
                channel.parent = barrel;
                channel.material = beamFocuserMat;
                animationElements.beamConduits.push(channel);
            }
            break;
            
        case "vortex":
            // Vortex - Прототип: Вихревой генератор
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.7,
                height: barrelWidth * 1.7,
                depth: barrelLength * 1.0
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            animationElements.vortexRings = [];
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * (1.2 + i * 0.15);
                const ringThickness = barrelWidth * 0.12;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.15;
                const ringParts: Mesh[] = [];
                const top = MeshBuilder.CreateBox(`vortexRingTop${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`vortexRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`vortexRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`vortexRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
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
                genLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.1);
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
            barrel.rotation.x = Math.PI / 2;
            
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
                emitterPart.position = new Vector3(0, 0, barrelLength * 0.5 + j * barrelWidth * 0.15);
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
                top.position = new Vector3(0, ringSize / 2, ringZ);
                top.parent = barrel;
                ringParts.push(top);
                const bottom = MeshBuilder.CreateBox(`supportRingBottom${i}`, { width: ringSize, height: ringThickness, depth: ringThickness }, scene);
                bottom.position = new Vector3(0, -ringSize / 2, ringZ);
                bottom.parent = barrel;
                ringParts.push(bottom);
                const left = MeshBuilder.CreateBox(`supportRingLeft${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                left.position = new Vector3(-ringSize / 2, 0, ringZ);
                left.parent = barrel;
                ringParts.push(left);
                const right = MeshBuilder.CreateBox(`supportRingRight${i}`, { width: ringThickness, height: ringSize, depth: ringThickness }, scene);
                right.position = new Vector3(ringSize / 2, 0, ringZ);
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
                genLayer.position = new Vector3(0, 0, -barrelLength * 0.35 - i * barrelWidth * 0.1);
                genLayer.parent = barrel;
                genLayer.material = supportEmitterMat;
                if (i === 0) {
                    animationElements.repairGen = genLayer;
                }
            }
            break;
            
        default: // standard and all other types
            // Standard - Прототип: Т-34-85 / Д-5Т - Классическая советская пушка
            // Основной ствол - прямоугольный Box
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.0,
                height: barrelWidth * 1.0,
                depth: barrelLength * 1.0
            }, scene);
            barrel.rotation.x = Math.PI / 2;
            
            // Классический казённик (стиль Т-34) - 3 слоя прямоугольных коробок
            const standardBreechMat = new StandardMaterial("standardBreechMat", scene);
            standardBreechMat.diffuseColor = cannonColor.scale(0.7);
            for (let i = 0; i < 3; i++) {
                const breechLayer = MeshBuilder.CreateBox(`standardBreech${i}`, {
                    width: barrelWidth * (1.4 - i * 0.1),
                    height: barrelWidth * (1.4 - i * 0.1),
                    depth: barrelWidth * 0.3
                }, scene);
                breechLayer.position = new Vector3(0, 0, -barrelLength * 0.4 - i * barrelWidth * 0.3);
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
                muzzleLayer.position = new Vector3(0, 0, barrelLength * 0.5 + i * barrelWidth * 0.15);
                muzzleLayer.parent = barrel;
                muzzleLayer.material = standardBreechMat;
            }
            
            // Защитный кожух ствола
            const barrelShield = MeshBuilder.CreateBox("standardShield", {
                width: barrelWidth * 1.1,
                height: barrelWidth * 0.3,
                depth: barrelLength * 0.6
            }, scene);
            barrelShield.position = new Vector3(0, barrelWidth * 0.4, barrelLength * 0.1);
            barrelShield.parent = barrel;
            barrelShield.material = standardBreechMat;
            
            // Стабилизаторы - 2 тонких Box по бокам
            for (let i = 0; i < 2; i++) {
                const stabilizer = MeshBuilder.CreateBox(`standardStabilizer${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelLength * 0.6,
                    depth: barrelWidth * 0.08
                }, scene);
                stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.5, 0, barrelLength * 0.1);
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
