// Enhanced Garage System - Complete UI Rewrite with Grid Layout
import { CurrencyManager } from "./currencyManager";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button, ScrollViewer, InputText } from "@babylonjs/gui";
import { Scene, Mesh, MeshBuilder, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
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

// ============ STYLE CONSTANTS ============
const STYLE = {
    // Colors
    BG_DARK: "rgba(5, 15, 5, 0.95)",
    BG_MEDIUM: "rgba(10, 25, 10, 0.9)",
    BG_LIGHT: "rgba(15, 35, 15, 0.85)",
    PRIMARY: "#00ff00",
    PRIMARY_DIM: "#00aa00",
    ACCENT: "#00ffff",
    WARNING: "#ffff00",
    ERROR: "#ff0000",
    TEXT: "#00ff00",
    TEXT_DIM: "#008800",
    BORDER: "#00ff00",
    // Font
    FONT: "Consolas, Monaco, monospace",
    // Sizes
    HEADER_HEIGHT: 50,
    TAB_HEIGHT: 40,
    FOOTER_HEIGHT: 40,
};

type CategoryType = "chassis" | "cannons" | "modules" | "supplies" | "shop";

// ============ GARAGE CLASS ============
export class Garage {
    private _scene: Scene; // Keep reference for future 3D preview
    private guiTexture: AdvancedDynamicTexture;
    private currencyManager: CurrencyManager;
    private isOpen: boolean = false;
    
    // External systems (prefixed with _ for future use)
    private _chatSystem: any = null;
    private tankController: any = null;
    private _experienceSystem: any = null;
    private _playerProgression: any = null;
    private soundManager: any = null;
    private experienceSubscription: any = null;
    
    // UI Elements
    private garageContainer: Rectangle | null = null;
    private categoryButtons: Map<CategoryType, Button> = new Map();
    private itemListContainer: Rectangle | null = null;
    private scrollViewer: ScrollViewer | null = null;
    private detailsPanel: Rectangle | null = null;
    private previewContainer: Rectangle | null = null;
    private searchInput: InputText | null = null;
    
    // State
    private currentCategory: CategoryType = "chassis";
    private currentChassisId: string = "medium";
    private currentCannonId: string = "standard";
    private previewChassisId: string | null = null;
    private previewCannonId: string | null = null;
    private selectedItemIndex: number = -1;
    private filteredItems: (TankPart | TankUpgrade)[] = [];
    
    // Filters
    private searchText: string = "";
    private sortBy: "name" | "cost" | "stats" = "name";
    private filterMode: "all" | "owned" | "locked" = "all";
    
    // 3D Preview
    private previewTankBody: Mesh | null = null;
    private previewTankTurret: Mesh | null = null;
    private previewTankBarrel: Mesh | null = null;
    private previewRotation: number = 0;
    private isDraggingPreview: boolean = false;
    private lastDragX: number = 0;
    
    // Intervals
    private updateInterval: ReturnType<typeof setInterval> | null = null;
    
    // ============ DATA ============
    private chassisParts: TankPart[] = CHASSIS_TYPES.map(chassis => {
        const costs: Record<string, number> = { light: 400, medium: 0, heavy: 600, scout: 500, assault: 800 };
        return {
            id: chassis.id,
            name: chassis.name,
            description: chassis.description,
            cost: costs[chassis.id] || 0,
            unlocked: chassis.id === "medium",
            type: "chassis" as const,
            stats: { health: chassis.maxHealth, speed: chassis.moveSpeed, armor: chassis.maxHealth / 50 }
        };
    });
    
    private cannonParts: TankPart[] = CANNON_TYPES.map(cannon => {
        const costs: Record<string, number> = { standard: 0, rapid: 450, heavy: 600, sniper: 800, gatling: 550 };
        return {
            id: cannon.id,
            name: cannon.name,
            description: cannon.description,
            cost: costs[cannon.id] || 0,
            unlocked: cannon.id === "standard",
            type: "barrel" as const,
            stats: { damage: cannon.damage, reload: cannon.cooldown }
        };
    });
    
    private moduleParts: TankPart[] = [
        { id: "armor_plate", name: "Armor Plate", description: "+15% armor", cost: 300, unlocked: false, type: "module", stats: { armor: 0.15 } },
        { id: "engine_boost", name: "Engine Boost", description: "+10% speed", cost: 350, unlocked: false, type: "module", stats: { speed: 0.1 } },
        { id: "reload_system", name: "Auto-Loader", description: "-15% reload time", cost: 400, unlocked: false, type: "module", stats: { reload: -0.15 } },
        { id: "targeting", name: "Targeting Computer", description: "+10% damage", cost: 450, unlocked: false, type: "module", stats: { damage: 0.1 } },
        { id: "repair_kit", name: "Repair System", description: "Passive HP regen", cost: 500, unlocked: false, type: "module", stats: { health: 5 } },
    ];
    
    private supplyParts: TankPart[] = [
        { id: "medkit", name: "Repair Kit", description: "Restore 30 HP", cost: 50, unlocked: true, type: "supply", stats: { health: 30 } },
        { id: "speed_boost", name: "Nitro", description: "+50% speed for 5s", cost: 75, unlocked: true, type: "supply", stats: { speed: 0.5 } },
        { id: "shield", name: "Shield", description: "Block 50 damage", cost: 100, unlocked: false, type: "supply", stats: { armor: 50 } },
        { id: "damage_boost", name: "Adrenaline", description: "+25% damage for 10s", cost: 80, unlocked: false, type: "supply", stats: { damage: 0.25 } },
        { id: "smoke", name: "Smoke Screen", description: "Invisible for 3s", cost: 60, unlocked: true, type: "supply", stats: {} },
    ];
    
    private shopItems: TankPart[] = [
        { id: "premium_chassis", name: "Phantom", description: "Premium stealth chassis", cost: 2000, unlocked: false, type: "chassis", stats: { health: 90, speed: 32, armor: 1.5 } },
        { id: "premium_cannon", name: "Devastator", description: "Premium heavy cannon", cost: 2500, unlocked: false, type: "barrel", stats: { damage: 60, reload: 4500 } },
        { id: "crate_small", name: "Supply Crate", description: "Random supplies x3", cost: 200, unlocked: true, type: "supply", stats: {} },
        { id: "crate_large", name: "Weapon Crate", description: "Random weapon unlock", cost: 1000, unlocked: true, type: "supply", stats: {} },
    ];
    
    private upgrades: TankUpgrade[] = [
        { id: "health_1", name: "Health +20", description: "Increases max health", cost: 200, level: 0, maxLevel: 5, stat: "health", value: 20 },
        { id: "speed_1", name: "Speed +2", description: "Increases movement speed", cost: 250, level: 0, maxLevel: 5, stat: "speed", value: 2 },
        { id: "armor_1", name: "Armor +0.2", description: "Increases armor rating", cost: 300, level: 0, maxLevel: 5, stat: "armor", value: 0.2 },
        { id: "damage_1", name: "Damage +5", description: "Increases weapon damage", cost: 300, level: 0, maxLevel: 5, stat: "damage", value: 5 },
        { id: "reload_1", name: "Reload -100ms", description: "Faster reload speed", cost: 350, level: 0, maxLevel: 5, stat: "reload", value: -100 },
    ];
    
    // ============ CONSTRUCTOR ============
    constructor(scene: Scene, currencyManager: CurrencyManager) {
        this._scene = scene;
        this.currencyManager = currencyManager;
        
        // GUI texture will be set from Game class using setGuiTexture
        // Create a temporary one that will be replaced
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("GarageUI_temp", true, scene);
        
        this.loadProgress();
        console.log("[Garage] Initialized, waiting for GUI texture from HUD");
    }
    
    // Set external GUI texture (from HUD)
    setGuiTexture(texture: AdvancedDynamicTexture): void {
        // Dispose old temp texture if it exists and is different
        if (this.guiTexture && this.guiTexture !== texture) {
            // Don't dispose as it might cause issues, just stop using it
        }
        this.guiTexture = texture;
        console.log("[Garage] Using shared GUI texture from HUD");
    }
    
    // ============ EXTERNAL SETTERS ============
    setChatSystem(chatSystem: any): void { this._chatSystem = chatSystem; }
    setTankController(tankController: any): void { this.tankController = tankController; }
    setExperienceSystem(experienceSystem: any): void { this._experienceSystem = experienceSystem; }
    setSoundManager(soundManager: any): void { this.soundManager = soundManager; }
    
    setPlayerProgression(playerProgression: any): void {
        if (this.experienceSubscription) {
            this.experienceSubscription.remove();
            this.experienceSubscription = null;
        }
        this._playerProgression = playerProgression;
        if (playerProgression?.onExperienceChanged) {
            this.experienceSubscription = playerProgression.onExperienceChanged.add(() => {
                if (this.isOpen) this.refreshItemList();
            });
        }
    }
    
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
        } catch (e) { console.warn("[Garage] Failed to load progress:", e); }
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
        } catch (e) { console.warn("[Garage] Failed to save progress:", e); }
    }
    
    // ============ PUBLIC API ============
    isGarageOpen(): boolean { return this.isOpen; }
    getGUI(): AdvancedDynamicTexture { return this.guiTexture; }
    
    open(): void {
        if (this.isOpen) return;
        console.log("[Garage] Opening...");
        
        this.isOpen = true;
        this.currentChassisId = localStorage.getItem("selectedChassis") || "medium";
        this.currentCannonId = localStorage.getItem("selectedCannon") || "standard";
        
        this.createUI();
        
        // Ensure container is visible
        if (this.garageContainer) {
            this.garageContainer.isVisible = true;
            this.garageContainer.alpha = 1.0;
            console.log("[Garage] Container added, visible:", this.garageContainer.isVisible);
        }
        
        this.setupKeyboardNavigation();
        
        this.updateInterval = setInterval(() => {
            if (this.isOpen) this.updateCurrencyDisplay();
        }, 500);
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        
        // Debug: Log container state
        if (this.garageContainer) {
            console.log("[Garage] Container state:", {
                isVisible: this.garageContainer.isVisible,
                alpha: this.garageContainer.alpha,
                width: this.garageContainer.width,
                height: this.garageContainer.height,
                zIndex: this.garageContainer.zIndex,
                childrenCount: this.garageContainer.children?.length || 0,
                parent: this.garageContainer.parent?.name || "none"
            });
        }
        console.log("[Garage] Opened successfully, container:", !!this.garageContainer);
    }
    
    close(): void {
        if (!this.isOpen) return;
        console.log("[Garage] Closing...");
        
            this.isOpen = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.garageContainer) {
            this.garageContainer.dispose();
            this.garageContainer = null;
        }
        
        // Dispose 3D preview tank
        this.disposePreviewTank();
        
        this.categoryButtons.clear();
        this.searchText = "";
        this.filterMode = "all";
        this.selectedItemIndex = -1;
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        console.log("[Garage] Closed");
    }
    
    // Dispose preview tank (declared early for use in close)
    private disposePreviewTank(): void {
        if (this.previewTankBarrel) {
            this.previewTankBarrel.dispose();
            this.previewTankBarrel = null;
        }
        if (this.previewTankTurret) {
            this.previewTankTurret.dispose();
            this.previewTankTurret = null;
        }
        if (this.previewTankBody) {
            this.previewTankBody.dispose();
            this.previewTankBody = null;
        }
    }
    
    // ============ UI CREATION ============
    private createUI(): void {
        console.log("[Garage] Creating UI on shared HUD texture...");
        
        // Main container - fixed size that works well
        this.garageContainer = new Rectangle("garageMain");
        this.garageContainer.width = "1100px";
        this.garageContainer.height = "700px";
        this.garageContainer.background = STYLE.BG_DARK;
        this.garageContainer.thickness = 2;
        this.garageContainer.color = STYLE.BORDER;
        this.garageContainer.cornerRadius = 0;
        this.garageContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.garageContainer.zIndex = 1000;
        this.garageContainer.isPointerBlocker = true;
        this.garageContainer.isVisible = true;
        this.garageContainer.alpha = 1;
        this.guiTexture.addControl(this.garageContainer);
        
        console.log("[Garage] Main container created, adding to GUI texture");
        
        // Create layout sections
        this.createHeader();
        this.createCategoryTabs();
        this.createContentArea();
        this.createFooter();
        
        // Initial content
        this.refreshItemList();
    }
    
    // ============ HEADER ============
    private createHeader(): void {
        const header = new Rectangle("header");
        header.width = "100%";
        header.height = `${STYLE.HEADER_HEIGHT}px`;
        header.background = STYLE.BG_MEDIUM;
        header.thickness = 0;
        header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.garageContainer!.addControl(header);
        
        // Title
        const title = new TextBlock("title", "[ GARAGE ]");
        title.color = STYLE.PRIMARY;
        title.fontSize = 24;
        title.fontWeight = "bold";
        title.fontFamily = STYLE.FONT;
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        title.left = "20px";
        header.addControl(title);
        
        // Currency display
        const currencyPanel = new Rectangle("currencyPanel");
        currencyPanel.width = "180px";
        currencyPanel.height = "32px";
        currencyPanel.background = "rgba(0,0,0,0.5)";
        currencyPanel.thickness = 1;
        currencyPanel.color = STYLE.WARNING;
        currencyPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        header.addControl(currencyPanel);
        
        const currencyText = new TextBlock("currencyText", `CR: ${this.currencyManager.getCurrency()}`);
        currencyText.color = STYLE.WARNING;
        currencyText.fontSize = 16;
        currencyText.fontWeight = "bold";
        currencyText.fontFamily = STYLE.FONT;
        currencyPanel.addControl(currencyText);
        
        // Close button
        const closeBtn = Button.CreateSimpleButton("closeBtn", "X");
        closeBtn.width = "40px";
        closeBtn.height = "40px";
        closeBtn.color = STYLE.ERROR;
        closeBtn.background = "transparent";
        closeBtn.thickness = 1;
        closeBtn.fontSize = 20;
        closeBtn.fontFamily = STYLE.FONT;
        closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        closeBtn.left = "-5px";
        closeBtn.onPointerEnterObservable.add(() => {
            closeBtn.background = "rgba(255,0,0,0.3)";
        });
        closeBtn.onPointerOutObservable.add(() => {
            closeBtn.background = "transparent";
        });
        closeBtn.onPointerClickObservable.add(() => this.close());
        header.addControl(closeBtn);
        
        // Header separator
        const separator = new Rectangle("headerSep");
        separator.width = "100%";
        separator.height = "2px";
        separator.background = STYLE.PRIMARY;
        separator.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        header.addControl(separator);
    }
    
    // ============ CATEGORY TABS ============
    private createCategoryTabs(): void {
        const tabContainer = new Rectangle("tabContainer");
        tabContainer.width = "100%";
        tabContainer.height = `${STYLE.TAB_HEIGHT}px`;
        tabContainer.background = STYLE.BG_LIGHT;
        tabContainer.thickness = 0;
        tabContainer.top = `${STYLE.HEADER_HEIGHT}px`;
        tabContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.garageContainer!.addControl(tabContainer);
        
        const categories: { id: CategoryType; name: string; hotkey: string }[] = [
            { id: "chassis", name: "CHASSIS", hotkey: "1" },
            { id: "cannons", name: "CANNONS", hotkey: "2" },
            { id: "modules", name: "MODULES", hotkey: "3" },
            { id: "supplies", name: "SUPPLIES", hotkey: "4" },
            { id: "shop", name: "SHOP", hotkey: "5" },
        ];
        
        const tabWidth = 100 / categories.length;
        
        categories.forEach((cat, i) => {
            const btn = Button.CreateSimpleButton(`tab_${cat.id}`, `[${cat.hotkey}] ${cat.name}`);
            btn.width = `${tabWidth}%`;
            btn.height = "100%";
            btn.color = this.currentCategory === cat.id ? STYLE.PRIMARY : STYLE.TEXT_DIM;
            btn.background = this.currentCategory === cat.id ? "rgba(0,255,0,0.15)" : "transparent";
            btn.thickness = 0;
            btn.fontSize = 12;
            btn.fontWeight = this.currentCategory === cat.id ? "bold" : "normal";
            btn.fontFamily = STYLE.FONT;
            btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.left = `${i * tabWidth}%`;
            
            btn.onPointerEnterObservable.add(() => {
                if (this.currentCategory !== cat.id) {
                    btn.color = STYLE.PRIMARY;
                    btn.background = "rgba(0,255,0,0.1)";
                }
            });
            btn.onPointerOutObservable.add(() => {
                if (this.currentCategory !== cat.id) {
                    btn.color = STYLE.TEXT_DIM;
                    btn.background = "transparent";
                }
            });
            btn.onPointerClickObservable.add(() => this.switchCategory(cat.id));
            
            tabContainer.addControl(btn);
            this.categoryButtons.set(cat.id, btn);
        });
        
        // Tab separator
        const separator = new Rectangle("tabSep");
        separator.width = "100%";
        separator.height = "1px";
        separator.background = STYLE.PRIMARY_DIM;
        separator.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        tabContainer.addControl(separator);
    }
    
    // ============ CONTENT AREA ============
    private createContentArea(): void {
        const contentTop = STYLE.HEADER_HEIGHT + STYLE.TAB_HEIGHT;
        const contentHeight = `calc(100% - ${contentTop + STYLE.FOOTER_HEIGHT}px)`;
        
        const contentArea = new Rectangle("contentArea");
        contentArea.width = "100%";
        contentArea.height = contentHeight;
        contentArea.background = "transparent";
        contentArea.thickness = 0;
        contentArea.top = `${contentTop}px`;
        contentArea.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.garageContainer!.addControl(contentArea);
        
        // Left panel (45%) - Search + Item list
        this.createLeftPanel(contentArea);
        
        // Right panel (55%) - Preview + Details
        this.createRightPanel(contentArea);
    }
    
    private createLeftPanel(parent: Rectangle): void {
        const leftPanel = new Rectangle("leftPanel");
        leftPanel.width = "45%";
        leftPanel.height = "100%";
        leftPanel.background = "transparent";
        leftPanel.thickness = 0;
        leftPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(leftPanel);
        
        // Search bar
        this.createSearchBar(leftPanel);
        
        // Filter buttons
        this.createFilterButtons(leftPanel);
        
        // Item list with scroll
        this.createItemList(leftPanel);
    }
    
    private createSearchBar(parent: Rectangle): void {
        const searchContainer = new Rectangle("searchContainer");
        searchContainer.width = "95%";
        searchContainer.height = "35px";
        searchContainer.background = "rgba(0,0,0,0.5)";
        searchContainer.thickness = 1;
        searchContainer.color = STYLE.ACCENT;
        searchContainer.top = "10px";
        searchContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        parent.addControl(searchContainer);
        
        const searchLabel = new TextBlock("searchLabel", "SEARCH:");
        searchLabel.width = "70px";
        searchLabel.color = STYLE.ACCENT;
        searchLabel.fontSize = 11;
        searchLabel.fontFamily = STYLE.FONT;
        searchLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        searchLabel.left = "10px";
        searchContainer.addControl(searchLabel);
        
        this.searchInput = new InputText("searchInput");
        this.searchInput.width = "calc(100% - 90px)";
        this.searchInput.height = "100%";
        this.searchInput.text = "";
        this.searchInput.placeholderText = "Type to filter...";
        this.searchInput.color = STYLE.PRIMARY;
        this.searchInput.background = "transparent";
        this.searchInput.focusedBackground = "rgba(0,255,0,0.1)";
        this.searchInput.fontSize = 12;
        this.searchInput.fontFamily = STYLE.FONT;
        this.searchInput.thickness = 0;
        this.searchInput.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.searchInput.onTextChangedObservable.add(() => {
            this.searchText = this.searchInput!.text;
            this.selectedItemIndex = -1;
            this.refreshItemList();
        });
        searchContainer.addControl(this.searchInput);
    }
    
    private createFilterButtons(parent: Rectangle): void {
        const filterContainer = new Rectangle("filterContainer");
        filterContainer.width = "95%";
        filterContainer.height = "30px";
        filterContainer.background = "transparent";
        filterContainer.thickness = 0;
        filterContainer.top = "50px";
        filterContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        parent.addControl(filterContainer);
        
        const filters: { id: "all" | "owned" | "locked"; name: string }[] = [
            { id: "all", name: "ALL" },
            { id: "owned", name: "OWNED" },
            { id: "locked", name: "LOCKED" },
        ];
        
        filters.forEach((f, i) => {
            const btn = Button.CreateSimpleButton(`filter_${f.id}`, f.name);
            btn.width = "60px";
            btn.height = "24px";
            btn.color = this.filterMode === f.id ? STYLE.PRIMARY : STYLE.TEXT_DIM;
            btn.background = this.filterMode === f.id ? "rgba(0,255,0,0.2)" : "rgba(0,0,0,0.5)";
            btn.thickness = 1;
            btn.fontSize = 10;
            btn.fontFamily = STYLE.FONT;
            btn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            btn.left = `${i * 65 + 5}px`;
            
            btn.onPointerClickObservable.add(() => {
                this.filterMode = f.id;
                this.selectedItemIndex = -1;
                this.refreshItemList();
                this.updateFilterButtons(filterContainer);
            });
            filterContainer.addControl(btn);
        });
        
        // Sort button
        const sortBtn = Button.CreateSimpleButton("sortBtn", `SORT: ${this.sortBy.toUpperCase()}`);
        sortBtn.width = "100px";
        sortBtn.height = "24px";
        sortBtn.color = STYLE.ACCENT;
        sortBtn.background = "rgba(0,255,255,0.1)";
        sortBtn.thickness = 1;
        sortBtn.fontSize = 10;
        sortBtn.fontFamily = STYLE.FONT;
        sortBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        sortBtn.left = "-5px";
        sortBtn.onPointerClickObservable.add(() => {
            if (this.sortBy === "name") this.sortBy = "cost";
            else if (this.sortBy === "cost") this.sortBy = "stats";
            else this.sortBy = "name";
            sortBtn.textBlock!.text = `SORT: ${this.sortBy.toUpperCase()}`;
            this.refreshItemList();
        });
        filterContainer.addControl(sortBtn);
    }
    
    private updateFilterButtons(container: Rectangle): void {
        ["all", "owned", "locked"].forEach(id => {
            const btn = container.getChildByName(`filter_${id}`) as Button;
            if (btn) {
                btn.color = this.filterMode === id ? STYLE.PRIMARY : STYLE.TEXT_DIM;
                btn.background = this.filterMode === id ? "rgba(0,255,0,0.2)" : "rgba(0,0,0,0.5)";
            }
        });
    }
    
    private createItemList(parent: Rectangle): void {
        // Scroll viewer
        this.scrollViewer = new ScrollViewer("itemScroll");
        this.scrollViewer.width = "95%";
        this.scrollViewer.height = "calc(100% - 95px)";
        this.scrollViewer.background = "rgba(0,0,0,0.3)";
        this.scrollViewer.thickness = 1;
        this.scrollViewer.color = STYLE.PRIMARY_DIM;
        this.scrollViewer.top = "85px";
        this.scrollViewer.barSize = 8;
        this.scrollViewer.barColor = STYLE.PRIMARY_DIM;
        this.scrollViewer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        parent.addControl(this.scrollViewer);
        
        // Item list container
        this.itemListContainer = new Rectangle("itemListContainer");
        this.itemListContainer.width = "100%";
        this.itemListContainer.height = "100%";
        this.itemListContainer.background = "transparent";
        this.itemListContainer.thickness = 0;
        this.scrollViewer.addControl(this.itemListContainer);
    }
    
    private createRightPanel(parent: Rectangle): void {
        const rightPanel = new Rectangle("rightPanel");
        rightPanel.width = "55%";
        rightPanel.height = "100%";
        rightPanel.background = "transparent";
        rightPanel.thickness = 0;
        rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        parent.addControl(rightPanel);
        
        // Separator line
        const separator = new Rectangle("panelSep");
        separator.width = "1px";
        separator.height = "95%";
        separator.background = STYLE.PRIMARY_DIM;
        separator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        rightPanel.addControl(separator);
        
        // Tank preview area (top 50%)
        this.createPreviewArea(rightPanel);
        
        // Details panel (bottom 50%)
        this.createDetailsPanel(rightPanel);
    }
    
    private createPreviewArea(parent: Rectangle): void {
        this.previewContainer = new Rectangle("previewContainer");
        this.previewContainer.width = "95%";
        this.previewContainer.height = "50%";
        this.previewContainer.background = "rgba(0,20,0,0.5)";
        this.previewContainer.thickness = 1;
        this.previewContainer.color = STYLE.PRIMARY_DIM;
        this.previewContainer.top = "10px";
        this.previewContainer.left = "10px";
        this.previewContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.previewContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(this.previewContainer);
        
        // Preview title
        const previewTitle = new TextBlock("previewTitle", "[ TANK PREVIEW ]");
        previewTitle.color = STYLE.PRIMARY_DIM;
        previewTitle.fontSize = 10;
        previewTitle.fontFamily = STYLE.FONT;
        previewTitle.top = "5px";
        previewTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.previewContainer.addControl(previewTitle);
        
        // Create 3D tank preview (optional, won't break UI if fails)
        try {
            this.createPreviewTank();
        } catch (e) {
            console.warn("[Garage] Preview tank creation failed:", e);
        }
        
        // Current chassis/cannon info
        this.updatePreviewInfo();
        
        // Drag hint
        const dragHint = new TextBlock("dragHint", "[ Drag to rotate ]");
        dragHint.color = STYLE.TEXT_DIM;
        dragHint.fontSize = 9;
        dragHint.fontFamily = STYLE.FONT;
        dragHint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        dragHint.top = "-5px";
        this.previewContainer.addControl(dragHint);
        
        // Setup drag rotation
        this.setupPreviewDrag();
    }
    
    private createPreviewTank(): void {
        try {
            // Dispose old preview meshes
            this.disposePreviewTank();
            
            const chassisType = getChassisById(this.previewChassisId || this.currentChassisId);
            const cannonType = getCannonById(this.previewCannonId || this.currentCannonId);
            
            // Create tank body at preview position (far from gameplay area)
            const previewPos = new Vector3(1000, 50, 1000);
            
            // Tank body
            this.previewTankBody = MeshBuilder.CreateBox("previewBody", {
                width: chassisType.width,
                height: chassisType.height,
                depth: chassisType.depth
            }, this._scene);
            this.previewTankBody.position = previewPos;
            this.previewTankBody.rotation.y = this.previewRotation;
            
            const bodyMat = new StandardMaterial("previewBodyMat", this._scene);
            bodyMat.diffuseColor = Color3.FromHexString(chassisType.color);
            bodyMat.emissiveColor = Color3.FromHexString(chassisType.color).scale(0.3);
            this.previewTankBody.material = bodyMat;
            
            // Tank turret
            this.previewTankTurret = MeshBuilder.CreateBox("previewTurret", {
                width: chassisType.width * 0.6,
                height: chassisType.height * 0.8,
                depth: chassisType.depth * 0.4
            }, this._scene);
            this.previewTankTurret.parent = this.previewTankBody;
            this.previewTankTurret.position = new Vector3(0, chassisType.height * 0.9, 0);
            
            const turretMat = new StandardMaterial("previewTurretMat", this._scene);
            turretMat.diffuseColor = Color3.FromHexString(cannonType.color);
            turretMat.emissiveColor = Color3.FromHexString(cannonType.color).scale(0.3);
            this.previewTankTurret.material = turretMat;
            
            // Tank barrel
            this.previewTankBarrel = MeshBuilder.CreateCylinder("previewBarrel", {
                height: cannonType.barrelLength,
                diameter: cannonType.barrelWidth * 2
            }, this._scene);
            this.previewTankBarrel.parent = this.previewTankTurret;
            this.previewTankBarrel.rotation.x = Math.PI / 2;
            this.previewTankBarrel.position = new Vector3(0, 0, cannonType.barrelLength / 2 + chassisType.depth * 0.2);
            this.previewTankBarrel.material = turretMat;
        } catch (e) {
            console.warn("[Garage] Failed to create 3D preview tank:", e);
        }
    }
    
    private setupPreviewDrag(): void {
        if (!this.previewContainer) return;
        
        this.previewContainer.onPointerDownObservable.add((info) => {
            this.isDraggingPreview = true;
            this.lastDragX = info.x;
        });
        
        this.previewContainer.onPointerUpObservable.add(() => {
            this.isDraggingPreview = false;
        });
        
        this.previewContainer.onPointerMoveObservable.add((info) => {
            if (this.isDraggingPreview && this.previewTankBody) {
                const deltaX = info.x - this.lastDragX;
                this.previewRotation += deltaX * 0.01;
                this.previewTankBody.rotation.y = this.previewRotation;
                this.lastDragX = info.x;
            }
        });
    }
    
    private updatePreviewInfo(): void {
        if (!this.previewContainer) return;
        
        // Remove old info
        const oldInfo = this.previewContainer.getChildByName("currentInfo");
        if (oldInfo) oldInfo.dispose();
        
        const chassis = CHASSIS_TYPES.find(c => c.id === (this.previewChassisId || this.currentChassisId));
        const cannon = CANNON_TYPES.find(c => c.id === (this.previewCannonId || this.currentCannonId));
        
        const infoPanel = new Rectangle("currentInfo");
        infoPanel.width = "90%";
        infoPanel.height = "60px";
        infoPanel.background = "rgba(0,0,0,0.5)";
        infoPanel.thickness = 0;
        infoPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.previewContainer.addControl(infoPanel);
        
        const chassisText = new TextBlock("chassisInfo", `CHASSIS: ${chassis?.name || "None"}`);
        chassisText.color = STYLE.PRIMARY;
        chassisText.fontSize = 14;
        chassisText.fontFamily = STYLE.FONT;
        chassisText.top = "-15px";
        infoPanel.addControl(chassisText);
        
        const cannonText = new TextBlock("cannonInfo", `CANNON: ${cannon?.name || "None"}`);
        cannonText.color = STYLE.ACCENT;
        cannonText.fontSize = 14;
        cannonText.fontFamily = STYLE.FONT;
        cannonText.top = "15px";
        infoPanel.addControl(cannonText);
    }
    
    private createDetailsPanel(parent: Rectangle): void {
        this.detailsPanel = new Rectangle("detailsPanel");
        this.detailsPanel.width = "95%";
        this.detailsPanel.height = "calc(50% - 25px)";
        this.detailsPanel.background = "rgba(0,0,0,0.3)";
        this.detailsPanel.thickness = 1;
        this.detailsPanel.color = STYLE.PRIMARY_DIM;
        this.detailsPanel.top = "-10px";
        this.detailsPanel.left = "10px";
        this.detailsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.detailsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        parent.addControl(this.detailsPanel);
        
        // Title
        const detailsTitle = new TextBlock("detailsTitle", "[ SELECT AN ITEM ]");
        detailsTitle.color = STYLE.TEXT_DIM;
        detailsTitle.fontSize = 12;
        detailsTitle.fontFamily = STYLE.FONT;
        detailsTitle.top = "10px";
        detailsTitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.detailsPanel.addControl(detailsTitle);
    }
    
    // ============ FOOTER ============
    private createFooter(): void {
        const footer = new Rectangle("footer");
        footer.width = "100%";
        footer.height = `${STYLE.FOOTER_HEIGHT}px`;
        footer.background = STYLE.BG_MEDIUM;
        footer.thickness = 0;
        footer.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.garageContainer!.addControl(footer);
        
        // Footer separator
        const separator = new Rectangle("footerSep");
        separator.width = "100%";
        separator.height = "1px";
        separator.background = STYLE.PRIMARY_DIM;
        separator.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        footer.addControl(separator);
        
        // Keyboard hints
        const hints = new TextBlock("hints", "[↑↓] Navigate  |  [Enter/Space] Select  |  [1-5] Categories  |  [ESC] Close");
        hints.color = STYLE.TEXT_DIM;
        hints.fontSize = 10;
        hints.fontFamily = STYLE.FONT;
        footer.addControl(hints);
    }
    
    // ============ ITEM LIST RENDERING ============
    private refreshItemList(): void {
        if (!this.itemListContainer) return;
        
        // Clear old items
        this.itemListContainer.getDescendants().forEach(c => c.dispose());
        
        // Get items for current category
        let items: (TankPart | TankUpgrade)[] = this.getItemsForCategory();
        
        // Apply search filter
        if (this.searchText.trim()) {
            const search = this.searchText.toLowerCase();
            items = items.filter(item => 
                item.name.toLowerCase().includes(search) || 
                item.description.toLowerCase().includes(search)
            );
        }
        
        // Apply owned/locked filter
        if (this.filterMode !== "all") {
            items = items.filter(item => {
                if ("level" in item) {
                    return this.filterMode === "owned" ? item.level > 0 : item.level === 0;
                } else {
                    return this.filterMode === "owned" ? item.unlocked : !item.unlocked;
                }
            });
        }
        
        // Apply sorting
        items = this.sortItems(items);
        
        this.filteredItems = items;
        
        // Validate selection
        if (this.selectedItemIndex >= items.length) {
            this.selectedItemIndex = items.length > 0 ? 0 : -1;
        }
        
        // Calculate container height
        const itemHeight = 70;
        const spacing = 5;
        const totalHeight = items.length * (itemHeight + spacing);
        this.itemListContainer.height = `${Math.max(totalHeight, 100)}px`;
        
        // Render items
        items.forEach((item, i) => {
            const card = this.createItemCard(item, i);
            card.top = `${i * (itemHeight + spacing)}px`;
            this.itemListContainer!.addControl(card);
        });
        
        // Update details if item selected
        if (this.selectedItemIndex >= 0 && this.selectedItemIndex < items.length) {
            this.showItemDetails(items[this.selectedItemIndex]);
        }
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
    
    private sortItems(items: (TankPart | TankUpgrade)[]): (TankPart | TankUpgrade)[] {
        return items.sort((a, b) => {
            if (this.sortBy === "name") return a.name.localeCompare(b.name);
            if (this.sortBy === "cost") return a.cost - b.cost;
            // Stats - sort by primary stat
            const getMainStat = (item: TankPart | TankUpgrade): number => {
                if ("level" in item) return item.value;
                if (item.stats.health) return item.stats.health;
                if (item.stats.damage) return item.stats.damage;
                if (item.stats.speed) return item.stats.speed;
                return 0;
            };
            return getMainStat(b) - getMainStat(a);
        });
    }
    
    private createItemCard(item: TankPart | TankUpgrade, index: number): Rectangle {
        const isUpgrade = "level" in item;
        const isOwned = isUpgrade ? item.level > 0 : (item as TankPart).unlocked;
        const isSelected = index === this.selectedItemIndex;
        const isEquipped = !isUpgrade && (
            (item as TankPart).type === "chassis" && item.id === this.currentChassisId ||
            (item as TankPart).type === "barrel" && item.id === this.currentCannonId
        );
        
        const card = new Rectangle(`item_${index}`);
        card.width = "98%";
        card.height = "65px";
        card.background = isSelected ? "rgba(0,255,0,0.15)" : isEquipped ? "rgba(0,255,255,0.1)" : "rgba(0,0,0,0.4)";
        card.thickness = isSelected ? 2 : 1;
        card.color = isSelected ? STYLE.PRIMARY : isEquipped ? STYLE.ACCENT : (isOwned ? STYLE.PRIMARY_DIM : STYLE.TEXT_DIM);
        card.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        card.isPointerBlocker = true;
        
        // Item name
        const name = new TextBlock("name", item.name + (isEquipped ? " [EQUIPPED]" : ""));
        name.color = isOwned ? STYLE.PRIMARY : STYLE.TEXT_DIM;
        name.fontSize = 13;
        name.fontWeight = isEquipped ? "bold" : "normal";
        name.fontFamily = STYLE.FONT;
        name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        name.left = "10px";
        name.top = "8px";
        name.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        card.addControl(name);
        
        // Description
        const desc = new TextBlock("desc", item.description);
        desc.color = STYLE.TEXT_DIM;
        desc.fontSize = 10;
        desc.fontFamily = STYLE.FONT;
        desc.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        desc.left = "10px";
        desc.top = "26px";
        desc.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        card.addControl(desc);
        
        // Stats preview
        const statsText = this.formatItemStats(item);
        const stats = new TextBlock("stats", statsText);
        stats.color = STYLE.ACCENT;
        stats.fontSize = 10;
        stats.fontFamily = STYLE.FONT;
        stats.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        stats.left = "10px";
        stats.top = "-8px";
        stats.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        card.addControl(stats);
        
        // Price or status
        let priceText = "";
        if (isOwned && !isUpgrade) {
            priceText = "OWNED";
        } else if (isUpgrade && item.level >= item.maxLevel) {
            priceText = "MAX";
            } else {
            priceText = `${item.cost} CR`;
        }
        
        const price = new TextBlock("price", priceText);
        price.color = isOwned ? STYLE.PRIMARY : STYLE.WARNING;
        price.fontSize = 12;
        price.fontWeight = "bold";
        price.fontFamily = STYLE.FONT;
        price.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        price.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        price.left = "-10px";
        price.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        card.addControl(price);
        
        // XP bar for upgrades
        if (isUpgrade) {
            const xpBg = new Rectangle("xpBg");
            xpBg.width = "60px";
            xpBg.height = "6px";
            xpBg.background = "rgba(0,0,0,0.5)";
            xpBg.thickness = 0;
            xpBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            xpBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
            xpBg.left = "-10px";
            xpBg.top = "-8px";
            card.addControl(xpBg);
            
            const xpFill = new Rectangle("xpFill");
            xpFill.width = `${(item.level / item.maxLevel) * 100}%`;
            xpFill.height = "100%";
            xpFill.background = STYLE.PRIMARY;
            xpFill.thickness = 0;
            xpFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            xpBg.addControl(xpFill);
        }
        
        // Click handlers
        card.onPointerEnterObservable.add(() => {
                if (!isSelected) {
                card.background = "rgba(0,255,0,0.1)";
            }
        });
        card.onPointerOutObservable.add(() => {
                if (!isSelected) {
                card.background = isEquipped ? "rgba(0,255,255,0.1)" : "rgba(0,0,0,0.4)";
            }
        });
        // Double-click detection via timing
        let lastClickTime = 0;
        card.onPointerClickObservable.add(() => {
            const now = Date.now();
            if (now - lastClickTime < 300) {
                // Double-click detected
                this.handleItemAction(item);
            } else {
                // Single click
                this.selectedItemIndex = index;
                this.refreshItemList();
                this.showItemDetails(item);
            }
            lastClickTime = now;
        });
        
        return card;
    }
    
    private formatItemStats(item: TankPart | TankUpgrade): string {
            if ("level" in item) {
            return `Lv.${item.level}/${item.maxLevel} | ${item.stat.toUpperCase()}: ${item.value > 0 ? "+" : ""}${item.value}`;
        }
                const part = item as TankPart;
        const stats: string[] = [];
        if (part.stats.health) stats.push(`HP:${part.stats.health}`);
        if (part.stats.speed) stats.push(`SPD:${part.stats.speed}`);
        if (part.stats.damage) stats.push(`DMG:${part.stats.damage}`);
        if (part.stats.reload) stats.push(`RLD:${part.stats.reload}ms`);
        if (part.stats.armor) stats.push(`ARM:${part.stats.armor}`);
        return stats.join(" | ");
    }
    
    // ============ DETAILS PANEL ============
    private showItemDetails(item: TankPart | TankUpgrade): void {
        if (!this.detailsPanel) return;
        
        // Clear old content
        this.detailsPanel.getDescendants().forEach(c => c.dispose());
        
        const isUpgrade = "level" in item;
        const canAfford = this.currencyManager.getCurrency() >= item.cost;
        
        // Title
        const title = new TextBlock("title", `[ ${item.name.toUpperCase()} ]`);
        title.color = STYLE.PRIMARY;
        title.fontSize = 14;
        title.fontWeight = "bold";
        title.fontFamily = STYLE.FONT;
        title.top = "10px";
        title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.detailsPanel.addControl(title);
        
        // Description
        const desc = new TextBlock("desc", item.description);
        desc.color = STYLE.TEXT;
        desc.fontSize = 11;
        desc.fontFamily = STYLE.FONT;
        desc.top = "35px";
        desc.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this.detailsPanel.addControl(desc);
        
        // Stats comparison (for parts)
        if (!isUpgrade) {
            const part = item as TankPart;
            this.showStatsComparison(part);
        }
        
        // Action button
        let btnText = "";
        let btnColor = STYLE.PRIMARY;
        let btnEnabled = true;
        
        if (isUpgrade) {
            const upgrade = item as TankUpgrade;
            if (upgrade.level >= upgrade.maxLevel) {
                btnText = "MAX LEVEL";
                btnColor = STYLE.TEXT_DIM;
                btnEnabled = false;
            } else if (!canAfford) {
                btnText = `NEED ${item.cost} CR`;
                btnColor = STYLE.ERROR;
                btnEnabled = false;
            } else {
                btnText = `UPGRADE (${item.cost} CR)`;
            }
        } else {
            const part = item as TankPart;
            if (part.unlocked) {
                if ((part.type === "chassis" && part.id === this.currentChassisId) ||
                    (part.type === "barrel" && part.id === this.currentCannonId)) {
                    btnText = "EQUIPPED";
                    btnColor = STYLE.ACCENT;
                    btnEnabled = false;
                } else {
                    btnText = "EQUIP";
                    btnColor = STYLE.PRIMARY;
                }
            } else if (!canAfford) {
                btnText = `NEED ${item.cost} CR`;
                btnColor = STYLE.ERROR;
                btnEnabled = false;
        } else {
                btnText = `BUY (${item.cost} CR)`;
                btnColor = STYLE.WARNING;
            }
        }
        
        const actionBtn = Button.CreateSimpleButton("actionBtn", btnText);
        actionBtn.width = "180px";
        actionBtn.height = "35px";
        actionBtn.color = btnColor;
        actionBtn.background = btnEnabled ? "rgba(0,255,0,0.2)" : "rgba(100,100,100,0.2)";
        actionBtn.thickness = 2;
        actionBtn.fontSize = 12;
        actionBtn.fontWeight = "bold";
        actionBtn.fontFamily = STYLE.FONT;
        actionBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
        actionBtn.top = "-15px";
        
        if (btnEnabled) {
            actionBtn.onPointerEnterObservable.add(() => {
                actionBtn.background = "rgba(0,255,0,0.3)";
            });
            actionBtn.onPointerOutObservable.add(() => {
                actionBtn.background = "rgba(0,255,0,0.2)";
            });
            actionBtn.onPointerClickObservable.add(() => {
                this.handleItemAction(item);
            });
        }
        
        this.detailsPanel.addControl(actionBtn);
    }
    
    private showStatsComparison(item: TankPart): void {
        if (!this.detailsPanel) return;
        
        const currentChassis = CHASSIS_TYPES.find(c => c.id === this.currentChassisId);
        const currentCannon = CANNON_TYPES.find(c => c.id === this.currentCannonId);
        
        let comparisons: { stat: string; current: number; new: number }[] = [];
        
        if (item.type === "chassis") {
            const newChassis = CHASSIS_TYPES.find(c => c.id === item.id);
            if (currentChassis && newChassis) {
                comparisons = [
                    { stat: "HP", current: currentChassis.maxHealth, new: newChassis.maxHealth },
                    { stat: "SPEED", current: currentChassis.moveSpeed, new: newChassis.moveSpeed },
                ];
            }
        } else if (item.type === "barrel") {
            const newCannon = CANNON_TYPES.find(c => c.id === item.id);
            if (currentCannon && newCannon) {
                comparisons = [
                    { stat: "DAMAGE", current: currentCannon.damage, new: newCannon.damage },
                    { stat: "RELOAD", current: currentCannon.cooldown, new: newCannon.cooldown },
                ];
            }
        }
        
        comparisons.forEach((comp, i) => {
            const diff = comp.new - comp.current;
            const isReload = comp.stat === "RELOAD";
            const isBetter = isReload ? diff < 0 : diff > 0;
            const color = diff === 0 ? STYLE.TEXT_DIM : (isBetter ? STYLE.PRIMARY : STYLE.ERROR);
            const arrow = diff === 0 ? "=" : (isBetter ? "▲" : "▼");
            
            const text = new TextBlock(`comp_${i}`, 
                `${comp.stat}: ${comp.current} → ${comp.new} ${arrow} ${Math.abs(diff)}`);
            text.color = color;
            text.fontSize = 11;
            text.fontFamily = STYLE.FONT;
            text.top = `${60 + i * 18}px`;
            text.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.detailsPanel!.addControl(text);
        });
    }
    
    // ============ ACTIONS ============
    private handleItemAction(item: TankPart | TankUpgrade): void {
        const isUpgrade = "level" in item;
        
        if (isUpgrade) {
            this.purchaseUpgrade(item as TankUpgrade);
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
            this.showMessage("Insufficient credits!", STYLE.ERROR);
            return;
        }
        
        this.currencyManager.addCurrency(-part.cost);
        part.unlocked = true;
        this.saveProgress();
        this.showMessage(`Purchased ${part.name}!`, STYLE.PRIMARY);
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        this.refreshItemList();
    }
    
    private equipPart(part: TankPart): void {
        if (!part.unlocked) return;
        
        if (part.type === "chassis") {
            this.currentChassisId = part.id;
            this.previewChassisId = part.id;
            localStorage.setItem("selectedChassis", part.id);
        } else if (part.type === "barrel") {
            this.currentCannonId = part.id;
            this.previewCannonId = part.id;
            localStorage.setItem("selectedCannon", part.id);
        }
        
        // Apply to tank controller
        if (this.tankController) {
            if (part.type === "chassis" && this.tankController.setChassisType) {
                this.tankController.setChassisType(part.id);
            } else if (part.type === "barrel" && this.tankController.setCannonType) {
                this.tankController.setCannonType(part.id);
            }
        }
        
        this.saveProgress();
        this.updatePreviewInfo();
        this.createPreviewTank(); // Update 3D preview
        this.showMessage(`Equipped ${part.name}!`, STYLE.ACCENT);
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        this.refreshItemList();
    }
    
    private purchaseUpgrade(upgrade: TankUpgrade): void {
        if (upgrade.level >= upgrade.maxLevel) return;
        if (this.currencyManager.getCurrency() < upgrade.cost) {
            this.showMessage("Insufficient credits!", STYLE.ERROR);
            return;
        }
        
        this.currencyManager.addCurrency(-upgrade.cost);
        upgrade.level++;
        this.saveProgress();
        this.showMessage(`Upgraded ${upgrade.name} to Lv.${upgrade.level}!`, STYLE.PRIMARY);
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        this.refreshItemList();
    }
    
    private showMessage(text: string, color: string): void {
        if (!this.garageContainer) return;
        
        // Remove old message
        const oldMsg = this.garageContainer.getChildByName("message");
        if (oldMsg) oldMsg.dispose();
        
        const msg = new TextBlock("message", text);
        msg.color = color;
        msg.fontSize = 14;
        msg.fontWeight = "bold";
        msg.fontFamily = STYLE.FONT;
        msg.top = `${STYLE.HEADER_HEIGHT + 5}px`;
        msg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        msg.zIndex = 100;
        this.garageContainer.addControl(msg);
        
        // Auto-remove after 2 seconds
                setTimeout(() => {
            if (msg.parent) msg.dispose();
                }, 2000);
    }
    
    private updateCurrencyDisplay(): void {
        if (!this.garageContainer) return;
        const header = this.garageContainer.getChildByName("header") as Rectangle;
        if (!header) return;
        const currencyPanel = header.getChildByName("currencyPanel") as Rectangle;
        if (!currencyPanel) return;
        const currencyText = currencyPanel.getChildByName("currencyText") as TextBlock;
        if (currencyText) {
            currencyText.text = `CR: ${this.currencyManager.getCurrency()}`;
        }
    }
    
    // ============ CATEGORY SWITCHING ============
    private switchCategory(category: CategoryType): void {
        if (this.currentCategory === category) return;
        
        this.currentCategory = category;
        this.selectedItemIndex = -1;
        this.searchText = "";
        if (this.searchInput) this.searchInput.text = "";
        
        // Update tab buttons
        this.categoryButtons.forEach((btn, id) => {
            btn.color = id === category ? STYLE.PRIMARY : STYLE.TEXT_DIM;
            btn.background = id === category ? "rgba(0,255,0,0.15)" : "transparent";
            btn.fontWeight = id === category ? "bold" : "normal";
        });
        
        this.refreshItemList();
        
        // Clear details
        if (this.detailsPanel) {
            this.detailsPanel.getDescendants().forEach(c => c.dispose());
            const title = new TextBlock("detailsTitle", "[ SELECT AN ITEM ]");
            title.color = STYLE.TEXT_DIM;
            title.fontSize = 12;
            title.fontFamily = STYLE.FONT;
            title.top = "10px";
            title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            this.detailsPanel.addControl(title);
        }
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
    }
    
    // ============ KEYBOARD NAVIGATION ============
    private setupKeyboardNavigation(): void {
        const handler = (e: KeyboardEvent) => {
            if (!this.isOpen) return;
            
            // ESC - close
            if (e.code === "Escape") {
                e.preventDefault();
                this.close();
                return;
            }
            
            // Category hotkeys 1-5
            const categories: CategoryType[] = ["chassis", "cannons", "modules", "supplies", "shop"];
            for (let i = 1; i <= 5; i++) {
                if (e.code === `Digit${i}` || e.code === `Numpad${i}`) {
                    e.preventDefault();
                    this.switchCategory(categories[i - 1]);
                    return;
                }
            }
            
            // Arrow navigation
            if (e.code === "ArrowUp") {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = Math.max(0, this.selectedItemIndex - 1);
                    this.refreshItemList();
                    this.scrollToSelected();
                    if (this.selectedItemIndex >= 0) {
                        this.showItemDetails(this.filteredItems[this.selectedItemIndex]);
                    }
                }
            } else if (e.code === "ArrowDown") {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = Math.min(this.filteredItems.length - 1, this.selectedItemIndex + 1);
                    this.refreshItemList();
                    this.scrollToSelected();
                    if (this.selectedItemIndex >= 0) {
                        this.showItemDetails(this.filteredItems[this.selectedItemIndex]);
                    }
                }
            }
            
            // Enter/Space - action
            if ((e.code === "Enter" || e.code === "Space") && this.selectedItemIndex >= 0) {
                e.preventDefault();
                const item = this.filteredItems[this.selectedItemIndex];
                if (item) this.handleItemAction(item);
            }
        };
        
        window.addEventListener("keydown", handler);
        
        // Store handler reference for cleanup (if needed)
        (this as any)._keyboardHandler = handler;
    }
    
    private scrollToSelected(): void {
        if (!this.scrollViewer || this.selectedItemIndex < 0) return;
        
        const itemHeight = 70;
        const spacing = 5;
        const scrollPos = this.selectedItemIndex * (itemHeight + spacing);
        
        // Scroll to make selected item visible
        this.scrollViewer.verticalBar.value = Math.max(0, Math.min(1, scrollPos / (this.filteredItems.length * (itemHeight + spacing))));
    }
}
