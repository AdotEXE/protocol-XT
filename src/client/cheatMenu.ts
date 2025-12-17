/**
 * Cheat Menu - Меню читов для разработки и тестирования
 */

import { TankController } from "./tankController";
import { Game } from "./game";
import { Vector3 } from "@babylonjs/core";
import { EnemyTank } from "./enemyTank";

export interface Cheat {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    toggle: () => void;
    category: "combat" | "movement" | "resources" | "debug" | "world" | "time" | "visual" | "other";
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
        
        // === МИР ===
        this.addCheat({
            id: "teleport",
            name: "Телепортация",
            description: "Телепортироваться к координатам",
            enabled: false,
            category: "world",
            toggle: () => {
                const x = prompt("X:");
                const y = prompt("Y:");
                const z = prompt("Z:");
                if (x && y && z && this.tank && this.tank.chassis) {
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
                        if (this.game?.hud) {
                            this.game.hud.showMessage(`Телепорт: (${posX.toFixed(1)}, ${posY.toFixed(1)}, ${posZ.toFixed(1)})`, "#0f0", 2000);
                        }
                    }
                }
            }
        });
        
        // === ВРЕМЯ ===
        this.addCheat({
            id: "slowMotion",
            name: "Замедление времени",
            description: "Замедлить время в 2 раза",
            enabled: false,
            category: "time",
            toggle: () => {
                const cheat = this.cheats.get("slowMotion")!;
                cheat.enabled = !cheat.enabled;
                if (this.game && this.game.scene) {
                    const timeScale = cheat.enabled ? 0.5 : 1.0;
                    (this.game.scene as any).timeScale = timeScale;
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "Замедление времени: ВКЛ" : "Замедление времени: ВЫКЛ", cheat.enabled ? "#0f0" : "#f00", 2000);
                    }
                }
                this.updateCheatUI("slowMotion");
            }
        });
        
        this.addCheat({
            id: "fastForward",
            name: "Ускорение времени",
            description: "Ускорить время в 2 раза",
            enabled: false,
            category: "time",
            toggle: () => {
                const cheat = this.cheats.get("fastForward")!;
                cheat.enabled = !cheat.enabled;
                if (this.game && this.game.scene) {
                    const timeScale = cheat.enabled ? 2.0 : 1.0;
                    (this.game.scene as any).timeScale = timeScale;
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "Ускорение времени: ВКЛ" : "Ускорение времени: ВЫКЛ", cheat.enabled ? "#0f0" : "#f00", 2000);
                    }
                }
                this.updateCheatUI("fastForward");
            }
        });
        
        // === ВИЗУАЛЬНЫЕ ===
        this.addCheat({
            id: "wireframe",
            name: "Каркасный режим",
            description: "Показать каркас всех объектов",
            enabled: false,
            category: "visual",
            toggle: () => {
                const cheat = this.cheats.get("wireframe")!;
                cheat.enabled = !cheat.enabled;
                if (this.game && this.game.scene) {
                    this.game.scene.meshes.forEach(mesh => {
                        if (mesh.material) {
                            (mesh.material as any).wireframe = cheat.enabled;
                        }
                    });
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "Каркасный режим: ВКЛ" : "Каркасный режим: ВЫКЛ", cheat.enabled ? "#0f0" : "#f00", 2000);
                    }
                }
                this.updateCheatUI("wireframe");
            }
        });
        
        this.addCheat({
            id: "noFog",
            name: "Без тумана",
            description: "Отключить туман",
            enabled: false,
            category: "visual",
            toggle: () => {
                const cheat = this.cheats.get("noFog")!;
                cheat.enabled = !cheat.enabled;
                if (this.game && this.game.scene) {
                    this.game.scene.fogEnabled = !cheat.enabled;
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "Туман: ВЫКЛ" : "Туман: ВКЛ", cheat.enabled ? "#0f0" : "#f00", 2000);
                    }
                }
                this.updateCheatUI("noFog");
            }
        });
        
        this.addCheat({
            id: "showBounds",
            name: "Показать границы",
            description: "Показать границы объектов",
            enabled: false,
            category: "visual",
            toggle: () => {
                const cheat = this.cheats.get("showBounds")!;
                cheat.enabled = !cheat.enabled;
                if (this.game && this.game.scene) {
                    this.game.scene.meshes.forEach(mesh => {
                        mesh.showBoundingBox = cheat.enabled;
                    });
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "Границы: ВКЛ" : "Границы: ВЫКЛ", cheat.enabled ? "#0f0" : "#f00", 2000);
                    }
                }
                this.updateCheatUI("showBounds");
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
        
        const categories = ["combat", "movement", "resources", "debug", "world", "time", "visual", "other"];
        const categoryNames: { [key: string]: string } = {
            combat: "⚔ БОЕВЫЕ",
            movement: "🏃 ДВИЖЕНИЕ",
            resources: "💰 РЕСУРСЫ",
            debug: "🐛 ОТЛАДКА",
            world: "🌍 МИР",
            time: "⏰ ВРЕМЯ",
            visual: "👁 ВИЗУАЛЬНЫЕ",
            other: "🔧 ПРОЧЕЕ"
        };
        
        let html = `
            <div class="panel" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
                <div class="panel-header">
                    <div class="panel-title">МЕНЮ ЧИТОВ [Ctrl+7]</div>
                    <button class="panel-close" id="cheat-menu-close">✕</button>
                </div>
                <div class="panel-content">
                    <div class="cheat-profiles" style="margin-bottom: 15px; padding: 10px; background: rgba(0, 20, 0, 0.3); border: 1px solid rgba(0, 255, 4, 0.3); border-radius: 4px;">
                        <div style="color: #ff0; font-weight: bold; margin-bottom: 8px;">ПРОФИЛИ ЧИТОВ</div>
                        <div style="display: flex; gap: 5px; margin-bottom: 8px;">
                            <button id="cheat-save-profile" style="padding: 4px 8px; background: rgba(0, 255, 4, 0.2); border: 1px solid rgba(0, 255, 4, 0.6); color: #0f0; cursor: pointer; font-size: 11px;">Сохранить</button>
                            <button id="cheat-load-profile" style="padding: 4px 8px; background: rgba(0, 255, 4, 0.2); border: 1px solid rgba(0, 255, 4, 0.6); color: #0f0; cursor: pointer; font-size: 11px;">Загрузить</button>
                            <button id="cheat-export-profile" style="padding: 4px 8px; background: rgba(0, 255, 4, 0.2); border: 1px solid rgba(0, 255, 4, 0.6); color: #0f0; cursor: pointer; font-size: 11px;">Экспорт</button>
                            <button id="cheat-import-profile" style="padding: 4px 8px; background: rgba(0, 255, 4, 0.2); border: 1px solid rgba(0, 255, 4, 0.6); color: #0f0; cursor: pointer; font-size: 11px;">Импорт</button>
                        </div>
                        <select id="cheat-profiles-list" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 4, 0.4); color: #0f0; font-size: 11px;">
                            <option value="">Выберите профиль...</option>
                        </select>
                    </div>
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
        
        // Обработчики профилей
        document.getElementById("cheat-save-profile")?.addEventListener("click", () => this.saveProfile());
        document.getElementById("cheat-load-profile")?.addEventListener("click", () => this.loadProfile());
        document.getElementById("cheat-export-profile")?.addEventListener("click", () => this.exportProfile());
        document.getElementById("cheat-import-profile")?.addEventListener("click", () => this.importProfile());
        
        // Загрузка списка профилей
        this.updateProfilesList();
    }
    
    
    private setupToggle(): void {
        // F7 обработчик управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
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
    
    /**
     * Сохранение профиля читов
     */
    private saveProfile(): void {
        const name = prompt("Имя профиля:", `Profile_${Date.now()}`);
        if (!name || name.trim() === "") return;
        
        const profile: { [key: string]: boolean } = {};
        this.cheats.forEach((cheat, id) => {
            profile[id] = cheat.enabled;
        });
        
        const profiles = this.loadProfiles();
        profiles[name.trim()] = profile;
        this.saveProfiles(profiles);
        
        this.updateProfilesList();
        if (this.game?.hud) {
            this.game.hud.showMessage(`Профиль "${name}" сохранён`, "#0f0", 2000);
        }
    }
    
    /**
     * Загрузка профиля читов
     */
    private loadProfile(): void {
        const select = document.getElementById("cheat-profiles-list") as HTMLSelectElement;
        if (!select || !select.value) {
            alert("Выберите профиль из списка");
            return;
        }
        
        const profileName = select.value;
        const profiles = this.loadProfiles();
        const profile = profiles[profileName];
        
        if (!profile) {
            alert("Профиль не найден");
            return;
        }
        
        // Применяем профиль
        Object.entries(profile).forEach(([cheatId, enabled]) => {
            const cheat = this.cheats.get(cheatId);
            if (cheat && cheat.enabled !== enabled) {
                cheat.toggle();
            }
        });
        
        this.updateCheatUI();
        if (this.game?.hud) {
            this.game.hud.showMessage(`Профиль "${profileName}" загружен`, "#0f0", 2000);
        }
    }
    
    /**
     * Экспорт профиля
     */
    private exportProfile(): void {
        const select = document.getElementById("cheat-profiles-list") as HTMLSelectElement;
        if (!select || !select.value) {
            alert("Выберите профиль для экспорта");
            return;
        }
        
        const profileName = select.value;
        const profiles = this.loadProfiles();
        const profile = profiles[profileName];
        
        if (!profile) {
            alert("Профиль не найден");
            return;
        }
        
        const data = {
            name: profileName,
            cheats: profile,
            version: "1.0",
            timestamp: Date.now()
        };
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cheat_profile_${profileName}_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    /**
     * Импорт профиля
     */
    private importProfile(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    if (!data.name || !data.cheats) {
                        alert('Неверный формат файла');
                        return;
                    }
                    
                    const profiles = this.loadProfiles();
                    profiles[data.name] = data.cheats;
                    this.saveProfiles(profiles);
                    
                    this.updateProfilesList();
                    if (this.game?.hud) {
                        this.game.hud.showMessage(`Профиль "${data.name}" импортирован`, "#0f0", 2000);
                    }
                } catch (error) {
                    alert('Ошибка при импорте: ' + error);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    
    /**
     * Загрузка профилей из localStorage
     */
    private loadProfiles(): { [key: string]: { [key: string]: boolean } } {
        try {
            const saved = localStorage.getItem('ptx_cheat_profiles');
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (error) {
            console.warn("[CheatMenu] Failed to load profiles:", error);
        }
        return {};
    }
    
    /**
     * Сохранение профилей в localStorage
     */
    private saveProfiles(profiles: { [key: string]: { [key: string]: boolean } }): void {
        try {
            localStorage.setItem('ptx_cheat_profiles', JSON.stringify(profiles));
        } catch (error) {
            console.warn("[CheatMenu] Failed to save profiles:", error);
        }
    }
    
    /**
     * Обновление списка профилей
     */
    private updateProfilesList(): void {
        const select = document.getElementById("cheat-profiles-list") as HTMLSelectElement;
        if (!select) return;
        
        const profiles = this.loadProfiles();
        select.innerHTML = '<option value="">Выберите профиль...</option>';
        
        Object.keys(profiles).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }
    
    /**
     * Обновление UI всех читов
     */
    private updateCheatUI(cheatId?: string): void {
        if (cheatId) {
            const cheat = this.cheats.get(cheatId);
            if (!cheat) return;
            
            const checkbox = document.getElementById(`cheat-${cheatId}`) as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = cheat.enabled;
            }
        } else {
            // Обновляем все читы
            this.cheats.forEach((cheat, id) => {
                const checkbox = document.getElementById(`cheat-${id}`) as HTMLInputElement;
                if (checkbox) {
                    checkbox.checked = cheat.enabled;
                }
            });
        }
    }
    
    isVisible(): boolean {
        return this.visible;
    }
    
    dispose(): void {
        this.container.remove();
    }
}

