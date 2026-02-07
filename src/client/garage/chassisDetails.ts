/**
 * Chassis Details Generator for Garage 3D Preview
 * Функции для создания различных деталей корпусов танков (50+ типов деталей)
 */

import { Mesh, Scene, Vector3, MeshBuilder, StandardMaterial, Color3 } from "@babylonjs/core";
// Color3 не используется напрямую, но может использоваться через MaterialFactory
import { addZFightingOffset } from "../tank/zFightingFix";
import { MaterialFactory } from "./materials";

// JSON модель МиГ-31 (встроена для производительности)
const PLANE_MODEL_DATA = [
    { name: "fuselage_main", position: { x: 0, y: 0, z: 0 }, size: { x: 2.0, y: 1.2, z: 10.0 }, color: "#8E9399" },
    { name: "nose_base", position: { x: 0, y: -0.2, z: 6 }, size: { x: 1.2, y: 1.0, z: 2 }, color: "#8E9399" },
    { name: "nose_tip", position: { x: 0, y: -0.2, z: 7.8 }, size: { x: 0.6, y: 0.6, z: 1.6 }, color: "#4A4A4A" },
    { name: "cockpit_front", position: { x: 0, y: 0.6, z: 5.2 }, size: { x: 0.7, y: 0.4, z: 1.2 }, color: "#2A3B4C", alpha: 0.8 },
    { name: "cockpit_rear", position: { x: 0, y: 0.6, z: 4 }, size: { x: 0.7, y: 0.4, z: 1.2 }, color: "#2A3B4C", alpha: 0.8 },
    { name: "intake_left", position: { x: -1.3, y: -0.2, z: 1.5 }, size: { x: 0.8, y: 1.2, z: 4.5 }, color: "#8E9399" },
    { name: "intake_right", position: { x: 1.3, y: -0.2, z: 1.5 }, size: { x: 0.8, y: 1.2, z: 4.5 }, color: "#8E9399" },
    { name: "wing_left_inner", position: { x: -2, y: 0.25, z: 0.5 }, size: { x: 2, y: 0.1, z: 4 }, color: "#8E9399" },
    { name: "wing_right_inner", position: { x: 2, y: 0.25, z: 0.5 }, size: { x: 2, y: 0.1, z: 4 }, color: "#8E9399" },
    { name: "wing_left_outer", position: { x: -4, y: 0.25, z: -1 }, size: { x: 2, y: 0.1, z: 3 }, color: "#8E9399" },
    { name: "wing_right_outer", position: { x: 4, y: 0.25, z: -1 }, size: { x: 2, y: 0.1, z: 3 }, color: "#8E9399" },
    { name: "vertical_fin_left", position: { x: -0.85, y: 1.5, z: -4 }, size: { x: 0.1, y: 1.8, z: 3 }, color: "#8E9399", rotationZ: -5 },
    { name: "vertical_fin_right", position: { x: 0.85, y: 1.5, z: -4 }, size: { x: 0.1, y: 1.8, z: 3 }, color: "#8E9399", rotationZ: 5 },
    { name: "horizontal_tail_left", position: { x: -2.5, y: 0, z: -5.5 }, size: { x: 2, y: 0.1, z: 2.5 }, color: "#8E9399" },
    { name: "horizontal_tail_right", position: { x: 2.5, y: 0, z: -5.5 }, size: { x: 2, y: 0.1, z: 2.5 }, color: "#8E9399" },
    { name: "engine_nozzle_left", position: { x: -0.6, y: -0.2, z: -5.8 }, size: { x: 1.0, y: 1.0, z: 1.8 }, color: "#333333", emissive: "#1a0500" },
    { name: "engine_nozzle_right", position: { x: 0.6, y: -0.2, z: -5.8 }, size: { x: 1.0, y: 1.0, z: 1.8 }, color: "#333333", emissive: "#1a0500" },
    { name: "front_gear", position: { x: 0, y: -1.2, z: 5.5 }, size: { x: 0.3, y: 0.8, z: 0.3 }, color: "#1A1A1A" },
    { name: "rear_gear_left", position: { x: -1.2, y: -1.2, z: -1 }, size: { x: 0.5, y: 0.8, z: 0.5 }, color: "#1A1A1A" },
    { name: "rear_gear_right", position: { x: 1.2, y: -1.2, z: -1 }, size: { x: 0.5, y: 0.8, z: 0.5 }, color: "#1A1A1A" }
];

export class ChassisDetailsGenerator {
    /**
     * Создает люк на крыше
     */
    static createHatch(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const hatch = MeshBuilder.CreateBox(`${prefix}Hatch`, { width, height, depth }, scene);
        hatch.position = position;
        hatch.parent = chassis;
        hatch.material = material;
        return hatch;
    }

    /**
     * Создает фару спереди
     */
    static createHeadlight(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const headlight = MeshBuilder.CreateBox(`${prefix}Headlight${index}`, { width, height, depth }, scene);
        headlight.position = position;
        headlight.parent = chassis;
        headlight.material = MaterialFactory.createHeadlightMaterial(scene, index, prefix);
        return headlight;
    }

    /**
     * Создает фару спереди (цилиндрическую для hover)
     */
    static createHeadlightCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const headlight = MeshBuilder.CreateBox(`${prefix}Headlight${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        headlight.position = position;
        headlight.parent = chassis;
        headlight.material = MaterialFactory.createHoverHeadlightMaterial(scene, index, prefix);
        return headlight;
    }

    /**
     * Создает защиту фары
     */
    static createHeadlightGuard(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const guard = MeshBuilder.CreateBox(`${prefix}HeadlightGuard${index}`, { width, height, depth }, scene);
        guard.position = position;
        guard.parent = chassis;
        guard.material = material;
        return guard;
    }

    /**
     * Создает задний огонь (стоп-сигнал)
     */
    static createTailLight(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const tailLight = MeshBuilder.CreateBox(`${prefix}TailLight${index}`, { width, height, depth }, scene);
        tailLight.position = addZFightingOffset(position, "forward");
        tailLight.parent = chassis;
        tailLight.material = MaterialFactory.createTailLightMaterial(scene, index, prefix);
        return tailLight;
    }

    /**
     * Создает выхлопную трубу (прямоугольную)
     */
    static createExhaust(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const exhaust = MeshBuilder.CreateBox(`${prefix}Exhaust`, { width, height, depth }, scene);
        exhaust.position = addZFightingOffset(position, "forward");
        exhaust.parent = chassis;
        exhaust.material = material;
        return exhaust;
    }

    /**
     * Создает цилиндрическую выхлопную трубу
     */
    static createExhaustCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        depth: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const exhaust = MeshBuilder.CreateBox(`${prefix}ExhaustCyl`, {
            width: diameter * 2,
            height: diameter * 2,
            depth: depth
        }, scene);
        exhaust.position = addZFightingOffset(position, "forward");
        exhaust.parent = chassis;
        exhaust.material = MaterialFactory.createExhaustMaterial(scene, prefix);
        return exhaust;
    }

    /**
     * Создает отверстие выхлопной трубы (чёрная дырка)
     */
    static createExhaustHole(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        innerDiameter: number,
        outerDiameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const hole = MeshBuilder.CreateBox(`${prefix}ExhaustHole${index}`, {
            width: innerDiameter * 2,
            height: innerDiameter * 2,
            depth: 0.02
        }, scene);
        hole.position = addZFightingOffset(position, "backward");
        hole.parent = chassis;
        hole.material = MaterialFactory.createExhaustHoleMaterial(scene, index, prefix);
        return hole;
    }

    /**
     * Создает лопату на корме
     */
    static createShovel(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const shovel = MeshBuilder.CreateBox(`${prefix}Shovel`, { width, height, depth }, scene);
        shovel.position = addZFightingOffset(position, "forward");
        shovel.parent = chassis;
        shovel.material = material;
        return shovel;
    }

    /**
     * Создает топор на корме
     */
    static createAxe(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const axe = MeshBuilder.CreateBox(`${prefix}Axe`, { width, height, depth }, scene);
        axe.position = addZFightingOffset(position, "forward");
        axe.parent = chassis;
        axe.material = material;
        return axe;
    }

    /**
     * Создает канистру
     */
    static createCanister(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const canister = MeshBuilder.CreateBox(`${prefix}Canister`, { width, height, depth }, scene);
        canister.position = addZFightingOffset(position, "forward");
        canister.parent = chassis;
        canister.material = material;
        return canister;
    }

    /**
     * Создает вентиляционную решетку
     */
    static createVent(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}Vent${index}`, { width, height, depth }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = chassis;
        vent.material = MaterialFactory.createVentMaterial(scene, index, prefix);
        return vent;
    }

    /**
     * Создает перископ
     */
    static createPeriscope(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const periscope = MeshBuilder.CreateBox(`${prefix}Periscope${index}`, {
            width: width,
            height: height,
            depth: width
        }, scene);
        periscope.position = addZFightingOffset(position, "up");
        periscope.parent = chassis;
        periscope.material = MaterialFactory.createPeriscopeMaterial(scene, index, prefix);
        return periscope;
    }

    /**
     * Создает бинокуляр
     */
    static createBinocular(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const binocular = MeshBuilder.CreateBox(`${prefix}Binocular`, { width, height, depth }, scene);
        binocular.position = addZFightingOffset(position, "forward");
        binocular.parent = chassis;
        binocular.material = MaterialFactory.createBinocularMaterial(scene, prefix);
        return binocular;
    }

    /**
     * Создает броневую пластину
     */
    static createArmorPlate(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const plate = MeshBuilder.CreateBox(`${prefix}ArmorPlate`, { width, height, depth }, scene);
        plate.position = addZFightingOffset(position, "forward");
        plate.parent = chassis;
        plate.material = material;
        return plate;
    }

    /**
     * Создает антенну
     */
    static createAntenna(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        width: number,
        prefix: string = "preview"
    ): Mesh {
        const antenna = MeshBuilder.CreateBox(`${prefix}Antenna`, {
            width: width,
            height: height,
            depth: width
        }, scene);
        antenna.position = addZFightingOffset(position, "up");
        antenna.parent = chassis;
        antenna.material = MaterialFactory.createAntennaMaterial(scene, prefix);
        return antenna;
    }

    /**
     * Создает основание антенны
     */
    static createAntennaBase(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        size: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const base = MeshBuilder.CreateBox(`${prefix}AntennaBase`, {
            width: size,
            height: size,
            depth: size
        }, scene);
        base.position = addZFightingOffset(position, "up");
        base.parent = chassis;
        base.material = material;
        return base;
    }

    /**
     * Создает экран (боковую защиту)
     */
    static createArmorScreen(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        angle: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const screen = MeshBuilder.CreateBox(`${prefix}ArmorScreen`, { width, height, depth }, scene);
        screen.position = position;
        screen.rotation.y = angle;
        screen.parent = chassis;
        screen.material = material;
        return screen;
    }

    /**
     * Создает наклонную броню
     */
    static createSlopedArmor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        angle: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const armor = MeshBuilder.CreateBox(`${prefix}SlopedArmor`, { width, height, depth }, scene);
        armor.position = addZFightingOffset(position, "forward");
        armor.rotation.x = angle;
        armor.parent = chassis;
        armor.material = material;
        return armor;
    }

    /**
     * Создает прицел
     */
    static createSight(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const sight = MeshBuilder.CreateBox(`${prefix}Sight`, { width, height, depth }, scene);
        sight.position = addZFightingOffset(position, "forward");
        sight.parent = chassis;
        sight.material = MaterialFactory.createSightMaterial(scene, prefix);
        return sight;
    }

    /**
     * Создает спойлер
     */
    static createSpoiler(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const spoiler = MeshBuilder.CreateBox(`${prefix}Spoiler`, { width, height, depth }, scene);
        spoiler.position = position;
        spoiler.parent = chassis;
        spoiler.material = material;
        return spoiler;
    }

    /**
     * Создает обтекатель
     */
    static createFairing(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const fairing = MeshBuilder.CreateBox(`${prefix}Fairing`, { width, height, depth }, scene);
        fairing.position = position;
        fairing.parent = chassis;
        fairing.material = material;
        return fairing;
    }

    /**
     * Создает воздухозаборник
     */
    static createIntake(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const intake = MeshBuilder.CreateBox(`${prefix}Intake`, { width, height, depth }, scene);
        intake.position = addZFightingOffset(position, "forward");
        intake.parent = chassis;
        intake.material = material;
        return intake;
    }

    /**
     * Создает зеркало заднего вида
     */
    static createMirror(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const mirror = MeshBuilder.CreateBox(`${prefix}Mirror${index}`, { width, height, depth }, scene);
        mirror.position = position;
        mirror.parent = chassis;
        mirror.material = MaterialFactory.createMirrorMaterial(scene, index, prefix);
        return mirror;
    }

    /**
     * Создает крыло (для scout)
     */
    static createWing(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const wing = MeshBuilder.CreateBox(`${prefix}Wing`, { width, height, depth }, scene);
        wing.position = position;
        wing.parent = chassis;
        wing.material = material;
        return wing;
    }

    /**
     * Создает диффузор
     */
    static createDiffuser(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const diffuser = MeshBuilder.CreateBox(`${prefix}Diffuser`, { width, height, depth }, scene);
        diffuser.position = position;
        diffuser.parent = chassis;
        diffuser.material = material;
        return diffuser;
    }

    /**
     * Создает реактивный двигатель (цилиндр)
     */
    static createJetEngine(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        length: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const engine = MeshBuilder.CreateBox(`${prefix}JetEngine${index}`, {
            width: diameter,
            height: diameter,
            depth: length
        }, scene);
        engine.position = position;
        engine.parent = chassis;
        engine.material = MaterialFactory.createJetEngineMaterial(scene, index, prefix);
        return engine;
    }

    /**
     * Создает сопло двигателя
     */
    static createEngineNozzle(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        length: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const nozzle = MeshBuilder.CreateBox(`${prefix}EngineNozzle${index}`, {
            width: diameter,
            height: diameter,
            depth: length
        }, scene);
        nozzle.position = addZFightingOffset(position, "backward");
        nozzle.parent = chassis;
        nozzle.material = MaterialFactory.createEngineMaterial(scene, index, prefix);
        return nozzle;
    }

    /**
     * Создает антигравитационный двигатель (для hover)
     */
    static createAntiGravEngine(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const engine = MeshBuilder.CreateBox(`${prefix}AntiGravEngine${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        engine.position = addZFightingOffset(position, "down");
        engine.parent = chassis;
        engine.material = MaterialFactory.createAntiGravMaterial(scene, index, prefix);
        return engine;
    }

    /**
     * Создает генератор щита
     */
    static createShieldGenerator(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const generator = MeshBuilder.CreateBox(`${prefix}ShieldGenerator`, { width, height, depth }, scene);
        generator.position = addZFightingOffset(position, "up");
        generator.parent = chassis;
        generator.material = MaterialFactory.createShieldGeneratorMaterial(scene, prefix);
        return generator;
    }

    /**
     * Создает эмиттер щита (светящийся элемент)
     */
    static createShieldEmitter(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const emitter = MeshBuilder.CreateBox(`${prefix}ShieldEmitter${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        emitter.position = addZFightingOffset(position, "up");
        emitter.parent = chassis;
        emitter.material = MaterialFactory.createShieldEmitterMaterial(scene, index, prefix);
        return emitter;
    }

    /**
     * Создает дрон-пусковую установку
     */
    static createDroneLauncher(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const launcher = MeshBuilder.CreateBox(`${prefix}DroneLauncher`, { width, height, depth }, scene);
        launcher.position = addZFightingOffset(position, "up");
        launcher.parent = chassis;
        launcher.material = MaterialFactory.createDroneLauncherMaterial(scene, prefix);
        return launcher;
    }

    /**
     * Создает мини-дрон на корпусе
     */
    static createMiniDrone(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        size: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const drone = MeshBuilder.CreateBox(`${prefix}MiniDrone${index}`, {
            width: size,
            height: size * 0.5,
            depth: size
        }, scene);
        drone.position = addZFightingOffset(position, "up");
        drone.parent = chassis;
        drone.material = MaterialFactory.createMiniDroneMaterial(scene, index, prefix);
        return drone;
    }

    /**
     * Создает командную вышку
     */
    static createCommandTower(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const tower = MeshBuilder.CreateBox(`${prefix}CommandTower`, { width, height, depth }, scene);
        tower.position = addZFightingOffset(position, "up");
        tower.parent = chassis;
        tower.material = material;
        return tower;
    }

    /**
     * Создает радарную тарелку
     */
    static createRadarDish(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        prefix: string = "preview"
    ): Mesh {
        const dish = MeshBuilder.CreateBox(`${prefix}RadarDish`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        dish.position = addZFightingOffset(position, "up");
        dish.parent = chassis;
        dish.material = MaterialFactory.createRadarMaterial(scene, prefix);
        return dish;
    }

    /**
     * Создает стабилизатор
     */
    static createStabilizer(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const stabilizer = MeshBuilder.CreateBox(`${prefix}Stabilizer`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        stabilizer.position = position;
        stabilizer.parent = chassis;
        stabilizer.material = material;
        return stabilizer;
    }

    /**
     * Создает ящик для инструментов
     */
    static createToolBox(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const toolBox = MeshBuilder.CreateBox(`${prefix}ToolBox`, { width, height, depth }, scene);
        toolBox.position = position;
        toolBox.parent = chassis;
        toolBox.material = material;
        return toolBox;
    }

    // [Opus 4.6] stub - creates vent bar details (multiple thin bars across a vent)
    static createVentBars(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        count: number,
        barWidth: number,
        barHeight: number,
        barDepth: number,
        spacing: number,
        index: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const totalWidth = count * (barWidth + spacing);
        const bars = MeshBuilder.CreateBox(`${prefix}VentBars${index}`, {
            width: totalWidth,
            height: barHeight,
            depth: barDepth
        }, scene);
        bars.position = addZFightingOffset(position, "up");
        bars.parent = chassis;
        bars.material = material;
        return bars;
    }

    // [Opus 4.6] stub - creates roof vent (delegates to createVent)
    static createRoofVent(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        return this.createVent(scene, chassis, position, width, height, depth, index, prefix);
    }

    // [Opus 4.6] stub - creates side light (uses SideLightMaterial)
    static createSideLight(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const sideLight = MeshBuilder.CreateBox(`${prefix}SideLight${index}`, { width, height, depth }, scene);
        sideLight.position = position;
        sideLight.parent = chassis;
        sideLight.material = MaterialFactory.createSideLightMaterial(scene, index, prefix);
        return sideLight;
    }

    // [Opus 4.6] stub - creates spike detail (pointed protrusion)
    static createSpike(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        angle: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const spike = MeshBuilder.CreateBox(`${prefix}Spike`, { width, height, depth }, scene);
        spike.position = addZFightingOffset(position, "forward");
        spike.rotation.y = angle;
        spike.parent = chassis;
        spike.material = material;
        return spike;
    }

    // [Opus 4.6] stub - creates energy booster (glowing box)
    static createEnergyBooster(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const booster = MeshBuilder.CreateBox(`${prefix}EnergyBooster${index}`, {
            width: diameter,
            height: diameter,
            depth: diameter
        }, scene);
        booster.position = addZFightingOffset(position, "forward");
        booster.parent = chassis;
        booster.material = MaterialFactory.createEnergyBoosterMaterial(scene, index, prefix);
        return booster;
    }

    // [Opus 4.6] stub - creates stealth generator
    static createStealthGenerator(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const generator = MeshBuilder.CreateBox(`${prefix}StealthGen`, { width, height, depth }, scene);
        generator.position = addZFightingOffset(position, "up");
        generator.parent = chassis;
        generator.material = MaterialFactory.createStealthGeneratorMaterial(scene, prefix);
        return generator;
    }

    // [Opus 4.6] stub - creates thruster (hover engine)
    static createThruster(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const thruster = MeshBuilder.CreateBox(`${prefix}Thruster${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        thruster.position = addZFightingOffset(position, "down");
        thruster.parent = chassis;
        thruster.material = MaterialFactory.createThrusterMaterial(scene, index, prefix);
        return thruster;
    }

    // [Opus 4.6] stub - creates cylindrical roof vent
    static createRoofVentCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}RoofVentCyl${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        vent.position = addZFightingOffset(position, "up");
        vent.parent = chassis;
        vent.material = MaterialFactory.createRoofVentMaterial(scene, index, prefix);
        return vent;
    }

    // [Opus 4.6] stub - creates optical sensor
    static createOpticalSensor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const sensor = MeshBuilder.CreateBox(`${prefix}OpticalSensor${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        sensor.position = addZFightingOffset(position, "forward");
        sensor.parent = chassis;
        sensor.material = MaterialFactory.createHoverSensorMaterial(scene, index, prefix);
        return sensor;
    }

    // [Opus 4.6] stub - creates cylindrical tail light
    static createTailLightCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const tailLight = MeshBuilder.CreateBox(`${prefix}TailLightCyl${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        tailLight.position = addZFightingOffset(position, "forward");
        tailLight.parent = chassis;
        tailLight.material = MaterialFactory.createTailLightMaterial(scene, index, prefix);
        return tailLight;
    }

    // [Opus 4.6] stub - creates cylindrical intake
    static createIntakeCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        prefix: string = "preview"
    ): Mesh {
        const intake = MeshBuilder.CreateBox(`${prefix}IntakeCyl`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        intake.position = addZFightingOffset(position, "forward");
        intake.parent = chassis;
        intake.material = MaterialFactory.createIntakeMaterial(scene, prefix);
        return intake;
    }

    // [Opus 4.6] stub - creates float (amphibious buoyancy element)
    static createFloat(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        width: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const floatMesh = MeshBuilder.CreateBox(`${prefix}Float`, {
            width: width,
            height: height,
            depth: width
        }, scene);
        floatMesh.position = position;
        floatMesh.parent = chassis;
        floatMesh.material = material;
        return floatMesh;
    }

    // [Opus 4.6] stub - creates water seal panel
    static createWaterSeal(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const seal = MeshBuilder.CreateBox(`${prefix}WaterSeal`, { width, height, depth }, scene);
        seal.position = addZFightingOffset(position, "up");
        seal.parent = chassis;
        seal.material = material;
        return seal;
    }

    // [Opus 4.6] stub - creates energy generator (shield-type)
    static createEnergyGenerator(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const generator = MeshBuilder.CreateBox(`${prefix}EnergyGen`, {
            width: diameter,
            height: diameter * 0.5,
            depth: diameter
        }, scene);
        generator.position = addZFightingOffset(position, "up");
        generator.parent = chassis;
        generator.material = MaterialFactory.createShieldGeneratorMaterial(scene, prefix);
        return generator;
    }

    // [Opus 4.6] stub - creates energy panel
    static createEnergyPanel(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const panel = MeshBuilder.CreateBox(`${prefix}EnergyPanel${index}`, { width, height, depth }, scene);
        panel.position = addZFightingOffset(position, "forward");
        panel.parent = chassis;
        panel.material = MaterialFactory.createEnergyPanelMaterial(scene, index, prefix);
        return panel;
    }

    // [Opus 4.6] stub - creates energy coil
    static createEnergyCoil(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        angle: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const coil = MeshBuilder.CreateBox(`${prefix}EnergyCoil${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        coil.position = addZFightingOffset(position, "up");
        coil.rotation.y = angle;
        coil.parent = chassis;
        coil.material = MaterialFactory.createEnergyCoilMaterial(scene, index, prefix);
        return coil;
    }

    // [Opus 4.6] stub - creates energy port
    static createEnergyPort(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        angle: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const port = MeshBuilder.CreateBox(`${prefix}EnergyPort${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        port.position = addZFightingOffset(position, "up");
        port.rotation.y = angle;
        port.parent = chassis;
        port.material = MaterialFactory.createEnergyPortMaterial(scene, index, prefix);
        return port;
    }

    // [Opus 4.6] stub - creates drone platform
    static createDronePlatform(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const platform = MeshBuilder.CreateBox(`${prefix}DronePlatform${index}`, { width, height, depth }, scene);
        platform.position = addZFightingOffset(position, "up");
        platform.parent = chassis;
        platform.material = MaterialFactory.createDronePlatformMaterial(scene, index, prefix);
        return platform;
    }

    // [Opus 4.6] stub - creates sensor
    static createSensor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const sensor = MeshBuilder.CreateBox(`${prefix}Sensor${index}`, { width, height, depth }, scene);
        sensor.position = addZFightingOffset(position, "up");
        sensor.parent = chassis;
        sensor.material = MaterialFactory.createSensorMaterial(scene, index, prefix);
        return sensor;
    }

    // [Opus 4.6] stub - creates cylindrical stabilizer
    static createStabilizerCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const stabilizer = MeshBuilder.CreateBox(`${prefix}StabilizerCyl`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        stabilizer.position = position;
        stabilizer.parent = chassis;
        stabilizer.material = material;
        return stabilizer;
    }

    /**
     * Создает полную модель самолета "Warhawk" (МиГ-31)
     * Использует встроенные данные модели
     */
    static addPlaneDetails(
        scene: Scene,
        chassis: Mesh,
        width: number,
        height: number,
        depth: number,
        baseColor: Color3,
        prefix: string = "preview"
    ): void {
        // Рассчитываем масштаб относительно исходной модели
        // Исходная модель: ~10 единиц в длину (z), ~10 в ширину (с крыльями), ~4 в высоту
        const scaleX = width / 10;
        const scaleY = height / 4;
        const scaleZ = depth / 10;
        const scale = Math.min(scaleX, scaleY, scaleZ) * 1.8; // 2x увеличение модели

        // Материалы создаются один раз
        const materials: Map<string, StandardMaterial> = new Map();

        const getMaterial = (color: string, alpha?: number, emissive?: string): StandardMaterial => {
            const key = `${color}_${alpha || 1}_${emissive || ''}`;
            if (materials.has(key)) {
                return materials.get(key)!;
            }
            const mat = new StandardMaterial(`${prefix}PlaneMat_${key}`, scene);
            mat.diffuseColor = Color3.FromHexString(color);
            mat.specularColor = new Color3(0.2, 0.2, 0.2);
            if (alpha !== undefined && alpha < 1) {
                mat.alpha = alpha;
            }
            if (emissive) {
                mat.emissiveColor = Color3.FromHexString(emissive);
            }
            materials.set(key, mat);
            return mat;
        };

        // Создаем каждую деталь из модели
        for (const part of PLANE_MODEL_DATA) {
            const mesh = MeshBuilder.CreateBox(`${prefix}Plane_${part.name}`, {
                width: part.size.x * scale,
                height: part.size.y * scale,
                depth: part.size.z * scale
            }, scene);
            // Позиция (оригинальные координаты из JSON)
            mesh.position = new Vector3(
                part.position.x * scale,
                part.position.y * scale,
                part.position.z * scale
            );

            // Применяем rotation если есть
            if ((part as any).rotationZ) {
                mesh.rotation.z = ((part as any).rotationZ * Math.PI) / 180;
            }

            mesh.parent = chassis;
            mesh.material = getMaterial(
                part.color,
                (part as any).alpha,
                (part as any).emissive
            );
        }
    }
}
