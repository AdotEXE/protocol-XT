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
import { CannonDetailsGenerator } from "../garage/cannonDetails";
import { MaterialFactory } from "../garage/materials";

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
            const scopeTube = CannonDetailsGenerator.createScope(
                scene, barrel,
                new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.7),
                barrelWidth * 0.4, barrelWidth * 0.4,
                ""
            );
            scopeTube.material = scopeMat;
            
            // Угловые пластины для создания угловатого вида (4 Box с наклоном)
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        barrelWidth * 0.7 + Math.cos(angle) * barrelWidth * 0.25,
                        barrelWidth * 0.6 + Math.sin(angle) * barrelWidth * 0.25,
                        barrelLength * 0.7
                    ),
                    angle,
                    barrelWidth * 0.1, barrelWidth * 0.4, barrelWidth * 1.5,
                    scopeMat, `scopePlate${i}`
                );
            }
            
            // Линза прицела (прямоугольный Box с emissive)
            const lensMat = new StandardMaterial("scopeLensMat", scene);
            lensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
            lensMat.emissiveColor = new Color3(0.1, 0.2, 0.3);
            const scopeLens = CannonDetailsGenerator.createLens(
                scene, barrel,
                new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.85),
                barrelWidth * 0.2, barrelWidth * 0.5,
                ""
            );
            scopeLens.material = lensMat;
            animationElements.sniperLens = scopeLens;  // Для анимации
            
            // Регулировочный блок
            CannonDetailsGenerator.createPlate(
                scene, barrel,
                new Vector3(barrelWidth * 0.7, barrelWidth * 0.6, barrelLength * 0.6),
                0,
                barrelWidth * 0.15, barrelWidth * 0.1, barrelWidth * 0.3,
                scopeMat, "scopeAdjustment"
            );
            
            // Сошки (характерные для ПТРД) - прямоугольные Box с наклоном
            for (let i = 0; i < 2; i++) {
                const bipod = CannonDetailsGenerator.createBipod(
                    scene, barrel,
                    new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.45, 
                        -barrelWidth * 0.5, 
                        barrelLength * 0.75
                    ),
                    0.12, barrelWidth * 1.0, 0.12,
                    scopeMat, `bipod${i}`
                );
                bipod.rotation.z = (i === 0 ? 1 : -1) * Math.PI / 8;
            }
            
            // Утолщение у основания ствола
            CannonDetailsGenerator.createBaseThickening(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.3),
                barrelWidth * 0.9, barrelWidth * 0.9, barrelWidth * 0.4,
                scopeMat, ""
            );
            
            // Глушитель на конце ствола (средний размер)
            CannonDetailsGenerator.createSuppressor(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 1.0),
                barrelWidth * 1.125, barrelWidth * 1.125, barrelLength * 0.3,
                scopeMat, ""
            );
            
            // Детали глушителя (вентиляционные отверстия) - 8 маленьких Box
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2) / 8;
                CannonDetailsGenerator.createSuppressorVent(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.4,
                        Math.sin(angle) * barrelWidth * 0.4,
                        barrelLength * 1.0
                    ),
                    angle,
                    barrelWidth * 0.06, barrelWidth * 0.06, barrelLength * 0.25,
                    scopeMat, `suppressorVent${i}`
                );
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
            const gatlingBarrelMat = new StandardMaterial("gatlingBarrelMat", scene);
            gatlingBarrelMat.diffuseColor = cannonColor.scale(0.8);
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2 / 6);
                const miniBarrel = CannonDetailsGenerator.createMiniBarrel(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.6,
                        Math.sin(angle) * barrelWidth * 0.6,
                        0
                    ),
                    angle,
                    barrelWidth * 0.35, barrelWidth * 0.35, barrelLength * 1.1,
                    gatlingBarrelMat, `minibarrel${i}`
                );
                animationElements.gatlingBarrels.push(miniBarrel);
            }
            
            // Система охлаждения - 4 прямоугольных вентиляционных коробки (Box) вокруг корпуса
            const coolingVentMat = new StandardMaterial("coolingVentMat", scene);
            coolingVentMat.diffuseColor = cannonColor.scale(0.6);
            coolingVentMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createCoolingRing(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.95,
                        Math.sin(angle) * barrelWidth * 0.95,
                        -barrelLength * 0.35 + (i % 2) * barrelLength * 0.12
                    ),
                    angle,
                    barrelWidth * 0.25, barrelWidth * 0.25, barrelLength * 0.12,
                    coolingVentMat, `coolingVent${i}`
                );
            }
            
            // Центральный блок питания - 3 слоя прямоугольных коробок (layered_cube) - ANIMATED
            const powerMat = new StandardMaterial("gatlingPowerMat", scene);
            powerMat.diffuseColor = cannonColor.scale(0.5);
            powerMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
            const powerLayers = CannonDetailsGenerator.createGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.5),
                barrelWidth * 1.3, 3, barrelWidth * 0.1,
                powerMat, "gatlingPowerBlock"
            );
            animationElements.gatlingPowerBlock = powerLayers[0];  // Для анимации
            
            // Детали блока питания - 4 прямоугольных Box по углам
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.5,
                        Math.sin(angle) * barrelWidth * 0.5,
                        -barrelLength * 0.5
                    ),
                    angle,
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.1,
                    powerMat, `powerDetail${i}`
                );
            }
            
            // Вентиляционные отверстия (угловатые) - 8 прямоугольных Box вокруг корпуса
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2) / 8;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.85,
                        Math.sin(angle) * barrelWidth * 0.85,
                        -barrelLength * 0.2
                    ),
                    angle,
                    barrelWidth * 0.12, barrelWidth * 0.3, barrelWidth * 0.12,
                    powerMat, `gatlingVent${i}`
                );
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
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.5),
                barrelWidth * 1.8, barrelWidth * 1.8, barrelWidth * 0.35,
                cannonColor.scale(0.55),
                "heavy"
            );
            
            // Дульный тормоз (характерный для ИС-2) - 3 слоя прямоугольных коробок
            for (let i = 0; i < 3; i++) {
                CannonDetailsGenerator.createMuzzleBrake(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.55),
                    i, barrelWidth * 1.6, barrelWidth * 0.15,
                    barrelWidth * 0.17,
                    heavyBreechMat, ""
                );
            }
            
            // Усилители по бокам ствола (короткие горизонтальные детали вместо длинных вертикальных)
            for (let i = 0; i < 4; i++) {
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.4;
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        side * barrelWidth * 0.7,
                        0,
                        barrelLength * 0.1 + zOffset
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                    heavyBreechMat, `heavyReinforcement${i}`
                );
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
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 1.2, barrelWidth * 1.2, barrelWidth * 0.35,
                cannonColor,
                "rapid"
            );
            
            // Небольшой дульный тормоз - 1 слой прямоугольной коробки
            CannonDetailsGenerator.createMuzzleBrake(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.35),
                0, barrelWidth * 0.9, 0,
                barrelWidth * 0.25,
                barrel.material as StandardMaterial, ""
            );
            
            // Стабилизаторы - 2 тонких Box по бокам
            // Стабилизаторы - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        (i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.4,
                        0,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.1, barrelWidth * 0.1, barrelWidth * 0.25,
                    barrel.material as StandardMaterial, `rapidStabilizer${i}`
                );
            }
            break;
            
        // === ENERGY WEAPONS ===
        case "plasma":
            // Plasma - УЛУЧШЕННЫЙ РЕАЛИСТИЧНЫЙ ДИЗАЙН: Плазменная пушка с детализированной геометрией
            // Основной ствол - более реалистичная форма с коническим расширением
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.1,
                height: barrelWidth * 1.1,
                depth: barrelLength * 1.3
            }, scene);
            
            const barrelMat = new StandardMaterial("plasmaBarrelMat", scene);
            barrelMat.diffuseColor = cannonColor.scale(0.85);
            barrelMat.specularColor = Color3.Black();
            barrel.material = barrelMat;
            
            // Улучшенные расширяющиеся секции - более плавный переход
            for (let i = 0; i < 3; i++) {
                const expansionPlate = CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.2 + i * barrelLength * 0.4),
                    0,
                    barrelWidth * (1.0 + i * 0.22), barrelWidth * (1.0 + i * 0.22), barrelLength * 0.35,
                    barrelMat, `plasmaExpansion${i}`
                );
                // Добавляем детали к секциям
                const detailMat = new StandardMaterial(`plasmaDetailMat${i}`, scene);
                detailMat.diffuseColor = cannonColor.scale(0.7);
                // Ребристые детали для охлаждения
                for (let j = 0; j < 8; j++) {
                    const angle = (j * Math.PI * 2) / 8;
                    const rib = MeshBuilder.CreateBox(`plasmaRib${i}_${j}`, {
                        width: barrelWidth * 0.06,
                        height: barrelWidth * 0.08,
                        depth: barrelLength * 0.3
                    }, scene);
                    rib.position = addZFightingOffset(new Vector3(
                        Math.cos(angle) * barrelWidth * (0.6 + i * 0.15),
                        Math.sin(angle) * barrelWidth * (0.6 + i * 0.15),
                        barrelLength * 0.2 + i * barrelLength * 0.4
                    ), "forward");
                    rib.parent = barrel;
                    rib.material = detailMat;
                }
            }
            
            const coreMat = new StandardMaterial("plasmaCoreMat", scene);
            coreMat.diffuseColor = new Color3(0.8, 0.2, 0.8);
            coreMat.emissiveColor = new Color3(0.6, 0, 0.6);
            coreMat.disableLighting = true;
            const coreLayers = CannonDetailsGenerator.createPlasmaCore(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.2, 3, barrelWidth * 0.1,
                coreMat, ""
            );
            animationElements.plasmaCore = coreLayers[0];
            
            animationElements.plasmaCoils = [];
            const plasmaCoilMat = new StandardMaterial("plasmaCoilMat", scene);
            plasmaCoilMat.diffuseColor = new Color3(0.7, 0, 0.7);
            plasmaCoilMat.emissiveColor = new Color3(0.4, 0, 0.4);
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.4;
                const ringThickness = barrelWidth * 0.12;
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                const ringParts = CannonDetailsGenerator.createPlasmaCoil(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    plasmaCoilMat, `plasmaCoil${i}`
                );
                animationElements.plasmaCoils.push(...ringParts);
            }
            
            // Стабилизаторы плазмы - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.35;
                CannonDetailsGenerator.createPlasmaStabilizer(
                    scene, barrel,
                    new Vector3(
                        side * barrelWidth * 0.65,
                        0,
                        barrelLength * 0.1 + zOffset
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                    coreMat, `plasmaStabilizer${i}`
                );
            }
            
            for (let j = 0; j < 4; j++) {
                CannonDetailsGenerator.createPlasmaEmitter(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    j, barrelWidth * 0.9, barrelWidth * 0.1,
                    barrelWidth * 0.1,
                    coreMat, ""
                );
            }
            
            // Дополнительные детали: ребра охлаждения
            for (let i = 0; i < 8; i++) {
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.2 + (i % 4) * barrelLength * 0.5;
                CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(finAngle) * barrelWidth * 0.55,
                        Math.sin(finAngle) * barrelWidth * 0.55,
                        finZ
                    ),
                    finAngle,
                    barrelWidth * 0.14, barrelWidth * 0.1, barrelWidth * 0.05,
                    barrel.material as StandardMaterial, `plasmaFin${i}`
                );
            }
            
            // Пластины энергоблока
            for (let i = 0; i < 6; i++) {
                const plateAngle = (i * Math.PI * 2) / 6;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(plateAngle) * barrelWidth * 0.5,
                        Math.sin(plateAngle) * barrelWidth * 0.5,
                        -barrelLength * 0.35
                    ),
                    plateAngle,
                    barrelWidth * 0.12, barrelWidth * 0.08, barrelWidth * 0.12,
                    coreMat, `plasmaPlate${i}`
                );
            }
            break;
            
        case "laser":
            // Laser - Прототип: Футуристический лазер (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 0.6,
                height: barrelWidth * 0.6,
                depth: barrelLength * 1.8
            }, scene);
            
            const laserLensMat = new StandardMaterial("laserLensMat", scene);
            laserLensMat.diffuseColor = new Color3(0.8, 0.15, 0);
            laserLensMat.emissiveColor = new Color3(0.5, 0, 0);
            laserLensMat.disableLighting = true;
            const lens = CannonDetailsGenerator.createLens(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.6),
                barrelWidth * 0.5, barrelWidth * 0.9,
                ""
            );
            lens.material = laserLensMat;
            animationElements.laserLens = lens;
            
            animationElements.laserRings = [];
            const focusRingMat = new StandardMaterial("focusRingMat", scene);
            focusRingMat.diffuseColor = new Color3(0.7, 0, 0);
            focusRingMat.emissiveColor = new Color3(0.25, 0, 0);
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.0;
                const ringThickness = barrelWidth * 0.08;
                const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.25;
                const ringParts = CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    focusRingMat, `laserRing${i}`
                );
                animationElements.laserRings.push(...ringParts);
            }
            
            // Короткие горизонтальные детали вокруг ствола (без вертикальных полосок)
            // Маленькие кольца вокруг ствола (6 штук, короткие)
            for (let i = 0; i < 6; i++) {
                const ringZ = -barrelLength * 0.1 + i * barrelLength * 0.35;
                const ringSize = barrelWidth * 0.95;
                const ringThickness = barrelWidth * 0.05;
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    laserLensMat, `laserSmallRing${i}`
                );
            }
            
            const housingMat = new StandardMaterial("laserHousingMat", scene);
            housingMat.diffuseColor = cannonColor.scale(0.6);
            CannonDetailsGenerator.createLaserHousing(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.35, barrelLength * 0.05),
                barrelWidth * 0.85, barrelWidth * 0.25, barrelLength * 1.2,
                housingMat, ""
            );
            break;
            
        case "tesla":
            // Tesla - Прототип: Футуристическая катушка Тесла (советский стиль)
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.8,
                height: barrelWidth * 1.8,
                depth: barrelLength * 0.9
            }, scene);
            
            animationElements.teslaCoils = [];
            const teslaCoilMat = new StandardMaterial("teslaCoilMat", scene);
            teslaCoilMat.diffuseColor = new Color3(0, 0.7, 0.9);
            teslaCoilMat.emissiveColor = new Color3(0, 0.4, 0.6);
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * 0.8;
                const ringThickness = barrelWidth * 0.15;
                const ringZ = -barrelLength * 0.3 + i * barrelLength * 0.15;
                const ringParts = CannonDetailsGenerator.createTeslaCoil(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    teslaCoilMat, `teslaCoil${i}`
                );
                animationElements.teslaCoils.push(...ringParts);
            }
            
            const dischargerMat = new StandardMaterial("teslaDischargerMat", scene);
            dischargerMat.diffuseColor = new Color3(0, 0.7, 0.9);
            dischargerMat.emissiveColor = new Color3(0, 0.4, 0.6);
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createTeslaDischarger(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.45,
                        barrelLength * 0.2
                    ),
                    angle,
                    barrelWidth * 0.2, barrelWidth * 0.4, barrelWidth * 0.2,
                    dischargerMat, `teslaDischarger${i}`
                );
            }
            
            const genMat = new StandardMaterial("teslaGenMat", scene);
            genMat.diffuseColor = new Color3(0, 0.9, 1);
            genMat.emissiveColor = new Color3(0, 0.6, 0.8);
            genMat.disableLighting = true;
            const genLayers = CannonDetailsGenerator.createTeslaGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 0.6,
                ""
            );
            genLayers[0].material = genMat;
            animationElements.teslaGen = genLayers[0];
            
            // Дополнительные детали: энергоблоки
            for (let i = 0; i < 6; i++) {
                const blockAngle = (i * Math.PI * 2) / 6;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(blockAngle) * barrelWidth * 0.75,
                        Math.sin(blockAngle) * barrelWidth * 0.75,
                        -barrelLength * 0.2 + (i % 3) * barrelLength * 0.3
                    ),
                    blockAngle,
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.15,
                    genMat, `teslaEnergyBlock${i}`
                );
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
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    railMat, `railgunRing${i}`
                );
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (12 штук)
            for (let i = 0; i < 12; i++) {
                const plateAngle = (i * Math.PI * 2) / 12;
                const plateZ = -barrelLength * 0.25 + (i % 6) * barrelLength * 0.4;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(plateAngle) * barrelWidth * 0.42,
                        Math.sin(plateAngle) * barrelWidth * 0.42,
                        plateZ
                    ),
                    plateAngle,
                    barrelWidth * 0.12, barrelWidth * 0.08, barrelWidth * 0.12,
                    railMat, `railgunPlate${i}`
                );
            }
            
            // Ребра охлаждения (10 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 10; i++) {
                const finAngle = (i * Math.PI * 2) / 10;
                const finZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
                CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(finAngle) * barrelWidth * 0.4,
                        Math.sin(finAngle) * barrelWidth * 0.4,
                        finZ
                    ),
                    finAngle,
                    barrelWidth * 0.14, barrelWidth * 0.1, barrelWidth * 0.05,
                    railMat, `railgunFin${i}`
                );
            }
            
            animationElements.railgunCapacitors = [];
            for (let i = 0; i < 3; i++) {
                const capacitor = CannonDetailsGenerator.createCapacitor(
                    scene, barrel,
                    new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.4 + i * barrelLength * 0.3),
                    barrelWidth * 0.5, barrelWidth * 0.5,
                    ""
                );
                capacitor.material = railMat;
                animationElements.railgunCapacitors.push(capacitor);
            }
            
            for (let i = 0; i < 3; i++) {
                CannonDetailsGenerator.createRailChannel(
                    scene, barrel,
                    new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.3),
                    barrelWidth * 0.25, barrelWidth * 0.12, barrelLength * 0.25,
                    ""
                );
            }
            
            CannonDetailsGenerator.createMuzzleAmplifier(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.95),
                barrelWidth * 0.3, barrelWidth * 1.2,
                ""
            );
            break;
            
        // === EXPLOSIVE WEAPONS ===
        case "rocket":
            // Rocket - УЛУЧШЕННЫЙ РЕАЛИСТИЧНЫЙ ДИЗАЙН: РПГ-7 / РПГ-29
            // Основной ствол - более реалистичная форма с цилиндрическим профилем
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6, 
                height: barrelWidth * 1.6, 
                depth: barrelLength * 1.2 
            }, scene);
            
            const tubeMat = new StandardMaterial("rocketTubeMat", scene);
            tubeMat.diffuseColor = cannonColor.scale(0.75);
            tubeMat.specularColor = Color3.Black();
            
            // Улучшенная труба с более реалистичными пропорциями
            const tube = CannonDetailsGenerator.createRocketTube(
                scene, barrel,
                new Vector3(0, 0, 0),
                barrelLength * 1.1, barrelWidth * 1.4,
                cannonColor,
                ""
            );
            tube.material = tubeMat;
            animationElements.rocketTube = tube;
            
            // Улучшенные направляющие ракет - более детализированные, как в реальном РПГ
            animationElements.rocketGuides = [];
            const guideMat = new StandardMaterial("rocketGuideMat", scene);
            guideMat.diffuseColor = cannonColor.scale(0.6);
            
            // Внутренние направляющие (4 основных)
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4 + Math.PI / 4; // Смещение на 45 градусов
                for (let j = 0; j < 3; j++) {
                    const guide = CannonDetailsGenerator.createGuide(
                        scene, barrel,
                        new Vector3(
                            Math.cos(angle) * barrelWidth * 0.55,
                            Math.sin(angle) * barrelWidth * 0.55,
                            (j - 1) * barrelLength * 0.3
                        ),
                        barrelWidth * 0.08, barrelWidth * 0.08, barrelLength * 0.15,
                        guideMat, `guide${i}_${j}`
                    );
                    animationElements.rocketGuides.push(guide);
                }
            }
            
            // Прицельная планка сверху (реалистичная деталь РПГ)
            const sightRail = MeshBuilder.CreateBox("rocketSightRail", {
                width: barrelWidth * 0.4,
                height: barrelWidth * 0.12,
                depth: barrelLength * 0.8
            }, scene);
            sightRail.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.85, barrelLength * 0.1), "up");
            sightRail.parent = barrel;
            sightRail.material = tubeMat;
            
            // Прицельный мушка спереди
            const frontSight = MeshBuilder.CreateBox("rocketFrontSight", {
                width: barrelWidth * 0.06,
                height: barrelWidth * 0.2,
                depth: barrelWidth * 0.08
            }, scene);
            frontSight.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.9, barrelLength * 0.5), "up");
            frontSight.parent = barrel;
            frontSight.material = guideMat;
            
            // Задний прицел
            const rearSight = MeshBuilder.CreateBox("rocketRearSight", {
                width: barrelWidth * 0.08,
                height: barrelWidth * 0.15,
                depth: barrelWidth * 0.1
            }, scene);
            rearSight.position = addZFightingOffset(new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.35), "up");
            rearSight.parent = barrel;
            rearSight.material = guideMat;
            
            // Улучшенные стабилизаторы ракеты - более реалистичная форма
            const finMat = new StandardMaterial("rocketFinMat", scene);
            finMat.diffuseColor = cannonColor.scale(0.7);
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                const fin = CannonDetailsGenerator.createRocketFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.7,
                        Math.sin(angle) * barrelWidth * 0.7,
                        barrelLength * 0.45
                    ),
                    angle,
                    barrelWidth * 0.1, barrelWidth * 0.3, barrelWidth * 0.06,
                    finMat, `rocketFin${i}`
                );
                // Добавляем скосы к стабилизаторам для реалистичности
                fin.rotation.y = Math.PI / 12 * (i % 2 === 0 ? 1 : -1);
            }
            
            // Защитный экран спереди (характерная деталь РПГ-7)
            const blastShield = MeshBuilder.CreateBox("rocketBlastShield", {
                width: barrelWidth * 1.8,
                height: barrelWidth * 1.8,
                depth: barrelWidth * 0.15
            }, scene);
            blastShield.position = addZFightingOffset(new Vector3(0, 0, barrelLength * 0.55), "forward");
            blastShield.parent = barrel;
            const shieldMat = new StandardMaterial("rocketShieldMat", scene);
            shieldMat.diffuseColor = cannonColor.scale(0.65);
            blastShield.material = shieldMat;
            
            // Система наведения (более детализированная)
            const guidanceMat = new StandardMaterial("rocketGuidanceMat", scene);
            guidanceMat.diffuseColor = new Color3(0.2, 0.8, 0.2);
            guidanceMat.emissiveColor = new Color3(0.05, 0.4, 0.05);
            const guidance = CannonDetailsGenerator.createRocketGuidance(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.25),
                barrelWidth * 0.4, barrelWidth * 0.22, barrelWidth * 0.4,
                guidanceMat, ""
            );
            
            // Индикаторы наведения (светодиоды)
            for (let i = 0; i < 3; i++) {
                const indicator = MeshBuilder.CreateBox(`rocketIndicator${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.08,
                    depth: barrelWidth * 0.05
                }, scene);
                indicator.position = addZFightingOffset(new Vector3(
                    (i - 1) * barrelWidth * 0.15,
                    barrelWidth * 0.65,
                    -barrelLength * 0.25
                ), "forward");
                indicator.parent = barrel;
                const indicatorMat = new StandardMaterial(`rocketIndicatorMat${i}`, scene);
                indicatorMat.diffuseColor = new Color3(0.8, 0.2, 0.2);
                indicatorMat.emissiveColor = new Color3(0.4, 0.1, 0.1);
                indicator.material = indicatorMat;
            }
            
            // Ручка для переноски (характерная деталь)
            const handle = MeshBuilder.CreateBox("rocketHandle", {
                width: barrelWidth * 0.15,
                height: barrelWidth * 0.1,
                depth: barrelLength * 0.3
            }, scene);
            handle.position = addZFightingOffset(new Vector3(0, -barrelWidth * 0.75, barrelLength * 0.05), "down");
            handle.parent = barrel;
            handle.material = tubeMat;
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
            animationElements.mortarBase = null;
            for (let i = 0; i < 3; i++) {
                const baseLayer = CannonDetailsGenerator.createMortarBaseLayer(
                    scene, barrel,
                    new Vector3(0, -barrelWidth * 0.7, 0),
                    i, barrelWidth * 2.4, barrelWidth * 0.2,
                    mortarBaseMat, ""
                );
                if (i === 0) {
                    animationElements.mortarBase = baseLayer;
                }
            }
            
            animationElements.mortarLegs = [];
            for (let i = 0; i < 3; i++) {
                const angle = (i * Math.PI * 2) / 3;
                const leg = CannonDetailsGenerator.createMortarLeg(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.95,
                        -barrelWidth * 0.95,
                        Math.sin(angle) * barrelWidth * 0.25
                    ),
                    angle,
                    barrelWidth * 0.18, barrelWidth * 0.45, barrelWidth * 0.18,
                    mortarBaseMat, `mortarLeg${i}`
                );
                animationElements.mortarLegs.push(leg);
            }
            
            // Усилители миномета - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                const side = i < 2 ? -1 : 1;
                const zOffset = (i % 2) * barrelWidth * 0.4;
                CannonDetailsGenerator.createMortarReinforcement(
                    scene, barrel,
                    new Vector3(barrelWidth * 1.05, 0, 0),
                    side, zOffset,
                    barrelWidth * 0.3, barrelWidth * 0.3, barrelWidth * 0.3,
                    mortarBaseMat, `mortarReinforcement${i}`
                );
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
            const clusterTubeMat = new StandardMaterial("clusterTubeMat", scene);
            clusterTubeMat.diffuseColor = cannonColor.scale(0.9);
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2 / 6);
                const clusterTube = CannonDetailsGenerator.createClusterTube(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.5,
                        Math.sin(angle) * barrelWidth * 0.5,
                        0
                    ),
                    angle,
                    barrelWidth * 0.35, barrelWidth * 0.35, barrelLength * 0.9,
                    clusterTubeMat, `cluster${i}`
                );
                animationElements.clusterTubes.push(clusterTube);
            }
            
            const centerTube = CannonDetailsGenerator.createClusterCenterTube(
                scene, barrel,
                new Vector3(0, 0, 0),
                barrelWidth * 0.4, barrelWidth * 0.4, barrelLength * 0.95,
                barrel.material as StandardMaterial, ""
            );
            animationElements.clusterCenterTube = centerTube;
            
            // Стабилизаторы кластера - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2 / 8) + Math.PI / 8;
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.75,
                        Math.sin(angle) * barrelWidth * 0.75,
                        barrelLength * 0.1 + (i % 4) * barrelWidth * 0.3
                    ),
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.25,
                    barrel.material as StandardMaterial, `clusterStabilizer${i}`
                );
            }
            break;
            
        case "explosive":
            // Explosive - Прототип: ИСУ-152 / МЛ-20
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6,
                height: barrelWidth * 1.6,
                depth: barrelLength * 1.0
            }, scene);
            
            const explosiveBreechMat = new StandardMaterial("explosiveBreechMat", scene);
            explosiveBreechMat.diffuseColor = cannonColor.scale(0.7);
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.5),
                barrelWidth * 1.9, barrelWidth * 1.9, barrelWidth * 1.3,
                cannonColor.scale(0.7),
                ""
            );
            
            CannonDetailsGenerator.createExplosiveMuzzle(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5),
                barrelWidth * 1.6, barrelWidth * 0.5, barrelWidth * 1.6,
                explosiveBreechMat, ""
            );
            
            // Каналы взрывной пушки - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                CannonDetailsGenerator.createExplosiveChannel(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.65,
                        Math.sin(angle) * barrelWidth * 0.65,
                        barrelLength * 0.05
                    ),
                    angle,
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.3,
                    explosiveBreechMat, `explosiveChannel${i}`
                );
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
                const nozzlePart = CannonDetailsGenerator.createFlamethrowerNozzle(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.45),
                    j, barrelWidth * 1.0, barrelWidth * 0.1,
                    barrelLength * 0.1,
                    nozzleMat, ""
                );
                if (j === 0) {
                    animationElements.flamethrowerNozzle = nozzlePart;
                }
            }
            
            const tankMat = new StandardMaterial("flamethrowerTankMat", scene);
            tankMat.diffuseColor = cannonColor.scale(0.8);
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createFlamethrowerTank(
                    scene, barrel,
                    new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.6,
                        0,
                        -barrelLength * 0.1
                    ),
                    barrelWidth * 0.4, barrelWidth * 0.4, barrelLength * 0.7,
                    tankMat, `flamethrowerTank${i}`
                );
                
                CannonDetailsGenerator.createFlamethrowerVent(
                    scene, barrel,
                    new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.6,
                        barrelWidth * 0.25,
                        -barrelLength * 0.15
                    ),
                    barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
                    tankMat, `flamethrowerVent${i}`
                );
            }
            
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createFlamethrowerHose(
                    scene, barrel,
                    new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.35,
                        barrelWidth * 0.25,
                        barrelLength * 0.1
                    ),
                    (i === 0 ? 1 : -1) * Math.PI / 8,
                    barrelWidth * 0.1, barrelWidth * 0.5, barrelWidth * 0.1,
                    nozzleMat, `flamethrowerHose${i}`
                );
            }
            break;
            
        case "acid":
            // Acid - УЛУЧШЕННЫЙ РЕАЛИСТИЧНЫЙ ДИЗАЙН: Химический распылитель с детализированной геометрией
            // Основной ствол - более реалистичная форма
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.3,
                height: barrelWidth * 1.3,
                depth: barrelLength * 1.1
            }, scene);
            
            const acidBarrelMat = new StandardMaterial("acidBarrelMat", scene);
            acidBarrelMat.diffuseColor = cannonColor.scale(0.85);
            acidBarrelMat.specularColor = Color3.Black();
            barrel.material = acidBarrelMat;
            
            // Улучшенный резервуар с кислотой - более детализированный
            const acidTankMat = new StandardMaterial("acidTankMat", scene);
            acidTankMat.diffuseColor = new Color3(0.2, 0.8, 0.2);
            acidTankMat.emissiveColor = new Color3(0.08, 0.4, 0.08);
            const acidTank = CannonDetailsGenerator.createAcidTank(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.65, -barrelLength * 0.35),
                barrelWidth * 1.1, barrelWidth * 2.0, barrelWidth * 1.1,
                acidTankMat, ""
            );
            animationElements.acidTank = acidTank;
            
            // Датчики уровня кислоты на резервуаре (реалистичная деталь)
            for (let i = 0; i < 3; i++) {
                const sensor = MeshBuilder.CreateBox(`acidSensor${i}`, {
                    width: barrelWidth * 0.08,
                    height: barrelWidth * 0.15,
                    depth: barrelWidth * 0.05
                }, scene);
                sensor.position = addZFightingOffset(new Vector3(
                    (i - 1) * barrelWidth * 0.35,
                    barrelWidth * 0.5 + i * barrelWidth * 0.3,
                    -barrelLength * 0.35
                ), "forward");
                sensor.parent = barrel;
                const sensorMat = new StandardMaterial(`acidSensorMat${i}`, scene);
                sensorMat.diffuseColor = new Color3(0.3, 0.9, 0.3);
                sensorMat.emissiveColor = new Color3(0.1, 0.5, 0.1);
                sensor.material = sensorMat;
            }
            
            // Клапаны безопасности на резервуаре
            for (let i = 0; i < 2; i++) {
                const valve = MeshBuilder.CreateBox(`acidValve${i}`, {
                    width: barrelWidth * 0.12,
                    height: barrelWidth * 0.12,
                    depth: barrelWidth * 0.1
                }, scene);
                valve.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * barrelWidth * 0.5,
                    barrelWidth * 0.75,
                    -barrelLength * 0.3
                ), "forward");
                valve.parent = barrel;
                valve.material = acidBarrelMat;
            }
            
            CannonDetailsGenerator.createAcidVent(
                scene, barrel,
                new Vector3(0, barrelWidth * 1.0, -barrelLength * 0.3),
                barrelWidth * 0.1, barrelWidth * 0.1, barrelWidth * 0.1,
                acidTankMat, ""
            );
            
            const indicatorMat = new StandardMaterial("acidIndicatorMat", scene);
            indicatorMat.diffuseColor = new Color3(0, 1, 0);
            indicatorMat.emissiveColor = new Color3(0, 0.5, 0);
            CannonDetailsGenerator.createAcidIndicator(
                scene, barrel,
                new Vector3(barrelWidth * 0.5, barrelWidth * 0.4, -barrelLength * 0.3),
                barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.05,
                indicatorMat, ""
            );
            
            for (let i = 0; i < 3; i++) {
                CannonDetailsGenerator.createAcidChannel(
                    scene, barrel,
                    new Vector3(
                        (i - 1) * barrelWidth * 0.25,
                        barrelWidth * 0.15,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelLength * 0.6,
                    acidTankMat, `acidChannel${i}`
                );
            }
            
            for (let j = 0; j < 3; j++) {
                const sprayerPart = CannonDetailsGenerator.createAcidSprayer(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    j, barrelWidth * 1.3, barrelWidth * 0.1,
                    barrelWidth * 0.1,
                    acidTankMat, ""
                );
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
            const freezeFinMat = new StandardMaterial("freezeFinMat", scene);
            freezeFinMat.diffuseColor = new Color3(0.4, 0.6, 0.9);
            freezeFinMat.emissiveColor = new Color3(0.08, 0.15, 0.25);
            // Ребра замораживателя - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2 / 8);
                const fin = CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.55,
                        Math.sin(angle) * barrelWidth * 0.55,
                        barrelLength * 0.05
                    ),
                    angle,
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.4,
                    freezeFinMat, `freezeFin${i}`
                );
                animationElements.freezeFins.push(fin);
            }
            
            const cryoMat = new StandardMaterial("cryoTankMat", scene);
            cryoMat.diffuseColor = new Color3(0.25, 0.5, 0.9);
            cryoMat.emissiveColor = new Color3(0.08, 0.15, 0.3);
            const cryoTank = CannonDetailsGenerator.createCryoTank(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.45, -barrelLength * 0.3),
                barrelWidth * 0.7, barrelWidth * 0.6, barrelWidth * 0.7,
                cryoMat, ""
            );
            animationElements.cryoTank = cryoTank;
            
            CannonDetailsGenerator.createCryoVent(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.75, -barrelLength * 0.3),
                barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
                cryoMat, ""
            );
            
            for (let j = 0; j < 3; j++) {
                const emitterPart = CannonDetailsGenerator.createFreezeEmitter(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    j, barrelWidth * 1.3, barrelWidth * 0.1,
                    barrelWidth * 0.13,
                    cryoMat, ""
                );
                if (j === 0) {
                    animationElements.freezeEmitter = emitterPart;
                }
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
            CannonDetailsGenerator.createPoisonTank(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.4, -barrelLength * 0.25),
                barrelWidth * 0.6, barrelWidth * 1.2, barrelWidth * 0.6,
                poisonTankMat, ""
            );
            
            CannonDetailsGenerator.createPoisonVent(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.25),
                barrelWidth * 0.08, barrelWidth * 0.08, barrelWidth * 0.08,
                poisonTankMat, ""
            );
            
            for (let j = 0; j < 3; j++) {
                const injectorPart = CannonDetailsGenerator.createPoisonInjector(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.45),
                    j, barrelWidth * 0.5, barrelWidth * 0.05,
                    barrelWidth * 0.2,
                    poisonTankMat, ""
                );
                if (j === 0) {
                    animationElements.poisonInjector = injectorPart;
                }
            }
            
            for (let i = 0; i < 4; i++) {
                const angle = (i * Math.PI * 2) / 4;
                CannonDetailsGenerator.createPoisonNeedle(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.25,
                        Math.sin(angle) * barrelWidth * 0.25,
                        barrelLength * 0.5
                    ),
                    angle,
                    barrelWidth * 0.06, barrelWidth * 0.3, barrelWidth * 0.06,
                    poisonTankMat, `poisonNeedle${i}`
                );
            }
            
            // Каналы яда - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createPoisonChannel(
                    scene, barrel,
                    new Vector3(
                        (i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.3,
                        barrelWidth * 0.15,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.3,
                    poisonTankMat, `poisonChannel${i}`
                );
            }
            break;
            
        case "emp":
            // EMP - Прототип: ЭМИ излучатель
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.6,
                height: barrelWidth * 1.6,
                depth: barrelLength * 1.0
            }, scene);
            
            const empDishMat = new StandardMaterial("empDishMat", scene);
            empDishMat.diffuseColor = new Color3(0.7, 0.7, 0.15);
            empDishMat.emissiveColor = new Color3(0.3, 0.3, 0.08);
            const empDish = CannonDetailsGenerator.createEMPDish(
                scene, barrel,
                new Vector3(0, 0, barrelLength * 0.5),
                barrelWidth * 1.8, barrelWidth * 0.3, barrelWidth * 1.8,
                empDishMat, ""
            );
            animationElements.empDish = empDish;
            
            animationElements.empCoils = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 1.3;
                const ringThickness = barrelWidth * 0.1;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                const ringParts = CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    empDishMat, `empCoil${i}`
                );
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
            const shotgunBarrelMat = new StandardMaterial("shotgunBarrelMat", scene);
            shotgunBarrelMat.diffuseColor = cannonColor.scale(0.9);
            for (let i = 0; i < 10; i++) {
                const angle = (i * Math.PI * 2) / 10;
                const pelletBarrel = CannonDetailsGenerator.createPelletBarrel(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.55,
                        Math.sin(angle) * barrelWidth * 0.55,
                        0
                    ),
                    angle,
                    barrelWidth * 0.18, barrelWidth * 0.18, barrelLength * 0.7,
                    shotgunBarrelMat, `pelletBarrel${i}`
                );
                animationElements.shotgunBarrels.push(pelletBarrel);
            }
            
            const centerBarrel = CannonDetailsGenerator.createCenterBarrel(
                scene, barrel,
                new Vector3(0, 0, 0),
                barrelWidth * 0.25, barrelWidth * 0.25, barrelLength * 0.75,
                barrel.material as StandardMaterial, ""
            );
            
            // Усилители дробовика - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2) / 8;
                CannonDetailsGenerator.createShotgunReinforcement(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.75,
                        Math.sin(angle) * barrelWidth * 0.75,
                        barrelLength * 0.1
                    ),
                    angle,
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.25,
                    barrel.material as StandardMaterial, `shotgunReinforcement${i}`
                );
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
            const multishotBarrelMat = new StandardMaterial("multishotBarrelMat", scene);
            multishotBarrelMat.diffuseColor = cannonColor.scale(0.9);
            for (let i = 0; i < 3; i++) {
                const multiBarrel = CannonDetailsGenerator.createMultishotBarrel(
                    scene, barrel,
                    new Vector3(
                        (i - 1) * barrelWidth * 0.55,
                        0,
                        0
                    ),
                    barrelWidth * 0.5, barrelWidth * 0.5, barrelLength * 1.05,
                    multishotBarrelMat, `multi${i}`
                );
                animationElements.multishotBarrels.push(multiBarrel);
            }
            
            const connector = CannonDetailsGenerator.createMultishotConnector(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.9, barrelWidth * 0.9, barrelWidth * 0.7,
                barrel.material as StandardMaterial, ""
            );
            animationElements.multishotConnector = connector;
            
            // Стабилизаторы мульти-выстрела - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        (i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.25,
                        0,
                        barrelLength * 0.15
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                    barrel.material as StandardMaterial, `multishotStabilizer${i}`
                );
            }
            break;
            
        // === ADVANCED WEAPONS ===
        case "homing":
            // Homing - УЛУЧШЕННЫЙ РЕАЛИСТИЧНЫЙ ДИЗАЙН: ПТУР с детализированной системой наведения
            // Основной ствол - более реалистичная форма
            barrel = MeshBuilder.CreateBox("barrel", { 
                width: barrelWidth * 1.4,
                height: barrelWidth * 1.4,
                depth: barrelLength * 1.1
            }, scene);
            
            const homingBarrelMat = new StandardMaterial("homingBarrelMat", scene);
            homingBarrelMat.diffuseColor = cannonColor.scale(0.8);
            homingBarrelMat.specularColor = Color3.Black();
            barrel.material = homingBarrelMat;
            
            const homingGuidanceMat = new StandardMaterial("homingGuidanceMat", scene);
            homingGuidanceMat.diffuseColor = new Color3(0.08, 0.8, 0.08);
            homingGuidanceMat.emissiveColor = new Color3(0.03, 0.35, 0.03);
            
            const homingGuidance = CannonDetailsGenerator.createHomingGuidance(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.55, -barrelLength * 0.2),
                barrelWidth * 0.75, barrelWidth * 0.55, barrelWidth * 0.75,
                homingGuidanceMat, ""
            );
            animationElements.homingGuidance = homingGuidance;
            
            CannonDetailsGenerator.createHomingControl(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.85, -barrelLength * 0.2),
                barrelWidth * 0.5, barrelWidth * 0.3, barrelWidth * 0.5,
                homingGuidanceMat, ""
            );
            
            animationElements.homingAntennas = [];
            for (let i = 0; i < 2; i++) {
                const antenna = CannonDetailsGenerator.createHomingAntenna(
                    scene, barrel,
                    new Vector3(
                        (i === 0 ? -1 : 1) * barrelWidth * 0.45,
                        barrelWidth * 0.75,
                        -barrelLength * 0.15
                    ),
                    barrelWidth * 0.08, barrelWidth * 0.35, barrelWidth * 0.08,
                    homingGuidanceMat, `homingAntenna${i}`
                );
                animationElements.homingAntennas.push(antenna);
            }
            
            // Стабилизаторы самонаведения - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        (i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.55,
                        0,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                    homingGuidanceMat, `homingStabilizer${i}`
                );
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
                const tipPart = CannonDetailsGenerator.createPiercingTip(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.7),
                    j, barrelWidth * 0.3, barrelWidth * 0.05,
                    barrelLength * 0.075,
                    (j % 2 === 0 ? 1 : -1) * Math.PI / 8,
                    piercingTipMat, ""
                );
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
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    barrel.material as StandardMaterial, `piercingRing${i}`
                );
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
            for (let i = 0; i < 10; i++) {
                const plateAngle = (i * Math.PI * 2) / 10;
                const plateZ = -barrelLength * 0.2 + (i % 5) * barrelLength * 0.4;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(plateAngle) * barrelWidth * 0.38,
                        Math.sin(plateAngle) * barrelWidth * 0.38,
                        plateZ
                    ),
                    plateAngle,
                    barrelWidth * 0.1, barrelWidth * 0.07, barrelWidth * 0.1,
                    barrel.material as StandardMaterial, `piercingPlate${i}`
                );
            }
            
            // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 8; i++) {
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.15 + (i % 4) * barrelLength * 0.5;
                CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(finAngle) * barrelWidth * 0.36,
                        Math.sin(finAngle) * barrelWidth * 0.36,
                        finZ
                    ),
                    finAngle,
                    barrelWidth * 0.13, barrelWidth * 0.09, barrelWidth * 0.04,
                    barrel.material as StandardMaterial, `piercingFin${i}`
                );
            }
            
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * 0.75;
                const ringThickness = barrelWidth * 0.06;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.2;
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    barrel.material as StandardMaterial, `piercingStabilizer${i}`
                );
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
                const ampPart = CannonDetailsGenerator.createShockwaveAmplifier(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.45),
                    j, barrelWidth * 2.2, barrelWidth * 0.1,
                    barrelWidth * 0.2,
                    shockwaveAmpMat, ""
                );
                if (j === 0) {
                    animationElements.shockwaveAmp = ampPart;
                }
            }
            
            // УБРАНЫ длинные вертикальные эмиттеры - заменены на короткие горизонтальные детали
            animationElements.shockwaveEmitters = [];
            for (let i = 0; i < 6; i++) {
                const angle = (i * Math.PI * 2) / 6;
                const emitter = CannonDetailsGenerator.createShockwaveEmitter(
                    scene, barrel,
                    new Vector3(
                        Math.cos(angle) * barrelWidth * 0.85,
                        Math.sin(angle) * barrelWidth * 0.85,
                        barrelLength * 0.1 + (i % 3) * barrelWidth * 0.15
                    ),
                    angle,
                    barrelWidth * 0.15, barrelWidth * 0.15, barrelWidth * 0.3,
                    shockwaveAmpMat, `shockwaveEmitter${i}`
                );
                animationElements.shockwaveEmitters.push(emitter);
            }
            
            const shockGenLayers = CannonDetailsGenerator.createGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 0.8, 2, barrelWidth * 0.1,
                shockwaveAmpMat, "shockwaveGen"
            );
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
                const focuserPart = CannonDetailsGenerator.createBeamFocuser(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.65),
                    j, barrelWidth * 0.9, barrelWidth * 0.05,
                    barrelWidth * 0.125,
                    beamFocuserMat, ""
                );
                if (j === 0) {
                    animationElements.beamFocuser = focuserPart;
                }
            }
            
            animationElements.beamLenses = [];
            for (let i = 0; i < 3; i++) {
                const lens = CannonDetailsGenerator.createBeamLens(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.25 + i * barrelLength * 0.15),
                    barrelWidth * 0.85, barrelWidth * 0.2, barrelWidth * 0.85,
                    beamFocuserMat, `beamLens${i}`
                );
                animationElements.beamLenses.push(lens);
            }
            
            // Короткие детали вокруг ствола вместо вертикальных каналов
            // Кольца вокруг ствола (5 штук)
            for (let i = 0; i < 5; i++) {
                const ringZ = -barrelLength * 0.2 + i * barrelLength * 0.35;
                const ringSize = barrelWidth * 1.05;
                const ringThickness = barrelWidth * 0.06;
                CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    beamFocuserMat, `beamRing${i}`
                );
            }
            
            // Маленькие пластины/ребра жесткости вокруг ствола (10 штук)
            for (let i = 0; i < 10; i++) {
                const plateAngle = (i * Math.PI * 2) / 10;
                const plateZ = -barrelLength * 0.15 + (i % 5) * barrelLength * 0.3;
                CannonDetailsGenerator.createPlate(
                    scene, barrel,
                    new Vector3(
                        Math.cos(plateAngle) * barrelWidth * 0.5,
                        Math.sin(plateAngle) * barrelWidth * 0.5,
                        plateZ
                    ),
                    plateAngle,
                    barrelWidth * 0.12, barrelWidth * 0.08, barrelWidth * 0.12,
                    beamFocuserMat, `beamPlate${i}`
                );
            }
            
            // Ребра охлаждения (8 штук, короткие, перпендикулярно стволу)
            for (let i = 0; i < 8; i++) {
                const finAngle = (i * Math.PI * 2) / 8;
                const finZ = -barrelLength * 0.1 + (i % 4) * barrelLength * 0.4;
                CannonDetailsGenerator.createCoolingFin(
                    scene, barrel,
                    new Vector3(
                        Math.cos(finAngle) * barrelWidth * 0.48,
                        Math.sin(finAngle) * barrelWidth * 0.48,
                        finZ
                    ),
                    finAngle,
                    barrelWidth * 0.15, barrelWidth * 0.1, barrelWidth * 0.05,
                    beamFocuserMat, `beamFin${i}`
                );
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
            const vortexRingMat = new StandardMaterial("vortexRingMat", scene);
            vortexRingMat.diffuseColor = new Color3(0.4, 0.15, 0.7);
            vortexRingMat.emissiveColor = new Color3(0.15, 0.08, 0.3);
            for (let i = 0; i < 5; i++) {
                const ringSize = barrelWidth * (1.2 + i * 0.15);
                const ringThickness = barrelWidth * 0.12;
                const ringZ = -barrelLength * 0.25 + i * barrelLength * 0.15;
                const ringParts = CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    vortexRingMat, `vortexRing${i}`
                );
                animationElements.vortexRings.push(...ringParts);
            }
            
            const vortexGenMat = new StandardMaterial("vortexGenMat", scene);
            vortexGenMat.diffuseColor = new Color3(0.5, 0.25, 0.9);
            vortexGenMat.emissiveColor = new Color3(0.25, 0.12, 0.4);
            vortexGenMat.disableLighting = true;
            const vortexGenLayers = CannonDetailsGenerator.createGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 0.7, 3, barrelWidth * 0.05,
                vortexGenMat, "vortexGen"
            );
            animationElements.vortexGen = vortexGenLayers[0];
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
                const emitterPart = CannonDetailsGenerator.createSupportEmitter(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    j, barrelWidth * 0.9, barrelWidth * 0.05,
                    barrelWidth * 0.15,
                    supportEmitterMat, ""
                );
                if (j === 0) {
                    animationElements.supportEmitter = emitterPart;
                }
            }
            
            animationElements.supportHealingRings = [];
            for (let i = 0; i < 3; i++) {
                const ringSize = barrelWidth * (0.9 + i * 0.15);
                const ringThickness = barrelWidth * 0.1;
                const ringZ = -barrelLength * 0.15 + i * barrelLength * 0.15;
                const ringParts = CannonDetailsGenerator.createRing(
                    scene, barrel,
                    new Vector3(0, 0, ringZ),
                    ringSize, ringThickness,
                    supportEmitterMat, `supportRing${i}`
                );
                animationElements.supportHealingRings.push(...ringParts);
            }
            
            const repairGenLayers = CannonDetailsGenerator.createGenerator(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.35),
                barrelWidth * 0.6, 2, barrelWidth * 0.05,
                supportEmitterMat, "repairGen"
            );
            animationElements.repairGen = repairGenLayers[0];
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
            CannonDetailsGenerator.createBreech(
                scene, barrel,
                new Vector3(0, 0, -barrelLength * 0.4),
                barrelWidth * 1.4, barrelWidth * 1.4, barrelWidth * 0.3,
                cannonColor.scale(0.7),
                "standard"
            );
            
            // Дульный тормоз - 2 слоя прямоугольных коробок
            for (let i = 0; i < 2; i++) {
                CannonDetailsGenerator.createStandardMuzzle(
                    scene, barrel,
                    new Vector3(0, 0, barrelLength * 0.5),
                    i, barrelWidth * 1.1, barrelWidth * 0.1,
                    barrelWidth * 0.15,
                    standardBreechMat, ""
                );
            }
            
            // Защитный кожух ствола
            CannonDetailsGenerator.createStandardShield(
                scene, barrel,
                new Vector3(0, barrelWidth * 0.4, barrelLength * 0.1),
                barrelWidth * 1.1, barrelWidth * 0.3, barrelLength * 0.6,
                standardBreechMat, ""
            );
            
            // Стабилизаторы - 2 тонких Box по бокам
            // Стабилизаторы стандартной пушки - короткие детали вместо длинных вертикальных
            for (let i = 0; i < 4; i++) {
                CannonDetailsGenerator.createStabilizer(
                    scene, barrel,
                    new Vector3(
                        (i === 0 || i === 2 ? -1 : 1) * barrelWidth * 0.5,
                        0,
                        barrelLength * 0.1
                    ),
                    barrelWidth * 0.12, barrelWidth * 0.12, barrelWidth * 0.25,
                    standardBreechMat, `standardStabilizer${i}`
                );
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
