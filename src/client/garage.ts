// Enhanced Garage System - покупка и улучшение корпусов, пушек и их компонентов
import { CurrencyManager } from "./currencyManager";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button, ScrollViewer } from "@babylonjs/gui";
import { Scene } from "@babylonjs/core";
import { CHASSIS_TYPES, CANNON_TYPES, type ChassisType, type CannonType } from "./tankTypes";

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
    private chatSystem: any = null; // ChatSystem будет установлен из Game
    private tankController: any = null; // TankController для применения изменений сразу
    private experienceSystem: any = null; // ExperienceSystem для опыта и показа уровней
    
    // UI Elements
    private garageContainer: Rectangle | null = null;
    private categoryButtons: Button[] = [];
    private itemList: Rectangle | null = null;
    private scrollViewer: ScrollViewer | null = null;
    private comparisonPanel: Rectangle | null = null; // Панель сравнения
    
    // Current category
    private currentCategory: "chassis" | "turret" | "barrel" | "upgrades" = "chassis";
    
    // Current selected parts (for comparison)
    private currentChassisId: string = "medium";
    private currentCannonId: string = "standard";
    
    // Preview selected parts (before applying)
    private previewChassisId: string | null = null;
    private previewCannonId: string | null = null;
    
    // Available parts - используем типы из tankTypes.ts
    private chassisParts: TankPart[] = CHASSIS_TYPES.map(chassis => {
        // Разные цены для разных корпусов
        let cost = 0;
        if (chassis.id === "light") cost = 400;
        else if (chassis.id === "medium") cost = 0; // Бесплатный
        else if (chassis.id === "heavy") cost = 600;
        else if (chassis.id === "scout") cost = 500;
        else if (chassis.id === "assault") cost = 800;
        
        return {
            id: chassis.id,
            name: chassis.name,
            description: chassis.description,
            cost: cost,
            unlocked: chassis.id === "medium" ? true : false,
            type: "chassis" as const,
            stats: {
                health: chassis.maxHealth,
                speed: chassis.moveSpeed,
                armor: chassis.maxHealth / 50
            }
        };
    });
    
    private cannonParts: TankPart[] = CANNON_TYPES.map(cannon => {
        // Разные цены для разных пушек
        let cost = 0;
        if (cannon.id === "standard") cost = 0; // Бесплатная
        else if (cannon.id === "rapid") cost = 450;
        else if (cannon.id === "heavy") cost = 600;
        else if (cannon.id === "sniper") cost = 800;
        else if (cannon.id === "gatling") cost = 550;
        
        return {
            id: cannon.id,
            name: cannon.name,
            description: cannon.description,
            cost: cost,
            unlocked: cannon.id === "standard" ? true : false,
            type: "barrel" as const,
            stats: {
                damage: cannon.damage,
                reload: cannon.cooldown
            }
        };
    });
    
    // Старые части для совместимости (можно удалить позже)
    private turretParts: TankPart[] = [];
    private barrelParts: TankPart[] = [];
    
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
    
    // Установить ссылку на ChatSystem
    setChatSystem(chatSystem: any): void {
        this.chatSystem = chatSystem;
    }
    
    // Установить ссылку на TankController
    setTankController(tankController: any): void {
        this.tankController = tankController;
    }
    
    // Установить ссылку на ExperienceSystem
    setExperienceSystem(experienceSystem: any): void {
        this.experienceSystem = experienceSystem;
    }
    
    // Загрузить прогресс из localStorage
    private loadProgress(): void {
        try {
            const saved = localStorage.getItem("tx_garage_progress");
            if (saved) {
                const progress = JSON.parse(saved);
                // Обновляем разблокированные части
                [...this.chassisParts, ...this.cannonParts].forEach(part => {
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
            const unlocked = [...this.chassisParts, ...this.cannonParts]
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
    
    private soundManager: any = null; // SoundManager будет установлен из Game
    
    // Установить ссылку на SoundManager
    setSoundManager(soundManager: any): void {
        this.soundManager = soundManager;
    }
    
    // Открыть гараж
    open(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        this.createGarageUI();
        if (this.soundManager) {
            this.soundManager.playGarageOpen();
        }
    }
    
    // Закрыть гараж
    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        if (this.garageContainer) {
            this.garageContainer.dispose();
            this.garageContainer = null;
        }
        if (this.soundManager) {
            this.soundManager.playGarageOpen(); // Тот же звук для закрытия
        }
    }
    
    // Переключить категорию
    private switchCategory(category: "chassis" | "turret" | "barrel" | "upgrades"): void {
        this.currentCategory = category;
        this.updateItemList();
    }
    
    // Создать UI гаража
    private createGarageUI(): void {
        // Main container с улучшенным дизайном
        this.garageContainer = new Rectangle("garageMain");
        this.garageContainer.width = "800px";
        this.garageContainer.height = "600px";
        this.garageContainer.cornerRadius = 0;
        this.garageContainer.thickness = 3;
        this.garageContainer.color = "#0f0";
        this.garageContainer.background = "#001100ee"; // Полупрозрачный фон
        this.garageContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        
        // Анимация появления
        this.garageContainer.alpha = 0;
        this.guiTexture.addControl(this.garageContainer);
        
        // Плавное появление
        let alpha = 0;
        const fadeIn = () => {
            alpha += 0.1;
            if (this.garageContainer) {
                this.garageContainer.alpha = alpha;
            }
            if (alpha < 1) {
                setTimeout(fadeIn, 20);
            }
        };
        fadeIn();
        
        // Title with subtitle
        const title = new TextBlock("garageTitle");
        title.text = "ГАРАЖ";
        title.color = "#0f0";
        title.fontSize = 36;
        title.fontWeight = "bold";
        title.top = "-280px";
        this.garageContainer.addControl(title);
        
        const subtitle = new TextBlock("garageSubtitle");
        subtitle.text = "Покупка и улучшение техники";
        subtitle.color = "#0a0";
        subtitle.fontSize = 14;
        subtitle.top = "-250px";
        this.garageContainer.addControl(subtitle);
        
        // Currency display with icon
        const currencyContainer = new Rectangle("currencyContainer");
        currencyContainer.width = "200px";
        currencyContainer.height = "35px";
        currencyContainer.cornerRadius = 0;
        currencyContainer.thickness = 2;
        currencyContainer.color = "#ff0";
        currencyContainer.background = "#222200";
        currencyContainer.left = "280px";
        currencyContainer.top = "-280px";
        this.garageContainer.addControl(currencyContainer);
        
        const currencyText = new TextBlock("garageCurrency");
        currencyText.text = `$ ${this.currencyManager.getCurrency()}`;
        currencyText.color = "#ff0";
        currencyText.fontSize = 22;
        currencyText.fontWeight = "bold";
        currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        currencyContainer.addControl(currencyText);
        
        // Message display
        const messageText = new TextBlock("garageMessage");
        messageText.text = "";
        messageText.color = "#0f0";
        messageText.fontSize = 16;
        messageText.top = "-210px";
        messageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(messageText);
        
        // Category buttons
        this.createCategoryButtons();
        
        // Item list
        this.createItemList();
        
        // Comparison panel
        this.createComparisonPanel();
        
        // Apply button (применить изменения сразу)
        this.createApplyButton();
        
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
                    currencyText.text = `$ ${this.currencyManager.getCurrency()}`;
                }
            }
        }, 100);
    }
    
    // Создать кнопки категорий
    private createCategoryButtons(): void {
        const categories = [
            { name: "КОРПУСА", id: "chassis" as const },
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
    
    // Создать список товаров с прокруткой
    private createItemList(): void {
        // Контейнер для прокрутки
        this.scrollViewer = new ScrollViewer("itemScrollViewer");
        this.scrollViewer.width = "760px";
        this.scrollViewer.height = "400px";
        this.scrollViewer.cornerRadius = 0;
        this.scrollViewer.thickness = 2;
        this.scrollViewer.color = "#0a0";
        this.scrollViewer.background = "#000";
        this.scrollViewer.top = "-100px";
        this.scrollViewer.barSize = 8;
        this.scrollViewer.barColor = "#0a0";
        this.scrollViewer.thumbColor = "#0f0";
        this.garageContainer!.addControl(this.scrollViewer);
        
        // Контейнер для элементов (будет обновляться динамически)
        this.itemList = new Rectangle("itemListContainer");
        this.itemList.width = "740px";
        this.itemList.height = "1px"; // Будет обновляться
        this.itemList.cornerRadius = 0;
        this.itemList.thickness = 0;
        this.itemList.background = "#00000000";
        this.scrollViewer.addControl(this.itemList);
        
        // Загружаем текущие выбранные части
        this.currentChassisId = localStorage.getItem("selectedChassis") || "medium";
        this.currentCannonId = localStorage.getItem("selectedCannon") || "standard";
        
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
            items = this.cannonParts; // Используем новые типы пушек
        } else if (this.currentCategory === "upgrades") {
            items = this.upgrades.filter(u => u.level < u.maxLevel);
        }
        
        // Обновляем высоту контейнера
        const itemHeight = 95;
        const totalHeight = items.length * itemHeight;
        this.itemList!.height = `${totalHeight}px`;
        
        items.forEach((item, i) => {
            const itemContainer = new Rectangle(`item_${i}`);
            itemContainer.width = "720px";
            itemContainer.height = "100px"; // Увеличено для отображения опыта
            itemContainer.cornerRadius = 0;
            itemContainer.thickness = 2;
            
            // Определяем, выбран ли этот предмет
            let isSelected = false;
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.type === "chassis") {
                    isSelected = part.id === this.currentChassisId;
                } else if (part.type === "barrel") {
                    isSelected = part.id === this.currentCannonId;
                }
            }
            
            // Цвет рамки зависит от статуса
            if (isSelected) {
                itemContainer.color = "#ff0";
                itemContainer.background = "#222200";
            } else if (item.unlocked || (item as TankUpgrade).level > 0) {
                itemContainer.color = "#0f0";
                itemContainer.background = "#001100";
            } else {
                itemContainer.color = "#0a0";
                itemContainer.background = "#000500";
            }
            
            itemContainer.top = `${i * itemHeight}px`;
            this.itemList!.addControl(itemContainer);
            
            // Item name with selection indicator and level
            const nameText = new TextBlock(`itemName_${i}`);
            let namePrefix = "";
            let levelSuffix = "";
            
            if (isSelected) {
                namePrefix = "► ";
            } else if (!("level" in item) && (item as TankPart).unlocked) {
                namePrefix = "✓ ";
            }
            
            // Показываем уровень опыта для корпусов и пушек
            if (!("level" in item) && this.experienceSystem) {
                const part = item as TankPart;
                if (part.type === "chassis") {
                    const level = this.experienceSystem.getChassisLevel(part.id);
                    levelSuffix = level > 1 ? ` [Ур.${level}]` : "";
                } else if (part.type === "barrel") {
                    const level = this.experienceSystem.getCannonLevel(part.id);
                    levelSuffix = level > 1 ? ` [Ур.${level}]` : "";
                }
            }
            
            nameText.text = `${namePrefix}${item.name}${levelSuffix}`;
            nameText.color = isSelected ? "#ff0" : (item.unlocked || (item as TankUpgrade).level > 0 ? "#0f0" : "#0a0");
            nameText.fontSize = 18;
            nameText.fontWeight = "bold";
            nameText.left = "-340px";
            nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            itemContainer.addControl(nameText);
            
            // Item description with enhanced stats and experience bonuses
            const descText = new TextBlock(`itemDesc_${i}`);
            let desc = item.description;
            // Добавляем детальную статистику для корпусов и пушек
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.type === "chassis" && part.stats) {
                    const currentChassis = CHASSIS_TYPES.find(c => c.id === this.currentChassisId);
                    let baseHp = part.stats.health || 0;
                    let baseSpeed = part.stats.speed || 0;
                    
                    // Добавляем бонусы за уровень
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getChassisLevelBonus(part.id);
                        baseHp += bonus.healthBonus;
                        baseSpeed += bonus.speedBonus;
                    }
                    
                    const hpDiff = baseHp - (currentChassis?.maxHealth || 0);
                    const speedDiff = baseSpeed - (currentChassis?.moveSpeed || 0);
                    const hpSign = hpDiff > 0 ? "+" : "";
                    const speedSign = speedDiff > 0 ? "+" : "";
                    desc += ` | HP: ${baseHp}${hpSign}${hpDiff !== 0 ? hpDiff : ""} | Скорость: ${baseSpeed.toFixed(1)}${speedSign}${speedDiff !== 0 ? speedDiff.toFixed(1) : ""} | Броня: ${(part.stats.armor || 0).toFixed(1)}`;
                } else if (part.type === "barrel" && part.stats) {
                    const currentCannon = CANNON_TYPES.find(c => c.id === this.currentCannonId);
                    let baseDmg = part.stats.damage || 0;
                    let baseReload = part.stats.reload || 0;
                    
                    // Добавляем бонусы за уровень
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getCannonLevelBonus(part.id);
                        baseDmg += bonus.damageBonus;
                        baseReload -= bonus.reloadBonus; // Уменьшаем время перезарядки
                    }
                    
                    const dmgDiff = baseDmg - (currentCannon?.damage || 0);
                    const reloadDiff = (baseReload - (currentCannon?.cooldown || 0)) / 1000;
                    const dmgSign = dmgDiff > 0 ? "+" : "";
                    const reloadSign = reloadDiff < 0 ? "" : "+";
                    desc += ` | Урон: ${baseDmg}${dmgSign}${dmgDiff !== 0 ? dmgDiff : ""} | Перезарядка: ${(baseReload / 1000).toFixed(1)}с${reloadSign}${reloadDiff !== 0 ? reloadDiff.toFixed(1) : ""}`;
                }
            } else {
                // Для улучшений показываем текущий эффект
                const upgrade = item as TankUpgrade;
                if (upgrade.level > 0) {
                    desc += ` | Текущий бонус: ${upgrade.level * upgrade.value}${upgrade.stat === "reload" ? "ms" : upgrade.stat === "armor" ? "" : ""}`;
                }
            }
            descText.text = desc;
            descText.color = "#0a0";
            descText.fontSize = 11;
            descText.left = "-340px";
            descText.top = "22px";
            descText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            itemContainer.addControl(descText);
            
            // Experience bar для корпусов и пушек
            if (!("level" in item) && this.experienceSystem) {
                const part = item as TankPart;
                const expType = part.type === "chassis" ? "chassis" : "cannon";
                const expInfo = expType === "chassis" 
                    ? this.experienceSystem.getChassisExperience(part.id)
                    : this.experienceSystem.getCannonExperience(part.id);
                
                if (expInfo) {
                    const progressData = this.experienceSystem.getExperienceToNextLevel(expInfo);
                    const levelInfo = this.experienceSystem.getLevelInfo(part.id, expType);
                    
                    // Experience bar background
                    const expBarBg = new Rectangle(`expBarBg_${i}`);
                    expBarBg.width = "220px";
                    expBarBg.height = "10px";
                    expBarBg.cornerRadius = 2;
                    expBarBg.thickness = 1;
                    expBarBg.color = "#0a0";
                    expBarBg.background = "#001100";
                    expBarBg.left = "-340px";
                    expBarBg.top = "38px";
                    expBarBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    itemContainer.addControl(expBarBg);
                    
                    // Experience bar fill
                    const fillWidth = Math.max(2, progressData.progress * 218);
                    const expBarFill = new Rectangle(`expBarFill_${i}`);
                    expBarFill.width = `${fillWidth}px`;
                    expBarFill.height = "8px";
                    expBarFill.cornerRadius = 1;
                    expBarFill.thickness = 0;
                    expBarFill.background = levelInfo?.titleColor || "#0ff";
                    expBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    expBarBg.addControl(expBarFill);
                    
                    // Level and experience text
                    const expToNext = this.experienceSystem.getExpToNextLevel(part.id, expType);
                    const expText = new TextBlock(`expText_${i}`);
                    expText.text = `${levelInfo?.title || "Ур." + expInfo.level} | ${expInfo.experience} XP ${expToNext > 0 ? `(${expToNext} до ур.${expInfo.level + 1})` : "(МАКС)"}`;
                    expText.color = levelInfo?.titleColor || "#0ff";
                    expText.fontSize = 10;
                    expText.left = "-115px";
                    expText.top = "38px";
                    expText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    itemContainer.addControl(expText);
                    
                    // Stats text (kills, damage, etc)
                    const statsText = new TextBlock(`statsText_${i}`);
                    statsText.text = `Убийств: ${expInfo.kills} | Урон: ${Math.round(expInfo.damageDealt)}`;
                    statsText.color = "#888";
                    statsText.fontSize = 9;
                    statsText.left = "-340px";
                    statsText.top = "52px";
                    statsText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    itemContainer.addControl(statsText);
                }
            }
            
            // Cost or level with enhanced display
            const costText = new TextBlock(`itemCost_${i}`);
            if ("level" in item) {
                const upgrade = item as TankUpgrade;
                const canAfford = this.currencyManager.canAfford(upgrade.cost);
                costText.text = `Уровень: ${upgrade.level}/${upgrade.maxLevel} | Цена: ${upgrade.cost}`;
                costText.color = canAfford ? "#ff0" : "#666";
            } else {
                const part = item as TankPart;
                if (part.unlocked) {
                    costText.text = isSelected ? "ВЫБРАНО" : "КУПЛЕНО";
                    costText.color = isSelected ? "#ff0" : "#0f0";
                } else {
                    const canAfford = this.currencyManager.canAfford(part.cost);
                    costText.text = `Цена: ${part.cost}`;
                    costText.color = canAfford ? "#ff0" : "#666";
                }
            }
            costText.fontSize = 13;
            costText.fontWeight = "bold";
            costText.left = "280px";
            costText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            itemContainer.addControl(costText);
            
            // Buy/Upgrade button - улучшенная визуализация
            if (!("level" in item) || (item as TankUpgrade).level < (item as TankUpgrade).maxLevel) {
                const canAfford = this.currencyManager.canAfford(item.cost);
                const partUnlocked = !("level" in item) && (item as TankPart).unlocked;
                const buyBtn = Button.CreateSimpleButton(`buy_${i}`, "level" in item ? "УЛУЧШИТЬ" : partUnlocked ? "КУПЛЕНО" : "КУПИТЬ");
                buyBtn.width = "110px";
                buyBtn.height = "45px";
                
                if (partUnlocked) {
                    buyBtn.color = "#0a0";
                    buyBtn.background = "#001100";
                    buyBtn.isEnabled = false;
                } else {
                    buyBtn.color = canAfford ? "#0f0" : "#666";
                    buyBtn.background = canAfford ? "#002200" : "#001100";
                    buyBtn.isEnabled = canAfford;
                }
                
                buyBtn.thickness = 2;
                buyBtn.fontSize = 13;
                buyBtn.fontWeight = "bold";
                buyBtn.left = "300px";
                buyBtn.top = "20px";
                
                if (canAfford && !partUnlocked) {
                    buyBtn.onPointerClickObservable.add(() => {
                        this.purchaseItem(item);
                    });
                }
                itemContainer.addControl(buyBtn);
            }
            
            // Select button для разблокированных корпусов и пушек - улучшенная визуализация
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.unlocked && (part.type === "chassis" || part.type === "barrel")) {
                    const selectBtn = Button.CreateSimpleButton(`select_${i}`, isSelected ? "ВЫБРАНО" : "ВЫБРАТЬ");
                    selectBtn.width = "110px";
                    selectBtn.height = "45px";
                    selectBtn.color = isSelected ? "#ff0" : "#0ff";
                    selectBtn.background = isSelected ? "#222200" : "#002222";
                    selectBtn.thickness = 2;
                    selectBtn.fontSize = 13;
                    selectBtn.fontWeight = "bold";
                    selectBtn.left = "180px";
                    selectBtn.top = "20px";
                    selectBtn.onPointerClickObservable.add(() => {
                        this.selectPart(part);
                        // Обновляем текущие выбранные части
                        if (part.type === "chassis") {
                            this.currentChassisId = part.id;
                            this.previewChassisId = part.id;
                        } else if (part.type === "barrel") {
                            this.currentCannonId = part.id;
                            this.previewCannonId = part.id;
                        }
                        this.updateItemList(); // Обновляем чтобы показать "ВЫБРАНО"
                        this.updateComparisonPanel(); // Обновляем панель сравнения
                    });
                    itemContainer.addControl(selectBtn);
                }
            }
        });
    }
    
    // Покупка/улучшение предмета
    private purchaseItem(item: TankPart | TankUpgrade): void {
        if (!this.currencyManager.canAfford(item.cost)) {
            console.log("[Garage] Not enough currency!");
            // Показываем сообщение игроку
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "Недостаточно кредитов!";
                msg.color = "#f00";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 2000);
            }
            return;
        }
        
            if (this.currencyManager.spendCurrency(item.cost)) {
                // Звук покупки
                if (this.soundManager) {
                    this.soundManager.playPurchase();
                }
                
                if ("level" in item) {
                    // Upgrade
                    const upgrade = item as TankUpgrade;
                    upgrade.level++;
                    console.log(`[Garage] Upgraded ${upgrade.name} to level ${upgrade.level}`);
                    
                    // Показываем сообщение
                    const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
                    if (msg) {
                        msg.text = `Улучшено: ${upgrade.name} (Уровень ${upgrade.level})`;
                        msg.color = "#0f0";
                        setTimeout(() => {
                            if (msg) msg.text = "";
                        }, 2000);
                    }
                    if (this.chatSystem) {
                        this.chatSystem.success(`Улучшено: ${upgrade.name} (Уровень ${upgrade.level})`);
                    }
                } else {
                    // Unlock part
                    const part = item as TankPart;
                    part.unlocked = true;
                    console.log(`[Garage] Unlocked ${part.name}`);
                    
                    // Показываем сообщение
                    const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
                    if (msg) {
                        msg.text = `Куплено: ${part.name}`;
                        msg.color = "#0f0";
                        setTimeout(() => {
                            if (msg) msg.text = "";
                        }, 2000);
                    }
                    if (this.chatSystem) {
                        this.chatSystem.economy(`Куплено: ${part.name}`);
                    }
                }
            
            this.saveProgress();
            this.updateItemList();
            // Update currency display
            const currencyText = this.garageContainer!.getChildByName("garageCurrency") as TextBlock;
            if (currencyText) {
                currencyText.text = `$ ${this.currencyManager.getCurrency()}`;
            }
        }
    }
    
    // Выбрать корпус или пушку (предпросмотр, без применения)
    private selectPart(part: TankPart): void {
        if (part.type === "chassis") {
            this.previewChassisId = part.id;
            console.log(`[Garage] Preview chassis: ${part.name}`);
            
            // Показываем сообщение
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = `Выбран корпус: ${part.name} (нажмите "ПРИМЕНИТЬ" для применения)`;
                msg.color = "#0ff";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 3000);
            }
            if (this.chatSystem) {
                this.chatSystem.info(`Выбран корпус: ${part.name}`);
            }
        } else if (part.type === "barrel") {
            this.previewCannonId = part.id;
            console.log(`[Garage] Preview cannon: ${part.name}`);
            
            // Показываем сообщение
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = `Выбрана пушка: ${part.name} (нажмите "ПРИМЕНИТЬ" для применения)`;
                msg.color = "#0ff";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 3000);
            }
            if (this.chatSystem) {
                this.chatSystem.info(`Выбрана пушка: ${part.name}`);
            }
        }
        
        // Звук выбора
        if (this.soundManager) {
            this.soundManager.playSelect();
        }
    }
    
    // Применить выбранные изменения
    private applySelection(): void {
        let applied = false;
        
        if (this.previewChassisId && this.previewChassisId !== this.currentChassisId) {
            localStorage.setItem("selectedChassis", this.previewChassisId);
            this.currentChassisId = this.previewChassisId;
            applied = true;
            
            // Применяем сразу к танку, если он жив
            if (this.tankController && this.tankController.isAlive) {
                const chassisType = CHASSIS_TYPES.find(c => c.id === this.previewChassisId);
                if (chassisType) {
                    this.tankController.chassisType = chassisType;
                    // Обновляем параметры танка
                    this.tankController.moveSpeed = chassisType.moveSpeed;
                    this.tankController.turnSpeed = chassisType.turnSpeed;
                    this.tankController.acceleration = chassisType.acceleration;
                    this.tankController.maxHealth = chassisType.maxHealth;
                    // Обновляем здоровье пропорционально
                    const healthRatio = this.tankController.currentHealth / this.tankController.maxHealth;
                    this.tankController.currentHealth = chassisType.maxHealth * healthRatio;
                    
                    if (this.chatSystem) {
                        this.chatSystem.success(`Корпус применён: ${chassisType.name}`);
                    }
                }
            }
        }
        
        if (this.previewCannonId && this.previewCannonId !== this.currentCannonId) {
            localStorage.setItem("selectedCannon", this.previewCannonId);
            this.currentCannonId = this.previewCannonId;
            applied = true;
            
            // Применяем сразу к танку, если он жив
            if (this.tankController && this.tankController.isAlive) {
                const cannonType = CANNON_TYPES.find(c => c.id === this.previewCannonId);
                if (cannonType) {
                    this.tankController.cannonType = cannonType;
                    // Обновляем параметры пушки
                    this.tankController.cooldown = cannonType.cooldown;
                    this.tankController.damage = cannonType.damage;
                    this.tankController.projectileSpeed = cannonType.projectileSpeed;
                    this.tankController.projectileSize = cannonType.projectileSize;
                    
                    if (this.chatSystem) {
                        this.chatSystem.success(`Пушка применена: ${cannonType.name}`);
                    }
                }
            }
        }
        
        if (applied) {
            // Звук применения
            if (this.soundManager) {
                this.soundManager.playPurchase();
            }
            
            // Показываем сообщение
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "Изменения применены!";
                msg.color = "#0f0";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 2000);
            }
            
            // Сбрасываем предпросмотр
            this.previewChassisId = null;
            this.previewCannonId = null;
            
            // Обновляем список
            this.updateItemList();
            this.updateComparisonPanel();
        } else {
            // Показываем сообщение, что нечего применять
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "Нет изменений для применения";
                msg.color = "#ff0";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 2000);
            }
        }
    }
    
    // Создать панель сравнения
    private createComparisonPanel(): void {
        this.comparisonPanel = new Rectangle("comparisonPanel");
        this.comparisonPanel.width = "760px";
        this.comparisonPanel.height = "120px";
        this.comparisonPanel.cornerRadius = 0;
        this.comparisonPanel.thickness = 2;
        this.comparisonPanel.color = "#0ff";
        this.comparisonPanel.background = "#001122";
        this.comparisonPanel.top = "180px";
        this.garageContainer!.addControl(this.comparisonPanel);
        
        this.updateComparisonPanel();
    }
    
    // Обновить панель сравнения
    private updateComparisonPanel(): void {
        if (!this.comparisonPanel) return;
        
        // Очищаем старые элементы
        this.comparisonPanel.getChildren().forEach(child => {
            if (child.name !== "comparisonTitle") child.dispose();
        });
        
        // Заголовок
        let title = this.comparisonPanel.getChildByName("comparisonTitle") as TextBlock;
        if (!title) {
            title = new TextBlock("comparisonTitle");
            title.text = "СРАВНЕНИЕ";
            title.color = "#0ff";
            title.fontSize = 16;
            title.fontWeight = "bold";
            title.top = "-55px";
            title.left = "-370px";
            this.comparisonPanel.addControl(title);
        }
        
        // Текущий корпус с бонусами от опыта
        const currentChassis = CHASSIS_TYPES.find(c => c.id === this.currentChassisId);
        const previewChassis = this.previewChassisId ? CHASSIS_TYPES.find(c => c.id === this.previewChassisId) : null;
        
        // Получаем бонусы от опыта
        let currentChassisBonus = { healthBonus: 0, speedBonus: 0, armorBonus: 0, title: "" };
        let previewChassisBonus = { healthBonus: 0, speedBonus: 0, armorBonus: 0, title: "" };
        let currentCannonBonus = { damageBonus: 0, reloadBonus: 0, title: "" };
        let previewCannonBonus = { damageBonus: 0, reloadBonus: 0, title: "" };
        
        if (this.experienceSystem) {
            currentChassisBonus = this.experienceSystem.getChassisLevelBonus(this.currentChassisId) || currentChassisBonus;
            if (this.previewChassisId) {
                previewChassisBonus = this.experienceSystem.getChassisLevelBonus(this.previewChassisId) || previewChassisBonus;
            }
            currentCannonBonus = this.experienceSystem.getCannonLevelBonus(this.currentCannonId) || currentCannonBonus;
            if (this.previewCannonId) {
                previewCannonBonus = this.experienceSystem.getCannonLevelBonus(this.previewCannonId) || previewCannonBonus;
            }
        }
        
        if (currentChassis) {
            const totalHp = currentChassis.maxHealth + currentChassisBonus.healthBonus;
            const totalSpeed = currentChassis.moveSpeed + currentChassisBonus.speedBonus;
            const expBonusText = currentChassisBonus.healthBonus > 0 ? ` (+${currentChassisBonus.healthBonus} XP)` : "";
            const speedBonusText = currentChassisBonus.speedBonus > 0 ? ` (+${currentChassisBonus.speedBonus.toFixed(1)} XP)` : "";
            
            const currentText = new TextBlock("currentChassis");
            currentText.text = `Текущий: ${currentChassis.name} [${currentChassisBonus.title || "Ур.1"}] | HP: ${totalHp}${expBonusText} | Скорость: ${totalSpeed.toFixed(1)}${speedBonusText}`;
            currentText.color = "#0a0";
            currentText.fontSize = 11;
            currentText.top = "-35px";
            currentText.left = "-370px";
            this.comparisonPanel.addControl(currentText);
            
            if (previewChassis && previewChassis.id !== currentChassis.id) {
                const previewTotalHp = previewChassis.maxHealth + previewChassisBonus.healthBonus;
                const previewTotalSpeed = previewChassis.moveSpeed + previewChassisBonus.speedBonus;
                const hpDiff = previewTotalHp - totalHp;
                const speedDiff = previewTotalSpeed - totalSpeed;
                
                const previewText = new TextBlock("previewChassis");
                previewText.text = `Новый: ${previewChassis.name} [${previewChassisBonus.title || "Ур.1"}] | HP: ${previewTotalHp} (${hpDiff > 0 ? "+" : ""}${hpDiff}) | Скорость: ${previewTotalSpeed.toFixed(1)} (${speedDiff > 0 ? "+" : ""}${speedDiff.toFixed(1)})`;
                previewText.color = "#0ff";
                previewText.fontSize = 11;
                previewText.top = "-15px";
                previewText.left = "-370px";
                this.comparisonPanel.addControl(previewText);
            }
        }
        
        // Текущая пушка с бонусами от опыта
        const currentCannon = CANNON_TYPES.find(c => c.id === this.currentCannonId);
        const previewCannon = this.previewCannonId ? CANNON_TYPES.find(c => c.id === this.previewCannonId) : null;
        
        if (currentCannon) {
            const totalDmg = currentCannon.damage + currentCannonBonus.damageBonus;
            const totalReload = Math.max(300, currentCannon.cooldown - currentCannonBonus.reloadBonus);
            const dmgBonusText = currentCannonBonus.damageBonus > 0 ? ` (+${currentCannonBonus.damageBonus} XP)` : "";
            const reloadBonusText = currentCannonBonus.reloadBonus > 0 ? ` (-${currentCannonBonus.reloadBonus}ms XP)` : "";
            
            const currentText = new TextBlock("currentCannon");
            currentText.text = `Текущая: ${currentCannon.name} [${currentCannonBonus.title || "Ур.1"}] | Урон: ${totalDmg}${dmgBonusText} | Перезарядка: ${(totalReload / 1000).toFixed(2)}с${reloadBonusText}`;
            currentText.color = "#0a0";
            currentText.fontSize = 11;
            currentText.top = "10px";
            currentText.left = "-370px";
            this.comparisonPanel.addControl(currentText);
            
            if (previewCannon && previewCannon.id !== currentCannon.id) {
                const previewTotalDmg = previewCannon.damage + previewCannonBonus.damageBonus;
                const previewTotalReload = Math.max(300, previewCannon.cooldown - previewCannonBonus.reloadBonus);
                const dmgDiff = previewTotalDmg - totalDmg;
                const reloadDiff = (previewTotalReload - totalReload) / 1000;
                
                const previewText = new TextBlock("previewCannon");
                previewText.text = `Новая: ${previewCannon.name} [${previewCannonBonus.title || "Ур.1"}] | Урон: ${previewTotalDmg} (${dmgDiff > 0 ? "+" : ""}${dmgDiff}) | Перезарядка: ${(previewTotalReload / 1000).toFixed(2)}с (${reloadDiff < 0 ? "" : "+"}${reloadDiff.toFixed(2)})`;
                previewText.color = "#0ff";
                previewText.fontSize = 11;
                previewText.top = "30px";
                previewText.left = "-370px";
                this.comparisonPanel.addControl(previewText);
            }
        }
        
        // Показываем панель только если есть изменения
        const hasChanges = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                          (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
        this.comparisonPanel.isVisible = hasChanges;
    }
    
    // Создать кнопку применения
    private createApplyButton(): void {
        const applyBtn = Button.CreateSimpleButton("applySelection", "ПРИМЕНИТЬ ИЗМЕНЕНИЯ");
        applyBtn.width = "200px";
        applyBtn.height = "45px";
        applyBtn.color = "#0f0";
        applyBtn.background = "#002200";
        applyBtn.thickness = 2;
        applyBtn.fontSize = 15;
        applyBtn.fontWeight = "bold";
        applyBtn.top = "310px";
        applyBtn.left = "-100px";
        applyBtn.onPointerClickObservable.add(() => {
            this.applySelection();
        });
        this.garageContainer!.addControl(applyBtn);
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

