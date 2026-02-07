/**
 * Cheat Menu - Меню читов для разработки и тестирования
 */

import { TankController } from "./tankController";
import { Game } from "./game";
import { Vector3, Ray } from "@babylonjs/core";
import { EnemyTank } from "./enemyTank";
import { CommonStyles } from "./commonStyles";
import { inGameAlert, inGamePrompt } from "./utils/inGameDialogs";

export interface Cheat {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    toggle: () => void;
    category: "combat" | "movement" | "resources" | "debug" | "world" | "time" | "visual" | "other";
    type?: "toggle" | "action"; // toggle = переключатель, action = кнопка
    buttonText?: string; // Текст на кнопке для action типа
}

export class CheatMenu {
    private container!: HTMLDivElement;
    private visible = false;
    private tank: TankController | null = null;
    private game: Game | null = null;
    private cheats: Map<string, Cheat> = new Map();
    private embedded = false;

    constructor(embedded: boolean = false) {
        this.embedded = embedded;
        // ИСПРАВЛЕНО: Сначала инициализируем читы, потом создаем UI
        this.initializeCheats();

        // Не создаём overlay UI если панель будет встроена в другое меню
        if (!this.embedded) {
            this.createUI();
            this.setupToggle();
            this.setupEscHandler();
            this.visible = false;
            this.container.classList.remove("visible");
            this.container.style.display = "none";
        }
    }

    private setupEscHandler(): void {
        window.addEventListener("keydown", (e) => {
            if (!this.visible) return;

            // Закрытие по ESC
            if (e.code === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                return;
            }

            // Игнорируем если пользователь вводит текст
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || (activeEl as HTMLElement).isContentEditable)) {
                return;
            }

            // Получаем все фокусируемые элементы
            const focusableElements = this.container.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );

            if (focusableElements.length === 0) return;

            const currentIndex = Array.from(focusableElements).findIndex(el => el === document.activeElement);
            const hasFocus = currentIndex >= 0 || document.activeElement === document.body;

            // Если нет фокуса, фокусируем первый элемент при нажатии стрелок
            if (!hasFocus && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                e.stopPropagation();
                const firstElement = focusableElements[0] as HTMLElement;
                if (firstElement) {
                    firstElement.focus();
                    firstElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
                return;
            }

            // Стрелки вверх/вниз для навигации
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();

                let nextIndex: number;
                if (e.key === "ArrowDown") {
                    nextIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
                } else {
                    nextIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
                }

                const nextElement = focusableElements[nextIndex] as HTMLElement;
                if (nextElement) {
                    nextElement.focus();
                    nextElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
                return;
            }

            // Enter для активации кнопок
            if (e.key === "Enter" && document.activeElement instanceof HTMLElement) {
                const activeEl = document.activeElement;
                if (activeEl.tagName === "BUTTON" || activeEl.getAttribute("role") === "button") {
                    e.preventDefault();
                    e.stopPropagation();
                    activeEl.click();
                }
            }
        }, true);
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

        // РЕСУРСЫ - БЫСТРЫЕ КНОПКИ
        this.addCheat({
            id: "addCredits1k",
            name: "+1,000 кредитов",
            description: "Добавляет 1,000 кредитов",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+1K 💰",
            toggle: () => {
                if (this.game) {
                    if ((this.game as any).currencyManager) {
                        (this.game as any).currencyManager.addCurrency(1000);
                    }
                    if ((this.game as any).playerProgression) {
                        (this.game as any).playerProgression.addCredits(1000);
                    }
                    this.showCheatNotification("+1,000 кредитов! 💰");
                }
            }
        });

        this.addCheat({
            id: "addCredits10k",
            name: "+10,000 кредитов",
            description: "Добавляет 10,000 кредитов",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+10K 💰",
            toggle: () => {
                if (this.game) {
                    if ((this.game as any).currencyManager) {
                        (this.game as any).currencyManager.addCurrency(10000);
                    }
                    if ((this.game as any).playerProgression) {
                        (this.game as any).playerProgression.addCredits(10000);
                    }
                    this.showCheatNotification("+10,000 кредитов! 💰");
                }
            }
        });

        this.addCheat({
            id: "addCredits100k",
            name: "+100,000 кредитов",
            description: "Добавляет 100,000 кредитов",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+100K 💰",
            toggle: () => {
                if (this.game) {
                    if ((this.game as any).currencyManager) {
                        (this.game as any).currencyManager.addCurrency(100000);
                    }
                    if ((this.game as any).playerProgression) {
                        (this.game as any).playerProgression.addCredits(100000);
                    }
                    this.showCheatNotification("+100,000 кредитов! 💰");
                }
            }
        });

        this.addCheat({
            id: "addCredits1m",
            name: "+1,000,000 кредитов",
            description: "Добавляет 1,000,000 кредитов",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+1M 💰",
            toggle: () => {
                if (this.game) {
                    if ((this.game as any).currencyManager) {
                        (this.game as any).currencyManager.addCurrency(1000000);
                    }
                    if ((this.game as any).playerProgression) {
                        (this.game as any).playerProgression.addCredits(1000000);
                    }
                    this.showCheatNotification("+1,000,000 кредитов! 💰💰💰");
                }
            }
        });

        this.addCheat({
            id: "addXP100",
            name: "+100 опыта",
            description: "Добавляет 100 опыта",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+100 XP",
            toggle: () => {
                if (this.game && (this.game as any).playerProgression) {
                    (this.game as any).playerProgression.addExperience(100, "cheat");
                    this.showCheatNotification("+100 XP! ⭐");
                }
            }
        });

        this.addCheat({
            id: "addXP1000",
            name: "+1,000 опыта",
            description: "Добавляет 1,000 опыта",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+1K XP",
            toggle: () => {
                if (this.game && (this.game as any).playerProgression) {
                    (this.game as any).playerProgression.addExperience(1000, "cheat");
                    this.showCheatNotification("+1,000 XP! ⭐");
                }
            }
        });

        this.addCheat({
            id: "addXP10000",
            name: "+10,000 опыта",
            description: "Добавляет 10,000 опыта",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "+10K XP",
            toggle: () => {
                if (this.game && (this.game as any).playerProgression) {
                    (this.game as any).playerProgression.addExperience(10000, "cheat");
                    this.showCheatNotification("+10,000 XP! ⭐⭐");
                }
            }
        });

        this.addCheat({
            id: "levelUp",
            name: "Повысить уровень",
            description: "Мгновенно повышает уровень",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "LEVEL UP! 📈",
            toggle: () => {
                if (this.game && (this.game as any).playerProgression) {
                    const prog = (this.game as any).playerProgression;
                    if (prog.levelUp) {
                        prog.levelUp();
                    } else {
                        prog.addExperience(prog.experienceToNextLevel || 5000, "cheat");
                    }
                    this.showCheatNotification("LEVEL UP! 📈");
                }
            }
        });

        this.addCheat({
            id: "fullHealth",
            name: "Полное здоровье",
            description: "Восстанавливает здоровье до максимума",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "❤️ HEAL",
            toggle: () => {
                if (this.tank) {
                    this.tank.currentHealth = this.tank.maxHealth;
                    this.showCheatNotification("Здоровье восстановлено! ❤️");
                }
            }
        });

        this.addCheat({
            id: "fullFuel",
            name: "Полный бак",
            description: "Заполняет топливо до максимума",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "⛽ FUEL",
            toggle: () => {
                if (this.tank) {
                    (this.tank as any).fuel = (this.tank as any).maxFuel || 100;
                    this.showCheatNotification("Топливо заполнено! ⛽");
                }
            }
        });

        this.addCheat({
            id: "fullAmmo",
            name: "Полный боезапас",
            description: "Восстанавливает все снаряды",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "🔫 AMMO",
            toggle: () => {
                if (this.tank) {
                    (this.tank as any).ammo = (this.tank as any).maxAmmo || 50;
                    (this.tank as any).specialAmmo = (this.tank as any).maxSpecialAmmo || 10;
                    this.showCheatNotification("Боезапас восстановлен! 🔫");
                }
            }
        });

        this.addCheat({
            id: "repairTank",
            name: "Полный ремонт",
            description: "Ремонт + здоровье + топливо + боезапас",
            enabled: false,
            category: "resources",
            type: "action",
            buttonText: "🔧 FULL REPAIR",
            toggle: () => {
                if (this.tank) {
                    this.tank.currentHealth = this.tank.maxHealth;
                    (this.tank as any).fuel = (this.tank as any).maxFuel || 100;
                    (this.tank as any).ammo = (this.tank as any).maxAmmo || 50;
                    (this.tank as any).specialAmmo = (this.tank as any).maxSpecialAmmo || 10;
                    this.showCheatNotification("Полный ремонт! 🔧❤️⛽🔫");
                }
            }
        });

        // ОТЛАДКА - КНОПКИ
        this.addCheat({
            id: "spawnEnemy1",
            name: "Спавн 1 врага",
            description: "Создаёт 1 врага рядом",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "+1 🤖",
            toggle: async () => {
                await this.spawnEnemiesNear(1);
            }
        });

        this.addCheat({
            id: "spawnEnemy5",
            name: "Спавн 5 врагов",
            description: "Создаёт 5 врагов рядом",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "+5 🤖",
            toggle: async () => {
                await this.spawnEnemiesNear(5);
            }
        });

        this.addCheat({
            id: "spawnEnemy10",
            name: "Спавн 10 врагов",
            description: "Создаёт 10 врагов рядом",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "+10 🤖",
            toggle: async () => {
                await this.spawnEnemiesNear(10);
            }
        });

        this.addCheat({
            id: "killAllEnemies",
            name: "Убить всех врагов",
            description: "Уничтожает всех врагов на карте",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "💀 KILL ALL",
            toggle: () => {
                if (this.game && (this.game as any).enemyTanks) {
                    const enemies = (this.game as any).enemyTanks;
                    const count = enemies.length;
                    let killed = 0;

                    // Создаем копию массива, так как он может изменяться во время итерации
                    const enemiesCopy = [...enemies];
                    enemiesCopy.forEach((enemy: any) => {
                        if (enemy && enemy.takeDamage) {
                            try {
                                enemy.takeDamage(99999);
                                killed++;
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        } else if (enemy && enemy.chassis) {
                            // Альтернативный способ - удаляем напрямую
                            try {
                                if (enemy.chassis.dispose) {
                                    enemy.chassis.dispose();
                                }
                                killed++;
                            } catch (e) {
                                // Игнорируем ошибки
                            }
                        }
                    });

                    // Очищаем массив врагов
                    if ((this.game as any).enemyTanks) {
                        (this.game as any).enemyTanks = [];
                    }

                    this.showCheatNotification(`${killed} врагов уничтожено! 💀`);
                } else {
                    this.showCheatNotification("Враги не найдены! ❌");
                }
            }
        });

        this.addCheat({
            id: "teleportCenter",
            name: "ТП в центр",
            description: "Телепорт в центр карты",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "🎯 CENTER",
            toggle: () => {
                if (this.tank) {
                    // Получаем высоту террейна в центре
                    const groundHeight = this.getGroundHeight(0, 0);
                    // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                    const safeHeight = groundHeight + 1.0;

                    const targetPos = new Vector3(0, safeHeight, 0);
                    this.tank.chassis.position = targetPos;
                    if (this.tank.physicsBody) {
                        this.tank.physicsBody.setTargetTransform(
                            this.tank.chassis.position,
                            this.tank.chassis.rotationQuaternion!
                        );
                        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                    }
                    this.showCheatNotification(`ТП в центр! 🎯 (${safeHeight.toFixed(1)}м)`);
                }
            }
        });

        this.addCheat({
            id: "teleportRandom",
            name: "ТП случайный",
            description: "Телепорт в случайную точку",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "🎲 RANDOM",
            toggle: () => {
                if (this.tank) {
                    const x = (Math.random() - 0.5) * 400;
                    const z = (Math.random() - 0.5) * 400;

                    // Получаем высоту террейна
                    const groundHeight = this.getGroundHeight(x, z);
                    // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
                    const safeHeight = groundHeight + 1.0;

                    const targetPos = new Vector3(x, safeHeight, z);
                    this.tank.chassis.position = targetPos;
                    if (this.tank.physicsBody) {
                        this.tank.physicsBody.setTargetTransform(
                            this.tank.chassis.position,
                            this.tank.chassis.rotationQuaternion!
                        );
                        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                    }
                    this.showCheatNotification(`ТП: ${x.toFixed(0)}, ${z.toFixed(0)} 🎲 (${safeHeight.toFixed(1)}м)`);
                }
            }
        });

        this.addCheat({
            id: "teleportGarage",
            name: "ТП в гараж",
            description: "Телепорт к своему гаражу",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "🏠 GARAGE",
            toggle: () => {
                if (this.tank && this.game) {
                    const garagePos = (this.game as any).gameGarage?.playerGaragePosition;
                    if (garagePos) {
                        // Получаем высоту террейна под гаражем
                        const groundHeight = this.getGroundHeight(garagePos.x, garagePos.z);
                        // Безопасная высота: +5м над террейном, минимум 7м
                        const safeHeight = Math.max(groundHeight + 5.0, 7.0);

                        const targetPos = new Vector3(garagePos.x, safeHeight, garagePos.z);
                        this.tank.chassis.position = targetPos;
                        if (this.tank.physicsBody) {
                            this.tank.physicsBody.setTargetTransform(
                                this.tank.chassis.position,
                                this.tank.chassis.rotationQuaternion!
                            );
                            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                        }
                        this.showCheatNotification(`ТП в гараж! 🏠 (${safeHeight.toFixed(1)}м)`);
                    } else {
                        this.showCheatNotification("Гараж не найден! ❌");
                    }
                }
            }
        });

        // Телепорт на случайный спавн (гараж)
        this.addCheat({
            id: "teleportRandomSpawn",
            name: "ТП на случайный спавн",
            description: "Телепорт на случайное место спавна",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "🎲 SPAWN",
            toggle: () => {
                if (this.tank && this.game) {
                    const chunkSystem = (this.game as any).chunkSystem;
                    if (chunkSystem && chunkSystem.garagePositions && chunkSystem.garagePositions.length > 0) {
                        const randomIndex = Math.floor(Math.random() * chunkSystem.garagePositions.length);
                        const spawnPos = chunkSystem.garagePositions[randomIndex];

                        // Получаем высоту террейна
                        const groundHeight = this.getGroundHeight(spawnPos.x, spawnPos.z);
                        // Безопасная высота: +5м над террейном, минимум 7м
                        const safeHeight = Math.max(groundHeight + 5.0, 7.0);

                        const targetPos = new Vector3(spawnPos.x, safeHeight, spawnPos.z);
                        this.tank.chassis.position = targetPos;
                        if (this.tank.physicsBody) {
                            this.tank.physicsBody.setTargetTransform(
                                this.tank.chassis.position,
                                this.tank.chassis.rotationQuaternion!
                            );
                            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                        }
                        this.showCheatNotification(`ТП на спавн #${randomIndex + 1}! 🎲 (${safeHeight.toFixed(1)}м)`);
                    } else {
                        this.showCheatNotification("Спавны не найдены! ❌");
                    }
                }
            }
        });

        // Телепорт на следующий спавн (циклический)
        this.addCheat({
            id: "teleportNextSpawn",
            name: "ТП на следующий спавн",
            description: "Телепорт на следующий спавн по порядку",
            enabled: false,
            category: "debug",
            type: "action",
            buttonText: "➡️ NEXT",
            toggle: () => {
                if (this.tank && this.game) {
                    const chunkSystem = (this.game as any).chunkSystem;
                    if (chunkSystem && chunkSystem.garagePositions && chunkSystem.garagePositions.length > 0) {
                        // Сохраняем текущий индекс в game для циклического переключения
                        if (!(this.game as any)._currentSpawnIndex) {
                            (this.game as any)._currentSpawnIndex = 0;
                        }

                        (this.game as any)._currentSpawnIndex =
                            ((this.game as any)._currentSpawnIndex + 1) % chunkSystem.garagePositions.length;

                        const spawnIndex = (this.game as any)._currentSpawnIndex;
                        const spawnPos = chunkSystem.garagePositions[spawnIndex];

                        // Получаем высоту террейна
                        const groundHeight = this.getGroundHeight(spawnPos.x, spawnPos.z);
                        // Безопасная высота: +5м над террейном, минимум 7м
                        const safeHeight = Math.max(groundHeight + 5.0, 7.0);

                        const targetPos = new Vector3(spawnPos.x, safeHeight, spawnPos.z);
                        this.tank.chassis.position = targetPos;
                        if (this.tank.physicsBody) {
                            this.tank.physicsBody.setTargetTransform(
                                this.tank.chassis.position,
                                this.tank.chassis.rotationQuaternion!
                            );
                            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                        }
                        this.showCheatNotification(`ТП на спавн #${spawnIndex + 1}! ➡️ (${safeHeight.toFixed(1)}м)`);
                    } else {
                        this.showCheatNotification("Спавны не найдены! ❌");
                    }
                }
            }
        });

        // НОВЫЕ ЧИТЫ

        // Телепорт
        this.addCheat({
            id: "teleport",
            name: "Телепорт",
            description: "Телепортирует танк в указанные координаты (Y вычисляется автоматически)",
            enabled: false,
            category: "debug",
            toggle: () => {
                if (!this.tank || !this.game) {
                    inGameAlert("Танк или игра не инициализированы!", "Читы").catch(() => { });
                    return;
                }

                inGamePrompt("X координата:", "0", "Телепорт").then((x) => {
                    if (x === null) return;
                    inGamePrompt("Z координата:", "0", "Телепорт").then((z) => {
                        if (z === null) return;
                        const posX = parseFloat(x);
                        const posZ = parseFloat(z);

                        if (!isNaN(posX) && !isNaN(posZ) && this.tank && this.tank.chassis) { // [Opus 4.5] Added null checks
                            // КРИТИЧНО: Вычисляем высоту террейна автоматически
                            const groundHeight = this.getGroundHeight(posX, posZ);
                            // Безопасная высота: +5м над террейном, минимум 7м
                            const safeHeight = Math.max(groundHeight + 5.0, 7.0);

                            const targetPos = new Vector3(posX, safeHeight, posZ);
                            this.tank.chassis.position = targetPos;
                            if (this.tank.physicsBody) {
                                this.tank.physicsBody.setTargetTransform(
                                    targetPos,
                                    this.tank.chassis.rotationQuaternion!
                                );
                                // КРИТИЧНО: Сбрасываем скорости при телепортации
                                this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                                this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                            }
                            // Обновляем матрицы
                            this.tank.chassis.computeWorldMatrix(true);
                            if (this.game && this.game.hud) { // [Opus 4.5] Added null check
                                this.game.hud.showMessage(`Телепорт: (${posX.toFixed(1)}, ${safeHeight.toFixed(1)}, ${posZ.toFixed(1)}) - террейн: ${groundHeight.toFixed(1)}м`, "#0f0", 2000);
                            }
                        } else {
                            inGameAlert("Неверные координаты!", "Читы").catch(() => { });
                        }
                    }).catch(() => { });
                }).catch(() => { });
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
                    inGameAlert("Игра или танк не инициализированы!", "Читы").catch(() => { });
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
                    // При спавне через читы используем текущую сложность врагов из игры (если есть)
                    const difficulty = (this.game as any).getCurrentEnemyDifficulty
                        ? (this.game as any).getCurrentEnemyDifficulty()
                        : ((this.game.mainMenu as any)?.getSettings()?.enemyDifficulty || "medium");
                    const difficultyScale = (this.game as any).getAdaptiveEnemyDifficultyScale
                        ? (this.game as any).getAdaptiveEnemyDifficultyScale()
                        : 1;
                    const enemyTank = new EnemyTank(
                        this.game.scene,
                        spawnPos,
                        this.game.soundManager,
                        this.game.effectsManager,
                        difficulty,
                        difficultyScale
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
            type: "action",
            buttonText: "🔓 UNLOCK ALL",
            toggle: () => {
                if (!this.game) {
                    this.showCheatNotification("Игра не инициализирована!");
                    return;
                }

                // Разблокируем все через playerProgression
                if ((this.game as any).playerProgression) {
                    const progression = (this.game as any).playerProgression;
                    if (progression.unlockAll) {
                        progression.unlockAll();
                    } else {
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

                this.showCheatNotification("Всё разблокировано! 🔓");
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
            id: "teleportCustom",
            name: "Телепорт (координаты)",
            description: "Телепортироваться к координатам (Y вычисляется автоматически)",
            enabled: false,
            category: "world",
            type: "action",
            buttonText: "📍 XZ",
            toggle: () => {
                inGamePrompt("Введите X, Z через запятую (Y вычисляется автоматически):", "0, 0", "Телепорт").then((coords) => {
                    if (!coords || !this.tank || !this.tank.chassis) return;
                    const parts = coords.split(",").map(s => parseFloat(s.trim()));
                    const posX = parts[0];
                    const posZ = parts[1];
                    if (parts.length >= 2 && posX !== undefined && posZ !== undefined && !isNaN(posX) && !isNaN(posZ)) {
                        // КРИТИЧНО: Вычисляем высоту террейна автоматически
                        const groundHeight = this.getGroundHeight(posX, posZ);
                        // Безопасная высота: +5м над террейном, минимум 7м
                        const safeHeight = Math.max(groundHeight + 5.0, 7.0);

                        const targetPos = new Vector3(posX, safeHeight, posZ);
                        this.tank.chassis.position = targetPos;
                        if (this.tank.physicsBody) {
                            this.tank.physicsBody.setTargetTransform(
                                targetPos,
                                this.tank.chassis.rotationQuaternion!
                            );
                            // КРИТИЧНО: Сбрасываем скорости при телепортации
                            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                        }
                        // Обновляем матрицы
                        this.tank.chassis.computeWorldMatrix(true);
                        this.showCheatNotification(`ТП: ${posX.toFixed(1)}, ${safeHeight.toFixed(1)}, ${posZ.toFixed(1)} 📍 (террейн: ${groundHeight.toFixed(1)}м)`);
                    } else {
                        inGameAlert("Неверные координаты! Используйте формат: X, Z", "Читы").catch(() => { });
                    }
                }).catch(() => { });
            }
        });

        this.addCheat({
            id: "clearAllObjects",
            name: "Очистить карту",
            description: "Удаляет все декорации и объекты",
            enabled: false,
            category: "world",
            type: "action",
            buttonText: "🧹 CLEAR",
            toggle: () => {
                if (this.game?.scene) {
                    let removed = 0;
                    this.game.scene.meshes.forEach(mesh => {
                        if (mesh.name.includes("decoration") || mesh.name.includes("debris") ||
                            mesh.name.includes("prop") || mesh.name.includes("bush") ||
                            mesh.name.includes("tree") || mesh.name.includes("rock")) {
                            mesh.dispose();
                            removed++;
                        }
                    });
                    this.showCheatNotification(`Удалено ${removed} объектов 🧹`);
                }
            }
        });

        this.addCheat({
            id: "resetWeather",
            name: "Сбросить погоду",
            description: "Сбрасывает погодные эффекты",
            enabled: false,
            category: "world",
            type: "action",
            buttonText: "☀️ CLEAR SKY",
            toggle: () => {
                if (this.game) {
                    if ((this.game as any).weatherSystem) {
                        (this.game as any).weatherSystem.setWeather("clear");
                    }
                    this.showCheatNotification("Погода сброшена! ☀️");
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

        // === ПРОЧЕЕ ===
        this.addCheat({
            id: "screenshot",
            name: "Скриншот",
            description: "Сделать скриншот игры",
            enabled: false,
            category: "other",
            type: "action",
            buttonText: "📷 SCREENSHOT",
            toggle: () => {
                if (this.game?.scene?.getEngine()) {
                    const engine = this.game.scene.getEngine();
                    const canvas = engine.getRenderingCanvas();
                    if (canvas) {
                        const dataUrl = canvas.toDataURL("image/png");
                        const link = document.createElement("a");
                        link.download = `tank_screenshot_${Date.now()}.png`;
                        link.href = dataUrl;
                        link.click();
                        this.showCheatNotification("Скриншот сохранён! 📷");
                    }
                }
            }
        });

        this.addCheat({
            id: "resetStats",
            name: "Сбросить статистику",
            description: "Обнуляет убийства и смерти",
            enabled: false,
            category: "other",
            type: "action",
            buttonText: "🔄 RESET STATS",
            toggle: () => {
                if (this.game) {
                    (this.game as any).kills = 0;
                    (this.game as any).deaths = 0;
                    (this.game as any).totalDamageDealt = 0;
                    (this.game as any).totalDamageTaken = 0;
                    this.showCheatNotification("Статистика сброшена! 🔄");
                }
            }
        });

        this.addCheat({
            id: "showFPS",
            name: "Показать FPS",
            description: "Отображает FPS на экране",
            enabled: false,
            category: "other",
            toggle: () => {
                const cheat = this.cheats.get("showFPS")!;
                cheat.enabled = !cheat.enabled;
                if (this.game?.scene) {
                    const engine = this.game.scene.getEngine();
                    if (engine) {
                        (engine as any).displayLoadingUI = cheat.enabled;
                    }
                }
                this.updateCheatUI("showFPS");
            }
        });

        this.addCheat({
            id: "pauseGame",
            name: "Пауза игры",
            description: "Приостанавливает все действия",
            enabled: false,
            category: "other",
            toggle: () => {
                const cheat = this.cheats.get("pauseGame")!;
                cheat.enabled = !cheat.enabled;
                if (this.game?.scene) {
                    if (cheat.enabled) {
                        (this.game.scene as any)._paused = true;
                        this.game.scene.getEngine().stopRenderLoop();
                    } else {
                        (this.game.scene as any)._paused = false;
                        const scene = this.game.scene;
                        this.game.scene.getEngine().runRenderLoop(() => scene.render());
                    }
                    if (this.game.hud) {
                        this.game.hud.showMessage(cheat.enabled ? "ПАУЗА" : "ИГРА", cheat.enabled ? "#ff0" : "#0f0", 2000);
                    }
                }
                this.updateCheatUI("pauseGame");
            }
        });

        this.addCheat({
            id: "copyPosition",
            name: "Копировать позицию",
            description: "Копирует координаты танка",
            enabled: false,
            category: "other",
            type: "action",
            buttonText: "📋 COPY POS",
            toggle: () => {
                if (this.tank?.chassis) {
                    const pos = this.tank.chassis.absolutePosition;
                    const coords = `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`;
                    navigator.clipboard.writeText(coords);
                    this.showCheatNotification(`Скопировано: ${coords} 📋`);
                }
            }
        });
    }

    private addCheat(cheat: Cheat): void {
        // По умолчанию тип toggle
        if (!cheat.type) cheat.type = "toggle";
        this.cheats.set(cheat.id, cheat);
    }

    // Показывает уведомление о применении чита
    private showCheatNotification(message: string): void {
        if (this.game?.hud) {
            this.game.hud.showMessage(message, "#0f0", 2000);
        }
        // Также показываем в UI меню
        const notification = document.createElement("div");
        notification.className = "cheat-notification";
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 255, 0, 0.9);
            color: #000;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 200000;
            animation: cheatNotificationAnim 1.5s ease-out forwards;
            pointer-events: none;
            text-shadow: none;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 1500);
    }

    // Спавн нескольких врагов рядом
    private async spawnEnemiesNear(count: number): Promise<void> {
        if (!this.game || !this.tank) {
            this.showCheatNotification("Игра не инициализирована!");
            return;
        }

        const pos = this.tank.chassis.absolutePosition;
        let spawned = 0;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i;
            const distance = 20 + Math.random() * 30;
            const spawnX = pos.x + Math.cos(angle) * distance;
            const spawnZ = pos.z + Math.sin(angle) * distance;

            // КРИТИЧНО: Вычисляем высоту террейна и спавним НАД террейном
            const groundHeight = (this.game as any).getGroundHeight ? (this.game as any).getGroundHeight(spawnX, spawnZ) : 5.0;
            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            const spawnY = groundHeight + 1.0;

            const spawnPos = new Vector3(spawnX, spawnY, spawnZ);

            if (this.game.scene && this.game.soundManager && this.game.effectsManager) {
                const difficulty = (this.game as any).getCurrentEnemyDifficulty?.() || "medium";
                const difficultyScale = (this.game as any).getAdaptiveEnemyDifficultyScale?.() || 1;

                const enemyTank = new EnemyTank(
                    this.game.scene,
                    spawnPos,
                    this.game.soundManager,
                    this.game.effectsManager,
                    difficulty,
                    difficultyScale
                );

                if (this.tank) {
                    enemyTank.setTarget(this.tank);
                }

                if ((this.game as any).enemyTanks) {
                    (this.game as any).enemyTanks.push(enemyTank);
                }
                spawned++;
            }
        }

        this.showCheatNotification(`Заспавнено ${spawned} врагов! 🤖`);
    }

    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();


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
            <div class="panel" style="max-width: 600px; width: 600px; height: 600px; max-height: 600px; overflow: hidden; box-sizing: border-box; display: flex; flex-direction: column; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);">
                <div class="panel-header">
                    <div class="panel-title">МЕНЮ ЧИТОВ [Ctrl+7]</div>
                    <button class="panel-close" id="cheat-menu-close">✕</button>
                </div>
                <div class="panel-content">
                    <!-- Вкладки категорий -->
                    <div class="cheat-tabs">
        `;

        categories.forEach((category, index) => {
            const categoryCheats = Array.from(this.cheats.values()).filter(c => c.category === category);
            if (categoryCheats.length === 0) return;

            html += `<button class="cheat-tab ${index === 0 ? 'active' : ''}" data-category="${category}">
                ${categoryNames[category]}
            </button>`;
        });

        html += `
                    </div>
                    
                    <!-- Контент категорий -->
        `;

        categories.forEach((category, index) => {
            const categoryCheats = Array.from(this.cheats.values()).filter(c => c.category === category);
            if (categoryCheats.length === 0) return;

            html += `<div class="cheat-tab-content ${index === 0 ? 'active' : ''}" data-category="${category}">`;

            categoryCheats.forEach(cheat => {
                if (cheat.type === "action") {
                    // Кнопка для мгновенного действия
                    html += `
                        <div class="cheat-item cheat-action" data-cheat-id="${cheat.id}">
                            <div class="cheat-info">
                                <div class="cheat-name">${cheat.name}</div>
                                <div class="cheat-desc">${cheat.description}</div>
                            </div>
                            <button class="cheat-action-btn" id="cheat-btn-${cheat.id}">
                                ${cheat.buttonText || "ACTIVATE"}
                            </button>
                        </div>
                    `;
                } else {
                    // Переключатель (toggle)
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
                }
            });

            html += `</div>`;
        });

        html += `
                </div>
            </div>
        `;

        this.container.innerHTML = html;

        const style = document.createElement("style");
        style.id = "cheat-menu-styles";
        style.textContent = `
            /* Принудительные стили для меню читов */
            #cheat-menu.panel-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                display: none !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100020 !important;
                pointer-events: auto !important;
            }
            
            /* Полупрозрачный фон для меню читов во время боя */
            #cheat-menu.panel-overlay.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }
            
            #cheat-menu.panel-overlay.visible {
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            /* ИСПРАВЛЕНО: Предотвращение горизонтальной прокрутки и двойного скроллбара */
            #cheat-menu .panel {
                max-width: 600px !important;
                width: 600px !important;
                height: 600px !important;
                max-height: 600px !important;
                overflow: hidden !important; /* Убираем скролл с панели */
                box-sizing: border-box !important;
                display: flex !important;
                flex-direction: column !important;
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
            }
            
            #cheat-menu .panel-content {
                padding: 15px !important;
                box-sizing: border-box !important;
                overflow-x: hidden !important;
                overflow-y: auto !important; /* Скролл только на контенте */
                width: 100% !important;
                height: calc(600px - 60px) !important; /* Фиксированная высота минус заголовок */
                min-height: calc(600px - 60px) !important;
                max-height: calc(600px - 60px) !important;
                flex: 1 !important; /* Занимает оставшееся пространство */
            }
            
            /* Вкладки категорий */
            .cheat-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 15px;
                border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                flex-wrap: wrap;
                padding-bottom: 5px;
            }
            
            .cheat-tab {
                padding: 8px 12px;
                background: rgba(0, 20, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.3);
                border-bottom: none;
                color: #7f7;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                font-family: 'Press Start 2P', monospace;
                transition: all 0.2s;
                border-radius: 4px 4px 0 0;
                white-space: nowrap;
            }
            
            .cheat-tab:hover {
                background: rgba(0, 40, 0, 0.5);
                color: #0f0;
                border-color: rgba(0, 255, 4, 0.6);
            }
            
            .cheat-tab.active {
                background: rgba(0, 255, 4, 0.2);
                color: #0f0;
                border-color: rgba(0, 255, 4, 0.8);
                border-bottom: 2px solid rgba(0, 255, 4, 0.8);
            }
            
            .cheat-tab-content {
                display: none;
                height: 100%;
                overflow-y: auto;
                overflow-x: hidden;
                min-height: 0;
            }
            
            .cheat-tab-content.active {
                display: block;
                height: 100%;
            }
            
            .cheat-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                margin-bottom: 8px;
                background: rgba(0, 5, 0, 0.3);
                border: 1px solid rgba(0, 255, 4, 0.2);
                border-radius: 4px;
                box-sizing: border-box;
                min-width: 0; /* Позволяет flex-элементам сжиматься */
                gap: 10px; /* Отступ между элементами */
            }
            
            .cheat-info {
                flex: 1;
                min-width: 0; /* Позволяет тексту переноситься */
                overflow: hidden; /* Скрывает переполнение */
            }
            
            .cheat-name {
                font-size: 12px;
                color: #0f0;
                font-weight: bold;
                margin-bottom: 4px;
                font-family: 'Press Start 2P', monospace;
                word-wrap: break-word; /* Перенос длинных слов */
                overflow-wrap: break-word; /* Перенос длинных слов */
            }
            
            .cheat-desc {
                font-size: 10px;
                color: #7f7;
                font-family: 'Press Start 2P', monospace;
                word-wrap: break-word; /* Перенос длинных слов */
                overflow-wrap: break-word; /* Перенос длинных слов */
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
                background-color: rgba(0, 5, 0, 0.5);
                transition: 0.3s;
                border-radius: 24px;
                border: 1px solid rgba(0, 255, 4, 0.4);
            }
            
            .cheat-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 2px;
                bottom: 2px;
                background-color: rgba(0, 255, 4, 0.6);
                transition: 0.3s;
                border-radius: 50%;
            }
            
            .cheat-toggle input:checked + .cheat-slider {
                background-color: rgba(0, 255, 4, 0.3);
                border-color: rgba(0, 255, 4, 0.6);
            }
            
            .cheat-toggle input:checked + .cheat-slider:before {
                transform: translateX(26px);
                background-color: #0f0;
            }
            
            /* Стили для кнопок-действий */
            .cheat-action-btn {
                padding: 8px 12px;
                background: linear-gradient(180deg, rgba(0, 255, 4, 0.3), rgba(0, 255, 4, 0.1));
                border: 2px solid rgba(0, 255, 4, 0.8);
                border-radius: 6px;
                color: #0f0;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                transition: all 0.2s ease;
                font-family: 'Press Start 2P', monospace;
                text-shadow: 0 0 5px rgba(0, 255, 4, 0.5);
                min-width: 80px;
                max-width: 120px;
                flex-shrink: 0; /* Не сжимается */
                white-space: nowrap; /* Текст не переносится */
                overflow: hidden;
                text-overflow: ellipsis; /* Многоточие при переполнении */
            }
            
            .cheat-action-btn:hover {
                background: linear-gradient(180deg, rgba(0, 255, 4, 0.5), rgba(0, 255, 4, 0.3));
                border-color: #0f0;
                box-shadow: 0 0 15px rgba(0, 255, 4, 0.5), inset 0 0 10px rgba(0, 255, 4, 0.2);
                transform: scale(1.05);
            }
            
            .cheat-action-btn:active {
                background: rgba(0, 255, 4, 0.6);
                transform: scale(0.95);
                box-shadow: 0 0 20px rgba(0, 255, 4, 0.8);
            }
            
            .cheat-item.cheat-action {
                background: rgba(0, 30, 0, 0.4);
                border-color: rgba(0, 255, 4, 0.3);
            }
            
            /* Анимация уведомления */
            @keyframes cheatNotificationAnim {
                0% {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px) scale(0.8);
                }
                20% {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0) scale(1.1);
                }
                40% {
                    transform: translateX(-50%) translateY(0) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-30px) scale(0.9);
                }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);

        // Обработчики для чекбоксов (toggle)
        this.cheats.forEach((cheat, id) => {
            if (cheat.type === "action") {
                // Обработчик для кнопки-действия
                const button = document.getElementById(`cheat-btn-${id}`) as HTMLButtonElement;
                if (button) {
                    button.addEventListener("click", () => {
                        cheat.toggle();
                    });
                }
            } else {
                // Обработчик для переключателя
                const checkbox = document.getElementById(`cheat-${id}`) as HTMLInputElement;
                if (checkbox) {
                    checkbox.addEventListener("change", () => {
                        cheat.toggle();
                    });
                }
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

        // Обработчики вкладок
        document.querySelectorAll(".cheat-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const category = (tab as HTMLElement).dataset.category;
                if (!category) return;

                // Убираем активный класс со всех вкладок и контента
                document.querySelectorAll(".cheat-tab").forEach(t => t.classList.remove("active"));
                document.querySelectorAll(".cheat-tab-content").forEach(c => c.classList.remove("active"));

                // Добавляем активный класс к выбранной вкладке и контенту
                tab.classList.add("active");
                const content = document.querySelector(`.cheat-tab-content[data-category="${category}"]`);
                if (content) {
                    content.classList.add("active");
                }
            });
        });
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

        // Проверяем, что контейнер в DOM
        if (!document.body.contains(this.container)) {
            console.warn("[CheatMenu] Container not in DOM, re-adding...");
            document.body.appendChild(this.container);
        }

        this.visible = !this.visible;
        console.log(`[CheatMenu] Toggle: ${this.visible ? 'show' : 'hide'}, container classes:`, this.container.className);

        if (this.visible) {
            this.show();
        } else {
            this.hide();
        }
    }

    show(): void {
        if (!this.container) {
            console.warn("[CheatMenu] Cannot show: container not initialized");
            return;
        }

        this.visible = true;
        this.container.classList.add("visible");
        this.container.style.display = "flex";
        this.container.style.visibility = "visible";
        this.container.style.opacity = "1";
        this.container.style.zIndex = "100020";

        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';

        // Добавляем класс "in-battle" если игра запущена (для полупрозрачного фона)
        const game = (window as any).gameInstance;
        if (game && game.gameStarted) {
            this.container.classList.add("in-battle");
        } else {
            this.container.classList.remove("in-battle");
        }

        console.log("[CheatMenu] Menu shown, container:", this.container);

        // Автофокус первого элемента для навигации клавиатурой
        setTimeout(() => {
            const focusableElements = this.container.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements.length > 0) {
                const firstElement = focusableElements[0] as HTMLElement;
                firstElement.focus();
            }
        }, 100);
    }

    hide(): void {
        if (!this.container) return;
        this.visible = false;
        this.container.classList.remove("visible");
        this.container.style.display = "none";
        this.container.style.visibility = "hidden";
        this.container.style.opacity = "0";

        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }
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

    /**
     * Получить высоту террейна в указанной точке
     */
    private getGroundHeight(x: number, z: number): number {
        if (!this.game || !this.game.scene) {
            return 2.0; // Минимальная безопасная высота
        }

        // Используем метод из game.ts если доступен
        if ((this.game as any).getGroundHeight) {
            return (this.game as any).getGroundHeight(x, z);
        }

        // Fallback: используем raycast
        const rayStart = new Vector3(x, 150, z);
        const ray = new Ray(rayStart, Vector3.Down(), 300);

        const hit = this.game.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const name = mesh.name.toLowerCase();
            return (name.startsWith("ground_") ||
                name.includes("terrain") ||
                name.includes("chunk") ||
                name.includes("road") ||
                (name.includes("floor") && !name.includes("garage"))) &&
                mesh.isEnabled();
        });

        if (hit?.hit && hit.pickedPoint) {
            const height = hit.pickedPoint.y;
            if (height > -10 && height < 200) {
                return height;
            }
        }

        // Fallback: используем terrain generator если доступен
        const chunkSystem = (this.game as any).chunkSystem;
        if (chunkSystem && chunkSystem.terrainGenerator) {
            try {
                return chunkSystem.terrainGenerator.getHeight(x, z, "dirt") || 2.0;
            } catch (e) {
                // Игнорируем ошибки
            }
        }

        return 2.0; // Минимальная безопасная высота
    }

    isVisible(): boolean {
        return this.visible;
    }

    dispose(): void {
        this.container.remove();
    }

    /**
     * Рендерит контент меню в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        container.innerHTML = this.getEmbeddedContentHTML();
        this.setupEmbeddedEventListeners(container);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
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

        let tabsHtml = "";
        let contentHtml = "";

        categories.forEach((category, index) => {
            const categoryCheats = Array.from(this.cheats.values()).filter(c => c.category === category);
            if (categoryCheats.length === 0) return;

            tabsHtml += `<button class="cheat-tab-emb ${index === 0 ? 'active' : ''}" data-category="${category}">
                ${categoryNames[category]}
            </button>`;

            contentHtml += `<div class="cheat-tab-content-emb ${index === 0 ? 'active' : ''}" data-category="${category}">`;

            categoryCheats.forEach(cheat => {
                if (cheat.type === "action") {
                    contentHtml += `
                        <div class="cheat-item-emb cheat-action-emb" data-cheat-id="${cheat.id}">
                            <div class="cheat-info-emb">
                                <div class="cheat-name-emb">${cheat.name}</div>
                                <div class="cheat-desc-emb">${cheat.description}</div>
                            </div>
                            <button class="cheat-action-btn-emb" data-cheat-btn="${cheat.id}">
                                ${cheat.buttonText || "ACTIVATE"}
                            </button>
                        </div>
                    `;
                } else {
                    contentHtml += `
                        <div class="cheat-item-emb" data-cheat-id="${cheat.id}">
                            <div class="cheat-info-emb">
                                <div class="cheat-name-emb">${cheat.name}</div>
                                <div class="cheat-desc-emb">${cheat.description}</div>
                            </div>
                            <label class="cheat-toggle-emb">
                                <input type="checkbox" data-cheat-toggle="${cheat.id}" ${cheat.enabled ? "checked" : ""}>
                                <span class="cheat-slider-emb"></span>
                            </label>
                        </div>
                    `;
                }
            });

            contentHtml += `</div>`;
        });

        return `
            <div class="cheat-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    🎯 Меню читов
                </h3>
                <div class="cheat-tabs-emb">${tabsHtml}</div>
                <div class="cheat-content-emb">${contentHtml}</div>
            </div>
            <style>
                .cheat-tabs-emb {
                    display: flex;
                    gap: 4px;
                    margin-bottom: 12px;
                    flex-wrap: wrap;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(0, 255, 4, 0.3);
                }
                .cheat-tab-emb {
                    padding: 6px 10px;
                    background: rgba(0, 20, 0, 0.3);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    color: #7f7;
                    cursor: pointer;
                    font-size: 10px;
                    font-weight: bold;
                    font-family: 'Press Start 2P', monospace;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .cheat-tab-emb:hover { background: rgba(0, 40, 0, 0.5); color: #0f0; }
                .cheat-tab-emb.active { background: rgba(0, 255, 4, 0.2); color: #0f0; border-color: rgba(0, 255, 4, 0.8); }
                .cheat-tab-content-emb { display: none; }
                .cheat-tab-content-emb.active { display: block; }
                .cheat-item-emb {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 10px;
                    margin-bottom: 6px;
                    background: rgba(0, 5, 0, 0.3);
                    border: 1px solid rgba(0, 255, 4, 0.2);
                    border-radius: 4px;
                    gap: 10px;
                }
                .cheat-info-emb { flex: 1; min-width: 0; }
                .cheat-name-emb { font-size: 11px; color: #0f0; font-weight: bold; margin-bottom: 2px; }
                .cheat-desc-emb { font-size: 9px; color: #7f7; }
                .cheat-toggle-emb { position: relative; display: inline-block; width: 44px; height: 22px; flex-shrink: 0; }
                .cheat-toggle-emb input { opacity: 0; width: 0; height: 0; }
                .cheat-slider-emb {
                    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 5, 0, 0.5); transition: 0.3s; border-radius: 22px;
                    border: 1px solid rgba(0, 255, 4, 0.4);
                }
                .cheat-slider-emb:before {
                    position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
                    background: rgba(0, 255, 4, 0.6); transition: 0.3s; border-radius: 50%;
                }
                .cheat-toggle-emb input:checked + .cheat-slider-emb { background: rgba(0, 255, 4, 0.3); border-color: rgba(0, 255, 4, 0.6); }
                .cheat-toggle-emb input:checked + .cheat-slider-emb:before { transform: translateX(22px); background: #0f0; }
                .cheat-action-btn-emb {
                    padding: 6px 10px; background: linear-gradient(180deg, rgba(0, 255, 4, 0.3), rgba(0, 255, 4, 0.1));
                    border: 1px solid rgba(0, 255, 4, 0.8); border-radius: 4px; color: #0f0;
                    font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s;
                    font-family: 'Press Start 2P', monospace; min-width: 70px; flex-shrink: 0;
                }
                .cheat-action-btn-emb:hover { background: linear-gradient(180deg, rgba(0, 255, 4, 0.5), rgba(0, 255, 4, 0.3)); transform: scale(1.05); }
                .cheat-action-emb { background: rgba(0, 30, 0, 0.4); }
            </style>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        // Обработчики вкладок
        const tabs = container.querySelectorAll(".cheat-tab-emb");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const category = (tab as HTMLElement).dataset.category;
                if (!category) return;

                container.querySelectorAll(".cheat-tab-emb").forEach(t => t.classList.remove("active"));
                container.querySelectorAll(".cheat-tab-content-emb").forEach(c => c.classList.remove("active"));

                tab.classList.add("active");
                const content = container.querySelector(`.cheat-tab-content-emb[data-category="${category}"]`);
                if (content) content.classList.add("active");
            });
        });

        // Обработчики переключателей (toggle)
        this.cheats.forEach((cheat, id) => {
            if (cheat.type === "action") {
                const button = container.querySelector(`[data-cheat-btn="${id}"]`) as HTMLButtonElement;
                if (button) {
                    button.addEventListener("click", () => cheat.toggle());
                }
            } else {
                const checkbox = container.querySelector(`[data-cheat-toggle="${id}"]`) as HTMLInputElement;
                if (checkbox) {
                    checkbox.addEventListener("change", () => {
                        cheat.toggle();
                        // Обновляем визуальное состояние
                        checkbox.checked = cheat.enabled;
                    });
                }
            }
        });
    }
}

