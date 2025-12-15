/**
 * Chassis Details Generator for Garage 3D Preview
 * Функции для создания различных деталей корпусов танков (50+ типов деталей)
 */

import { Mesh, Scene, Vector3, MeshBuilder, StandardMaterial } from "@babylonjs/core";
// Color3 не используется напрямую, но может использоваться через MaterialFactory
import { addZFightingOffset } from "../tank/zFightingFix";
import { MaterialFactory } from "./materials";

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
        tailLight.position = position;
        tailLight.parent = chassis;
        tailLight.material = MaterialFactory.createTailLightMaterial(scene, index, prefix);
        return tailLight;
    }

    /**
     * Создает задний огонь (цилиндрический для hover)
     */
    static createTailLightCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const tailLight = MeshBuilder.CreateBox(`${prefix}TailLight${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        tailLight.position = position;
                tailLight.parent = chassis;
        tailLight.material = MaterialFactory.createTailLightMaterial(scene, index, prefix);
        return tailLight;
    }

    /**
     * Создает боковую фару (сигнальную)
     */
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
        vent.position = position;
        vent.parent = chassis;
        vent.material = MaterialFactory.createVentMaterial(scene, index, prefix);
        return vent;
    }

    /**
     * Создает вентиляционную решетку на крыше
     */
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
        const vent = MeshBuilder.CreateBox(`${prefix}RoofVent${index}`, { width, height, depth }, scene);
        vent.position = position;
        vent.parent = chassis;
        vent.material = MaterialFactory.createRoofVentMaterial(scene, index, prefix);
        return vent;
    }

    /**
     * Создает вентиляционную решетку на крыше (цилиндрическую)
     */
    static createRoofVentCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        height: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const vent = MeshBuilder.CreateBox(`${prefix}RoofVent${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        vent.position = position;
                vent.parent = chassis;
        vent.material = MaterialFactory.createRoofVentMaterial(scene, index, prefix);
        return vent;
    }

    /**
     * Создает детали решетки (планки внутри решетки)
     */
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
    ): Mesh[] {
        const bars: Mesh[] = [];
        for (let i = 0; i < count; i++) {
            const bar = MeshBuilder.CreateBox(`${prefix}VentBar${index}_${i}`, {
                width: barWidth,
                height: barHeight,
                depth: barDepth
            }, scene);
            bar.position = addZFightingOffset(new Vector3(
                    position.x,
                    position.y,
                    position.z + (i - (count - 1) / 2) * spacing
                ), "forward");
            bar.parent = chassis;
            bar.material = material;
            bars.push(bar);
        }
        return bars;
    }

    /**
     * Создает перископ
     */
    static createPeriscope(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const periscope = MeshBuilder.CreateBox(`${prefix}Periscope${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        periscope.position = position;
        periscope.parent = chassis;
        periscope.material = MaterialFactory.createPeriscopeMaterial(scene, index, prefix);
        return periscope;
    }

    /**
     * Создает антенну
     */
    static createAntenna(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const antenna = MeshBuilder.CreateBox(`${prefix}Antenna`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        antenna.position = position;
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
        base.position = position;
        base.parent = chassis;
        base.material = material;
        return base;
    }

    /**
     * Создает выхлопную трубу (бокс)
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
        exhaust.position = position;
        exhaust.parent = chassis;
        exhaust.material = material;
        return exhaust;
    }

    /**
     * Создает выхлопную трубу (цилиндр)
     */
    static createExhaustCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const exhaust = MeshBuilder.CreateBox(`${prefix}Exhaust`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        exhaust.position = position;
                exhaust.parent = chassis;
        exhaust.material = MaterialFactory.createExhaustMaterial(scene, prefix);
        return exhaust;
    }

    /**
     * Создает выхлопное отверстие
     */
    static createExhaustHole(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const hole = MeshBuilder.CreateBox(`${prefix}ExhaustHole${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        hole.position = position;
                hole.parent = chassis;
        hole.material = MaterialFactory.createExhaustHoleMaterial(scene, index, prefix);
        return hole;
    }

    /**
     * Создает лопату (инструмент)
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
        shovel.position = position;
        shovel.parent = chassis;
        shovel.material = material;
        return shovel;
    }

    /**
     * Создает топор (инструмент)
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
        axe.position = position;
        axe.parent = chassis;
        axe.material = material;
        return axe;
    }

    /**
     * Создает канистру (инструмент)
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
        canister.position = position;
        canister.parent = chassis;
        canister.material = material;
        return canister;
    }

    /**
     * Создает броневую плиту
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
        plate.position = position;
        plate.parent = chassis;
        plate.material = material;
        return plate;
    }

    /**
     * Создает оптический прицел
     */
    static createSight(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): { sight: Mesh; lens: Mesh } {
        const sight = MeshBuilder.CreateBox(`${prefix}Sight`, { width, height, depth }, scene);
        sight.position = position;
        sight.parent = chassis;
        sight.material = MaterialFactory.createSightMaterial(scene, prefix);

        const lens = MeshBuilder.CreateBox(`${prefix}SightLens`, { width: 0.07, height: 0.02, depth: 0.07 }, scene);
        lens.position = addZFightingOffset(new Vector3(0, 0, depth / 2 + 0.01), "forward");
        lens.parent = sight;
        lens.material = MaterialFactory.createLensMaterial(scene, prefix);

        return { sight, lens };
    }

    /**
     * Создает бинокль
     */
    static createBinocular(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): { binocular: Mesh; lenses: Mesh[] } {
        const binocular = MeshBuilder.CreateBox(`${prefix}Binocular`, { width, height, depth }, scene);
        binocular.position = position;
        binocular.parent = chassis;
        binocular.material = MaterialFactory.createBinocularMaterial(scene, prefix);

        const lenses: Mesh[] = [];
        for (let i = 0; i < 2; i++) {
            const lens = MeshBuilder.CreateBox(`${prefix}Lens${i}`, { width: 0.06, height: 0.02, depth: 0.06 }, scene);
            lens.position = addZFightingOffset(new Vector3(
                    (i === 0 ? -1 : 1) * 0.06,
                    0,
                    depth / 2 + 0.01
                ), "forward");
            lens.parent = binocular;
            lens.material = MaterialFactory.createLensMaterial(scene, prefix);
            lenses.push(lens);
        }

        return { binocular, lenses };
    }

    /**
     * Создает броневой экран
     */
    static createArmorScreen(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        rotationX: number = 0,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const screen = MeshBuilder.CreateBox(`${prefix}ArmorScreen`, { width, height, depth }, scene);
        screen.position = position;
        screen.rotation.x = rotationX;
        screen.parent = chassis;
        screen.material = material;
        return screen;
    }

    /**
     * Создает шип (агрессивный элемент)
     */
    static createSpike(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        rotationZ: number = 0,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const spike = MeshBuilder.CreateBox(`${prefix}Spike`, { width, height, depth }, scene);
        spike.position = position;
        spike.rotation.z = rotationZ;
        spike.parent = chassis;
        spike.material = material;
        return spike;
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
        intake.position = position;
        intake.parent = chassis;
        intake.material = material;
        return intake;
    }

    /**
     * Создает воздухозаборник (цилиндрический)
     */
    static createIntakeCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const intake = MeshBuilder.CreateBox(`${prefix}Intake`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        intake.position = position;
                intake.parent = chassis;
        intake.material = MaterialFactory.createIntakeMaterial(scene, prefix);
        return intake;
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
     * Создает крыло (для scout/racer)
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
     * Создает диффузор (для racer)
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
     * Создает клиновидный нос
     */
    static createWedgeNose(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        rotationX: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const nose = MeshBuilder.CreateBox(`${prefix}Nose`, { width, height, depth }, scene);
        nose.position = position;
        nose.rotation.x = rotationX;
        nose.parent = chassis;
        nose.material = material;
        return nose;
    }

    /**
     * Создает наклонную броневую плиту
     */
    static createSlopedArmor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        rotationX: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const armor = MeshBuilder.CreateBox(`${prefix}SlopedArmor`, { width, height, depth }, scene);
        armor.position = position;
        armor.rotation.x = rotationX;
        armor.parent = chassis;
        armor.material = material;
        return armor;
    }

    /**
     * Создает угловой броневой элемент
     */
    static createCornerArmor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        size: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const corner = MeshBuilder.CreateBox(`${prefix}CornerArmor`, {
            width: size,
            height: size,
            depth: size
        }, scene);
        corner.position = position;
        corner.parent = chassis;
        corner.material = material;
        return corner;
    }

    /**
     * Создает энергетический генератор (сфера для shield)
     */
    static createEnergyGenerator(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        prefix: string = "preview"
    ): Mesh {
        const generator = MeshBuilder.CreateBox(`${prefix}ShieldGen`, {
            width: diameter,
            height: diameter,
            depth: diameter
        }, scene);
        generator.position = position;
        generator.parent = chassis;
        generator.material = MaterialFactory.createShieldGeneratorMaterial(scene, prefix);
        return generator;
    }

    /**
     * Создает энергетическую панель
     */
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
        panel.position = position;
        panel.parent = chassis;
        panel.material = MaterialFactory.createEnergyPanelMaterial(scene, index, prefix);
        return panel;
    }

    /**
     * Создает энергетическую катушку (тор)
     */
    static createEnergyCoil(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        _rotationX: number, // Не используется для Box, но оставлен для совместимости API
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const coil = MeshBuilder.CreateBox(`${prefix}Coil${index}`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        coil.position = position;
        // Box doesn't need rotation for rectangular design (rotationX не используется)
        coil.parent = chassis;
        coil.material = MaterialFactory.createEnergyCoilMaterial(scene, index, prefix);
        return coil;
    }

    /**
     * Создает энергетический порт
     */
    static createEnergyPort(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        _rotationX: number, // Не используется для Box, но оставлен для совместимости API
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const port = MeshBuilder.CreateBox(`${prefix}Port${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        port.position = position;
        // Box doesn't need rotation for rectangular design
        port.parent = chassis;
        port.material = MaterialFactory.createEnergyPortMaterial(scene, index, prefix);
        return port;
    }

    /**
     * Создает энергетический бустер
     */
    static createEnergyBooster(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        size: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const booster = MeshBuilder.CreateBox(`${prefix}EnergyBooster${index}`, {
            width: size,
            height: size,
            depth: size
        }, scene);
        booster.position = position;
        booster.parent = chassis;
        booster.material = MaterialFactory.createEnergyBoosterMaterial(scene, index, prefix);
        return booster;
    }

    /**
     * Создает платформу для дронов
     */
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
        const platform = MeshBuilder.CreateBox(`${prefix}DronePlatform${index}`, {
            width,
            height,
            depth
        }, scene);
        platform.position = position;
        platform.parent = chassis;
        platform.material = MaterialFactory.createDronePlatformMaterial(scene, index, prefix);
        return platform;
    }

    /**
     * Создает сенсорную панель
     */
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
        sensor.position = position;
        sensor.parent = chassis;
        sensor.material = MaterialFactory.createSensorMaterial(scene, index, prefix);
        return sensor;
    }

    /**
     * Создает оптический сенсор (цилиндрический для hover)
     */
    static createOpticalSensor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const sensor = MeshBuilder.CreateBox(`${prefix}Sensor${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        sensor.position = position;
                sensor.parent = chassis;
        sensor.material = MaterialFactory.createHoverSensorMaterial(scene, index, prefix);
        return sensor;
    }

    /**
     * Создает генератор невидимости (stealth)
     */
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
        generator.position = position;
        generator.parent = chassis;
        generator.material = MaterialFactory.createStealthGeneratorMaterial(scene, prefix);
        return generator;
    }

    /**
     * Создает реактивный двигатель (hover thruster)
     */
    static createThruster(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const thruster = MeshBuilder.CreateBox(`${prefix}Thruster${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        thruster.position = position;
        thruster.parent = chassis;
        thruster.material = MaterialFactory.createThrusterMaterial(scene, index, prefix);
        return thruster;
    }

    /**
     * Создает стабилизатор (для racer/hover)
     */
    static createStabilizer(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const stabilizer = MeshBuilder.CreateBox(`${prefix}Stabilizer`, { width, height, depth }, scene);
        stabilizer.position = position;
        stabilizer.parent = chassis;
        stabilizer.material = material;
        return stabilizer;
    }

    /**
     * Создает поплавок (для amphibious)
     */
    static createFloat(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const float = MeshBuilder.CreateBox(`${prefix}Float`, { width: diameter, height: height, depth: diameter }, scene);
        float.position = position;
        float.parent = chassis;
        float.material = material;
        return float;
    }

    /**
     * Создает водонепроницаемую панель
     */
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
        seal.position = position;
        seal.parent = chassis;
        seal.material = material;
        return seal;
    }

    /**
     * Создает command ауру (тор)
     */
    static createCommandAura(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        diameter: number,
        thickness: number,
        rotationX: number,
        prefix: string = "preview"
    ): Mesh {
        const aura = MeshBuilder.CreateBox(`${prefix}CommandAura`, {
            width: diameter,
            height: thickness,
            depth: diameter
        }, scene);
        aura.position = position;
        aura.rotation.x = rotationX;
        aura.parent = chassis;
        aura.material = MaterialFactory.createCommandAuraMaterial(scene, prefix);
        return aura;
    }

    /**
     * Создает командный модуль
     */
    static createCommandModule(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        prefix: string = "preview"
    ): Mesh {
        const module = MeshBuilder.CreateBox(`${prefix}CommandModule`, { width, height, depth }, scene);
        module.position = position;
        module.parent = chassis;
        module.material = MaterialFactory.createCommandModuleMaterial(scene, prefix);
        return module;
    }

    /**
     * Создает command антенну
     */
    static createCommandAntenna(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const antenna = MeshBuilder.CreateBox(`${prefix}CmdAntenna${index}`, {
            width: diameter,
            height: height,
            depth: diameter
        }, scene);
        antenna.position = position;
        antenna.parent = chassis;
        antenna.material = MaterialFactory.createCommandAntennaMaterial(scene, index, prefix);
        return antenna;
    }

    /**
     * Создает радиостанцию
     */
    static createRadio(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const radio = MeshBuilder.CreateBox(`${prefix}Radio${index}`, { width, height, depth }, scene);
        radio.position = position;
        radio.parent = chassis;
        radio.material = MaterialFactory.createRadioMaterial(scene, index, prefix);
        return radio;
    }

    /**
     * Создает сенсорную панель command
     */
    static createCommandSensor(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        index: number,
        prefix: string = "preview"
    ): Mesh {
        const sensor = MeshBuilder.CreateBox(`${prefix}CommandSensor${index}`, {
            width,
            height,
            depth
        }, scene);
        sensor.position = position;
        sensor.parent = chassis;
        sensor.material = MaterialFactory.createCommandSensorMaterial(scene, index, prefix);
        return sensor;
    }

    /**
     * Создает зеркало
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
     * Создает опорную лапу (для artillery)
     */
    static createSupportLeg(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        width: number,
        height: number,
        depth: number,
        material: StandardMaterial,
        prefix: string = "preview"
    ): Mesh {
        const leg = MeshBuilder.CreateBox(`${prefix}Leg`, { width, height, depth }, scene);
        leg.position = position;
        leg.parent = chassis;
        leg.material = material;
        return leg;
    }

    /**
     * Создает стабилизатор (цилиндрический для artillery)
     */
    static createStabilizerCylindrical(
        scene: Scene,
        chassis: Mesh,
        position: Vector3,
        height: number,
        diameter: number,
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
}

