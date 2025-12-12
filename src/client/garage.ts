// Garage System - HTML/CSS based UI for reliability
import { CurrencyManager } from "./currencyManager";
import { Scene } from "@babylonjs/core";
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
    
    // HTML Elements
    private overlay: HTMLDivElement | null = null;
    
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
    
    // ============ DATA ============
    private chassisParts: TankPart[] = CHASSIS_TYPES.map(chassis => {
        const costs: Record<string, number> = { light: 400, medium: 0, heavy: 600, scout: 500, assault: 800 };
        return {
            id: chassis.id, name: chassis.name, description: chassis.description,
            cost: costs[chassis.id] || 0, unlocked: chassis.id === "medium",
            type: "chassis" as const,
            stats: { health: chassis.maxHealth, speed: chassis.moveSpeed, armor: chassis.maxHealth / 50 }
        };
    });
    
    private cannonParts: TankPart[] = CANNON_TYPES.map(cannon => {
        const costs: Record<string, number> = { standard: 0, rapid: 450, heavy: 600, sniper: 800, gatling: 550 };
        return {
            id: cannon.id, name: cannon.name, description: cannon.description,
            cost: costs[cannon.id] || 0, unlocked: cannon.id === "standard",
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
            }
            .garage-container {
                width: 1100px;
                height: 700px;
                background: rgba(5, 15, 5, 0.98);
                border: 2px solid #0f0;
                display: flex;
                flex-direction: column;
            }
            .garage-header {
                height: 50px;
                background: rgba(0, 30, 0, 0.9);
                border-bottom: 2px solid #0f0;
                display: flex;
                align-items: center;
                padding: 0 20px;
                justify-content: space-between;
            }
            .garage-title {
                color: #0f0;
                font-size: 24px;
                font-weight: bold;
            }
            .garage-currency {
                color: #ff0;
                font-size: 18px;
                background: rgba(0,0,0,0.5);
                padding: 5px 15px;
                border: 1px solid #ff0;
            }
            .garage-close {
                color: #f00;
                font-size: 24px;
                cursor: pointer;
                padding: 5px 10px;
                border: 1px solid #f00;
                background: transparent;
            }
            .garage-close:hover { background: rgba(255,0,0,0.3); }
            .garage-tabs {
                height: 40px;
                background: rgba(0, 20, 0, 0.8);
                display: flex;
                border-bottom: 1px solid #080;
            }
            .garage-tab {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #080;
                font-size: 12px;
                cursor: pointer;
                border-right: 1px solid #040;
                transition: all 0.2s;
            }
            .garage-tab:hover { background: rgba(0,255,0,0.1); color: #0f0; }
            .garage-tab.active { background: rgba(0,255,0,0.2); color: #0f0; font-weight: bold; }
            .garage-content {
                flex: 1;
                display: flex;
                overflow: hidden;
            }
            .garage-left {
                width: 45%;
                border-right: 1px solid #080;
                display: flex;
                flex-direction: column;
            }
            .garage-search {
                padding: 10px;
                border-bottom: 1px solid #040;
            }
            .garage-search input {
                width: 100%;
                background: rgba(0,0,0,0.5);
                border: 1px solid #0aa;
                color: #0f0;
                padding: 8px;
                font-family: inherit;
                font-size: 12px;
            }
            .garage-filters {
                padding: 5px 10px;
                display: flex;
                gap: 5px;
                border-bottom: 1px solid #040;
            }
            .garage-filter-btn {
                padding: 4px 12px;
                background: rgba(0,0,0,0.5);
                border: 1px solid #080;
                color: #080;
                cursor: pointer;
                font-size: 10px;
            }
            .garage-filter-btn.active { border-color: #0f0; color: #0f0; background: rgba(0,255,0,0.2); }
            .garage-items {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }
            .garage-item {
                padding: 12px;
                margin-bottom: 8px;
                background: rgba(0,0,0,0.4);
                border: 1px solid #040;
                cursor: pointer;
                transition: all 0.2s;
            }
            .garage-item:hover { border-color: #0a0; background: rgba(0,255,0,0.05); }
            .garage-item.selected { border-color: #0f0; background: rgba(0,255,0,0.15); }
            .garage-item.equipped { border-color: #0ff; }
            .garage-item-name { color: #0f0; font-size: 14px; font-weight: bold; }
            .garage-item-desc { color: #080; font-size: 11px; margin-top: 4px; }
            .garage-item-stats { color: #0aa; font-size: 10px; margin-top: 6px; }
            .garage-item-price { color: #ff0; font-size: 12px; float: right; }
            .garage-item.owned .garage-item-price { color: #0f0; }
            .garage-right {
                width: 55%;
                display: flex;
                flex-direction: column;
                padding: 10px;
            }
            .garage-preview {
                height: 45%;
                background: rgba(0,20,0,0.5);
                border: 1px solid #080;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
            }
            .garage-preview-title { color: #080; font-size: 10px; }
            .garage-preview-info { color: #0f0; font-size: 16px; margin: 10px 0; }
            .garage-details {
                flex: 1;
                background: rgba(0,0,0,0.3);
                border: 1px solid #080;
                padding: 15px;
                overflow-y: auto;
            }
            .garage-details-title { color: #0f0; font-size: 16px; font-weight: bold; margin-bottom: 10px; }
            .garage-details-desc { color: #0a0; font-size: 12px; margin-bottom: 15px; }
            .garage-stats-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #030; }
            .garage-stat-name { color: #0aa; }
            .garage-stat-value { color: #0f0; }
            .garage-stat-change.positive { color: #0f0; }
            .garage-stat-change.negative { color: #f00; }
            .garage-action-btn {
                width: 100%;
                padding: 12px;
                margin-top: 15px;
                background: rgba(0,255,0,0.2);
                border: 2px solid #0f0;
                color: #0f0;
                font-size: 14px;
                font-weight: bold;
                cursor: pointer;
                font-family: inherit;
            }
            .garage-action-btn:hover { background: rgba(0,255,0,0.3); }
            .garage-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .garage-footer {
                height: 35px;
                background: rgba(0, 20, 0, 0.8);
                border-top: 1px solid #080;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #060;
                font-size: 10px;
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
        
        this.isOpen = true;
        this.currentChassisId = localStorage.getItem("selectedChassis") || "medium";
        this.currentCannonId = localStorage.getItem("selectedCannon") || "standard";
        
        this.createUI();
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        console.log("[Garage] Opened");
    }
    
    close(): void {
        if (!this.isOpen) return;
        console.log("[Garage] Closing...");
        
        this.isOpen = false;
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
        
        if (this.soundManager?.playGarageOpen) this.soundManager.playGarageOpen();
        console.log("[Garage] Closed");
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
        }
        
        // Update currency
        const currencyEl = this.overlay?.querySelector('.garage-currency');
        if (currencyEl) currencyEl.textContent = `CR: ${this.currencyManager.getCurrency()}`;
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
        const owned = isUpgrade ? true : (item as TankPart).unlocked;
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
        if ('level' in item) return '';
        
        const part = item as TankPart;
        let rows = '';
        
        if (part.type === 'chassis') {
            const current = getChassisById(this.currentChassisId);
            const next = getChassisById(part.id);
            const hpDiff = next.maxHealth - current.maxHealth;
            const spdDiff = next.moveSpeed - current.moveSpeed;
            rows = `
                <div class="garage-stats-row"><span class="garage-stat-name">HP</span><span class="garage-stat-value">${current.maxHealth} → ${next.maxHealth} <span class="garage-stat-change ${hpDiff >= 0 ? 'positive' : 'negative'}">(${hpDiff >= 0 ? '+' : ''}${hpDiff})</span></span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Speed</span><span class="garage-stat-value">${current.moveSpeed} → ${next.moveSpeed} <span class="garage-stat-change ${spdDiff >= 0 ? 'positive' : 'negative'}">(${spdDiff >= 0 ? '+' : ''}${spdDiff})</span></span></div>
            `;
        } else if (part.type === 'barrel') {
            const current = getCannonById(this.currentCannonId);
            const next = getCannonById(part.id);
            const dmgDiff = next.damage - current.damage;
            const rldDiff = next.cooldown - current.cooldown;
            rows = `
                <div class="garage-stats-row"><span class="garage-stat-name">Damage</span><span class="garage-stat-value">${current.damage} → ${next.damage} <span class="garage-stat-change ${dmgDiff >= 0 ? 'positive' : 'negative'}">(${dmgDiff >= 0 ? '+' : ''}${dmgDiff})</span></span></div>
                <div class="garage-stats-row"><span class="garage-stat-name">Reload</span><span class="garage-stat-value">${current.cooldown}ms → ${next.cooldown}ms <span class="garage-stat-change ${rldDiff <= 0 ? 'positive' : 'negative'}">(${rldDiff >= 0 ? '+' : ''}${rldDiff})</span></span></div>
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
