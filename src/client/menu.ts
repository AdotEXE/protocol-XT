// Main Menu and Settings - Simple HTML/CSS, NO shaders, NO gradients

// Version tracking - increments on each page load
const VERSION_MAJOR = 0;
const VERSION_MINOR = 2;
let buildNumber = parseInt(localStorage.getItem("ptx_build") || "0") + 1;
localStorage.setItem("ptx_build", buildNumber.toString());
const VERSION = `v${VERSION_MAJOR}.${VERSION_MINOR}.${buildNumber}`;

export interface GameSettings {
    renderDistance: number;     // 1-5 chunks
    soundVolume: number;        // 0-100
    musicVolume: number;        // 0-100
    mouseSensitivity: number;   // 1-10
    showFPS: boolean;
    showMinimap: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
    renderDistance: 3,
    soundVolume: 70,
    musicVolume: 50,
    mouseSensitivity: 5,
    showFPS: true,
    showMinimap: true
};

// Tank configuration stored in localStorage
export interface TankConfig {
    color: string;        // hull color
    turretColor: string;  // turret color
    speed: number;        // 1-3
    armor: number;        // 1-3
    firepower: number;    // 1-3
}

const DEFAULT_TANK: TankConfig = {
    color: "#0f0",
    turretColor: "#888",
    speed: 2,
    armor: 2,
    firepower: 2
};

export class MainMenu {
    private container: HTMLDivElement;
    private settingsPanel: HTMLDivElement;
    private garagePanel: HTMLDivElement;
    private onStartGame: () => void = () => {};
    private onOpenGarage: () => void = () => {};
    private settings: GameSettings;
    private tankConfig: TankConfig;
    
    constructor() {
        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.createMenuUI();
        this.createSettingsUI();
        this.createGarageUI();
    }
    
    private createMenuUI(): void {
        // Main menu container
        this.container = document.createElement("div");
        this.container.id = "main-menu";
        this.container.innerHTML = `
            <div class="menu-content">
                <div class="menu-title">PROTOCOL TX</div>
                <div class="menu-subtitle">TANK WARFARE</div>
                
                <div class="menu-buttons">
                    <button class="menu-btn" id="btn-play">▶ ИГРАТЬ</button>
                    <button class="menu-btn" id="btn-garage">🔧 ГАРАЖ</button>
                    <button class="menu-btn" id="btn-settings">⚙ НАСТРОЙКИ</button>
                    <button class="menu-btn" id="btn-controls">🎮 УПРАВЛЕНИЕ</button>
                </div>
                
                <div class="menu-footer">
                    <div class="footer-line">
                        <span id="version-display">${VERSION}</span>
                    </div>
                    <div class="footer-line">
                        <span>WASD - движение | SPACE - огонь | CTRL - прицел | Q/E - камера | Z/X/C - башня | F3 - debug</span>
                    </div>
                </div>
            </div>
        `;
        
        const style = document.createElement("style");
        style.textContent = `
            #main-menu {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #111;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                font-family: 'Courier New', monospace;
            }
            
            #main-menu.hidden {
                display: none;
            }
            
            .menu-content {
                text-align: center;
                color: #0f0;
                padding-bottom: 100px;
                position: relative;
            }
            
            .menu-title {
                font-size: 64px;
                font-weight: bold;
                color: #0f0;
                margin-bottom: 10px;
                letter-spacing: 8px;
            }
            
            .menu-subtitle {
                font-size: 24px;
                color: #0a0;
                margin-bottom: 60px;
                letter-spacing: 4px;
            }
            
            .menu-buttons {
                display: flex;
                flex-direction: column;
                gap: 15px;
                align-items: center;
            }
            
            .menu-btn {
                width: 280px;
                padding: 15px 30px;
                font-size: 20px;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.1s;
                text-transform: uppercase;
                letter-spacing: 2px;
            }
            
            .menu-btn:hover {
                background: #0f0;
                color: #000;
            }
            
            .menu-btn:active {
                transform: scale(0.98);
            }
            
            .menu-footer {
                position: absolute;
                bottom: 15px;
                left: 0;
                right: 0;
                color: #050;
                font-size: 11px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                padding: 0 20px;
            }
            .footer-line {
                text-align: center;
                line-height: 1.4;
            }
            
            /* Settings Panel */
            #settings-panel {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #111;
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 10001;
                font-family: 'Courier New', monospace;
            }
            
            #settings-panel.visible {
                display: flex;
            }
            
            .settings-content {
                background: #000;
                border: 2px solid #0f0;
                padding: 30px;
                width: 450px;
                max-height: 90vh;
                overflow-y: auto;
            }
            
            .settings-title {
                font-size: 28px;
                color: #0f0;
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 1px solid #0f03;
                padding-bottom: 15px;
            }
            
            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 18px;
                padding: 5px 0;
                min-height: 30px;
                color: #0f0;
            }
            
            .setting-label {
                font-size: 14px;
            }
            
            .setting-value {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .setting-input {
                width: 60px;
                padding: 5px;
                font-family: 'Courier New', monospace;
                background: #000;
                color: #0f0;
                border: 1px solid #0f0;
                text-align: center;
            }
            
            .setting-range {
                width: 120px;
                -webkit-appearance: none;
                background: #000;
                border: 1px solid #0f0;
                height: 8px;
            }
            
            .setting-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                background: #0f0;
                cursor: pointer;
            }
            
            .setting-checkbox {
                width: 20px;
                height: 20px;
                cursor: pointer;
            }
            
            .settings-buttons {
                display: flex;
                gap: 15px;
                margin-top: 30px;
            }
            
            .settings-buttons button {
                flex: 1;
                padding: 10px;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                background: #000;
                color: #0f0;
                border: 1px solid #0f0;
                cursor: pointer;
            }
            
            .settings-buttons button:hover {
                background: #0f0;
                color: #000;
            }
            
            /* Controls popup */
            .controls-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #000;
                border: 2px solid #0f0;
                padding: 30px;
                z-index: 10002;
                color: #0f0;
                font-family: 'Courier New', monospace;
                display: none;
            }
            
            .controls-popup.visible {
                display: block;
            }
            
            .controls-title {
                font-size: 24px;
                text-align: center;
                margin-bottom: 20px;
                border-bottom: 1px solid #0f03;
                padding-bottom: 10px;
            }
            
            .controls-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #0f02;
            }
            
            .key {
                background: #0f0;
                color: #000;
                padding: 2px 8px;
                font-weight: bold;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        // Event listeners
        document.getElementById("btn-play")?.addEventListener("click", () => {
            this.hide();
            this.onStartGame();
        });
        
        document.getElementById("btn-garage")?.addEventListener("click", () => {
            this.showGarage();
        });
        
        document.getElementById("btn-settings")?.addEventListener("click", () => {
            this.showSettings();
        });
        
        document.getElementById("btn-controls")?.addEventListener("click", () => {
            this.showControls();
        });
    }
    
    private createSettingsUI(): void {
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.id = "settings-panel";
        this.settingsPanel.innerHTML = `
            <div class="settings-content">
                <div class="settings-title">⚙ НАСТРОЙКИ</div>
                
                <div class="setting-row">
                    <span class="setting-label">Дальность прорисовки</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-render" min="1" max="5" value="${this.settings.renderDistance}">
                        <span id="set-render-val">${this.settings.renderDistance}</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Громкость звуков</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-sound" min="0" max="100" value="${this.settings.soundVolume}">
                        <span id="set-sound-val">${this.settings.soundVolume}%</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Громкость музыки</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-music" min="0" max="100" value="${this.settings.musicVolume}">
                        <span id="set-music-val">${this.settings.musicVolume}%</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Чувствительность мыши</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-mouse" min="1" max="10" value="${this.settings.mouseSensitivity}">
                        <span id="set-mouse-val">${this.settings.mouseSensitivity}</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Показывать FPS</span>
                    <div class="setting-value">
                        <input type="checkbox" class="setting-checkbox" id="set-fps" ${this.settings.showFPS ? 'checked' : ''}>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Показывать миникарту</span>
                    <div class="setting-value">
                        <input type="checkbox" class="setting-checkbox" id="set-minimap" ${this.settings.showMinimap ? 'checked' : ''}>
                    </div>
                </div>
                
                <div class="settings-buttons">
                    <button id="settings-save">СОХРАНИТЬ</button>
                    <button id="settings-cancel">ОТМЕНА</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.settingsPanel);
        
        // Slider value updates
        const setupSlider = (id: string, valId: string, suffix: string = "") => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const val = document.getElementById(valId);
            slider?.addEventListener("input", () => {
                if (val) val.textContent = slider.value + suffix;
            });
        };
        
        setupSlider("set-render", "set-render-val");
        setupSlider("set-sound", "set-sound-val", "%");
        setupSlider("set-music", "set-music-val", "%");
        setupSlider("set-mouse", "set-mouse-val");
        
        // Save button
        document.getElementById("settings-save")?.addEventListener("click", () => {
            this.saveSettingsFromUI();
            this.hideSettings();
        });
        
        // Cancel button
        document.getElementById("settings-cancel")?.addEventListener("click", () => {
            this.hideSettings();
        });
    }
    
    private showControls(): void {
        const popup = document.createElement("div");
        popup.className = "controls-popup visible";
        popup.innerHTML = `
            <div class="controls-title">🎮 УПРАВЛЕНИЕ</div>
            <div class="controls-row"><span>Движение</span><span><span class="key">W</span> <span class="key">A</span> <span class="key">S</span> <span class="key">D</span></span></div>
            <div class="controls-row"><span>Или</span><span><span class="key">↑</span> <span class="key">←</span> <span class="key">↓</span> <span class="key">→</span></span></div>
            <div class="controls-row"><span>Башня влево</span><span><span class="key">Z</span></span></div>
            <div class="controls-row"><span>Башня вправо</span><span><span class="key">X</span></span></div>
            <div class="controls-row"><span>Башня в центр</span><span><span class="key">C</span></span></div>
            <div class="controls-row"><span>Выстрел</span><span><span class="key">SPACE</span></span></div>
            <div class="controls-row"><span>Камера наклон</span><span><span class="key">Q</span> <span class="key">E</span></span></div>
            <div class="controls-row"><span>Зум камеры</span><span><span class="key">КОЛЁСИКО</span></span></div>
            <div class="controls-row"><span>Debug панель</span><span><span class="key">F3</span></span></div>
            <div class="controls-row"><span>Пауза</span><span><span class="key">ESC</span></span></div>
            <br>
            <button id="close-controls" style="width:100%; padding:10px; cursor:pointer; background:#000; color:#0f0; border:1px solid #0f0;">ЗАКРЫТЬ</button>
        `;
        document.body.appendChild(popup);
        
        document.getElementById("close-controls")?.addEventListener("click", () => {
            popup.remove();
        });
    }
    
    private createGarageUI(): void {
        this.garagePanel = document.createElement("div");
        this.garagePanel.id = "garage-panel";
        this.garagePanel.innerHTML = `
            <div class="garage-content">
                <div class="garage-title">🔧 ГАРАЖ</div>
                
                <div class="garage-preview">
                    <div class="tank-preview" id="tank-preview">
                        <div class="preview-hull" id="preview-hull"></div>
                        <div class="preview-turret" id="preview-turret"></div>
                    </div>
                </div>
                
                <div class="garage-options">
                    <div class="garage-row">
                        <span>ЦВЕТ КОРПУСА</span>
                        <div class="color-options" id="hull-colors">
                            <button class="color-btn" data-color="#0f0">🟢</button>
                            <button class="color-btn" data-color="#00f">🔵</button>
                            <button class="color-btn" data-color="#f00">🔴</button>
                            <button class="color-btn" data-color="#ff0">🟡</button>
                            <button class="color-btn" data-color="#0ff">🩵</button>
                        </div>
                    </div>
                    
                    <div class="garage-row">
                        <span>ЦВЕТ БАШНИ</span>
                        <div class="color-options" id="turret-colors">
                            <button class="color-btn" data-color="#888">⬜</button>
                            <button class="color-btn" data-color="#333">⬛</button>
                            <button class="color-btn" data-color="#a52">🟤</button>
                            <button class="color-btn" data-color="#0f0">🟢</button>
                        </div>
                    </div>
                    
                    <div class="garage-row">
                        <span>СКОРОСТЬ</span>
                        <input type="range" id="tank-speed" min="1" max="3" value="${this.tankConfig.speed}">
                        <span id="speed-val">${this.tankConfig.speed}</span>
                    </div>
                    
                    <div class="garage-row">
                        <span>БРОНЯ</span>
                        <input type="range" id="tank-armor" min="1" max="3" value="${this.tankConfig.armor}">
                        <span id="armor-val">${this.tankConfig.armor}</span>
                    </div>
                    
                    <div class="garage-row">
                        <span>ОГНЕВАЯ МОЩЬ</span>
                        <input type="range" id="tank-firepower" min="1" max="3" value="${this.tankConfig.firepower}">
                        <span id="firepower-val">${this.tankConfig.firepower}</span>
                    </div>
                </div>
                
                <div class="garage-buttons">
                    <button class="menu-btn" id="btn-garage-save">СОХРАНИТЬ</button>
                    <button class="menu-btn" id="btn-garage-back">НАЗАД</button>
                </div>
            </div>
        `;
        
        const style = document.createElement("style");
        style.textContent = `
            #garage-panel {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #111;
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 10001;
                font-family: 'Courier New', monospace;
            }
            #garage-panel.visible { display: flex; }
            .garage-content { 
                text-align: center; 
                color: #0f0; 
                width: 450px; 
                max-height: 90vh;
                overflow-y: auto;
                padding: 20px;
            }
            .garage-title { font-size: 28px; margin-bottom: 20px; }
            .garage-preview {
                width: 200px;
                height: 120px;
                margin: 0 auto 20px;
                border: 2px solid #0f0;
                background: #222;
                position: relative;
            }
            .tank-preview { position: relative; width: 100%; height: 100%; }
            .preview-hull {
                position: absolute;
                width: 80px;
                height: 40px;
                background: ${this.tankConfig.color};
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
            }
            .preview-turret {
                position: absolute;
                width: 30px;
                height: 50px;
                background: ${this.tankConfig.turretColor};
                left: 50%;
                top: 30%;
                transform: translate(-50%, -50%);
            }
            .garage-options { 
                margin: 20px 0; 
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .garage-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 0;
                padding: 8px 5px;
                min-height: 35px;
            }
            .color-options { display: flex; gap: 5px; flex-wrap: wrap; }
            .color-btn {
                width: 30px;
                height: 30px;
                border: 2px solid #0f0;
                background: #000;
                cursor: pointer;
                font-size: 16px;
            }
            .color-btn:hover { border-color: #ff0; }
            .garage-buttons { 
                margin-top: 25px; 
                display: flex; 
                gap: 10px; 
                justify-content: center; 
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.garagePanel);
        
        // Event listeners for garage
        document.querySelectorAll("#hull-colors .color-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.tankConfig.color = (btn as HTMLElement).dataset.color || "#0f0";
                this.updateTankPreview();
            });
        });
        
        document.querySelectorAll("#turret-colors .color-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.tankConfig.turretColor = (btn as HTMLElement).dataset.color || "#888";
                this.updateTankPreview();
            });
        });
        
        document.getElementById("tank-speed")?.addEventListener("input", (e) => {
            this.tankConfig.speed = parseInt((e.target as HTMLInputElement).value);
            document.getElementById("speed-val")!.textContent = this.tankConfig.speed.toString();
        });
        
        document.getElementById("tank-armor")?.addEventListener("input", (e) => {
            this.tankConfig.armor = parseInt((e.target as HTMLInputElement).value);
            document.getElementById("armor-val")!.textContent = this.tankConfig.armor.toString();
        });
        
        document.getElementById("tank-firepower")?.addEventListener("input", (e) => {
            this.tankConfig.firepower = parseInt((e.target as HTMLInputElement).value);
            document.getElementById("firepower-val")!.textContent = this.tankConfig.firepower.toString();
        });
        
        document.getElementById("btn-garage-save")?.addEventListener("click", () => {
            this.saveTankConfig();
            this.hideGarage();
        });
        
        document.getElementById("btn-garage-back")?.addEventListener("click", () => {
            this.hideGarage();
        });
    }
    
    private updateTankPreview(): void {
        const hull = document.getElementById("preview-hull");
        const turret = document.getElementById("preview-turret");
        if (hull) hull.style.background = this.tankConfig.color;
        if (turret) turret.style.background = this.tankConfig.turretColor;
    }
    
    private showGarage(): void {
        this.garagePanel.classList.add("visible");
        this.updateTankPreview();
    }
    
    private hideGarage(): void {
        this.garagePanel.classList.remove("visible");
    }
    
    private saveTankConfig(): void {
        localStorage.setItem("tankConfig", JSON.stringify(this.tankConfig));
        console.log("[Garage] Tank config saved:", this.tankConfig);
        // Notify game about config change
        window.dispatchEvent(new CustomEvent("tankConfigChanged", { detail: this.tankConfig }));
    }
    
    private loadTankConfig(): TankConfig {
        const saved = localStorage.getItem("tankConfig");
        if (saved) {
            try {
                return { ...DEFAULT_TANK, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Failed to load tank config");
            }
        }
        return { ...DEFAULT_TANK };
    }
    
    getTankConfig(): TankConfig {
        return this.tankConfig;
    }
    
    private showSettings(): void {
        this.settingsPanel.classList.add("visible");
    }
    
    private hideSettings(): void {
        this.settingsPanel.classList.remove("visible");
    }
    
    private saveSettingsFromUI(): void {
        this.settings = {
            renderDistance: parseInt((document.getElementById("set-render") as HTMLInputElement).value),
            soundVolume: parseInt((document.getElementById("set-sound") as HTMLInputElement).value),
            musicVolume: parseInt((document.getElementById("set-music") as HTMLInputElement).value),
            mouseSensitivity: parseInt((document.getElementById("set-mouse") as HTMLInputElement).value),
            showFPS: (document.getElementById("set-fps") as HTMLInputElement).checked,
            showMinimap: (document.getElementById("set-minimap") as HTMLInputElement).checked
        };
        
        localStorage.setItem("gameSettings", JSON.stringify(this.settings));
        console.log("[Settings] Saved:", this.settings);
    }
    
    private loadSettings(): GameSettings {
        const saved = localStorage.getItem("gameSettings");
        if (saved) {
            try {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Failed to load settings");
            }
        }
        return { ...DEFAULT_SETTINGS };
    }
    
    setOnStartGame(callback: () => void): void {
        this.onStartGame = callback;
    }
    
    getSettings(): GameSettings {
        return this.settings;
    }
    
    show(): void {
        this.container.classList.remove("hidden");
    }
    
    hide(): void {
        this.container.classList.add("hidden");
    }
    
    isVisible(): boolean {
        return !this.container.classList.contains("hidden");
    }
}

