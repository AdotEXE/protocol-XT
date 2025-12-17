/**
 * Tank Editor System
 * Редактор танков с визуальной настройкой компонентов
 * Позволяет игроку собирать танк из доступных частей с предпросмотром
 */

import { Scene, Vector3, Mesh, Color3, StandardMaterial } from "@babylonjs/core";
import { ChassisType, CannonType, CHASSIS_TYPES, CANNON_TYPES, getChassisById, getCannonById } from "../tankTypes";
import { TrackType, TRACK_TYPES, getTrackById } from "../trackTypes";
import { TankSkin, SKIN_PRESETS, getSkinById } from "./tankSkins";
import { createUniqueChassis } from "./tankChassis";
import { createUniqueCannon, CannonAnimationElements } from "./tankCannon";

/**
 * Конфигурация танка для редактора
 */
export interface TankConfiguration {
    chassisId: string;
    cannonId: string;
    trackId: string;
    skinId: string;
    name?: string; // Кастомное имя танка
}

/**
 * Результат сборки танка в редакторе
 */
export interface BuiltTank {
    chassis: Mesh;
    turret?: Mesh;
    barrel?: Mesh;
    configuration: TankConfiguration;
}

/**
 * Редактор танков с визуальным предпросмотром
 */
export class TankEditor {
    private scene: Scene;
    private previewScene: Scene | null = null;
    private currentConfiguration: TankConfiguration;
    private previewTank: BuiltTank | null = null;
    
    constructor(scene: Scene) {
        this.scene = scene;
        this.currentConfiguration = {
            chassisId: "medium",
            cannonId: "standard",
            trackId: "standard",
            skinId: "default"
        };
    }
    
    /**
     * Установить конфигурацию танка
     */
    setConfiguration(config: Partial<TankConfiguration>): void {
        this.currentConfiguration = {
            ...this.currentConfiguration,
            ...config
        };
    }
    
    /**
     * Получить текущую конфигурацию
     */
    getConfiguration(): TankConfiguration {
        return { ...this.currentConfiguration };
    }
    
    /**
     * Установить корпус
     */
    setChassis(chassisId: string): void {
        const chassis = getChassisById(chassisId);
        if (chassis) {
            this.currentConfiguration.chassisId = chassisId;
        }
    }
    
    /**
     * Установить пушку
     */
    setCannon(cannonId: string): void {
        const cannon = getCannonById(cannonId);
        if (cannon) {
            this.currentConfiguration.cannonId = cannonId;
        }
    }
    
    /**
     * Установить гусеницы
     */
    setTracks(trackId: string): void {
        const track = getTrackById(trackId);
        if (track) {
            this.currentConfiguration.trackId = trackId;
        }
    }
    
    /**
     * Установить скин
     */
    setSkin(skinId: string): void {
        const skin = getSkinById(skinId);
        if (skin) {
            this.currentConfiguration.skinId = skinId;
        }
    }
    
    /**
     * Собрать танк по текущей конфигурации
     */
    buildTank(position: Vector3 = Vector3.Zero()): BuiltTank {
        const chassisType = getChassisById(this.currentConfiguration.chassisId);
        const cannonType = getCannonById(this.currentConfiguration.cannonId);
        const skin = getSkinById(this.currentConfiguration.skinId) || SKIN_PRESETS[0];
        
        // Создаем корпус
        const chassis = createUniqueChassis(
            chassisType,
            this.scene,
            position,
            {} // Animation elements
        );
        
        // Применяем скин к корпусу
        if (chassis.material) {
            const skinColors = this.applySkinColors(skin);
            (chassis.material as StandardMaterial).diffuseColor = skinColors.chassisColor;
        }
        
        // Создаем башню
        const turretWidth = chassisType.width * 0.65;
        const turretHeight = chassisType.height * 0.75;
        const turretDepth = chassisType.depth * 0.6;
        
        const turret = MeshBuilder.CreateBox("turret", {
            width: turretWidth,
            height: turretHeight,
            depth: turretDepth
        }, this.scene);
        turret.position = new Vector3(0, chassisType.height / 2 + turretHeight / 2, 0);
        turret.parent = chassis;
        
        const turretMat = new StandardMaterial("turretMat", this.scene);
        const skinColors = this.applySkinColors(skin);
        turretMat.diffuseColor = skinColors.turretColor;
        turretMat.specularColor = Color3.Black();
        turret.material = turretMat;
        
        // Создаем пушку
        const barrelWidth = cannonType.barrelWidth;
        const barrelLength = cannonType.barrelLength;
        const baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        
        const animationElements: CannonAnimationElements = {};
        const barrel = createUniqueCannon(
            cannonType,
            this.scene,
            barrelWidth,
            barrelLength,
            animationElements
        );
        barrel.position = new Vector3(0, 0, baseBarrelZ);
        barrel.parent = turret;
        
        const builtTank: BuiltTank = {
            chassis,
            turret,
            barrel,
            configuration: { ...this.currentConfiguration }
        };
        
        return builtTank;
    }
    
    /**
     * Применить цвета скина
     */
    private applySkinColors(skin: TankSkin): { chassisColor: Color3; turretColor: Color3 } {
        return {
            chassisColor: Color3.FromHexString(skin.chassisColor),
            turretColor: Color3.FromHexString(skin.turretColor)
        };
    }
    
    /**
     * Сохранить конфигурацию танка
     */
    saveConfiguration(name: string): void {
        const savedTanks = this.loadSavedTanks();
        const newTank = {
            ...this.currentConfiguration,
            name: name || `Tank_${Date.now()}`
        };
        savedTanks.push(newTank);
        try {
            localStorage.setItem("savedTankConfigurations", JSON.stringify(savedTanks));
        } catch (e) {
            console.warn("Failed to save tank configuration:", e);
        }
    }
    
    /**
     * Загрузить сохраненные конфигурации танков
     */
    loadSavedTanks(): TankConfiguration[] {
        try {
            const saved = localStorage.getItem("savedTankConfigurations");
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn("Failed to load saved tank configurations:", e);
        }
        return [];
    }
    
    /**
     * Загрузить конфигурацию танка
     */
    loadConfiguration(config: TankConfiguration): void {
        this.setConfiguration(config);
    }
    
    /**
     * Получить все доступные корпуса
     */
    getAvailableChassis(): ChassisType[] {
        return CHASSIS_TYPES;
    }
    
    /**
     * Получить все доступные пушки
     */
    getAvailableCannons(): CannonType[] {
        return CANNON_TYPES;
    }
    
    /**
     * Получить все доступные гусеницы
     */
    getAvailableTracks(): TrackType[] {
        return TRACK_TYPES;
    }
    
    /**
     * Получить все доступные скины
     */
    getAvailableSkins(): TankSkin[] {
        return SKIN_PRESETS;
    }
    
    /**
     * Удалить сохраненную конфигурацию
     */
    deleteSavedConfiguration(index: number): void {
        const savedTanks = this.loadSavedTanks();
        if (index >= 0 && index < savedTanks.length) {
            savedTanks.splice(index, 1);
            try {
                localStorage.setItem("savedTankConfigurations", JSON.stringify(savedTanks));
            } catch (e) {
                console.warn("Failed to delete tank configuration:", e);
            }
        }
    }
}

// Импортируем необходимые типы
import { MeshBuilder } from "@babylonjs/core";

