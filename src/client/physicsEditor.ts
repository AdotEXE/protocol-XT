/**
 * @module physicsEditor
 * @description Редактор физики в реальном времени - позволяет редактировать все параметры физики прямо в игре
 */

import { TankController } from "./tankController";
import { Vector3, Scene } from "@babylonjs/core";
import { Game } from "./game";
import { logger } from "./utils/logger";
import { CommonStyles } from "./commonStyles";
import { inGameConfirm } from "./utils/inGameDialogs";
import {
    PHYSICS_CONFIG,
    DEFAULT_PHYSICS_CONFIG,
    applyPhysicsConfig,
    resetPhysicsConfig,
    savePhysicsConfigToStorage,
    loadPhysicsConfigFromStorage,
    type PhysicsConfig
} from "./config/physicsConfig";

export class PhysicsEditor {
    private container!: HTMLDivElement;
    private tank: TankController | null = null;
    private game: Game | null = null;
    private scene: Scene | null = null;
    private visible = false;

    // Input elements
    private inputs: Map<string, HTMLInputElement> = new Map();
    private valueDisplays: Map<string, HTMLSpanElement> = new Map();

    // Tabs
    private activeTab: string = "tank";
    private tabs: Map<string, HTMLButtonElement> = new Map();

    constructor() {
        try {
            logger.log("[PhysicsEditor] Constructor called");

            // Загружаем сохранённую конфигурацию при создании
            loadPhysicsConfigFromStorage();
            this.createUI();
            this.setupTabs();
            this.setupInputs();
            this.setupButtons();
            this.visible = false;
            if (this.container) {
                this.container.classList.add("hidden");
            }
            logger.log("[PhysicsEditor] Constructor completed successfully");
        } catch (error) {
            logger.error("[PhysicsEditor] Error in constructor:", error);
            throw error;
        }
    }

    setGame(game: Game | null): void {
        this.game = game;
        if (game && game.scene) {
            this.scene = game.scene;
        }
    }

    setTank(tank: TankController): void {
        this.tank = tank;
        this.updateFromConfig();
    }

    private createUI(): void {
        try {
            CommonStyles.initialize();

            // Проверяем, не создан ли уже контейнер
            const existing = document.getElementById("physics-editor");
            if (existing) {
                logger.warn("[PhysicsEditor] Container already exists, removing old one");
                existing.remove();
            }

            this.container = document.createElement("div");
            this.container.id = "physics-editor";
            this.container.className = "panel-overlay";
            logger.log("[PhysicsEditor] Container created");

            const html = `
            <div class="panel" style="max-width: 800px; width: 90%; max-height: 80vh; display: flex; flex-direction: column; 
                 position: relative; margin: auto; box-shadow: 0 0 50px rgba(0,255,0,0.2);">
                <div class="panel-header" style="flex-shrink: 0;">
                    <div class="panel-title">РЕДАКТОР ФИЗИКИ [Ctrl+0]</div>
                    <button class="panel-close" id="physics-editor-close">✕</button>
                </div>
                <div class="panel-content" style="overflow-y: auto; flex: 1; min-height: 0; padding-right: 5px;">
                    <!-- Tabs -->
                    <div class="physics-editor-tabs">
                        <button class="physics-tab active" data-tab="tank">Танк</button>
                        <button class="physics-tab" data-tab="turret">Башня</button>
                        <button class="physics-tab" data-tab="shooting">Стрельба</button>
                        <button class="physics-tab" data-tab="enemy">Враги</button>
                        <button class="physics-tab" data-tab="modules">Модули</button>
                        <button class="physics-tab" data-tab="world">Мир</button>
                        <button class="physics-tab" data-tab="other">Прочее</button>
                    </div>
                    
                    <!-- Controls -->
                    <div class="physics-editor-controls">
                        <button id="physics-editor-reset" class="panel-btn secondary">Сброс</button>
                        <button id="physics-editor-save" class="panel-btn primary">Сохранить</button>
                        <button id="physics-editor-load" class="panel-btn secondary">Загрузить</button>
                        <button id="physics-editor-export" class="panel-btn secondary">Экспорт JSON</button>
                        <button id="physics-editor-import" class="panel-btn secondary">Импорт JSON</button>
                    </div>
                    
                    <!-- Tab Content -->
                    <div id="physics-editor-content"></div>
                </div>
            </div>
        `;

            this.container.innerHTML = html;

            // КРИТИЧНО: Проверяем, что контейнер еще не в DOM
            if (!document.body.contains(this.container)) {
                document.body.appendChild(this.container);
                logger.log("[PhysicsEditor] Container added to DOM");
                logger.log("[PhysicsEditor] Container added to DOM", this.container);
            } else {
                logger.warn("[PhysicsEditor] Container already in DOM!");
                logger.warn("[PhysicsEditor] Container already in DOM!", this.container);
            }

            // Close button
            const closeBtn = document.getElementById("physics-editor-close");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => this.hide());
                logger.log("[PhysicsEditor] Close button setup complete");
            } else {
                logger.warn("[PhysicsEditor] Close button not found!");
            }

            // Styles
            const style = document.createElement("style");
            style.id = "physics-editor-styles";
            style.textContent = `
            #physics-editor {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.8) !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 10000 !important;
            }
            #physics-editor.hidden {
                display: none !important;
            }
            .physics-editor-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 15px;
                border-bottom: 2px solid rgba(0, 255, 0, 0.3);
                padding-bottom: 5px;
            }
            .physics-tab {
                padding: 8px 16px;
                background: rgba(0, 20, 0, 0.5);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #7f7;
                cursor: pointer;
                border-radius: 4px 4px 0 0;
                transition: all 0.2s;
                font-size: 12px;
            }
            .physics-tab:hover {
                background: rgba(0, 40, 0, 0.7);
                border-color: rgba(0, 255, 0, 0.6);
                color: #0f0;
            }
            .physics-tab.active {
                background: rgba(0, 60, 0, 0.8);
                border-color: #0f0;
                color: #0f0;
                border-bottom-color: transparent;
            }
            .physics-editor-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            .physics-editor-section {
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(0, 20, 0, 0.2);
                border: 1px solid rgba(0, 255, 0, 0.2);
                border-radius: 4px;
            }
            .physics-editor-section-title {
                color: #ff0;
                font-weight: bold;
                margin-bottom: 12px;
                font-size: 14px;
                text-transform: uppercase;
            }
            .physics-editor-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 10px;
                padding: 8px;
                background: rgba(0, 10, 0, 0.3);
                border-radius: 3px;
            }
            .physics-editor-row label {
                min-width: 200px;
                color: #aaa;
                font-size: 12px;
            }
            .physics-editor-row input[type="range"] {
                flex: 1;
                min-width: 200px;
            }
            .physics-editor-row input[type="number"] {
                width: 100px;
                padding: 4px;
                background: rgba(0, 5, 0, 0.5);
                border: 1px solid rgba(0, 255, 0, 0.3);
                color: #0f0;
                border-radius: 3px;
            }
            .physics-editor-value {
                min-width: 100px;
                color: #0f0;
                font-weight: bold;
                font-size: 12px;
                text-align: right;
            }
            .physics-editor-vector3 {
                display: flex;
                gap: 5px;
            }
            .physics-editor-vector3 input {
                width: 80px;
            }
            `;

            if (!document.getElementById("physics-editor-styles")) {
                document.head.appendChild(style);
                logger.log("[PhysicsEditor] Styles added");
            }
        } catch (error) {
            logger.error("[PhysicsEditor] Error creating UI:", error);
            logger.error("[PhysicsEditor] Error creating UI:", error);
            throw error;
        }
    }

    private setupTabs(): void {
        const tabButtons = this.container.querySelectorAll(".physics-tab");
        tabButtons.forEach(btn => {
            const button = btn as HTMLButtonElement;
            const tabName = button.dataset.tab || "";
            this.tabs.set(tabName, button);

            button.addEventListener("click", () => {
                this.switchTab(tabName);
            });
        });

        // Load initial tab
        this.switchTab(this.activeTab);
    }

    private switchTab(tabName: string): void {
        this.activeTab = tabName;

        // Update tab buttons
        this.tabs.forEach((btn, name) => {
            if (name === tabName) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update content
        this.renderTabContent(tabName);
    }

    private renderTabContent(tabName: string): void {
        const content = document.getElementById("physics-editor-content");
        if (!content) return;

        let html = "";

        switch (tabName) {
            case "tank":
                html = this.renderTankTab();
                break;
            case "turret":
                html = this.renderTurretTab();
                break;
            case "shooting":
                html = this.renderShootingTab();
                break;
            case "enemy":
                html = this.renderEnemyTab();
                break;
            case "modules":
                html = this.renderModulesTab();
                break;
            case "world":
                html = this.renderWorldTab();
                break;
            case "other":
                html = this.renderOtherTab();
                break;
        }

        content.innerHTML = html;
        this.setupInputs();
    }

    private renderTankTab(): string {
        const config = PHYSICS_CONFIG.tank;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Основные параметры</div>
                ${this.createSlider("tank.basic.mass", "Масса", config.basic.mass, 500, 5000, 50, "кг")}
                ${this.createSlider("tank.basic.hoverHeight", "Высота парения", config.basic.hoverHeight, 0.5, 3.0, 0.1, "м")}
                ${this.createSlider("tank.basic.moveSpeed", "Макс. скорость", config.basic.moveSpeed, 5, 100, 1, "м/с")}
                ${this.createSlider("tank.basic.turnSpeed", "Скорость поворота", config.basic.turnSpeed, 0.5, 10, 0.1, "рад/с")}
                ${this.createSlider("tank.basic.acceleration", "Ускорение", config.basic.acceleration, 1000, 50000, 500, "Н")}
                ${this.createSlider("tank.basic.maxHealth", "Макс. здоровье", config.basic.maxHealth, 50, 500, 10, "HP")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Стабильность и подвеска</div>
                ${this.createSlider("tank.stability.hoverStiffness", "Жёсткость парения", config.stability.hoverStiffness, 5000, 100000, 1000, "Н/м")}
                ${this.createSlider("tank.stability.hoverDamping", "Демпфирование парения", config.stability.hoverDamping, 1000, 30000, 500, "Н·с/м")}
                ${this.createSlider("tank.stability.linearDamping", "Линейное демпфирование", config.stability.linearDamping, 0, 5, 0.1)}
                ${this.createSlider("tank.stability.angularDamping", "Угловое демпфирование", config.stability.angularDamping, 0, 10, 0.1)}
                ${this.createSlider("tank.stability.uprightForce", "Сила выравнивания", config.stability.uprightForce, 5000, 50000, 1000, "Н")}
                ${this.createSlider("tank.stability.uprightDamp", "Демпфирование выравнивания", config.stability.uprightDamp, 2000, 20000, 500, "Н·с/м")}
                ${this.createSlider("tank.stability.stabilityForce", "Стабилизация", config.stability.stabilityForce, 1000, 10000, 500, "Н")}
                ${this.createSlider("tank.stability.emergencyForce", "Экстренное выравнивание", config.stability.emergencyForce, 10000, 100000, 5000, "Н")}
                ${this.createSlider("tank.stability.downForce", "Прижимная сила", config.stability.downForce, 500, 10000, 500, "Н")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Движение и управление</div>
                ${this.createSlider("tank.movement.turnAccel", "Угловое ускорение", config.movement.turnAccel, 5000, 30000, 500, "Н·м")}
                ${this.createSlider("tank.movement.stabilityTorque", "Стабилизация поворота", config.movement.stabilityTorque, 500, 10000, 500, "Н·м")}
                ${this.createSlider("tank.movement.yawDamping", "Демпфирование рыскания", config.movement.yawDamping, 1000, 15000, 500, "Н·м·с/рад")}
                ${this.createSlider("tank.movement.sideFriction", "Боковое трение", config.movement.sideFriction, 5000, 30000, 1000, "Н")}
                ${this.createSlider("tank.movement.sideDrag", "Боковое сопротивление", config.movement.sideDrag, 2000, 20000, 1000, "Н")}
                ${this.createSlider("tank.movement.fwdDrag", "Продольное сопротивление", config.movement.fwdDrag, 2000, 20000, 1000, "Н")}
                ${this.createSlider("tank.movement.angularDrag", "Угловое сопротивление", config.movement.angularDrag, 1000, 15000, 500, "Н·м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Система подъёма на препятствия</div>
                ${this.createSlider("tank.climbing.climbAssistForce", "Автоподъём", config.climbing.climbAssistForce, 10000, 200000, 5000, "Н")}
                ${this.createSlider("tank.climbing.maxClimbHeight", "Макс. высота подъёма", config.climbing.maxClimbHeight, 0.5, 5.0, 0.1, "м")}
                ${this.createSlider("tank.climbing.slopeBoostMax", "Множитель тяги на склонах", config.climbing.slopeBoostMax, 1.0, 5.0, 0.1)}
                ${this.createSlider("tank.climbing.frontClimbForce", "Сила подъёма передней части", config.climbing.frontClimbForce, 10000, 300000, 10000, "Н")}
                ${this.createSlider("tank.climbing.wallPushForce", "Сила проталкивания", config.climbing.wallPushForce, 5000, 100000, 5000, "Н")}
                ${this.createSlider("tank.climbing.climbTorque", "Момент подъёма", config.climbing.climbTorque, 5000, 50000, 1000, "Н·м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Вертикальные стены</div>
                ${this.createSlider("tank.verticalWalls.wallAttachmentForce", "Сила прилипания", config.verticalWalls.wallAttachmentForce, 5000, 50000, 1000, "Н")}
                ${this.createSlider("tank.verticalWalls.wallAttachmentDistance", "Расстояние прилипания", config.verticalWalls.wallAttachmentDistance, 0.5, 5.0, 0.1, "м")}
                ${this.createSlider("tank.verticalWalls.wallFrictionCoefficient", "Коэффициент трения", config.verticalWalls.wallFrictionCoefficient, 0.1, 2.0, 0.1)}
                ${this.createSlider("tank.verticalWalls.wallMinHorizontalSpeed", "Мин. горизонтальная скорость", config.verticalWalls.wallMinHorizontalSpeed, 0.1, 2.0, 0.1, "м/с")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Ограничения скорости</div>
                ${this.createSlider("tank.speedLimits.maxUpwardSpeed", "Макс. скорость вверх", config.speedLimits.maxUpwardSpeed, 1.0, 20.0, 0.5, "м/с")}
                ${this.createSlider("tank.speedLimits.maxDownwardSpeed", "Макс. скорость вниз", config.speedLimits.maxDownwardSpeed, 10, 100, 5, "м/с")}
                ${this.createSlider("tank.speedLimits.maxAngularSpeed", "Макс. угловая скорость", config.speedLimits.maxAngularSpeed, 0.5, 10.0, 0.1, "рад/с")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Центр масс</div>
                ${this.createVector3Input("tank.centerOfMass", "Центр масс", config.centerOfMass, -2, 2, 0.05, "м")}
            </div>
        `;
    }

    private renderTurretTab(): string {
        const config = PHYSICS_CONFIG.turret;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Управление башней</div>
                ${this.createSlider("turret.turret.speed", "Скорость башни", config.turret.speed, 0.01, 0.2, 0.01, "рад/кадр")}
                ${this.createSlider("turret.turret.baseSpeed", "Базовая скорость", config.turret.baseSpeed, 0.01, 0.2, 0.01, "рад/кадр")}
                ${this.createSlider("turret.turret.lerpSpeed", "Скорость интерполяции", config.turret.lerpSpeed, 0.05, 0.5, 0.05)}
                ${this.createSlider("turret.turret.mouseSensitivity", "Чувствительность мыши", config.turret.mouseSensitivity, 0.001, 0.01, 0.0005)}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Управление стволом</div>
                ${this.createSlider("turret.barrel.pitchSpeed", "Скорость наклона ствола", config.barrel.pitchSpeed, 0.01, 0.1, 0.005, "рад/кадр")}
                ${this.createSlider("turret.barrel.pitchLerpSpeed", "Скорость интерполяции", config.barrel.pitchLerpSpeed, 0.05, 0.5, 0.05)}
            </div>
        `;
    }

    private renderShootingTab(): string {
        const config = PHYSICS_CONFIG.shooting;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Параметры стрельбы</div>
                ${this.createSlider("shooting.basic.damage", "Урон", config.basic.damage, 1, 200, 1, "HP")}
                ${this.createSlider("shooting.basic.cooldown", "Перезарядка", config.basic.cooldown, 100, 10000, 100, "мс")}
                ${this.createSlider("shooting.basic.projectileSpeed", "Скорость снаряда", config.basic.projectileSpeed, 50, 1000, 10, "м/с")}
                ${this.createSlider("shooting.basic.projectileSize", "Размер снаряда", config.basic.projectileSize, 0.1, 1.0, 0.05, "м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Отдача</div>
                ${this.createSlider("shooting.recoil.force", "Сила отдачи", config.recoil.force, 100, 10000, 100, "Н")}
                ${this.createSlider("shooting.recoil.torque", "Угловая отдача", config.recoil.torque, 1000, 50000, 1000, "Н·м")}
                ${this.createSlider("shooting.recoil.barrelRecoilSpeed", "Скорость возврата", config.recoil.barrelRecoilSpeed, 0.1, 1.0, 0.05)}
                ${this.createSlider("shooting.recoil.barrelRecoilAmount", "Величина отката", config.recoil.barrelRecoilAmount, -3.0, 0, 0.1, "м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Параметры снарядов</div>
                ${this.createSlider("shooting.projectiles.mass", "Масса снаряда", config.projectiles.mass, 0.0001, 0.1, 0.0001, "кг")}
                ${this.createSlider("shooting.projectiles.linearDamping", "Линейное затухание", config.projectiles.linearDamping, 0, 1, 0.01)}
                ${this.createSlider("shooting.projectiles.impulseMultiplier", "Множитель импульса", config.projectiles.impulseMultiplier, 0.001, 0.1, 0.001)}
            </div>
        `;
    }

    private renderEnemyTab(): string {
        const config = PHYSICS_CONFIG.enemyTank;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Основные параметры врагов</div>
                ${this.createSlider("enemyTank.basic.mass", "Масса", config.basic.mass, 1000, 5000, 100, "кг")}
                ${this.createSlider("enemyTank.basic.moveSpeed", "Скорость", config.basic.moveSpeed, 5, 50, 1, "м/с")}
                ${this.createSlider("enemyTank.basic.turnSpeed", "Скорость поворота", config.basic.turnSpeed, 0.5, 10, 0.1, "рад/с")}
                ${this.createSlider("enemyTank.basic.acceleration", "Ускорение", config.basic.acceleration, 10000, 100000, 5000, "Н")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Стабильность врагов</div>
                ${this.createSlider("enemyTank.stability.hoverStiffness", "Жёсткость парения", config.stability.hoverStiffness, 5000, 100000, 1000, "Н/м")}
                ${this.createSlider("enemyTank.stability.hoverDamping", "Демпфирование", config.stability.hoverDamping, 1000, 30000, 500, "Н·с/м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Система подъёма врагов</div>
                ${this.createSlider("enemyTank.climbing.climbAssistForce", "Автоподъём", config.climbing.climbAssistForce, 50000, 300000, 10000, "Н")}
                ${this.createSlider("enemyTank.climbing.maxClimbHeight", "Макс. высота", config.climbing.maxClimbHeight, 1.0, 10.0, 0.5, "м")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Снаряды врагов</div>
                ${this.createSlider("enemyTank.projectiles.baseDamage", "Базовый урон", config.projectiles.baseDamage, 10, 100, 5, "HP")}
                ${this.createSlider("enemyTank.projectiles.impulse", "Импульс", config.projectiles.impulse, 1, 20, 1, "Н·с")}
            </div>
        `;
    }

    private renderModulesTab(): string {
        const config = PHYSICS_CONFIG.modules;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Модуль 6 (Защитные стены)</div>
                ${this.createSlider("modules.module6.maxWalls", "Макс. количество", config.module6.maxWalls, 1, 20, 1)}
                ${this.createSlider("modules.module6.wallMaxHealth", "Здоровье стенки", config.module6.wallMaxHealth, 50, 500, 10, "HP")}
                ${this.createSlider("modules.module6.cooldown", "Кулдаун", config.module6.cooldown, 1000, 60000, 1000, "мс")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Модуль 7 (Ускоренная стрельба)</div>
                ${this.createSlider("modules.module7.cooldown", "Кулдаун", config.module7.cooldown, 1000, 60000, 1000, "мс")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Модуль 8 (Автонаводка)</div>
                ${this.createSlider("modules.module8.cooldown", "Кулдаун", config.module8.cooldown, 1000, 60000, 1000, "мс")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Модуль 9 (Платформа)</div>
                ${this.createSlider("modules.module9.cooldown", "Кулдаун", config.module9.cooldown, 1000, 60000, 1000, "мс")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Модуль 0 (Прыжок)</div>
                ${this.createSlider("modules.module0.cooldown", "Кулдаун", config.module0.cooldown, 1000, 30000, 1000, "мс")}
                ${this.createSlider("modules.module0.basePower", "Базовая сила", config.module0.basePower, 10000, 100000, 5000, "Н")}
                ${this.createSlider("modules.module0.maxPower", "Макс. сила", config.module0.maxPower, 100000, 2000000, 100000, "Н")}
                ${this.createSlider("modules.module0.maxChargeTime", "Макс. время зарядки", config.module0.maxChargeTime, 1000, 30000, 1000, "мс")}
            </div>
        `;
    }

    private renderWorldTab(): string {
        const config = PHYSICS_CONFIG.world;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Гравитация</div>
                ${this.createVector3Input("world.gravity", "Гравитация", config.gravity, -50, 0, 0.1, "м/с²")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Параметры физики</div>
                ${this.createSlider("world.substeps", "Подшаги", config.substeps, 1, 10, 1)}
                ${this.createSlider("world.fixedTimeStep", "Шаг времени", config.fixedTimeStep, 1 / 120, 1 / 30, 1 / 120, "с")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Траектории снарядов</div>
                ${this.createSlider("world.trajectoryGravity", "Гравитация траекторий", config.trajectoryGravity, 1, 20, 0.1, "м/с²")}
                ${this.createSlider("world.trajectoryTimeStep", "Шаг времени", config.trajectoryTimeStep, 0.001, 0.1, 0.001, "с")}
                ${this.createSlider("world.trajectoryMaxTime", "Макс. время", config.trajectoryMaxTime, 1, 30, 1, "с")}
            </div>
        `;
    }

    private renderOtherTab(): string {
        const config = PHYSICS_CONFIG;
        return `
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Топливо</div>
                ${this.createSlider("fuel.maxFuel", "Макс. топливо", config.fuel.maxFuel, 100, 2000, 50, "л")}
                ${this.createSlider("fuel.fuelConsumptionRate", "Расход", config.fuel.fuelConsumptionRate, 0.1, 2.0, 0.1, "л/с")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Трассеры</div>
                ${this.createSlider("tracer.count", "Количество", config.tracer.count, 1, 20, 1)}
                ${this.createSlider("tracer.damage", "Урон", config.tracer.damage, 5, 50, 1, "HP")}
                ${this.createSlider("tracer.markDuration", "Длительность метки", config.tracer.markDuration, 1000, 60000, 1000, "мс")}
            </div>
            
            <div class="physics-editor-section">
                <div class="physics-editor-section-title">Константы</div>
                ${this.createSlider("constants.hitRadiusTank", "Радиус попадания (танк)", config.constants.hitRadiusTank, 1.0, 10.0, 0.5, "м")}
                ${this.createSlider("constants.hitRadiusTurret", "Радиус попадания (башня)", config.constants.hitRadiusTurret, 1.0, 10.0, 0.5, "м")}
                ${this.createSlider("constants.projectileMaxDistance", "Макс. расстояние", config.constants.projectileMaxDistance, 500, 5000, 100, "м")}
            </div>
        `;
    }

    private createSlider(path: string, label: string, value: number, min: number, max: number, step: number, unit: string = ""): string {
        const id = `physics-editor-${path.replace(/\./g, "-")}`;
        const displayId = `${id}-value`;
        return `
            <div class="physics-editor-row">
                <label>${label}:</label>
                <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
                <input type="number" id="${id}-num" min="${min}" max="${max}" step="${step}" value="${value}">
                <span class="physics-editor-value" id="${displayId}">${this.formatValue(value)} ${unit}</span>
            </div>
        `;
    }

    private createVector3Input(path: string, label: string, vec: Vector3, min: number, max: number, step: number, unit: string = ""): string {
        const id = `physics-editor-${path.replace(/\./g, "-")}`;
        return `
            <div class="physics-editor-row">
                <label>${label}:</label>
                <div class="physics-editor-vector3">
                    <input type="number" id="${id}-x" min="${min}" max="${max}" step="${step}" value="${vec.x}" placeholder="X">
                    <input type="number" id="${id}-y" min="${min}" max="${max}" step="${step}" value="${vec.y}" placeholder="Y">
                    <input type="number" id="${id}-z" min="${min}" max="${max}" step="${step}" value="${vec.z}" placeholder="Z">
                </div>
                <span class="physics-editor-value">${unit}</span>
            </div>
        `;
    }

    private formatValue(value: number): string {
        if (Math.abs(value) < 0.001) return value.toExponential(2);
        if (Math.abs(value) < 1) return value.toFixed(3);
        if (Math.abs(value) < 100) return value.toFixed(2);
        return value.toFixed(0);
    }

    private setupInputs(): void {
        // Clear old inputs
        this.inputs.clear();
        this.valueDisplays.clear();

        // Setup sliders and number inputs
        const content = document.getElementById("physics-editor-content");
        if (!content) return;

        const sliders = content.querySelectorAll("input[type='range']");
        const numbers = content.querySelectorAll("input[type='number']");

        sliders.forEach(slider => {
            const input = slider as HTMLInputElement;
            const path = input.id.replace("physics-editor-", "").replace(/-/g, ".");
            this.inputs.set(path, input);

            const numInput = content.querySelector(`#${input.id}-num`) as HTMLInputElement;
            const valueDisplay = content.querySelector(`#${input.id}-value`) as HTMLSpanElement;

            if (valueDisplay) {
                this.valueDisplays.set(path, valueDisplay);
            }

            // Sync slider and number input
            input.addEventListener("input", () => {
                const value = parseFloat(input.value);
                if (numInput) numInput.value = value.toString();
                if (valueDisplay) {
                    const unit = valueDisplay.textContent?.split(" ").slice(1).join(" ") || "";
                    valueDisplay.textContent = `${this.formatValue(value)} ${unit}`;
                }
                this.onParameterChange(path, value);
            });

            if (numInput) {
                numInput.addEventListener("input", () => {
                    const value = parseFloat(numInput.value);
                    input.value = value.toString();
                    if (valueDisplay) {
                        const unit = valueDisplay.textContent?.split(" ").slice(1).join(" ") || "";
                        valueDisplay.textContent = `${this.formatValue(value)} ${unit}`;
                    }
                    this.onParameterChange(path, value);
                });
            }
        });

        // Setup Vector3 inputs
        const vector3Groups = content.querySelectorAll(".physics-editor-vector3");
        vector3Groups.forEach(group => {
            const inputs = group.querySelectorAll("input[type='number']");
            if (inputs.length === 3) {
                const xInput = inputs[0] as HTMLInputElement;
                const yInput = inputs[1] as HTMLInputElement;
                const zInput = inputs[2] as HTMLInputElement;

                const path = xInput.id.replace("-x", "").replace("physics-editor-", "").replace(/-/g, ".");

                const updateVector3 = () => {
                    const x = parseFloat(xInput.value) || 0;
                    const y = parseFloat(yInput.value) || 0;
                    const z = parseFloat(zInput.value) || 0;
                    this.onVector3Change(path, new Vector3(x, y, z));
                };

                xInput.addEventListener("input", updateVector3);
                yInput.addEventListener("input", updateVector3);
                zInput.addEventListener("input", updateVector3);
            }
        });
    }

    private onParameterChange(path: string, value: number): void {
        // Update config
        const parts = path.split(".");
        let obj: any = PHYSICS_CONFIG;

        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (key === undefined) return;
            obj = obj[key];
        }

        const lastKey = parts[parts.length - 1];
        if (lastKey === undefined) return;
        obj[lastKey] = value;

        // Apply to tank in real-time
        this.applyToTank();

        // Save to storage
        savePhysicsConfigToStorage();
    }

    private onVector3Change(path: string, value: Vector3): void {
        const parts = path.split(".");
        let obj: any = PHYSICS_CONFIG;

        for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i];
            if (key === undefined) return;
            obj = obj[key];
        }

        const lastKey = parts[parts.length - 1];
        if (lastKey === undefined) return;
        obj[lastKey] = value;

        // Apply to tank in real-time
        this.applyToTank();

        // Save to storage
        savePhysicsConfigToStorage();
    }

    private applyToTank(): void {
        if (!this.tank) return;

        const config = PHYSICS_CONFIG.tank;

        // Apply basic parameters
        this.tank.mass = config.basic.mass;
        this.tank.hoverHeight = config.basic.hoverHeight;
        this.tank.moveSpeed = config.basic.moveSpeed;
        this.tank.turnSpeed = config.basic.turnSpeed;
        this.tank.acceleration = config.basic.acceleration;
        this.tank.maxHealth = config.basic.maxHealth;

        // Apply stability
        this.tank.hoverStiffness = config.stability.hoverStiffness;
        this.tank.hoverDamping = config.stability.hoverDamping;
        this.tank.uprightForce = config.stability.uprightForce;
        this.tank.uprightDamp = config.stability.uprightDamp;
        this.tank.stabilityForce = config.stability.stabilityForce;
        this.tank.emergencyForce = config.stability.emergencyForce;
        this.tank.downForce = config.stability.downForce;

        // Apply movement
        this.tank.turnAccel = config.movement.turnAccel;
        this.tank.stabilityTorque = config.movement.stabilityTorque;
        this.tank.yawDamping = config.movement.yawDamping;
        this.tank.sideFriction = config.movement.sideFriction;
        this.tank.sideDrag = config.movement.sideDrag;
        this.tank.fwdDrag = config.movement.fwdDrag;
        this.tank.angularDrag = config.movement.angularDrag;

        // Apply climbing
        this.tank.climbAssistForce = config.climbing.climbAssistForce;
        this.tank.maxClimbHeight = config.climbing.maxClimbHeight;
        this.tank.slopeBoostMax = config.climbing.slopeBoostMax;
        this.tank.frontClimbForce = config.climbing.frontClimbForce;
        this.tank.wallPushForce = config.climbing.wallPushForce;
        this.tank.climbTorque = config.climbing.climbTorque;

        // Apply vertical walls
        this.tank.verticalWallThreshold = config.verticalWalls.verticalWallThreshold;
        this.tank.wallAttachmentForce = config.verticalWalls.wallAttachmentForce;
        this.tank.wallAttachmentDistance = config.verticalWalls.wallAttachmentDistance;
        this.tank.wallFrictionCoefficient = config.verticalWalls.wallFrictionCoefficient;
        this.tank.wallMinHorizontalSpeed = config.verticalWalls.wallMinHorizontalSpeed;

        // Apply speed limits
        // Note: These are used in updatePhysics, so they're applied automatically

        // Apply center of mass
        if (this.tank.physicsBody) {
            this.tank.physicsBody.setMassProperties({
                mass: config.basic.mass,
                centerOfMass: config.centerOfMass
            });
            this.tank.physicsBody.setLinearDamping(config.stability.linearDamping);
            this.tank.physicsBody.setAngularDamping(config.stability.angularDamping);
        }

        // Apply turret
        this.tank.turretSpeed = PHYSICS_CONFIG.turret.turret.speed;
        this.tank.baseTurretSpeed = PHYSICS_CONFIG.turret.turret.baseSpeed;
        this.tank.turretLerpSpeed = PHYSICS_CONFIG.turret.turret.lerpSpeed;
        this.tank.mouseSensitivity = PHYSICS_CONFIG.turret.turret.mouseSensitivity;
        this.tank.baseBarrelPitchSpeed = PHYSICS_CONFIG.turret.barrel.pitchSpeed;
        this.tank.barrelPitchLerpSpeed = PHYSICS_CONFIG.turret.barrel.pitchLerpSpeed;

        // Apply shooting
        this.tank.damage = PHYSICS_CONFIG.shooting.basic.damage;
        this.tank.cooldown = PHYSICS_CONFIG.shooting.basic.cooldown;
        this.tank.projectileSpeed = PHYSICS_CONFIG.shooting.basic.projectileSpeed;
        this.tank.projectileSize = PHYSICS_CONFIG.shooting.basic.projectileSize;
        this.tank.recoilForce = PHYSICS_CONFIG.shooting.recoil.force;
        this.tank.recoilTorque = PHYSICS_CONFIG.shooting.recoil.torque;
        this.tank.barrelRecoilSpeed = PHYSICS_CONFIG.shooting.recoil.barrelRecoilSpeed;
        this.tank.barrelRecoilAmount = PHYSICS_CONFIG.shooting.recoil.barrelRecoilAmount;
    }

    private updateFromConfig(): void {
        // Update all inputs from current config
        this.inputs.forEach((input, path) => {
            const parts = path.split(".");
            let value: any = PHYSICS_CONFIG;

            for (const part of parts) {
                value = value[part];
            }

            if (typeof value === "number") {
                input.value = value.toString();
                const numInput = input.parentElement?.querySelector(`#${input.id}-num`) as HTMLInputElement;
                if (numInput) numInput.value = value.toString();

                const valueDisplay = this.valueDisplays.get(path);
                if (valueDisplay) {
                    const unit = valueDisplay.textContent?.split(" ").slice(1).join(" ") || "";
                    valueDisplay.textContent = `${this.formatValue(value)} ${unit}`;
                }
            }
        });
    }

    private setupButtons(): void {
        const resetBtn = document.getElementById("physics-editor-reset");
        const saveBtn = document.getElementById("physics-editor-save");
        const loadBtn = document.getElementById("physics-editor-load");
        const exportBtn = document.getElementById("physics-editor-export");
        const importBtn = document.getElementById("physics-editor-import");

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                inGameConfirm("Сбросить все параметры к значениям по умолчанию?", "Физика").then((ok) => {
                    if (ok) {
                        resetPhysicsConfig();
                        this.updateFromConfig();
                        this.applyToTank();
                    }
                }).catch(() => {});
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener("click", () => {
                savePhysicsConfigToStorage();
                if (this.game?.hud) {
                    this.game.hud.showMessage("Конфигурация сохранена", "#0f0", 2000);
                }
            });
        }

        if (loadBtn) {
            loadBtn.addEventListener("click", () => {
                loadPhysicsConfigFromStorage();
                this.updateFromConfig();
                this.applyToTank();
                if (this.game?.hud) {
                    this.game.hud.showMessage("Конфигурация загружена", "#0f0", 2000);
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener("click", () => {
                const json = JSON.stringify(PHYSICS_CONFIG, null, 2);
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "physics-config.json";
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        if (importBtn) {
            importBtn.addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "application/json";
                input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            try {
                                const json = JSON.parse(event.target?.result as string);
                                // Restore Vector3 objects
                                if (json.world?.gravity) {
                                    json.world.gravity = new Vector3(
                                        json.world.gravity.x,
                                        json.world.gravity.y,
                                        json.world.gravity.z
                                    );
                                }
                                if (json.tank?.centerOfMass) {
                                    json.tank.centerOfMass = new Vector3(
                                        json.tank.centerOfMass.x,
                                        json.tank.centerOfMass.y,
                                        json.tank.centerOfMass.z
                                    );
                                }
                                applyPhysicsConfig(json);
                                this.updateFromConfig();
                                this.applyToTank();
                                savePhysicsConfigToStorage();
                                if (this.game?.hud) {
                                    this.game.hud.showMessage("Конфигурация импортирована", "#0f0", 2000);
                                }
                            } catch (error) {
                                logger.error("[PhysicsEditor] Failed to import config:", error);
                                if (this.game?.hud) {
                                    this.game.hud.showMessage("Ошибка импорта конфигурации", "#f00", 3000);
                                }
                            }
                        };
                        reader.readAsText(file);
                    }
                };
                input.click();
            });
        }
    }

    toggle(): void {
        if (!this.container) {
            logger.error("[PhysicsEditor] Cannot toggle: container not initialized");
            // Попытка пересоздать UI
            try {
                this.createUI();
                this.setupTabs();
                this.setupInputs();
                this.setupButtons();
            } catch (error) {
                logger.error("[PhysicsEditor] Failed to recreate UI:", error);
                return;
            }
        }

        this.visible = !this.visible;
        logger.log(`[PhysicsEditor] Toggling: visible=${this.visible}`);

        if (this.visible) {
            // Убеждаемся, что контейнер в DOM
            if (!document.body.contains(this.container)) {
                logger.warn("[PhysicsEditor] Container not in DOM, re-adding...");
                document.body.appendChild(this.container);
            }

            // Убираем класс hidden - CSS сам покажет контейнер с display: flex
            this.container.classList.remove("hidden");
            this.updateFromConfig();

            // Показываем курсор и выходим из pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            document.body.style.cursor = 'default';
        } else {
            this.container.classList.add("hidden");
            logger.log("[PhysicsEditor] Editor hidden");
        }
    }

    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
    }

    isVisible(): boolean {
        return this.visible;
    }

    /**
     * Рендерит контент в переданный контейнер (для UnifiedMenu)
     */
    renderToContainer(container: HTMLElement): void {
        container.innerHTML = this.getEmbeddedContentHTML();
        this.setupEmbeddedEventListeners(container);
    }

    /**
     * Возвращает HTML контента без overlay wrapper
     */
    private getEmbeddedContentHTML(): string {
        return `
            <div class="physics-editor-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    🔧 Редактор физики
                </h3>
                
                <div style="margin-bottom: 16px; padding: 10px; background: rgba(255, 255, 0, 0.1); border: 1px solid rgba(255, 255, 0, 0.3); border-radius: 4px;">
                    <div style="color: #ff0; font-size: 11px;">⚠️ Изменения применяются в реальном времени</div>
                </div>
                
                <!-- Категории параметров -->
                <div class="pe-tabs" style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
                    <button class="panel-btn pe-tab active" data-tab="tank" style="padding: 6px 10px; font-size: 10px;">🚗 Танк</button>
                    <button class="panel-btn pe-tab" data-tab="turret" style="padding: 6px 10px; font-size: 10px;">🔫 Башня</button>
                    <button class="panel-btn pe-tab" data-tab="projectile" style="padding: 6px 10px; font-size: 10px;">💥 Снаряды</button>
                    <button class="panel-btn pe-tab" data-tab="world" style="padding: 6px 10px; font-size: 10px;">🌍 Мир</button>
                </div>
                
                <!-- Контент вкладок -->
                <div class="pe-content">
                    <!-- Танк -->
                    <div class="pe-tab-content active" data-tab="tank">
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Макс. скорость: <span class="pe-maxspeed-val" style="color: #0f0;">50</span>
                            </label>
                            <input type="range" class="pe-maxspeed" min="10" max="150" value="50" style="width: 100%;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Ускорение: <span class="pe-accel-val" style="color: #0f0;">20</span>
                            </label>
                            <input type="range" class="pe-accel" min="5" max="100" value="20" style="width: 100%;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Масса: <span class="pe-mass-val" style="color: #0f0;">5000</span> кг
                            </label>
                            <input type="range" class="pe-mass" min="1000" max="20000" step="100" value="5000" style="width: 100%;">
                        </div>
                    </div>
                    
                    <!-- Башня -->
                    <div class="pe-tab-content" data-tab="turret" style="display: none;">
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Скорость поворота: <span class="pe-turret-speed-val" style="color: #0f0;">1.0</span>
                            </label>
                            <input type="range" class="pe-turret-speed" min="0.1" max="5" step="0.1" value="1" style="width: 100%;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Угол возвышения: <span class="pe-elevation-val" style="color: #0f0;">30</span>°
                            </label>
                            <input type="range" class="pe-elevation" min="0" max="90" value="30" style="width: 100%;">
                        </div>
                    </div>
                    
                    <!-- Снаряды -->
                    <div class="pe-tab-content" data-tab="projectile" style="display: none;">
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Скорость снаряда: <span class="pe-proj-speed-val" style="color: #0f0;">200</span>
                            </label>
                            <input type="range" class="pe-proj-speed" min="50" max="500" value="200" style="width: 100%;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Урон: <span class="pe-damage-val" style="color: #0f0;">50</span>
                            </label>
                            <input type="range" class="pe-damage" min="10" max="500" value="50" style="width: 100%;">
                        </div>
                    </div>
                    
                    <!-- Мир -->
                    <div class="pe-tab-content" data-tab="world" style="display: none;">
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Гравитация: <span class="pe-gravity-val" style="color: #0f0;">-9.81</span>
                            </label>
                            <input type="range" class="pe-gravity" min="-20" max="0" step="0.1" value="-9.81" style="width: 100%;">
                        </div>
                        <div style="margin-bottom: 12px;">
                            <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                                Сопротивление воздуха: <span class="pe-drag-val" style="color: #0f0;">0.1</span>
                            </label>
                            <input type="range" class="pe-drag" min="0" max="1" step="0.01" value="0.1" style="width: 100%;">
                        </div>
                    </div>
                </div>
                
                <!-- Кнопки -->
                <div style="display: flex; gap: 10px; margin-top: 16px;">
                    <button class="panel-btn primary pe-save-btn" style="flex: 1; padding: 10px;">💾 Сохранить</button>
                    <button class="panel-btn pe-reset-btn" style="flex: 1; padding: 10px;">↻ Сбросить</button>
                    <button class="panel-btn pe-export-btn" style="flex: 1; padding: 10px;">📤 Экспорт</button>
                </div>
            </div>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        // Обработчики вкладок
        const tabs = container.querySelectorAll(".pe-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab;
                if (!tabName) return;

                container.querySelectorAll(".pe-tab").forEach(t => t.classList.remove("active"));
                container.querySelectorAll(".pe-tab-content").forEach(c => {
                    (c as HTMLElement).style.display = "none";
                    c.classList.remove("active");
                });

                tab.classList.add("active");
                const content = container.querySelector(`.pe-tab-content[data-tab="${tabName}"]`) as HTMLElement;
                if (content) {
                    content.style.display = "block";
                    content.classList.add("active");
                }
            });
        });

        // Обработчики слайдеров
        const setupSlider = (className: string, valClassName: string, suffix = "") => {
            const slider = container.querySelector(`.${className}`) as HTMLInputElement;
            const valEl = container.querySelector(`.${valClassName}`);
            slider?.addEventListener("input", () => {
                if (valEl) valEl.textContent = slider.value + suffix;
            });
        };

        setupSlider("pe-maxspeed", "pe-maxspeed-val");
        setupSlider("pe-accel", "pe-accel-val");
        setupSlider("pe-mass", "pe-mass-val");
        setupSlider("pe-turret-speed", "pe-turret-speed-val");
        setupSlider("pe-elevation", "pe-elevation-val", "°");
        setupSlider("pe-proj-speed", "pe-proj-speed-val");
        setupSlider("pe-damage", "pe-damage-val");
        setupSlider("pe-gravity", "pe-gravity-val");
        setupSlider("pe-drag", "pe-drag-val");

        // Кнопка сохранения
        const saveBtn = container.querySelector(".pe-save-btn");
        saveBtn?.addEventListener("click", () => {
            // Собираем все значения
            const config = {
                tank: {
                    maxSpeed: parseFloat((container.querySelector(".pe-maxspeed") as HTMLInputElement)?.value || "50"),
                    acceleration: parseFloat((container.querySelector(".pe-accel") as HTMLInputElement)?.value || "20"),
                    mass: parseFloat((container.querySelector(".pe-mass") as HTMLInputElement)?.value || "5000"),
                },
                turret: {
                    rotationSpeed: parseFloat((container.querySelector(".pe-turret-speed") as HTMLInputElement)?.value || "1"),
                    maxElevation: parseFloat((container.querySelector(".pe-elevation") as HTMLInputElement)?.value || "30"),
                },
                projectile: {
                    speed: parseFloat((container.querySelector(".pe-proj-speed") as HTMLInputElement)?.value || "200"),
                    damage: parseFloat((container.querySelector(".pe-damage") as HTMLInputElement)?.value || "50"),
                },
                world: {
                    gravity: parseFloat((container.querySelector(".pe-gravity") as HTMLInputElement)?.value || "-9.81"),
                    drag: parseFloat((container.querySelector(".pe-drag") as HTMLInputElement)?.value || "0.1"),
                }
            };

            // Применяем к танку
            if (this.tank) {
                this.tank.moveSpeed = config.tank.maxSpeed;
                (this.tank as any).acceleration = config.tank.acceleration;
            }

            localStorage.setItem("ptx_physics_config", JSON.stringify(config));

            if (this.game?.hud) {
                this.game.hud.showMessage("Настройки физики сохранены!", "#0f0", 2000);
            }
        });

        // Кнопка сброса
        const resetBtn = container.querySelector(".pe-reset-btn");
        resetBtn?.addEventListener("click", () => {
            localStorage.removeItem("ptx_physics_config");
            if (this.game?.hud) {
                this.game.hud.showMessage("Настройки сброшены!", "#ff0", 2000);
            }
        });

        // Кнопка экспорта
        const exportBtn = container.querySelector(".pe-export-btn");
        exportBtn?.addEventListener("click", () => {
            const config = localStorage.getItem("ptx_physics_config") || "{}";
            navigator.clipboard.writeText(config);
            if (this.game?.hud) {
                this.game.hud.showMessage("Конфиг скопирован в буфер!", "#0ff", 2000);
            }
        });
    }
}

// Singleton instance
let physicsEditorInstance: PhysicsEditor | null = null;

export function getPhysicsEditor(): PhysicsEditor {
    if (!physicsEditorInstance) {
        try {
            logger.log("[PhysicsEditor] Creating new instance...");
            physicsEditorInstance = new PhysicsEditor();
            logger.log("[PhysicsEditor] Instance created successfully");
        } catch (error) {
            logger.error("[PhysicsEditor] Failed to create instance:", error);
            throw error;
        }
    }
    return physicsEditorInstance;
}

