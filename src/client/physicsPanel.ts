import { TankController } from "./tankController";
import { Vector3, Scene } from "@babylonjs/core";
import { Game } from "./game";
import { PhysicsVisualizer } from "./physicsVisualizer";
import { PhysicsSimulator } from "./physicsSimulator";
import { logger } from "./utils/logger";
import { CommonStyles } from "./commonStyles";
import { inGameAlert, inGameConfirm, inGamePrompt } from "./utils/inGameDialogs";

interface Preset {
    name: string;
    config: { [key: string]: number };
}

export class PhysicsPanel {
    private container!: HTMLDivElement;
    private tank: TankController | null = null;
    private game: Game | null = null;
    private scene: Scene | null = null;
    private visible = false;
    private physicsVisualizer: PhysicsVisualizer | null = null;
    private physicsSimulator: PhysicsSimulator | null = null;

    // Input elements
    private inputs: Map<string, HTMLInputElement> = new Map();
    private valueDisplays: Map<string, HTMLSpanElement> = new Map();

    // Presets
    private presets: Preset[] = [];
    private maxPresets = 10; // Расширено с 5 до 10

    private embedded = false;

    constructor(embedded: boolean = false) {
        this.embedded = embedded;
        this.loadPresets();

        // Не создаём overlay UI если панель будет встроена в другое меню
        if (!embedded) {
            this.createUI();
            this.setupToggle();
            this.visible = false;
            this.container.classList.add("hidden");
            this.container.style.display = "none";
        }

        // Touch properties to avoid unused warnings (зарезервировано для будущего расширения)
        if (this.game || this.scene) {
            // no-op
        }
    }

    setGame(game: Game | null): void {
        this.game = game;
        if (game && game.scene) {
            this.scene = game.scene;
            this.physicsVisualizer = new PhysicsVisualizer(game.scene);
            this.physicsSimulator = new PhysicsSimulator(game.scene);
            // Обновляем список сценариев если UI уже создан
            const simScenario = document.getElementById("physics-sim-scenario") as HTMLSelectElement;
            if (simScenario && this.physicsSimulator) {
                simScenario.innerHTML = '<option value="">Выберите сценарий...</option>';
                const scenarios = this.physicsSimulator.getScenarios();
                scenarios.forEach(scenario => {
                    const option = document.createElement('option');
                    option.value = scenario.id;
                    option.textContent = scenario.name;
                    simScenario.appendChild(option);
                });
            }
        }
    }

    setTank(tank: TankController): void {
        this.tank = tank;
        this.updateFromTank();
        if (this.physicsVisualizer && tank.chassis && tank.physicsBody) {
            this.physicsVisualizer.setTarget(tank.chassis, tank.physicsBody);
        }
    }

    private createUI(): void {
        // Инжектируем общие стили если еще не инжектированы
        CommonStyles.initialize();

        this.container = document.createElement("div");
        this.container.id = "physics-panel";
        this.container.className = "panel-overlay";

        const sections = [
            {
                title: "ОСНОВНЫЕ",
                params: [
                    { key: "mass", label: "Масса", min: 500, max: 5000, step: 50 },
                    { key: "hoverHeight", label: "Высота парения", min: 0.5, max: 3.0, step: 0.1 },
                    { key: "moveSpeed", label: "Макс. скорость", min: 5, max: 100, step: 1 },
                    { key: "turnSpeed", label: "Скорость поворота", min: 0.5, max: 10, step: 0.1 },
                    { key: "acceleration", label: "Ускорение", min: 1000, max: 50000, step: 500 },
                    { key: "maxHealth", label: "Макс. здоровье", min: 50, max: 500, step: 10 },
                ]
            },
            {
                title: "СТАБИЛЬНОСТЬ",
                params: [
                    { key: "hoverStiffness", label: "Жёсткость парения", min: 5000, max: 100000, step: 1000 },
                    { key: "hoverDamping", label: "Демпфирование парения", min: 1000, max: 30000, step: 500 },
                    { key: "linearDamping", label: "Линейное демпфирование", min: 0, max: 5, step: 0.1 },
                    { key: "angularDamping", label: "Угловое демпфирование", min: 0, max: 10, step: 0.1 },
                    { key: "uprightForce", label: "Сила выравнивания", min: 5000, max: 50000, step: 1000 },
                    { key: "uprightDamp", label: "Демпфирование выравнивания", min: 2000, max: 20000, step: 500 },
                    { key: "stabilityForce", label: "Стабилизация при движении", min: 1000, max: 10000, step: 500 },
                    { key: "emergencyForce", label: "Экстренное выравнивание", min: 10000, max: 100000, step: 5000 },
                    { key: "liftForce", label: "Подъёмная сила", min: 20000, max: 150000, step: 10000 },
                    { key: "downForce", label: "Прижимная сила", min: 500, max: 10000, step: 500 },
                ]
            },
            {
                title: "ДВИЖЕНИЕ",
                params: [
                    { key: "turnAccel", label: "Угловое ускорение", min: 5000, max: 30000, step: 500 },
                    { key: "stabilityTorque", label: "Стабилизация поворота", min: 500, max: 10000, step: 500 },
                    { key: "yawDamping", label: "Демпфирование рыскания", min: 1000, max: 15000, step: 500 },
                    { key: "sideFriction", label: "Боковое трение", min: 5000, max: 30000, step: 1000 },
                    { key: "sideDrag", label: "Боковое сопротивление", min: 2000, max: 20000, step: 1000 },
                    { key: "fwdDrag", label: "Продольное сопротивление", min: 2000, max: 20000, step: 1000 },
                    { key: "angularDrag", label: "Угловое сопротивление", min: 1000, max: 15000, step: 500 },
                ]
            },
            {
                title: "БАШНЯ",
                params: [
                    { key: "turretSpeed", label: "Скорость башни", min: 0.01, max: 0.2, step: 0.01 },
                    { key: "baseTurretSpeed", label: "Базовая скорость башни", min: 0.01, max: 0.2, step: 0.01 },
                    { key: "turretLerpSpeed", label: "Скорость интерполяции", min: 0.05, max: 0.5, step: 0.05 },
                    { key: "mouseSensitivity", label: "Чувствительность мыши", min: 0.001, max: 0.01, step: 0.0005 },
                ]
            },
            {
                title: "СТРЕЛЬБА",
                params: [
                    { key: "damage", label: "Урон", min: 1, max: 200, step: 1 },
                    { key: "cooldown", label: "Перезарядка (мс)", min: 100, max: 10000, step: 100 },
                    { key: "projectileSpeed", label: "Скорость снаряда", min: 50, max: 1000, step: 10 },
                    { key: "projectileSize", label: "Размер снаряда", min: 0.1, max: 1.0, step: 0.05 },
                ]
            },
            {
                title: "ОТДАЧА",
                params: [
                    { key: "recoilForce", label: "Сила отдачи", min: 100, max: 3000, step: 100 },
                    { key: "recoilTorque", label: "Угловая отдача", min: 1000, max: 10000, step: 500 },
                    { key: "barrelRecoilSpeed", label: "Скорость возврата пушки", min: 0.1, max: 1.0, step: 0.05 },
                    { key: "barrelRecoilAmount", label: "Величина отката пушки", min: -1.0, max: 0, step: 0.05 },
                ]
            }
        ];

        let html = `
            <div class="panel">
                <div class="panel-header">
                    <div class="panel-title">НАСТРОЙКИ ФИЗИКИ [Ctrl+4]</div>
                    <button class="panel-close" id="physics-close">✕</button>
                </div>
                <div class="panel-content">
                            <div class="physics-controls">
                                <button id="physics-reset" class="panel-btn secondary">Сброс</button>
                                <button id="physics-save-preset" class="panel-btn primary">Сохранить</button>
                                <button id="physics-export-presets" class="panel-btn secondary">Экспорт</button>
                                <button id="physics-import-presets" class="panel-btn secondary">Импорт</button>
                            </div>
                            <div class="physics-visualization" style="margin-top: 15px; padding: 10px; background: rgba(0, 20, 0, 0.3); border: 1px solid rgba(0, 255, 4, 0.3); border-radius: 4px;">
                                <div style="color: #ff0; font-weight: bold; margin-bottom: 8px;">ВИЗУАЛИЗАЦИЯ</div>
                                <label style="display: flex; align-items: center; margin-bottom: 5px; color: #aaa; font-size: 11px;">
                                    <input type="checkbox" id="physics-viz-enabled" style="margin-right: 8px;">
                                    Включить визуализацию
                                </label>
                                <label style="display: flex; align-items: center; margin-bottom: 5px; color: #aaa; font-size: 11px;">
                                    <input type="checkbox" id="physics-viz-vectors" style="margin-right: 8px;">
                                    Векторы сил
                                </label>
                                <label style="display: flex; align-items: center; margin-bottom: 5px; color: #aaa; font-size: 11px;">
                                    <input type="checkbox" id="physics-viz-velocity" style="margin-right: 8px;">
                                    Скорость
                                </label>
                                <label style="display: flex; align-items: center; margin-bottom: 5px; color: #aaa; font-size: 11px;">
                                    <input type="checkbox" id="physics-viz-com" style="margin-right: 8px;">
                                    Центр масс
                                </label>
                                <label style="display: flex; align-items: center; margin-bottom: 5px; color: #aaa; font-size: 11px;">
                                    <input type="checkbox" id="physics-viz-collisions" style="margin-right: 8px;">
                                    Коллизии
                                </label>
                                <div style="margin-top: 8px;">
                                    <label style="color: #aaa; font-size: 11px;">Масштаб векторов:</label>
                                    <input type="range" id="physics-viz-scale" min="0.1" max="5" step="0.1" value="1" style="width: 100%;">
                                    <span id="physics-viz-scale-value" style="color: #0f0; font-size: 11px;">1.0</span>
                            </div>
                    </div>
                    <div class="physics-presets" id="physics-presets-list"></div>
                    <div class="physics-simulation" style="margin-top: 15px; padding: 10px; background: rgba(0, 20, 0, 0.3); border: 1px solid rgba(0, 255, 4, 0.3); border-radius: 4px;">
                        <div style="color: #ff0; font-weight: bold; margin-bottom: 8px;">СИМУЛЯЦИЯ</div>
                        <select id="physics-sim-scenario" style="width: 100%; padding: 4px; background: rgba(0, 5, 0, 0.5); border: 1px solid rgba(0, 255, 4, 0.4); color: #0f0; font-size: 11px; margin-bottom: 8px;">
                            <option value="">Выберите сценарий...</option>
                        </select>
                        <div style="display: flex; gap: 5px;">
                            <button id="physics-sim-start" class="panel-btn secondary" style="flex: 1;">Запустить</button>
                            <button id="physics-sim-stop" class="panel-btn secondary" style="flex: 1;">Остановить</button>
                        </div>
                    </div>
        `;

        sections.forEach(section => {
            html += `<div class="physics-section">
                <div class="physics-label">${section.title}</div>`;

            section.params.forEach(param => {
                const id = `physics-${param.key}`;
                html += `
                    <div class="physics-row">
                        <span>${param.label}:</span>
                        <div class="physics-slider-container">
                            <input type="range" id="${id}" 
                                min="${param.min}" max="${param.max}" step="${param.step}" 
                                class="physics-slider">
                            <span class="physics-value" id="${id}-value">-</span>
                        </div>
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
        style.id = "physics-panel-styles";
        style.textContent = `
            #physics-panel .panel {
                max-width: 600px;
                max-height: 85vh;
                width: 90%;
            }
            .physics-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            .physics-presets {
                margin-bottom: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(0, 255, 0, 0.2);
            }
            .physics-preset-item {
                display: flex;
                gap: 4px;
                margin-bottom: 4px;
                align-items: center;
            }
            .physics-preset-name {
                flex: 1;
                color: #7f7;
                font-size: 12px;
                padding: 8px 12px;
                background: rgba(0, 255, 0, 0.05);
                border: 1px solid rgba(0, 255, 0, 0.3);
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .physics-preset-name:hover {
                background: rgba(0, 255, 0, 0.15);
                color: #0f0;
                border-color: #0f0;
            }
            .physics-preset-btn {
                background: rgba(255, 0, 0, 0.1);
                border: 1px solid #f00;
                color: #f00;
                padding: 8px 12px;
                cursor: pointer;
                font-size: 11px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .physics-preset-btn:hover {
                background: rgba(255, 0, 0, 0.2);
                box-shadow: 0 0 10px rgba(255, 0, 0, 0.3);
            }
            .physics-section {
                margin-bottom: 8px;
            }
            .physics-label {
                color: #0ff;
                font-weight: bold;
                font-size: 13px;
                margin-bottom: 10px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .physics-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 0;
                gap: 10px;
            }
            .physics-row span:first-child {
                color: #7f7;
                font-size: 12px;
                min-width: 120px;
            }
            .physics-slider-container {
                display: flex;
                align-items: center;
                gap: 6px;
                flex: 1;
            }
            .physics-slider {
                flex: 1;
                height: 4px;
                background: #333;
                border-radius: 2px;
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }
            .physics-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 10px;
                height: 10px;
                background: #0f0;
                border-radius: 50%;
                cursor: pointer;
                border: 1px solid #0ff;
            }
            .physics-slider::-moz-range-thumb {
                width: 10px;
                height: 10px;
                background: #0f0;
                border-radius: 50%;
                cursor: pointer;
                border: 1px solid #0ff;
            }
            .physics-value {
                color: #0f0;
                font-weight: bold;
                font-size: 12px;
                min-width: 60px;
                text-align: right;
                text-shadow: 0 0 5px #0f0;
            }
            .physics-preset-input {
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid #0f0;
                color: #0f0;
                padding: 2px 4px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                width: 100%;
                margin-bottom: 4px;
            }
            .physics-preset-input:focus {
                outline: none;
                background: rgba(0, 255, 0, 0.2);
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);

        // Setup event listeners
        this.setupInputs();
        this.setupButtons();
        this.setupCloseButton();
        this.setupSimulation();
        this.updatePresetsList();
    }

    private setupSimulation(): void {
        const simScenario = document.getElementById("physics-sim-scenario") as HTMLSelectElement;
        const simStart = document.getElementById("physics-sim-start");
        const simStop = document.getElementById("physics-sim-stop");

        // Заполняем список сценариев
        if (this.physicsSimulator && simScenario) {
            const scenarios = this.physicsSimulator.getScenarios();
            scenarios.forEach(scenario => {
                const option = document.createElement('option');
                option.value = scenario.id;
                option.textContent = scenario.name;
                simScenario.appendChild(option);
            });
        }

        simStart?.addEventListener("click", async () => {
            if (this.physicsSimulator && simScenario?.value) {
                await this.physicsSimulator.runScenario(simScenario.value);
            }
        });

        simStop?.addEventListener("click", () => {
            if (this.physicsSimulator) {
                this.physicsSimulator.stopSimulation();
            }
        });
    }

    private setupInputs(): void {
        const sliders = this.container.querySelectorAll(".physics-slider");
        sliders.forEach(slider => {
            const input = slider as HTMLInputElement;
            const key = input.id.replace("physics-", "");
            this.inputs.set(key, input);

            const valueDisplay = document.getElementById(`${input.id}-value`) as HTMLSpanElement;
            if (valueDisplay) {
                this.valueDisplays.set(key, valueDisplay);
            }

            input.addEventListener("input", () => {
                this.onParameterChange(key, parseFloat(input.value));
            });
        });
    }

    private setupButtons(): void {
        const resetBtn = document.getElementById("physics-reset");
        const savePresetBtn = document.getElementById("physics-save-preset");
        const exportPresetsBtn = document.getElementById("physics-export-presets");
        const importPresetsBtn = document.getElementById("physics-import-presets");

        if (resetBtn) {
            resetBtn.addEventListener("click", () => this.resetToDefaults());
        }
        if (savePresetBtn) {
            savePresetBtn.addEventListener("click", () => this.showSavePresetDialog());
        }
        if (exportPresetsBtn) {
            exportPresetsBtn.addEventListener("click", () => this.exportPresets());
        }
        if (importPresetsBtn) {
            importPresetsBtn.addEventListener("click", () => this.importPresets());
        }
    }

    private setupToggle(): void {
        // F4 обработчик управляется в game.ts для консистентности
        // Этот метод оставлен для возможного будущего использования
    }

    toggle(): void {
        if (!this.container) {
            logger.warn("[PhysicsPanel] Cannot toggle: container not initialized");
            return;
        }

        this.visible = !this.visible;
        logger.debug(`[PhysicsPanel] Toggle: ${this.visible ? 'show' : 'hide'}`);

        if (this.visible) {
            this.container.classList.remove("hidden");
            this.container.style.display = "";
            if (this.tank) {
                this.updateFromTank();
            }

            // Показываем курсор и выходим из pointer lock
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
            document.body.style.cursor = 'default';
        } else {
            this.container.classList.add("hidden");
            this.container.style.display = "none";
        }
    }

    hide(): void {
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
        // Очистка визуализации при скрытии
        if (this.physicsVisualizer) {
            this.physicsVisualizer.clearVisualizations();
        }
    }

    private updateFromTank(): void {
        if (!this.tank) return;

        const values: { [key: string]: number } = {
            mass: this.tank.mass,
            hoverHeight: this.tank.hoverHeight,
            moveSpeed: this.tank.moveSpeed,
            turnSpeed: this.tank.turnSpeed,
            acceleration: this.tank.acceleration,
            maxHealth: this.tank.maxHealth,
            hoverStiffness: this.tank.hoverStiffness,
            hoverDamping: this.tank.hoverDamping,
            linearDamping: (this.tank.physicsBody as any).getLinearDamping?.() ?? 0.5,
            angularDamping: (this.tank.physicsBody as any).getAngularDamping?.() ?? 3.0,
            uprightForce: this.tank.uprightForce,
            uprightDamp: this.tank.uprightDamp,
            stabilityForce: this.tank.stabilityForce,
            emergencyForce: this.tank.emergencyForce,
            liftForce: this.tank.liftForce,
            downForce: this.tank.downForce,
            turnAccel: this.tank.turnAccel,
            stabilityTorque: this.tank.stabilityTorque,
            yawDamping: this.tank.yawDamping,
            sideFriction: this.tank.sideFriction,
            sideDrag: this.tank.sideDrag,
            fwdDrag: this.tank.fwdDrag,
            angularDrag: this.tank.angularDrag,
            turretSpeed: this.tank.turretSpeed,
            baseTurretSpeed: this.tank.baseTurretSpeed,
            turretLerpSpeed: this.tank.turretLerpSpeed,
            mouseSensitivity: this.tank.mouseSensitivity,
            damage: this.tank.damage,
            cooldown: this.tank.cooldown,
            projectileSpeed: this.tank.projectileSpeed,
            projectileSize: this.tank.projectileSize,
            recoilForce: this.tank.recoilForce,
            recoilTorque: this.tank.recoilTorque,
            barrelRecoilSpeed: this.tank.barrelRecoilSpeed,
            barrelRecoilAmount: this.tank.barrelRecoilAmount,
        };

        // Update sliders and displays
        Object.entries(values).forEach(([key, value]) => {
            const input = this.inputs.get(key);
            const display = this.valueDisplays.get(key);

            if (input && !isNaN(value)) {
                input.value = value.toString();
                if (display) {
                    display.textContent = this.formatValue(value, key);
                }
            }
        });
    }

    private onParameterChange(key: string, value: number): void {
        if (!this.tank) return;

        const display = this.valueDisplays.get(key);
        if (display) {
            display.textContent = this.formatValue(value, key);
        }

        // Update tank parameter
        switch (key) {
            case "mass":
                this.tank.mass = value;
                if (this.tank.physicsBody) {
                    // Центр тяжести: немного ниже (Y) и сзади (Z), чтобы при ускорении вперед нос поднимался
                    this.tank.physicsBody.setMassProperties({ mass: value, centerOfMass: new Vector3(0, -0.55, -0.3) });
                }
                break;
            case "hoverHeight":
                this.tank.hoverHeight = value;
                break;
            case "moveSpeed":
                this.tank.moveSpeed = value;
                break;
            case "turnSpeed":
                this.tank.turnSpeed = value;
                break;
            case "acceleration":
                this.tank.acceleration = value;
                break;
            case "hoverStiffness":
                this.tank.hoverStiffness = value;
                break;
            case "hoverDamping":
                this.tank.hoverDamping = value;
                break;
            case "linearDamping":
                if (this.tank.physicsBody) {
                    this.tank.physicsBody.setLinearDamping(value);
                }
                break;
            case "angularDamping":
                if (this.tank.physicsBody) {
                    this.tank.physicsBody.setAngularDamping(value);
                }
                break;
            case "uprightForce":
                this.tank.uprightForce = value;
                break;
            case "uprightDamp":
                this.tank.uprightDamp = value;
                break;
            case "turretSpeed":
                this.tank.turretSpeed = value;
                break;
            case "mouseSensitivity":
                this.tank.mouseSensitivity = value;
                break;
            case "damage":
                this.tank.damage = value;
                break;
            case "cooldown":
                this.tank.cooldown = value;
                break;
            case "projectileSpeed":
                this.tank.projectileSpeed = value;
                break;
            case "projectileSize":
                this.tank.projectileSize = value;
                break;
            case "maxHealth":
                this.tank.maxHealth = value;
                if (this.tank.currentHealth > value) {
                    this.tank.currentHealth = value;
                }
                break;
            case "stabilityForce":
                this.tank.stabilityForce = value;
                break;
            case "emergencyForce":
                this.tank.emergencyForce = value;
                break;
            case "liftForce":
                this.tank.liftForce = value;
                break;
            case "downForce":
                this.tank.downForce = value;
                break;
            case "turnAccel":
                this.tank.turnAccel = value;
                break;
            case "stabilityTorque":
                this.tank.stabilityTorque = value;
                break;
            case "yawDamping":
                this.tank.yawDamping = value;
                break;
            case "sideFriction":
                this.tank.sideFriction = value;
                break;
            case "sideDrag":
                this.tank.sideDrag = value;
                break;
            case "fwdDrag":
                this.tank.fwdDrag = value;
                break;
            case "angularDrag":
                this.tank.angularDrag = value;
                break;
            case "baseTurretSpeed":
                this.tank.baseTurretSpeed = value;
                break;
            case "turretLerpSpeed":
                this.tank.turretLerpSpeed = value;
                break;
            case "recoilForce":
                this.tank.recoilForce = value;
                break;
            case "recoilTorque":
                this.tank.recoilTorque = value;
                break;
            case "barrelRecoilSpeed":
                this.tank.barrelRecoilSpeed = value;
                break;
            case "barrelRecoilAmount":
                this.tank.barrelRecoilAmount = value;
                break;
        }
    }

    private formatValue(value: number, key: string): string {
        if (key === "cooldown") {
            return `${Math.round(value)}мс`;
        }
        if (key.includes("Damping") || key === "mouseSensitivity" || key === "turretSpeed" ||
            key === "baseTurretSpeed" || key === "turretLerpSpeed" || key === "barrelRecoilSpeed" ||
            key === "barrelRecoilAmount") {
            return value.toFixed(3);
        }
        if (key === "hoverHeight" || key === "projectileSize") {
            return value.toFixed(2);
        }
        if (value >= 1000) {
            return value.toFixed(0);
        }
        return value.toFixed(1);
    }

    private resetToDefaults(): void {
        if (!this.tank) return;
        this.updateFromTank();

        // Show feedback
        const resetBtn = document.getElementById("physics-reset");
        if (resetBtn) {
            const originalText = resetBtn.textContent;
            resetBtn.textContent = "✓ Сброс";
            setTimeout(() => {
                if (resetBtn) resetBtn.textContent = originalText;
            }, 1000);
        }
    }

    private showSavePresetDialog(): void {
        if (this.presets.length >= this.maxPresets) {
            inGameAlert(`Максимум ${this.maxPresets} пресетов!`, "Физика").catch(() => {});
            return;
        }

        inGamePrompt("Имя пресета:", `Пресет ${this.presets.length + 1}`, "Пресет").then((name) => {
            if (!name || name.trim() === "") return;
            this.savePreset(name.trim());
        }).catch(() => {});
    }

    private savePreset(name: string): void {
        if (!this.tank) return;

        const config: { [key: string]: number } = {};
        this.inputs.forEach((input, key) => {
            config[key] = parseFloat(input.value);
        });

        // Remove existing preset with same name
        this.presets = this.presets.filter(p => p.name !== name);

        // Add new preset
        this.presets.push({ name, config });

        // Keep only max presets
        if (this.presets.length > this.maxPresets) {
            this.presets.shift();
        }

        this.savePresets();
        this.updatePresetsList();

        // Show feedback
        const saveBtn = document.getElementById("physics-save-preset");
        if (saveBtn) {
            const originalText = saveBtn.textContent;
            saveBtn.textContent = "✓ Сохранено";
            setTimeout(() => {
                if (saveBtn) saveBtn.textContent = originalText;
            }, 1500);
        }
    }

    private loadPreset(name: string): void {
        if (!this.tank) return;

        const preset = this.presets.find(p => p.name === name);
        if (!preset) return;

        Object.entries(preset.config).forEach(([key, value]) => {
            const input = this.inputs.get(key);
            if (input && typeof value === "number") {
                input.value = value.toString();
                this.onParameterChange(key, value);
            }
        });

        // Preset loaded
    }

    private deletePreset(name: string): void {
        this.presets = this.presets.filter(p => p.name !== name);
        this.savePresets();
        this.updatePresetsList();
    }

    private updatePresetsList(): void {
        const list = document.getElementById("physics-presets-list");
        if (!list) return;

        if (this.presets.length === 0) {
            list.innerHTML = `<div style="color: #666; font-size: 9px; padding: 4px;">Нет пресетов</div>`;
            return;
        }

        let html = "";
        this.presets.forEach(preset => {
            html += `
                <div class="physics-preset-item">
                    <span class="physics-preset-name" data-preset="${preset.name}">${preset.name}</span>
                    <button class="physics-preset-btn" data-delete="${preset.name}">×</button>
                </div>
            `;
        });

        list.innerHTML = html;

        // Setup click handlers
        list.querySelectorAll(".physics-preset-name").forEach(el => {
            el.addEventListener("click", () => {
                const name = el.getAttribute("data-preset");
                if (name) this.loadPreset(name);
            });
        });

        list.querySelectorAll(".physics-preset-btn").forEach(el => {
            el.addEventListener("click", () => {
                const name = el.getAttribute("data-delete");
                if (name) {
                    inGameConfirm(`Удалить пресет "${name}"?`, "Подтверждение").then((ok) => {
                        if (ok) this.deletePreset(name);
                    }).catch(() => {});
                }
            });
        });
    }

    private loadPresets(): void {
        const saved = localStorage.getItem("tankPhysicsPresets");
        if (saved) {
            try {
                this.presets = JSON.parse(saved);
            } catch (e) {
                // Failed to load presets - используем пустой массив
                this.presets = [];
            }
        }
    }

    private savePresets(): void {
        localStorage.setItem("tankPhysicsPresets", JSON.stringify(this.presets));
    }

    /**
     * Экспорт пресетов в JSON файл
     */
    exportPresets(): void {
        const json = JSON.stringify(this.presets, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `physics_presets_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * Импорт пресетов из JSON файла
     */
    importPresets(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target?.result as string) as Preset[];
                    if (!Array.isArray(imported)) {
                        inGameAlert('Неверный формат файла', 'Импорт').catch(() => {});
                        return;
                    }

                    // Объединяем с существующими пресетами
                    imported.forEach(preset => {
                        const existing = this.presets.findIndex(p => p.name === preset.name);
                        if (existing >= 0) {
                            this.presets[existing] = preset;
                        } else {
                            if (this.presets.length < this.maxPresets) {
                                this.presets.push(preset);
                            }
                        }
                    });

                    // Ограничиваем количество
                    if (this.presets.length > this.maxPresets) {
                        this.presets = this.presets.slice(0, this.maxPresets);
                    }

                    this.savePresets();
                    this.updatePresetsList();
                    inGameAlert(`Импортировано ${imported.length} пресетов`, 'Импорт').catch(() => {});
                } catch (error) {
                    inGameAlert('Ошибка при импорте: ' + error, 'Ошибка').catch(() => {});
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    private setupCloseButton(): void {
        const closeBtn = document.getElementById("physics-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => {
                this.hide();
            });
        }

        // Закрытие по клику на фон
        this.container.addEventListener("click", (e) => {
            if (e.target === this.container) {
                this.hide();
            }
        });
    }

    isVisible(): boolean {
        return this.visible;
    }

    dispose(): void {
        this.container.remove();
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
            <div class="physics-embedded-content">
                <h3 style="color: #0ff; margin: 0 0 16px 0; font-size: 16px; text-shadow: 0 0 8px rgba(0, 255, 255, 0.5);">
                    ⚙️ Параметры физики
                </h3>
                
                <!-- Информация о танке -->
                <div style="
                    background: rgba(0, 20, 0, 0.6);
                    border: 1px solid rgba(0, 255, 4, 0.3);
                    border-radius: 4px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <div style="color: #ff0; font-size: 12px; margin-bottom: 8px; font-weight: bold;">ТЕКУЩИЕ ПАРАМЕТРЫ</div>
                    <div class="phys-params-emb" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 10px;">
                        <div><span style="color: #7f7;">Скорость:</span> <span class="phys-speed-emb" style="color: #0ff;">--</span></div>
                        <div><span style="color: #7f7;">Ускорение:</span> <span class="phys-accel-emb" style="color: #0ff;">--</span></div>
                        <div><span style="color: #7f7;">Масса:</span> <span class="phys-mass-emb" style="color: #0ff;">--</span></div>
                        <div><span style="color: #7f7;">Трение:</span> <span class="phys-friction-emb" style="color: #0ff;">--</span></div>
                    </div>
                </div>
                
                <!-- Быстрые настройки -->
                <div style="margin-bottom: 16px;">
                    <div style="color: #ff0; font-size: 13px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 255, 4, 0.3); padding-bottom: 5px;">
                        БЫСТРЫЕ НАСТРОЙКИ
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                            Скорость движения: <span class="phys-movespeed-val" style="color: #0f0;">1.0x</span>
                        </label>
                        <input type="range" class="phys-movespeed-emb" min="0.1" max="3" step="0.1" value="1" style="width: 100%;">
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                            Скорость поворота: <span class="phys-turnspeed-val" style="color: #0f0;">1.0x</span>
                        </label>
                        <input type="range" class="phys-turnspeed-emb" min="0.1" max="3" step="0.1" value="1" style="width: 100%;">
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label style="color: #aaa; font-size: 11px; display: block; margin-bottom: 4px;">
                            Гравитация: <span class="phys-gravity-val" style="color: #0f0;">1.0x</span>
                        </label>
                        <input type="range" class="phys-gravity-emb" min="0" max="3" step="0.1" value="1" style="width: 100%;">
                    </div>
                </div>
                
                <!-- Кнопки -->
                <div style="display: flex; gap: 10px;">
                    <button class="panel-btn phys-apply-btn" style="flex: 1; padding: 8px;">✓ Применить</button>
                    <button class="panel-btn phys-reset-btn" style="flex: 1; padding: 8px;">↻ Сбросить</button>
                </div>
                
                <div style="margin-top: 12px; padding: 10px; background: rgba(255, 255, 0, 0.1); border: 1px solid rgba(255, 255, 0, 0.3); border-radius: 4px;">
                    <div style="color: #ff0; font-size: 11px;">💡 Для расширенного редактирования используйте "Редактор физики" в меню.</div>
                </div>
            </div>
        `;
    }

    /**
     * Привязывает обработчики событий для embedded режима
     */
    private setupEmbeddedEventListeners(container: HTMLElement): void {
        const moveSpeedSlider = container.querySelector(".phys-movespeed-emb") as HTMLInputElement;
        const moveSpeedVal = container.querySelector(".phys-movespeed-val");
        const turnSpeedSlider = container.querySelector(".phys-turnspeed-emb") as HTMLInputElement;
        const turnSpeedVal = container.querySelector(".phys-turnspeed-val");
        const gravitySlider = container.querySelector(".phys-gravity-emb") as HTMLInputElement;
        const gravityVal = container.querySelector(".phys-gravity-val");
        const applyBtn = container.querySelector(".phys-apply-btn");
        const resetBtn = container.querySelector(".phys-reset-btn");

        // Обновление значений
        const updateSliderVal = (slider: HTMLInputElement, valEl: Element | null) => {
            if (valEl) valEl.textContent = `${slider.value}x`;
        };

        moveSpeedSlider?.addEventListener("input", () => updateSliderVal(moveSpeedSlider, moveSpeedVal));
        turnSpeedSlider?.addEventListener("input", () => updateSliderVal(turnSpeedSlider, turnSpeedVal));
        gravitySlider?.addEventListener("input", () => updateSliderVal(gravitySlider, gravityVal));

        applyBtn?.addEventListener("click", () => {
            if (this.tank) {
                const speedMult = parseFloat(moveSpeedSlider?.value || "1");
                const turnMult = parseFloat(turnSpeedSlider?.value || "1");

                // Применяем модификаторы
                if ((this.tank as any).baseMoveSpeed === undefined) {
                    (this.tank as any).baseMoveSpeed = this.tank.moveSpeed;
                }
                if ((this.tank as any).baseTurnSpeed === undefined) {
                    (this.tank as any).baseTurnSpeed = this.tank.turnSpeed;
                }

                this.tank.moveSpeed = (this.tank as any).baseMoveSpeed * speedMult;
                this.tank.turnSpeed = (this.tank as any).baseTurnSpeed * turnMult;

                if (this.game?.hud) {
                    this.game.hud.showMessage("Параметры физики применены!", "#0f0", 2000);
                }
            }

            // Гравитация
            if (this.game?.scene) {
                const gravMult = parseFloat(gravitySlider?.value || "1");
                const baseGravity = -9.81;
                (this.game.scene as any).gravity = { x: 0, y: baseGravity * gravMult, z: 0 };
            }
        });

        resetBtn?.addEventListener("click", () => {
            if (moveSpeedSlider) { moveSpeedSlider.value = "1"; updateSliderVal(moveSpeedSlider, moveSpeedVal); }
            if (turnSpeedSlider) { turnSpeedSlider.value = "1"; updateSliderVal(turnSpeedSlider, turnSpeedVal); }
            if (gravitySlider) { gravitySlider.value = "1"; updateSliderVal(gravitySlider, gravityVal); }

            // Восстанавливаем базовые значения
            if (this.tank) {
                if ((this.tank as any).baseMoveSpeed) {
                    this.tank.moveSpeed = (this.tank as any).baseMoveSpeed;
                }
                if ((this.tank as any).baseTurnSpeed) {
                    this.tank.turnSpeed = (this.tank as any).baseTurnSpeed;
                }
            }

            if (this.game?.hud) {
                this.game.hud.showMessage("Параметры сброшены!", "#ff0", 2000);
            }
        });

        // Обновление текущих параметров
        this.updateEmbeddedParams(container);
    }

    /**
     * Обновляет отображение текущих параметров
     */
    private updateEmbeddedParams(container: HTMLElement): void {
        const speedEl = container.querySelector(".phys-speed-emb");
        const accelEl = container.querySelector(".phys-accel-emb");
        const massEl = container.querySelector(".phys-mass-emb");
        const frictionEl = container.querySelector(".phys-friction-emb");

        if (this.tank) {
            if (speedEl) speedEl.textContent = `${this.tank.moveSpeed?.toFixed(1) || "--"}`;
            if (accelEl) accelEl.textContent = `${(this.tank as any).acceleration?.toFixed(1) || "--"}`;
            if (massEl) massEl.textContent = `${(this.tank as any).mass?.toFixed(0) || "--"} кг`;
            if (frictionEl) frictionEl.textContent = `${(this.tank as any).friction?.toFixed(2) || "--"}`;
        }
    }
}
