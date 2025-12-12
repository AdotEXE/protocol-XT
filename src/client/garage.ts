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
    private sortBy: "name" | "cost" | "stats" = "name";
    private filterMode: "all" | "owned" | "locked" = "all";
    private priceFilter: "all" | "cheap" | "medium" | "expensive" = "all";
    
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
                width: 85vw;
                height: 80vh;
                max-width: 900px;
                max-height: 580px;
                background: rgba(5, 15, 5, 0.98);
                cursor: default;
                border: 2px solid #0f0;
                display: flex;
                flex-direction: column;
                animation: slideUp 0.3s ease-out;
                box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
            }
            .garage-header {
                height: 45px;
                background: rgba(0, 30, 0, 0.9);
                border-bottom: 2px solid #0f0;
                display: flex;
                align-items: center;
                padding: 0 15px;
                justify-content: space-between;
                flex-shrink: 0;
            }
            .garage-title {
                color: #0f0;
                font-size: 20px;
                font-weight: bold;
            }
            .garage-currency {
                color: #ff0;
                font-size: 15px;
                background: rgba(0,0,0,0.5);
                padding: 4px 12px;
                border: 1px solid #ff0;
            }
            .garage-close {
                color: #f00;
                font-size: 20px;
                cursor: pointer;
                padding: 4px 8px;
                border: 1px solid #f00;
                background: transparent;
            }
            .garage-close:hover { background: rgba(255,0,0,0.3); }
            .garage-tabs {
                height: 35px;
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                border-bottom: 1px solid #080;
                flex-shrink: 0;
            }
            .garage-tab {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #080;
                font-size: 11px;
                cursor: pointer;
                border-right: 1px solid #040;
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
            .garage-price-btn {
                padding: 3px 8px;
                background: rgba(0,0,0,0.5);
                border: 1px solid #080;
                color: #080;
                cursor: pointer;
                font-size: 9px;
            }
            .garage-price-btn.active { border-color: #ff0; color: #ff0; background: rgba(255,255,0,0.2); }
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
            .garage-item-name { color: #0f0; font-size: 12px; font-weight: bold; }
            .garage-item-desc { color: #080; font-size: 10px; margin-top: 3px; }
            .garage-item-stats { color: #0aa; font-size: 9px; margin-top: 4px; }
            .garage-item-price { color: #ff0; font-size: 11px; float: right; }
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
                opacity: 0.3;
                pointer-events: none;
            }
            .garage-details {
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid #080;
                padding: 10px;
                overflow-y: auto;
                min-height: 0;
            }
            .garage-details-title { color: #0f0; font-size: 14px; font-weight: bold; margin-bottom: 8px; }
            .garage-details-desc { color: #0a0; font-size: 11px; margin-bottom: 10px; }
            .garage-stats-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #030; }
            .garage-stat-name { color: #0aa; font-size: 10px; }
            .garage-stat-value { color: #0f0; font-size: 10px; }
            .garage-stat-change.positive { color: #0f0; }
            .garage-stat-change.negative { color: #f00; }
            .garage-action-btn {
                width: 100%;
                padding: 10px;
                margin-top: 10px;
                background: rgba(0,255,0,0.2);
                border: 2px solid #0f0;
                color: #0f0;
                font-size: 12px;
                font-weight: bold;
                cursor: pointer;
                font-family: inherit;
            }
            .garage-action-btn:hover { background: rgba(0,255,0,0.3); }
            .garage-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .garage-footer {
                height: 30px;
                background: rgba(0, 20, 0, 0.8);
                border-top: 1px solid #080;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #060;
                font-size: 9px;
                flex-shrink: 0;
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
        
        // Camera - rotate around tank
        this.previewCamera = new ArcRotateCamera(
            "previewCamera",
            Math.PI / 3,
            Math.PI / 3,
            8,
            Vector3.Zero(),
            this.previewScene
        );
        // Don't attach controls - camera will rotate automatically
        // this.previewCamera.attachControl(this.previewCanvas, false);
        this.previewCamera.lowerRadiusLimit = 5;
        this.previewCamera.upperRadiusLimit = 12;
        
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
        this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        
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
        
        // Create simplified chassis
        const w = chassisType.width;
        const h = chassisType.height;
        const d = chassisType.depth;
        const chassisColor = Color3.FromHexString(chassisType.color);
        
        const chassis = MeshBuilder.CreateBox("previewChassis", { width: w, height: h, depth: d }, this.previewScene);
        chassis.position = new Vector3(0, 0, 0);
        const chassisMat = new StandardMaterial("previewChassisMat", this.previewScene);
        chassisMat.diffuseColor = chassisColor;
        chassisMat.specularColor = Color3.Black();
        chassis.material = chassisMat;
        
        // Create turret
        const turretWidth = w * 0.65;
        const turretHeight = h * 0.75;
        const turretDepth = d * 0.6;
        
        const turret = MeshBuilder.CreateBox("previewTurret", { 
            width: turretWidth, 
            height: turretHeight, 
            depth: turretDepth 
        }, this.previewScene);
        turret.position.y = h / 2 + turretHeight / 2;
        turret.parent = chassis;
        const turretMat = new StandardMaterial("previewTurretMat", this.previewScene);
        turretMat.diffuseColor = chassisColor.scale(0.8);
        turretMat.specularColor = Color3.Black();
        turret.material = turretMat;
        
        // Create barrel
        const barrelWidth = cannonType.barrelWidth;
        const barrelLength = cannonType.barrelLength;
        const baseBarrelZ = turretDepth / 2 + barrelLength / 2;
        
        const barrel = MeshBuilder.CreateBox("previewBarrel", { 
            width: barrelWidth, 
            height: barrelWidth, 
            depth: barrelLength 
        }, this.previewScene);
        barrel.position.z = baseBarrelZ;
        barrel.position.y = 0;
        barrel.parent = turret;
        const barrelColor = Color3.FromHexString(cannonType.color);
        const barrelMat = new StandardMaterial("previewBarrelMat", this.previewScene);
        barrelMat.diffuseColor = barrelColor;
        barrelMat.specularColor = Color3.Black();
        barrel.material = barrelMat;
        
        this.previewTank = { chassis, turret, barrel };
        
        // Animate camera rotation
        if (this.previewCamera) {
            let angle = 0;
            const animateCamera = () => {
                if (!this.previewCamera || !this.isOpen) return;
                angle += 0.005;
                this.previewCamera.alpha = Math.PI / 3 + Math.sin(angle) * 0.3;
                this.previewCamera.beta = Math.PI / 3 + Math.cos(angle * 0.7) * 0.2;
            };
            this.previewScene.registerBeforeRender(animateCamera);
        }
        
        console.log("[Garage] Tank preview rendered:", chassisId, cannonId);
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
                                <button class="garage-price-btn ${this.priceFilter === 'all' ? 'active' : ''}" data-price="all">$</button>
                                <button class="garage-price-btn ${this.priceFilter === 'cheap' ? 'active' : ''}" data-price="cheap">$</button>
                                <button class="garage-price-btn ${this.priceFilter === 'medium' ? 'active' : ''}" data-price="medium">$$</button>
                                <button class="garage-price-btn ${this.priceFilter === 'expensive' ? 'active' : ''}" data-price="expensive">$$$</button>
                                <button class="garage-sort-btn" id="garage-sort-btn" style="margin-left: 8px;">SORT: ${this.sortBy.toUpperCase()}</button>
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
        
        // Price filters
        this.overlay.querySelectorAll('.garage-price-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.priceFilter = (e.target as HTMLElement).dataset.price as "all" | "cheap" | "medium" | "expensive";
                this.overlay!.querySelectorAll('.garage-price-btn').forEach(b => b.classList.remove('active'));
                (e.target as HTMLElement).classList.add('active');
                this.refreshItemList();
            });
        });
        
        // Sort button
        const sortBtn = this.overlay.querySelector('#garage-sort-btn');
        sortBtn?.addEventListener('click', () => {
            if (this.sortBy === 'name') this.sortBy = 'cost';
            else if (this.sortBy === 'cost') this.sortBy = 'stats';
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
        
        // Filter by price
        if (this.priceFilter !== 'all') {
            items = items.filter(i => {
                const cost = i.cost;
                if (this.priceFilter === 'cheap') return cost <= 200;
                if (this.priceFilter === 'medium') return cost > 200 && cost <= 600;
                if (this.priceFilter === 'expensive') return cost > 600;
                return true;
            });
        }
        
        // Sort items
        items.sort((a, b) => {
            if (this.sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (this.sortBy === 'cost') {
                return a.cost - b.cost;
            } else { // stats
                const aStats = this.getTotalStats(a);
                const bStats = this.getTotalStats(b);
                return bStats - aStats; // Higher stats first
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
            this.updatePreview(items[this.selectedItemIndex]);
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
            
            // Update 3D preview if chassis or barrel changed
            if (part.type === 'chassis' || part.type === 'barrel') {
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
        this.renderTankPreview(this.currentChassisId, this.currentCannonId);
        
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
