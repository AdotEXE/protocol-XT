// ═══════════════════════════════════════════════════════════════════════════
// MAIN MENU - Минималистичное главное меню
// ═══════════════════════════════════════════════════════════════════════════

// Импорты для скил-дерева перенесены в menu/skillTreeUI.ts
import { createSkillsPanelHTML, updateSkillTreeDisplay, type PlayerStats, type SkillTreeCallbacks } from "./menu/skillTreeUI";
import { Scene, Engine } from "@babylonjs/core";
import { Garage } from "./garage";
import { CurrencyManager } from "./currencyManager";
import { logger } from "./utils/logger";

// Version tracking
// Версия генерируется во время сборки и одинакова для всех пользователей
const VERSION_MAJOR = 0;
const VERSION_MINOR = 3;

// Время сборки и commit hash внедряются во время сборки через Vite define
// В dev режиме используем текущее время
declare const __BUILD_TIME__: string | undefined;
declare const __COMMIT_HASH__: string | undefined;
declare const __BUILD_NUMBER__: string | undefined;

const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' 
    ? __BUILD_TIME__ 
    : (() => {
        const date = new Date();
        const year = String(date.getFullYear()).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `[${day}.${month}.${year} ${hours}:${minutes}:${seconds}]`;
    })();

const COMMIT_HASH = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';

// Используем build number из vite.config.ts (генерируется во время сборки)
// Для dev режима используем 0
const buildNumber = typeof __BUILD_NUMBER__ !== 'undefined' 
    ? parseInt(__BUILD_NUMBER__) 
    : (() => {
        // Fallback: вычисляем из commit hash если доступен
        if (COMMIT_HASH !== 'dev' && COMMIT_HASH.length >= 4) {
            return parseInt(COMMIT_HASH.substring(0, 4), 16) % 10000;
        }
        return 0;
    })();

const VERSION = `v${VERSION_MAJOR}.${VERSION_MINOR}.${buildNumber} ${BUILD_TIME}`;

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

// Импорт функций настроек
import { 
    loadSettings as loadSettingsModule, 
    saveSettingsFromUI as saveSettingsFromUIModule, 
    DEFAULT_SETTINGS, 
    type GameSettings 
} from "./menu/settings";

// GameSettings и DEFAULT_SETTINGS теперь импортируются из menu/settings.ts
export type { GameSettings } from "./menu/settings";
export { DEFAULT_SETTINGS } from "./menu/settings";

// Удалены дублирующиеся определения - они импортируются из menu/settings.ts
// Старая реализация удалена, используется модульная версия

// === LANGUAGE STRINGS ===
const LANG = {
    ru: {
        play: "ИГРАТЬ",
        quickStart: "БЫСТРЫЙ СТАРТ",
        selectMap: "ВЫБОР КАРТЫ",
        garage: "ГАРАЖ",
        stats: "СТАТИСТИКА",
        skills: "НАВЫКИ",
        options: "НАСТРОЙКИ",
        controls: "УПРАВЛЕНИЕ",
        version: "Версия",
        tankCombat: "ТАНКОВЫЙ СИМУЛЯТОР",
        mapSelection: "ВЫБОР КАРТЫ",
        normalMap: "Эта самая карта",
        normalMapDesc: "Полностью случайная генерация с разнообразными биомами, дорогами и природой",
        sandboxMap: "Песочница",
        sandboxMapDesc: "Чистая плоская поверхность для тестирования",
        polygonMap: "Полигон",
        polygonMapDesc: "Военный полигон с ангарами, техникой, складами, кранами и вышками",
        frontlineMap: "Передовая",
        frontlineMapDesc: "Разрушенная линия фронта с кратерами, окопами и укреплениями",
        ruinsMap: "Руины",
        ruinsMapDesc: "Полуразрушенный город военного времени с обрушенными зданиями",
        canyonMap: "Ущелье",
        canyonMapDesc: "Горная местность с проходами, реками, озёрами, лесами и деревнями",
        industrialMap: "Промзона",
        industrialMapDesc: "Крупная промышленная зона с заводами, портом и ж/д терминалом",
        urbanWarfareMap: "Городские бои",
        urbanWarfareMapDesc: "Плотная городская застройка с баррикадами и укреплениями",
        undergroundMap: "Подземелье",
        undergroundMapDesc: "Система пещер, шахт и туннелей под землёй",
        coastalMap: "Побережье",
        coastalMapDesc: "Береговая линия с портом, маяками, пляжами и утёсами",
        // Controls
        movement: "Движение",
        combat: "Бой",
        interface: "Интерфейс",
        camera: "Камера",
        comms: "Связь",
        moveTank: "Движение",
        rotateTurret: "Башня",
        turretLR: "Башня Л/П",
        fire: "Огонь",
        aimMode: "Прицел",
        useConsumables: "Расходники",
        zoom: "Зум",
        generalChat: "Общий чат",
        teamChat: "Командный чат",
        voicePTT: "Голосовой чат (PTT)",
        voiceToggle: "Вкл/Выкл голосовой связи",
        voiceMenu: "Меню/индикатор голоса",
        tracerHotkey: "Трассер",
        admin: "Админ",
        adminTools: "Админ-инструменты",
        adminCheatPanel: "Окно контроля читов",
        adminF2: "Телепорт / дебаг (F2)",
        adminF3: "Dev Dashboard (F3)",
        adminF4: "Dev Console (F4)",
        adminF6: "Настройки физики (F6)",
        adminF7: "Меню читов (F7)",
        openCheatMenu: "Открыть меню читов",
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
        worldSeed: "Сид карты",
        randomSeed: "Случайный сид",
        copySeed: "Копировать",
        seedCopied: "Сид скопирован!",
        fullscreen: "Полный экран",
        exitFullscreen: "Выйти из полноэкранного",
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
        quickStart: "QUICK START",
        selectMap: "SELECT MAP",
        garage: "GARAGE",
        stats: "STATS",
        skills: "SKILLS",
        options: "OPTIONS",
        controls: "CONTROLS",
        version: "Version",
        tankCombat: "TANK SIMULATOR",
        mapSelection: "MAP SELECTION",
        normalMap: "Normal Map",
        normalMapDesc: "Fully random generation with diverse biomes, roads and nature",
        sandboxMap: "Sandbox",
        sandboxMapDesc: "Clean flat surface for testing",
        polygonMap: "Training Ground",
        polygonMapDesc: "Military training ground with hangars, vehicles, warehouses, cranes and watchtowers",
        frontlineMap: "Frontline",
        frontlineMapDesc: "Destroyed frontline with craters, trenches and fortifications",
        ruinsMap: "Ruins",
        ruinsMapDesc: "Half-destroyed war-torn city with collapsed buildings",
        canyonMap: "Canyon",
        canyonMapDesc: "Mountainous terrain with passes, rivers, lakes, forests and villages",
        industrialMap: "Industrial Zone",
        industrialMapDesc: "Large industrial area with factories, port and railway terminal",
        urbanWarfareMap: "Urban Warfare",
        urbanWarfareMapDesc: "Dense urban environment with barricades and fortifications",
        undergroundMap: "Underground",
        undergroundMapDesc: "Cave system, mines and tunnels underground",
        coastalMap: "Coastal",
        coastalMapDesc: "Coastline with port, lighthouses, beaches and cliffs",
        // Controls
        movement: "Movement",
        combat: "Combat",
        interface: "Interface",
        camera: "Camera",
        comms: "Comms",
        moveTank: "Move tank",
        rotateTurret: "Rotate turret",
        turretLR: "Turret L/R",
        fire: "Fire",
        aimMode: "Aim mode",
        useConsumables: "Use consumables",
        zoom: "Zoom (aim)",
        generalChat: "General chat",
        teamChat: "Team chat",
        voicePTT: "Voice chat (PTT)",
        voiceToggle: "Voice toggle on/off",
        voiceMenu: "Voice menu/indicator",
        tracerHotkey: "Tracer",
        admin: "Admin",
        adminTools: "Admin tools",
        adminCheatPanel: "Cheat control window",
        adminF2: "Teleport / debug (F2)",
        adminF3: "Dev Dashboard (F3)",
        adminF4: "Dev Console (F4)",
        adminF6: "Physics settings (F6)",
        adminF7: "Cheat menu (F7)",
        openCheatMenu: "Open cheat menu",
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
        worldSeed: "World Seed",
        randomSeed: "Random Seed",
        copySeed: "Copy",
        seedCopied: "Seed copied!",
        fullscreen: "Fullscreen",
        exitFullscreen: "Exit Fullscreen",
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

export type MapType = "normal" | "sandbox" | "polygon" | "frontline" | "ruins" | "canyon" | "industrial" | "urban_warfare" | "underground" | "coastal";

export class MainMenu {
    private container!: HTMLDivElement;
    private settingsPanel!: HTMLDivElement;
    private statsPanel!: HTMLDivElement;
    private skillsPanel!: HTMLDivElement;
    private mapSelectionPanel!: HTMLDivElement;
    private playMenuPanel!: HTMLDivElement;
    private onStartGame: (mapType?: MapType) => void = () => {};
    private onRestartGame: () => void = () => {};
    private onExitBattle: () => void = () => {};
    private selectedGameMode: string = "";
    private selectedMapType: MapType | null = null;
    private selectedChassis: string = "";
    private selectedCannon: string = "";
    private ownedChassisIds: Set<string> = new Set();
    private ownedCannonIds: Set<string> = new Set();
    // @ts-expect-error - используется в setPlayStep() и через события
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private currentPlayStep: number = 0;
    private onPlayIntroSound: () => void = () => {};
    private settings!: GameSettings;
    private tankConfig!: TankConfig;
    private playerProgression: any = null;
    private experienceSubscription: any = null;
    private introSoundPlayed = false;
    private garage: Garage | null = null; // Garage instance (created in constructor or set by game.ts)
    private garageScene: Scene | null = null; // Minimal scene for garage (if created in menu)
    private garageCurrencyManager: CurrencyManager | null = null; // Currency manager for garage
    private returnToPlayMenuAfterGarage = false;
    
    private canvasObserver: MutationObserver | null = null;
    private canvasPointerEventsCheckInterval: number | null = null;
    private _lastPointerEventsState: string | null = null; // Кэш последнего состояния для предотвращения бесконечных циклов
    private _enforceInProgress = false; // Флаг для предотвращения рекурсивных вызовов
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию
    
    constructor() {
        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.ownedChassisIds = this.loadOwnedIds("ownedChassis", ["medium"]);
        this.ownedCannonIds = this.loadOwnedIds("ownedCannons", ["standard"]);
        
        // Create garage immediately so it's always available
        this.initializeGarageInMenu();
        
        this.createMenuUI();
        this.createSettingsUI();
        this.createStatsPanel();
        this.createSkillsPanel();
        this.createMapSelectionPanel();
        this.createPlayMenuPanel();
        this.startAnimations();
        this.setupCanvasPointerEventsProtection();
        this.setupGlobalEventBlocking();
        this.setupFullscreenListener();
    }
    
    private setupFullscreenListener(): void {
        // Слушаем изменения полноэкранного режима для обновления кнопки
        document.addEventListener("fullscreenchange", () => {
            const isFullscreen = !!document.fullscreenElement;
            this.syncFullscreenState(isFullscreen);
        });
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
        const panels = [this.mapSelectionPanel, this.statsPanel, this.skillsPanel, this.settingsPanel];
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
        // Немедленное обновление при первой установке (без анимации)
        this.updatePlayerInfo(true);
        
        // Также обновляем через небольшую задержку для гарантии (на случай если DOM еще не готов)
        setTimeout(() => {
            this.updatePlayerInfo(true);
        }, 100);
        
        // Обновляем панель навыков, если она видима
        if (this.skillsPanel && this.skillsPanel.classList.contains("visible")) {
            this.updateSkillsPanel();
        }
        
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
    
    setGarage(garage: Garage): void {
        // Replace menu garage with game garage (which has proper scene and systems)
        if (this.garage && this.garageScene) {
            // Cleanup old garage scene
            try {
                if (this.garage.isGarageOpen()) {
                    this.garage.close(); // Close if open
                }
                this.garageScene.dispose();
                if (this.garageScene.getEngine()) {
                    this.garageScene.getEngine().dispose();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
        this.garage = garage;
        debugLog("[Menu] Garage replaced with game garage");
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
                    <div class="version">${VERSION}</div>
                </div>
                
                <!-- Scrollable область от блока опыта до блока управления -->
                <div class="menu-scrollable">
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
                    <!-- Кнопки для паузы (видны только во время игры) -->
                    <div class="pause-buttons" id="pause-buttons" style="display: none;">
                        <div class="btn-row">
                            <button class="menu-btn secondary" id="btn-resume">
                                <span class="btn-icon">▶</span>
                                <span class="btn-label">ПРОДОЛЖИТЬ</span>
                            </button>
                            <button class="menu-btn secondary" id="btn-restart">
                                <span class="btn-icon">🔄</span>
                                <span class="btn-label">ПЕРЕЗАГРУЗИТЬ</span>
                            </button>
                            <button class="menu-btn danger" id="btn-exit-battle">
                                <span class="btn-icon">🚪</span>
                                <span class="btn-label">ВЫЙТИ ИЗ БОЯ</span>
                            </button>
                        </div>
                    </div>
                    <!-- Кнопки для главного меню (видны только когда игра не запущена) -->
                    <div class="main-buttons" id="main-buttons">
                        <div class="btn-row">
                            <button class="menu-btn play-btn" id="btn-play">
                                <span class="btn-icon">▶</span>
                                <span class="btn-label">${L.play || "ИГРАТЬ"}</span>
                            </button>
                            <button class="menu-btn secondary" id="btn-quick-start">
                                <span class="btn-icon">⚡</span>
                                <span class="btn-label">${L.quickStart || "БЫСТРЫЙ СТАРТ"}</span>
                            </button>
                        </div>
                    </div>
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
                    <button class="menu-btn fullscreen-btn" id="btn-fullscreen">
                        <span class="btn-icon" id="fullscreen-icon">⛶</span>
                        <span class="btn-label" id="fullscreen-label">${L.fullscreen}</span>
                    </button>
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
                                    <span class="key">&uarr; &darr; &larr; &rarr;</span>
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
                                <div class="control-item">
                                    <span class="key">Q / E</span>
                                    <span class="control-desc">${L.rotateTurret}</span>
                            </div>
                                <div class="control-item">
                                    <span class="key">МЫШЬ</span>
                                    <span class="control-desc">${L.freeLook}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">КОЛЕСО</span>
                                    <span class="control-desc">${L.zoom}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">📡 ${L.comms}</div>
                                <div class="control-item">
                                    <span class="key">Enter</span>
                                    <span class="control-desc">${L.generalChat}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">T</span>
                                    <span class="control-desc">${L.teamChat}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">V</span>
                                    <span class="control-desc">${L.voicePTT}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">J</span>
                                    <span class="control-desc">${L.voiceToggle}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">M</span>
                                    <span class="control-desc">${L.voiceMenu}</span>
                                </div>
                            </div>
                            <div class="control-category">
                                <div class="category-header">🛠 ${L.admin}</div>
                                <div class="control-item">
                                    <span class="key">F2</span>
                                    <span class="control-desc">${L.adminF2}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F3</span>
                                    <span class="control-desc">${L.adminF3}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F4</span>
                                    <span class="control-desc">${L.adminF4}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F6</span>
                                    <span class="control-desc">${L.adminF6}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F7</span>
                                    <span class="control-desc">${L.adminF7}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </div><!-- Конец .menu-scrollable -->
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
                max-width: min(800px, 90vw);
                max-height: 90vh;
                padding: clamp(10px, 2vh, 20px);
                display: flex;
                flex-direction: column;
                gap: clamp(8px, 1.5vh, 15px);
                overflow: hidden; /* Убрали scroll с основного контента */
                pointer-events: auto !important;
            }
            
            /* Scrollable область: от блока опыта до блока управления */
            .menu-scrollable {
                display: flex;
                flex-direction: column;
                gap: clamp(8px, 1.5vh, 15px);
                overflow-y: auto;
                flex: 1;
                min-height: 0; /* Важно для flex scroll */
                margin-right: -15px; /* Сдвигаем скроллбар правее */
                padding-right: 15px; /* Компенсируем отступ для контента */
            }
            
            .menu-scrollable,
            .panel-content,
            .skill-tree-wrapper {
                scrollbar-width: thin;
                scrollbar-color: #0f0 rgba(0,255,80,0.08);
            }
            
            .menu-scrollable::-webkit-scrollbar,
            .panel-content::-webkit-scrollbar,
            .skill-tree-wrapper::-webkit-scrollbar {
                width: clamp(6px, 0.5vw, 8px);
                height: clamp(6px, 0.5vw, 8px);
            }
            
            .menu-scrollable::-webkit-scrollbar-track,
            .panel-content::-webkit-scrollbar-track,
            .skill-tree-wrapper::-webkit-scrollbar-track {
                background: rgba(0,255,80,0.05);
            }
            
            .menu-scrollable::-webkit-scrollbar-thumb,
            .panel-content::-webkit-scrollbar-thumb,
            .skill-tree-wrapper::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #0f0, #6f6);
                box-shadow: 0 0 8px rgba(0,255,80,0.6);
            }
            
            /* Скрываем полосы прокрутки у древа навыков визуально, оставляя скролл жестами */
            .skill-tree-wrapper {
                scrollbar-width: none;
            }
            
            .skill-tree-wrapper::-webkit-scrollbar {
                display: none;
            }

            .skill-tree-wrapper.dragging {
                cursor: grabbing;
            }
            
            .menu-header {
                margin-bottom: 10px;
            }
            
            .logo-text {
                font-size: clamp(20px, 3vw, 32px);
                color: #0f0;
                letter-spacing: clamp(2px, 0.3vw, 4px);
                margin-bottom: clamp(4px, 0.8vh, 8px);
                text-shadow: 0 0 6px #0f0, 0 0 10px #0f0;
            }
            
            .logo-text .accent {
                color: #0f0;
            }
            
            .menu-subtitle {
                font-size: clamp(8px, 1vw, 10px);
                color: #0a0;
                letter-spacing: clamp(2px, 0.3vw, 4px);
            }
            
            .player-card {
                background: rgba(0, 30, 0, 0.8);
                border: 2px solid #0f0;
                padding: clamp(10px, 1.5vh, 15px);
                margin-bottom: clamp(5px, 1vh, 10px);
            }
            
            .player-level-row {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 10px;
            }
            
            .level-badge {
                width: clamp(40px, 5vw, 50px);
                height: clamp(40px, 5vw, 50px);
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-size: clamp(16px, 2vw, 20px);
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
                width: 100%;
            }
            
            .main-buttons,
            .pause-buttons {
                width: 100%;
            }
            
            .btn-row {
                display: flex;
                gap: 10px;
                width: 100%;
            }
            
            .btn-row .menu-btn {
                flex: 1 1 0; /* Равное распределение ширины */
                min-width: 0; /* Позволяет сжиматься */
            }
            
            .menu-btn {
                flex: 1;
                padding: clamp(10px, 1.5vh, 15px) clamp(15px, 2vw, 20px);
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(10px, 1.2vw, 12px);
                background: #000;
                color: #0f0;
                border: 2px solid #0f0;
                cursor: pointer !important;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: clamp(5px, 1vw, 10px);
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
                /* Размеры такие же как у других кнопок для симметрии */
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }
            
            .menu-btn.fullscreen-btn {
                width: 100%;
                padding: 12px 20px;
                margin-top: 5px;
                background: rgba(0, 40, 0, 0.6);
                border-color: #0a0;
                font-size: 11px;
            }
            
            .menu-btn.fullscreen-btn:hover {
                background: #0a0;
                border-color: #0f0;
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
                margin-bottom: 0; /* Убираем отступ снизу */
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
                grid-template-columns: repeat(3, minmax(170px, 1fr));
                gap: 10px;
            }
            
            @media (max-width: 900px) {
                .controls-grid { grid-template-columns: repeat(2, minmax(min(150px, 30vw), 1fr)); }
                .logo-text { font-size: clamp(18px, 4vw, 24px); }
                .menu-content { padding: clamp(8px, 1.5vh, 10px); }
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
                color: #0a0;
                font-size: 7px;
                margin-top: 4px;
                text-align: center;
                opacity: 0.8;
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
            /* Fix top anchor for settings panel so content doesn't shift vertically when tabs change */
            #settings-panel.panel-overlay {
                align-items: flex-start !important;
                padding-top: 40px !important;
            }
            
            .panel-content {
                background: #000;
                border: 2px solid #0f0;
                padding: 25px;
                max-width: min(90vw, 1600px);
                max-height: min(90vh, 900px);
                width: min(90vw, 1600px);
                overflow-y: auto;
                position: relative;
                font-family: 'Press Start 2P', monospace;
            }
            
            /* Меню навыков должно быть ещё шире */
            #skills-panel .panel-content {
                max-width: min(95vw, 1700px);
                width: min(95vw, 1700px);
                max-height: min(95vh, 956px);
            }
            
            .panel-title {
                font-size: 16px;
                color: #0f0;
                text-align: center;
                margin-bottom: 20px;
                text-shadow: 0 0 10px #0f0;
            }
            
            .play-menu-section {
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 8px;
                border: 1px solid rgba(90, 170, 136, 0.3);
            }
            
            .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #5a8;
                text-transform: uppercase;
            }
            
            .mode-buttons, .map-buttons, .tank-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            /* Многослойные окна шагов */
            .play-window {
                position: absolute;
                top: 40px;
                left: 40px;
                right: 40px;
                padding: 0 20px 20px 20px;
                background: rgba(0, 0, 0, 0.92);
                border: 2px solid #0f0;
                box-shadow: 10px 10px 0 rgba(0, 255, 0, 0.25);
                border-radius: 8px;
                display: none;
                flex-direction: column;
                gap: 12px;
                z-index: 100002;
                pointer-events: auto;
                overflow: hidden;
            }

            .play-window.visible {
                display: flex !important;
            }

            .play-window-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 0 6px 0;
                border-bottom: 1px solid rgba(0,255,0,0.25);
                font-family: "Consolas","SFMono-Regular",monospace;
                color: #0f0;
            }

            .play-window-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 700;
                letter-spacing: 0.5px;
            }

            .window-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .window-btn {
                width: 26px;
                height: 26px;
                border: 1px solid #0f0;
                background: rgba(0,0,0,0.4);
                color: #0f0;
                cursor: pointer;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                transition: all 0.15s ease;
            }

            .window-btn:hover {
                background: rgba(0,255,0,0.1);
                box-shadow: 0 0 6px rgba(0,255,0,0.4);
            }
            
            .play-menu-section {
                margin-bottom: 30px;
                padding: 20px;
                background: rgba(0, 0, 0, 0.4);
                border-radius: 8px;
                border: 1px solid rgba(90, 170, 136, 0.3);
            }
            
            .section-title {
                font-size: 18px;
                font-weight: bold;
                margin-bottom: 15px;
                color: #5a8;
                text-transform: uppercase;
            }
            
            .mode-buttons, .map-buttons, .tank-options {
                display: flex;
                flex-direction: column;
                gap: 10px;
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
                font-family: 'Press Start 2P', 'Courier New', monospace;
                letter-spacing: 0.5px;
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
            
            .setting-select {
                background: rgba(0, 0, 0, 0.6);
                color: #0f0;
                border: 1px solid #0a0;
                border-radius: 4px;
                padding: 5px 10px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                cursor: pointer;
                min-width: 100px;
            }
            
            .setting-select:hover {
                border-color: #0f0;
                background: rgba(0, 50, 0, 0.6);
            }
            
            .setting-select option {
                background: #0a0a0a;
                color: #0f0;
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
            
            /* Seed control */
            .seed-control {
                display: flex;
                gap: 5px;
                align-items: center;
            }
            
            .seed-input {
                width: 120px;
                padding: 6px 8px;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                background: rgba(0, 20, 0, 0.9);
                color: #0f0;
                border: 2px solid #0a0;
                outline: none;
            }
            
            .seed-input:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .seed-input:focus {
                border-color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }
            
            .seed-btn {
                padding: 6px 10px;
                font-size: 14px;
                background: rgba(0, 40, 0, 0.8);
                color: #0f0;
                border: 2px solid #0a0;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .seed-btn:hover {
                background: rgba(0, 80, 0, 0.8);
                border-color: #0f0;
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
            
            .menu-btn.danger {
                background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
                border: 2px solid #ff6666;
                color: #fff;
            }
            
            .menu-btn.danger:hover {
                background: linear-gradient(135deg, #ff6666 0%, #ff0000 100%);
                border-color: #ff8888;
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(255, 68, 68, 0.4);
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
            
            /* Skills Panel - Tree */
            .skill-tree-wrapper {
                margin-top: 10px;
                background: linear-gradient(180deg, #062106, #020);
                border: 1px solid #0f0;
                padding: 16px;
                max-height: 72vh;
                overflow: auto;
                box-shadow: 0 0 20px rgba(0,255,100,0.15);
                cursor: grab;
            }

            .skill-tree-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                margin-bottom: 12px;
            }

            .skill-points-pill {
                padding: 8px 12px;
                background: rgba(0,255,140,0.12);
                border: 1px solid #0f0;
                color: #9f9;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                box-shadow: 0 0 12px rgba(0,255,80,0.2);
            }

            .skill-tree-legend {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                font-size: 9px;
                color: #7f7;
            }

            .skill-tree-legend span {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 8px;
                border: 1px solid #0f0;
                background: #041004;
            }

            .skill-tree {
                position: relative;
                min-height: 640px;
                min-width: 1100px;
                background-image: linear-gradient(90deg, rgba(0,255,120,0.05) 1px, transparent 1px);
                background-repeat: repeat;
                background-size: 160px 1px;
                padding: 12px;
                border: 1px solid rgba(0,255,80,0.35);
            }

            .skill-node {
                position: absolute;
                width: 220px;
                min-height: 120px;
                padding: 12px;
                background: #031003;
                border: 1px solid #0f0;
                box-shadow:
                    0 0 12px rgba(0,255,100,0.25),
                    inset 0 0 12px rgba(0,255,60,0.08);
                display: flex;
                flex-direction: column;
                gap: 6px;
                z-index: 2;
            }

            .skill-node.is-hub {
                background: linear-gradient(180deg, rgba(0,255,120,0.2), #021);
            }

            .skill-node.is-meta {
                border-color: #5cf;
                box-shadow:
                    0 0 14px rgba(90,220,255,0.3),
                    inset 0 0 14px rgba(90,220,255,0.15);
            }

            .skill-node.is-locked {
                opacity: 0.5;
                filter: grayscale(0.7);
                border-color: #333 !important;
            }

            .skill-module-info {
                font-size: 9px;
                color: #0ff;
                padding: 4px 6px;
                background: rgba(0,255,255,0.1);
                border: 1px solid rgba(0,255,255,0.3);
                margin-top: 4px;
            }

            .skill-module-info.locked {
                color: #666;
                background: rgba(100,100,100,0.1);
                border-color: rgba(100,100,100,0.3);
            }

            .skill-cost {
                font-size: 8px;
                color: #fa0;
                margin-left: 8px;
            }

            .skill-effects {
                font-size: 8px;
                color: #7f7;
                margin-top: 4px;
                line-height: 1.4;
            }

            .skill-zoom-controls {
                position: absolute;
                top: 10px;
                right: 10px;
                display: flex;
                align-items: center;
                gap: 6px;
                z-index: 1000;
                background: rgba(0,0,0,0.8);
                border: 1px solid #0f0;
                padding: 6px 10px;
                border-radius: 4px;
            }

            .skill-zoom-btn {
                width: 28px;
                height: 28px;
                background: #000;
                border: 1px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.15s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .skill-zoom-btn:hover {
                background: #0f0;
                color: #000;
            }

            .skill-zoom-level {
                font-size: 9px;
                color: #0f0;
                min-width: 40px;
                text-align: center;
            }

            .skill-tree {
                /* Transition убран - используем JS анимацию для плавности */
            }

            .skill-node-header {
                display: flex;
                align-items: center;
                gap: 8px;
                justify-content: space-between;
            }

            .skill-node-icon {
                font-size: 20px;
                width: 28px;
            }
            
            .skill-node-title {
                flex: 1;
                font-size: 11px;
                color: #0f0;
                letter-spacing: 0.5px;
            }

            .skill-node-badge {
                font-size: 9px;
                padding: 4px 6px;
                border: 1px solid currentColor;
                color: #9f9;
                background: rgba(0,255,120,0.1);
                text-transform: uppercase;
            }

            .skill-node-desc {
                font-size: 9px;
                line-height: 1.4;
                color: #8f8;
                opacity: 0.9;
            }

            .skill-node-meta {
                font-size: 9px;
                color: #5cf;
                opacity: 0.9;
            }

            .skill-node-level {
                font-size: 10px;
                color: #0f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .skill-meter {
                display: grid;
                grid-template-columns: repeat(10, 1fr);
                gap: 3px;
            }
            
            .skill-pip {
                height: 8px;
                background: #021;
                border: 1px solid #0f0;
            }
            
            .skill-pip.filled {
                background: linear-gradient(90deg, #0f0, #7f7);
                box-shadow: 0 0 6px rgba(0,255,80,0.6);
            }
            
            .skill-upgrade-btn {
                padding: 10px;
                background: #000;
                border: 2px solid #0f0;
                color: #0f0;
                font-family: 'Press Start 2P', monospace;
                font-size: 9px;
                cursor: pointer;
                transition: all 0.15s;
                text-transform: uppercase;
            }
            
            .skill-upgrade-btn:hover:not(:disabled) {
                background: #0f0;
                color: #000;
                box-shadow: 0 0 12px rgba(0,255,80,0.6);
            }
            
            .skill-upgrade-btn:disabled {
                opacity: 0.25;
                cursor: not-allowed;
            }

            .skill-connector {
                position: absolute;
                background: #0f0;
                z-index: 1;
                box-shadow: 0 0 8px rgba(0,255,80,0.4);
            }

            .skill-connector.h {
                height: 2px;
            }

            .skill-connector.v {
                width: 2px;
            }

            .skill-connectors-svg {
                position: absolute;
                top: 0;
                left: 0;
                pointer-events: none;
                z-index: 1;
            }

            .skill-connectors-svg path {
                filter: drop-shadow(0 0 4px rgba(0,255,80,0.6));
            }

            .skill-empty {
                color: #8f8;
                font-size: 11px;
                padding: 24px;
                text-align: center;
                border: 1px dashed rgba(0,255,80,0.4);
                background: rgba(0,40,0,0.5);
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
                { id: "btn-play", handler: () => this.showPlayMenu() },
                { id: "btn-quick-start", handler: () => this.quickStart() },
                { id: "btn-garage", handler: () => this.showGarage() },
                { id: "btn-skills", handler: () => this.showSkills() },
                { id: "btn-stats", handler: () => this.showStats() },
                { id: "btn-settings", handler: () => this.showSettings() },
                { id: "btn-fullscreen", handler: () => this.toggleFullscreen() },
                { id: "btn-resume", handler: () => this.resumeGame() },
                { id: "btn-restart", handler: () => this.restartGame() },
                { id: "btn-exit-battle", handler: () => this.exitBattle() }
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
                case "btn-play":
                    debugLog("[Menu] Showing play menu");
                    this.showPlayMenu();
                    break;
                case "btn-quick-start":
                    debugLog("[Menu] Quick start");
                    this.quickStart();
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
                case "btn-fullscreen":
                    debugLog("[Menu] Toggle fullscreen");
                    this.toggleFullscreen();
                    break;
                // === КНОПКИ ПАУЗЫ ===
                case "btn-resume":
                    debugLog("[Menu] Resume game");
                    this.resumeGame();
                    break;
                case "btn-restart":
                    debugLog("[Menu] Restart game");
                    this.restartGame();
                    break;
                case "btn-exit-battle":
                    debugLog("[Menu] Exit battle");
                    this.exitBattle();
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
    
    private updatePlayerInfo(immediate: boolean = false): void {
        if (!this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        
        const levelBadge = document.getElementById("level-badge");
        if (levelBadge) levelBadge.textContent = stats.level.toString();
        
        // Плавная анимация XP-бара (или немедленное обновление)
        const xpBar = document.getElementById("xp-bar") as HTMLElement;
        if (xpBar) {
            const targetPercent = xpProgress.percent;
            
            if (immediate) {
                // Немедленное обновление без анимации (при первой загрузке)
                xpBar.style.width = `${targetPercent}%`;
                xpBar.style.transition = "none";
            } else {
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
        // Первое немедленное обновление при старте (если playerProgression уже установлен)
        if (this.playerProgression) {
            setTimeout(() => {
                this.updatePlayerInfo(true);
            }, 0);
        }
        
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
                
                <div class="settings-tabs" style="display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 1px solid #444;">
                    <button class="settings-tab active" data-tab="general">Общие</button>
                    <button class="settings-tab" data-tab="graphics">Графика</button>
                    <button class="settings-tab" data-tab="audio">Аудио</button>
                    <button class="settings-tab" data-tab="controls">Управление</button>
                    <button class="settings-tab" data-tab="gameplay">Игровой процесс</button>
                    <button class="settings-tab" data-tab="camera">Камера</button>
                    <button class="settings-tab" data-tab="network">Сеть</button>
                    <button class="settings-tab" data-tab="accessibility">Доступность</button>
                    <button class="settings-tab" data-tab="advanced">Дополнительно</button>
                </div>
                
                <div id="settings-content">
                    <!-- General Tab -->
                    <div class="settings-tab-content active" data-content="general">
                        <div class="setting-row">
                            <span class="setting-label">${L.language}</span>
                            <div class="setting-value lang-toggle">
                                <button class="lang-btn ${this.settings.language === 'ru' ? 'active' : ''}" id="lang-ru">RU</button>
                                <button class="lang-btn ${this.settings.language === 'en' ? 'active' : ''}" id="lang-en">EN</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.enemyDifficulty}</span>
                            <div class="setting-value difficulty-selector">
                                <button class="diff-btn ${this.settings.enemyDifficulty === 'easy' ? 'active' : ''}" id="diff-easy" data-diff="easy">${L.diffEasy}</button>
                                <button class="diff-btn ${this.settings.enemyDifficulty === 'medium' ? 'active' : ''}" id="diff-medium" data-diff="medium">${L.diffMedium}</button>
                                <button class="diff-btn ${this.settings.enemyDifficulty === 'hard' ? 'active' : ''}" id="diff-hard" data-diff="hard">${L.diffHard}</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.worldSeed}</span>
                            <div class="setting-value seed-control">
                                <input type="number" class="seed-input" id="set-seed" value="${this.settings.worldSeed}" ${this.settings.useRandomSeed ? 'disabled' : ''}>
                                <button class="seed-btn" id="seed-copy" title="${L.copySeed}">📋</button>
                                <button class="seed-btn" id="seed-random" title="${L.randomSeed}">🎲</button>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.randomSeed}</span>
                            <input type="checkbox" class="setting-checkbox" id="set-random-seed" ${this.settings.useRandomSeed ? 'checked' : ''}>
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
                            <span class="setting-label">Показывать числа урона</span>
                            <input type="checkbox" class="setting-checkbox" id="set-damage-numbers" ${this.settings.showDamageNumbers ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Помощь при прицеливании</span>
                            <input type="checkbox" class="setting-checkbox" id="set-aim-assist" ${this.settings.aimAssist ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Размер интерфейса</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-ui-scale" min="50" max="150" step="5" value="${Math.round((this.settings.uiScale || 1) * 100)}">
                                <span id="set-ui-scale-val">${Math.round((this.settings.uiScale || 1) * 100)}%</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Graphics Tab -->
                    <div class="settings-tab-content" data-content="graphics">
                        <div class="setting-row">
                            <span class="setting-label">Качество графики</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-graphics">
                                    <option value="0" ${this.settings.graphicsQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.graphicsQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.graphicsQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
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
                            <span class="setting-label">Качество частиц</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-particle-quality">
                                    <option value="0" ${this.settings.particleQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.particleQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.particleQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество теней</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-shadow-quality">
                                    <option value="0" ${this.settings.shadowQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.shadowQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.shadowQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество текстур</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-texture-quality">
                                    <option value="0" ${this.settings.textureQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.textureQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.textureQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество освещения</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-lighting-quality">
                                    <option value="0" ${this.settings.lightingQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.lightingQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.lightingQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Сглаживание (AA)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-anti-aliasing" ${this.settings.antiAliasing ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Эффект свечения (Bloom)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-bloom" ${this.settings.bloom ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Размытие движения</span>
                            <input type="checkbox" class="setting-checkbox" id="set-motion-blur" ${this.settings.motionBlur ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">VSync</span>
                            <input type="checkbox" class="setting-checkbox" id="set-vsync" ${this.settings.vsync ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Полноэкранный режим</span>
                            <input type="checkbox" class="setting-checkbox" id="set-fullscreen" ${this.settings.fullscreen ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Ограничение FPS</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-max-fps" min="0" max="240" step="30" value="${this.settings.maxFPS}">
                                <span id="set-max-fps-val">${this.settings.maxFPS === 0 ? 'Без ограничений' : this.settings.maxFPS}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Audio Tab -->
                    <div class="settings-tab-content" data-content="audio">
                        <div class="setting-row">
                            <span class="setting-label">Общая громкость</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-master-volume" min="0" max="100" value="${this.settings.masterVolume}">
                                <span id="set-master-volume-val">${this.settings.masterVolume}%</span>
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
                            <span class="setting-label">Громкость окружения</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-ambient-volume" min="0" max="100" value="${this.settings.ambientVolume}">
                                <span id="set-ambient-volume-val">${this.settings.ambientVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Громкость голоса</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-voice-volume" min="0" max="100" value="${this.settings.voiceVolume}">
                                <span id="set-voice-volume-val">${this.settings.voiceVolume}%</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Отключить звук при потере фокуса</span>
                            <input type="checkbox" class="setting-checkbox" id="set-mute-on-focus-loss" ${this.settings.muteOnFocusLoss ? 'checked' : ''}>
                        </div>
                    </div>
                    
                    <!-- Controls Tab -->
                    <div class="settings-tab-content" data-content="controls">
                        <div class="setting-row">
                            <span class="setting-label">Чувствительность мыши</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-mouse" min="1" max="10" value="${this.settings.mouseSensitivity}">
                                <span id="set-mouse-val">${this.settings.mouseSensitivity}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Инверсия мыши по Y</span>
                            <input type="checkbox" class="setting-checkbox" id="set-invert-mouse-y" ${this.settings.invertMouseY ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Раскладка клавиатуры</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-keyboard-layout">
                                    <option value="qwerty" ${this.settings.keyboardLayout === 'qwerty' ? 'selected' : ''}>QWERTY</option>
                                    <option value="azerty" ${this.settings.keyboardLayout === 'azerty' ? 'selected' : ''}>AZERTY</option>
                                    <option value="qwertz" ${this.settings.keyboardLayout === 'qwertz' ? 'selected' : ''}>QWERTZ</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Автоматическая перезарядка</span>
                            <input type="checkbox" class="setting-checkbox" id="set-auto-reload" ${this.settings.autoReload ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Удержание для прицеливания</span>
                            <input type="checkbox" class="setting-checkbox" id="set-hold-to-aim" ${this.settings.holdToAim ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Виртуальная фиксация башни</span>
                            <input type="checkbox" class="setting-checkbox" id="set-virtual-fixation" ${this.settings.virtualTurretFixation ? 'checked' : ''}>
                        </div>
                    </div>
                    
                    <!-- Gameplay Tab -->
                    <div class="settings-tab-content" data-content="gameplay">
                        <div class="setting-row">
                            <span class="setting-label">Показывать обучение</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-tutorial" ${this.settings.showTutorial ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать подсказки</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-hints" ${this.settings.showHints ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать прицел</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-crosshair" ${this.settings.showCrosshair ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Стиль прицела</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-crosshair-style">
                                    <option value="default" ${this.settings.crosshairStyle === 'default' ? 'selected' : ''}>По умолчанию</option>
                                    <option value="dot" ${this.settings.crosshairStyle === 'dot' ? 'selected' : ''}>Точка</option>
                                    <option value="cross" ${this.settings.crosshairStyle === 'cross' ? 'selected' : ''}>Крест</option>
                                    <option value="circle" ${this.settings.crosshairStyle === 'circle' ? 'selected' : ''}>Круг</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать полоску здоровья</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-health-bar" ${this.settings.showHealthBar ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать счетчик патронов</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-ammo-counter" ${this.settings.showAmmoCounter ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Автосохранение</span>
                            <input type="checkbox" class="setting-checkbox" id="set-auto-save" ${this.settings.autoSave ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Интервал автосохранения (сек)</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-auto-save-interval" min="60" max="600" step="60" value="${this.settings.autoSaveInterval}">
                                <span id="set-auto-save-interval-val">${this.settings.autoSaveInterval}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Camera Tab -->
                    <div class="settings-tab-content" data-content="camera">
                        <div class="setting-row">
                            <span class="setting-label">Расстояние камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-dist" min="5" max="25" value="${this.settings.cameraDistance}">
                                <span id="set-camera-dist-val">${this.settings.cameraDistance}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Высота камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-height" min="3" max="10" step="0.5" value="${this.settings.cameraHeight}">
                                <span id="set-camera-height-val">${this.settings.cameraHeight}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Поле зрения (FOV)</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-fov" min="45" max="90" value="${this.settings.cameraFOV}">
                                <span id="set-camera-fov-val">${this.settings.cameraFOV}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Сглаживание камеры</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-smoothing" min="0" max="1" step="0.1" value="${this.settings.cameraSmoothing}">
                                <span id="set-camera-smoothing-val">${this.settings.cameraSmoothing}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Тряска экрана</span>
                            <input type="checkbox" class="setting-checkbox" id="set-screen-shake" ${this.settings.screenShake ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Интенсивность тряски</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-camera-shake-intensity" min="0" max="1" step="0.1" value="${this.settings.cameraShakeIntensity}">
                                <span id="set-camera-shake-intensity-val">${this.settings.cameraShakeIntensity}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Режим от первого лица</span>
                            <input type="checkbox" class="setting-checkbox" id="set-first-person-mode" ${this.settings.firstPersonMode ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">FOV прицеливания</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-aim-fov" min="0.1" max="1" step="0.1" value="${this.settings.aimFOV}">
                                <span id="set-aim-fov-val">${this.settings.aimFOV}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Network Tab -->
                    <div class="settings-tab-content" data-content="network">
                        <div class="setting-row">
                            <span class="setting-label">Показывать пинг</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-ping" ${this.settings.showPing ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Показывать сетевую статистику</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-network-stats" ${this.settings.showNetworkStats ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Качество сети</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-network-quality">
                                    <option value="0" ${this.settings.networkQuality === 0 ? 'selected' : ''}>Низкое</option>
                                    <option value="1" ${this.settings.networkQuality === 1 ? 'selected' : ''}>Среднее</option>
                                    <option value="2" ${this.settings.networkQuality === 2 ? 'selected' : ''}>Высокое</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Accessibility Tab -->
                    <div class="settings-tab-content" data-content="accessibility">
                        <div class="setting-row">
                            <span class="setting-label">Режим для дальтоников</span>
                            <div class="setting-value">
                                <select class="setting-select" id="set-color-blind-mode">
                                    <option value="none" ${this.settings.colorBlindMode === 'none' ? 'selected' : ''}>Отключено</option>
                                    <option value="protanopia" ${this.settings.colorBlindMode === 'protanopia' ? 'selected' : ''}>Протанопия</option>
                                    <option value="deuteranopia" ${this.settings.colorBlindMode === 'deuteranopia' ? 'selected' : ''}>Дейтеранопия</option>
                                    <option value="tritanopia" ${this.settings.colorBlindMode === 'tritanopia' ? 'selected' : ''}>Тританопия</option>
                                </select>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Размер шрифта</span>
                            <div class="setting-value">
                                <input type="range" class="setting-range" id="set-font-size" min="10" max="24" value="${this.settings.fontSize}">
                                <span id="set-font-size-val">${this.settings.fontSize}</span>
                            </div>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Высокий контраст</span>
                            <input type="checkbox" class="setting-checkbox" id="set-high-contrast" ${this.settings.highContrast ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Субтитры</span>
                            <input type="checkbox" class="setting-checkbox" id="set-subtitles" ${this.settings.subtitles ? 'checked' : ''}>
                        </div>
                    </div>
                    
                    <!-- Advanced Tab -->
                    <div class="settings-tab-content" data-content="advanced">
                        <div class="setting-row">
                            <span class="setting-label">Показывать отладочную информацию</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-debug-info" ${this.settings.showDebugInfo ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">Включить читы (для разработки)</span>
                            <input type="checkbox" class="setting-checkbox" id="set-enable-cheats" ${this.settings.enableCheats ? 'checked' : ''}>
                        </div>
                        <div class="setting-row">
                            <span class="setting-label">${L.openCheatMenu}</span>
                            <div class="setting-value">
                                <button class="panel-btn secondary" id="open-cheat-menu">F7</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="panel-buttons" style="margin-top: 20px;">
                    <button class="panel-btn primary" id="settings-save">Сохранить</button>
                    <button class="panel-btn danger" id="settings-reset">Сброс</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.settingsPanel);
        
        // Add CSS for tabs
        const style = document.createElement("style");
        style.textContent = `
            .settings-tabs {
                display: flex;
                gap: 5px;
                margin-bottom: 20px;
                border-bottom: 1px solid #444;
                flex-wrap: wrap;
            }
            .settings-tab {
                padding: 8px 16px;
                background: #2a2a2a;
                border: none;
                color: #aaa;
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: all 0.2s;
                font-family: 'Press Start 2P', 'Courier New', monospace;
                font-size: 11px;
                letter-spacing: 0.5px;
            }
            .settings-tab:hover {
                background: #333;
                color: #fff;
            }
            .settings-tab.active {
                color: #5a8;
                border-bottom-color: #5a8;
                background: #1a1a1a;
            }
            .settings-tab-content {
                display: none;
            }
            .settings-tab-content.active {
                display: block;
            }
        `;
        document.head.appendChild(style);
        
        this.setupPanelCloseOnBackground(this.settingsPanel, () => this.hideSettings());
        
        // Tab switching
        document.querySelectorAll(".settings-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab;
                document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
                document.querySelectorAll(".settings-tab-content").forEach(c => c.classList.remove("active"));
                tab.classList.add("active");
                document.querySelector(`[data-content="${tabName}"]`)?.classList.add("active");
            });
        });
        
        const setupSlider = (id: string, valId: string, suffix: string = "", formatter?: (val: string) => string) => {
            const slider = document.getElementById(id) as HTMLInputElement;
            const val = document.getElementById(valId);
            slider?.addEventListener("input", () => {
                if (val) {
                    val.textContent = formatter ? formatter(slider.value) : slider.value + suffix;
                }
            });
        };
        
        setupSlider("set-render", "set-render-val");
        setupSlider("set-sound", "set-sound-val", "%");
        setupSlider("set-music", "set-music-val", "%");
        setupSlider("set-mouse", "set-mouse-val");
        setupSlider("set-camera-dist", "set-camera-dist-val");
        setupSlider("set-camera-height", "set-camera-height-val");
        setupSlider("set-camera-fov", "set-camera-fov-val");
        setupSlider("set-camera-smoothing", "set-camera-smoothing-val");
        setupSlider("set-camera-shake-intensity", "set-camera-shake-intensity-val");
        setupSlider("set-ui-scale", "set-ui-scale-val", "%");
        setupSlider("set-aim-fov", "set-aim-fov-val");
        setupSlider("set-master-volume", "set-master-volume-val", "%");
        setupSlider("set-ambient-volume", "set-ambient-volume-val", "%");
        setupSlider("set-voice-volume", "set-voice-volume-val", "%");
        setupSlider("set-auto-save-interval", "set-auto-save-interval-val");
        setupSlider("set-font-size", "set-font-size-val");
        setupSlider("set-max-fps", "set-max-fps-val", "", (val) => val === "0" ? "Без ограничений" : val);
        
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
                document.querySelectorAll(".diff-btn").forEach(btn => btn.classList.remove("active"));
                document.getElementById(`diff-${diff}`)?.classList.add("active");
            });
        });
        
        // Seed controls
        const seedInput = document.getElementById("set-seed") as HTMLInputElement;
        const randomSeedCheckbox = document.getElementById("set-random-seed") as HTMLInputElement;
        
        randomSeedCheckbox?.addEventListener("change", () => {
            this.settings.useRandomSeed = randomSeedCheckbox.checked;
            if (seedInput) {
                seedInput.disabled = randomSeedCheckbox.checked;
                if (randomSeedCheckbox.checked) {
                    const newSeed = Math.floor(Math.random() * 999999999);
                    seedInput.value = newSeed.toString();
                    this.settings.worldSeed = newSeed;
                }
            }
        });
        
        seedInput?.addEventListener("change", () => {
            const value = parseInt(seedInput.value) || 12345;
            this.settings.worldSeed = value;
            seedInput.value = value.toString();
        });
        
        document.getElementById("seed-copy")?.addEventListener("click", () => {
            const seed = this.settings.worldSeed.toString();
            navigator.clipboard.writeText(seed).then(() => {
                const btn = document.getElementById("seed-copy");
                if (btn) {
                    const originalText = btn.textContent;
                    btn.textContent = "✓";
                    setTimeout(() => { btn.textContent = originalText; }, 1000);
                }
            });
        });
        
        document.getElementById("seed-random")?.addEventListener("click", () => {
            const newSeed = Math.floor(Math.random() * 999999999);
            this.settings.worldSeed = newSeed;
            if (seedInput) {
                seedInput.value = newSeed.toString();
            }
        });

        const fullscreenCheckbox = document.getElementById("set-fullscreen") as HTMLInputElement | null;
        fullscreenCheckbox?.addEventListener("change", (e) => {
            const target = e.target as HTMLInputElement;
            this.handleFullscreenCheckbox(!!target?.checked);
        });

        // Open cheat menu button (simulates F7 press)
        const cheatBtn = document.getElementById("open-cheat-menu");
        if (cheatBtn) {
            cheatBtn.addEventListener("click", () => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", code: "F7" }));
            });
        }
        
        document.getElementById("settings-save")?.addEventListener("click", () => {
            this.saveSettingsFromUI();
            this.hideSettings();
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
        this.skillsPanel.innerHTML = createSkillsPanelHTML();
        
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
                
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px; max-height: 70vh; overflow-y: auto; padding-right: 10px; scrollbar-width: thin;">
                    <button class="menu-btn play-btn" id="btn-map-normal" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🗺</span>
                            <span class="btn-label">${L.normalMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.normalMapDesc}</div>
                    </button>
                    <button class="menu-btn secondary" id="btn-map-sandbox" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🏖</span>
                            <span class="btn-label">${L.sandboxMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.sandboxMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-polygon" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🎯</span>
                            <span class="btn-label">${L.polygonMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.polygonMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-frontline" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-label">${L.frontlineMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.frontlineMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-ruins" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🏚</span>
                            <span class="btn-label">${L.ruinsMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.ruinsMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-canyon" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">⛰</span>
                            <span class="btn-label">${L.canyonMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.canyonMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-industrial" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🏭</span>
                            <span class="btn-label">${L.industrialMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.industrialMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-urban_warfare" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🏙</span>
                            <span class="btn-label">${L.urbanWarfareMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.urbanWarfareMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-underground" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🕳</span>
                            <span class="btn-label">${L.undergroundMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.undergroundMapDesc}</div>
                    </button>
                    <button class="menu-btn" id="btn-map-coastal" style="width: 100%; padding: 15px; text-align: left; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="btn-icon">🌊</span>
                            <span class="btn-label">${L.coastalMap}</span>
                        </div>
                        <div style="font-size: 11px; opacity: 0.8; margin-left: 30px;">${L.coastalMapDesc}</div>
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
        
        document.getElementById("btn-map-polygon")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("polygon");
        });
        
        document.getElementById("btn-map-frontline")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("frontline");
        });
        
        document.getElementById("btn-map-ruins")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("ruins");
        });
        
        document.getElementById("btn-map-canyon")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("canyon");
        });
        
        document.getElementById("btn-map-industrial")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("industrial");
        });
        
        document.getElementById("btn-map-urban_warfare")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("urban_warfare");
        });
        
        document.getElementById("btn-map-underground")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("underground");
        });
        
        document.getElementById("btn-map-coastal")?.addEventListener("click", () => {
            this.hide();
            this.hideMapSelection();
            this.onStartGame("coastal");
        });
        
        this.setupCloseButton("map-selection-close", () => this.hideMapSelection());
        this.setupCloseButton("map-selection-back", () => this.hideMapSelection());
        this.setupPanelCloseOnBackground(this.mapSelectionPanel, () => this.hideMapSelection());
    }
    
    private createPlayMenuPanel(): void {
        this.playMenuPanel = document.createElement("div");
        this.playMenuPanel.className = "panel";
        this.playMenuPanel.id = "play-menu-panel";
        const L = getLang(this.settings);
        
        // Загружаем сохраненные выборы
        const savedChassis = localStorage.getItem("selectedChassis") || "medium";
        const savedCannon = localStorage.getItem("selectedCannon") || "standard";
        this.selectedChassis = savedChassis;
        this.selectedCannon = savedCannon;
        
        this.playMenuPanel.innerHTML = `
                <div class="panel-content" style="position: relative; min-height: 70vh;">
                <div class="panel-title">${L.play || "ИГРАТЬ"}</div>
                
                <!-- 1. Выбор режима игры -->
                <div class="play-window" id="play-window-mode" data-order="0" data-step="0" style="display: none;">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/mode</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="0">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="0">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="0">✕</button>
                        </div>
                    </div>
                    <div class="section-title">1. Выбор режима игры</div>
                    <div class="mode-buttons" style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                        <button class="menu-btn play-btn" id="btn-mode-single" data-mode="single">
                            <span class="btn-icon">🎮</span>
                            <span class="btn-label">Одиночная игра</span>
                        </button>
                        <button class="menu-btn play-btn" id="btn-mode-multiplayer" data-mode="multiplayer" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                            <span class="btn-icon">🌐</span>
                            <span class="btn-label">МУЛЬТИПЛЕЕР</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-mode-ffa" data-mode="ffa">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-label">Free-for-All</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-mode-tdm" data-mode="tdm">
                            <span class="btn-icon">👥</span>
                            <span class="btn-label">Team Deathmatch</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-mode-coop" data-mode="coop">
                            <span class="btn-icon">🤝</span>
                            <span class="btn-label">Co-op PvE</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-mode-br" data-mode="battle_royale">
                            <span class="btn-icon">👑</span>
                            <span class="btn-label">Battle Royale</span>
                        </button>
                        <button class="menu-btn secondary" id="btn-mode-ctf" data-mode="ctf">
                            <span class="btn-icon">🚩</span>
                            <span class="btn-label">Capture the Flag</span>
                        </button>
                    </div>
                </div>
                
                <!-- 2. Выбор карты -->
                <div class="play-window" id="play-window-map" data-order="1" data-step="1">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/mode/map</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="1">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="1">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="1">✕</button>
                        </div>
                    </div>
                    <div class="section-title">2. Выбор карты</div>
                    <div class="map-buttons" style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px; max-height: 50vh; overflow-y: auto; scrollbar-width: thin;">
                        <button class="menu-btn play-btn" id="play-btn-map-normal" data-map="normal">
                            <span class="btn-icon">🗺</span>
                            <span class="btn-label">${L.normalMap}</span>
                        </button>
                        <button class="menu-btn secondary" id="play-btn-map-sandbox" data-map="sandbox">
                            <span class="btn-icon">🏖</span>
                            <span class="btn-label">${L.sandboxMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-polygon" data-map="polygon">
                            <span class="btn-icon">🎯</span>
                            <span class="btn-label">${L.polygonMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-frontline" data-map="frontline">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-label">${L.frontlineMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-ruins" data-map="ruins">
                            <span class="btn-icon">🏚</span>
                            <span class="btn-label">${L.ruinsMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-canyon" data-map="canyon">
                            <span class="btn-icon">⛰</span>
                            <span class="btn-label">${L.canyonMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-industrial" data-map="industrial">
                            <span class="btn-icon">🏭</span>
                            <span class="btn-label">${L.industrialMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-urban_warfare" data-map="urban_warfare">
                            <span class="btn-icon">🏙</span>
                            <span class="btn-label">${L.urbanWarfareMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-underground" data-map="underground">
                            <span class="btn-icon">🕳</span>
                            <span class="btn-label">${L.undergroundMap}</span>
                        </button>
                        <button class="menu-btn" id="play-btn-map-coastal" data-map="coastal">
                            <span class="btn-icon">🌊</span>
                            <span class="btn-label">${L.coastalMap}</span>
                        </button>
                    </div>
                </div>
                
                <!-- 3. Выбор танка -->
                <div class="play-window" id="play-window-tank" data-order="2" data-step="2">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/mode/map/preset</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="2">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="2">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="2">✕</button>
                        </div>
                    </div>
                    <div class="section-title">3. Выбор танка</div>
                    
                    <!-- Пресеты танков -->
                    <div style="margin-bottom: 20px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Пресет танка:</div>
                        <div class="preset-buttons" style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="menu-btn play-btn" id="preset-balanced" data-preset="balanced">
                                <span class="btn-label">⚖️ Баланс</span>
                            </button>
                            <button class="menu-btn secondary" id="preset-speed" data-preset="speed">
                                <span class="btn-label">⚡ Скорость</span>
                            </button>
                            <button class="menu-btn secondary" id="preset-defense" data-preset="defense">
                                <span class="btn-label">🛡️ Защита</span>
                            </button>
                            <button class="menu-btn secondary" id="preset-damage" data-preset="damage">
                                <span class="btn-label">💥 Урон</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Детальный выбор -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                        <div>
                            <div style="font-weight: bold; margin-bottom: 10px;">Корпус:</div>
                            <div class="tank-options" id="chassis-options" style="display: flex; flex-direction: column; gap: 8px;">
                                <!-- Заполнится динамически -->
                            </div>
                        </div>
                        <div>
                            <div style="font-weight: bold; margin-bottom: 10px;">Пушка:</div>
                            <div class="tank-options" id="cannon-options" style="display: flex; flex-direction: column; gap: 8px;">
                                <!-- Заполнится динамически -->
                            </div>
                        </div>
                    </div>
                    
                    <!-- Кнопки действий -->
                    <div class="panel-buttons" style="margin-top: 20px; display: flex; gap: 10px;">
                        <button class="panel-btn" id="btn-tank-garage" style="flex: 1;">⚙️ ГАРАЖ</button>
                        <button class="panel-btn primary" id="btn-start-game" style="flex: 2;">В БОЙ!</button>
                    </div>
                </div>
                
                
                <!-- Кнопка назад -->
                <div class="panel-buttons" style="margin-top: 20px;">
                    <button class="panel-btn" id="play-menu-back">Назад</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.playMenuPanel);
        
        // Заполняем опции танков
        this.populateTankOptions();
        
        // Обработчики выбора режима
        document.getElementById("btn-mode-single")?.addEventListener("click", () => this.selectGameMode("single"));
        document.getElementById("btn-mode-ffa")?.addEventListener("click", () => this.selectGameMode("ffa"));
        document.getElementById("btn-mode-tdm")?.addEventListener("click", () => this.selectGameMode("tdm"));
        document.getElementById("btn-mode-coop")?.addEventListener("click", () => this.selectGameMode("coop"));
        document.getElementById("btn-mode-br")?.addEventListener("click", () => this.selectGameMode("battle_royale"));
        document.getElementById("btn-mode-ctf")?.addEventListener("click", () => this.selectGameMode("ctf"));
        
        // Обработчики выбора карты
        const mapButtons = ["normal", "sandbox", "polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal"];
        mapButtons.forEach(map => {
            document.getElementById(`play-btn-map-${map}`)?.addEventListener("click", () => this.selectMap(map as MapType));
        });
        
        // Обработчики навигации окон-терминалов
        document.querySelectorAll(".window-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const action = target.dataset.nav;
                const step = parseInt(target.dataset.step || "0", 10);
                if (action === "back") this.navigatePlayStep(step - 1);
                if (action === "forward") this.navigatePlayStep(step + 1);
                if (action === "close") this.hidePlayMenu();
            });
        });

        // Обработчики пресетов танков
        document.getElementById("preset-balanced")?.addEventListener("click", () => this.selectPreset("balanced"));
        document.getElementById("preset-speed")?.addEventListener("click", () => this.selectPreset("speed"));
        document.getElementById("preset-defense")?.addEventListener("click", () => this.selectPreset("defense"));
        document.getElementById("preset-damage")?.addEventListener("click", () => this.selectPreset("damage"));
        
        // Обработчик кнопки "Гараж" в окне выбора танка
        document.getElementById("btn-tank-garage")?.addEventListener("click", () => {
            this.returnToPlayMenuAfterGarage = true;
            this.hidePlayMenu();
            this.showGarage();
        });
        
        // Обработчик запуска игры
        document.getElementById("btn-start-game")?.addEventListener("click", () => this.startSelectedGame());
        
        this.setupCloseButton("play-menu-back", () => this.hidePlayMenu());
        this.setupPanelCloseOnBackground(this.playMenuPanel, () => this.hidePlayMenu());
    }
    
    private populateTankOptions(): void {
        // Импортируем типы танков динамически
        import("./tankTypes").then(({ CHASSIS_TYPES, CANNON_TYPES }) => {
            const chassisContainer = document.getElementById("chassis-options");
            const cannonContainer = document.getElementById("cannon-options");
            
            if (chassisContainer) {
                chassisContainer.innerHTML = ""; // Очищаем перед заполнением
                CHASSIS_TYPES.filter(chassis => this.ownedChassisIds.has(chassis.id)).forEach(chassis => {
                    const btn = document.createElement("button");
                    btn.className = `menu-btn ${this.selectedChassis === chassis.id ? "play-btn" : ""}`;
                    btn.innerHTML = `
                        <span class="btn-label">${chassis.name}</span>
                        <span style="font-size:10px; opacity:0.8;">
                            ${Math.round(chassis.maxHealth)} HP • ${Math.round(chassis.moveSpeed)} SPD
                        </span>`;
                    btn.dataset.chassis = chassis.id;
                    btn.addEventListener("click", () => this.selectChassis(chassis.id));
                    chassisContainer.appendChild(btn);
                });
            }
            
            if (cannonContainer) {
                cannonContainer.innerHTML = ""; // Очищаем перед заполнением
                CANNON_TYPES.filter(cannon => this.ownedCannonIds.has(cannon.id)).forEach(cannon => {
                    const btn = document.createElement("button");
                    btn.className = `menu-btn ${this.selectedCannon === cannon.id ? "play-btn" : ""}`;
                    btn.innerHTML = `
                        <span class="btn-label">${cannon.name}</span>
                        <span style="font-size:10px; opacity:0.8;">
                            ${Math.round(cannon.damage)} DMG • ${(cannon.cooldown / 1000).toFixed(1)}s CD
                        </span>`;
                    btn.dataset.cannon = cannon.id;
                    btn.addEventListener("click", () => this.selectCannon(cannon.id));
                    cannonContainer.appendChild(btn);
                });
            }
        }).catch(error => {
            debugError("[Menu] Error loading tank types:", error);
        });
    }
    
    private selectGameMode(mode: string): void {
        this.selectedGameMode = mode;
        debugLog("[Menu] Selected game mode:", mode);
        
        // Обновляем визуал выбранной кнопки
        document.querySelectorAll("[data-mode]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.mode === mode) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn secondary";
            }
        });
        
        // Update terminal titles
        this.updateTerminalTitles();
        
        // Показываем следующий шаг - выбор карты
        this.showPlayWindow("play-window-map", 1, 1);
    }
    
    private selectMap(map: MapType): void {
        this.selectedMapType = map;
        debugLog("[Menu] Selected map:", map);
        
        // Обновляем визуал
        document.querySelectorAll("[data-map]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.map === map) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn secondary";
            }
        });
        
        // Update terminal titles
        this.updateTerminalTitles();
        
        // Показываем следующий шаг - выбор танка поверх
        this.showPlayWindow("play-window-tank", 2, 2);
        
        this.checkCanStartGame();
    }
    
    private selectChassis(chassisId: string): void {
        if (!this.ownedChassisIds.has(chassisId)) {
            debugLog("[Menu] Attempt to select chassis not owned:", chassisId);
            return;
        }
        this.selectedChassis = chassisId;
        localStorage.setItem("selectedChassis", chassisId);
        debugLog("[Menu] Selected chassis:", chassisId);
        
        // Обновляем визуал
        document.querySelectorAll("[data-chassis]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.chassis === chassisId) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn";
            }
        });
        
        // Update terminal titles (path doesn't change, but ensure it's up to date)
        this.updateTerminalTitles();
        
        this.checkCanStartGame();
    }
    
    private selectCannon(cannonId: string): void {
        if (!this.ownedCannonIds.has(cannonId)) {
            debugLog("[Menu] Attempt to select cannon not owned:", cannonId);
            return;
        }
        this.selectedCannon = cannonId;
        localStorage.setItem("selectedCannon", cannonId);
        debugLog("[Menu] Selected cannon:", cannonId);
        
        // Обновляем визуал
        document.querySelectorAll("[data-cannon]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.cannon === cannonId) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn";
            }
        });
        
        // Update terminal titles (path doesn't change, but ensure it's up to date)
        this.updateTerminalTitles();
        
        this.checkCanStartGame();
    }
    
    private selectPreset(preset: string): void {
        debugLog("[Menu] Selected preset:", preset);
        
        // Обновляем визуал выбранного пресета
        document.querySelectorAll("[data-preset]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.preset === preset) {
                button.className = "menu-btn play-btn";
            } else {
                button.className = "menu-btn secondary";
            }
        });
        
        // Применяем пресет
        import("./tankTypes").then(() => {
            let chassisId = "medium";
            let cannonId = "standard";
            
            switch (preset) {
                case "balanced":
                    chassisId = "medium";
                    cannonId = "standard";
                    break;
                case "speed":
                    chassisId = "light";
                    cannonId = "rapid";
                    break;
                case "defense":
                    chassisId = "heavy";
                    cannonId = "heavy";
                    break;
                case "damage":
                    chassisId = "assault";
                    cannonId = "sniper";
                    break;
            }

            // Если нет владения — берем первый доступный из owned
            const ownedChassis = Array.from(this.ownedChassisIds);
            const ownedCannon = Array.from(this.ownedCannonIds);
            if (!this.ownedChassisIds.has(chassisId) && ownedChassis.length > 0) {
                chassisId = ownedChassis[0];
            }
            if (!this.ownedCannonIds.has(cannonId) && ownedCannon.length > 0) {
                cannonId = ownedCannon[0];
            }
            
            this.selectChassis(chassisId);
            this.selectCannon(cannonId);
        }).catch(error => {
            debugError("[Menu] Error loading tank types for preset:", error);
        });
    }
    
    private checkCanStartGame(): void {
        // Проверяем, все ли выбрано
        const canStart = this.selectedGameMode && 
                        this.selectedMapType && 
                        this.selectedChassis && 
                        this.selectedCannon;
        
        // Кнопка "В БОЙ!" всегда видна в окне выбора танка, но может быть disabled
        const startButton = document.getElementById("btn-start-game");
        if (startButton) {
            (startButton as HTMLButtonElement).disabled = !canStart;
            if (!canStart) {
                startButton.style.opacity = "0.5";
                startButton.style.cursor = "not-allowed";
            } else {
                startButton.style.opacity = "1";
                startButton.style.cursor = "pointer";
            }
        }
    }

    private hideAllPlayWindows(): void {
        document.querySelectorAll(".play-window").forEach(win => {
            const el = win as HTMLDivElement;
            el.classList.remove("visible");
            el.style.zIndex = "100002";
            el.style.transform = "translate(0,0)";
        });
    }

    private getUserName(): string {
        // Try to get user_id from localStorage
        let storedUserId = localStorage.getItem("userId");
        if (storedUserId) return storedUserId;
        
        // Try to get from Firebase if available (synchronous check)
        try {
            // Check if firebaseService is available in global scope or window
            const firebaseService = (window as any).firebaseService || 
                                   (globalThis as any).firebaseService;
            if (firebaseService && firebaseService.isInitialized && firebaseService.isInitialized()) {
                const userId = firebaseService.getUserId();
                if (userId) {
                    localStorage.setItem("userId", userId);
                    return userId;
                }
            }
        } catch (e) {
            // Firebase not available, ignore
        }
        
        // Default fallback - use "user_id" as placeholder
        const defaultUserId = "user_id";
        localStorage.setItem("userId", defaultUserId);
        return defaultUserId;
    }
    
    private getModeDisplayName(mode: string): string {
        const modeNames: Record<string, string> = {
            "single": "single",
            "ffa": "ffa",
            "tdm": "tdm",
            "coop": "coop",
            "battle_royale": "battle_royale",
            "ctf": "ctf"
        };
        return modeNames[mode] || mode;
    }
    
    private getMapDisplayName(map: MapType | null): string {
        if (!map) return "";
        const mapNames: Record<string, string> = {
            "normal": "normal",
            "sandbox": "sandbox",
            "polygon": "polygon",
            "frontline": "frontline",
            "ruins": "ruins",
            "canyon": "canyon",
            "industrial": "industrial",
            "urban_warfare": "urban_warfare",
            "underground": "underground",
            "coastal": "coastal"
        };
        return mapNames[map] || map;
    }
    
    private updateTerminalTitles(): void {
        const userId = this.getUserName();
        const basePath = `/${userId}`;
        
        // Update mode terminal title
        const modeTitle = document.querySelector("#play-window-mode .play-window-title");
        if (modeTitle) {
            modeTitle.textContent = `${basePath}/mode`;
        }
        
        // Update map terminal title
        const mapTitle = document.querySelector("#play-window-map .play-window-title");
        if (mapTitle) {
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                mapTitle.textContent = `${basePath}/mode/${modeName}/map`;
            } else {
                mapTitle.textContent = `${basePath}/mode/map`;
            }
        }
        
        // Update tank terminal title
        const tankTitle = document.querySelector("#play-window-tank .play-window-title");
        if (tankTitle) {
            let path = basePath;
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                path += `/mode/${modeName}`;
            }
            if (this.selectedMapType) {
                const mapName = this.getMapDisplayName(this.selectedMapType);
                path += `/map/${mapName}`;
            }
            path += "/preset";
            tankTitle.textContent = path;
        }
    }

    private showPlayWindow(id: string, order: number, step?: number): void {
        const el = document.getElementById(id) as HTMLDivElement | null;
        if (!el) return;
        el.classList.add("visible");
        el.style.zIndex = (100002 + order).toString();
        el.style.transform = `translate(${order * 12}px, ${order * 12}px)`;
        if (typeof step === "number") {
            this.currentPlayStep = step;
        }
        // Update terminal titles when showing window
        this.updateTerminalTitles();
    }

    private navigatePlayStep(targetStep: number): void {
        const steps = ["play-window-mode", "play-window-map", "play-window-tank"];
        const clamped = Math.max(0, Math.min(targetStep, steps.length - 1));
        this.hideAllPlayWindows();
        const id = steps[clamped];
        this.showPlayWindow(id, clamped, clamped);
    }
    
    private startSelectedGame(): void {
        if (!this.selectedMapType) return;
        
        // Сохраняем выборы
        if (this.selectedGameMode) localStorage.setItem("selectedGameMode", this.selectedGameMode);
        if (this.selectedMapType) localStorage.setItem("selectedMapType", this.selectedMapType);
        if (this.selectedChassis) localStorage.setItem("selectedChassis", this.selectedChassis);
        if (this.selectedCannon) localStorage.setItem("selectedCannon", this.selectedCannon);
        
        // Закрываем меню и запускаем игру
        this.hide();
        this.hidePlayMenu();
        this.onStartGame(this.selectedMapType);
    }
    
    private quickStart(): void {
        const savedMap = localStorage.getItem("selectedMapType") as MapType | null;
        if (!savedMap) {
            debugLog("[Menu] Quick start: no saved map, showing play menu");
            this.showPlayMenu();
            return;
        }
        // Используем сохраненные настройки, если есть
        this.selectedMapType = savedMap;
        this.selectedGameMode = localStorage.getItem("selectedGameMode") || "";
        this.selectedChassis = localStorage.getItem("selectedChassis") || this.selectedChassis;
        this.selectedCannon = localStorage.getItem("selectedCannon") || this.selectedCannon;
        
        this.hide();
        this.hidePlayMenu();
        this.onStartGame(savedMap);
    }
    
    private showPlayMenu(): void {
        debugLog("[Menu] showPlayMenu() called");
        if (this.playMenuPanel) {
            // Сбрасываем состояние
            this.selectedGameMode = "";
            this.selectedMapType = null;
            this.currentPlayStep = 0;
            
            // Скрываем все окна шагов
            this.hideAllPlayWindows();
            
            // Показываем только окно выбора режима
            this.showPlayWindow("play-window-mode", 0, 0);
            
            // Сбрасываем выборы кнопок
            document.querySelectorAll("[data-mode]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });
            document.querySelectorAll("[data-map]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });
            document.querySelectorAll("[data-preset]").forEach(btn => {
                (btn as HTMLButtonElement).className = "menu-btn secondary";
            });
            
            // Восстанавливаем сохраненные выборы (если есть)
            const savedMode = localStorage.getItem("selectedGameMode");
            const savedMap = localStorage.getItem("selectedMapType") as MapType | null;
            const savedChassis = localStorage.getItem("selectedChassis");
            const savedCannon = localStorage.getItem("selectedCannon");
            
            // Если сохраненного нет или его нет в владении — сбросим
            if (savedChassis && !this.ownedChassisIds.has(savedChassis)) {
                localStorage.removeItem("selectedChassis");
            }
            if (savedCannon && !this.ownedCannonIds.has(savedCannon)) {
                localStorage.removeItem("selectedCannon");
            }

            // Проставляем сохранённые выборы, но не переключаем шаги — режим всегда первый
            if (savedMode) {
                this.selectedGameMode = savedMode;
                document.querySelectorAll("[data-mode]").forEach(btn => {
                    const button = btn as HTMLButtonElement;
                    button.className = button.dataset.mode === savedMode ? "menu-btn play-btn" : "menu-btn secondary";
                });
            }
            if (savedMap) {
                this.selectedMapType = savedMap;
                document.querySelectorAll("[data-map]").forEach(btn => {
                    const button = btn as HTMLButtonElement;
                    button.className = button.dataset.map === savedMap ? "menu-btn play-btn" : "menu-btn secondary";
                });
            }
            if (savedChassis) this.selectChassis(savedChassis);
            if (savedCannon) this.selectCannon(savedCannon);
            
            // Если нет сохраненных данных — открываем первый шаг
            if (!savedMode) this.showPlayWindow("play-window-mode", 0);
            
            // Update terminal titles
            this.updateTerminalTitles();
            
            this.playMenuPanel.classList.add("visible");
            this.playMenuPanel.style.setProperty("display", "flex", "important");
            this.playMenuPanel.style.setProperty("visibility", "visible", "important");
            this.playMenuPanel.style.setProperty("opacity", "1", "important");
            this.playMenuPanel.style.setProperty("z-index", "100002", "important");
            this.enforceCanvasPointerEvents();
        }
    }
    
    private hidePlayMenu(): void {
        debugLog("[Menu] hidePlayMenu() called");
        if (this.playMenuPanel) {
            this.playMenuPanel.classList.remove("visible");
            this.playMenuPanel.style.setProperty("display", "none", "important");
            this.playMenuPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents();
        }
    }
    
    // @ts-expect-error - используется через обработчики событий
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // Создаем mock stats если playerProgression не установлен (для отображения дерева до инициализации игры)
        const stats: PlayerStats = this.playerProgression ? this.playerProgression.getStats() : {
            skillPoints: 0,
            skills: {} as Record<string, number>,
            level: 1,
            experience: 0,
            experienceToNext: 100
        };
        
        const callbacks: SkillTreeCallbacks = {
            onUpgrade: (skillId: string) => {
                if (this.playerProgression) {
                    this.playerProgression.upgradeSkill(skillId);
                }
            },
            onUpdate: () => {
                this.updateSkillsPanel();
                this.updatePlayerInfo();
            }
        };
        
        updateSkillTreeDisplay(stats, callbacks);
    }
    
    public showGarage(): void {
        debugLog("[Menu] showGarage() called");
        
        const wantsPlayMenuBack = this.returnToPlayMenuAfterGarage;
        const wasPlayVisible = this.playMenuPanel?.classList.contains("visible");
        
        // Garage is initialized by game.ts via setGarage() when game starts
        // If not available, fallback to simple panel
        
        // Garage should always be available (created in constructor)
        if (!this.garage) {
            logger.error("[Menu] Garage is null! This should not happen.");
            return;
        }
        
        debugLog("[Menu] Opening Garage class");
        const wasVisible = this.isVisible();
        if (wasVisible) {
            this.hide();
        }
        this.garage.setOnCloseCallback(() => {
            const shouldReturnToPlay = this.returnToPlayMenuAfterGarage || wantsPlayMenuBack || wasPlayVisible;
            this.returnToPlayMenuAfterGarage = false;
            const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
            if (canvas && canvas.style.display !== "none") {
                debugLog("[Menu] Game is running, not showing menu after garage close");
                return;
            }
            if (shouldReturnToPlay) {
                debugLog("[Menu] Returning to play menu after garage close");
                this.showPlayMenu();
            } else if (wasVisible) {
                debugLog("[Menu] Showing menu after garage close");
                this.show();
            }
        });
        this.garage.open();
    }
    
    private initializeGarageInMenu(): void {
        try {
            // Create minimal scene and currency manager for garage
            this.garageCurrencyManager = new CurrencyManager();
            
            // Create a minimal scene for garage (will be replaced by game scene later if needed)
            const canvas = document.createElement("canvas");
            canvas.style.display = "none";
            document.body.appendChild(canvas);
            const engine = new Engine(canvas, false);
            this.garageScene = new Scene(engine);
            
            // Create garage with minimal scene
            this.garage = new Garage(this.garageScene, this.garageCurrencyManager);
            debugLog("[Menu] Garage created in menu constructor");
        } catch (error) {
            logger.error("[Menu] Failed to create garage in menu:", error);
            // Garage will be created later by game.ts
        }
    }
    
    // @ts-expect-error - deprecated метод для совместимости
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private initializeGarage(): void {
        // Garage is already initialized in constructor
        // This method is kept for compatibility
        debugLog("[Menu] Garage already initialized");
    }
    
    // @ts-expect-error - deprecated метод для совместимости
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private hideGarage(): void {
        // Старый метод для совместимости, но теперь гараж закрывается через свой callback
        debugLog("[Menu] hideGarage() called (deprecated, garage closes via its own callback)");
        if (this.garage && this.garage.isGarageOpen()) {
            this.garage.close();
        }
        
        if (this.returnToPlayMenuAfterGarage) {
            this.returnToPlayMenuAfterGarage = false;
            this.showPlayMenu();
        }
    }
    
    // @ts-expect-error - используется через обработчики событий
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // Заглушка для владения: читаем из localStorage, иначе дефолт
    private loadOwnedIds(key: string, fallback: string[]): Set<string> {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set(fallback);
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return new Set(parsed.map((v) => String(v)));
            }
        } catch (_e) {
            // ignore parse errors
        }
        return new Set(fallback);
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
    
    private async toggleFullscreen(): Promise<void> {
        const entering = !document.fullscreenElement;
        if (entering) {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                    this.syncFullscreenState(true);
                }
            } catch (err: any) {
                logger.error(`Error entering fullscreen: ${err?.message || err}`);
                this.syncFullscreenState(false);
            }
        } else {
            try {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                    this.syncFullscreenState(false);
                }
            } catch (err: any) {
                logger.error(`Error exiting fullscreen: ${err?.message || err}`);
                this.syncFullscreenState(!!document.fullscreenElement);
            }
        }
    }
    
    private updateFullscreenButton(isFullscreen: boolean): void {
        const L = getLang(this.settings);
        const icon = document.getElementById("fullscreen-icon");
        const label = document.getElementById("fullscreen-label");
        
        if (icon) {
            icon.textContent = isFullscreen ? "⛶" : "⛶";
        }
        if (label) {
            label.textContent = isFullscreen ? L.exitFullscreen : L.fullscreen;
        }

        const checkbox = document.getElementById("set-fullscreen") as HTMLInputElement | null;
        if (checkbox) {
            checkbox.checked = isFullscreen;
        }
    }

    private syncFullscreenState(isFullscreen: boolean): void {
        this.settings.fullscreen = isFullscreen;
        this.updateFullscreenButton(isFullscreen);
    }

    private handleFullscreenCheckbox(checked: boolean): void {
        if (checked && !document.fullscreenElement) {
            this.toggleFullscreen();
        } else if (!checked && document.fullscreenElement) {
            this.toggleFullscreen();
        } else {
            this.syncFullscreenState(!!document.fullscreenElement);
        }
    }
    
    private saveSettingsFromUI(): void {
        this.settings = saveSettingsFromUIModule();
        window.dispatchEvent(new CustomEvent("settingsChanged", { detail: this.settings }));
    }
    
    private loadSettings(): GameSettings {
        return loadSettingsModule();
    }
    
    setOnStartGame(callback: (mapType?: MapType) => void): void {
        this.onStartGame = callback;
    }
    
    // Метод для программного запуска игры (используется для автозапуска после рестарта)
    triggerStartGame(mapType: MapType): void {
        debugLog(`[Menu] Triggering start game with map: ${mapType}`);
        this.hide();
        this.onStartGame(mapType);
    }
    
    setOnRestartGame(callback: () => void): void {
        this.onRestartGame = callback;
    }
    
    setOnExitBattle(callback: () => void): void {
        this.onExitBattle = callback;
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
    
    show(isPaused: boolean = false): void {
        debugLog("[Menu] show() called");
        this.container.classList.remove("hidden");
        document.body.classList.add("menu-visible");
        // Немедленное обновление при показе меню (без анимации для первой загрузки)
        this.updatePlayerInfo(true);
        // Также обновляем через небольшую задержку для гарантии
        setTimeout(() => {
            this.updatePlayerInfo(true);
        }, 50);
        
        // Показываем/скрываем кнопки в зависимости от того, на паузе ли игра
        this.updatePauseButtons(isPaused);
        
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
            // Если на паузе - дополнительно прикрепляем обработчики к кнопкам паузы
            if (isPaused) {
                this.attachPauseButtonHandlers();
            }
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
    
    private updatePauseButtons(isPaused: boolean): void {
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        
        if (pauseButtons) {
            pauseButtons.style.display = isPaused ? "block" : "none";
        }
        if (mainButtons) {
            mainButtons.style.display = isPaused ? "none" : "block";
        }
        
        // Если показываем кнопки паузы, нужно перепривязать обработчики
        if (isPaused) {
            setTimeout(() => {
                this.attachPauseButtonHandlers();
                debugLog("[Menu] Pause button handlers reattached");
            }, 100);
        }
    }
    
    private attachPauseButtonHandlers(): void {
        // Прямое прикрепление обработчиков к кнопкам паузы
        const resumeBtn = document.getElementById("btn-resume") as HTMLButtonElement;
        const restartBtn = document.getElementById("btn-restart") as HTMLButtonElement;
        const exitBtn = document.getElementById("btn-exit-battle") as HTMLButtonElement;
        const pauseContainer = document.getElementById("pause-buttons");
        
        // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что контейнер и кнопки кликабельны
        if (pauseContainer) {
            pauseContainer.style.setProperty("pointer-events", "auto", "important");
            pauseContainer.style.setProperty("z-index", "10000", "important");
            pauseContainer.style.setProperty("position", "relative", "important");
        }
        
        const setupButton = (btn: HTMLButtonElement | null, name: string, handler: () => void) => {
            if (!btn) return;
            
            // Принудительно делаем кнопку кликабельной
            btn.style.setProperty("pointer-events", "auto", "important");
            btn.style.setProperty("cursor", "pointer", "important");
            btn.style.setProperty("z-index", "10001", "important");
            btn.disabled = false;
            
            // Удаляем старые обработчики
            btn.onclick = null;
            
            // Добавляем обработчик только через onclick (не дублируем!)
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                debugLog(`[Menu] ${name} button clicked`);
                handler();
            };
            
            debugLog(`[Menu] ${name} button setup complete`);
        };
        
        setupButton(resumeBtn, "Resume", () => this.resumeGame());
        setupButton(restartBtn, "Restart", () => this.restartGame());
        setupButton(exitBtn, "Exit", () => this.exitBattle());
        
        debugLog("[Menu] Pause button handlers attached directly:", {
            resume: !!resumeBtn,
            restart: !!restartBtn,
            exit: !!exitBtn,
            container: !!pauseContainer
        });
    }
    
    private resumeGame(): void {
        window.dispatchEvent(new CustomEvent("resumeGame"));
        this.hide();
    }
    
    private restartGame(): void {
        debugLog("[Menu] Restart game requested");
        this.showConfirmDialog(
            "🔄 ПЕРЕЗАГРУЗИТЬ",
            "Перезагрузить игру на этой карте?",
            () => {
                this.onRestartGame();
                this.hide();
            }
        );
    }
    
    private exitBattle(): void {
        debugLog("[Menu] Exit battle requested");
        this.showConfirmDialog(
            "🚪 ВЫЙТИ ИЗ БОЯ",
            "Вы уверены, что хотите выйти?",
            () => {
                this.onExitBattle();
                this.hide();
            }
        );
    }
    
    private showConfirmDialog(title: string, message: string, onConfirm: () => void): void {
        // Создаём оверлей
        const overlay = document.createElement("div");
        overlay.className = "confirm-dialog-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 100000;
        `;
        
        // Создаём диалог
        const dialog = document.createElement("div");
        dialog.className = "confirm-dialog";
        dialog.style.cssText = `
            background: linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%);
            border: 2px solid #0f0;
            border-radius: 10px;
            padding: 30px 40px;
            text-align: center;
            font-family: 'Press Start 2P', monospace;
            box-shadow: 0 0 30px rgba(0, 255, 0, 0.3);
            min-width: 350px;
        `;
        
        dialog.innerHTML = `
            <h2 style="color: #0f0; margin: 0 0 20px 0; font-size: 18px;">${title}</h2>
            <p style="color: #aaa; margin: 0 0 30px 0; font-size: 12px;">${message}</p>
            <div style="display: flex; gap: 20px; justify-content: center;">
                <button id="confirm-yes" style="
                    background: #0f0;
                    color: #000;
                    border: none;
                    padding: 12px 30px;
                    font-family: inherit;
                    font-size: 12px;
                    cursor: pointer;
                    border-radius: 5px;
                ">ДА</button>
                <button id="confirm-no" style="
                    background: #333;
                    color: #fff;
                    border: 1px solid #666;
                    padding: 12px 30px;
                    font-family: inherit;
                    font-size: 12px;
                    cursor: pointer;
                    border-radius: 5px;
                ">НЕТ</button>
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Обработчики кнопок
        const yesBtn = dialog.querySelector("#confirm-yes") as HTMLButtonElement;
        const noBtn = dialog.querySelector("#confirm-no") as HTMLButtonElement;
        
        const closeDialog = () => {
            overlay.remove();
        };
        
        yesBtn.onclick = () => {
            closeDialog();
            onConfirm();
        };
        
        noBtn.onclick = closeDialog;
        overlay.onclick = (e) => {
            if (e.target === overlay) closeDialog();
        };
        
        // Hover эффекты
        yesBtn.onmouseenter = () => { yesBtn.style.background = "#0c0"; };
        yesBtn.onmouseleave = () => { yesBtn.style.background = "#0f0"; };
        noBtn.onmouseenter = () => { noBtn.style.background = "#444"; };
        noBtn.onmouseleave = () => { noBtn.style.background = "#333"; };
    }
    
    isVisible(): boolean {
        return !this.container.classList.contains("hidden");
    }
    
    hide(): void {
        this.container.classList.add("hidden");
        document.body.classList.remove("menu-visible");
        // Разрешаем pointer-events на canvas и восстанавливаем видимость
        this.enforceCanvasPointerEvents();
        
        // Дополнительно убеждаемся, что canvas виден
        const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
        if (canvas) {
            canvas.style.setProperty("display", "block", "important");
            canvas.style.setProperty("visibility", "visible", "important");
            canvas.style.setProperty("opacity", "1", "important");
            canvas.style.setProperty("z-index", "0", "important");
        }
        
        // Также отправляем событие для Game класса
        window.dispatchEvent(new CustomEvent("menuVisibilityChanged", { detail: { visible: false } }));
    }
}
