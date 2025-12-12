// ═══════════════════════════════════════════════════════════════════════════
// MAIN MENU - Минималистичное главное меню
// ═══════════════════════════════════════════════════════════════════════════

// Version tracking
const VERSION_MAJOR = 0;
const VERSION_MINOR = 3;
let buildNumber = parseInt(localStorage.getItem("ptx_build") || "0");
// Добавляем 1500 к текущему buildNumber (1059 -> 2559)
if (buildNumber < 2559) {
    buildNumber = 2559;
} else {
    buildNumber += 1;
}
localStorage.setItem("ptx_build", buildNumber.toString());
const VERSION = `v${VERSION_MAJOR}.${VERSION_MINOR}.${buildNumber}`;

// Debug flag - можно включить через localStorage.setItem("debug", "true")
const DEBUG = localStorage.getItem("debug") === "true" || false;

// Утилита для условного логирования
const debugLog = (...args: any[]) => {
    if (DEBUG) console.log(...args);
};
const debugWarn = (...args: any[]) => {
    if (DEBUG) console.warn(...args);
};
const debugError = (...args: any[]) => {
    // Ошибки всегда логируем
    console.error(...args);
};

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
    virtualTurretFixation: boolean; // Виртуальная фиксация башни
    language: string; // "ru" or "en"
    enemyDifficulty: "easy" | "medium" | "hard"; // Сложность противников
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
    screenShake: true,
    virtualTurretFixation: false, // Виртуальная фиксация отключена по умолчанию
    language: "ru", // Russian by default
    enemyDifficulty: "medium" // Средняя сложность по умолчанию
};

// === LANGUAGE STRINGS ===
const LANG = {
    ru: {
        play: "ИГРАТЬ",
        selectMap: "ВЫБОР КАРТЫ",
        garage: "ГАРАЖ",
        stats: "СТАТИСТИКА",
        skills: "НАВЫКИ",
        options: "НАСТРОЙКИ",
        controls: "УПРАВЛЕНИЕ",
        version: "Версия",
        tankCombat: "ТАНКОВЫЙ БОЙ",
        mapSelection: "ВЫБОР КАРТЫ",
        normalMap: "Эта самая карта",
        sandboxMap: "Песочница",
        // Controls
        movement: "Движение",
        combat: "Бой",
        interface: "Интерфейс",
        camera: "Камера",
        moveTank: "Движение",
        rotateTurret: "Башня",
        turretLR: "Башня Л/П",
        fire: "Огонь",
        aimMode: "Прицел",
        useConsumables: "Расходники",
        zoom: "Зум",
        garageKey: "Гараж",
        map: "Карта",
        statsKey: "Статистика",
        pauseMenu: "Пауза / Меню",
        freeLook: "Свободный обзор",
        center: "Центрировать",
        // Settings
        sound: "Звук",
        music: "Музыка",
        graphics: "Графика",
        language: "Язык",
        enemyDifficulty: "Сложность ботов",
        diffEasy: "ЛЕГКО",
        diffMedium: "СРЕДНЕ",
        diffHard: "СЛОЖНО",
        close: "ЗАКРЫТЬ",
        apply: "ПРИМЕНИТЬ",
        reset: "СБРОС",
        // Stats
        kills: "Убийств",
        deaths: "Смертей",
        playtime: "Время игры",
        credits: "Кредиты",
        // Garage
        chassis: "КОРПУСА",
        cannons: "ОРУДИЯ",
        upgrades: "УЛУЧШЕНИЯ",
        locked: "ЗАБЛОКИРОВАНО",
        owned: "КУПЛЕНО",
        buy: "КУПИТЬ",
        select: "ВЫБРАТЬ",
        maxLevel: "МАКС",
        upgrade: "УЛУЧШИТЬ",
        notEnoughCredits: "Недостаточно кредитов!"
    },
    en: {
        play: "PLAY",
        selectMap: "SELECT MAP",
        garage: "GARAGE",
        stats: "STATS",
        skills: "SKILLS",
        options: "OPTIONS",
        controls: "CONTROLS",
        version: "Version",
        tankCombat: "TANK COMBAT",
        mapSelection: "MAP SELECTION",
        normalMap: "Normal Map",
        sandboxMap: "Sandbox",
        // Controls
        movement: "Movement",
        combat: "Combat",
        interface: "Interface",
        camera: "Camera",
        moveTank: "Move tank",
        rotateTurret: "Rotate turret",
        turretLR: "Turret L/R",
        fire: "Fire",
        aimMode: "Aim mode",
        useConsumables: "Use consumables",
        zoom: "Zoom (aim)",
        garageKey: "Garage",
        map: "Map",
        statsKey: "Stats",
        pauseMenu: "Pause / Menu",
        freeLook: "Free look",
        center: "Center",
        // Settings
        sound: "Sound",
        music: "Music",
        graphics: "Graphics",
        language: "Language",
        enemyDifficulty: "Bot Difficulty",
        diffEasy: "EASY",
        diffMedium: "MEDIUM",
        diffHard: "HARD",
        close: "CLOSE",
        apply: "APPLY",
        reset: "RESET",
        // Stats
        kills: "Kills",
        deaths: "Deaths",
        playtime: "Playtime",
        credits: "Credits",
        // Garage
        chassis: "CHASSIS",
        cannons: "CANNONS",
        upgrades: "UPGRADES",
        locked: "LOCKED",
        owned: "OWNED",
        buy: "BUY",
        select: "SELECT",
        maxLevel: "MAX",
        upgrade: "UPGRADE",
        notEnoughCredits: "Not enough credits!"
    }
};

// Get current language strings
function getLang(settings: GameSettings): typeof LANG.ru {
    return LANG[settings.language as keyof typeof LANG] || LANG.ru;
}

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

export type MapType = "normal" | "sandbox";

export class MainMenu {
    private container!: HTMLDivElement;
    private settingsPanel!: HTMLDivElement;
    private garagePanel!: HTMLDivElement;
    private statsPanel!: HTMLDivElement;
    private skillsPanel!: HTMLDivElement;
    private mapSelectionPanel!: HTMLDivElement;
    private onStartGame: (mapType?: MapType) => void = () => {};
    private onPlayIntroSound: () => void = () => {};
    private settings!: GameSettings;
    private tankConfig!: TankConfig;
    private playerProgression: any = null;
    private experienceSubscription: any = null;
    private introSoundPlayed = false;
    
    private canvasObserver: MutationObserver | null = null;
    private canvasPointerEventsCheckInterval: number | null = null;
    private _lastPointerEventsState: string | null = null; // Кэш последнего состояния для предотвращения бесконечных циклов
    private _enforceInProgress = false; // Флаг для предотвращения рекурсивных вызовов
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию
    
    constructor() {
        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.createMenuUI();
        this.createSettingsUI();
        this.createGarageUI();
        this.createStatsPanel();
        this.createSkillsPanel();
        this.createMapSelectionPanel();
        this.startAnimations();
        this.setupCanvasPointerEventsProtection();
        this.setupGlobalEventBlocking();
    }
    
    private setupGlobalEventBlocking(): void {
        // ГЛОБАЛЬНАЯ БЛОКИРОВКА: Перехватываем все события мыши на уровне document
        // и блокируем их если они идут на canvas, а меню видимо
        const globalHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            
            // Если меню не видимо - пропускаем все события
            if (this.container.classList.contains("hidden")) {
                return;
            }
            
            // Если клик по canvas или его дочерним элементам - блокируем
            const canvas = document.getElementById("gameCanvas");
            if (canvas && (target === canvas || canvas.contains(target))) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                debugLog("[Menu] Blocked click on canvas");
                return false;
            }
            
            // Если клик по элементу меню - разрешаем
            if (this.container.contains(target)) {
                // Разрешаем событие
                return true;
            }
        };
        
        // Добавляем обработчики на все фазы событий
        document.addEventListener("mousedown", globalHandler, true);
        document.addEventListener("mouseup", globalHandler, true);
        document.addEventListener("click", globalHandler, true);
        
        debugLog("[Menu] Global event blocking setup complete");
    }
    
    private setupCanvasPointerEventsProtection(): void {
        // Находим canvas
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (!canvas) {
            // Если canvas еще не создан, ждем его появления
            const checkCanvas = setInterval(() => {
                const canvasEl = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (canvasEl) {
                    clearInterval(checkCanvas);
                    this.setupCanvasPointerEventsProtection();
                }
            }, 100);
            return;
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas сразу
        canvas.style.setProperty("pointer-events", "none", "important");
        canvas.style.setProperty("z-index", "0", "important");
        
        // Очищаем старый observer если он есть
        if (this.canvasObserver) {
            this.canvasObserver.disconnect();
        }
        
        // MutationObserver для отслеживания изменений стилей canvas
        // Используем debounce для предотвращения слишком частых вызовов
        let mutationTimeout: number | null = null;
        this.canvasObserver = new MutationObserver((_mutations) => {
            // Debounce: откладываем выполнение на 50мс для предотвращения таймаутов
            if (mutationTimeout !== null) {
                clearTimeout(mutationTimeout);
            }
            mutationTimeout = window.setTimeout(() => {
                // Принудительно блокируем canvas при любых изменениях стилей (с защитой от циклов)
                this.enforceCanvasPointerEvents();
                
                // Также проверяем, не был ли canvas пересоздан
                const currentCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (currentCanvas && currentCanvas !== canvas) {
                    // Canvas был пересоздан, переустанавливаем observer
                    this.setupCanvasPointerEventsProtection();
                }
                mutationTimeout = null;
            }, 50);
        });
        
        this.canvasObserver.observe(canvas, {
            attributes: true,
            attributeFilter: ['style', 'class'],
            attributeOldValue: false,
            childList: false,
            subtree: false
        });
        
        // Очищаем старый интервал если он есть
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
        }
        
        // Периодическая проверка каждые 100мс для оптимизации (увеличено с 25мс для предотвращения таймаутов)
        this.canvasPointerEventsCheckInterval = window.setInterval(() => {
            // Проверяем, что canvas все еще существует
            const currentCanvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (!currentCanvas) {
                // Canvas был удален, переустанавливаем защиту
                this.setupCanvasPointerEventsProtection();
                return;
            }
            
            // Принудительно блокируем canvas (с защитой от циклов внутри метода)
            this.enforceCanvasPointerEvents();
        }, 100);
        
        // Начальная установка
        this.enforceCanvasPointerEvents();
        
        // Также устанавливаем через requestAnimationFrame для максимальной надежности (только когда меню видимо)
        let animationFrameId: number | null = null;
        const enforceLoop = () => {
            const isMenuOrPanelVisible = !this.container.classList.contains("hidden") ||
                this.mapSelectionPanel?.classList.contains("visible") ||
                this.garagePanel?.classList.contains("visible") ||
                this.statsPanel?.classList.contains("visible") ||
                this.skillsPanel?.classList.contains("visible") ||
                this.settingsPanel?.classList.contains("visible");
            
            if (isMenuOrPanelVisible) {
                this.enforceCanvasPointerEvents();
                animationFrameId = requestAnimationFrame(enforceLoop);
            } else {
                animationFrameId = null;
            }
        };
        
        // Запускаем loop только когда меню видимо
        const startLoop = () => {
            if (animationFrameId === null) {
                animationFrameId = requestAnimationFrame(enforceLoop);
            }
        };
        
        // Запускаем при показе меню
        this.container.addEventListener("mouseenter", startLoop);
        // Также запускаем при показе любой панели
        const panels = [this.mapSelectionPanel, this.garagePanel, this.statsPanel, this.skillsPanel, this.settingsPanel];
        panels.forEach(panel => {
            if (panel) {
                const observer = new MutationObserver(() => {
                    if (panel.classList.contains("visible")) {
                        startLoop();
                    }
                });
                observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
            }
        });
        
        // Начальный запуск если меню уже видимо
        if (!this.container.classList.contains("hidden")) {
            startLoop();
        }
    }
    
    private enforceCanvasPointerEvents(): void {
        // Защита от рекурсивных вызовов и бесконечных циклов
        if (this._enforceInProgress) {
            return;
        }
        
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (!canvas) {
            debugLog("[Menu] enforceCanvasPointerEvents: canvas not found");
            return;
        }
        
        this._enforceInProgress = true;
        
        try {
            const isMenuVisible = !this.container.classList.contains("hidden");
            const isAnyPanelVisible = 
                this.mapSelectionPanel?.classList.contains("visible") ||
                this.garagePanel?.classList.contains("visible") ||
                this.statsPanel?.classList.contains("visible") ||
                this.skillsPanel?.classList.contains("visible") ||
                this.settingsPanel?.classList.contains("visible");
            
            // Определяем желаемое состояние
            const desiredState = (isMenuVisible || isAnyPanelVisible) ? "none" : "auto";
            
            // Проверяем, изменилось ли состояние - если нет, не делаем ничего (предотвращает бесконечный цикл)
            if (this._lastPointerEventsState === desiredState) {
                this._enforceInProgress = false;
                return;
            }
            
            // Блокируем canvas если меню видимо ИЛИ любая панель видима
            if (isMenuVisible || isAnyPanelVisible) {
                // Упрощенная блокировка - только один способ для предотвращения циклов
                canvas.style.setProperty("pointer-events", "none", "important");
                canvas.setAttribute("data-menu-blocked", "true");
                
                // Обновляем кэш только после успешного применения
                this._lastPointerEventsState = "none";
                
                if (this._enableDetailedLogging) {
                    debugLog("[Menu] Canvas blocked, menu visible:", isMenuVisible, "panel visible:", isAnyPanelVisible);
                }
            } else {
                // Если меню и все панели скрыты, разрешаем pointer-events
                canvas.style.setProperty("pointer-events", "auto", "important");
                canvas.removeAttribute("data-menu-blocked");
                
                // Обновляем кэш только после успешного применения
                this._lastPointerEventsState = "auto";
            }
        } finally {
            this._enforceInProgress = false;
        }
    }
    
    destroy(): void {
        // Очистка при уничтожении меню
        if (this.canvasObserver) {
            this.canvasObserver.disconnect();
            this.canvasObserver = null;
        }
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
            this.canvasPointerEventsCheckInterval = null;
        }
    }
    
    setPlayerProgression(progression: any): void {
        // Отписываемся от предыдущей подписки, если она была
        if (this.experienceSubscription) {
            this.experienceSubscription.remove();
            this.experienceSubscription = null;
        }
        
        this.playerProgression = progression;
        this.updatePlayerInfo();
        
        // Подписываемся на изменения опыта
        if (progression && progression.onExperienceChanged) {
            debugLog("[MainMenu] Subscribing to experience changes");
            this.experienceSubscription = progression.onExperienceChanged.add((data: {
                current: number;
                required: number;
                percent: number;
                level: number;
            }) => {
                debugLog("[MainMenu] Experience changed event received:", data);
                // Обновляем информацию игрока при изменении опыта
                this.updatePlayerInfo();
                // Также обновляем панель статистики, если она видима
                if (this.statsPanel && this.statsPanel.classList.contains("visible")) {
                    this.updateStatsPanel();
                }
            });
        } else {
            debugWarn("[MainMenu] Cannot subscribe to experience changes - progression or onExperienceChanged is null");
        }
    }
    
    private createMenuUI(): void {
        this.container = document.createElement("div");
        this.container.id = "main-menu";
        const L = getLang(this.settings);
        this.container.innerHTML = `
            <div class="menu-bg"></div>
            <div class="menu-content">
                <div class="menu-header">
                    <div class="logo-text">PROTOCOL <span class="accent">TX</span></div>
                    <div class="menu-subtitle">${L.tankCombat}</div>
                </div>
                
                <div class="player-card" id="player-info">
                    <div class="player-level-row">
                        <div class="level-badge" id="level-badge">1</div>
                        <div class="xp-section">
                            <div class="xp-bar-bg">
                                <div class="xp-bar-fill" id="xp-bar"></div>
                            </div>
                            <div class="xp-text" id="xp-text">0 / 500 XP</div>
                        </div>
                    </div>
                    <div class="player-stats-row">
                        <div class="stat-item"><span class="stat-icon">$</span><span id="credits-display">500</span></div>
                        <div class="stat-item"><span class="stat-icon">☠</span><span id="kills-display">0</span></div>
                        <div class="stat-item"><span class="stat-icon">◷</span><span id="playtime-display">0ч</span></div>
                    </div>
                </div>
                
                <div class="menu-buttons">
                    <button class="menu-btn play-btn" id="btn-select-map">
                        <span class="btn-icon">🗺</span>
                        <span class="btn-label">${L.selectMap}</span>
                    </button>
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-garage">
                            <span class="btn-icon">⚙</span>
                            <span class="btn-label">${L.garage}</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-stats">
                            <span class="btn-icon">📊</span>
                            <span class="btn-label">${L.stats}</span>
                        </button>
                    </div>
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-skills">
                            <span class="btn-icon">⚡</span>
                            <span class="btn-label">${L.skills}</span>
                            <span class="btn-badge" id="skill-points-hint"></span>
                        </button>
                        <button class="menu-btn secondary" id="btn-settings">
                            <span class="btn-icon">☰</span>
                            <span class="btn-label">${L.options}</span>
                        </button>
                    </div>
                </div>
                
                <div class="menu-footer">
                    <div class="controls-panel">
                        <div class="controls-title">${L.controls}</div>
                        <div class="controls-grid">
                            <div class="control-category">
                                <div class="category-header">🎮 ${L.movement}</div>
                                <div class="control-item">
                                    <span class="key">WASD</span>
                                    <span class="control-desc">${L.moveTank}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">МЫШЬ</span>
                                    <span class="control-desc">${L.rotateTurret}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">Z / X</span>
                                    <span class="control-desc">${L.turretLR}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">⚔ ${L.combat}</div>
                                <div class="control-item">
                                    <span class="key">ПРОБЕЛ</span>
                                    <span class="control-desc">${L.fire}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ПКМ</span>
                                    <span class="control-desc">${L.aimMode}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">1-5</span>
                                    <span class="control-desc">${L.useConsumables}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">КОЛЕСО</span>
                                    <span class="control-desc">${L.zoom}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📋 ${L.interface}</div>
                                <div class="control-item">
                                    <span class="key">G</span>
                                    <span class="control-desc">${L.garageKey}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">M</span>
                                    <span class="control-desc">${L.map}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">TAB</span>
                                    <span class="control-desc">${L.statsKey}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ESC</span>
                                    <span class="control-desc">${L.pauseMenu}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📷 ${L.camera}</div>
                                <div class="control-item">
                                    <span class="key">SHIFT</span>
                                    <span class="control-desc">${L.freeLook}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">C</span>
                                    <span class="control-desc">${L.center}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="version">${VERSION}</div>
                </div>
            </div>
        `;
        
        // Add Google Pixel Font
        const fontLink = document.createElement("link");
        fontLink.href = "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
        fontLink.rel = "stylesheet";
        document.head.appendChild(fontLink);
        
        const style = document.createElement("style");
        style.textContent = `
            /* === PIXEL HACKER THEME === */
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
                z-index: 99999 !important; /* ОЧЕНЬ ВЫСОКИЙ z-index чтобы быть поверх всего */
                font-family: 'Press Start 2P', 'Courier New', monospace;
                overflow: hidden;
                pointer-events: auto !important;
                touch-action: auto !important;
            }
            
            /* КРИТИЧЕСКИ ВАЖНО: Все элементы меню должны иметь pointer-events: auto */
            #main-menu * {
                pointer-events: auto !important;
            }
            
            /* Исключение для фона меню */
            #main-menu .menu-bg {
                pointer-events: none !important;
            }
            
            /* КРИТИЧЕСКИ ВАЖНО: Кнопки должны быть кликабельными */
            #main-menu button,
            #main-menu .menu-btn {
                pointer-events: auto !important;
                cursor: pointer !important;
                z-index: 100001 !important;
                position: relative;
                touch-action: manipulation !important;
            }
            
            /* АБСОЛЮТНАЯ БЛОКИРОВКА CANVAS - canvas НИКОГДА не должен перехватывать события когда меню видимо */
            body:has(#main-menu:not(.hidden)) #gameCanvas,
            body.menu-visible #gameCanvas {
                pointer-events: none !important;
                z-index: -1 !important;
            }
            
            #main-menu.hidden { 
                display: none !important;
            }
            
            /* КРИТИЧЕСКИ ВАЖНО: Canvas должен быть ниже меню по z-index */
            #gameCanvas {
                z-index: 0 !important;
            }
            
            /* АБСОЛЮТНАЯ БЛОКИРОВКА: Canvas ВСЕГДА заблокирован когда меню видимо */
            #main-menu:not(.hidden) ~ #gameCanvas,
            body:has(#main-menu:not(.hidden)) #gameCanvas,
            #gameCanvas[data-menu-blocked="true"] {
                pointer-events: none !important;
            }
            
            /* Разрешаем canvas только когда меню скрыто И body не имеет класса menu-visible */
            body:not(.menu-visible) #main-menu.hidden ~ #gameCanvas,
            body:not(.menu-visible):has(#main-menu.hidden) #gameCanvas {
                pointer-events: auto !important;
            }
            
            .menu-bg {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: 
                    repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,40,0,0.05) 2px, rgba(0,40,0,0.05) 4px),
                    radial-gradient(ellipse at 50% 50%, rgba(0,60,0,0.3) 0%, transparent 70%),
                    #000;
                pointer-events: none;
            }
            
            .menu-content {
                position: relative;
                text-align: center;
                z-index: 100000 !important;
                width: 90%;
                max-width: 800px;
                max-height: 90vh;
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 15px;
                overflow-y: auto;
                pointer-events: auto !important;
            }
            
            .menu-header {
                margin-bottom: 10px;
            }
            
            .logo-text {
                font-size: 32px;
                color: #0f0;
                letter-spacing: 4px;
                margin-bottom: 8px;
                text-shadow: 0 0 10px #0f0, 0 0 20px #0f0;
            }
            
            .logo-text .accent {
                color: #0f0;
            }
            
            .menu-subtitle {
                font-size: 10px;
                color: #0a0;
                letter-spacing: 4px;
            }
            
            .player-card {
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                padding: 15px;
                margin-bottom: 10px;
            }
            
            .player-level-row {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 10px;
            }
            
            .level-badge {
                width: 50px;
                height: 50px;
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-size: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                text-shadow: 0 0 5px #0f0;
            }
            
            .xp-section { flex: 1; }
            
            .xp-bar-bg {
                height: 12px;
                background: #020;
                border: 2px solid #0f0;
                margin-bottom: 5px;
            }
            
            .xp-bar-fill {
                height: 100%;
                background: #0f0;
                box-shadow: 0 0 10px #0f0;
                width: 0%;
            }
            
            .xp-text {
                font-size: 10px;
                color: #fff;
                text-align: right;
                text-shadow: 
                    0 0 3px #000,
                    0 0 6px #000,
                    1px 1px 0 #000,
                    -1px -1px 0 #000,
                    1px -1px 0 #000,
                    -1px 1px 0 #000;
                font-weight: bold;
            }
            
            .player-stats-row {
                display: flex;
                justify-content: space-around;
            }
            
            .stat-item {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #0f0;
            }
            
            .stat-icon {
                font-size: 16px;
            }
            
            .menu-buttons {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .btn-row {
                display: flex;
                gap: 10px;
            }
            
            .menu-btn {
                flex: 1;
                padding: 15px 20px;
                font-family: 'Press Start 2P', monospace;
                font-size: 12px;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer !important;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                position: relative;
                pointer-events: auto !important;
                user-select: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                z-index: 100000 !important;
            }
            
            .menu-btn:hover {
                background: #0f0;
                color: #000;
                box-shadow: 0 0 20px #0f0;
            }
            
            .menu-btn.play-btn {
                padding: 18px 24px;
                font-size: 14px;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }
            
            .btn-icon { font-size: 16px; }
            
            .btn-badge {
                position: absolute;
                top: -8px;
                right: -8px;
                background: #f00;
                color: #fff;
                font-size: 8px;
                padding: 4px 6px;
                display: none;
            }
            
            .btn-badge.visible { display: block; }
            
            .menu-footer {
                color: #0f0;
                font-size: 8px;
            }
            
            .controls-panel {
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                padding: 15px;
            }
            
            .controls-title {
                font-size: 12px;
                color: #0f0;
                text-align: center;
                margin-bottom: 15px;
                text-shadow: 0 0 5px #0f0;
            }
            
            .controls-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 10px;
            }
            
            @media (max-width: 900px) {
                .controls-grid { grid-template-columns: repeat(2, 1fr); }
                .logo-text { font-size: 24px; }
            }
            
            .control-category {
                background: #000;
                padding: 10px;
                border: 1px solid #0f0;
            }
            
            .category-header {
                font-size: 8px;
                color: #0f0;
                margin-bottom: 8px;
                padding-bottom: 5px;
                border-bottom: 1px solid #0f0;
                text-align: center;
            }
            
            .control-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 5px;
                margin-bottom: 6px;
            }
            
            .control-item:last-child { margin-bottom: 0; }
            
            .key {
                background: #0f0;
                color: #000;
                padding: 4px 8px;
                font-size: 8px;
                font-family: 'Press Start 2P', monospace;
                min-width: 40px;
                text-align: center;
            }
            
            .control-desc {
                color: #0f0;
                font-size: 7px;
                text-align: right;
                flex: 1;
            }
            
            .version {
                color: #080;
                font-size: 8px;
                margin-top: 10px;
            }
            
            /* Panels */
            .panel-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.95) !important;
                display: none !important;
                justify-content: center !important;
                align-items: center !important;
                z-index: 100002 !important; /* Выше чем меню (99999) */
                pointer-events: auto !important;
            }
            
            .panel-overlay.visible {
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            .panel-content {
                background: #000;
                border: 2px solid #0f0;
                padding: 25px;
                max-width: 500px;
                max-height: 80vh;
                overflow-y: auto;
                width: 90%;
                position: relative;
                font-family: 'Press Start 2P', monospace;
            }
            
            .panel-title {
                font-size: 16px;
                color: #0f0;
                text-align: center;
                margin-bottom: 20px;
                text-shadow: 0 0 10px #0f0;
            }
            
            .panel-close {
                position: absolute !important;
                top: 10px !important;
                right: 10px !important;
                width: 30px !important;
                height: 30px !important;
                background: #000 !important;
                border: 2px solid #0f0 !important;
                color: #888 !important;
                font-size: 18px !important;
                cursor: pointer !important;
                transition: all 0.15s;
                pointer-events: auto !important;
                z-index: 100003 !important; /* Выше панели */
            }
            
            .panel-close:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            
            .setting-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .setting-label {
                color: #aaa;
                font-size: 14px;
            }
            
            .setting-value {
                display: flex;
                align-items: center;
                gap: 12px;
                color: #5a8;
            }
            
            .setting-range {
                width: 120px;
                -webkit-appearance: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                height: 6px;
            }
            
            .setting-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 16px;
                height: 16px;
                background: #5a8;
                border-radius: 50%;
                cursor: pointer;
            }
            
            .setting-checkbox {
                width: 20px;
                height: 20px;
                cursor: pointer;
                accent-color: #0f0;
            }
            
            .lang-toggle {
                display: flex;
                gap: 5px;
            }
            
            .lang-btn {
                padding: 8px 16px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.15s;
            }
            
            .lang-btn:hover {
                background: rgba(0, 255, 0, 0.2);
            }
            
            .lang-btn.active {
                background: #0f0;
                color: #000;
            }
            
            /* Difficulty selector */
            .difficulty-selector {
                display: flex;
                gap: 5px;
            }
            
            .diff-btn {
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                background: rgba(0, 40, 0, 0.8);
                color: #0f0;
                border: 2px solid #0a0;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .diff-btn:hover {
                background: rgba(0, 80, 0, 0.8);
            }
            
            .diff-btn.active {
                box-shadow: 0 0 10px currentColor;
            }
            
            #diff-easy.active {
                background: #0a0;
                border-color: #0f0;
                color: #000;
            }
            
            #diff-medium.active {
                background: #aa0;
                border-color: #ff0;
                color: #000;
            }
            
            #diff-hard.active {
                background: #a00;
                border-color: #f00;
                color: #fff;
            }
            
            .panel-buttons {
                display: flex;
                gap: 10px;
                margin-top: 20px;
            }
            
            .panel-btn {
                flex: 1;
                padding: 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer;
                transition: all 0.15s;
            }
            
            .panel-btn:hover {
                background: #0f0;
                color: #000;
            }
            
            .panel-btn.primary {
                background: #0f0;
                color: #000;
            }
            
            .panel-btn.primary:hover {
                background: #0a0;
                color: #0f0;
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
                gap: 10px;
            }
            
            .stat-card {
                background: #000;
                border: 1px solid #0f0;
                padding: 15px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 18px;
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }
            
            .stat-label {
                font-size: 8px;
                color: #0a0;
                margin-top: 5px;
            }
            
            /* Skills Panel */
            .skill-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px;
                margin-bottom: 8px;
                background: #000;
                border: 1px solid #0f0;
            }
            
            .skill-icon {
                font-size: 20px;
                width: 30px;
            }
            
            .skill-info {
                flex: 1;
            }
            
            .skill-name {
                font-size: 10px;
                color: #0f0;
                margin-bottom: 4px;
            }
            
            .skill-desc {
                font-size: 8px;
                color: #0a0;
            }
            
            .skill-level {
                display: flex;
                gap: 4px;
                margin-top: 8px;
            }
            
            .skill-pip {
                width: 10px;
                height: 10px;
                background: #020;
                border: 1px solid #0f0;
            }
            
            .skill-pip.filled {
                background: #0f0;
            }
            
            .skill-upgrade-btn {
                padding: 8px 12px;
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                cursor: pointer;
                transition: all 0.15s;
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
                padding: 25px;
                z-index: 10002;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                display: none;
                max-height: 80vh;
                overflow-y: auto;
                min-width: 300px;
            }
            
            .controls-popup.visible { display: block; }
            
            .controls-popup .controls-title {
                font-size: 12px;
                text-align: center;
                margin-bottom: 15px;
                color: #0f0;
            }
            
            .controls-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #0f04;
                font-size: 10px;
                color: #0f0;
            }
            
            .controls-row .key {
                background: #0f0;
                color: #000;
                color: #fff;
                padding: 4px 10px;
                font-weight: 600;
            }
            
            /* АБСОЛЮТНАЯ БЛОКИРОВКА: Canvas ВСЕГДА заблокирован когда меню видимо */
            #main-menu:not(.hidden) ~ #gameCanvas,
            body:has(#main-menu:not(.hidden)) #gameCanvas {
                pointer-events: none !important;
            }
            
            /* Дополнительная защита через селектор по классу - ВСЕГДА блокируем */
            body.menu-visible #gameCanvas {
                pointer-events: none !important;
            }
            
            /* Блокируем canvas когда любая панель видима */
            .panel-overlay.visible ~ #gameCanvas,
            body:has(.panel-overlay.visible) #gameCanvas,
            #gameCanvas[data-menu-blocked="true"] {
                pointer-events: none !important;
            }
            
            /* ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Если меню не скрыто, canvas заблокирован ВСЕГДА */
            #main-menu:not(.hidden) + * #gameCanvas,
            #main-menu:not(.hidden) ~ * #gameCanvas {
                pointer-events: none !important;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas сразу после создания меню
        const blockCanvas = () => {
            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (canvas) {
                canvas.style.setProperty("pointer-events", "none", "important");
                canvas.style.setProperty("z-index", "-1", "important");
                canvas.style.setProperty("display", "block", "important");
                // Также пытаемся отключить события через атрибуты
                canvas.setAttribute("style", canvas.getAttribute("style") + "; pointer-events: none !important; z-index: -1 !important;");
                debugLog("[Menu] Canvas blocked after menu creation");
            }
        };
        
        blockCanvas();
        // Повторяем несколько раз для надежности
        setTimeout(blockCanvas, 0);
        setTimeout(blockCanvas, 50);
        setTimeout(blockCanvas, 100);
        setTimeout(blockCanvas, 500);
        
        // Сохраняем ссылку на обработчик для возможности переустановки
        this.setupMenuEventHandlers();
        
        // ДОПОЛНИТЕЛЬНО: Добавляем обработчики напрямую на кнопки для надежности
        // Используем несколько попыток для надежности
        setTimeout(() => {
            this.attachDirectButtonHandlers();
        }, 50);
        setTimeout(() => {
            this.attachDirectButtonHandlers();
        }, 200);
        setTimeout(() => {
            this.attachDirectButtonHandlers();
        }, 500);
    }
    
    private attachDirectButtonHandlers(): void {
        try {
            // Добавляем обработчики напрямую на каждую кнопку для максимальной надежности
            const buttons = [
                { id: "btn-select-map", handler: () => this.showMapSelection() },
                { id: "btn-garage", handler: () => this.showGarage() },
                { id: "btn-skills", handler: () => this.showSkills() },
                { id: "btn-stats", handler: () => this.showStats() },
                { id: "btn-settings", handler: () => this.showSettings() }
            ];
            
            buttons.forEach(({ id, handler }) => {
                try {
                    const btn = document.getElementById(id) as HTMLButtonElement;
                    if (!btn) {
                        debugWarn(`[Menu] Button ${id} not found!`);
                        return;
                    }
                    
                    // Удаляем все старые обработчики через клонирование
                    const parent = btn.parentNode;
                    if (!parent) {
                        debugWarn(`[Menu] Button ${id} has no parent node`);
                        return;
                    }
                    
                    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
                    parent.replaceChild(newBtn, btn);
                    
                    // Блокируем canvas перед добавлением обработчика
                    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                    if (canvas) {
                        canvas.style.setProperty("pointer-events", "none", "important");
                        canvas.style.setProperty("z-index", "0", "important");
                    }
                    
                    // Единый обработчик click в фазе захвата
                    newBtn.addEventListener("click", (e) => {
                        try {
                            debugLog(`[Menu] Button ${id} clicked`);
                            
                            // Блокируем canvas
                            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                            if (canvas) {
                                canvas.style.setProperty("pointer-events", "none", "important");
                            }
                            
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            
                            handler();
                        } catch (error) {
                            debugError(`[Menu] Error in button handler for ${id}:`, error);
                        }
                    }, true);
                    
                    // Блокируем canvas при нажатии мыши
                    newBtn.addEventListener("mousedown", (e) => {
                        try {
                            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                            if (canvas) {
                                canvas.style.setProperty("pointer-events", "none", "important");
                            }
                            e.stopPropagation();
                        } catch (error) {
                            debugError(`[Menu] Error in mousedown handler for ${id}:`, error);
                        }
                    }, true);
                    
                    debugLog(`[Menu] Direct handler attached to ${id}`);
                } catch (error) {
                    debugError(`[Menu] Error setting up button handler for ${id}:`, error);
                }
            });
        } catch (error) {
            debugError("[Menu] Error in attachDirectButtonHandlers:", error);
        }
    }
    
    private setupCloseButton(id: string, handler: () => void): void {
        try {
            const btn = document.getElementById(id);
            if (!btn) {
                debugWarn(`[Menu] Close button ${id} not found`);
                return;
            }
            
            // Удаляем старые обработчики через клонирование
            const parent = btn.parentNode;
            if (!parent) {
                debugWarn(`[Menu] Close button ${id} has no parent node`);
                return;
            }
            
            const newBtn = btn.cloneNode(true) as HTMLElement;
            parent.replaceChild(newBtn, btn);
            
            // Единый обработчик в фазе захвата
            newBtn.addEventListener("click", (e) => {
                try {
                    debugLog(`[Menu] Close button ${id} clicked`);
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // Блокируем canvas
                    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                    if (canvas) {
                        canvas.style.setProperty("pointer-events", "none", "important");
                    }
                    
                    handler();
                } catch (error) {
                    debugError(`[Menu] Error in close button handler for ${id}:`, error);
                }
            }, true);
        } catch (error) {
            debugError(`[Menu] Error setting up close button ${id}:`, error);
        }
    }
    
    private setupPanelCloseOnBackground(panel: HTMLDivElement, handler: () => void): void {
        if (!panel) {
            debugWarn("[Menu] setupPanelCloseOnBackground: panel is null");
            return;
        }
        
        try {
            // Закрытие по клику на фон панели (но не на содержимое)
            panel.addEventListener("click", (e) => {
                try {
                    const target = e.target as HTMLElement;
                    // Если клик был по самому overlay (фону), а не по содержимому
                    if (target === panel) {
                        debugLog("[Menu] Panel background clicked, closing");
                        e.preventDefault();
                        e.stopPropagation();
                        handler();
                    }
                } catch (error) {
                    debugError("[Menu] Error in panel background click handler:", error);
                }
            });
            
            // Закрытие по ESC
            const escHandler = (e: KeyboardEvent) => {
                try {
                    if (e.key === "Escape" && panel && panel.classList.contains("visible")) {
                        debugLog("[Menu] ESC pressed, closing panel");
                        e.preventDefault();
                        handler();
                    }
                } catch (error) {
                    debugError("[Menu] Error in ESC handler:", error);
                }
            };
            document.addEventListener("keydown", escHandler);
            
            // Сохраняем обработчик для возможности удаления
            (panel as any)._escHandler = escHandler;
        } catch (error) {
            debugError("[Menu] Error setting up panel close handlers:", error);
        }
    }
    
    private setupMenuEventHandlers(): void {
        // Удаляем старые обработчики если они есть (на случай переустановки)
        const oldHandler = (this.container as any)._menuClickHandler;
        if (oldHandler) {
            this.container.removeEventListener("click", oldHandler, true);
            this.container.removeEventListener("click", oldHandler, false);
        }
        
        // Use event delegation for better reliability with multiple layers of protection
        const handleClick = (e: MouseEvent) => {
            // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas ПЕРЕД любой обработкой
            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (canvas) {
                canvas.style.setProperty("pointer-events", "none", "important");
            }
            
            // Проверяем, что меню действительно видимо
            if (this.container.classList.contains("hidden")) {
                return;
            }
            
            const target = e.target as HTMLElement;
            
            // Проверяем, что клик был по элементу меню, а не по canvas
            if (!this.container.contains(target)) {
                return;
            }
            
            const button = target.closest('.menu-btn') as HTMLButtonElement;
            
            if (!button) {
                // Play intro sound on first interaction with menu (only if not clicking a button)
                if (!this.introSoundPlayed) {
                    this.introSoundPlayed = true;
                    this.onPlayIntroSound();
                }
                return;
            }
            
            // Handle button clicks
            const buttonId = button.id;
            debugLog(`[Menu] Delegated handler: ${buttonId} clicked`);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Блокируем canvas СРАЗУ перед показом панели
            this.enforceCanvasPointerEvents();
            
            switch (buttonId) {
                case "btn-select-map":
                    debugLog("[Menu] Showing map selection");
                    this.showMapSelection();
                    break;
                case "btn-garage":
                    debugLog("[Menu] Showing garage");
                    this.showGarage();
                    break;
                case "btn-skills":
                    debugLog("[Menu] Showing skills");
                    this.showSkills();
                    break;
                case "btn-stats":
                    debugLog("[Menu] Showing stats");
                    this.showStats();
                    break;
                case "btn-settings":
                    debugLog("[Menu] Showing settings");
                    this.showSettings();
                    break;
            }
            
            // Еще раз блокируем canvas после показа панели (с небольшой задержкой для надежности)
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 0);
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 10);
            setTimeout(() => {
                this.enforceCanvasPointerEvents();
            }, 50);
        };
        
        // Сохраняем ссылку на обработчик
        (this.container as any)._menuClickHandler = handleClick;
        
        // Добавляем обработчик в фазе захвата (capture) для максимального приоритета
        this.container.addEventListener("click", handleClick, true);
        // Также добавляем в фазе всплытия (bubble) на всякий случай
        this.container.addEventListener("click", handleClick, false);
        
        // Дополнительная защита: блокируем canvas при наведении мыши на меню
        const handleMouseEnter = () => {
            this.enforceCanvasPointerEvents();
        };
        const handleMouseMove = () => {
            if (!this.container.classList.contains("hidden")) {
                this.enforceCanvasPointerEvents();
            }
        };
        const handleMouseDown = () => {
            this.enforceCanvasPointerEvents();
        };
        const handleMouseUp = () => {
            this.enforceCanvasPointerEvents();
        };
        
        this.container.addEventListener("mouseenter", handleMouseEnter);
        this.container.addEventListener("mousemove", handleMouseMove);
        this.container.addEventListener("mousedown", handleMouseDown);
        this.container.addEventListener("mouseup", handleMouseUp);
        
        // Сохраняем ссылки на обработчики для возможности переустановки
        (this.container as any)._menuMouseEnterHandler = handleMouseEnter;
        (this.container as any)._menuMouseMoveHandler = handleMouseMove;
        (this.container as any)._menuMouseDownHandler = handleMouseDown;
        (this.container as any)._menuMouseUpHandler = handleMouseUp;
    }
    
    private updatePlayerInfo(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        
        const levelBadge = document.getElementById("level-badge");
        if (levelBadge) levelBadge.textContent = stats.level.toString();
        
        // Плавная анимация XP-бара
        const xpBar = document.getElementById("xp-bar") as HTMLElement;
        if (xpBar) {
            const targetPercent = xpProgress.percent;
            const currentPercent = parseFloat(xpBar.style.width) || 0;
            
            // Плавная интерполяция к целевому значению
            if (Math.abs(targetPercent - currentPercent) > 0.1) {
                const diff = targetPercent - currentPercent;
                const newPercent = currentPercent + diff * 0.15; // Плавное приближение
                xpBar.style.width = `${Math.max(0, Math.min(100, newPercent))}%`;
                xpBar.style.transition = "width 0.1s linear"; // Плавная анимация
            } else {
                xpBar.style.width = `${targetPercent}%`;
            }
        }
        
        const xpText = document.getElementById("xp-text");
        if (xpText) xpText.textContent = `${xpProgress.current} / ${xpProgress.required} XP`;
        
        const creditsDisplay = document.getElementById("credits-display");
        if (creditsDisplay) creditsDisplay.textContent = stats.credits.toString();
        
        const killsDisplay = document.getElementById("kills-display");
        if (killsDisplay) killsDisplay.textContent = stats.totalKills.toString();
        
        const playtimeDisplay = document.getElementById("playtime-display");
        if (playtimeDisplay) playtimeDisplay.textContent = this.playerProgression.getPlayTimeFormatted();
        
        const skillPointsHint = document.getElementById("skill-points-hint");
        if (skillPointsHint) {
            if (stats.skillPoints > 0) {
                skillPointsHint.textContent = stats.skillPoints.toString();
                skillPointsHint.classList.add("visible");
            } else {
                skillPointsHint.classList.remove("visible");
            }
        }
    }
    
    private startAnimations(): void {
        // Периодическое обновление статистики в реальном времени (каждые 100мс для плавной анимации XP-бара)
        setInterval(() => {
            if (this.playerProgression) {
                this.updatePlayerInfo();
                if (this.statsPanel && this.statsPanel.classList.contains("visible")) {
                    this.updateStatsPanel();
                }
            }
        }, 100); // Обновляем каждые 100мс для плавной анимации
        
        // Fallback обновление раз в 5 секунд (на случай если события не работают)
        setInterval(() => {
            if (this.container && !this.container.classList.contains('hidden')) {
                this.updatePlayerInfo();
            }
        }, 5000);
    }
    
    private createSettingsUI(): void {
        this.settingsPanel = document.createElement("div");
        this.settingsPanel.className = "panel-overlay";
        this.settingsPanel.id = "settings-panel";
        const L = getLang(this.settings);
        this.settingsPanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="settings-close">✕</button>
                <div class="panel-title">${L.options}</div>
                
                <div class="setting-row">
                    <span class="setting-label">${L.language}</span>
                    <div class="setting-value lang-toggle">
                        <button class="lang-btn ${this.settings.language === 'ru' ? 'active' : ''}" id="lang-ru">RU</button>
                        <button class="lang-btn ${this.settings.language === 'en' ? 'active' : ''}" id="lang-en">EN</button>
                    </div>
                </div>
                
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
                    <span class="setting-label">Показывать FPS</span>
                    <input type="checkbox" class="setting-checkbox" id="set-fps" ${this.settings.showFPS ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Показывать миникарту</span>
                    <input type="checkbox" class="setting-checkbox" id="set-minimap" ${this.settings.showMinimap ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Тряска экрана</span>
                    <input type="checkbox" class="setting-checkbox" id="set-screen-shake" ${this.settings.screenShake ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">Виртуальная фиксация башни</span>
                    <input type="checkbox" class="setting-checkbox" id="set-virtual-fixation" ${this.settings.virtualTurretFixation ? 'checked' : ''}>
                </div>
                
                <div class="setting-row">
                    <span class="setting-label">${L.enemyDifficulty}</span>
                    <div class="setting-value difficulty-selector">
                        <button class="diff-btn ${this.settings.enemyDifficulty === 'easy' ? 'active' : ''}" id="diff-easy" data-diff="easy">${L.diffEasy}</button>
                        <button class="diff-btn ${this.settings.enemyDifficulty === 'medium' ? 'active' : ''}" id="diff-medium" data-diff="medium">${L.diffMedium}</button>
                        <button class="diff-btn ${this.settings.enemyDifficulty === 'hard' ? 'active' : ''}" id="diff-hard" data-diff="hard">${L.diffHard}</button>
                    </div>
                </div>
                
                <div class="panel-buttons">
                    <button class="panel-btn primary" id="settings-save">Сохранить</button>
                    <button class="panel-btn danger" id="settings-reset">Сброс</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.settingsPanel);
        
        this.setupPanelCloseOnBackground(this.settingsPanel, () => this.hideSettings());
        
        const setupSlider = (id: string, valId: string, suffix: string = "") => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const val = document.getElementById(valId);
            slider?.addEventListener("input", () => {
                if (val) val.textContent = slider.value + suffix;
            });
        };
        
        setupSlider("set-render", "set-render-val");
        setupSlider("set-sound", "set-sound-val", "%");
        setupSlider("set-mouse", "set-mouse-val");
        setupSlider("set-camera-dist", "set-camera-dist-val");
        
        // Language toggle
        document.getElementById("lang-ru")?.addEventListener("click", () => {
            this.settings.language = "ru";
            document.getElementById("lang-ru")?.classList.add("active");
            document.getElementById("lang-en")?.classList.remove("active");
        });
        
        document.getElementById("lang-en")?.addEventListener("click", () => {
            this.settings.language = "en";
            document.getElementById("lang-en")?.classList.add("active");
            document.getElementById("lang-ru")?.classList.remove("active");
        });
        
        // Difficulty selector
        ["easy", "medium", "hard"].forEach(diff => {
            document.getElementById(`diff-${diff}`)?.addEventListener("click", () => {
                this.settings.enemyDifficulty = diff as "easy" | "medium" | "hard";
                // Update active button
                document.querySelectorAll(".diff-btn").forEach(btn => btn.classList.remove("active"));
                document.getElementById(`diff-${diff}`)?.classList.add("active");
            });
        });
        
        document.getElementById("settings-save")?.addEventListener("click", () => {
            this.saveSettingsFromUI();
            this.hideSettings();
            // Reload to apply language changes
            location.reload();
        });
        
        document.getElementById("settings-reset")?.addEventListener("click", () => {
            this.settings = { ...DEFAULT_SETTINGS };
            this.saveSettingsFromUI();
            location.reload();
        });
        
        this.setupCloseButton("settings-close", () => this.hideSettings());
    }
    
    private createStatsPanel(): void {
        this.statsPanel = document.createElement("div");
        this.statsPanel.className = "panel-overlay";
        this.statsPanel.id = "stats-panel";
        this.statsPanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="stats-close">✕</button>
                <div class="panel-title">Статистика</div>
                <div class="stats-grid" id="stats-grid"></div>
                <div class="panel-buttons">
                    <button class="panel-btn" id="stats-back">Закрыть</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.statsPanel);
        
        this.setupCloseButton("stats-close", () => this.hideStats());
        this.setupCloseButton("stats-back", () => this.hideStats());
        this.setupPanelCloseOnBackground(this.statsPanel, () => this.hideStats());
    }
    
    private createSkillsPanel(): void {
        this.skillsPanel = document.createElement("div");
        this.skillsPanel.className = "panel-overlay";
        this.skillsPanel.id = "skills-panel";
        this.skillsPanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="skills-close">✕</button>
                <div class="panel-title">Навыки</div>
                <div id="skill-points-display" style="text-align:center;margin-bottom:20px;color:#5a8;font-size:16px">Очков: 0</div>
                <div id="skills-list"></div>
                <div class="panel-buttons">
                    <button class="panel-btn" id="skills-back">Закрыть</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.skillsPanel);
        
        this.setupCloseButton("skills-close", () => this.hideSkills());
        this.setupCloseButton("skills-back", () => this.hideSkills());
        this.setupPanelCloseOnBackground(this.skillsPanel, () => this.hideSkills());
    }
    
    private createMapSelectionPanel(): void {
        this.mapSelectionPanel = document.createElement("div");
        this.mapSelectionPanel.className = "panel-overlay";
        this.mapSelectionPanel.id = "map-selection-panel";
        const L = getLang(this.settings);
        this.mapSelectionPanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="map-selection-close">✕</button>
                <div class="panel-title">${L.mapSelection}</div>
                
                <div style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
                    <button class="menu-btn play-btn" id="btn-map-normal" style="width: 100%; padding: 20px;">
                        <span class="btn-icon">🗺</span>
                        <span class="btn-label">${L.normalMap}</span>
                    </button>
                    <button class="menu-btn secondary" id="btn-map-sandbox" style="width: 100%; padding: 20px;">
                        <span class="btn-icon">🏖</span>
                        <span class="btn-label">${L.sandboxMap}</span>
                    </button>
                </div>
                
                <div class="panel-buttons" style="margin-top: 20px;">
                    <button class="panel-btn" id="map-selection-back">Назад</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.mapSelectionPanel);
        
        document.getElementById("btn-map-normal")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("normal");
        });
        
        document.getElementById("btn-map-sandbox")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("sandbox");
        });
        
        this.setupCloseButton("map-selection-close", () => this.hideMapSelection());
        this.setupCloseButton("map-selection-back", () => this.hideMapSelection());
        this.setupPanelCloseOnBackground(this.mapSelectionPanel, () => this.hideMapSelection());
    }
    
    private showMapSelection(): void {
        debugLog("[Menu] showMapSelection() called");
        debugLog("[Menu] mapSelectionPanel exists:", !!this.mapSelectionPanel);
        if (this.mapSelectionPanel) {
            this.mapSelectionPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.mapSelectionPanel.style.setProperty("display", "flex", "important");
            this.mapSelectionPanel.style.setProperty("visibility", "visible", "important");
            this.mapSelectionPanel.style.setProperty("opacity", "1", "important");
            this.mapSelectionPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.mapSelectionPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.mapSelectionPanel).display);
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] mapSelectionPanel is null!");
        }
    }
    
    private hideMapSelection(): void {
        debugLog("[Menu] hideMapSelection() called");
        if (this.mapSelectionPanel) {
            this.mapSelectionPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.mapSelectionPanel.style.setProperty("display", "none", "important");
            this.mapSelectionPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }
    
    private showStats(): void {
        debugLog("[Menu] showStats() called");
        debugLog("[Menu] statsPanel exists:", !!this.statsPanel);
        if (this.statsPanel) {
            this.statsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.statsPanel.style.setProperty("display", "flex", "important");
            this.statsPanel.style.setProperty("visibility", "visible", "important");
            this.statsPanel.style.setProperty("opacity", "1", "important");
            this.statsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.statsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.statsPanel).display);
            this.updateStatsPanel();
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] statsPanel is null!");
        }
    }
    
    private hideStats(): void {
        debugLog("[Menu] hideStats() called");
        if (this.statsPanel) {
            this.statsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.statsPanel.style.setProperty("display", "none", "important");
            this.statsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
    }
    
    private updateStatsPanel(): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const grid = document.getElementById("stats-grid");
        if (!grid) return;
        
        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${stats.level}</div>
                <div class="stat-label">Уровень</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalKills}</div>
                <div class="stat-label">Убийств</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.totalDeaths}</div>
                <div class="stat-label">Смертей</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getKDRatio()}</div>
                <div class="stat-label">K/D</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getAccuracy()}</div>
                <div class="stat-label">Точность</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${stats.bestKillStreak}</div>
                <div class="stat-label">Лучшая серия</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Math.round(stats.totalDamageDealt)}</div>
                <div class="stat-label">Урон нанесён</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.playerProgression.getPlayTimeFormatted()}</div>
                <div class="stat-label">Время в игре</div>
            </div>
        `;
    }
    
    private showSkills(): void {
        debugLog("[Menu] showSkills() called");
        debugLog("[Menu] skillsPanel exists:", !!this.skillsPanel);
        if (this.skillsPanel) {
            this.skillsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.skillsPanel.style.setProperty("display", "flex", "important");
            this.skillsPanel.style.setProperty("visibility", "visible", "important");
            this.skillsPanel.style.setProperty("opacity", "1", "important");
            this.skillsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.skillsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.skillsPanel).display);
            this.updateSkillsPanel();
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] skillsPanel is null!");
        }
    }
    
    private hideSkills(): void {
        debugLog("[Menu] hideSkills() called");
        if (this.skillsPanel) {
            this.skillsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.skillsPanel.style.setProperty("display", "none", "important");
            this.skillsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
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
            { id: "tankMastery", name: "Tank Mastery", icon: "🛡️", desc: "+0.3 speed per level" },
            { id: "combatExpert", name: "Combat Expert", icon: "⚔️", desc: "+3 damage per level" },
            { id: "survivalInstinct", name: "Survival Instinct", icon: "❤️", desc: "+10 HP per level" },
            { id: "resourcefulness", name: "Resourcefulness", icon: "💰", desc: "+5% XP and credits" },
            { id: "tacticalGenius", name: "Tactical Genius", icon: "🎯", desc: "-50ms reload" }
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
                        ${level >= maxLevel ? 'MAX' : '+'}
                    </button>
                </div>
            `;
        }).join('');
        
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
    
    private createGarageUI(): void {
        this.garagePanel = document.createElement("div");
        this.garagePanel.className = "panel-overlay";
        this.garagePanel.id = "garage-panel";
        this.garagePanel.innerHTML = `
            <div class="panel-content">
                <button class="panel-close" id="garage-close">✕</button>
                <div class="panel-title">Быстрый гараж</div>
                <p style="color:#777;text-align:center;margin-bottom:20px;font-size:13px">Для полного гаража нажмите G в игре</p>
                
                <div class="setting-row">
                    <span class="setting-label">Скорость</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="tank-speed" min="1" max="3" value="${this.tankConfig.speed}">
                        <span id="speed-val">${this.tankConfig.speed}</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">Броня</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="tank-armor" min="1" max="3" value="${this.tankConfig.armor}">
                        <span id="armor-val">${this.tankConfig.armor}</span>
                    </div>
                </div>
                <div class="setting-row">
                    <span class="setting-label">Огневая мощь</span>
                    <div class="setting-value">
                        <input type="range" class="setting-range" id="tank-firepower" min="1" max="3" value="${this.tankConfig.firepower}">
                        <span id="firepower-val">${this.tankConfig.firepower}</span>
                    </div>
                </div>
                
                <div class="panel-buttons">
                    <button class="panel-btn primary" id="btn-garage-save">Сохранить</button>
                    <button class="panel-btn" id="btn-garage-back">Назад</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.garagePanel);
        
        this.setupPanelCloseOnBackground(this.garagePanel, () => this.hideGarage());
        
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
        
        this.setupCloseButton("btn-garage-back", () => this.hideGarage());
        this.setupCloseButton("garage-close", () => this.hideGarage());
    }
    
    private showGarage(): void {
        debugLog("[Menu] showGarage() called");
        debugLog("[Menu] garagePanel exists:", !!this.garagePanel);
        if (this.garagePanel) {
            this.garagePanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.garagePanel.style.setProperty("display", "flex", "important");
            this.garagePanel.style.setProperty("visibility", "visible", "important");
            this.garagePanel.style.setProperty("opacity", "1", "important");
            this.garagePanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.garagePanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.garagePanel).display);
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] garagePanel is null!");
        }
    }
    
    private hideGarage(): void {
        debugLog("[Menu] hideGarage() called");
        if (this.garagePanel) {
            this.garagePanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.garagePanel.style.setProperty("display", "none", "important");
            this.garagePanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
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
        debugLog("[Menu] showSettings() called");
        debugLog("[Menu] settingsPanel exists:", !!this.settingsPanel);
        if (this.settingsPanel) {
            this.settingsPanel.classList.add("visible");
            // Принудительно устанавливаем стили для гарантии отображения
            this.settingsPanel.style.setProperty("display", "flex", "important");
            this.settingsPanel.style.setProperty("visibility", "visible", "important");
            this.settingsPanel.style.setProperty("opacity", "1", "important");
            this.settingsPanel.style.setProperty("z-index", "100002", "important");
            debugLog("[Menu] Added 'visible' class, panel has classes:", this.settingsPanel.className);
            debugLog("[Menu] Panel style.display:", window.getComputedStyle(this.settingsPanel).display);
            this.enforceCanvasPointerEvents(); // Блокируем canvas при показе панели
        } else {
            debugError("[Menu] settingsPanel is null!");
        }
    }
    
    private hideSettings(): void {
        debugLog("[Menu] hideSettings() called");
        if (this.settingsPanel) {
            this.settingsPanel.classList.remove("visible");
            // Сбрасываем inline стили для гарантии скрытия
            this.settingsPanel.style.setProperty("display", "none", "important");
            this.settingsPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents(); // Обновляем состояние canvas
        }
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
            cameraHeight: 5,
            aimFOV: 0.4,
            graphicsQuality: 2,
            vsync: false,
            fullscreen: false,
            aimAssist: true,
            showDamageNumbers: true,
            screenShake: (document.getElementById("set-screen-shake") as HTMLInputElement)?.checked ?? true,
            virtualTurretFixation: (document.getElementById("set-virtual-fixation") as HTMLInputElement)?.checked ?? false,
            language: this.settings.language, // Preserve current language selection
            enemyDifficulty: this.settings.enemyDifficulty // Preserve difficulty selection
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
    
    setOnStartGame(callback: (mapType?: MapType) => void): void {
        this.onStartGame = callback;
    }
    
    setOnPlayIntroSound(callback: () => void): void {
        this.onPlayIntroSound = callback;
    }
    
    getSettings(): GameSettings {
        return this.settings;
    }
    
    getTankConfig(): TankConfig {
        return this.tankConfig;
    }
    
    show(): void {
        debugLog("[Menu] show() called");
        this.container.classList.remove("hidden");
        document.body.classList.add("menu-visible");
        this.updatePlayerInfo();
        
        // КРИТИЧЕСКИ ВАЖНО: Блокируем canvas СРАЗУ
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (canvas) {
            canvas.style.setProperty("pointer-events", "none", "important");
            canvas.style.setProperty("z-index", "0", "important");
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Переустанавливаем обработчики событий при каждом показе меню
        this.setupMenuEventHandlers();
        
        // КРИТИЧЕСКИ ВАЖНО: Переустанавливаем защиту canvas при каждом показе меню
        this.setupCanvasPointerEventsProtection();
        
        // Переустанавливаем прямые обработчики на кнопки
        setTimeout(() => {
            this.attachDirectButtonHandlers();
        }, 50);
        
        // Принудительно блокируем pointer-events на canvas МНОЖЕСТВЕННО
        this.enforceCanvasPointerEvents();
        setTimeout(() => this.enforceCanvasPointerEvents(), 0);
        setTimeout(() => this.enforceCanvasPointerEvents(), 10);
        setTimeout(() => this.enforceCanvasPointerEvents(), 50);
        setTimeout(() => this.enforceCanvasPointerEvents(), 100);
        setTimeout(() => this.enforceCanvasPointerEvents(), 200);
        
        // Также отправляем событие для Game класса
        window.dispatchEvent(new CustomEvent("menuVisibilityChanged", { detail: { visible: true } }));
        
        debugLog("[Menu] Menu shown, handlers reinstalled, canvas should be blocked");
    }
    
    isVisible(): boolean {
        return !this.container.classList.contains("hidden");
    }
    
    hide(): void {
        this.container.classList.add("hidden");
        document.body.classList.remove("menu-visible");
        // Разрешаем pointer-events на canvas
        this.enforceCanvasPointerEvents();
        // Также отправляем событие для Game класса
        window.dispatchEvent(new CustomEvent("menuVisibilityChanged", { detail: { visible: false } }));
    }
}
