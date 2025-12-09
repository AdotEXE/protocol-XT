// ═══════════════════════════════════════════════════════════════════════════
// MAIN MENU - Улучшенное главное меню с статистикой и анимациями
// ═══════════════════════════════════════════════════════════════════════════

// Version tracking
const VERSION_MAJOR = 0;
const VERSION_MINOR = 3;
let buildNumber = parseInt(localStorage.getItem("ptx_build") || "0") + 1;
localStorage.setItem("ptx_build", buildNumber.toString());
const VERSION = `v${VERSION_MAJOR}.${VERSION_MINOR}.${buildNumber}`;

export interface GameSettings {
    renderDistance: number;
    soundVolume: number;
    musicVolume: number;
    mouseSensitivity: number;
    showFPS: boolean;
    showMinimap: boolean;
    cameraDistance: number;
    cameraHeight: number;
    aimFOV: number;
    graphicsQuality: number;
    vsync: boolean;
    fullscreen: boolean;
    aimAssist: boolean;
    showDamageNumbers: boolean;
    screenShake: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
    renderDistance: 3,
    soundVolume: 70,
    musicVolume: 50,
    mouseSensitivity: 5,
    showFPS: true,
    showMinimap: true,
    cameraDistance: 12,
    cameraHeight: 5,
    aimFOV: 0.4,
    graphicsQuality: 2,
    vsync: false,
    fullscreen: false,
    aimAssist: true,
    showDamageNumbers: true,
    screenShake: true
};

export interface TankConfig {
    color: string;
    turretColor: string;
    speed: number;
    armor: number;
    firepower: number;
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
    private statsPanel: HTMLDivElement;
    private skillsPanel: HTMLDivElement;
    private onStartGame: () => void = () => {};
    private onOpenGarage: () => void = () => {};
    private settings: GameSettings;
    private tankConfig: TankConfig;
    private playerProgression: any = null;
    
    constructor() {
        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.createMenuUI();
        this.createSettingsUI();
        this.createGarageUI();
        this.createStatsPanel();
        this.createSkillsPanel();
        this.startAnimations();
    }
    
    setPlayerProgression(progression: any): void {
        this.playerProgression = progression;
        this.updatePlayerInfo();
    }
    
    private createMenuUI(): void {
        this.container = document.createElement("div");
        this.container.id = "main-menu";
        this.container.innerHTML = `
            <div class="menu-bg">
                <div class="scanlines"></div>
                <div class="grid-bg"></div>
            </div>
            <div class="menu-content">
                <div class="menu-header">
                    <div class="logo-container">
                        <div class="logo-glow"></div>
                        <div class="menu-title">PROTOCOL</div>
                        <div class="menu-title-accent">TX</div>
                    </div>
                    <div class="menu-subtitle">TANK WARFARE SIMULATOR</div>
                </div>
                
                <div class="player-info" id="player-info">
                    <div class="player-level">
                        <span class="level-badge" id="level-badge">1</span>
                        <div class="xp-bar-container">
                            <div class="xp-bar" id="xp-bar"></div>
                            <span class="xp-text" id="xp-text">0 / 500 XP</span>
                        </div>
                    </div>
                    <div class="player-stats-mini">
                        <span id="credits-display">💰 500</span>
                        <span id="kills-display">💀 0</span>
                        <span id="playtime-display">⏱️ 0ч</span>
                    </div>
                </div>
                
                <div class="menu-buttons">
                    <button class="menu-btn primary" id="btn-play">
                        <span class="btn-icon">▶</span>
                        <span class="btn-text">ИГРАТЬ</span>
                        <span class="btn-hint">Начать битву</span>
                    </button>
                    <button class="menu-btn" id="btn-garage">
                        <span class="btn-icon">🔧</span>
                        <span class="btn-text">ГАРАЖ</span>
                        <span class="btn-hint">Выбор танка</span>
                    </button>
                    <button class="menu-btn" id="btn-skills">
                        <span class="btn-icon">⚡</span>
                        <span class="btn-text">НАВЫКИ</span>
                        <span class="btn-hint" id="skill-points-hint">0 очков</span>
                    </button>
                    <button class="menu-btn" id="btn-stats">
                        <span class="btn-icon">📊</span>
                        <span class="btn-text">СТАТИСТИКА</span>
                        <span class="btn-hint">Ваш прогресс</span>
                    </button>
                    <button class="menu-btn" id="btn-settings">
                        <span class="btn-icon">⚙</span>
                        <span class="btn-text">НАСТРОЙКИ</span>
                        <span class="btn-hint">Параметры</span>
                    </button>
                    <button class="menu-btn small" id="btn-controls">
                        <span class="btn-icon">🎮</span>
                        <span class="btn-text">УПРАВЛЕНИЕ</span>
                    </button>
                </div>
                
                <div class="daily-quests" id="daily-quests">
                    <div class="quests-title">📋 ЕЖЕДНЕВНЫЕ ЗАДАНИЯ</div>
                    <div class="quests-list" id="quests-list"></div>
                </div>
                
                <div class="menu-footer">
                    <div class="footer-line version">${VERSION}</div>
                    <div class="footer-line controls">
                        WASD - движение | SPACE - огонь | RMB/CTRL - прицел | Q/E - камера | G - гараж
                    </div>
                </div>
            </div>
        `;
        
        const style = document.createElement("style");
        style.textContent = `
            @keyframes scanline {
                0% { transform: translateY(-100%); }
                100% { transform: translateY(100vh); }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            @keyframes glow {
                0%, 100% { box-shadow: 0 0 20px #0f0, 0 0 40px #0f04; }
                50% { box-shadow: 0 0 30px #0f0, 0 0 60px #0f08; }
            }
            
            @keyframes float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-5px); }
            }
            
            #main-menu {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: #000;
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                font-family: 'Courier New', monospace;
                overflow: hidden;
            }
            
            #main-menu.hidden { display: none; }
            
            .menu-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: radial-gradient(ellipse at center, #001100 0%, #000 70%);
            }
            
            .scanlines {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 200%;
                background: repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0, 255, 0, 0.03) 2px,
                    rgba(0, 255, 0, 0.03) 4px
                );
                animation: scanline 8s linear infinite;
                pointer-events: none;
            }
            
            .grid-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: 
                    linear-gradient(rgba(0, 255, 0, 0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0, 255, 0, 0.05) 1px, transparent 1px);
                background-size: 50px 50px;
                pointer-events: none;
            }
            
            .menu-content {
                position: relative;
                text-align: center;
                color: #0f0;
                z-index: 1;
                max-height: 95vh;
                overflow-y: auto;
                padding: 20px;
            }
            
            .menu-header {
                margin-bottom: 30px;
            }
            
            .logo-container {
                position: relative;
                display: inline-block;
            }
            
            .logo-glow {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 300px;
                height: 100px;
                background: radial-gradient(ellipse, rgba(0, 255, 0, 0.3) 0%, transparent 70%);
                filter: blur(20px);
                animation: pulse 3s ease-in-out infinite;
            }
            
            .menu-title {
                font-size: 72px;
                font-weight: bold;
                color: #0f0;
                letter-spacing: 12px;
                text-shadow: 0 0 20px #0f0, 0 0 40px #0f0;
                position: relative;
                display: inline;
            }
            
            .menu-title-accent {
                font-size: 72px;
                font-weight: bold;
                color: #0ff;
                letter-spacing: 12px;
                text-shadow: 0 0 20px #0ff, 0 0 40px #0ff;
                display: inline;
                margin-left: 15px;
            }
            
            .menu-subtitle {
                font-size: 18px;
                color: #0a0;
                letter-spacing: 8px;
                margin-top: 10px;
                text-transform: uppercase;
            }
            
            .player-info {
                background: rgba(0, 20, 0, 0.8);
                border: 2px solid #0f0;
                padding: 15px 25px;
                margin-bottom: 25px;
                display: inline-block;
                min-width: 400px;
            }
            
            .player-level {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 10px;
            }
            
            .level-badge {
                width: 50px;
                height: 50px;
                background: linear-gradient(135deg, #0f0 0%, #080 100%);
                color: #000;
                font-size: 24px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 2px solid #0f0;
                box-shadow: 0 0 15px #0f0;
            }
            
            .xp-bar-container {
                flex: 1;
                height: 25px;
                background: #001100;
                border: 1px solid #0a0;
                position: relative;
            }
            
            .xp-bar {
                height: 100%;
                background: linear-gradient(90deg, #0a0 0%, #0f0 100%);
                width: 0%;
                transition: width 0.5s ease;
            }
            
            .xp-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 12px;
                color: #0f0;
                text-shadow: 0 0 5px #000;
            }
            
            .player-stats-mini {
                display: flex;
                justify-content: space-around;
                font-size: 14px;
                color: #0a0;
            }
            
            .menu-buttons {
                display: flex;
                flex-direction: column;
                gap: 12px;
                align-items: center;
                margin-bottom: 25px;
            }
            
            .menu-btn {
                width: 320px;
                padding: 12px 25px;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                background: rgba(0, 20, 0, 0.9);
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 15px;
                position: relative;
                overflow: hidden;
            }
            
            .menu-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(0, 255, 0, 0.2), transparent);
                transition: left 0.4s ease;
            }
            
            .menu-btn:hover::before {
                left: 100%;
            }
            
            .menu-btn:hover {
                background: #0f0;
                color: #000;
                box-shadow: 0 0 20px #0f0;
                transform: translateX(5px);
            }
            
            .menu-btn.primary {
                border-color: #0ff;
                animation: glow 2s ease-in-out infinite;
            }
            
            .menu-btn.primary:hover {
                background: #0ff;
                box-shadow: 0 0 30px #0ff;
            }
            
            .menu-btn.small {
                width: 240px;
                padding: 8px 20px;
                font-size: 12px;
            }
            
            .btn-icon {
                font-size: 24px;
                width: 30px;
            }
            
            .btn-text {
                flex: 1;
                text-align: left;
                font-size: 18px;
                letter-spacing: 2px;
            }
            
            .btn-hint {
                font-size: 10px;
                color: #080;
                opacity: 0.8;
            }
            
            .menu-btn:hover .btn-hint {
                color: #000;
            }
            
            .daily-quests {
                background: rgba(0, 20, 0, 0.8);
                border: 1px solid #0a0;
                padding: 15px;
                margin-bottom: 20px;
                max-width: 400px;
                margin-left: auto;
                margin-right: auto;
            }
            
            .quests-title {
                font-size: 14px;
                color: #0f0;
                margin-bottom: 10px;
                border-bottom: 1px solid #0a03;
                padding-bottom: 5px;
            }
            
            .quests-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .quest-item {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 11px;
                color: #0a0;
            }
            
            .quest-item.completed {
                color: #0f0;
                text-decoration: line-through;
            }
            
            .quest-progress {
                width: 60px;
                height: 6px;
                background: #001100;
                border: 1px solid #0a0;
            }
            
            .quest-progress-fill {
                height: 100%;
                background: #0f0;
            }
            
            .menu-footer {
                color: #050;
                font-size: 11px;
            }
            
            .footer-line {
                margin: 5px 0;
            }
            
            .footer-line.version {
                color: #0a0;
                font-size: 13px;
            }
            
            /* Panels */
            .panel-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 10001;
            }
            
            .panel-overlay.visible {
                display: flex;
            }
            
            .panel-content {
                background: #000;
                border: 2px solid #0f0;
                padding: 30px;
                max-width: 600px;
                max-height: 85vh;
                overflow-y: auto;
                width: 90%;
            }
            
            .panel-title {
                font-size: 28px;
                color: #0f0;
                text-align: center;
                margin-bottom: 25px;
                border-bottom: 1px solid #0f03;
                padding-bottom: 15px;
            }
            
            .panel-close {
                position: absolute;
                top: 15px;
                right: 15px;
                width: 40px;
                height: 40px;
                background: #000;
                border: 2px solid #f00;
                color: #f00;
                font-size: 24px;
                cursor: pointer;
            }
            
            .panel-close:hover {
                background: #f00;
                color: #000;
            }
            
            /* Settings specific */
            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding: 8px 0;
                border-bottom: 1px solid #0f01;
            }
            
            .setting-label {
                color: #0f0;
                font-size: 14px;
            }
            
            .setting-value {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .setting-range {
                width: 120px;
                -webkit-appearance: none;
                background: #001100;
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
                accent-color: #0f0;
            }
            
            .panel-buttons {
                display: flex;
                gap: 15px;
                margin-top: 25px;
            }
            
            .panel-btn {
                flex: 1;
                padding: 12px;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .panel-btn:hover {
                background: #0f0;
                color: #000;
            }
            
            .panel-btn.danger {
                border-color: #f00;
                color: #f00;
            }
            
            .panel-btn.danger:hover {
                background: #f00;
                color: #000;
            }
            
            /* Stats Panel */
            .stats-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            
            .stat-card {
                background: #001100;
                border: 1px solid #0a0;
                padding: 15px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 28px;
                color: #0f0;
                font-weight: bold;
            }
            
            .stat-label {
                font-size: 11px;
                color: #0a0;
                margin-top: 5px;
            }
            
            /* Skills Panel */
            .skill-row {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px;
                margin-bottom: 10px;
                background: #001100;
                border: 1px solid #0a0;
            }
            
            .skill-icon {
                font-size: 32px;
                width: 50px;
            }
            
            .skill-info {
                flex: 1;
            }
            
            .skill-name {
                font-size: 16px;
                color: #0f0;
                margin-bottom: 5px;
            }
            
            .skill-desc {
                font-size: 11px;
                color: #0a0;
            }
            
            .skill-level {
                display: flex;
                gap: 3px;
            }
            
            .skill-pip {
                width: 12px;
                height: 12px;
                background: #001100;
                border: 1px solid #0a0;
            }
            
            .skill-pip.filled {
                background: #0f0;
            }
            
            .skill-upgrade-btn {
                padding: 8px 15px;
                background: #000;
                border: 1px solid #0f0;
                color: #0f0;
                cursor: pointer;
            }
            
            .skill-upgrade-btn:hover:not(:disabled) {
                background: #0f0;
                color: #000;
            }
            
            .skill-upgrade-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
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
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .controls-popup.visible { display: block; }
            
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
                padding: 3px 10px;
                font-weight: bold;
                margin: 0 2px;
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
        
        document.getElementById("btn-skills")?.addEventListener("click", () => {
            this.showSkills();
        });
        
        document.getElementById("btn-stats")?.addEventListener("click", () => {
            this.showStats();
        });
        
        document.getElementById("btn-settings")?.addEventListener("click", () => {
            this.showSettings();
        });
        
        document.getElementById("btn-controls")?.addEventListener("click", () => {
            this.showControls();
        });
    }
    
    private updatePlayerInfo(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        
        // Update level badge
        const levelBadge = document.getElementById("level-badge");
        if (levelBadge) levelBadge.textContent = stats.level.toString();
        
        // Update XP bar
        const xpBar = document.getElementById("xp-bar") as HTMLElement;
        if (xpBar) xpBar.style.width = `${xpProgress.percent}%`;
        
        const xpText = document.getElementById("xp-text");
        if (xpText) xpText.textContent = `${xpProgress.current} / ${xpProgress.required} XP`;
        
        // Update mini stats
        const creditsDisplay = document.getElementById("credits-display");
        if (creditsDisplay) creditsDisplay.textContent = `💰 ${stats.credits}`;
        
        const killsDisplay = document.getElementById("kills-display");
        if (killsDisplay) killsDisplay.textContent = `💀 ${stats.totalKills}`;
        
        const playtimeDisplay = document.getElementById("playtime-display");
        if (playtimeDisplay) playtimeDisplay.textContent = `⏱️ ${this.playerProgression.getPlayTimeFormatted()}`;
        
        // Update skill points hint
        const skillPointsHint = document.getElementById("skill-points-hint");
        if (skillPointsHint) {
            skillPointsHint.textContent = `${stats.skillPoints} очков`;
            if (stats.skillPoints > 0) {
                skillPointsHint.style.color = "#ff0";
            }
        }
        
        // Update daily quests
        this.updateDailyQuests();
    }
    
    private updateDailyQuests(): void {
        if (!this.playerProgression) return;
        
        const quests = this.playerProgression.getDailyQuests();
        const questsList = document.getElementById("quests-list");
        if (!questsList) return;
        
        questsList.innerHTML = quests.map((q: any) => `
            <div class="quest-item ${q.completed ? 'completed' : ''}">
                <span>${q.completed ? '✅' : '⬜'}</span>
                <span style="flex:1">${q.name}</span>
                <div class="quest-progress">
                    <div class="quest-progress-fill" style="width:${Math.min(100, (q.progress / q.target) * 100)}%"></div>
                </div>
                <span>${q.progress}/${q.target}</span>
            </div>
        `).join('');
    }
    
    private startAnimations(): void {
        // Periodic update of player info
        setInterval(() => {
            if (this.container && !this.container.classList.contains('hidden')) {
                this.updatePlayerInfo();
            }
        }, 1000);
    }
    
    private createSettingsUI(): void {
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "panel-overlay";
        this.settingsPanel.id = "settings-panel";
        this.settingsPanel.innerHTML = `
            <div class="panel-content" style="position:relative">
                <button class="panel-close" id="settings-close">✕</button>
                <div class="panel-title">⚙ НАСТРОЙКИ</div>
                
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
                    <span class="setting-label">Расстояние камеры</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-camera-dist" min="5" max="25" value="${this.settings.cameraDistance}">
                        <span id="set-camera-dist-val">${this.settings.cameraDistance}</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">FOV прицеливания</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-aim-fov" min="0.2" max="0.6" step="0.05" value="${this.settings.aimFOV}">
                        <span id="set-aim-fov-val">${this.settings.aimFOV.toFixed(2)}</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Качество графики</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="set-graphics" min="1" max="3" value="${this.settings.graphicsQuality}">
                        <span id="set-graphics-val">${['Низкое', 'Среднее', 'Высокое'][this.settings.graphicsQuality - 1]}</span>
                    </div>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Показывать FPS</span>
                    <input type="checkbox" class="setting-checkbox" id="set-fps" ${this.settings.showFPS ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Показывать миникарту</span>
                        <input type="checkbox" class="setting-checkbox" id="set-minimap" ${this.settings.showMinimap ? 'checked' : ''}>
                    </div>
                
                <div class="setting-row">
                    <span class="setting-label">Помощь в прицеливании</span>
                    <input type="checkbox" class="setting-checkbox" id="set-aim-assist" ${this.settings.aimAssist ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Числа урона</span>
                    <input type="checkbox" class="setting-checkbox" id="set-damage-numbers" ${this.settings.showDamageNumbers ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Тряска экрана</span>
                    <input type="checkbox" class="setting-checkbox" id="set-screen-shake" ${this.settings.screenShake ? 'checked' : ''}>
                </div>
                
                <div class="panel-buttons">
                    <button class="panel-btn" id="settings-save">СОХРАНИТЬ</button>
                    <button class="panel-btn danger" id="settings-reset">СБРОС</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.settingsPanel);
        
        // Setup sliders
        const setupSlider = (id: string, valId: string, suffix: string = "", transform?: (v: string) => string) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const val = document.getElementById(valId);
            slider?.addEventListener("input", () => {
                if (val) val.textContent = (transform ? transform(slider.value) : slider.value) + suffix;
            });
        };
        
        setupSlider("set-render", "set-render-val");
        setupSlider("set-sound", "set-sound-val", "%");
        setupSlider("set-music", "set-music-val", "%");
        setupSlider("set-mouse", "set-mouse-val");
        setupSlider("set-camera-dist", "set-camera-dist-val");
        setupSlider("set-aim-fov", "set-aim-fov-val", "", (v) => parseFloat(v).toFixed(2));
        setupSlider("set-graphics", "set-graphics-val", "", (v) => ['Низкое', 'Среднее', 'Высокое'][parseInt(v) - 1]);
        
        document.getElementById("settings-save")?.addEventListener("click", () => {
            this.saveSettingsFromUI();
            this.hideSettings();
        });
        
        document.getElementById("settings-reset")?.addEventListener("click", () => {
            this.settings = { ...DEFAULT_SETTINGS };
            this.saveSettingsFromUI();
            location.reload();
        });
        
        document.getElementById("settings-close")?.addEventListener("click", () => {
            this.hideSettings();
        });
    }
    
    private createStatsPanel(): void {
        this.statsPanel = document.createElement("div");
        this.statsPanel.className = "panel-overlay";
        this.statsPanel.id = "stats-panel";
        this.statsPanel.innerHTML = `
            <div class="panel-content" style="position:relative">
                <button class="panel-close" id="stats-close">✕</button>
                <div class="panel-title">📊 СТАТИСТИКА</div>
                <div class="stats-grid" id="stats-grid"></div>
                <div class="panel-buttons">
                    <button class="panel-btn" id="stats-back">ЗАКРЫТЬ</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.statsPanel);
        
        document.getElementById("stats-close")?.addEventListener("click", () => this.hideStats());
        document.getElementById("stats-back")?.addEventListener("click", () => this.hideStats());
    }
    
    private createSkillsPanel(): void {
        this.skillsPanel = document.createElement("div");
        this.skillsPanel.className = "panel-overlay";
        this.skillsPanel.id = "skills-panel";
        this.skillsPanel.innerHTML = `
            <div class="panel-content" style="position:relative">
                <button class="panel-close" id="skills-close">✕</button>
                <div class="panel-title">⚡ НАВЫКИ</div>
                <div id="skill-points-display" style="text-align:center;margin-bottom:20px;color:#ff0">Очков: 0</div>
                <div id="skills-list"></div>
                <div class="panel-buttons">
                    <button class="panel-btn" id="skills-back">ЗАКРЫТЬ</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.skillsPanel);
        
        document.getElementById("skills-close")?.addEventListener("click", () => this.hideSkills());
        document.getElementById("skills-back")?.addEventListener("click", () => this.hideSkills());
    }
    
    private showStats(): void {
        this.statsPanel.classList.add("visible");
        this.updateStatsPanel();
    }
    
    private hideStats(): void {
        this.statsPanel.classList.remove("visible");
    }
    
    private updateStatsPanel(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const grid = document.getElementById("stats-grid");
        if (!grid) return;
        
        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.level}</div>
                <div class="stat-label">УРОВЕНЬ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.prestigeLevel}</div>
                <div class="stat-label">ПРЕСТИЖ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalKills}</div>
                <div class="stat-label">УБИЙСТВ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalDeaths}</div>
                <div class="stat-label">СМЕРТЕЙ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getKDRatio()}</div>
                <div class="stat-label">K/D RATIO</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getAccuracy()}</div>
                <div class="stat-label">ТОЧНОСТЬ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.round(stats.totalDamageDealt)}</div>
                <div class="stat-label">УРОН НАНЕСЁН</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.round(stats.totalDamageTaken)}</div>
                <div class="stat-label">УРОН ПОЛУЧЕН</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.bestKillStreak}</div>
                <div class="stat-label">ЛУЧШАЯ СЕРИЯ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getPlayTimeFormatted()}</div>
                <div class="stat-label">ВРЕМЯ В ИГРЕ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.sessionsPlayed}</div>
                <div class="stat-label">СЕССИЙ</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.achievements.length}</div>
                <div class="stat-label">ДОСТИЖЕНИЙ</div>
            </div>
        `;
    }
    
    private showSkills(): void {
        this.skillsPanel.classList.add("visible");
        this.updateSkillsPanel();
    }
    
    private hideSkills(): void {
        this.skillsPanel.classList.remove("visible");
    }
    
    private updateSkillsPanel(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const skillsList = document.getElementById("skills-list");
        const skillPointsDisplay = document.getElementById("skill-points-display");
        
        if (skillPointsDisplay) {
            skillPointsDisplay.textContent = `Очков навыков: ${stats.skillPoints}`;
        }
        
        if (!skillsList) return;
        
        const skillsInfo = [
            { id: "tankMastery", name: "Мастерство танка", icon: "🛡️", desc: "+0.3 скорость за уровень" },
            { id: "combatExpert", name: "Боевой эксперт", icon: "⚔️", desc: "+3 урон за уровень" },
            { id: "survivalInstinct", name: "Инстинкт выживания", icon: "❤️", desc: "+10 HP за уровень" },
            { id: "resourcefulness", name: "Находчивость", icon: "💰", desc: "+5% опыта и кредитов за уровень" },
            { id: "tacticalGenius", name: "Тактический гений", icon: "🎯", desc: "-50мс перезарядка за уровень" }
        ];
        
        skillsList.innerHTML = skillsInfo.map(skill => {
            const level = stats.skills[skill.id as keyof typeof stats.skills];
            const maxLevel = 10;
            const pips = Array(maxLevel).fill(0).map((_, i) => 
                `<div class="skill-pip ${i < level ? 'filled' : ''}"></div>`
            ).join('');
            
            return `
                <div class="skill-row">
                    <div class="skill-icon">${skill.icon}</div>
                    <div class="skill-info">
                        <div class="skill-name">${skill.name}</div>
                        <div class="skill-desc">${skill.desc}</div>
                        <div class="skill-level">${pips}</div>
                    </div>
                    <button class="skill-upgrade-btn" data-skill="${skill.id}" ${stats.skillPoints <= 0 || level >= maxLevel ? 'disabled' : ''}>
                        ${level >= maxLevel ? 'МАКС' : '+'}
                    </button>
                </div>
            `;
        }).join('');
        
        // Add upgrade handlers
        skillsList.querySelectorAll('.skill-upgrade-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const skillId = (btn as HTMLElement).dataset.skill;
                if (skillId && this.playerProgression) {
                    this.playerProgression.upgradeSkill(skillId);
                    this.updateSkillsPanel();
                    this.updatePlayerInfo();
                }
            });
        });
    }
    
    private showControls(): void {
        const popup = document.createElement("div");
        popup.className = "controls-popup visible";
        popup.innerHTML = `
            <div class="controls-title">🎮 УПРАВЛЕНИЕ</div>
            <div class="controls-row"><span>Движение</span><span><span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span></span></div>
            <div class="controls-row"><span>Выстрел</span><span><span class="key">SPACE</span> / <span class="key">ЛКМ</span></span></div>
            <div class="controls-row"><span>Прицеливание</span><span><span class="key">ПКМ</span> / <span class="key">CTRL</span></span></div>
            <div class="controls-row"><span>Башня влево/вправо</span><span><span class="key">Z</span> / <span class="key">X</span></span></div>
            <div class="controls-row"><span>Башня в центр</span><span><span class="key">C</span></span></div>
            <div class="controls-row"><span>Камера</span><span><span class="key">Q</span> / <span class="key">E</span></span></div>
            <div class="controls-row"><span>Зум</span><span><span class="key">КОЛЁСИКО</span></span></div>
            <div class="controls-row"><span>Гараж</span><span><span class="key">G</span></span></div>
            <div class="controls-row"><span>Припасы</span><span><span class="key">1-5</span></span></div>
            <div class="controls-row"><span>Debug</span><span><span class="key">F3</span></span></div>
            <div class="controls-row"><span>Меню</span><span><span class="key">ESC</span></span></div>
            <br>
            <button class="panel-btn" id="close-controls" style="width:100%">ЗАКРЫТЬ</button>
        `;
        document.body.appendChild(popup);
        
        document.getElementById("close-controls")?.addEventListener("click", () => popup.remove());
    }
    
    private createGarageUI(): void {
        this.garagePanel = document.createElement("div");
        this.garagePanel.className = "panel-overlay";
        this.garagePanel.id = "garage-panel";
        this.garagePanel.innerHTML = `
            <div class="panel-content" style="position:relative">
                <button class="panel-close" id="garage-close">✕</button>
                <div class="panel-title">🔧 ГАРАЖ (БЫСТРЫЙ)</div>
                <p style="color:#0a0;text-align:center;margin-bottom:20px">Для полного гаража нажмите G в игре</p>
                
                <div style="display:flex;flex-direction:column;gap:15px">
                    <div class="setting-row">
                        <span class="setting-label">Скорость</span>
                        <input type="range" id="tank-speed" min="1" max="3" value="${this.tankConfig.speed}">
                        <span id="speed-val">${this.tankConfig.speed}</span>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">Броня</span>
                        <input type="range" id="tank-armor" min="1" max="3" value="${this.tankConfig.armor}">
                        <span id="armor-val">${this.tankConfig.armor}</span>
                    </div>
                    <div class="setting-row">
                        <span class="setting-label">Огневая мощь</span>
                        <input type="range" id="tank-firepower" min="1" max="3" value="${this.tankConfig.firepower}">
                        <span id="firepower-val">${this.tankConfig.firepower}</span>
                    </div>
                </div>
                
                <div class="panel-buttons">
                    <button class="panel-btn" id="btn-garage-save">СОХРАНИТЬ</button>
                    <button class="panel-btn" id="btn-garage-back">НАЗАД</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.garagePanel);
        
        // Event listeners
        const setupGarageSlider = (id: string, valId: string, configKey: keyof TankConfig) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            slider?.addEventListener("input", () => {
                (this.tankConfig as any)[configKey] = parseInt(slider.value);
                const val = document.getElementById(valId);
                if (val) val.textContent = slider.value;
            });
        };
        
        setupGarageSlider("tank-speed", "speed-val", "speed");
        setupGarageSlider("tank-armor", "armor-val", "armor");
        setupGarageSlider("tank-firepower", "firepower-val", "firepower");
        
        document.getElementById("btn-garage-save")?.addEventListener("click", () => {
            this.saveTankConfig();
            this.hideGarage();
        });
        
        document.getElementById("btn-garage-back")?.addEventListener("click", () => this.hideGarage());
        document.getElementById("garage-close")?.addEventListener("click", () => this.hideGarage());
    }
    
    private showGarage(): void {
        this.garagePanel.classList.add("visible");
    }
    
    private hideGarage(): void {
        this.garagePanel.classList.remove("visible");
    }
    
    private saveTankConfig(): void {
        localStorage.setItem("tankConfig", JSON.stringify(this.tankConfig));
        window.dispatchEvent(new CustomEvent("tankConfigChanged", { detail: this.tankConfig }));
    }
    
    private loadTankConfig(): TankConfig {
        const saved = localStorage.getItem("tankConfig");
        if (saved) {
            try {
                return { ...DEFAULT_TANK, ...JSON.parse(saved) };
            } catch (e) {}
        }
        return { ...DEFAULT_TANK };
    }
    
    private showSettings(): void {
        this.settingsPanel.classList.add("visible");
    }
    
    private hideSettings(): void {
        this.settingsPanel.classList.remove("visible");
    }
    
    private saveSettingsFromUI(): void {
        this.settings = {
            renderDistance: parseInt((document.getElementById("set-render") as HTMLInputElement)?.value || "3"),
            soundVolume: parseInt((document.getElementById("set-sound") as HTMLInputElement)?.value || "70"),
            musicVolume: parseInt((document.getElementById("set-music") as HTMLInputElement)?.value || "50"),
            mouseSensitivity: parseInt((document.getElementById("set-mouse") as HTMLInputElement)?.value || "5"),
            showFPS: (document.getElementById("set-fps") as HTMLInputElement)?.checked ?? true,
            showMinimap: (document.getElementById("set-minimap") as HTMLInputElement)?.checked ?? true,
            cameraDistance: parseInt((document.getElementById("set-camera-dist") as HTMLInputElement)?.value || "12"),
            cameraHeight: parseInt((document.getElementById("set-camera-height") as HTMLInputElement)?.value || "5"),
            aimFOV: parseFloat((document.getElementById("set-aim-fov") as HTMLInputElement)?.value || "0.4"),
            graphicsQuality: parseInt((document.getElementById("set-graphics") as HTMLInputElement)?.value || "2"),
            vsync: (document.getElementById("set-vsync") as HTMLInputElement)?.checked ?? false,
            fullscreen: (document.getElementById("set-fullscreen") as HTMLInputElement)?.checked ?? false,
            aimAssist: (document.getElementById("set-aim-assist") as HTMLInputElement)?.checked ?? true,
            showDamageNumbers: (document.getElementById("set-damage-numbers") as HTMLInputElement)?.checked ?? true,
            screenShake: (document.getElementById("set-screen-shake") as HTMLInputElement)?.checked ?? true
        };
        
        localStorage.setItem("gameSettings", JSON.stringify(this.settings));
        window.dispatchEvent(new CustomEvent("settingsChanged", { detail: this.settings }));
    }
    
    private loadSettings(): GameSettings {
        const saved = localStorage.getItem("gameSettings");
        if (saved) {
            try {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
            } catch (e) {}
        }
        return { ...DEFAULT_SETTINGS };
    }
    
    setOnStartGame(callback: () => void): void {
        this.onStartGame = callback;
    }
    
    getSettings(): GameSettings {
        return this.settings;
    }
    
    getTankConfig(): TankConfig {
        return this.tankConfig;
    }
    
    show(): void {
        this.container.classList.remove("hidden");
        this.updatePlayerInfo();
    }
    
    hide(): void {
        this.container.classList.add("hidden");
    }
    
    isVisible(): boolean {
        return !this.container.classList.contains("hidden");
    }
}
