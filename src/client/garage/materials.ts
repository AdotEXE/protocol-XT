/**
 * Material Factory for Garage 3D Preview
 * Создает различные типы материалов для деталей танков
 */

import { StandardMaterial, Scene, Color3 } from "@babylonjs/core";

export class MaterialFactory {
    private static materialCache: Map<string, StandardMaterial> = new Map();

    /**
     * Базовый материал с заданным цветом
     */
    static createBasicMaterial(scene: Scene, color: Color3, name: string = "basicMat"): StandardMaterial {
        const mat = new StandardMaterial(name, scene);
        mat.diffuseColor = color;
        return mat;
    }

    /**
     * Базовый материал для брони (темнее основного цвета)
     */
    static createArmorMaterial(scene: Scene, baseColor: Color3, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ArmorMat_${baseColor.r}_${baseColor.g}_${baseColor.b}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ArmorMat`, scene);
        mat.diffuseColor = baseColor.scale(0.65);
        mat.specularColor = Color3.Black();
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Акцентный материал (ярче основного цвета)
     */
    static createAccentMaterial(scene: Scene, baseColor: Color3, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}AccentMat_${baseColor.r}_${baseColor.g}_${baseColor.b}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}AccentMat`, scene);
        mat.diffuseColor = baseColor.scale(1.2);
        mat.specularColor = Color3.Black();
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для фар (с эмиссией)
     */
    static createHeadlightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}HeadlightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}HeadlightMat${index}`, scene);
        mat.diffuseColor = new Color3(0.9, 0.9, 0.7);
        mat.emissiveColor = new Color3(0.3, 0.3, 0.2);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для задних огней (красный с эмиссией)
     */
    static createTailLightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}TailLightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}TailLightMat${index}`, scene);
        mat.diffuseColor = new Color3(0.6, 0.1, 0.1);
        mat.emissiveColor = new Color3(0.3, 0.05, 0.05);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для боковых фар (оранжевый/желтый с эмиссией)
     */
    static createSideLightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}SideLightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}SideLightMat${index}`, scene);
        mat.diffuseColor = new Color3(0.7, 0.6, 0.3);
        mat.emissiveColor = new Color3(0.15, 0.12, 0.08);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для вентиляционных решеток (темный)
     */
    static createVentMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}VentMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}VentMat${index}`, scene);
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для верхних вентиляционных решеток на крыше
     */
    static createRoofVentMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}RoofVentMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}RoofVentMat${index}`, scene);
        mat.diffuseColor = new Color3(0.12, 0.12, 0.12);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для перископов (темно-серый)
     */
    static createPeriscopeMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}PeriscopeMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}PeriscopeMat${index}`, scene);
        mat.diffuseColor = new Color3(0.2, 0.2, 0.2);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для антенн (темно-серый)
     */
    static createAntennaMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}AntennaMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}AntennaMat`, scene);
        mat.diffuseColor = new Color3(0.25, 0.25, 0.25);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для оптических прицелов (темный)
     */
    static createSightMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}SightMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}SightMat`, scene);
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для линз прицелов (синий с эмиссией)
     */
    static createLensMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}LensMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}LensMat`, scene);
        mat.diffuseColor = new Color3(0.1, 0.2, 0.3);
        mat.emissiveColor = new Color3(0.05, 0.1, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для бинокля (темный)
     */
    static createBinocularMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}BinocularMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}BinocularMat`, scene);
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для выхлопных труб (темный с легкой эмиссией)
     */
    static createExhaustMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ExhaustMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ExhaustMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.05, 0.05);
        mat.emissiveColor = new Color3(0.1, 0.05, 0);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для выхлопного отверстия
     */
    static createExhaustHoleMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ExhaustHoleMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ExhaustHoleMat${index}`, scene);
        mat.diffuseColor = new Color3(0.05, 0.05, 0.05);
        mat.emissiveColor = new Color3(0.1, 0.05, 0);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Энергетический материал для shield генератора (зеленый с эмиссией)
     */
    static createShieldGeneratorMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ShieldGenMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ShieldGenMat`, scene);
        mat.diffuseColor = new Color3(0, 1, 0.6);
        mat.emissiveColor = new Color3(0, 0.6, 0.3);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Энергетический материал для панелей (зеленый с эмиссией)
     */
    static createEnergyPanelMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}EnergyPanelMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}EnergyPanelMat${index}`, scene);
        mat.diffuseColor = new Color3(0, 0.8, 0.4);
        mat.emissiveColor = new Color3(0, 0.3, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Энергетический материал для катушек (бирюзовый с эмиссией)
     */
    static createEnergyCoilMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}EnergyCoilMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}EnergyCoilMat${index}`, scene);
        mat.diffuseColor = new Color3(0, 0.7, 0.5);
        mat.emissiveColor = new Color3(0, 0.4, 0.25);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Энергетический материал для портов (бирюзовый с эмиссией)
     */
    static createEnergyPortMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}EnergyPortMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}EnergyPortMat${index}`, scene);
        mat.diffuseColor = new Color3(0, 0.6, 0.4);
        mat.emissiveColor = new Color3(0, 0.3, 0.2);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Энергетический материал для вентиляции (зеленоватый)
     */
    static createEnergyVentMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}EnergyVentMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}EnergyVentMat${index}`, scene);
        mat.diffuseColor = new Color3(0.12, 0.15, 0.12);
        mat.emissiveColor = new Color3(0.03, 0.05, 0.03);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для платформ дронов (фиолетовый с эмиссией)
     */
    static createDronePlatformMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}DronePlatformMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}PlatformMat${index}`, scene);
        mat.diffuseColor = new Color3(0.6, 0, 1);
        mat.emissiveColor = new Color3(0.35, 0, 0.7);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для сенсоров дронов (темно-синий с фиолетовой эмиссией)
     */
    static createSensorMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}SensorMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}SensorMat${index}`, scene);
        mat.diffuseColor = new Color3(0.1, 0.15, 0.25);
        mat.emissiveColor = new Color3(0.2, 0, 0.4);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для stealth генератора (темный с фиолетовой эмиссией)
     */
    static createStealthGeneratorMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}StealthMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}StealthMat`, scene);
        mat.diffuseColor = new Color3(0.15, 0.15, 0.15);
        mat.emissiveColor = new Color3(0.08, 0.08, 0.12);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для hover двигателей (голубой с эмиссией)
     */
    static createThrusterMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ThrusterMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ThrusterMat${index}`, scene);
        mat.diffuseColor = new Color3(0, 0.6, 1);
        mat.emissiveColor = new Color3(0, 0.4, 0.7);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для hover фар (белый с эмиссией)
     */
    static createHoverHeadlightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}HoverHeadlightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}HoverHeadlightMat${index}`, scene);
        mat.diffuseColor = new Color3(1.0, 1.0, 0.9);
        mat.emissiveColor = new Color3(0.5, 0.5, 0.3);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для hover сенсоров (темно-синий с эмиссией)
     */
    static createHoverSensorMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}HoverSensorMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}HoverSensorMat${index}`, scene);
        mat.diffuseColor = new Color3(0.1, 0.15, 0.2);
        mat.emissiveColor = new Color3(0.05, 0.08, 0.1);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для command ауры (желтый с эмиссией, без освещения)
     */
    static createCommandAuraMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}AuraMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}AuraMat`, scene);
        mat.diffuseColor = new Color3(1, 0.88, 0);
        mat.emissiveColor = new Color3(0.6, 0.5, 0);
        mat.disableLighting = true;
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для command модуля (золотой с эмиссией)
     */
    static createCommandModuleMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ModuleMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ModuleMat`, scene);
        mat.diffuseColor = new Color3(1, 0.9, 0.3);
        mat.emissiveColor = new Color3(0.3, 0.27, 0.1);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для command антенн (желтый)
     */
    static createCommandAntennaMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}CmdAntennaMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}CmdAntennaMat${index}`, scene);
        mat.diffuseColor = new Color3(1, 0.9, 0.2);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для радиостанций (золотистый с эмиссией)
     */
    static createRadioMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}RadioMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}RadioMat${index}`, scene);
        mat.diffuseColor = new Color3(0.8, 0.7, 0.2);
        mat.emissiveColor = new Color3(0.2, 0.15, 0.05);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для сенсорных панелей command (темно-синий с желтой эмиссией)
     */
    static createCommandSensorMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}CommandSensorMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}CommandSensorMat${index}`, scene);
        mat.diffuseColor = new Color3(0.1, 0.15, 0.2);
        mat.emissiveColor = new Color3(0.3, 0.25, 0);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для воздухозаборников (темный)
     */
    static createIntakeMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}IntakeMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}IntakeMat`, scene);
        mat.diffuseColor = new Color3(0.1, 0.1, 0.1);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для зеркал (темно-серый с оттенком)
     */
    static createMirrorMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}MirrorMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}MirrorMat${index}`, scene);
        mat.diffuseColor = new Color3(0.2, 0.2, 0.25);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для энергетических бустеров (синий с эмиссией)
     */
    static createEnergyBoosterMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}BoosterMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}BoosterMat${index}`, scene);
        mat.diffuseColor = new Color3(0.2, 0.4, 0.8);
        mat.emissiveColor = new Color3(0.1, 0.2, 0.4);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для stealth фар (темно-желтый с эмиссией)
     */
    static createStealthHeadlightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}StealthHeadlightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}StealthHeadlightMat${index}`, scene);
        mat.diffuseColor = new Color3(0.7, 0.7, 0.5);
        mat.emissiveColor = new Color3(0.15, 0.15, 0.1);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для stealth задних фар (темно-красный с эмиссией)
     */
    static createStealthTailLightMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}StealthTailLightMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}StealthTailLightMat${index}`, scene);
        mat.diffuseColor = new Color3(0.5, 0.08, 0.08);
        mat.emissiveColor = new Color3(0.2, 0.03, 0.03);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для stealth вентиляции (очень темный)
     */
    static createStealthVentMaterial(scene: Scene, index: number, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}StealthVentMat${index}`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}StealthVentMat${index}`, scene);
        mat.diffuseColor = new Color3(0.1, 0.1, 0.1);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Материал для прицела (темный, как у scope)
     */
    static createScopeMaterial(scene: Scene, prefix: string = "preview"): StandardMaterial {
        const key = `${prefix}ScopeMat`;
        if (this.materialCache.has(key)) {
            return this.materialCache.get(key)!;
        }

        const mat = new StandardMaterial(`${prefix}ScopeMat`, scene);
        mat.diffuseColor = new Color3(0.05, 0.05, 0.05);
        mat.emissiveColor = new Color3(0.15, 0.15, 0.15);
        this.materialCache.set(key, mat);
        return mat;
    }

    /**
     * Очистка кеша материалов
     */
    static clearCache(): void {
        this.materialCache.forEach(mat => mat.dispose());
        this.materialCache.clear();
    }
}

