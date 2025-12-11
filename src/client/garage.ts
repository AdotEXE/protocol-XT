// Enhanced Garage System - покупка и улучшение корпусов, пушек и их компонентов
import { CurrencyManager } from "./currencyManager";
import { AdvancedDynamicTexture, Rectangle, TextBlock, Control, Button, ScrollViewer, InputText } from "@babylonjs/gui";
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
    private playerProgression: any = null; // PlayerProgressionSystem для статистики игрока
    private experienceSubscription: any = null; // Подписка на изменения опыта
    
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
    
    // Фильтры и сортировка
    private searchText: string = "";
    private sortBy: "name" | "cost" | "stats" = "name";
    private filterUnlocked: boolean | null = null; // null = все, true = только разблокированные, false = только заблокированные
    private filterPrice: "all" | "cheap" | "medium" | "expensive" = "all"; // Фильтр по цене
    private searchInput: any = null;
    
    // Счётчик для обновлений
    private _updateTick: number = 0;
    
    // Интервал для периодического обновления статистики
    private _statsUpdateInterval: number | null = null;
    
    // Навигация клавиатурой
    private selectedItemIndex: number = -1;
    private filteredItems: (TankPart | TankUpgrade)[] = [];
    
    // История последних действий
    private actionHistory: Array<{ type: string, text: string, timestamp: number }> = [];
    private maxHistoryItems: number = 5;
    
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
        { id: "health_1", name: "Health +20", description: "Increases health", cost: 200, level: 0, maxLevel: 5, stat: "health", value: 20 },
        { id: "speed_1", name: "Speed +2", description: "Increases speed", cost: 250, level: 0, maxLevel: 5, stat: "speed", value: 2 },
        { id: "armor_1", name: "Armor +0.2", description: "Increases armor", cost: 300, level: 0, maxLevel: 5, stat: "armor", value: 0.2 },
        { id: "damage_1", name: "Damage +5", description: "Increases damage", cost: 300, level: 0, maxLevel: 5, stat: "damage", value: 5 },
        { id: "reload_1", name: "Reload -100ms", description: "Faster reload", cost: 350, level: 0, maxLevel: 5, stat: "reload", value: -100 }
    ];
    
    constructor(scene: Scene, currencyManager: CurrencyManager) {
        this.scene = scene;
        this.currencyManager = currencyManager;
        
        // Создаем GUI texture с высоким приоритетом
        this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("GarageUI", true, scene);
        this.guiTexture.isForeground = true;
        
        // Устанавливаем высокий приоритет для layerMask чтобы гараж был поверх всего
        if (this.guiTexture.layer) {
            this.guiTexture.layer.layerMask = 0xFFFFFFFF; // Все слои видимы
            // Добавляем слой в сцену, если его там еще нет
            if (scene.layers.indexOf(this.guiTexture.layer) === -1) {
                scene.layers.push(this.guiTexture.layer);
            }
        }
        
        // Убеждаемся, что rootContainer видим
        if (this.guiTexture.rootContainer) {
            this.guiTexture.rootContainer.isVisible = true;
            this.guiTexture.rootContainer.alpha = 1.0;
        }
        
        console.log("[Garage] GUI texture created:", {
            isForeground: this.guiTexture.isForeground,
            layerMask: this.guiTexture.layer?.layerMask,
            rootContainerVisible: this.guiTexture.rootContainer?.isVisible
        });
        
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
    
    // Установить ссылку на PlayerProgressionSystem
    setPlayerProgression(playerProgression: any): void {
        // Отписываемся от предыдущей подписки, если она была
        if (this.experienceSubscription) {
            this.experienceSubscription.remove();
            this.experienceSubscription = null;
        }
        
        this.playerProgression = playerProgression;
        
        // Подписываемся на изменения опыта
        if (playerProgression && playerProgression.onExperienceChanged) {
            console.log("[Garage] Subscribing to experience changes");
            this.experienceSubscription = playerProgression.onExperienceChanged.add((data: {
                current: number;
                required: number;
                percent: number;
                level: number;
            }) => {
                console.log("[Garage] Experience changed event received:", data);
                // Обновляем список предметов для обновления шкал опыта
                if (this.isOpen && this.itemList) {
                    this.updateItemList();
                }
                // Обновляем панель статистики игрока в гараже
                if (this.isOpen) {
                    this.updatePlayerStatsPanel();
                }
            });
        } else {
            console.warn("[Garage] Cannot subscribe to experience changes - playerProgression or onExperienceChanged is null");
        }
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
    
    // Горячие клавиши
    private setupHotkeys(): void {
        window.addEventListener("keydown", (e) => {
            if (!this.isOpen) return;
            
            // ESC - закрыть гараж
            if (e.code === "Escape") {
                e.preventDefault();
                this.close();
                return;
            }
            
            // 1, 2, 3 - переключение категорий
            if (e.code === "Digit1" || e.code === "Numpad1") {
                e.preventDefault();
                this.switchCategory("chassis");
                // Обновляем кнопки категорий
                this.categoryButtons.forEach((btn, i) => {
                    const btnId = (btn as any).name;
                    if (btnId === "cat_chassis") {
                        btn.color = "#0f0";
                        btn.background = "#002200aa";
                        btn.thickness = 3;
                        btn.fontWeight = "bold";
                    } else {
                        btn.color = "#0aa";
                        btn.background = "#000000aa";
                        btn.thickness = 2;
                        btn.fontWeight = "normal";
                    }
                });
            } else if (e.code === "Digit2" || e.code === "Numpad2") {
                e.preventDefault();
                this.switchCategory("barrel");
                this.categoryButtons.forEach((btn, i) => {
                    const btnId = (btn as any).name;
                    if (btnId === "cat_barrel") {
                        btn.color = "#0f0";
                        btn.background = "#002200aa";
                        btn.thickness = 3;
                        btn.fontWeight = "bold";
                    } else {
                        btn.color = "#0aa";
                        btn.background = "#000000aa";
                        btn.thickness = 2;
                        btn.fontWeight = "normal";
                    }
                });
            } else if (e.code === "Digit3" || e.code === "Numpad3") {
                e.preventDefault();
                this.switchCategory("upgrades");
                this.categoryButtons.forEach((btn, i) => {
                    const btnId = (btn as any).name;
                    if (btnId === "cat_upgrades") {
                        btn.color = "#0f0";
                        btn.background = "#002200aa";
                        btn.thickness = 3;
                        btn.fontWeight = "bold";
                    } else {
                        btn.color = "#0aa";
                        btn.background = "#000000aa";
                        btn.thickness = 2;
                        btn.fontWeight = "normal";
                    }
                });
            }
            
            // Enter - применить изменения
            if (e.code === "Enter") {
                e.preventDefault();
                this.applySelection();
            }
            
            // F - быстрая покупка
            if (e.code === "KeyF") {
                e.preventDefault();
                this.quickPurchase();
            }
            
            // R - сброс фильтров
            if (e.code === "KeyR") {
                e.preventDefault();
                this.searchText = "";
                this.filterUnlocked = null;
                this.filterPrice = "all";
                this.sortBy = "name";
                if (this.searchInput) {
                    if (this.searchInput.text !== undefined) {
                        this.searchInput.text = "";
                    } else if (this.searchInput.textBlock) {
                        this.searchInput.textBlock.text = "";
                    }
                }
                // Сбрасываем кнопки фильтров
                const filterAll = this.garageContainer!.getChildByName("filterAll") as Button;
                const filterOwned = this.garageContainer!.getChildByName("filterOwned") as Button;
                const filterLocked = this.garageContainer!.getChildByName("filterLocked") as Button;
                const priceAll = this.garageContainer!.getChildByName("priceAll") as Button;
                if (filterAll) { filterAll.color = "#0f0"; filterAll.background = "#002200"; }
                if (filterOwned) { filterOwned.color = "#0aa"; filterOwned.background = "#001122"; }
                if (filterLocked) { filterLocked.color = "#0aa"; filterLocked.background = "#001122"; }
                if (priceAll) { priceAll.color = "#0f0"; priceAll.background = "#002200"; }
                this.selectedItemIndex = -1;
                this.updateItemList();
            }
            
            // Стрелки вверх/вниз - навигация по предметам с улучшенной обратной связью
            if (e.code === "ArrowUp") {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = Math.max(0, this.selectedItemIndex - 1);
                    this.highlightSelectedItem();
                    this.scrollToSelectedItem();
                    // Визуальная обратная связь - мигание индикатора
                    const navHint = this.garageContainer!.getChildByName("navHint") as TextBlock;
                    if (navHint) {
                        navHint.color = "#0f0";
                        setTimeout(() => {
                            if (navHint) navHint.color = "#0dd";
                        }, 150);
                    }
                }
            } else if (e.code === "ArrowDown") {
                e.preventDefault();
                if (this.filteredItems.length > 0) {
                    this.selectedItemIndex = Math.min(this.filteredItems.length - 1, this.selectedItemIndex + 1);
                    this.highlightSelectedItem();
                    this.scrollToSelectedItem();
                    // Визуальная обратная связь - мигание индикатора
                    const navHint = this.garageContainer!.getChildByName("navHint") as TextBlock;
                    if (navHint) {
                        navHint.color = "#0f0";
                        setTimeout(() => {
                            if (navHint) navHint.color = "#0dd";
                        }, 150);
                    }
                }
            }
            
            // Space или Enter на выбранном предмете - выбрать/купить
            if ((e.code === "Space" || e.code === "Enter") && this.selectedItemIndex >= 0 && this.selectedItemIndex < this.filteredItems.length) {
                e.preventDefault();
                const item = this.filteredItems[this.selectedItemIndex];
                if (!("level" in item)) {
                    const part = item as TankPart;
                    if (part.unlocked) {
                        this.selectPart(part);
                    } else {
                        this.purchaseItem(item);
                    }
                } else {
                    this.purchaseItem(item);
                }
            }
        });
    }
    
    // Открыть гараж
    open(): void {
        if (this.isOpen) {
            console.log("[Garage] Already open, ignoring open() call");
            return;
        }
        console.log("[Garage] ===== Opening garage =====");
        console.log("[Garage] GUI texture exists:", !!this.guiTexture);
        console.log("[Garage] Scene exists:", !!this.scene);
        
        // Убеждаемся, что GUI texture существует и видим
        if (!this.guiTexture) {
            console.error("[Garage] ERROR: GUI texture not initialized!");
            return;
        }
        
        // Убеждаемся, что GUI texture видим и на переднем плане ПЕРЕД созданием UI
        this.guiTexture.isForeground = true;
        
        // Убеждаемся, что GUI texture активен
        if (this.guiTexture.rootContainer) {
            this.guiTexture.rootContainer.isVisible = true;
            this.guiTexture.rootContainer.alpha = 1.0;
        }
        
        this.isOpen = true;
        this.createGarageUI();
        
        // Убеждаемся, что гараж видим после создания
        if (this.garageContainer) {
            this.garageContainer.isVisible = true;
            this.garageContainer.alpha = 1.0;
        }
        
        // Периодическое обновление статистики в реальном времени (каждую секунду)
        if (this._statsUpdateInterval) {
            clearInterval(this._statsUpdateInterval);
        }
        this._statsUpdateInterval = setInterval(() => {
            if (this.isOpen && this.playerProgression) {
                this.updatePlayerStatsPanel();
            }
        }, 100); // Обновляем каждые 100мс для плавной анимации XP-бара
        
        // Настраиваем горячие клавиши
        this.setupHotkeys();
        
        // Обновляем статистику после создания UI (если метод существует)
        if (this.updatePlayerStatsPanel) {
            try {
                this.updatePlayerStatsPanel();
            } catch (e) {
                console.warn("[Garage] Failed to update player stats panel:", e);
            }
        }
        
        // Принудительно обновляем опыт при открытии гаража
        setTimeout(() => {
            if (this.isOpen) {
                this.updateItemList(); // Пересоздаём список с актуальными данными опыта
                // Также обновляем опыт сразу после создания списка
                if (this.updateExperienceBars) {
                    setTimeout(() => {
                        this.updateExperienceBars();
                    }, 200);
                }
            }
        }, 100);
        
        // Дополнительная проверка после создания UI
        if (this.garageContainer) {
            this.garageContainer.isVisible = true;
            this.garageContainer.alpha = 0.75; // 75% прозрачность
            console.log("[Garage] Container visibility after creation:", {
                isVisible: this.garageContainer.isVisible,
                alpha: this.garageContainer.alpha,
                width: this.garageContainer.width,
                height: this.garageContainer.height
            });
        }
        
        // Убеждаемся, что GUI texture все еще видим
        this.guiTexture.isForeground = true;
        
        console.log("[Garage] GUI texture settings:", {
            isForeground: this.guiTexture.isForeground,
            layerMask: this.guiTexture.layerMask,
            rootContainerVisible: this.guiTexture.rootContainer?.isVisible,
            rootContainerAlpha: this.guiTexture.rootContainer?.alpha
        });
        console.log("[Garage] Garage container created:", !!this.garageContainer);
        
        if (this.soundManager) {
            this.soundManager.playGarageOpen();
        }
        console.log("[Garage] ✓ Garage opened successfully");
    }
    
    // Закрыть гараж с анимацией
    close(): void {
        if (!this.isOpen) return;
        
        // Упрощенное закрытие без лишних анимаций
        if (this.garageContainer) {
            this.isOpen = false;
            this.garageContainer.dispose();
            this.garageContainer = null;
            // Останавливаем периодическое обновление статистики
            if (this._statsUpdateInterval) {
                clearInterval(this._statsUpdateInterval);
                this._statsUpdateInterval = null;
            }
            // Сбрасываем фильтры при закрытии
            this.searchText = "";
            this.filterUnlocked = null;
            this.sortBy = "name";
        } else {
            this.isOpen = false;
            // Останавливаем периодическое обновление статистики
            if (this._statsUpdateInterval) {
                clearInterval(this._statsUpdateInterval);
                this._statsUpdateInterval = null;
            }
        }
        
        if (this.soundManager) {
            this.soundManager.playGarageOpen();
        }
    }
    
    // Переключить категорию с анимацией
    private switchCategory(category: "chassis" | "turret" | "barrel" | "upgrades"): void {
        if (this.currentCategory === category) return;
        
        // Упрощенное переключение категорий без лишних анимаций
        this.currentCategory = category;
        this.selectedItemIndex = -1; // Сбрасываем выбор
        this.updateItemList();
        
        // Обновляем опыт
        if (this.itemList && this.updateExperienceBars) {
            this.itemList.alpha = 1.0;
            this.itemList.left = "0px";
            this.updateExperienceBars();
        }
        
        // Звуковой эффект переключения
        if (this.soundManager && this.soundManager.playGarageOpen) {
            this.soundManager.playGarageOpen();
        }
    }
    
    // Создать UI гаража - полностью переделанный с нуля
    private createGarageUI(): void {
        // Main container - чистая структура без лишних эффектов
        this.garageContainer = new Rectangle("garageMain");
        this.garageContainer.width = "920px";
        this.garageContainer.height = "720px";
        this.garageContainer.cornerRadius = 0;
        this.garageContainer.thickness = 2;
        this.garageContainer.color = "#0f0";
        this.garageContainer.background = "rgba(0, 0, 0, 0.9)";
        this.garageContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.garageContainer.isPointerBlocker = true;
        this.garageContainer.layerMask = 0xFFFFFFFF;
        // Гараж должен быть скрыт по умолчанию, пока не будет открыт
        this.garageContainer.alpha = 0.0;
        this.garageContainer.isVisible = false;
        this.garageContainer.zIndex = 1000;
        
        // Добавляем в GUI texture
        this.guiTexture.addControl(this.garageContainer);
        
        // ========== HEADER SECTION ==========
        // Header background - фиксированная высота 60px
        const headerBg = new Rectangle("garageHeader");
        headerBg.width = "100%";
        headerBg.height = "60px";
        headerBg.cornerRadius = 0;
        headerBg.thickness = 0;
        headerBg.background = "rgba(0, 50, 0, 0.7)";
        headerBg.top = "-360px";
        headerBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(headerBg);
        
        // Title - простой и читаемый
        const title = new TextBlock("garageTitle");
        title.text = "GARAGE";
        title.color = "#0f0";
        title.fontSize = 20;
        title.fontWeight = "bold";
        title.fontFamily = "Consolas, Monaco, monospace";
        title.top = "-340px";
        title.left = "-400px";
        title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.garageContainer.addControl(title);
        
        // Currency display - простой и читаемый
        const currencyContainer = new Rectangle("currencyContainer");
        currencyContainer.width = "180px";
        currencyContainer.height = "32px";
        currencyContainer.cornerRadius = 0;
        currencyContainer.thickness = 1;
        currencyContainer.color = "#ff0";
        currencyContainer.background = "rgba(0, 0, 0, 0.9)";
        currencyContainer.left = "360px";
        currencyContainer.top = "-338px";
        this.garageContainer.addControl(currencyContainer);
        
        const currencyLabel = new TextBlock("currencyLabel");
        currencyLabel.text = "CR:";
        currencyLabel.color = "#0ff";
        currencyLabel.fontSize = 12;
        currencyLabel.fontFamily = "Consolas, Monaco, monospace";
        currencyLabel.fontWeight = "normal";
        currencyLabel.left = "-75px";
        currencyLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        currencyContainer.addControl(currencyLabel);
        
        const currencyText = new TextBlock("garageCurrency");
        currencyText.text = `${this.currencyManager.getCurrency()}`;
        currencyText.color = "#ff0";
        currencyText.fontSize = 16;
        currencyText.fontWeight = "bold";
        currencyText.fontFamily = "Consolas, Monaco, monospace";
        currencyText.left = "10px";
        currencyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        currencyContainer.addControl(currencyText);
        
        // Player stats panel (справа от валюты) - безопасный вызов
        try {
            if (this.createPlayerStatsPanel) {
                this.createPlayerStatsPanel();
            }
        } catch (e) {
            console.warn("[Garage] Failed to create player stats panel:", e);
        }
        
        // Header separator line
        const headerLine = new Rectangle("headerLine");
        headerLine.width = "100%";
        headerLine.height = "2px";
        headerLine.cornerRadius = 0;
        headerLine.thickness = 0;
        headerLine.background = "#0f0";
        headerLine.top = "-300px";
        headerLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(headerLine);
        
        // ========== CONTENT SECTION ==========
        // Player stats panel
        try {
            if (this.createPlayerStatsPanel) {
                this.createPlayerStatsPanel();
            }
        } catch (e) {
            console.warn("[Garage] Failed to create player stats panel:", e);
        }
        
        // Quick actions
        this.createQuickActions();
        
        // Current tank preview
        try {
            if (this.createCurrentTankPreview) {
                this.createCurrentTankPreview();
            }
        } catch (e) {
            console.warn("[Garage] Failed to create current tank preview:", e);
        }
        
        // Recommendations panel
        this.createRecommendationsPanel();
        
        // Action history panel
        this.createActionHistoryPanel();
        
        // Message display - простой и читаемый
        const messageContainer = new Rectangle("messageContainer");
        messageContainer.width = "860px";
        messageContainer.height = "24px";
        messageContainer.cornerRadius = 0;
        messageContainer.thickness = 1;
        messageContainer.color = "#0f0";
        messageContainer.background = "rgba(0, 0, 0, 0.9)";
        messageContainer.top = "-210px";
        messageContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(messageContainer);
        
        const messageText = new TextBlock("garageMessage");
        messageText.text = "";
        messageText.color = "#0f0";
        messageText.fontSize = 12;
        messageText.fontFamily = "Consolas, Monaco, monospace";
        messageText.fontWeight = "normal";
        messageText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        messageContainer.addControl(messageText);
        
        // Поиск и фильтры
        this.createSearchAndFilters();
        
        // Category buttons
        this.createCategoryButtons();
        
        // Item list
        this.createItemList();
        
        // Comparison panel
        this.createComparisonPanel();
        
        // Apply button (применить изменения сразу) - улучшенный
        this.createApplyButton();
        
        // ========== FOOTER SECTION ==========
        // Footer background - фиксированная высота 50px
        const footerBg = new Rectangle("garageFooter");
        footerBg.width = "100%";
        footerBg.height = "50px";
        footerBg.cornerRadius = 0;
        footerBg.thickness = 0;
        footerBg.background = "rgba(0, 40, 0, 0.7)";
        footerBg.top = "320px";
        footerBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(footerBg);
        
        // Footer separator line
        const footerLine = new Rectangle("footerLine");
        footerLine.width = "100%";
        footerLine.height = "2px";
        footerLine.cornerRadius = 0;
        footerLine.thickness = 0;
        footerLine.background = "#0f0";
        footerLine.top = "320px";
        footerLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(footerLine);
        
        // Changes indicator - простой без лишних анимаций
        const changesIndicator = new Rectangle("changesIndicator");
        changesIndicator.width = "420px";
        changesIndicator.height = "24px";
        changesIndicator.cornerRadius = 0;
        changesIndicator.thickness = 1;
        changesIndicator.color = "#0ff";
        changesIndicator.background = "rgba(0, 0, 0, 0.9)";
        changesIndicator.top = "300px";
        changesIndicator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        changesIndicator.isVisible = false;
        this.garageContainer.addControl(changesIndicator);
        
        const changesText = new TextBlock("changesText");
        changesText.text = "> PENDING CHANGES | [Enter] to apply";
        changesText.color = "#0ff";
        changesText.fontSize = 11;
        changesText.fontFamily = "Consolas, Monaco, monospace";
        changesText.fontWeight = "bold";
        changesText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        changesIndicator.addControl(changesText);
        
        // Navigation hint - простой и читаемый
        const navHint = new TextBlock("navHint");
        navHint.text = "[Arrow Keys] Navigate | [Space/Enter] Select | [1-3] Categories | [F] Quick Buy | [R] Reset";
        navHint.color = "#0aa";
        navHint.fontSize = 10;
        navHint.fontFamily = "Consolas, Monaco, monospace";
        navHint.fontWeight = "normal";
        navHint.top = "285px";
        navHint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer.addControl(navHint);
        
        // Close button в терминальном стиле - оптимизированный
        const closeBtn = Button.CreateSimpleButton("closeGarage", "CLOSE [ESC]");
        closeBtn.width = "130px";
        closeBtn.height = "35px";
        closeBtn.cornerRadius = 0;
        closeBtn.fontFamily = "Consolas, Monaco, monospace";
        closeBtn.color = "#f00";
        closeBtn.background = "rgba(255, 0, 0, 0.2)";
        closeBtn.thickness = 1;
        closeBtn.fontSize = 11;
        closeBtn.fontWeight = "bold";
        closeBtn.top = "328px";
        closeBtn.left = "300px";
        closeBtn.isPointerBlocker = true;
        
        // Hover эффект для кнопки закрытия
        closeBtn.onPointerEnterObservable.add(() => {
            closeBtn.color = "#ff0";
            closeBtn.background = "rgba(255, 255, 0, 0.3)";
            closeBtn.thickness = 2;
        });
        closeBtn.onPointerOutObservable.add(() => {
            closeBtn.color = "#f00";
            closeBtn.background = "rgba(255, 0, 0, 0.2)";
            closeBtn.thickness = 1;
        });
        
        closeBtn.onPointerClickObservable.add(() => {
            this.close();
        });
        this.garageContainer.addControl(closeBtn);
        
        // Update changes indicator periodically
        setInterval(() => {
            if (this.isOpen && changesIndicator) {
                const hasChanges = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                                (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
                if (changesIndicator.isVisible !== hasChanges) {
                    changesIndicator.isVisible = hasChanges;
                }
            }
        }, 300);
        
        // Кнопка сброса фильтров в терминальном стиле - оптимизированная
        const resetFiltersBtn = Button.CreateSimpleButton("resetFilters", "RESET [R]");
        resetFiltersBtn.width = "100px";
        resetFiltersBtn.height = "28px";
        resetFiltersBtn.cornerRadius = 0;
        resetFiltersBtn.fontFamily = "Consolas, Monaco, monospace";
        resetFiltersBtn.color = "#0aa";
        resetFiltersBtn.background = "rgba(0, 255, 0, 0.1)";
        resetFiltersBtn.thickness = 1;
        resetFiltersBtn.fontSize = 10;
        resetFiltersBtn.top = "330px";
        resetFiltersBtn.left = "-400px";
        
        // Hover эффект для кнопки сброса
        resetFiltersBtn.onPointerEnterObservable.add(() => {
            resetFiltersBtn.color = "#0f0";
            resetFiltersBtn.background = "rgba(0, 255, 0, 0.2)";
            resetFiltersBtn.thickness = 2;
        });
        resetFiltersBtn.onPointerOutObservable.add(() => {
            resetFiltersBtn.color = "#0aa";
            resetFiltersBtn.background = "rgba(0, 255, 0, 0.1)";
            resetFiltersBtn.thickness = 1;
        });
        
        resetFiltersBtn.onPointerClickObservable.add(() => {
            this.searchText = "";
            this.filterUnlocked = null;
            this.filterPrice = "all";
            this.sortBy = "name";
            if (this.searchInput) {
                if (this.searchInput.text !== undefined) {
                    this.searchInput.text = "";
                } else if (this.searchInput.textBlock) {
                    this.searchInput.textBlock.text = "";
                }
            }
            // Сбрасываем кнопки фильтров
            const filterAll = this.garageContainer!.getChildByName("filterAll") as Button;
            const filterOwned = this.garageContainer!.getChildByName("filterOwned") as Button;
            const filterLocked = this.garageContainer!.getChildByName("filterLocked") as Button;
            const priceAll = this.garageContainer!.getChildByName("priceAll") as Button;
            if (filterAll) { filterAll.color = "#0f0"; filterAll.background = "#002200"; }
            if (filterOwned) { filterOwned.color = "#0aa"; filterOwned.background = "#001122"; }
            if (filterLocked) { filterLocked.color = "#0aa"; filterLocked.background = "#001122"; }
            if (priceAll) { priceAll.color = "#0f0"; priceAll.background = "#002200"; }
            this.selectedItemIndex = -1;
            this.updateItemList();
        });
        this.garageContainer.addControl(resetFiltersBtn);
        
        // Update currency display and stats periodically - оптимизировано
        let lastCurrencyUpdate = 0;
        let lastStatsUpdate = 0;
        let lastExpUpdate = 0;
        let lastRecUpdate = 0;
        let lastPreviewUpdate = 0;
        let lastComparisonUpdate = 0;
        
        setInterval(() => {
            if (this.isOpen && this.garageContainer) {
                const now = Date.now();
                
                // Обновляем валюту только если она изменилась (оптимизация)
                const currentCurrency = this.currencyManager.getCurrency();
                const currencyText = this.garageContainer.getChildByName("garageCurrency") as TextBlock;
                if (currencyText && now - lastCurrencyUpdate > 100) {
                    const newText = `${currentCurrency}`;
                    if (currencyText.text !== newText) {
                        currencyText.text = newText;
                        lastCurrencyUpdate = now;
                    }
                }
                
                // Обновляем статистику игрока реже (каждые 500мс)
                if (now - lastStatsUpdate > 500) {
                    try {
                        if (this.updatePlayerStatsPanel) {
                            this.updatePlayerStatsPanel();
                        }
                    } catch (e) {
                        console.warn("[Garage] Failed to update player stats panel in interval:", e);
                    }
                    lastStatsUpdate = now;
                }
                
                // Обновляем панель рекомендаций реже (каждые 2 секунды)
                if (now - lastRecUpdate > 2000) {
                    try {
                        const recPanel = this.garageContainer.getChildByName("recommendationsPanel");
                        if (recPanel) {
                            recPanel.dispose();
                            this.createRecommendationsPanel();
                        }
                    } catch (e) {
                        console.warn("[Garage] Failed to update recommendations panel:", e);
                    }
                    lastRecUpdate = now;
                }
                
                // Обновляем опыт в списке предметов (каждые 200мс для более плавной анимации)
                if (now - lastExpUpdate > 200) {
                    try {
                        this.updateExperienceBars();
                    } catch (e) {
                        console.warn("[Garage] Failed to update experience bars:", e);
                    }
                    lastExpUpdate = now;
                }
                
                // Обновляем превью текущего танка реже (каждую секунду)
                if (now - lastPreviewUpdate > 1000) {
                    try {
                        const previewContainer = this.garageContainer.getChildByName("tankPreviewContainer");
                        if (previewContainer) {
                            previewContainer.dispose();
                            this.createCurrentTankPreview();
                        }
                    } catch (e) {
                        console.warn("[Garage] Failed to update current tank preview:", e);
                    }
                    lastPreviewUpdate = now;
                }
                
                // Обновляем панель сравнения только при изменениях (каждые 300мс)
                if (now - lastComparisonUpdate > 300) {
                    try {
                        this.updateComparisonPanel();
                    } catch (e) {
                        console.warn("[Garage] Failed to update comparison panel:", e);
                    }
                    lastComparisonUpdate = now;
                }
            }
        }, 100); // Проверяем каждые 100мс, но обновляем с разной частотой для оптимизации
    }
    
    // Создать поиск и фильтры
    private createSearchAndFilters(): void {
        // Контейнер для поиска и фильтров - оптимизированный с улучшенным spacing
        const searchContainer = new Rectangle("searchContainer");
        searchContainer.width = "860px";
        searchContainer.height = "40px";
        searchContainer.cornerRadius = 0;
        searchContainer.thickness = 0;
        searchContainer.background = "#00000000";
        searchContainer.top = "-250px";
        searchContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer!.addControl(searchContainer);
        
        // Визуальный разделитель между поиском и категориями
        const categorySeparator = new Rectangle("categorySeparator");
        categorySeparator.width = "860px";
        categorySeparator.height = "1px";
        categorySeparator.cornerRadius = 0;
        categorySeparator.thickness = 0;
        categorySeparator.background = "#0aa";
        categorySeparator.top = "-195px";
        categorySeparator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer!.addControl(categorySeparator);
        
        // Поиск - единый стиль
        const searchLabel = new TextBlock("searchLabel");
        searchLabel.text = "SEARCH:";
        searchLabel.color = "#0ff";
        searchLabel.fontSize = 12;
        searchLabel.fontFamily = "Consolas, Monaco, monospace";
        searchLabel.fontWeight = "normal";
        searchLabel.left = "-420px";
        searchLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        searchContainer.addControl(searchLabel);
        
        // Поле поиска в реальном времени в терминальном стиле
        const searchInput = new InputText("searchInput");
        searchInput.width = "180px";
        searchInput.height = "26px";
        searchInput.text = this.searchText || "";
        searchInput.placeholderText = "Name...";
        searchInput.color = "#0aa";
        searchInput.background = "rgba(0, 0, 0, 0.8)";
        searchInput.focusedBackground = "rgba(0, 20, 20, 0.9)";
        searchInput.fontSize = 10;
        searchInput.fontFamily = "Consolas, Monaco, monospace";
        searchInput.thickness = 1;
        searchInput.focusedColor = "#0f0";
        searchInput.left = "-320px";
        searchInput.top = "7px";
        searchInput.onTextChangedObservable.add((text) => {
            this.searchText = text;
            this.selectedItemIndex = -1; // Сбрасываем выбор при поиске
            this.updateItemList();
        });
        searchContainer.addControl(searchInput);
        this.searchInput = searchInput;
        
        // Фильтр - единый стиль
        const filterLabel = new TextBlock("filterLabel");
        filterLabel.text = "FILTER:";
        filterLabel.color = "#0ff";
        filterLabel.fontSize = 12;
        filterLabel.fontFamily = "Consolas, Monaco, monospace";
        filterLabel.fontWeight = "normal";
        filterLabel.left = "-100px";
        filterLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        searchContainer.addControl(filterLabel);
        
        const filterAll = Button.CreateSimpleButton("filterAll", "ALL");
        filterAll.width = "55px";
        filterAll.height = "26px";
        filterAll.cornerRadius = 0;
        filterAll.fontFamily = "Consolas, Monaco, monospace";
        filterAll.color = this.filterUnlocked === null ? "#0f0" : "#0aa";
        filterAll.background = this.filterUnlocked === null ? "rgba(0, 255, 0, 0.15)" : "rgba(0, 0, 0, 0.8)";
        filterAll.thickness = 1;
        filterAll.fontSize = 10;
        filterAll.left = "-30px";
        filterAll.top = "7px";
        
        // Hover эффект для кнопки фильтра
        filterAll.onPointerEnterObservable.add(() => {
            if (this.filterUnlocked !== null) {
                filterAll.color = "#0f0";
                filterAll.background = "rgba(0, 255, 0, 0.15)";
            }
        });
        filterAll.onPointerOutObservable.add(() => {
            if (this.filterUnlocked !== null) {
                filterAll.color = "#0aa";
                filterAll.background = "rgba(0, 0, 0, 0.8)";
            }
        });
        
        filterAll.onPointerClickObservable.add(() => {
            this.filterUnlocked = null;
            filterAll.color = "#0f0";
            filterAll.background = "#002200";
            filterOwned.color = "#0aa";
            filterOwned.background = "#001122";
            filterLocked.color = "#0aa";
            filterLocked.background = "#001122";
            this.updateItemList();
        });
        searchContainer.addControl(filterAll);
        
        const filterOwned = Button.CreateSimpleButton("filterOwned", "OWNED");
        filterOwned.width = "65px";
        filterOwned.height = "26px";
        filterOwned.cornerRadius = 0;
        filterOwned.fontFamily = "Consolas, Monaco, monospace";
        filterOwned.color = this.filterUnlocked === true ? "#0f0" : "#0aa";
        filterOwned.background = this.filterUnlocked === true ? "rgba(0, 255, 0, 0.15)" : "rgba(0, 0, 0, 0.8)";
        filterOwned.thickness = 1;
        filterOwned.fontSize = 10;
        filterOwned.left = "35px";
        filterOwned.top = "7px";
        
        // Hover эффект для кнопки фильтра
        filterOwned.onPointerEnterObservable.add(() => {
            if (this.filterUnlocked !== true) {
                filterOwned.color = "#0f0";
                filterOwned.background = "rgba(0, 255, 0, 0.15)";
            }
        });
        filterOwned.onPointerOutObservable.add(() => {
            if (this.filterUnlocked !== true) {
                filterOwned.color = "#0aa";
                filterOwned.background = "rgba(0, 0, 0, 0.8)";
            }
        });
        
        filterOwned.onPointerClickObservable.add(() => {
            this.filterUnlocked = true;
            filterAll.color = "#0aa";
            filterAll.background = "#001122";
            filterOwned.color = "#0f0";
            filterOwned.background = "#002200";
            filterLocked.color = "#0aa";
            filterLocked.background = "#001122";
            this.updateItemList();
        });
        searchContainer.addControl(filterOwned);
        
        const filterLocked = Button.CreateSimpleButton("filterLocked", "LOCKED");
        filterLocked.width = "70px";
        filterLocked.height = "26px";
        filterLocked.cornerRadius = 0;
        filterLocked.fontFamily = "Consolas, Monaco, monospace";
        filterLocked.color = this.filterUnlocked === false ? "#0f0" : "#0aa";
        filterLocked.background = this.filterUnlocked === false ? "rgba(0, 255, 0, 0.15)" : "rgba(0, 0, 0, 0.8)";
        filterLocked.thickness = 1;
        filterLocked.fontSize = 10;
        filterLocked.left = "110px";
        filterLocked.top = "7px";
        
        // Hover эффект для кнопки фильтра
        filterLocked.onPointerEnterObservable.add(() => {
            if (this.filterUnlocked !== false) {
                filterLocked.color = "#0f0";
                filterLocked.background = "rgba(0, 255, 0, 0.15)";
            }
        });
        filterLocked.onPointerOutObservable.add(() => {
            if (this.filterUnlocked !== false) {
                filterLocked.color = "#0aa";
                filterLocked.background = "rgba(0, 0, 0, 0.8)";
            }
        });
        
        filterLocked.onPointerClickObservable.add(() => {
            this.filterUnlocked = false;
            filterAll.color = "#0aa";
            filterAll.background = "#001122";
            filterOwned.color = "#0aa";
            filterOwned.background = "#001122";
            filterLocked.color = "#0f0";
            filterLocked.background = "#002200";
            this.updateItemList();
        });
        searchContainer.addControl(filterLocked);
        
        // Сортировка в терминальном стиле
        const sortLabel = new TextBlock("sortLabel");
        sortLabel.text = "SORT:";
        sortLabel.color = "#0ff";
        sortLabel.fontSize = 12;
        sortLabel.fontFamily = "Consolas, Monaco, monospace";
        sortLabel.fontWeight = "normal";
        sortLabel.left = "200px";
        sortLabel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        searchContainer.addControl(sortLabel);
        
        const sortBtn = Button.CreateSimpleButton("sortBtn", this.sortBy === "name" ? "NAME" : this.sortBy === "cost" ? "COST" : "STATS");
        sortBtn.width = "70px";
        sortBtn.height = "26px";
        sortBtn.cornerRadius = 0;
        sortBtn.fontFamily = "Consolas, Monaco, monospace";
        sortBtn.color = "#0ff";
        sortBtn.background = "rgba(0, 255, 255, 0.1)";
        sortBtn.thickness = 1;
        sortBtn.fontSize = 10;
        sortBtn.left = "250px";
        sortBtn.top = "7px";
        
        // Hover эффект для кнопки сортировки
        sortBtn.onPointerEnterObservable.add(() => {
            sortBtn.color = "#0f0";
            sortBtn.background = "rgba(0, 255, 0, 0.2)";
            sortBtn.thickness = 2;
        });
        sortBtn.onPointerOutObservable.add(() => {
            sortBtn.color = "#0ff";
            sortBtn.background = "rgba(0, 255, 255, 0.1)";
            sortBtn.thickness = 1;
        });
        
        sortBtn.onPointerClickObservable.add(() => {
            // Циклическая смена: name -> cost -> stats -> name
            if (this.sortBy === "name") {
                this.sortBy = "cost";
                sortBtn.textBlock!.text = "COST";
            } else if (this.sortBy === "cost") {
                this.sortBy = "stats";
                sortBtn.textBlock!.text = "STATS";
            } else {
                this.sortBy = "name";
                sortBtn.textBlock!.text = "NAME";
            }
            this.updateItemList();
        });
        searchContainer.addControl(sortBtn);
    }
    
    // Создать кнопки категорий
    private createCategoryButtons(): void {
        const categories = [
            { name: "CHASSIS", id: "chassis" as const },
            { name: "CANNONS", id: "barrel" as const },
            { name: "UPGRADES", id: "upgrades" as const }
        ];
        
        categories.forEach((cat, i) => {
            const btn = Button.CreateSimpleButton(`cat_${cat.id}`, cat.name);
            btn.width = "160px";
            btn.height = "32px";
            btn.cornerRadius = 0; // Без скруглений
            btn.color = this.currentCategory === cat.id ? "#0f0" : "#0aa";
            btn.background = this.currentCategory === cat.id ? "rgba(0, 255, 0, 0.2)" : "rgba(0, 0, 0, 0.8)";
            btn.thickness = this.currentCategory === cat.id ? 2 : 1;
            btn.fontSize = 11;
            btn.fontFamily = "Consolas, Monaco, monospace";
            btn.fontWeight = this.currentCategory === cat.id ? "bold" : "normal";
            // Выравнивание кнопок категорий по центру с равными отступами
            const totalWidth = 160 * 3 + 20 * 2; // ширина кнопок + отступы
            const startPos = -totalWidth / 2 + 80; // центр первой кнопки
            btn.left = `${startPos + i * 180}px`; // 180 = 160 (ширина) + 20 (отступ)
            btn.top = "-200px";
            btn.isPointerBlocker = true;
            
            // Hover эффекты для кнопок категорий
            const originalColor = btn.color;
            const originalBg = btn.background;
            const originalThickness = btn.thickness;
            
            // Упрощенный hover эффект для кнопок категорий (без лишних анимаций)
            btn.onPointerEnterObservable.add(() => {
                if (this.currentCategory !== cat.id) {
                    btn.color = "#0f0";
                    btn.background = "rgba(0, 255, 0, 0.15)";
                    btn.thickness = 2;
                }
            });
            
            btn.onPointerOutObservable.add(() => {
                if (this.currentCategory !== cat.id) {
                    btn.color = originalColor;
                    btn.background = originalBg;
                    btn.thickness = originalThickness;
                }
            });
            
            btn.onPointerClickObservable.add(() => {
                this.switchCategory(cat.id);
                // Update button colors в терминальном стиле
                this.categoryButtons.forEach(b => {
                    const btnId = (b as any).name;
                    if (btnId === `cat_${cat.id}`) {
                        b.color = "#0f0";
                        b.background = "rgba(0, 255, 0, 0.2)";
                        b.thickness = 2;
                        b.fontWeight = "bold";
                    } else {
                        b.color = "#0aa";
                        b.background = "rgba(0, 0, 0, 0.8)";
                        b.thickness = 1;
                        b.fontWeight = "normal";
                    }
                });
            });
            this.categoryButtons.push(btn);
            this.garageContainer!.addControl(btn);
        });
    }
    
    // Создать список товаров с прокруткой в терминальном стиле
    private createItemList(): void {
        // Контейнер для прокрутки - оптимизированный
        this.scrollViewer = new ScrollViewer("itemScrollViewer");
        this.scrollViewer.width = "880px";
        this.scrollViewer.height = "450px";
        this.scrollViewer.cornerRadius = 0;
        this.scrollViewer.thickness = 2;
        this.scrollViewer.color = "#0f0";
        this.scrollViewer.background = "rgba(0, 0, 0, 0.9)"; // Более тёмный фон для лучшего контраста
        this.scrollViewer.top = "-60px";
        this.scrollViewer.barSize = 10;
        this.scrollViewer.barColor = "rgba(0, 255, 0, 0.15)";
        this.scrollViewer.thumbColor = "#0f0";
        this.garageContainer!.addControl(this.scrollViewer);
        
        // Разделительная линия перед списком элементов
        const listSeparator = new Rectangle("listSeparator");
        listSeparator.width = "880px";
        listSeparator.height = "1px";
        listSeparator.cornerRadius = 0;
        listSeparator.thickness = 0;
        listSeparator.background = "#0aa";
        listSeparator.top = "-65px";
        listSeparator.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer!.addControl(listSeparator);
        
        // Контейнер для элементов (будет обновляться динамически) - улучшенный
        this.itemList = new Rectangle("itemListContainer");
        this.itemList.width = "860px";
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
        if (this.itemList.children) {
            this.itemList.children.forEach((child: any) => child.dispose());
        }
        
        let items: (TankPart | TankUpgrade)[] = [];
        
        // Получаем все предметы категории
        if (this.currentCategory === "chassis") {
            items = [...this.chassisParts];
        } else if (this.currentCategory === "turret") {
            items = [...this.turretParts];
        } else if (this.currentCategory === "barrel") {
            items = [...this.cannonParts];
        } else if (this.currentCategory === "upgrades") {
            items = this.upgrades.filter(u => u.level < u.maxLevel);
        }
        
        // Применяем поиск
        if (this.searchText && this.searchText.trim() !== "") {
            const searchLower = this.searchText.toLowerCase();
            items = items.filter(item => 
                item.name.toLowerCase().includes(searchLower) ||
                item.description.toLowerCase().includes(searchLower)
            );
        }
        
        // Применяем фильтр по разблокированности
        if (this.filterUnlocked !== null) {
            items = items.filter(item => {
                if ("level" in item) {
                    return this.filterUnlocked ? (item as TankUpgrade).level > 0 : (item as TankUpgrade).level === 0;
                } else {
                    return (item as TankPart).unlocked === this.filterUnlocked;
                }
            });
        }
        
        // Сортировка
        items.sort((a, b) => {
            if (this.sortBy === "name") {
                return a.name.localeCompare(b.name);
            } else if (this.sortBy === "cost") {
                return a.cost - b.cost;
            } else {
                // Сортировка по статистике (для корпусов - HP, для пушек - урон)
                if (!("level" in a) && !("level" in b)) {
                    const partA = a as TankPart;
                    const partB = b as TankPart;
                    if (partA.type === "chassis" && partB.type === "chassis") {
                        return (partB.stats.health || 0) - (partA.stats.health || 0);
                    } else if (partA.type === "barrel" && partB.type === "barrel") {
                        return (partB.stats.damage || 0) - (partA.stats.damage || 0);
                    }
                }
                return 0;
            }
        });
        
        // Сохраняем отфильтрованные элементы для навигации
        this.filteredItems = items;
        
        // Сбрасываем индекс выбранного элемента, если он выходит за границы
        if (this.selectedItemIndex >= items.length) {
            this.selectedItemIndex = items.length > 0 ? 0 : -1;
        } else if (this.selectedItemIndex < 0 && items.length > 0) {
            this.selectedItemIndex = 0;
        }
        
        console.log(`[Garage] Showing ${items.length} items (filtered and sorted)`);
        
        // Обновляем высоту контейнера - оптимизированный spacing для лучшей читаемости
        const itemHeight = 115; // Значительно увеличен для лучшей читаемости
        const spacing = 15; // Увеличен spacing для лучшей визуальной группировки и читаемости
        const totalHeight = items.length > 0 ? items.length * itemHeight + (items.length - 1) * spacing : 1;
        this.itemList!.height = `${totalHeight}px`;
        
        items.forEach((item, i) => {
            const itemContainer = new Rectangle(`item_${i}`);
            itemContainer.width = "840px";
            itemContainer.height = "110px"; // Значительно увеличен для лучшей читаемости
            itemContainer.cornerRadius = 0; // Без скруглений
            itemContainer.thickness = 2; // Более заметная граница
            itemContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER; // Центрирование элементов
            
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
            
            // Цвет рамки зависит от статуса в терминальном стиле
            const isKeyboardSelected = i === this.selectedItemIndex;
            if (isSelected) {
                itemContainer.color = "#ff0";
                itemContainer.background = "rgba(255, 255, 0, 0.2)"; // Более заметный фон для выбранных
                itemContainer.thickness = 3; // Увеличенная толщина для акцента
            } else if (isKeyboardSelected) {
                itemContainer.color = "#0ff";
                itemContainer.background = "rgba(0, 255, 255, 0.25)"; // Более заметный фон
                itemContainer.thickness = 3; // Увеличенная толщина для акцента
            } else if (item.unlocked || (item as TankUpgrade).level > 0) {
                itemContainer.color = "#0f0"; // Яркий зелёный для разблокированных
                itemContainer.background = "rgba(0, 255, 0, 0.08)"; // Более заметный фон
                itemContainer.thickness = 1;
            } else {
                itemContainer.color = "#055"; // Приглушённый зелёный для заблокированных
                itemContainer.background = "rgba(0, 0, 0, 0.6)"; // Более тёмный фон
                itemContainer.thickness = 1;
            }
            
            itemContainer.top = `${i * (itemHeight + spacing)}px`;
            
            // Hover эффекты для элементов списка
            const originalItemColor = itemContainer.color;
            const originalItemBg = itemContainer.background;
            const originalItemThickness = itemContainer.thickness;
            
            itemContainer.onPointerEnterObservable.add(() => {
                if (!isSelected && !isKeyboardSelected) {
                    itemContainer.color = "#0ff";
                    itemContainer.background = "rgba(0, 255, 255, 0.15)";
                    itemContainer.thickness = 2;
                }
            });
            
            itemContainer.onPointerOutObservable.add(() => {
                if (!isSelected && !isKeyboardSelected) {
                    itemContainer.color = originalItemColor;
                    itemContainer.background = originalItemBg;
                    itemContainer.thickness = originalItemThickness;
                }
            });
            
            // Добавляем tooltip при наведении (безопасный вызов)
            try {
                if (this.addTooltipToItem) {
                    this.addTooltipToItem(itemContainer, item, i);
                }
            } catch (e) {
                console.warn(`[Garage] Failed to add tooltip to item ${i}:`, e);
            }
            
            this.itemList!.addControl(itemContainer);
            
            // Индикатор "NEW" в терминальном стиле - улучшенный
            if (!("level" in item)) {
                const part = item as TankPart;
                // Показываем "NEW" если предмет разблокирован, но еще не выбран
                if (part.unlocked && !isSelected) {
                    const newBadge = new Rectangle(`newBadge_${i}`);
                    newBadge.width = "50px";
                    newBadge.height = "18px";
                    newBadge.cornerRadius = 0;
                    newBadge.thickness = 1;
                    newBadge.color = "#ff0";
                    newBadge.background = "rgba(255, 255, 0, 0.2)";
                    newBadge.left = "-400px";
                    newBadge.top = "-47px";
                    newBadge.zIndex = 10;
                    itemContainer.addControl(newBadge);
                    
                    const newText = new TextBlock(`newText_${i}`);
                    newText.text = "NEW";
                    newText.color = "#ff0";
                    newText.fontSize = 10;
                    newText.fontFamily = "Consolas, Monaco, monospace";
                    newText.fontWeight = "bold";
                    newText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                    newBadge.addControl(newText);
                }
            }
            
            // Item name with selection indicator and level - улучшенный с иконками
            const nameText = new TextBlock(`itemName_${i}`);
            let namePrefix = "";
            let levelSuffix = "";
            let icon = "";
            
            // Префиксы для разных типов (ASCII вместо эмодзи)
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.type === "chassis") {
                    icon = "[CH] ";
                } else if (part.type === "barrel") {
                    icon = "[CN] ";
                }
            } else {
                icon = "[UP] ";
            }
            
            if (isSelected) {
                namePrefix = "> ";
            } else if (!("level" in item) && (item as TankPart).unlocked) {
                namePrefix = "+ ";
            }
            
            // Показываем уровень опыта для корпусов и пушек
            if (!("level" in item) && this.experienceSystem) {
                const part = item as TankPart;
                if (part.type === "chassis") {
                    const level = this.experienceSystem.getChassisLevel(part.id);
                    const levelInfo = this.experienceSystem.getLevelInfo(part.id, "chassis");
                    levelSuffix = level > 1 ? ` [${levelInfo?.title || `Ур.${level}`}]` : "";
                } else if (part.type === "barrel") {
                    const level = this.experienceSystem.getCannonLevel(part.id);
                    const levelInfo = this.experienceSystem.getLevelInfo(part.id, "cannon");
                    levelSuffix = level > 1 ? ` [${levelInfo?.title || `Ур.${level}`}]` : "";
                }
            }
            
            nameText.text = `${namePrefix}${icon}${item.name}${levelSuffix}`;
            // Улучшенная цветовая кодировка: выбранный - жёлтый, разблокированный - яркий зелёный, заблокированный - приглушённый
            nameText.color = isSelected ? "#ff0" : (item.unlocked || (item as TankUpgrade).level > 0 ? "#0ff0" : "#0aa");
            nameText.fontSize = 15; // Согласно плану: названия предметов 15px
            nameText.fontFamily = "Consolas, Monaco, monospace";
            nameText.fontWeight = "bold";
            nameText.left = "-400px";
            nameText.top = "-45px";
            nameText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            itemContainer.addControl(nameText);
            
            // Подсветка рекомендуемых предметов в терминальном стиле - улучшенная
            const currency = this.currencyManager.getCurrency();
            if (!("level" in item) && !(item as TankPart).unlocked && item.cost <= currency && item.cost > 0) {
                const recBadge = new Rectangle(`recBadge_${i}`);
                recBadge.width = "65px";
                recBadge.height = "18px";
                recBadge.cornerRadius = 0;
                recBadge.thickness = 1;
                recBadge.color = "#ff0";
                recBadge.background = "rgba(255, 255, 0, 0.15)";
                recBadge.left = "-300px";
                recBadge.top = "-47px";
                recBadge.zIndex = 10;
                itemContainer.addControl(recBadge);
                
                const recText = new TextBlock(`recText_${i}`);
                recText.text = "REC";
                recText.color = "#ff0";
                recText.fontSize = 10;
                recText.fontFamily = "Consolas, Monaco, monospace";
                recText.fontWeight = "bold";
                recText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                recBadge.addControl(recText);
            }
            
            // Item description - оптимизированная статистика (детали в tooltip)
            const descText = new TextBlock(`itemDesc_${i}`);
            let desc = "";
            // Показываем только ключевые параметры в компактном формате
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.type === "chassis" && part.stats) {
                    let baseHp = part.stats.health || 0;
                    let baseSpeed = part.stats.speed || 0;
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getChassisLevelBonus(part.id);
                        baseHp += bonus.healthBonus;
                        baseSpeed += bonus.speedBonus;
                    }
                    desc = `HP: ${baseHp} | SPD: ${baseSpeed.toFixed(1)} | ARM: ${(part.stats.armor || 0).toFixed(1)}`;
                } else if (part.type === "barrel" && part.stats) {
                    let baseDmg = part.stats.damage || 0;
                    let baseReload = part.stats.reload || 0;
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getCannonLevelBonus(part.id);
                        baseDmg += bonus.damageBonus;
                        baseReload -= bonus.reloadBonus;
                    }
                    desc = `DMG: ${baseDmg} | REL: ${(baseReload / 1000).toFixed(1)}s`;
                }
            } else {
                const upgrade = item as TankUpgrade;
                desc = upgrade.level > 0 ? `Lv.${upgrade.level}/${upgrade.maxLevel} +${upgrade.level * upgrade.value}` : item.description;
            }
            descText.text = desc;
            descText.color = "#0ff"; // Максимально яркий цвет для лучшей читаемости описаний
            descText.fontSize = 12; // Согласно плану: описания/статистика 12px
            descText.fontFamily = "Consolas, Monaco, monospace";
            descText.fontWeight = "normal";
            descText.left = "-400px";
            descText.top = "-25px";
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
                    
                    // Experience bar - улучшенный с лучшей видимостью
                    const expBarBg = new Rectangle(`expBarBg_${i}`);
                    expBarBg.width = "200px";
                    expBarBg.height = "10px"; // Значительно увеличен для лучшей видимости
                    expBarBg.cornerRadius = 0;
                    expBarBg.thickness = 2;
                    expBarBg.color = "#0ff";
                    expBarBg.background = "rgba(0, 0, 0, 0.9)";
                    expBarBg.left = "-400px";
                    expBarBg.top = "-5px";
                    expBarBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    itemContainer.addControl(expBarBg);
                    
                    // Experience bar fill - улучшенный
                    const fillWidth = Math.max(2, progressData.progress * 196);
                    const expBarFill = new Rectangle(`expBarFill_${i}`);
                    expBarFill.width = `${fillWidth}px`;
                    expBarFill.height = "8px"; // Значительно увеличен для лучшей видимости
                    expBarFill.cornerRadius = 0;
                    expBarFill.thickness = 0;
                    expBarFill.background = levelInfo?.titleColor || "#0f0";
                    expBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    expBarBg.addControl(expBarFill);
                    
                    // Level and experience text - исправленный формат
                    const expToNext = this.experienceSystem.getExpToNextLevel(part.id, expType);
                    const expText = new TextBlock(`expText_${i}`);
                    // Правильное форматирование опыта с разделителями
                    const levelTitle = levelInfo?.title || `Lv.${expInfo.level}`;
                    const expValue = expInfo.experience;
                    const nextText = expToNext > 0 ? `Next: ${expToNext}` : "MAX";
                    expText.text = `${levelTitle} | ${expValue} XP | ${nextText}`;
                    expText.color = levelInfo?.titleColor || "#0f0";
                    expText.fontSize = 12;
                    expText.fontFamily = "Consolas, Monaco, monospace";
                    expText.fontWeight = "bold";
                    expText.left = "-190px";
                    expText.top = "-5px";
                    expText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                    itemContainer.addControl(expText);
                }
            }
            
            // Cost or level - оптимизированный с лучшей структурой и читаемостью
            const costText = new TextBlock(`itemCost_${i}`);
            if ("level" in item) {
                const upgrade = item as TankUpgrade;
                const canAfford = this.currencyManager.canAfford(upgrade.cost);
                costText.text = `Lv.${upgrade.level}/${upgrade.maxLevel} | ${upgrade.cost} CR`;
                costText.color = canAfford ? "#ff0" : "#999"; // Более заметный серый для недоступных
            } else {
                const part = item as TankPart;
                if (part.unlocked) {
                    costText.text = isSelected ? "[SELECTED]" : "[OWNED]";
                    costText.color = isSelected ? "#ff0" : "#0ff0"; // Более яркий зелёный для owned
                } else {
                    const canAfford = this.currencyManager.canAfford(part.cost);
                    costText.text = `${part.cost} CR`;
                    costText.color = canAfford ? "#ff0" : "#999"; // Более заметный серый для недоступных
                }
            }
            costText.fontSize = 14; // Значительно увеличен для лучшей читаемости
            costText.fontFamily = "Consolas, Monaco, monospace";
            costText.fontWeight = "bold";
            costText.left = "360px";
            costText.top = "-45px";
            costText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
            itemContainer.addControl(costText);
            
            // Buy/Upgrade button в терминальном стиле - упрощенный
            if (!("level" in item) || (item as TankUpgrade).level < (item as TankUpgrade).maxLevel) {
                const canAfford = this.currencyManager.canAfford(item.cost);
                const partUnlocked = !("level" in item) && (item as TankPart).unlocked;
                const buyBtn = Button.CreateSimpleButton(`buy_${i}`, "level" in item ? "UPGRADE" : partUnlocked ? "OWNED" : "BUY");
                buyBtn.width = "100px";
                buyBtn.height = "30px";
                buyBtn.cornerRadius = 0;
                buyBtn.fontFamily = "Consolas, Monaco, monospace";
                
                if (partUnlocked) {
                    buyBtn.color = "#0a0";
                    buyBtn.background = "rgba(0, 255, 0, 0.05)";
                    buyBtn.isEnabled = false;
                } else {
                    buyBtn.color = canAfford ? "#0ff0" : "#888"; // Более яркий зелёный для доступных, более заметный серый для недоступных
                    buyBtn.background = canAfford ? "rgba(0, 255, 0, 0.25)" : "rgba(0, 0, 0, 0.6)";
                    buyBtn.isEnabled = canAfford;
                }
                
                buyBtn.thickness = 1;
                buyBtn.fontSize = 10;
                buyBtn.fontWeight = "bold";
                buyBtn.left = "350px";
                buyBtn.top = "25px";
                
            // Упрощенный hover эффект для кнопки покупки (без лишних анимаций)
            if (canAfford && !partUnlocked) {
                const originalBuyColor = buyBtn.color;
                const originalBuyBg = buyBtn.background;
                buyBtn.onPointerEnterObservable.add(() => {
                    buyBtn.color = "#ff0";
                    buyBtn.background = "rgba(255, 255, 0, 0.3)";
                    buyBtn.thickness = 2;
                });
                buyBtn.onPointerOutObservable.add(() => {
                    buyBtn.color = originalBuyColor;
                    buyBtn.background = originalBuyBg;
                    buyBtn.thickness = 1;
                });
                    buyBtn.onPointerClickObservable.add(() => {
                        // Визуальный эффект при покупке
                        const originalColor = itemContainer.color;
                        const originalBg = itemContainer.background;
                        itemContainer.color = "#0f0";
                        itemContainer.background = "rgba(0, 255, 0, 0.3)";
                        itemContainer.thickness = 3;
                        
                        setTimeout(() => {
                            if (itemContainer) {
                                itemContainer.color = originalColor;
                                itemContainer.background = originalBg;
                            }
                        }, 300);
                        
                        this.purchaseItem(item);
                    });
                }
                itemContainer.addControl(buyBtn);
            }
            
            // Select button в терминальном стиле - упрощенный
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.unlocked && (part.type === "chassis" || part.type === "barrel")) {
                    const selectBtn = Button.CreateSimpleButton(`select_${i}`, isSelected ? "[✓]" : "SELECT");
                    selectBtn.width = "90px";
                    selectBtn.height = "30px";
                    selectBtn.cornerRadius = 0;
                    selectBtn.fontFamily = "Consolas, Monaco, monospace";
                    selectBtn.color = isSelected ? "#ff0" : "#0ff";
                    selectBtn.background = isSelected ? "rgba(255, 255, 0, 0.2)" : "rgba(0, 255, 255, 0.15)";
                    selectBtn.thickness = 1;
                    selectBtn.fontSize = 10;
                    selectBtn.fontWeight = "bold";
                    selectBtn.left = "240px";
                    selectBtn.top = "25px";
                    
            // Улучшенный hover эффект для кнопки выбора с эффектом свечения
            const originalSelectColor = selectBtn.color;
            const originalSelectBg = selectBtn.background;
            let selectGlowInterval: any = null;
            selectBtn.onPointerEnterObservable.add(() => {
                if (!isSelected) {
                    selectBtn.color = "#0f0";
                    selectBtn.background = "rgba(0, 255, 0, 0.25)";
                    selectBtn.thickness = 2;
                    // Эффект свечения при наведении
                    let hoverGlow = 0;
                    selectGlowInterval = setInterval(() => {
                        hoverGlow += 0.2;
                        if (selectBtn && selectBtn.isPointerBlocker) {
                            selectBtn.thickness = 2 + Math.sin(hoverGlow) * 0.5;
                        } else {
                            if (selectGlowInterval) clearInterval(selectGlowInterval);
                        }
                    }, 50);
                }
            });
            selectBtn.onPointerOutObservable.add(() => {
                if (selectGlowInterval) {
                    clearInterval(selectGlowInterval);
                    selectGlowInterval = null;
                }
                if (!isSelected) {
                    selectBtn.color = originalSelectColor;
                    selectBtn.background = originalSelectBg;
                    selectBtn.thickness = 1;
                }
            });
                    
                    selectBtn.onPointerClickObservable.add(() => {
                        // Визуальный эффект при выборе
                        const originalColor = itemContainer.color;
                        const originalBg = itemContainer.background;
                        itemContainer.color = "#ff0";
                        itemContainer.background = "rgba(255, 255, 0, 0.3)";
                        itemContainer.thickness = 3;
                        
                        setTimeout(() => {
                            if (itemContainer) {
                                itemContainer.color = originalColor;
                                itemContainer.background = originalBg;
                            }
                        }, 300);
                        
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
    
    // Покупка/улучшение предмета - с визуальными эффектами
    private purchaseItem(item: TankPart | TankUpgrade): void {
        if (!this.currencyManager.canAfford(item.cost)) {
            console.log("[Garage] Not enough currency!");
            // Показываем сообщение игроку с анимацией
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "[ERROR] Not enough currency!";
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
            
            // Улучшенный визуальный эффект успешной покупки с анимацией
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            
            // Упрощенный эффект для контейнера сообщения (без пульсации)
            
            if ("level" in item) {
                // Upgrade
                const upgrade = item as TankUpgrade;
                upgrade.level++;
                console.log(`[Garage] Upgraded ${upgrade.name} to level ${upgrade.level}`);
                
                // Добавляем в историю
                this.addToHistory("upgrade", `[UP] ${upgrade.name} -> Lv.${upgrade.level}`);
                
                // Показываем сообщение (упрощенное, без лишних анимаций)
                if (msg) {
                    msg.text = `[UP] Upgraded: ${upgrade.name} (Level ${upgrade.level})`;
                    msg.color = "#0f0";
                    setTimeout(() => {
                        if (msg) {
                            msg.text = "";
                        }
                    }, 3000);
                }
                if (this.chatSystem) {
                    this.chatSystem.success(`[UP] Upgraded: ${upgrade.name} (Level ${upgrade.level})`);
                }
            } else {
                // Unlock part
                const part = item as TankPart;
                part.unlocked = true;
                console.log(`[Garage] Unlocked ${part.name}`);
                
                // Добавляем в историю
                this.addToHistory("purchase", `[OK] ${part.name} (${part.cost} CR)`);
                
                // Показываем сообщение (упрощенное, без лишних анимаций)
                if (msg) {
                    msg.text = `[OK] Purchased: ${part.name}`;
                    msg.color = "#0f0";
                    setTimeout(() => {
                        if (msg) {
                            msg.text = "";
                        }
                    }, 3000);
                }
                if (this.chatSystem) {
                    this.chatSystem.economy(`[OK] Purchased: ${part.name}`);
                }
            }
            
            this.saveProgress();
            this.updateItemList();
            // Update currency display с улучшенной анимацией
            const currencyText = this.garageContainer!.getChildByName("garageCurrency") as TextBlock;
            if (currencyText) {
                const oldValue = parseInt(currencyText.text) || 0;
                const newValue = this.currencyManager.getCurrency();
                currencyText.text = `${newValue}`;
                
                // Улучшенный эффект обновления валюты с плавным изменением
                let flash = 0;
                const flashInterval = setInterval(() => {
                    flash++;
                    if (currencyText) {
                        // Плавное изменение цвета и размера
                        const intensity = Math.sin(flash * 0.5);
                        currencyText.color = flash % 2 === 0 ? "#ff0" : "#fff";
                        currencyText.fontSize = 16 + intensity * 2;
                    }
                    if (flash > 8) {
                        clearInterval(flashInterval);
                        if (currencyText) {
                            currencyText.color = "#ff0";
                            currencyText.fontSize = 16;
                        }
                    }
                }, 80);
            }
            
            // Обновляем рекомендации
            const recPanel = this.garageContainer!.getChildByName("recommendationsPanel");
            if (recPanel) {
                recPanel.dispose();
                this.createRecommendationsPanel();
            }
        }
    }
    
    // Выбрать корпус или пушку (предпросмотр, без применения) - с визуальными эффектами
    private selectPart(part: TankPart): void {
        if (part.type === "chassis") {
            this.previewChassisId = part.id;
            console.log(`[Garage] Preview chassis: ${part.name}`);
            
            // Показываем сообщение (упрощенное, без лишних анимаций)
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = `[CH] Selected chassis: ${part.name} (press APPLY to confirm)`;
                msg.color = "#0ff";
                setTimeout(() => {
                    if (msg) {
                        msg.text = "";
                    }
                }, 4000);
            }
            if (this.chatSystem) {
                this.chatSystem.info(`[CH] Selected chassis: ${part.name}`);
            }
        } else if (part.type === "barrel") {
            this.previewCannonId = part.id;
            console.log(`[Garage] Preview cannon: ${part.name}`);
            
            // Показываем сообщение (упрощенное, без лишних анимаций)
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = `[CN] Selected cannon: ${part.name} (press APPLY to confirm)`;
                msg.color = "#0ff";
                setTimeout(() => {
                    if (msg) {
                        msg.text = "";
                    }
                }, 4000);
            }
            if (this.chatSystem) {
                this.chatSystem.info(`[CN] Selected cannon: ${part.name}`);
            }
        }
        
        // Звук выбора
        if (this.soundManager) {
            this.soundManager.playSelect();
        }
        
        // Обновляем панель сравнения с анимацией
        this.updateComparisonPanel();
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
                        this.chatSystem.success(`[CH] Chassis applied: ${chassisType.name}`);
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
                        this.chatSystem.success(`[CN] Cannon applied: ${cannonType.name}`);
                    }
                }
            }
        }
        
        if (applied) {
            // Звук применения
            if (this.soundManager) {
                this.soundManager.playPurchase();
            }
            
            // Показываем сообщение с эффектом успеха
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "[OK] Changes applied!";
                msg.color = "#0f0";
                setTimeout(() => {
                    if (msg) {
                        msg.text = "";
                    }
                }, 3000);
            }
            
            // Сбрасываем предпросмотр
            this.previewChassisId = null;
            this.previewCannonId = null;
            
            // Обновляем список
            this.updateItemList();
            this.updateComparisonPanel();
            
            // Обновляем превью текущего танка
            const previewContainer = this.garageContainer!.getChildByName("tankPreviewContainer");
            if (previewContainer) {
                previewContainer.dispose();
                this.createCurrentTankPreview();
            }
        } else {
            // Показываем сообщение, что нечего применять
            const msgContainer = this.garageContainer!.getChildByName("messageContainer") as Rectangle;
            const msg = msgContainer?.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "[WARN] No changes to apply";
                msg.color = "#ff0";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 2000);
            }
        }
    }
    
    // Создать панель сравнения в терминальном стиле
    private createComparisonPanel(): void {
        this.comparisonPanel = new Rectangle("comparisonPanel");
        this.comparisonPanel.width = "860px";
        this.comparisonPanel.height = "120px";
        this.comparisonPanel.cornerRadius = 0;
        this.comparisonPanel.thickness = 1;
        this.comparisonPanel.color = "#0ff";
        this.comparisonPanel.background = "rgba(0, 0, 0, 0.8)";
        this.comparisonPanel.top = "200px";
        this.garageContainer!.addControl(this.comparisonPanel);
        
        this.updateComparisonPanel();
    }
    
    // Обновить панель сравнения с цветовыми индикаторами
    private updateComparisonPanel(): void {
        if (!this.comparisonPanel) return;
        
        // Очищаем старые элементы
        if (this.comparisonPanel.children) {
            this.comparisonPanel.children.forEach((child: any) => {
                if (child.name !== "comparisonTitle") child.dispose();
            });
        }
        
        // Заголовок в терминальном стиле
        let title = this.comparisonPanel.getChildByName("comparisonTitle") as TextBlock;
        if (!title) {
            title = new TextBlock("comparisonTitle");
            title.text = "COMPARISON";
            title.color = "#0ff";
            title.fontSize = 12;
            title.fontFamily = "Consolas, Monaco, monospace";
            title.fontWeight = "bold";
            title.top = "-65px";
            title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.comparisonPanel.addControl(title);
            
            // Разделительная линия
            const titleLine = new Rectangle("comparisonTitleLine");
            titleLine.width = "100%";
            titleLine.height = "1px";
            titleLine.cornerRadius = 0;
            titleLine.thickness = 0;
            titleLine.background = "#0ff";
            titleLine.top = "-50px";
            titleLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            this.comparisonPanel.addControl(titleLine);
        }
        
        // Вспомогательная функция для получения цвета изменения
        const getChangeColor = (diff: number, isBetter: boolean): string => {
            if (diff === 0) return "#aaa";
            if (isBetter) {
                return diff > 0 ? "#0f0" : "#f00"; // Зеленый для улучшения, красный для ухудшения
            } else {
                return diff < 0 ? "#0f0" : "#f00"; // Для перезарядки меньше = лучше
            }
        };
        
        // Вспомогательная функция для форматирования изменения
        const formatChange = (diff: number, isBetter: boolean): string => {
            if (diff === 0) return "";
            const sign = diff > 0 ? "+" : "";
            const color = getChangeColor(diff, isBetter);
            return ` [${sign}${diff.toFixed(1)}]`;
        };
        
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
            
            // Текущий корпус
            const currentLabel = new TextBlock("currentChassisLabel");
            currentLabel.text = "CURRENT:";
            currentLabel.color = "#0f0";
            currentLabel.fontSize = 10;
            currentLabel.fontFamily = "Consolas, Monaco, monospace";
            currentLabel.fontWeight = "bold";
            currentLabel.top = "-35px";
            currentLabel.left = "-370px";
            this.comparisonPanel.addControl(currentLabel);
            
            const currentText = new TextBlock("currentChassis");
            currentText.text = `${currentChassis.name} [${currentChassisBonus.title || "Lv.1"}] | HP: ${totalHp}${expBonusText} | Speed: ${totalSpeed.toFixed(1)}${speedBonusText}`;
            currentText.color = "#0f0";
            currentText.fontSize = 10;
            currentText.fontFamily = "Consolas, Monaco, monospace";
            currentText.top = "-35px";
            currentText.left = "-280px";
            this.comparisonPanel.addControl(currentText);
            
            if (previewChassis && previewChassis.id !== currentChassis.id) {
                const previewTotalHp = previewChassis.maxHealth + previewChassisBonus.healthBonus;
                const previewTotalSpeed = previewChassis.moveSpeed + previewChassisBonus.speedBonus;
                const hpDiff = previewTotalHp - totalHp;
                const speedDiff = previewTotalSpeed - totalSpeed;
                
                // Новый корпус
                const previewLabel = new TextBlock("previewChassisLabel");
                previewLabel.text = "NEW:";
                previewLabel.color = "#0ff";
                previewLabel.fontSize = 10;
                previewLabel.fontWeight = "bold";
                previewLabel.top = "-15px";
                previewLabel.left = "-370px";
                this.comparisonPanel.addControl(previewLabel);
                
                // HP с цветовым индикатором
                const hpColor = getChangeColor(hpDiff, true);
                const hpChangeText = new TextBlock("hpChange");
                hpChangeText.text = `HP: ${previewTotalHp}`;
                hpChangeText.color = hpColor;
                hpChangeText.fontSize = 11;
                hpChangeText.fontWeight = "bold";
                hpChangeText.top = "-15px";
                hpChangeText.left = "-280px";
                this.comparisonPanel.addControl(hpChangeText);
                
                const hpDiffText = new TextBlock("hpDiff");
                hpDiffText.text = `(${hpDiff > 0 ? "+" : ""}${hpDiff})`;
                hpDiffText.color = hpColor;
                hpDiffText.fontSize = 10;
                hpDiffText.top = "-15px";
                hpDiffText.left = "-200px";
                this.comparisonPanel.addControl(hpDiffText);
                
                // Speed с цветовым индикатором
                const speedColor = getChangeColor(speedDiff, true);
                const speedChangeText = new TextBlock("speedChange");
                speedChangeText.text = `Speed: ${previewTotalSpeed.toFixed(1)}`;
                speedChangeText.color = speedColor;
                speedChangeText.fontSize = 11;
                speedChangeText.fontWeight = "bold";
                speedChangeText.top = "-15px";
                speedChangeText.left = "-120px";
                this.comparisonPanel.addControl(speedChangeText);
                
                const speedDiffText = new TextBlock("speedDiff");
                speedDiffText.text = `(${speedDiff > 0 ? "+" : ""}${speedDiff.toFixed(1)})`;
                speedDiffText.color = speedColor;
                speedDiffText.fontSize = 10;
                speedDiffText.top = "-15px";
                speedDiffText.left = "-30px";
                this.comparisonPanel.addControl(speedDiffText);
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
            
            // Текущая пушка
            const currentCannonLabel = new TextBlock("currentCannonLabel");
            currentCannonLabel.text = "CURRENT:";
            currentCannonLabel.color = "#0a0";
            currentCannonLabel.fontSize = 10;
            currentCannonLabel.fontWeight = "bold";
            currentCannonLabel.top = "10px";
            currentCannonLabel.left = "-370px";
            this.comparisonPanel.addControl(currentCannonLabel);
            
            const currentCannonText = new TextBlock("currentCannon");
            currentCannonText.text = `${currentCannon.name} [${currentCannonBonus.title || "Lv.1"}] | Damage: ${totalDmg}${dmgBonusText} | Reload: ${(totalReload / 1000).toFixed(2)}s${reloadBonusText}`;
            currentCannonText.color = "#0a0";
            currentCannonText.fontSize = 11;
            currentCannonText.top = "10px";
            currentCannonText.left = "-280px";
            this.comparisonPanel.addControl(currentCannonText);
            
            if (previewCannon && previewCannon.id !== currentCannon.id) {
                const previewTotalDmg = previewCannon.damage + previewCannonBonus.damageBonus;
                const previewTotalReload = Math.max(300, previewCannon.cooldown - previewCannonBonus.reloadBonus);
                const dmgDiff = previewTotalDmg - totalDmg;
                const reloadDiff = (previewTotalReload - totalReload) / 1000;
                
                // Новая пушка
                const previewCannonLabel = new TextBlock("previewCannonLabel");
                previewCannonLabel.text = "NEW:";
                previewCannonLabel.color = "#0ff";
                previewCannonLabel.fontSize = 10;
                previewCannonLabel.fontWeight = "bold";
                previewCannonLabel.top = "30px";
                previewCannonLabel.left = "-370px";
                this.comparisonPanel.addControl(previewCannonLabel);
                
                // Damage с цветовым индикатором
                const dmgColor = getChangeColor(dmgDiff, true);
                const dmgChangeText = new TextBlock("dmgChange");
                dmgChangeText.text = `Damage: ${previewTotalDmg}`;
                dmgChangeText.color = dmgColor;
                dmgChangeText.fontSize = 11;
                dmgChangeText.fontWeight = "bold";
                dmgChangeText.top = "30px";
                dmgChangeText.left = "-280px";
                this.comparisonPanel.addControl(dmgChangeText);
                
                const dmgDiffText = new TextBlock("dmgDiff");
                dmgDiffText.text = `(${dmgDiff > 0 ? "+" : ""}${dmgDiff})`;
                dmgDiffText.color = dmgColor;
                dmgDiffText.fontSize = 10;
                dmgDiffText.top = "30px";
                dmgDiffText.left = "-200px";
                this.comparisonPanel.addControl(dmgDiffText);
                
                // Reload с цветовым индикатором (меньше = лучше)
                const reloadColor = getChangeColor(-reloadDiff * 1000, true); // Инвертируем для перезарядки
                const reloadChangeText = new TextBlock("reloadChange");
                reloadChangeText.text = `Reload: ${(previewTotalReload / 1000).toFixed(2)}s`;
                reloadChangeText.color = reloadColor;
                reloadChangeText.fontSize = 11;
                reloadChangeText.fontWeight = "bold";
                reloadChangeText.top = "30px";
                reloadChangeText.left = "-120px";
                this.comparisonPanel.addControl(reloadChangeText);
                
                const reloadDiffText = new TextBlock("reloadDiff");
                reloadDiffText.text = `(${reloadDiff < 0 ? "" : "+"}${reloadDiff.toFixed(2)}s)`;
                reloadDiffText.color = reloadColor;
                reloadDiffText.fontSize = 10;
                reloadDiffText.top = "30px";
                reloadDiffText.left = "-30px";
                this.comparisonPanel.addControl(reloadDiffText);
            }
        }
        
        // Показываем панель только если есть изменения (упрощено, без анимации)
        const hasChanges = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                          (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
        this.comparisonPanel.isVisible = hasChanges;
        this.comparisonPanel.alpha = 1.0;
    }
    
        // Создать кнопку применения в терминальном стиле - оптимизированная
    private createApplyButton(): void {
        const applyBtn = Button.CreateSimpleButton("applySelection", "APPLY [Enter]");
        applyBtn.width = "160px";
        applyBtn.height = "35px";
        applyBtn.cornerRadius = 0;
        applyBtn.fontFamily = "Consolas, Monaco, monospace";
        applyBtn.color = "#0f0";
        applyBtn.background = "rgba(0, 255, 0, 0.2)";
        applyBtn.thickness = 1;
        applyBtn.fontSize = 11;
        applyBtn.fontWeight = "bold";
        applyBtn.top = "328px";
        applyBtn.left = "-100px";
        
        // Проверяем, есть ли изменения для применения
        const hasChanges = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                          (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
        
        if (!hasChanges) {
            applyBtn.color = "#666";
            applyBtn.background = "#001100aa";
            applyBtn.isEnabled = false;
        }
        
        // Hover эффект для кнопки применения
        applyBtn.onPointerEnterObservable.add(() => {
            if (applyBtn.isEnabled) {
                applyBtn.color = "#ff0";
                applyBtn.background = "rgba(255, 255, 0, 0.3)";
                applyBtn.thickness = 2;
            }
        });
        applyBtn.onPointerOutObservable.add(() => {
            if (applyBtn.isEnabled) {
                applyBtn.color = "#0f0";
                applyBtn.background = "rgba(0, 255, 0, 0.2)";
                applyBtn.thickness = 1;
            }
        });
        
        applyBtn.onPointerClickObservable.add(() => {
            this.applySelection();
            // Обновляем кнопку после применения
            const hasChangesAfter = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                                  (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
            if (!hasChangesAfter) {
                applyBtn.color = "#666";
                applyBtn.background = "#001100aa";
                applyBtn.isEnabled = false;
            }
        });
        this.garageContainer!.addControl(applyBtn);
        
        // Обновляем кнопку периодически - оптимизировано
        setInterval(() => {
            if (this.isOpen && applyBtn) {
                const hasChangesNow = (this.previewChassisId && this.previewChassisId !== this.currentChassisId) ||
                                    (this.previewCannonId && this.previewCannonId !== this.currentCannonId);
                const shouldBeEnabled = hasChangesNow;
                if (shouldBeEnabled !== applyBtn.isEnabled) {
                    if (shouldBeEnabled) {
                        applyBtn.color = "#0f0";
                        applyBtn.background = "#002200aa";
                        applyBtn.isEnabled = true;
                    } else {
                        applyBtn.color = "#666";
                        applyBtn.background = "#001100aa";
                        applyBtn.isEnabled = false;
                    }
                }
            }
        }, 300); // Реже проверяем для оптимизации
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
    
    // Создать панель статистики игрока в терминальном стиле
    private createPlayerStatsPanel(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        
        // Контейнер для статистики - упрощенный и компактный
        const statsContainer = new Rectangle("playerStatsContainer");
        statsContainer.width = "200px";
        statsContainer.height = "100px";
        statsContainer.cornerRadius = 0;
        statsContainer.thickness = 1;
        statsContainer.color = "#0ff";
        statsContainer.background = "rgba(0, 0, 0, 0.8)";
        statsContainer.left = "340px";
        statsContainer.top = "-250px";
        this.garageContainer!.addControl(statsContainer);
        
        // Заголовок - упрощенный
        const statsTitle = new TextBlock("statsTitle");
        statsTitle.text = "STATS";
        statsTitle.color = "#0ff";
        statsTitle.fontSize = 10;
        statsTitle.fontFamily = "Consolas, Monaco, monospace";
        statsTitle.fontWeight = "bold";
        statsTitle.top = "-45px";
        statsTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        statsContainer.addControl(statsTitle);
        
        // Уровень в терминальном стиле - упрощенный
        const levelText = new TextBlock("playerLevel");
        levelText.text = `Lv.${stats.level}`;
        levelText.color = "#0f0";
        levelText.fontSize = 12;
        levelText.fontFamily = "Consolas, Monaco, monospace";
        levelText.top = "-30px";
        levelText.left = "-90px";
        statsContainer.addControl(levelText);
        
        // Опыт в терминальном стиле - упрощенный
        const xpText = new TextBlock("playerXP");
        xpText.text = `${xpProgress.current}/${xpProgress.required} XP`;
        xpText.color = "#0aa";
        xpText.fontSize = 11;
        xpText.fontFamily = "Consolas, Monaco, monospace";
        xpText.top = "-15px";
        xpText.left = "-90px";
        statsContainer.addControl(xpText);
        
        // Прогресс-бар опыта в терминальном стиле - упрощенный
        const xpBarBg = new Rectangle("xpBarBg");
        xpBarBg.width = "180px";
        xpBarBg.height = "5px";
        xpBarBg.background = "rgba(0, 0, 0, 0.8)";
        xpBarBg.thickness = 1;
        xpBarBg.color = "#0aa";
        xpBarBg.cornerRadius = 0;
        xpBarBg.top = "0px";
        statsContainer.addControl(xpBarBg);
        
        const xpBarFill = new Rectangle("xpBarFill");
        const xpPercent = xpProgress.required > 0 ? (xpProgress.current / xpProgress.required) : 0;
        xpBarFill.width = `${180 * Math.min(xpPercent, 1)}px`;
        xpBarFill.height = "3px";
        xpBarFill.cornerRadius = 0;
        xpBarFill.background = "#0ff";
        xpBarFill.top = "0px";
        xpBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        xpBarBg.addControl(xpBarFill);
        
        // K/D в терминальном стиле - упрощенный
        const kdText = new TextBlock("playerKD");
        const kd = this.playerProgression.getKDRatio();
        kdText.text = `K/D: ${kd}`;
        kdText.color = "#0ff";
        kdText.fontSize = 11;
        kdText.fontFamily = "Consolas, Monaco, monospace";
        kdText.top = "15px";
        kdText.left = "-90px";
        statsContainer.addControl(kdText);
    }
    
    // Обновить панель статистики игрока
    private updatePlayerStatsPanel(): void {
        if (!this.playerProgression || !this.garageContainer) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        const kd = this.playerProgression.getKDRatio();
        
        // Обновляем уровень
        const levelText = this.garageContainer.getChildByName("playerLevel") as TextBlock;
        if (levelText) {
            levelText.text = `Lv.${stats.level}`;
        }
        
        // Обновляем опыт
        const xpText = this.garageContainer.getChildByName("playerXP") as TextBlock;
        if (xpText) {
            xpText.text = `XP: ${xpProgress.current}/${xpProgress.required}`;
        }
        
        // Обновляем прогресс-бар опыта с плавной анимацией
        const xpBarFill = this.garageContainer.getChildByName("xpBarFill") as Rectangle;
        if (xpBarFill) {
            const targetPercent = xpProgress.required > 0 ? (xpProgress.current / xpProgress.required) : 0;
            const targetWidth = 180 * Math.min(targetPercent, 1);
            const currentWidth = parseFloat(xpBarFill.width.toString().replace("px", "")) || 0;
            
            // Плавная интерполяция к целевому значению
            if (Math.abs(targetWidth - currentWidth) > 1) {
                const diff = targetWidth - currentWidth;
                const newWidth = currentWidth + diff * 0.15; // Плавное приближение
                xpBarFill.width = `${Math.max(0, Math.min(180, newWidth))}px`;
            } else {
                xpBarFill.width = `${targetWidth}px`;
            }
        }
        
        // Обновляем K/D
        const kdText = this.garageContainer.getChildByName("playerKD") as TextBlock;
        if (kdText) {
            kdText.text = `K/D: ${kd}`;
        }
        
        // Обновляем убийства/смерти
        const killsDeathsText = this.garageContainer.getChildByName("killsDeaths") as TextBlock;
        if (killsDeathsText) {
            killsDeathsText.text = `K: ${stats.totalKills} | D: ${stats.totalDeaths}`;
        }
    }
    
    // Добавить tooltip к элементу списка - улучшенный с детальной информацией
    private addTooltipToItem(container: Rectangle, item: TankPart | TankUpgrade, index: number): void {
        let tooltip: Rectangle | null = null;
        
        // Эффект подсветки при наведении
        container.onPointerEnterObservable.add(() => {
            // Увеличиваем яркость контейнера
            const originalThickness = container.thickness;
            container.thickness = Math.min(originalThickness + 1, 4);
            
            // Создаем tooltip в терминальном стиле
            tooltip = new Rectangle(`tooltip_${index}`);
            tooltip.width = "360px";
            tooltip.height = "220px";
            tooltip.cornerRadius = 0;
            tooltip.thickness = 1;
            tooltip.color = "#0ff";
            tooltip.background = "rgba(0, 0, 0, 0.95)";
            tooltip.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            tooltip.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
            tooltip.left = "430px";
            tooltip.top = `${index * 115 - 80}px`;
            tooltip.zIndex = 2000;
            tooltip.isPointerBlocker = false;
            
            // Заголовок tooltip в терминальном стиле
            const tooltipTitle = new TextBlock(`tooltipTitle_${index}`);
            let prefix = "";
            if (!("level" in item)) {
                const part = item as TankPart;
                prefix = part.type === "chassis" ? "CHASSIS: " : "CANNON: ";
            } else {
                prefix = "UPGRADE: ";
            }
            tooltipTitle.text = `${prefix}${item.name}`;
            tooltipTitle.color = "#0ff";
            tooltipTitle.fontSize = 12;
            tooltipTitle.fontFamily = "Consolas, Monaco, monospace";
            tooltipTitle.fontWeight = "bold";
            tooltipTitle.top = "-105px";
            tooltipTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            tooltip.addControl(tooltipTitle);
            
            // Разделительная линия
            const tooltipLine = new Rectangle(`tooltipLine_${index}`);
            tooltipLine.width = "100%";
            tooltipLine.height = "1px";
            tooltipLine.cornerRadius = 0;
            tooltipLine.thickness = 0;
            tooltipLine.background = "#0ff";
            tooltipLine.top = "-100px";
            tooltipLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            tooltip.addControl(tooltipLine);
            
            // Статус разблокированности в терминальном стиле
            const statusText = new TextBlock(`tooltipStatus_${index}`);
            if (!("level" in item)) {
                const part = item as TankPart;
                statusText.text = part.unlocked ? "[UNLOCKED]" : `[LOCKED] Cost: ${item.cost} CR`;
                statusText.color = part.unlocked ? "#0f0" : "#f00";
            } else {
                const upgrade = item as TankUpgrade;
                statusText.text = `LEVEL: ${upgrade.level}/${upgrade.maxLevel}`;
                statusText.color = upgrade.level > 0 ? "#0f0" : "#0aa";
            }
            statusText.fontSize = 10;
            statusText.fontFamily = "Consolas, Monaco, monospace";
            statusText.top = "-90px";
            statusText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            tooltip.addControl(statusText);
            
            // Описание в терминальном стиле
            const tooltipDesc = new TextBlock(`tooltipDesc_${index}`);
            tooltipDesc.text = item.description;
            tooltipDesc.color = "#aaa";
            tooltipDesc.fontSize = 11;
            tooltipDesc.fontFamily = "Consolas, Monaco, monospace";
            tooltipDesc.top = "-70px";
            tooltipDesc.left = "-170px";
            tooltipDesc.textWrapping = true;
            tooltipDesc.resizeToFit = true;
            tooltip.addControl(tooltipDesc);
            
            // Детальная статистика
            let statsLines: string[] = [];
            if (!("level" in item)) {
                const part = item as TankPart;
                if (part.type === "chassis" && part.stats) {
                    // Получаем бонусы от опыта
                    let baseHp = part.stats.health || 0;
                    let baseSpeed = part.stats.speed || 0;
                    let expBonus = "";
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getChassisLevelBonus(part.id);
                        baseHp += bonus.healthBonus;
                        baseSpeed += bonus.speedBonus;
                        if (bonus.healthBonus > 0 || bonus.speedBonus > 0) {
                            expBonus = ` (+${bonus.healthBonus} HP, +${bonus.speedBonus.toFixed(1)} SPD from XP)`;
                        }
                    }
                    statsLines.push(`HP: ${baseHp}${expBonus}`);
                    statsLines.push(`SPD: ${baseSpeed.toFixed(1)}`);
                    statsLines.push(`ARM: ${(part.stats.armor || 0).toFixed(1)}`);
                    
                    // Опыт и статистика использования
                    if (this.experienceSystem) {
                        const expInfo = this.experienceSystem.getChassisExperience(part.id);
                        if (expInfo) {
                            statsLines.push(`XP: ${expInfo.experience} XP`);
                            statsLines.push(`Kills: ${expInfo.kills}`);
                            statsLines.push(`DMG: ${Math.round(expInfo.damageDealt)}`);
                        }
                    }
                } else if (part.type === "barrel" && part.stats) {
                    // Получаем бонусы от опыта
                    let baseDmg = part.stats.damage || 0;
                    let baseReload = part.stats.reload || 0;
                    let expBonus = "";
                    if (this.experienceSystem) {
                        const bonus = this.experienceSystem.getCannonLevelBonus(part.id);
                        baseDmg += bonus.damageBonus;
                        baseReload -= bonus.reloadBonus;
                        if (bonus.damageBonus > 0 || bonus.reloadBonus > 0) {
                            expBonus = ` (+${bonus.damageBonus} DMG, -${bonus.reloadBonus}ms from XP)`;
                        }
                    }
                    statsLines.push(`DMG: ${baseDmg}${expBonus}`);
                    statsLines.push(`REL: ${(baseReload / 1000).toFixed(2)}s`);
                    
                    // Опыт и статистика использования
                    if (this.experienceSystem) {
                        const expInfo = this.experienceSystem.getCannonExperience(part.id);
                        if (expInfo) {
                            statsLines.push(`XP: ${expInfo.experience} XP`);
                            statsLines.push(`Kills: ${expInfo.kills}`);
                            statsLines.push(`DMG: ${Math.round(expInfo.damageDealt)}`);
                        }
                    }
                }
            } else {
                const upgrade = item as TankUpgrade;
                statsLines.push(`Current: ${upgrade.level * upgrade.value}${upgrade.stat === "reload" ? "ms" : ""}`);
                statsLines.push(`Next: +${upgrade.value}${upgrade.stat === "reload" ? "ms" : ""}`);
                statsLines.push(`Cost: ${upgrade.cost} CR`);
            }
            
            // Отображаем статистику в терминальном стиле
            statsLines.forEach((line, i) => {
                const statLine = new TextBlock(`tooltipStat_${index}_${i}`);
                // Убираем эмодзи и форматируем в терминальном стиле
                let cleanLine = line.trim();
                // Уже в правильном формате, убираем лишние замены
                statLine.text = `> ${cleanLine}`;
                statLine.color = "#0f0";
                statLine.fontSize = 11;
                statLine.fontFamily = "Consolas, Monaco, monospace";
                statLine.top = `${-50 + i * 16}px`;
                statLine.left = "-170px";
                statLine.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
                tooltip.addControl(statLine);
            });
            
            // Рекомендация в терминальном стиле
            const currency = this.currencyManager.getCurrency();
            if (!("level" in item) && !(item as TankPart).unlocked && item.cost <= currency) {
                const recText = new TextBlock(`tooltipRec_${index}`);
                recText.text = "> RECOMMENDED";
                recText.color = "#ff0";
                recText.fontSize = 10;
                recText.fontFamily = "Consolas, Monaco, monospace";
                recText.fontWeight = "bold";
                recText.top = "100px";
                recText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
                tooltip.addControl(recText);
            }
            
            // Добавляем tooltip в контейнер списка
            if (this.itemList) {
                this.itemList.addControl(tooltip);
            }
        });
        
        container.onPointerOutObservable.add(() => {
            // Восстанавливаем оригинальную толщину
            container.thickness = Math.max(container.thickness - 1, 1);
            
            // Удаляем tooltip
            if (tooltip) {
                tooltip.dispose();
                tooltip = null;
            }
        });
    }
    
    // Создать превью текущего танка - улучшенное
    private createCurrentTankPreview(): void {
        const currentChassis = CHASSIS_TYPES.find(c => c.id === this.currentChassisId);
        const currentCannon = CANNON_TYPES.find(c => c.id === this.currentCannonId);
        
        if (!currentChassis || !currentCannon) return;
        
        // Получаем бонусы от опыта
        let chassisBonus = { healthBonus: 0, speedBonus: 0, armorBonus: 0, title: "" };
        let cannonBonus = { damageBonus: 0, reloadBonus: 0, title: "" };
        if (this.experienceSystem) {
            chassisBonus = this.experienceSystem.getChassisLevelBonus(this.currentChassisId) || chassisBonus;
            cannonBonus = this.experienceSystem.getCannonLevelBonus(this.currentCannonId) || cannonBonus;
        }
        
        // Контейнер для превью в терминальном стиле - упрощенный
        const previewContainer = new Rectangle("tankPreviewContainer");
        previewContainer.width = "240px";
        previewContainer.height = "90px";
        previewContainer.cornerRadius = 0;
        previewContainer.thickness = 1;
        previewContainer.color = "#0f0";
        previewContainer.background = "rgba(0, 0, 0, 0.8)";
        previewContainer.left = "-350px";
        previewContainer.top = "-330px";
        this.garageContainer!.addControl(previewContainer);
        
        // Заголовок в терминальном стиле - упрощенный
        const previewTitle = new TextBlock("previewTitle");
        previewTitle.text = "CURRENT";
        previewTitle.color = "#0f0";
        previewTitle.fontSize = 10;
        previewTitle.fontFamily = "Consolas, Monaco, monospace";
        previewTitle.fontWeight = "bold";
        previewTitle.top = "-40px";
        previewTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        previewContainer.addControl(previewTitle);
        
        // Название корпуса с уровнем в терминальном стиле - упрощенный
        const chassisText = new TextBlock("currentChassis");
        chassisText.text = `${currentChassis.name} [${chassisBonus.title || "Lv.1"}]`;
        chassisText.color = "#0f0";
        chassisText.fontSize = 11;
        chassisText.fontFamily = "Consolas, Monaco, monospace";
        chassisText.fontWeight = "bold";
        chassisText.top = "-25px";
        chassisText.left = "-110px";
        previewContainer.addControl(chassisText);
        
        // Название пушки с уровнем в терминальном стиле - упрощенный
        const cannonText = new TextBlock("currentCannon");
        cannonText.text = `${currentCannon.name} [${cannonBonus.title || "Lv.1"}]`;
        cannonText.color = "#0ff";
        cannonText.fontSize = 11;
        cannonText.fontFamily = "Consolas, Monaco, monospace";
        cannonText.fontWeight = "bold";
        cannonText.top = "-10px";
        cannonText.left = "-110px";
        previewContainer.addControl(cannonText);
        
        // Статистика с бонусами в терминальном стиле - упрощенная
        const totalHp = currentChassis.maxHealth + chassisBonus.healthBonus;
        const totalDmg = currentCannon.damage + cannonBonus.damageBonus;
        const totalSpeed = currentChassis.moveSpeed + chassisBonus.speedBonus;
        const statsText = new TextBlock("tankStats");
        statsText.text = `HP:${totalHp} DMG:${totalDmg} SPD:${totalSpeed.toFixed(1)}`;
        statsText.color = "#0aa";
        statsText.fontSize = 10;
        statsText.fontFamily = "Consolas, Monaco, monospace";
        statsText.top = "5px";
        statsText.left = "-110px";
        previewContainer.addControl(statsText);
    }
    
    // Создать быстрые действия
    private createQuickActions(): void {
        const quickContainer = new Rectangle("quickActions");
        quickContainer.width = "860px";
        quickContainer.height = "50px";
        quickContainer.cornerRadius = 0;
        quickContainer.thickness = 0;
        quickContainer.background = "#00000000";
        quickContainer.top = "-160px";
        quickContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.garageContainer!.addControl(quickContainer);
        
        // Быстрая покупка в терминальном стиле
        const quickBuyBtn = Button.CreateSimpleButton("quickBuy", "QUICK BUY [F]");
        quickBuyBtn.width = "160px";
        quickBuyBtn.height = "30px";
        quickBuyBtn.cornerRadius = 0;
        quickBuyBtn.fontFamily = "Consolas, Monaco, monospace";
        quickBuyBtn.color = "#0f0";
        quickBuyBtn.background = "rgba(0, 255, 0, 0.15)";
        quickBuyBtn.thickness = 1;
        quickBuyBtn.fontSize = 10;
        quickBuyBtn.fontWeight = "bold";
        // Выравнивание кнопок быстрых действий с равными отступами
        quickBuyBtn.left = "-400px";
        quickBuyBtn.top = "10px";
        
        // Hover эффект для кнопки быстрой покупки
        quickBuyBtn.onPointerEnterObservable.add(() => {
            quickBuyBtn.color = "#ff0";
            quickBuyBtn.background = "rgba(255, 255, 0, 0.25)";
            quickBuyBtn.thickness = 2;
        });
        quickBuyBtn.onPointerOutObservable.add(() => {
            quickBuyBtn.color = "#0f0";
            quickBuyBtn.background = "rgba(0, 255, 0, 0.15)";
            quickBuyBtn.thickness = 1;
        });
        
        quickBuyBtn.onPointerClickObservable.add(() => {
            this.quickPurchase();
        });
        quickContainer.addControl(quickBuyBtn);
        
        // Показать только доступные в терминальном стиле
        const showAffordableBtn = Button.CreateSimpleButton("showAffordable", "AFFORDABLE");
        showAffordableBtn.width = "140px";
        showAffordableBtn.height = "30px";
        showAffordableBtn.cornerRadius = 0;
        showAffordableBtn.fontFamily = "Consolas, Monaco, monospace";
        showAffordableBtn.color = "#0ff";
        showAffordableBtn.background = "rgba(0, 255, 255, 0.1)";
        showAffordableBtn.thickness = 1;
        showAffordableBtn.fontSize = 10;
        showAffordableBtn.left = "-200px";
        showAffordableBtn.top = "10px";
        
        // Hover эффект для кнопки доступных
        showAffordableBtn.onPointerEnterObservable.add(() => {
            showAffordableBtn.color = "#0f0";
            showAffordableBtn.background = "rgba(0, 255, 0, 0.2)";
            showAffordableBtn.thickness = 2;
        });
        showAffordableBtn.onPointerOutObservable.add(() => {
            showAffordableBtn.color = "#0ff";
            showAffordableBtn.background = "rgba(0, 255, 255, 0.1)";
            showAffordableBtn.thickness = 1;
        });
        
        showAffordableBtn.onPointerClickObservable.add(() => {
            // Показываем только то, что можем купить
            this.filterUnlocked = false;
            this.updateItemList();
            // Обновляем кнопки фильтров
            const filterAll = this.garageContainer!.getChildByName("filterAll") as Button;
            const filterOwned = this.garageContainer!.getChildByName("filterOwned") as Button;
            const filterLocked = this.garageContainer!.getChildByName("filterLocked") as Button;
            if (filterAll) { filterAll.color = "#0aa"; filterAll.background = "#001122"; }
            if (filterOwned) { filterOwned.color = "#0aa"; filterOwned.background = "#001122"; }
            if (filterLocked) { filterLocked.color = "#0f0"; filterLocked.background = "#002200"; }
        });
        quickContainer.addControl(showAffordableBtn);
        
        // Показать статистику категории в терминальном стиле
        const statsBtn = Button.CreateSimpleButton("categoryStats", "STATS");
        statsBtn.width = "100px";
        statsBtn.height = "30px";
        statsBtn.cornerRadius = 0;
        statsBtn.fontFamily = "Consolas, Monaco, monospace";
        statsBtn.color = "#0aa";
        statsBtn.background = "rgba(0, 255, 0, 0.1)";
        statsBtn.thickness = 1;
        statsBtn.fontSize = 10;
        statsBtn.left = "-80px";
        statsBtn.top = "10px";
        
        // Hover эффект для кнопки статистики
        statsBtn.onPointerEnterObservable.add(() => {
            statsBtn.color = "#0ff";
            statsBtn.background = "rgba(0, 255, 255, 0.2)";
            statsBtn.thickness = 2;
        });
        statsBtn.onPointerOutObservable.add(() => {
            statsBtn.color = "#0aa";
            statsBtn.background = "rgba(0, 255, 0, 0.1)";
            statsBtn.thickness = 1;
        });
        
        statsBtn.onPointerClickObservable.add(() => {
            this.showCategoryStats();
        });
        quickContainer.addControl(statsBtn);
    }
    
    // Быстрая покупка самого дешёвого доступного предмета
    private quickPurchase(): void {
        const currency = this.currencyManager.getCurrency();
        let cheapest: TankPart | TankUpgrade | null = null;
        let cheapestCost = Infinity;
        
        // Ищем самый дешёвый доступный предмет в текущей категории
        let items: (TankPart | TankUpgrade)[] = [];
        if (this.currentCategory === "chassis") {
            items = this.chassisParts.filter(p => !p.unlocked && p.cost <= currency);
        } else if (this.currentCategory === "barrel") {
            items = this.cannonParts.filter(p => !p.unlocked && p.cost <= currency);
        } else if (this.currentCategory === "upgrades") {
            items = this.upgrades.filter(u => u.level < u.maxLevel && u.cost <= currency);
        }
        
        items.forEach(item => {
            if (item.cost < cheapestCost) {
                cheapestCost = item.cost;
                cheapest = item;
            }
        });
        
        if (cheapest) {
            this.purchaseItem(cheapest);
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = `[QUICK] Quick buy: ${cheapest.name}`;
                msg.color = "#0f0";
            }
        } else {
            const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
            if (msg) {
                msg.text = "Нет доступных предметов для покупки";
                msg.color = "#ff0";
                setTimeout(() => {
                    if (msg) msg.text = "";
                }, 2000);
            }
        }
    }
    
    // Показать статистику категории
    private showCategoryStats(): void {
        let items: (TankPart | TankUpgrade)[] = [];
        if (this.currentCategory === "chassis") {
            items = this.chassisParts;
        } else if (this.currentCategory === "barrel") {
            items = this.cannonParts;
        } else if (this.currentCategory === "upgrades") {
            items = this.upgrades;
        }
        
        const total = items.length;
        const unlocked = items.filter(i => !("level" in i) ? (i as TankPart).unlocked : (i as TankUpgrade).level > 0).length;
        const locked = total - unlocked;
        const totalCost = items.filter(i => !("level" in i) ? !(i as TankPart).unlocked : (i as TankUpgrade).level < (i as TankUpgrade).maxLevel)
            .reduce((sum, i) => sum + i.cost, 0);
        
        const msg = this.garageContainer!.getChildByName("garageMessage") as TextBlock;
        if (msg) {
            msg.text = `[STATS] Total: ${total} | Unlocked: ${unlocked} | Locked: ${locked} | Total cost: ${totalCost} CR`;
            msg.color = "#0ff";
            setTimeout(() => {
                if (msg) msg.text = "";
            }, 4000);
        }
    }
    
    // Создать панель рекомендаций в терминальном стиле
    private createRecommendationsPanel(): void {
        if (!this.playerProgression || !this.currencyManager) return;
        
        // Удаляем старую панель, если есть
        const oldPanel = this.garageContainer!.getChildByName("recommendationsPanel");
        if (oldPanel) {
            oldPanel.dispose();
        }
        
        const recContainer = new Rectangle("recommendationsPanel");
        recContainer.width = "240px";
        recContainer.height = "120px";
        recContainer.cornerRadius = 0;
        recContainer.thickness = 1;
        recContainer.color = "#0ff";
        recContainer.background = "rgba(0, 0, 0, 0.8)";
        recContainer.left = "-350px";
        recContainer.top = "-230px";
        this.garageContainer!.addControl(recContainer);
        
        const recTitle = new TextBlock("recTitle");
        recTitle.text = "RECOMMENDED";
        recTitle.color = "#0ff";
        recTitle.fontSize = 10;
        recTitle.fontFamily = "Consolas, Monaco, monospace";
        recTitle.fontWeight = "bold";
        recTitle.top = "-55px";
        recTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        recContainer.addControl(recTitle);
        
        // Генерируем рекомендации с приоритетами
        const recommendations: Array<{text: string, priority: number, action?: () => void}> = [];
        const currency = this.currencyManager.getCurrency();
        
        // Рекомендация по валюте - приоритет по соотношению цена/эффективность
        const lockedChassis = this.chassisParts.filter(p => !p.unlocked && p.cost <= currency);
        const lockedCannons = this.cannonParts.filter(p => !p.unlocked && p.cost <= currency);
        const availableUpgrades = this.upgrades.filter(u => u.level < u.maxLevel && u.cost <= currency);
        
        // Сортируем по эффективности (статистика / цена)
        if (lockedChassis.length > 0) {
            const best = lockedChassis.sort((a, b) => {
                const aValue = (a.stats.health || 0) / Math.max(a.cost, 1);
                const bValue = (b.stats.health || 0) / Math.max(b.cost, 1);
                return bValue - aValue;
            })[0];
            recommendations.push({
                text: `[CH] ${best.name} (${best.cost} CR)`,
                priority: 3,
                action: () => {
                    const item = this.chassisParts.find(p => p.id === best.id);
                    if (item) this.purchaseItem(item);
                }
            });
        }
        if (lockedCannons.length > 0) {
            const best = lockedCannons.sort((a, b) => {
                const aValue = (a.stats.damage || 0) / Math.max(a.cost, 1);
                const bValue = (b.stats.damage || 0) / Math.max(b.cost, 1);
                return bValue - aValue;
            })[0];
            recommendations.push({
                text: `[CN] ${best.name} (${best.cost} CR)`,
                priority: 3,
                action: () => {
                    const item = this.cannonParts.find(p => p.id === best.id);
                    if (item) this.purchaseItem(item);
                }
            });
        }
        if (availableUpgrades.length > 0) {
            const best = availableUpgrades.sort((a, b) => {
                const aValue = a.value / Math.max(a.cost, 1);
                const bValue = b.value / Math.max(b.cost, 1);
                return bValue - aValue;
            })[0];
            recommendations.push({
                text: `[UP] ${best.name} (${best.cost} CR)`,
                priority: 2,
                action: () => {
                    const item = this.upgrades.find(u => u.id === best.id);
                    if (item) this.purchaseItem(item);
                }
            });
        }
        
        // Рекомендация по опыту (если есть предметы с низким уровнем)
        if (this.experienceSystem) {
            const lowLevelChassis = this.chassisParts.filter(p => {
                if (!p.unlocked) return false;
                const level = this.experienceSystem!.getChassisLevel(p.id);
                return level < 3;
            });
            if (lowLevelChassis.length > 0) {
                recommendations.push({
                    text: `[XP] Use ${lowLevelChassis[0].name} to level up`,
                    priority: 1
                });
            }
        }
        
        if (recommendations.length === 0) {
            recommendations.push({
                text: "[OK] All items purchased! Great work!",
                priority: 0
            });
        }
        
        // Сортируем по приоритету и показываем до 3 рекомендаций в терминальном стиле - упрощенные
        recommendations.sort((a, b) => b.priority - a.priority);
        recommendations.slice(0, 3).forEach((rec, i) => {
            const recText = new TextBlock(`rec_${i}`);
            recText.text = `> ${rec.text.trim()}`;
            recText.color = rec.priority > 2 ? "#0f0" : rec.priority > 1 ? "#0aa" : "#aaa";
            recText.fontSize = 10;
            recText.fontFamily = "Consolas, Monaco, monospace";
            recText.top = `${-40 + i * 18}px`;
            recText.left = "-110px";
            recText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            recContainer.addControl(recText);
            
            // Делаем кликабельными рекомендации с действиями
            if (rec.action) {
                recText.color = "#0ff";
                recText.onPointerClickObservable.add(() => {
                    if (rec.action) rec.action();
                });
            }
        });
    }
    
    // Обновить прогресс-бары опыта в списке предметов
    private updateExperienceBars(): void {
        if (!this.itemList || !this.experienceSystem) return;
        
        // Получаем текущий список предметов с учетом фильтров
        let allItems: (TankPart | TankUpgrade)[] = [];
        if (this.currentCategory === "chassis") {
            allItems = this.chassisParts;
        } else if (this.currentCategory === "barrel") {
            allItems = this.cannonParts;
        } else {
            return; // Для upgrades нет опыта
        }
        
        // Применяем фильтры (как в updateItemList)
        let items = [...allItems];
        if (this.searchText && this.searchText.trim() !== "") {
            const searchLower = this.searchText.toLowerCase();
            items = items.filter(item => 
                item.name.toLowerCase().includes(searchLower) ||
                item.description.toLowerCase().includes(searchLower)
            );
        }
        if (this.filterUnlocked !== null) {
            items = items.filter(item => {
                if ("level" in item) {
                    return this.filterUnlocked ? (item as TankUpgrade).level > 0 : (item as TankUpgrade).level === 0;
                } else {
                    return (item as TankPart).unlocked === this.filterUnlocked;
                }
            });
        }
        
        // Обновляем каждый элемент в списке
        items.forEach((item, displayIndex) => {
            if ("level" in item) return; // Это upgrade, не часть
            
            const part = item as TankPart;
            const expType = part.type === "chassis" ? "chassis" : "cannon";
            const expInfo = expType === "chassis" 
                ? this.experienceSystem.getChassisExperience(part.id)
                : this.experienceSystem.getCannonExperience(part.id);
            
            if (!expInfo) return;
            
            const progressData = this.experienceSystem.getExperienceToNextLevel(expInfo);
            const levelInfo = this.experienceSystem.getLevelInfo(part.id, expType);
            
            // Находим контейнер элемента по индексу отображения
            const itemContainer = this.itemList.getChildByName(`item_${displayIndex}`) as Rectangle;
            if (!itemContainer) return;
            
            // Обновляем прогресс-бар с плавной анимацией
            const expBarBg = itemContainer.getChildByName(`expBarBg_${displayIndex}`) as Rectangle;
            if (expBarBg) {
                const expBarFill = expBarBg.getChildByName(`expBarFill_${displayIndex}`) as Rectangle;
                if (expBarFill) {
                    // Используем ту же ширину, что и при создании (198px для fill, 200px для bg)
                    const targetWidth = Math.max(1, Math.min(198, progressData.progress * 198));
                    const currentWidth = parseFloat(expBarFill.width.toString().replace("px", "")) || 0;
                    
                    // Плавная интерполяция к целевому значению
                    if (Math.abs(targetWidth - currentWidth) > 0.5) {
                        const diff = targetWidth - currentWidth;
                        const newWidth = currentWidth + diff * 0.2; // Плавное приближение
                        expBarFill.width = `${Math.max(1, Math.min(198, newWidth))}px`;
                    } else {
                        expBarFill.width = `${targetWidth}px`;
                    }
                    
                    // Обновляем цвет в зависимости от уровня
                    if (levelInfo?.titleColor) {
                        expBarFill.background = levelInfo.titleColor;
                    }
                }
            }
            
            // Обновляем текст опыта (правильный формат согласно плану)
            const expText = itemContainer.getChildByName(`expText_${displayIndex}`) as TextBlock;
            if (expText) {
                const expToNext = this.experienceSystem.getExpToNextLevel(part.id, expType);
                const levelTitle = levelInfo?.title || `Lv.${expInfo.level}`;
                const expValue = expInfo.experience;
                const nextText = expToNext > 0 ? `Next: ${expToNext}` : "MAX";
                expText.text = `${levelTitle} | ${expValue} XP | ${nextText}`;
            }
            
            // Обновляем статистику (убийства, урон)
            const statsText = itemContainer.getChildByName(`statsText_${displayIndex}`) as TextBlock;
            if (statsText) {
                const deaths = (expInfo as any).deaths || 0;
                const kdr = deaths > 0 ? (expInfo.kills / deaths).toFixed(2) : expInfo.kills > 0 ? "INF" : "0.00";
                statsText.text = `KILLS: ${expInfo.kills} | DMG: ${Math.round(expInfo.damageDealt)} | K/D: ${kdr}`;
            }
            
            // Обновляем уровень в названии
            const nameText = itemContainer.getChildByName(`itemName_${displayIndex}`) as TextBlock;
            if (nameText) {
                const level = expType === "chassis" 
                    ? this.experienceSystem.getChassisLevel(part.id)
                    : this.experienceSystem.getCannonLevel(part.id);
                const levelInfo = this.experienceSystem.getLevelInfo(part.id, expType);
                const levelSuffix = level > 1 ? ` [${levelInfo?.title || `Lv.${level}`}]` : "";
                
                // Сохраняем префикс (ASCII формат: > или +)
                const currentText = nameText.text;
                let prefix = "";
                let icon = "";
                
                // Определяем префикс и иконку как в updateItemList
                if (!("level" in item)) {
                    const part = item as TankPart;
                    if (part.type === "chassis") {
                        icon = "[CH] ";
                    } else if (part.type === "barrel") {
                        icon = "[CN] ";
                    }
                } else {
                    icon = "[UP] ";
                }
                
                const isSelected = !("level" in item) && 
                    ((item as TankPart).type === "chassis" ? (item as TankPart).id === this.currentChassisId :
                     (item as TankPart).type === "barrel" ? (item as TankPart).id === this.currentCannonId : false);
                
                if (isSelected) {
                    prefix = "> ";
                } else if (!("level" in item) && (item as TankPart).unlocked) {
                    prefix = "+ ";
                }
                
                nameText.text = `${prefix}${icon}${item.name}${levelSuffix}`;
            }
        });
    }
    
    // Получить GUI texture для проверки видимости
    getGUI(): AdvancedDynamicTexture | null {
        return this.guiTexture;
    }
    
    // Подсветить выбранный элемент (клавиатурная навигация)
    private highlightSelectedItem(): void {
        if (!this.itemList) return;
        
        // Обновляем все элементы для подсветки выбранного
        this.itemList.children.forEach((child: any, i: number) => {
            if (child.name && child.name.startsWith("item_")) {
                const itemIndex = parseInt(child.name.split("_")[1]);
                const isKeyboardSelected = itemIndex === this.selectedItemIndex;
                const item = this.filteredItems[itemIndex];
                
                if (item) {
                    let isSelected = false;
                    if (!("level" in item)) {
                        const part = item as TankPart;
                        if (part.type === "chassis") {
                            isSelected = part.id === this.currentChassisId;
                        } else if (part.type === "barrel") {
                            isSelected = part.id === this.currentCannonId;
                        }
                    }
                    
                    // Обновляем цвета в зависимости от состояния - улучшенная визуальная обратная связь
                    if (isSelected) {
                        child.color = "#ff0";
                        child.background = "rgba(255, 255, 0, 0.25)"; // Более заметный фон
                        child.thickness = 3; // Увеличенная толщина для акцента
                    } else if (isKeyboardSelected) {
                        child.color = "#0ff";
                        child.background = "rgba(0, 255, 255, 0.3)"; // Более заметный фон для клавиатурной навигации
                        child.thickness = 3; // Увеличенная толщина для акцента
                    } else if (item.unlocked || (item as TankUpgrade).level > 0) {
                        child.color = "#0f0";
                        child.background = "rgba(0, 255, 0, 0.08)";
                        child.thickness = 1;
                    } else {
                        child.color = "#055";
                        child.background = "rgba(0, 0, 0, 0.6)";
                        child.thickness = 1;
                    }
                }
            }
        });
    }
    
    // Прокрутить к выбранному элементу
    private scrollToSelectedItem(): void {
        if (!this.scrollViewer || !this.itemList || this.selectedItemIndex < 0) return;
        
        const itemHeight = 100;
        const spacing = 10; // Обновлено для соответствия новому spacing
        const itemTop = this.selectedItemIndex * (itemHeight + spacing);
        const scrollViewerHeight = 450;
        
        // Вычисляем позицию прокрутки
        const scrollPosition = Math.max(0, itemTop - scrollViewerHeight / 2 + itemHeight / 2);
        
        // Устанавливаем позицию прокрутки
        if (this.scrollViewer.verticalBar) {
            const maxScroll = Math.max(0, (this.itemList.heightInPixels || 0) - scrollViewerHeight);
            const normalizedScroll = maxScroll > 0 ? scrollPosition / maxScroll : 0;
            this.scrollViewer.verticalBar.value = Math.max(0, Math.min(1, normalizedScroll));
        }
    }
    
    // Создать визуальные прогресс-бары для статистики
    private createStatBars(container: Rectangle, index: number, stats: { [key: string]: { value: number, max: number, diff: number, label: string } }): void {
        const barY = 60;
        const barWidth = 150;
        const barHeight = 6;
        let barIndex = 0;
        
        Object.entries(stats).forEach(([key, stat]) => {
            const percent = Math.min(1, stat.value / stat.max);
            const barX = -400 + (barIndex * (barWidth + 20));
            
            // Фон прогресс-бара
            const barBg = new Rectangle(`statBarBg_${index}_${key}`);
            barBg.width = `${barWidth}px`;
            barBg.height = `${barHeight}px`;
            barBg.cornerRadius = 0;
            barBg.thickness = 1;
            barBg.color = "#0a0";
            barBg.background = "rgba(0, 0, 0, 0.8)";
            barBg.left = `${barX}px`;
            barBg.top = `${barY}px`;
            barBg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            container.addControl(barBg);
            
            // Заполнение прогресс-бара
            const barFill = new Rectangle(`statBarFill_${index}_${key}`);
            barFill.width = `${barWidth * percent}px`;
            barFill.height = `${barHeight - 2}px`;
            barFill.cornerRadius = 0;
            barFill.thickness = 0;
            // Цвет зависит от разницы: зеленый если лучше, красный если хуже
            if (stat.diff > 0) {
                barFill.background = "#0f0"; // Улучшение
            } else if (stat.diff < 0) {
                barFill.background = "#f00"; // Ухудшение
            } else {
                barFill.background = "#0aa"; // Без изменений
            }
            barFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            barBg.addControl(barFill);
            
            // Текст со значением и индикатором изменения
            const statText = new TextBlock(`statText_${index}_${key}`);
            let diffIcon = "";
            if (stat.diff > 0) diffIcon = " ↑";
            else if (stat.diff < 0) diffIcon = " ↓";
            statText.text = `${stat.label}: ${stat.value.toFixed(stat.label === "Reload" ? 1 : 0)}${diffIcon}`;
            statText.color = stat.diff > 0 ? "#0f0" : stat.diff < 0 ? "#f00" : "#aaa";
            statText.fontSize = 10;
            statText.fontFamily = "Consolas, Monaco, monospace";
            statText.left = `${barX}px`;
            statText.top = `${barY - 12}px`;
            statText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            container.addControl(statText);
            
            barIndex++;
        });
    }
    
    // Добавить действие в историю
    private addToHistory(type: string, text: string): void {
        this.actionHistory.unshift({
            type,
            text,
            timestamp: Date.now()
        });
        
        // Ограничиваем размер истории
        if (this.actionHistory.length > this.maxHistoryItems) {
            this.actionHistory = this.actionHistory.slice(0, this.maxHistoryItems);
        }
        
        // Обновляем панель истории
        this.updateActionHistoryPanel();
    }
    
    // Создать панель истории действий
    private createActionHistoryPanel(): void {
        const historyContainer = new Rectangle("actionHistoryPanel");
        historyContainer.width = "240px";
        historyContainer.height = "100px";
        historyContainer.cornerRadius = 0;
        historyContainer.thickness = 1;
        historyContainer.color = "#0aa";
        historyContainer.background = "rgba(0, 0, 0, 0.8)";
        historyContainer.left = "-350px";
        historyContainer.top = "250px";
        this.garageContainer!.addControl(historyContainer);
        
        const historyTitle = new TextBlock("historyTitle");
        historyTitle.text = "ACTIONS";
        historyTitle.color = "#0aa";
        historyTitle.fontSize = 10;
        historyTitle.fontFamily = "Consolas, Monaco, monospace";
        historyTitle.fontWeight = "bold";
        historyTitle.top = "-45px";
        historyTitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
        historyContainer.addControl(historyTitle);
        
        // Контейнер для элементов истории - упрощенный
        const historyList = new Rectangle("historyList");
        historyList.width = "220px";
        historyList.height = "80px";
        historyList.cornerRadius = 0;
        historyList.thickness = 0;
        historyList.background = "#00000000";
        historyList.top = "-35px";
        historyContainer.addControl(historyList);
        
        this.updateActionHistoryPanel();
    }
    
    // Обновить панель истории действий
    private updateActionHistoryPanel(): void {
        if (!this.garageContainer) return;
        
        const historyList = this.garageContainer.getChildByName("historyList") as Rectangle;
        if (!historyList) return;
        
        // Очищаем старые элементы
        if (historyList.children) {
            historyList.children.forEach((child: any) => child.dispose());
        }
        
        // Добавляем элементы истории - упрощенные (максимум 4)
        this.actionHistory.slice(0, 4).forEach((action, i) => {
            const historyItem = new TextBlock(`historyItem_${i}`);
            const timeAgo = Math.floor((Date.now() - action.timestamp) / 1000);
            const timeText = timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`;
            historyItem.text = `${action.text.trim()} [${timeText}]`;
            historyItem.color = action.type === "purchase" ? "#0f0" : action.type === "upgrade" ? "#0ff" : "#aaa";
            historyItem.fontSize = 10;
            historyItem.fontFamily = "Consolas, Monaco, monospace";
            historyItem.top = `${i * 16}px`;
            historyItem.left = "-110px";
            historyItem.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
            historyList.addControl(historyItem);
        });
        
        // Если истории нет, показываем сообщение
        if (this.actionHistory.length === 0) {
            const emptyText = new TextBlock("historyEmpty");
            emptyText.text = "No actions";
            emptyText.color = "#666";
            emptyText.fontSize = 10;
            emptyText.fontFamily = "Consolas, Monaco, monospace";
            emptyText.top = "35px";
            emptyText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
            historyList.addControl(emptyText);
        }
    }
    
    // Упрощенный визуальный эффект при покупке (без лишних анимаций)
    private createPurchaseEffect(container: Rectangle | null, color: string): void {
        if (!container || !this.garageContainer) return;
        
        // Простая вспышка без частиц
        const originalBg = container.background;
        const flashColor = color === "#0f0" ? "rgba(0, 255, 0, 0.3)" : "rgba(255, 255, 0, 0.3)";
        container.background = flashColor;
        setTimeout(() => {
            if (container) container.background = originalBg;
        }, 200);
    }
}
