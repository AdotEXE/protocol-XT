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

type CategoryType = "chassis" | "cannons" | "modules" | "supplies" | "shop";

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
    private previewEngine: Engine | null = null;
    private previewScene: Scene | null = null;
    private previewCanvas: HTMLCanvasElement | null = null;
    private previewTank: { chassis: Mesh, turret: Mesh, barrel: Mesh } | null = null;
    private previewCamera: ArcRotateCamera | null = null;
    private previewRenderLoop: number | null = null;
    
    // State
    private currentCategory: CategoryType = "chassis";
    private currentChassisId: string = "medium";
    private currentCannonId: string = "standard";
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
        this.injectStyles();
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
                [...this.chassisParts, ...this.cannonParts, ...this.moduleParts, ...this.supplyParts].forEach(part => {
                    if (progress.unlocked?.includes(part.id)) part.unlocked = true;
                });
                if (progress.upgrades) {
                    this.upgrades.forEach(u => {
                        if (progress.upgrades[u.id] !== undefined) u.level = progress.upgrades[u.id];
                    });
                }
                if (progress.currentChassis) this.currentChassisId = progress.currentChassis;
                if (progress.currentCannon) this.currentCannonId = progress.currentCannon;
            }
        } catch (e) { console.warn("[Garage] Load failed:", e); }
    }
    
    private saveProgress(): void {
        try {
            const unlocked = [...this.chassisParts, ...this.cannonParts, ...this.moduleParts, ...this.supplyParts]
                .filter(p => p.unlocked).map(p => p.id);
            const upgrades: Record<string, number> = {};
            this.upgrades.forEach(u => { upgrades[u.id] = u.level; });
            localStorage.setItem("tx_garage_progress", JSON.stringify({
                unlocked, upgrades,
                currentChassis: this.currentChassisId,
                currentCannon: this.currentCannonId
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
        
        // Create canvas
        this.previewCanvas = document.createElement('canvas');
        this.previewCanvas.className = 'garage-preview-canvas';
        this.previewCanvas.width = 400;
        this.previewCanvas.height = 300;
        previewContainer.appendChild(this.previewCanvas);
        
        // Create engine
        this.previewEngine = new Engine(this.previewCanvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
            antialias: true
        });
        
        // Create scene
        this.previewScene = new Scene(this.previewEngine);
        this.previewScene.clearColor = new Color4(0.05, 0.05, 0.08, 1.0);
        
        // Camera - rotate around tank with mouse controls
        this.previewCamera = new ArcRotateCamera(
            "previewCamera",
            Math.PI / 3,
            Math.PI / 3,
            8,
            Vector3.Zero(),
            this.previewScene
        );
        // Attach mouse controls for rotation and zoom
        this.previewCamera.attachControl(this.previewCanvas, true);
        this.previewCamera.lowerRadiusLimit = 5;
        this.previewCamera.upperRadiusLimit = 15;
        this.previewCamera.wheelDeltaPercentage = 0.01;
        this.previewCamera.wheelDeltaPercentage = 0.01;
        
        // Light
        const light = new HemisphericLight("previewLight", new Vector3(0, 1, 0), this.previewScene);
        light.intensity = 0.8;
        light.diffuse = new Color3(0.9, 0.9, 0.85);
        light.groundColor = new Color3(0.2, 0.2, 0.25);
        
        // Simple ground plane
        const ground = MeshBuilder.CreateGround("previewGround", { width: 10, height: 10 }, this.previewScene);
        const groundMat = new StandardMaterial("previewGroundMat", this.previewScene);
        groundMat.diffuseColor = new Color3(0.2, 0.2, 0.25);
        groundMat.specularColor = Color3.Black();
        ground.material = groundMat;
        ground.position.y = -2;
        
        // Initial render
        // Render preview only if scene is initialized
        if (this.previewScene) {
        this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        }
        
        // Start render loop with limited FPS (30 FPS)
        let lastTime = Date.now();
        const targetFPS = 30;
        const frameTime = 1000 / targetFPS;
        
        this.previewRenderLoop = window.setInterval(() => {
            const now = Date.now();
            if (now - lastTime >= frameTime) {
                if (this.previewScene && this.previewEngine) {
                    this.previewScene.render();
                }
                lastTime = now;
            }
        }, frameTime);
        
        console.log("[Garage] 3D preview initialized");
    }
    
    private renderTankPreview(chassisId: string, cannonId: string): void {
        if (!this.previewScene) {
            console.warn("[Garage] Preview scene not initialized");
            return;
        }
        
        // Cleanup old tank
        if (this.previewTank) {
            this.previewTank.chassis.dispose();
            this.previewTank.turret.dispose();
            this.previewTank.barrel.dispose();
            this.previewTank = null;
        }
        
        const chassisType = getChassisById(chassisId);
        const cannonType = getCannonById(cannonId);
        
        // Use unique models with all details
        const chassis = this.createUniqueChassisPreview(chassisType, this.previewScene);
        const turret = this.createTurretPreview(chassisType, this.previewScene);
        const barrel = this.createUniqueCannonPreview(cannonType, this.previewScene);
        
        barrel.parent = turret;
        turret.parent = chassis;
        
        this.previewTank = { chassis, turret, barrel };
        
        console.log("[Garage] Tank preview rendered with unique models:", chassisId, cannonId);
    }
    
    // Create unique chassis using same logic as TankController
    private createUniqueChassisPreview(chassisType: any, scene: Scene): Mesh {
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;
        const color = Color3.FromHexString(chassisType.color);
        
        let chassis: Mesh;
        
        // Use same unique forms as TankController
        switch (chassisType.id) {
            case "light": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.75, height: h * 0.7, depth: d * 1.2 }, scene); 
                break;
            case "scout": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.7, height: h * 0.65, depth: d * 0.85 }, scene); 
                break;
            case "heavy": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.08, height: h * 1.2, depth: d * 1.08 }, scene); 
                break;
            case "assault": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.12, height: h * 1.1, depth: d * 1.05 }, scene); 
                break;
            case "stealth": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.05, height: h * 0.7, depth: d * 1.15 }, scene); 
                break;
            case "hover": 
                chassis = MeshBuilder.CreateCylinder("previewChassis", { 
                    diameter: Math.max(w, d) * 1.1,
                    height: h * 0.95,
                    tessellation: 8  // Low-poly
                }, scene);
                chassis.rotation.z = Math.PI / 2;
                break;
            case "siege": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.25, height: h * 1.35, depth: d * 1.2 }, scene); 
                break;
            case "racer": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.75, height: h * 0.55, depth: d * 1.3 }, scene); 
                break;
            case "amphibious": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.15, height: h * 1.1, depth: d * 1.1 }, scene); 
                break;
            case "shield": 
                chassis = MeshBuilder.CreateCylinder("previewChassis", { 
                    diameter: Math.max(w, d) * 1.2,
                    height: h * 1.1,
                    tessellation: 8
                }, scene);
                chassis.rotation.z = Math.PI / 2;
                break;
            case "drone": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.1, height: h * 1.12, depth: d * 1.05 }, scene); 
                break;
            case "artillery": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.2, height: h * 1.25, depth: d * 1.15 }, scene); 
                break;
            case "destroyer": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 0.85, height: h * 0.75, depth: d * 1.4 }, scene); 
                break;
            case "command": 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w * 1.1, height: h * 1.2, depth: d * 1.1 }, scene); 
                break;
            default: 
                chassis = MeshBuilder.CreateBox("previewChassis", { width: w, height: h, depth: d }, scene);
        }
        
        chassis.position = Vector3.Zero();
        const mat = new StandardMaterial("previewChassisMat", scene);
        mat.diffuseColor = color;
        mat.specularColor = Color3.Black();
        chassis.material = mat;
        
        // Add visual details
        this.addChassisDetailsPreview(chassis, chassisType, scene, color);
        
        return chassis;
    }
    
    // Add chassis details - ПОЛНАЯ КОПИЯ из TankController
    private addChassisDetailsPreview(chassis: Mesh, chassisType: any, scene: Scene, baseColor: Color3): void {
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;
        
        const armorMat = new StandardMaterial("previewArmorMat", scene);
        armorMat.diffuseColor = baseColor.scale(0.65);
        armorMat.specularColor = Color3.Black();
        
        const accentMat = new StandardMaterial("previewAccentMat", scene);
        accentMat.diffuseColor = baseColor.scale(1.2);
        accentMat.specularColor = Color3.Black();
        
        switch (chassisType.id) {
            case "light":
                // Light - Прототип: БТ-7 - Наклонная лобовая броня, воздухозаборники, спойлер
                // Наклонная лобовая плита
                const lightFront = MeshBuilder.CreateBox("previewLightFront", { width: w * 0.88, height: h * 0.6, depth: 0.2 }, scene);
                lightFront.position = new Vector3(0, h * 0.15, d * 0.52);
                lightFront.rotation.x = -Math.PI / 6;
                lightFront.parent = chassis;
                lightFront.material = armorMat;
                
                // Воздухозаборники
                for (let i = 0; i < 2; i++) {
                    const intake = MeshBuilder.CreateBox(`previewIntake${i}`, { width: 0.3, height: h * 0.65, depth: 0.35 }, scene);
                    intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, h * 0.2, d * 0.45);
                    intake.parent = chassis;
                    intake.material = accentMat;
                }
                
                // Задний спойлер
                const lightSpoiler = MeshBuilder.CreateBox("previewSpoiler", { width: w * 1.2, height: 0.2, depth: 0.25 }, scene);
                lightSpoiler.position = new Vector3(0, h * 0.5, -d * 0.48);
                lightSpoiler.parent = chassis;
                lightSpoiler.material = accentMat;
                
                // Боковые обтекатели
                for (let i = 0; i < 2; i++) {
                    const fairing = MeshBuilder.CreateBox(`previewFairing${i}`, { width: 0.15, height: h * 0.75, depth: d * 0.55 }, scene);
                    fairing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, 0, d * 0.2);
                    fairing.parent = chassis;
                    fairing.material = accentMat;
                }
                
                // Люки на крыше
                for (let i = 0; i < 2; i++) {
                    const hatch = MeshBuilder.CreateBox(`previewLightHatch${i}`, { width: 0.2, height: 0.08, depth: 0.2 }, scene);
                    hatch.position = new Vector3((i === 0 ? -1 : 1) * w * 0.25, h * 0.48, -d * 0.1);
                    hatch.parent = chassis;
                    hatch.material = armorMat;
                }
                
                // Выхлопная труба
                const exhaust = MeshBuilder.CreateBox("previewLightExhaust", { width: 0.15, height: 0.15, depth: 0.2 }, scene);
                exhaust.position = new Vector3(w * 0.35, h * 0.2, -d * 0.48);
                exhaust.parent = chassis;
                exhaust.material = armorMat;
                break;
            case "scout":
                // Scout - обтекаемые крылья, клиновидный нос - ОЧЕНЬ ЗАМЕТНЫЕ
                const scoutNose = MeshBuilder.CreateBox("previewNose", { width: w * 0.8, height: h * 0.7, depth: 0.4 }, scene);
                scoutNose.position = new Vector3(0, 0, d * 0.52);
                scoutNose.parent = chassis;
                scoutNose.material = accentMat;
                // Боковые обтекатели - ОЧЕНЬ БОЛЬШИЕ
                for (let i = 0; i < 2; i++) {
                    const wing = MeshBuilder.CreateBox(`previewWing${i}`, { width: 0.18, height: h * 0.9, depth: d * 0.6 }, scene);
                    wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.5, -h * 0.05, d * 0.35);
                    wing.parent = chassis;
                    wing.material = accentMat;
                }
                // Задний диффузор - БОЛЬШЕ
                const diffuser = MeshBuilder.CreateBox("previewDiffuser", { width: w * 0.9, height: 0.15, depth: 0.2 }, scene);
                diffuser.position = new Vector3(0, -h * 0.45, -d * 0.48);
                diffuser.parent = chassis;
                diffuser.material = accentMat;
                break;
            case "heavy":
                // Heavy - массивные бронеплиты со всех сторон - ОЧЕНЬ ЗАМЕТНЫЕ
                const heavyPlates = [
                    { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.3, h * 0.95, d * 0.75) },
                    { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.3, h * 0.95, d * 0.75) },
                    { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.35, 0.22) },
                    { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 1.05, 0.28, d * 1.05) }
                ];
                heavyPlates.forEach((plate, i) => {
                    const plateMesh = MeshBuilder.CreateBox(`previewPlate${i}`, { width: plate.size.x, height: plate.size.y, depth: plate.size.z }, scene);
                    plateMesh.position = plate.pos;
                    plateMesh.parent = chassis;
                    plateMesh.material = armorMat;
                });
                // Верхняя бронеплита - ОЧЕНЬ БОЛЬШАЯ
                const topPlate = MeshBuilder.CreateBox("previewTop", { width: w * 0.95, height: 0.25, depth: d * 0.8 }, scene);
                topPlate.position = new Vector3(0, h * 0.65, 0);
                topPlate.parent = chassis;
                topPlate.material = armorMat;
                // Угловые усиления - БОЛЬШЕ
                for (let i = 0; i < 4; i++) {
                    const corner = MeshBuilder.CreateBox(`previewCorner${i}`, { width: 0.3, height: 0.3, depth: 0.3 }, scene);
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.58;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.58;
                    corner.position = new Vector3(posX, h * 0.55, posZ);
                    corner.parent = chassis;
                    corner.material = armorMat;
                }
                break;
            case "assault":
                // Assault - агрессивные угловые бронеплиты, шипы
                const assaultPlates = [
                    { pos: new Vector3(0, h * 0.25, d * 0.52), size: new Vector3(w * 0.8, h * 0.35, 0.15) },
                    { pos: new Vector3(-w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) },
                    { pos: new Vector3(w * 0.5, 0, d * 0.3), size: new Vector3(0.12, h * 0.6, d * 0.4) }
                ];
                assaultPlates.forEach((plate, i) => {
                    const plateMesh = MeshBuilder.CreateBox(`previewAssaultPlate${i}`, { width: plate.size.x, height: plate.size.y, depth: plate.size.z }, scene);
                    plateMesh.position = plate.pos;
                    plateMesh.parent = chassis;
                    plateMesh.material = armorMat;
                });
                // Шипы спереди
                for (let i = 0; i < 3; i++) {
                    const spike = MeshBuilder.CreateBox(`previewSpike${i}`, { width: 0.08, height: 0.15, depth: 0.12 }, scene);
                    spike.position = new Vector3((i - 1) * w * 0.25, h * 0.3, d * 0.52);
                    spike.parent = chassis;
                    spike.material = accentMat;
                }
                break;
            case "medium":
                // Medium - классические детали: антенна и вентиляционные решетки
                for (let i = 0; i < 3; i++) {
                    const vent = MeshBuilder.CreateBox(`previewVent${i}`, { width: 0.08, height: 0.05, depth: 0.1 }, scene);
                    vent.position = new Vector3((i - 1) * w * 0.3, h * 0.4, -d * 0.3);
                    vent.parent = chassis;
                    vent.material = armorMat;
                }
                break;
            case "stealth":
                // Stealth - угловатые панели, генератор невидимости
                const stealthPanels = [
                    { pos: new Vector3(-w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
                    { pos: new Vector3(w * 0.45, h * 0.2, d * 0.3), size: new Vector3(0.08, h * 0.3, d * 0.4) },
                    { pos: new Vector3(0, h * 0.35, -d * 0.35), size: new Vector3(w * 0.4, h * 0.25, w * 0.3) }
                ];
                stealthPanels.forEach((panel, i) => {
                    const panelMesh = MeshBuilder.CreateBox(`previewStealthPanel${i}`, { width: panel.size.x, height: panel.size.y, depth: panel.size.z }, scene);
                    panelMesh.position = panel.pos;
                    panelMesh.parent = chassis;
                    panelMesh.material = armorMat;
                });
                const stealthGen = MeshBuilder.CreateBox("previewStealthGen", { width: w * 0.35, height: h * 0.45, depth: w * 0.35 }, scene);
                stealthGen.position = new Vector3(0, h * 0.35, -d * 0.35);
                stealthGen.parent = chassis;
                const stealthMat = new StandardMaterial("previewStealthMat", scene);
                stealthMat.diffuseColor = new Color3(0.15, 0.15, 0.15);
                stealthMat.emissiveColor = new Color3(0.08, 0.08, 0.12);
                stealthGen.material = stealthMat;
                break;
            case "hover":
                // Hover - обтекаемые панели, реактивные двигатели
                for (let i = 0; i < 2; i++) {
                    const panel = MeshBuilder.CreateBox(`previewHoverPanel${i}`, { width: 0.06, height: h * 0.6, depth: d * 0.5 }, scene);
                    panel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, 0, 0);
                    panel.parent = chassis;
                    panel.material = accentMat;
                }
                for (let i = 0; i < 4; i++) {
                    const thruster = MeshBuilder.CreateCylinder(`previewThruster${i}`, { height: 0.25, diameter: 0.18 }, scene);
                    const posX = (i % 2 === 0 ? -1 : 1) * w * 0.38;
                    const posZ = (i < 2 ? -1 : 1) * d * 0.38;
                    thruster.position = new Vector3(posX, -h * 0.45, posZ);
                    thruster.parent = chassis;
                    const thrusterMat = new StandardMaterial(`previewThrusterMat${i}`, scene);
                    thrusterMat.diffuseColor = new Color3(0, 0.6, 1);
                    thrusterMat.emissiveColor = new Color3(0, 0.4, 0.7);
                    thruster.material = thrusterMat;
                }
                break;
            case "siege":
                // Siege - массивные многослойные бронеплиты
                const siegePlates = [
                    { pos: new Vector3(-w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
                    { pos: new Vector3(w * 0.62, 0, 0), size: new Vector3(0.22, h * 0.95, d * 0.75) },
                    { pos: new Vector3(0, h * 0.35, d * 0.58), size: new Vector3(w * 0.85, h * 0.25, 0.18) },
                    { pos: new Vector3(0, -h * 0.35, 0), size: new Vector3(w * 0.98, 0.2, d * 0.98) },
                    { pos: new Vector3(0, h * 0.6, 0), size: new Vector3(w * 0.9, 0.15, d * 0.8) }
                ];
                siegePlates.forEach((plate, i) => {
                    const plateMesh = MeshBuilder.CreateBox(`previewSiegePlate${i}`, { width: plate.size.x, height: plate.size.y, depth: plate.size.z }, scene);
                    plateMesh.position = plate.pos;
                    plateMesh.parent = chassis;
                    plateMesh.material = armorMat;
                });
                for (let i = 0; i < 4; i++) {
                    const cornerPlate = MeshBuilder.CreateBox(`previewCornerPlate${i}`, { width: 0.15, height: h * 0.4, depth: 0.15 }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    cornerPlate.position = new Vector3(Math.cos(angle) * w * 0.55, h * 0.2, Math.sin(angle) * d * 0.55);
                    cornerPlate.parent = chassis;
                    cornerPlate.material = armorMat;
                }
                break;
            case "racer":
                // Racer - большой спойлер, боковые крылья, воздухозаборники
                const spoiler = MeshBuilder.CreateBox("previewRacerSpoiler", { width: w * 1.15, height: 0.12, depth: 0.18 }, scene);
                spoiler.position = new Vector3(0, h * 0.55, -d * 0.48);
                spoiler.parent = chassis;
                spoiler.material = accentMat;
                for (let i = 0; i < 2; i++) {
                    const wing = MeshBuilder.CreateBox(`previewRacerWing${i}`, { width: 0.1, height: h * 0.6, depth: d * 0.45 }, scene);
                    wing.position = new Vector3((i === 0 ? -1 : 1) * w * 0.52, 0, d * 0.25);
                    wing.parent = chassis;
                    wing.material = accentMat;
                }
                for (let i = 0; i < 2; i++) {
                    const intake = MeshBuilder.CreateBox(`previewRacerIntake${i}`, { width: 0.1, height: h * 0.4, depth: 0.15 }, scene);
                    intake.position = new Vector3((i === 0 ? -1 : 1) * w * 0.3, h * 0.1, d * 0.48);
                    intake.parent = chassis;
                    intake.material = armorMat;
                }
                break;
            case "amphibious":
                // Amphibious - большие поплавки
                for (let i = 0; i < 2; i++) {
                    const float = MeshBuilder.CreateCylinder(`previewFloat${i}`, { height: h * 0.7, diameter: w * 0.35 }, scene);
                    float.position = new Vector3((i === 0 ? -1 : 1) * w * 0.42, -h * 0.25, 0);
                    float.parent = chassis;
                    float.material = accentMat;
                }
                const waterSeal = MeshBuilder.CreateBox("previewWaterSeal", { width: w * 1.05, height: 0.08, depth: d * 1.05 }, scene);
                waterSeal.position = new Vector3(0, h * 0.5, 0);
                waterSeal.parent = chassis;
                waterSeal.material = armorMat;
                break;
            case "shield":
                // Shield - генератор щита, энергетические панели
                const shieldGen = MeshBuilder.CreateSphere("previewShieldGen", { diameter: w * 0.45, segments: 16 }, scene);
                shieldGen.position = new Vector3(0, h * 0.45, -d * 0.25);
                shieldGen.parent = chassis;
                const shieldGenMat = new StandardMaterial("previewShieldGenMat", scene);
                shieldGenMat.diffuseColor = new Color3(0, 1, 0.6);
                shieldGenMat.emissiveColor = new Color3(0, 0.6, 0.3);
                shieldGen.material = shieldGenMat;
                for (let i = 0; i < 2; i++) {
                    const energyPanel = MeshBuilder.CreateBox(`previewEnergyPanel${i}`, { width: 0.1, height: h * 0.5, depth: d * 0.3 }, scene);
                    energyPanel.position = new Vector3((i === 0 ? -1 : 1) * w * 0.55, h * 0.15, 0);
                    energyPanel.parent = chassis;
                    const panelMat = new StandardMaterial(`previewEnergyPanelMat${i}`, scene);
                    panelMat.diffuseColor = new Color3(0, 0.8, 0.4);
                    panelMat.emissiveColor = new Color3(0, 0.3, 0.15);
                    energyPanel.material = panelMat;
                }
                break;
            case "drone":
                // Drone - платформы для дронов, антенны
                for (let i = 0; i < 2; i++) {
                    const platform = MeshBuilder.CreateBox(`previewDronePlatform${i}`, { width: w * 0.45, height: 0.12, depth: w * 0.45 }, scene);
                    platform.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.65, 0);
                    platform.parent = chassis;
                    const platformMat = new StandardMaterial(`previewPlatformMat${i}`, scene);
                    platformMat.diffuseColor = new Color3(0.6, 0, 1);
                    platformMat.emissiveColor = new Color3(0.35, 0, 0.7);
                    platform.material = platformMat;
                    const antenna = MeshBuilder.CreateCylinder(`previewDroneAntenna${i}`, { height: 0.15, diameter: 0.03 }, scene);
                    antenna.position = new Vector3((i === 0 ? -1 : 1) * w * 0.38, h * 0.72, 0);
                    antenna.parent = chassis;
                    antenna.material = platformMat;
                }
                break;
            case "artillery":
                // Artillery - стабилизаторы, опорные лапы
                for (let i = 0; i < 4; i++) {
                    const stabilizer = MeshBuilder.CreateCylinder(`previewStabilizer${i}`, { height: 0.35, diameter: 0.25 }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    stabilizer.position = new Vector3(Math.cos(angle) * w * 0.65, -h * 0.45, Math.sin(angle) * d * 0.65);
                    stabilizer.parent = chassis;
                    stabilizer.material = armorMat;
                    const leg = MeshBuilder.CreateBox(`previewArtilleryLeg${i}`, { width: 0.12, height: 0.2, depth: 0.12 }, scene);
                    leg.position = new Vector3(Math.cos(angle) * w * 0.7, -h * 0.55, Math.sin(angle) * d * 0.7);
                    leg.parent = chassis;
                    leg.material = armorMat;
                }
                break;
            case "destroyer":
                // Destroyer - длинный клиновидный нос
                const destroyerNose = MeshBuilder.CreateBox("previewDestroyerNose", { width: w * 0.85, height: h * 0.55, depth: 0.35 }, scene);
                destroyerNose.position = new Vector3(0, 0, d * 0.52);
                destroyerNose.parent = chassis;
                destroyerNose.material = accentMat;
                for (let i = 0; i < 2; i++) {
                    const sidePlate = MeshBuilder.CreateBox(`previewDestroyerSide${i}`, { width: 0.12, height: h * 0.7, depth: d * 0.5 }, scene);
                    sidePlate.position = new Vector3((i === 0 ? -1 : 1) * w * 0.48, 0, d * 0.15);
                    sidePlate.parent = chassis;
                    sidePlate.material = armorMat;
                }
                break;
            case "command":
                // Command - аура, командный модуль, антенны
                const commandAura = MeshBuilder.CreateTorus("previewCommandAura", { diameter: w * 1.6, thickness: 0.06, tessellation: 20 }, scene);
                commandAura.position = new Vector3(0, h * 0.55, 0);
                commandAura.rotation.x = Math.PI / 2;
                commandAura.parent = chassis;
                const auraMat = new StandardMaterial("previewAuraMat", scene);
                auraMat.diffuseColor = new Color3(1, 0.88, 0);
                auraMat.emissiveColor = new Color3(0.6, 0.5, 0);
                auraMat.disableLighting = true;
                commandAura.material = auraMat;
                const commandModule = MeshBuilder.CreateBox("previewCommandModule", { width: w * 0.6, height: h * 0.3, depth: d * 0.4 }, scene);
                commandModule.position = new Vector3(0, h * 0.6, -d * 0.3);
                commandModule.parent = chassis;
                const moduleMat = new StandardMaterial("previewModuleMat", scene);
                moduleMat.diffuseColor = new Color3(1, 0.9, 0.3);
                moduleMat.emissiveColor = new Color3(0.3, 0.27, 0.1);
                commandModule.material = moduleMat;
                for (let i = 0; i < 4; i++) {
                    const antenna = MeshBuilder.CreateCylinder(`previewCmdAntenna${i}`, { height: 0.5, diameter: 0.025 }, scene);
                    antenna.position = new Vector3((i % 2 === 0 ? -1 : 1) * w * 0.35, h * 0.7, (i < 2 ? -1 : 1) * d * 0.35);
                    antenna.parent = chassis;
                    const antennaMat = new StandardMaterial(`previewCmdAntennaMat${i}`, scene);
                    antennaMat.diffuseColor = new Color3(1, 0.9, 0.2);
                    antenna.material = antennaMat;
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
    
    private createTurretPreview(chassisType: any, scene: Scene): Mesh {
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;
        const turretWidth = w * 0.65;
        const turretHeight = h * 0.75;
        const turretDepth = d * 0.6;
        
        const turret = MeshBuilder.CreateBox("previewTurret", { width: turretWidth, height: turretHeight, depth: turretDepth }, scene);
        turret.position.y = h / 2 + turretHeight / 2;
        const turretColor = Color3.FromHexString(chassisType.color);
        const turretMat = new StandardMaterial("previewTurretMat", scene);
        turretMat.diffuseColor = turretColor.scale(0.8);
        turretMat.specularColor = Color3.Black();
        turret.material = turretMat;
        return turret;
    }
        
    // Create unique cannon - ПОЛНАЯ КОПИЯ из TankController
    private createUniqueCannonPreview(cannonType: any, scene: Scene): Mesh {
        const barrelWidth = cannonType.barrelWidth;
        const barrelLength = cannonType.barrelLength;
        const cannonColor = Color3.FromHexString(cannonType.color);
        
        let barrel: Mesh;
        
        // Use EXACT same proportions and details as TankController
        switch (cannonType.id) {
            case "sniper":
                // Sniper - ЭКСТРЕМАЛЬНО ДЛИННАЯ И ТОНКАЯ - УНИКАЛЬНАЯ ФОРМА
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 0.5,
                    height: barrelLength * 2.0,
                    tessellation: 8
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                // ОГРОМНЫЙ прицел
                const scope = MeshBuilder.CreateCylinder("previewScope", { height: barrelWidth * 1.2, diameter: barrelWidth * 0.9 }, scene);
                scope.position = new Vector3(barrelWidth * 0.65, barrelWidth * 0.5, barrelLength * 0.6);
                scope.parent = barrel;
                const scopeMat = new StandardMaterial("previewScopeMat", scene);
                scopeMat.diffuseColor = new Color3(0.05, 0.05, 0.05);
                scopeMat.emissiveColor = new Color3(0.15, 0.15, 0.15);
                scope.material = scopeMat;
                // Сошки - БОЛЬШЕ
                for (let i = 0; i < 2; i++) {
                    const bipod = MeshBuilder.CreateBox(`previewBipod${i}`, { width: 0.12, height: barrelWidth * 0.8, depth: 0.12 }, scene);
                    bipod.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, -barrelWidth * 0.4, barrelLength * 0.75);
                    bipod.parent = barrel;
                    bipod.material = scopeMat;
                }
                // Стабилизаторы - БОЛЬШЕ
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`previewStabilizer${i}`, { width: 0.1, height: barrelWidth * 0.7, depth: 0.1 }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.4, -barrelWidth * 0.3, barrelLength * 0.4);
                    stabilizer.parent = barrel;
                    stabilizer.material = scopeMat;
                }
                break;
            case "gatling":
                // Gatling - Прототип: ГШ-6-30 - Советская скорострельная пушка
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 2.0,
                    height: barrelLength * 0.8,
                    tessellation: 8  // Low-poly
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                // Стволы (угловатые, low-poly)
                for (let i = 0; i < 6; i++) {
                    const miniBarrel = MeshBuilder.CreateCylinder(`previewMiniBarrel${i}`, { 
                        height: barrelLength * 1.1, 
                        diameter: barrelWidth * 0.35,
                        tessellation: 8  // Low-poly
                    }, scene);
                    const angle = (i * Math.PI * 2 / 6);
                    miniBarrel.position = new Vector3(Math.cos(angle) * barrelWidth * 0.6, Math.sin(angle) * barrelWidth * 0.6, 0);
                    miniBarrel.parent = barrel;
                    const miniMat = new StandardMaterial(`previewMiniBarrelMat${i}`, scene);
                    miniMat.diffuseColor = cannonColor.scale(0.8);
                    miniBarrel.material = miniMat;
                }
                // Система охлаждения (угловатые кольца, low-poly)
                for (let i = 0; i < 4; i++) {
                    const coolingRing = MeshBuilder.CreateTorus(`previewCoolingRing${i}`, { 
                        diameter: barrelWidth * 1.9, 
                        thickness: barrelWidth * 0.25,
                        tessellation: 8  // Low-poly
                    }, scene);
                    coolingRing.position = new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.12);
                    coolingRing.parent = barrel;
                    const ringMat = new StandardMaterial(`previewCoolingRingMat${i}`, scene);
                    ringMat.diffuseColor = cannonColor.scale(0.6);
                    ringMat.emissiveColor = new Color3(0.05, 0.05, 0.05);
                    coolingRing.material = ringMat;
                }
                break;
            case "heavy":
                // Heavy - МАССИВНАЯ, ТОЛСТАЯ - УНИКАЛЬНАЯ ФОРМА
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 1.5,
                    height: barrelLength * 1.2,
                    tessellation: 12
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                const breech = MeshBuilder.CreateBox("previewBreech", { width: barrelWidth * 1.7, height: barrelWidth * 1.7, depth: barrelWidth * 1.3 }, scene);
                breech.position = new Vector3(0, 0, -barrelLength * 0.48);
                breech.parent = barrel;
                const breechMat = new StandardMaterial("previewBreechMat", scene);
                breechMat.diffuseColor = cannonColor.scale(0.55);
                breech.material = breechMat;
                // Дульный тормоз
                const muzzleBrake = MeshBuilder.CreateCylinder("previewMuzzleBrake", { height: barrelWidth * 0.4, diameter: barrelWidth * 1.4 }, scene);
                muzzleBrake.position = new Vector3(0, 0, barrelLength * 0.55);
                muzzleBrake.parent = barrel;
                muzzleBrake.material = breechMat;
                break;
            case "rapid":
                // Rapid - КОРОТКАЯ, КОМПАКТНАЯ - УНИКАЛЬНАЯ ФОРМА
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 0.8,
                    height: barrelLength * 0.7,
                    tessellation: 10
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                const rapidBreech = MeshBuilder.CreateBox("previewRapidBreech", { width: barrelWidth * 1.1, height: barrelWidth * 1.1, depth: barrelWidth * 0.6 }, scene);
                rapidBreech.position = new Vector3(0, 0, -barrelLength * 0.35);
                rapidBreech.parent = barrel;
                rapidBreech.material = barrel.material;
                break;
            case "plasma":
                // Plasma - ЭНЕРГЕТИЧЕСКАЯ, КОНИЧЕСКАЯ ФОРМА - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameterTop: barrelWidth * 1.8,
                    diameterBottom: barrelWidth * 1.0,
                    height: barrelLength * 1.2,
                    tessellation: 12
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                const plasmaCore = MeshBuilder.CreateSphere("previewPlasmaCore", { diameter: barrelWidth * 1.2, segments: 20 }, scene);
                plasmaCore.position = new Vector3(0, 0, -barrelLength * 0.4);
                plasmaCore.parent = barrel;
                const coreMat = new StandardMaterial("previewPlasmaCoreMat", scene);
                coreMat.diffuseColor = new Color3(1, 0, 1);
                coreMat.emissiveColor = new Color3(0.8, 0, 0.8);
                coreMat.disableLighting = true;
                plasmaCore.material = coreMat;
                
                for (let i = 0; i < 4; i++) {
                    const coil = MeshBuilder.CreateTorus(`previewPlasmaCoil${i}`, {
                        diameter: barrelWidth * 1.4,
                        thickness: barrelWidth * 0.12,
                        tessellation: 16
                    }, scene);
                    coil.position = new Vector3(0, 0, -barrelLength * 0.35 + i * barrelLength * 0.12);
                    coil.parent = barrel;
                    const coilMat = new StandardMaterial(`previewPlasmaCoilMat${i}`, scene);
                    coilMat.diffuseColor = new Color3(0.8, 0, 0.8);
                    coilMat.emissiveColor = new Color3(0.5, 0, 0.5);
                    coil.material = coilMat;
                }
                
                for (let i = 0; i < 2; i++) {
                    const stabilizer = MeshBuilder.CreateBox(`previewPlasmaStabilizer${i}`, {
                        width: barrelWidth * 0.15,
                        height: barrelLength * 0.7,
                        depth: barrelWidth * 0.15
                    }, scene);
                    stabilizer.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.7, 0, barrelLength * 0.1);
                    stabilizer.parent = barrel;
                    stabilizer.material = coreMat;
                }
                
                const emitter = MeshBuilder.CreateCylinder("previewPlasmaEmitter", {
                    height: barrelWidth * 0.4,
                    diameter: barrelWidth * 1.8,
                    tessellation: 12
                }, scene);
                emitter.position = new Vector3(0, 0, barrelLength * 0.5);
                emitter.parent = barrel;
                emitter.material = coreMat;
                break;
            case "laser":
                // Laser - ОЧЕНЬ ДЛИННАЯ, ТОНКАЯ ТРУБКА - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 0.6,
                    height: barrelLength * 1.8,
                    tessellation: 12
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                const lens = MeshBuilder.CreateCylinder("previewLens", {
                    height: barrelWidth * 0.5,
                    diameter: barrelWidth * 0.9,
                    tessellation: 16
                }, scene);
                lens.position = new Vector3(0, 0, barrelLength * 0.6);
                lens.parent = barrel;
                const lensMat = new StandardMaterial("previewLensMat", scene);
                lensMat.diffuseColor = new Color3(1, 0.2, 0);
                lensMat.emissiveColor = new Color3(0.6, 0, 0);
                lensMat.disableLighting = true;
                lens.material = lensMat;
                
                for (let i = 0; i < 4; i++) {
                    const focusRing = MeshBuilder.CreateTorus(`previewFocusRing${i}`, {
                        diameter: barrelWidth * 1.0,
                        thickness: barrelWidth * 0.08,
                        tessellation: 16
                    }, scene);
                    focusRing.position = new Vector3(0, 0, -barrelLength * 0.2 + i * barrelLength * 0.2);
                    focusRing.parent = barrel;
                    const ringMat = new StandardMaterial(`previewFocusRingMat${i}`, scene);
                    ringMat.diffuseColor = new Color3(0.8, 0, 0);
                    ringMat.emissiveColor = new Color3(0.3, 0, 0);
                    focusRing.material = ringMat;
                }
                
                for (let i = 0; i < 2; i++) {
                    const channel = MeshBuilder.CreateBox(`previewLaserChannel${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelLength * 1.2,
                        depth: barrelWidth * 0.1
                    }, scene);
                    channel.position = new Vector3((i === 0 ? -1 : 1) * barrelWidth * 0.45, 0, barrelLength * 0.1);
                    channel.parent = barrel;
                    channel.material = lensMat;
                }
                
                const housing = MeshBuilder.CreateBox("previewLaserHousing", {
                    width: barrelWidth * 0.9,
                    height: barrelWidth * 0.3,
                    depth: barrelLength * 1.3
                }, scene);
                housing.position = new Vector3(0, barrelWidth * 0.4, barrelLength * 0.05);
                housing.parent = barrel;
                const housingMat = new StandardMaterial("previewLaserHousingMat", scene);
                housingMat.diffuseColor = cannonColor.scale(0.6);
                housing.material = housingMat;
                break;
            case "railgun":
                // Railgun - ЭКСТРЕМАЛЬНО ДЛИННАЯ, С РЕЛЬСАМИ - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 0.6,
                    height: barrelLength * 2.0,
                    tessellation: 10
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                const rail1 = MeshBuilder.CreateBox("previewRail1", {
                    width: barrelWidth * 0.18,
                    height: barrelWidth * 0.9,
                    depth: barrelLength * 1.7
                }, scene);
                rail1.position = new Vector3(-barrelWidth * 0.5, 0, 0);
                rail1.parent = barrel;
                const railMat = new StandardMaterial("previewRailMat", scene);
                railMat.diffuseColor = new Color3(0.05, 0.4, 1);
                railMat.emissiveColor = new Color3(0.1, 0.2, 0.6);
                rail1.material = railMat;
                
                const rail2 = MeshBuilder.CreateBox("previewRail2", {
                    width: barrelWidth * 0.18,
                    height: barrelWidth * 0.9,
                    depth: barrelLength * 1.7
                }, scene);
                rail2.position = new Vector3(barrelWidth * 0.5, 0, 0);
                rail2.parent = barrel;
                rail2.material = railMat;
                
                for (let i = 0; i < 4; i++) {
                    const capacitor = MeshBuilder.CreateCylinder(`previewCapacitor${i}`, {
                        height: barrelWidth * 0.5,
                        diameter: barrelWidth * 0.5,
                        tessellation: 12
                    }, scene);
                    capacitor.position = new Vector3(0, barrelWidth * 0.6, -barrelLength * 0.5 + i * barrelLength * 0.25);
                    capacitor.parent = barrel;
                    capacitor.material = railMat;
                }
                
                for (let i = 0; i < 3; i++) {
                    const channel = MeshBuilder.CreateBox(`previewRailChannel${i}`, {
                        width: barrelWidth * 0.3,
                        height: barrelWidth * 0.15,
                        depth: barrelLength * 0.3
                    }, scene);
                    channel.position = new Vector3(0, 0, -barrelLength * 0.4 + i * barrelLength * 0.3);
                    channel.parent = barrel;
                    channel.material = railMat;
                }
                
                const muzzleAmp = MeshBuilder.CreateCylinder("previewRailgunMuzzleAmp", {
                    height: barrelWidth * 0.3,
                    diameter: barrelWidth * 1.2,
                    tessellation: 12
                }, scene);
                muzzleAmp.position = new Vector3(0, 0, barrelLength * 0.7);
                muzzleAmp.parent = barrel;
                muzzleAmp.material = railMat;
                break;
            case "tesla":
                // Tesla - КОРОТКАЯ, ШИРОКАЯ, С КАТУШКАМИ - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 1.8,
                    height: barrelLength * 0.9,
                    tessellation: 8
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                for (let i = 0; i < 5; i++) {
                    const coil = MeshBuilder.CreateTorus(`previewTeslaCoil${i}`, {
                        diameter: barrelWidth * 0.8,
                        thickness: barrelWidth * 0.15,
                        tessellation: 16
                    }, scene);
                    coil.position = new Vector3(0, 0, -barrelLength * 0.3 + i * barrelLength * 0.15);
                    coil.parent = barrel;
                    const coilMat = new StandardMaterial(`previewTeslaCoilMat${i}`, scene);
                    coilMat.diffuseColor = new Color3(0, 0.8, 1);
                    coilMat.emissiveColor = new Color3(0, 0.5, 0.7);
                    coil.material = coilMat;
                }
                
                for (let i = 0; i < 4; i++) {
                    const discharger = MeshBuilder.CreateCylinder(`previewTeslaDischarger${i}`, {
                        height: barrelWidth * 0.4,
                        diameter: barrelWidth * 0.2,
                        tessellation: 8
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    discharger.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.7,
                        Math.sin(angle) * barrelWidth * 0.5,
                        barrelLength * 0.2
                    );
                    discharger.parent = barrel;
                    discharger.material = barrel.material;
                }
                
                const teslaGen = MeshBuilder.CreateSphere("previewTeslaGen", {
                    diameter: barrelWidth * 0.6,
                    segments: 16
                }, scene);
                teslaGen.position = new Vector3(0, 0, -barrelLength * 0.35);
                teslaGen.parent = barrel;
                const genMat = new StandardMaterial("previewTeslaGenMat", scene);
                genMat.diffuseColor = new Color3(0, 1, 1);
                genMat.emissiveColor = new Color3(0, 0.7, 0.9);
                genMat.disableLighting = true;
                teslaGen.material = genMat;
                break;
            case "rocket":
                // Rocket - ЭКСПЕРИМЕНТАЛЬНЫЙ ДИЗАЙН (синхронизировано с TankController)
                barrel = MeshBuilder.CreateBox("previewBarrel", { 
                    width: barrelWidth * 1.7, 
                    height: barrelWidth * 1.7, 
                    depth: barrelLength * 1.1 
                }, scene);
                
                const tube = MeshBuilder.CreateCylinder("previewTube", {
                    height: barrelLength * 1.0,
                    diameter: barrelWidth * 1.5,
                    tessellation: 12
                }, scene);
                tube.position = new Vector3(0, 0, 0);
                tube.parent = barrel;
                const tubeMat = new StandardMaterial("previewRocketTubeMat", scene);
                tubeMat.diffuseColor = cannonColor.scale(0.8);
                tube.material = tubeMat;
                
                for (let i = 0; i < 6; i++) {
                    const guide = MeshBuilder.CreateBox(`previewGuide${i}`, {
                        width: barrelWidth * 0.12,
                        height: barrelLength * 0.9,
                        depth: barrelWidth * 0.12
                    }, scene);
                    const angle = (i * Math.PI * 2) / 6;
                    guide.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.7,
                        Math.sin(angle) * barrelWidth * 0.7,
                        0
                    );
                    guide.parent = barrel;
                    guide.material = tubeMat;
                }
                
                for (let i = 0; i < 4; i++) {
                    const fin = MeshBuilder.CreateBox(`previewRocketFin${i}`, {
                        width: barrelWidth * 0.15,
                        height: barrelWidth * 0.3,
                        depth: barrelWidth * 0.1
                    }, scene);
                    const angle = (i * Math.PI * 2) / 4;
                    fin.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.8,
                        Math.sin(angle) * barrelWidth * 0.8,
                        barrelLength * 0.45
                    );
                    fin.parent = barrel;
                    fin.material = tubeMat;
                }
                
                const guidance = MeshBuilder.CreateBox("previewRocketGuidance", {
                    width: barrelWidth * 0.5,
                    height: barrelWidth * 0.3,
                    depth: barrelWidth * 0.5
                }, scene);
                guidance.position = new Vector3(0, barrelWidth * 0.7, -barrelLength * 0.2);
                guidance.parent = barrel;
                const guidanceMat = new StandardMaterial("previewRocketGuidanceMat", scene);
                guidanceMat.diffuseColor = new Color3(0.2, 0.8, 0.2);
                guidanceMat.emissiveColor = new Color3(0.1, 0.4, 0.1);
                guidance.material = guidanceMat;
                break;
            case "shotgun":
                // Shotgun - ОГРОМНАЯ, МНОЖЕСТВЕННЫЕ СТВОЛЫ - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 2.2,
                    height: barrelLength * 0.75,
                    tessellation: 16
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                
                for (let i = 0; i < 10; i++) {
                    const pelletBarrel = MeshBuilder.CreateCylinder(`previewPelletBarrel${i}`, {
                        height: barrelLength * 0.7,
                        diameter: barrelWidth * 0.18,
                        tessellation: 8
                    }, scene);
                    const angle = (i * Math.PI * 2) / 10;
                    pelletBarrel.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.6,
                        Math.sin(angle) * barrelWidth * 0.6,
                        0
                    );
                    pelletBarrel.parent = barrel;
                    const barrelMat = new StandardMaterial(`previewShotgunBarrelMat${i}`, scene);
                    barrelMat.diffuseColor = cannonColor.scale(0.9);
                    pelletBarrel.material = barrelMat;
                }
                
                const centerBarrel = MeshBuilder.CreateCylinder("previewShotgunCenter", {
                    height: barrelLength * 0.75,
                    diameter: barrelWidth * 0.25,
                    tessellation: 10
                }, scene);
                centerBarrel.position = new Vector3(0, 0, 0);
                centerBarrel.parent = barrel;
                centerBarrel.material = barrel.material;
                
                for (let i = 0; i < 5; i++) {
                    const reinforcement = MeshBuilder.CreateBox(`previewShotgunReinforcement${i}`, {
                        width: barrelWidth * 0.1,
                        height: barrelLength * 0.5,
                        depth: barrelWidth * 0.1
                    }, scene);
                    const angle = (i * Math.PI * 2) / 5 + Math.PI / 10;
                    reinforcement.position = new Vector3(
                        Math.cos(angle) * barrelWidth * 0.8,
                        Math.sin(angle) * barrelWidth * 0.8,
                        barrelLength * 0.1
                    );
                    reinforcement.parent = barrel;
                    reinforcement.material = barrel.material;
                }
                break;
            case "standard":
                // Standard - СБАЛАНСИРОВАННАЯ, КЛАССИЧЕСКАЯ - УНИКАЛЬНЫЙ ДИЗАЙН
                barrel = MeshBuilder.CreateCylinder("previewBarrel", { 
                    diameter: barrelWidth * 1.0,
                    height: barrelLength * 1.0,
                    tessellation: 12
                }, scene);
                barrel.rotation.x = Math.PI / 2;
                const standardBreech = MeshBuilder.CreateBox("previewStandardBreech", { width: barrelWidth * 1.3, height: barrelWidth * 1.3, depth: barrelWidth * 0.8 }, scene);
                standardBreech.position = new Vector3(0, 0, -barrelLength * 0.4);
                standardBreech.parent = barrel;
                const standardBreechMat = new StandardMaterial("previewStandardBreechMat", scene);
                standardBreechMat.diffuseColor = cannonColor.scale(0.7);
                standardBreech.material = standardBreechMat;
                break;
            default:
                barrel = MeshBuilder.CreateBox("previewBarrel", { width: barrelWidth, height: barrelWidth, depth: barrelLength }, scene);
        }
        
        const baseBarrelZ = (cannonType.barrelLength || 2) / 2;
        barrel.position.z = baseBarrelZ;
        barrel.position.y = 0;
        const barrelMat = new StandardMaterial("previewBarrelMat", scene);
        barrelMat.diffuseColor = cannonColor;
        barrelMat.specularColor = Color3.Black();
        barrel.material = barrelMat;
        
        return barrel;
    }
    
    private cleanup3DPreview(): void {
        // Stop render loop
        if (this.previewRenderLoop !== null) {
            clearInterval(this.previewRenderLoop);
            this.previewRenderLoop = null;
        }
        
        // Dispose tank
        if (this.previewTank) {
            this.previewTank.chassis.dispose();
            this.previewTank.turret.dispose();
            this.previewTank.barrel.dispose();
            this.previewTank = null;
        }
        
        // Dispose scene and engine
        if (this.previewScene) {
            this.previewScene.dispose();
            this.previewScene = null;
        }
        
        if (this.previewEngine) {
            this.previewEngine.dispose();
            this.previewEngine = null;
        }
        
        // Remove canvas
        if (this.previewCanvas) {
            this.previewCanvas.remove();
            this.previewCanvas = null;
        }
        
        this.previewCamera = null;
        console.log("[Garage] 3D preview cleaned up");
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
                    <div class="garage-tab ${this.currentCategory === 'modules' ? 'active' : ''}" data-cat="modules">[3] MODULES</div>
                    <div class="garage-tab ${this.currentCategory === 'supplies' ? 'active' : ''}" data-cat="supplies">[4] SUPPLIES</div>
                    <div class="garage-tab ${this.currentCategory === 'shop' ? 'active' : ''}" data-cat="shop">[5] SHOP</div>
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
                                CANNON: ${getCannonById(this.currentCannonId).name}
                            </div>
                        </div>
                        <div class="garage-details" id="garage-details">
                            <div class="garage-details-title">[ SELECT AN ITEM ]</div>
                        </div>
                    </div>
                </div>
                <div class="garage-footer">
                    [↑↓] Navigate | [Enter] Select | [1-5] Categories | [ESC] Close
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
                ((item as TankPart).type === 'barrel' && item.id === this.currentCannonId)
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
            if (this.previewScene) {
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
            let previewChassisId = this.currentChassisId;
            let previewCannonId = this.currentCannonId;
            
            if (part.type === 'chassis') {
                chassisName = part.name;
                previewChassisId = part.id;
            } else if (part.type === 'barrel') {
                cannonName = part.name;
                previewCannonId = part.id;
            }
            
            previewInfo.innerHTML = `
                <div style="color: #0f0;">CHASSIS: ${chassisName}</div>
                <div style="color: #0aa; margin-top: 5px;">CANNON: ${cannonName}</div>
                ${part.type === 'chassis' || part.type === 'barrel' ? 
                    '<div style="color: #ff0; font-size: 10px; margin-top: 8px;">[ PREVIEW ]</div>' : ''}
            `;
            
            // Update 3D preview if chassis or barrel changed (only if scene is initialized)
            if ((part.type === 'chassis' || part.type === 'barrel') && this.previewScene) {
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
            ((item as TankPart).type === 'barrel' && item.id === this.currentCannonId)
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
            
            const cats: CategoryType[] = ['chassis', 'cannons', 'modules', 'supplies', 'shop'];
            for (let i = 1; i <= 5; i++) {
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
