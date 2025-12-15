/**
 * Cheat Menu - Меню читов для разработки и тестирования
 */

import { TankController } from "./tankController";
import { Game } from "./game";
import { Vector3 } from "@babylonjs/core";

export interface Cheat {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    toggle: () => void;
    category: "combat" | "movement" | "resources" | "debug" | "other";
}

export class CheatMenu {
    private container!: HTMLDivElement;
    private visible = false;
    private tank: TankController | null = null;
    private game: Game | null = null;
    private cheats: Map<string, Cheat> = new Map();
    
    constructor() {
        this.createUI();
        this.setupToggle();
        this.initializeCheats();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    setTank(tank: TankController | null): void {
        this.tank = tank;
    }
    
    setGame(game: Game): void {
        this.game = game;
    }
    
    private initializeCheats(): void {
        // БОЕВЫЕ ЧИТЫ
        this.addCheat({
            id: "godmode",
            name: "Бессмертие",
            description: "Игрок не получает урон",
            enabled: false,
            category: "combat",
            toggle: () => {
                const cheat = this.cheats.get("godmode")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank) {
                    (this.tank as any).godMode = cheat.enabled;
                }
                this.updateCheatUI("godmode");
            }
        });
        
        this.addCheat({
            id: "infiniteAmmo",
            name: "Бесконечные патроны",
            description: "Нет перезарядки",
            enabled: false,
            category: "combat",
            toggle: () => {
                const cheat = this.cheats.get("infiniteAmmo")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank) {
                    (this.tank as any).infiniteAmmo = cheat.enabled;
                }
                this.updateCheatUI("infiniteAmmo");
            }
        });
        
        this.addCheat({
            id: "oneShotKill",
            name: "Одним выстрелом",
            description: "Убивает врагов одним выстрелом",
            enabled: false,
            category: "combat",
            toggle: () => {
                const cheat = this.cheats.get("oneShotKill")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank) {
                    (this.tank as any).oneShotKill = cheat.enabled;
                }
                this.updateCheatUI("oneShotKill");
            }
        });
        
        // ДВИЖЕНИЕ
        this.addCheat({
            id: "superSpeed",
            name: "Супер скорость",
            description: "Увеличивает скорость движения в 3 раза",
            enabled: false,
            category: "movement",
            toggle: () => {
                const cheat = this.cheats.get("superSpeed")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank) {
                    if (cheat.enabled) {
                        (this.tank as any).originalMoveSpeed = this.tank.moveSpeed;
                        this.tank.moveSpeed *= 3;
                    } else {
                        this.tank.moveSpeed = (this.tank as any).originalMoveSpeed || this.tank.moveSpeed / 3;
                    }
                }
                this.updateCheatUI("superSpeed");
            }
        });
        
        this.addCheat({
            id: "noClip",
            name: "Проход сквозь стены",
            description: "Танк проходит сквозь препятствия",
            enabled: false,
            category: "movement",
            toggle: () => {
                const cheat = this.cheats.get("noClip")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank && this.tank.physicsBody) {
                    if (cheat.enabled) {
                        this.tank.physicsBody.setCollisionCallbackEnabled(false);
                    } else {
                        this.tank.physicsBody.setCollisionCallbackEnabled(true);
                    }
                }
                this.updateCheatUI("noClip");
            }
        });
        
        this.addCheat({
            id: "fly",
            name: "Полёт",
            description: "Танк может летать",
            enabled: false,
            category: "movement",
            toggle: () => {
                const cheat = this.cheats.get("fly")!;
                cheat.enabled = !cheat.enabled;
                if (this.tank) {
                    (this.tank as any).flyMode = cheat.enabled;
                }
                this.updateCheatUI("fly");
            }
        });
        
        // РЕСУРСЫ
        this.addCheat({
            id: "addCredits",
            name: "Добавить кредиты",
            description: "Добавляет 10000 кредитов",
            enabled: false,
            category: "resources",
            toggle: () => {
                if (this.game && (this.game as any).currencyManager) {
                    (this.game as any).currencyManager.addCurrency(10000);
                    alert("Добавлено 10000 кредитов!");
                }
            }
        });
        
        this.addCheat({
            id: "addXP",
            name: "Добавить опыт",
            description: "Добавляет 1000 опыта",
            enabled: false,
            category: "resources",
            toggle: () => {
                if (this.game && (this.game as any).playerProgression) {
                    (this.game as any).playerProgression.addExperience(1000, "cheat");
                    alert("Добавлено 1000 опыта!");
                }
            }
        });
        
        this.addCheat({
            id: "fullHealth",
            name: "Полное здоровье",
            description: "Восстанавливает здоровье до максимума",
            enabled: false,
            category: "resources",
            toggle: () => {
                if (this.tank) {
                    this.tank.currentHealth = this.tank.maxHealth;
                    alert("Здоровье восстановлено!");
                }
            }
        });
        
        // ОТЛАДКА
        this.addCheat({
            id: "spawnEnemy",
            name: "Заспавнить врага",
            description: "Создаёт врага рядом с игроком",
            enabled: false,
            category: "debug",
            toggle: async () => {
                if (this.game && this.tank) {
                    const { Vector3 } = await import("@babylonjs/core");
                    const pos = this.tank.chassis.absolutePosition;
                    const spawnPos = pos.add(new Vector3(10, 0, 10));
                    if ((this.game as any).enemyManager) {
                        (this.game as any).enemyManager.spawnEnemyTank(spawnPos);
                        alert("Враг заспавнен!");
                    }
                }
            }
        });
        
        this.addCheat({
            id: "killAllEnemies",
            name: "Убить всех врагов",
            description: "Уничтожает всех врагов на карте",
            enabled: false,
            category: "debug",
            toggle: () => {
                if (this.game && (this.game as any).enemyTanks) {
                    (this.game as any).enemyTanks.forEach((enemy: any) => {
                        if (enemy.takeDamage) {
                            enemy.takeDamage(99999);
                        }
                    });
                    alert("Все враги уничтожены!");
                }
            }
        });
        
        // НОВЫЕ ЧИТЫ
        
        // Телепорт
        this.addCheat({
            id: "teleport",
            name: "Телепорт",
            description: "Телепортирует танк в указанные координаты",
            enabled: false,
            category: "debug",
            toggle: () => {
                if (!this.tank || !this.game) {
                    alert("Танк или игра не инициализированы!");
                    return;
                }
                
                const x = prompt("X координата:", "0");
                const y = prompt("Y координата:", "2");
                const z = prompt("Z координата:", "0");
                
                if (x !== null && y !== null && z !== null) {
                    const posX = parseFloat(x);
                    const posY = parseFloat(y);
                    const posZ = parseFloat(z);
                    
                    if (!isNaN(posX) && !isNaN(posY) && !isNaN(posZ)) {
                        this.tank.chassis.position = new Vector3(posX, posY, posZ);
                        if (this.tank.physicsBody) {
                            this.tank.physicsBody.setTargetTransform(
                                this.tank.chassis.position,
                                this.tank.chassis.rotationQuaternion!
                            );
                        }
                        if (this.game.hud) {
                            this.game.hud.showMessage(`Телепорт: (${posX.toFixed(1)}, ${posY.toFixed(1)}, ${posZ.toFixed(1)})`, "#0f0", 2000);
                        }
                    } else {
                        alert("Неверные координаты!");
                    }
                }
            }
        });
        
        // Спавн врага (улучшенная версия)
        this.addCheat({
            id: "spawnEnemyNear",
            name: "Спавн врага рядом",
            description: "Создаёт врага рядом с игроком",
            enabled: false,
            category: "debug",
            toggle: async () => {
                if (!this.game || !this.tank) {
                    alert("Игра или танк не инициализированы!");
                    return;
                }
                
                const { Vector3 } = await import("@babylonjs/core");
                const { EnemyTank } = await import("./enemyTank");
                
                const pos = this.tank.chassis.absolutePosition;
                const offset = new Vector3(
                    (Math.random() - 0.5) * 20,
                    0.6,
                    (Math.random() - 0.5) * 20
                );
                const spawnPos = pos.add(offset);
                
                if (this.game.scene && this.game.soundManager && this.game.effectsManager) {
                    const difficulty = (this.game.mainMenu as any)?.getSettings()?.enemyDifficulty || "medium";
                    const enemyTank = new EnemyTank(
                        this.game.scene,
                        spawnPos,
                        this.game.soundManager,
                        this.game.effectsManager,
                        difficulty
                    );
                    
                    if (this.tank) {
                        enemyTank.setTarget(this.tank);
                    }
                    
                    if ((this.game as any).enemyTanks) {
                        (this.game as any).enemyTanks.push(enemyTank);
                    }
                    
                    if (this.game.hud) {
                        this.game.hud.showMessage("Враг заспавнен!", "#0f0", 2000);
                    }
                }
            }
        });
        
        // Разблокировать все
        this.addCheat({
            id: "unlockAll",
            name: "Разблокировать всё",
            description: "Разблокирует все улучшения и оружие",
            enabled: false,
            category: "resources",
            toggle: () => {
                if (!this.game) {
                    alert("Игра не инициализирована!");
                    return;
                }
                
                // Разблокируем все через playerProgression
                if ((this.game as any).playerProgression) {
                    const progression = (this.game as any).playerProgression;
                    // Разблокируем все уровни и улучшения
                    if (progression.unlockAll) {
                        progression.unlockAll();
                    } else {
                        // Fallback: устанавливаем высокий уровень
                        progression.level = 50;
                        progression.experience = 999999;
                    }
                }
                
                // Разблокируем все оружие через garage
                if ((this.game as any).garage) {
                    const garage = (this.game as any).garage;
                    if (garage.unlockAllWeapons) {
                        garage.unlockAllWeapons();
                    }
                }
                
                // Обновляем HUD
                if (this.game.hud) {
                    this.game.hud.showMessage("Всё разблокировано!", "#0f0", 3000);
                }
                
                alert("Все улучшения и оружие разблокированы!");
            }
        });
        
        // Бесконечные ресурсы
        this.addCheat({
            id: "infiniteResources",
            name: "Бесконечные ресурсы",
            description: "Бесконечные кредиты и опыт",
            enabled: false,
            category: "resources",
            toggle: () => {
                const cheat = this.cheats.get("infiniteResources")!;
                cheat.enabled = !cheat.enabled;
                
                if (this.game) {
                    (this.game as any).infiniteCredits = cheat.enabled;
                    (this.game as any).infiniteXP = cheat.enabled;
                    
                    if (cheat.enabled) {
                        // Устанавливаем флаги для предотвращения уменьшения ресурсов
                        if ((this.game as any).currencyManager) {
                            const originalAdd = (this.game as any).currencyManager.addCurrency;
                            (this.game as any).currencyManager.addCurrency = (amount: number) => {
                                // Не уменьшаем, только добавляем
                                if (amount > 0) {
                                    originalAdd.call((this.game as any).currencyManager, amount);
                                }
                            };
                        }
                        
                        if (this.game.hud) {
                            this.game.hud.showMessage("Бесконечные ресурсы: ВКЛ", "#0f0", 2000);
                        }
                    } else {
                        // Восстанавливаем оригинальные методы
                        if ((this.game as any).currencyManager && (this.game as any).currencyManager._originalAddCurrency) {
                            (this.game as any).currencyManager.addCurrency = (this.game as any).currencyManager._originalAddCurrency;
                        }
                        
                        if (this.game.hud) {
                            this.game.hud.showMessage("Бесконечные ресурсы: ВЫКЛ", "#f00", 2000);
                        }
                    }
                }
                
                this.updateCheatUI("infiniteResources");
            }
        });
    }
    
    private addCheat(cheat: Cheat): void {
        this.cheats.set(cheat.id, cheat);
    }
    
    private createUI(): void {
        this.container = document.createElement("div");
        this.container.id = "cheat-menu";
        this.container.className = "panel-overlay";
        
        const categories = ["combat", "movement", "resources", "debug", "other"];
        const categoryNames: { [key: string]: string } = {
            combat: "⚔ БОЕВЫЕ",
            movement: "🏃 ДВИЖЕНИЕ",
            resources: "💰 РЕСУРСЫ",
            debug: "🐛 ОТЛАДКА",
            other: "🔧 ПРОЧЕЕ"
        };
        
        let html = `
            <div class="panel" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <div class="panel-header">
                    <div class="panel-title">МЕНЮ ЧИТОВ [F7]</div>
                    <button class="panel-close" id="cheat-menu-close">✕</button>
                </div>
                <div class="panel-content">
        `;
        
        categories.forEach(category => {
            const categoryCheats = Array.from(this.cheats.values()).filter(c => c.category === category);
            if (categoryCheats.length === 0) return;
            
            html += `<div class="cheat-category">
                <div class="cheat-category-title">${categoryNames[category]}</div>
            `;
            
            categoryCheats.forEach(cheat => {
                html += `
                    <div class="cheat-item" data-cheat-id="${cheat.id}">
                        <div class="cheat-info">
                            <div class="cheat-name">${cheat.name}</div>
                            <div class="cheat-desc">${cheat.description}</div>
                        </div>
                        <label class="cheat-toggle">
                            <input type="checkbox" id="cheat-${cheat.id}" ${cheat.enabled ? "checked" : ""}>
                            <span class="cheat-slider"></span>
                        </label>
                    </div>
                `;
            });
            
            html += `</div>`;
        });
        
        html += `
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
        
        const style = document.createElement("style");
        style.textContent = `
            #cheat-menu {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10001;
            }
            
            #cheat-menu.hidden {
                display: none;
            }
            
            .cheat-category {
                margin-bottom: 20px;
            }
            
            .cheat-category-title {
                font-size: 14px;
                color: #0f0;
                margin-bottom: 10px;
                padding-bottom: 5px;
                border-bottom: 1px solid #0f04;
            }
            
            .cheat-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                margin-bottom: 8px;
                background: rgba(0, 255, 0, 0.05);
                border: 1px solid #0f04;
                border-radius: 4px;
            }
            
            .cheat-info {
                flex: 1;
            }
            
            .cheat-name {
                font-size: 12px;
                color: #0f0;
                font-weight: bold;
                margin-bottom: 4px;
            }
            
            .cheat-desc {
                font-size: 10px;
                color: #7f7;
            }
            
            .cheat-toggle {
                position: relative;
                display: inline-block;
                width: 50px;
                height: 24px;
            }
            
            .cheat-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .cheat-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #333;
                transition: 0.3s;
                border-radius: 24px;
                border: 1px solid #0f0;
            }
            
            .cheat-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 2px;
                bottom: 2px;
                background-color: #0f0;
                transition: 0.3s;
                border-radius: 50%;
            }
            
            .cheat-toggle input:checked + .cheat-slider {
                background-color: #0f0;
            }
            
            .cheat-toggle input:checked + .cheat-slider:before {
                transform: translateX(26px);
                background-color: #000;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        // Обработчики для чекбоксов
        this.cheats.forEach((cheat, id) => {
            const checkbox = document.getElementById(`cheat-${id}`) as HTMLInputElement;
            if (checkbox) {
                checkbox.addEventListener("change", () => {
                    cheat.toggle();
                });
            }
        });
        
        // Закрытие по клику на фон
        this.container.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
        
        // Закрытие по кнопке
        document.getElementById("cheat-menu-close")?.addEventListener("click", () => {
            this.hide();
        });
    }
    
    private updateCheatUI(cheatId: string): void {
        const cheat = this.cheats.get(cheatId);
        if (!cheat) return;
        
        const checkbox = document.getElementById(`cheat-${cheatId}`) as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = cheat.enabled;
        }
    }
    
    private setupToggle(): void {
        window.addEventListener("keydown", (e) => {
            if (e.code === "F7") {
                e.preventDefault();
                e.stopPropagation();
                if (!this.container) {
                    console.warn("[CheatMenu] Container not initialized!");
                    return;
                }
                this.toggle();
            }
        });
    }
    
    toggle(): void {
        if (!this.container) {
            console.warn("[CheatMenu] Cannot toggle: container not initialized");
            return;
        }
        
        this.visible = !this.visible;
        console.log(`[CheatMenu] Toggle: ${this.visible ? 'show' : 'hide'}`);
        
        if (this.visible) {
            this.show();
        } else {
            this.hide();
        }
    }
    
    show(): void {
        this.visible = true;
        this.container.classList.remove("hidden");
        this.container.style.display = "flex";
    }
    
    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    dispose(): void {
        this.container.remove();
    }
}

