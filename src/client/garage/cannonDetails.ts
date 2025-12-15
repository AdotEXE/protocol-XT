/**
 * Cannon Details Generator for Garage 3D Preview
 * Функции для создания различных деталей пушек
 */

import { Mesh, Scene, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
// import { addZFightingOffset } from "../tank/zFightingFix"; // Не используется в этом файле
import { MaterialFactory } from "./materials";

export class CannonDetailsGenerator {
    /**
     * Создает прицел (scope) для sniper
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
        scope.position = position;
        scope.parent = barrel;
        scope.material = MaterialFactory.createScopeMaterial(scene, prefix);
        return scope;
    }

    /**
     * Создает сошку (bipod) для sniper
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
        bipod.position = position;
        bipod.parent = barrel;
        bipod.material = material;
        return bipod;
    }

    /**
     * Создает стабилизатор для ствола
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
        stabilizer.position = position;
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
        miniBarrel.position = position;
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
        breech.position = position;
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
}

