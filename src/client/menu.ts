// ═══════════════════════════════════════════════════════════════════════════
// MAIN MENU - Минималистичное главное меню
// ═══════════════════════════════════════════════════════════════════════════

// Импорты для скил-дерева перенесены в menu/skillTreeUI.ts
import { createSkillsPanelHTML, updateSkillTreeDisplay, saveSkillTreeCameraPosition, type PlayerStats, type SkillTreeCallbacks } from "./menu/skillTreeUI";
import { Scene, Engine } from "@babylonjs/core";
// Garage is lazy loaded - imported dynamically when needed
import { CurrencyManager } from "./currencyManager";
import { logger, LogLevel, loggingSettings, LogCategory } from "./utils/logger";
import { CHASSIS_TYPES, CANNON_TYPES } from "./tankTypes";
import { authUI } from "./menu/authUI";
import { firebaseService } from "./firebaseService";
import { PlayerProgressionSystem, PLAYER_ACHIEVEMENTS, PLAYER_TITLES, getLevelBonuses, MAX_PLAYER_LEVEL, PLAYER_LEVEL_EXP, type PlayerAchievement, type DailyQuest } from "./playerProgression";

// Version tracking
// Версия генерируется во время сборки и одинакова для всех пользователей
const VERSION_MAJOR = 0;
const VERSION_MINOR = 4;

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
    saveSettings as saveSettingsModule,
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
        sandMap: "Песок",
        sandMapDesc: "Компактная двухуровневая арена в стиле Песочницы",
        madnessMap: "Безумие",
        madnessMapDesc: "Многоуровневая арена с мостиками, рампами и переходами",
        expoMap: "Экспо",
        expoMapDesc: "Киберспортивная арена среднего размера с множеством уровней",
        brestMap: "Брест",
        brestMapDesc: "Симметричная арена с крепостью в центре и базами по углам",
        arenaMap: "Арена",
        arenaMapDesc: "Киберспортивная арена с симметричной структурой и множеством тактических позиций",
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
        tartariaMap: "Тартария",
        tartariaMapDesc: "Город Тарту на основе реальных данных высот (27-82м)",
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
        adminF2: "Настройки скриншота (Ctrl+2)",
        adminF3: "Dev Dashboard (Ctrl+3)",
        adminF4: "Dev Console (Ctrl+4)",
        adminF6: "Настройки физики (Ctrl+6)",
        adminF7: "Меню читов (Ctrl+7)",
        openCheatMenu: "Открыть меню читов",
        garageKey: "Гараж",
        map: "Карта",
        statsKey: "Статистика",
        pauseMenu: "Пауза / Меню",
        freeLook: "Свободный обзор",
        center: "Центрировать",
        barrelPitch: "Наклон ствола",
        barrelUp: "Поднять ствол",
        barrelDown: "Опустить ствол",
        cameraTilt: "Наклон камеры",
        aimKey: "Прицеливание",
        gameCursor: "Игровой курсор",
        garageMenu: "Меню гаража",
        missions: "Панель миссий",
        consumables6to9: "Расходники 6-9",
        adminF2Key: "F2",
        adminF3Key: "F3",
        adminF4Key: "F4",
        adminF5Key: "F5",
        adminF6Key: "F6",
        adminF7Key: "F7",
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
        sandMap: "Sand",
        sandMapDesc: "Compact two-level arena in Sandbox style",
        madnessMap: "Madness",
        madnessMapDesc: "Multi-level arena with bridges, ramps and passages",
        expoMap: "Expo",
        expoMapDesc: "Medium-sized esports arena with multiple levels",
        brestMap: "Brest",
        brestMapDesc: "Symmetric arena with fortress in center and corner bases",
        arenaMap: "Arena",
        arenaMapDesc: "Esports arena with symmetric structure and multiple tactical positions",
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
        tartariaMap: "Tartaria",
        tartariaMapDesc: "City of Tartu based on real elevation data (27-82m)",
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
        adminF2: "Screenshot settings (Ctrl+2)",
        adminF3: "Dev Dashboard (Ctrl+3)",
        adminF4: "Dev Console (Ctrl+4)",
        adminF6: "Physics settings (Ctrl+6)",
        adminF7: "Cheat menu (Ctrl+7)",
        openCheatMenu: "Open cheat menu",
        garageKey: "Garage",
        map: "Map",
        statsKey: "Stats",
        pauseMenu: "Pause / Menu",
        freeLook: "Free look",
        center: "Center",
        barrelPitch: "Barrel Pitch",
        barrelUp: "Raise Barrel",
        barrelDown: "Lower Barrel",
        cameraTilt: "Camera Tilt",
        aimKey: "Aiming",
        gameCursor: "Game Cursor",
        garageMenu: "Garage Menu",
        missions: "Missions Panel",
        consumables6to9: "Consumables 6-9",
        adminF2Key: "F2",
        adminF3Key: "F3",
        adminF4Key: "F4",
        adminF5Key: "F5",
        adminF6Key: "F6",
        adminF7Key: "F7",
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

export type MapType = "normal" | "sandbox" | "sand" | "madness" | "expo" | "brest" | "arena" | "polygon" | "frontline" | "ruins" | "canyon" | "industrial" | "urban_warfare" | "underground" | "coastal" | "tartaria" | "custom";

export class MainMenu {
    private container!: HTMLDivElement;
    private settingsPanel!: HTMLDivElement;
    private statsPanel!: HTMLDivElement;
    private skillsPanel!: HTMLDivElement;
    private mapSelectionPanel!: HTMLDivElement;
    private playMenuPanel!: HTMLDivElement;
    private progressPanel!: HTMLDivElement;
    private progressCurrentTab: "level" | "achievements" | "quests" = "level";
    private onStartGame: (mapType?: MapType) => void = () => {};
    private onRestartGame: () => void = () => {};
    private onExitBattle: () => void = () => {};
    private selectedGameMode: string = "";
    private selectedMapType: MapType | null = null;
    private selectedChassis: string = "";
    private selectedCannon: string = "";
    private ownedChassisIds: Set<string> = new Set();
    private ownedCannonIds: Set<string> = new Set();
    private currentPlayStep: number = 0;
    private onPlayIntroSound: () => void = () => {};
    private settings!: GameSettings;
    private tankConfig!: TankConfig;
    private playerProgression: any = null;
    private experienceSubscription: any = null;
    private introSoundPlayed = false;
    private garage: any | null = null; // Garage instance (lazy loaded when needed)
    private garageScene: Scene | null = null; // Minimal scene for garage (if created in menu)
    private garageCurrencyManager: CurrencyManager | null = null; // Currency manager for garage
    private returnToPlayMenuAfterGarage = false;
    private standaloneMapEditor: any | null = null; // StandaloneMapEditor instance (lazy loaded when needed)
    
    private canvasObserver: MutationObserver | null = null;
    private canvasPointerEventsCheckInterval: number | null = null;
    private _lastPointerEventsState: string | null = null; // Кэш последнего состояния для предотвращения бесконечных циклов
    private _enforceInProgress = false; // Флаг для предотвращения рекурсивных вызовов
    private _enableDetailedLogging = false; // Детальное логирование отключено по умолчанию
    private buttonHandlersAttached = false; // Флаг для предотвращения множественной привязки обработчиков
    
    constructor() {
        
        this.settings = this.loadSettings();
        this.tankConfig = this.loadTankConfig();
        this.ownedChassisIds = this.loadOwnedIds("ownedChassis", ["medium"]);
        this.ownedCannonIds = this.loadOwnedIds("ownedCannons", ["standard"]);
        
        // ИСПРАВЛЕНО: Создаём PlayerProgressionSystem сразу при создании меню
        // чтобы данные аккаунта были доступны немедленно
        this.playerProgression = new PlayerProgressionSystem();
        
        // Garage will be loaded lazily when needed (when user opens garage from menu)
        // This reduces initial bundle size
        
        
        this.createMenuUI();
        
        this.createSettingsUI();
        this.createStatsPanel();
        this.createSkillsPanel();
        this.createProgressPanel();
        this.createMapSelectionPanel();
        this.createPlayMenuPanel();
        this.startAnimations();
        this.setupCanvasPointerEventsProtection();
        this.setupGlobalEventBlocking();
        this.setupFullscreenListener();
        
        // ИСПРАВЛЕНО: Сразу обновляем данные аккаунта в меню
        this.updatePlayerInfo(true);
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
        const globalHandler = (e: MouseEvent): void => {
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
                return;
            }
            
            // Если клик по элементу меню - разрешаем
            if (this.container.contains(target)) {
                // Разрешаем событие (не блокируем)
                return;
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
                this.settingsPanel?.classList.contains("visible") ||
                this.progressPanel?.classList.contains("visible");
            
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
        const panels = [this.mapSelectionPanel, this.statsPanel, this.skillsPanel, this.settingsPanel, this.progressPanel];
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
                this.settingsPanel?.classList.contains("visible") ||
                this.progressPanel?.classList.contains("visible");
            
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
    
    setGarage(garage: any): void {
        // Replace menu garage with game garage (which has proper scene and systems)
        if (this.garage && this.garageScene) {
            // Cleanup old garage scene
            try {
                if (this.garage.isGarageOpen()) {
                    this.garage.close(); // Close if open
                }
                
                // ИСПРАВЛЕНО: Получаем engine ПЕРЕД dispose сцены
                const engine = this.garageScene?.getEngine();
                
                // ИСПРАВЛЕНО: Безопасный dispose с проверками на isDisposed
                if (this.garageScene && !this.garageScene.isDisposed) {
                    this.garageScene.dispose();
                }
                
                // ИСПРАВЛЕНО: Dispose engine ПОСЛЕ dispose сцены
                if (engine && !engine.isDisposed) {
                    engine.dispose();
                }
            } catch (e) {
                // Ignore cleanup errors
                console.warn("[Menu] Error during garage cleanup:", e);
            }
        }
        this.garage = garage;
        debugLog("[Menu] Garage replaced with game garage");
    }
    
    private createMenuUI(): void {
        
        this.container = document.createElement("div");
        this.container.id = "main-menu";
        // ВАЖНО: НЕ добавляем класс "hidden" по умолчанию - меню должно быть видимо при создании
        // this.container.classList.add("hidden"); // УДАЛЕНО - меню должно быть видимо
        
        const L = getLang(this.settings);
        this.container.innerHTML = `
            <div class="menu-bg"></div>
            <div class="menu-content">
                <div class="menu-header">
                    <div class="logo-text logo-hoverable">
                        PROTOCOL <span class="accent">TX</span>
                        <div class="logo-construction-overlay">
                            <span class="logo-construction-text">UNDER CONSTRUCTION</span>
                        </div>
                    </div>
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
                            <div class="player-callsign" id="player-callsign">[anon_id: 0001]</div>
                        </div>
                    </div>
                    <div class="player-stats-row">
                        <div class="stat-item"><span class="stat-icon">$</span><span id="credits-display">500</span></div>
                        <div class="stat-item"><span class="stat-icon">☠</span><span id="kills-display">0</span></div>
                        <div class="stat-item"><span class="stat-icon">◷</span><span id="playtime-display">0ч</span></div>
                    </div>
                </div>
                
                <!-- Auth section -->
                <div class="auth-section" id="auth-section">
                    <div class="auth-info" id="auth-info" style="display: none;">
                        <div class="auth-user-info">
                            <span class="auth-username" id="auth-username">Гость</span>
                            <span class="auth-status" id="auth-status"></span>
                        </div>
                        <button class="menu-btn auth-btn" id="btn-profile">
                            <span class="btn-icon">👤</span>
                            <span class="btn-label">ПРОФИЛЬ</span>
                        </button>
                    </div>
                    <div class="auth-buttons" id="auth-buttons">
                        <button class="menu-btn under-construction-btn" id="btn-login">
                            <span class="btn-icon">🔐</span>
                            <span class="btn-label">ВОЙТИ</span>
                            <div class="under-construction-overlay">
                                <span class="under-construction-text">UNDER CONSTRUCTION</span>
                            </div>
                        </button>
                        <button class="menu-btn secondary under-construction-btn" id="btn-register">
                            <span class="btn-icon">📝</span>
                            <span class="btn-label">РЕГИСТРАЦИЯ</span>
                            <div class="under-construction-overlay">
                                <span class="under-construction-text">UNDER CONSTRUCTION</span>
                            </div>
                        </button>
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
                    <div class="btn-row">
                        <button class="menu-btn secondary" id="btn-map-editor">
                            <span class="btn-icon">🗺</span>
                            <span class="btn-label">РЕДАКТОР КАРТ</span>
                        </button>
                        <button class="menu-btn secondary under-construction-btn" id="btn-tank-editor">
                            <span class="btn-icon">🔧</span>
                            <span class="btn-label">РЕДАКТОР ТАНКОВ</span>
                            <div class="under-construction-overlay">
                                <span class="under-construction-text">UNDER CONSTRUCTION</span>
                            </div>
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
                                    <span class="key">ПКМ / CTRL</span>
                                    <span class="control-desc">${L.aimMode}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">R</span>
                                    <span class="control-desc">${L.barrelUp}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F</span>
                                    <span class="control-desc">${L.barrelDown}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">1-5</span>
                                    <span class="control-desc">${L.useConsumables}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">6-9</span>
                                    <span class="control-desc">${L.consumables6to9}</span>
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
                                    <span class="key">B</span>
                                    <span class="control-desc">${L.garageMenu}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">M</span>
                                    <span class="control-desc">${L.map}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">N</span>
                                    <span class="control-desc">${L.missions}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">TAB</span>
                                    <span class="control-desc">${L.statsKey}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">ALT</span>
                                    <span class="control-desc">${L.gameCursor}</span>
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
                                    <span class="control-desc">${L.cameraTilt}</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">МЫШЬ</span>
                                    <span class="control-desc">${L.freeLook}</span>
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
                                    <span class="key">F1 / Ctrl+1</span>
                                    <span class="control-desc">Помощь / Управление</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F2 / Ctrl+2</span>
                                    <span class="control-desc">Скриншот</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F3 / Ctrl+3</span>
                                    <span class="control-desc">Debug Dashboard</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F4 / Ctrl+4</span>
                                    <span class="control-desc">Physics Panel</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F5 / Ctrl+5</span>
                                    <span class="control-desc">System Terminal</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F6 / Ctrl+6</span>
                                    <span class="control-desc">Session Settings</span>
                                </div>
                                <div class="control-item">
                                    <span class="key">F7 / Ctrl+7</span>
                                    <span class="control-desc">Cheat Menu</span>
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
            
            /* Прозрачность фона меню когда игра запущена (в битве) */
            #main-menu.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }
            
            #main-menu.in-battle .menu-bg {
                background: rgba(0, 0, 0, 0.5) !important;
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
                margin: 0 auto; /* Центрирование по горизонтали */
                left: auto; /* Убираем смещение влево */
                right: auto; /* Убираем смещение вправо */
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
            
            /* === LOGO HOVER ANIMATION (как у кнопок редакторов) === */
            .logo-hoverable {
                position: relative;
                display: inline-block;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .logo-construction-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: repeating-linear-gradient(
                    -45deg,
                    rgba(255, 204, 0, 0.9),
                    rgba(255, 204, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 20px
                );
                background-size: 28.28px 28.28px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                z-index: 10;
            }
            
            .logo-hoverable:hover .logo-construction-overlay {
                opacity: 1;
                animation: construction-slide 0.5s linear infinite;
            }
            
            .logo-hoverable:hover {
                text-shadow: 0 0 15px #ffcc00, 0 0 25px #ffcc00;
                color: #ffcc00;
            }
            
            .logo-construction-text {
                background: rgba(0, 0, 0, 0.85);
                color: #ffcc00;
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(6px, 0.9vw, 9px);
                text-align: center;
                text-shadow: 0 0 5px #ffcc00, 0 0 10px #ffcc00;
                border: 2px solid #ffcc00;
                box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
                letter-spacing: 1px;
                animation: construction-pulse 0.8s ease-in-out infinite;
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

            .auth-section {
                background: none;
                border: none;
                padding: 0;
                margin-bottom: clamp(5px, 1vh, 10px);
                display: flex;
                flex-direction: column;
                align-items: stretch;
                box-shadow: none;
            }

            .auth-info {
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 100%;
            }

            .auth-user-info {
                display: flex;
                align-items: center;
                justify-content: space-between;
                color: #0f0;
                font-size: clamp(11px, 1.3vw, 13px);
                width: 100%;
            }

            .auth-username {
                font-weight: bold;
            }

            .auth-status {
                font-size: clamp(14px, 1.5vw, 16px);
                margin-left: 8px;
            }

            .auth-buttons {
                display: flex;
                gap: 12px;
                width: 100%;
                align-items: stretch;
                background: none !important;
                border: none !important;
                outline: none !important;
                padding: 0 !important;
                margin: 0 !important;
                box-shadow: none !important;
            }

            .auth-buttons {
                display: flex;
                gap: 10px;
            }
            
            .auth-buttons .menu-btn {
                flex: 1;
                min-width: 0;
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
            
            .xp-section { 
                flex: 1; 
                display: flex;
                flex-direction: column;
            }
            
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
            
            .player-callsign {
                font-size: 10px;
                color: #0ff;
                text-shadow: 0 0 4px rgba(0, 255, 255, 0.6);
                font-weight: bold;
                white-space: nowrap;
                padding: 0;
                background: none;
                border: none;
                text-align: left;
                margin-top: 4px;
                align-self: flex-start;
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
            
            /* === UNDER CONSTRUCTION ANIMATION === */
            .under-construction-btn {
                position: relative;
                overflow: hidden;
            }
            
            .under-construction-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: repeating-linear-gradient(
                    -45deg,
                    rgba(255, 204, 0, 0.9),
                    rgba(255, 204, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 10px,
                    rgba(0, 0, 0, 0.9) 20px
                );
                background-size: 28.28px 28.28px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                pointer-events: none;
                z-index: 10;
            }
            
            .under-construction-btn:hover .under-construction-overlay {
                opacity: 1;
                animation: construction-slide 0.5s linear infinite;
            }
            
            @keyframes construction-slide {
                0% { background-position: 0 0; }
                100% { background-position: 28.28px 0; }
            }
            
            .under-construction-text {
                background: rgba(0, 0, 0, 0.85);
                color: #ffcc00;
                padding: 6px 12px;
                font-family: 'Press Start 2P', monospace;
                font-size: clamp(6px, 0.9vw, 9px);
                text-align: center;
                text-shadow: 0 0 5px #ffcc00, 0 0 10px #ffcc00;
                border: 2px solid #ffcc00;
                box-shadow: 0 0 10px rgba(255, 204, 0, 0.5);
                letter-spacing: 1px;
                animation: construction-pulse 0.8s ease-in-out infinite;
            }
            
            @keyframes construction-pulse {
                0%, 100% { 
                    opacity: 1; 
                    transform: scale(1);
                }
                50% { 
                    opacity: 0.8; 
                    transform: scale(1.02);
                }
            }
            
            /* Убираем стандартный hover для кнопок "under construction" */
            .under-construction-btn:hover {
                background: #000 !important;
                color: #0f0 !important;
                box-shadow: 0 0 15px #ffcc00 !important;
                border-color: #ffcc00 !important;
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
            
            .btn-icon { 
                font-size: 16px; 
                flex-shrink: 0;
            }
            
            .btn-label {
                font-size: clamp(10px, 1.2vw, 12px) !important;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
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
                .construction-text { font-size: clamp(5px, 0.7vw, 8px); }
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
            
            /* Прозрачность фона меню когда игра запущена (в битве) */
            .panel-overlay.in-battle,
            #main-menu.in-battle {
                background: rgba(0, 0, 0, 0.5) !important;
            }
            
            #main-menu.in-battle .menu-bg {
                background: rgba(0, 0, 0, 0.5) !important;
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
                display: flex;
                flex-direction: column;
            }
            
            /* Панель выбора карт - расширенная для сетки */
            #map-selection-panel .panel-content {
                max-width: min(95vw, 1050px);
                width: min(95vw, 1050px);
                max-height: min(95vh, 850px);
            }
            
            /* Сетка карт */
            .map-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 12px;
                margin-top: 20px;
            }
            
            /* Карточка карты */
            .map-card {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                padding: 15px 10px;
                background: rgba(0, 20, 0, 0.4);
                border: 2px solid rgba(0, 255, 80, 0.3);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 140px;
                text-align: center;
            }
            
            .map-card:hover {
                background: rgba(0, 40, 0, 0.6);
                border-color: #0f0;
                box-shadow: 0 0 15px rgba(0, 255, 80, 0.4);
                transform: translateY(-2px);
            }
            
            .map-card.recommended {
                border-color: #0f0;
                background: rgba(0, 40, 0, 0.5);
                box-shadow: 0 0 10px rgba(0, 255, 80, 0.2);
            }
            
            .map-card.recommended::before {
                content: "★";
                position: absolute;
                top: 5px;
                right: 8px;
                color: #0f0;
                font-size: 12px;
            }
            
            .map-card {
                position: relative;
            }
            
            .map-card-icon {
                font-size: 32px;
                margin-bottom: 8px;
                filter: drop-shadow(0 0 4px rgba(0, 255, 80, 0.5));
            }
            
            .map-card-name {
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                color: #0f0;
                margin-bottom: 6px;
                line-height: 1.3;
            }
            
            .map-card-desc {
                font-size: 8px;
                color: rgba(0, 255, 80, 0.7);
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .map-card-new {
                position: absolute;
                top: 5px;
                left: 5px;
                background: #f00;
                color: #fff;
                font-size: 7px;
                padding: 2px 5px;
                border-radius: 3px;
                font-family: 'Press Start 2P', monospace;
                animation: pulse-new 1.5s ease-in-out infinite;
            }
            
            @keyframes pulse-new {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.8; transform: scale(1.05); }
            }
            
            /* Адаптивность сетки карт */
            @media (max-width: 900px) {
                .map-grid {
                    grid-template-columns: repeat(3, 1fr);
                }
            }
            
            @media (max-width: 650px) {
                .map-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .map-card {
                    min-height: 120px;
                    padding: 12px 8px;
                }
                
                .map-card-icon {
                    font-size: 28px;
                }
                
                .map-card-name {
                    font-size: 9px;
                }
            }
            
            /* Заголовок TX */
            .skills-main-title {
                font-size: 48px;
                color: #fff;
                text-align: center;
                margin-bottom: 10px;
                font-weight: bold;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                font-family: 'Press Start 2P', monospace;
            }
            
            /* Вкладки категорий */
            .skill-category-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                justify-content: center;
                flex-wrap: wrap;
            }
            
            .skill-category-tab {
                padding: 10px 16px;
                background: rgba(0, 20, 0, 0.3);
                border: 2px solid rgba(0, 255, 4, 0.3);
                color: #0f0;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                font-family: 'Press Start 2P', monospace;
                transition: all 0.2s;
                border-radius: 4px;
                white-space: nowrap;
            }
            
            .skill-category-tab:hover {
                background: rgba(0, 40, 0, 0.5);
                border-color: rgba(0, 255, 4, 0.6);
            }
            
            .skill-category-tab.active {
                background: rgba(0, 255, 4, 0.2);
                border-color: rgba(0, 255, 4, 0.8);
                color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 4, 0.4);
            }
            
            /* Специальные цвета для разных вкладок */
            .skill-category-tab[data-category="attack"] {
                border-color: rgba(255, 0, 0, 0.5);
                color: #f00;
            }
            
            .skill-category-tab[data-category="attack"]:hover,
            .skill-category-tab[data-category="attack"].active {
                border-color: rgba(255, 0, 0, 0.8);
                background: rgba(255, 0, 0, 0.2);
                color: #f00;
            }
            
            .skill-category-tab[data-category="defense"] {
                border-color: rgba(0, 0, 255, 0.5);
                color: #00f;
            }
            
            .skill-category-tab[data-category="defense"]:hover,
            .skill-category-tab[data-category="defense"].active {
                border-color: rgba(0, 0, 255, 0.8);
                background: rgba(0, 0, 255, 0.2);
                color: #00f;
            }
            
            .skill-category-tab[data-category="mobility"] {
                border-color: rgba(0, 255, 255, 0.5);
                color: #0ff;
            }
            
            .skill-category-tab[data-category="mobility"]:hover,
            .skill-category-tab[data-category="mobility"].active {
                border-color: rgba(0, 255, 255, 0.8);
                background: rgba(0, 255, 255, 0.2);
                color: #0ff;
            }
            
            .skill-category-tab[data-category="tech"] {
                border-color: rgba(255, 255, 0, 0.5);
                color: #ff0;
            }
            
            .skill-category-tab[data-category="tech"]:hover,
            .skill-category-tab[data-category="tech"].active {
                border-color: rgba(255, 255, 0, 0.8);
                background: rgba(255, 255, 0, 0.2);
                color: #ff0;
            }
            
            .skill-category-tab[data-category="stealth"] {
                border-color: rgba(255, 140, 0, 0.5);
                color: #ff8c00;
            }
            
            .skill-category-tab[data-category="stealth"]:hover,
            .skill-category-tab[data-category="stealth"].active {
                border-color: rgba(255, 140, 0, 0.8);
                background: rgba(255, 140, 0, 0.2);
                color: #ff8c00;
            }
            
            .skill-category-tab[data-category="leadership"] {
                border-color: rgba(0, 255, 0, 0.5);
                color: #0f0;
            }
            
            .skill-category-tab[data-category="leadership"]:hover,
            .skill-category-tab[data-category="leadership"].active {
                border-color: rgba(0, 255, 0, 0.8);
                background: rgba(0, 255, 0, 0.2);
                color: #0f0;
            }
            
            .panel-title {
                font-size: 18px;
                color: #0f0;
                text-align: center;
                margin-bottom: 15px;
                text-shadow: 0 0 10px #0f0;
                font-weight: bold;
            }
            
            #skills-panel .panel-title {
                margin-bottom: 10px;
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
                bottom: auto;
                max-height: calc(100vh - 80px);
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
                overflow-y: auto;
                overflow-x: hidden;
            }

            .play-window.visible {
                display: flex !important;
            }

            /* Широкое окно для сетки карт */
            .play-window.play-window-wide {
                width: min(95vw, 950px) !important;
                left: 50% !important;
                right: auto !important;
                transform: translateX(-50%) !important;
            }
            
            /* Компактные карточки в play-window (без описаний) */
            .play-window .map-grid {
                margin-top: 15px;
                display: grid !important;
                grid-template-columns: repeat(4, 1fr) !important;
                gap: 10px;
            }
            
            .play-window .map-card {
                min-height: 80px;
                padding: 10px 6px;
            }
            
            .play-window .map-card-icon {
                font-size: 24px;
                margin-bottom: 4px;
            }
            
            .play-window .map-card-name {
                font-size: 8px;
                line-height: 1.2;
            }
            
            /* Адаптивность для play-window */
            @media (max-width: 800px) {
                .play-window .map-grid {
                    grid-template-columns: repeat(3, 1fr) !important;
                }
            }
            
            @media (max-width: 600px) {
                .play-window .map-grid {
                    grid-template-columns: repeat(2, 1fr) !important;
                }
            }
            
            /* Сетка режимов игры */
            .gamemode-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }
            
            .gamemode-btn {
                padding: 15px 10px !important;
                text-align: center;
            }
            
            .gamemode-btn .btn-icon {
                display: block;
                font-size: 24px;
                margin-bottom: 5px;
            }
            
            .gamemode-btn .btn-label {
                font-size: 10px;
            }
            
            @media (max-width: 600px) {
                .gamemode-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
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
                justify-content: center;
            }
            
            #skills-panel .panel-buttons {
                margin-top: 15px;
            }
            
            #skills-panel .panel-btn {
                min-width: 200px;
                padding: 14px 24px;
                font-size: 12px;
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
                border-top: 2px solid #0f0;
                border-left: none;
                border-right: none;
                border-bottom: none;
                padding: 16px;
                max-height: calc(95vh - 350px);
                min-height: 500px;
                overflow: auto;
                box-shadow: 0 0 20px rgba(0,255,100,0.15);
                cursor: grab;
                flex: 1;
            }

            .skill-tree-header {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: linear-gradient(180deg, rgba(0,30,0,0.98), rgba(0,15,0,0.95));
                border-bottom: 2px solid #0f0;
                box-shadow: 0 4px 20px rgba(0,0,0,0.8);
                margin-bottom: 10px;
            }

            .skill-points-pill {
                padding: 10px 16px;
                background: rgba(0,255,140,0.12);
                border: 2px solid #0f0;
                color: #9f9;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1px;
                box-shadow: 0 0 12px rgba(0,255,80,0.2);
                font-weight: bold;
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
                min-width: 2500px; /* Шире для трех деревьев */
                background-image: linear-gradient(90deg, rgba(0,255,120,0.05) 1px, transparent 1px);
                background-repeat: repeat;
                background-size: 160px 1px;
                padding: 12px;
                border-top: 2px solid rgba(0,255,80,0.6);
                border-left: none;
                border-right: none;
                border-bottom: none;
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
                left: 10px;
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
                /* Свечение наследует цвет stroke линии */
            }

            .skill-category-header {
                position: absolute;
                padding: 12px 20px;
                background: rgba(0, 0, 0, 0.8);
                border: 2px solid;
                border-radius: 8px;
                font-size: 18px;
                font-weight: bold;
                cursor: pointer;
                z-index: 10;
                transition: all 0.2s ease;
                user-select: none;
                white-space: nowrap;
            }
            
            .skill-category-header:hover {
                background: rgba(0, 0, 0, 0.95);
                transform: scale(1.05);
            }
            
            .skill-category-header.active {
                background: rgba(255, 255, 255, 0.1);
                box-shadow: 0 0 15px currentColor;
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
            
            /* ═══════════════════════════════════════════════════════════════════════════ */
            /* PROGRESS PANEL STYLES */
            /* ═══════════════════════════════════════════════════════════════════════════ */
            
            /* Кликабельная карточка игрока */
            .player-card {
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .player-card:hover {
                border-color: #0ff !important;
                box-shadow: 0 0 15px rgba(0, 255, 255, 0.4);
                transform: translateY(-2px);
            }
            
            .player-card:active {
                transform: translateY(0);
            }
            
            /* Progress Panel Tabs */
            .progress-tabs {
                display: flex;
                background: rgba(0, 20, 0, 0.9);
                border-bottom: 2px solid #0f0;
            }
            
            .progress-tab {
                flex: 1;
                padding: 12px 16px;
                background: transparent;
                border: none;
                border-right: 1px solid #0f04;
                color: #080;
                font-family: 'Press Start 2P', monospace;
                font-size: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                text-align: center;
            }
            
            .progress-tab:last-child {
                border-right: none;
            }
            
            .progress-tab:hover {
                background: rgba(0, 255, 0, 0.1);
                color: #0f0;
            }
            
            .progress-tab.active {
                background: rgba(0, 255, 0, 0.2);
                color: #0ff;
                text-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
            }
            
            /* Progress Panel Content */
            .progress-content {
                padding: 20px;
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .progress-tab-content {
                display: none;
            }
            
            .progress-tab-content.active {
                display: block;
                animation: fadeIn 0.3s ease;
            }
            
            /* Level Section */
            .progress-level-section {
                text-align: center;
                margin-bottom: 25px;
            }
            
            .progress-level-badge {
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #000 0%, #030 100%);
                border: 3px solid #0f0;
                border-radius: 8px;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin-bottom: 10px;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.4);
            }
            
            .progress-level-number {
                font-size: 28px;
                color: #0f0;
                text-shadow: 0 0 10px #0f0;
            }
            
            .progress-title {
                font-size: 12px;
                margin-top: 8px;
                text-shadow: 0 0 6px currentColor;
            }
            
            .progress-title-icon {
                font-size: 18px;
                margin-right: 5px;
            }
            
            /* Large XP Bar */
            .progress-xp-bar-container {
                margin: 20px 0;
            }
            
            .progress-xp-bar-bg {
                height: 30px;
                background: #010;
                border: 2px solid #0f0;
                border-radius: 4px;
                position: relative;
                overflow: hidden;
            }
            
            .progress-xp-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #0a0 0%, #0f0 50%, #0a0 100%);
                box-shadow: 0 0 15px #0f0;
                transition: width 0.5s ease;
                position: relative;
            }
            
            .progress-xp-bar-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
                animation: xpShine 2s infinite;
            }
            
            @keyframes xpShine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            .progress-xp-text {
                text-align: center;
                margin-top: 8px;
                font-size: 12px;
                color: #0f0;
            }
            
            .progress-xp-percent {
                color: #0ff;
                font-weight: bold;
            }
            
            /* Stats Grid */
            .progress-stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin: 20px 0;
            }
            
            .progress-stat-card {
                background: rgba(0, 30, 0, 0.8);
                border: 1px solid #0f0;
                padding: 12px;
                text-align: center;
            }
            
            .progress-stat-value {
                font-size: 16px;
                color: #0f0;
                text-shadow: 0 0 5px #0f0;
            }
            
            .progress-stat-label {
                font-size: 8px;
                color: #0a0;
                margin-top: 5px;
            }
            
            /* Bonuses Grid */
            .progress-bonuses-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 8px;
                margin: 20px 0;
                padding: 12px;
                background: rgba(0, 20, 0, 0.6);
                border: 1px solid #0f04;
            }
            
            .progress-bonus-item {
                text-align: center;
                padding: 8px;
            }
            
            .progress-bonus-value {
                font-size: 14px;
                color: #0ff;
                text-shadow: 0 0 5px #0ff;
            }
            
            .progress-bonus-label {
                font-size: 7px;
                color: #088;
                margin-top: 4px;
            }
            
            /* Next Level Reward */
            .progress-next-level {
                background: rgba(0, 40, 0, 0.6);
                border: 1px solid #0f0;
                padding: 12px;
                margin-top: 15px;
                text-align: center;
            }
            
            .progress-next-level-title {
                font-size: 10px;
                color: #0a0;
                margin-bottom: 8px;
            }
            
            .progress-next-level-rewards {
                display: flex;
                justify-content: center;
                gap: 20px;
                font-size: 11px;
            }
            
            .progress-reward {
                color: #0f0;
            }
            
            .progress-reward-icon {
                margin-right: 5px;
            }
            
            /* Achievements Section */
            .achievements-category-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .achievement-category-btn {
                padding: 6px 12px;
                background: rgba(0, 30, 0, 0.6);
                border: 1px solid #0f04;
                color: #0a0;
                font-family: 'Press Start 2P', monospace;
                font-size: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .achievement-category-btn:hover {
                background: rgba(0, 255, 0, 0.1);
                border-color: #0f0;
            }
            
            .achievement-category-btn.active {
                background: rgba(0, 255, 0, 0.2);
                border-color: #0f0;
                color: #0f0;
            }
            
            .achievements-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 10px;
            }
            
            .achievement-card {
                background: rgba(0, 20, 0, 0.8);
                border: 2px solid #333;
                padding: 12px;
                transition: all 0.2s ease;
                position: relative;
            }
            
            .achievement-card:hover {
                transform: scale(1.02);
            }
            
            .achievement-card.unlocked {
                border-color: #0f0;
                box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
            }
            
            .achievement-card.locked {
                opacity: 0.5;
                filter: grayscale(0.5);
            }
            
            /* Tier colors */
            .achievement-card.tier-bronze { border-color: #cd7f32; }
            .achievement-card.tier-bronze.unlocked { box-shadow: 0 0 10px rgba(205, 127, 50, 0.4); }
            
            .achievement-card.tier-silver { border-color: #c0c0c0; }
            .achievement-card.tier-silver.unlocked { box-shadow: 0 0 10px rgba(192, 192, 192, 0.4); }
            
            .achievement-card.tier-gold { border-color: #ffd700; }
            .achievement-card.tier-gold.unlocked { box-shadow: 0 0 10px rgba(255, 215, 0, 0.4); }
            
            .achievement-card.tier-platinum { border-color: #e5e4e2; }
            .achievement-card.tier-platinum.unlocked { 
                box-shadow: 0 0 15px rgba(229, 228, 226, 0.5);
                animation: platinumGlow 2s ease-in-out infinite;
            }
            
            @keyframes platinumGlow {
                0%, 100% { box-shadow: 0 0 10px rgba(229, 228, 226, 0.3); }
                50% { box-shadow: 0 0 20px rgba(229, 228, 226, 0.6); }
            }
            
            .achievement-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            
            .achievement-icon {
                font-size: 20px;
            }
            
            .achievement-name {
                font-size: 10px;
                color: #0f0;
                flex: 1;
            }
            
            .achievement-tier {
                font-size: 7px;
                padding: 2px 6px;
                border-radius: 3px;
            }
            
            .achievement-tier.bronze { background: #cd7f32; color: #000; }
            .achievement-tier.silver { background: #c0c0c0; color: #000; }
            .achievement-tier.gold { background: #ffd700; color: #000; }
            .achievement-tier.platinum { background: #e5e4e2; color: #000; }
            
            .achievement-description {
                font-size: 8px;
                color: #0a0;
                margin-bottom: 8px;
            }
            
            .achievement-reward {
                font-size: 8px;
                color: #0ff;
                display: flex;
                gap: 10px;
            }
            
            .achievement-status {
                position: absolute;
                top: 8px;
                right: 8px;
                font-size: 14px;
            }
            
            /* Daily Quests Section */
            .quests-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .quests-title {
                font-size: 12px;
                color: #0ff;
            }
            
            .quests-reset-timer {
                font-size: 9px;
                color: #0a0;
            }
            
            .quest-card {
                background: rgba(0, 25, 0, 0.8);
                border: 2px solid #0f04;
                padding: 15px;
                margin-bottom: 12px;
                transition: all 0.2s ease;
            }
            
            .quest-card:hover {
                border-color: #0f0;
            }
            
            .quest-card.completed {
                border-color: #0ff;
                background: rgba(0, 40, 40, 0.3);
            }
            
            .quest-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .quest-name {
                font-size: 11px;
                color: #0f0;
            }
            
            .quest-status-icon {
                font-size: 16px;
            }
            
            .quest-description {
                font-size: 9px;
                color: #0a0;
                margin-bottom: 12px;
            }
            
            .quest-progress-bar-bg {
                height: 16px;
                background: #010;
                border: 1px solid #0f04;
                position: relative;
                margin-bottom: 8px;
            }
            
            .quest-progress-bar-fill {
                height: 100%;
                background: linear-gradient(90deg, #080 0%, #0f0 100%);
                transition: width 0.3s ease;
            }
            
            .quest-progress-text {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 9px;
                color: #fff;
                text-shadow: 0 0 3px #000;
            }
            
            .quest-rewards {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                font-size: 9px;
            }
            
            .quest-reward {
                color: #0ff;
            }
            
            .quest-reward-icon {
                margin-right: 4px;
            }
            
            /* No quests message */
            .no-quests-message {
                text-align: center;
                padding: 40px;
                color: #0a0;
                font-size: 10px;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(this.container);
        
        
        // ВАЖНО: Убеждаемся, что меню видимо при создании (не добавляем класс hidden)
        // Меню будет показано через show() при загрузке игры
        this.container.classList.remove("hidden");
        // НЕ устанавливаем display/visibility здесь - CSS уже задает display: flex и visibility: visible
        // Полагаемся на CSS стили из #main-menu { display: flex; ... }
        
        
        // Инициализация auth UI
        const authContainer = authUI.createContainer();
        if (authContainer && !document.body.contains(authContainer)) {
            document.body.appendChild(authContainer);
        }
        
        // Обновление UI авторизации
        this.updateAuthUI();
        
        // Слушаем изменения состояния авторизации
        if (firebaseService.isInitialized()) {
            const auth = (firebaseService as any).auth;
            if (auth) {
                const { onAuthStateChanged } = require("firebase/auth");
                onAuthStateChanged(auth, () => {
                    this.updateAuthUI();
                });
            }
        }
        
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
        // Используем одну попытку с небольшой задержкой для надежности
        setTimeout(() => {
            this.attachDirectButtonHandlers();
        }, 100);
    }
    
    private attachDirectButtonHandlers(): void {
        console.log("[Menu] ====== attachDirectButtonHandlers() CALLED ======");
        // Предотвращаем множественную привязку обработчиков
        if (this.buttonHandlersAttached) {
            console.log("[Menu] Button handlers already attached, skipping");
            if (loggingSettings.getLevel() >= LogLevel.DEBUG) {
                logger.debug("[Menu] Button handlers already attached");
            }
            return;
        }
        
        try {
            console.log("[Menu] Attaching button handlers...");
            // Добавляем обработчики напрямую на каждую кнопку для максимальной надежности
            const buttons = [
                { id: "btn-play", handler: () => this.showPlayMenu() },
                { id: "btn-quick-start", handler: () => this.quickStart() },
                { id: "btn-garage", handler: () => this.showGarage() },
                { id: "btn-skills", handler: () => this.showSkills() },
                { id: "btn-stats", handler: () => this.showStats() },
                { id: "btn-map-editor", handler: () => {
                    console.log("[Menu] btn-map-editor clicked!");
                    this.openMapEditor().catch((error) => {
                        console.error("[Menu] Unhandled error in openMapEditor:", error);
                    });
                }},
                { id: "btn-tank-editor", handler: () => this.openTankEditor() },
                { id: "btn-settings", handler: () => this.showSettings() },
                { id: "btn-fullscreen", handler: () => this.toggleFullscreen() },
                { id: "btn-resume", handler: () => this.resumeGame() },
                { id: "btn-restart", handler: () => this.restartGame() },
                { id: "btn-exit-battle", handler: () => this.exitBattle() },
                { id: "btn-login", handler: () => this.showLogin() },
                { id: "btn-register", handler: () => this.showRegister() },
                { id: "btn-profile", handler: () => this.showProfile() }
            ];
            
            buttons.forEach(({ id, handler }) => {
                try {
                    const btn = document.getElementById(id) as HTMLButtonElement;
                    if (!btn) {
                        console.warn(`[Menu] Button ${id} not found!`);
                        return;
                    }
                    
                    // Специальное логирование для кнопки редактора карт
                    if (id === "btn-map-editor") {
                        console.log(`[Menu] ====== Attaching handler to ${id} ======`);
                        console.log(`[Menu] Button found:`, btn);
                        console.log(`[Menu] Button visible:`, btn.offsetWidth > 0 && btn.offsetHeight > 0);
                        console.log(`[Menu] Button style pointerEvents:`, window.getComputedStyle(btn).pointerEvents);
                    }
                    
                    if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                        logger.verbose(`[Menu] Attaching handler to button ${id}`);
                    }
                    
                    // Удаляем все старые обработчики через клонирование
                    const parent = btn.parentNode;
                    if (!parent) {
                        console.warn(`[Menu] Button ${id} has no parent node`);
                        return;
                    }
                    
                    const newBtn = btn.cloneNode(true) as HTMLButtonElement;
                    parent.replaceChild(newBtn, btn);
                    
                    // Убеждаемся, что кнопка видима и доступна для клика
                    newBtn.style.pointerEvents = "auto";
                    newBtn.style.zIndex = "10000";
                    newBtn.style.position = "relative";
                    
                    // Специальная проверка для кнопки редактора карт
                    if (id === "btn-map-editor") {
                        console.log(`[Menu] New button created:`, newBtn);
                        console.log(`[Menu] New button style pointerEvents:`, newBtn.style.pointerEvents);
                    }
                    
                    // Блокируем canvas перед добавлением обработчика
                    const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                    if (canvas) {
                        canvas.style.setProperty("pointer-events", "none", "important");
                        canvas.style.setProperty("z-index", "0", "important");
                    }
                    
                    // Для кнопок авторизации и редактора карт используем и mousedown, и click для максимальной надежности
                    if (id === "btn-login" || id === "btn-register" || id === "btn-map-editor") {
                        // Обработчик mousedown - срабатывает первым
                        newBtn.addEventListener("mousedown", (e) => {
                            console.log(`[Menu] Button ${id} mousedown event!`);
                            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                logger.verbose(`[Menu] Button ${id} mousedown`);
                            }
                            
                            try {
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }
                                
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                
                                // Вызываем handler сразу
                                console.log(`[Menu] Calling handler for ${id} from mousedown`);
                                if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                    logger.verbose(`[Menu] Handler called/completed for ${id}`);
                                }
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in mousedown handler for ${id}:`, error);
                                debugError(`[Menu] Error in mousedown handler for ${id}:`, error);
                            }
                        }, true);
                        
                        // Обработчик click - резервный, на случай если mousedown не сработал
                        newBtn.addEventListener("click", (e) => {
                            console.log(`[Menu] Button ${id} click event!`);
                            if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                logger.verbose(`[Menu] Button ${id} click (backup)`);
                            }
                            
                            try {
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }
                                
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                
                                // Вызываем handler
                                console.log(`[Menu] Calling handler for ${id} from click`);
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in click handler for ${id}:`, error);
                                debugError(`[Menu] Error in click handler for ${id}:`, error);
                            }
                        }, true);
                    } else {
                        // Для остальных кнопок используем стандартный обработчик mousedown
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
                        
                        // Обработчик click для остальных кнопок
                        newBtn.addEventListener("click", (e) => {
                            try {
                                console.log(`[Menu] Button ${id} clicked!`, e);
                                
                                // Блокируем canvas
                                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                                if (canvas) {
                                    canvas.style.setProperty("pointer-events", "none", "important");
                                }
                                
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();
                                
                                if (loggingSettings.getLevel() >= LogLevel.VERBOSE) {
                                    logger.verbose(`[Menu] Handler called/completed for ${id}`);
                                }
                                handler();
                            } catch (error) {
                                console.error(`[Menu] Error in button handler for ${id}:`, error);
                                debugError(`[Menu] Error in button handler for ${id}:`, error);
                            }
                        }, true);
                    }
                    
                    debugLog(`[Menu] Direct handler attached to ${id}`);
                } catch (error) {
                    debugError(`[Menu] Error setting up button handler for ${id}:`, error);
                }
            });
            
            // Устанавливаем флаг после успешной привязки всех обработчиков
            this.buttonHandlersAttached = true;
            
            // Добавляем обработчик клика на карточку игрока для открытия панели прогресса
            const playerCard = document.getElementById("player-info");
            if (playerCard) {
                playerCard.addEventListener("click", (e) => {
                    try {
                        debugLog("[Menu] Player card clicked, opening progress panel");
                        e.preventDefault();
                        e.stopPropagation();
                        this.showProgress();
                    } catch (error) {
                        debugError("[Menu] Error opening progress panel:", error);
                    }
                }, true);
                debugLog("[Menu] Player card click handler attached");
            } else {
                debugWarn("[Menu] Player card (#player-info) not found");
            }
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
        
        // Обновляем позывной
        this.updatePlayerCallsign();
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
                            <span class="setting-label">Панель характеристик танка</span>
                            <input type="checkbox" class="setting-checkbox" id="set-show-tank-stats-panel" ${this.settings.showTankStatsPanel ? 'checked' : ''}>
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
                                <button class="panel-btn secondary" id="open-cheat-menu">Ctrl+7</button>
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

        // Open cheat menu button (simulates Ctrl+7 press)
        const cheatBtn = document.getElementById("open-cheat-menu");
        if (cheatBtn) {
            cheatBtn.addEventListener("click", () => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "7", code: "Digit7", ctrlKey: true }));
            });
        }
        
        document.getElementById("settings-save")?.addEventListener("click", () => {
            this.saveSettingsFromUI();
            this.hideSettings();
            location.reload();
        });
        
        document.getElementById("settings-reset")?.addEventListener("click", () => {
            // ИСПРАВЛЕНО: Сбрасываем настройки к значениям по умолчанию и сохраняем их напрямую
            this.settings = { ...DEFAULT_SETTINGS };
            saveSettingsModule(this.settings); // Сохраняем DEFAULT_SETTINGS напрямую
            window.dispatchEvent(new CustomEvent("settingsChanged", { detail: this.settings }));
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
    
    private createProgressPanel(): void {
        this.progressPanel = document.createElement("div");
        this.progressPanel.className = "panel-overlay";
        this.progressPanel.id = "progress-panel";
        this.progressPanel.innerHTML = `
            <div class="panel" style="width: min(90vw, 700px); max-height: min(85vh, 700px);">
                <div class="panel-header">
                    <div class="panel-title">ПРОГРЕСС ИГРОКА</div>
                    <button class="panel-close" id="progress-close">×</button>
                </div>
                <div class="progress-tabs">
                    <button class="progress-tab active" data-tab="level">[1] УРОВЕНЬ</button>
                    <button class="progress-tab" data-tab="achievements">[2] ДОСТИЖЕНИЯ</button>
                    <button class="progress-tab" data-tab="quests">[3] ЗАДАНИЯ</button>
                </div>
                <div class="progress-content">
                    <div class="progress-tab-content active" id="progress-level-content">
                        <!-- Level tab content will be rendered dynamically -->
                    </div>
                    <div class="progress-tab-content" id="progress-achievements-content">
                        <!-- Achievements tab content will be rendered dynamically -->
                    </div>
                    <div class="progress-tab-content" id="progress-quests-content">
                        <!-- Quests tab content will be rendered dynamically -->
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.progressPanel);
        
        // Setup close button
        this.setupCloseButton("progress-close", () => this.hideProgress());
        this.setupPanelCloseOnBackground(this.progressPanel, () => this.hideProgress());
        
        // Setup tab switching
        this.progressPanel.querySelectorAll(".progress-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = (tab as HTMLElement).dataset.tab as "level" | "achievements" | "quests";
                this.switchProgressTab(tabName);
            });
        });
    }
    
    private switchProgressTab(tab: "level" | "achievements" | "quests"): void {
        this.progressCurrentTab = tab;
        
        // Update tab buttons
        this.progressPanel.querySelectorAll(".progress-tab").forEach(t => {
            t.classList.toggle("active", (t as HTMLElement).dataset.tab === tab);
        });
        
        // Update content
        this.progressPanel.querySelectorAll(".progress-tab-content").forEach(c => {
            c.classList.remove("active");
        });
        
        const contentId = `progress-${tab}-content`;
        const contentEl = document.getElementById(contentId);
        if (contentEl) {
            contentEl.classList.add("active");
        }
        
        // Render content based on tab
        switch (tab) {
            case "level":
                this.renderLevelTab();
                break;
            case "achievements":
                this.renderAchievementsTab();
                break;
            case "quests":
                this.renderQuestsTab();
                break;
        }
    }
    
    private showProgress(): void {
        debugLog("[Menu] showProgress() called");
        if (this.progressPanel) {
            this.progressPanel.classList.add("visible");
            this.progressPanel.style.setProperty("display", "flex", "important");
            this.progressPanel.style.setProperty("visibility", "visible", "important");
            this.progressPanel.style.setProperty("opacity", "1", "important");
            this.progressPanel.style.setProperty("z-index", "100002", "important");
            
            // Add in-battle class if game is running
            const game = (window as any).gameInstance;
            if (game && game.gameStarted) {
                this.progressPanel.classList.add("in-battle");
            } else {
                this.progressPanel.classList.remove("in-battle");
            }
            
            // Render current tab
            this.switchProgressTab(this.progressCurrentTab);
            this.enforceCanvasPointerEvents();
        }
    }
    
    private hideProgress(): void {
        debugLog("[Menu] hideProgress() called");
        if (this.progressPanel) {
            this.progressPanel.classList.remove("visible");
            this.progressPanel.style.setProperty("display", "none", "important");
            this.progressPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents();
        }
    }
    
    private renderLevelTab(): void {
        const content = document.getElementById("progress-level-content");
        if (!content || !this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const xpProgress = this.playerProgression.getExperienceProgress();
        const realTimeStats = this.playerProgression.getRealTimeXpStats();
        const bonuses = getLevelBonuses(stats.level);
        
        // Get current title
        let currentTitle: { title: string; icon: string; color: string } = { title: "Новобранец", icon: "🪖", color: "#888888" };
        for (let lvl = stats.level; lvl >= 1; lvl--) {
            const titleData = PLAYER_TITLES[lvl];
            if (titleData) {
                currentTitle = titleData;
                break;
            }
        }
        
        // Get next title
        let nextTitle = null;
        for (let lvl = stats.level + 1; lvl <= MAX_PLAYER_LEVEL; lvl++) {
            if (PLAYER_TITLES[lvl]) {
                nextTitle = { level: lvl, ...PLAYER_TITLES[lvl] };
                break;
            }
        }
        
        // Format prestige
        const prestigeText = stats.prestigeLevel > 0 
            ? `Престиж ${stats.prestigeLevel} (+${(stats.prestigeLevel * 10)}%)` 
            : "Нет престижа";
        
        // Calculate XP per minute display
        const xpPerMin = Math.round(realTimeStats.experiencePerMinute);
        const xpPerMinText = xpPerMin > 0 ? `+${xpPerMin} XP/мин` : "—";
        
        content.innerHTML = `
            <div class="progress-level-section">
                <div class="progress-level-badge">
                    <div class="progress-level-number">${stats.level}</div>
                </div>
                <div class="progress-title" style="color: ${currentTitle.color}">
                    <span class="progress-title-icon">${currentTitle.icon}</span>
                    ${currentTitle.title}
                </div>
            </div>
            
            <div class="progress-xp-bar-container">
                <div class="progress-xp-bar-bg">
                    <div class="progress-xp-bar-fill" style="width: ${xpProgress.percent}%"></div>
                </div>
                <div class="progress-xp-text">
                    ${xpProgress.current.toLocaleString()} / ${xpProgress.required.toLocaleString()} XP
                    <span class="progress-xp-percent">(${xpProgress.percent.toFixed(1)}%)</span>
                </div>
            </div>
            
            <div class="progress-stats-grid">
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${stats.totalExperience.toLocaleString()}</div>
                    <div class="progress-stat-label">ОБЩИЙ ОПЫТ</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${xpPerMinText}</div>
                    <div class="progress-stat-label">СКОРОСТЬ НАБОРА</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${prestigeText}</div>
                    <div class="progress-stat-label">ПРЕСТИЖ</div>
                </div>
                <div class="progress-stat-card">
                    <div class="progress-stat-value">${this.playerProgression.getPlayTimeFormatted()}</div>
                    <div class="progress-stat-label">ВРЕМЯ В ИГРЕ</div>
                </div>
            </div>
            
            <div class="progress-bonuses-grid">
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.healthBonus}</div>
                    <div class="progress-bonus-label">ЗДОРОВЬЕ</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.damageBonus}</div>
                    <div class="progress-bonus-label">УРОН</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${bonuses.speedBonus.toFixed(1)}</div>
                    <div class="progress-bonus-label">СКОРОСТЬ</div>
                </div>
                <div class="progress-bonus-item">
                    <div class="progress-bonus-value">+${((bonuses.creditBonus - 1) * 100).toFixed(0)}%</div>
                    <div class="progress-bonus-label">КРЕДИТЫ</div>
                </div>
            </div>
            
            ${nextTitle ? `
            <div class="progress-next-level">
                <div class="progress-next-level-title">СЛЕДУЮЩИЙ РАНГ: УРОВЕНЬ ${nextTitle.level}</div>
                <div class="progress-next-level-rewards">
                    <span class="progress-reward" style="color: ${nextTitle.color}">
                        <span class="progress-reward-icon">${nextTitle.icon}</span>
                        ${nextTitle.title}
                    </span>
                    <span class="progress-reward">
                        <span class="progress-reward-icon">⭐</span>
                        +1 Очко навыков
                    </span>
                </div>
            </div>
            ` : `
            <div class="progress-next-level">
                <div class="progress-next-level-title" style="color: #ffd700">МАКСИМАЛЬНЫЙ УРОВЕНЬ ДОСТИГНУТ!</div>
            </div>
            `}
        `;
    }
    
    private achievementCategoryFilter: "all" | "combat" | "survival" | "progression" | "special" = "all";
    
    private renderAchievementsTab(): void {
        const content = document.getElementById("progress-achievements-content");
        if (!content || !this.playerProgression) return;
        
        const { unlocked, locked } = this.playerProgression.getAchievements();
        const allAchievements = [...unlocked, ...locked];
        
        // Filter by category
        const filtered = this.achievementCategoryFilter === "all" 
            ? allAchievements 
            : allAchievements.filter(a => a.category === this.achievementCategoryFilter);
        
        // Category counts
        const categoryCounts = {
            all: allAchievements.length,
            combat: allAchievements.filter(a => a.category === "combat").length,
            survival: allAchievements.filter(a => a.category === "survival").length,
            progression: allAchievements.filter(a => a.category === "progression").length,
            special: allAchievements.filter(a => a.category === "special").length
        };
        
        const unlockedCount = unlocked.length;
        const totalCount = allAchievements.length;
        
        content.innerHTML = `
            <div style="margin-bottom: 15px; text-align: center; color: #0f0; font-size: 11px;">
                Разблокировано: ${unlockedCount} / ${totalCount}
            </div>
            
            <div class="achievements-category-tabs">
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'all' ? 'active' : ''}" data-category="all">
                    ВСЕ (${categoryCounts.all})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'combat' ? 'active' : ''}" data-category="combat">
                    ⚔ БОЙ (${categoryCounts.combat})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'survival' ? 'active' : ''}" data-category="survival">
                    🛡 ВЫЖИВАНИЕ (${categoryCounts.survival})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'progression' ? 'active' : ''}" data-category="progression">
                    📈 ПРОГРЕСС (${categoryCounts.progression})
                </button>
                <button class="achievement-category-btn ${this.achievementCategoryFilter === 'special' ? 'active' : ''}" data-category="special">
                    ⭐ ОСОБЫЕ (${categoryCounts.special})
                </button>
            </div>
            
            <div class="achievements-grid">
                ${filtered.map(achievement => {
                    const isUnlocked = unlocked.some((u: PlayerAchievement) => u.id === achievement.id);
                    return `
                        <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'} tier-${achievement.tier}">
                            <div class="achievement-header">
                                <span class="achievement-icon">${achievement.icon}</span>
                                <span class="achievement-name">${achievement.name}</span>
                                <span class="achievement-tier ${achievement.tier}">${achievement.tier.toUpperCase()}</span>
                            </div>
                            <div class="achievement-description">${achievement.description}</div>
                            <div class="achievement-reward">
                                <span>💰 ${achievement.reward.credits}</span>
                                <span>⭐ ${achievement.reward.exp} XP</span>
                                ${achievement.reward.skillPoints ? `<span>🔧 +${achievement.reward.skillPoints} SP</span>` : ''}
                            </div>
                            <span class="achievement-status">${isUnlocked ? '✅' : '🔒'}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        // Setup category filter buttons
        content.querySelectorAll(".achievement-category-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                this.achievementCategoryFilter = (btn as HTMLElement).dataset.category as any;
                this.renderAchievementsTab();
            });
        });
    }
    
    private renderQuestsTab(): void {
        const content = document.getElementById("progress-quests-content");
        if (!content || !this.playerProgression) return;
        
        const stats = this.playerProgression.getStats();
        const dailyQuests: DailyQuest[] = stats.dailyQuests || [];
        
        // Calculate time until daily reset (assumes reset at midnight)
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const timeUntilReset = tomorrow.getTime() - now.getTime();
        const hoursLeft = Math.floor(timeUntilReset / (1000 * 60 * 60));
        const minutesLeft = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
        
        if (dailyQuests.length === 0) {
            content.innerHTML = `
                <div class="quests-header">
                    <div class="quests-title">ЕЖЕДНЕВНЫЕ ЗАДАНИЯ</div>
                    <div class="quests-reset-timer">Обновление через: ${hoursLeft}ч ${minutesLeft}м</div>
                </div>
                <div class="no-quests-message">
                    Нет активных заданий.<br>
                    Задания обновляются ежедневно в полночь.
                </div>
            `;
            return;
        }
        
        const completedCount = dailyQuests.filter(q => q.completed).length;
        
        content.innerHTML = `
            <div class="quests-header">
                <div class="quests-title">ЕЖЕДНЕВНЫЕ ЗАДАНИЯ (${completedCount}/${dailyQuests.length})</div>
                <div class="quests-reset-timer">Обновление через: ${hoursLeft}ч ${minutesLeft}м</div>
            </div>
            
            ${dailyQuests.map(quest => {
                const progressPercent = Math.min(100, (quest.progress / quest.target) * 100);
                return `
                    <div class="quest-card ${quest.completed ? 'completed' : ''}">
                        <div class="quest-header">
                            <span class="quest-name">${quest.name}</span>
                            <span class="quest-status-icon">${quest.completed ? '✅' : '⏳'}</span>
                        </div>
                        <div class="quest-description">${quest.description}</div>
                        <div class="quest-progress-bar-bg">
                            <div class="quest-progress-bar-fill" style="width: ${progressPercent}%"></div>
                            <span class="quest-progress-text">${quest.progress} / ${quest.target}</span>
                        </div>
                        <div class="quest-rewards">
                            <span class="quest-reward">
                                <span class="quest-reward-icon">💰</span>${quest.reward.credits}
                            </span>
                            <span class="quest-reward">
                                <span class="quest-reward-icon">⭐</span>${quest.reward.exp} XP
                            </span>
                        </div>
                    </div>
                `;
            }).join('')}
        `;
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
                
                <div class="map-grid">
                    <div class="map-card recommended" id="btn-map-normal">
                        <span class="map-card-icon">🗺</span>
                        <span class="map-card-name">${L.normalMap}</span>
                        <span class="map-card-desc">${L.normalMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-sandbox">
                        <span class="map-card-icon">🏖</span>
                        <span class="map-card-name">${L.sandboxMap}</span>
                        <span class="map-card-desc">${L.sandboxMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-sand">
                        <span class="map-card-icon">🏜</span>
                        <span class="map-card-name">${L.sandMap}</span>
                        <span class="map-card-desc">${L.sandMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-madness">
                        <span class="map-card-icon">🌉</span>
                        <span class="map-card-name">${L.madnessMap}</span>
                        <span class="map-card-desc">${L.madnessMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-expo">
                        <span class="map-card-icon">🏆</span>
                        <span class="map-card-name">${L.expoMap}</span>
                        <span class="map-card-desc">${L.expoMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-brest">
                        <span class="map-card-icon">🏰</span>
                        <span class="map-card-name">${L.brestMap}</span>
                        <span class="map-card-desc">${L.brestMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-arena">
                        <span class="map-card-icon">⚔️</span>
                        <span class="map-card-name">${L.arenaMap}</span>
                        <span class="map-card-desc">${L.arenaMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-polygon">
                        <span class="map-card-icon">🎯</span>
                        <span class="map-card-name">${L.polygonMap}</span>
                        <span class="map-card-desc">${L.polygonMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-frontline">
                        <span class="map-card-icon">💥</span>
                        <span class="map-card-name">${L.frontlineMap}</span>
                        <span class="map-card-desc">${L.frontlineMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-ruins">
                        <span class="map-card-icon">🏚</span>
                        <span class="map-card-name">${L.ruinsMap}</span>
                        <span class="map-card-desc">${L.ruinsMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-canyon">
                        <span class="map-card-icon">⛰</span>
                        <span class="map-card-name">${L.canyonMap}</span>
                        <span class="map-card-desc">${L.canyonMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-industrial">
                        <span class="map-card-icon">🏭</span>
                        <span class="map-card-name">${L.industrialMap}</span>
                        <span class="map-card-desc">${L.industrialMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-urban_warfare">
                        <span class="map-card-icon">🏙</span>
                        <span class="map-card-name">${L.urbanWarfareMap}</span>
                        <span class="map-card-desc">${L.urbanWarfareMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-underground">
                        <span class="map-card-icon">🕳</span>
                        <span class="map-card-name">${L.undergroundMap}</span>
                        <span class="map-card-desc">${L.undergroundMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-coastal">
                        <span class="map-card-icon">🌊</span>
                        <span class="map-card-name">${L.coastalMap}</span>
                        <span class="map-card-desc">${L.coastalMapDesc}</span>
                    </div>
                    <div class="map-card" id="btn-map-tartaria">
                        <span class="map-card-new">NEW</span>
                        <span class="map-card-icon">🏛</span>
                        <span class="map-card-name">${L.tartariaMap}</span>
                        <span class="map-card-desc">${L.tartariaMapDesc}</span>
                    </div>
                </div>
                
                <div class="panel-buttons" style="margin-top: 20px;">
                    <button class="panel-btn" id="map-selection-back">Назад</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(this.mapSelectionPanel);
        
        const addMapButtonHandler = (mapId: string, mapType: MapType) => {
            document.getElementById(mapId)?.addEventListener("click", () => {
                
                this.hide();
                this.hideMapSelection();
                if (this.onStartGame && typeof this.onStartGame === 'function') {
                    
                    this.onStartGame(mapType);
                } else {
                    console.error("[Menu] onStartGame callback is not set!");
                }
            });
        };
        
        addMapButtonHandler("btn-map-normal", "normal");
        addMapButtonHandler("btn-map-sandbox", "sandbox");
        addMapButtonHandler("btn-map-sand", "sand");
        addMapButtonHandler("btn-map-madness", "madness");
        addMapButtonHandler("btn-map-expo", "expo");
        addMapButtonHandler("btn-map-brest", "brest");
        addMapButtonHandler("btn-map-arena", "arena");
        addMapButtonHandler("btn-map-polygon", "polygon");
        addMapButtonHandler("btn-map-frontline", "frontline");
        addMapButtonHandler("btn-map-ruins", "ruins");
        addMapButtonHandler("btn-map-canyon", "canyon");
        addMapButtonHandler("btn-map-industrial", "industrial");
        addMapButtonHandler("btn-map-urban_warfare", "urban_warfare");
        addMapButtonHandler("btn-map-underground", "underground");
        addMapButtonHandler("btn-map-coastal", "coastal");
        addMapButtonHandler("btn-map-tartaria", "tartaria");
        
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
                <div class="panel-content" style="position: relative; min-height: 100vh; height: 100%;">
                <div class="panel-title">${L.play || "ИГРАТЬ"}</div>
                
                <!-- 1. Выбор типа игры (Одиночная / Мультиплеер) -->
                <div class="play-window" id="play-window-mode" data-order="0" data-step="0" style="display: none;">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/type</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="close" data-step="0">✕</button>
                        </div>
                    </div>
                    <div class="section-title">1. Выбор типа игры</div>
                    <div class="mode-buttons" style="display: flex; flex-direction: column; gap: 15px; margin-top: 20px;">
                        <button class="menu-btn play-btn game-type-btn" id="btn-type-single" data-type="single" style="padding: 25px 20px;">
                            <span class="btn-icon" style="font-size: 32px;">🎮</span>
                            <span class="btn-label" style="font-size: 16px;">ОДИНОЧНАЯ ИГРА</span>
                        </button>
                        <button class="menu-btn play-btn game-type-btn" id="btn-type-multiplayer" data-type="multiplayer" style="padding: 25px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                            <span class="btn-icon" style="font-size: 32px;">🌐</span>
                            <span class="btn-label" style="font-size: 16px;">МУЛЬТИПЛЕЕР</span>
                        </button>
                    </div>
                </div>
                
                <!-- 2. Выбор режима игры -->
                <div class="play-window" id="play-window-gamemode" data-order="1" data-step="1" style="display: none;">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/single/mode</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="1">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="1">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="1">✕</button>
                        </div>
                    </div>
                    <div class="section-title">2. Выбор режима игры</div>
                    <div class="gamemode-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 15px;">
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-ffa" data-gamemode="ffa">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-label">Free-for-All</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-tdm" data-gamemode="tdm">
                            <span class="btn-icon">👥</span>
                            <span class="btn-label">Team Deathmatch</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-coop" data-gamemode="coop">
                            <span class="btn-icon">🤝</span>
                            <span class="btn-label">Co-op PvE</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-br" data-gamemode="battle_royale">
                            <span class="btn-icon">👑</span>
                            <span class="btn-label">Battle Royale</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-ctf" data-gamemode="ctf">
                            <span class="btn-icon">🚩</span>
                            <span class="btn-label">Capture the Flag</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-control-point" data-gamemode="control_point">
                            <span class="btn-icon">📍</span>
                            <span class="btn-label">Control Point</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-escort" data-gamemode="escort">
                            <span class="btn-icon">🚛</span>
                            <span class="btn-label">Escort</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-survival" data-gamemode="survival">
                            <span class="btn-icon">⚔️</span>
                            <span class="btn-label">Survival</span>
                        </button>
                        <button class="menu-btn secondary gamemode-btn" id="btn-gamemode-raid" data-gamemode="raid">
                            <span class="btn-icon">👹</span>
                            <span class="btn-label">Raid</span>
                        </button>
                    </div>
                </div>
                
                <!-- 1.5. Мультиплеер меню -->
                <div class="play-window" id="play-window-multiplayer" data-order="0.5" data-step="0.5" style="display: none;">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/multiplayer</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="0.5">⟵</button>
                            <button class="window-btn" data-nav="close" data-step="0.5">✕</button>
                        </div>
                    </div>
                    <div class="section-title">🌐 МУЛЬТИПЛЕЕР</div>
                    
                    <!-- Статус подключения -->
                    <div id="mp-status-container" style="margin: 15px 0; padding: 15px; background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(20, 20, 30, 0.4) 100%); border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span id="mp-connection-indicator" style="width: 10px; height: 10px; border-radius: 50%; background: #888; display: inline-block;"></span>
                                <span id="mp-connection-status" style="font-size: 13px; font-weight: 500; color: #aaa;">Не подключен</span>
                            </div>
                            <span id="mp-ping" style="font-size: 11px; color: #666; font-family: monospace; display: none;">---ms</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <div id="mp-server-info" style="font-size: 11px; color: #666; font-family: monospace;">
                                    ws://localhost:8080
                                </div>
                                <div id="mp-server-hint" style="font-size: 9px; color: #888; font-style: italic; max-width: 300px;">
                                    Для подключения с другого ПК используйте IP-адрес сервера вместо localhost
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="mp-btn-test-connection" class="panel-btn" style="padding: 4px 12px; font-size: 11px; display: inline-block;" title="Проверить подключение к серверу">
                                    🔍 Проверить
                                </button>
                                <button id="mp-btn-reconnect" class="panel-btn" style="padding: 4px 12px; font-size: 11px; display: none;">
                                    🔄 Переподключиться
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Выбор режима игры -->
                    <div style="margin: 20px 0;">
                        <div style="font-weight: bold; margin-bottom: 12px; font-size: 14px; color: #fff;">Выберите режим:</div>
                        <div class="mp-mode-buttons" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-ffa" data-mp-mode="ffa" data-mp-desc="Каждый сам за себя. Побеждает игрок с наибольшим количеством убийств.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">⚔️</span>
                                        <span class="btn-label" style="font-weight: 600;">Free-for-All</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">PvP до последнего</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-tdm" data-mp-mode="tdm" data-mp-desc="Командная битва. Две команды сражаются за победу.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">👥</span>
                                        <span class="btn-label" style="font-weight: 600;">Team Deathmatch</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Командная битва</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-coop" data-mp-mode="coop" data-mp-desc="Кооператив против ИИ. Сражайтесь вместе с друзьями.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">🤝</span>
                                        <span class="btn-label" style="font-weight: 600;">Co-op PvE</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Против ИИ</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-br" data-mp-mode="battle_royale" data-mp-desc="Королевская битва. Безопасная зона сужается. Последний выживший побеждает.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">👑</span>
                                        <span class="btn-label" style="font-weight: 600;">Battle Royale</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Последний выживший</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-ctf" data-mp-mode="ctf" data-mp-desc="Захват флага. Захватите флаг противника и доставьте на свою базу." style="grid-column: 1 / -1;">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">🚩</span>
                                        <span class="btn-label" style="font-weight: 600;">Capture the Flag</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Захват флага противника</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-control-point" data-mp-mode="control_point" data-mp-desc="Захват контрольных точек. Команда, захватившая большинство точек, побеждает.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">📍</span>
                                        <span class="btn-label" style="font-weight: 600;">Control Point</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Захват контрольных точек</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-escort" data-mp-mode="escort" data-mp-desc="Охрана конвоя. Одна команда защищает, другая атакует. Доставьте цель до финиша или уничтожьте её.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">🚛</span>
                                        <span class="btn-label" style="font-weight: 600;">Escort</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Охрана конвоя</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-survival" data-mp-mode="survival" data-mp-desc="Выживание. Кооперативный режим против волн врагов. Выживите как можно дольше.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">⚔️</span>
                                        <span class="btn-label" style="font-weight: 600;">Survival</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Волны врагов</span>
                                </div>
                            </button>
                            <button class="menu-btn secondary mp-mode-btn" id="mp-btn-raid" data-mp-mode="raid" data-mp-desc="Рейд. Кооперативный режим против мощных боссов. Победите всех боссов для победы.">
                                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span class="btn-icon">👹</span>
                                        <span class="btn-label" style="font-weight: 600;">Raid</span>
                                    </div>
                                    <span style="font-size: 10px; opacity: 0.7; text-align: left; line-height: 1.2;">Против боссов</span>
                                </div>
                            </button>
                        </div>
                        <!-- Описание выбранного режима -->
                        <div id="mp-mode-description" style="margin-top: 12px; padding: 10px; background: rgba(102, 126, 234, 0.1); border-radius: 5px; border-left: 3px solid #667eea; font-size: 12px; color: #aaa; line-height: 1.4; display: none;">
                            <span id="mp-mode-desc-text"></span>
                        </div>
                    </div>
                    
                    <!-- Кнопки действий -->
                    <div style="margin: 20px 0;">
                        <div style="display: flex; gap: 10px; flex-direction: column;">
                            <button class="panel-btn primary" id="mp-btn-quick-play" style="width: 100%; padding: 14px; font-size: 16px; font-weight: bold; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4); transition: all 0.2s;">
                                🔍 БЫСТРЫЙ ПОИСК
                            </button>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button class="panel-btn" id="mp-btn-create-room" style="padding: 12px; transition: all 0.2s;">
                                    ➕ Создать комнату
                                </button>
                                <button class="panel-btn" id="mp-btn-join-room" style="padding: 12px; transition: all 0.2s;">
                                    🔗 Присоединиться
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Модальное окно для присоединения к комнате -->
                    <div id="mp-join-room-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 100005 !important; align-items: center; justify-content: center; pointer-events: auto;">
                        <div style="background: linear-gradient(135deg, rgba(20, 20, 30, 0.95) 0%, rgba(30, 30, 40, 0.95) 100%); border: 2px solid #667eea; border-radius: 12px; padding: 30px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); position: relative; z-index: 100006;">
                            <div style="font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #fff;">Присоединиться к комнате</div>
                            <div style="margin-bottom: 20px;">
                                <label style="display: block; font-size: 12px; color: #aaa; margin-bottom: 8px;">ID комнаты:</label>
                                <input type="text" id="mp-room-id-input" placeholder="Введите ID комнаты" style="width: 100%; padding: 12px; background: rgba(0, 0, 0, 0.4); border: 1px solid #444; border-radius: 6px; color: #fff; font-family: monospace; font-size: 14px; outline: none; transition: border-color 0.2s;" />
                                <div id="mp-room-id-error" style="display: none; color: #ef4444; font-size: 11px; margin-top: 6px;"></div>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button id="mp-modal-join-btn" class="panel-btn primary" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none;">
                                    Присоединиться
                                </button>
                                <button id="mp-modal-cancel-btn" class="panel-btn" style="flex: 1; padding: 12px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;">
                                    Отмена
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Модальное окно с детальной информацией о комнате -->
                    <div id="mp-room-details-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.85); z-index: 100007 !important; align-items: center; justify-content: center; pointer-events: auto; overflow-y: auto;">
                        <div style="background: linear-gradient(135deg, rgba(20, 20, 30, 0.98) 0%, rgba(30, 30, 40, 0.98) 100%); border: 2px solid #667eea; border-radius: 16px; padding: 30px; max-width: 500px; width: 90%; max-height: 90vh; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6); position: relative; z-index: 100008; margin: 20px 0;">
                            <!-- Заголовок -->
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid rgba(102, 126, 234, 0.3);">
                                <div style="font-size: 20px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 10px;">
                                    <span>🏠</span>
                                    <span>Детали комнаты</span>
                                </div>
                                <button id="mp-room-details-close" style="width: 32px; height: 32px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px; color: #ef4444; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Закрыть">
                                    ×
                                </button>
                            </div>
                            
                            <!-- Основная информация -->
                            <div style="margin-bottom: 20px;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);">
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">ID комнаты</div>
                                        <div id="mp-room-details-id" style="font-size: 16px; font-weight: bold; color: #a78bfa; font-family: monospace;">-</div>
                                    </div>
                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);">
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Режим</div>
                                        <div id="mp-room-details-mode" style="font-size: 16px; font-weight: bold; color: #667eea;">-</div>
                                    </div>
                                </div>
                                
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);">
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Игроков</div>
                                        <div id="mp-room-details-players" style="font-size: 16px; font-weight: bold; color: #4ade80;">-</div>
                                    </div>
                                    <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2);">
                                        <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Статус</div>
                                        <div id="mp-room-details-status" style="font-size: 16px; font-weight: bold; color: #a78bfa;">-</div>
                                    </div>
                                </div>
                                
                                <div style="background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border: 1px solid rgba(102, 126, 234, 0.2); margin-bottom: 15px;">
                                    <div style="font-size: 11px; color: #888; margin-bottom: 4px;">Время игры</div>
                                    <div id="mp-room-details-time" style="font-size: 14px; color: #aaa; font-family: monospace;">-</div>
                                </div>
                            </div>
                            
                            <!-- Прогресс-бар заполненности -->
                            <div style="margin-bottom: 20px;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="font-size: 12px; color: #aaa;">Заполненность</span>
                                    <span id="mp-room-details-progress-text" style="font-size: 12px; color: #4ade80; font-weight: 600;">-</span>
                                </div>
                                <div style="width: 100%; height: 8px; background: rgba(0, 0, 0, 0.4); border-radius: 4px; overflow: hidden;">
                                    <div id="mp-room-details-progress-bar" style="height: 100%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%); width: 0%; transition: width 0.3s; border-radius: 4px;"></div>
                                </div>
                            </div>
                            
                            <!-- Кнопки действий -->
                            <div style="display: flex; gap: 10px; margin-top: 25px;">
                                <button id="mp-room-details-join" class="panel-btn primary" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; font-size: 14px; font-weight: 600;">
                                    🎮 Присоединиться
                                </button>
                                <button id="mp-room-details-copy-id" class="panel-btn" style="padding: 14px; background: rgba(102, 126, 234, 0.2); border-color: #667eea; color: #a78bfa; min-width: 50px;" title="Копировать ID">
                                    📋
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Информация о поиске матча -->
                    <div id="mp-queue-info" style="display: none; margin: 15px 0; padding: 15px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%); border-radius: 8px; border: 1px solid #667eea; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div id="mp-queue-pulse" style="width: 12px; height: 12px; border-radius: 50%; background: #667eea; animation: pulse 2s infinite; box-shadow: 0 0 8px rgba(102, 126, 234, 0.6);"></div>
                                <span style="font-weight: bold; color: #667eea; font-size: 14px;">Поиск матча...</span>
                            </div>
                            <span id="mp-queue-timer" style="font-size: 12px; color: #aaa; font-family: monospace;">00:00</span>
                        </div>
                        <div id="mp-queue-details" style="font-size: 12px; color: #aaa; margin-bottom: 10px; line-height: 1.6;">
                            <div>Режим: <span id="mp-queue-mode" style="color: #fff; font-weight: 600;">-</span></div>
                            <div>Игроков в очереди: <span id="mp-queue-size" style="color: #4ade80; font-weight: 600;">-</span></div>
                            <div id="mp-queue-estimated" style="margin-top: 5px; opacity: 0.8;">Примерное время ожидания: <span id="mp-queue-estimated-time">-</span></div>
                        </div>
                        <button class="panel-btn" id="mp-btn-cancel-queue" style="width: 100%; padding: 10px; font-size: 14px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;">
                            ❌ Отменить поиск
                        </button>
                    </div>
                    
                    <!-- Список доступных комнат -->
                    <div id="mp-rooms-list" style="margin: 15px 0; padding: 15px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.15) 0%, rgba(118, 75, 162, 0.15) 100%); border-radius: 8px; border: 1px solid #667eea; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="font-weight: bold; color: #667eea; font-size: 14px;">📋 Доступные комнаты</div>
                            <button id="mp-btn-refresh-rooms" style="padding: 4px 8px; font-size: 10px; background: rgba(102, 126, 234, 0.3); border: 1px solid #667eea; border-radius: 4px; color: #a78bfa; cursor: pointer; transition: all 0.2s;" title="Обновить список">
                                🔄
                            </button>
                        </div>
                        <div id="mp-rooms-items" style="display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #667eea rgba(0, 0, 0, 0.3);">
                            <div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">Загрузка списка комнат...</div>
                        </div>
                    </div>
                    
                    <!-- Информация о текущей комнате -->
                    <div id="mp-room-info" style="display: none; margin: 15px 0; padding: 15px; background: linear-gradient(135deg, rgba(118, 75, 162, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%); border-radius: 8px; border: 1px solid #764ba2; box-shadow: 0 2px 8px rgba(118, 75, 162, 0.3);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                            <div style="font-weight: bold; color: #764ba2; font-size: 14px;">🏠 Текущая комната</div>
                            <span id="mp-room-players-count" style="font-size: 11px; color: #aaa; background: rgba(0, 0, 0, 0.3); padding: 4px 8px; border-radius: 4px;">0/32</span>
                        </div>
                        <div id="mp-room-details" style="font-size: 12px; color: #aaa; margin-bottom: 12px; line-height: 1.6;">
                            <div>Режим: <span id="mp-room-mode" style="color: #fff; font-weight: 600;">-</span></div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">
                                <span>ID комнаты:</span>
                                <span id="mp-room-id" style="color: #a78bfa; font-family: monospace; font-weight: 600; flex: 1;">-</span>
                                <button id="mp-btn-copy-room-id" style="padding: 4px 8px; font-size: 10px; background: rgba(118, 75, 162, 0.3); border: 1px solid #764ba2; border-radius: 4px; color: #a78bfa; cursor: pointer; transition: all 0.2s;" title="Копировать ID">
                                    📋
                                </button>
                            </div>
                            <div id="mp-room-status" style="margin-top: 8px; padding: 6px; background: rgba(0, 0, 0, 0.2); border-radius: 4px;">
                                <span id="mp-room-status-text" style="color: #4ade80;">Ожидание игроков...</span>
                            </div>
                        </div>
                        
                        <!-- Список игроков в комнате -->
                        <div id="mp-room-players-list" style="margin-top: 12px; margin-bottom: 12px; max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #764ba2 rgba(0, 0, 0, 0.3);">
                            <div style="font-size: 11px; color: #888; margin-bottom: 6px; font-weight: 600;">Игроки в комнате:</div>
                            <div id="mp-room-players-items" style="display: flex; flex-direction: column; gap: 4px;">
                                <!-- Игроки будут добавлены динамически -->
                            </div>
                        </div>
                        
                        <button class="panel-btn primary battle-btn" id="mp-btn-start-game" style="display: none; width: 100%; padding: 12px; font-size: 16px; font-weight: bold; margin-bottom: 10px; position: relative; overflow: hidden;">
                            <span class="battle-btn-text">⚔️ В БОЙ!</span>
                            <span class="battle-btn-shine"></span>
                        </button>
                        
                        <button class="panel-btn" id="mp-btn-leave-room" style="width: 100%; padding: 10px; font-size: 14px; background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444;">
                            🚪 Покинуть комнату
                        </button>
                    </div>
                    
                    <!-- Сообщения об ошибках -->
                    <div id="mp-error-message" style="display: none; margin: 15px 0; padding: 12px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; border: 1px solid #ef4444; animation: fadeIn 0.3s ease;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 18px;">⚠️</span>
                            <span style="font-weight: bold; color: #ef4444;">Ошибка</span>
                        </div>
                        <div id="mp-error-text" style="font-size: 12px; color: #ffaaaa; line-height: 1.4;">
                        </div>
                    </div>
                    
                    <style>
                        @keyframes pulse {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.7; transform: scale(1.1); }
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: translateY(-10px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        
                        /* Анимации для кнопки "В БОЙ!" */
                        @keyframes battlePulse {
                            0%, 100% { 
                                box-shadow: 0 0 20px rgba(74, 222, 128, 0.6),
                                           0 0 40px rgba(74, 222, 128, 0.4),
                                           0 0 60px rgba(74, 222, 128, 0.2);
                                transform: scale(1);
                            }
                            50% { 
                                box-shadow: 0 0 30px rgba(74, 222, 128, 0.8),
                                           0 0 60px rgba(74, 222, 128, 0.6),
                                           0 0 90px rgba(74, 222, 128, 0.4);
                                transform: scale(1.02);
                            }
                        }
                        
                        @keyframes battleShine {
                            0% {
                                transform: translateX(-100%) translateY(-100%) rotate(45deg);
                            }
                            100% {
                                transform: translateX(200%) translateY(200%) rotate(45deg);
                            }
                        }
                        
                        @keyframes battleGradient {
                            0% {
                                background-position: 0% 50%;
                            }
                            50% {
                                background-position: 100% 50%;
                            }
                            100% {
                                background-position: 0% 50%;
                            }
                        }
                        
                        @keyframes battleConstruction {
                            0% {
                                background-position: -100% 0;
                            }
                            100% {
                                background-position: 200% 0;
                            }
                        }
                        
                        @keyframes battleTextGlow {
                            0%, 100% {
                                text-shadow: 0 0 10px rgba(74, 222, 128, 0.8),
                                            0 0 20px rgba(74, 222, 128, 0.6),
                                            0 0 30px rgba(74, 222, 128, 0.4);
                            }
                            50% {
                                text-shadow: 0 0 15px rgba(74, 222, 128, 1),
                                            0 0 30px rgba(74, 222, 128, 0.8),
                                            0 0 45px rgba(74, 222, 128, 0.6);
                            }
                        }
                        
                        /* Стили кнопки "В БОЙ!" */
                        .battle-btn {
                            background: linear-gradient(135deg, 
                                rgba(74, 222, 128, 0.4) 0%, 
                                rgba(34, 197, 94, 0.4) 50%,
                                rgba(74, 222, 128, 0.4) 100%);
                            background-size: 200% 200%;
                            border: 2px solid #4ade80;
                            color: #4ade80;
                            cursor: pointer;
                            position: relative;
                            overflow: hidden;
                            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            animation: battleGradient 3s ease infinite, battlePulse 2s ease-in-out infinite;
                        }
                        
                        .battle-btn::before {
                            content: '';
                            position: absolute;
                            top: 0;
                            left: -100%;
                            width: 100%;
                            height: 100%;
                            background: repeating-linear-gradient(
                                45deg,
                                transparent,
                                transparent 10px,
                                rgba(255, 255, 255, 0.1) 10px,
                                rgba(255, 255, 255, 0.1) 20px
                            );
                            animation: battleConstruction 3s linear infinite;
                            pointer-events: none;
                        }
                        
                        .battle-btn-text {
                            position: relative;
                            z-index: 2;
                            display: block;
                            animation: battleTextGlow 2s ease-in-out infinite;
                        }
                        
                        .battle-btn-shine {
                            position: absolute;
                            top: -50%;
                            left: -50%;
                            width: 200%;
                            height: 200%;
                            background: linear-gradient(
                                45deg,
                                transparent 30%,
                                rgba(255, 255, 255, 0.3) 50%,
                                transparent 70%
                            );
                            animation: battleShine 3s ease-in-out infinite;
                            pointer-events: none;
                            z-index: 1;
                        }
                        
                        .battle-btn:hover {
                            transform: scale(1.05) translateY(-2px);
                            box-shadow: 0 0 40px rgba(74, 222, 128, 0.8),
                                       0 0 80px rgba(74, 222, 128, 0.6),
                                       0 0 120px rgba(74, 222, 128, 0.4);
                            border-color: #22c55e;
                            background: linear-gradient(135deg, 
                                rgba(74, 222, 128, 0.6) 0%, 
                                rgba(34, 197, 94, 0.6) 50%,
                                rgba(74, 222, 128, 0.6) 100%);
                            background-size: 200% 200%;
                        }
                        
                        .battle-btn:active {
                            transform: scale(0.98) translateY(0);
                            animation: none;
                        }
                        
                        .battle-btn-ready {
                            animation: battleGradient 3s ease infinite, battlePulse 2s ease-in-out infinite;
                        }
                        .mp-mode-btn {
                            transition: all 0.2s ease;
                            text-align: left;
                        }
                        .mp-mode-btn:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                        }
                        .mp-mode-btn.active {
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            border-color: #667eea;
                            box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
                        }
                        #mp-join-room-modal {
                            animation: fadeIn 0.2s ease;
                            z-index: 100005 !important;
                            position: fixed !important;
                            pointer-events: auto !important;
                        }
                        #mp-join-room-modal > div {
                            position: relative;
                            z-index: 100006;
                            pointer-events: auto;
                        }
                        #mp-join-room-modal input:focus {
                            border-color: #667eea;
                            box-shadow: 0 0 8px rgba(102, 126, 234, 0.4);
                        }
                        
                        /* Стили для детального меню комнаты */
                        #mp-room-details-modal {
                            animation: fadeIn 0.3s ease;
                        }
                        
                        #mp-room-details-modal > div {
                            animation: slideUp 0.3s ease;
                        }
                        
                        #mp-room-details-close:hover {
                            background: rgba(239, 68, 68, 0.4) !important;
                            transform: scale(1.1);
                        }
                        
                        #mp-room-details-join:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                        }
                        
                        #mp-room-details-copy-id:hover {
                            background: rgba(102, 126, 234, 0.3) !important;
                            transform: scale(1.1);
                        }
                        
                        @keyframes slideUp {
                            from {
                                opacity: 0;
                                transform: translateY(20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }
                    </style>
                </div>
                
                <!-- 3. Выбор карты -->
                <div class="play-window play-window-wide" id="play-window-map" data-order="2" data-step="2">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/single/mode/map</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="2">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="2">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="2">✕</button>
                        </div>
                    </div>
                    <div class="section-title">3. Выбор карты</div>
                    <div class="map-grid">
                        <div class="map-card recommended" id="play-btn-map-normal" data-map="normal">
                            <span class="map-card-icon">🗺</span>
                            <span class="map-card-name">${L.normalMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-sandbox" data-map="sandbox">
                            <span class="map-card-icon">🏖</span>
                            <span class="map-card-name">${L.sandboxMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-sand" data-map="sand">
                            <span class="map-card-icon">🏜</span>
                            <span class="map-card-name">${L.sandMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-madness" data-map="madness">
                            <span class="map-card-icon">🌉</span>
                            <span class="map-card-name">${L.madnessMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-expo" data-map="expo">
                            <span class="map-card-icon">🏆</span>
                            <span class="map-card-name">${L.expoMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-brest" data-map="brest">
                            <span class="map-card-icon">🏰</span>
                            <span class="map-card-name">${L.brestMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-arena" data-map="arena">
                            <span class="map-card-icon">⚔️</span>
                            <span class="map-card-name">${L.arenaMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-polygon" data-map="polygon">
                            <span class="map-card-icon">🎯</span>
                            <span class="map-card-name">${L.polygonMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-frontline" data-map="frontline">
                            <span class="map-card-icon">💥</span>
                            <span class="map-card-name">${L.frontlineMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-ruins" data-map="ruins">
                            <span class="map-card-icon">🏚</span>
                            <span class="map-card-name">${L.ruinsMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-canyon" data-map="canyon">
                            <span class="map-card-icon">⛰</span>
                            <span class="map-card-name">${L.canyonMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-industrial" data-map="industrial">
                            <span class="map-card-icon">🏭</span>
                            <span class="map-card-name">${L.industrialMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-urban_warfare" data-map="urban_warfare">
                            <span class="map-card-icon">🏙</span>
                            <span class="map-card-name">${L.urbanWarfareMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-underground" data-map="underground">
                            <span class="map-card-icon">🕳</span>
                            <span class="map-card-name">${L.undergroundMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-coastal" data-map="coastal">
                            <span class="map-card-icon">🌊</span>
                            <span class="map-card-name">${L.coastalMap}</span>
                        </div>
                        <div class="map-card" id="play-btn-map-tartaria" data-map="tartaria">
                            <span class="map-card-new">NEW</span>
                            <span class="map-card-icon">🏛</span>
                            <span class="map-card-name">${L.tartariaMap}</span>
                        </div>
                    </div>
                    <!-- Динамически добавляем сохраненные карты -->
                    <div id="custom-maps-container" style="margin-top: 20px;"></div>
                </div>
                
                <!-- 4. Выбор танка -->
                <div class="play-window" id="play-window-tank" data-order="3" data-step="3">
                    <div class="play-window-header">
                        <div class="play-window-title">/[user_id]/single/mode/map/preset</div>
                        <div class="window-actions">
                            <button class="window-btn" data-nav="back" data-step="3">⟵</button>
                            <button class="window-btn" data-nav="forward" data-step="3">⟶</button>
                            <button class="window-btn" data-nav="close" data-step="3">✕</button>
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
        
        // Загружаем и отображаем сохраненные карты
        this.loadCustomMaps();
        
        // Обработчики выбора типа игры (шаг 1)
        document.getElementById("btn-type-single")?.addEventListener("click", () => this.selectGameType("single"));
        document.getElementById("btn-type-multiplayer")?.addEventListener("click", () => this.selectGameType("multiplayer"));
        
        // Обработчики выбора режима игры (шаг 2)
        document.getElementById("btn-gamemode-ffa")?.addEventListener("click", () => this.selectGameMode("ffa"));
        document.getElementById("btn-gamemode-tdm")?.addEventListener("click", () => this.selectGameMode("tdm"));
        document.getElementById("btn-gamemode-coop")?.addEventListener("click", () => this.selectGameMode("coop"));
        document.getElementById("btn-gamemode-br")?.addEventListener("click", () => this.selectGameMode("battle_royale"));
        document.getElementById("btn-gamemode-ctf")?.addEventListener("click", () => this.selectGameMode("ctf"));
        document.getElementById("btn-gamemode-control-point")?.addEventListener("click", () => this.selectGameMode("control_point"));
        document.getElementById("btn-gamemode-escort")?.addEventListener("click", () => this.selectGameMode("escort"));
        document.getElementById("btn-gamemode-survival")?.addEventListener("click", () => this.selectGameMode("survival"));
        document.getElementById("btn-gamemode-raid")?.addEventListener("click", () => this.selectGameMode("raid"));
        
        // Обработчики выбора карты
        const mapButtons = ["normal", "sandbox", "sand", "madness", "expo", "brest", "arena", "polygon", "frontline", "ruins", "canyon", "industrial", "urban_warfare", "underground", "coastal", "tartaria"];
        
        mapButtons.forEach(map => {
            const button = document.getElementById(`play-btn-map-${map}`);
            
            button?.addEventListener("click", () => {
                // Очищаем выбранную пользовательскую карту при выборе стандартной
                localStorage.removeItem("selectedCustomMapData");
                localStorage.removeItem("selectedCustomMapIndex");
                this.selectMap(map as MapType);
            });
        });
        
        // Обработчики навигации окон-терминалов
        document.querySelectorAll(".window-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const action = target.dataset.nav;
                const step = parseFloat(target.dataset.step || "0");
                // Специальная обработка для мультиплеер окна
                if (step === 0.5 && action === "back") {
                    this.showPlayWindow("play-window-mode", 0, 0);
                } else if (action === "back") {
                    this.navigatePlayStep(Math.floor(step) - 1);
                } else if (action === "forward") {
                    this.navigatePlayStep(Math.floor(step) + 1);
                } else if (action === "close") {
                    this.hidePlayMenu();
                }
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
        
        // Мультиплеер меню обработчики будут установлены в initMultiplayerMenu
        
        this.setupCloseButton("play-menu-back", () => this.hidePlayMenu());
        this.setupPanelCloseOnBackground(this.playMenuPanel, () => this.hidePlayMenu());
    }
    
    private populateTankOptions(): void {
        // Используем статически импортированные типы танков
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
    }
    
    /**
     * Нормализовать MapData к единому формату (совместимо с MapEditor)
     * Использует ту же структуру, что и MapEditor.MapData
     */
    private normalizeMapData(data: any): any | null {
        if (!data || typeof data !== "object" || !data.name) {
            return null;
        }
        
        const CURRENT_VERSION = 1;
        
        const normalized: any = {
            version: CURRENT_VERSION,
            name: String(data.name),
            mapType: data.mapType || "normal", // ОБЯЗАТЕЛЬНО: всегда должен быть mapType
            terrainEdits: Array.isArray(data.terrainEdits) ? data.terrainEdits : [],
            placedObjects: Array.isArray(data.placedObjects) ? data.placedObjects : [],
            triggers: Array.isArray(data.triggers) ? data.triggers : [],
            metadata: {
                createdAt: data.metadata?.createdAt || Date.now(),
                modifiedAt: data.metadata?.modifiedAt || Date.now(),
                author: data.metadata?.author,
                description: data.metadata?.description,
                isPreset: data.metadata?.isPreset !== undefined ? data.metadata.isPreset : data.name.startsWith("[Предустановленная]"),
                mapSize: data.metadata?.mapSize
            }
        };
        
        if (data.seed !== undefined) {
            normalized.seed = data.seed;
        }
        
        return normalized;
    }
    
    /**
     * Загрузить и отобразить сохраненные карты из редактора
     */
    private loadCustomMaps(): void {
        const container = document.getElementById("custom-maps-container");
        if (!container) return;
        
        // Очищаем контейнер перед загрузкой
        container.innerHTML = "";
        
        try {
            const saved = localStorage.getItem("savedMaps");
            if (!saved) {
                return;
            }
            
            const rawMaps: any[] = JSON.parse(saved);
            if (!Array.isArray(rawMaps) || rawMaps.length === 0) {
                return;
            }
            
            // Нормализуем все карты к единому формату
            const savedMaps = rawMaps.map(map => this.normalizeMapData(map)).filter((map): map is any => map !== null);
            
            if (savedMaps.length === 0) {
                return;
            }
            
            // Создаем заголовок для секции сохраненных карт
            const header = document.createElement("div");
            header.style.cssText = "margin-top: 30px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid rgba(0, 255, 80, 0.3);";
            header.innerHTML = `<div class="section-title" style="font-size: 16px; color: #0f0;">📂 Ваши карты (${savedMaps.length})</div>`;
            container.appendChild(header);
            
            // Добавляем сохраненные карты в сетку
            savedMaps.forEach((map, index) => {
                // Находим индекс в исходном массиве для правильной индексации
                const originalIndex = rawMaps.findIndex(m => m && m.name === map.name);
                const mapIndex = originalIndex >= 0 ? originalIndex : index;
                
                const mapCard = document.createElement("div");
                mapCard.className = "map-card";
                mapCard.style.cssText = "position: relative; cursor: pointer;";
                mapCard.setAttribute("data-custom-map-index", mapIndex.toString());
                
                // Убеждаемся, что mapType всегда присутствует
                const baseMapType = map.mapType || "normal";
                const objectCount = map.placedObjects?.length || 0;
                const triggerCount = map.triggers?.length || 0;
                const editCount = map.terrainEdits?.length || 0;
                const isPreset = map.metadata?.isPreset || map.name.startsWith("[Предустановленная]");
                
                mapCard.innerHTML = `
                    ${isPreset ? '<span style="position: absolute; top: 5px; right: 5px; font-size: 8px; color: #0ff;">🔒</span>' : ''}
                    <span class="map-card-icon">🗺</span>
                    <span class="map-card-name" style="font-size: 9px; line-height: 1.2;">${map.name.replace("[Предустановленная] ", "")}</span>
                    <span class="map-card-desc" style="font-size: 7px; margin-top: 5px; color: rgba(0, 255, 80, 0.6);">
                        ${isPreset ? 'Предустановленная' : `Объектов: ${objectCount} | Редакций: ${editCount}`}
                    </span>
                `;
                
                mapCard.addEventListener("click", () => {
                    // Сохраняем нормализованные данные карты в localStorage
                    localStorage.setItem("selectedCustomMapData", JSON.stringify(map));
                    localStorage.setItem("selectedCustomMapIndex", mapIndex.toString());
                    
                    // Выбираем базовый тип карты (обязательно должен быть указан)
                    this.selectMap(baseMapType as MapType);
                });
                
                // Добавляем стиль при наведении
                mapCard.addEventListener("mouseenter", () => {
                    mapCard.style.background = "rgba(0, 50, 0, 0.6)";
                    mapCard.style.borderColor = "#0f0";
                    mapCard.style.boxShadow = "0 0 15px rgba(0, 255, 80, 0.4)";
                    mapCard.style.transform = "translateY(-2px)";
                });
                
                mapCard.addEventListener("mouseleave", () => {
                    mapCard.style.background = "";
                    mapCard.style.borderColor = "";
                    mapCard.style.boxShadow = "";
                    mapCard.style.transform = "";
                });
                
                container.appendChild(mapCard);
            });
            
            debugLog(`[Menu] Loaded ${savedMaps.length} custom maps (normalized to version 1)`);
        } catch (error) {
            console.error("[Menu] Failed to load custom maps:", error);
            container.innerHTML = "";
        }
    }
    
    private selectedGameType: string = "single";
    
    private selectGameType(type: string): void {
        this.selectedGameType = type;
        debugLog("[Menu] Selected game type:", type);
        
        // Обновляем визуал выбранной кнопки
        document.querySelectorAll("[data-type]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.type === type) {
                button.className = "menu-btn play-btn game-type-btn";
            } else {
                button.className = "menu-btn play-btn game-type-btn";
                if (button.dataset.type === "multiplayer") {
                    button.style.background = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
                }
            }
        });
        
        // Update terminal titles
        this.updateTerminalTitles();
        
        // Для мультиплеера показываем специальное меню
        if (type === "multiplayer") {
            this.showPlayWindow("play-window-multiplayer", 0.5, 0.5);
            this.initMultiplayerMenu();
        } else {
            // Показываем следующий шаг - выбор режима игры
            this.showPlayWindow("play-window-gamemode", 1, 1);
        }
    }
    
    private selectGameMode(mode: string): void {
        this.selectedGameMode = mode;
        debugLog("[Menu] Selected game mode:", mode);
        
        // Обновляем визуал выбранной кнопки
        document.querySelectorAll("[data-gamemode]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.gamemode === mode) {
                button.className = "menu-btn play-btn gamemode-btn";
            } else {
                button.className = "menu-btn secondary gamemode-btn";
            }
        });
        
        // Update terminal titles
        this.updateTerminalTitles();
        
        // Показываем следующий шаг - выбор карты
        this.showPlayWindow("play-window-map", 2, 2);
    }
    
    private queueTimer: number = 0;
    private queueTimerInterval: NodeJS.Timeout | null = null;
    
    private initMultiplayerMenu(): void {
        // Выбранный режим мультиплеера (по умолчанию FFA)
        let selectedMpMode = "ffa";
        
        // Обработчики выбора режима мультиплеера
        document.querySelectorAll(".mp-mode-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const target = e.currentTarget as HTMLElement;
                const mode = target.dataset.mpMode;
                const desc = target.dataset.mpDesc;
                if (mode) {
                    selectedMpMode = mode;
                    // Обновляем визуал
                    document.querySelectorAll(".mp-mode-btn").forEach(b => {
                        b.classList.remove("active");
                    });
                    target.classList.add("active");
                    
                    // Показываем описание режима
                    const descEl = document.getElementById("mp-mode-description");
                    const descTextEl = document.getElementById("mp-mode-desc-text");
                    if (descEl && descTextEl && desc) {
                        descTextEl.textContent = desc;
                        descEl.style.display = "block";
                        descEl.style.animation = "fadeIn 0.3s ease";
                    }
                }
            });
        });
        
        // Устанавливаем FFA как активный по умолчанию
        const ffaBtn = document.getElementById("mp-btn-ffa");
        if (ffaBtn) {
            ffaBtn.classList.add("active");
            const desc = ffaBtn.dataset.mpDesc;
            const descEl = document.getElementById("mp-mode-description");
            const descTextEl = document.getElementById("mp-mode-desc-text");
            if (descEl && descTextEl && desc) {
                descTextEl.textContent = desc;
                descEl.style.display = "block";
            }
        }
        
        // Запрашиваем список комнат при открытии меню
        const game = (window as any).gameInstance as any;
        let multiplayerManager = game?.multiplayerManager;
        
        // Если MultiplayerManager не найден, пытаемся создать его
        if (!multiplayerManager && game) {
            console.log(`[Menu] MultiplayerManager не найден, пытаемся создать...`);
            try {
                // Импортируем и создаем MultiplayerManager
                import("./multiplayer").then(({ MultiplayerManager }) => {
                    multiplayerManager = new MultiplayerManager(undefined, true);
                    game.multiplayerManager = multiplayerManager;
                    
                    // Настраиваем колбэки если gameMultiplayerCallbacks существует
                    if (game.gameMultiplayerCallbacks) {
                        try {
                            const gameInstance = (window as any).gameInstance;
                            game.gameMultiplayerCallbacks.updateDependencies({
                                multiplayerManager: multiplayerManager,
                                mainMenu: this,
                                // Добавляем callbacks для запуска игры через gameInstance
                                startGame: async () => {
                                    if (gameInstance && typeof gameInstance.startGame === 'function') {
                                        try {
                                            // Проверяем инициализацию
                                            if (!gameInstance.gameInitialized) {
                                                console.log("[Menu] Game not initialized, initializing...");
                                                await gameInstance.init();
                                                gameInstance.gameInitialized = true;
                                            }
                                            // Убеждаемся, что canvas виден
                                            if (gameInstance.canvas) {
                                                gameInstance.canvas.style.display = "block";
                                                gameInstance.canvas.style.visibility = "visible";
                                                gameInstance.canvas.style.opacity = "1";
                                            }
                                            // Запускаем игру
                                            gameInstance.startGame();
                                        } catch (error) {
                                            console.error("[Menu] Error starting game:", error);
                                        }
                                    }
                                },
                                isGameInitialized: () => {
                                    return gameInstance ? gameInstance.gameInitialized : false;
                                },
                                isGameStarted: () => {
                                    return gameInstance ? gameInstance.gameStarted : false;
                                }
                            });
                            game.gameMultiplayerCallbacks.setup();
                            console.log(`[Menu] ✅ MultiplayerManager создан и настроен`);
                        } catch (callbackError) {
                            console.warn(`[Menu] ⚠️ Не удалось настроить callbacks:`, callbackError);
                        }
                    }
                    
                    // Настраиваем список комнат после создания
                    this.setupRoomListUpdates(multiplayerManager);
                }).catch(error => {
                    console.error(`[Menu] ❌ Ошибка создания MultiplayerManager:`, error);
                });
            } catch (error) {
                console.error(`[Menu] ❌ Ошибка импорта MultiplayerManager:`, error);
            }
        }
        
        // Если MultiplayerManager доступен, настраиваем обновление списка комнат
        if (multiplayerManager) {
            this.setupRoomListUpdates(multiplayerManager);
        } else if (!game) {
            // Игра еще не инициализирована - это нормально, просто не показываем предупреждение
            console.log(`[Menu] Игра еще не инициализирована, список комнат будет настроен позже`);
        } else {
            console.warn(`[Menu] ⚠️ MultiplayerManager не найден и не удалось создать`);
        }
        
        // Quick Play
        document.getElementById("mp-btn-quick-play")?.addEventListener("click", () => {
            const activeBtn = document.querySelector(".mp-mode-btn.active") as HTMLElement;
            const mode = activeBtn?.dataset.mpMode || selectedMpMode;
            this.startMultiplayerQuickPlay(mode);
        });
        
        // Create Room
        const createRoomBtn = document.getElementById("mp-btn-create-room");
        if (createRoomBtn) {
            createRoomBtn.addEventListener("click", async () => {
                debugLog("[Menu] Create room button clicked");
                const activeBtn = document.querySelector(".mp-mode-btn.active") as HTMLElement;
                const mode = activeBtn?.dataset.mpMode || selectedMpMode;
                debugLog("[Menu] Selected mode for room creation:", mode);
                await this.createMultiplayerRoom(mode);
            });
        } else {
            debugError("[Menu] Create room button not found!");
        }
        
        // Join Room - показываем модальное окно
        document.getElementById("mp-btn-join-room")?.addEventListener("click", () => {
            const modal = document.getElementById("mp-join-room-modal");
            const input = document.getElementById("mp-room-id-input") as HTMLInputElement;
            const errorEl = document.getElementById("mp-room-id-error");
            if (modal && input) {
                modal.style.display = "flex";
                input.value = "";
                input.focus();
                if (errorEl) errorEl.style.display = "none";
                
                // Обработчик Enter в поле ввода
                const handleEnter = (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        document.getElementById("mp-modal-join-btn")?.click();
                    }
                };
                input.addEventListener("keydown", handleEnter);
                
                // Обработчик кнопки "Присоединиться" в модальном окне
                const joinBtn = document.getElementById("mp-modal-join-btn");
                if (joinBtn) {
                    joinBtn.onclick = () => {
                        const roomId = input.value.trim();
                        if (roomId.length === 0) {
                            if (errorEl) {
                                errorEl.textContent = "Введите ID комнаты";
                                errorEl.style.display = "block";
                            }
                            return;
                        }
                        modal.style.display = "none";
                        input.removeEventListener("keydown", handleEnter);
                        this.joinMultiplayerRoom(roomId);
                    };
                }
                
                // Обработчик кнопки "Отмена" в модальном окне
                document.getElementById("mp-modal-cancel-btn")?.addEventListener("click", () => {
                    modal.style.display = "none";
                    input.removeEventListener("keydown", handleEnter);
                });
            }
        });
        
        // Cancel Queue
        document.getElementById("mp-btn-cancel-queue")?.addEventListener("click", () => {
            this.cancelMultiplayerQueue();
        });
        
        // Test connection button
        document.getElementById("mp-btn-test-connection")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const serverUrl = multiplayerManager.getServerUrl();
                const hintEl = document.getElementById("mp-server-hint");
                
                if (hintEl) {
                    hintEl.textContent = "⏳ Проверка подключения...";
                    hintEl.style.color = "#fbbf24";
                }
                
                // Проверяем подключение
                if (multiplayerManager.isConnected()) {
                    const ping = Math.round(multiplayerManager.getRTT());
                    if (hintEl) {
                        hintEl.textContent = `✅ Подключено! Пинг: ${ping}ms`;
                        hintEl.style.color = "#4ade80";
                    }
                } else {
                    // Пытаемся подключиться
                    try {
                        multiplayerManager.connect(serverUrl);
                        setTimeout(() => {
                            if (multiplayerManager.isConnected()) {
                                if (hintEl) {
                                    hintEl.textContent = "✅ Подключение успешно!";
                                    hintEl.style.color = "#4ade80";
                                }
                            } else {
                                if (hintEl) {
                                    hintEl.textContent = "❌ Не удалось подключиться. Проверьте адрес сервера и убедитесь, что сервер запущен.";
                                    hintEl.style.color = "#ef4444";
                                }
                            }
                        }, 2000);
                    } catch (error) {
                        if (hintEl) {
                            hintEl.textContent = `❌ Ошибка подключения: ${error}`;
                            hintEl.style.color = "#ef4444";
                        }
                    }
                }
            }
        });
        
        // Reconnect button
        document.getElementById("mp-btn-reconnect")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const serverUrl = multiplayerManager.getServerUrl();
                multiplayerManager.connect(serverUrl);
            }
        });
        
        // Start Game (only for room creator)
        document.getElementById("mp-btn-start-game")?.addEventListener("click", () => {
            this.startMultiplayerGame();
        });
        
        // Leave Room
        document.getElementById("mp-btn-leave-room")?.addEventListener("click", () => {
            this.leaveMultiplayerRoom();
        });
        
        // Copy Room ID
        document.getElementById("mp-btn-copy-room-id")?.addEventListener("click", () => {
            const game = (window as any).gameInstance as any;
            const multiplayerManager = game?.multiplayerManager;
            if (multiplayerManager) {
                const roomId = multiplayerManager.getRoomId();
                if (roomId) {
                    navigator.clipboard.writeText(roomId).then(() => {
                        const btn = document.getElementById("mp-btn-copy-room-id");
                        if (btn) {
                            const originalText = btn.textContent;
                            btn.textContent = "✓";
                            btn.style.color = "#4ade80";
                            setTimeout(() => {
                                btn.textContent = originalText;
                                btn.style.color = "#a78bfa";
                            }, 2000);
                        }
                    }).catch(err => {
                        debugError("[Menu] Failed to copy room ID:", err);
                    });
                }
            }
        });
        
        // Обновляем статус подключения
        this._updateMultiplayerStatus();
        
        // Обновляем статус каждые 2 секунды
        const statusUpdateInterval = setInterval(() => {
            if (document.getElementById("play-window-multiplayer")?.style.display !== "none") {
                this._updateMultiplayerStatus();
            } else {
                clearInterval(statusUpdateInterval);
            }
        }, 2000);
    }
    
    private startQueueTimer(): void {
        if (this.queueTimerInterval) clearInterval(this.queueTimerInterval);
        this.queueTimer = 0;
        this.queueTimerInterval = setInterval(() => {
            this.queueTimer++;
            const minutes = Math.floor(this.queueTimer / 60);
            const seconds = this.queueTimer % 60;
            const timerEl = document.getElementById("mp-queue-timer");
            if (timerEl) {
                timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            }
        }, 1000);
    }
    
    // Публичный метод для обновления статуса (вызывается из game.ts)
    updateMultiplayerStatus(): void {
        this._updateMultiplayerStatus();
    }
    
    private _updateMultiplayerStatus(): void {
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        
        const statusEl = document.getElementById("mp-connection-status");
        const indicatorEl = document.getElementById("mp-connection-indicator");
        const pingEl = document.getElementById("mp-ping");
        const reconnectBtn = document.getElementById("mp-btn-reconnect");
        const queueInfoEl = document.getElementById("mp-queue-info");
        const roomInfoEl = document.getElementById("mp-room-info");
        const serverInfoEl = document.getElementById("mp-server-info");
        
        if (!statusEl || !indicatorEl) return;
        
        // ИСПРАВЛЕНИЕ: Проверка статуса WebSocket и Firebase отдельно
        const isWebSocketConnected = multiplayerManager && multiplayerManager.isConnected();
        
        // Проверка статуса Firebase
        let isFirebaseConnected = false;
        try {
            const firebaseService = (window as any).firebaseService;
            if (firebaseService) {
                // Проверяем что Firebase инициализирован
                isFirebaseConnected = firebaseService.isInitialized?.() || false;
            }
        } catch (error) {
            console.warn("[Menu] Error checking Firebase status:", error);
        }
        
        if (isWebSocketConnected) {
            // ИСПРАВЛЕНИЕ: Показываем статус WebSocket и Firebase отдельно
            let statusText = "WebSocket [Online]";
            if (isFirebaseConnected) {
                statusText += " / Firebase [Online]";
            } else {
                statusText += " / Firebase [Offline]";
            }
            
            statusEl.textContent = statusText;
            statusEl.style.color = isFirebaseConnected ? "#4ade80" : "#fa0"; // Оранжевый если Firebase офлайн
            indicatorEl.style.background = isFirebaseConnected ? "#4ade80" : "#fa0";
            indicatorEl.style.boxShadow = isFirebaseConnected ? "0 0 8px rgba(74, 222, 128, 0.6)" : "0 0 8px rgba(255, 170, 0, 0.6)";
            
            // Показываем пинг с цветовой индикацией
            if (pingEl) {
                pingEl.style.display = "inline-block";
                const ping = Math.round(multiplayerManager.getRTT());
                pingEl.textContent = `${ping}ms`;
                
                // Цвет пинга в зависимости от значения
                if (ping < 50) {
                    pingEl.style.color = "#4ade80"; // Зеленый - отлично
                } else if (ping < 100) {
                    pingEl.style.color = "#fbbf24"; // Желтый - хорошо
                } else if (ping < 200) {
                    pingEl.style.color = "#fb923c"; // Оранжевый - приемлемо
                } else {
                    pingEl.style.color = "#ef4444"; // Красный - плохо
                }
            }
            
            if (reconnectBtn) reconnectBtn.style.display = "none";
            
            // Обновляем адрес сервера
            if (serverInfoEl) {
                const serverUrl = multiplayerManager.getServerUrl();
                const cleanUrl = serverUrl.replace("ws://", "").replace("wss://", "");
                serverInfoEl.textContent = cleanUrl;
                
                // Обновляем подсказку с инструкциями
                const hintEl = document.getElementById("mp-server-hint");
                if (hintEl) {
                    if (cleanUrl.includes("localhost") || cleanUrl.includes("127.0.0.1")) {
                        hintEl.textContent = "⚠️ Для подключения с другого ПК используйте IP-адрес сервера (например: ws://192.168.1.100:8080)";
                        hintEl.style.color = "#fa0";
                    } else {
                        hintEl.textContent = `✅ Адрес сервера: ${cleanUrl} (можно использовать с других ПК в той же сети)`;
                        hintEl.style.color = "#4ade80";
                    }
                }
            }
            
            // Показываем информацию о комнате если есть
            const roomId = multiplayerManager.getRoomId();
            if (roomId && roomInfoEl) {
                roomInfoEl.style.display = "block";
                roomInfoEl.style.animation = "fadeIn 0.3s ease";
                document.getElementById("mp-room-id")!.textContent = roomId.substring(0, 12);
                const mode = multiplayerManager.getGameMode() || "unknown";
                document.getElementById("mp-room-mode")!.textContent = mode.toUpperCase();
                if (queueInfoEl) queueInfoEl.style.display = "none";
                
                // Обновляем количество игроков (если доступно)
                const networkPlayers = multiplayerManager.getNetworkPlayers();
                const playersCount = networkPlayers ? networkPlayers.size + 1 : 1; // +1 для локального игрока
                const playersCountEl = document.getElementById("mp-room-players-count");
                if (playersCountEl) {
                    playersCountEl.textContent = `${playersCount}/32`;
                }
                
                // Обновляем статус комнаты
                const roomStatusTextEl = document.getElementById("mp-room-status-text");
                if (roomStatusTextEl) {
                    const isActive = multiplayerManager.isRoomActive ? multiplayerManager.isRoomActive() : false;
                    if (isActive) {
                        roomStatusTextEl.textContent = "⚔️ Игра идет - присоединяйтесь!";
                        roomStatusTextEl.style.color = "#ef4444";
                    } else {
                        roomStatusTextEl.textContent = "Ожидание игроков...";
                        roomStatusTextEl.style.color = "#4ade80";
                    }
                }
                
                // Показываем кнопку "В БОЙ!" в двух случаях:
                // 1. Создатель комнаты и >= 2 игрока (для запуска игры)
                // 2. Комната активна (для присоединения к идущей игре)
                const startGameBtn = document.getElementById("mp-btn-start-game");
                if (startGameBtn) {
                    try {
                        const isCreator = multiplayerManager.isRoomCreator ? multiplayerManager.isRoomCreator() : false;
                        const isActive = multiplayerManager.isRoomActive ? multiplayerManager.isRoomActive() : false;
                        const debugInfo = `[Menu] Кнопка "В БОЙ!": isCreator=${isCreator}, isActive=${isActive}, playersCount=${playersCount}, roomId=${roomId}`;
                        
                        // Показываем кнопку если:
                        // - Создатель и >= 2 игрока (запуск новой игры)
                        // - ИЛИ комната активна (присоединение к идущей игре)
                        const shouldShow = (isCreator && playersCount >= 2) || isActive;
                        
                        if (shouldShow) {
                            console.log(`${debugInfo} -> ПОКАЗЫВАЕМ кнопку`);
                            startGameBtn.style.display = "block";
                            startGameBtn.classList.add("battle-btn-ready");
                            
                            // Обновляем текст кнопки в зависимости от ситуации
                            const textElement = startGameBtn.querySelector(".battle-btn-text");
                            if (textElement) {
                                if (isActive) {
                                    textElement.textContent = `⚔️ ПРИСОЕДИНИТЬСЯ К БИТВЕ!`;
                                } else {
                                    textElement.textContent = `⚔️ В БОЙ! (${playersCount} игроков)`;
                                }
                            } else {
                                // Если структура нарушена, восстанавливаем её
                                const buttonText = isActive ? `⚔️ ПРИСОЕДИНИТЬСЯ К БИТВЕ!` : `⚔️ В БОЙ! (${playersCount} игроков)`;
                                startGameBtn.innerHTML = `<span class="battle-btn-text">${buttonText}</span><span class="battle-btn-shine"></span>`;
                            }
                        } else {
                            if (roomId) {
                                // Логируем только если мы в комнате, чтобы не засорять консоль
                                if (!isCreator && !isActive) {
                                    console.log(`${debugInfo} -> СКРЫВАЕМ: вы не создатель и игра не идет`);
                                } else if (isCreator && playersCount < 2) {
                                    console.log(`${debugInfo} -> СКРЫВАЕМ: нужно минимум 2 игрока (сейчас: ${playersCount})`);
                                }
                            }
                            startGameBtn.style.display = "none";
                            startGameBtn.classList.remove("battle-btn-ready");
                        }
                    } catch (error) {
                        console.error("[Menu] Error checking room status:", error);
                        startGameBtn.style.display = "none";
                    }
                }
                
                // Список игроков обновляется автоматически через другие механизмы
            } else {
                if (roomInfoEl) roomInfoEl.style.display = "none";
            }
        } else {
            // ИСПРАВЛЕНИЕ: Показываем статус WebSocket и Firebase отдельно
            let statusText = "WebSocket [Offline]";
            if (isFirebaseConnected) {
                statusText += " / Firebase [Online]";
            } else {
                statusText += " / Firebase [Offline]";
            }
            
            statusEl.textContent = statusText;
            statusEl.style.color = "#f00"; // Красный если WebSocket офлайн
            indicatorEl.style.background = "#f00";
            indicatorEl.style.boxShadow = "none";
            
            if (pingEl) pingEl.style.display = "none";
            if (reconnectBtn) reconnectBtn.style.display = "inline-block";
            if (queueInfoEl) queueInfoEl.style.display = "none";
            if (roomInfoEl) roomInfoEl.style.display = "none";
            
            // Обновляем подсказку при отключении
            const hintEl = document.getElementById("mp-server-hint");
            if (hintEl) {
                hintEl.textContent = "❌ Не подключено. Проверьте адрес сервера и убедитесь, что сервер запущен.";
                hintEl.style.color = "#ef4444";
            }
        }
    }
    
    private startMultiplayerQuickPlay(mode: string): void {
        debugLog("[Menu] Starting quick play for mode:", mode);
        
        // Сохраняем режим и запускаем игру
        this.selectedGameMode = "multiplayer";
        localStorage.setItem("selectedGameMode", "multiplayer");
        
        // Используем карту по умолчанию если не выбрана
        if (!this.selectedMapType) {
            this.selectedMapType = "normal";
        }
        
        // Показываем информацию о поиске
        const queueInfoEl = document.getElementById("mp-queue-info");
        if (queueInfoEl) {
            queueInfoEl.style.display = "block";
            queueInfoEl.style.animation = "fadeIn 0.3s ease";
            document.getElementById("mp-queue-mode")!.textContent = mode.toUpperCase();
            // Запускаем таймер очереди
            this.startQueueTimer();
        }
        
        // Закрываем меню и запускаем игру
        this.hide();
        this.hidePlayMenu();
        this.onStartGame(this.selectedMapType);
        
        // После запуска игры подключаемся к мультиплееру
        setTimeout(() => {
            const game = (window as any).gameInstance as any;
            if (game && game.quickPlayMultiplayer) {
                game.quickPlayMultiplayer(mode);
                debugLog("[Menu] Quick play multiplayer:", mode);
            } else {
                debugError("[Menu] Game instance not found or quickPlayMultiplayer not available");
                setTimeout(() => {
                    const game2 = (window as any).gameInstance as any;
                    if (game2 && game2.quickPlayMultiplayer) {
                        game2.quickPlayMultiplayer(mode);
                        debugLog("[Menu] Quick play multiplayer:", mode, "(retry)");
                    }
                }, 2000);
            }
        }, 3000);
    }
    
    private async createMultiplayerRoom(mode: string): Promise<void> {
        debugLog("[Menu] Creating multiplayer room for mode:", mode);
        const game = (window as any).gameInstance as any;
        if (!game) {
            this.showMultiplayerError("Игра еще не инициализирована. Запустите игру сначала.");
            return;
        }
        
        // Проверяем и инициализируем multiplayerManager если нужно
        let multiplayerManager = game?.multiplayerManager;
        
        // Если multiplayerManager не существует, пытаемся создать его
        if (!multiplayerManager) {
            debugLog("[Menu] MultiplayerManager not found, attempting to initialize...");
            
            // Создаем новый MultiplayerManager
            try {
                const { MultiplayerManager } = await import("./multiplayer");
                multiplayerManager = new MultiplayerManager(undefined, true);
                game.multiplayerManager = multiplayerManager;
                
                // Настраиваем колбэки если gameMultiplayerCallbacks существует
                if (game.gameMultiplayerCallbacks) {
                    try {
                        // КРИТИЧНО: Проверяем, что scene доступна перед настройкой колбэков
                        if (!game.scene) {
                            debugWarn("[Menu] Game scene not available, waiting for initialization...");
                            // Ждём инициализации игры
                            let waitAttempts = 0;
                            while (!game.scene && waitAttempts < 50) {
                                await new Promise(resolve => setTimeout(resolve, 100));
                                waitAttempts++;
                            }
                            if (!game.scene) {
                                throw new Error("Game scene not available after waiting");
                            }
                        }
                        
                        game.gameMultiplayerCallbacks.updateDependencies({
                            multiplayerManager: multiplayerManager,
                            scene: game.scene,
                            tank: game.tank,
                            hud: game.hud,
                            mainMenu: this,
                            achievementsSystem: game.achievementsSystem,
                            chunkSystem: game.chunkSystem,
                            networkPlayerTanks: game.networkPlayerTanks
                        });
                        // ИСПРАВЛЕНО: Было setupCallbacks(), должно быть setup()
                        game.gameMultiplayerCallbacks.setup();
                        debugLog("[Menu] Multiplayer callbacks configured with scene available");
                    } catch (callbackError) {
                        debugWarn("[Menu] Failed to setup multiplayer callbacks:", callbackError);
                    }
                }
                
                debugLog("[Menu] MultiplayerManager created successfully");
            } catch (error) {
                debugError("[Menu] Failed to create MultiplayerManager:", error);
                this.showMultiplayerError("Не удалось инициализировать менеджер мультиплеера. Попробуйте перезапустить игру или подождите, пока игра полностью загрузится.");
                return;
            }
        }
        
        if (!multiplayerManager) {
            this.showMultiplayerError("Менеджер мультиплеера не инициализирован.");
            return;
        }
        
        // Проверяем подключение к WebSocket и ждем подключения если нужно
        if (!multiplayerManager.isConnected()) {
            // Ждем подключения до 5 секунд
            let attempts = 0;
            const maxAttempts = 10;
            while (!multiplayerManager.isConnected() && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 500));
                attempts++;
            }
            
            if (!multiplayerManager.isConnected()) {
                this.showMultiplayerError("Не подключено к серверу. Пожалуйста, подключитесь к WebSocket серверу сначала.");
                debugLog("[Menu] WebSocket not connected after waiting, cannot create room");
                return;
            }
        }
        
        // Устанавливаем временный callback для показа ID сразу после создания
        // Сохраняем старый callback (если он есть)
        const existingCallback = (multiplayerManager as any).onRoomCreatedCallback;
        
        // Устанавливаем новый callback, который покажет ID и вызовет существующий
        multiplayerManager.onRoomCreated((data: any) => {
            debugLog("[Menu] Room created callback triggered, roomId:", data.roomId);
            
            // Вызываем существующий callback (который обновляет UI через GameMultiplayerCallbacks)
            if (existingCallback && existingCallback !== (multiplayerManager as any).onRoomCreatedCallback) {
                existingCallback(data);
            }
            
            // Немедленно обновляем UI для показа ID
            setTimeout(() => {
                this._updateMultiplayerStatus();
            }, 100);
            
            // Показываем уведомление с ID комнаты
            const roomId = data.roomId || multiplayerManager.getRoomId();
            if (roomId) {
                this.showMultiplayerNotification(
                    `✅ Комната создана! ID: ${roomId.substring(0, 12)}`,
                    "#4ade80"
                );
            } else {
                debugWarn("[Menu] Room created but no roomId in data");
            }
        });
        
        // Используем прямой вызов метода multiplayerManager для большей надежности
        try {
            // Вызываем createRoom напрямую
            const success = multiplayerManager.createRoom(mode as any, 32, false);
            if (success) {
                debugLog("[Menu] Room creation request sent for mode:", mode);
            } else {
                debugError("[Menu] Failed to send room creation request");
                this.showMultiplayerError("Не удалось отправить запрос на создание комнаты. Проверьте подключение к серверу.");
            }
        } catch (error: any) {
            debugError("[Menu] Error creating room:", error);
            this.showMultiplayerError(`Ошибка при создании комнаты: ${error.message || "Неизвестная ошибка"}`);
        }
    }
    
    private joinMultiplayerRoom(roomId: string): void {
        debugLog("[Menu] Joining multiplayer room:", roomId);
        const game = (window as any).gameInstance as any;
        if (game && game.joinMultiplayerRoom) {
            game.joinMultiplayerRoom(roomId);
            alert(`Присоединение к комнате ${roomId}...`);
        } else {
            alert("Игра еще не инициализирована. Запустите игру сначала.");
        }
    }
    
    private cancelMultiplayerQueue(): void {
        debugLog("[Menu] Cancelling multiplayer queue");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (multiplayerManager) {
            // Отправляем запрос на отмену очереди
            multiplayerManager.cancelQueue();
            
            const queueInfoEl = document.getElementById("mp-queue-info");
            if (queueInfoEl) {
                queueInfoEl.style.display = "none";
            }
            // Останавливаем таймер
            if (this.queueTimerInterval) {
                clearInterval(this.queueTimerInterval);
                this.queueTimerInterval = null;
            }
            this.queueTimer = 0;
            const timerEl = document.getElementById("mp-queue-timer");
            if (timerEl) timerEl.textContent = "00:00";
        }
    }
    
    /**
     * Настроить обновление списка комнат
     */
    private setupRoomListUpdates(multiplayerManager: any): void {
        if (!multiplayerManager) return;
        
        if (multiplayerManager.isConnected()) {
            // ВСЕГДА настраиваем callback при открытии меню (перезаписываем для надежности)
            console.log(`[Menu] ✅ Настройка callback для списка комнат при открытии меню`);
            multiplayerManager.onRoomList((rooms: any[]) => {
                console.log(`[Menu] 📋 Callback вызван: ${rooms.length} комнат`);
                this.updateRoomList(rooms);
            });
            
            // Запрашиваем список комнат сразу
            console.log(`[Menu] 📡 Запрос списка комнат при открытии меню`);
            multiplayerManager.requestRoomList();
            
            // Обновляем список каждые 3 секунды (улучшено для более быстрого обновления)
            // Очищаем предыдущий интервал если есть
            const intervalKey = 'mp-room-list-interval';
            if ((window as any)[intervalKey]) {
                clearInterval((window as any)[intervalKey]);
            }
            (window as any)[intervalKey] = setInterval(() => {
                if (multiplayerManager.isConnected()) {
                    multiplayerManager.requestRoomList();
                }
            }, 3000);
        } else {
            console.warn(`[Menu] ⚠️ Не подключено к серверу, список комнат не будет обновляться`);
        }
    }
    
    updateRoomList(rooms: any[]): void {
        const roomsContainer = document.getElementById("mp-rooms-items");
        if (!roomsContainer) {
            console.warn("[Menu] ⚠️ Контейнер mp-rooms-items не найден!");
            return;
        }
        
        console.log(`[Menu] 📋 Обновление списка комнат: ${rooms.length} комнат`);
        
        roomsContainer.innerHTML = "";
        
        if (rooms.length === 0) {
            roomsContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888; font-size: 12px;">Нет доступных комнат</div>';
            return;
        }
        
        rooms.forEach(room => {
            const roomItem = document.createElement("div");
            roomItem.style.cssText = `
                padding: 10px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(102, 126, 234, 0.3);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            roomItem.onmouseenter = () => {
                roomItem.style.background = "rgba(102, 126, 234, 0.2)";
                roomItem.style.borderColor = "#667eea";
            };
            roomItem.onmouseleave = () => {
                roomItem.style.background = "rgba(0, 0, 0, 0.3)";
                roomItem.style.borderColor = "rgba(102, 126, 234, 0.3)";
            };
            // Одинарный клик - открыть детали комнаты
            roomItem.onclick = () => {
                this.showRoomDetails(room);
            };
            // Двойной клик - сразу присоединиться к комнате
            roomItem.ondblclick = () => {
                const game = (window as any).gameInstance as any;
                if (game?.multiplayerManager) {
                    console.log(`[Menu] 🎮 Быстрое присоединение к комнате ${room.id} (двойной клик)`);
                    game.multiplayerManager.joinRoom(room.id);
                }
            };
            
            const statusColor = room.isActive ? "#4ade80" : "#a78bfa";
            const statusText = room.isActive ? "Игра идет" : "Ожидание";
            const isFull = room.players >= room.maxPlayers;
            
            roomItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <div style="font-weight: bold; color: #fff; font-size: 13px;">Комната ${room.id}</div>
                    <div style="font-size: 11px; color: ${statusColor}; background: rgba(0, 0, 0, 0.3); padding: 2px 6px; border-radius: 4px;">${statusText}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #aaa;">
                    <span>Режим: <span style="color: #fff;">${room.mode.toUpperCase()}</span></span>
                    <span>Игроков: <span style="color: ${isFull ? '#ef4444' : '#4ade80'};">${room.players}/${room.maxPlayers}</span></span>
                </div>
                <div style="margin-top: 8px; text-align: center; font-size: 10px; color: #667eea; opacity: 0.7;">
                    Клик — детали • Двойной клик — войти
                </div>
            `;
            
            roomsContainer.appendChild(roomItem);
        });
    }
    
    /**
     * Показать детальное меню выбранной комнаты
     */
    showRoomDetails(room: any): void {
        const modal = document.getElementById("mp-room-details-modal");
        if (!modal) {
            console.warn("[Menu] ⚠️ Модальное окно деталей комнаты не найдено");
            return;
        }
        
        // Заполняем информацию о комнате
        const roomIdEl = document.getElementById("mp-room-details-id");
        const roomModeEl = document.getElementById("mp-room-details-mode");
        const roomPlayersEl = document.getElementById("mp-room-details-players");
        const roomStatusEl = document.getElementById("mp-room-details-status");
        const roomTimeEl = document.getElementById("mp-room-details-time");
        const progressBarEl = document.getElementById("mp-room-details-progress-bar");
        const progressTextEl = document.getElementById("mp-room-details-progress-text");
        
        if (roomIdEl) roomIdEl.textContent = room.id;
        if (roomModeEl) roomModeEl.textContent = room.mode.toUpperCase();
        if (roomPlayersEl) roomPlayersEl.textContent = `${room.players}/${room.maxPlayers}`;
        
        // Статус
        if (roomStatusEl) {
            if (room.isActive) {
                roomStatusEl.textContent = "Игра идет";
                roomStatusEl.style.color = "#4ade80";
            } else {
                roomStatusEl.textContent = "Ожидание";
                roomStatusEl.style.color = "#a78bfa";
            }
        }
        
        // Время игры
        if (roomTimeEl) {
            if (room.isActive && room.gameTime) {
                const minutes = Math.floor(room.gameTime / 60);
                const seconds = Math.floor(room.gameTime % 60);
                roomTimeEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            } else {
                roomTimeEl.textContent = "Не начата";
            }
        }
        
        // Прогресс-бар
        const fillPercent = (room.players / room.maxPlayers) * 100;
        if (progressBarEl) {
            progressBarEl.style.width = `${fillPercent}%`;
        }
        if (progressTextEl) {
            progressTextEl.textContent = `${Math.round(fillPercent)}%`;
        }
        
        // Настраиваем кнопки
        const joinBtn = document.getElementById("mp-room-details-join");
        const copyBtn = document.getElementById("mp-room-details-copy-id");
        const closeBtn = document.getElementById("mp-room-details-close");
        
        // Удаляем старые обработчики
        if (joinBtn) {
            joinBtn.onclick = null;
            joinBtn.onclick = () => {
                const game = (window as any).gameInstance as any;
                if (game?.multiplayerManager) {
                    console.log(`[Menu] Присоединение к комнате ${room.id}`);
                    game.multiplayerManager.joinRoom(room.id);
                    this.hideRoomDetails();
                }
            };
        }
        
        if (copyBtn) {
            copyBtn.onclick = null;
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(room.id).then(() => {
                    console.log(`[Menu] ✅ ID комнаты ${room.id} скопирован в буфер обмена`);
                    // Визуальная обратная связь
                    if (copyBtn) {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = "✓";
                        copyBtn.style.color = "#4ade80";
                        setTimeout(() => {
                            copyBtn.innerHTML = originalText;
                            copyBtn.style.color = "#a78bfa";
                        }, 1000);
                    }
                }).catch(err => {
                    console.error("[Menu] Ошибка копирования ID:", err);
                });
            };
        }
        
        if (closeBtn) {
            closeBtn.onclick = null;
            closeBtn.onclick = () => {
                this.hideRoomDetails();
            };
        }
        
        // Закрытие по клику вне модального окна
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.hideRoomDetails();
            }
        };
        
        // Показываем модальное окно
        modal.style.display = "flex";
    }
    
    /**
     * Скрыть детальное меню комнаты
     */
    hideRoomDetails(): void {
        const modal = document.getElementById("mp-room-details-modal");
        if (modal) {
            modal.style.display = "none";
        }
    }
    
    // Метод для обновления информации об очереди (вызывается из game.ts через callback)
    updateQueueInfo(queueSize: number, estimatedWait: number, mode: string | null): void {
        const queueInfoEl = document.getElementById("mp-queue-info");
        
        // Если mode === null, скрываем очередь (матч найден)
        if (!mode || mode === "null") {
            if (queueInfoEl) {
                queueInfoEl.style.display = "none";
            }
            // Останавливаем таймер
            if (this.queueTimerInterval) {
                clearInterval(this.queueTimerInterval);
                this.queueTimerInterval = null;
                this.queueTimer = 0;
            }
            return;
        }
        
        // Показываем очередь и обновляем информацию
        if (queueInfoEl) {
            queueInfoEl.style.display = "block";
            queueInfoEl.style.animation = "fadeIn 0.3s ease";
        }
        
        const queueSizeEl = document.getElementById("mp-queue-size");
        const estimatedTimeEl = document.getElementById("mp-queue-estimated-time");
        const queueModeEl = document.getElementById("mp-queue-mode");
        
        if (queueSizeEl) queueSizeEl.textContent = String(queueSize);
        if (queueModeEl) queueModeEl.textContent = mode.toUpperCase();
        if (estimatedTimeEl) {
            const minutes = Math.floor(estimatedWait / 60);
            const seconds = estimatedWait % 60;
            estimatedTimeEl.textContent = `${minutes > 0 ? `${minutes} мин ` : ""}${seconds} сек`;
        }
        
        // Запускаем таймер если еще не запущен
        if (!this.queueTimerInterval) {
            this.startQueueTimer();
        }
    }
    
    private startMultiplayerGame(): void {
        debugLog("[Menu] Starting multiplayer game");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (!multiplayerManager) {
            this.showMultiplayerError("Менеджер мультиплеера не инициализирован.");
            return;
        }
        
        // Проверяем количество игроков
        const networkPlayers = multiplayerManager.getNetworkPlayers();
        const playersCount = networkPlayers ? networkPlayers.size + 1 : 1;
        if (playersCount < 2) {
            this.showMultiplayerError("Для начала игры нужно минимум 2 игрока!");
            return;
        }
        
        // Отправляем запрос на начало игры
        const success = multiplayerManager.startGame();
        if (success) {
            debugLog("[Menu] Start game request sent");
            // Скрываем кнопку после нажатия
            const startGameBtn = document.getElementById("mp-btn-start-game");
            if (startGameBtn) {
                startGameBtn.style.display = "none";
            }
        } else {
            this.showMultiplayerError("Не удалось начать игру. Проверьте подключение.");
        }
    }
    
    private leaveMultiplayerRoom(): void {
        debugLog("[Menu] Leaving multiplayer room");
        const game = (window as any).gameInstance as any;
        const multiplayerManager = game?.multiplayerManager;
        if (multiplayerManager) {
            multiplayerManager.leaveRoom();
            
            // Сбрасываем флаг мультиплеера чтобы боты могли спавниться в одиночной игре
            if (game.disableMultiplayer) {
                game.disableMultiplayer();
                debugLog("[Menu] Disabled multiplayer mode after leaving room");
            }
            
            const roomInfoEl = document.getElementById("mp-room-info");
            if (roomInfoEl) {
                roomInfoEl.style.display = "none";
            }
            // Скрываем кнопку "В БОЙ!"
            const startGameBtn = document.getElementById("mp-btn-start-game");
            if (startGameBtn) {
                startGameBtn.style.display = "none";
            }
            // Обновляем статус
            this._updateMultiplayerStatus();
        }
    }
    
    // Метод для отображения ошибок в меню
    showMultiplayerError(message: string): void {
        const errorEl = document.getElementById("mp-error-message");
        const errorTextEl = document.getElementById("mp-error-text");
        if (errorEl && errorTextEl) {
            errorTextEl.textContent = message;
            errorEl.style.display = "block";
            errorEl.style.animation = "fadeIn 0.3s ease";
            
            // Автоматически скрываем через 5 секунд
            setTimeout(() => {
                errorEl.style.display = "none";
            }, 5000);
        }
    }
    
    // Метод для отображения уведомлений (успешных сообщений) в меню
    showGameInviteNotification(data: { fromPlayerId: string; fromPlayerName: string; roomId?: string; gameMode?: string; worldSeed?: number }): void {
        // Создаем модальное окно для приглашения
        const modal = document.createElement("div");
        modal.id = "game-invite-modal";
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(0, 50, 0, 0.95) 0%, rgba(0, 30, 0, 0.95) 100%);
            border: 2px solid #4ade80;
            border-radius: 8px;
            padding: 30px;
            z-index: 10001;
            min-width: 400px;
            max-width: 500px;
            font-family: 'Consolas', 'Monaco', monospace;
            box-shadow: 0 0 30px rgba(74, 222, 128, 0.5);
        `;
        
        modal.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 24px; color: #4ade80; margin-bottom: 10px;">🎮 ПРИГЛАШЕНИЕ В ИГРУ</div>
                <div style="font-size: 16px; color: #fff; margin-bottom: 5px;">${data.fromPlayerName}</div>
                ${data.roomId ? `<div style="font-size: 12px; color: #888; margin-top: 5px;">Комната: ${data.roomId.substring(0, 12)}</div>` : ''}
                ${data.gameMode ? `<div style="font-size: 12px; color: #888; margin-top: 5px;">Режим: ${data.gameMode.toUpperCase()}</div>` : ''}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="invite-accept" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: rgba(74, 222, 128, 0.2);
                    border: 1px solid #4ade80;
                    color: #4ade80;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">ПРИНЯТЬ</button>
                <button id="invite-decline" style="
                    flex: 1;
                    padding: 12px 24px;
                    background: rgba(239, 68, 68, 0.2);
                    border: 1px solid #ef4444;
                    color: #ef4444;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 14px;
                    cursor: pointer;
                    border-radius: 4px;
                ">ОТКЛОНИТЬ</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Обработчики кнопок
        const acceptBtn = document.getElementById("invite-accept");
        const declineBtn = document.getElementById("invite-decline");
        
        if (acceptBtn) {
            acceptBtn.onclick = () => {
                const game = (window as any).gameInstance as any;
                const multiplayerManager = game?.multiplayerManager;
                
                if (data.roomId && multiplayerManager) {
                    // Присоединяемся к комнате
                    multiplayerManager.joinRoom(data.roomId);
                    this.showMultiplayerNotification(`Присоединение к комнате ${data.fromPlayerName}...`, "#4ade80");
                } else if (multiplayerManager) {
                    // Создаем комнату с указанным режимом
                    const mode = data.gameMode || "ffa";
                    multiplayerManager.createRoom(mode as any, 32, false);
                    this.showMultiplayerNotification(`Создание комнаты для игры с ${data.fromPlayerName}...`, "#4ade80");
                }
                
                modal.remove();
            };
        }
        
        if (declineBtn) {
            declineBtn.onclick = () => {
                modal.remove();
            };
        }
        
        // Автоматически закрываем через 30 секунд
        setTimeout(() => {
            if (document.body.contains(modal)) {
                modal.remove();
            }
        }, 30000);
    }
    
    showMultiplayerNotification(message: string, color: string = "#4ade80"): void {
        const errorEl = document.getElementById("mp-error-message");
        const errorTextEl = document.getElementById("mp-error-text");
        if (errorEl && errorTextEl) {
            // Меняем стиль на успешное уведомление
            errorEl.style.borderColor = color;
            errorEl.style.background = `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`;
            errorTextEl.textContent = message;
            errorTextEl.style.color = color;
            errorEl.style.display = "block";
            errorEl.style.animation = "fadeIn 0.3s ease";
            
            // Автоматически скрываем через 4 секунды
            setTimeout(() => {
                errorEl.style.display = "none";
                // Восстанавливаем стиль ошибки
                errorEl.style.borderColor = "#ef4444";
                errorEl.style.background = "rgba(239, 68, 68, 0.2)";
                errorTextEl.style.color = "#ffaaaa";
            }, 4000);
        }
    }
    
    private selectMap(map: MapType): void {
        this.selectedMapType = map;
        debugLog("[Menu] Selected map:", map);
        
        // Если выбрана стандартная карта, очищаем данные пользовательской карты
        const customMapData = localStorage.getItem("selectedCustomMapData");
        if (customMapData && map !== "custom") {
            try {
                const parsed = JSON.parse(customMapData);
                // Очищаем только если выбранная карта не совпадает с базовым типом пользовательской карты
                if (parsed.mapType && parsed.mapType !== map) {
                    localStorage.removeItem("selectedCustomMapData");
                    debugLog("[Menu] Cleared custom map data for standard map selection");
                }
            } catch (e) {
                // Игнорируем ошибки парсинга
            }
        }
        
        // Обновляем визуал стандартных карт
        document.querySelectorAll("[data-map]").forEach(btn => {
            const button = btn as HTMLButtonElement;
            if (button.dataset.map === map) {
                button.className = "map-card recommended";
                button.style.borderColor = "#0f0";
            } else {
                button.className = "map-card";
                button.style.borderColor = "";
            }
        });
        
        // Обновляем визуал пользовательских карт (если выбрана пользовательская карта)
        const customMapIndex = localStorage.getItem("selectedCustomMapIndex");
        document.querySelectorAll("[data-custom-map-index]").forEach(btn => {
            const button = btn as HTMLElement;
            const mapIndex = button.getAttribute("data-custom-map-index");
            if (mapIndex === customMapIndex && customMapIndex !== null) {
                button.style.background = "rgba(0, 100, 0, 0.6)";
                button.style.borderColor = "#0f0";
                button.style.boxShadow = "0 0 15px rgba(0, 255, 80, 0.4)";
            } else {
                button.style.background = "";
                button.style.borderColor = "";
                button.style.boxShadow = "";
            }
        });
        
        // Update terminal titles
        this.updateTerminalTitles();
        
        // Используем сохранённый выбор или значения по умолчанию
        const savedChassis = localStorage.getItem("selectedChassis") || "medium";
        const savedCannon = localStorage.getItem("selectedCannon") || "standard";
        
        this.selectedChassis = savedChassis;
        this.selectedCannon = savedCannon;
        localStorage.setItem("selectedChassis", savedChassis);
        localStorage.setItem("selectedCannon", savedCannon);
        
        // Всегда показываем окно выбора танка - там кнопка "В БОЙ!"
        this.showPlayWindow("play-window-tank", 3, 3);
        
        this.checkCanStartGame();
    }
    
    /**
     * Проверяет наличие сохранённых пользовательских пресетов танков
     */
    private checkHasSavedPresets(): boolean {
        try {
            const saved = localStorage.getItem("savedTankConfigurations");
            if (saved) {
                const configs = JSON.parse(saved);
                return Array.isArray(configs) && configs.length > 0;
            }
        } catch (e) {
            debugLog("[Menu] Error checking saved presets:", e);
        }
        return false;
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
        
        // Применяем пресет (tankTypes уже импортирован статически)
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
            chassisId = ownedChassis[0] || chassisId; // Fallback to original if undefined
        }
        if (!this.ownedCannonIds.has(cannonId) && ownedCannon.length > 0) {
            cannonId = ownedCannon[0] || cannonId; // Fallback to original if undefined
        }
        
        this.selectChassis(chassisId);
        this.selectCannon(cannonId);
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
            "coastal": "coastal",
            "tartaria": "tartaria"
        };
        return mapNames[map] || map;
    }
    
    private updateTerminalTitles(): void {
        const userId = this.getUserName();
        const basePath = `/${userId}`;
        const typePath = this.selectedGameType || "single";
        
        // Update type selection terminal title (step 1)
        const typeTitle = document.querySelector("#play-window-mode .play-window-title");
        if (typeTitle) {
            typeTitle.textContent = `${basePath}/type`;
        }
        
        // Update gamemode terminal title (step 2)
        const gamemodeTitle = document.querySelector("#play-window-gamemode .play-window-title");
        if (gamemodeTitle) {
            gamemodeTitle.textContent = `${basePath}/${typePath}/mode`;
        }
        
        // Update map terminal title (step 3)
        const mapTitle = document.querySelector("#play-window-map .play-window-title");
        if (mapTitle) {
            let path = `${basePath}/${typePath}`;
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                path += `/${modeName}`;
            }
            path += "/map";
            mapTitle.textContent = path;
        }
        
        // Update tank terminal title (step 4)
        const tankTitle = document.querySelector("#play-window-tank .play-window-title");
        if (tankTitle) {
            let path = `${basePath}/${typePath}`;
            if (this.selectedGameMode) {
                const modeName = this.getModeDisplayName(this.selectedGameMode);
                path += `/${modeName}`;
            }
            if (this.selectedMapType) {
                const mapName = this.getMapDisplayName(this.selectedMapType);
                path += `/${mapName}`;
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
        
        // Автоматически подстраиваем высоту под контент
        // Сбрасываем любые фиксированные высоты
        el.style.height = "auto";
        el.style.bottom = "auto";
        
        // Если открывается окно выбора карты, обновляем список сохраненных карт
        if (id === "play-window-map") {
            this.loadCustomMaps();
        }
        
        // Применяем стили после небольшой задержки, чтобы контент успел отрендериться
        setTimeout(() => {
            const contentHeight = el.scrollHeight;
            const maxHeight = window.innerHeight - 80; // 40px сверху + 40px снизу
            if (contentHeight < maxHeight) {
                // Если контент меньше экрана, используем его высоту
                el.style.height = `${contentHeight}px`;
            } else {
                // Если контент больше экрана, ограничиваем максимальной высотой
                el.style.height = `${maxHeight}px`;
                el.style.overflowY = "auto";
            }
        }, 10);
        
        if (typeof step === "number") {
            this.currentPlayStep = step;
        }
        // Update terminal titles when showing window
        this.updateTerminalTitles();
    }

    private navigatePlayStep(targetStep: number): void {
        const steps = ["play-window-mode", "play-window-gamemode", "play-window-map", "play-window-tank"];
        const clamped = Math.max(0, Math.min(targetStep, steps.length - 1));
        this.hideAllPlayWindows();
        const id = steps[clamped];
        if (id) {
            this.showPlayWindow(id, clamped, clamped);
        }
    }
    
    private startSelectedGame(): void {
        if (!this.selectedMapType) return;
        
        // Сохраняем выборы
        if (this.selectedGameMode) localStorage.setItem("selectedGameMode", this.selectedGameMode);
        if (this.selectedMapType) localStorage.setItem("selectedMapType", this.selectedMapType);
        if (this.selectedChassis) localStorage.setItem("selectedChassis", this.selectedChassis);
        if (this.selectedCannon) localStorage.setItem("selectedCannon", this.selectedCannon);
        
        // КРИТИЧНО: Получаем данные сохраненной/отредактированной карты из localStorage
        let mapData: any = null;
        const customMapDataStr = localStorage.getItem("selectedCustomMapData");
        if (customMapDataStr) {
            try {
                mapData = JSON.parse(customMapDataStr);
                debugLog(`[Menu] Found custom map data: ${mapData?.name}, will pass to onStartGame`);
            } catch (error) {
                console.error("[Menu] Failed to parse custom map data:", error);
            }
        }
        
        // Закрываем меню
        this.hide();
        this.hidePlayMenu();
        
        // Если выбран мультиплеер, запускаем игру и подключаемся к матчмейкингу
        if (this.selectedGameMode === "multiplayer") {
            // Запускаем игру в одиночном режиме (карта нужна для генерации мира)
            console.log("[Menu] startSelectedGame (multiplayer): calling onStartGame with map:", this.selectedMapType, "mapData:", mapData ? mapData.name : "none");
            console.log("[Menu] startSelectedGame: onStartGame callback:", typeof this.onStartGame);
            if (this.onStartGame && typeof this.onStartGame === 'function') {
                // Передаем mapType и mapData (если есть)
                this.onStartGame(this.selectedMapType, mapData);
            } else {
                console.error("[Menu] startSelectedGame (multiplayer): onStartGame callback is not set!");
            }
            
            // После запуска игры подключаемся к мультиплееру
            // Используем задержку чтобы игра успела инициализироваться и MultiplayerManager создался
            setTimeout(() => {
                const game = (window as any).gameInstance as any;
                if (game && game.quickPlayMultiplayer) {
                    // Используем FFA как режим по умолчанию для мультиплеера
                    game.quickPlayMultiplayer("ffa");
                    debugLog("[Menu] Quick play multiplayer: FFA");
                } else {
                    debugError("[Menu] Game instance not found or quickPlayMultiplayer not available");
                    // Пробуем еще раз через 2 секунды
                    setTimeout(() => {
                        const game2 = (window as any).gameInstance as any;
                        if (game2 && game2.quickPlayMultiplayer) {
                            game2.quickPlayMultiplayer("ffa");
                            debugLog("[Menu] Quick play multiplayer: FFA (retry)");
                        }
                    }, 2000);
                }
            }, 3000);
        } else {
            // Обычный старт для одиночной игры
            console.log("[Menu] Starting game with mapType:", this.selectedMapType, "mapData:", mapData ? mapData.name : "none");
            console.log("[Menu] onStartGame callback:", typeof this.onStartGame);
            
            // Сбрасываем флаг мультиплеера чтобы боты спавнились
            const game = (window as any).gameInstance as any;
            if (game && game.disableMultiplayer) {
                game.disableMultiplayer();
                debugLog("[Menu] Disabled multiplayer mode for single-player game");
            }
            
            if (this.onStartGame && typeof this.onStartGame === 'function') {
                // КРИТИЧНО: Передаем mapType и mapData (если есть)
                this.onStartGame(this.selectedMapType, mapData);
            } else {
                console.error("[Menu] onStartGame callback is not set!");
            }
        }
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
        console.log("[Menu] quickStart: calling onStartGame with map:", savedMap);
        console.log("[Menu] quickStart: onStartGame callback:", typeof this.onStartGame);
        if (this.onStartGame && typeof this.onStartGame === 'function') {
            this.onStartGame(savedMap);
        } else {
            console.error("[Menu] quickStart: onStartGame callback is not set!");
        }
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
            // Сначала скрываем все play-windows внутри
            this.hideAllPlayWindows();
            
            this.playMenuPanel.classList.remove("visible");
            this.playMenuPanel.style.setProperty("display", "none", "important");
            this.playMenuPanel.style.setProperty("visibility", "hidden", "important");
            this.enforceCanvasPointerEvents();
        }
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
            // Сохраняем позицию камеры перед закрытием
            saveSkillTreeCameraPosition();
            
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
    
    public async showGarage(): Promise<void> {
        debugLog("[Menu] showGarage() called");
        
        const wantsPlayMenuBack = this.returnToPlayMenuAfterGarage;
        const wasPlayVisible = this.playMenuPanel?.classList.contains("visible");
        
        // Lazy load Garage if not already loaded
        if (!this.garage) {
            debugLog("[Menu] Garage not loaded, loading now...");
            await this.loadGarageInMenu();
        }
        
        if (!this.garage) {
            logger.error("[Menu] Garage still not available after loading attempt!");
            return;
        }
        
        debugLog("[Menu] Opening Garage class");
        const wasVisible = this.isVisible();
        if (wasVisible) {
            this.hide();
        }
        this.garage.setOnCloseCallback(() => {
            try {
                const shouldReturnToPlay = this.returnToPlayMenuAfterGarage || wantsPlayMenuBack || wasPlayVisible;
                this.returnToPlayMenuAfterGarage = false;
                
                // ИСПРАВЛЕНИЕ: Безопасная проверка canvas с дополнительными проверками
                const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
                if (canvas) {
                    // Проверяем что canvas существует и не скрыт
                    const canvasDisplay = canvas.style.display;
                    const canvasComputed = window.getComputedStyle(canvas).display;
                    const isCanvasVisible = canvasDisplay !== "none" && canvasComputed !== "none";
                    
                    if (isCanvasVisible) {
                        debugLog("[Menu] Game is running, not showing menu after garage close");
                        // Восстанавливаем pointer-events для canvas
                        try {
                            this.enforceCanvasPointerEvents();
                        } catch (error) {
                            console.error("[Menu] Error enforcing canvas pointer events:", error);
                        }
                        return;
                    }
                }
                
                if (shouldReturnToPlay) {
                    debugLog("[Menu] Returning to play menu after garage close");
                    try {
                        this.showPlayMenu();
                    } catch (error) {
                        console.error("[Menu] Error showing play menu:", error);
                    }
                } else if (wasVisible) {
                    debugLog("[Menu] Showing menu after garage close");
                    try {
                        this.show();
                    } catch (error) {
                        console.error("[Menu] Error showing menu:", error);
                    }
                }
                
                // Восстанавливаем pointer-events для canvas после закрытия гаража
                setTimeout(() => {
                    try {
                        this.enforceCanvasPointerEvents();
                    } catch (error) {
                        console.error("[Menu] Error enforcing canvas pointer events (delayed):", error);
                    }
                }, 100);
            } catch (error) {
                console.error("[Menu] Error in garage close callback:", error);
                // Пытаемся показать меню в случае ошибки
                try {
                    if (wasVisible) {
                        this.show();
                    }
                } catch (e) {
                    console.error("[Menu] Error in fallback menu show:", e);
                }
            }
        });
        this.garage.open();
    }
    
    // Lazy load Garage in menu
    private async loadGarageInMenu(): Promise<void> {
        if (this.garage) return; // Already loaded
        
        try {
            const { Garage } = await import("./garage");
            
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
            debugLog("[Menu] Garage loaded lazily");
        } catch (error) {
            logger.error("[Menu] Failed to load Garage:", error);
        }
    }
    
    // Deprecated: Garage is now loaded lazily via loadGarageInMenu()
    // This method is kept for compatibility but does nothing
    // Garage is now loaded lazily when showGarage() is called
    private initializeGarageInMenu(): void {
        debugLog("[Menu] initializeGarageInMenu() called (deprecated - garage is lazy loaded)");
    }
    
    private initializeGarage(): void {
        // Garage is already initialized in constructor
        // This method is kept for compatibility
        debugLog("[Menu] Garage already initialized");
    }
    
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
    
    /**
     * Открыть редактор карт
     */
    private async openMapEditor(): Promise<void> {
        console.log("[Menu] ====== openMapEditor() CALLED ======");
        
        try {
            // Загружаем MapEditorLauncher для выбора карты
            console.log("[Menu] Loading MapEditorLauncher...");
            const { MapEditorLauncher } = await import("./mapEditorLauncher");
            const launcher = new MapEditorLauncher();
            
            // Показываем лаунчер и ждем выбора пользователя
            console.log("[Menu] Showing map editor launcher...");
            const result = await launcher.show();
            
            if (result.action === "cancel") {
                console.log("[Menu] User cancelled map editor");
                return;
            }
            
            // Lazy load StandaloneMapEditor
            if (!this.standaloneMapEditor) {
                console.log("[Menu] Loading StandaloneMapEditor...");
                const { StandaloneMapEditor } = await import("./standaloneMapEditor");
                console.log("[Menu] StandaloneMapEditor imported, creating instance...");
                this.standaloneMapEditor = new StandaloneMapEditor(this);
                console.log("[Menu] ✅ StandaloneMapEditor instance created");
            } else {
                console.log("[Menu] StandaloneMapEditor already loaded");
            }
            
            // Открываем редактор с выбранной конфигурацией
            if (this.standaloneMapEditor && typeof this.standaloneMapEditor.open === "function" && result.config) {
                console.log("[Menu] Opening StandaloneMapEditor with config:", result.config);
                await this.standaloneMapEditor.open(result.config);
                console.log("[Menu] ✅ StandaloneMapEditor opened successfully");
            } else {
                const error = new Error(`Cannot open editor: ${!this.standaloneMapEditor ? "StandaloneMapEditor not loaded" : !result.config ? "No config provided" : "open method not available"}`);
                console.error("[Menu] ❌", error);
                throw error;
            }
        } catch (error) {
            console.error("[Menu] ❌ Failed to open StandaloneMapEditor:", error);
            if (error instanceof Error) {
                console.error("[Menu] Error message:", error.message);
                console.error("[Menu] Error stack:", error.stack);
            }
            
            // Fallback: пытаемся через gameInstance (если игра запущена)
            const gameInstance = (window as any).gameInstance;
            console.log("[Menu] Trying fallback... gameInstance:", !!gameInstance);
            if (gameInstance && typeof gameInstance.openMapEditorFromMenu === "function") {
                console.log("[Menu] Fallback: calling gameInstance.openMapEditorFromMenu()...");
                try {
                    await gameInstance.openMapEditorFromMenu();
                    console.log("[Menu] ✅ Fallback: opened via gameInstance");
                    return;
                } catch (fallbackError) {
                    console.error("[Menu] ❌ Fallback also failed:", fallbackError);
                }
            }
            
            // Показываем сообщение об ошибке пользователю
            alert(`Не удалось открыть редактор карт:\n${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    /**
     * Открыть редактор танков
     */
    private openTankEditor(): void {
        debugLog("[Menu] openTankEditor() called");
        // Редактор танков доступен через гараж
        // Открываем гараж, где можно редактировать танк
        this.showGarage();
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

    // === AUTH METHODS ===

    private showLogin(): void {
        console.log("[Menu] showLogin() called - START");
        
        // Проверяем, что мы в главном меню, а не на паузе
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const isPaused = pauseButtons && pauseButtons.style.display !== "none";
        const isMainMenu = mainButtons && mainButtons.style.display !== "none";
        
        if (isPaused || !isMainMenu) {
            console.warn("[Menu] Login form can only be opened from main menu, not during pause");
            return;
        }
        
        // СРАЗУ открываем окно, без задержек!
        console.log("[Menu] Opening login form IMMEDIATELY");
        authUI.showLoginForm({
            onAuthSuccess: () => {
                console.log("[Menu] Auth success callback called");
                this.updateAuthUI();
            },
            onClose: () => {
                console.log("[Menu] Auth close callback called");
                this.enforceCanvasPointerEvents();
            }
        });
        
        // Инициализируем Firebase в фоне (не блокируем открытие окна)
        if (!firebaseService.isInitialized()) {
            console.log("[Menu] Firebase not initialized, initializing in background...");
            firebaseService.initialize().catch(err => {
                console.error("[Menu] Failed to initialize Firebase:", err);
            });
        }
        
        this.enforceCanvasPointerEvents();
        console.log("[Menu] showLogin() called - END");
    }

    private showRegister(): void {
        console.log("[Menu] showRegister() called - START");
        
        // Проверяем, что мы в главном меню, а не на паузе
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const isPaused = pauseButtons && pauseButtons.style.display !== "none";
        const isMainMenu = mainButtons && mainButtons.style.display !== "none";
        
        if (isPaused || !isMainMenu) {
            console.warn("[Menu] Register form can only be opened from main menu, not during pause");
            return;
        }
        
        // СРАЗУ открываем окно, без задержек!
        console.log("[Menu] Opening register form IMMEDIATELY");
        authUI.showRegisterForm({
            onAuthSuccess: () => {
                console.log("[Menu] Auth success callback called");
                this.updateAuthUI();
            },
            onClose: () => {
                console.log("[Menu] Auth close callback called");
                this.enforceCanvasPointerEvents();
            }
        });
        
        // Инициализируем Firebase в фоне (не блокируем открытие окна)
        if (!firebaseService.isInitialized()) {
            console.log("[Menu] Firebase not initialized, initializing in background...");
            firebaseService.initialize().catch(err => {
                console.error("[Menu] Failed to initialize Firebase:", err);
            });
        }
        
        this.enforceCanvasPointerEvents();
        console.log("[Menu] showRegister() called - END");
    }

    private showProfile(): void {
        authUI.showUserProfile({
            onAuthSuccess: () => {
                this.updateAuthUI();
            },
            onClose: () => {
                this.enforceCanvasPointerEvents();
            }
        });
        this.enforceCanvasPointerEvents();
    }

    private async updateAuthUI(): Promise<void> {
        const authInfo = document.getElementById("auth-info");
        const authButtons = document.getElementById("auth-buttons");
        const authUsername = document.getElementById("auth-username");
        const authStatus = document.getElementById("auth-status");

        if (!authInfo || !authButtons) return;

        const isAuthenticated = firebaseService.isAuthenticated();
        
        if (isAuthenticated) {
            // Показываем информацию о пользователе
            authInfo.style.display = "block";
            authButtons.style.display = "none";

            // Получаем username
            const username = await firebaseService.getUsername();
            if (authUsername) {
                authUsername.textContent = username || "Пользователь";
            }

            // Показываем статус верификации
            if (authStatus) {
                const emailVerified = firebaseService.checkEmailVerified();
                if (emailVerified) {
                    authStatus.textContent = "✓";
                    authStatus.style.color = "#0f0";
                    authStatus.title = "Email верифицирован";
                } else {
                    authStatus.textContent = "⚠";
                    authStatus.style.color = "#ff0";
                    authStatus.title = "Email не верифицирован";
                }
            }
        } else {
            // Показываем кнопки входа/регистрации
            authInfo.style.display = "none";
            authButtons.style.display = "flex";
        }
        
        // Обновляем позывной
        await this.updatePlayerCallsign();
    }
    
    private async updatePlayerCallsign(): Promise<void> {
        const callsignElement = document.getElementById("player-callsign");
        if (!callsignElement) return;

        const isAuthenticated = firebaseService.isAuthenticated();
        
        if (isAuthenticated) {
            // Проверяем, является ли пользователь админом
            const isAdmin = await firebaseService.isAdmin();
            
            if (isAdmin) {
                callsignElement.textContent = "[admin]";
                callsignElement.style.color = "#ff0";
                callsignElement.style.textShadow = "0 0 5px #ff0";
                callsignElement.style.borderColor = "rgba(255, 255, 0, 0.5)";
                callsignElement.style.background = "rgba(255, 255, 0, 0.15)";
            } else {
                // Получаем username
                const username = await firebaseService.getUsername();
                callsignElement.textContent = `[${username || "user"}]`;
                callsignElement.style.color = "#0ff";
                callsignElement.style.textShadow = "0 0 5px #0ff";
                callsignElement.style.borderColor = "rgba(0, 255, 255, 0.3)";
                callsignElement.style.background = "rgba(0, 255, 255, 0.1)";
            }
        } else {
            // Анонимный пользователь - показываем anon_id
            const anonId = firebaseService.getShortAnonId() || "0001";
            callsignElement.textContent = `[anon_id: ${anonId}]`;
            callsignElement.style.color = "#0ff";
            callsignElement.style.textShadow = "0 0 5px #0ff";
            callsignElement.style.borderColor = "rgba(0, 255, 255, 0.3)";
            callsignElement.style.background = "rgba(0, 255, 255, 0.1)";
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
    
    // ИСПРАВЛЕНО: Геттер для получения PlayerProgression из game.ts
    getPlayerProgression(): PlayerProgressionSystem | null {
        return this.playerProgression;
    }
    
    show(isPaused: boolean = false): void {
        
        debugLog("[Menu] show() called");
        if (!this.container) {
            
            console.error("[Menu] Container not initialized in show()!");
            return;
        }
        this.container.classList.remove("hidden");
        // Убираем inline стили display/visibility - CSS уже задает display: flex
        this.container.style.removeProperty("display");
        this.container.style.removeProperty("visibility");
        document.body.classList.add("menu-visible");
        
        // Показываем курсор и выходим из pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        document.body.style.cursor = 'default';
        
        // Добавляем класс "in-battle" если игра запущена (для 50% прозрачности фона)
        const game = (window as any).gameInstance;
        if (game && game.gameStarted) {
            this.container.classList.add("in-battle");
        } else {
            this.container.classList.remove("in-battle");
        }
        
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
        // Для кнопок авторизации важно привязать обработчики сразу, без задержки
        if (!this.buttonHandlersAttached) {
            // Привязываем обработчики сразу, без задержки для кнопок авторизации
            this.attachDirectButtonHandlers();
            // Если на паузе - дополнительно прикрепляем обработчики к кнопкам паузы
            if (isPaused) {
                setTimeout(() => {
                    this.attachPauseButtonHandlers();
                }, 50);
            }
        } else if (isPaused) {
            // Если обработчики уже привязаны, но игра на паузе - привязываем только паузу
            setTimeout(() => {
                this.attachPauseButtonHandlers();
            }, 50);
        } else {
            // Если обработчики уже привязаны и мы в главном меню, убеждаемся что кнопки авторизации работают
        }
        
        // Принудительно блокируем pointer-events на canvas МНОЖЕСТВЕННО
        this.enforceCanvasPointerEvents();
        setTimeout(() => this.enforceCanvasPointerEvents(), 0);
        setTimeout(() => this.enforceCanvasPointerEvents(), 10);
        
    }
    
    private updatePauseButtons(isPaused: boolean): void {
        const pauseButtons = document.getElementById("pause-buttons");
        const mainButtons = document.getElementById("main-buttons");
        const authSection = document.getElementById("auth-section");
        
        if (pauseButtons) {
            pauseButtons.style.display = isPaused ? "block" : "none";
        }
        if (mainButtons) {
            mainButtons.style.display = isPaused ? "none" : "block";
        }
        
        // Скрываем секцию авторизации во время паузы
        if (authSection) {
            authSection.style.display = isPaused ? "none" : "block";
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
        console.log("[Menu] resumeGame() called");
        // Если игра запущена и на паузе, возобновляем игру
        const game = (window as any).gameInstance;
        if (game && game.gameStarted && game.gamePaused) {
            console.log("[Menu] Resuming game via togglePause()");
            game.togglePause();
        } else {
            // Fallback: отправляем событие
            console.log("[Menu] Dispatching resumeGame event");
            window.dispatchEvent(new CustomEvent("resumeGame"));
        }
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
    
    /**
     * Настройка обработчика ESC для возврата в игру
     */
    private setupEscHandler(): void {
        // Удаляем старый обработчик если есть
        const oldEscHandler = (this.container as any)._escHandler;
        if (oldEscHandler) {
            window.removeEventListener("keydown", oldEscHandler, true);
        }
        
        // ИСПРАВЛЕНО: ESC теперь работает как переключатель (toggle)
        // Обработчик в menu.ts только закрывает меню, переключение обрабатывается в game.ts
        const escHandler = (e: KeyboardEvent) => {
            if (e.code === "Escape" && this.isVisible()) {
                const game = (window as any).gameInstance;
                // Если игра запущена, закрываем меню и возобновляем игру
                if (game && game.gameStarted) {
                    console.log("[Menu] ESC pressed - closing menu and resuming game");
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // КРИТИЧНО: Блокируем движение мыши ПЕРЕД закрытием меню через флаг
                    if (game.pointerMoveBlocked !== undefined) {
                        game.pointerMoveBlocked = true;
                        
                        // Разблокируем через задержку
                        setTimeout(() => {
                            game.pointerMoveBlocked = false;
                        }, 400);
                    }
                    
                    this.hide();
                    if (game.gamePaused) {
                        game.togglePause();
                    }
                } else {
                    // Если игра не запущена, просто закрываем меню
                    console.log("[Menu] ESC pressed - closing menu");
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.hide();
                }
            }
        };
        
        // Сохраняем ссылку на обработчик
        (this.container as any)._escHandler = escHandler;
        
        // Добавляем обработчик на window для перехвата ESC
        window.addEventListener("keydown", escHandler, true); // Используем capture phase для приоритета
    }
    
    hide(): void {
        this.container.classList.add("hidden");
        this.container.classList.remove("in-battle");
        document.body.classList.remove("menu-visible");
        
        // КРИТИЧНО: Скрываем ВСЕ панели при входе в битву
        this.hideSettings();
        this.hideStats();
        this.hideSkills();
        this.hideProgress();
        this.hideMapSelection();
        
        // Скрываем playMenuPanel если открыто
        if (this.playMenuPanel) {
            this.playMenuPanel.classList.remove("visible");
            this.playMenuPanel.style.setProperty("display", "none", "important");
            this.playMenuPanel.style.setProperty("visibility", "hidden", "important");
        }
        
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
        
        // Восстанавливаем курсор только если игра активна
        const game = (window as any).gameInstance;
        if (game?.gameStarted && !game.gamePaused) {
            document.body.style.cursor = 'none';
        }
    }
}

// Глобальная функция для показа меню (можно вызвать из консоли)
(window as any).showMainMenu = async function() {
    const game = (window as any).gameInstance;
    if (!game) {
        console.error("Game instance not found!");
        return;
    }
    
    // Если меню не загружено, загружаем его
    if (!game.mainMenu) {
        console.log("Menu not loaded, loading...");
        if (game.loadMainMenu) {
            await game.loadMainMenu();
        } else {
            console.error("loadMainMenu method not found!");
            return;
        }
    }
    
    if (game.mainMenu) {
        console.log("Showing menu...");
        game.mainMenu.show();
        console.log("Главное меню показано");
        
        // Проверяем состояние через небольшую задержку
        setTimeout(() => {
            const menu = document.getElementById("main-menu");
            console.log("Menu state check:", {
                menuElement: !!menu,
                inDOM: menu ? document.body.contains(menu) : false,
                hasHiddenClass: menu ? menu.classList.contains("hidden") : false,
                computedDisplay: menu ? window.getComputedStyle(menu).display : "N/A",
                computedVisibility: menu ? window.getComputedStyle(menu).visibility : "N/A",
                computedZIndex: menu ? window.getComputedStyle(menu).zIndex : "N/A"
            });
        }, 100);
    } else {
        console.error("Главное меню не найдено после загрузки.");
    }
};

// Глобальная функция для скрытия меню
(window as any).hideMainMenu = function() {
    const game = (window as any).gameInstance;
    if (game && game.mainMenu) {
        game.mainMenu.hide();
        console.log("Главное меню скрыто");
    } else {
        console.error("Главное меню не найдено.");
    }
};
