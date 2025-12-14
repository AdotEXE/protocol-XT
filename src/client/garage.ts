// Garage System - HTML/CSS based UI for reliability
import { CurrencyManager } from "./currencyManager";
import { 
    Scene, 
    Engine, 
    Mesh, 
    ArcRotateCamera, 
    HemisphericLight, 
    MeshBuilder, 
    StandardMaterial, 
    Color3,
    Color4,
    Vector3 
} from "@babylonjs/core";
import { CHASSIS_TYPES, CANNON_TYPES, getChassisById, getCannonById } from "./tankTypes";
import { TRACK_TYPES, getTrackById, type TrackType } from "./trackTypes";
import { MaterialFactory } from "./garage/materials";
import { ChassisDetailsGenerator } from "./garage/chassisDetails";
import { CannonDetailsGenerator } from "./garage/cannonDetails";
import { initPreviewScene, cleanupPreviewScene, createPreviewTank, updatePreviewTank, type PreviewScene, type PreviewTank } from "./garage/preview";
import { injectGarageStyles } from "./garage/ui";

// ============ INTERFACES ============
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
    type: "chassis" | "turret" | "barrel" | "engine" | "module" | "supply";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        firepower?: number;
        reload?: number;
        damage?: number;
    };
}

type CategoryType = "chassis" | "cannons" | "tracks" | "modules" | "supplies" | "shop";

// ============ GARAGE CLASS ============
export class Garage {
    private _scene: Scene;
    private currencyManager: CurrencyManager;
    private isOpen: boolean = false;
    
    // External systems
    private _chatSystem: any = null;
    private tankController: any = null;
    private _experienceSystem: any = null;
    private _playerProgression: any = null;
    private soundManager: any = null;
    private onCloseCallback: (() => void) | null = null;
    
    // HTML Elements
    private overlay: HTMLDivElement | null = null;
    
    // 3D Preview
    private previewSceneData: PreviewScene | null = null;
    private previewTank: PreviewTank | null = null;
    
    // State
    private currentCategory: CategoryType = "chassis";
    private currentChassisId: string = "medium";
    private currentCannonId: string = "standard";
    private currentTrackId: string = "standard";
    private selectedItemIndex: number = 0;
    private filteredItems: (TankPart | TankUpgrade)[] = [];
    
    // Filters
    private searchText: string = "";
    private sortBy: "name" | "stats" | "custom" | "unique" = "name";
    private filterMode: "all" | "owned" | "locked" = "all";
    
    // ============ DATA ============
    private chassisParts: TankPart[] = CHASSIS_TYPES.map(chassis => {
        // Pricing: original 5 + new 10
        const costs: Record<string, number> = {
            // Original
            light: 400, medium: 0, heavy: 600, scout: 500, assault: 800,
            // New chassis types
            stealth: 800, hover: 750, siege: 1200, racer: 650, amphibious: 700,
            shield: 900, drone: 950, artillery: 1100, destroyer: 850, command: 1000
        };
        const abilityText = chassis.specialAbility ? ` [Ability: ${chassis.specialAbility}]` : "";
        return {
            id: chassis.id, name: chassis.name, description: chassis.description + abilityText,
            cost: costs[chassis.id] || 500, unlocked: chassis.id === "medium",
            type: "chassis" as const,
            stats: { health: chassis.maxHealth, speed: chassis.moveSpeed, armor: chassis.maxHealth / 50 }
        };
    });
    
    private cannonParts: TankPart[] = CANNON_TYPES.map(cannon => {
        // Pricing: original 5 + new 20
        const costs: Record<string, number> = {
            // Original
            standard: 0, rapid: 450, heavy: 600, sniper: 800, gatling: 550,
            // Energy weapons (expensive)
            plasma: 1200, laser: 1100, tesla: 1300, railgun: 2000,
            // Explosive weapons (medium-high)
            rocket: 1000, mortar: 1400, cluster: 950, explosive: 1050,
            // Special effect (medium)
            flamethrower: 700, acid: 750, freeze: 800, poison: 720, emp: 1500,
            // Multi-shot (medium)
            shotgun: 600, multishot: 650,
            // Advanced (expensive)
            homing: 1600, piercing: 1250, shockwave: 1150, beam: 1180, vortex: 1350,
            // Support
            support: 1100
        };
        return {
            id: cannon.id, name: cannon.name, description: cannon.description,
            cost: costs[cannon.id] || 500, unlocked: cannon.id === "standard",
            type: "barrel" as const,
            stats: { damage: cannon.damage, reload: cannon.cooldown }
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
    
    private moduleParts: TankPart[] = [
        { id: "armor_plate", name: "Armor Plate", description: "+15% armor", cost: 300, unlocked: false, type: "module", stats: { armor: 0.15 } },
        { id: "engine_boost", name: "Engine Boost", description: "+10% speed", cost: 350, unlocked: false, type: "module", stats: { speed: 0.1 } },
        { id: "reload_system", name: "Auto-Loader", description: "-15% reload", cost: 400, unlocked: false, type: "module", stats: { reload: -0.15 } },
        { id: "targeting", name: "Targeting CPU", description: "+10% damage", cost: 450, unlocked: false, type: "module", stats: { damage: 0.1 } },
    ];
    
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
        console.log("[Garage] HTML-based garage initialized");
    }
    
    // ============ STYLES ============
    private injectStyles(): void {
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
                font-family: 'Consolas', 'Monaco', monospace;
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
                width: min(85vw, 900px);
                height: min(80vh, 580px);
                max-width: min(900px, 90vw);
                max-height: min(580px, 85vh);
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
            .garage-right {
                width: 55%;
                display: flex;
                flex-direction: column;
                padding: 8px;
                min-width: 0;
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
            }
            @keyframes scan {
                0% { left: -100%; }
                100% { left: 100%; }
            }
            .garage-preview-title { 
                color: #080; 
                font-size: 9px; 
                z-index: 1;
                text-transform: uppercase;
                letter-spacing: 2px;
            }
            .garage-preview-info { 
                color: #0f0; 
                font-size: 13px; 
                margin: 8px 0;
                z-index: 1;
                text-align: center;
                line-height: 1.6;
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
    
    // ============ PUBLIC API ============
    isGarageOpen(): boolean { return this.isOpen; }
    
    open(): void {
        if (this.isOpen) return;
        console.log("[Garage] Opening HTML garage...");
        
        // Show cursor and unlock pointer lock
        this.showCursor();
        
        this.isOpen = true;
        this.currentChassisId = localStorage.getItem("selectedChassis") || "medium";
        this.currentCannonId = localStorage.getItem("selectedCannon") || "standard";
        this.currentTrackId = localStorage.getItem("selectedTrack") || "standard";
        
        this.createUI();
        
        // Initialize 3D preview after UI is created
        setTimeout(() => {
            this.init3DPreview();
        }, 100);
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        console.log("[Garage] Opened");
    }
    
    close(): void {
        if (!this.isOpen) return;
        console.log("[Garage] Closing...");
        
        this.isOpen = false;
        
        // Cleanup 3D preview
        this.cleanup3DPreview();
        
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        // Hide cursor (will be shown again when user clicks on canvas)
        this.hideCursor();
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        
        // Call close callback if set
        if (this.onCloseCallback) {
            this.onCloseCallback();
        }
        
        console.log("[Garage] Closed");
    }
    
    // ============ 3D PREVIEW ============
    private init3DPreview(): void {
        const previewContainer = this.overlay?.querySelector('.garage-preview');
        if (!previewContainer) {
            console.warn("[Garage] Preview container not found");
            return;
        }
        
        // Initialize preview scene using module
        this.previewSceneData = initPreviewScene(previewContainer as HTMLElement);
        
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
        
        // Use module function to create/update preview tank
        this.previewTank = updatePreviewTank(
            this.previewTank,
            chassisId,
            cannonId,
            this.currentTrackId,
            this.previewSceneData.scene
        );
    }
    
    // NOTE: Preview methods moved to garage/preview.ts
    // Methods createUniqueChassisPreview, createTurretPreview, createUniqueCannonPreview, 
    // and createPreviewTracks have been moved to garage/preview.ts module
    
    // Add chassis details - ПОЛНАЯ КОПИЯ из TankController
    // NOTE: This method should be moved to garage/preview.ts eventually
    private addChassisDetailsPreview(chassis: Mesh, chassisType: any, scene: Scene, baseColor: Color3): void {
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
                const scoutPeriscope = MeshBuilder.CreateCylinder("previewScoutPeriscope", { height: 0.12, diameter: 0.05, tessellation: 8 }, scene);
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
                const scoutSightLens = MeshBuilder.CreateCylinder("previewScoutSightLens", { height: 0.02, diameter: 0.05, tessellation: 8 }, scene);
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
                
                // Легкие броневые экраны по бокам
                for (let i = 0; i < 2; i++) {
                    const sideArmor = MeshBuilder.CreateBox(`previewScoutSideArmor${i}`, { width: 0.1, height: h * 0.4, depth: d * 0.25 }, scene);
                    sideArmor.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, h * 0.08, d * 0.08);
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
                const assaultExhaustUpgraded = MeshBuilder.CreateCylinder("previewAssaultExhaustUpgraded", { height: 0.22, diameter: 0.13, tessellation: 8 }, scene);
                assaultExhaustUpgraded.position = new Vector3(w * 0.38, h * 0.2, -d * 0.48);
                assaultExhaustUpgraded.rotation.z = Math.PI / 2;
                assaultExhaustUpgraded.parent = chassis;
                assaultExhaustUpgraded.material = armorMat;
                
                // Выхлопное отверстие
                const assaultExhaustHole = MeshBuilder.CreateCylinder("previewAssaultExhaustHole", { height: 0.04, diameter: 0.11, tessellation: 8 }, scene);
                assaultExhaustHole.position = new Vector3(w * 0.38, h * 0.2, -d * 0.52);
                assaultExhaustHole.rotation.z = Math.PI / 2;
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
                    w * 1.0, h * 0.7, 0.18,
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
                const hoverHatch = MeshBuilder.CreateCylinder("previewHoverHatch", { height: 0.08, diameter: 0.28, tessellation: 8 }, scene);
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
                // Command - аура, множественные антенны, командный модуль
                const commandAura = MeshBuilder.CreateTorus("previewCommandAura", { diameter: w * 1.6, thickness: 0.06, tessellation: 20 }, scene);
                commandAura.position = new Vector3(0, h * 0.55, 0);
                commandAura.rotation.x = Math.PI / 2;
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
                    const antenna = MeshBuilder.CreateCylinder(`previewCmdAntenna${i}`, { height: 0.5, diameter: 0.025 }, scene);
                    antenna.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.7, (i < 2 ? -1 : 1) * d * 0.35);
                    antenna.parent = chassis;
                    const antennaMat = new StandardMaterial(`previewCmdAntennaMat${i}`, scene);
                    antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
                    antenna.material = antennaMat;
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
                    const periscope = MeshBuilder.CreateCylinder(`previewCommandPeriscope${i}`, { height: 0.2, diameter: 0.08, tessellation: 8 }, scene);
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
                const commandAntenna = MeshBuilder.CreateCylinder("previewCommandAntenna", { height: 0.6, diameter: 0.03, tessellation: 8 }, scene);
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
                    const exhaust = MeshBuilder.CreateCylinder(`previewCommandExhaust${i}`, { height: 0.2, diameter: 0.12, tessellation: 8 }, scene);
                    exhaust.position = new Vector3((i === 0 ? -1 : 1) * w * 0.35, h * 0.2, -d * 0.48);
                    exhaust.rotation.z = Math.PI / 2;
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
        
        // Antenna for medium/heavy/assault
        if (chassisType.id === "medium" || chassisType.id === "heavy" || chassisType.id === "assault") {
            const antenna = MeshBuilder.CreateCylinder("previewAntenna", { height: 0.35, diameter: 0.025 }, scene);
            antenna.position = new Vector3(w * 0.42, h * 0.65, -d * 0.42);
            antenna.parent = chassis;
            const antennaMat = new StandardMaterial("previewAntennaMat", scene);
            antennaMat.diffuseColor = new Color3(0.25, 0.25, 0.25);
            antenna.material = antennaMat;
        }
    }
    
    // NOTE: createTurretPreview and createUniqueCannonPreview moved to garage/preview.ts
    
    private cleanup3DPreview(): void {
        // Cleanup using module function
        cleanupPreviewScene(this.previewSceneData);
        this.previewSceneData = null;
            this.previewTank = null;
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
                </div>
                <div class="garage-footer">
                    [↑↓] Navigate | [Enter] Select | [1-6] Categories | [ESC] Close
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
        
        // Close button
        this.overlay.querySelector('.garage-close')?.addEventListener('click', () => this.close());
        
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
    
    private switchCategory(cat: CategoryType): void {
        this.currentCategory = cat;
        this.selectedItemIndex = 0;
        
        this.overlay?.querySelectorAll('.garage-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-cat') === cat);
        });
        
        this.refreshItemList();
    }
    
    private getItemsForCategory(): (TankPart | TankUpgrade)[] {
        switch (this.currentCategory) {
            case "chassis": return [...this.chassisParts];
            case "cannons": return [...this.cannonParts];
            case "tracks": return [...this.trackParts];
            case "modules": return [...this.moduleParts, ...this.upgrades.filter(u => u.level < u.maxLevel)];
            case "supplies": return [...this.supplyParts];
            case "shop": return [...this.shopItems];
            default: return [];
        }
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
        items.sort((a, b) => {
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
        
        this.filteredItems = items;
        if (this.selectedItemIndex >= items.length) this.selectedItemIndex = Math.max(0, items.length - 1);
        
        container.innerHTML = items.map((item, i) => {
            const isUpgrade = 'level' in item;
            const owned = isUpgrade ? true : (item as TankPart).unlocked;
            const equipped = !isUpgrade && (
                ((item as TankPart).type === 'chassis' && item.id === this.currentChassisId) ||
                ((item as TankPart).type === 'barrel' && item.id === this.currentCannonId) ||
                ((item as TankPart).type === 'module' && item.id === this.currentTrackId)
            );
            const selected = i === this.selectedItemIndex;
            
            const statsStr = this.formatStats(item);
            const priceStr = owned && !isUpgrade ? 'OWNED' : `${item.cost} CR`;
            
            return `
                <div class="garage-item ${selected ? 'selected' : ''} ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" data-index="${i}">
                    <div class="garage-item-name">${item.name} ${equipped ? '[EQUIPPED]' : ''}</div>
                    <div class="garage-item-desc">${item.description}</div>
                    <div class="garage-item-stats">${statsStr}</div>
                    <div class="garage-item-price">${priceStr}</div>
                </div>
            `;
        }).join('');
        
        // Add click listeners
        container.querySelectorAll('.garage-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.getAttribute('data-index') || '0');
                this.selectedItemIndex = idx;
                this.refreshItemList();
                this.showDetails(this.filteredItems[idx]);
            });
            el.addEventListener('dblclick', () => {
                const idx = parseInt(el.getAttribute('data-index') || '0');
                this.handleAction(this.filteredItems[idx]);
            });
        });
        
        // Show details if item selected
        if (items.length > 0) {
            this.showDetails(items[this.selectedItemIndex]);
            // Update preview only if 3D scene is initialized
            if (this.previewSceneData?.scene) {
            this.updatePreview(items[this.selectedItemIndex]);
            }
        }
        
        // Update currency
        const currencyEl = this.overlay?.querySelector('.garage-currency');
        if (currencyEl) currencyEl.textContent = `CR: ${this.currencyManager.getCurrency()}`;
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
            ((item as TankPart).type === 'module' && this.trackParts.find(t => t.id === item.id) && item.id === this.currentTrackId)
        );
        
        let btnText = '';
        let btnDisabled = false;
        
        if (isUpgrade) {
            if ((item as TankUpgrade).level >= (item as TankUpgrade).maxLevel) { btnText = 'MAX LEVEL'; btnDisabled = true; }
            else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
            else btnText = `UPGRADE (${item.cost} CR)`;
        } else {
            if ((item as TankPart).unlocked) {
                if (equipped) { btnText = 'EQUIPPED'; btnDisabled = true; }
                else btnText = 'EQUIP';
            } else if (!canAfford) { btnText = `NEED ${item.cost} CR`; btnDisabled = true; }
            else btnText = `BUY (${item.cost} CR)`;
        }
        
        container.innerHTML = `
            <div class="garage-details-title">[ ${item.name.toUpperCase()} ]</div>
            <div class="garage-details-desc">${item.description}</div>
            ${this.getComparisonHTML(item)}
            <button class="garage-action-btn" ${btnDisabled ? 'disabled' : ''} id="garage-action">${btnText}</button>
        `;
        
        container.querySelector('#garage-action')?.addEventListener('click', () => {
            if (!btnDisabled) this.handleAction(item);
        });
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
            if (part.unlocked) this.equipPart(part);
            else this.purchasePart(part);
        }
    }
    
    private purchasePart(part: TankPart): void {
        if (part.unlocked || this.currencyManager.getCurrency() < part.cost) return;
        this.currencyManager.addCurrency(-part.cost);
        part.unlocked = true;
        this.saveProgress();
        this.refreshItemList();
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }
    
    private equipPart(part: TankPart): void {
        if (!part.unlocked) return;
        
        if (part.type === 'chassis') {
            this.currentChassisId = part.id;
            localStorage.setItem("selectedChassis", part.id);
            if (this.tankController?.setChassisType) this.tankController.setChassisType(part.id);
        } else if (part.type === 'barrel') {
            this.currentCannonId = part.id;
            localStorage.setItem("selectedCannon", part.id);
            if (this.tankController?.setCannonType) this.tankController.setCannonType(part.id);
        } else if (part.type === 'module' && this.trackParts.find(t => t.id === part.id)) {
            this.currentTrackId = part.id;
            localStorage.setItem("selectedTrack", part.id);
            if (this.tankController?.setTrackType) this.tankController.setTrackType(part.id);
        }
        
        this.saveProgress();
        this.refreshItemList();
        
        // Update preview
        const previewInfo = this.overlay?.querySelector('.garage-preview-info');
        if (previewInfo) {
            previewInfo.innerHTML = `CHASSIS: ${getChassisById(this.currentChassisId).name}<br>CANNON: ${getCannonById(this.currentCannonId).name}`;
        }
        
        // Update 3D preview
        // Render preview only if scene is initialized
        if (this.previewScene) {
        this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        }
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }
    
    private purchaseUpgrade(upgrade: TankUpgrade): void {
        if (upgrade.level >= upgrade.maxLevel || this.currencyManager.getCurrency() < upgrade.cost) return;
        this.currencyManager.addCurrency(-upgrade.cost);
        upgrade.level++;
        this.saveProgress();
        this.refreshItemList();
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }
    
    // ============ KEYBOARD NAVIGATION ============
    private setupKeyboardNavigation(): void {
        window.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            
            if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
            
            const cats: CategoryType[] = ['chassis', 'cannons', 'tracks', 'modules', 'supplies', 'shop'];
            for (let i = 1; i <= 6; i++) {
                if (e.code === `Digit${i}` || e.code === `Numpad${i}`) {
                    e.preventDefault();
                    this.switchCategory(cats[i - 1]);
                    return;
                }
            }
            
            if (e.code === 'ArrowUp') {
                e.preventDefault();
                this.selectedItemIndex = Math.max(0, this.selectedItemIndex - 1);
                this.refreshItemList();
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                this.selectedItemIndex = Math.min(this.filteredItems.length - 1, this.selectedItemIndex + 1);
                this.refreshItemList();
            }
            
            if ((e.code === 'Enter' || e.code === 'Space') && this.filteredItems[this.selectedItemIndex]) {
                e.preventDefault();
                this.handleAction(this.filteredItems[this.selectedItemIndex]);
            }
        });
    }
}
