// Garage System - HTML/CSS based UI for reliability
import {
    Color3,
    Mesh,
    Scene,
    StandardMaterial,
    Vector3
} from "@babylonjs/core";
import { MODULES } from "./config/moduleRegistry";
import { CurrencyManager } from "./currencyManager";
import { cleanupPreviewScene, initPreviewScene, updatePreviewTank, type PreviewScene, type PreviewTank } from "./garage/preview";
import {
    disposeTrajectoryVisualization,
    setTrajectoryVisibility
} from "./garage/trajectoryVisualization";
import { injectGarageStyles } from "./garage/ui";
import { TankConfiguration, TankEditor } from "./tank/tankEditor";
import { SKIN_PRESETS, applySkinColorToMaterial, applySkinToTank, getSkinById, loadSelectedSkin, saveSelectedSkin } from "./tank/tankSkins";
import { CANNON_TYPES, CHASSIS_TYPES, calculateDPS, getCannonById, getChassisById } from "./tankTypes";
import { TRACK_TYPES, getTrackById } from "./trackTypes";
import { upgradeUI } from "./upgrade";
import { inGameConfirm, inGamePrompt } from "./utils/inGameDialogs";
import { safeLocalStorage } from "./utils/safeLocalStorage";

// ============ INTERFACES ============

// Interfaces for external systems
export interface GarageTankController {
    chassis: Mesh;
    turret: Mesh;
    barrel: Mesh;
    respawn: () => void;
    setChassisType?: (id: string) => void;
    setCannonType?: (id: string) => void;
    setTrackType?: (id: string) => void;
}

export interface GarageSoundManager {
    play: (sound: string, volume?: number) => void;
    playGarageOpen?: () => void;
    playShoot?: (cannonType: string, position?: Vector3, velocity?: Vector3) => void;
}

export interface GarageChatSystem {
    success: (message: string, duration?: number) => void;
}

export interface GarageExperienceSystem {
    addExperience: (partId: string, type: "chassis" | "cannon", amount: number) => void;
}

export interface GaragePlayerProgression {
    addExperience: (amount: number) => void;
}

export interface TankUpgrade {
    id: string;
    name: string;
    description: string;
    cost: number;
    level: number;
    maxLevel: number;
    stat: "health" | "speed" | "armor" | "firepower" | "reload" | "damage";
    value: number;
}

export interface TankPart {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "chassis" | "turret" | "barrel" | "engine" | "module" | "supply" | "preset";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        firepower?: number;
        reload?: number;
        damage?: number;
        dps?: number;
    };
}

type CategoryType = "chassis" | "cannons" | "tracks" | "modules" | "supplies" | "shop" | "skins" | "presets" | "workshop" | "upgrade";

// ============ GARAGE CLASS ============
export class Garage {
    private _scene: Scene;
    private currencyManager: CurrencyManager;
    private isOpen: boolean = false;

    // External systems
    private _chatSystem: GarageChatSystem | null = null;
    private tankController: GarageTankController | null = null;
    private _experienceSystem: GarageExperienceSystem | null = null;
    private _playerProgression: GaragePlayerProgression | null = null;
    private soundManager: GarageSoundManager | null = null;
    private onCloseCallback: (() => void) | null = null;

    // HTML Elements
    private overlay: HTMLDivElement | null = null;

    // 3D Preview
    private previewSceneData: PreviewScene | null = null;
    private previewTank: PreviewTank | null = null;
    private previewTurretRotation: number = 0; // Угол поворота башни в предпросмотре
    private previewTurretKeysPressed: { z: boolean; x: boolean; c: boolean } = { z: false, x: false, c: false }; // Состояние клавиш
    private previewTurretAnimationFrame: number | null = null; // ID кадра анимации

    // State
    private currentCategory: CategoryType = "chassis";
    private currentChassisId: string = "medium";
    private currentCannonId: string = "standard";
    private currentTrackId: string = "standard";
    private currentSkinId: string = loadSelectedSkin() || "default";
    private selectedItemIndex: number = 0;
    private filteredItems: (TankPart | TankUpgrade)[] = [];
    private lastNavigationTime: number = 0; // Время последнего нажатия стрелки для определения скорости
    private tankEditor: TankEditor | null = null; // Редактор танков
    private savedTankConfigurations: TankConfiguration[] = []; // Сохраненные конфигурации

    // Filters
    private searchText: string = "";
    private sortBy: "name" | "stats" | "custom" | "unique" = "name";
    private filterMode: "all" | "owned" | "locked" = "all";

    // Pending changes (changes that need to be applied when entering garage)
    private pendingChassisId: string | null = null;
    private pendingCannonId: string | null = null;
    private pendingTrackId: string | null = null;
    private pendingSkinId: string | null = null;

    // Fallback для применения скина
    private skinApplyInterval: number | null = null;
    private lastAppliedSkinId: string | null = null;

    // Флаг что применение идёт из UI (чтобы GameGarage не применял одновременно)
    private isApplyingFromUI: boolean = false;

    // ============ DATA ============
    // Map для сохранения порядка корпусов из CHASSIS_TYPES
    private chassisOrderMap: Map<string, number> = new Map(CHASSIS_TYPES.map((chassis, index) => [chassis.id, index]));

    private chassisParts: TankPart[] = CHASSIS_TYPES.map(chassis => {
        // Balanced pricing based on stats and abilities
        // Formula: baseCost + (HP * 3) + (speed * 10) + (abilityBonus)
        const baseCost = 0;
        const hpMultiplier = 3;
        const speedMultiplier = 10;

        // Ability bonuses (special abilities add value)
        const abilityBonuses: Record<string, number> = {
            stealth: 150,    // Stealth is very useful
            hover: 100,      // Hover is useful for mobility
            siege: 200,      // Siege mode is powerful
            racer: 50,       // Speed boost is nice
            amphibious: 80,  // Water movement is situational
            shield: 120,     // Shield is defensive
            drone: 140,      // Drones are offensive support
            artillery: 100,  // Range boost is useful
            destroyer: 80,   // Damage boost is good
            command: 150    // Team buff is powerful
        };

        let cost = baseCost + (chassis.maxHealth * hpMultiplier) + (chassis.moveSpeed * speedMultiplier);
        if (chassis.specialAbility) {
            const bonus = abilityBonuses[chassis.specialAbility];
            if (bonus) cost += bonus;
        }

        // Round to nearest 50 for cleaner prices
        cost = Math.round(cost / 50) * 50;

        // Special cases for starter chassis
        if (chassis.id === "medium") {
            cost = 0; // Free starter
        } else if (chassis.id === "light") {
            cost = Math.min(cost, 400); // Cap at 400 for early game
        } else if (chassis.id === "scout") {
            cost = Math.min(cost, 500); // Cap at 500 for early game
        }

        const abilityText = chassis.specialAbility ? ` [Ability: ${chassis.specialAbility}]` : "";
        return {
            id: chassis.id, name: chassis.name, description: chassis.description + abilityText,
            cost: cost, unlocked: chassis.id === "medium",
            type: "chassis" as const,
            stats: { health: chassis.maxHealth, speed: chassis.moveSpeed, armor: chassis.maxHealth / 50 }
        };
    });

    private cannonParts: TankPart[] = CANNON_TYPES.map(cannon => {
        // Balanced pricing based on DPS and special effects
        // Formula: baseCost + (damage * 8) + (dps * 50) + (specialBonus)
        const baseCost = 0;
        const damageMultiplier = 8;
        const dpsMultiplier = 50;

        // ИСПРАВЛЕНО: Используем calculateDPS для единообразного расчета DPS
        const dps = calculateDPS(cannon);

        // Special effect bonuses
        const specialBonuses: Record<string, number> = {
            // Energy weapons (high tech)
            plasma: 200,
            laser: 150,  // Instant hit is valuable
            tesla: 180,  // Chain lightning is powerful
            railgun: 400, // Highest single shot damage

            // Explosive weapons (AoE)
            rocket: 150,
            mortar: 250,  // High AoE damage
            cluster: 100,  // Multi-hit
            explosive: 120,

            // Special effects (utility)
            flamethrower: 80,   // High DPS but close range
            acid: 100,          // Armor reduction
            freeze: 120,        // Slow is powerful
            poison: 90,          // DoT
            emp: 200,           // Ability disable is tactical

            // Multi-shot
            shotgun: 60,        // Close range
            multishot: 80,      // Good DPS

            // Advanced
            homing: 250,        // Auto-aim is valuable
            piercing: 150,       // Multi-hit
            shockwave: 120,     // Knockback
            beam: 140,          // Continuous damage
            vortex: 180,        // Pull effect

            // Support
            support: 160         // Healing is valuable
        };

        let cost = baseCost + (cannon.damage * damageMultiplier) + (dps * dpsMultiplier);
        const specialBonus = specialBonuses[cannon.id];
        if (specialBonus) {
            cost += specialBonus;
        }

        // Round to nearest 50 for cleaner prices
        cost = Math.round(cost / 50) * 50;

        // Special cases
        if (cannon.id === "standard") {
            cost = 0; // Free starter
        } else if (cannon.id === "rapid") {
            cost = Math.min(cost, 450); // Cap for early game
        } else if (cannon.id === "gatling") {
            cost = Math.min(cost, 550); // Cap for early game
        }

        return {
            id: cannon.id, name: cannon.name, description: cannon.description,
            cost: cost, unlocked: cannon.id === "standard",
            type: "barrel" as const,
            stats: { damage: cannon.damage, reload: cannon.cooldown, dps: parseFloat(dps.toFixed(1)) }
        };
    });

    private trackParts: TankPart[] = TRACK_TYPES.map(track => {
        const stats: any = {};
        if (track.stats.speedBonus) stats.speed = track.stats.speedBonus * 100;
        if (track.stats.durabilityBonus) stats.armor = track.stats.durabilityBonus * 100;
        if (track.stats.armorBonus) stats.armor = (stats.armor || 0) + track.stats.armorBonus * 100;

        return {
            id: track.id,
            name: track.name,
            description: track.description,
            cost: track.cost,
            unlocked: track.id === "standard",
            type: "module" as const,
            stats
        };
    });

    // УЛУЧШЕНО: Модули из централизованного хранилища (New Registry)
    private moduleParts: TankPart[] = MODULES.map(module => ({
        id: module.id,
        name: module.name,
        description: module.description,
        cost: module.price,
        unlocked: module.rarity === 'common', // Common items unlocked by default
        type: "module" as const,
        stats: {
            speed: module.stats.speedMultiplier ? (module.stats.speedMultiplier - 1) * 100 : undefined,
            armor: module.stats.armorMultiplier ? (module.stats.armorMultiplier - 1) * 100 : undefined,
            reload: module.stats.reloadMultiplier ? (1 - module.stats.reloadMultiplier) * 100 : undefined,
            health: module.stats.hpAdd
        }
    }));

    private supplyParts: TankPart[] = [
        { id: "medkit", name: "Repair Kit", description: "Restore 30 HP", cost: 50, unlocked: true, type: "supply", stats: { health: 30 } },
        { id: "speed_boost", name: "Nitro", description: "+50% speed 5s", cost: 75, unlocked: true, type: "supply", stats: { speed: 0.5 } },
        { id: "shield", name: "Shield", description: "Block 50 dmg", cost: 100, unlocked: false, type: "supply", stats: { armor: 50 } },
    ];

    private shopItems: TankPart[] = [
        { id: "premium_chassis", name: "Phantom", description: "Premium stealth", cost: 2000, unlocked: false, type: "chassis", stats: { health: 90, speed: 32 } },
        { id: "premium_cannon", name: "Devastator", description: "Premium heavy", cost: 2500, unlocked: false, type: "barrel", stats: { damage: 60, reload: 4500 } },
    ];

    private upgrades: TankUpgrade[] = [
        { id: "health_1", name: "Health +20", description: "Max HP", cost: 200, level: 0, maxLevel: 5, stat: "health", value: 20 },
        { id: "speed_1", name: "Speed +2", description: "Move speed", cost: 250, level: 0, maxLevel: 5, stat: "speed", value: 2 },
        { id: "damage_1", name: "Damage +5", description: "Weapon dmg", cost: 300, level: 0, maxLevel: 5, stat: "damage", value: 5 },
    ];

    // ============ CONSTRUCTOR ============
    constructor(scene: Scene, currencyManager: CurrencyManager) {
        this._scene = scene;
        this.currencyManager = currencyManager;
        this.loadProgress();
        injectGarageStyles();
        this.setupKeyboardNavigation();

        // Инициализируем редактор танков
        this.tankEditor = new TankEditor(scene);
        this.loadSavedTankConfigurations();

        // Загружаем pending изменения из localStorage
        this.pendingChassisId = safeLocalStorage.get("pendingChassis") || null;
        this.pendingCannonId = safeLocalStorage.get("pendingCannon") || null;
        this.pendingTrackId = safeLocalStorage.get("pendingTrack") || null;
        this.pendingSkinId = safeLocalStorage.get("pendingSkin") || null;

        console.log("[Garage] HTML-based garage initialized");
    }

    // ============ STYLES ============
    // FUTURE: Styles are injected via injectGarageStyles() from garage/ui.ts
    // This method is reserved for future use
    // @ts-ignore - Reserved for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _injectStyles(): void {
        if (document.getElementById('garage-styles')) return;

        const style = document.createElement('style');
        style.id = 'garage-styles';
        style.textContent = `
            .garage-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 10, 0, 0.95);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                font-family: 'Press Start 2P', monospace;
                animation: fadeIn 0.3s ease-out;
                cursor: default;
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .garage-container {
                width: min(90vw, 1400px);
                height: min(85vh, 900px);
                max-width: 90vw;
                max-height: 85vh;
                background: rgba(5, 15, 5, 0.98);
                cursor: default;
                border: clamp(1px, 0.15vw, 2px) solid #0f0;
                display: flex;
                flex-direction: column;
                animation: slideUp 0.3s ease-out;
                box-shadow: 0 0 clamp(20px, 2vw, 30px) rgba(0, 255, 0, 0.3);
            }
            .garage-header {
                height: clamp(35px, 4vh, 45px);
                background: rgba(0, 30, 0, 0.9);
                border-bottom: clamp(1px, 0.15vw, 2px) solid #0f0;
                display: flex;
                align-items: center;
                padding: 0 clamp(10px, 1.5vw, 15px);
                justify-content: space-between;
                flex-shrink: 0;
            }
            .garage-title {
                color: #0f0;
                font-size: clamp(16px, 2vw, 20px);
                font-weight: bold;
            }
            .garage-currency {
                color: #ff0;
                font-size: clamp(12px, 1.5vw, 15px);
                background: rgba(0,0,0,0.5);
                padding: clamp(3px, 0.4vh, 4px) clamp(8px, 1.2vw, 12px);
                border: clamp(1px, 0.1vw, 1px) solid #ff0;
            }
            .garage-close {
                color: #f00;
                font-size: clamp(16px, 2vw, 20px);
                cursor: pointer;
                padding: clamp(3px, 0.4vh, 4px) clamp(6px, 0.8vw, 8px);
                border: clamp(1px, 0.1vw, 1px) solid #f00;
                background: transparent;
            }
            .garage-close:hover { background: rgba(255,0,0,0.3); }
            .garage-tabs {
                height: clamp(30px, 3.5vh, 35px);
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                border-bottom: clamp(1px, 0.1vw, 1px) solid #080;
                flex-shrink: 0;
            }
            .garage-tab {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #080;
                font-size: clamp(9px, 1.1vw, 11px);
                cursor: pointer;
                border-right: clamp(1px, 0.1vw, 1px) solid #040;
                transition: all 0.2s ease;
                position: relative;
            }
            .garage-tab:hover {
                background: rgba(0,255,0,0.1);
                color: #0f0;
                transform: translateY(-1px);
            }
            .garage-tab.active {
                background: rgba(0,255,0,0.2);
                color: #0f0;
                font-weight: bold;
                box-shadow: inset 0 -2px 0 #0f0;
            }
            .garage-tab.active::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: #0f0;
            }
            .garage-content {
                flex: 1;
                display: flex;
                overflow: hidden;
                min-height: 0;
            }
            .garage-left {
                width: 45%;
                border-right: 1px solid #080;
                display: flex;
                flex-direction: column;
                min-width: 0;
            }
            .garage-search {
                padding: 8px;
                border-bottom: 1px solid #040;
                flex-shrink: 0;
            }
            .garage-search input {
                width: 100%;
                background: rgba(0,0,0,0.5);
                border: 1px solid #0aa;
                color: #0f0;
                padding: 6px;
                font-family: inherit;
                font-size: 11px;
            }
            .garage-filters {
                padding: 4px 8px;
                display: flex;
                gap: 4px;
                border-bottom: 1px solid #040;
                flex-shrink: 0;
            }
            .garage-filter-btn {
                padding: 3px 10px;
                background: rgba(0,0,0,0.5);
                border: 1px solid #080;
                color: #080;
                cursor: pointer;
                font-size: 9px;
            }
            .garage-filter-btn.active { border-color: #0f0; color: #0f0; background: rgba(0,255,0,0.2); }
            .garage-sort-btn {
                padding: 3px 8px;
                background: rgba(0,255,255,0.1);
                border: 1px solid #0aa;
                color: #0aa;
                cursor: pointer;
                font-size: 9px;
            }
            .garage-sort-btn:hover { border-color: #0ff; color: #0ff; background: rgba(0,255,255,0.2); }
            .garage-items {
                flex: 1;
                overflow-y: auto;
                padding: 8px;
                min-height: 0;
            }
            .garage-item {
                padding: 8px;
                margin-bottom: 6px;
                background: rgba(0,0,0,0.4);
                border: 1px solid #040;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 60px;
                position: relative;
            }
            .garage-item:hover {
                border-color: #0a0;
                background: rgba(0,255,0,0.08);
                transform: translateX(2px);
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.2);
            }
            .garage-item.selected {
                border-color: #0f0;
                background: rgba(0,255,0,0.15);
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
            }
            .garage-item.equipped {
                border-color: #0ff;
                box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
            }
            .garage-item-name { color: #0f0; font-size: clamp(10px, 1.2vw, 12px); font-weight: bold; }
            .garage-item-desc { color: #080; font-size: clamp(8px, 1vw, 10px); margin-top: clamp(2px, 0.3vh, 3px); }
            .garage-item-stats { color: #0aa; font-size: clamp(8px, 0.9vw, 9px); margin-top: clamp(3px, 0.4vh, 4px); }
            .garage-item-price { color: #ff0; font-size: clamp(9px, 1.1vw, 11px); float: right; }
            .garage-item.owned .garage-item-price { color: #0f0; }
            .new-badge {
                display: inline-block;
                background: linear-gradient(135deg, #ff0, #ff8800);
                color: #000;
                font-weight: bold;
                font-size: clamp(7px, 0.8vw, 9px);
                padding: 2px 4px;
                border-radius: 3px;
                margin-right: 4px;
                animation: pulse 2s infinite;
                text-shadow: none;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.05); }
            }
            .garage-item.new-item {
                border-left: 3px solid #ff0;
            }
            .garage-right {
                width: 55%;
                display: flex;
                flex-direction: column;
                padding: 8px;
                min-width: 0;
            }
            .garage-right-default {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-height: 0;
            }
            .garage-upgrade-container {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
            }
            .garage-preview {
                height: 40%;
                background: rgba(0,20,0,0.5);
                border: 1px solid #080;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 8px;
                flex-shrink: 0;
                position: relative;
                overflow: hidden;
            }
            .garage-preview::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(0,255,0,0.1), transparent);
                animation: scan 3s infinite;
                pointer-events: none; /* ИСПРАВЛЕНО: Не блокировать события мыши для 3D превью */
                z-index: 5; /* Ниже чем canvas (z-index: 10) */
            }
            @keyframes scan {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            .garage-preview-title {
                color: #080;
                font-size: 9px;
                position: relative; /* Нужно для z-index */
                z-index: 15; /* Выше canvas */
                text-transform: uppercase;
                letter-spacing: 2px;
                pointer-events: none; /* Не блокировать события мыши */
            }
            .garage-preview-info {
                color: #0f0;
                font-size: 13px;
                margin: 8px 0;
                position: relative; /* Нужно для z-index */
                z-index: 15; /* Выше canvas */
                text-align: center;
                line-height: 1.6;
                pointer-events: none; /* Не блокировать события мыши */
            }
            .garage-preview-canvas {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                opacity: 1.0;
                pointer-events: auto;
                z-index: 10;
            }
            .garage-details {
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid #080;
                padding: 10px;
                overflow-y: auto;
                min-height: 0;
            }
            .garage-details-title { color: #0f0; font-size: clamp(12px, 1.4vw, 14px); font-weight: bold; margin-bottom: clamp(6px, 0.8vh, 8px); }
            .garage-details-desc { color: #0a0; font-size: clamp(9px, 1.1vw, 11px); margin-bottom: clamp(8px, 1vh, 10px); }
            .garage-stats-row { display: flex; justify-content: space-between; padding: clamp(3px, 0.4vh, 4px) 0; border-bottom: clamp(1px, 0.1vw, 1px) solid #030; }
            .garage-stat-name { color: #0aa; font-size: clamp(8px, 1vw, 10px); }
            .garage-stat-value { color: #0f0; font-size: clamp(8px, 1vw, 10px); }
            .garage-stat-change.positive { color: #0f0; }
            .garage-stat-change.negative { color: #f00; }
            .garage-action-btn {
                width: 100%;
                padding: clamp(8px, 1vh, 10px);
                margin-top: clamp(8px, 1vh, 10px);
                background: rgba(0,255,0,0.2);
                border: clamp(1px, 0.15vw, 2px) solid #0f0;
                color: #0f0;
                font-size: clamp(10px, 1.2vw, 12px);
                font-weight: bold;
                cursor: pointer;
                font-family: inherit;
            }
            .garage-action-btn:hover { background: rgba(0,255,0,0.3); }
            .garage-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .garage-footer {
                height: clamp(25px, 3vh, 30px);
                background: rgba(0, 20, 0, 0.8);
                border-top: clamp(1px, 0.1vw, 1px) solid #080;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #060;
                font-size: clamp(8px, 0.9vw, 9px);
                flex-shrink: 0;
            }

            @media (max-width: 768px) {
                .garage-container {
                    width: 95vw;
                    height: 90vh;
                }
                .garage-left, .garage-right {
                    width: 100% !important;
                }
                .garage-content {
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ============ EXTERNAL SETTERS ============
    setChatSystem(chatSystem: any): void { this._chatSystem = chatSystem; }
    setTankController(tankController: any): void { this.tankController = tankController; }
    setExperienceSystem(experienceSystem: any): void { this._experienceSystem = experienceSystem; }
    setSoundManager(soundManager: any): void { this.soundManager = soundManager; }
    setPlayerProgression(playerProgression: any): void { this._playerProgression = playerProgression; }
    setOnCloseCallback(callback: () => void): void { this.onCloseCallback = callback; }
    setGuiTexture(_texture: any): void { /* Not needed for HTML version */ }
    getGUI(): any { return null; }

    // ============ PARTS APPLICATION ============
    /**
     * Применить выбранные части танка НЕМЕДЛЕННО (переодевание)
     * Использует respawn() для пересоздания танка с новыми частями
     */
    private applyPartsToTankNow(): boolean {
        // Получаем танк через глобальный доступ (пробуем все способы)
        const game = (window as any).gameInstance;
        let tank = this.tankController || game?.tank || (window as any).game?.tank;

        if (!tank) {
            console.error(`[GARAGE] ❌ Cannot find tank! Trying alternative methods...`);
            // Пробуем через другие пути
            tank = (window as any).tank || (window as any)._tank;
            if (!tank) {
                console.error(`[GARAGE] ❌ Still cannot find tank! Aborting.`);
                return false;
            }
        }

        // Получаем pending изменения
        const pending = {
            chassisId: this.pendingChassisId || safeLocalStorage.get("pendingChassis") || null,
            cannonId: this.pendingCannonId || safeLocalStorage.get("pendingCannon") || null,
            trackId: this.pendingTrackId || safeLocalStorage.get("pendingTrack") || null
        };

        if (!pending.chassisId && !pending.cannonId && !pending.trackId) {
            return false;
        }

        // Сохраняем выбранные части в localStorage (чтобы respawn использовал их)
        if (pending.chassisId) {
            safeLocalStorage.set("selectedChassis", pending.chassisId);
        }
        if (pending.cannonId) {
            safeLocalStorage.set("selectedCannon", pending.cannonId);
        }
        if (pending.trackId) {
            safeLocalStorage.set("selectedTrack", pending.trackId);
        }

        // Сохраняем текущую позицию
        const currentPos = tank.chassis?.position?.clone() || new Vector3(0, 1.2, 0);

        // Сохраняем старые типы для определения изменений
        const oldChassisId = tank.chassisType?.id || "";
        const oldCannonId = tank.cannonType?.id || "";
        const oldTrackId = tank.trackType?.id || "";

        // Определяем какие части изменились (для анимации)
        const applied = {
            chassis: !!pending.chassisId && pending.chassisId !== oldChassisId,
            cannon: !!pending.cannonId && pending.cannonId !== oldCannonId,
            track: !!pending.trackId && pending.trackId !== oldTrackId,
            skin: false
        };

        // Вызываем respawn для пересоздания танка с новыми частями
        if (typeof tank.respawn === 'function') {
            // Временно устанавливаем callback для сохранения позиции
            const originalCallback = tank.respawnPositionCallback;
            tank.setRespawnPositionCallback(() => {
                return currentPos;
            });

            // Вызываем respawn
            tank.respawn();

            // Восстанавливаем callback
            if (originalCallback) {
                tank.setRespawnPositionCallback(originalCallback);
            } else {
                tank.respawnPositionCallback = null;
            }

            // Запускаем анимацию смены частей (если есть изменённые части)
            // КРИТИЧНО: Анимация ТОЛЬКО если танк находится внутри гаража (не на потолке/крыше)
            if ((applied.chassis || applied.cannon || applied.track) && typeof (tank as any).playPartChangeAnimation === 'function') {
                // Проверяем, что танк находится внутри гаража перед запуском анимации
                const game = (window as any).gameInstance;
                const gameGarage = game?.gameGarage;
                const isInGarage = gameGarage && typeof gameGarage.isPlayerInAnyGarage === 'function' && gameGarage.isPlayerInAnyGarage();

                if (isInGarage) {
                    // Небольшая задержка, чтобы части успели пересоздаться
                    setTimeout(() => {
                        // Повторная проверка перед запуском анимации (на случай если танк переместился)
                        const stillInGarage = gameGarage && typeof gameGarage.isPlayerInAnyGarage === 'function' && gameGarage.isPlayerInAnyGarage();
                        if (stillInGarage) {
                            (tank as any).playPartChangeAnimation(applied, () => { });
                        }
                    }, 100);
                }
            } else {
                // Если анимации нет, всё равно разблокируем башню
                if (tank.turret) {
                    tank.isKeyboardTurretControl = false;
                    tank.isAutoCentering = false;
                    if ((window as any).gameInstance) {
                        (window as any).gameInstance.virtualTurretTarget = null;
                        (window as any).gameInstance.isFreeLook = false;
                    }
                }
            }

            // Очищаем pending ТОЛЬКО если гараж закрыт (иначе пользователь не успеет закрыть)
            if (!this.isOpen) {
                this.pendingChassisId = null;
                this.pendingCannonId = null;
                this.pendingTrackId = null;
                safeLocalStorage.remove("pendingChassis");
                safeLocalStorage.remove("pendingCannon");
                safeLocalStorage.remove("pendingTrack");
            }

            safeLocalStorage.remove("pendingTrack");


            // Send RPC to notify other players of the look change
            // Using global gameInstance access as Garage uses it elsewhere
            const gameInstance = (window as any).gameInstance;
            if (gameInstance && gameInstance.multiplayerManager) {
                gameInstance.multiplayerManager.sendRpc("DRESS_UPDATE", {
                    chassisType: tank.chassisType.id,
                    cannonType: tank.cannonType.id,
                    trackType: tank.trackType?.id || safeLocalStorage.get("selectedTrack", "standard"),
                    tankColor: tank.tankColor || safeLocalStorage.get("selectedColor", "#00ff00"),
                    turretColor: tank.turretColor || safeLocalStorage.get("selectedTurretColor", "#888888")
                });
            }

            return true;
        } else {
            console.error(`[GARAGE] ❌ tank.respawn is not a function!`);
            return false;
        }
    }

    // ============ SKIN APPLICATION ============
    /**
     * Применить выбранный скин к танку СЕЙЧАС
     * Использует все возможные способы получить доступ к танку
     */
    private applySkinToTankNow(skinId?: string): boolean {
        const targetSkinId = skinId || loadSelectedSkin();
        if (!targetSkinId) {
            return false;
        }

        // Способ 1: через this.tankController
        let tank = this.tankController;

        // Способ 2: через глобальный gameInstance
        if (!tank) {
            const game = (window as any).gameInstance;
            tank = game?.tank;
        }

        // Способ 3: через window.game
        if (!tank) {
            tank = (window as any).game?.tank;
        }

        if (!tank) {
            console.warn(`[SKIN] Cannot find tank! tankController=${!!this.tankController}, gameInstance=${!!(window as any).gameInstance}`);
            return false;
        }

        const skin = getSkinById(targetSkinId);
        if (!skin) {
            console.warn(`[SKIN] Skin not found: ${targetSkinId}`);
            return false;
        }

        const skinColors = applySkinToTank(skin);

        let applied = false;

        // Применяем к chassis
        if (tank.chassis?.material) {
            applySkinColorToMaterial(tank.chassis.material as StandardMaterial, skinColors.chassisColor);
            applied = true;
        }

        // Применяем к turret
        if (tank.turret?.material) {
            applySkinColorToMaterial(tank.turret.material as StandardMaterial, skinColors.turretColor);
            applied = true;
        }

        if (applied) {
            this.lastAppliedSkinId = targetSkinId;

            // Sync skin colors to other players via RPC
            const gameInstance = (window as any).gameInstance;
            if (gameInstance?.multiplayerManager?.sendRpc) {
                const chassisId = safeLocalStorage.get("selectedChassis", "medium");
                const cannonId = safeLocalStorage.get("selectedCannon", "standard");
                const trackId = safeLocalStorage.get("selectedTrack", "standard");
                gameInstance.multiplayerManager.sendRpc("DRESS_UPDATE", {
                    chassisType: chassisId,
                    cannonType: cannonId,
                    trackType: trackId,
                    tankColor: skinColors.chassisColor,
                    turretColor: skinColors.turretColor,
                });
            }
        }

        return applied;
    }

    /**
     * Запустить fallback интервал для применения скина
     */
    private startSkinFallback(): void {
        // Останавливаем предыдущий интервал если есть
        this.stopSkinFallback();

        // Проверяем и применяем скин каждые 500ms
        this.skinApplyInterval = window.setInterval(() => {
            const selectedSkinId = loadSelectedSkin();
            if (selectedSkinId && selectedSkinId !== this.lastAppliedSkinId) {
                if (this.applySkinToTankNow(selectedSkinId)) {
                    this.lastAppliedSkinId = selectedSkinId;
                }
            }
        }, 500);
    }

    /**
     * Остановить fallback интервал
     */
    private stopSkinFallback(): void {
        if (this.skinApplyInterval !== null) {
            clearInterval(this.skinApplyInterval);
            this.skinApplyInterval = null;
            this.lastAppliedSkinId = null;
        }
    }

    // ============ PERSISTENCE ============
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem("tx_garage_progress");
            if (saved) {
                const progress = JSON.parse(saved);
                [...this.chassisParts, ...this.cannonParts, ...this.trackParts, ...this.moduleParts, ...this.supplyParts].forEach(part => {
                    if (progress.unlocked?.includes(part.id)) part.unlocked = true;
                });
                if (progress.upgrades) {
                    this.upgrades.forEach(u => {
                        if (progress.upgrades[u.id] !== undefined) u.level = progress.upgrades[u.id];
                    });
                }
                if (progress.currentChassis) this.currentChassisId = progress.currentChassis;
                if (progress.currentCannon) this.currentCannonId = progress.currentCannon;
                if (progress.currentTrack) this.currentTrackId = progress.currentTrack;
            }
        } catch (e) { console.warn("[Garage] Load failed:", e); }
    }

    private saveProgress(): void {
        try {
            const unlocked = [...this.chassisParts, ...this.cannonParts, ...this.trackParts, ...this.moduleParts, ...this.supplyParts]
                .filter(p => p.unlocked).map(p => p.id);
            const upgrades: Record<string, number> = {};
            this.upgrades.forEach(u => { upgrades[u.id] = u.level; });
            localStorage.setItem("tx_garage_progress", JSON.stringify({
                unlocked, upgrades,
                currentChassis: this.currentChassisId,
                currentCannon: this.currentCannonId,
                currentTrack: this.currentTrackId
            }));
        } catch (e) { console.warn("[Garage] Save failed:", e); }
    }

    // Публичный метод для принудительного сохранения
    public forceSave(): void {
        this.saveProgress();
    }

    // ============ PUBLIC API ============
    isGarageOpen(): boolean { return this.isOpen; }
    getIsApplyingFromUI(): boolean { return this.isApplyingFromUI; }

    open(initialCategory?: CategoryType): void {
        if (this.isOpen) return;
        console.log("[Garage] Opening HTML garage...");

        // Show cursor and unlock pointer lock
        this.showCursor();

        this.isOpen = true;

        // Загружаем pending изменения из localStorage
        this.pendingChassisId = safeLocalStorage.get("pendingChassis") || null;
        this.pendingCannonId = safeLocalStorage.get("pendingCannon") || null;
        this.pendingTrackId = safeLocalStorage.get("pendingTrack") || null;
        this.pendingSkinId = safeLocalStorage.get("pendingSkin") || null;

        // Текущие выбранные - показываем pending если есть, иначе активные
        this.currentChassisId = this.pendingChassisId || safeLocalStorage.get("selectedChassis", "medium");
        this.currentCannonId = this.pendingCannonId || safeLocalStorage.get("selectedCannon", "standard");
        this.currentTrackId = this.pendingTrackId || safeLocalStorage.get("selectedTrack", "standard");

        // Применяем выбранный скин при открытии гаража (если есть)
        const selectedSkinId = loadSelectedSkin();
        if (selectedSkinId) {
            // Пробуем применить сразу и через небольшую задержку (на случай если танк ещё не готов)
            this.applySkinToTankNow(selectedSkinId);
            setTimeout(() => {
                this.applySkinToTankNow(selectedSkinId);
            }, 200);
        }

        this.createUI();

        // Сбрасываем угол поворота башни и состояние клавиш при открытии гаража
        this.previewTurretRotation = 0;
        this.previewTurretKeysPressed = { z: false, x: false, c: false };

        // Останавливаем анимацию, если она была запущена
        if (this.previewTurretAnimationFrame !== null) {
            cancelAnimationFrame(this.previewTurretAnimationFrame);
            this.previewTurretAnimationFrame = null;
        }

        // Initialize 3D preview after UI is created
        setTimeout(() => {
            this.init3DPreview();
            // Применяем угол поворота башни после инициализации
            if (this.previewTank && this.previewTank.turret) {
                this.previewTank.turret.rotation.y = this.previewTurretRotation;
            }
        }, 100);

        // Показываем уведомление если есть pending изменения (кроме скинов - они применяются сразу)
        const hasNonSkinPending = this.pendingChassisId || this.pendingCannonId || this.pendingTrackId;
        if (hasNonSkinPending) {
            setTimeout(() => {
                this.showNotification("⚠️ Есть ожидающие изменения! Заедьте в гараж на карте для применения.", "info");
            }, 500);
        }

        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();

        // Запускаем fallback интервал для применения скина
        this.startSkinFallback();

        // Открыть на вкладке «ПРОКАЧКА», если запрошено (например из древа навыков)
        if (initialCategory === 'upgrade') {
            setTimeout(() => this.switchCategory('upgrade'), 50);
        }
        console.log("[Garage] Opened");
    }

    close(): void {
        if (!this.isOpen) {
            return;
        }

        console.log("[Garage] Closing garage...");

        // НЕ очищаем обработчики клавиатуры при закрытии - они остаются активными
        // и проверяют this.isOpen, так что не будут обрабатывать события когда гараж закрыт
        // Обработчики будут очищены только при уничтожении гаража (если нужно)

        // Останавливаем анимацию вращения башни
        if (this.previewTurretAnimationFrame !== null) {
            cancelAnimationFrame(this.previewTurretAnimationFrame);
            this.previewTurretAnimationFrame = null;
        }

        // Сбрасываем состояние клавиш
        this.previewTurretKeysPressed = { z: false, x: false, c: false };

        // КРИТИЧНО: Применяем pending изменения в зависимости от наличия гаражей на карте
        try {
            const hasPending = this.hasPendingChanges();

            if (hasPending) {
                // Проверяем, есть ли на карте гаражи
                const game = (window as any).gameInstance;
                const gameGarage = game?.gameGarage;
                const mapHasGarages = gameGarage && typeof gameGarage.mapHasGarages === 'function' && gameGarage.mapHasGarages();

                if (mapHasGarages) {
                    // На карте есть гаражи - изменения будут применены при въезде в гараж
                    this.showNotification("⚠️ Заедьте в гараж на карте для применения изменений!", "info");
                } else {
                    // На карте НЕТ гаражей - применяем изменения сразу на месте
                    console.log("[Garage] No garages on map, applying changes in place...");
                    if (gameGarage && typeof gameGarage.applyPendingChangesInPlace === 'function') {
                        gameGarage.applyPendingChangesInPlace();
                        this.showNotification("✅ Оборудование установлено!", "success");
                    } else {
                        // Fallback: пробуем применить напрямую
                        this.applyPartsToTankNow();
                    }
                }
            }
        } catch (error) {
            console.error("[Garage] ❌ Error applying parts on close:", error);
            this.showNotification("❌ Ошибка при менении деталей", "error");
        } finally {
            this.isApplyingFromUI = false;
        }

        // Останавливаем fallback интервал
        this.stopSkinFallback();

        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Правильный порядок очистки
        // 1. Сначала устанавливаем флаг isOpen = false
        this.isOpen = false;

        // 2. Останавливаем все анимации и таймеры preview
        try {
            if (this.previewSceneData?.animationGroups) {
                this.previewSceneData.animationGroups.forEach(ag => {
                    try {
                        ag.stop();
                    } catch (e) {
                        // ignore
                    }
                });
            }
        } catch (error) {
            console.error("[Garage] Error stopping animations:", error);
        }

        // 3. Очищаем 3D preview (самый критичный шаг)
        // Делаем это ДО удаления DOM элементов, чтобы корректно отвязать canvas
        try {
            this.cleanup3DPreview();
        } catch (error) {
            console.error("[Garage] Error cleaning up 3D preview:", error);
        }

        // 4. Удаляем overlay (проверяем существование)
        try {
            if (this.overlay) {
                if (this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                } else if (this.overlay.parentElement) {
                    this.overlay.parentElement.removeChild(this.overlay);
                } else {
                    this.overlay.remove();
                }
            }
        } catch (error) {
            console.error("[Garage] Error removing overlay:", error);
        } finally {
            // Гарантированно зануляем ссылку
            this.overlay = null;
        }

        // 5. Скрываем курсор (возвращаем управление игре)
        try {
            this.hideCursor();
        } catch (error) {
            console.error("[Garage] Error hiding cursor:", error);
        }

        // 6. Воспроизводим звук (опционально)
        try {
            if (this.soundManager?.playGarageOpen) {
                this.soundManager.playGarageOpen();
            }
        } catch (error) {
            // ignore
        }

        // 7. НЕ меняем состояние паузы при закрытии гаража
        // Игра должна оставаться в том же состоянии (пауза/не пауза), что и была
        // Гараж не должен влиять на состояние паузы игры

        // 8. ВЫЗЫВАЕМ CALLBACK В САМОМ КОНЦЕ (после всей очистки)
        try {
            if (this.onCloseCallback) {
                const callback = this.onCloseCallback;
                this.onCloseCallback = null; // Очищаем перед вызовом
                callback();
            }
        } catch (error) {
            console.error("[Garage] Error in close callback:", error);
        }

        console.log("[Garage] Closed successfully");
    }

    // ============ 3D PREVIEW ============
    private init3DPreview(): void {
        const previewContainer = this.overlay?.querySelector('.garage-preview');
        if (!previewContainer) {
            console.warn("[Garage] Preview container not found");
            return;
        }

        // Initialize preview scene using module
        this.previewSceneData = initPreviewScene(previewContainer as HTMLElement, this.soundManager ?? undefined); // [Opus 4.6] Convert null to undefined

        if (this.previewSceneData && this.previewSceneData.scene) {
            // Initial render
            this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        }
    }

    private renderTankPreview(chassisId: string, cannonId: string): void {
        if (!this.previewSceneData || !this.previewSceneData.scene) {
            console.warn("[Garage] Preview scene not initialized");
            return;
        }

        // Сохраняем текущий угол поворота башни перед обновлением
        const savedTurretRotation = this.previewTurretRotation;

        // Use module function to create/update preview tank
        this.previewTank = updatePreviewTank(
            this.previewTank,
            chassisId,
            cannonId,
            this.currentTrackId,
            this.previewSceneData.scene
        );

        // Update previewSceneData properties for shooting logic
        if (this.previewSceneData) {
            this.previewSceneData.tank = this.previewTank;
            this.previewSceneData.cannonId = cannonId;
        }

        // Восстанавливаем угол поворота башни после обновления
        if (this.previewTank && this.previewTank.turret) {
            this.previewTank.turret.rotation.y = savedTurretRotation;
        }

        // ИСПРАВЛЕНО: Обновляем визуализацию траектории при выборе пушки
        if (this.currentCategory === "cannons" && this.previewTank) {
            const cannonType = getCannonById(cannonId);
            if (cannonType) {
                // Вычисляем позицию танка и направление ствола
                const tankPosition = this.previewTank.chassis.position.clone();
                const barrelDirection = Vector3.Forward().applyRotationQuaternion(
                    this.previewTank.barrel.absoluteRotationQuaternion ||
                    this.previewTank.turret.absoluteRotationQuaternion ||
                    this.previewTank.chassis.absoluteRotationQuaternion
                );

                // ОТКЛЮЧЕНО: Визуализация траектории отключена по запросу пользователя
                // Очищаем старую визуализацию если она есть
                if (this.previewSceneData.trajectoryVisualization) {
                    disposeTrajectoryVisualization(this.previewSceneData.trajectoryVisualization);
                    this.previewSceneData.trajectoryVisualization = null;
                }
            }
        } else {
            // Скрываем траекторию для других категорий
            if (this.previewSceneData.trajectoryVisualization) {
                setTrajectoryVisibility(this.previewSceneData.trajectoryVisualization, false);
            }
        }

        // ОПТИМИЗАЦИЯ: Принудительный рендер после обновления танка
        if (this.previewSceneData.triggerRender) {
            this.previewSceneData.triggerRender();
        }
    }

    // NOTE: Preview methods moved to garage/preview.ts
    // Methods createUniqueChassisPreview, createTurretPreview, createUniqueCannonPreview,
    // and createPreviewTracks have been moved to garage/preview.ts module

    // Add chassis details - ПОЛНАЯ КОПИЯ из TankController
    // NOTE: This method should be moved to garage/preview.ts eventually
    // FUTURE: This method is reserved for future use
    // @ts-ignore - Reserved for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private _addChassisDetailsPreview(chassis: Mesh, chassisType: any, scene: Scene, baseColor: Color3): void {
        // ВСЕ ДЕТАЛИ ОТКЛЮЧЕНЫ - оставляем только простой прямоугольник корпуса
        // Весь код деталей был удалён по требованию пользователя
        return;

        /* ОТКЛЮЧЕНО - весь код деталей удалён
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;

        // Используем MaterialFactory для создания материалов
        const armorMat = MaterialFactory.createArmorMaterial(scene, baseColor, "preview");
        const accentMat = MaterialFactory.createAccentMaterial(scene, baseColor, "preview");

        switch (chassisType.id) {
            case "light":
                // Light - Прототип: БТ-7 - Наклонная лобовая броня, воздухозаборники, спойлер
                // Наклонная лобовая плита (угол 60°)
                ChassisDetailsGenerator.createSlopedArmor(
                    scene, chassis,
                    new Vector3(0, h * 0.15, d * 0.52),
                    w * 0.88, h * 0.6, 0.2,
                    -Math.PI / 6, armorMat, "previewLight"
                );

                // Воздухозаборники (угловатые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createIntake(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45),
                        0.3, h * 0.65, 0.35,
                        accentMat, `previewLight${i}`
                    );
                }

                // Задний спойлер (угловатый)
                ChassisDetailsGenerator.createSpoiler(
                    scene, chassis,
                    new Vector3(0, h * 0.5, -d * 0.48),
                    w * 1.2, 0.2, 0.25,
                    accentMat, "previewLight"
                );

                // Боковые обтекатели (угловатые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createFairing(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2),
                        0.15, h * 0.75, d * 0.55,
                        accentMat, `previewLight${i}`
                    );
                }

                // Люки на крыше (2 штуки)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1),
                        0.2, 0.08, 0.2,
                        armorMat, `previewLight${i}`
                    );
                }

                // Выхлопная труба сзади
                ChassisDetailsGenerator.createExhaust(
                    scene, chassis,
                    new Vector3(w * 0.35, h * 0.2, -d * 0.48),
                    0.15, 0.15, 0.2,
                    armorMat, "previewLight"
                );

                // Фары спереди (маленькие, угловатые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.5),
                        0.08, 0.08, 0.06,
                        i, "previewLight"
                    );
                }

                // Инструменты: лопата и топор на корме
                ChassisDetailsGenerator.createShovel(
                    scene, chassis,
                    new Vector3(-w * 0.4, h * 0.2, -d * 0.48),
                    0.12, 0.3, 0.02,
                    armorMat, "previewLight"
                );

                ChassisDetailsGenerator.createAxe(
                    scene, chassis,
                    new Vector3(-w * 0.3, h * 0.25, -d * 0.48),
                    0.25, 0.08, 0.02,
                    armorMat, "previewLight"
                );

                // Вентиляционные решетки по бокам (улучшенные)
                for (let i = 0; i < 2; i++) {
                    const ventPos = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.1, d * 0.1);
                    ChassisDetailsGenerator.createVent(
                        scene, chassis, ventPos,
                        0.05, 0.12, 0.15,
                        i, "previewLight"
                    );

                    // Детали решетки
                    const ventMat = MaterialFactory.createVentMaterial(scene, i, "previewLight");
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        3, 0.03, 0.1, 0.02, 0.05,
                        i, ventMat, "previewLight"
                    );
                }

                // Перископ на люке
                ChassisDetailsGenerator.createPeriscope(
                    scene, chassis,
                    new Vector3(0, h * 0.55, -d * 0.1),
                    0.15, 0.06,
                    0, "previewLight"
                );

                // Дополнительная оптика - бинокль на корпусе
                ChassisDetailsGenerator.createBinocular(
                    scene, chassis,
                    new Vector3(0, h * 0.48, d * 0.4),
                    0.2, 0.08, 0.12,
                    "previewLight"
                );

                // Дополнительные броневые накладки на лобовой части
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.25, h * 0.05, d * 0.48),
                        w * 0.25, h * 0.15, 0.08,
                        armorMat, `previewLight${i}`
                    );
                }

                // Верхние вентиляционные решетки на крыше (улучшенные)
                for (let i = 0; i < 3; i++) {
                    const roofVentPos = new Vector3((i - 1) * w * 0.3, h * 0.47, d * 0.2);
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis, roofVentPos,
                        0.2, 0.05, 0.15,
                        i, "previewLight"
                    );

                    // Детали решетки
                    const roofVentMat = MaterialFactory.createRoofVentMaterial(scene, i, "previewLight");
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, roofVentPos,
                        5, 0.02, 0.04, 0.13, 0.04,
                        i, roofVentMat, "previewLightRoof"
                    );
                }

                // Радиоантенна сзади
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.6, -d * 0.4),
                    0.4, 0.02,
                    "previewLight"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.52, -d * 0.4),
                    0.08,
                    armorMat, "previewLight"
                );

                // Боковые броневые экраны
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createArmorScreen(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, d * 0.05),
                        0.12, h * 0.5, d * 0.3,
                        0, armorMat, `previewLight${i}`
                    );
                }

                // Дополнительные фары на боковых панелях
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createSideLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, -d * 0.2),
                        0.06, 0.06, 0.04,
                        i, "previewLight"
                    );
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, -d * 0.49),
                        0.05, 0.08, 0.03,
                        i, "previewLight"
                    );
                }
                break;
            case "scout":
                // Scout - Прототип: Т-70 - Острый клиновидный нос, минимальный профиль
                // Острый клиновидный нос (угол 45°)
                ChassisDetailsGenerator.createSlopedArmor(
                    scene, chassis,
                    new Vector3(0, 0, d * 0.5),
                    w * 0.8, h * 0.7, 0.4,
                    -Math.PI / 4, accentMat, "previewScout"
                );

                // Боковые крылья (угловатые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createWing(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, -h * 0.05, d * 0.3),
                        0.15, h * 0.85, d * 0.6,
                        accentMat, `previewScout${i}`
                    );
                }

                // Задний диффузор (угловатый)
                ChassisDetailsGenerator.createDiffuser(
                    scene, chassis,
                    new Vector3(0, -h * 0.42, -d * 0.45),
                    w * 0.9, 0.15, 0.2,
                    accentMat, "previewScout"
                );

                // Один люк на крыше
                ChassisDetailsGenerator.createHatch(
                    scene, chassis,
                    new Vector3(0, h * 0.42, 0),
                    0.18, 0.06, 0.18,
                    armorMat, "previewScout"
                );

                // Радиоантенна на корме (угловатая)
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.45, -d * 0.45),
                    0.3, 0.02,
                    "previewScout"
                );

                // Две фары (очень маленькие, скрытые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48),
                        0.06, 0.06, 0.04,
                        i, "previewScout"
                    );
                }

                // Скрытые вентиляционные решетки
                for (let i = 0; i < 2; i++) {
                    const vent = MeshBuilder.CreateBox(`previewScoutVent${i}`, { width: 0.04, height: 0.08, depth: 0.12 }, scene);
                    vent.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15);
                    vent.parent = chassis;
                    const ventMat = new StandardMaterial(`previewScoutVentMat${i}`, scene);
                    ventMat.diffuseColor = new Color3(0.1, 0.1, 0.1);
                    vent.material = ventMat;

                    // Детали решетки
                    for (let j = 0; j < 3; j++) {
                        const ventBar = MeshBuilder.CreateBox(`previewScoutVentBar${i}_${j}`, { width: 0.02, height: 0.06, depth: 0.1 }, scene);
                        ventBar.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15 + (j - 1) * 0.04);
                        ventBar.parent = chassis;
                        ventBar.material = ventMat;
                    }
                }

                // Перископ на люке
                const scoutPeriscope = MeshBuilder.CreateBox("previewScoutPeriscope", { width: 0.05, height: 0.12, depth: 0.05 }, scene);
                scoutPeriscope.position = new Vector3(0, h * 0.5, 0);
                scoutPeriscope.parent = chassis;
                const scoutPeriscopeMat = new StandardMaterial("previewScoutPeriscopeMat", scene);
                scoutPeriscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                scoutPeriscope.material = scoutPeriscopeMat;

                // Оптический прицел на передней части
                const scoutSight = MeshBuilder.CreateBox("previewScoutSight", { width: 0.1, height: 0.06, depth: 0.08 }, scene);
                scoutSight.position = new Vector3(0, h * 0.2, d * 0.48);
                scoutSight.parent = chassis;
                const scoutSightMat = new StandardMaterial("previewScoutSightMat", scene);
                scoutSightMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                scoutSight.material = scoutSightMat;

                // Линза прицела
                const scoutSightLens = MeshBuilder.CreateBox("previewScoutSightLens", { width: 0.05, height: 0.02, depth: 0.05 }, scene);
                scoutSightLens.position = new Vector3(0, 0, 0.05);
                scoutSightLens.parent = scoutSight;
                const scoutLensMat = new StandardMaterial("previewScoutSightLensMat", scene);
                scoutLensMat.diffuseColor = new Color3(0.1, 0.2, 0.3);
                scoutLensMat.emissiveColor = new Color3(0.05, 0.1, 0.15);
                scoutSightLens.material = scoutLensMat;

                // Легкие броневые накладки на лобовой части
                for (let i = 0; i < 2; i++) {
                    const frontArmor = MeshBuilder.CreateBox(`previewScoutFrontArmor${i}`, { width: w * 0.25, height: h * 0.12, depth: 0.06 }, scene);
                    frontArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.2, h * 0.02, d * 0.48);
                    frontArmor.parent = chassis;
                    frontArmor.material = armorMat;
                }

                // Выхлопная труба сзади (маленькая)
                const scoutExhaust = MeshBuilder.CreateBox("previewScoutExhaust", { width: 0.1, height: 0.1, depth: 0.15 }, scene);
                scoutExhaust.position = new Vector3(w * 0.3, h * 0.15, -d * 0.48);
                scoutExhaust.parent = chassis;
                scoutExhaust.material = armorMat;

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`previewScoutTailLight${i}`, { width: 0.04, height: 0.06, depth: 0.03 }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.12, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`previewScoutTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`previewScoutSideLight${i}`, { width: 0.04, height: 0.05, depth: 0.04 }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.05, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`previewScoutSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }

                // Верхняя вентиляционная решетка на крыше
                const scoutRoofVent = MeshBuilder.CreateBox("previewScoutRoofVent", { width: 0.15, height: 0.04, depth: 0.1 }, scene);
                scoutRoofVent.position = new Vector3(0, h * 0.44, d * 0.2);
                scoutRoofVent.parent = chassis;
                const scoutRoofVentMat = new StandardMaterial("previewScoutRoofVentMat", scene);
                scoutRoofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                scoutRoofVent.material = scoutRoofVentMat;

                // Детали решетки
                for (let i = 0; i < 4; i++) {
                    const ventBar = MeshBuilder.CreateBox(`previewScoutRoofVentBar${i}`, { width: 0.02, height: 0.03, depth: 0.08 }, scene);
                    ventBar.position = new Vector3((i - 1.5) * 0.04, h * 0.44, d * 0.2);
                    ventBar.parent = chassis;
                    ventBar.material = scoutRoofVentMat;
                }

                // Легкие броневые экраны по бокам - уменьшены
                for (let i = 0; i < 2; i++) {
                    const sideArmor = MeshBuilder.CreateBox(`previewScoutSideArmor${i}`, { width: 0.07, height: h * 0.3, depth: d * 0.18 }, scene);
                    sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.06, d * 0.08);
                    sideArmor.parent = chassis;
                    sideArmor.material = armorMat;
                }
                break;
            case "heavy":
                // Heavy - массивные бронеплиты со всех сторон - ОЧЕНЬ ЗАМЕТНЫЕ
                // Боковые бронеплиты
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(-w * 0.62, 0, 0),
                    0.3, h * 0.95, d * 0.75,
                    armorMat, "previewHeavy0"
                );
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(w * 0.62, 0, 0),
                    0.3, h * 0.95, d * 0.75,
                    armorMat, "previewHeavy1"
                );
                // Лобовая бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.35, d * 0.58),
                    w * 0.85, h * 0.35, 0.22,
                    armorMat, "previewHeavy2"
                );
                // Нижняя бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, -h * 0.35, 0),
                    w * 1.05, 0.28, d * 1.05,
                    armorMat, "previewHeavy3"
                );
                // Верхняя бронеплита - ОЧЕНЬ БОЛЬШАЯ
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.65, 0),
                    w * 0.95, 0.25, d * 0.8,
                    armorMat, "previewHeavy"
                );
                // Угловые усиления - БОЛЬШЕ
                for (let i = 0; i < 4; i++) {
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.58;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.58;
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3(posX, h * 0.55, posZ),
                        0.3, 0.3, 0.3,
                        armorMat, `previewHeavy${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.5),
                        0.12, 0.12, 0.1,
                        i, "previewHeavy"
                    );
                }

                // Выхлопные трубы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaust(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, -d * 0.48),
                        0.14, 0.14, 0.2,
                        armorMat, `previewHeavy${i}`
                    );
                }

                // Инструменты: лопата, топор, канистра
                ChassisDetailsGenerator.createShovel(
                    scene, chassis,
                    new Vector3(-w * 0.45, h * 0.2, -d * 0.45),
                    0.15, 0.4, 0.02,
                    armorMat, "previewHeavy"
                );

                ChassisDetailsGenerator.createAxe(
                    scene, chassis,
                    new Vector3(-w * 0.35, h * 0.25, -d * 0.45),
                    0.3, 0.1, 0.02,
                    armorMat, "previewHeavy"
                );

                ChassisDetailsGenerator.createCanister(
                    scene, chassis,
                    new Vector3(w * 0.45, h * 0.22, -d * 0.4),
                    0.14, 0.25, 0.14,
                    armorMat, "previewHeavy"
                );

                // Вентиляционные решетки (большие, с деталями)
                for (let i = 0; i < 4; i++) {
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.4;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.3;
                    const ventPos = new Vector3(posX, h * 0.5, posZ);
                    ChassisDetailsGenerator.createVent(
                        scene, chassis, ventPos,
                        0.1, 0.06, 0.12,
                        i, "previewHeavy"
                    );
                    // Детали решетки
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        5, 0.08, 0.04, 0.02, 0.025,
                        i, MaterialFactory.createVentMaterial(scene, i, "previewHeavy"), "previewHeavy"
                    );
                }

                // Перископы на люках (три штуки)
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.3, h * 0.75, -d * 0.1),
                        0.2, 0.08,
                        i, "previewHeavy"
                    );
                }

                // Люки на крыше (два больших)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.68, -d * 0.1),
                        0.25, 0.1, 0.25,
                        armorMat, `previewHeavy${i}`
                    );
                }

                // Энергетические усилители брони (футуристические элементы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createEnergyBooster(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.5, h * 0.3, d * 0.4),
                        0.12,
                        i, "previewHeavy"
                    );
                }
                break;
            case "assault":
                // Assault - агрессивные угловые бронеплиты, шипы
                // Лобовая бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.25, d * 0.52),
                    w * 0.8, h * 0.35, 0.15,
                    armorMat, "previewAssault0"
                );
                // Боковые бронеплиты
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(-w * 0.5, 0, d * 0.3),
                    0.12, h * 0.6, d * 0.4,
                    armorMat, "previewAssault1"
                );
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(w * 0.5, 0, d * 0.3),
                    0.12, h * 0.6, d * 0.4,
                    armorMat, "previewAssault2"
                );

                // Шипы спереди
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createSpike(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.25, h * 0.3, d * 0.52),
                        0.08, 0.15, 0.12,
                        0, accentMat, `previewAssault${i}`
                    );
                }

                // Фары с защитой
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewAssault"
                    );
                    // Защита фары
                    ChassisDetailsGenerator.createHeadlightGuard(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.13, d * 0.46),
                        0.14, 0.14, 0.06,
                        i, armorMat, "previewAssault"
                    );
                }

                // Выхлоп
                ChassisDetailsGenerator.createExhaust(
                    scene, chassis,
                    new Vector3(w * 0.38, h * 0.18, -d * 0.45),
                    0.13, 0.13, 0.18,
                    armorMat, "previewAssault"
                );

                // Инструменты
                ChassisDetailsGenerator.createShovel(
                    scene, chassis,
                    new Vector3(-w * 0.4, h * 0.18, -d * 0.45),
                    0.13, 0.32, 0.02,
                    armorMat, "previewAssault"
                );

                ChassisDetailsGenerator.createCanister(
                    scene, chassis,
                    new Vector3(w * 0.38, h * 0.2, -d * 0.4),
                    0.11, 0.18, 0.11,
                    armorMat, "previewAssault"
                );

                // Вентиляционные решетки (улучшенные)
                for (let i = 0; i < 2; i++) {
                    const ventPos = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.35, -d * 0.25);
                    ChassisDetailsGenerator.createVent(
                        scene, chassis, ventPos,
                        0.08, 0.05, 0.1,
                        i, "previewAssault"
                    );
                    // Детали решетки
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        4, 0.06, 0.03, 0.02, 0.03,
                        i, MaterialFactory.createVentMaterial(scene, i, "previewAssault"), "previewAssault"
                    );
                }

                // Перископы (улучшенные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                        0.16, 0.07,
                        i, "previewAssault"
                    );
                }

                // Агрессивные боковые шипы (дополнительные)
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 3; j++) {
                        ChassisDetailsGenerator.createSpike(
                            scene, chassis,
                            new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.05 + j * h * 0.2, d * 0.1 + (j - 1) * d * 0.15),
                            0.06, 0.12, 0.1,
                            (i === 0 ? 1 : -1) * Math.PI / 8, accentMat, `previewAssault${i}_${j}`
                        );
                    }
                }

                // Броневые экраны на лобовой части (угловатые)
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createSlopedArmor(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.08 + (i < 2 ? 0 : h * 0.15), d * 0.5),
                        w * 0.22, h * 0.18, 0.1,
                        -Math.PI / 12, armorMat, `previewAssault${i}`
                    );
                }

                // Угловые броневые накладки (агрессивный стиль)
                for (let i = 0; i < 4; i++) {
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.55;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.5;
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3(posX, h * 0.45, posZ),
                        0.2, 0.25, 0.2,
                        armorMat, `previewAssault${i}`
                    );
                }

                // Верхние вентиляционные решетки (агрессивные, угловатые)
                for (let i = 0; i < 5; i++) {
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis,
                        new Vector3((i - 2) * w * 0.25, h * 0.54, (i < 3 ? -1 : 1) * d * 0.25),
                        0.15, 0.05, 0.12,
                        i, "previewAssault"
                    );
                }

                // Задние шипы (агрессивный стиль)
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createSpike(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.3 + (i < 2 ? 0 : h * 0.15), -d * 0.48),
                        0.08, 0.18, 0.1,
                        0, accentMat, `previewAssault${i}`
                    );
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                        0.06, 0.1, 0.04,
                        i, "previewAssault"
                    );
                }

                // Оптический прицел на лобовой части
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.22, d * 0.49),
                    0.14, 0.09, 0.11,
                    "previewAssault"
                );

                // Радиоантенна сзади
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.65, -d * 0.3),
                    0.45, 0.025,
                    "previewAssault"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.54, -d * 0.3),
                    0.1, armorMat, "previewAssault"
                );

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`previewAssaultSideLight${i}`, { width: 0.05, height: 0.07, depth: 0.05 }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`previewAssaultSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }

                // Выхлопная труба (улучшенная, больше)
                const assaultExhaustUpgraded = MeshBuilder.CreateBox("previewAssaultExhaustUpgraded", { width: 0.13, height: 0.22, depth: 0.13 }, scene);
                assaultExhaustUpgraded.position = new Vector3(w * 0.38, h * 0.2, -d * 0.48);
                                assaultExhaustUpgraded.parent = chassis;
                assaultExhaustUpgraded.material = armorMat;

                // Выхлопное отверстие
                const assaultExhaustHole = MeshBuilder.CreateBox("previewAssaultExhaustHole", { width: 0.11, height: 0.04, depth: 0.11 }, scene);
                assaultExhaustHole.position = new Vector3(w * 0.38, h * 0.2, -d * 0.52);
                                assaultExhaustHole.parent = chassis;
                const assaultExhaustHoleMat = new StandardMaterial("previewAssaultExhaustHoleMat", scene);
                assaultExhaustHoleMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                assaultExhaustHoleMat.emissiveColor = new Color3(0.1, 0.05, 0);
                assaultExhaustHole.material = assaultExhaustHoleMat;
                break;
            case "medium":
                // Medium - Прототип: Т-34 - Классический средний танк, наклонная броня
                // Наклонная лобовая броня (45°)
                ChassisDetailsGenerator.createSlopedArmor(
                    scene, chassis,
                    new Vector3(0, h * 0.1, d * 0.5),
                    w * 0.9, h * 0.7, 0.18,
                    -Math.PI / 4, armorMat, "previewMedium"
                );

                // Вентиляционные решетки (угловатые)
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.28, h * 0.38, -d * 0.28),
                        0.06, 0.04, 0.08,
                        i, "previewMedium"
                    );
                }

                // Два люка на крыше
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1),
                        0.22, 0.08, 0.22,
                        armorMat, `previewMedium${i}`
                    );
                }

                // Выхлопные трубы сзади
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaust(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.18, -d * 0.45),
                        0.12, 0.12, 0.18,
                        armorMat, `previewMedium${i}`
                    );
                }

                // Фары спереди
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.12, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewMedium"
                    );
                }

                // Инструменты: лопата, канистра
                ChassisDetailsGenerator.createShovel(
                    scene, chassis,
                    new Vector3(-w * 0.42, h * 0.18, -d * 0.45),
                    0.14, 0.35, 0.02,
                    armorMat, "previewMedium"
                );

                ChassisDetailsGenerator.createCanister(
                    scene, chassis,
                    new Vector3(w * 0.42, h * 0.2, -d * 0.4),
                    0.12, 0.2, 0.12,
                    armorMat, "previewMedium"
                );

                // Вентиляционные решетки (улучшенные)
                for (let i = 0; i < 3; i++) {
                    const ventPos = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3);
                    ChassisDetailsGenerator.createVent(
                        scene, chassis, ventPos,
                        0.08, 0.05, 0.1,
                        i, "previewMedium"
                    );
                    // Детали решетки
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        4, 0.06, 0.03, 0.02, 0.03,
                        i, MaterialFactory.createVentMaterial(scene, i, "previewMedium"), "previewMedium"
                    );
                }

                // Перископы на люках
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.55, -d * 0.1),
                        0.18, 0.07,
                        i, "previewMedium"
                    );
                }

                // Броневые накладки на лобовой части (характерные для Т-34)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.05, d * 0.48),
                        w * 0.3, h * 0.2, 0.1,
                        armorMat, `previewMedium${i}`
                    );
                }

                // Центральная броневая накладка на лбу
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.2, d * 0.49),
                    w * 0.2, h * 0.15, 0.12,
                    armorMat, "previewMedium"
                );

                // Боковые броневые экраны (противокумулятивные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createArmorScreen(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.15, d * 0.1),
                        0.15, h * 0.6, d * 0.35,
                        0, armorMat, `previewMedium${i}`
                    );
                }

                // Дополнительные вентиляционные решетки на крыше
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.46, (i < 2 ? -1 : 1) * d * 0.25),
                        0.15, 0.04, 0.12,
                        i, "previewMedium"
                    );
                }

                // Радиоантенна сзади (характерная для Т-34)
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.65, -d * 0.35),
                    0.5, 0.025,
                    "previewMedium"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.54, -d * 0.35),
                    0.1, armorMat, "previewMedium"
                );

                // Оптический прицел на лобовой части
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.25, d * 0.48),
                    0.12, 0.08, 0.1,
                    "previewMedium"
                );

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.16, -d * 0.49),
                        0.06, 0.1, 0.04,
                        i, "previewMedium"
                    );
                }

                // Дополнительные инструменты на корме
                ChassisDetailsGenerator.createToolBox(
                    scene, chassis,
                    new Vector3(0, h * 0.22, -d * 0.42),
                    0.18, 0.12, 0.14,
                    armorMat, "previewMedium"
                );

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createSideLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.25),
                        0.05, 0.07, 0.05,
                        i, "previewMedium"
                    );
                }
                break;
            case "stealth":
                // Stealth - угловатые панели, генератор невидимости, низкий профиль
                // Боковые панели
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(-w * 0.45, h * 0.2, d * 0.3),
                    0.08, h * 0.3, d * 0.4,
                    armorMat, "previewStealth0"
                );
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(w * 0.45, h * 0.2, d * 0.3),
                    0.08, h * 0.3, d * 0.4,
                    armorMat, "previewStealth1"
                );
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.35, -d * 0.35),
                    w * 0.4, h * 0.25, w * 0.3,
                    armorMat, "previewStealth2"
                );

                // Генератор невидимости
                ChassisDetailsGenerator.createStealthGenerator(
                    scene, chassis,
                    new Vector3(0, h * 0.35, -d * 0.35),
                    w * 0.35, h * 0.45, w * 0.35,
                    "previewStealth"
                );

                // Две фары (очень маленькие, скрытые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.1, d * 0.48),
                        0.06, 0.06, 0.04,
                        i, "previewStealth"
                    );
                }

                // Две задние фары (скрытые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.1, -d * 0.49),
                        0.04, 0.05, 0.03,
                        i, "previewStealth"
                    );
                }

                // Скрытые вентиляционные решетки по бокам
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.05, d * 0.15),
                        0.04, 0.06, 0.1,
                        i, "previewStealth"
                    );
                }
                break;
            case "hover":
                // Hover - обтекаемые панели, реактивные двигатели
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, 0, 0),
                        0.06, h * 0.6, d * 0.5,
                        accentMat, `previewHover${i}`
                    );
                }

                // Реактивные двигатели (4 штуки)
                for (let i = 0; i < 4; i++) {
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.38;
                    ChassisDetailsGenerator.createThruster(
                        scene, chassis,
                        new Vector3(posX, -h * 0.45, posZ),
                        0.25, 0.18,
                        i, "previewHover"
                    );
                }

                // Обтекаемые фары спереди
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlightCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.15, d * 0.48),
                        0.12, 0.08,
                        i, "previewHover"
                    );
                }

                // Обтекаемый люк на крыше (цилиндрический)
                const hoverHatch = MeshBuilder.CreateBox("previewHoverHatch", { width: 0.28, height: 0.08, depth: 0.28 }, scene);
                hoverHatch.position = new Vector3(0, h * 0.52, -d * 0.1);
                hoverHatch.parent = chassis;
                hoverHatch.material = armorMat;

                // Перископ на люке (обтекаемый)
                ChassisDetailsGenerator.createPeriscope(
                    scene, chassis,
                    new Vector3(0, h * 0.58, -d * 0.1),
                    0.18, 0.06,
                    0, "previewHover"
                );

                // Вентиляционные решетки на крыше (обтекаемые)
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createRoofVentCylindrical(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.5, (i < 2 ? -1 : 1) * d * 0.25),
                        0.12, 0.05,
                        i, "previewHover"
                    );
                }

                // Оптические сенсоры (округлые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createOpticalSensor(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.2, d * 0.45),
                        0.06, 0.08,
                        i, "previewHover"
                    );
                }

                // Задние огни (округлые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLightCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.49),
                        0.08, 0.04,
                        i, "previewHover"
                    );
                }

                // Обтекаемые воздухозаборники по бокам
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createIntakeCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.1, d * 0.2),
                        0.15, 0.14,
                        `previewHover${i}`
                    );
                }

                // Стабилизационные панели (обтекаемые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createStabilizer(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.15),
                        0.08, h * 0.4, d * 0.3,
                        accentMat, `previewHover${i}`
                    );
                }
                break;
            case "siege":
                // Siege - массивные многослойные бронеплиты
                // Боковые бронеплиты
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(-w * 0.62, 0, 0),
                    0.22, h * 0.95, d * 0.75,
                    armorMat, "previewSiege0"
                );
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(w * 0.62, 0, 0),
                    0.22, h * 0.95, d * 0.75,
                    armorMat, "previewSiege1"
                );
                // Лобовая бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.35, d * 0.58),
                    w * 0.85, h * 0.25, 0.18,
                    armorMat, "previewSiege2"
                );
                // Нижняя бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, -h * 0.35, 0),
                    w * 0.98, 0.2, d * 0.98,
                    armorMat, "previewSiege3"
                );
                // Верхняя бронеплита
                ChassisDetailsGenerator.createArmorPlate(
                    scene, chassis,
                    new Vector3(0, h * 0.6, 0),
                    w * 0.9, 0.15, d * 0.8,
                    armorMat, "previewSiege4"
                );

                // Дополнительные угловые бронеплиты
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI * 2) / 4;
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3(Math.cos(angle) * w * 0.55, h * 0.2, Math.sin(angle) * d * 0.55),
                        0.15, h * 0.4, 0.15,
                        armorMat, `previewSiege${i}`
                    );
                }

                // Три люка
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.3, h * 0.7, -d * 0.1),
                        0.25, 0.1, 0.25,
                        armorMat, `previewSiege${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.18, d * 0.5),
                        0.14, 0.14, 0.12,
                        i, "previewSiege"
                    );
                }

                // Две выхлопные трубы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaust(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.48),
                        0.16, 0.16, 0.22,
                        armorMat, `previewSiege${i}`
                    );
                }

                // Множество инструментов
                ChassisDetailsGenerator.createShovel(
                    scene, chassis,
                    new Vector3(-w * 0.48, h * 0.22, -d * 0.45),
                    0.16, 0.45, 0.02,
                    armorMat, "previewSiege"
                );

                ChassisDetailsGenerator.createAxe(
                    scene, chassis,
                    new Vector3(-w * 0.38, h * 0.28, -d * 0.45),
                    0.35, 0.12, 0.02,
                    armorMat, "previewSiege"
                );

                ChassisDetailsGenerator.createCanister(
                    scene, chassis,
                    new Vector3(w * 0.48, h * 0.25, -d * 0.4),
                    0.16, 0.3, 0.16,
                    armorMat, "previewSiege"
                );

                // Антенны (большие)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createAntenna(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.8, -d * 0.4),
                        0.5, 0.03,
                        `previewSiege${i}`
                    );
                }

                // Перископы на люках
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.3, h * 0.8, -d * 0.1),
                        0.22, 0.09,
                        i, "previewSiege"
                    );
                }

                // Большие вентиляционные решетки на крыше
                for (let i = 0; i < 5; i++) {
                    const ventPos = new Vector3((i - 2) * w * 0.25, h * 0.68, d * 0.25);
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis, ventPos,
                        0.3, 0.08, 0.2,
                        i, "previewSiege"
                    );
                    // Детали решетки (много планок)
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        8, 0.04, 0.07, 0.18, 0.04,
                        i, MaterialFactory.createRoofVentMaterial(scene, i, "previewSiege"), "previewSiege"
                    );
                }

                // Массивные выхлопные трубы (большие)
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createExhaustCylindrical(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.48),
                        0.3, 0.16,
                        `previewSiege${i}`
                    );
                    // Выхлопное отверстие
                    ChassisDetailsGenerator.createExhaustHole(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.3, h * 0.25, -d * 0.52),
                        0.05, 0.14,
                        i, `previewSiege${i}`
                    );
                }

                // Оптический прицел на лобовой части (огромный)
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.3, d * 0.5),
                    0.22, 0.15, 0.18,
                    "previewSiege"
                );

                // Дополнительные броневые накладки на лобовой части (огромные)
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.32, h * 0.1, d * 0.5),
                        w * 0.35, h * 0.25, 0.15,
                        armorMat, `previewSiege${i}`
                    );
                }

                // Задние огни (стоп-сигналы, большие)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49),
                        0.1, 0.15, 0.06,
                        i, "previewSiege"
                    );
                }

                // Боковые вентиляционные решетки (большие)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.12, d * 0.15),
                        0.08, 0.15, 0.2,
                        i, "previewSiege"
                    );
                }
                break;
            case "racer":
                // Racer - очень низкий, спортивный - гонщик
                // Передний спойлер
                ChassisDetailsGenerator.createSpoiler(
                    scene, chassis,
                    new Vector3(0, -h * 0.4, d * 0.48),
                    w * 0.9, 0.12, 0.15,
                    accentMat, "previewRacer"
                );

                // Задний спойлер (большой)
                ChassisDetailsGenerator.createSpoiler(
                    scene, chassis,
                    new Vector3(0, h * 0.45, -d * 0.48),
                    w * 1.1, 0.25, 0.2,
                    accentMat, "previewRacer"
                );

                // Боковые обтекатели (низкопрофильные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createFairing(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.1),
                        0.12, h * 0.6, d * 0.7,
                        accentMat, `previewRacer${i}`
                    );
                }

                // Передние фары (большие, агрессивные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.32, h * 0.1, d * 0.49),
                        0.15, 0.12, 0.1,
                        i, "previewRacer"
                    );
                }

                // Центральная воздухозаборная решетка
                ChassisDetailsGenerator.createIntake(
                    scene, chassis,
                    new Vector3(0, h * 0.15, d * 0.48),
                    w * 0.4, h * 0.25, 0.08,
                    MaterialFactory.createVentMaterial(scene, 0, "previewRacer"), "previewRacer"
                );

                // Детали решетки
                const intakePos = new Vector3(0, h * 0.15, d * 0.48);
                ChassisDetailsGenerator.createVentBars(
                    scene, chassis, intakePos,
                    5, 0.02, h * 0.2, 0.06, w * 0.09,
                    0, MaterialFactory.createVentMaterial(scene, 0, "previewRacer"), "previewRacer"
                );

                // Верхние воздухозаборники на крыше
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createIntake(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.42, d * 0.3),
                        0.18, 0.08, 0.12,
                        MaterialFactory.createVentMaterial(scene, i, "previewRacer"), `previewRacer${i}`
                    );
                }

                // Выхлопные трубы (большие, по бокам)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaustCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.48),
                        0.3, 0.1,
                        `previewRacer${i}`
                    );
                    // Выхлопное отверстие
                    ChassisDetailsGenerator.createExhaustHole(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.08, -d * 0.52),
                        0.05, 0.08,
                        i, `previewRacer${i}`
                    );
                }

                // Боковые зеркала
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createMirror(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.52, h * 0.35, d * 0.35),
                        0.08, 0.05, 0.04,
                        i, "previewRacer"
                    );
                }

                // Задние огни (большие стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.12, -d * 0.49),
                        0.08, 0.12, 0.04,
                        i, "previewRacer"
                    );
                }

                // Вентиляционные отверстия на боковых панелях
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 3; j++) {
                        ChassisDetailsGenerator.createVent(
                            scene, chassis,
                            new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.05, d * 0.1 + (j - 1) * d * 0.15),
                            0.04, 0.1, 0.04,
                            j, `previewRacer${i}`
                        );
                    }
                }

                // Люк на крыше (спортивный стиль)
                ChassisDetailsGenerator.createHatch(
                    scene, chassis,
                    new Vector3(0, h * 0.46, -d * 0.1),
                    0.3, 0.06, 0.25,
                    armorMat, "previewRacer"
                );

                // Перископ на люке
                ChassisDetailsGenerator.createPeriscope(
                    scene, chassis,
                    new Vector3(0, h * 0.56, -d * 0.1),
                    0.2, 0.06,
                    0, "previewRacer"
                );
                break;
            case "amphibious":
                // Amphibious - большие поплавки, водонепроницаемые панели
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createFloat(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.42, -h * 0.25, 0),
                        h * 0.7, w * 0.35,
                        accentMat, `previewAmphibious${i}`
                    );
                }

                // Водонепроницаемые панели
                ChassisDetailsGenerator.createWaterSeal(
                    scene, chassis,
                    new Vector3(0, h * 0.5, 0),
                    w * 1.05, 0.08, d * 1.05,
                    armorMat, "previewAmphibious"
                );

                // Люки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                        0.2, 0.08, 0.2,
                        armorMat, `previewAmphibious${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewAmphibious"
                    );
                }

                // Вентиляционные решетки (водонепроницаемые)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                        0.08, 0.05, 0.1,
                        i, "previewAmphibious"
                    );
                }

                // Перископы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.58, -d * 0.1),
                        0.18, 0.07,
                        i, "previewAmphibious"
                    );
                }
                break;
            case "shield":
                // Shield - генератор щита, энергетические панели
                ChassisDetailsGenerator.createEnergyGenerator(
                    scene, chassis,
                    new Vector3(0, h * 0.45, -d * 0.25),
                    w * 0.45,
                    "previewShield"
                );

                // Энергетические панели по бокам
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createEnergyPanel(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.55, h * 0.15, 0),
                        0.1, h * 0.5, d * 0.3,
                        i, "previewShield"
                    );
                }

                // Люки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.52, -d * 0.1),
                        0.2, 0.08, 0.2,
                        armorMat, `previewShield${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewShield"
                    );
                }

                // Вентиляционные решетки (энергетические)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                        0.08, 0.05, 0.1,
                        i, "previewShield"
                    );
                }

                // Энергетические катушки вокруг генератора
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI * 2) / 4;
                    ChassisDetailsGenerator.createEnergyCoil(
                        scene, chassis,
                        new Vector3(0, h * 0.45, -d * 0.25),
                        w * 0.5, 0.06,
                        angle,
                        i, "previewShield"
                    );
                }

                // Перископы на люках
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1),
                        0.18, 0.07,
                        i, "previewShield"
                    );
                }

                // Энергетические порты (для зарядки щита)
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI * 2) / 4;
                    ChassisDetailsGenerator.createEnergyPort(
                        scene, chassis,
                        new Vector3(Math.cos(angle) * w * 0.4, h * 0.25, -d * 0.25 + Math.sin(angle) * d * 0.2),
                        0.08, 0.1,
                        angle + Math.PI / 2,
                        i, "previewShield"
                    );
                }

                // Верхние вентиляционные решетки (энергетические)
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.54, (i < 2 ? -1 : 1) * d * 0.25),
                        0.15, 0.04, 0.12,
                        i, "previewShield"
                    );
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                        0.06, 0.1, 0.04,
                        i, "previewShield"
                    );
                }

                // Радиоантенна сзади
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.65, -d * 0.3),
                    0.5, 0.025,
                    "previewShield"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.54, -d * 0.3),
                    0.1, armorMat, "previewShield"
                );

                // Оптический прицел на лобовой части
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.22, d * 0.49),
                    0.14, 0.09, 0.11,
                    "previewShield"
                );

                // Выхлопные трубы сзади
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaustCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48),
                        0.2, 0.12,
                        `previewShield${i}`
                    );
                }
                break;
            case "drone":
                // Drone - платформы для дронов, антенны связи
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createDronePlatform(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.65, 0),
                        w * 0.45, 0.12, w * 0.45,
                        i, "previewDrone"
                    );

                    // Антенны на платформах
                    ChassisDetailsGenerator.createAntenna(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.72, 0),
                        0.15, 0.03,
                        `previewDrone${i}`
                    );
                }

                // Люки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1),
                        0.2, 0.08, 0.2,
                        armorMat, `previewDrone${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.15, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewDrone"
                    );
                }

                // Вентиляционные решетки (для охлаждения систем управления дронами)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.3, -d * 0.25),
                        0.08, 0.05, 0.1,
                        i, "previewDrone"
                    );
                }

                // Перископы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.66, -d * 0.1),
                        0.18, 0.07,
                        i, "previewDrone"
                    );
                }

                // Сенсорные панели на платформах
                for (let i = 0; i < 2; i++) {
                    for (let j = 0; j < 2; j++) {
                        ChassisDetailsGenerator.createSensor(
                            scene, chassis,
                            new Vector3((i === 0 ? -1 : 1) * w * 0.38 + (j === 0 ? -1 : 1) * 0.1, h * 0.68, (j === 0 ? -1 : 1) * 0.1),
                            0.08, 0.04, 0.08,
                            j, `previewDrone${i}`
                        );
                    }
                }

                // Верхние вентиляционные решетки на крыше
                for (let i = 0; i < 4; i++) {
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis,
                        new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25),
                        0.12, 0.04, 0.1,
                        i, "previewDrone"
                    );
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49),
                        0.06, 0.1, 0.04,
                        i, "previewDrone"
                    );
                }

                // Оптический прицел на лобовой части
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.22, d * 0.49),
                    0.14, 0.09, 0.11,
                    "previewDrone"
                );

                // Радиоантенна сзади (для связи с дронами)
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.72, -d * 0.3),
                    0.55, 0.025,
                    "previewDrone"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.6, -d * 0.3),
                    0.1, armorMat, "previewDrone"
                );

                // Выхлопные трубы сзади
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaustCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48),
                        0.2, 0.12,
                        `previewDrone${i}`
                    );
                }
                break;
            case "artillery":
                // Artillery - массивные стабилизаторы, опорные лапы
                for (let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI * 2) / 4;
                    ChassisDetailsGenerator.createStabilizerCylindrical(
                        scene, chassis,
                        new Vector3(Math.cos(angle) * w * 0.65, -h * 0.45, Math.sin(angle) * d * 0.65),
                        0.35, 0.25,
                        armorMat, `previewArtillery${i}`
                    );

                    // Опорные лапы
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3(Math.cos(angle) * w * 0.7, -h * 0.55, Math.sin(angle) * d * 0.7),
                        0.12, 0.2, 0.12,
                        armorMat, `previewArtilleryLeg${i}`
                    );
                }

                // Люки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.7, -d * 0.1),
                        0.22, 0.1, 0.22,
                        armorMat, `previewArtillery${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.2, d * 0.5),
                        0.12, 0.12, 0.1,
                        i, "previewArtillery"
                    );
                }

                // Выхлоп
                ChassisDetailsGenerator.createExhaust(
                    scene, chassis,
                    new Vector3(w * 0.4, h * 0.22, -d * 0.48),
                    0.14, 0.14, 0.2,
                    armorMat, "previewArtillery"
                );

                // Вентиляционные решетки (большие для артиллерии)
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.35, h * 0.6, -d * 0.3),
                        0.12, 0.08, 0.14,
                        i, "previewArtillery"
                    );
                }

                // Перископы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.85, -d * 0.1),
                        0.22, 0.09,
                        i, "previewArtillery"
                    );
                }

                // Системы наведения (оптические прицелы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createSight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.75, d * 0.45),
                        0.16, 0.12, 0.14,
                        `previewArtillery${i}`
                    );
                }

                // Верхние вентиляционные решетки на крыше (большие)
                for (let i = 0; i < 5; i++) {
                    const ventPos = new Vector3((i - 2) * w * 0.28, h * 0.72, d * 0.25);
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis, ventPos,
                        0.2, 0.06, 0.16,
                        i, "previewArtillery"
                    );
                    // Детали решетки
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        5, 0.03, 0.05, 0.14, 0.04,
                        i, MaterialFactory.createRoofVentMaterial(scene, i, "previewArtillery"), "previewArtillery"
                    );
                }

                // Радиоантенна сзади
                ChassisDetailsGenerator.createAntenna(
                    scene, chassis,
                    new Vector3(0, h * 0.9, -d * 0.3),
                    0.6, 0.03,
                    "previewArtillery"
                );

                // Основание антенны
                ChassisDetailsGenerator.createAntennaBase(
                    scene, chassis,
                    new Vector3(0, h * 0.76, -d * 0.3),
                    0.12, armorMat, "previewArtillery"
                );

                // Задние огни (стоп-сигналы, большие)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.22, -d * 0.49),
                        0.08, 0.14, 0.06,
                        i, "previewArtillery"
                    );
                }

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createSideLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.15, -d * 0.25),
                        0.06, 0.09, 0.06,
                        i, "previewArtillery"
                    );
                }

                // Выхлопная труба (большая)
                ChassisDetailsGenerator.createExhaustCylindrical(
                    scene, chassis,
                    new Vector3(0, h * 0.25, -d * 0.48),
                    0.28, 0.18,
                    "previewArtillery"
                );

                // Выхлопное отверстие
                ChassisDetailsGenerator.createExhaustHole(
                    scene, chassis,
                    new Vector3(0, h * 0.25, -d * 0.52),
                    0.05, 0.16,
                    0, "previewArtillery"
                );
                break;
            case "destroyer":
                // Destroyer - длинный клиновидный нос, низкий профиль
                ChassisDetailsGenerator.createSlopedArmor(
                    scene, chassis,
                    new Vector3(0, 0, d * 0.52),
                    w * 0.85, h * 0.55, 0.35,
                    -Math.PI / 6, accentMat, "previewDestroyer"
                );

                // Боковые бронеплиты
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.15),
                        0.12, h * 0.7, d * 0.5,
                        armorMat, `previewDestroyer${i}`
                    );
                }

                // Люки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHatch(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.48, -d * 0.1),
                        0.18, 0.06, 0.18,
                        armorMat, `previewDestroyer${i}`
                    );
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createHeadlight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.1, d * 0.48),
                        0.1, 0.1, 0.08,
                        i, "previewDestroyer"
                    );
                }

                // Вентиляционные решетки
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createVent(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.25, -d * 0.25),
                        0.08, 0.05, 0.1,
                        i, "previewDestroyer"
                    );
                }

                // Перископы
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createPeriscope(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.54, -d * 0.1),
                        0.14, 0.07,
                        i, "previewDestroyer"
                    );
                }

                // Оптический прицел на лобовой части (большой)
                ChassisDetailsGenerator.createSight(
                    scene, chassis,
                    new Vector3(0, h * 0.2, d * 0.48),
                    0.15, 0.1, 0.12,
                    "previewDestroyer"
                );

                // Дополнительные броневые накладки на лобовой части
                for (let i = 0; i < 3; i++) {
                    ChassisDetailsGenerator.createArmorPlate(
                        scene, chassis,
                        new Vector3((i - 1) * w * 0.28, h * 0.05, d * 0.48),
                        w * 0.28, h * 0.18, 0.1,
                        armorMat, `previewDestroyer${i}`
                    );
                }

                // Верхние вентиляционные решетки на крыше
                for (let i = 0; i < 4; i++) {
                    const ventPos = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.28, h * 0.46, (i < 2 ? -1 : 1) * d * 0.2);
                    ChassisDetailsGenerator.createRoofVent(
                        scene, chassis, ventPos,
                        0.12, 0.04, 0.1,
                        i, "previewDestroyer"
                    );
                    // Детали решетки
                    ChassisDetailsGenerator.createVentBars(
                        scene, chassis, ventPos,
                        3, 0.02, 0.03, 0.08, 0.03,
                        i, MaterialFactory.createRoofVentMaterial(scene, i, "previewDestroyer"), "previewDestroyer"
                    );
                }

                // Выхлопные трубы сзади (большие)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createExhaustCylindrical(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.48),
                        0.25, 0.12,
                        `previewDestroyer${i}`
                    );
                    // Выхлопное отверстие
                    ChassisDetailsGenerator.createExhaustHole(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.18, -d * 0.52),
                        0.05, 0.1,
                        i, `previewDestroyer${i}`
                    );
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createTailLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, -d * 0.49),
                        0.06, 0.1, 0.04,
                        i, "previewDestroyer"
                    );
                }

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    ChassisDetailsGenerator.createSideLight(
                        scene, chassis,
                        new Vector3((i === 0 ? -1 : 1) * w * 0.45, h * 0.08, -d * 0.2),
                        0.05, 0.07, 0.05,
                        i, "previewDestroyer"
                    );
                }
                break;
            case "command":
                // Command - по умолчанию показываем только базовый корпус без модулей.
                // Визуальная аура, надстройка и антенны будут добавлены, когда появится
                // полноценная система покупки/экипировки модулей.
                // Код ниже оставлен как заготовка и намеренно не выполняется.
                if (false) {
                    const commandAura = MeshBuilder.CreateBox("previewCommandAura", { width: w * 1.6, height: 0.06, depth: w * 1.6 }, scene);
                    commandAura.position = new Vector3(0, h * 0.55, 0);
                    commandAura.parent = chassis;
                    const auraMat = new StandardMaterial("previewAuraMat", scene);
                    auraMat.diffuseColor = new Color3(1, 0.88, 0);
                    auraMat.emissiveColor = new Color3(0.6, 0.5, 0);
                    auraMat.disableLighting = true;
                    commandAura.material = auraMat;

                    // Командный модуль сверху
                    const commandModule = MeshBuilder.CreateBox("previewCommandModule", { width: w * 0.6, height: h * 0.3, depth: d * 0.4 }, scene);
                    commandModule.position = new Vector3(0, h * 0.6, -d * 0.3);
                    commandModule.parent = chassis;
                    const moduleMat = new StandardMaterial("previewModuleMat", scene);
                    moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
                    moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
                    commandModule.material = moduleMat;

                    // Множественные антенны
                    for (let i = 0; i < 4; i++) {
                        const antenna = MeshBuilder.CreateBox(`previewCmdAntenna${i}`, { width: 0.025 , height: 0.5, depth: 0.025  }, scene);
                        antenna.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.7, (i < 2 ? -1 : 1) * d * 0.35);
                        antenna.parent = chassis;
                        const antennaMat = new StandardMaterial(`previewCmdAntennaMat${i}`, scene);
                        antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
                        antenna.material = antennaMat;
                    }
                }

                // Люки
                for (let i = 0; i < 2; i++) {
                    const hatch = MeshBuilder.CreateBox(`previewCommandHatch${i}`, { width: 0.22, height: 0.08, depth: 0.22 }, scene);
                    hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.6, -d * 0.1);
                    hatch.parent = chassis;
                    hatch.material = armorMat;
                }

                // Фары
                for (let i = 0; i < 2; i++) {
                    const headlight = MeshBuilder.CreateBox(`previewCommandHeadlight${i}`, { width: 0.1, height: 0.1, depth: 0.08 }, scene);
                    headlight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.15, d * 0.48);
                    headlight.parent = chassis;
                    const headlightMat = new StandardMaterial(`previewCommandHeadlightMat${i}`, scene);
                    headlightMat.diffuseColor = new Color3(0.9, 0.9, 0.7);
                    headlightMat.emissiveColor = new Color3(0.3, 0.3, 0.2);
                    headlight.material = headlightMat;
                }

                // Перископы на люках
                for (let i = 0; i < 2; i++) {
                    const periscope = MeshBuilder.CreateBox(`previewCommandPeriscope${i}`, { width: 0.08, height: 0.2, depth: 0.08 }, scene);
                    periscope.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.68, -d * 0.1);
                    periscope.parent = chassis;
                    const periscopeMat = new StandardMaterial(`previewCommandPeriscopeMat${i}`, scene);
                    periscopeMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
                    periscope.material = periscopeMat;
                }

                // Радиостанции на командном модуле
                for (let i = 0; i < 2; i++) {
                    const radio = MeshBuilder.CreateBox(`previewCommandRadio${i}`, { width: 0.15, height: 0.12, depth: 0.1 }, scene);
                    radio.position = new Vector3((i === 0 ? -1 : 1) * w * 0.22, h * 0.72, -d * 0.3);
                    radio.parent = chassis;
                    const radioMat = new StandardMaterial(`previewCommandRadioMat${i}`, scene);
                    radioMat.diffuseColor = new Color3(0.8, 0.7, 0.2);
                    radioMat.emissiveColor = new Color3(0.2, 0.15, 0.05);
                    radio.material = radioMat;
                }

                // Сенсорные панели на командном модуле
                for (let i = 0; i < 3; i++) {
                    const sensor = MeshBuilder.CreateBox(`previewCommandSensor${i}`, { width: 0.1, height: 0.06, depth: 0.08 }, scene);
                    sensor.position = new Vector3((i - 1) * w * 0.18, h * 0.72, -d * 0.2);
                    sensor.parent = chassis;
                    const sensorMat = new StandardMaterial(`previewCommandSensorMat${i}`, scene);
                    sensorMat.diffuseColor = new Color3(0.1, 0.15, 0.2);
                    sensorMat.emissiveColor = new Color3(0.3, 0.25, 0);
                    sensor.material = sensorMat;
                }

                // Верхние вентиляционные решетки на крыше
                for (let i = 0; i < 4; i++) {
                    const roofVent = MeshBuilder.CreateBox(`previewCommandRoofVent${i}`, { width: 0.15, height: 0.04, depth: 0.12 }, scene);
                    roofVent.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.25, h * 0.58, (i < 2 ? -1 : 1) * d * 0.25);
                    roofVent.parent = chassis;
                    const roofVentMat = new StandardMaterial(`previewCommandRoofVentMat${i}`, scene);
                    roofVentMat.diffuseColor = new Color3(0.12, 0.12, 0.12);
                    roofVent.material = roofVentMat;
                }

                // Задние огни (стоп-сигналы)
                for (let i = 0; i < 2; i++) {
                    const tailLight = MeshBuilder.CreateBox(`previewCommandTailLight${i}`, { width: 0.06, height: 0.1, depth: 0.04 }, scene);
                    tailLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.4, h * 0.16, -d * 0.49);
                    tailLight.parent = chassis;
                    const tailLightMat = new StandardMaterial(`previewCommandTailLightMat${i}`, scene);
                    tailLightMat.diffuseColor = new Color3(0.6, 0.1, 0.1);
                    tailLightMat.emissiveColor = new Color3(0.3, 0.05, 0.05);
                    tailLight.material = tailLightMat;
                }

                // Радиоантенна сзади (главная)
                const commandAntenna = MeshBuilder.CreateBox("previewCommandAntenna", { width: 0.03, height: 0.6, depth: 0.03 }, scene);
                commandAntenna.position = new Vector3(0, h * 0.8, -d * 0.3);
                commandAntenna.parent = chassis;
                const commandAntennaMat = new StandardMaterial("previewCommandAntennaMat", scene);
                commandAntennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
                commandAntenna.material = commandAntennaMat;

                // Основание антенны
                const commandAntennaBase = MeshBuilder.CreateBox("previewCommandAntennaBase", { width: 0.12, height: 0.12, depth: 0.12 }, scene);
                commandAntennaBase.position = new Vector3(0, h * 0.66, -d * 0.3);
                commandAntennaBase.parent = chassis;
                commandAntennaBase.material = armorMat;

                // Выхлопные трубы сзади
                for (let i = 0; i < 2; i++) {
                    const exhaust = MeshBuilder.CreateBox(`previewCommandExhaust${i}`, { width: 0.12, height: 0.2, depth: 0.12 }, scene);
                    exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
                                        exhaust.parent = chassis;
                    exhaust.material = armorMat;
                }

                // Боковые фары (сигнальные)
                for (let i = 0; i < 2; i++) {
                    const sideLight = MeshBuilder.CreateBox(`previewCommandSideLight${i}`, { width: 0.05, height: 0.07, depth: 0.05 }, scene);
                    sideLight.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.1, -d * 0.2);
                    sideLight.parent = chassis;
                    const sideLightMat = new StandardMaterial(`previewCommandSideLightMat${i}`, scene);
                    sideLightMat.diffuseColor = new Color3(0.7, 0.6, 0.3);
                    sideLightMat.emissiveColor = new Color3(0.15, 0.12, 0.08);
                    sideLight.material = sideLightMat;
                }
                break;
        }
        */
    }

    // NOTE: createTurretPreview and createUniqueCannonPreview moved to garage/preview.ts

    private cleanup3DPreview(): void {
        if (!this.previewSceneData) return;

        try {
            // ИСПРАВЛЕНО: Очищаем визуализацию траектории
            if (this.previewSceneData.trajectoryVisualization) {
                try {
                    disposeTrajectoryVisualization(this.previewSceneData.trajectoryVisualization);
                } catch (e) {
                    console.warn("[Garage] Error disposing trajectory visualization:", e);
                }
                this.previewSceneData.trajectoryVisualization = null;
            }

            // 1. Останавливаем все анимации
            if (this.previewSceneData.animationGroups) {
                this.previewSceneData.animationGroups.forEach(ag => {
                    try {
                        ag.stop();
                        if (ag.dispose) ag.dispose();
                    } catch (e) {
                        console.warn("[Garage] Error disposing animation:", e);
                    }
                });
                this.previewSceneData.animationGroups = [];
            }

            // 2. Используем модульную функцию очистки
            try {
                cleanupPreviewScene(this.previewSceneData);
            } catch (e) {
                console.warn("[Garage] Error in cleanupPreviewScene:", e);
            }

            // 3. Очищаем ссылки
            this.previewSceneData = null;
            this.previewTank = null;
        } catch (error) {
            console.error("[Garage] Error in cleanup3DPreview:", error);
            // Принудительно очищаем ссылки даже при ошибке
            this.previewSceneData = null;
            this.previewTank = null;
        }
    }

    // ============ CURSOR MANAGEMENT ============
    private showCursor(): void {
        // Unlock pointer lock if active
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Show cursor
        const canvas = this._scene?.getEngine()?.getRenderingCanvas() as HTMLCanvasElement;
        if (canvas) {
            canvas.style.cursor = "default";
        }
        document.body.style.cursor = "default";
    }

    private hideCursor(): void {
        // Hide cursor (will be locked again when user clicks on canvas)
        const canvas = this._scene?.getEngine()?.getRenderingCanvas() as HTMLCanvasElement;
        if (canvas) {
            canvas.style.cursor = "none";
        }
        document.body.style.cursor = "none";
    }

    // ============ UI CREATION ============
    private createUI(): void {
        this.overlay = document.createElement('div');
        this.overlay.className = 'garage-overlay';
        this.overlay.innerHTML = `
            <div class="garage-container">
                <div class="garage-header">
                    <div class="garage-title">[ GARAGE ]</div>
                    <div class="garage-currency">CR: ${this.currencyManager.getCurrency()}</div>
                    <button class="garage-close">X</button>
                </div>
                <div class="garage-tabs">
                    <div class="garage-tab ${this.currentCategory === 'chassis' ? 'active' : ''}" data-cat="chassis">[1] CHASSIS</div>
                    <div class="garage-tab ${this.currentCategory === 'cannons' ? 'active' : ''}" data-cat="cannons">[2] CANNONS</div>
                    <div class="garage-tab ${this.currentCategory === 'tracks' ? 'active' : ''}" data-cat="tracks">[3] TRACKS</div>
                    <div class="garage-tab ${this.currentCategory === 'modules' ? 'active' : ''}" data-cat="modules">[4] MODULES</div>
                    <div class="garage-tab ${this.currentCategory === 'supplies' ? 'active' : ''}" data-cat="supplies">[5] SUPPLIES</div>
                    <div class="garage-tab ${this.currentCategory === 'shop' ? 'active' : ''}" data-cat="shop">[6] SHOP</div>
                    <div class="garage-tab ${this.currentCategory === 'presets' ? 'active' : ''}" data-cat="presets">[7] PRESETS</div>
                    <div class="garage-tab ${this.currentCategory === 'workshop' ? 'active' : ''}" data-cat="workshop">[8] WORKSHOP</div>
                    <div class="garage-tab ${this.currentCategory === 'upgrade' ? 'active' : ''}" data-cat="upgrade">[9] ПРОКАЧКА</div>
                </div>
                <div class="garage-content">
                    <div class="garage-left">
                        <div class="garage-search">
                            <input type="text" placeholder="Search..." id="garage-search-input">
                        </div>
                        <div class="garage-filters">
                            <button class="garage-filter-btn ${this.filterMode === 'all' ? 'active' : ''}" data-filter="all">ALL</button>
                            <button class="garage-filter-btn ${this.filterMode === 'owned' ? 'active' : ''}" data-filter="owned">OWNED</button>
                            <button class="garage-filter-btn ${this.filterMode === 'locked' ? 'active' : ''}" data-filter="locked">LOCKED</button>
                            <div style="margin-left: auto; display: flex; gap: 4px; align-items: center;">
                                <button class="garage-sort-btn" id="garage-sort-btn">SORT: ${this.sortBy.toUpperCase()}</button>
                            </div>
                        </div>
                        <div class="garage-items" id="garage-items-list"></div>
                    </div>
                    <div class="garage-right">
                        <div class="garage-right-default" id="garage-right-default">
                            <div class="garage-preview">
                                <div class="garage-preview-title">[ CURRENT LOADOUT ]</div>
                                <div class="garage-preview-info">
                                    CHASSIS: ${getChassisById(this.currentChassisId).name}<br>
                                    CANNON: ${getCannonById(this.currentCannonId).name}<br>
                                    TRACKS: ${getTrackById(this.currentTrackId).name}
                                </div>
                            </div>
                            <div class="garage-details" id="garage-details">
                                <div class="garage-details-title">[ SELECT AN ITEM ]</div>
                            </div>
                        </div>
                        <div class="garage-upgrade-container" id="garage-upgrade-container" style="display: none;"></div>
                    </div>
                </div>
                <div class="garage-footer">
                    [↑↓] Navigate | [Enter] Select | [1-8] Categories | [ESC] Close
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);

        // Ensure cursor is visible (in case createUI is called separately)
        this.showCursor();

        this.setupEventListeners();
        this.refreshItemList();
    }

    private setupEventListeners(): void {
        if (!this.overlay) return;

        // ИСПРАВЛЕНО: Кнопка закрытия работает так же, как ESC
        const closeButton = this.overlay.querySelector('.garage-close');
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            });
        }

        // Кнопка сохранения пресета
        this.overlay.querySelector('#save-preset-btn')?.addEventListener('click', () => {
            this.saveCurrentConfigurationAsPreset();
        });

        // Tabs
        this.overlay.querySelectorAll('.garage-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const cat = (e.target as HTMLElement).dataset.cat as CategoryType;
                this.switchCategory(cat);
            });
        });

        // Filters
        this.overlay.querySelectorAll('.garage-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.filterMode = (e.target as HTMLElement).dataset.filter as "all" | "owned" | "locked";
                this.overlay!.querySelectorAll('.garage-filter-btn').forEach(b => b.classList.remove('active'));
                (e.target as HTMLElement).classList.add('active');
                this.refreshItemList();
            });
        });

        // Sort button
        const sortBtn = this.overlay.querySelector('#garage-sort-btn');
        sortBtn?.addEventListener('click', () => {
            if (this.sortBy === 'name') this.sortBy = 'stats';
            else if (this.sortBy === 'stats') this.sortBy = 'custom';
            else if (this.sortBy === 'custom') this.sortBy = 'unique';
            else this.sortBy = 'name';
            (sortBtn as HTMLElement).textContent = `SORT: ${this.sortBy.toUpperCase()}`;
            this.refreshItemList();
        });

        // Search
        const searchInput = this.overlay.querySelector('#garage-search-input') as HTMLInputElement;
        searchInput?.addEventListener('input', () => {
            this.searchText = searchInput.value;
            this.refreshItemList();
        });

        // Click outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    public switchCategory(cat: CategoryType): void {
        // Если выбрана категория workshop, открываем WorkshopUI
        if (cat === 'workshop') {
            this.openWorkshop();
            return;
        }

        this.currentCategory = cat;
        this.selectedItemIndex = 0;

        this.overlay?.querySelectorAll('.garage-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-cat') === cat);
        });

        // ПРОКАЧКА встроена в гараж: показываем панель прокачки справа, скрываем превью/детали
        const rightDefault = this.overlay?.querySelector('#garage-right-default') as HTMLElement | null;
        const upgradeContainer = this.overlay?.querySelector('#garage-upgrade-container') as HTMLElement | null;
        if (rightDefault && upgradeContainer) {
            if (cat === 'upgrade') {
                rightDefault.style.display = 'none';
                upgradeContainer.style.display = 'block';
                try {
                    upgradeUI.createEmbedded('garage-upgrade-container');
                } catch (e) {
                    console.warn('[Garage] Failed to embed upgrade UI:', e);
                }
            } else {
                rightDefault.style.display = '';
                upgradeContainer.style.display = 'none';
            }
        }

        this.refreshItemList();
    }

    private workshopUI: any = null;

    private openWorkshop(): void {
        // Импортируем и открываем WorkshopUI
        import('./workshop/WorkshopUI').then(module => {
            if (!this.workshopUI) {
                this.workshopUI = new module.default(this._scene);
            }
            this.workshopUI.show();
        }).catch(e => {
            console.error('[Garage] Failed to open Workshop:', e);
        });
    }

    /**
     * Проверяет, открыт ли Workshop
     */
    public isWorkshopOpen(): boolean {
        return this.workshopUI !== null && this.workshopUI.isVisible && this.workshopUI.isVisible();
    }

    private getItemsForCategory(): (TankPart | TankUpgrade)[] {
        switch (this.currentCategory) {
            case "chassis":
                // ГАРАНТИРУЕМ правильный порядок: создаем массив в порядке CHASSIS_TYPES
                const orderedChassis: TankPart[] = [];
                // Проходим по CHASSIS_TYPES в правильном порядке
                for (const chassis of CHASSIS_TYPES) {
                    const part = this.chassisParts.find(p => p.id === chassis.id);
                    if (part) {
                        orderedChassis.push(part);
                    }
                }
                // Если какие-то корпуса не найдены, добавляем их в конец
                for (const part of this.chassisParts) {
                    if (!orderedChassis.find(p => p.id === part.id)) {
                        orderedChassis.push(part);
                    }
                }
                // ОТЛАДКА: выводим порядок в консоль
                console.log('[Garage] Chassis order:', orderedChassis.map(c => c.name).join(' → '));
                console.log('[Garage] First chassis:', orderedChassis[0]?.name, orderedChassis[0]?.id);
                return orderedChassis;
            case "cannons": return [...this.cannonParts];
            case "tracks": return [...this.trackParts];
            case "modules": return [...this.moduleParts, ...this.upgrades.filter(u => u.level < u.maxLevel)];
            case "supplies": return [...this.supplyParts];
            case "shop": return [...this.shopItems];
            case "skins":
                // Преобразуем скины в формат TankPart для совместимости
                return SKIN_PRESETS.map(skin => ({
                    id: skin.id,
                    name: skin.name,
                    description: skin.description,
                    cost: 0, // Скины бесплатные
                    unlocked: true, // Все скины разблокированы
                    type: "module" as const, // Используем module для совместимости
                    stats: {}
                }));
            case "presets": return this.getPresetParts(); // Пресеты танков
            case "workshop":
                return [];
            case "upgrade":
                return [];
            default: return [];
        }
    }

    // Максимальное количество слотов для пресетов
    private readonly MAX_PRESET_SLOTS = 3;

    // Получить пресеты танков как TankPart для отображения в списке
    // Возвращает 3 слота - заполненные пресетами или пустые
    private getPresetParts(): TankPart[] {
        const presets: TankPart[] = [];

        // Добавляем существующие пресеты
        for (let i = 0; i < this.MAX_PRESET_SLOTS; i++) {
            const config = this.savedTankConfigurations[i];

            if (config) {
                // Заполненный слот
                presets.push({
                    id: `preset_slot_${i}`,
                    name: config.name || `Пресет ${i + 1}`,
                    description: `Корпус: ${config.chassisId}, Пушка: ${config.cannonId}, Гусеницы: ${config.trackId}`,
                    cost: 0,
                    unlocked: true,
                    type: "preset" as const,
                    stats: {}
                });
            } else {
                // Пустой слот
                presets.push({
                    id: `preset_slot_${i}_empty`,
                    name: `[ Слот ${i + 1} - Пустой ]`,
                    description: "Нажмите чтобы сохранить текущую конфигурацию",
                    cost: 0,
                    unlocked: true,
                    type: "preset" as const,
                    stats: {}
                });
            }
        }

        return presets;
    }

    // Проверить, является ли слот пустым
    private isEmptyPresetSlot(slotId: string): boolean {
        return slotId.endsWith('_empty');
    }

    // Получить индекс слота из ID
    private getPresetSlotIndex(slotId: string): number {
        const match = slotId.match(/preset_slot_(\d+)/);
        return match ? parseInt(match[1]!, 10) : -1;
    }

    // Загрузить сохраненные конфигурации танков
    private loadSavedTankConfigurations(): void {
        if (this.tankEditor) {
            this.savedTankConfigurations = this.tankEditor.loadSavedTanks();
        }
    }

    // Сохранить текущую конфигурацию как пресет
    private saveCurrentConfigurationAsPreset(): void {
        if (!this.tankEditor) return;

        inGamePrompt("Имя пресета:", `Tank_${Date.now()}`, "Пресет").then((name) => {
            if (!name) return;
            const config: TankConfiguration = {
                chassisId: this.currentChassisId,
                cannonId: this.currentCannonId,
                trackId: this.currentTrackId,
                skinId: this.currentSkinId || "default",
                name: name
            };
            this.tankEditor!.setConfiguration(config);
            this.tankEditor!.saveConfiguration(name);
            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет "${name}" сохранен!`, "success");
        }).catch(() => {});
    }

    // Применить пресет танка (сохраняет как pending)
    private applyPreset(presetId: string): void {
        const preset = this.savedTankConfigurations.find(p =>
            (p.name || `preset_${p.chassisId}_${p.cannonId}`) === presetId
        );

        if (!preset) return;

        // === НОВАЯ ЛОГИКА: Сохраняем как pending изменения ===
        if (preset.chassisId) {
            const currentActive = safeLocalStorage.get("selectedChassis", "medium");
            if (preset.chassisId !== currentActive) {
                this.pendingChassisId = preset.chassisId;
                safeLocalStorage.set("pendingChassis", preset.chassisId);
            }
            this.currentChassisId = preset.chassisId;
        }

        if (preset.cannonId) {
            const currentActive = safeLocalStorage.get("selectedCannon", "standard");
            if (preset.cannonId !== currentActive) {
                this.pendingCannonId = preset.cannonId;
                safeLocalStorage.set("pendingCannon", preset.cannonId);
            }
            this.currentCannonId = preset.cannonId;
        }

        if (preset.trackId) {
            const currentActive = safeLocalStorage.get("selectedTrack", "standard");
            if (preset.trackId !== currentActive) {
                this.pendingTrackId = preset.trackId;
                safeLocalStorage.set("pendingTrack", preset.trackId);
            }
            this.currentTrackId = preset.trackId;
        }

        if (preset.skinId) {
            const currentActive = loadSelectedSkin() || "default";
            if (preset.skinId !== currentActive) {
                this.pendingSkinId = preset.skinId;
                safeLocalStorage.set("pendingSkin", preset.skinId);
            }
            this.currentSkinId = preset.skinId;
        }

        const hasPending = this.pendingChassisId || this.pendingCannonId || this.pendingTrackId || this.pendingSkinId;
        if (hasPending) {
            this.showNotification(`Пресет "${preset.name || presetId}" выбран. Заедьте в гараж для применения!`, "info");
        } else {
            this.showNotification(`Пресет "${preset.name || presetId}" уже активен!`, "success");
        }
        this.refreshItemList();
    }

    // Получить HTML информацию о пресете
    private getPresetInfoHTML(item: TankPart): string {
        const preset = this.savedTankConfigurations.find(p =>
            (p.name || `preset_${p.chassisId}_${p.cannonId}`) === item.id
        );

        if (!preset) return '';

        const chassis = getChassisById(preset.chassisId);
        const cannon = getCannonById(preset.cannonId);
        const track = getTrackById(preset.trackId);
        const skin = getSkinById(preset.skinId || "default");

        return `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                <div style="color: #0ff; font-size: 10px; margin-bottom: 8px; font-weight: bold;">КОНФИГУРАЦИЯ ПРЕСЕТА</div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Корпус</span>
                    <span class="garage-stat-value" style="color: #0f0;">${chassis.name}</span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Пушка</span>
                    <span class="garage-stat-value" style="color: #0aa;">${cannon.name}</span>
                </div>
                <div class="garage-stats-row">
                    <span class="garage-stat-name">Гусеницы</span>
                    <span class="garage-stat-value" style="color: #ff0;">${track.name}</span>
                </div>
                ${skin ? `
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Скин</span>
                        <span class="garage-stat-value" style="color: ${skin.chassisColor};">${skin.name}</span>
                    </div>
                ` : ''}
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                    <div style="color: #0aa; font-size: 10px; margin-bottom: 5px;">ХАРАКТЕРИСТИКИ</div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">HP</span>
                        <span class="garage-stat-value">${chassis.maxHealth}</span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Скорость</span>
                        <span class="garage-stat-value">${chassis.moveSpeed}</span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Урон</span>
                        <span class="garage-stat-value">${cannon.damage}</span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Перезарядка</span>
                        <span class="garage-stat-value">${(cannon.cooldown / 1000).toFixed(1)}s</span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">DPS</span>
                        <span class="garage-stat-value" style="color: #ff0;">${(cannon.damage / (cannon.cooldown / 1000)).toFixed(1)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // Переименовать пресет
    private renamePreset(presetId: string): void {
        const preset = this.savedTankConfigurations.find(p =>
            (p.name || `preset_${p.chassisId}_${p.cannonId}`) === presetId
        );

        if (!preset) return;

        inGamePrompt(`Введите новое имя для пресета "${presetId}":`, preset.name || presetId, "Переименовать").then((newName) => {
            if (!newName || newName.trim() === '' || newName === preset.name) return;

        // Находим индекс пресета в сохраненных конфигурациях
        const presetIndex = this.savedTankConfigurations.findIndex(p =>
            (p.name || `preset_${p.chassisId}_${p.cannonId}`) === presetId
        );

        if (presetIndex >= 0 && presetIndex < this.savedTankConfigurations.length) {
            // Обновляем имя пресета, сохраняя все остальные поля
            const originalConfig = this.savedTankConfigurations[presetIndex];
            if (!originalConfig) return;

            const updatedConfig: TankConfiguration = {
                chassisId: originalConfig.chassisId,
                cannonId: originalConfig.cannonId,
                trackId: originalConfig.trackId,
                skinId: originalConfig.skinId,
                name: newName.trim()
            };
            this.savedTankConfigurations[presetIndex] = updatedConfig;

            // Сохраняем все конфигурации обратно
            try {
                const saved = localStorage.getItem("savedTankConfigurations");
                if (saved) {
                    const allConfigs: TankConfiguration[] = JSON.parse(saved);
                    allConfigs[presetIndex] = updatedConfig;
                    localStorage.setItem("savedTankConfigurations", JSON.stringify(allConfigs));
                }
            } catch (e) {
                console.warn("Failed to rename preset:", e);
                return;
            }

            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет переименован в "${newName}"!`, "success");
        }
        }).catch(() => {});
    }

    // Удалить пресет
    private deletePreset(presetId: string): void {
        inGameConfirm(`Удалить пресет "${presetId}"?`, "Подтверждение").then((ok) => {
            if (!ok) return;

        if (!this.tankEditor) return;

        // Находим индекс пресета в сохраненных конфигурациях
        const presetIndex = this.savedTankConfigurations.findIndex(p =>
            (p.name || `preset_${p.chassisId}_${p.cannonId}`) === presetId
        );

        if (presetIndex >= 0) {
            this.tankEditor!.deleteSavedConfiguration(presetIndex);
            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет "${presetId}" удален!`, "info");
        }
        }).catch(() => {});
    }

    // === МЕТОДЫ ДЛЯ РАБОТЫ С ПРЕСЕТАМИ ПО СЛОТАМ ===

    /**
     * Создать пресет в указанном слоте
     */
    private createPresetInSlot(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= this.MAX_PRESET_SLOTS) return;

        // Проверяем, не занят ли слот
        if (this.savedTankConfigurations[slotIndex]) {
            this.showNotification("Этот слот уже занят!", "error");
            return;
        }

        inGamePrompt("Введите имя для пресета:", `Пресет ${slotIndex + 1}`, "Пресет").then((name) => {
            if (!name || !name.trim()) return;
            const config: TankConfiguration = {
                chassisId: this.currentChassisId,
                cannonId: this.currentCannonId,
                trackId: this.currentTrackId,
                skinId: this.currentSkinId || "default",
                name: name.trim()
            };
            try {
                const saved = localStorage.getItem("savedTankConfigurations");
                const configs: TankConfiguration[] = saved ? JSON.parse(saved) : [];
                while (configs.length < slotIndex) {
                    configs.push(null as any);
                }
                configs[slotIndex] = config;
                localStorage.setItem("savedTankConfigurations", JSON.stringify(configs.filter(c => c !== null)));
            } catch (e) {
                console.warn("Failed to save preset:", e);
                this.showNotification("Ошибка сохранения пресета!", "error");
                return;
            }
            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет "${name}" создан!`, "success");
        }).catch(() => {});
    }

    /**
     * Применить пресет из указанного слота
     */
    private applyPresetFromSlot(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= this.savedTankConfigurations.length) return;

        const preset = this.savedTankConfigurations[slotIndex];
        if (!preset) {
            this.showNotification("Слот пуст!", "error");
            return;
        }

        // Применяем конфигурацию как pending
        if (preset.chassisId) {
            const currentActive = safeLocalStorage.get("selectedChassis", "medium");
            if (preset.chassisId !== currentActive) {
                this.pendingChassisId = preset.chassisId;
                safeLocalStorage.set("pendingChassis", preset.chassisId);
            }
            this.currentChassisId = preset.chassisId;
        }

        if (preset.cannonId) {
            const currentActive = safeLocalStorage.get("selectedCannon", "standard");
            if (preset.cannonId !== currentActive) {
                this.pendingCannonId = preset.cannonId;
                safeLocalStorage.set("pendingCannon", preset.cannonId);
            }
            this.currentCannonId = preset.cannonId;
        }

        if (preset.trackId) {
            const currentActive = safeLocalStorage.get("selectedTrack", "standard");
            if (preset.trackId !== currentActive) {
                this.pendingTrackId = preset.trackId;
                safeLocalStorage.set("pendingTrack", preset.trackId);
            }
            this.currentTrackId = preset.trackId;
        }

        if (preset.skinId) {
            // Скины применяются немедленно
            saveSelectedSkin(preset.skinId);
            this.currentSkinId = preset.skinId;

            // Применяем скин к танку если он есть
            if (this.tankController?.chassis) {
                const skin = getSkinById(preset.skinId);
                if (skin) {
                    if (this.tankController.chassis.material) {
                        applySkinColorToMaterial(this.tankController.chassis.material as StandardMaterial, Color3.FromHexString(skin.chassisColor));
                    }
                }
            }
        }

        const hasPending = this.pendingChassisId || this.pendingCannonId || this.pendingTrackId;
        if (hasPending) {
            this.showNotification(`Пресет "${preset.name}" применён! Заедьте в гараж на карте для активации.`, "info");
        } else {
            this.showNotification(`Пресет "${preset.name}" активирован!`, "success");
        }

        // Обновляем превью
        this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        this.refreshItemList();
    }

    /**
     * Переименовать пресет в указанном слоте
     */
    private renamePresetInSlot(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= this.savedTankConfigurations.length) return;

        const preset = this.savedTankConfigurations[slotIndex];
        if (!preset) {
            this.showNotification("Слот пуст!", "error");
            return;
        }

        inGamePrompt("Новое имя пресета:", preset.name || `Пресет ${slotIndex + 1}`, "Переименовать").then((newName) => {
            if (!newName || !newName.trim()) return;
            try {
                const saved = localStorage.getItem("savedTankConfigurations");
                if (saved) {
                    const configs: TankConfiguration[] = JSON.parse(saved);
                    if (configs[slotIndex]) {
                        configs[slotIndex].name = newName.trim();
                        localStorage.setItem("savedTankConfigurations", JSON.stringify(configs));
                    }
                }
            } catch (e) {
                console.warn("Failed to rename preset:", e);
                this.showNotification("Ошибка переименования!", "error");
                return;
            }
            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет переименован в "${newName}"!`, "success");
        }).catch(() => {});
    }

    /**
     * Удалить пресет из указанного слота
     */
    private deletePresetFromSlot(slotIndex: number): void {
        if (slotIndex < 0 || slotIndex >= this.savedTankConfigurations.length) return;

        const preset = this.savedTankConfigurations[slotIndex];
        if (!preset) {
            this.showNotification("Слот уже пуст!", "info");
            return;
        }

        inGameConfirm(`Удалить пресет "${preset.name || `Пресет ${slotIndex + 1}`}"?`, "Подтверждение").then((ok) => {
            if (!ok) return;
            try {
                const saved = localStorage.getItem("savedTankConfigurations");
                if (saved) {
                    const configs: TankConfiguration[] = JSON.parse(saved);
                    configs.splice(slotIndex, 1);
                    localStorage.setItem("savedTankConfigurations", JSON.stringify(configs));
                }
            } catch (e) {
                console.warn("Failed to delete preset:", e);
                this.showNotification("Ошибка удаления!", "error");
                return;
            }
            this.loadSavedTankConfigurations();
            this.refreshItemList();
            this.showNotification(`Пресет удалён!`, "info");
        }).catch(() => {});
    }

    // Показать уведомление
    private showNotification(message: string, type: "success" | "error" | "info" = "success"): void {
        // Создаем визуальное уведомление
        const notification = document.createElement("div");
        notification.className = "garage-notification"; // For potential CSS selection
        const colors = {
            success: { bg: "rgba(10, 40, 10, 0.95)", border: "#4ade80", text: "#4ade80" },
            error: { bg: "rgba(40, 10, 10, 0.95)", border: "#f87171", text: "#f87171" },
            info: { bg: "rgba(10, 20, 60, 0.95)", border: "#60a5fa", text: "#60a5fa" }
        };
        const color = colors[type];

        // Calculate offset based on implementation
        const existingNotifications = document.querySelectorAll('.garage-notification');
        const offset = existingNotifications.length * 80; // 80px per notification

        notification.style.cssText = `
            position: fixed;
            top: ${20 + offset}px;
            right: 20px;
            background: ${color.bg};
            border: 2px solid ${color.border};
            color: ${color.text};
            padding: 15px 25px;
            z-index: 10001;
            font-family: 'Press Start 2P', monospace;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
            word-wrap: break-word;
            border-radius: 8px;
            transition: top 0.3s ease-out;
        `;

        // Добавляем стили для анимации, если их еще нет
        if (!document.getElementById("garage-notification-styles")) {
            const style = document.createElement("style");
            style.id = "garage-notification-styles";
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        // Удаляем уведомление через 3 секунды
        setTimeout(() => {
            notification.style.animation = "slideOutRight 0.3s ease-out";
            setTimeout(() => {
                notification.remove();
                // Re-stack remaining notifications
                const remaining = document.querySelectorAll('.garage-notification');
                remaining.forEach((el, index) => {
                    (el as HTMLElement).style.top = `${20 + index * 80}px`;
                });
            }, 300);
        }, 3000);

        console.log(`[Garage] ${message}`);
    }

    private refreshItemList(): void {
        const container = this.overlay?.querySelector('#garage-items-list');
        if (!container) return;

        let items = this.getItemsForCategory();

        // Filter by search
        if (this.searchText.trim()) {
            const s = this.searchText.toLowerCase();
            items = items.filter(i => i.name.toLowerCase().includes(s) || i.description.toLowerCase().includes(s));
        }

        // Filter by owned/locked
        if (this.filterMode !== 'all') {
            items = items.filter(i => {
                const owned = 'level' in i ? i.level > 0 : (i as TankPart).unlocked;
                return this.filterMode === 'owned' ? owned : !owned;
            });
        }

        // Sort items
        // ВАЖНО: Для корпусов порядок уже установлен в getItemsForCategory(), не меняем его!
        if (this.currentCategory === 'chassis') {
            // Для корпусов НЕ применяем сортировку - порядок уже правильный из CHASSIS_TYPES
            console.log('[Garage] Chassis category - skipping sort, order:', items.map(i => (i as TankPart).name).join(' → '));
        } else {
            items.sort((a, b) => {
                // Для остальных элементов применяем обычную сортировку
                if (this.sortBy === 'name') {
                    return a.name.localeCompare(b.name);
                } else if (this.sortBy === 'stats') {
                    const aStats = this.getTotalStats(a);
                    const bStats = this.getTotalStats(b);
                    return bStats - aStats; // Higher stats first
                } else if (this.sortBy === 'custom') {
                    // CUSTOM: показываем только кастомные танки (для будущего конструктора)
                    // Пока что все элементы не кастомные, поэтому сортируем по имени
                    const aIsCustom = (a as any).isCustom || false;
                    const bIsCustom = (b as any).isCustom || false;
                    if (aIsCustom && !bIsCustom) return -1;
                    if (!aIsCustom && bIsCustom) return 1;
                    return a.name.localeCompare(b.name);
                } else { // unique
                    // UNIQUE: показываем только уникальные элементы
                    // Пока что все элементы не уникальные, поэтому сортируем по имени
                    const aIsUnique = (a as any).isUnique || false;
                    const bIsUnique = (b as any).isUnique || false;
                    if (aIsUnique && !bIsUnique) return -1;
                    if (!aIsUnique && bIsUnique) return 1;
                    return a.name.localeCompare(b.name);
                }
            });
        }

        this.filteredItems = items;

        // Финальная проверка для корпусов
        if (this.currentCategory === 'chassis') {
            console.log('[Garage] Final chassis order:', this.filteredItems.map(i => (i as TankPart).name).join(' → '));
        }
        if (this.selectedItemIndex >= items.length) this.selectedItemIndex = Math.max(0, items.length - 1);

        // Define new models
        const newChassisIds = new Set(["stealth", "hover", "siege", "racer", "amphibious", "shield", "drone", "artillery", "destroyer", "command"]);
        const newCannonIds = new Set(["plasma", "laser", "tesla", "railgun", "rocket", "mortar", "cluster", "explosive", "flamethrower", "acid", "freeze", "poison", "emp", "multishot", "homing", "piercing", "shockwave", "beam", "vortex", "support"]);

        // Определяем какие элементы имеют pending статус
        const activeChassis = safeLocalStorage.get("selectedChassis", "medium");
        const activeCannon = safeLocalStorage.get("selectedCannon", "standard");
        const activeTrack = safeLocalStorage.get("selectedTrack", "standard");
        const activeSkin = loadSelectedSkin() || "default";

        // ОТЛАДКА: проверяем порядок перед отрисовкой
        if (this.currentCategory === 'chassis') {
            console.log('[Garage] Rendering chassis order:', items.map(i => (i as TankPart).name).join(' → '));
        }

        container.innerHTML = items.map((item, i) => {
            const isUpgrade = 'level' in item;
            const owned = isUpgrade ? true : (item as TankPart).unlocked;

            // Проверяем equipped - активное оборудование на танке
            const equipped = !isUpgrade && (
                ((item as TankPart).type === 'chassis' && item.id === activeChassis) ||
                ((item as TankPart).type === 'barrel' && item.id === activeCannon) ||
                ((item as TankPart).type === 'module' && this.trackParts.find(t => t.id === item.id) && item.id === activeTrack) ||
                ((item as TankPart).type === 'module' && !this.trackParts.find(t => t.id === item.id) &&
                    (this.tankController as any)?.equipment?.installedModules?.values() &&
                    Array.from((this.tankController as any).equipment.installedModules.values()).includes((item as TankPart).id))
            );

            // Проверяем pending - выбранное, но ещё не примененное
            const isPending = !isUpgrade && (
                ((item as TankPart).type === 'chassis' && item.id === this.pendingChassisId) ||
                ((item as TankPart).type === 'barrel' && item.id === this.pendingCannonId) ||
                ((item as TankPart).type === 'module' && item.id === this.pendingTrackId) ||
                (this.currentCategory === 'skins' && item.id === this.pendingSkinId)
            );

            const selected = i === this.selectedItemIndex;
            const isNew = !isUpgrade && (
                ((item as TankPart).type === 'chassis' && newChassisIds.has(item.id)) ||
                ((item as TankPart).type === 'barrel' && newCannonIds.has(item.id))
            );

            const statsStr = this.formatStats(item);
            const priceStr = owned && !isUpgrade ? 'OWNED' : `${item.cost} CR`;

            const itemNumber = i + 1; // Нумерация с 1
            const isPreset = !isUpgrade && (item as TankPart).type === 'preset';
            const isEmptyPreset = isPreset && this.isEmptyPresetSlot(item.id);

            // Статус отображение
            let statusBadge = '';
            if (isPending) {
                statusBadge = '<span style="color: #ff0; margin-left: 5px; animation: pendingPulse 1s infinite;">[⏳ ОЖИДАЕТ]</span>';
            } else if (equipped) {
                statusBadge = '<span style="color: #0f0; margin-left: 5px;">[✓ АКТИВНО]</span>';
            }

            // Специальная отрисовка для пресетов
            if (isPreset) {
                if (isEmptyPreset) {
                    // Пустой слот пресета
                    return `
                        <div class="garage-item ${selected ? 'selected' : ''} preset-slot empty-slot" data-index="${i}" data-item-id="${item.id}">
                            <div class="garage-item-name" style="color: #666;">
                                <span style="color: #444; font-weight: bold; margin-right: 8px;">[${itemNumber}]</span>
                                <span style="color: #0ff; opacity: 0.5; margin-right: 5px;">📦</span>
                                ${item.name}
                            </div>
                            <div class="garage-item-desc" style="color: #555;">${item.description}</div>
                            <div style="margin-top: 10px;">
                                <button class="preset-action-btn create-preset-btn" data-action="create-preset" data-slot-id="${item.id}" style="
                                    background: linear-gradient(180deg, rgba(0,255,100,0.3), rgba(0,200,80,0.2));
                                    border: 2px solid #0f0;
                                    color: #0f0;
                                    padding: 8px 16px;
                                    font-size: 11px;
                                    cursor: pointer;
                                    font-weight: bold;
                                    text-transform: uppercase;
                                    letter-spacing: 1px;
                                ">➕ СОЗДАТЬ ПРЕСЕТ</button>
                            </div>
                        </div>
                    `;
                } else {
                    // Заполненный слот пресета
                    const slotIndex = this.getPresetSlotIndex(item.id);
                    const config = this.savedTankConfigurations[slotIndex];
                    const chassisName = config?.chassisId || 'N/A';
                    const cannonName = config?.cannonId || 'N/A';
                    const trackName = config?.trackId || 'N/A';

                    return `
                        <div class="garage-item ${selected ? 'selected' : ''} preset-slot filled-slot" data-index="${i}" data-item-id="${item.id}">
                            <div class="garage-item-name">
                                <span style="color: #ffd700; font-weight: bold; margin-right: 8px;">[${itemNumber}]</span>
                                <span style="color: #0ff; font-weight: bold; margin-right: 5px;">📦</span>
                                ${item.name}
                                <span style="color: #0ff; margin-left: 8px; font-size: 9px;">[ПРЕСЕТ]</span>
                            </div>
                            <div class="garage-item-desc">
                                <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; font-size: 10px; margin-top: 5px;">
                                    <span style="color: #888;">Корпус:</span><span style="color: #0f0;">${chassisName}</span>
                                    <span style="color: #888;">Пушка:</span><span style="color: #ff0;">${cannonName}</span>
                                    <span style="color: #888;">Гусеницы:</span><span style="color: #0ff;">${trackName}</span>
                                </div>
                            </div>
                            <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                                <button class="preset-action-btn" data-action="apply-preset" data-preset-id="${item.id}" style="
                                    background: linear-gradient(180deg, rgba(0,255,0,0.3), rgba(0,200,0,0.2));
                                    border: 1px solid #0f0;
                                    color: #0f0;
                                    padding: 5px 12px;
                                    font-size: 10px;
                                    cursor: pointer;
                                    font-weight: bold;
                                ">▶️ ПРИМЕНИТЬ</button>
                                <button class="preset-action-btn" data-action="rename-preset" data-preset-id="${item.id}" style="
                                    background: rgba(0,255,255,0.2);
                                    border: 1px solid #0ff;
                                    color: #0ff;
                                    padding: 5px 10px;
                                    font-size: 10px;
                                    cursor: pointer;
                                ">✏️ Имя</button>
                                <button class="preset-action-btn" data-action="delete-preset" data-preset-id="${item.id}" style="
                                    background: rgba(255,0,0,0.2);
                                    border: 1px solid #f00;
                                    color: #f00;
                                    padding: 5px 10px;
                                    font-size: 10px;
                                    cursor: pointer;
                                ">🗑️ Удалить</button>
                            </div>
                        </div>
                    `;
                }
            }

            return `
                <div class="garage-item ${selected ? 'selected' : ''} ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''} ${isPending ? 'pending' : ''} ${isNew ? 'new-item' : ''}" data-index="${i}" data-item-id="${item.id}">
                    <div class="garage-item-name">
                        <span style="color: #ffd700; font-weight: bold; margin-right: 8px;">[${itemNumber}]</span>
                        ${isNew ? '<span class="new-badge">[NEW]</span> ' : ''}${item.name} ${statusBadge}
                    </div>
                    <div class="garage-item-desc">${item.description}</div>
                    <div class="garage-item-stats">${statsStr}</div>
                    <div class="garage-item-price">${priceStr}</div>
                </div>
            `;
        }).join('');

        // ОТЛАДКА: проверяем порядок элементов в DOM после отрисовки
        if (this.currentCategory === 'chassis') {
            setTimeout(() => {
                const domItems = container.querySelectorAll('.garage-item[data-item-id]');
                const domOrder = Array.from(domItems).map(el => {
                    const id = el.getAttribute('data-item-id');
                    const name = el.querySelector('.garage-item-name')?.textContent?.trim() || '';
                    return `${name}(${id})`;
                }).join(' → ');
                console.log('[Garage] DOM order after render:', domOrder);

                // Проверяем, что первый элемент - Racer
                const firstItem = domItems[0];
                if (firstItem) {
                    const firstId = firstItem.getAttribute('data-item-id');
                    const firstName = firstItem.querySelector('.garage-item-name')?.textContent?.trim() || '';
                    console.log('[Garage] First DOM item:', firstName, firstId);
                    if (firstId !== 'racer') {
                        console.error('[Garage] ❌ ERROR: First item should be "racer" but got:', firstId);
                    }
                }
            }, 0);
        }

        // Add click listeners using event delegation (более надёжно)
        // Удаляем старые обработчики если есть
        const oldHandler = (container as any)._garageClickHandler;
        if (oldHandler) {
            container.removeEventListener('click', oldHandler);
        }

        // Создаём новый обработчик
        const clickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            const itemEl = target.closest('.garage-item') as HTMLElement;

            if (!itemEl) {
                // Клик не на элементе
                return;
            }

            // Не обрабатываем клик, если нажата кнопка действия
            if (target.closest('.preset-action-btn')) {
                return;
            }

            const clickedIdx = parseInt(itemEl.getAttribute('data-index') || '0');
            this.selectedItemIndex = clickedIdx;
            const item = this.filteredItems[clickedIdx];

            if (!item) {
                return;
            }

            // Если часть разблокирована - применяем сразу, иначе показываем детали
            if ('unlocked' in item && item.unlocked) {
                this.handleAction(item);
            } else {
                this.showDetails(item);
            }

            // НЕ обновляем список сразу - это может вызвать проблемы
            // Обновим только если нужно показать изменения
            // this.refreshItemList();
        };

        // Сохраняем ссылку на обработчик для возможности удаления
        (container as any)._garageClickHandler = clickHandler;
        container.addEventListener('click', clickHandler);

        // Двойной клик - тоже применяем (для совместимости)
        const oldDblHandler = (container as any)._garageDblClickHandler;
        if (oldDblHandler) {
            container.removeEventListener('dblclick', oldDblHandler);
        }

        const dblClickHandler = (e: Event) => {
            const target = e.target as HTMLElement;
            const itemEl = target.closest('.garage-item') as HTMLElement;

            if (!itemEl) return;

            e.preventDefault();
            const idx = parseInt(itemEl.getAttribute('data-index') || '0');
            const item = this.filteredItems[idx];
            if (item) {
                this.handleAction(item);
            }
        };

        (container as any)._garageDblClickHandler = dblClickHandler;
        container.addEventListener('dblclick', dblClickHandler);

        // Add listeners for preset action buttons

        // Создание пресета
        container.querySelectorAll('[data-action="create-preset"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const slotId = (e.target as HTMLElement).getAttribute('data-slot-id');
                if (slotId) {
                    const slotIndex = this.getPresetSlotIndex(slotId);
                    this.createPresetInSlot(slotIndex);
                }
            });
        });

        // Применение пресета
        container.querySelectorAll('[data-action="apply-preset"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetId = (e.target as HTMLElement).getAttribute('data-preset-id');
                if (presetId) {
                    const slotIndex = this.getPresetSlotIndex(presetId);
                    this.applyPresetFromSlot(slotIndex);
                }
            });
        });

        // Переименование пресета
        container.querySelectorAll('[data-action="rename-preset"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetId = (e.target as HTMLElement).getAttribute('data-preset-id');
                if (presetId) {
                    const slotIndex = this.getPresetSlotIndex(presetId);
                    this.renamePresetInSlot(slotIndex);
                }
            });
        });

        // Удаление пресета
        container.querySelectorAll('[data-action="delete-preset"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const presetId = (e.target as HTMLElement).getAttribute('data-preset-id');
                if (presetId) {
                    const slotIndex = this.getPresetSlotIndex(presetId);
                    this.deletePresetFromSlot(slotIndex);
                }
            });
        });

        // Show details if item selected
        if (items.length > 0 && items[this.selectedItemIndex]) {
            const selectedItem = items[this.selectedItemIndex];
            if (selectedItem) {
                this.showDetails(selectedItem);
                // Update preview only if 3D scene is initialized
                if (this.previewSceneData?.scene) {
                    this.updatePreview(selectedItem);
                }
            }
        }

        // Update currency
        const currencyEl = this.overlay?.querySelector('.garage-currency');
        if (currencyEl) currencyEl.textContent = `CR: ${this.currencyManager.getCurrency()}`;

        // Прокрутить к выбранному элементу, чтобы он был всегда виден
        this.scrollToSelectedItem();
    }

    private updatePreview(item: TankPart | TankUpgrade): void {
        const previewInfo = this.overlay?.querySelector('.garage-preview-info');
        if (!previewInfo) return;

        if ('level' in item) {
            // Upgrade preview
            previewInfo.innerHTML = `
                <div style="color: #0aa;">UPGRADE: ${item.name}</div>
                <div style="color: #080; font-size: 11px; margin-top: 5px;">
                    Level: ${item.level}/${item.maxLevel}<br>
                    ${item.stat.toUpperCase()}: ${item.value > 0 ? '+' : ''}${item.value}
                </div>
            `;
        } else {
            const part = item as TankPart;
            let chassisName = getChassisById(this.currentChassisId).name;
            let cannonName = getCannonById(this.currentCannonId).name;
            let trackName = getTrackById(this.currentTrackId).name;
            let previewChassisId = this.currentChassisId;
            let previewCannonId = this.currentCannonId;
            let previewTrackId = this.currentTrackId;

            if (part.type === 'chassis') {
                chassisName = part.name;
                previewChassisId = part.id;
            } else if (part.type === 'barrel') {
                cannonName = part.name;
                previewCannonId = part.id;
            } else if (part.type === 'module' && this.trackParts.find(t => t.id === part.id)) {
                trackName = getTrackById(part.id).name;
                previewTrackId = part.id;
            }
            previewInfo.innerHTML = `
                <div style="color: #0f0;">CHASSIS: ${chassisName}</div>
                <div style="color: #0aa; margin-top: 5px;">CANNON: ${cannonName}</div>
                <div style="color: #ff0; margin-top: 5px;">TRACKS: ${trackName}</div>
                ${part.type === 'chassis' || part.type === 'barrel' || (part.type === 'module' && this.trackParts.find(t => t.id === part.id)) ?
                    '<div style="color: #ff0; font-size: 10px; margin-top: 8px;">[ PREVIEW ]</div>' : ''}
            `;

            // Update 3D preview if chassis, barrel or tracks changed (only if scene is initialized)
            if ((part.type === 'chassis' || part.type === 'barrel' || (part.type === 'module' && this.trackParts.find(t => t.id === part.id))) && this.previewSceneData?.scene) {
                if (part.type === 'module' && this.trackParts.find(t => t.id === part.id)) {
                    this.currentTrackId = previewTrackId;
                }
                this.renderTankPreview(previewChassisId, previewCannonId);

                // ИСПРАВЛЕНО: Обновляем траекторию при выборе пушки
                if (part.type === 'barrel' && this.currentCategory === 'cannons' && this.previewTank) {
                    const cannonType = getCannonById(previewCannonId);
                    if (cannonType) {
                        const tankPosition = this.previewTank.chassis.position.clone();
                        const barrelDirection = Vector3.Forward().applyRotationQuaternion(
                            this.previewTank.barrel.absoluteRotationQuaternion ||
                            this.previewTank.turret.absoluteRotationQuaternion ||
                            this.previewTank.chassis.absoluteRotationQuaternion
                        );

                        // ОТКЛЮЧЕНО: Визуализация траектории отключена по запросу пользователя
                        // this.previewSceneData.trajectoryVisualization = updateTrajectoryVisualization(
                        //     this.previewSceneData.trajectoryVisualization || null,
                        //     this.previewSceneData.scene,
                        //     cannonType,
                        //     tankPosition,
                        //     barrelDirection
                        // );

                        // Очищаем старую визуализацию если она есть
                        if (this.previewSceneData.trajectoryVisualization) {
                            disposeTrajectoryVisualization(this.previewSceneData.trajectoryVisualization);
                            this.previewSceneData.trajectoryVisualization = null;
                        }
                    }
                }
            }
        }
    }

    private getTotalStats(item: TankPart | TankUpgrade): number {
        if ('level' in item) {
            return item.value * item.level;
        }
        const part = item as TankPart;
        let total = 0;
        if (part.stats.health) total += part.stats.health;
        if (part.stats.speed) total += part.stats.speed * 10;
        if (part.stats.damage) total += part.stats.damage * 5;
        if (part.stats.armor) total += part.stats.armor * 20;
        if (part.stats.reload) total += Math.abs(part.stats.reload) * 0.1;
        return total;
    }

    private formatStats(item: TankPart | TankUpgrade): string {
        if ('level' in item) return `Lv.${item.level}/${item.maxLevel} | ${item.stat.toUpperCase()}: ${item.value > 0 ? '+' : ''}${item.value}`;
        const p = item as TankPart;
        const s: string[] = [];
        if (p.stats.health) s.push(`HP:${p.stats.health}`);
        if (p.stats.speed) s.push(`SPD:${p.stats.speed}`);
        if (p.stats.damage) s.push(`DMG:${p.stats.damage}`);
        if (p.stats.dps) s.push(`DPS:${p.stats.dps}`);
        if (p.stats.reload) s.push(`RLD:${p.stats.reload}ms`);
        return s.join(' | ');
    }

    private showDetails(item: TankPart | TankUpgrade): void {
        const container = this.overlay?.querySelector('#garage-details');
        if (!container) return;

        const isUpgrade = 'level' in item;
        const canAfford = this.currencyManager.getCurrency() >= item.cost;
        const equipped = !isUpgrade && (
            ((item as TankPart).type === 'chassis' && item.id === this.currentChassisId) ||
            ((item as TankPart).type === 'barrel' && item.id === this.currentCannonId) ||
            ((item as TankPart).type === 'module' && this.trackParts.find(t => t.id === item.id) && item.id === this.currentTrackId) ||
            (this.currentCategory === 'skins' && item.id === this.currentSkinId) ||
            ((item as TankPart).type === 'module' && !this.trackParts.find(t => t.id === item.id) &&
                (this.tankController as any)?.equipment?.installedModules?.values() &&
                Array.from((this.tankController as any).equipment.installedModules.values()).includes((item as TankPart).id))
        );

        // Define new models
        const newChassisIds = new Set(["stealth", "hover", "siege", "racer", "amphibious", "shield", "drone", "artillery", "destroyer", "command"]);
        const newCannonIds = new Set(["plasma", "laser", "tesla", "railgun", "rocket", "mortar", "cluster", "explosive", "flamethrower", "acid", "freeze", "poison", "emp", "multishot", "homing", "piercing", "shockwave", "beam", "vortex", "support"]);

        let btnText = '';
        let btnDisabled = false;

        if (isUpgrade) {
            if ((item as TankUpgrade).level >= (item as TankUpgrade).maxLevel) { btnText = 'MAX LEVEL'; btnDisabled = true; }
            else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
            else btnText = `UPGRADE (${item.cost} CR)`;
        } else {
            const part = item as TankPart;
            if (part.type === 'preset') {
                // Для пресетов показываем кнопку "Применить"
                btnText = 'ПРИМЕНИТЬ ПРЕСЕТ';
                btnDisabled = false;
            } else if (part.unlocked) {
                if (equipped) { btnText = 'EQUIPPED'; btnDisabled = true; }
                else btnText = 'EQUIP';
            } else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
            else btnText = `BUY (${item.cost} CR)`;
        }

        const isNew = !isUpgrade && (
            ((item as TankPart).type === 'chassis' && newChassisIds.has(item.id)) ||
            ((item as TankPart).type === 'barrel' && newCannonIds.has(item.id))
        );

        const isPreset = !isUpgrade && (item as TankPart).type === 'preset';
        const presetInfo = isPreset ? this.getPresetInfoHTML(item as TankPart) : '';

        container.innerHTML = `
            <div class="garage-details-title">
                ${isNew ? '<span class="new-badge">[NEW]</span> ' : ''}${isPreset ? '<span style="color: #0ff;">[ПРЕСЕТ]</span> ' : ''}[ ${item.name.toUpperCase()} ]
            </div>
            <div class="garage-details-desc">${item.description}</div>
            ${presetInfo}
            ${!isPreset ? this.getFullStatsHTML(item) : ''}
            ${!isPreset ? this.getComparisonHTML(item) : ''}
            ${isPreset ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #030;">
                    <div style="color: #0aa; font-size: 10px; margin-bottom: 10px; font-weight: bold;">УПРАВЛЕНИЕ ПРЕСЕТОМ</div>
                    <button class="preset-action-btn" data-action="rename-preset-details" data-preset-id="${item.id}" style="background: rgba(0,255,255,0.2); border: 2px solid #0ff; color: #0ff; padding: 8px 15px; font-size: 11px; cursor: pointer; width: 100%; margin-bottom: 8px; font-weight: bold; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,255,255,0.4)'" onmouseout="this.style.background='rgba(0,255,255,0.2)'">✏️ ПЕРЕИМЕНОВАТЬ</button>
                    <button class="preset-action-btn" data-action="delete-preset-details" data-preset-id="${item.id}" style="background: rgba(255,0,0,0.2); border: 2px solid #f00; color: #f00; padding: 8px 15px; font-size: 11px; cursor: pointer; width: 100%; font-weight: bold; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,0,0,0.4)'" onmouseout="this.style.background='rgba(255,0,0,0.2)'">🗑️ УДАЛИТЬ</button>
                </div>
            ` : ''}
            <button class="garage-action-btn" ${btnDisabled ? 'disabled' : ''} id="garage-action">${btnText}</button>
        `;

        // Добавляем обработчики для кнопок действий пресетов в деталях
        if (isPreset) {
            container.querySelector('[data-action="rename-preset-details"]')?.addEventListener('click', () => {
                this.renamePreset(item.id);
            });
            container.querySelector('[data-action="delete-preset-details"]')?.addEventListener('click', () => {
                this.deletePreset(item.id);
            });
        }

        container.querySelector('#garage-action')?.addEventListener('click', () => {
            if (!btnDisabled) this.handleAction(item);
        });
    }

    private getFullStatsHTML(item: TankPart | TankUpgrade): string {
        if ('level' in item) {
            return '';
        }

        const part = item as TankPart;
        let statsHTML = '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;"><div style="color: #0aa; font-size: 10px; margin-bottom: 8px; font-weight: bold;">STATISTICS</div>';

        if (part.type === 'chassis') {
            const chassis = getChassisById(part.id);
            statsHTML += `
                <div class="garage-stats-row"><span class="garage-stat-name">HP</span><span class="garage-stat-value">${chassis.maxHealth}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Speed</span><span class="garage-stat-value">${chassis.moveSpeed}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Turn Speed</span><span class="garage-stat-value">${chassis.turnSpeed}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Armor</span><span class="garage-stat-value">${(chassis.maxHealth / 50).toFixed(1)}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Mass</span><span class="garage-stat-value">${chassis.mass} kg</span></div>
                ${chassis.specialAbility ? `<div class="garage-stats-row"><span class="garage-stat-name">Special</span><span class="garage-stat-value" style="color: #ff0;">${chassis.specialAbility.toUpperCase()}</span></div>` : ''}
            `;
        } else if (part.type === 'barrel') {
            const cannon = getCannonById(part.id);
            statsHTML += `
                <div class="garage-stats-row"><span class="garage-stat-name">Damage</span><span class="garage-stat-value">${cannon.damage}</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Reload</span><span class="garage-stat-value">${(cannon.cooldown / 1000).toFixed(1)}s</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Projectile Speed</span><span class="garage-stat-value">${cannon.projectileSpeed} m/s</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Barrel Length</span><span class="garage-stat-value">${cannon.barrelLength}m</span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">DPS</span><span class="garage-stat-value" style="color: #ff0;">${(cannon.damage / (cannon.cooldown / 1000)).toFixed(1)}</span></div>
            `;
        } else if (this.currentCategory === 'skins') {
            const skin = getSkinById(part.id);
            if (skin) {
                statsHTML += `
                    <div class="garage-stats-row"><span class="garage-stat-name">Корпус</span><span class="garage-stat-value" style="color: ${skin.chassisColor};">${skin.chassisColor}</span></div>
                    <div class="garage-stats-row"><span class="garage-stat-name">Башня</span><span class="garage-stat-value" style="color: ${skin.turretColor};">${skin.turretColor}</span></div>
                    ${skin.accentColor ? `<div class="garage-stats-row"><span class="garage-stat-name">Акценты</span><span class="garage-stat-value" style="color: ${skin.accentColor};">${skin.accentColor}</span></div>` : ''}
                    ${skin.pattern ? `<div class="garage-stats-row"><span class="garage-stat-name">Стиль</span><span class="garage-stat-value">${skin.pattern}</span></div>` : ''}
                `;
            }
        }

        statsHTML += '</div>';
        return statsHTML;
    }

    private getComparisonHTML(item: TankPart | TankUpgrade): string {
        if ('level' in item) {
            const upgrade = item as TankUpgrade;
            const nextLevel = upgrade.level + 1;
            if (nextLevel > upgrade.maxLevel) return '<div style="color: #0aa; margin-top: 10px;">MAX LEVEL REACHED</div>';
            return `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                    <div class="garage-stats-row"><span class="garage-stat-name">Current Level</span><span class="garage-stat-value">${upgrade.level}/${upgrade.maxLevel}</span></div>
                    <div class="garage-stats-row"><span class="garage-stat-name">Current ${upgrade.stat.toUpperCase()}</span><span class="garage-stat-value">${upgrade.value * upgrade.level > 0 ? '+' : ''}${upgrade.value * upgrade.level}</span></div>
                    <div class="garage-stats-row"><span class="garage-stat-name">Next Level</span><span class="garage-stat-value">${nextLevel}/${upgrade.maxLevel} <span class="garage-stat-change positive">(+${upgrade.value})</span></span></div>
                </div>
            `;
        }

        const part = item as TankPart;
        let rows = '';

        if (part.type === 'chassis') {
            const current = getChassisById(this.currentChassisId);
            const next = getChassisById(part.id);
            const hpDiff = next.maxHealth - current.maxHealth;
            const spdDiff = next.moveSpeed - current.moveSpeed;
            const armorDiff = (next.maxHealth / 50) - (current.maxHealth / 50);
            rows = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                    <div style="color: #0aa; font-size: 10px; margin-bottom: 8px; font-weight: bold;">COMPARISON</div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">HP</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${current.maxHealth}</span> →
                            <span style="color: #0f0;">${next.maxHealth}</span>
                            <span class="garage-stat-change ${hpDiff >= 0 ? 'positive' : 'negative'}">(${hpDiff >= 0 ? '+' : ''}${hpDiff})</span>
                        </span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Speed</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${current.moveSpeed}</span> →
                            <span style="color: #0f0;">${next.moveSpeed}</span>
                            <span class="garage-stat-change ${spdDiff >= 0 ? 'positive' : 'negative'}">(${spdDiff >= 0 ? '+' : ''}${spdDiff.toFixed(1)})</span>
                        </span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Armor</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${(current.maxHealth / 50).toFixed(1)}</span> →
                            <span style="color: #0f0;">${(next.maxHealth / 50).toFixed(1)}</span>
                            <span class="garage-stat-change ${armorDiff >= 0 ? 'positive' : 'negative'}">(${armorDiff >= 0 ? '+' : ''}${armorDiff.toFixed(1)})</span>
                        </span>
                    </div>
                </div>
            `;
        } else if (part.type === 'barrel') {
            const current = getCannonById(this.currentCannonId);
            const next = getCannonById(part.id);
            const dmgDiff = next.damage - current.damage;
            const rldDiff = next.cooldown - current.cooldown;
            const projSpeedDiff = next.projectileSpeed - current.projectileSpeed;
            rows = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #030;">
                    <div style="color: #0aa; font-size: 10px; margin-bottom: 8px; font-weight: bold;">COMPARISON</div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Damage</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${current.damage}</span> →
                            <span style="color: #0f0;">${next.damage}</span>
                            <span class="garage-stat-change ${dmgDiff >= 0 ? 'positive' : 'negative'}">(${dmgDiff >= 0 ? '+' : ''}${dmgDiff})</span>
                        </span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Reload</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${current.cooldown}ms</span> →
                            <span style="color: #0f0;">${next.cooldown}ms</span>
                            <span class="garage-stat-change ${rldDiff <= 0 ? 'positive' : 'negative'}">(${rldDiff >= 0 ? '+' : ''}${rldDiff}ms)</span>
                        </span>
                    </div>
                    <div class="garage-stats-row">
                        <span class="garage-stat-name">Proj. Speed</span>
                        <span class="garage-stat-value">
                            <span style="color: #080;">${current.projectileSpeed}</span> →
                            <span style="color: #0f0;">${next.projectileSpeed}</span>
                            <span class="garage-stat-change ${projSpeedDiff >= 0 ? 'positive' : 'negative'}">(${projSpeedDiff >= 0 ? '+' : ''}${projSpeedDiff})</span>
                        </span>
                    </div>
                    ${(() => {
                    const currentDps = current.damage / (current.cooldown / 1000);
                    const nextDps = next.damage / (next.cooldown / 1000);
                    const dpsDiff = nextDps - currentDps;
                    return `
                        <div class="garage-stats-row">
                            <span class="garage-stat-name">DPS</span>
                            <span class="garage-stat-value">
                                <span style="color: #080;">${currentDps.toFixed(1)}</span> →
                                <span style="color: #0f0;">${nextDps.toFixed(1)}</span>
                                <span class="garage-stat-change ${dpsDiff >= 0 ? 'positive' : 'negative'}">(${dpsDiff >= 0 ? '+' : ''}${dpsDiff.toFixed(1)})</span>
                            </span>
                        </div>`;
                })()}
                </div>
            `;
        }

        return rows;
    }

    private handleAction(item: TankPart | TankUpgrade): void {
        if ('level' in item) {
            this.purchaseUpgrade(item);
        } else {
            const part = item as TankPart;
            if (part.unlocked) {
                this.equipPart(part);
            } else {
                this.purchasePart(part);
            }
        }
    }

    private purchasePart(part: TankPart): void {
        if (part.unlocked) return;

        if (this.currencyManager.getCurrency() < part.cost) {
            this.showNotification(`Недостаточно средств! Требуется ${part.cost} CR`, "error");
            if (this.soundManager?.play) this.soundManager.play("error");
            return;
        }
        this.currencyManager.addCurrency(-part.cost);
        part.unlocked = true;
        this.saveProgress();
        this.refreshItemList();
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }

    private equipPart(part: TankPart): void {
        if (!part.unlocked) {
            return;
        }

        // Обработка пресетов
        if (part.type === 'preset') {
            // Проверяем, пустой ли слот
            if (this.isEmptyPresetSlot(part.id)) {
                const slotIndex = this.getPresetSlotIndex(part.id);
                this.createPresetInSlot(slotIndex);
            } else {
                const slotIndex = this.getPresetSlotIndex(part.id);
                this.applyPresetFromSlot(slotIndex);
            }
            return;
        }

        // === НОВАЯ ЛОГИКА: Сохраняем как pending изменения ===
        // Изменения применяются только при закрытии гаража (если игрок в гараже на карте)

        if (part.type === 'chassis') {
            // Проверяем, отличается ли от текущего
            const currentActive = safeLocalStorage.get("selectedChassis", "medium");

            if (part.id !== currentActive) {
                this.pendingChassisId = part.id;
                safeLocalStorage.set("pendingChassis", part.id);
                this.showNotification(`Корпус "${getChassisById(part.id).name}" выбран. Закройте гараж для применения!`, "info");
            }
            // Обновляем текущий для отображения в UI
            this.currentChassisId = part.id;
        } else if (part.type === 'barrel') {
            const currentActive = safeLocalStorage.get("selectedCannon", "standard");

            if (part.id !== currentActive) {
                this.pendingCannonId = part.id;
                safeLocalStorage.set("pendingCannon", part.id);
                this.showNotification(`Пушка "${getCannonById(part.id).name}" выбрана. Закройте гараж для применения!`, "info");
            }
            this.currentCannonId = part.id;
        } else if (part.type === 'module' && this.trackParts.find(t => t.id === part.id)) {
            const currentActive = safeLocalStorage.get("selectedTrack", "standard");

            if (part.id !== currentActive) {
                this.pendingTrackId = part.id;
                safeLocalStorage.set("pendingTrack", part.id);
                this.showNotification(`Гусеницы "${getTrackById(part.id).name}" выбраны. Закройте гараж для применения!`, "info");
            }
            this.currentTrackId = part.id;
        } else if (this.currentCategory === 'skins') {
            // Скины применяются НЕМЕДЛЕННО (это чисто визуальное изменение, не требует respawn)
            saveSelectedSkin(part.id);
            this.currentSkinId = part.id;

            // Применяем скин через универсальную функцию
            const applied = this.applySkinToTankNow(part.id);

            if (applied) {
                const skin = getSkinById(part.id);
                this.showNotification(`Скин "${skin?.name || part.id}" применён!`, "success");
            } else {
                // Если не удалось применить сейчас, попробуем через небольшую задержку
                setTimeout(() => {
                    if (this.applySkinToTankNow(part.id)) {
                        const skin = getSkinById(part.id);
                        this.showNotification(`Скин "${skin?.name || part.id}" применён!`, "success");
                    } else {
                        this.showNotification(`Скин "${getSkinById(part.id)?.name || part.id}" сохранён. Применится при респавне.`, "info");
                    }
                }, 100);
            }

            // Очищаем pending для скина
            this.pendingSkinId = null;
            safeLocalStorage.remove("pendingSkin");
        } else if (part.type === 'module') {
            // New Equipment System
            const tank = this.tankController as any;
            if (tank && tank.equipment) {
                const success = tank.equipment.equip(part.id);
                if (success) {
                    this.showNotification(`Модуль "${part.name}" установлен!`, "success");
                }
            }
        }

        this.saveProgress();
        this.refreshItemList();

        // Update preview - показываем выбранное (pending) оборудование
        const previewInfo = this.overlay?.querySelector('.garage-preview-info');
        if (previewInfo) {
            const chassisName = getChassisById(this.currentChassisId).name;
            const cannonName = getCannonById(this.currentCannonId).name;
            const hasPending = this.pendingChassisId || this.pendingCannonId || this.pendingTrackId || this.pendingSkinId;
            previewInfo.innerHTML = `CHASSIS: ${chassisName}<br>CANNON: ${cannonName}${hasPending ? '<br><span style="color: #ff0; font-size: 10px;">⚠ ОЖИДАЕТ ПРИМЕНЕНИЯ</span>' : ''}`;
        }

        // Update 3D preview
        // Render preview only if scene is initialized
        if (this.previewSceneData && this.previewSceneData.scene) {
            this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        }

        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }

    private purchaseUpgrade(upgrade: TankUpgrade): void {
        if (upgrade.level >= upgrade.maxLevel) return;

        if (this.currencyManager.getCurrency() < upgrade.cost) {
            this.showNotification(`Недостаточно средств! Требуется ${upgrade.cost} CR`, "error");
            if (this.soundManager?.play) this.soundManager.play("error");
            return;
        }
        this.currencyManager.addCurrency(-upgrade.cost);
        upgrade.level++;
        this.saveProgress();
        this.refreshItemList();
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }

    // ============ KEYBOARD NAVIGATION ============
    private keyboardHandler: ((e: KeyboardEvent) => void) | null = null;
    private keyboardNavigationSetup: boolean = false;

    private setupKeyboardNavigation(): void {
        // Защита от повторной регистрации
        if (this.keyboardNavigationSetup) {
            console.warn("[Garage] Keyboard navigation already setup, skipping...");
            return;
        }

        // Сохраняем ссылку на обработчик для последующего удаления
        this.keyboardHandler = (e: KeyboardEvent) => {
            if (!this.isOpen) return;

            // Блокируем навигацию если фокус в поле ввода
            // Улучшенная проверка: проверяем что это именно поле поиска гаража или другое поле ввода
            const activeElement = document.activeElement;
            const isInputFocused = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                (activeElement as HTMLElement).isContentEditable
            );

            // Дополнительная проверка: если это поле поиска гаража, разрешаем некоторые клавиши
            const isGarageSearchInput = activeElement && (
                activeElement.id === 'garage-search-input' ||
                (activeElement as HTMLElement).closest?.('.garage-search')
            );

            // Если фокус в поле ввода (но не в поле поиска гаража), блокируем навигацию
            // Для поля поиска гаража разрешаем Escape и Enter, но блокируем остальное
            if (isInputFocused && !isGarageSearchInput && e.code !== 'Escape') return;

            // Если фокус в поле поиска гаража, разрешаем Escape и Enter, но блокируем навигацию
            if (isGarageSearchInput && e.code !== 'Escape' && e.code !== 'Enter') return;

            // Если Enter в поле поиска - не обрабатываем как выбор элемента
            if (isGarageSearchInput && e.code === 'Enter') return;

            // Закрытие гаража: Escape, G или B
            // НО: если открыт Workshop, сначала закрываем его
            if (e.code === 'Escape' || e.code === 'KeyG' || e.code === 'KeyB') {
                // Проверяем, открыт ли Workshop
                if (this.workshopUI && this.workshopUI.isVisible && this.workshopUI.isVisible()) {
                    // Закрываем Workshop вместо гаража
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.workshopUI.hide();
                    return;
                }

                // Если Workshop не открыт, закрываем гараж
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.close();
                return;
            }

            const cats: CategoryType[] = ['chassis', 'cannons', 'tracks', 'modules', 'supplies', 'shop', 'presets', 'workshop'];
            for (let i = 1; i <= 8; i++) {
                if (e.code === `Digit${i}` || e.code === `Numpad${i}`) {
                    e.preventDefault();
                    const cat = cats[i - 1];
                    if (cat) {
                        this.switchCategory(cat);
                    }
                    return;
                }
            }

            // Навигация по вкладкам стрелками влево/вправо
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                const currentIndex = cats.indexOf(this.currentCategory);
                const prevIndex = currentIndex > 0 ? currentIndex - 1 : cats.length - 1; // Циклическая навигация
                const prevCat = cats[prevIndex];
                if (prevCat) this.switchCategory(prevCat);
                return;
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                const currentIndex = cats.indexOf(this.currentCategory);
                const nextIndex = currentIndex < cats.length - 1 ? currentIndex + 1 : 0; // Циклическая навигация
                const nextCat = cats[nextIndex];
                if (nextCat) this.switchCategory(nextCat);
                return;
            }

            if (e.code === 'ArrowUp') {
                e.preventDefault();
                // Определяем скорость нажатий ДО изменения индекса
                const timeSinceLastNav = Date.now() - this.lastNavigationTime;
                const isFastNavigation = timeSinceLastNav < 200;
                this.lastNavigationTime = Date.now(); // Обновляем время перед навигацией

                this.selectedItemIndex = Math.max(0, this.selectedItemIndex - 1);
                this.refreshItemList();
                this.scrollToSelectedItem(isFastNavigation);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                // Определяем скорость нажатий ДО изменения индекса
                const timeSinceLastNav = Date.now() - this.lastNavigationTime;
                const isFastNavigation = timeSinceLastNav < 200;
                this.lastNavigationTime = Date.now(); // Обновляем время перед навигацией

                this.selectedItemIndex = Math.min(this.filteredItems.length - 1, this.selectedItemIndex + 1);
                this.refreshItemList();
                this.scrollToSelectedItem(isFastNavigation);
            } else if (e.code === 'Home') {
                // Переход к первому элементу
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = 0;
                    this.refreshItemList();
                    this.scrollToSelectedItem(false);
                }
            } else if (e.code === 'End') {
                // Переход к последнему элементу
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = this.filteredItems.length - 1;
                    this.refreshItemList();
                    this.scrollToSelectedItem(false);
                }
            } else if (e.code === 'PageUp') {
                // Прокрутка на страницу вверх (10 элементов)
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    const pageSize = 10;
                    this.selectedItemIndex = Math.max(0, this.selectedItemIndex - pageSize);
                    this.refreshItemList();
                    this.scrollToSelectedItem(false);
                }
            } else if (e.code === 'PageDown') {
                // Прокрутка на страницу вниз (10 элементов)
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    const pageSize = 10;
                    this.selectedItemIndex = Math.min(this.filteredItems.length - 1, this.selectedItemIndex + pageSize);
                    this.refreshItemList();
                    this.scrollToSelectedItem(false);
                }
            }

            if ((e.code === 'Enter' || e.code === 'Space')) {
                // Проверяем, что фокус НЕ в поле ввода
                // Если фокус в поле ввода (включая поле поиска) - не обрабатываем Enter/Space
                if (isInputFocused) return;

                // Проверяем, что есть элементы в списке
                if (this.filteredItems.length === 0) {
                    console.warn("[Garage] No items to select");
                    return;
                }

                // Проверяем, что индекс валидный
                if (this.selectedItemIndex < 0 || this.selectedItemIndex >= this.filteredItems.length) {
                    console.warn(`[Garage] Invalid item index: ${this.selectedItemIndex}, total items: ${this.filteredItems.length}`);
                    // Исправляем индекс
                    this.selectedItemIndex = Math.max(0, Math.min(this.filteredItems.length - 1, this.selectedItemIndex));
                    this.refreshItemList();
                    return;
                }

                const item = this.filteredItems[this.selectedItemIndex];
                if (item) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.handleAction(item);
                } else {
                    console.warn(`[Garage] Item at index ${this.selectedItemIndex} is null or undefined`);
                }
            }

            // Управление башней в предпросмотре: Z (влево), X (вправо), C (центрирование)
            if (e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyC') {
                // Проверяем, что пользователь не вводит текст в поле поиска
                const activeElement = document.activeElement;
                const isInputFocused = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    (activeElement as HTMLElement).isContentEditable
                );

                if (!isInputFocused && this.previewTank && this.previewTank.turret) {
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.code === 'KeyZ') {
                        // Поворот башни влево
                        this.previewTurretKeysPressed.z = true;
                        this.startPreviewTurretAnimation();
                    } else if (e.code === 'KeyX') {
                        // Поворот башни вправо
                        this.previewTurretKeysPressed.x = true;
                        this.startPreviewTurretAnimation();
                    } else if (e.code === 'KeyC') {
                        // Центрирование башни
                        this.previewTurretKeysPressed.c = true;
                        this.previewTurretRotation = 0;
                        this.updatePreviewTurretRotation();
                        // Сбрасываем состояние клавиш после центрирования
                        this.previewTurretKeysPressed.c = false;
                    }
                }
            }
        };

        // Используем capture: true чтобы обработчик вызывался раньше других
        // Это гарантирует, что Enter в гараже обрабатывается до обработчика чата в game.ts
        window.addEventListener('keydown', this.keyboardHandler, { capture: true });

        // Обработка отпускания клавиш
        const keyupHandler = (e: KeyboardEvent) => {
            if (!this.isOpen) return;

            if (e.code === 'KeyZ') {
                this.previewTurretKeysPressed.z = false;
                this.stopPreviewTurretAnimationIfNeeded();
            } else if (e.code === 'KeyX') {
                this.previewTurretKeysPressed.x = false;
                this.stopPreviewTurretAnimationIfNeeded();
            }
        };

        window.addEventListener('keyup', keyupHandler);

        // Сохраняем ссылки для очистки
        (this as any)._keyboardHandlers = {
            keydown: this.keyboardHandler,
            keyup: keyupHandler
        };

        this.keyboardNavigationSetup = true;
    }

    private cleanupKeyboardNavigation(): void {
        if (this.keyboardHandler) {
            window.removeEventListener('keydown', this.keyboardHandler, { capture: true });
            this.keyboardHandler = null;
        }

        const handlers = (this as any)._keyboardHandlers;
        if (handlers) {
            if (handlers.keyup) {
                window.removeEventListener('keyup', handlers.keyup);
            }
            (this as any)._keyboardHandlers = null;
        }

        // НЕ сбрасываем keyboardNavigationSetup - обработчики остаются зарегистрированными
        // и будут работать при следующем открытии гаража
    }

    /**
     * Прокручивает список к выбранному элементу, чтобы он всегда был виден
     * При быстром нажатии стрелок использует мгновенную прокрутку для лучшей отзывчивости
     * @param isFastNavigation - true если нажатие было быстрым (менее 200ms с предыдущего)
     */
    private scrollToSelectedItem(isFastNavigation: boolean = false): void {
        // Небольшая задержка, чтобы DOM успел обновиться после refreshItemList()
        setTimeout(() => {
            const container = this.overlay?.querySelector('#garage-items-list');
            if (!container) return;

            // Находим выбранный элемент по data-index
            const selectedElement = container.querySelector(`.garage-item[data-index="${this.selectedItemIndex}"]`) as HTMLElement;

            if (selectedElement) {
                // При быстром нажатии используем мгновенную прокрутку, иначе плавную
                selectedElement.scrollIntoView({
                    behavior: isFastNavigation ? 'auto' : 'smooth', // Мгновенная при быстром нажатии
                    block: 'nearest', // Элемент будет виден, но не обязательно по центру
                    inline: 'nearest'
                });
            }
        }, isFastNavigation ? 0 : 10); // При быстрой навигации без задержки для мгновенной реакции
    }

    /**
     * Обновляет поворот башни в предпросмотре
     */
    private updatePreviewTurretRotation(): void {
        if (this.previewTank && this.previewTank.turret && !this.previewTank.turret.isDisposed()) {
            this.previewTank.turret.rotation.y = this.previewTurretRotation;

            // Принудительный рендер для обновления отображения
            if (this.previewSceneData?.triggerRender) {
                this.previewSceneData.triggerRender();
            }
        }
    }

    /**
     * Запускает анимацию вращения башни в предпросмотре
     */
    private startPreviewTurretAnimation(): void {
        if (this.previewTurretAnimationFrame !== null) {
            return; // Анимация уже запущена
        }

        const animate = () => {
            if (!this.previewTank || !this.previewTank.turret || this.previewTank.turret.isDisposed()) {
                this.previewTurretAnimationFrame = null;
                return;
            }

            let rotationChanged = false;

            // Поворот влево (Z)
            if (this.previewTurretKeysPressed.z) {
                this.previewTurretRotation -= 0.05; // Плавное вращение
                rotationChanged = true;
            }

            // Поворот вправо (X)
            if (this.previewTurretKeysPressed.x) {
                this.previewTurretRotation += 0.05; // Плавное вращение
                rotationChanged = true;
            }

            if (rotationChanged) {
                this.updatePreviewTurretRotation();
            }

            // Продолжаем анимацию, если хотя бы одна клавиша нажата
            if (this.previewTurretKeysPressed.z || this.previewTurretKeysPressed.x) {
                this.previewTurretAnimationFrame = requestAnimationFrame(animate);
            } else {
                this.previewTurretAnimationFrame = null;
            }
        };

        this.previewTurretAnimationFrame = requestAnimationFrame(animate);
    }

    /**
     * Останавливает анимацию вращения башни, если клавиши отпущены
     */
    private stopPreviewTurretAnimationIfNeeded(): void {
        if (!this.previewTurretKeysPressed.z && !this.previewTurretKeysPressed.x) {
            if (this.previewTurretAnimationFrame !== null) {
                cancelAnimationFrame(this.previewTurretAnimationFrame);
                this.previewTurretAnimationFrame = null;
            }
        }
    }

    // ============ PENDING CHANGES API ============
    // Эти методы используются GameGarage для применения изменений при въезде в гараж

    /**
     * Проверить есть ли ожидающие изменения
     */
    hasPendingChanges(): boolean {
        // Если применение идёт из UI - возвращаем true чтобы GameGarage не применял
        if (this.isApplyingFromUI) {
            return true;
        }

        // Проверяем и переменные класса, и localStorage
        const hasInMemory = !!(this.pendingChassisId || this.pendingCannonId || this.pendingTrackId || this.pendingSkinId);
        const hasInStorage = !!(safeLocalStorage.get("pendingChassis") || safeLocalStorage.get("pendingCannon") || safeLocalStorage.get("pendingTrack") || safeLocalStorage.get("pendingSkin"));

        return hasInMemory || hasInStorage;
    }

    /**
     * Получить все pending изменения
     */
    getPendingChanges(): {
        chassisId: string | null;
        cannonId: string | null;
        trackId: string | null;
        skinId: string | null;
    } {
        return {
            chassisId: this.pendingChassisId,
            cannonId: this.pendingCannonId,
            trackId: this.pendingTrackId,
            skinId: this.pendingSkinId
        };
    }

    /**
     * Очистить pending изменения после применения
     */
    clearPendingChanges(): void {
        // НЕ очищаем если гараж открыт - пусть пользователь сам закроет и применит
        if (this.isOpen) {
            return;
        }
        this.pendingChassisId = null;
        this.pendingCannonId = null;
        this.pendingTrackId = null;
        this.pendingSkinId = null;

        safeLocalStorage.remove("pendingChassis");
        safeLocalStorage.remove("pendingCannon");
        safeLocalStorage.remove("pendingTrack");
        safeLocalStorage.remove("pendingSkin");

        // Обновляем UI
        this.refreshItemList();
    }

    /**
     * Применить pending изменения к танку (вызывается из GameGarage)
     * Возвращает объект с типами изменённых частей для анимации
     */
    applyPendingChangesToTank(): { chassis: boolean; cannon: boolean; track: boolean; skin: boolean } {
        const applied = { chassis: false, cannon: false, track: false, skin: false };

        if (this.pendingChassisId && this.tankController?.setChassisType) {
            this.tankController.setChassisType(this.pendingChassisId);
            safeLocalStorage.set("selectedChassis", this.pendingChassisId);
            applied.chassis = true;
        }

        if (this.pendingCannonId && this.tankController?.setCannonType) {
            this.tankController.setCannonType(this.pendingCannonId);
            safeLocalStorage.set("selectedCannon", this.pendingCannonId);
            applied.cannon = true;
        }

        if (this.pendingTrackId && this.tankController?.setTrackType) {
            this.tankController.setTrackType(this.pendingTrackId);
            safeLocalStorage.set("selectedTrack", this.pendingTrackId);
            applied.track = true;
        }

        if (this.pendingSkinId && this.tankController) {
            saveSelectedSkin(this.pendingSkinId);
            const skin = getSkinById(this.pendingSkinId);
            if (skin) {
                const skinColors = applySkinToTank(skin);

                // Применяем к chassis независимо от turret
                if (this.tankController.chassis?.material) {
                    applySkinColorToMaterial(this.tankController.chassis.material as StandardMaterial, skinColors.chassisColor);
                }

                // Применяем к turret независимо от chassis
                if (this.tankController.turret?.material) {
                    applySkinColorToMaterial(this.tankController.turret.material as StandardMaterial, skinColors.turretColor);
                }
            } else {
                console.warn(`[SKIN] Garage: Skin not found: ${this.pendingSkinId}`);
            }
            applied.skin = true;
        }

        // Очищаем pending после применения
        this.clearPendingChanges();

        return applied;
    }
}
