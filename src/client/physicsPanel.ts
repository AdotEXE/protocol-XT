import { TankController } from "./tankController";
import { Vector3 } from "@babylonjs/core";

interface Preset {
    name: string;
    config: { [key: string]: number };
}

export class PhysicsPanel {
    private container: HTMLDivElement;
    private tank: TankController | null = null;
    private visible = false;
    
    // Input elements
    private inputs: Map<string, HTMLInputElement> = new Map();
    private valueDisplays: Map<string, HTMLSpanElement> = new Map();
    
    // Presets
    private presets: Preset[] = [];
    private maxPresets = 5;
    
    constructor() {
        this.loadPresets();
        this.createUI();
        this.setupToggle();
        this.visible = false;
        this.container.classList.add("hidden");
        this.container.style.display = "none";
    }
    
    setTank(tank: TankController): void {
        this.tank = tank;
        this.updateFromTank();
    }
    
    private createUI(): void {
        this.container = document.createElement("div");
        this.container.id = "physics-panel";
        
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
            <div class="physics-title">ФИЗИКА ТАНКА [F4]</div>
            <div class="physics-controls">
                <button id="physics-reset" class="physics-btn">Сброс</button>
                <button id="physics-save-preset" class="physics-btn">Сохранить</button>
            </div>
            <div class="physics-presets" id="physics-presets-list"></div>
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
        
        this.container.innerHTML = html;
        
        const style = document.createElement("style");
        style.textContent = `
            #physics-panel {
                position: fixed;
                top: clamp(5px, 1vh, 10px);
                left: clamp(5px, 1vw, 10px);
                background: rgba(0, 0, 0, 0.85);
                color: #0f0;
                font-family: Consolas, Monaco, monospace;
                font-size: clamp(9px, 1.1vw, 11px);
                padding: clamp(6px, 0.8vh, 8px) clamp(8px, 1.2vw, 12px);
                border-radius: clamp(3px, 0.4vw, 4px);
                border: clamp(1px, 0.1vw, 1px) solid #0f0;
                z-index: 10001;
                min-width: clamp(180px, 22vw, 220px);
                max-width: min(280px, 30vw);
                max-height: 90vh;
                overflow-y: auto;
                user-select: none;
            }
            #physics-panel.hidden { display: none; }
            .physics-title {
                font-size: clamp(10px, 1.2vw, 12px);
                font-weight: bold;
                color: #0ff;
                border-bottom: clamp(1px, 0.1vw, 1px) solid #0f04;
                padding-bottom: clamp(3px, 0.4vh, 4px);
                margin-bottom: clamp(4px, 0.6vh, 6px);
            }
            .physics-controls {
                display: flex;
                gap: 4px;
                margin-bottom: 8px;
                flex-wrap: wrap;
            }
            .physics-btn {
                background: rgba(0, 255, 0, 0.15);
                border: clamp(1px, 0.1vw, 1px) solid #0f0;
                color: #0f0;
                padding: clamp(3px, 0.4vh, 4px) clamp(6px, 0.8vw, 8px);
                cursor: pointer;
                font-family: Consolas, Monaco, monospace;
                font-size: clamp(8px, 1vw, 10px);
                border-radius: clamp(2px, 0.2vw, 2px);
                transition: all 0.2s;
                flex: 1;
                min-width: clamp(60px, 7vw, 70px);
            }
            .physics-btn:hover {
                background: rgba(0, 255, 0, 0.3);
            }
            .physics-btn:active {
                background: rgba(0, 255, 0, 0.5);
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
                color: #aaa;
                font-size: 10px;
                padding: 2px 4px;
                background: rgba(0, 255, 0, 0.05);
                border: 1px solid rgba(0, 255, 0, 0.2);
                border-radius: 2px;
                cursor: pointer;
            }
            .physics-preset-name:hover {
                background: rgba(0, 255, 0, 0.15);
                color: #0f0;
            }
            .physics-preset-btn {
                background: rgba(255, 0, 0, 0.15);
                border: 1px solid #f00;
                color: #f00;
                padding: 2px 6px;
                cursor: pointer;
                font-size: 9px;
                border-radius: 2px;
            }
            .physics-preset-btn:hover {
                background: rgba(255, 0, 0, 0.3);
            }
            .physics-section {
                margin-bottom: 8px;
            }
            .physics-label {
                color: #ff0;
                font-weight: bold;
                font-size: clamp(8px, 1vw, 10px);
                margin-bottom: clamp(1px, 0.2vh, 2px);
            }
            .physics-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: clamp(1px, 0.2vh, 2px) 0;
                gap: clamp(6px, 0.8vw, 8px);
            }
            .physics-row span:first-child {
                color: #aaa;
                font-size: clamp(8px, 1vw, 10px);
                min-width: clamp(80px, 10vw, 100px);
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
                font-size: clamp(8px, 1vw, 10px);
                min-width: clamp(40px, 5vw, 50px);
                text-align: right;
            }
            .physics-preset-input {
                background: rgba(0, 255, 0, 0.1);
                border: 1px solid #0f0;
                color: #0f0;
                padding: 2px 4px;
                font-family: Consolas, Monaco, monospace;
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
        this.updatePresetsList();
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
        
        if (resetBtn) {
            resetBtn.addEventListener("click", () => this.resetToDefaults());
        }
        if (savePresetBtn) {
            savePresetBtn.addEventListener("click", () => this.showSavePresetDialog());
        }
    }
    
    private setupToggle(): void {
        window.addEventListener("keydown", (e) => {
            if (e.code === "F4") {
                e.preventDefault();
                this.toggle();
            }
        });
    }
    
    toggle(): void {
        this.visible = !this.visible;
        if (this.visible) {
            this.container.classList.remove("hidden");
            this.container.style.display = "";
            if (this.tank) {
                this.updateFromTank();
            }
        } else {
            this.container.classList.add("hidden");
            this.container.style.display = "none";
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
                    this.tank.physicsBody.setMassProperties({ mass: value, centerOfMass: new Vector3(0, -0.4, 0) });
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
            alert(`Максимум ${this.maxPresets} пресетов!`);
            return;
        }
        
        const name = prompt("Имя пресета:", `Пресет ${this.presets.length + 1}`);
        if (!name || name.trim() === "") return;
        
        this.savePreset(name.trim());
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
        
        console.log(`[PhysicsPanel] Preset "${name}" loaded`);
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
                    if (confirm(`Удалить пресет "${name}"?`)) {
                        this.deletePreset(name);
                    }
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
                console.error("[PhysicsPanel] Failed to load presets:", e);
                this.presets = [];
            }
        }
    }
    
    private savePresets(): void {
        localStorage.setItem("tankPhysicsPresets", JSON.stringify(this.presets));
    }
    
    dispose(): void {
        this.container.remove();
    }
}
