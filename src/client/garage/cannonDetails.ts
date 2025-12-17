/**
 * Cannon Details Generator for Garage 3D Preview
 * Функции для создания различных деталей пушек
 */

import { Mesh, Scene, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
import { addZFightingOffset } from "../tank/zFightingFix";
import { MaterialFactory } from "./materials";

export class CannonDetailsGenerator {
    /**
     * Создает прицел (scope) для sniper
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция прицела
     * @param height Высота прицела
     * @param diameter Диаметр прицела
     * @param prefix Префикс для имени меша
     * @returns Созданный меш прицела
     */
    static createScope(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const scope = MeshBuilder.CreateBox(`${prefix}Scope`, { width: diameter, height: height, depth: diameter }, scene);
        scope.position = addZFightingOffset(position, "up");
        scope.parent = barrel;
        scope.material = MaterialFactory.createScopeMaterial(scene, prefix);
        return scope;
    }

    /**
     * Создает сошку (bipod) для sniper
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция сошки
     * @param width Ширина сошки
     * @param height Высота сошки
     * @param depth Глубина сошки
     * @param material Материал сошки
     * @param prefix Префикс для имени меша
     * @returns Созданный меш сошки
     */
    static createBipod(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const bipod = MeshBuilder.CreateBox(`${prefix}Bipod`, { width, height, depth }, scene);
        bipod.position = addZFightingOffset(position, "down");
        bipod.parent = barrel;
        bipod.material = material;
        return bipod;
    }

    /**
     * Создает стабилизатор для ствола
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция стабилизатора
     * @param width Ширина стабилизатора
     * @param height Высота стабилизатора
     * @param depth Глубина стабилизатора
     * @param material Материал стабилизатора
     * @param prefix Префикс для имени меша
     * @returns Созданный меш стабилизатора
     */
    static createStabilizer(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const stabilizer = MeshBuilder.CreateBox(`${prefix}Stabilizer`, { width, height, depth }, scene);
        stabilizer.position = addZFightingOffset(position, "forward");
        stabilizer.parent = barrel;
        stabilizer.material = material;
        return stabilizer;
    }

    /**
     * Создает мини-ствол для gatling (один из множества)
     */
    static createMiniBarrel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const miniBarrel = MeshBuilder.CreateBox(`${prefix}MiniBarrel`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        miniBarrel.position = addZFightingOffset(position, "up");
        miniBarrel.parent = barrel;
        const mat = new StandardMaterial(`${prefix}MiniBarrelMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.8);
        miniBarrel.material = mat;
        return miniBarrel;
    }

    /**
     * Создает кольцо охлаждения для gatling
     */
    static createCoolingRing(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const ring = MeshBuilder.CreateBox(`${prefix}CoolingRing`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        ring.position = position;
        ring.parent = barrel;
        const mat = new StandardMaterial(`${prefix}CoolingRingMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.6);
        mat.emissiveColor = new Color3(0.05, 0.05, 0.05);
        ring.material = mat;
        return ring;
    }

    /**
     * Создает казенник (breech)
     */
    static createBreech(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const breech = MeshBuilder.CreateBox(`${prefix}Breech`, { width, height, depth }, scene);
        breech.position = addZFightingOffset(position, "forward");
        breech.parent = barrel;
        const mat = new StandardMaterial(`${prefix}BreechMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.55);
        breech.material = mat;
        return breech;
    }

    /**
     * Создает дульный тормоз
     */
    static createMuzzleBrake(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const muzzleBrake = MeshBuilder.CreateBox(`${prefix}MuzzleBrake`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        muzzleBrake.position = position;
        muzzleBrake.parent = barrel;
        const mat = new StandardMaterial(`${prefix}BreechMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.55);
        muzzleBrake.material = mat;
        return muzzleBrake;
    }

    /**
     * Создает плазменный ядро (core) для plasma
     */
    static createPlasmaCore(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const core = MeshBuilder.CreateBox(`${prefix}PlasmaCore`, {
            width: diameter,
            height: diameter,
            depth: diameter
        }, scene);
        core.position = position;
        core.parent = barrel;
        const mat = new StandardMaterial(`${prefix}PlasmaCoreMat`, scene);
        mat.diffuseColor = new Color3(1, 0, 1);
        mat.emissiveColor = new Color3(0.8, 0, 0.8);
        mat.disableLighting = true;
        core.material = mat;
        return core;
    }

    /**
     * Создает плазменную катушку (torus)
     */
    static createPlasmaCoil(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        prefix: string = "preview"
    ): Mesh {
        const coil = MeshBuilder.CreateBox(`${prefix}PlasmaCoil`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        coil.position = position;
        coil.parent = barrel;
        const mat = new StandardMaterial(`${prefix}PlasmaCoilMat`, scene);
        mat.diffuseColor = new Color3(0.8, 0, 0.8);
        mat.emissiveColor = new Color3(0.5, 0, 0.5);
        coil.material = mat;
        return coil;
    }

    /**
     * Создает плазменный стабилизатор
     */
    static createPlasmaStabilizer(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const stabilizer = MeshBuilder.CreateBox(`${prefix}PlasmaStabilizer`, {
            width,
            height,
            depth
        }, scene);
        stabilizer.position = position;
        stabilizer.parent = barrel;
        const mat = new StandardMaterial(`${prefix}PlasmaCoreMat`, scene);
        mat.diffuseColor = new Color3(1, 0, 1);
        mat.emissiveColor = new Color3(0.8, 0, 0.8);
        mat.disableLighting = true;
        stabilizer.material = mat;
        return stabilizer;
    }

    /**
     * Создает плазменный эмиттер
     */
    static createPlasmaEmitter(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const emitter = MeshBuilder.CreateBox(`${prefix}PlasmaEmitter`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        emitter.position = position;
        emitter.parent = barrel;
        const mat = new StandardMaterial(`${prefix}PlasmaCoreMat`, scene);
        mat.diffuseColor = new Color3(1, 0, 1);
        mat.emissiveColor = new Color3(0.8, 0, 0.8);
        mat.disableLighting = true;
        emitter.material = mat;
        return emitter;
    }

    /**
     * Создает линзу для laser
     */
    static createLens(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const lens = MeshBuilder.CreateBox(`${prefix}Lens`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        lens.position = position;
        lens.parent = barrel;
        const mat = new StandardMaterial(`${prefix}LensMat`, scene);
        mat.diffuseColor = new Color3(1, 0.2, 0);
        mat.emissiveColor = new Color3(0.6, 0, 0);
        mat.disableLighting = true;
        lens.material = mat;
        return lens;
    }

    /**
     * Создает фокусирующее кольцо для laser
     */
    static createFocusRing(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        prefix: string = "preview"
    ): Mesh {
        const ring = MeshBuilder.CreateBox(`${prefix}FocusRing`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        ring.position = position;
        ring.parent = barrel;
        const mat = new StandardMaterial(`${prefix}FocusRingMat`, scene);
        mat.diffuseColor = new Color3(0.8, 0, 0);
        mat.emissiveColor = new Color3(0.3, 0, 0);
        ring.material = mat;
        return ring;
    }

    /**
     * Создает канал для laser
     */
    static createLaserChannel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const channel = MeshBuilder.CreateBox(`${prefix}LaserChannel`, {
            width,
            height,
            depth
        }, scene);
        channel.position = position;
        channel.parent = barrel;
        const mat = new StandardMaterial(`${prefix}LensMat`, scene);
        mat.diffuseColor = new Color3(1, 0.2, 0);
        mat.emissiveColor = new Color3(0.6, 0, 0);
        mat.disableLighting = true;
        channel.material = mat;
        return channel;
    }

    /**
     * Создает корпус для laser
     */
    static createLaserHousing(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const housing = MeshBuilder.CreateBox(`${prefix}LaserHousing`, {
            width,
            height,
            depth
        }, scene);
        housing.position = position;
        housing.parent = barrel;
        const mat = new StandardMaterial(`${prefix}LaserHousingMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.6);
        housing.material = mat;
        return housing;
    }

    /**
     * Создает рельс для railgun
     */
    static createRail(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const rail = MeshBuilder.CreateBox(`${prefix}Rail`, { width, height, depth }, scene);
        rail.position = position;
        rail.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RailMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.4, 1);
        mat.emissiveColor = new Color3(0.1, 0.2, 0.6);
        rail.material = mat;
        return rail;
    }

    /**
     * Создает конденсатор для railgun
     */
    static createCapacitor(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const capacitor = MeshBuilder.CreateBox(`${prefix}Capacitor`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        capacitor.position = position;
        capacitor.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RailMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.4, 1);
        mat.emissiveColor = new Color3(0.1, 0.2, 0.6);
        capacitor.material = mat;
        return capacitor;
    }

    /**
     * Создает канал рельсы для railgun
     */
    static createRailChannel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const channel = MeshBuilder.CreateBox(`${prefix}RailChannel`, {
            width,
            height,
            depth
        }, scene);
        channel.position = position;
        channel.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RailMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.4, 1);
        mat.emissiveColor = new Color3(0.1, 0.2, 0.6);
        channel.material = mat;
        return channel;
    }

    /**
     * Создает усилитель дульного среза для railgun
     */
    static createMuzzleAmplifier(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const amp = MeshBuilder.CreateBox(`${prefix}RailgunMuzzleAmp`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        amp.position = position;
        amp.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RailMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.4, 1);
        mat.emissiveColor = new Color3(0.1, 0.2, 0.6);
        amp.material = mat;
        return amp;
    }

    /**
     * Создает тесла катушку
     */
    static createTeslaCoil(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        prefix: string = "preview"
    ): Mesh {
        const coil = MeshBuilder.CreateBox(`${prefix}TeslaCoil`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        coil.position = position;
        coil.parent = barrel;
        const mat = new StandardMaterial(`${prefix}TeslaCoilMat`, scene);
        mat.diffuseColor = new Color3(0, 0.8, 1);
        mat.emissiveColor = new Color3(0, 0.5, 0.7);
        coil.material = mat;
        return coil;
    }

    /**
     * Создает разрядник для tesla
     */
    static createTeslaDischarger(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const discharger = MeshBuilder.CreateBox(`${prefix}TeslaDischarger`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        discharger.position = position;
        discharger.parent = barrel;
        discharger.material = material;
        return discharger;
    }

    /**
     * Создает генератор для tesla
     */
    static createTeslaGenerator(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const generator = MeshBuilder.CreateBox(`${prefix}TeslaGen`, {
            width: diameter,
            height: diameter,
            depth: diameter
        }, scene);
        generator.position = position;
        generator.parent = barrel;
        const mat = new StandardMaterial(`${prefix}TeslaGenMat`, scene);
        mat.diffuseColor = new Color3(0, 1, 1);
        mat.emissiveColor = new Color3(0, 0.7, 0.9);
        mat.disableLighting = true;
        generator.material = mat;
        return generator;
    }

    /**
     * Создает направляющую для rocket
     */
    static createGuide(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const guide = MeshBuilder.CreateBox(`${prefix}Guide`, { width, height, depth }, scene);
        guide.position = position;
        guide.parent = barrel;
        guide.material = material;
        return guide;
    }

    /**
     * Создает стабилизатор для rocket
     */
    static createRocketFin(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const fin = MeshBuilder.CreateBox(`${prefix}RocketFin`, { width, height, depth }, scene);
        fin.position = position;
        fin.parent = barrel;
        fin.material = material;
        return fin;
    }

    /**
     * Создает систему наведения для rocket
     */
    static createRocketGuidance(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const guidance = MeshBuilder.CreateBox(`${prefix}RocketGuidance`, {
            width,
            height,
            depth
        }, scene);
        guidance.position = position;
        guidance.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RocketGuidanceMat`, scene);
        mat.diffuseColor = new Color3(0.2, 0.8, 0.2);
        mat.emissiveColor = new Color3(0.1, 0.4, 0.1);
        guidance.material = mat;
        return guidance;
    }

    /**
     * Создает трубку для rocket
     */
    static createRocketTube(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const tube = MeshBuilder.CreateBox(`${prefix}Tube`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        tube.position = position;
        tube.parent = barrel;
        const mat = new StandardMaterial(`${prefix}RocketTubeMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.8);
        tube.material = mat;
        return tube;
    }

    /**
     * Создает ствол для shotgun (один из множества)
     */
    static createPelletBarrel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        cannonColor: Color3,
        prefix: string = "preview"
    ): Mesh {
        const pelletBarrel = MeshBuilder.CreateBox(`${prefix}PelletBarrel`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        pelletBarrel.position = position;
        pelletBarrel.parent = barrel;
        const mat = new StandardMaterial(`${prefix}ShotgunBarrelMat`, scene);
        mat.diffuseColor = cannonColor.scale(0.9);
        pelletBarrel.material = mat;
        return pelletBarrel;
    }

    /**
     * Создает центральный ствол для shotgun
     */
    static createCenterBarrel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const centerBarrel = MeshBuilder.CreateBox(`${prefix}ShotgunCenter`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        centerBarrel.position = position;
        centerBarrel.parent = barrel;
        centerBarrel.material = material;
        return centerBarrel;
    }

    /**
     * Создает усиление для shotgun
     */
    static createShotgunReinforcement(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const reinforcement = MeshBuilder.CreateBox(`${prefix}ShotgunReinforcement`, {
            width,
            height,
            depth
        }, scene);
        reinforcement.position = position;
        reinforcement.parent = barrel;
        reinforcement.material = material;
        return reinforcement;
    }

    // ============ УНИВЕРСАЛЬНЫЕ МЕТОДЫ (Foundation Layer) ============

    /**
     * Создает универсальное кольцо из 4 частей (top, bottom, left, right)
     * Используется для laser, railgun, emp, piercing, beam, vortex, support
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция центра кольца
     * @param ringSize Размер кольца (диаметр)
     * @param ringThickness Толщина кольца
     * @param material Материал кольца
     * @param prefix Префикс для имени меша
     * @returns Массив из 4 мешей: [top, bottom, left, right]
     * @example
     * const rings = CannonDetailsGenerator.createRing(scene, barrel, position, 1.0, 0.1, mat, "preview");
     */
    static createRing(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        ringSize: number,
        ringThickness: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh[] {
        const ringParts: Mesh[] = [];
        
        // Top part
        const top = MeshBuilder.CreateBox(`${prefix}RingTop`, {
            width: ringSize,
            height: ringThickness,
            depth: ringThickness
        }, scene);
        top.position = addZFightingOffset(new Vector3(position.x, position.y + ringSize / 2, position.z), "forward");
        top.parent = barrel;
        top.material = material;
        ringParts.push(top);
        
        // Bottom part
        const bottom = MeshBuilder.CreateBox(`${prefix}RingBottom`, {
            width: ringSize,
            height: ringThickness,
            depth: ringThickness
        }, scene);
        bottom.position = addZFightingOffset(new Vector3(position.x, position.y - ringSize / 2, position.z), "forward");
        bottom.parent = barrel;
        bottom.material = material;
        ringParts.push(bottom);
        
        // Left part
        const left = MeshBuilder.CreateBox(`${prefix}RingLeft`, {
            width: ringThickness,
            height: ringSize,
            depth: ringThickness
        }, scene);
        left.position = addZFightingOffset(new Vector3(position.x - ringSize / 2, position.y, position.z), "forward");
        left.parent = barrel;
        left.material = material;
        ringParts.push(left);
        
        // Right part
        const right = MeshBuilder.CreateBox(`${prefix}RingRight`, {
            width: ringThickness,
            height: ringSize,
            depth: ringThickness
        }, scene);
        right.position = addZFightingOffset(new Vector3(position.x + ringSize / 2, position.y, position.z), "forward");
        right.parent = barrel;
        right.material = material;
        ringParts.push(right);
        
        return ringParts;
    }

    /**
     * Создает пластину/ребро жесткости под углом
     * Используется для railgun, piercing, beam
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция пластины
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина пластины
     * @param height Высота пластины
     * @param depth Глубина пластины
     * @param material Материал пластины
     * @param prefix Префикс для имени меша
     * @returns Созданный меш пластины
     * @example
     * const plate = CannonDetailsGenerator.createPlate(scene, barrel, pos, Math.PI / 4, 0.1, 0.08, 0.1, mat, "preview");
     */
    static createPlate(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const plate = MeshBuilder.CreateBox(`${prefix}Plate`, {
            width,
            height,
            depth
        }, scene);
        plate.position = addZFightingOffset(position, "up");
        plate.rotation.z = angle;
        plate.parent = barrel;
        plate.material = material;
        return plate;
    }

    /**
     * Создает ребро охлаждения перпендикулярно стволу
     * Используется для railgun, piercing, beam, freeze
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция ребра
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина ребра
     * @param height Высота ребра
     * @param depth Глубина ребра
     * @param material Материал ребра
     * @param prefix Префикс для имени меша
     * @returns Созданный меш ребра
     * @example
     * const fin = CannonDetailsGenerator.createCoolingFin(scene, barrel, pos, Math.PI / 4, 0.14, 0.1, 0.05, mat, "preview");
     */
    static createCoolingFin(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const fin = MeshBuilder.CreateBox(`${prefix}CoolingFin`, {
            width,
            height,
            depth
        }, scene);
        fin.position = addZFightingOffset(position, "up");
        fin.rotation.z = angle;
        fin.parent = barrel;
        fin.material = material;
        return fin;
    }

    /**
     * Создает слоистый генератор из нескольких слоев с уменьшением размера
     * Используется для emp, shockwave, vortex, support
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Базовая позиция генератора
     * @param baseSize Базовый размер первого слоя
     * @param layerCount Количество слоев
     * @param sizeReduction Уменьшение размера на каждый слой
     * @param material Материал генератора
     * @param prefix Префикс для имени меша
     * @returns Массив созданных слоев генератора
     * @example
     * const layers = CannonDetailsGenerator.createGenerator(scene, barrel, pos, 0.7, 3, 0.05, mat, "preview");
     */
    static createGenerator(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        baseSize: number,
        layerCount: number,
        sizeReduction: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh[] {
        const layers: Mesh[] = [];
        
        for (let i = 0; i < layerCount; i++) {
            const size = baseSize - i * sizeReduction;
            const layer = MeshBuilder.CreateBox(`${prefix}Gen${i}`, {
                width: size,
                height: size,
                depth: size
            }, scene);
            // Позиция каждого слоя смещается назад (в отрицательном направлении Z)
            layer.position = addZFightingOffset(
                new Vector3(position.x, position.y, position.z - i * baseSize * 0.1),
                "forward"
            );
            layer.parent = barrel;
            layer.material = material;
            layers.push(layer);
        }
        
        return layers;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ SNIPER ============

    /**
     * Создает утолщение у основания ствола для sniper
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция утолщения
     * @param width Ширина утолщения
     * @param height Высота утолщения
     * @param depth Глубина утолщения
     * @param material Материал утолщения
     * @param prefix Префикс для имени меша
     * @returns Созданный меш утолщения
     */
    static createBaseThickening(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const thickening = MeshBuilder.CreateBox(`${prefix}BaseThickening`, {
            width,
            height,
            depth
        }, scene);
        thickening.position = addZFightingOffset(position, "forward");
        thickening.parent = barrel;
        thickening.material = material;
        return thickening;
    }

    /**
     * Создает глушитель на конце ствола для sniper
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция глушителя
     * @param width Ширина глушителя
     * @param height Высота глушителя
     * @param depth Глубина глушителя
     * @param material Материал глушителя
     * @param prefix Префикс для имени меша
     * @returns Созданный меш глушителя
     */
    static createSuppressor(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const suppressor = MeshBuilder.CreateBox(`${prefix}Suppressor`, {
            width,
            height,
            depth
        }, scene);
        suppressor.position = addZFightingOffset(position, "forward");
        suppressor.parent = barrel;
        suppressor.material = material;
        return suppressor;
    }

    /**
     * Создает вентиляционное отверстие глушителя для sniper
     * Используется в цикле для создания нескольких отверстий
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция отверстия
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина отверстия
     * @param height Высота отверстия
     * @param depth Глубина отверстия
     * @param material Материал отверстия
     * @param prefix Префикс для имени меша
     * @returns Созданный меш отверстия
     */
    static createSuppressorVent(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}SuppressorVent`, {
            width,
            height,
            depth
        }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = barrel;
        vent.material = material;
        return vent;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ MORTAR ============

    /**
     * Создает слой основания миномета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция слоя
     * @param layerIndex Индекс слоя (0, 1, 2...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param material Материал слоя
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя
     */
    static createMortarBaseLayer(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const layerHeight = baseSize * 0.083; // Высота примерно 1/12 от базового размера
        const layer = MeshBuilder.CreateBox(`${prefix}MortarBase${layerIndex}`, {
            width: size,
            height: layerHeight,
            depth: size
        }, scene);
        layer.position = addZFightingOffset(
            new Vector3(position.x, position.y - layerIndex * layerHeight, position.z),
            "up"
        );
        layer.parent = barrel;
        layer.material = material;
        return layer;
    }

    /**
     * Создает ножку миномета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция ножки
     * @param angle Угол поворота ножки (радианы)
     * @param width Ширина ножки
     * @param height Высота ножки
     * @param depth Глубина ножки
     * @param material Материал ножки
     * @param prefix Префикс для имени меша
     * @returns Созданный меш ножки
     */
    static createMortarLeg(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const leg = MeshBuilder.CreateBox(`${prefix}MortarLeg`, {
            width,
            height,
            depth
        }, scene);
        leg.position = addZFightingOffset(position, "up");
        leg.rotation.y = angle;
        leg.parent = barrel;
        leg.material = material;
        return leg;
    }

    /**
     * Создает усиление миномета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция усиления
     * @param side Сторона (-1 или 1)
     * @param zOffset Смещение по Z
     * @param width Ширина усиления
     * @param height Высота усиления
     * @param depth Глубина усиления
     * @param material Материал усиления
     * @param prefix Префикс для имени меша
     * @returns Созданный меш усиления
     */
    static createMortarReinforcement(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        zOffset: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const reinforcement = MeshBuilder.CreateBox(`${prefix}MortarReinforcement`, {
            width,
            height,
            depth
        }, scene);
        reinforcement.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z + zOffset),
            "forward"
        );
        reinforcement.parent = barrel;
        reinforcement.material = material;
        return reinforcement;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ CLUSTER ============

    /**
     * Создает трубку кластера
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция трубки
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина трубки
     * @param height Высота трубки
     * @param depth Глубина трубки
     * @param material Материал трубки
     * @param prefix Префикс для имени меша
     * @returns Созданный меш трубки
     */
    static createClusterTube(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tube = MeshBuilder.CreateBox(`${prefix}ClusterTube`, {
            width,
            height,
            depth
        }, scene);
        const offsetPos = new Vector3(
            position.x + Math.cos(angle) * position.x,
            position.y + Math.sin(angle) * position.y,
            position.z
        );
        tube.position = addZFightingOffset(offsetPos, "up");
        tube.parent = barrel;
        tube.material = material;
        return tube;
    }

    /**
     * Создает центральную трубку кластера
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция центральной трубки
     * @param width Ширина трубки
     * @param height Высота трубки
     * @param depth Глубина трубки
     * @param material Материал трубки
     * @param prefix Префикс для имени меша
     * @returns Созданный меш центральной трубки
     */
    static createClusterCenterTube(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const centerTube = MeshBuilder.CreateBox(`${prefix}ClusterCenter`, {
            width,
            height,
            depth
        }, scene);
        centerTube.position = addZFightingOffset(position, "forward");
        centerTube.parent = barrel;
        centerTube.material = material;
        return centerTube;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ EXPLOSIVE ============

    /**
     * Создает дульный срез взрывной пушки
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция дульного среза
     * @param width Ширина среза
     * @param height Высота среза
     * @param depth Глубина среза
     * @param material Материал среза
     * @param prefix Префикс для имени меша
     * @returns Созданный меш дульного среза
     */
    static createExplosiveMuzzle(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const muzzle = MeshBuilder.CreateBox(`${prefix}ExplosiveMuzzle`, {
            width,
            height,
            depth
        }, scene);
        muzzle.position = addZFightingOffset(position, "forward");
        muzzle.parent = barrel;
        muzzle.material = material;
        return muzzle;
    }

    /**
     * Создает канал взрывной пушки
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция канала
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина канала
     * @param height Высота канала
     * @param depth Глубина канала
     * @param material Материал канала
     * @param prefix Префикс для имени меша
     * @returns Созданный меш канала
     */
    static createExplosiveChannel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const channel = MeshBuilder.CreateBox(`${prefix}ExplosiveChannel`, {
            width,
            height,
            depth
        }, scene);
        const offsetPos = new Vector3(
            position.x + Math.cos(angle) * position.x,
            position.y + Math.sin(angle) * position.y,
            position.z
        );
        channel.position = addZFightingOffset(offsetPos, "up");
        channel.parent = barrel;
        channel.material = material;
        return channel;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ FLAMETHROWER ============

    /**
     * Создает сопло огнемета (слоистое)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция сопла
     * @param layerIndex Индекс слоя (0, 1, 2, 3...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param depth Глубина каждого слоя
     * @param material Материал сопла
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя сопла
     */
    static createFlamethrowerNozzle(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const nozzle = MeshBuilder.CreateBox(`${prefix}FlamethrowerNozzle${layerIndex}`, {
            width: size,
            height: size,
            depth: depth
        }, scene);
        nozzle.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * depth),
            "forward"
        );
        nozzle.parent = barrel;
        nozzle.material = material;
        return nozzle;
    }

    /**
     * Создает бак огнемета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция бака
     * @param side Сторона (-1 или 1)
     * @param width Ширина бака
     * @param height Высота бака
     * @param depth Глубина бака
     * @param material Материал бака
     * @param prefix Префикс для имени меша
     * @returns Созданный меш бака
     */
    static createFlamethrowerTank(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tank = MeshBuilder.CreateBox(`${prefix}FlamethrowerTank`, {
            width,
            height,
            depth
        }, scene);
        tank.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z),
            "forward"
        );
        tank.parent = barrel;
        tank.material = material;
        return tank;
    }

    /**
     * Создает вентиль бака огнемета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция вентиля
     * @param side Сторона (-1 или 1)
     * @param width Ширина вентиля
     * @param height Высота вентиля
     * @param depth Глубина вентиля
     * @param material Материал вентиля
     * @param prefix Префикс для имени меша
     * @returns Созданный меш вентиля
     */
    static createFlamethrowerVent(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}FlamethrowerVent`, {
            width,
            height,
            depth
        }, scene);
        vent.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z),
            "forward"
        );
        vent.parent = barrel;
        vent.material = material;
        return vent;
    }

    /**
     * Создает шланг огнемета
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция шланга
     * @param side Сторона (-1 или 1)
     * @param width Ширина шланга
     * @param height Высота шланга
     * @param depth Глубина шланга
     * @param rotation Поворот шланга (радианы)
     * @param material Материал шланга
     * @param prefix Префикс для имени меша
     * @returns Созданный меш шланга
     */
    static createFlamethrowerHose(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        width: number,
        height: number,
        depth: number,
        rotation: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const hose = MeshBuilder.CreateBox(`${prefix}FlamethrowerHose`, {
            width,
            height,
            depth
        }, scene);
        hose.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z),
            "forward"
        );
        hose.rotation.z = rotation;
        hose.parent = barrel;
        hose.material = material;
        return hose;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ ACID ============

    /**
     * Создает бак кислоты
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция бака
     * @param width Ширина бака
     * @param height Высота бака
     * @param depth Глубина бака
     * @param material Материал бака
     * @param prefix Префикс для имени меша
     * @returns Созданный меш бака
     */
    static createAcidTank(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tank = MeshBuilder.CreateBox(`${prefix}AcidTank`, {
            width,
            height,
            depth
        }, scene);
        tank.position = addZFightingOffset(position, "up");
        tank.parent = barrel;
        tank.material = material;
        return tank;
    }

    /**
     * Создает вентиль бака кислоты
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция вентиля
     * @param width Ширина вентиля
     * @param height Высота вентиля
     * @param depth Глубина вентиля
     * @param material Материал вентиля
     * @param prefix Префикс для имени меша
     * @returns Созданный меш вентиля
     */
    static createAcidVent(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}AcidVent`, {
            width,
            height,
            depth
        }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = barrel;
        vent.material = material;
        return vent;
    }

    /**
     * Создает индикатор бака кислоты
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция индикатора
     * @param width Ширина индикатора
     * @param height Высота индикатора
     * @param depth Глубина индикатора
     * @param material Материал индикатора
     * @param prefix Префикс для имени меша
     * @returns Созданный меш индикатора
     */
    static createAcidIndicator(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const indicator = MeshBuilder.CreateBox(`${prefix}AcidIndicator`, {
            width,
            height,
            depth
        }, scene);
        indicator.position = addZFightingOffset(position, "forward");
        indicator.parent = barrel;
        indicator.material = material;
        return indicator;
    }

    /**
     * Создает канал кислоты
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция канала
     * @param width Ширина канала
     * @param height Высота канала
     * @param depth Глубина канала
     * @param material Материал канала
     * @param prefix Префикс для имени меша
     * @returns Созданный меш канала
     */
    static createAcidChannel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const channel = MeshBuilder.CreateBox(`${prefix}AcidChannel`, {
            width,
            height,
            depth
        }, scene);
        channel.position = addZFightingOffset(position, "forward");
        channel.parent = barrel;
        channel.material = material;
        return channel;
    }

    /**
     * Создает распылитель кислоты (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция распылителя
     * @param layerIndex Индекс слоя (0, 1, 2...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал распылителя
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя распылителя
     */
    static createAcidSprayer(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const sprayer = MeshBuilder.CreateBox(`${prefix}AcidSprayer${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        sprayer.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * size * 0.1),
            "forward"
        );
        sprayer.parent = barrel;
        sprayer.material = material;
        return sprayer;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ FREEZE ============

    /**
     * Создает криогенный бак
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция бака
     * @param width Ширина бака
     * @param height Высота бака
     * @param depth Глубина бака
     * @param material Материал бака
     * @param prefix Префикс для имени меша
     * @returns Созданный меш бака
     */
    static createCryoTank(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tank = MeshBuilder.CreateBox(`${prefix}CryoTank`, {
            width,
            height,
            depth
        }, scene);
        tank.position = addZFightingOffset(position, "up");
        tank.parent = barrel;
        tank.material = material;
        return tank;
    }

    /**
     * Создает вентиль криогенного бака
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция вентиля
     * @param width Ширина вентиля
     * @param height Высота вентиля
     * @param depth Глубина вентиля
     * @param material Материал вентиля
     * @param prefix Префикс для имени меша
     * @returns Созданный меш вентиля
     */
    static createCryoVent(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}CryoVent`, {
            width,
            height,
            depth
        }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = barrel;
        vent.material = material;
        return vent;
    }

    /**
     * Создает эмиттер замораживателя (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция эмиттера
     * @param layerIndex Индекс слоя (0, 1, 2...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал эмиттера
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя эмиттера
     */
    static createFreezeEmitter(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const emitter = MeshBuilder.CreateBox(`${prefix}FreezeEmitter${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        emitter.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * height),
            "forward"
        );
        emitter.parent = barrel;
        emitter.material = material;
        return emitter;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ POISON ============

    /**
     * Создает бак яда
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция бака
     * @param width Ширина бака
     * @param height Высота бака
     * @param depth Глубина бака
     * @param material Материал бака
     * @param prefix Префикс для имени меша
     * @returns Созданный меш бака
     */
    static createPoisonTank(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tank = MeshBuilder.CreateBox(`${prefix}PoisonTank`, {
            width,
            height,
            depth
        }, scene);
        tank.position = addZFightingOffset(position, "forward");
        tank.parent = barrel;
        tank.material = material;
        return tank;
    }

    /**
     * Создает вентиль бака яда
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция вентиля
     * @param width Ширина вентиля
     * @param height Высота вентиля
     * @param depth Глубина вентиля
     * @param material Материал вентиля
     * @param prefix Префикс для имени меша
     * @returns Созданный меш вентиля
     */
    static createPoisonVent(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}PoisonVent`, {
            width,
            height,
            depth
        }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = barrel;
        vent.material = material;
        return vent;
    }

    /**
     * Создает инжектор яда (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция инжектора
     * @param layerIndex Индекс слоя (0, 1, 2...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал инжектора
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя инжектора
     */
    static createPoisonInjector(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const injector = MeshBuilder.CreateBox(`${prefix}PoisonInjector${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        injector.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * height),
            "forward"
        );
        injector.parent = barrel;
        injector.material = material;
        return injector;
    }

    /**
     * Создает иглу яда
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция иглы
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param width Ширина иглы
     * @param height Высота иглы
     * @param depth Глубина иглы
     * @param material Материал иглы
     * @param prefix Префикс для имени меша
     * @returns Созданный меш иглы
     */
    static createPoisonNeedle(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const needle = MeshBuilder.CreateBox(`${prefix}PoisonNeedle`, {
            width,
            height,
            depth
        }, scene);
        const offsetPos = new Vector3(
            position.x + Math.cos(angle) * position.x,
            position.y + Math.sin(angle) * position.y,
            position.z
        );
        needle.position = addZFightingOffset(offsetPos, "forward");
        needle.parent = barrel;
        needle.material = material;
        return needle;
    }

    /**
     * Создает канал яда
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция канала
     * @param side Сторона (-1 или 1)
     * @param zOffset Смещение по Z
     * @param width Ширина канала
     * @param height Высота канала
     * @param depth Глубина канала
     * @param material Материал канала
     * @param prefix Префикс для имени меша
     * @returns Созданный меш канала
     */
    static createPoisonChannel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        zOffset: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const channel = MeshBuilder.CreateBox(`${prefix}PoisonChannel`, {
            width,
            height,
            depth
        }, scene);
        channel.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z + zOffset),
            "forward"
        );
        channel.parent = barrel;
        channel.material = material;
        return channel;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ EMP ============

    /**
     * Создает тарелку EMP излучателя
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция тарелки
     * @param width Ширина тарелки
     * @param height Высота тарелки
     * @param depth Глубина тарелки
     * @param material Материал тарелки
     * @param prefix Префикс для имени меша
     * @returns Созданный меш тарелки
     */
    static createEMPDish(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const dish = MeshBuilder.CreateBox(`${prefix}EMPDish`, {
            width,
            height,
            depth
        }, scene);
        dish.position = addZFightingOffset(position, "forward");
        dish.parent = barrel;
        dish.material = material;
        return dish;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ MULTISHOT ============

    /**
     * Создает ствол мульти-выстрела
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция ствола
     * @param width Ширина ствола
     * @param height Высота ствола
     * @param depth Глубина ствола
     * @param material Материал ствола
     * @param prefix Префикс для имени меша
     * @returns Созданный меш ствола
     */
    static createMultishotBarrel(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const multiBarrel = MeshBuilder.CreateBox(`${prefix}MultishotBarrel`, {
            width,
            height,
            depth
        }, scene);
        multiBarrel.position = addZFightingOffset(position, "forward");
        multiBarrel.parent = barrel;
        multiBarrel.material = material;
        return multiBarrel;
    }

    /**
     * Создает соединитель мульти-выстрела
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция соединителя
     * @param width Ширина соединителя
     * @param height Высота соединителя
     * @param depth Глубина соединителя
     * @param material Материал соединителя
     * @param prefix Префикс для имени меша
     * @returns Созданный меш соединителя
     */
    static createMultishotConnector(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const connector = MeshBuilder.CreateBox(`${prefix}MultishotConnector`, {
            width,
            height,
            depth
        }, scene);
        connector.position = addZFightingOffset(position, "forward");
        connector.parent = barrel;
        connector.material = material;
        return connector;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ HOMING ============

    /**
     * Создает систему наведения для homing
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция системы наведения
     * @param width Ширина системы
     * @param height Высота системы
     * @param depth Глубина системы
     * @param material Материал системы
     * @param prefix Префикс для имени меша
     * @returns Созданный меш системы наведения
     */
    static createHomingGuidance(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const guidance = MeshBuilder.CreateBox(`${prefix}HomingGuidance`, {
            width,
            height,
            depth
        }, scene);
        guidance.position = addZFightingOffset(position, "up");
        guidance.parent = barrel;
        guidance.material = material;
        return guidance;
    }

    /**
     * Создает блок управления для homing
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция блока управления
     * @param width Ширина блока
     * @param height Высота блока
     * @param depth Глубина блока
     * @param material Материал блока
     * @param prefix Префикс для имени меша
     * @returns Созданный меш блока управления
     */
    static createHomingControl(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const control = MeshBuilder.CreateBox(`${prefix}HomingControl`, {
            width,
            height,
            depth
        }, scene);
        control.position = addZFightingOffset(position, "up");
        control.parent = barrel;
        control.material = material;
        return control;
    }

    /**
     * Создает антенну для homing
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция антенны
     * @param side Сторона (-1 или 1)
     * @param width Ширина антенны
     * @param height Высота антенны
     * @param depth Глубина антенны
     * @param material Материал антенны
     * @param prefix Префикс для имени меша
     * @returns Созданный меш антенны
     */
    static createHomingAntenna(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        side: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const antenna = MeshBuilder.CreateBox(`${prefix}HomingAntenna`, {
            width,
            height,
            depth
        }, scene);
        antenna.position = addZFightingOffset(
            new Vector3(position.x * side, position.y, position.z),
            "up"
        );
        antenna.parent = barrel;
        antenna.material = material;
        return antenna;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ PIERCING ============

    /**
     * Создает наконечник бронебойной пушки (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция наконечника
     * @param layerIndex Индекс слоя (0, 1, 2, 3...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param depth Глубина каждого слоя
     * @param material Материал наконечника
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя наконечника
     */
    static createPiercingTip(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const tip = MeshBuilder.CreateBox(`${prefix}PiercingTip${layerIndex}`, {
            width: size,
            height: size,
            depth: depth
        }, scene);
        tip.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * depth),
            "forward"
        );
        tip.rotation.y = (layerIndex % 2 === 0 ? 1 : -1) * Math.PI / 8;
        tip.parent = barrel;
        tip.material = material;
        return tip;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ SHOCKWAVE ============

    /**
     * Создает усилитель ударной волны (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция усилителя
     * @param layerIndex Индекс слоя (0, 1, 2...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал усилителя
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя усилителя
     */
    static createShockwaveAmplifier(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const amp = MeshBuilder.CreateBox(`${prefix}ShockwaveAmp${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        amp.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * height),
            "forward"
        );
        amp.parent = barrel;
        amp.material = material;
        return amp;
    }

    /**
     * Создает эмиттер ударной волны
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция эмиттера
     * @param angle Угол поворота вокруг ствола (радианы)
     * @param zOffset Смещение по Z
     * @param width Ширина эмиттера
     * @param height Высота эмиттера
     * @param depth Глубина эмиттера
     * @param material Материал эмиттера
     * @param prefix Префикс для имени меша
     * @returns Созданный меш эмиттера
     */
    static createShockwaveEmitter(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        angle: number,
        zOffset: number,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const emitter = MeshBuilder.CreateBox(`${prefix}ShockwaveEmitter`, {
            width,
            height,
            depth
        }, scene);
        const offsetPos = new Vector3(
            position.x + Math.cos(angle) * position.x,
            position.y + Math.sin(angle) * position.y,
            position.z + zOffset
        );
        emitter.position = addZFightingOffset(offsetPos, "forward");
        emitter.parent = barrel;
        emitter.material = material;
        return emitter;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ BEAM ============

    /**
     * Создает фокусировщик луча (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция фокусировщика
     * @param layerIndex Индекс слоя (0, 1, 2, 3...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал фокусировщика
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя фокусировщика
     */
    static createBeamFocuser(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const focuser = MeshBuilder.CreateBox(`${prefix}BeamFocuser${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        focuser.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * height),
            "forward"
        );
        focuser.parent = barrel;
        focuser.material = material;
        return focuser;
    }

    /**
     * Создает линзу луча
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция линзы
     * @param width Ширина линзы
     * @param height Высота линзы
     * @param depth Глубина линзы
     * @param material Материал линзы
     * @param prefix Префикс для имени меша
     * @returns Созданный меш линзы
     */
    static createBeamLens(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const lens = MeshBuilder.CreateBox(`${prefix}BeamLens`, {
            width,
            height,
            depth
        }, scene);
        lens.position = addZFightingOffset(position, "forward");
        lens.parent = barrel;
        lens.material = material;
        return lens;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ SUPPORT ============

    /**
     * Создает эмиттер ремонтного луча (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция эмиттера
     * @param layerIndex Индекс слоя (0, 1, 2, 3...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param height Высота слоя
     * @param material Материал эмиттера
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя эмиттера
     */
    static createSupportEmitter(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const emitter = MeshBuilder.CreateBox(`${prefix}SupportEmitter${layerIndex}`, {
            width: size,
            height: height,
            depth: size
        }, scene);
        emitter.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * height),
            "forward"
        );
        emitter.parent = barrel;
        emitter.material = material;
        return emitter;
    }

    // ============ СПЕЦИФИЧНЫЕ МЕТОДЫ ДЛЯ STANDARD ============

    /**
     * Создает дульный тормоз стандартной пушки (слоистый)
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция дульного тормоза
     * @param layerIndex Индекс слоя (0, 1...)
     * @param baseSize Базовый размер первого слоя
     * @param sizeReduction Уменьшение размера на слой
     * @param depth Глубина каждого слоя
     * @param material Материал дульного тормоза
     * @param prefix Префикс для имени меша
     * @returns Созданный меш слоя дульного тормоза
     */
    static createStandardMuzzle(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        layerIndex: number,
        baseSize: number,
        sizeReduction: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const size = baseSize - layerIndex * sizeReduction;
        const muzzle = MeshBuilder.CreateBox(`${prefix}StandardMuzzle${layerIndex}`, {
            width: size,
            height: size,
            depth: depth
        }, scene);
        muzzle.position = addZFightingOffset(
            new Vector3(position.x, position.y, position.z + layerIndex * depth),
            "forward"
        );
        muzzle.parent = barrel;
        muzzle.material = material;
        return muzzle;
    }

    /**
     * Создает защитный кожух стандартной пушки
     * @param scene Сцена Babylon.js
     * @param barrel Родительский ствол
     * @param position Позиция кожуха
     * @param width Ширина кожуха
     * @param height Высота кожуха
     * @param depth Глубина кожуха
     * @param material Материал кожуха
     * @param prefix Префикс для имени меша
     * @returns Созданный меш кожуха
     */
    static createStandardShield(
        scene: Scene,
        barrel: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const shield = MeshBuilder.CreateBox(`${prefix}StandardShield`, {
            width,
            height,
            depth
        }, scene);
        shield.position = addZFightingOffset(position, "forward");
        shield.parent = barrel;
        shield.material = material;
        return shield;
    }
}

