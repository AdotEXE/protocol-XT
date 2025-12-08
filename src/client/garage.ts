// Garage System - покупка и улучшение корпусов, пушек и их компонентов
import { CurrencyManager } from "./currencyManager";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button } from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";

export interface TankUpgrade {
    id: string;
    name: string;
    description: string;
    cost: number;
    level: number;
    maxLevel: number;
    stat: "health" | "speed" | "armor" | "firepower" | "reload" | "damage";
    value: number; // Значение улучшения
}

export interface TankPart {
    id: string;
    name: string;
    description: string;
    cost: number;
    unlocked: boolean;
    type: "chassis" | "turret" | "barrel" | "engine";
    stats: {
        health?: number;
        speed?: number;
        armor?: number;
        firepower?: number;
        reload?: number;
        damage?: number;
    };
}

export class Garage {
    private scene: Scene;
    private guiTexture: AdvancedDynamicTexture;
    private currencyManager: CurrencyManager;
    private isOpen: boolean = false;
    
    // UI Elements
    private garageContainer: Rectangle | null = null;
    private categoryButtons: Button[] = [];
    private itemList: Rectangle | null = null;
    
    // Current category
    private currentCategory: "chassis" | "turret" | "barrel" | "upgrades" = "chassis";
    
    // Available parts and upgrades
    private chassisParts: TankPart[] = [
        { id: "basic", name: "Базовый корпус", description: "Стандартный корпус", cost: 0, unlocked: true, type: "chassis", stats: { health: 100, speed: 12, armor: 1 } },
        { id: "heavy", name: "Тяжёлый корпус", description: "Больше здоровья и брони", cost: 500, unlocked: false, type: "chassis", stats: { health: 150, speed: 10, armor: 2 } },
        { id: "light", name: "Лёгкий корпус", description: "Быстрее, но слабее", cost: 400, unlocked: false, type: "chassis", stats: { health: 80, speed: 16, armor: 0.5 } },
        { id: "assault", name: "Штурмовой корпус", description: "Баланс скорости и защиты", cost: 600, unlocked: false, type: "chassis", stats: { health: 120, speed: 14, armor: 1.5 } }
    ];
    
    private turretParts: TankPart[] = [
        { id: "basic", name: "Базовая башня", description: "Стандартная башня", cost: 0, unlocked: true, type: "turret", stats: { firepower: 1, reload: 2000 } },
        { id: "rapid", name: "Скорострельная башня", description: "Быстрая перезарядка", cost: 450, unlocked: false, type: "turret", stats: { firepower: 1, reload: 1500 } },
        { id: "heavy", name: "Тяжёлая башня", description: "Больше урона", cost: 550, unlocked: false, type: "turret", stats: { firepower: 1.5, reload: 2500 } },
        { id: "sniper", name: "Снайперская башня", description: "Максимальный урон", cost: 700, unlocked: false, type: "turret", stats: { firepower: 2, reload: 3000 } }
    ];
    
    private barrelParts: TankPart[] = [
        { id: "basic", name: "Базовое орудие", description: "Стандартное орудие", cost: 0, unlocked: true, type: "barrel", stats: { damage: 25 } },
        { id: "long", name: "Длинное орудие", description: "Больше дальность и урон", cost: 350, unlocked: false, type: "barrel", stats: { damage: 35 } },
        { id: "cannon", name: "Пушка", description: "Максимальный урон", cost: 500, unlocked: false, type: "barrel", stats: { damage: 50 } }
    ];
    
    private upgrades: TankUpgrade[] = [
        { id: "health_1", name: "Улучшение здоровья +20", description: "Увеличивает здоровье", cost: 200, level: 0, maxLevel: 5, stat: "health", value: 20 },
        { id: "speed_1", name: "Улучшение скорости +2", description: "Увеличивает скорость", cost: 250, level: 0, maxLevel: 5, stat: "speed", value: 2 },
        { id: "armor_1", name: "Улучшение брони +0.2", description: "Увеличивает броню", cost: 300, level: 0, maxLevel: 5, stat: "armor", value: 0.2 },
        { id: "damage_1", name: "Улучшение урона +5", description: "Увеличивает урон", cost: 300, level: 0, maxLevel: 5, stat: "damage", value: 5 },
        { id: "reload_1", name: "Улучшение перезарядки -100ms", description: "Ускоряет перезарядку", cost: 350, level: 0, maxLevel: 5, stat: "reload", value: -100 }
    ];
    
    constructor(scene: Scene, currencyManager: CurrencyManager) {
        this.scene = scene;
        this.currencyManager = currencyManager;
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("GarageUI", false, scene);
        this.guiTexture.isForeground = true;
        this.loadProgress();
    }
    
    // Загрузить прогресс из localStorage
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem("tx_garage_progress");
            if (saved) {
                const progress = JSON.parse(saved);
                // Обновляем разблокированные части
                [...this.chassisParts, ...this.turretParts, ...this.barrelParts].forEach(part => {
                    if (progress.unlocked && progress.unlocked.includes(part.id)) {
                        part.unlocked = true;
                    }
                });
                // Обновляем уровни улучшений
                if (progress.upgrades) {
                    this.upgrades.forEach(upgrade => {
                        if (progress.upgrades[upgrade.id] !== undefined) {
                            upgrade.level = progress.upgrades[upgrade.id];
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("[Garage] Failed to load progress:", e);
        }
    }
    
    // Сохранить прогресс в localStorage
    private saveProgress(): void {
        try {
            const unlocked = [...this.chassisParts, ...this.turretParts, ...this.barrelParts]
                .filter(p => p.unlocked)
                .map(p => p.id);
            const upgrades: { [key: string]: number } = {};
            this.upgrades.forEach(u => {
                upgrades[u.id] = u.level;
            });
            localStorage.setItem("tx_garage_progress", JSON.stringify({ unlocked, upgrades }));
        } catch (e) {
            console.warn("[Garage] Failed to save progress:", e);
        }
    }
    
    // Открыть гараж
    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.createGarageUI();
    }
    
    // Закрыть гараж
    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.garageContainer) {
            this.garageContainer.dispose();
            this.garageContainer = null;
        }
    }
    
    // Переключить категорию
    private switchCategory(category: "chassis" | "turret" | "barrel" | "upgrades"): void {
        this.currentCategory = category;
        this.updateItemList();
    }
    
    // Создать UI гаража
    private createGarageUI(): void {
        // Main container
        this.garageContainer = new Rectangle("garageMain");
        this.garageContainer.width = "800px";
        this.garageContainer.height = "600px";
        this.garageContainer.cornerRadius = 0;
        this.garageContainer.thickness = 3;
        this.garageContainer.color = "#0f0";
        this.garageContainer.background = "#001100";
        this.garageContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.guiTexture.addControl(this.garageContainer);
        
        // Title
        const title = new TextBlock("garageTitle");
        title.text = "ГАРАЖ";
        title.color = "#0f0";
        title.fontSize = 32;
        title.fontWeight = "bold";
        title.top = "-280px";
        this.garageContainer.addControl(title);
        
        // Currency display
        const currencyText = new TextBlock("garageCurrency");
        currencyText.text = `Кредиты: ${this.currencyManager.getCurrency()}`;
        currencyText.color = "#ff0";
        currencyText.fontSize = 20;
        currencyText.top = "-240px";
        this.garageContainer.addControl(currencyText);
        
        // Category buttons
        this.createCategoryButtons();
        
        // Item list
        this.createItemList();
        
        // Close button
        const closeBtn = Button.CreateSimpleButton("closeGarage", "ЗАКРЫТЬ [ESC]");
        closeBtn.width = "150px";
        closeBtn.height = "40px";
        closeBtn.color = "#0f0";
        closeBtn.background = "#000";
        closeBtn.thickness = 2;
        closeBtn.fontSize = 16;
        closeBtn.top = "270px";
        closeBtn.onPointerClickObservable.add(() => {
            this.close();
        });
        this.garageContainer.addControl(closeBtn);
        
        // Update currency display periodically
        setInterval(() => {
            if (this.isOpen && this.garageContainer) {
                const currencyText = this.garageContainer.getChildByName("garageCurrency") as TextBlock;
                if (currencyText) {
                    currencyText.text = `Кредиты: ${this.currencyManager.getCurrency()}`;
                }
            }
        }, 100);
    }
    
    // Создать кнопки категорий
    private createCategoryButtons(): void {
        const categories = [
            { name: "КОРПУСА", id: "chassis" as const },
            { name: "БАШНИ", id: "turret" as const },
            { name: "ОРУДИЯ", id: "barrel" as const },
            { name: "УЛУЧШЕНИЯ", id: "upgrades" as const }
        ];
        
        categories.forEach((cat, i) => {
            const btn = Button.CreateSimpleButton(`cat_${cat.id}`, cat.name);
            btn.width = "180px";
            btn.height = "40px";
            btn.color = this.currentCategory === cat.id ? "#0f0" : "#0a0";
            btn.background = this.currentCategory === cat.id ? "#002200" : "#000";
            btn.thickness = 2;
            btn.fontSize = 14;
            btn.left = `${-270 + i * 180}px`;
            btn.top = "-180px";
            btn.onPointerClickObservable.add(() => {
                this.switchCategory(cat.id);
                // Update button colors
                this.categoryButtons.forEach(b => {
                    const btnId = (b as any).name;
                    if (btnId === `cat_${cat.id}`) {
                        b.color = "#0f0";
                        b.background = "#002200";
                    } else {
                        b.color = "#0a0";
                        b.background = "#000";
                    }
                });
            });
            this.categoryButtons.push(btn);
            this.garageContainer!.addControl(btn);
        });
    }
    
    // Создать список товаров
    private createItemList(): void {
        this.itemList = new Rectangle("itemList");
        this.itemList.width = "760px";
        this.itemList.height = "400px";
        this.itemList.cornerRadius = 0;
        this.itemList.thickness = 2;
        this.itemList.color = "#0a0";
        this.itemList.background = "#000";
        this.itemList.top = "-100px";
        this.garageContainer!.addControl(this.itemList);
        
        this.updateItemList();
    }
    
    // Обновить список товаров
    private updateItemList(): void {
        if (!this.itemList) return;
        
        // Clear existing items
        this.itemList.getChildren().forEach(child => child.dispose());
        
        let items: (TankPart | TankUpgrade)[] = [];
        
        if (this.currentCategory === "chassis") {
            items = this.chassisParts;
        } else if (this.currentCategory === "turret") {
            items = this.turretParts;
        } else if (this.currentCategory === "barrel") {
            items = this.barrelParts;
        } else if (this.currentCategory === "upgrades") {
            items = this.upgrades.filter(u => u.level < u.maxLevel);
        }
        
        items.forEach((item, i) => {
            const itemContainer = new Rectangle(`item_${i}`);
            itemContainer.width = "740px";
            itemContainer.height = "80px";
            itemContainer.cornerRadius = 0;
            itemContainer.thickness = 1;
            itemContainer.color = item.unlocked || (item as TankUpgrade).level > 0 ? "#0f0" : "#0a0";
            itemContainer.background = "#001100";
            itemContainer.top = `${-190 + i * 90}px`;
            this.itemList!.addControl(itemContainer);
            
            // Item name
            const nameText = new TextBlock(`itemName_${i}`);
            nameText.text = item.name;
            nameText.color = item.unlocked || (item as TankUpgrade).level > 0 ? "#0f0" : "#0a0";
            nameText.fontSize = 18;
            nameText.fontWeight = "bold";
            nameText.left = "-350px";
            nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            itemContainer.addControl(nameText);
            
            // Item description
            const descText = new TextBlock(`itemDesc_${i}`);
            descText.text = item.description;
            descText.color = "#0a0";
            descText.fontSize = 12;
            descText.left = "-350px";
            descText.top = "20px";
            descText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            itemContainer.addControl(descText);
            
            // Cost or level
            const costText = new TextBlock(`itemCost_${i}`);
            if ("level" in item) {
                const upgrade = item as TankUpgrade;
                costText.text = `Уровень: ${upgrade.level}/${upgrade.maxLevel} | Цена: ${upgrade.cost}`;
            } else {
                const part = item as TankPart;
                costText.text = part.unlocked ? "КУПЛЕНО" : `Цена: ${part.cost}`;
            }
            costText.color = "#ff0";
            costText.fontSize = 14;
            costText.left = "300px";
            costText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            itemContainer.addControl(costText);
            
            // Buy/Upgrade button
            if ((item.unlocked === false || (item as TankUpgrade).level < (item as TankUpgrade).maxLevel) && 
                this.currencyManager.canAfford(item.cost)) {
                const buyBtn = Button.CreateSimpleButton(`buy_${i}`, "level" in item ? "УЛУЧШИТЬ" : "КУПИТЬ");
                buyBtn.width = "120px";
                buyBtn.height = "50px";
                buyBtn.color = "#0f0";
                buyBtn.background = "#002200";
                buyBtn.thickness = 2;
                buyBtn.fontSize = 14;
                buyBtn.left = "310px";
                buyBtn.onPointerClickObservable.add(() => {
                    this.purchaseItem(item);
                });
                itemContainer.addControl(buyBtn);
            }
        });
    }
    
    // Покупка/улучшение предмета
    private purchaseItem(item: TankPart | TankUpgrade): void {
        if (!this.currencyManager.canAfford(item.cost)) {
            console.log("[Garage] Not enough currency!");
            return;
        }
        
        if (this.currencyManager.spendCurrency(item.cost)) {
            if ("level" in item) {
                // Upgrade
                const upgrade = item as TankUpgrade;
                upgrade.level++;
                console.log(`[Garage] Upgraded ${upgrade.name} to level ${upgrade.level}`);
            } else {
                // Unlock part
                const part = item as TankPart;
                part.unlocked = true;
                console.log(`[Garage] Unlocked ${part.name}`);
            }
            
            this.saveProgress();
            this.updateItemList();
            // Update currency display
            const currencyText = this.garageContainer!.getChildByName("garageCurrency") as TextBlock;
            if (currencyText) {
                currencyText.text = `Кредиты: ${this.currencyManager.getCurrency()}`;
            }
        }
    }
    
    // Получить текущие улучшения
    getUpgrades(): { [stat: string]: number } {
        const result: { [stat: string]: number } = {};
        this.upgrades.forEach(u => {
            if (u.level > 0) {
                result[u.stat] = (result[u.stat] || 0) + u.level * u.value;
            }
        });
        return result;
    }
    
    // Проверить, открыт ли гараж
    isGarageOpen(): boolean {
        return this.isOpen;
    }
}

