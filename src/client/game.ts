import "@babylonjs/core/Debug/debugLayer";
import { logger, LogLevel, loggingSettings } from "./utils/logger";
// import { CommonStyles } from "./commonStyles"; // Не используется
import { 
    Engine, 
    Scene, 
    Vector3, 
    HemisphericLight,
    DirectionalLight,
    ShadowGenerator,
    MeshBuilder, 
    Mesh,
    PhysicsAggregate,
    PhysicsShapeType,
    PhysicsMotionType,
    StandardMaterial,
    Color3,
    ArcRotateCamera,
    UniversalCamera,
    Ray,
    Quaternion,
    Matrix,
    DynamicTexture
} from "@babylonjs/core";
import "@babylonjs/gui";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui";
import { TankController } from "./tankController";
import { HUD } from "./hud";
import { SoundManager } from "./soundManager";
import { EffectsManager } from "./effects";
import { EnemyManager } from "./enemy";
import { ChunkSystem } from "./chunkSystem";
// Debug tools are lazy loaded (only loaded when F3/F4/F7 are pressed)
import { EnemyTank } from "./enemyTank";
import { AICoordinator } from "./ai/AICoordinator";
import { PerformanceOptimizer } from "./optimization/PerformanceOptimizer";
// MainMenu is lazy loaded - imported dynamically when needed
import type { GameSettings, MapType } from "./menu";
import { CurrencyManager } from "./currencyManager";
import { ConsumablesManager, CONSUMABLE_TYPES } from "./consumables";
import { ChatSystem } from "./chatSystem";
import { ExperienceSystem } from "./experienceSystem";
import { PlayerProgressionSystem } from "./playerProgression";
import { AimingSystem } from "./aimingSystem";
import { AchievementsSystem, Achievement } from "./achievements";
import { DestructionSystem } from "./destructionSystem";
import { MissionSystem, Mission } from "./missionSystem";
import { PlayerStatsSystem } from "./playerStats";
import { MultiplayerManager } from "./multiplayer";
import { NetworkPlayerTank } from "./networkPlayerTank";
import { firebaseService, type MatchHistory } from "./firebaseService";
import { Timestamp } from "firebase/firestore";
import { RealtimeStatsTracker } from "./realtimeStats";
import { ServerMessageType } from "../shared/messages";
import { socialSystem } from "./socialSystem";
import { MetricsCollector } from "./metricsCollector";
// type ExtendedMetrics не используется
import type { ClientMetricsData } from "../shared/messages";
// Типы для lazy-loaded модулей (импортируем реальные классы как типы)
import type { MainMenu } from "./menu";
import type { Garage } from "./garage";
import type { DebugDashboard } from "./debugDashboard";
import type { PhysicsPanel } from "./physicsPanel";
import type { CheatMenu } from "./cheatMenu";
import type { NetworkMenu } from "./networkMenu";
import type { WorldGenerationMenu } from "./worldGenerationMenu";
import type { HelpMenu } from "./helpMenu";
import type { ScreenshotManager } from "./screenshotManager";
import type { ScreenshotPanel } from "./screenshotPanel";
import type { BattleRoyaleVisualizer } from "./battleRoyale";
import type { CTFVisualizer } from "./ctfVisualizer";
// Game modules
import { 
    GameGarage, 
    GameConsumables, 
    GameProjectile, 
    GameVisibility, 
    GamePersistence, 
    GameLoaders,
    GameCamera,
    GameEnemies,
    GameUI,
    GamePhysics,
    GameAudio,
    GameStats,
    GamePOI,
    GameStatsOverlay,
    GameMultiplayerCallbacks,
    GameUpdate
} from "./game/index";

export class Game {
    engine!: Engine; // Инициализируется в init()
    scene!: Scene; // Инициализируется в init()
    canvas!: HTMLCanvasElement; // Инициализируется в init()
    tank: TankController | undefined;
    camera: ArcRotateCamera | undefined;
    aimCamera: UniversalCamera | undefined; // Отдельная камера для режима прицеливания
    hud: HUD | undefined;
    soundManager: SoundManager | undefined;
    effectsManager: EffectsManager | undefined;
    enemyManager: EnemyManager | undefined;
    
    // Chunk system for optimization
    chunkSystem: ChunkSystem | undefined;
    
    // Destruction system for destructible objects
    destructionSystem: DestructionSystem | undefined;
    
    // Debug dashboard (lazy loaded)
    debugDashboard: DebugDashboard | undefined; // Lazy loaded from "./debugDashboard"
    
    // Physics panel (lazy loaded)
    physicsPanel: PhysicsPanel | undefined; // Lazy loaded from "./physicsPanel"
    
    // Physics editor (lazy loaded)
    physicsEditor: any | undefined; // Lazy loaded from "./physicsEditor"
    
    // Cheat menu (lazy loaded)
    cheatMenu: CheatMenu | undefined; // Lazy loaded from "./cheatMenu"
    
    // Network menu (lazy loaded)
    networkMenu: NetworkMenu | undefined; // Lazy loaded from "./networkMenu"
    
    // World generation menu (lazy loaded)
    worldGenerationMenu: WorldGenerationMenu | undefined; // Lazy loaded from "./worldGenerationMenu"
    
    // Help menu (lazy loaded)
    helpMenu: HelpMenu | undefined; // Lazy loaded from "./helpMenu"
    
    // Session settings
    sessionSettings: { getSettings: () => { enemyCount?: number; aiDifficulty?: string }; setGame: (game: Game) => void } | undefined;
    
    // Enemy tanks
    enemyTanks: EnemyTank[] = [];
    
    // УЛУЧШЕНО: AI Coordinator для групповой тактики
    aiCoordinator: AICoordinator | undefined;
    
    // УЛУЧШЕНО: Performance Optimizer для LOD и culling
    performanceOptimizer: PerformanceOptimizer | undefined;
    
    // Currency manager
    currencyManager: CurrencyManager | undefined;
    
    // Consumables manager
    consumablesManager: ConsumablesManager | undefined;
    
    // Chat system
    chatSystem: ChatSystem | undefined;
    
    // Screenshot manager (extended functionality)
    screenshotManager: ScreenshotManager | undefined; // Lazy loaded from "./screenshotManager"
    screenshotPanel: ScreenshotPanel | undefined; // Lazy loaded from "./screenshotPanel"
    
    // Garage system (lazy loaded)
    garage: Garage | undefined; // Lazy loaded from "./garage"
    
    // Experience system
    experienceSystem: ExperienceSystem | undefined;
    
    // Player progression system
    playerProgression: PlayerProgressionSystem | undefined;
    
    // Achievements system
    achievementsSystem: AchievementsSystem | undefined;
    
    // Mission system
    missionSystem: MissionSystem | undefined;
    
    // Player stats system
    playerStats: PlayerStatsSystem | undefined;
    
    // Aiming system
    aimingSystem: AimingSystem | undefined;
    
    // Multiplayer
    multiplayerManager: MultiplayerManager | undefined;
    networkPlayerTanks: Map<string, NetworkPlayerTank> = new Map();
    isMultiplayer: boolean = false;
    
    // Metrics collector for server monitoring
    private metricsCollector: MetricsCollector | undefined;
    private lastMetricsSendTime: number = 0;
    private readonly METRICS_SEND_INTERVAL = 5000; // Send metrics every 5 seconds
    battleRoyaleVisualizer: BattleRoyaleVisualizer | undefined; // Lazy loaded from "./battleRoyale"
    ctfVisualizer: CTFVisualizer | undefined; // Lazy loaded from "./ctfVisualizer"
    
    // Spectator mode
    isSpectating: boolean = false;
    spectatingPlayerId: string | null = null;
    
    // Game modules
    private gameGarage: GameGarage;
    private gameConsumables: GameConsumables;
    private gameProjectile: GameProjectile;
    private gameVisibility: GameVisibility;
    private gamePersistence: GamePersistence;
    private gameLoaders: GameLoaders;
    private gameCamera: GameCamera | undefined;
    private gameEnemies: GameEnemies;
    private gameUI: GameUI;
    private gamePhysics: GamePhysics;
    private gameAudio: GameAudio;
    private gameStats: GameStats;
    private gamePOI: GamePOI;
    private gameStatsOverlay: GameStatsOverlay;
    private gameMultiplayerCallbacks: GameMultiplayerCallbacks;
    private gameUpdate: GameUpdate;
    
    // Main menu (lazy loaded)
    mainMenu: MainMenu | undefined; // Lazy loaded from "./menu"
    gameStarted = false;
    gamePaused = false;
    currentMapType: MapType = "normal";
    
    // Survival tracking for achievements
    private survivalStartTime = 0;
    private lastDeathTime = 0;
    gameInitialized = false;
    
    // Плавающая сложность врагов (логирование для отладки скейла)
    private _lastAdaptiveDifficultyLogTime = 0;
    
    // Система волн для карты "Передовая"
    private frontlineWaveNumber = 0;
    private frontlineWaveTimer: number | null = null;
    private frontlineMaxEnemies = 12;
    private frontlineWaveInterval = 75000; // 75 секунд между волнами
    
    // Таймер для проверки видимости меню
    private canvasPointerEventsCheckInterval: number | null = null;
    
    // Stats overlay управляется через gameStatsOverlay модуль
    
    // Real-time statistics tracker
    private realtimeStatsTracker: RealtimeStatsTracker | undefined;
    
    // Replay system (lazy loaded)
    private replayRecorder: any | undefined; // Lazy loaded from "./replaySystem"
    
    // Social menu (lazy loaded)
    socialMenu: any | undefined; // Lazy loaded from "./socialMenu"
    
    // Map editor (lazy loaded)
    mapEditor: any | undefined; // Lazy loaded from "./mapEditor"
    
    // Settings (loaded from menu when available)
    settings: GameSettings = {} as GameSettings;
    
    // Loading screen
    private loadingScreen: HTMLDivElement | null = null;
    private loadingProgress = 0;
    private targetLoadingProgress = 0; // Целевой прогресс для плавной интерполяции
    private loadingAnimationFrame: number | null = null; // Для плавной анимации прогресса
    
    // Camera settings
    cameraBeta = Math.PI / 2 - (20 * Math.PI / 180); // 20 градусов от горизонта для лучшего обзора
    targetCameraAlpha = 0;
    currentCameraAlpha = 0;
    shouldCenterCamera = false; // Флаг для плавного центрирования камеры
    centerCameraSpeed = 0.08;   // Скорость центрирования камеры (ТОЧНО такая же как у башни - 0.08!)
    isCenteringActive = false;  // Активно ли центрирование прямо сейчас
    
    // Camera shake system
    private cameraShakeIntensity = 0;
    private cameraShakeDecay = 0.95; // Скорость затухания тряски
    private cameraShakeOffset = Vector3.Zero();
    private cameraShakeTime = 0;
    
    // Input map for camera controls
    private _inputMap: { [key: string]: boolean } = {};
    
    // Update tick counter for optimization
    private _updateTick = 0;
    
    // ОПТИМИЗАЦИЯ: Кэш для barrel height в updateCamera
    private _cachedBarrelHeight: number = 2.5;
    private _cachedBarrelHeightFrame = -1;
    
    // ОПТИМИЗАЦИЯ: Кэш для позиций в updateCamera (обновляем каждые 2 кадра)
    private _cachedBarrelWorldPos: Vector3 = new Vector3(0, 2.5, 0);
    private _cachedBarrelWorldPosFrame = -1;
    private _cachedTurretPos: Vector3 = new Vector3(0, 2, 0);
    private _cachedTurretPosFrame = -1;
    
    // ОПТИМИЗАЦИЯ: Кэш для дорогих вычислений в updateCamera
    private _cachedChassisRotY: number = 0;
    private _cachedChassisRotYFrame = -1;
    private _cachedBarrelWorldDir: Vector3 = new Vector3(0, 0, 1);
    private _cachedBarrelWorldDirFrame = -1;
    
    // ОПТИМИЗАЦИЯ: Переиспользуемые векторы для избежания clone()
    private _tmpCameraPos: Vector3 = new Vector3();
    private _tmpCameraShake: Vector3 = new Vector3();
    private _tmpAimPos: Vector3 = new Vector3();
    private _tmpCameraTarget: Vector3 = new Vector3();
    
    // Raycast cache для оптимизации проверки видимости цели
    private targetRaycastCache: { result: boolean, frame: number } | null = null;
    private readonly TARGET_RAYCAST_CACHE_FRAMES = 6;
    
    // Кэш позиции танка для оптимизации
    private _cachedTankPosition: Vector3 = new Vector3();
    private _tankPositionCacheFrame = -1;
    
    // Кэш для ammoData Map (переиспользование вместо создания каждый кадр)
    private _cachedAmmoData: Map<string, { current: number, max: number }> = new Map();
    
    // Кэш позиции камеры для оптимизации
    private _cachedCameraPosition: Vector3 = new Vector3();
    private _cameraPositionCacheFrame = -1;
    
    // Кэш для toEulerAngles() - дорогая операция
    private _cachedChassisRotationY: number = 0;
    private _chassisRotationCacheFrame = -1;
    
    // Кэш для scene.meshes.filter - очень дорогая операция
    private _cachedTerrainMeshes: Mesh[] | null = null;
    private _terrainMeshesCacheFrame = -1;
    
    // Кэш для Date.now() - оптимизация частых вызовов
    private _cachedCurrentTime: number = 0;
    private _currentTimeCacheFrame = -1;
    
    // Кэш цветов удалён - теперь в GameGarage

    constructor() {
        console.log("[Game] ========== GAME CONSTRUCTOR STARTED ==========");
        
        // Initialize game modules
        this.gameGarage = new GameGarage();
        this.gameConsumables = new GameConsumables();
        this.gameProjectile = new GameProjectile();
        this.gameVisibility = new GameVisibility();
        this.gamePersistence = new GamePersistence();
        this.gameLoaders = new GameLoaders();
        this.gameEnemies = new GameEnemies();
        this.gameUI = new GameUI();
        this.gamePhysics = new GamePhysics();
        this.gameAudio = new GameAudio();
        this.gameStats = new GameStats();
        this.gamePOI = new GamePOI();
        this.gameStatsOverlay = new GameStatsOverlay();
        this.gameMultiplayerCallbacks = new GameMultiplayerCallbacks();
        this.gameUpdate = new GameUpdate();
        
        // КРИТИЧНО: Регистрируем горячие клавиши СРАЗУ в конструкторе,
        // независимо от загрузки меню! Это должно быть в НАЧАЛЕ конструктора!
        this.setupGlobalKeyboardShortcuts();
        
        // Setup loaders callbacks
        this.gameLoaders.setOnMainMenuLoaded((mainMenu) => {
            this.mainMenu = mainMenu;
        });
        this.gameLoaders.setOnGarageLoaded((garage) => {
            this.garage = garage;
        });
        
        
        // MainMenu will be loaded lazily when needed
        this.loadMainMenu().then(() => {
            
            if (this.mainMenu) {
                logger.log("[Game] Menu loaded, setting up callbacks...");
                this.setupMenuCallbacks();
                logger.log("[Game] Callbacks set up, showing menu...");
                
                // Проверяем, нужно ли автоматически запустить игру после перезагрузки
                const autoStart = localStorage.getItem("ptx_auto_start") === "true";
                const restartMap = localStorage.getItem("ptx_restart_map") as MapType | null;
                
                if (autoStart && restartMap) {
                    logger.log(`[Game] Auto-starting game on map: ${restartMap}`);
                    // Очищаем флаги
                    localStorage.removeItem("ptx_auto_start");
                    localStorage.removeItem("ptx_restart_map");
                    
                    // Устанавливаем карту и запускаем игру
                    this.currentMapType = restartMap;
                    
                    // Не показываем меню, сразу запускаем игру
                    setTimeout(async () => {
                        // Используем callback из mainMenu для запуска игры
                        if (this.mainMenu && typeof (this.mainMenu as any).onStartGame === 'function') {
                            logger.log("[Game] Using mainMenu.onStartGame callback");
                            await (this.mainMenu as any).onStartGame(restartMap);
                        } else {
                            // Если callback еще не установлен, используем прямой вызов
                            logger.log("[Game] onStartGame not set, using direct startGame call");
                            if (!this.gameInitialized) {
                                await this.init();
                                this.gameInitialized = true;
                            }
                            this.currentMapType = restartMap;
                            await this.startGame();
                        }
                    }, 500); // Увеличена задержка для полной инициализации
                } else {
                    // Обычный запуск - показываем меню
                    this.mainMenu.show();
                    logger.log("[Game] Menu show() called");
                }
                
            } else {
                
                logger.error("[Game] Menu loaded but mainMenu is null!");
            }
        }).catch((error) => {
            
            logger.error("[Game] Failed to load menu:", error);
        });
        
        // Обработчик для возобновления игры
        window.addEventListener("resumeGame", () => {
            this.togglePause();
        });
        
        // Auto-save is handled by GamePersistence.initialize()
        
        // Сохраняем экземпляр Game в window для доступа из Menu
        (window as any).gameInstance = this;
        
        console.log("[Game] ========== GAME CONSTRUCTOR COMPLETED ==========");
    }
    
    // Lazy load MainMenu
    private async loadMainMenu(): Promise<void> {
        
        if (this.mainMenu) return; // Already loaded
        
        try {
            const mainMenu = await this.gameLoaders.loadMainMenu();
            if (mainMenu) {
                this.mainMenu = mainMenu;
                
                if (this.mainMenu) {
                    this.settings = this.mainMenu.getSettings();
                    this.setupMenuCallbacks();
                    logger.log("[Game] MainMenu loaded");
                }
            }
        } catch (error) {
            
            logger.error("[Game] Failed to load MainMenu:", error);
        }
    }
    
    // Helper method to ensure MainMenu is loaded before accessing it
    // private async ensureMainMenu(): Promise<boolean> { // Не используется
    //     if (!this.mainMenu) {
    //         await this.loadMainMenu();
    //     }
    //     return !!this.mainMenu;
    // }
    
    // Lazy load Garage
    private async loadGarage(): Promise<void> {
        if (this.garage) return; // Already loaded
        
        if (!this.scene || !this.currencyManager) {
            logger.error("[Game] Cannot load Garage: scene or currencyManager not initialized");
            return;
        }
        
        try {
            const garage = await this.gameLoaders.loadGarage(this.scene, this.currencyManager);
            if (garage) {
                this.garage = garage;
                
                // Connect garage to main menu if available
                if (this.mainMenu) {
                    this.mainMenu.setGarage(this.garage);
                }
                
                logger.log("[Game] Garage loaded");
            }
        } catch (error) {
            logger.error("[Game] Failed to load Garage:", error);
        }
    }
    
    // =====================================================================
    // ГЛОБАЛЬНЫЕ ГОРЯЧИЕ КЛАВИШИ - регистрируются СРАЗУ в конструкторе
    // =====================================================================
    private setupGlobalKeyboardShortcuts(): void {
        console.log("[Game] ========== REGISTERING GLOBAL KEYBOARD SHORTCUTS ==========");
        logger.log("[Game] setupGlobalKeyboardShortcuts() called - registering Ctrl+0-9 and O+0-9 handlers");
        
        // Отслеживание зажатых клавиш для комбинаций O+0-9
        const keysPressed = new Set<string>();
        
        // Обработчик отпускания клавиш
        window.addEventListener("keyup", (e) => {
            keysPressed.delete(e.code);
            if (e.code === "KeyO") {
                logger.log("[Game] O key released");
                console.log("[Game] O key released, keysPressed:", Array.from(keysPressed));
            }
        }, true);
        
        // КРИТИЧНО: Обработчик Ctrl+0 с capture phase - должен быть ПЕРВЫМ!
        const ctrl0Handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && (e.code === "Digit0" || e.code === "Numpad0")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                logger.log("[Game] Ctrl+0 pressed - opening Physics Editor (CAPTURE)");
                console.log("[Game] Ctrl+0 pressed - opening Physics Editor (CAPTURE)", e);
                
                if (!this.physicsEditor) {
                    import("./physicsEditor").then((module) => {
                        const { getPhysicsEditor } = module;
                        this.physicsEditor = getPhysicsEditor();
                        this.physicsEditor.setGame(this);
                        if (this.tank) {
                            this.physicsEditor.setTank(this.tank);
                        }
                        this.physicsEditor.toggle();
                        logger.log("[Game] Physics editor opened");
                        console.log("[Game] Physics editor opened");
                    }).catch(error => {
                        logger.error("[Game] Failed to load physics editor:", error);
                        console.error("[Game] Failed to load physics editor:", error);
                    });
                } else {
                    this.physicsEditor.toggle();
                    logger.log("[Game] Physics editor toggled");
                    console.log("[Game] Physics editor toggled");
                }
            }
        };
        window.addEventListener("keydown", ctrl0Handler, true); // CAPTURE PHASE - срабатывает ПЕРВЫМ!
        console.log("[Game] Ctrl+0 handler registered with capture phase");
        
        // КРИТИЧНО: Единый обработчик Ctrl+1-9 с capture phase - перехватывает ДО браузера!
        const ctrlHotkeysHandler = (e: KeyboardEvent) => {
            // РАННЯЯ ДИАГНОСТИКА - проверяем что обработчик вообще вызывается
            if (e.ctrlKey && (e.code.startsWith("Digit") || e.code.startsWith("Numpad"))) {
                const digit = e.code.replace("Digit", "").replace("Numpad", "");
                console.log(`[Game] CAPTURE HANDLER: Ctrl+${digit} detected!`, {
                    code: e.code,
                    ctrlKey: e.ctrlKey,
                    defaultPrevented: e.defaultPrevented,
                    eventPhase: e.eventPhase
                });
                logger.log(`[Game] CAPTURE HANDLER: Ctrl+${digit} detected!`);
            }
            
            if (!e.ctrlKey) return;
            
            // ДИАГНОСТИКА
            if (e.code.startsWith("Digit") || e.code.startsWith("Numpad")) {
                const digit = e.code.replace("Digit", "").replace("Numpad", "");
                logger.log(`[Game] Ctrl+${digit} detected in CAPTURE handler`);
                console.log(`[Game] Ctrl+${digit} detected in CAPTURE handler`, e);
            }
            
            // Ctrl+1: Help/Controls Menu
            if (e.code === "Digit1" || e.code === "Numpad1") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.helpMenu) {
                    logger.log("[Game] Loading help menu (Ctrl+1 CAPTURE)...");
                    console.log("[Game] Loading help menu (Ctrl+1 CAPTURE)...");
                    import("./helpMenu").then(({ HelpMenu }) => {
                        console.log("[Game] HelpMenu module loaded, creating instance...");
                        this.helpMenu = new HelpMenu();
                        console.log("[Game] HelpMenu instance created:", this.helpMenu);
                        this.helpMenu.setGame(this);
                        console.log("[Game] setGame() called");
                        if (typeof this.helpMenu.toggle === 'function') {
                            console.log("[Game] Calling helpMenu.toggle()...");
                            this.helpMenu.toggle();
                            console.log("[Game] helpMenu.toggle() called");
                            logger.log("[Game] Help menu loaded and toggled (Ctrl+1)");
                        } else {
                            console.error("[Game] helpMenu.toggle is NOT a function!");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load help menu:", error);
                        console.error("[Game] Failed to load help menu:", error);
                        this.helpMenu = undefined;
                    });
                } else {
                    console.log("[Game] Help menu exists, calling toggle()...");
                    if (typeof this.helpMenu.toggle === 'function') {
                        this.helpMenu.toggle();
                        logger.log("[Game] Help menu toggled (Ctrl+1)");
                        console.log("[Game] Help menu toggled (Ctrl+1)");
                    } else {
                        console.error("[Game] helpMenu.toggle is NOT a function on existing instance!");
                    }
                }
                return;
            }
            
            // Ctrl+2: Screenshot Panel
            if (e.code === "Digit2" || e.code === "Numpad2") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                logger.log("[Game] Ctrl+2 pressed - opening screenshot panel (CAPTURE)");
                this.openScreenshotPanel().catch(error => {
                    logger.error("[Game] Failed to open screenshot panel:", error);
                });
                return;
            }
            
            // Ctrl+3: Debug Dashboard
            if (e.code === "Digit3" || e.code === "Numpad3") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.debugDashboard) {
                    if (!this.engine || !this.scene) {
                        logger.warn("[Game] Cannot load debug dashboard: engine or scene not initialized");
                        return;
                    }
                    logger.log("[Game] Loading debug dashboard (Ctrl+3 CAPTURE)...");
                    import("./debugDashboard").then(({ DebugDashboard }) => {
                        this.debugDashboard = new DebugDashboard(this.engine, this.scene);
                        if (this.chunkSystem) {
                            this.debugDashboard.setChunkSystem(this.chunkSystem);
                        }
                        this.debugDashboard.setGame(this);
                        if (this.tank) {
                            this.debugDashboard.setTank(this.tank);
                        }
                        if (typeof this.debugDashboard.toggle === 'function') {
                            this.debugDashboard.toggle();
                        }
                        logger.log("[Game] Debug dashboard loaded (Ctrl+3)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load debug dashboard:", error);
                        this.debugDashboard = undefined;
                    });
                } else {
                    if (typeof this.debugDashboard.toggle === 'function') {
                        this.debugDashboard.toggle();
                        logger.log("[Game] Debug dashboard toggled (Ctrl+3)");
                    }
                }
                return;
            }
            
            // Ctrl+4: Physics Panel
            if (e.code === "Digit4" || e.code === "Numpad4") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.physicsPanel) {
                    logger.log("[Game] Loading physics panel (Ctrl+4 CAPTURE)...");
                    import("./physicsPanel").then(({ PhysicsPanel }) => {
                        this.physicsPanel = new PhysicsPanel();
                        this.physicsPanel.setGame(this);
                        if (this.tank) {
                            this.physicsPanel.setTank(this.tank);
                        }
                        if (typeof this.physicsPanel.toggle === 'function') {
                            this.physicsPanel.toggle();
                            logger.log("[Game] Physics panel loaded and toggled (Ctrl+4)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load physics panel:", error);
                        this.physicsPanel = undefined;
                    });
                } else {
                    if (typeof this.physicsPanel.toggle === 'function') {
                        this.physicsPanel.toggle();
                        logger.log("[Game] Physics panel toggled (Ctrl+4)");
                    }
                }
                return;
            }
            
            // Ctrl+5: System Terminal
            if (e.code === "Digit5" || e.code === "Numpad5") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                this.ensureChatSystem().then(() => {
                    if (this.chatSystem && typeof this.chatSystem.toggleTerminal === 'function') {
                        this.chatSystem.toggleTerminal();
                        logger.log("[Game] System terminal toggled (Ctrl+5)");
                    } else {
                        logger.error("[Game] ChatSystem.toggleTerminal is not available");
                    }
                }).catch(error => {
                    logger.error("[Game] Failed to ensure ChatSystem:", error);
                });
                return;
            }
            
            // Ctrl+6: Session Settings
            if (e.code === "Digit6" || e.code === "Numpad6") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.sessionSettings) {
                    logger.log("[Game] Loading session settings (Ctrl+6 CAPTURE)...");
                    import("./sessionSettings").then(({ SessionSettings }) => {
                        this.sessionSettings = new SessionSettings();
                        this.sessionSettings.setGame(this);
                        if (typeof (this.sessionSettings as any).toggle === 'function') {
                            (this.sessionSettings as any).toggle();
                            logger.log("[Game] Session settings loaded and toggled (Ctrl+6)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load session settings:", error);
                        this.sessionSettings = undefined;
                    });
                } else {
                    if (typeof (this.sessionSettings as any).toggle === 'function') {
                        (this.sessionSettings as any).toggle();
                        logger.log("[Game] Session settings toggled (Ctrl+6)");
                    }
                }
                return;
            }
            
            // Ctrl+7: Cheat Menu
            if (e.code === "Digit7" || e.code === "Numpad7") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.cheatMenu) {
                    logger.log("[Game] Loading cheat menu (Ctrl+7 CAPTURE)...");
                    import("./cheatMenu").then(({ CheatMenu }) => {
                        this.cheatMenu = new CheatMenu();
                        if (this.tank) {
                            this.cheatMenu.setTank(this.tank);
                        }
                        this.cheatMenu.setGame(this);
                        if (typeof this.cheatMenu.toggle === 'function') {
                            this.cheatMenu.toggle();
                        }
                        logger.log("[Game] Cheat menu loaded (Ctrl+7)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load cheat menu:", error);
                        this.cheatMenu = undefined;
                    });
                } else {
                    if (typeof this.cheatMenu.toggle === 'function') {
                        this.cheatMenu.toggle();
                        logger.log("[Game] Cheat menu toggled (Ctrl+7)");
                    }
                }
                return;
            }
            
            // Ctrl+8: Network Menu
            if (e.code === "Digit8" || e.code === "Numpad8") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.networkMenu) {
                    logger.log("[Game] Loading network menu (Ctrl+8 CAPTURE)...");
                    import("./networkMenu").then(({ NetworkMenu }) => {
                        this.networkMenu = new NetworkMenu();
                        this.networkMenu.setGame(this);
                        if (typeof this.networkMenu.toggle === 'function') {
                            this.networkMenu.toggle();
                            logger.log("[Game] Network menu loaded and toggled (Ctrl+8)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load network menu:", error);
                        this.networkMenu = undefined;
                    });
                } else {
                    if (typeof this.networkMenu.toggle === 'function') {
                        this.networkMenu.toggle();
                        logger.log("[Game] Network menu toggled (Ctrl+8)");
                    }
                }
                return;
            }
            
            // Ctrl+9: World Generation Menu
            if (e.code === "Digit9" || e.code === "Numpad9") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.worldGenerationMenu) {
                    logger.log("[Game] Loading world generation menu (Ctrl+9 CAPTURE)...");
                    import("./worldGenerationMenu").then(({ WorldGenerationMenu }) => {
                        this.worldGenerationMenu = new WorldGenerationMenu();
                        this.worldGenerationMenu.setGame(this);
                        if (typeof this.worldGenerationMenu.toggle === 'function') {
                            this.worldGenerationMenu.toggle();
                            logger.log("[Game] World generation menu loaded and toggled (Ctrl+9)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load world generation menu:", error);
                        this.worldGenerationMenu = undefined;
                    });
                } else {
                    if (typeof this.worldGenerationMenu.toggle === 'function') {
                        this.worldGenerationMenu.toggle();
                        logger.log("[Game] World generation menu toggled (Ctrl+9)");
                    } else if (typeof (this.worldGenerationMenu as any).show === 'function') {
                        (this.worldGenerationMenu as any).show();
                        logger.log("[Game] World generation menu shown (Ctrl+9)");
                    }
                }
                return;
            }
        };
        window.addEventListener("keydown", ctrlHotkeysHandler, true); // CAPTURE PHASE!
        console.log("[Game] Ctrl+1-9 handler registered with capture phase");
        
        // Главный обработчик для O+0-9 и других горячих клавиш (БЕЗ Ctrl+1-9!)
        window.addEventListener("keydown", (e) => {
            // Отслеживание нажатия O (для комбинаций O+0-9)
            if (e.code === "KeyO" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                keysPressed.add("KeyO");
                logger.log("[Game] O key pressed, ready for O+0-9 combinations");
                console.log("[Game] O key pressed, keysPressed:", Array.from(keysPressed));
                // Не возвращаем, чтобы O могла использоваться для других целей
            }
            
            // Проверяем, зажата ли клавиша O
            const oKeyPressed = keysPressed.has("KeyO");
            
            // ДИАГНОСТИКА: Логируем все Ctrl+цифры и O+цифры
            if (e.ctrlKey && (e.code.startsWith("Digit") || e.code.startsWith("Numpad"))) {
                const digit = e.code.replace("Digit", "").replace("Numpad", "");
                logger.log(`[Game] Global handler: Ctrl+${digit} detected`);
                console.log(`[Game] Global handler: Ctrl+${digit} detected`, {
                    code: e.code,
                    key: e.key,
                    ctrlKey: e.ctrlKey,
                    defaultPrevented: e.defaultPrevented
                });
            }
            
            if (oKeyPressed && (e.code.startsWith("Digit") || e.code.startsWith("Numpad"))) {
                const digit = e.code.replace("Digit", "").replace("Numpad", "");
                logger.log(`[Game] Global handler: O+${digit} detected`);
                console.log(`[Game] Global handler: O+${digit} detected`, {
                    code: e.code,
                    key: e.key,
                    oKeyPressed: oKeyPressed,
                    keysPressed: Array.from(keysPressed)
                });
            }
            
            // =====================================================================
            // === АЛЬТЕРНАТИВНЫЕ КОМБИНАЦИИ O+0-9 (не конфликтуют с браузером) ===
            // =====================================================================
            
            // O+0: Physics Editor
            if (oKeyPressed && (e.code === "Digit0" || e.code === "Numpad0")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.physicsEditor) {
                    import("./physicsEditor").then((module) => {
                        const { getPhysicsEditor } = module;
                        this.physicsEditor = getPhysicsEditor();
                        this.physicsEditor.setGame(this);
                        if (this.tank) {
                            this.physicsEditor.setTank(this.tank);
                        }
                        this.physicsEditor.toggle();
                        logger.log("[Game] Physics editor opened (O+0)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load physics editor:", error);
                    });
                } else {
                    this.physicsEditor.toggle();
                    logger.log("[Game] Physics editor toggled (O+0)");
                }
                return;
            }
            
            // O+1: Help/Controls Menu
            if (oKeyPressed && (e.code === "Digit1" || e.code === "Numpad1")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.helpMenu) {
                    import("./helpMenu").then(({ HelpMenu }) => {
                        this.helpMenu = new HelpMenu();
                        this.helpMenu.setGame(this);
                        if (typeof this.helpMenu.toggle === 'function') {
                            this.helpMenu.toggle();
                            logger.log("[Game] Help menu loaded and toggled (O+1)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load help menu:", error);
                        this.helpMenu = undefined;
                    });
                } else {
                    if (typeof this.helpMenu.toggle === 'function') {
                        this.helpMenu.toggle();
                        logger.log("[Game] Help menu toggled (O+1)");
                    }
                }
                return;
            }
            
            // O+2: Screenshot Panel
            if (oKeyPressed && (e.code === "Digit2" || e.code === "Numpad2")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                this.openScreenshotPanel().catch(error => {
                    logger.error("[Game] Failed to open screenshot panel:", error);
                });
                logger.log("[Game] Screenshot panel opening (O+2)");
                return;
            }
            
            // O+3: Debug Dashboard
            if (oKeyPressed && (e.code === "Digit3" || e.code === "Numpad3")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.debugDashboard) {
                    if (!this.engine || !this.scene) {
                        logger.warn("[Game] Cannot load debug dashboard: engine or scene not initialized");
                        return;
                    }
                    import("./debugDashboard").then(({ DebugDashboard }) => {
                        this.debugDashboard = new DebugDashboard(this.engine, this.scene);
                        if (this.chunkSystem) {
                            this.debugDashboard.setChunkSystem(this.chunkSystem);
                        }
                        this.debugDashboard.setGame(this);
                        if (this.tank) {
                            this.debugDashboard.setTank(this.tank);
                        }
                        if (typeof this.debugDashboard.toggle === 'function') {
                            this.debugDashboard.toggle();
                        }
                        logger.log("[Game] Debug dashboard loaded (O+3)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load debug dashboard:", error);
                        this.debugDashboard = undefined;
                    });
                } else {
                    if (typeof this.debugDashboard.toggle === 'function') {
                        this.debugDashboard.toggle();
                        logger.log("[Game] Debug dashboard toggled (O+3)");
                    }
                }
                return;
            }
            
            // O+4: Physics Panel
            if (oKeyPressed && (e.code === "Digit4" || e.code === "Numpad4")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.physicsPanel) {
                    import("./physicsPanel").then(({ PhysicsPanel }) => {
                        this.physicsPanel = new PhysicsPanel();
                        this.physicsPanel.setGame(this);
                        if (this.tank) {
                            this.physicsPanel.setTank(this.tank);
                        }
                        if (typeof this.physicsPanel.toggle === 'function') {
                            this.physicsPanel.toggle();
                            logger.log("[Game] Physics panel loaded and toggled (O+4)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load physics panel:", error);
                        this.physicsPanel = undefined;
                    });
                } else {
                    if (typeof this.physicsPanel.toggle === 'function') {
                        this.physicsPanel.toggle();
                        logger.log("[Game] Physics panel toggled (O+4)");
                    }
                }
                return;
            }
            
            // O+5: System Terminal
            if (oKeyPressed && (e.code === "Digit5" || e.code === "Numpad5")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                this.ensureChatSystem().then(() => {
                    if (this.chatSystem && typeof this.chatSystem.toggleTerminal === 'function') {
                        this.chatSystem.toggleTerminal();
                        logger.log("[Game] System terminal toggled (O+5)");
                    } else {
                        logger.error("[Game] ChatSystem.toggleTerminal is not available");
                    }
                }).catch(error => {
                    logger.error("[Game] Failed to ensure ChatSystem:", error);
                });
                return;
            }
            
            // O+6: Session Settings
            if (oKeyPressed && (e.code === "Digit6" || e.code === "Numpad6")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.sessionSettings) {
                    import("./sessionSettings").then(({ SessionSettings }) => {
                        this.sessionSettings = new SessionSettings();
                        this.sessionSettings.setGame(this);
                        if (typeof (this.sessionSettings as any).toggle === 'function') {
                            (this.sessionSettings as any).toggle();
                            logger.log("[Game] Session settings loaded and toggled (O+6)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load session settings:", error);
                        this.sessionSettings = undefined;
                    });
                } else {
                    if (typeof (this.sessionSettings as any).toggle === 'function') {
                        (this.sessionSettings as any).toggle();
                        logger.log("[Game] Session settings toggled (O+6)");
                    }
                }
                return;
            }
            
            // O+7: Cheat Menu
            if (oKeyPressed && (e.code === "Digit7" || e.code === "Numpad7")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.cheatMenu) {
                    import("./cheatMenu").then(({ CheatMenu }) => {
                        this.cheatMenu = new CheatMenu();
                        if (this.tank) {
                            this.cheatMenu.setTank(this.tank);
                        }
                        this.cheatMenu.setGame(this);
                        if (typeof this.cheatMenu.toggle === 'function') {
                            this.cheatMenu.toggle();
                        }
                        logger.log("[Game] Cheat menu loaded (O+7)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load cheat menu:", error);
                        this.cheatMenu = undefined;
                    });
                } else {
                    if (typeof this.cheatMenu.toggle === 'function') {
                        this.cheatMenu.toggle();
                        logger.log("[Game] Cheat menu toggled (O+7)");
                    }
                }
                return;
            }
            
            // O+8: Network Menu
            if (oKeyPressed && (e.code === "Digit8" || e.code === "Numpad8")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.networkMenu) {
                    import("./networkMenu").then(({ NetworkMenu }) => {
                        this.networkMenu = new NetworkMenu();
                        this.networkMenu.setGame(this);
                        if (typeof this.networkMenu.toggle === 'function') {
                            this.networkMenu.toggle();
                            logger.log("[Game] Network menu loaded and toggled (O+8)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load network menu:", error);
                        this.networkMenu = undefined;
                    });
                } else {
                    if (typeof this.networkMenu.toggle === 'function') {
                        this.networkMenu.toggle();
                        logger.log("[Game] Network menu toggled (O+8)");
                    }
                }
                return;
            }
            
            // O+9: World Generation Menu
            if (oKeyPressed && (e.code === "Digit9" || e.code === "Numpad9")) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (!this.worldGenerationMenu) {
                    import("./worldGenerationMenu").then(({ WorldGenerationMenu }) => {
                        this.worldGenerationMenu = new WorldGenerationMenu();
                        this.worldGenerationMenu.setGame(this);
                        if (typeof this.worldGenerationMenu.toggle === 'function') {
                            this.worldGenerationMenu.toggle();
                            logger.log("[Game] World generation menu loaded and toggled (O+9)");
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load world generation menu:", error);
                        this.worldGenerationMenu = undefined;
                    });
                } else {
                    if (typeof this.worldGenerationMenu.toggle === 'function') {
                        this.worldGenerationMenu.toggle();
                        logger.log("[Game] World generation menu toggled (O+9)");
                    }
                }
                return;
            }
            
            // === АЛЬТЕРНАТИВНЫЕ F1–F10 ДЛЯ ТЕХ ЖЕ ПАНЕЛЕЙ ===
            // ВАЖНО: Ctrl+0-9 обрабатываются в отдельном обработчике с capture phase выше
            // F-клавиши дублируют Ctrl+цифры - РАБОТАЮТ ВСЕГДА
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                const fKeyToDigit: Record<string, string> = {
                    F1: "Digit1",
                    F2: "Digit2",
                    F3: "Digit3",
                    F4: "Digit4",
                    F5: "Digit5",
                    F6: "Digit6",
                    F7: "Digit7",
                    F8: "Digit8",
                    F9: "Digit9",
                    F10: "Digit0",
                };
                const mapped = fKeyToDigit[e.code as keyof typeof fKeyToDigit];
                if (mapped) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Симулируем нажатие Ctrl+цифра
                    const synthetic = new KeyboardEvent("keydown", {
                        key: mapped === "Digit0" ? "0" : mapped.replace("Digit", ""),
                        code: mapped,
                        ctrlKey: true,
                        shiftKey: false,
                        altKey: false,
                        metaKey: false,
                        bubbles: true,
                        cancelable: true,
                    });
                    window.dispatchEvent(synthetic);
                    return;
                }
            }
        }, true); // CAPTURE PHASE - срабатывает ПЕРВЫМ!
        
        console.log("[Game] ========== GLOBAL KEYBOARD SHORTCUTS REGISTERED ==========");
        logger.log("[Game] Global keyboard shortcuts registered successfully");
    }
    
    // Setup menu callbacks after menu is loaded
    private setupMenuCallbacks(): void {
        if (!this.mainMenu) {
            logger.error("[Game] setupMenuCallbacks: mainMenu is null!");
            return;
        }
        
        logger.log("[Game] Setting up menu callbacks...");
        
        this.mainMenu.setOnRestartGame(() => {
            logger.log("[Game] Restart game callback called");
            this.restartGame();
        });
        
        this.mainMenu.setOnExitBattle(() => {
            logger.log("[Game] Exit battle callback called");
            this.exitBattle();
        });
        
        this.mainMenu.setOnStartGame(async (mapType?: MapType) => {
            logger.log(`[Game] ===== Start game callback called with mapType: ${mapType} =====`);
            
            try {
                if (mapType) {
                    this.currentMapType = mapType;
                    logger.log(`[Game] Map type set to: ${this.currentMapType}`);
                    
                }
                
                // Инициализируем игру, если еще не инициализирована
                if (!this.gameInitialized) {
                    logger.log(`[Game] Game not initialized, initializing with map type: ${this.currentMapType}`);
                    await this.init();
                    this.gameInitialized = true;
                    logger.log("[Game] Game initialized successfully");
                } else {
                    // Если игра уже инициализирована, но тип карты изменился, пересоздаем ChunkSystem
                    if (mapType && this.chunkSystem) {
                    logger.log(`Recreating ChunkSystem for map type: ${mapType}`);
                    
                    
                    // Очищаем старые враги
                    // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
                    const enemyCount = this.enemyTanks.length;
                    for (let i = 0; i < enemyCount; i++) {
                        const enemy = this.enemyTanks[i];
                        if (enemy && enemy.chassis) enemy.chassis.dispose();
                    }
                    this.enemyTanks = [];
                    
                    // Очищаем старые турели
                    if (this.enemyManager?.turrets) {
                        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
                        const turrets = this.enemyManager.turrets;
                        const turretCount = turrets.length;
                        for (let i = 0; i < turretCount; i++) {
                            const turret = turrets[i];
                            if (turret && turret.base && !turret.base.isDisposed()) turret.base.dispose();
                            if (turret && turret.head && !turret.head.isDisposed()) turret.head.dispose();
                            if (turret && turret.barrel && !turret.barrel.isDisposed()) turret.barrel.dispose();
                        }
                        this.enemyManager.turrets = [];
                    }
                    
                    // Очищаем кэши Тарту перед dispose, если новая карта не Тартария
                    // Это предотвращает использование данных Тарту для других карт
                    if (mapType !== "tartaria") {
                        const { clearTartuHeightmapCache } = await import("./tartuHeightmap");
                        const { clearBiomeCache } = await import("./tartuBiomes");
                        clearTartuHeightmapCache();
                        clearBiomeCache();
                        logger.log(`[Game] Cleared Tartu caches before recreating ChunkSystem (new mapType: ${mapType})`);
                    }
                    
                    // ВАЖНО: Dispose старой карты перед созданием новой!
                    this.chunkSystem.dispose();
                    
                    // Пересоздаем ChunkSystem с новым типом карты
                    const menuSettings = this.mainMenu?.getSettings();
                    let newWorldSeed = menuSettings?.worldSeed || 12345;
                    if (menuSettings?.useRandomSeed) {
                        newWorldSeed = Math.floor(Math.random() * 999999999);
                    }
                    
                    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: используем ПЕРЕДАННЫЙ mapType (параметр функции), а не this.currentMapType!
                    // Ранее была ошибка: создавалась локальная переменная mapType, которая перезаписывала параметр
                    const mapTypeForChunkSystem = mapType || this.currentMapType || "normal";
                    logger.log(`[Game] Recreating ChunkSystem with mapType: ${mapTypeForChunkSystem} (passed mapType: ${mapType}, currentMapType: ${this.currentMapType})`);
                    
                    this.chunkSystem = new ChunkSystem(this.scene, {
                        chunkSize: 80,
                        renderDistance: 1.5,
                        unloadDistance: 3,  // ОПТИМИЗАЦИЯ: Уменьшено с 4 до 3
                        worldSeed: newWorldSeed,
                        mapType: mapTypeForChunkSystem
                    });
                    
                    // Обновляем ссылки
                    if (this.debugDashboard) {
                        this.debugDashboard.setChunkSystem(this.chunkSystem);
                    }
                    
                    // Обновляем чанки
                    const initialPos = new Vector3(0, 2, 0);
                    this.chunkSystem.update(initialPos);
                    
                    // Восстанавливаем здоровье танка при смене карты
                    if (this.tank) {
                        this.tank.respawn();
                        logger.debug("[Game] Player tank reset for new map");
                    }
                    
                    // Ждём генерации гаражей и спавним игрока
                    this.waitForGaragesAndSpawn();
                }
            }
            
                // Убеждаемся, что canvas виден перед запуском игры
                if (this.canvas) {
                    this.canvas.style.display = "block";
                    this.canvas.style.visibility = "visible";
                    this.canvas.style.opacity = "1";
                }
                
                
                logger.log("[Game] Calling startGame()...");
                this.startGame();
                
                logger.log("[Game] startGame() called successfully");
            } catch (error) {
                logger.error("[Game] Error in onStartGame callback:", error);
                console.error("[Game] Error starting game:", error);
            }
        });
        
        logger.log("[Game] Menu callbacks set up successfully");
        
        // Setup canvas
        
        this.canvas = document.createElement("canvas");
        
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.display = "block";
        this.canvas.style.position = "fixed";
        this.canvas.style.top = "0";
        this.canvas.style.left = "0";
        this.canvas.style.zIndex = "0"; // Canvas должен быть ПОД GUI элементами
        this.canvas.id = "gameCanvas";
        document.body.appendChild(this.canvas);
        
        // Устанавливаем pointer-events в зависимости от видимости меню
        this.updateCanvasPointerEvents();

        // Определяем, находимся ли мы в production
        const isProduction = (import.meta as any).env?.PROD || false;
        
        this.engine = new Engine(this.canvas, true, {
            deterministicLockstep: false,
            lockstepMaxSteps: 4,
            useHighPrecisionMatrix: false,
            adaptToDeviceRatio: true, // Адаптация к разрешению устройства
            antialias: !isProduction, // Отключаем антиалиасинг в production для производительности
            stencil: false, // Отключаем stencil buffer если не нужен
            preserveDrawingBuffer: false, // Не сохраняем буфер для производительности
            powerPreference: "high-performance", // Предпочитаем производительность
            doNotHandleContextLost: true, // Не обрабатываем потерю контекста для производительности
            premultipliedAlpha: false, // Отключаем premultiplied alpha для производительности
            alpha: false // Отключаем альфа-канал если не нужен
        });
        
        this.engine.enableOfflineSupport = false;
        
        // Ограничиваем FPS до 60 для стабильности и экономии ресурсов
        this.engine.setHardwareScalingLevel(1.0);
        
        // Apply graphics settings
        this.applyGraphicsSettings();
        
        // Listen for settings changes
        window.addEventListener("settingsChanged", ((e: CustomEvent<GameSettings>) => {
            this.settings = e.detail;
            this.applyGraphicsSettings();
            this.applyAudioSettings();
            this.applyControlSettings();
            this.applyCameraSettings();
            this.applyUISettings();
        }) as EventListener);
        
        // Оптимизация рендеринга
        this.engine.setSize(0, 0); // Будет установлен автоматически
        
        this.scene = new Scene(this.engine, {
            useGeometryUniqueIdsMap: true,
            useMaterialMeshMap: true,
            useClonedMeshMap: true
        });
        
        this.scene.skipPointerMovePicking = true;
        // Временно включаем autoClear для правильного отображения
        this.scene.autoClear = true;
        this.scene.autoClearDepthAndStencil = true;
        
        // Дополнительные оптимизации для production
        if (isProduction) {
            // Блокируем обновления материалов для производительности
            this.scene.blockMaterialDirtyMechanism = true;
        }
        
        // Обработчики для игровых клавиш (B, G, Tab, ESC, M, N, 1-5)
        // ВАЖНО: Ctrl+0-9 обрабатываются в setupGlobalKeyboardShortcuts()
        window.addEventListener("keydown", (e) => {
            // Open/Close garage MENU with B key - В ЛЮБОЙ МОМЕНТ (даже до старта игры)
            // G key используется для управления воротами гаража во время игры
            if (e.code === "KeyB" || e.key === "b" || e.key === "B") {
                e.preventDefault(); // Предотвращаем другие обработчики
                e.stopPropagation(); // Останавливаем распространение события
                e.stopImmediatePropagation(); // Останавливаем все обработчики
                
                logger.debug("===== KeyB/KeyG pressed for Garage =====");
                logger.debug("Event code:", e.code);
                logger.debug("Event key:", e.key);
                logger.debug("Garage exists:", !!this.garage);
                logger.debug("Game started:", this.gameStarted);
                
                // Функция для переключения гаража
                const toggleGarage = () => {
                    if (!this.garage) {
                        logger.error("ERROR: Garage is null!");
                        // Если гараж не создан, пытаемся открыть через меню
                        if (this.mainMenu) {
                            logger.debug("[Game] Garage not available, trying to open via mainMenu...");
                            this.mainMenu.showGarage();
                        }
                        return;
                    }
                    
                    try {
                        const isCurrentlyOpen = this.garage.isGarageOpen();
                        logger.log(`[Game] Garage isOpen: ${isCurrentlyOpen}`);
                        
                        if (isCurrentlyOpen) {
                            this.garage.close();
                            logger.log("✓ Garage menu CLOSED");
                        } else {
                            // Закрываем карту при открытии гаража
                            if (this.hud && this.hud.isFullMapVisible()) {
                                this.hud.toggleFullMap();
                            }
                            
                            this.garage.open();
                            logger.log("✓ Garage menu OPENED");
                            
                            // Дополнительная проверка через небольшую задержку
                            setTimeout(() => {
                                if (this.garage && this.garage.isGarageOpen()) {
                                    logger.debug("✓ Garage confirmed open");
                                    // Garage uses HTML overlay, not Babylon GUI, so getGUI() returns null - this is normal
                                } else {
                                    logger.error("✗ Garage failed to open!");
                                }
                            }, 200);
                        }
                    } catch (error) {
                        logger.error("✗ Error toggling garage:", error);
                        logger.error("Error stack:", (error as Error).stack);
                        // Если ошибка, пытаемся открыть через меню
                        if (this.mainMenu) {
                            logger.debug("[Game] Error toggling garage, trying via mainMenu...");
                            this.mainMenu.showGarage();
                        }
                    }
                };
                
                // Если гараж создан, переключаем его
                if (this.garage) {
                    toggleGarage();
                } else {
                    // Lazy load Garage on first use
                    logger.debug("[Game] Garage not loaded yet, loading now...");
                    this.loadGarage().then(() => {
                        if (this.garage) {
                            toggleGarage();
                        } else if (this.mainMenu) {
                            // Fallback: try via menu
                            this.mainMenu.showGarage();
                        }
                    }).catch(error => {
                        logger.error("[Game] Failed to load Garage:", error);
                        if (this.mainMenu) {
                            this.mainMenu.showGarage();
                        }
                    });
                }
                return;
            }
            
            // Ручное управление воротами гаража клавишей G (только во время игры, если меню гаража закрыто)
            // G key открывает/закрывает ТОЛЬКО ту ворота, на которую смотрит пушка танка
            if ((e.code === "KeyG" || e.key === "g" || e.key === "G") && this.gameStarted && this.chunkSystem && this.chunkSystem.garageDoors && 
                (!this.garage || !this.garage.isGarageOpen())) {
                e.preventDefault(); // Предотвращаем другие обработчики
                e.stopPropagation(); // Останавливаем распространение события
                e.stopImmediatePropagation(); // Останавливаем все обработчики
                // Переключаем состояние ворот ближайшего гаража (только той, на которую смотрит пушка)
                if (this.tank && this.tank.chassis && this.tank.barrel) {
                    // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
                    const playerPos = this.tank.getCachedChassisPosition();
                    type NearestGarageType = { doorData: any; distance: number; };
                    let nearestGarage: NearestGarageType | null = null;
                    
                    // ОПТИМИЗАЦИЯ: Используем обычный for цикл и переиспользуем Vector3
                    const doors = this.chunkSystem.garageDoors;
                    const doorCount = doors.length;
                    const tmpVec1 = new Vector3();
                    const tmpVec2 = new Vector3();
                    for (let i = 0; i < doorCount; i++) {
                        const doorData = doors[i];
                        if (!doorData) continue;
                        const garagePos = doorData.position;
                        tmpVec1.set(garagePos.x, 0, garagePos.z);
                        tmpVec2.set(playerPos.x, 0, playerPos.z);
                        const distance = Vector3.Distance(tmpVec1, tmpVec2);
                        
                        if (nearestGarage === null || distance < nearestGarage.distance) {
                            nearestGarage = { doorData, distance };
                        }
                    }
                    
                    // Если игрок рядом с гаражом (в пределах 50 единиц), переключаем ворота
                    if (nearestGarage === null) {
                        logger.warn(`No garage found`);
                    } else {
                        const ng: NearestGarageType = nearestGarage; // Явное указание типа для TypeScript
                        if (ng.distance < 50) {
                            const doorData = ng.doorData;
                            
                            // Получаем направление пушки и позицию
                            // КРИТИЧНО: Для raycast нужна МИРОВАЯ позиция ствола, не локальная!
                            const barrelWorldMatrix = this.tank.barrel.getWorldMatrix();
                            const barrelDir = Vector3.TransformNormal(Vector3.Forward(), barrelWorldMatrix).normalize();
                            // ОПТИМИЗАЦИЯ: Используем кэшированную позицию ствола
                            // Для raycast нужна абсолютная позиция ствола в мировых координатах
                            const barrelPos = this.tank.barrel ? 
                                (this.tank.barrel.getAbsolutePosition ? this.tank.barrel.getAbsolutePosition() : this.tank.barrel.position) :
                                new Vector3(0, 2.5, 0);
                            
                            // Используем raycast для точного определения, какая ворота попадает в луч
                            const rayDistance = 100; // Максимальная дистанция луча
                            const ray = new Ray(barrelPos, barrelDir, rayDistance);
                            
                            // Используем raycast для точного определения, какая ворота попадает в луч
                            // Также проверяем расстояние до ворот напрямую, если рейкаст не сработал
                            let hitDoor: "front" | "back" | null = null;
                            
                            // Сначала пробуем рейкаст
                            const pick = this.scene.pickWithRay(ray, (mesh) => {
                                if (!mesh || !mesh.isEnabled()) return false;
                                // Проверяем, что это ворота гаража (убираем проверку visibility, так как ворота могут быть полупрозрачными)
                                return (mesh.name.includes("garageFrontDoor") || mesh.name.includes("garageBackDoor")) &&
                                       mesh.isPickable;
                            });
                            
                            if (pick && pick.hit && pick.pickedMesh) {
                                if (pick.pickedMesh.name.includes("garageFrontDoor")) {
                                    hitDoor = "front";
                                } else if (pick.pickedMesh.name.includes("garageBackDoor")) {
                                    hitDoor = "back";
                                }
                            }
                            
                            // Если рейкаст не сработал, проверяем расстояние до ворот и направление пушки
                            if (!hitDoor) {
                                const garageDepth = doorData.garageDepth || 20;
                                const frontDoorPos = new Vector3(doorData.position.x, 0, doorData.position.z + garageDepth / 2);
                                const backDoorPos = new Vector3(doorData.position.x, 0, doorData.position.z - garageDepth / 2);
                                
                                // Проверяем, в какую сторону смотрит пушка относительно позиции ворот
                                const toFrontDoor = frontDoorPos.subtract(barrelPos).normalize();
                                const toBackDoor = backDoorPos.subtract(barrelPos).normalize();
                                
                                const frontDot = Vector3.Dot(barrelDir, toFrontDoor);
                                const backDot = Vector3.Dot(barrelDir, toBackDoor);
                                
                                // Если пушка смотрит в направлении ворот (скалярное произведение > 0.5)
                                if (frontDot > backDot && frontDot > 0.3) {
                                    hitDoor = "front";
                                } else if (backDot > frontDot && backDot > 0.3) {
                                    hitDoor = "back";
                                }
                            }
                            
                            // Если определили ворота, переключаем их
                            if (hitDoor === "front") {
                                doorData.frontDoorOpen = !doorData.frontDoorOpen;
                                logger.debug(`Front garage door ${doorData.frontDoorOpen ? 'opening' : 'closing'} manually (G key)`);
                            } else if (hitDoor === "back") {
                                doorData.backDoorOpen = !doorData.backDoorOpen;
                                logger.debug(`Back garage door ${doorData.backDoorOpen ? 'opening' : 'closing'} manually (G key)`);
                            } else {
                                // Не удалось определить ворота - переключаем обе (fallback)
                                logger.debug(`Could not determine which door, toggling both`);
                                doorData.frontDoorOpen = !doorData.frontDoorOpen;
                                doorData.backDoorOpen = !doorData.backDoorOpen;
                            }
                            
                            // Ворота остаются в выбранном состоянии (ручное управление постоянно активно)
                            doorData.manualControl = true;
                            doorData.manualControlTime = Date.now();
                            
                            // Принудительно вызываем обновление ворот
                            this.gameGarage.updateGarageDoors();
                        } else {
                            logger.debug(`No garage nearby (distance: ${ng.distance.toFixed(1)})`);
                        }
                    }
                }
                return;
            }
            
            // ПОКАЗАТЬ stats panel при ЗАЖАТИИ Tab (пункт 13: K/D, убийства, смерти, credits)
            if (e.code === "Tab" && this.gameStarted) {
                e.preventDefault(); // Предотвращаем переключение фокуса
                this.gameStats.show(); // Показываем при нажатии
                return;
            }

            // Ctrl+Shift+M: Map Editor (lazy loaded)
            if (e.ctrlKey && e.shiftKey && (e.code === "KeyM") && this.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                void this.openMapEditorInternal();
                return;
            }
            
            // Открыть/закрыть панель миссий клавишей N
            if (e.code === "KeyN" && this.gameStarted && this.hud) {
                e.preventDefault();
                this.hud.toggleMissionPanel?.();
            }
            
            // Открыть/закрыть карту клавишей M
            if (e.code === "KeyM" && this.gameStarted && this.hud) {
                e.preventDefault();
                // Закрываем гараж при открытии карты
                if (this.garage && this.garage.isGarageOpen()) {
                    this.garage.close();
                }
                this.hud.toggleFullMap();
                return;
            }
            
            
            if (e.code === "Escape") {
                
                logger.log(`[Game] ESC pressed - gameStarted: ${this.gameStarted}, mainMenu: ${!!this.mainMenu}`);
                
                // Если игра не запущена, показываем главное меню
                if (!this.gameStarted) {
                    // Убеждаемся, что меню загружено
                    if (!this.mainMenu) {
                        logger.log("[Game] Loading menu on ESC...");
                        this.loadMainMenu().then(() => {
                            if (this.mainMenu) {
                                logger.log("[Game] Menu loaded, showing...");
                                
                                this.mainMenu.show();
                            }
                        }).catch((error) => {
                            logger.error("[Game] Failed to load menu on ESC:", error);
                        });
                    } else {
                        // Всегда показываем меню при ESC, даже если оно уже видимо
                        logger.log("[Game] Showing menu on ESC...");
                        logger.log("[Game] Menu state:", {
                            exists: !!this.mainMenu,
                            isVisible: this.mainMenu.isVisible()
                        });
                        
                        this.mainMenu.show();
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                
                // Если игра запущена, обрабатываем паузу и меню
                // Закрываем все открытые меню перед паузой
                // Physics Editor закрываем первым (имеет высокий приоритет)
                if (this.physicsEditor && typeof this.physicsEditor.isVisible === 'function' && this.physicsEditor.isVisible()) {
                    this.physicsEditor.hide();
                    return;
                }
                if (this.helpMenu && typeof this.helpMenu.isVisible === 'function' && this.helpMenu.isVisible()) {
                    this.helpMenu.hide();
                    return;
                }
                if (this.screenshotPanel && typeof this.screenshotPanel.isVisible === 'function' && this.screenshotPanel.isVisible()) {
                    this.screenshotPanel.hide();
                    return;
                }
                if (this.debugDashboard && (this.debugDashboard as any).visible) {
                    const container = (this.debugDashboard as any).container;
                    if (container && !container.classList.contains("hidden")) {
                        container.classList.add("hidden");
                        container.style.display = "none";
                        (this.debugDashboard as any).visible = false;
                        return;
                    }
                }
                
                // Закрываем другие панели сначала
                if (this.physicsPanel && typeof this.physicsPanel.isVisible === 'function' && this.physicsPanel.isVisible()) {
                    this.physicsPanel.hide();
                    return;
                }
                if (this.chatSystem && typeof (this.chatSystem as any).isTerminalVisible === 'function' && (this.chatSystem as any).isTerminalVisible()) {
                    this.chatSystem.toggleTerminal();
                    return;
                }
                if (this.sessionSettings && typeof (this.sessionSettings as any).isVisible === 'function' && (this.sessionSettings as any).isVisible()) {
                    (this.sessionSettings as any).hide();
                    return;
                }
                if (this.cheatMenu && typeof this.cheatMenu.isVisible === 'function' && this.cheatMenu.isVisible()) {
                    this.cheatMenu.hide();
                    return;
                }
                if (this.networkMenu && typeof this.networkMenu.isVisible === 'function' && this.networkMenu.isVisible()) {
                    this.networkMenu.hide();
                    return;
                }
                if (this.worldGenerationMenu && typeof this.worldGenerationMenu.isVisible === 'function' && this.worldGenerationMenu.isVisible()) {
                    this.worldGenerationMenu.hide();
                    return;
                }
                
                // Обработка главного меню - переключатель (toggle)
                if (this.mainMenu) {
                    const isMenuVisible = this.mainMenu.isVisible();
                    
                    if (isMenuVisible) {
                        // Меню открыто - закрываем его и возобновляем игру
                        logger.log("[Game] ESC pressed - closing menu and resuming game");
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        // КРИТИЧНО: Блокируем движение мыши ПЕРЕД закрытием меню
                        // Это предотвращает случайный проворот башни при закрытии меню
                        this.pointerMoveBlocked = true;
                        
                        // Закрываем меню и возобновляем игру
                        this.mainMenu.hide();
                        if (this.gamePaused) {
                            this.togglePause();
                        }
                        
                        // КРИТИЧНО: Разблокируем движение мыши через задержку (увеличено до 400ms для надёжности)
                        setTimeout(() => {
                            this.pointerMoveBlocked = false;
                        }, 400); // УВЕЛИЧЕНО до 400ms для полной надёжности
                        
                        return;
                    } else {
                        // Меню закрыто - открываем его и ставим на паузу
                        logger.log("[Game] ESC pressed - opening menu and pausing game");
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        
                        // КРИТИЧНО: Блокируем движение мыши ПЕРЕД открытием меню
                        // Это предотвращает случайный проворот башни при открытии меню
                        this.pointerMoveBlocked = true;
                        
                        if (!this.gamePaused) {
                            this.togglePause();
                        }
                        this.mainMenu.show(this.gamePaused);
                        
                        // КРИТИЧНО: Разблокируем движение мыши через задержку
                        setTimeout(() => {
                            this.pointerMoveBlocked = false;
                        }, 300); // 300ms достаточно для открытия меню
                        
                        return;
                    }
                }
            }
            
            // Обработка клавиш 1-5 для припасов (только если НЕ зажат CTRL)
            if (this.gameStarted && this.tank && this.consumablesManager && !e.ctrlKey) {
                const keyToSlot: { [key: string]: number } = {
                    "Digit1": 1,
                    "Digit2": 2,
                    "Digit3": 3,
                    "Digit4": 4,
                    "Digit5": 5
                };
                
                const slot = keyToSlot[e.code];
                if (slot) {
                    const used = this.consumablesManager.use(slot, this.tank);
                    if (this.chatSystem) {
                        this.chatSystem.updateConsumables(this.consumablesManager.getAll());
                    }
                    if (this.hud) {
                        this.hud.updateConsumables(this.consumablesManager.getAll());
                    }
                        if (used) {
                            const consumable = this.consumablesManager.get(slot);
                            if (!consumable && this.chatSystem) {
                                // Припас использован
                                this.chatSystem.success(`Припас из слота ${slot} использован`);
                            }
                        } else {
                            // Слот пуст
                            if (this.chatSystem) {
                                this.chatSystem.warning(`Слот ${slot} пуст`);
                        }
                    }
                }
            }
        }, true); // ИСПРАВЛЕНИЕ: capture phase = true, чтобы Ctrl+цифры работали до других обработчиков
        
        // КРИТИЧЕСКИ ВАЖНО: Подписка на onAfterPhysicsObservable будет добавлена в init() после создания сцены и включения физики
        
        // КРИТИЧНО: НЕ запускаем render loop здесь - он будет запущен в init()
        // Два render loop одновременно вызывают двойной рендеринг и нулевой FPS!
        // Оптимизированный render loop с проверкой готовности
        // ВАЖНО: Запускаем render loop только после создания engine и scene
        // ОТКЛЮЧЕНО: Render loop теперь запускается только в init()
        /*
        if (this.engine && this.scene) {
            this.engine.runRenderLoop(() => {
                if (this.scene && this.engine) {
                    // КРИТИЧЕСКИ ВАЖНО: Проверяем наличие активной камеры перед рендерингом
                    // Если камера не создана, создаем временную камеру по умолчанию
                    if (!this.scene.activeCamera) {
                        if (this.camera) {
                            this.scene.activeCamera = this.camera;
                        } else if (this.scene && !this.gameInitialized) {
                            // Создаем временную камеру по умолчанию только если игра еще не инициализирована
                            // Это нормально - камера будет заменена на игровую после init()
                            this.scene.createDefaultCamera(true);
                            // Не логируем - это нормальное поведение до инициализации
                        } else if (this.scene) {
                            // Если игра инициализирована, но камеры нет - это проблема
                            this.scene.createDefaultCamera(true);
                            logger.warn("Created default camera - game camera missing");
                        } else {
                            // Если сцена еще не создана, пропускаем рендеринг
                            return;
                        }
                    }
                    
                // УБРАНО: Render loop больше не скрывает меню автоматически
                // Меню должно управляться только через методы show() и hide()
                // Это предотвращает конфликты при первой загрузке, когда gameStarted может быть true
                // из предыдущей сессии, но меню должно быть видимо
                // Render loop - no debug logging here (causes ERR_INSUFFICIENT_RESOURCES)
                if (this.gameStarted && !this.gamePaused) {
                    // Game is running
                } else {
                    // Game not started or paused
                }
                
                // Рендерим сцену всегда (даже если игра на паузе, чтобы видеть меню)
                // КРИТИЧНО: Обновляем логику ПЕРЕД рендерингом для правильного порядка
                if (!this.gamePaused) {
                    // Обновляем логику игры только если игра запущена
                    if (this.gameStarted) {
                        // КРИТИЧНО: Синхронизируем _updateTick с GameUpdate для кэширования
                        this._updateTick++;
                        if (this._updateTick > 1000000) this._updateTick = 0;
                        // Используем GameUpdate для обновления
                        this.gameUpdate.update();
                    }
                    // Рендерим сцену после обновления логики
                    this.scene.render();
                } else {
                    // Рендерим сцену даже на паузе, чтобы видеть игру за меню
                    this.scene.render();
                }
            }
            // Если сцена или engine не созданы, просто пропускаем рендеринг
        });
        } else {
            logger.error("[Game] Cannot start render loop - engine or scene not initialized!");
        }
        */

        window.addEventListener("resize", () => {
            this.engine.resize();
        });
        
        // Слушаем изменения видимости меню и обновляем pointer-events для canvas
        window.addEventListener("menuVisibilityChanged", () => {
            this.updateCanvasPointerEvents();
        });
        
        // Периодическая проверка видимости меню (на случай если событие не сработало)
        // Очищаем предыдущий таймер если есть
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
        }
        this.canvasPointerEventsCheckInterval = window.setInterval(() => {
            this.updateCanvasPointerEvents();
        }, 100);
    }
    
    private updateCanvasPointerEvents(): void {
        if (!this.canvas) return;
        // Если меню видимо, отключаем pointer-events для canvas
        if (this.mainMenu && this.mainMenu.isVisible()) {
            // Принудительно блокируем с !important
            this.canvas.style.setProperty("pointer-events", "none", "important");
            this.canvas.setAttribute("data-menu-blocked", "true");
        } else {
            // Разрешаем только если меню действительно скрыто
            this.canvas.style.setProperty("pointer-events", "auto", "important");
            this.canvas.removeAttribute("data-menu-blocked");
        }
    }
    
    // === SETTINGS APPLICATION ===
    
    private applyGraphicsSettings(): void {
        if (!this.engine || !this.scene) return;
        
        // Anti-aliasing
        // Note: Engine antialias is set at creation, would need engine recreation to change
        
        // VSync
        // Note: VSync is typically handled by browser/OS, but we can note the setting
        
        // Max FPS
        if (this.settings.maxFPS > 0) {
            // Engine doesn't have direct FPS limit, but we can use requestAnimationFrame throttling
            // This is handled in the render loop
        }
        
        // Shadow quality - ОПТИМИЗАЦИЯ: Отключаем в production независимо от настроек
        const isProduction = (import.meta as any).env?.PROD || false;
        this.scene.shadowsEnabled = !isProduction && this.settings.shadowQuality > 0;
        
        // Particle quality
        this.scene.particlesEnabled = this.settings.particleQuality > 0;
        
        // Texture quality - would need to reload textures at different resolutions
        // Lighting quality - would need to adjust light counts/quality
        
        // Fullscreen
        if (this.settings.fullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (!this.settings.fullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        
        logger.debug("Graphics settings applied");
    }
    
    private applyAudioSettings(): void {
        if (this.mainMenu) {
            const settings = this.mainMenu.getSettings();
            this.gameAudio.setSettings(settings);
            this.gameAudio.applySettings();
        }
    }
    
    private applyControlSettings(): void {
        if (!this.tank) return;
        
        // Invert mouse Y - would need to be applied in tank controller
        // Auto reload - would need to be applied in tank controller
        // Hold to aim - would need to be applied in tank controller
        
        logger.debug("Control settings applied");
    }
    
    private applyCameraSettings(): void {
        if (!this.camera) return;
        
        // Camera distance
        if (this.camera instanceof ArcRotateCamera) {
            this.camera.radius = this.settings.cameraDistance;
        }
        
        // Camera height - applied in camera update via cameraBeta
        // Camera FOV - only for UniversalCamera (aimCamera)
        if (this.aimCamera) {
            const aimCam = this.aimCamera as UniversalCamera;
            if ('fov' in aimCam) {
                aimCam.fov = (this.settings.cameraFOV * Math.PI) / 180;
            }
        }
        
        // Camera smoothing - applied in camera update
        // Camera shake intensity - applied in camera update
        // First person mode - would need camera switching logic
        
        logger.debug("Camera settings applied");
    }
    
    private applyUISettings(): void {
        if (this.mainMenu) {
            const settings = this.mainMenu.getSettings();
            this.gameUI.setSettings(settings);
            this.gameUI.applySettings();
        }
    }
    
    // === LOADING SCREEN ===
    
    private createLoadingScreen(): void {
        if (this.loadingScreen) return;
        
        this.loadingScreen = document.createElement("div");
        this.loadingScreen.id = "loading-screen";
        this.loadingScreen.innerHTML = `
            <style>
                #loading-screen {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%);
                    background-size: 200% 200%;
                    animation: backgroundShift 10s ease infinite;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    font-family: 'Press Start 2P', monospace;
                    overflow: hidden;
                }
                
                @keyframes backgroundShift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                
                #loading-screen::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: 
                        radial-gradient(circle at 20% 50%, rgba(0, 255, 0, 0.05) 0%, transparent 50%),
                        radial-gradient(circle at 80% 50%, rgba(0, 255, 0, 0.05) 0%, transparent 50%);
                    animation: backgroundPulse 4s ease-in-out infinite;
                    pointer-events: none;
                }
                
                @keyframes backgroundPulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.6; }
                }
                
                .loading-logo {
                    font-size: 48px;
                    color: #0f0;
                    text-shadow: 0 0 20px rgba(0, 255, 0, 0.5),
                                 0 0 40px rgba(0, 255, 0, 0.3),
                                 0 0 60px rgba(0, 255, 0, 0.2);
                    margin-bottom: 60px;
                    letter-spacing: 4px;
                    animation: logoGlow 2s ease-in-out infinite;
                    position: relative;
                }
                
                @keyframes logoGlow {
                    0%, 100% { 
                        text-shadow: 0 0 20px rgba(0, 255, 0, 0.5),
                                     0 0 40px rgba(0, 255, 0, 0.3),
                                     0 0 60px rgba(0, 255, 0, 0.2);
                    }
                    50% { 
                        text-shadow: 0 0 30px rgba(0, 255, 0, 0.7),
                                     0 0 60px rgba(0, 255, 0, 0.5),
                                     0 0 90px rgba(0, 255, 0, 0.3);
                    }
                }
                
                .loading-logo .accent {
                    color: #fff;
                    text-shadow: 0 0 20px rgba(255, 255, 255, 0.8),
                                 0 0 40px rgba(255, 255, 255, 0.5);
                    animation: accentPulse 1.5s ease-in-out infinite;
                }
                
                @keyframes accentPulse {
                    0%, 100% { 
                        text-shadow: 0 0 20px rgba(255, 255, 255, 0.8),
                                     0 0 40px rgba(255, 255, 255, 0.5);
                    }
                    50% { 
                        text-shadow: 0 0 30px rgba(255, 255, 255, 1),
                                     0 0 60px rgba(255, 255, 255, 0.7);
                    }
                }
                
                .loading-container {
                    width: 400px;
                    text-align: center;
                    position: relative;
                    z-index: 1;
                }
                
                .loading-bar-bg {
                    width: 100%;
                    height: 24px;
                    background: rgba(0, 20, 0, 0.6);
                    border: 2px solid #0a0;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 0 15px rgba(0, 255, 0, 0.3),
                                inset 0 0 10px rgba(0, 100, 0, 0.5);
                    position: relative;
                }
                
                .loading-bar-bg::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg,
                        transparent 0%,
                        rgba(0, 255, 0, 0.1) 50%,
                        transparent 100%);
                    animation: pulse 2s ease-in-out infinite;
                }
                
                .loading-bar-fill {
                    height: 100%;
                    background: linear-gradient(90deg, 
                        #0a0 0%, 
                        #1f1 25%,
                        #0f0 50%, 
                        #1f1 75%,
                        #0a0 100%);
                    background-size: 200% 100%;
                    width: 0%;
                    box-shadow: 0 0 20px rgba(0, 255, 0, 0.6),
                                inset 0 0 10px rgba(255, 255, 255, 0.2);
                    position: relative;
                    animation: gradientShift 2s linear infinite;
                    transition: width 0.1s linear;
                }
                
                @keyframes gradientShift {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                
                @keyframes pulse {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 0.6; }
                }
                
                .loading-bar-fill::after {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(90deg, 
                        transparent 0%, 
                        rgba(255, 255, 255, 0.4) 30%,
                        rgba(255, 255, 255, 0.6) 50%,
                        rgba(255, 255, 255, 0.4) 70%,
                        transparent 100%);
                    animation: shimmer 1.2s infinite;
                }
                
                @keyframes shimmer {
                    0% { transform: translateX(-150%); }
                    100% { transform: translateX(150%); }
                }
                
                .loading-bar-fill::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 4px;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.8);
                    box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
                    animation: scan 1.5s ease-in-out infinite;
                }
                
                @keyframes scan {
                    0% { left: -4px; }
                    100% { left: 100%; }
                }
                
                .loading-text {
                    color: #0f0;
                    font-size: 12px;
                    margin-top: 20px;
                    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
                    min-height: 20px;
                    animation: textFade 0.5s ease-in;
                }
                
                @keyframes textFade {
                    0% { opacity: 0; transform: translateY(5px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                
                .loading-percent {
                    color: #0f0;
                    font-size: 28px;
                    margin-top: 15px;
                    text-shadow: 0 0 15px rgba(0, 255, 0, 0.6),
                                 0 0 30px rgba(0, 255, 0, 0.3);
                    font-weight: bold;
                    letter-spacing: 2px;
                    animation: percentGlow 1.5s ease-in-out infinite;
                }
                
                @keyframes percentGlow {
                    0%, 100% { 
                        text-shadow: 0 0 15px rgba(0, 255, 0, 0.6),
                                     0 0 30px rgba(0, 255, 0, 0.3);
                    }
                    50% { 
                        text-shadow: 0 0 25px rgba(0, 255, 0, 0.8),
                                     0 0 50px rgba(0, 255, 0, 0.5);
                    }
                }
                
                .loading-tip {
                    color: #888;
                    font-size: 10px;
                    margin-top: 40px;
                    max-width: 500px;
                    line-height: 1.6;
                }
                
                .loading-tank {
                    font-size: 50px;
                    margin-bottom: 20px;
                    animation: tankBounce 1.2s ease-in-out infinite,
                                tankRotate 3s linear infinite;
                    filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5));
                }
                
                @keyframes tankBounce {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-15px) rotate(5deg); }
                }
                
                @keyframes tankRotate {
                    0% { filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5)) hue-rotate(0deg); }
                    50% { filter: drop-shadow(0 0 15px rgba(0, 255, 0, 0.7)) hue-rotate(10deg); }
                    100% { filter: drop-shadow(0 0 10px rgba(0, 255, 0, 0.5)) hue-rotate(0deg); }
                }
            </style>
            <div class="loading-logo">PROTOCOL <span class="accent">TX</span></div>
            <div class="loading-tank">🎖️</div>
            <div class="loading-container">
                <div class="loading-bar-bg">
                    <div class="loading-bar-fill" id="loading-bar-fill"></div>
                </div>
                <div class="loading-percent" id="loading-percent">0%</div>
                <div class="loading-text" id="loading-text">Инициализация...</div>
            </div>
            <div class="loading-tip" id="loading-tip"></div>
        `;
        
        document.body.appendChild(this.loadingScreen);
        
        // Показать случайный совет
        this.showRandomLoadingTip();
    }
    
    private showRandomLoadingTip(): void {
        const tips = [
            "💡 Используйте ПКМ для прицеливания - это увеличивает точность!",
            "💡 Клавиша G открывает гараж для смены танка",
            "💡 Колесо мыши позволяет приближать/отдалять камеру в режиме прицеливания",
            "💡 TAB показывает статистику игры",
            "💡 ESC ставит игру на паузу",
            "💡 Разные корпуса и орудия имеют уникальные характеристики",
            "💡 Клавиша M открывает тактическую карту",
            "💡 Захватывайте гаражи для получения тактического преимущества",
            "💡 Расходники 1-5 помогают в сложных ситуациях",
            "💡 Shift включает свободный обзор камеры"
        ];
        
        const tipElement = document.getElementById("loading-tip");
        if (tipElement) {
            const index = Math.floor(Math.random() * tips.length);
            const tip = tips[index] ?? "";
            tipElement.textContent = tip;
        }
    }
    
    private updateLoadingProgress(progress: number, stage: string): void {
        this.targetLoadingProgress = Math.min(100, Math.max(0, progress));
        // Запускаем плавную анимацию прогресса, если она еще не запущена
        if (this.loadingAnimationFrame === null) {
            this.animateLoadingProgress();
        }
        
        // Обновляем текст этапа сразу
        const stageText = document.getElementById("loading-text");
        if (stageText) {
            stageText.textContent = stage;
        }
    }
    
    private animateLoadingProgress(): void {
        const barFill = document.getElementById("loading-bar-fill");
        const percentText = document.getElementById("loading-percent");
        
        if (!barFill || !percentText) {
            this.loadingAnimationFrame = null;
            return;
        }
        
        // Плавная интерполяция к целевому прогрессу
        const diff = this.targetLoadingProgress - this.loadingProgress;
        if (Math.abs(diff) > 0.1) {
            // Скорость интерполяции зависит от расстояния (быстрее для больших скачков)
            const speed = Math.min(0.15, Math.abs(diff) * 0.02 + 0.05);
            this.loadingProgress += diff * speed;
            
            // Обновляем визуальные элементы
            const roundedProgress = Math.round(this.loadingProgress);
            barFill.style.width = `${this.loadingProgress}%`;
            percentText.textContent = `${roundedProgress}%`;
            
            // Продолжаем анимацию
            this.loadingAnimationFrame = requestAnimationFrame(() => this.animateLoadingProgress());
        } else {
            // Достигли целевого значения
            this.loadingProgress = this.targetLoadingProgress;
            const roundedProgress = Math.round(this.loadingProgress);
            barFill.style.width = `${this.loadingProgress}%`;
            percentText.textContent = `${roundedProgress}%`;
            this.loadingAnimationFrame = null;
        }
    }
    
    private hideLoadingScreen(): void {
        if (this.loadingScreen) {
            this.loadingScreen.style.transition = "opacity 0.5s ease-out";
            this.loadingScreen.style.opacity = "0";
            setTimeout(() => {
                if (this.loadingScreen) {
                    this.loadingScreen.remove();
                    this.loadingScreen = null;
                }
            }, 500);
        }
    }
    
    // Called when an achievement is unlocked
    private onAchievementUnlocked(achievement: Achievement): void {
        logger.log(`[Game] Achievement unlocked: ${achievement.name}`);
        
        // Show beautiful achievement notification
        if (this.hud && this.hud.showAchievementNotification) {
            const name = this.achievementsSystem?.getAchievementName(achievement) || achievement.name;
            const description = this.achievementsSystem?.getAchievementDescription(achievement) || achievement.description;
            this.hud.showAchievementNotification(name, description, achievement.icon, achievement.reward);
        } else if (this.hud) {
            // Fallback to regular notification
            const name = this.achievementsSystem?.getAchievementName(achievement) || achievement.name;
            this.hud?.showNotification?.(`🏆 ${name}`, "success");
        }
        
        // Play sound
        if (this.soundManager) {
            this.soundManager.playReloadComplete?.(); // Use reload sound as achievement sound
        }
        
        // Give reward
        if (achievement.reward && this.playerProgression) {
            const reward = this.achievementsSystem?.claimReward(achievement.id);
            if (reward) {
                if (reward.type === "experience" && reward.amount) {
                    const diffMul = this.getDifficultyRewardMultiplier();
                    const xp = Math.round(reward.amount * diffMul);
                    this.playerProgression.addExperience(xp, "achievement");
                    logger.debug(`[Game] Awarded ${xp} XP for achievement (base: ${reward.amount}, diffMul: ${diffMul})`);
                }
            }
        }
    }
    
    private onMissionComplete(mission: Mission): void {
        logger.log(`[Game] Mission completed: ${mission.name}`);
        
        // Show notification
        if (this.hud) {
            const name = this.missionSystem?.getName(mission) || mission.name;
            this.hud?.showNotification?.(`📋 Миссия выполнена: ${name}`, "success");
        }
        
        // Play sound
        if (this.soundManager) {
            this.soundManager.playReloadComplete?.();
        }
        
        // Auto-claim reward
        if (mission.reward && this.missionSystem) {
            const reward = this.missionSystem.claimReward(mission.id);
            if (reward) {
                if (reward.type === "experience" && this.playerProgression) {
                    const diffMul = this.getDifficultyRewardMultiplier();
                    const xp = Math.round(reward.amount * diffMul);
                    this.playerProgression.addExperience(xp, "mission");
                    logger.debug(`[Game] Awarded ${xp} XP for mission (base: ${reward.amount}, diffMul: ${diffMul})`);
                } else if (reward.type === "credits" && this.currencyManager) {
                    this.currencyManager.addCurrency(reward.amount);
                    logger.log(`[Game] Awarded ${reward.amount} credits for mission`);
                }
            }
        }
    }
    
    // Запускает игру: инициализирует игровой цикл, спавнит игрока и врагов
    startGame(): void {
        logger.log("startGame() called, mapType:", this.currentMapType);
        this.gameStarted = true;
        this.gamePaused = false;
        // Settings will be loaded from menu when available
        if (this.mainMenu) {
            this.settings = this.mainMenu.getSettings();
        }
        
        // Инициализируем массив врагов
        if (!this.enemyTanks) {
            this.enemyTanks = [];
        } else {
            // Очищаем старых врагов при перезапуске
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const enemyCount = this.enemyTanks.length;
            for (let i = 0; i < enemyCount; i++) {
                const enemy = this.enemyTanks[i];
                if (enemy && enemy.chassis) {
                    try {
                        enemy.chassis.dispose();
                    } catch (e) {
                        // Игнорируем ошибки при dispose
                    }
                }
            }
            this.enemyTanks = [];
        }
        
        // Track survival time for achievements
        this.survivalStartTime = Date.now();
        
        // Track map exploration achievement
        if (this.achievementsSystem) {
            try {
                const visitedMaps = JSON.parse(localStorage.getItem('visitedMaps') || '[]') as string[];
                if (!visitedMaps.includes(this.currentMapType)) {
                    visitedMaps.push(this.currentMapType);
                    localStorage.setItem('visitedMaps', JSON.stringify(visitedMaps));
                }
                this.achievementsSystem.setProgress("explorer", visitedMaps.length);
            } catch (e) {
                // localStorage error
            }
        }
        
        // Показываем оповещение о карте при заходе в бой
        if (this.hud) {
            const mapNames: Record<string, string> = {
                "normal": "Эта самая карта",
                "sandbox": "Песочница",
                "polygon": "Полигон",
                "frontline": "Передовая",
                "ruins": "Руины",
                "canyon": "Ущелье",
                "industrial": "Промзона",
                "urban_warfare": "Городские бои",
                "underground": "Подземелье",
                "coastal": "Побережье",
                "tartaria": "Тартария"
            };
            const mapName = mapNames[this.currentMapType] || this.currentMapType;
            this.hud.showMessage(`🗺️ КАРТА: ${mapName}`, "#0ff", 4000);
        }
        
        // Apply mouse sensitivity from settings (1-10 scale to 0.001-0.006)
        const sensValue = this.settings.mouseSensitivity || 5;
        this.mouseSensitivity = 0.001 + (sensValue / 10) * 0.005;
        logger.log(`Mouse sensitivity: ${sensValue} -> ${this.mouseSensitivity.toFixed(4)}`);
        
        // Убеждаемся, что canvas виден и имеет правильный размер
        if (this.canvas) {
            this.canvas.style.display = "block";
            this.canvas.style.visibility = "visible";
            this.canvas.style.opacity = "1";
            this.canvas.style.zIndex = "1"; // Canvas должен быть виден
            this.updateCanvasPointerEvents(); // Используем метод вместо прямой установки
            this.canvas.style.position = "fixed";
            this.canvas.style.top = "0";
            this.canvas.style.left = "0";
            this.canvas.style.width = "100%";
            this.canvas.style.height = "100%";
            
            // Убеждаемся, что canvas имеет правильный размер
            if (this.canvas.width === 0 || this.canvas.height === 0) {
                this.engine.resize();
            }
            
            // Принудительно обновляем размер canvas
            this.engine.resize();
            
            logger.debug("Canvas visible, size:", this.canvas.width, "x", this.canvas.height);
            logger.debug("Canvas style:", {
                display: this.canvas.style.display,
                visibility: this.canvas.style.visibility,
                opacity: this.canvas.style.opacity,
                zIndex: this.canvas.style.zIndex,
                position: this.canvas.style.position
            });
        } else {
            logger.error("ERROR: Canvas not initialized!");
            return; // Не продолжаем, если canvas не инициализирован
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что камера активна
        if (this.camera && this.scene) {
            logger.debug("Setting active camera...");
            this.scene.activeCamera = this.camera;
            this.camera.setEnabled(true);
            // Контролы камеры уже настроены через setupCameraInput() в init()
            logger.log("[Game] Camera controls already set up");
            logger.log("[Game] Camera position:", this.camera.position);
            logger.log("[Game] Camera target:", this.camera.getTarget());
            
            // Убеждаемся, что камера видна
            if (this.tank && this.tank.chassis) {
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию танка
                const tankPos = this.tank.getCachedChassisPosition();
                const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                this.camera.setTarget(lookAt);
                this.camera.radius = this.settings.cameraDistance;
            }
            
            // ОПТИМИЗАЦИЯ: Камера обновляется через onAfterPhysicsObservable, не вызываем напрямую
            // this.updateCamera(); // УБРАНО для оптимизации
        } else {
            // Камера еще не создана - это нормально, она создастся в init()
            logger.debug("Camera not yet initialized, will be created in init()", {
                camera: !!this.camera,
                scene: !!this.scene
            });
        }
        
        // Убеждаемся, что сцена готова к рендерингу
        if (this.scene) {
            logger.log("[Game] Scene ready, meshes count:", this.scene.meshes.length);
            logger.log("[Game] Scene active camera:", this.scene.activeCamera?.name);
        }
        
        // Скрываем меню при запуске игры
        if (this.mainMenu) {
            this.mainMenu.hide();
        }
        
        // Проверяем, что панель выбора карт скрыта
        const mapSelectionPanel = document.getElementById("map-selection-panel");
        if (mapSelectionPanel) {
            logger.log("[Game] Map selection panel found, visible:", mapSelectionPanel.classList.contains("visible"));
            mapSelectionPanel.classList.remove("visible");
            mapSelectionPanel.style.display = "none"; // Принудительно скрываем
            logger.log("[Game] Map selection panel hidden manually");
        }
        
        // Убеждаемся, что все панели скрыты
        const allPanels = document.querySelectorAll(".panel-overlay");
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
        const panelCount = allPanels.length;
        for (let i = 0; i < panelCount; i++) {
            const panel = allPanels[i] as HTMLElement;
            panel.classList.remove("visible");
            panel.style.display = "none";
        }
        
        // Apply settings
        if (this.chunkSystem) {
            // Update render distance from settings
            logger.debug(`Render distance: ${this.settings.renderDistance}`);
        }
        
        // Apply FPS visibility setting
        if (this.hud) {
            this.hud.setShowFPS(this.settings.showFPS);
            
            // ДИАГНОСТИКА: Проверяем состояние GUI при старте игры
            // logger.log("[Game] HUD state at game start - checking visibility...");
            // Убеждаемся, что renderTargetsEnabled включен (критично для GUI)
            if (this.scene && !this.scene.renderTargetsEnabled) {
                logger.error("[Game] CRITICAL: renderTargetsEnabled is FALSE at game start! Fixing...");
                this.scene.renderTargetsEnabled = true;
            }
        } else {
            logger.error("[Game] CRITICAL: HUD is null at game start!");
        }
        
        if (this.debugDashboard) {
            // Show/hide based on settings
            const dashboard = document.getElementById("debug-dashboard");
            if (dashboard) {
                dashboard.classList.toggle("hidden", !this.settings.showFPS);
            }
        }
        
        // Play engine start sound (tank starting up)
        // ОТКЛЮЧЕНО: playEngineStartSound() - звук запуска мотора
        if (this.soundManager) {
            // this.soundManager.playEngineStartSound(); // Отключено
            
            // Start actual engine sound immediately (без звука запуска)
            // Запускаем звук мотора сразу, чтобы он работал даже на холостом ходу
            setTimeout(() => {
                if (this.soundManager) {
                    logger.log("[Game] Starting engine sound immediately...");
                    this.soundManager.startEngine();
                    // Сразу обновляем звук на холостом ходу для гарантии слышимости
                    if (this.tank && this.tank.chassis) {
                        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
                        const pos = this.tank.getCachedChassisPosition();
                        this.soundManager.updateEngine(0, 0, pos); // Холостой ход
                    }
                }
            }, 100); // Engine starts after 0.1 seconds (почти сразу)
        }
        
        // Автоматически захватываем мышь при старте игры
        // чтобы пользователю не нужно было делать дополнительный клик
        if (this.canvas) {
            // Небольшая задержка чтобы UI успел обновиться
            setTimeout(() => {
                if (this.canvas && this.gameStarted && !this.gamePaused) {
                    this.canvas.requestPointerLock();
                    logger.log("[Game] Pointer lock requested automatically");
                }
            }, 100);
        }
        
        logger.log("[Game] Started! gameStarted:", this.gameStarted, "gamePaused:", this.gamePaused);
    }
    
    // Переключает состояние паузы игры
    public togglePause(): void {
        
        if (!this.gameStarted) return;
        
        this.gamePaused = !this.gamePaused;
        
        
        if (this.gamePaused) {
            // Закрываем карту при паузе
            if (this.hud && this.hud.isFullMapVisible()) {
                this.hud.toggleFullMap();
            }
            this.mainMenu?.show(true); // Передаем true чтобы показать кнопки паузы
        } else {
            this.mainMenu?.hide();
        }
        
        // Обновляем pointer-events для canvas в зависимости от видимости меню
        this.updateCanvasPointerEvents();
        
        logger.log(`[Game] ${this.gamePaused ? "Paused" : "Resumed"}`);
    }
    
    // Перезапускает игру на той же карте
    restartGame(): void {
        logger.log("[Game] Restarting game on same map...");
        
        // Сохраняем текущую карту для автозапуска после перезагрузки
        if (this.currentMapType) {
            localStorage.setItem("ptx_restart_map", this.currentMapType);
            localStorage.setItem("ptx_auto_start", "true");
            logger.log(`[Game] Saved map for restart: ${this.currentMapType}`);
        }
        
        window.location.reload();
    }
    
    // Выходит из боя и возвращается в главное меню
    exitBattle(): void {
        logger.log("[Game] Exiting battle...");
        window.location.reload();
    }
    
    // Останавливает игру: очищает все ресурсы, останавливает звуки, удаляет объекты
    stopGame(): void {
        logger.log("[Game] Stopping game...");
        this.gameStarted = false;
        this.gamePaused = false;
        
        // Останавливаем звуки
        if (this.soundManager) {
            this.soundManager.stopEngine();
        }
        
        // Очищаем врагов
        if (this.enemyTanks) {
            // ОПТИМИЗАЦИЯ: Используем for цикл вместо forEach
            const enemyCount2 = this.enemyTanks.length;
            for (let i = 0; i < enemyCount2; i++) {
                const enemy = this.enemyTanks[i];
                if (enemy && enemy.chassis) enemy.chassis.dispose();
            }
            this.enemyTanks = [];
        }
        
        // Очищаем танк игрока - полностью удаляем все части
        if (this.tank) {
            // Удаляем все меши танка
            if (this.tank.chassis && !this.tank.chassis.isDisposed()) {
                this.tank.chassis.dispose();
            }
            if (this.tank.turret && !this.tank.turret.isDisposed()) {
                this.tank.turret.dispose();
            }
            if (this.tank.barrel && !this.tank.barrel.isDisposed()) {
                this.tank.barrel.dispose();
            }
            // Удаляем физическое тело
            if (this.tank.physicsBody) {
                this.tank.physicsBody.dispose();
            }
            this.tank = undefined;
        }
        
        // Обновляем ссылки в меню читов
        if (this.cheatMenu) {
            this.cheatMenu.setTank(null);
        }
        
        // Очищаем эффекты
        if (this.effectsManager) {
            this.effectsManager.clearAll();
        }
        
        // Очищаем чат систему
        if (this.chatSystem && (this.chatSystem as any).dispose) {
            (this.chatSystem as any).dispose();
        }
        
        // Очищаем HUD
        if (this.hud && typeof (this.hud as any).hide === 'function') {
            (this.hud as any).hide();
        }
        
        // Останавливаем таймер проверки видимости меню
        if (this.canvasPointerEventsCheckInterval !== null) {
            clearInterval(this.canvasPointerEventsCheckInterval);
            this.canvasPointerEventsCheckInterval = null;
        }
        
        // Останавливаем таймер волн фронтлайна
        if (this.frontlineWaveTimer !== null) {
            clearInterval(this.frontlineWaveTimer);
            this.frontlineWaveTimer = null;
        }
    }

    // Инициализирует игру: создает сцену, загружает ресурсы, настраивает системы
    async init() {
        // ОПТИМИЗАЦИЯ: Определяем режим production один раз для всего метода
        const isProduction = (import.meta as any).env?.PROD || false;
        
        // Initialize Firebase
        try {
            const firebaseInitialized = await firebaseService.initialize();
            if (firebaseInitialized) {
                // logger.log("[Game] Firebase initialized successfully");
                
                // Initialize social system (friends & clans)
                await socialSystem.initialize();
                logger.log("[Game] Social system initialized");
            } else {
                logger.warn("[Game] Firebase initialization failed, continuing without cloud features");
            }
        } catch (error) {
            // УЛУЧШЕНО: Улучшенная обработка ошибок Firebase
            logger.warn("[Game] Firebase initialization error (non-critical):", error);
            if (error instanceof Error) {
                logger.debug("[Game] Firebase error stack:", error.stack);
            }
        }
        try {
            logger.log(`[Game] init() called with mapType: ${this.currentMapType}`);
            
            // КРИТИЧНО: Закрываем меню мультиплеера при показе экрана загрузки
            if (this.networkMenu && typeof this.networkMenu.isVisible === 'function' && this.networkMenu.isVisible()) {
                this.networkMenu.hide();
                logger.debug("[Game] Closed network menu on loading screen show");
            }
            
            // Показываем загрузочный экран
            this.createLoadingScreen();
            this.updateLoadingProgress(5, "Инициализация движка...");
            
            // Убеждаемся, что canvas виден и не перекрыт
            if (this.canvas) {
                this.canvas.style.display = "block";
                this.canvas.style.visibility = "visible";
                this.canvas.style.opacity = "1";
                this.canvas.style.zIndex = "1";
                this.canvas.style.position = "fixed";
                this.canvas.style.top = "0";
                this.canvas.style.left = "0";
                this.canvas.style.width = "100%";
                this.canvas.style.height = "100%";
                logger.debug("Canvas visibility ensured");
            } else {
                logger.error("ERROR: Canvas is null in init()!");
                return;
            }
            
            // Убеждаемся, что engine запущен
            logger.debug("Engine initialized:", !!this.engine);
            logger.debug("Scene initialized:", !!this.scene);
            
            // КРИТИЧНО: Запускаем render loop ТОЛЬКО ОДИН РАЗ в init()
            // Проверяем, не запущен ли уже render loop через флаг
            if (this.engine && this.scene) {
                if (!(this.engine as any)._renderLoopRunning) {
                    (this.engine as any)._renderLoopRunning = true;
                    logger.log("[Game] Starting render loop in init() - SINGLE INSTANCE");
                    this.engine.runRenderLoop(() => {
                        if (this.scene && this.engine) {
                            // КРИТИЧЕСКИ ВАЖНО: Проверяем наличие активной камеры перед рендерингом
                            if (!this.scene.activeCamera) {
                                if (this.camera) {
                                    this.scene.activeCamera = this.camera;
                                } else {
                                    this.scene.createDefaultCamera(true);
                                }
                            }
                            
                            // КРИТИЧНО: Обновляем логику ПЕРЕД рендерингом для правильного порядка
                            if (!this.gamePaused) {
                                // Обновляем логику игры только если игра запущена
                                if (this.gameStarted) {
                                    // КРИТИЧНО: Синхронизируем _updateTick с GameUpdate для кэширования
                                    this._updateTick++;
                                    if (this._updateTick > 1000000) this._updateTick = 0;
                                    // Используем GameUpdate для обновления
                                    this.gameUpdate.update();
                                }
                                // КРИТИЧНО: Рендерим сцену ТОЛЬКО ОДИН РАЗ за кадр!
                                // Проверяем, не рендерится ли сцена дважды
                                if (!(this.scene as any)._isRendering) {
                                    (this.scene as any)._isRendering = true;
                                    this.scene.render();
                                    (this.scene as any)._isRendering = false;
                                } else {
                                    logger.error("[Game] CRITICAL: scene.render() called twice in same frame! This causes visual duplication!");
                                }
                            } else {
                                // КРИТИЧНО: Рендерим сцену ТОЛЬКО ОДИН РАЗ за кадр даже на паузе!
                                if (!(this.scene as any)._isRendering) {
                                    (this.scene as any)._isRendering = true;
                                    this.scene.render();
                                    (this.scene as any)._isRendering = false;
                                } else {
                                    logger.error("[Game] CRITICAL: scene.render() called twice in same frame (paused)! This causes visual duplication!");
                                }
                            }
                        }
                    });
                }
            }
            
            // Принудительно обновляем размер canvas
            this.engine.resize();
            logger.debug("Canvas resized, size:", this.canvas.width, "x", this.canvas.height);
            
            // Убеждаемся, что все overlay скрыты
            this.gameStats.hide();
            if (this.mainMenu) {
                this.mainMenu.hide();
            }
            
            // === SCENE OPTIMIZATIONS ===
            this.scene.blockMaterialDirtyMechanism = true; // Prevent material updates
            this.scene.useRightHandedSystem = false;
            this.scene.fogEnabled = false; // No fog
            this.scene.lightsEnabled = true;
            // Shadows and particles will be set by applyGraphicsSettings()
            this.scene.spritesEnabled = false;
            this.scene.texturesEnabled = true;
            this.scene.lensFlaresEnabled = false;
            this.scene.proceduralTexturesEnabled = false;
            // ВАЖНО: renderTargetsEnabled должен быть TRUE для работы GUI (AdvancedDynamicTexture)
            this.scene.renderTargetsEnabled = true;
            this.scene.collisionsEnabled = false; // We use physics instead
            
            // Apply all settings
            this.applyGraphicsSettings();
            this.applyAudioSettings();
            this.applyControlSettings();
            this.applyCameraSettings();
            this.applyUISettings();
            
            // === ДОПОЛНИТЕЛЬНЫЕ ОПТИМИЗАЦИИ ===
            this.scene.skipPointerMovePicking = true; // Не обрабатываем picking при движении мыши
            this.scene.autoClear = true;
            this.scene.autoClearDepthAndStencil = true;
            this.scene.blockfreeActiveMeshesAndRenderingGroups = true;
            
            // Оптимизация frustum culling
            this.scene.skipFrustumClipping = false; // Включаем frustum culling
            
            // Отключаем ненужные проверки
            this.scene.constantlyUpdateMeshUnderPointer = false;
            
            // Дополнительные оптимизации рендеринга
            this.scene.forceShowBoundingBoxes = false;
            this.scene.forceWireframe = false;
            this.scene.skipFrustumClipping = false; // Frustum culling включен
            this.scene.forcePointsCloud = false;
            
            // Оптимизация материалов
            this.scene.meshes.forEach(mesh => {
                if (mesh.material && mesh.material instanceof StandardMaterial) {
                    const mat = mesh.material as StandardMaterial;
                    if (!mat.isFrozen) {
                        mat.freeze();
                    }
                }
                // Оптимизация статических мешей
                if (mesh.metadata && mesh.metadata.type === "static") {
                    mesh.freezeWorldMatrix();
                    mesh.doNotSyncBoundingInfo = true;
                    mesh.cullingStrategy = Mesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
                }
            });
            this.scene.useConstantAnimationDeltaTime = true;
            
            // Дополнительные оптимизации рендеринга
            this.scene.autoClear = true;
            this.scene.autoClearDepthAndStencil = true;
            
            // Оптимизация: используем встроенные возможности Babylon.js для ограничения активных мешей
            // Frustum culling уже включен выше, это достаточно для оптимизации
            
            // Simple clear color - SOLID, dark gray sky
            this.scene.clearColor.set(0.12, 0.12, 0.14, 1);
            
            // Light - balanced hemispheric (not too bright!)
            const light = new HemisphericLight("light1", new Vector3(0, 1, 0), this.scene);
            light.intensity = 0.65; // Reduced to prevent washed-out colors
            light.specular = Color3.Black(); // No specular reflections!
            light.diffuse = new Color3(0.9, 0.9, 0.85); // Slightly warm
            light.groundColor = new Color3(0.25, 0.25, 0.28); // Ambient from below
            logger.log("Light created (balanced, no specular)");
            
            // Directional light for shadows (sun)
            const sunLight = new DirectionalLight("sunLight", new Vector3(-0.5, -1, -0.3), this.scene);
            sunLight.intensity = 0.8;
            sunLight.diffuse = new Color3(1, 0.98, 0.95);
            sunLight.specular = Color3.Black();
            sunLight.position = new Vector3(50, 40, 50);
            
            // ОПТИМИЗАЦИЯ: Отключаем тени в production для максимальной производительности
            if (!isProduction) {
                // Shadow generator for terrain depth (только в dev режиме)
                const shadowGenerator = new ShadowGenerator(2048, sunLight);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurKernel = 32;
                shadowGenerator.setDarkness(0.3); // Мягкие тени
                shadowGenerator.bias = 0.00005;
                
                // Store shadow generator for terrain
                (this.scene as any).terrainShadowGenerator = shadowGenerator;
            }
            
            // Включаем тени только если не production
            this.scene.shadowsEnabled = !isProduction;
            
            logger.log(`Directional light configured, shadows: ${!isProduction ? 'enabled' : 'disabled (production)'}`);

            // Physics
            this.updateLoadingProgress(15, "Загрузка физического движка...");
            this.updateLoadingProgress(30, "Инициализация физики...");
            const physicsInitialized = await this.gamePhysics.initialize(this.scene);
            if (!physicsInitialized) {
                logger.error("[Game] Failed to initialize physics!");
            } else {
                logger.log("[Game] Physics enabled");
            }
            
            // КРИТИЧЕСКИ ВАЖНО: Обновляем камеру ПОСЛЕ обновления физики для предотвращения эффекта "нескольких танков"
            // Это гарантирует, что камера всегда читает актуальную позицию меша после синхронизации с физическим телом
            // Используем отдельный счетчик для оптимизации (каждые 2 кадра)
            // ИСПРАВЛЕНИЕ "ДВОЙНОГО ТАНКА": Камера должна обновляться КАЖДЫЙ кадр
            // Пропуск кадров (% 2) создаёт рассинхронизацию между позицией камеры и танка
            if (physicsInitialized && this.scene.onAfterPhysicsObservable) {
                this.scene.onAfterPhysicsObservable.add(() => {
                    // Обновляем камеру если игра инициализирована и не на паузе
                    // gameInitialized проверяем вместо gameStarted, так как камера нужна сразу после инициализации
                    if (this.gameInitialized && !this.gamePaused) {
                        this.updateCamera();
                    }
                });
                logger.log("[Game] Camera update subscribed to onAfterPhysicsObservable");
            } else {
                // Fallback: обновляем камеру в render loop если физика не работает
                logger.warn("[Game] Physics not available, camera will update in render loop");
            }

            // Ground создается в ChunkSystem для каждого чанка
            // НЕ создаем основной ground здесь, чтобы избежать дублирования и z-fighting
            // ChunkSystem создаст ground для каждого чанка с правильными позициями
            logger.log("[Game] Ground will be created by ChunkSystem per chunk");

            // Create Tank (spawn close to ground - hover height is ~1.0)
            // КРИТИЧНО: Удаляем старый танк перед созданием нового
            if (this.tank) {
                // КРИТИЧНО: Сначала удаляем дочерние меши, затем родительские
                if (this.tank.barrel && !this.tank.barrel.isDisposed()) {
                    // Удаляем дочерние меши barrel, если есть
                    if (this.tank.barrel.getChildren && this.tank.barrel.getChildren().length > 0) {
                        this.tank.barrel.getChildren().forEach((child: any) => {
                            if (child.dispose && !child.isDisposed()) {
                                try {
                                    child.dispose();
                                } catch (e) {
                                    // Игнорируем ошибки
                                }
                            }
                        });
                    }
                    this.tank.barrel.dispose();
                }
                if (this.tank.turret && !this.tank.turret.isDisposed()) {
                    // Удаляем дочерние меши turret (включая barrel, если он еще не удален)
                    if (this.tank.turret.getChildren && this.tank.turret.getChildren().length > 0) {
                        this.tank.turret.getChildren().forEach((child: any) => {
                            if (child.dispose && !child.isDisposed()) {
                                try {
                                    child.dispose();
                                } catch (e) {
                                    // Игнорируем ошибки
                                }
                            }
                        });
                    }
                    this.tank.turret.dispose();
                }
                if (this.tank.chassis && !this.tank.chassis.isDisposed()) {
                    // Удаляем дочерние меши chassis (включая turret и barrel, если они еще не удалены)
                    if (this.tank.chassis.getChildren && this.tank.chassis.getChildren().length > 0) {
                        this.tank.chassis.getChildren().forEach((child: any) => {
                            if (child.dispose && !child.isDisposed()) {
                                try {
                                    child.dispose();
                                } catch (e) {
                                    // Игнорируем ошибки
                                }
                            }
                        });
                    }
                    this.tank.chassis.dispose();
                }
                if (this.tank.physicsBody) {
                    this.tank.physicsBody.dispose();
                }
                this.tank = undefined;
            }
            
            // КРИТИЧНО: Дополнительная очистка всех мешей танка из сцены по паттернам
            const oldTankMeshes = this.scene.meshes.filter(mesh => {
                if (!mesh.name || mesh.isDisposed()) return false;
                return mesh.name.startsWith("tankHull_") || 
                       mesh.name.startsWith("turret_") || 
                       mesh.name.startsWith("barrel_");
            });
            if (oldTankMeshes.length > 0) {
                logger.warn(`[Game] Found ${oldTankMeshes.length} orphaned tank meshes, disposing them`);
                oldTankMeshes.forEach(mesh => {
                    try {
                        // Удаляем все дочерние меши
                        if (mesh.getChildren && mesh.getChildren().length > 0) {
                            mesh.getChildren().forEach((child: any) => {
                                if (child.dispose && !child.isDisposed()) {
                                    try {
                                        child.dispose();
                                    } catch (e) {
                                        // Игнорируем ошибки
                                    }
                                }
                            });
                        }
                        mesh.dispose();
                    } catch (e) {
                        // Игнорируем ошибки
                    }
                });
            }
            
            this.updateLoadingProgress(40, "Создание танка...");
            this.tank = new TankController(this.scene, new Vector3(0, 1.2, 0));
            
            // Обновляем ссылки в модулях
            this.gameGarage.updateReferences({ tank: this.tank });
            this.gameConsumables.updateReferences({ tank: this.tank });
            this.gameVisibility.updateReferences({ tank: this.tank });
            if (this.gameCamera) {
                this.gameCamera.updateReferences({ tank: this.tank });
            }
            
            // Обновляем ссылки в панелях
            if (this.physicsPanel) {
                this.physicsPanel.setTank(this.tank);
            }
            if (this.physicsEditor) {
                this.physicsEditor.setTank(this.tank);
            }
            if (this.cheatMenu) {
                this.cheatMenu.setTank(this.tank);
            }
            if (this.debugDashboard) {
                this.debugDashboard.setTank(this.tank);
            }
            
            // Устанавливаем callback для респавна в гараже
            this.tank.setRespawnPositionCallback(() => this.gameGarage.getPlayerGaragePosition(this.camera));
            
            // КРИТИЧЕСКИ ВАЖНО: Создаем камеру ДО HUD, чтобы она была доступна даже при ошибках
            const cameraPos = this.tank?.chassis?.position || new Vector3(0, 2, 0);
            this.camera = new ArcRotateCamera("camera1", -Math.PI / 2, this.cameraBeta, 12, cameraPos, this.scene);
            this.camera.lowerRadiusLimit = 5;
            this.camera.upperRadiusLimit = 25;
            this.camera.lowerBetaLimit = 0.1;
            this.camera.upperBetaLimit = Math.PI / 2.1;
            this.camera.minZ = 0.1; // Минимальное расстояние до камеры (предотвращает заход за текстуры)
            this.camera.inputs.clear();
            this.setupCameraInput();
            
            // Aim Camera Setup
            // ИСПРАВЛЕНО: Инициализируем с позицией танка, а не (0,0,0)
            // ОПТИМИЗАЦИЯ: Используем кэшированную позицию если доступна
            const initialAimCameraPos = this.tank?.getCachedChassisPosition ? 
                this.tank.getCachedChassisPosition() : 
                (this.tank?.chassis?.getAbsolutePosition() || new Vector3(0, 2, 0));
            this.aimCamera = new UniversalCamera("aimCamera", initialAimCameraPos.add(new Vector3(0, 3, -8)), this.scene);
            this.aimCamera.fov = this.aimFOV;
            this.aimCamera.inputs.clear();
            this.aimCamera.setEnabled(false);
            
            // Устанавливаем камеру как активную СРАЗУ
            this.scene.activeCamera = this.camera;
            // Контролы уже настроены через setupCameraInput(), не нужно вызывать attachControls
            logger.log("[Game] Camera created and set as active");
            
            // Create HUD (может вызвать ошибку, но камера уже создана)
            // ВАЖНО: GUI texture требует, чтобы renderTargetsEnabled был включен
            // AdvancedDynamicTexture создает свой render target
            const originalRenderTargetsEnabled = this.scene.renderTargetsEnabled;
            this.scene.renderTargetsEnabled = true; // Временно включаем для создания GUI
            this.updateLoadingProgress(50, "Создание интерфейса...");
            try {
                // logger.log("[Game] Creating HUD... Scene renderTargetsEnabled:", this.scene.renderTargetsEnabled);
                // logger.log("[Game] Active camera before HUD:", this.scene.activeCamera?.name);
                this.hud = new HUD(this.scene);
                
                // Обновляем ссылки в модулях
                this.gameGarage.updateReferences({ hud: this.hud });
                this.gameConsumables.updateReferences({ hud: this.hud });
                this.gameVisibility.updateReferences({ hud: this.hud });
                if (this.gameCamera) {
                    this.gameCamera.updateReferences({ hud: this.hud });
                }
                
                // Initialize GameUI
                this.gameUI.initialize(this.hud);
                
                // HUD создан успешно
                if (this.hud) {
                    // logger.log("[Game] HUD created successfully");
                    
                    // ДИАГНОСТИКА: Проверяем что renderTargetsEnabled остается включенным
                    if (!this.scene.renderTargetsEnabled) {
                        logger.error("[Game] CRITICAL: renderTargetsEnabled became false after HUD creation!");
                        this.scene.renderTargetsEnabled = true;
                    }
                    
                    // ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ GUI
                    if (this.hud && typeof (this.hud as any).forceUpdate === 'function') {
                        (this.hud as any).forceUpdate();
                    }
                }
                
                this.tank.setHUD(this.hud);
                // logger.log("[Game] HUD created successfully");
                // logger.log("[Game] Active camera after HUD:", this.scene.activeCamera?.name);
                // GUI texture создан, можно вернуть настройку (GUI все равно будет работать)
                // this.scene.renderTargetsEnabled = originalRenderTargetsEnabled;
                // Оставляем включенным, так как GUI нужен render target
            } catch (e) {
                logger.error("HUD creation error:", e);
                logger.error("[Game] HUD creation failed:", e);
                // Восстанавливаем настройку при ошибке
                this.scene.renderTargetsEnabled = originalRenderTargetsEnabled;
                // Продолжаем без HUD
            }
            
            // Initialize currency display
            if (this.currencyManager && this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
            }
            
            // Create Sound Manager
            this.updateLoadingProgress(55, "Загрузка звуков...");
            this.soundManager = new SoundManager();
            
            // Initialize GameAudio
            this.gameAudio.initialize(this.soundManager);
            this.tank.setSoundManager(this.soundManager);
            
            // Set intro sound callback for menu
            // ОТКЛЮЧЕНО: playIntroSound()
            if (this.mainMenu) {
                this.mainMenu.setOnPlayIntroSound(() => {
                    if (this.soundManager) {
                        // this.soundManager.playIntroSound(); // Отключено
                    }
                });
            }
            
            // Create Effects Manager
            this.effectsManager = new EffectsManager(this.scene);
            this.tank.setEffectsManager(this.effectsManager);
            
            // Подключаем тряску камеры
            this.tank.setCameraShakeCallback((intensity: number) => {
                this.addCameraShake(intensity);
            });
            
            // Create Currency Manager
            this.currencyManager = new CurrencyManager();
            
            // Garage will be loaded lazily when needed (on B key press or menu access)
            // This reduces initial bundle size
            this.updateLoadingProgress(52, "Подготовка систем...");
            
            // Create Consumables Manager
            this.consumablesManager = new ConsumablesManager();
            
            // Create Chat System
            this.chatSystem = new ChatSystem(this.scene);
            this.chatSystem.setGame(this);
            // Подключаем звуковой менеджер к чату
            if (this.soundManager) {
                this.chatSystem.setSoundManager(this.soundManager);
            }
            
            // Create Experience System
            this.experienceSystem = new ExperienceSystem();
            this.experienceSystem.setChatSystem(this.chatSystem);
            if (this.hud) {
                this.experienceSystem.setHUD(this.hud);
            }
            // Устанавливаем мультипликатор XP в зависимости от текущей сложности
            this.experienceSystem.setDifficultyMultiplier(this.getDifficultyRewardMultiplier());
            
            // Initialize achievements system
            this.achievementsSystem = new AchievementsSystem();
            this.achievementsSystem.setLanguage(this.settings.language as "ru" | "en" || "ru");
            this.achievementsSystem.setOnAchievementUnlocked((achievement: Achievement) => {
                this.onAchievementUnlocked(achievement);
            });
            
            // Initialize mission system
            this.missionSystem = new MissionSystem();
            this.missionSystem.setLanguage(this.settings.language as "ru" | "en" || "ru");
            this.missionSystem.setOnMissionComplete((mission: Mission) => {
                this.onMissionComplete(mission);
            });

            // Связываем HUD с системой миссий для обработки CLAIM напрямую из интерфейса
            if (this.hud && typeof (this.hud as any).setMissionSystem === "function") {
                (this.hud as any).setMissionSystem(this.missionSystem);
            }
            
            // Initialize player stats system
            this.playerStats = new PlayerStatsSystem();
            this.playerStats.setOnStatsUpdate((stats) => {
                // Could update UI here
                logger.log("[Stats] Updated:", stats);
            });
            
            // Track session start
            this.achievementsSystem.updateProgress("dedication", 1);
            if (this.hud) {
            }
            if (this.effectsManager) {
                this.experienceSystem.setEffectsManager(this.effectsManager);
            }
            if (this.soundManager) {
                this.experienceSystem.setSoundManager(this.soundManager);
            }
            
            // ИСПРАВЛЕНО: Используем PlayerProgressionSystem из меню (если есть) для сохранения данных аккаунта
            // или создаём новый если меню ещё не загружено
            if (this.mainMenu && this.mainMenu.getPlayerProgression()) {
                this.playerProgression = this.mainMenu.getPlayerProgression()!;
                logger.log("[Game] Using existing PlayerProgression from MainMenu");
            } else {
                this.playerProgression = new PlayerProgressionSystem();
                logger.log("[Game] Created new PlayerProgressionSystem");
            }
            this.playerProgression.setChatSystem(this.chatSystem);
            this.playerProgression.setSoundManager(this.soundManager);
            if (this.hud) {
                this.playerProgression.setHUD(this.hud);
            }
            
            // СВЯЗЫВАЕМ ExperienceSystem с PlayerProgressionSystem для передачи опыта
            if (this.experienceSystem) {
                this.experienceSystem.setPlayerProgression(this.playerProgression);
            }
            
            // Subscribe to experience changes for Stats Overlay updates
            if (this.playerProgression && this.playerProgression.onExperienceChanged) {
                logger.log("[Game] Subscribing to experience changes for Stats Overlay");
                this.playerProgression.onExperienceChanged.add((data: {
                    current: number;
                    required: number;
                    percent: number;
                    level: number;
                }) => {
                    logger.log("[Game] Experience changed event received for Stats Overlay:", data);
                    // Обновляем Stats Overlay, если он открыт
                    if (this.gameStats.isVisible()) {
                        this.gameStats.update();
                    }
                });
            } else {
                logger.warn("[Game] Cannot subscribe to experience changes - playerProgression or onExperienceChanged is null");
            }
            
            // Connect to HUD
            if (this.hud) {
                this.hud.setPlayerProgression(this.playerProgression);
                // Также подключаем experienceSystem для комбо-индикатора
                if (this.experienceSystem) {
                    this.hud.setExperienceSystem(this.experienceSystem);
                }
            }
            
            // Connect to menu
            if (this.mainMenu) {
                this.mainMenu.setPlayerProgression(this.playerProgression);
                // Также устанавливаем ссылку на меню в playerProgression для обновления уровня
                if (this.playerProgression && typeof this.playerProgression.setMenu === 'function') {
                    this.playerProgression.setMenu(this.mainMenu);
                }
            }
            
            // Create Aiming System
            this.aimingSystem = new AimingSystem(this.scene);
            
            this.chatSystem.success("System initialized");
            
            // Финальная проверка видимости canvas и скрытия overlay
            if (this.canvas) {
                this.canvas.style.display = "block";
                this.canvas.style.visibility = "visible";
                this.canvas.style.zIndex = "0"; // Canvas должен быть ПОД GUI
                this.updateCanvasPointerEvents(); // Используем метод вместо прямой установки
            }
            this.gameStats.hide();
            if (this.mainMenu && !this.gameStarted) {
                this.mainMenu.hide();
            }
            
            // Connect additional systems to Garage (already created in init())
            if (this.garage) {
                if (this.chatSystem) {
                    this.garage.setChatSystem(this.chatSystem);
                }
                if (this.soundManager) {
                    this.garage.setSoundManager(this.soundManager);
                }
                if (this.tank) {
                    this.garage.setTankController(this.tank);
                }
                if (this.experienceSystem) {
                    this.garage.setExperienceSystem(this.experienceSystem);
                }
                if (this.playerProgression) {
                    this.garage.setPlayerProgression(this.playerProgression);
                }
                logger.log("[Game] Garage systems connected");
            } else {
                logger.warn("[Game] Garage not found! Loading it now...");
                await this.loadGarage();
            }
            
            // Connect chat system to tank
            if (this.tank && this.chatSystem) {
                this.tank.chatSystem = this.chatSystem;
            }
            
            // Connect experience system to tank
            if (this.tank && this.experienceSystem) {
                this.tank.experienceSystem = this.experienceSystem;
                this.tank.achievementsSystem = this.achievementsSystem;
            }
            
            // Connect aiming system to tank
            if (this.tank && this.aimingSystem) {
                this.aimingSystem.setTank(this.tank);
            }
            
            // Connect player progression to tank
            if (this.tank && this.playerProgression) {
                this.tank.playerProgression = this.playerProgression;
            }
            
            // Connect multiplayer shoot callback to tank
            if (this.tank && this.multiplayerManager) {
                this.tank.setOnShootCallback((data) => {
                    if (this.isMultiplayer && this.multiplayerManager) {
                        this.multiplayerManager.sendPlayerShoot(data);
                    }
                });
                
                // Connect network players reference for hit detection
                this.tank.networkPlayers = this.networkPlayerTanks;
                
                // Store reference to multiplayerManager for RTT access
                (this.tank as any).multiplayerManager = this.multiplayerManager;
            }
            
            // Create Enemy Manager (for turrets)
            this.enemyManager = new EnemyManager(this.scene);
            this.enemyManager.setPlayer(this.tank);
            this.enemyManager.setEffectsManager(this.effectsManager);
            this.enemyManager.setSoundManager(this.soundManager);
            
            // УЛУЧШЕНО: Инициализация AI Coordinator для групповой тактики
            this.aiCoordinator = new AICoordinator();
            
            // УЛУЧШЕНО: Инициализация Performance Optimizer
            this.performanceOptimizer = new PerformanceOptimizer(this.scene);
            
            // Оптимизируем все статические меши
            this.performanceOptimizer.optimizeAllStaticMeshes();
            
            // Connect enemy manager to tank for hit detection
            this.tank.setEnemyManager(this.enemyManager);
            
            // Connect kill counter and currency
            this.enemyManager.setOnTurretDestroyed(() => {
                logger.log("[GAME] Turret destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                    logger.log("[GAME] Kill added to HUD (turret)");
                }
                // Начисляем валюту за уничтожение турели
                if (this.currencyManager) {
                    const baseReward = 50;
                    const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
                    this.currencyManager.addCurrency(reward);
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                    }
                    if (this.chatSystem) {
                        this.chatSystem.economy(`+${reward} кредитов (уничтожена турель)`);
                    }
                    // Добавляем опыт за убийство турели
                    if (this.experienceSystem && this.tank) {
                        this.experienceSystem.recordKill(
                            this.tank.chassisType.id,
                            this.tank.cannonType.id,
                            true // isTurret
                        );
                    }
                    // Записываем в прогресс игрока
                    if (this.playerProgression) {
                        this.playerProgression.recordKill();
                        this.playerProgression.addCredits(reward);
                        // XP bar обновится автоматически через события onExperienceChanged
                    }
                }
            });
            
            // === CHUNK SYSTEM (MAXIMUM OPTIMIZATION!) ===
            this.updateLoadingProgress(70, "Генерация мира...");
            logger.log(`Creating ChunkSystem with mapType: ${this.currentMapType}`);
            // В production используем более агрессивные настройки производительности
            
            // Получаем сид из настроек меню или из мультиплеера
            let worldSeed: number;
            if (this.multiplayerManager && this.multiplayerManager.getWorldSeed()) {
                // В мультиплеере используем seed с сервера
                worldSeed = this.multiplayerManager.getWorldSeed()!;
                logger.log(`[Game] Using multiplayer world seed from server: ${worldSeed}`);
            } else {
                // В одиночной игре используем seed из настроек
                const settings = this.mainMenu?.getSettings();
                worldSeed = settings?.worldSeed || 12345;
                if (settings?.useRandomSeed) {
                    worldSeed = Math.floor(Math.random() * 999999999);
                }
                logger.log(`[Game] Using world seed from settings: ${worldSeed}`);
            }
            
            // Create destruction system - УЛУЧШЕНО: Оптимизированы параметры для производительности
            this.destructionSystem = new DestructionSystem(this.scene, {
                enableDebris: true,
                debrisLifetime: 8000, // УМЕНЬШЕНО с 10000 до 8000 для экономии памяти
                maxDebrisPerObject: 4 // УМЕНЬШЕНО с 5 до 4 для оптимизации
            });
            
            // ЗАЩИТНАЯ ПРОВЕРКА: убеждаемся, что mapType всегда установлен
            const mapType = this.currentMapType || "normal";
            logger.log(`[Game] Creating ChunkSystem with mapType: ${mapType} (currentMapType was: ${this.currentMapType})`);
            
            this.chunkSystem = new ChunkSystem(this.scene, {
                chunkSize: 80,          // HUGE chunks = fewer chunks
                renderDistance: this.settings?.renderDistance || 3,
                unloadDistance: 3,
                worldSeed: worldSeed,
                mapType: mapType
            });
            logger.log(`[Game] ChunkSystem created with renderDistance: ${this.settings?.renderDistance || 3}`);
            logger.log(`Chunk system created with ${this.chunkSystem.garagePositions.length} garages`);
            
            // КРИТИЧНО: Создаём защитную плоскость под картой для предотвращения падения
            this.createSafetyPlane();
            
            // Обновляем ссылки в модулях
            this.gameGarage.updateReferences({ chunkSystem: this.chunkSystem });
            this.gameConsumables.updateReferences({ chunkSystem: this.chunkSystem });
            
            // Initialize game modules after systems are created
            // GameGarage уже инициализирован в конструкторе, но обновляем ссылки
            this.gameGarage.initialize(this.scene, this.chunkSystem, this.tank, this.hud, this.enemyTanks);
            this.gameConsumables.initialize(
                this.tank, 
                this.chunkSystem, 
                this.consumablesManager, 
                this.hud, 
                this.soundManager, 
                this.effectsManager, 
                this.experienceSystem, 
                this.chatSystem, 
                this.multiplayerManager, 
                this.isMultiplayer
            );
            this.gameVisibility.initialize(this.scene, this.tank, this.hud, this.enemyTanks);
            this.gamePersistence.initialize(
                this.multiplayerManager,
                this.playerProgression,
                this.currencyManager,
                this.consumablesManager,
                this.missionSystem,
                this.achievementsSystem
            );
            
            // Initialize GameEnemies
            this.gameEnemies.initialize({
                scene: this.scene,
                tank: this.tank,
                soundManager: this.soundManager,
                effectsManager: this.effectsManager,
                chunkSystem: this.chunkSystem,
                hud: this.hud,
                currencyManager: this.currencyManager,
                experienceSystem: this.experienceSystem,
                playerProgression: this.playerProgression,
                achievementsSystem: this.achievementsSystem,
                missionSystem: this.missionSystem,
                sessionSettings: this.sessionSettings,
                mainMenu: this.mainMenu,
                currentMapType: this.currentMapType,
                gameStarted: this.gameStarted,
                survivalStartTime: this.survivalStartTime
            });
            // Синхронизируем массив врагов
            this.enemyTanks = this.gameEnemies.enemyTanks;
            
            // Initialize GameStats
            this.gameStats.initialize({
                playerProgression: this.playerProgression,
                experienceSystem: this.experienceSystem,
                currencyManager: this.currencyManager,
                realtimeStatsTracker: this.realtimeStatsTracker,
                multiplayerManager: this.multiplayerManager,
                enemyTanks: this.enemyTanks,
                enemyManager: this.enemyManager,
                isMultiplayer: this.isMultiplayer
            });
            
            // Initialize GameCamera if not already initialized
            if (!this.gameCamera) {
                this.gameCamera = new GameCamera();
                this.gameCamera.initialize(this.scene, this.tank, this.hud, this.aimingSystem, this.gameProjectile);
            }
            
            // Настраиваем callbacks для POI системы
            this.gamePOI.updateDependencies({
                chunkSystem: this.chunkSystem,
                tank: this.tank,
                enemyTanks: this.enemyTanks,
                hud: this.hud,
                soundManager: this.soundManager,
                effectsManager: this.effectsManager,
                achievementsSystem: this.achievementsSystem,
                missionSystem: this.missionSystem,
                playerStats: this.playerStats,
                playerProgression: this.playerProgression,
                currencyManager: this.currencyManager,
                scene: this.scene,
                engine: this.engine,
                getDifficultyRewardMultiplier: () => this.getDifficultyRewardMultiplier()
            });
            this.gamePOI.setupCallbacks();
            
            // Инициализируем GameUpdate после создания всех систем
            this.gameUpdate.initialize(this.engine, this.scene, {
                tank: this.tank,
                hud: this.hud,
                enemyManager: this.enemyManager,
                enemyTanks: this.enemyTanks,
                chunkSystem: this.chunkSystem,
                consumablesManager: this.consumablesManager,
                missionSystem: this.missionSystem,
                achievementsSystem: this.achievementsSystem,
                experienceSystem: this.experienceSystem,
                playerProgression: this.playerProgression,
                multiplayerManager: this.multiplayerManager,
                aiCoordinator: this.aiCoordinator,
                performanceOptimizer: this.performanceOptimizer,
                gameStarted: this.gameStarted,
                gamePaused: this.gamePaused,
                isAiming: this.isAiming,
                survivalStartTime: this.survivalStartTime
            });
            
            // Устанавливаем callbacks для GameUpdate
            this.gameUpdate.setUpdateCallbacks({
                onUpdateCamera: () => this.updateCamera(),
                onUpdateHUD: () => this.updateHUD(),
                onUpdateGarageDoors: () => this.gameGarage.updateGarageDoors(),
                onUpdateGarageCapture: (deltaTime: number) => this.gameGarage.updateGarageCapture(deltaTime, this.respawnEnemyTank.bind(this)),
                onUpdateGarageRespawnTimers: (deltaTime: number) => {
                    const deltaTimeMs = this.engine.getDeltaTime();
                    if (deltaTimeMs > 0 && deltaTimeMs < 1000) {
                        this.gameGarage.updateGarageRespawnTimers(deltaTimeMs / 1000, this.respawnEnemyTank.bind(this));
                    }
                },
                onUpdateMultiplayer: (deltaTime: number) => {
                    if (this.isMultiplayer && this.multiplayerManager) {
                        this.updateMultiplayer(deltaTime);
                    }
                },
                onUpdateFrontlineWaves: (deltaTime: number) => {
                    // Frontline waves update logic
                },
                onUpdateEnemyTurretsVisibility: () => {
                    // Enemy turrets visibility update logic (removed for performance)
                },
                onCheckConsumablePickups: () => {
                    // Consumable pickups check logic
                },
                onCheckSpectatorMode: () => {
                    if (this.isMultiplayer && this.multiplayerManager) {
                        this.checkSpectatorMode();
                    }
                }
            });
            
            this.updateLoadingProgress(90, "Завершение инициализации...");
            
            // ОПТИМИЗАЦИЯ: Включаем прогрессивную загрузку чанков
            // Используем позицию танка (0, 2, 0) для места спавна
            const initialPos = new Vector3(0, 2, 0);
            if (this.chunkSystem) {
                this.chunkSystem.enableProgressiveLoading(initialPos);
                // Загружаем начальные чанки вокруг места спавна (радиус 1)
                this.chunkSystem.update(initialPos);
            }
            
            // === DEBUG TOOLS (Lazy loaded) ===
            // Debug tools are loaded on-demand when F3/F4/F7 are pressed
            // This reduces initial bundle size
            
            // Session Settings will be lazy loaded when F6 is pressed (see keydown handler)
            
            // === MULTIPLAYER ===
            // Initialize multiplayer manager with auto-connect
            // URL будет автоматически определен в конструкторе MultiplayerManager
            this.multiplayerManager = new MultiplayerManager(undefined, true); // autoConnect = true
            
            // Настраиваем мультиплеерные колбэки через модуль
            this.gameMultiplayerCallbacks.updateDependencies({
                multiplayerManager: this.multiplayerManager,
                scene: this.scene,
                tank: this.tank,
                hud: this.hud,
                mainMenu: this.mainMenu,
                achievementsSystem: this.achievementsSystem,
                chatSystem: this.chatSystem,
                soundManager: this.soundManager,
                effectsManager: this.effectsManager,
                consumablesManager: this.consumablesManager,
                chunkSystem: this.chunkSystem,
                gameUI: this.gameUI,
                gamePersistence: this.gamePersistence,
                networkPlayerTanks: this.networkPlayerTanks,
                gameEnemies: this.gameEnemies, // Передаем GameEnemies для создания синхронизированных ботов
                battleRoyaleVisualizer: this.battleRoyaleVisualizer,
                ctfVisualizer: this.ctfVisualizer,
                replayRecorder: this.replayRecorder,
                realtimeStatsTracker: this.realtimeStatsTracker,
                isMultiplayer: this.isMultiplayer,
                setIsMultiplayer: (v) => { this.isMultiplayer = v; },
                processPendingNetworkPlayers: () => {
                    (this.gameMultiplayerCallbacks as any).processPendingNetworkPlayers();
                },
                setBattleRoyaleVisualizer: (v) => { this.battleRoyaleVisualizer = v; },
                setCTFVisualizer: (v) => { this.ctfVisualizer = v; },
                setRealtimeStatsTracker: (v) => { this.realtimeStatsTracker = v; },
                setReplayRecorder: (v) => { this.replayRecorder = v; },
                startGame: async () => {
                    try {
                        // Проверяем, что игра еще не запущена
                        if (this.gameStarted) {
                            logger.warn("[Game] Game already started, skipping startGame()");
                            return;
                        }
                        
                        // Проверяем инициализацию - если не инициализирована, инициализируем
                        if (!this.gameInitialized) {
                            logger.log("[Game] Game not initialized, initializing for multiplayer...");
                            try {
                                // Проверяем, что init не вызывается уже
                                if ((this as any)._isInitializing) {
                                    logger.warn("[Game] Initialization already in progress, waiting...");
                                    // Ждем завершения инициализации
                                    let waitCount = 0;
                                    while ((this as any)._isInitializing && waitCount < 50) {
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        waitCount++;
                                    }
                                    if (!this.gameInitialized) {
                                        throw new Error("Initialization timeout");
                                    }
                                } else {
                                    (this as any)._isInitializing = true;
                                    try {
                                        await this.init();
                                        this.gameInitialized = true;
                                    } finally {
                                        (this as any)._isInitializing = false;
                                    }
                                }
                            } catch (error) {
                                logger.error("[Game] Error during initialization:", error);
                                console.error("[Game] Initialization error:", error);
                                throw error;
                            }
                        }
                        
                        // Убеждаемся, что canvas виден
                        if (this.canvas) {
                            this.canvas.style.display = "block";
                            this.canvas.style.visibility = "visible";
                            this.canvas.style.opacity = "1";
                        } else {
                            logger.warn("[Game] Canvas not available!");
                        }
                        
                        // Проверяем, что критичные системы готовы
                        if (!this.scene) {
                            logger.error("[Game] Scene not available, cannot start game!");
                            return;
                        }
                        if (!this.tank) {
                            logger.warn("[Game] Tank not available yet, but continuing...");
                        }
                        if (!this.chunkSystem) {
                            logger.warn("[Game] ChunkSystem not available yet, but continuing...");
                        }
                        
                        // Запускаем игру
                        logger.log("[Game] Starting game from multiplayer GAME_START");
                        try {
                            this.startGame();
                        } catch (error) {
                            logger.error("[Game] Error in startGame() call:", error);
                            console.error("[Game] startGame() error:", error);
                            throw error;
                        }
                    } catch (error) {
                        logger.error("[Game] Critical error in startGame callback:", error);
                        console.error("[Game] startGame callback error:", error);
                        // Не пробрасываем ошибку дальше, чтобы не крашить приложение
                    }
                },
                isGameInitialized: () => this.gameInitialized,
                isGameStarted: () => this.gameStarted
            });
            this.gameMultiplayerCallbacks.setup();
            
            // === METRICS COLLECTOR ===
            // Initialize metrics collector for server monitoring
            this.metricsCollector = new MetricsCollector(this.engine, this.scene);
            this.lastMetricsSendTime = Date.now();
            
            // Камера уже создана выше, обновляем только позицию после спавна

            // Ждём генерации гаражей перед спавном (камера уже создана)
            // Starting waitForGaragesAndSpawn
            this.updateLoadingProgress(95, "Финальная подготовка...");
            this.waitForGaragesAndSpawn();

            // Game initialized - Press F3 for debug info
            // Scene meshes count logged (disabled for performance)
            logger.debug("Active camera:", this.scene.activeCamera?.name);
            
            // Скрываем загрузочный экран
            this.updateLoadingProgress(100, "Системы загружены!");
            // ОПТИМИЗАЦИЯ: Скрываем экран загрузки после завершения систем
            // Карта будет прогружаться постепенно во время игры
            setTimeout(() => {
                this.hideLoadingScreen();
                // ОПТИМИЗАЦИЯ: Продолжаем прогрузку карты после скрытия экрана загрузки
                // Прогресс будет отображаться в HUD
                // Start tutorial for new players
                if (this.hud) {
                    this.hud.setOnTutorialComplete(() => {
                        if (this.achievementsSystem) {
                            this.achievementsSystem.updateProgress("tutorial_complete", 1);
                        }
                    });
                    this.hud.startTutorial();
                }
            }, 500);
        } catch (e) {
            logger.error("Game init error:", e);
            this.hideLoadingScreen(); // Скрываем экран даже при ошибке
        }
    }
    
    // Возвращает текущую сложность врагов с учётом sessionSettings и настроек главного меню
    private getCurrentEnemyDifficulty(): "easy" | "medium" | "hard" {
        return this.gameEnemies.getCurrentDifficulty();
    }
    
    // Мультипликатор наград (кредиты/прогресс) в зависимости от сложности врагов
    private getDifficultyRewardMultiplier(): number {
        return this.gameEnemies.getDifficultyRewardMultiplier();
    }
    
    // Плавный множитель сложности врагов в зависимости от прогресса игрока и длительности текущей сессии.
    // Используется для масштабирования параметров EnemyTank и (опционально) количества противников.
    private getAdaptiveEnemyDifficultyScale(): number {
        return this.gameEnemies.getAdaptiveDifficultyScale();
    }
    
    // getAdaptiveEnemyDifficultyScaleOld удалён - теперь используется GameEnemies.getAdaptiveDifficultyScale()
    
    // Спавнит вражеские танки на карте в зависимости от типа карты
    spawnEnemyTanks() {
        logger.log(`[Game] spawnEnemyTanks() called - mapType: ${this.currentMapType}, gameStarted: ${this.gameStarted}, isMultiplayer: ${this.isMultiplayer}`);
        
        // В мультиплеере не спавним ботов - их заменяют реальные игроки
        if (this.isMultiplayer) {
            logger.log("[Game] Multiplayer mode: Enemy bots disabled, using real players instead");
            return;
        }
        
        // Не спавним врагов в режиме песочницы
        if (this.currentMapType === "sandbox") {
            logger.log("[Game] Sandbox mode: Enemy tanks disabled");
            return;
        }
        
        // Проверяем необходимые системы
        if (!this.soundManager || !this.effectsManager) {
            logger.warn("[Game] Cannot spawn enemies: soundManager or effectsManager not initialized");
            return;
        }
        
        if (!this.scene) {
            logger.warn("[Game] Cannot spawn enemies: scene not initialized");
            return;
        }
        
        // Обновляем ссылки в GameEnemies перед спавном
        this.gameEnemies.updateSystems({
            scene: this.scene,
            tank: this.tank,
            soundManager: this.soundManager,
            effectsManager: this.effectsManager,
            chunkSystem: this.chunkSystem,
            hud: this.hud,
            currencyManager: this.currencyManager,
            experienceSystem: this.experienceSystem,
            playerProgression: this.playerProgression,
            achievementsSystem: this.achievementsSystem,
            missionSystem: this.missionSystem,
            sessionSettings: this.sessionSettings,
            mainMenu: this.mainMenu,
            currentMapType: this.currentMapType,
            gameStarted: this.gameStarted,
            survivalStartTime: this.survivalStartTime,
            isMultiplayer: this.isMultiplayer // Передаем флаг мультиплеера
        });
        
        // Синхронизируем массив врагов
        this.enemyTanks = this.gameEnemies.enemyTanks;
        
        // Используем GameEnemies для спавна
        this.gameEnemies.spawnEnemies();
        
        // Синхронизируем массив врагов после спавна
        this.enemyTanks = this.gameEnemies.enemyTanks;
        
        // ОПТИМИЗАЦИЯ: Обновляем ссылку на enemyTanks в GameUpdate для кэширования
        if (this.gameUpdate) {
            this.gameUpdate.updateReferences({ enemyTanks: this.enemyTanks });
        }
        
        // Настраиваем обработчики смерти для всех врагов
        this.gameEnemies.enemyTanks.forEach(enemy => {
            // Проверяем, не добавлен ли уже обработчик
            if (!enemy.onDeathObservable.hasObservers()) {
                enemy.onDeathObservable.add(() => {
                    this.handleEnemyDeath(enemy);
                });
            }
        });
        
        // Устанавливаем цель для всех врагов
        if (this.tank) {
            this.gameEnemies.setTargetForAll(this.tank);
        }
        
        // Регистрируем ботов в AI Coordinator и настраиваем pathfinding
        this.gameEnemies.enemyTanks.forEach(enemy => {
            if (this.aiCoordinator) {
                this.aiCoordinator.registerBot(enemy);
            }
            if (this.chunkSystem) {
                const roadNetwork = this.chunkSystem.getRoadNetwork();
                if (roadNetwork) {
                    enemy.setRoadNetwork(roadNetwork);
                }
            }
            if (this.tank && this.tank.chassis) {
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
                const cachedPos = this.tank.getCachedChassisPosition();
                enemy.updatePathfindingReference(cachedPos);
            }
        });
        
        return;
        
        // Остальная логика теперь в GameEnemies.spawnEnemies()
    }
    
    // Спавн тренировочных ботов для режима полигона
    spawnPolygonTrainingBots() {
        if (!this.soundManager || !this.effectsManager) return;
        
        logger.log("[Game] Polygon mode: Spawning training bots in combat zone");
        
        // Зона боя - юго-восточный квадрант (x > 20, z < -20)
        // Арена 200x200, центр в (0,0)
        const combatZoneMinX = 30;
        const combatZoneMaxX = 90;
        const combatZoneMinZ = -90;
        const combatZoneMaxZ = -30;
        
        const trainingBotCount = 4; // Меньше ботов для тренировки
        const spawnPositions: Vector3[] = [];
        
        for (let i = 0; i < trainingBotCount; i++) {
            let attempts = 0;
            let pos: Vector3;
            
            do {
                // Случайная позиция в зоне боя
                const spawnX = combatZoneMinX + Math.random() * (combatZoneMaxX - combatZoneMinX);
                const spawnZ = combatZoneMinZ + Math.random() * (combatZoneMaxZ - combatZoneMinZ);
                let spawnY = 2.0; // Fallback высота (увеличено с 1.2 до 2.0)
                
                // ИСПРАВЛЕНИЕ: Получаем высоту земли и спавним танк немного над поверхностью
                // КРИТИЧНО: Сначала пытаемся использовать raycast для получения реальной высоты меша террейна
                let groundHeight = 0;
                const rayStart = new Vector3(spawnX, 100, spawnZ); // Увеличена начальная высота для лучшего raycast
                const rayDir = Vector3.Down();
                const ray = new Ray(rayStart, rayDir, 200); // Увеличена длина луча
                const hit = this.scene.pickWithRay(ray, (mesh) => {
                    if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                    // Проверяем все меши террейна
                    return (mesh.name.startsWith("ground_") || 
                            mesh.name.includes("terrain") || 
                            mesh.name.includes("chunk")) && 
                           mesh.isEnabled();
                });
                
                if (hit && hit.hit && hit.pickedPoint) {
                    groundHeight = hit.pickedPoint.y;
                } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                    // Fallback: используем terrain generator если raycast не нашел меш
                    groundHeight = this.chunkSystem.terrainGenerator.getHeight(spawnX, spawnZ, "dirt");
                }
                
                // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
                spawnY = Math.max(groundHeight + 2.0, 3.0);
                
                pos = new Vector3(spawnX, spawnY, spawnZ);
                
                // Проверяем минимальное расстояние между ботами
                let tooClose = false;
                for (const existingPos of spawnPositions) {
                    if (Vector3.Distance(pos, existingPos) < 20) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) break;
                attempts++;
            } while (attempts < 30);
            
            spawnPositions.push(pos);
        }
        
        spawnPositions.forEach((pos) => {
            // Для полигона используем лёгкую сложность - тренировочные боты
            const difficulty = "easy";
            // Тренировочные боты всегда без дополнительного скейла сложности
            const enemyTank = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty, 1);
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // При уничтожении - быстрый респавн для тренировки
            enemyTank.onDeathObservable.add(() => {
                logger.log("[GAME] Training bot destroyed!");
                if (this.hud) {
                    this.hud.addKill();
                }
                // Track achievements (training bots count too)
                if (this.achievementsSystem) {
                    this.achievementsSystem.updateProgress("first_blood", 1);
                    this.achievementsSystem.updateProgress("tank_hunter", 1);
                }
                // Track missions
                if (this.missionSystem) {
                    this.missionSystem.updateProgress("kill", 1);
                }
                // Меньше награда за тренировочных ботов
                const baseReward = 50;
                const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(reward);
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                        this.hud.showMessage(`+${reward} кредитов (тренировка)`, "#ffaa00", 2000);
                    }
                }
                // Добавляем опыт
                if (this.experienceSystem && this.tank) {
                    this.experienceSystem.recordKill(
                        this.tank.chassisType.id,
                        this.tank.cannonType.id,
                        false
                    );
                }
                // Записываем в прогресс
                if (this.playerProgression) {
                    this.playerProgression.recordKill();
                    this.playerProgression.addCredits(reward);
                }
                
                // Удаляем из массива
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
                
                // Быстрый респавн для полигона - через 30 секунд
                setTimeout(() => {
                    if (this.currentMapType === "polygon" && this.soundManager && this.effectsManager) {
                        // Новая случайная позиция в зоне боя
                        const newPos = new Vector3(
                            combatZoneMinX + Math.random() * (combatZoneMaxX - combatZoneMinX),
                            1.2,
                            combatZoneMinZ + Math.random() * (combatZoneMaxZ - combatZoneMinZ)
                        );
                        
                        const newBot = new EnemyTank(this.scene, newPos, this.soundManager!, this.effectsManager!, "easy", 1);
                        if (this.tank) {
                            newBot.setTarget(this.tank);
                        }
                        this.enemyTanks.push(newBot);
                        logger.log("[GAME] Training bot respawned");
                    }
                }, 30000); // 30 секунд
            });
            
            this.enemyTanks.push(enemyTank);
        });
        
        logger.log(`[Game] Polygon: Spawned ${this.enemyTanks.length} training bots`);
    }
    
    // Система волн врагов для карты "Передовая"
    spawnFrontlineEnemies() {
        if (!this.soundManager || !this.effectsManager) return;
        
        logger.log("[Game] Frontline mode: Initializing wave system");
        
        // Сбрасываем счётчик волн
        this.frontlineWaveNumber = 0;
        
        // Спавним начальных защитников на восточной стороне (оборона)
        this.spawnFrontlineDefenders();
        
        // Спавним первую атакующую волну через 10 секунд
        setTimeout(() => {
            this.spawnFrontlineWave();
        }, 10000);
        
        // Запускаем таймер волн
        this.frontlineWaveTimer = window.setInterval(() => {
            this.spawnFrontlineWave();
        }, this.frontlineWaveInterval);
    }
    
    // Спавн защитников на вражеской базе (восточная сторона)
    private spawnFrontlineDefenders() {
        if (!this.soundManager || !this.effectsManager) return;
        
        // Позиции защитников на восточной стороне (x > 100)
        const defenderPositionsRaw = [
            { x: 180, z: 50 },
            { x: 200, z: -30 },
            { x: 220, z: 80 },
            { x: 160, z: -100 },
        ];
        
        defenderPositionsRaw.forEach((rawPos) => {
            // КРИТИЧНО: Получаем высоту террейна для спавна
            let groundHeight = 0;
            const rayStart = new Vector3(rawPos.x, 50, rawPos.z);
            const rayDir = Vector3.Down();
            const ray = new Ray(rayStart, rayDir, 200); // Увеличена длина луча
            // КРИТИЧНО: Улучшенный фильтр для raycast - проверяем все меши террейна
            const hit = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                // Проверяем все меши террейна (ground_, terrain, и т.д.)
                return (mesh.name.startsWith("ground_") || 
                        mesh.name.includes("terrain") || 
                        mesh.name.includes("chunk")) && 
                       mesh.isEnabled();
            });
            
            if (hit && hit.hit && hit.pickedPoint) {
                groundHeight = hit.pickedPoint.y;
            } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                groundHeight = this.chunkSystem.terrainGenerator.getHeight(rawPos.x, rawPos.z, "dirt");
            }
            
            const spawnY = Math.max(groundHeight, 0) + 1.2; // Высота чуть выше hover height для плавного приземления
            const pos = new Vector3(rawPos.x, spawnY, rawPos.z);
            // Защитники - сложность берём из текущих настроек (sessionSettings/меню)
            const difficulty = this.getCurrentEnemyDifficulty();
            const difficultyScale = this.getAdaptiveEnemyDifficultyScale();
            const defender = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty, difficultyScale);
            if (this.tank) {
                defender.setTarget(this.tank);
            }
            
            defender.onDeathObservable.add(() => {
                this.handleFrontlineEnemyDeath(defender, pos, "defender");
            });
            
            this.enemyTanks.push(defender);
        });
        
        logger.log(`[Game] Frontline: Spawned ${defenderPositionsRaw.length} defenders`);
    }
    
    // Спавн волны атакующих врагов
    private spawnFrontlineWave() {
        if (!this.soundManager || !this.effectsManager) return;
        if (this.currentMapType !== "frontline") {
            // Остановить таймер если карта сменилась
            if (this.frontlineWaveTimer) {
                clearInterval(this.frontlineWaveTimer);
                this.frontlineWaveTimer = null;
            }
            return;
        }
        
        // Проверяем максимум врагов
        if (this.enemyTanks.length >= this.frontlineMaxEnemies) {
            logger.log("[Game] Frontline: Max enemies reached, skipping wave");
            return;
        }
        
        this.frontlineWaveNumber++;
        
        // Количество врагов в волне растёт с номером волны и плавным множителем сложности
        const baseCount = 3;
        const waveBonus = Math.min(this.frontlineWaveNumber - 1, 4); // +1 за волну, макс +4
        const capacity = this.frontlineMaxEnemies - this.enemyTanks.length;
        if (capacity <= 0) {
            logger.log("[Game] Frontline: No capacity for new enemies, skipping wave");
            return;
        }
        const adaptiveScale = this.getAdaptiveEnemyDifficultyScale();
        const scaledBase = Math.max(1, Math.round(baseCount * (0.8 + (adaptiveScale - 1) * 0.5))); // ~0.8..1.4
        let waveCount = Math.min(scaledBase + waveBonus, capacity);
        
        // Не даём волне быть слишком маленькой на высоких уровнях и слишком большой в начале
        const minWaveCount = Math.min(capacity, Math.max(1, Math.floor((baseCount + waveBonus) * 0.6)));
        if (waveCount < minWaveCount) {
            waveCount = minWaveCount;
        }
        
        if (waveCount <= 0) return;
        
        // Уведомление в HUD
        if (this.hud) {
            this.hud.showMessage(`⚔️ ВОЛНА ${this.frontlineWaveNumber}: ${waveCount} врагов!`, "#ff4444", 3000);
        }
        
        logger.log(`[Game] Frontline: Spawning wave ${this.frontlineWaveNumber} with ${waveCount} attackers`);
        
        // Атакующие спавнятся на восточной границе и идут к игроку
        const spawnX = 250 + Math.random() * 40; // Восточный край
        
        for (let i = 0; i < waveCount; i++) {
            const spawnZ = -200 + Math.random() * 400; // По всей ширине
            
            // КРИТИЧНО: Получаем высоту террейна для спавна
            let groundHeight = 0;
            const rayStart = new Vector3(spawnX, 50, spawnZ);
            const rayDir = Vector3.Down();
            const ray = new Ray(rayStart, rayDir, 200); // Увеличена длина луча
            // КРИТИЧНО: Улучшенный фильтр для raycast - проверяем все меши террейна
            const hit = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                // Проверяем все меши террейна (ground_, terrain, и т.д.)
                return (mesh.name.startsWith("ground_") || 
                        mesh.name.includes("terrain") || 
                        mesh.name.includes("chunk")) && 
                       mesh.isEnabled();
            });
            
            if (hit && hit.hit && hit.pickedPoint) {
                groundHeight = hit.pickedPoint.y;
            } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                groundHeight = this.chunkSystem.terrainGenerator.getHeight(spawnX, spawnZ, "dirt");
            }
            
            const spawnY = Math.max(groundHeight, 0) + 1.2; // Высота чуть выше hover height для плавного приземления
            const pos = new Vector3(spawnX, spawnY, spawnZ);
            
            // Сложность растёт с волнами
            let difficulty: "easy" | "medium" | "hard" = "easy";
            if (this.frontlineWaveNumber >= 3) difficulty = "medium";
            if (this.frontlineWaveNumber >= 6) difficulty = "hard";
            
            const attacker = new EnemyTank(this.scene, pos, this.soundManager!, this.effectsManager!, difficulty, adaptiveScale);
            if (this.tank) {
                attacker.setTarget(this.tank);
            }
            
            attacker.onDeathObservable.add(() => {
                this.handleFrontlineEnemyDeath(attacker, pos, "attacker");
            });
            
            this.enemyTanks.push(attacker);
        }
    }
    
    // Обработка смерти врага на передовой
    private handleFrontlineEnemyDeath(enemy: EnemyTank, _originalPos: Vector3, type: "defender" | "attacker") {
        logger.log(`[GAME] Frontline ${type} destroyed!`);
        
        if (this.hud) {
            this.hud.addKill();
        }
        
        // Track achievements
        if (this.achievementsSystem) {
            this.achievementsSystem.updateProgress("first_blood", 1);
            this.achievementsSystem.updateProgress("tank_hunter", 1);
            this.achievementsSystem.updateProgress("tank_ace", 1);
            if (this.tank && this.tank.currentHealth / this.tank.maxHealth < 0.2) {
                this.achievementsSystem.updateProgress("comeback", 1);
            }
        }
        
        // Награда зависит от типа врага и сложности
        const baseReward = type === "defender" ? 120 : 80; // Защитники ценнее
        const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
        if (this.currencyManager) {
            this.currencyManager.addCurrency(reward);
            if (this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
                this.hud.showMessage(`+${reward} кредитов!`, "#ffaa00", 2000);
            }
        }
        
        // Опыт
        if (this.experienceSystem && this.tank) {
            this.experienceSystem.recordKill(
                this.tank.chassisType.id,
                this.tank.cannonType.id,
                false
            );
        }
        
        // Прогресс
        if (this.playerProgression) {
            this.playerProgression.recordKill();
            this.playerProgression.addCredits(reward);
        }
        
        // Удаляем из массива
        const idx = this.enemyTanks.indexOf(enemy);
        if (idx !== -1) this.enemyTanks.splice(idx, 1);
        
        // Защитники респавнятся через 60 секунд
        if (type === "defender" && this.currentMapType === "frontline") {
            setTimeout(() => {
                if (this.currentMapType === "frontline" && this.soundManager && this.effectsManager) {
                    // Респавн в той же зоне
                    const newX = 150 + Math.random() * 100;
                    const newZ = -150 + Math.random() * 300;
                    const newPos = new Vector3(newX, 0.6, newZ);
                    
                    const difficulty = this.getCurrentEnemyDifficulty();
                    const difficultyScale = this.getAdaptiveEnemyDifficultyScale();
                    const newDefender = new EnemyTank(this.scene, newPos, this.soundManager!, this.effectsManager!, difficulty, difficultyScale);
                    if (this.tank) {
                        newDefender.setTarget(this.tank);
                    }
                    
                    newDefender.onDeathObservable.add(() => {
                        this.handleFrontlineEnemyDeath(newDefender, newPos, "defender");
                    });
                    
                    this.enemyTanks.push(newDefender);
                    logger.log("[Game] Frontline: Defender respawned");
                }
            }, 60000); // 60 секунд
        }
    }
    
    // Ожидание генерации гаражей и спавн игрока/врагов
    waitForGaragesAndSpawn() {
        if (!this.chunkSystem) {
            logger.error("ChunkSystem not initialized!");
            // Fallback на обычный спавн
            this.spawnEnemyTanks();
            if (this.tank) {
                this.tank.setEnemyTanks(this.enemyTanks);
            }
            return;
        }
        
        let attempts = 0;
        const maxAttempts = 50; // Максимум 5 секунд (50 * 100мс)
        
        // Ждём пока гаражи сгенерируются (проверяем каждые 100мс)
        const checkGarages = () => {
            attempts++;
            
            if (!this.chunkSystem) {
                logger.error("[Game] ChunkSystem became undefined!");
                this.spawnEnemyTanks();
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                }
                return;
            }
            
            // Для карты Тартария спавним в случайном месте, для остальных - в гараже
            // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
            if ((this.currentMapType !== undefined && this.currentMapType === "tartaria") || this.chunkSystem.garagePositions.length >= 1) {
                if (this.currentMapType !== undefined && (this.currentMapType as string) === "tartaria") {
                    logger.log(`[Game] Tartaria map: spawning player at random location...`);
                    this.spawnPlayerRandom();
                } else {
                    logger.log(`[Game] Found ${this.chunkSystem.garagePositions.length} garages, spawning player...`);
                    // Спавним игрока в гараже (ВСЕГДА в гараже!)
                    this.spawnPlayerInGarage();
                }
                
                // КРИТИЧЕСКИ ВАЖНО: Обновляем позицию камеры после спавна танка
                if (this.camera && this.tank && this.tank.chassis) {
                    // ОПТИМИЗАЦИЯ: Используем кэшированную позицию танка
                    const tankPos = this.tank.getCachedChassisPosition();
                    const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                    this.camera.setTarget(lookAt);
                    this.camera.radius = this.settings.cameraDistance;
                    this.camera.alpha = -Math.PI / 2; // Сброс угла камеры
                    this.camera.beta = this.cameraBeta; // Используем сохраненный угол
                    
                    // Инициализируем угол корпуса для отслеживания поворота
                    this.lastChassisRotation = this.tank.chassis.rotationQuaternion 
                        ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                        : this.tank.chassis.rotation.y;
                    
                    logger.log("[Game] Camera updated after spawn:", {
                        target: this.camera.getTarget(),
                        position: this.camera.position,
                        radius: this.camera.radius,
                        alpha: this.camera.alpha,
                        beta: this.camera.beta
                    });
                }
                
                // Спавним врагов через 5 секунд
                logger.log("[Game] Delaying enemy spawn by 5 seconds...");
                setTimeout(() => {
                    if (!this.gameGarage.playerGaragePosition) {
                        logger.error("[Game] Player garage not set!");
                        // ВСЕГДА спавним врагов, даже если гаража нет
                        if (!this.gameStarted) {
                            this.gameStarted = true;
                        }
                        logger.log("[Game] Spawning enemies on map (no player garage)...");
                        this.spawnEnemyTanks();
                        if (this.tank) {
                            this.tank.setEnemyTanks(this.enemyTanks);
                        }
                        return;
                    }
                    
                    // КРИТИЧЕСКИ ВАЖНО: ВСЕГДА спавним врагов на карте для всех режимов (кроме sandbox)
                    // Для карты Тартария спавним только в случайных местах, без гаражей
                    let enemiesSpawned = false;
                    if (this.currentMapType !== "tartaria" && this.chunkSystem && this.chunkSystem.garagePositions.length >= 2) {
                        logger.log("[Game] Attempting to spawn enemies in garages...");
                        const beforeCount = this.enemyTanks.length;
                        this.gameEnemies.spawnEnemiesInGarages(
                            () => this.gameGarage.playerGaragePosition,
                            (enemy, reward) => {
                                this.handleEnemyDeath(enemy);
                            }
                        );
                        enemiesSpawned = this.enemyTanks.length > beforeCount;
                        logger.log(`[Game] Garage spawn result: ${this.enemyTanks.length - beforeCount} enemies spawned`);
                    }
                    
                    // ВСЕГДА используем fallback спавн на карте для гарантии
                    // Убеждаемся, что gameStarted установлен
                    if (!this.gameStarted) {
                        this.gameStarted = true;
                        logger.log("[Game] gameStarted set to true for enemy spawn");
                    }
                    
                    // Если в гаражах не спавнилось достаточно врагов, дополняем спавном на карте
                    // Для Тартарии всегда спавним на карте
                    // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
                    if ((this.currentMapType !== undefined && this.currentMapType === "tartaria") || !enemiesSpawned || this.enemyTanks.length < 5) {
                        logger.log(`[Game] Spawning enemies on map (current: ${this.enemyTanks.length}, mapType: ${this.currentMapType})...`);
                        this.spawnEnemyTanks();
                    }
                    
                    if (this.tank) {
                        this.tank.setEnemyTanks(this.enemyTanks);
                    }
                    
                    // Проверка через 5 секунд - если врагов нет, спавним снова
                    setTimeout(() => {
                        if (this.enemyTanks.length === 0) {
                            logger.warn("[Game] No enemies spawned after 5s, retrying...");
                            this.spawnEnemyTanks();
                            if (this.tank) {
                                this.tank.setEnemyTanks(this.enemyTanks);
                            }
                        } else {
                            logger.log(`[Game] Enemy spawn verified: ${this.enemyTanks.length} enemies active`);
                        }
                    }, 5000);
                }, 5000);
                
                // Connect enemy tanks to tank for hit detection
                if (this.tank) {
                    this.tank.setEnemyTanks(this.enemyTanks);
                }
                logger.log(`[Game] Player spawned in garage at ${this.gameGarage.playerGaragePosition?.x.toFixed(1)}, ${this.gameGarage.playerGaragePosition?.z.toFixed(1)} (total garages: ${this.chunkSystem.garagePositions.length})`);
                
                // Обрабатываем очередь ожидающих сетевых игроков после спавна локального игрока
                // ВАЖНО: Вызываем processPendingNetworkPlayers если есть ожидающие игроки,
                // даже если isMultiplayer еще не установлен (может быть задержка при инициализации)
                if (this.gameMultiplayerCallbacks) {
                    const hasPendingPlayers = this.gameMultiplayerCallbacks.hasPendingNetworkPlayers();
                    const networkPlayersCount = this.multiplayerManager?.getNetworkPlayers()?.size || 0;
                    const currentTanksCount = this.networkPlayerTanks.size;
                    
                    logger.log(`[Game] 🔄 After player spawn: isMultiplayer=${this.isMultiplayer}, pending=${hasPendingPlayers}, networkPlayers=${networkPlayersCount}, tanks=${currentTanksCount}`);
                    
                    // Вызываем если isMultiplayer=true ИЛИ есть ожидающие игроки ИЛИ есть сетевые игроки без танков
                    if (this.isMultiplayer || hasPendingPlayers || (networkPlayersCount > 0 && currentTanksCount === 0)) {
                        logger.log(`[Game] 🔄 Calling processPendingNetworkPlayers after player spawn (isMultiplayer: ${this.isMultiplayer}, pending: ${hasPendingPlayers}, networkPlayers: ${networkPlayersCount})`);
                        this.gameMultiplayerCallbacks.processPendingNetworkPlayers();
                        
                        // Проверяем результат через небольшую задержку
                        setTimeout(() => {
                            const tanksAfter = this.networkPlayerTanks.size;
                            const playersAfter = this.multiplayerManager?.getNetworkPlayers()?.size || 0;
                            logger.log(`[Game] ✅ After processPendingNetworkPlayers: tanks=${tanksAfter}, networkPlayers=${playersAfter}`);
                            if (playersAfter > 0 && tanksAfter === 0) {
                                console.error(`[Game] ❌ КРИТИЧНО: Есть ${playersAfter} сетевых игроков, но танки не созданы!`);
                                console.error(`[Game] Проверьте логи создания танков выше`);
                            } else if (tanksAfter > 0) {
                                console.log(`%c[Game] ✅ Создано ${tanksAfter} сетевых танков`, 'color: #4ade80; font-weight: bold;');
                            }
                        }, 200);
                    } else {
                        logger.log(`[Game] No pending network players to process (isMultiplayer: ${this.isMultiplayer}, networkPlayers: ${networkPlayersCount})`);
                    }
                } else {
                    logger.warn(`[Game] ⚠️ gameMultiplayerCallbacks not available`);
                }
                
                logger.log(`[Game] Enemy tanks spawned: ${this.enemyTanks.length}`);
                logger.log(`[Game] Total scene meshes: ${this.scene.meshes.length}`);
            } else if (attempts >= maxAttempts) {
                // Таймаут - спавним игрока
                logger.warn("[Game] Garage generation timeout");
                // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
                if (this.currentMapType !== undefined && (this.currentMapType as string) === "tartaria") {
                    this.spawnPlayerRandom();
                } else {
                    this.spawnPlayerInGarage();
                }
                
                // ВСЕГДА спавним врагов на карте (кроме sandbox)
                logger.log("[Game] (Timeout) Delaying enemy spawn by 5 seconds...");
                setTimeout(() => {
                    // Убеждаемся, что gameStarted установлен
                    if (!this.gameStarted) {
                        this.gameStarted = true;
                        logger.log("[Game] (Timeout) gameStarted set to true for enemy spawn");
                    }
                    
                    // Пытаемся спавнить в гаражах, если возможно (только не для Тартарии)
                    let enemiesSpawned = false;
                    if (this.currentMapType !== "tartaria" && this.gameGarage.playerGaragePosition && this.chunkSystem && this.chunkSystem.garagePositions.length >= 2) {
                        logger.log("[Game] (Timeout) Attempting to spawn enemies in garages...");
                        const beforeCount = this.enemyTanks.length;
                        this.gameEnemies.spawnEnemiesInGarages(
                            () => this.gameGarage.playerGaragePosition,
                            (enemy, reward) => {
                                this.handleEnemyDeath(enemy);
                            }
                        );
                        enemiesSpawned = this.enemyTanks.length > beforeCount;
                    }
                    
                    // ВСЕГДА используем fallback спавн на карте
                    // Для Тартарии всегда спавним на карте
                    // ЗАЩИТНАЯ ПРОВЕРКА: только явно "tartaria", не undefined и не другие значения
                    if ((this.currentMapType !== undefined && this.currentMapType === "tartaria") || !enemiesSpawned || this.enemyTanks.length < 5) {
                        logger.log(`[Game] (Timeout) Spawning enemies on map (current: ${this.enemyTanks.length}, mapType: ${this.currentMapType})...`);
                        this.spawnEnemyTanks();
                    }
                    
                    if (this.tank) {
                        this.tank.setEnemyTanks(this.enemyTanks);
                    }
                }, 5000);
            } else {
                // Продолжаем ждать
                setTimeout(checkGarages, 100);
            }
        };
        
        // Начинаем проверку сразу (гараж уже создан в ChunkSystem)
        setTimeout(checkGarages, 100);
    }
    
    // Улучшенный метод получения высоты террейна (аналогичен GameEnemies.getGroundHeight)
    // Используется для спавна игрока и врагов
    // Публичный метод для использования в других системах (телепортация и т.д.)
    getGroundHeight(x: number, z: number): number {
        if (!this.scene) {
            logger.warn(`[Game] getGroundHeight: No scene available at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            return 2.0; // Минимальная безопасная высота вместо 0
        }
        
        // Улучшенный raycast: начинаем выше и с большим диапазоном
        const rayStart = new Vector3(x, 150, z); // Увеличено с 100 до 150
        const ray = new Ray(rayStart, Vector3.Down(), 300); // Увеличено с 200 до 300
        
        // Улучшенный фильтр мешей: проверяем больше паттернов
        const hit = this.scene.pickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const name = mesh.name.toLowerCase();
            // Расширенный список паттернов для поиска террейна
            return (name.startsWith("ground_") || 
                    name.includes("terrain") || 
                    name.includes("chunk") ||
                    name.includes("road") ||
                    (name.includes("floor") && !name.includes("garage"))) && 
                   mesh.isEnabled();
        });
        
        if (hit?.hit && hit.pickedPoint) {
            const height = hit.pickedPoint.y;
            if (height > -10 && height < 200) { // Разумные пределы
                return height;
            } else {
                logger.warn(`[Game] getGroundHeight: Raycast returned suspicious height ${height.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            }
        }
        
        // Fallback 1: используем terrain generator с несколькими биомами
        if (this.chunkSystem?.terrainGenerator) {
            const biomes = ["dirt", "city", "residential", "park", "industrial", "concrete"];
            let maxHeight = 0;
            
            for (const biome of biomes) {
                try {
                    const height = this.chunkSystem.terrainGenerator.getHeight(x, z, biome);
                    if (height > maxHeight && height > -10 && height < 200) {
                        maxHeight = height;
                    }
                } catch (e) {
                    // Игнорируем ошибки для конкретного биома
                }
            }
            
            if (maxHeight > 0) {
                logger.debug(`[Game] getGroundHeight: TerrainGenerator returned ${maxHeight.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
                return maxHeight;
            }
        }
        
        // Fallback 2: пытаемся найти ближайший загруженный чанк
        if (this.chunkSystem) {
            // Ищем ближайшие чанки и проверяем их меши
            const chunkSize = 50; // Примерный размер чанка
            const chunkX = Math.floor(x / chunkSize);
            const chunkZ = Math.floor(z / chunkSize);
            
            // Проверяем текущий чанк и соседние
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const checkX = (chunkX + dx) * chunkSize;
                    const checkZ = (chunkZ + dz) * chunkSize;
                    
                    // Raycast в центре соседнего чанка
                    const checkRayStart = new Vector3(checkX, 150, checkZ);
                    const checkRay = new Ray(checkRayStart, Vector3.Down(), 300);
                    const checkHit = this.scene.pickWithRay(checkRay, (mesh) => {
                        if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                        return mesh.name.startsWith("ground_") && mesh.isEnabled();
                    });
                    
                    if (checkHit?.hit && checkHit.pickedPoint) {
                        const height = checkHit.pickedPoint.y;
                        if (height > 0 && height < 200) {
                            logger.debug(`[Game] getGroundHeight: Found terrain in nearby chunk at ${height.toFixed(2)}`);
                            return height;
                        }
                    }
                }
            }
        }
        
        // Последний fallback: минимальная безопасная высота
        logger.warn(`[Game] getGroundHeight: All methods failed at (${x.toFixed(1)}, ${z.toFixed(1)}), using safe default 2.0`);
        return 2.0; // Минимальная безопасная высота вместо 0
    }
    
    // Создаёт защитную плоскость под картой для предотвращения падения
    // Серая плоскость с зелёными метрическими линиями по метрам на Z=-10
    private createSafetyPlane(): void {
        if (!this.scene) {
            logger.warn("[Game] Cannot create safety plane: scene not available");
            return;
        }
        
        // Создаём большую горизонтальную плоскость под картой
        // Размер: 2000x2000 единиц (достаточно для большой карты)
        // CreateGround создаёт горизонтальную плоскость в плоскости XZ
        // ОПТИМИЗАЦИЯ: Уменьшено subdivisions с 2000 до 50 для производительности
        // Это создает 51x51 = 2601 вершин вместо 2001x2001 = 4,004,001 вершин!
        const safetyPlaneMesh = MeshBuilder.CreateGround("safetyPlane", {
            width: 2000,
            height: 2000,
            subdivisions: 50 // ОПТИМИЗИРОВАНО: Уменьшено с 2000 до 50 для производительности
        }, this.scene);
        
        // ИСПРАВЛЕНО: Плоскость на Z=-10
        // CreateGround создаёт плоскость в XZ, position.y - высота, position.z - смещение по Z
        // Пользователь хочет Z=-10, значит смещаем плоскость по оси Z на -10
        safetyPlaneMesh.position = new Vector3(0, -10, -10); // Y=-10 для высоты под картой, Z=-10 как указано
        
        // Создаём материал с серым цветом
        const safetyMaterial = new StandardMaterial("safetyPlaneMat", this.scene);
        safetyMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5); // Серый цвет
        safetyMaterial.specularColor = Color3.Black(); // Без бликов
        
        // Создаём текстуру с зелёными метрическими линиями (1 метр = 1 единица)
        // Размер текстуры: 2048x2048 пикселей для эффективности
        // Масштабируем так, чтобы 1 метр = 1 пиксель в текстуре
        const textureSize = 2048;
        const metersPerTexture = 2000; // Плоскость 2000x2000 метров
        const pixelsPerMeter = textureSize / metersPerTexture; // Пикселей на метр
        
        const safetyTexture = new DynamicTexture("safetyPlaneTexture", textureSize, this.scene);
        const ctx = safetyTexture.getContext();
        
        // Рисуем серый фон
        ctx.fillStyle = "#808080"; // Серый
        ctx.fillRect(0, 0, textureSize, textureSize);
        
        // Рисуем ЗЕЛЁНЫЕ МЕТРИЧЕСКИЕ ЛИНИИ ПО МЕТРАМ
        ctx.strokeStyle = "#00ff00"; // Яркий зелёный
        ctx.lineWidth = 1; // Тонкие линии для метрической сетки
        
        // Вертикальные линии (каждый метр)
        for (let meter = 0; meter <= metersPerTexture; meter++) {
            const x = meter * pixelsPerMeter;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, textureSize);
            ctx.stroke();
        }
        
        // Горизонтальные линии (каждый метр)
        for (let meter = 0; meter <= metersPerTexture; meter++) {
            const y = meter * pixelsPerMeter;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(textureSize, y);
            ctx.stroke();
        }
        
        safetyTexture.update();
        safetyMaterial.diffuseTexture = safetyTexture;
        // Масштабируем текстуру так, чтобы 1 метр = 1 единица в игре
        safetyMaterial.diffuseTexture.uScale = metersPerTexture; // 2000 метров по ширине
        safetyMaterial.diffuseTexture.vScale = metersPerTexture; // 2000 метров по высоте
        
        // Устанавливаем материал
        safetyPlaneMesh.material = safetyMaterial;
        
        // КРИТИЧНО: Добавляем коллизию для плоскости
        if (this.scene.getPhysicsEngine()) {
            const safetyPhysics = new PhysicsAggregate(
                safetyPlaneMesh,
                PhysicsShapeType.BOX,
                { mass: 0 }, // Статичное тело
                this.scene
            );
            
            // Убеждаемся, что физика активна
            if (safetyPhysics.body) {
                safetyPhysics.body.setMotionType(PhysicsMotionType.STATIC);
            }
            
            logger.log("[Game] Safety plane created with physics at Z=-10");
        } else {
            logger.warn("[Game] Cannot add physics to safety plane: physics engine not available");
        }
        
        // Делаем плоскость видимой
        safetyPlaneMesh.isVisible = true;
        
        logger.log("[Game] Safety plane created under map at Z=-10 with green metric lines");
    }
    
    // Спавн игрока в случайном месте на карте (для карты Тартария)
    // Использует raycast для определения высоты террейна и размещает танк над поверхностью
    spawnPlayerRandom() {
        if (!this.tank) {
            logger.warn("[Game] Tank not initialized");
            return;
        }
        
        if (!this.chunkSystem) {
            logger.warn("[Game] ChunkSystem not available, using default spawn at (0, 2, 0)");
            if (this.tank.chassis && this.tank.physicsBody) {
                const defaultPos = new Vector3(0, 2, 0);
                this.tank.chassis.position.copyFrom(defaultPos);
                this.tank.chassis.computeWorldMatrix(true);
                if (this.tank.physicsBody) {
                    this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                }
            }
            return;
        }
        
        // Генерируем случайную позицию в пределах карты
        const spawnRadius = 200;
        const randomX = (Math.random() - 0.5) * spawnRadius * 2;
        const randomZ = (Math.random() - 0.5) * spawnRadius * 2;
        
        // Используем улучшенный метод получения высоты террейна
        const groundHeight = this.getGroundHeight(randomX, randomZ);
        // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
        const spawnY = Math.max(groundHeight + 2.0, 3.0);
        
        const spawnPos = new Vector3(randomX, spawnY, randomZ);
        this.gameGarage.setPlayerGaragePosition(spawnPos.clone());
        
        logger.log(`[Game] Tartaria: Player spawned at random location (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)}) - ground: ${groundHeight.toFixed(2)}`);
        
        // Устанавливаем позицию и состояние танка
        if (this.tank.chassis && this.tank.physicsBody) {
            this.tank.chassis.position.copyFrom(spawnPos);
            this.tank.chassis.rotationQuaternion = Quaternion.Identity();
            this.tank.chassis.rotation.set(0, 0, 0);
            if (this.tank.turret) this.tank.turret.rotation.set(0, 0, 0);
            if (this.tank.barrel) this.tank.barrel.rotation.set(0, 0, 0);
            
            // Телепортация с правильной синхронизацией физики
            this.tank.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // Временно включаем preStep для синхронизации
            this.tank.physicsBody.disablePreStep = false;
            this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // Восстанавливаем disablePreStep
            setTimeout(() => {
                if (this.tank?.physicsBody) {
                    this.tank.physicsBody.disablePreStep = true;
                }
            }, 0);
        }
    }
    
    // Спавн игрока в случайном гараже
    spawnPlayerInGarage() {
        if (!this.tank) {
            logger.warn("[Game] Tank not initialized");
            return;
        }
        
        // В мультиплеере используем позицию спавна с сервера
        if (this.isMultiplayer && this.multiplayerManager) {
            const spawnPos = (this.multiplayerManager as any).spawnPosition;
            if (spawnPos && spawnPos instanceof Vector3) {
                logger.log(`[Game] Using server spawn position: (${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`);
                if (this.tank.chassis && this.tank.physicsBody) {
                    this.tank.chassis.position.copyFrom(spawnPos);
                    if (this.tank.physicsBody) {
                        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                    }
                    // Сохраняем позицию для респавна
                    if (this.gameGarage) {
                        this.gameGarage.setPlayerGaragePosition(spawnPos.clone());
                    }
                    logger.log(`[Game] Player spawned at server position`);
                    return;
                }
            }
        }
        
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            logger.warn("[Game] No garages available, using default spawn at (0, 2, 0)");
            // Fallback на обычный спавн
            if (this.tank.chassis && this.tank.physicsBody) {
                const defaultPos = new Vector3(0, 2, 0);
                this.tank.chassis.position.copyFrom(defaultPos);
                // ОПТИМИЗАЦИЯ: Удален computeWorldMatrix - физика обновит матрицу автоматически
                if (this.tank.physicsBody) {
                    this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                }
            }
            return;
        }
        
        // ВСЕГДА выбираем центральный гараж (0, 0) для игрока
        // Находим гараж ближайший к центру карты
        if (!this.chunkSystem || this.chunkSystem.garagePositions.length === 0) {
            logger.warn("[Game] Cannot select player garage: no garage positions available");
            return;
        }
        const playerGarages = this.chunkSystem.garagePositions;
        if (!playerGarages || playerGarages.length === 0) {
            logger.warn("[Game] No garage positions available");
            return;
        }
        
        let selectedGarage: { x: number; z: number } | null = null;
        let minDist = Infinity;
        
        for (const garage of playerGarages) {
            // garage это GaragePosition с x, z (не Vector3)
            const dist = Math.sqrt(garage.x * garage.x + garage.z * garage.z);
            if (dist < minDist) {
                minDist = dist;
                selectedGarage = garage;
            }
        }
        
        if (!selectedGarage) {
            logger.warn("[Game] Could not select player garage");
            return;
        }
        
        logger.log(`[Game] Selected player garage at (${selectedGarage.x.toFixed(1)}, ${selectedGarage.z.toFixed(1)}) - distance from center: ${minDist.toFixed(1)}`);
        
        
        // Сохраняем позицию гаража для респавна (ВСЕГДА в этом же гараже!)
        // КРИТИЧНО: Используем улучшенный метод получения высоты террейна
        const terrainHeight = this.getGroundHeight(selectedGarage.x, selectedGarage.z);
        // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
        const garageY = Math.max(terrainHeight + 2.0, 3.0);
        
        this.gameGarage.setPlayerGaragePosition(new Vector3(selectedGarage.x, garageY, selectedGarage.z));
        logger.log(`[Game] Garage position saved for respawn: (${this.gameGarage.playerGaragePosition!.x.toFixed(2)}, ${this.gameGarage.playerGaragePosition!.y.toFixed(2)}, ${this.gameGarage.playerGaragePosition!.z.toFixed(2)})`);
        
        // Перемещаем танк в гараж
        if (this.tank.chassis && this.tank.physicsBody) {
            // КРИТИЧЕСКИ ВАЖНО: Убеждаемся что физика активна
            if (this.tank.physicsBody.motionType !== PhysicsMotionType.DYNAMIC) {
                this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            }
            
            // КРИТИЧНО: Используем terrainGenerator напрямую для получения высоты террейна
            // Это гарантирует правильную высоту даже если ground mesh ещё не загружен
            let groundHeight = 2.0; // Безопасное значение по умолчанию
            
            if (this.chunkSystem?.terrainGenerator) {
                // Для polygon карты используем "military" биом
                const biome = this.currentMapType === "polygon" ? "military" : 
                             this.currentMapType === "frontline" ? "wasteland" :
                             this.currentMapType === "ruins" ? "wasteland" :
                             this.currentMapType === "canyon" ? "park" :
                             this.currentMapType === "industrial" ? "industrial" :
                             this.currentMapType === "urban_warfare" ? "city" :
                             this.currentMapType === "underground" ? "wasteland" :
                             this.currentMapType === "coastal" ? "park" : "dirt";
                
                try {
                    // terrainGenerator.getHeight уже учитывает гаражи и возвращает высоту террейна вокруг гаража
                    groundHeight = this.chunkSystem.terrainGenerator.getHeight(selectedGarage.x, selectedGarage.z, biome);
                    logger.log(`[Game] TerrainGenerator height at garage: ${groundHeight.toFixed(2)} (biome: ${biome})`);
                    
                    // КРИТИЧЕСКАЯ ПРОВЕРКА: Если высота слишком низкая или равна 0, используем безопасное значение
                    if (groundHeight <= 0 || groundHeight < 0.5) {
                        logger.warn(`[Game] TerrainGenerator returned suspicious height ${groundHeight.toFixed(2)}, using safe default 2.0`);
                        groundHeight = 2.0; // Безопасная минимальная высота
                    }
                    
                    // Дополнительная проверка: если высота очень маленькая, увеличиваем её
                    if (groundHeight < 1.0) {
                        groundHeight = Math.max(groundHeight, 2.0);
                        logger.warn(`[Game] Corrected very low terrain height to ${groundHeight.toFixed(2)}`);
                    }
                } catch (e) {
                    logger.warn(`[Game] TerrainGenerator error, using raycast fallback:`, e);
                    groundHeight = this.getGroundHeight(selectedGarage.x, selectedGarage.z);
                    // Если и raycast не помог, используем безопасное значение
                    if (groundHeight <= 0) {
                        groundHeight = 2.0;
                    }
                }
            } else {
                // Fallback на raycast если terrainGenerator недоступен
                groundHeight = this.getGroundHeight(selectedGarage.x, selectedGarage.z);
            }
            
            // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
            // Это гарантирует, что танк не застрянет в террейне
            // Минимальная абсолютная высота - 3.0 единиц (на случай если groundHeight = 0)
            let spawnHeight = Math.max(groundHeight + 2.0, 3.0);
            
            // Дополнительная проверка: убеждаемся что мы всегда минимум 2.0 метра над террейном
            if (groundHeight > 0 && spawnHeight < groundHeight + 2.0) {
                spawnHeight = groundHeight + 2.0;
                logger.warn(`[Game] Corrected player spawn Y to ${spawnHeight.toFixed(2)} at (${selectedGarage.x.toFixed(1)}, ${selectedGarage.z.toFixed(1)})`);
            }
            
            // Финальная проверка безопасности - минимум 2.0 над террейном и минимум 3.0 абсолютной высоты
            spawnHeight = Math.max(spawnHeight, groundHeight + 2.0, 3.0);
            
            // КРИТИЧЕСКАЯ ЗАЩИТА: Если высота всё ещё подозрительно низкая, используем фиксированную безопасную высоту
            if (spawnHeight < 3.0) {
                logger.error(`[Game] CRITICAL: Spawn height too low (${spawnHeight.toFixed(2)}), forcing to 3.0`);
                spawnHeight = 3.0;
            }
            
            logger.log(`[Game] Player spawn height: ${spawnHeight.toFixed(2)} (ground: ${groundHeight.toFixed(2)})`);
            
            // КРИТИЧЕСКИ ВАЖНО: Устанавливаем позицию с правильной высотой
            const spawnPos = new Vector3(selectedGarage.x, spawnHeight, selectedGarage.z);
            
            // Сбрасываем вращение корпуса (чтобы танк не был наклонён!)
            this.tank.chassis.rotationQuaternion = Quaternion.Identity();
            this.tank.chassis.rotation.set(0, 0, 0);
            
            // Сбрасываем вращение башни
            this.tank.turret.rotation.set(0, 0, 0);
            
            // КРИТИЧЕСКИ ВАЖНО: Телепортация с правильной синхронизацией физики
            // Шаг 1: Переключаем в ANIMATED режим
            this.tank.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // Шаг 2: Устанавливаем визуальную позицию
            this.tank.chassis.position.copyFrom(spawnPos);
            this.tank.chassis.computeWorldMatrix(true);
            
            // Шаг 3: Временно включаем preStep для синхронизации
            this.tank.physicsBody.disablePreStep = false;
            
            // Шаг 4: Переключаем в DYNAMIC режим (физика возьмёт позицию из меша)
            this.tank.physicsBody.setMotionType(PhysicsMotionType.DYNAMIC);
            this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
            this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
            
            // Шаг 5: Восстанавливаем disablePreStep после нескольких кадров стабилизации
            let frameCount = 0;
            const stabilizeInterval = setInterval(() => {
                frameCount++;
                if (frameCount > 3) { // Стабилизируем 3 кадра
                    clearInterval(stabilizeInterval);
                    // Восстанавливаем disablePreStep
                    if (this.tank?.physicsBody) {
                        this.tank.physicsBody.disablePreStep = true;
                    }
                    return;
                }
                
                // Принудительно сбрасываем скорости для стабилизации
                if (this.tank?.physicsBody) {
                    this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                    this.tank.physicsBody.setAngularVelocity(Vector3.Zero());
                }
            }, 16); // Каждый кадр (16ms)
        }
        
        
        logger.log(`[Game] Player spawned in garage at ${selectedGarage.x.toFixed(1)}, ${selectedGarage.z.toFixed(1)}`);
    }
    
    // Получить позицию БЛИЖАЙШЕГО гаража для респавна игрока
    getPlayerGaragePosition(): Vector3 | null {
        return this.gameGarage.getPlayerGaragePosition(this.camera);
    }
    
    // Спавн врагов в гаражах
    spawnEnemiesInGarages() {
        if (!this.soundManager || !this.effectsManager) {
            logger.warn("Sound/Effects not ready, skipping enemy spawn");
            return;
        }
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            logger.warn("No garages available for garage spawn, will use map spawn instead");
            // НЕ возвращаемся - вызывающий код должен использовать spawnEnemyTanks() как fallback
            return;
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Если гараж игрока ещё не определён, НЕ СПАВНИМ врагов!
        if (!this.gameGarage.playerGaragePosition) {
            logger.error("CRITICAL: Player garage NOT SET! Aborting enemy spawn!");
            return;
        }
        
        logger.log(`[Game] === ENEMY SPAWN CHECK ===`);
        logger.log(`[Game] Player garage position: (${this.gameGarage.playerGaragePosition.x.toFixed(1)}, ${this.gameGarage.playerGaragePosition.z.toFixed(1)})`);
        logger.log(`[Game] Total garages in world: ${this.chunkSystem.garagePositions.length}`);
        
        // Используем позиции гаражей для спавна врагов
        // КРИТИЧЕСКИ ВАЖНО: Исключаем гараж игрока из списка доступных для врагов!
        const playerGarageX = this.gameGarage.playerGaragePosition.x;
        const playerGarageZ = this.gameGarage.playerGaragePosition.z;
        
        const availableGarages = this.chunkSystem.garagePositions.filter(garage => {
            // Исключаем гараж игрока И все гаражи в радиусе 100 единиц от него!
            const distToPlayer = Math.sqrt(
                Math.pow(garage.x - playerGarageX, 2) + 
                Math.pow(garage.z - playerGarageZ, 2)
            );
            const isTooCloseToPlayer = distToPlayer < 100; // Минимум 100 единиц от гаража игрока!
            
            if (isTooCloseToPlayer) {
                logger.log(`[Game] EXCLUDING garage too close to player (${distToPlayer.toFixed(1)}m): (${garage.x.toFixed(1)}, ${garage.z.toFixed(1)})`);
            } else {
                logger.log(`[Game] AVAILABLE garage for enemies (${distToPlayer.toFixed(1)}m away): (${garage.x.toFixed(1)}, ${garage.z.toFixed(1)})`);
            }
            
            return !isTooCloseToPlayer;
        });
        
        logger.log(`[Game] Player garage: (${playerGarageX.toFixed(1)}, ${playerGarageZ.toFixed(1)}), Available garages for enemies: ${availableGarages.length}/${this.chunkSystem.garagePositions.length}`);
        
        // Спавним бота в каждом доступном гараже (максимум 8 ботов)
        let enemyCount = Math.min(8, availableGarages.length);
        if (enemyCount <= 0) {
            logger.log("[Game] No available garages for enemy spawn");
            return;
        }
        
        // Плавная кривая количества врагов вокруг игрока
        const adaptiveScale = this.getAdaptiveEnemyDifficultyScale();
        const scaledCount = Math.round(enemyCount * (0.7 + (adaptiveScale - 1) * 0.6)); // ~0.7..1.4x
        const minCount = Math.min(enemyCount, Math.max(1, Math.floor(enemyCount * 0.6)));
        const maxCount = Math.min(availableGarages.length, Math.min(10, enemyCount + 2));
        enemyCount = Math.max(minCount, Math.min(scaledCount, maxCount));
        
        // Перемешиваем гаражи
        for (let i = availableGarages.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = availableGarages[i]!;
            availableGarages[i] = availableGarages[j]!;
            availableGarages[j] = tmp;
        }
        
        // Спавним врагов в первых N гаражах
        for (let i = 0; i < enemyCount; i++) {
            const garage = availableGarages[i];
            if (!garage) {
                continue;
            }
            
            // КРИТИЧНО: Получаем высоту террейна для спавна
            let groundHeight = 0;
            const rayStart = new Vector3(garage.x, 50, garage.z);
            const rayDir = Vector3.Down();
            const ray = new Ray(rayStart, rayDir, 200); // Увеличена длина луча
            // КРИТИЧНО: Улучшенный фильтр для raycast - проверяем все меши террейна
            const hit = this.scene.pickWithRay(ray, (mesh) => {
                if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
                // Проверяем все меши террейна (ground_, terrain, и т.д.)
                return (mesh.name.startsWith("ground_") || 
                        mesh.name.includes("terrain") || 
                        mesh.name.includes("chunk")) && 
                       mesh.isEnabled();
            });
            
            
            
            if (hit && hit.hit && hit.pickedPoint) {
                groundHeight = hit.pickedPoint.y;
                
            } else if (this.chunkSystem && this.chunkSystem.terrainGenerator) {
                groundHeight = this.chunkSystem.terrainGenerator.getHeight(garage.x, garage.z, "dirt");
                
            } else {
                // КРИТИЧНО: Если оба метода не работают, используем минимальную высоту
                groundHeight = 0;
                
            }
            
            // КРИТИЧНО: Убеждаемся, что высота не отрицательная
            // Если groundHeight < 0, значит что-то не так - используем 0
            if (groundHeight < 0) {
                groundHeight = 0;
            }
            
            // КРИТИЧНО: Если raycast не нашел меш и terrainGenerator вернул 0 или очень маленькое значение,
            // это может означать, что террейн еще не загружен. Используем минимальную безопасную высоту.
            // Проверяем, есть ли загруженные чанки с террейном
            let hasLoadedTerrain = false;
            if (this.chunkSystem) {
                // Проверяем, есть ли меши террейна в сцене
                const terrainMeshes = this.scene.meshes.filter(m => 
                    m.name.startsWith("ground_") && m.isEnabled()
                );
                hasLoadedTerrain = terrainMeshes.length > 0;
                
                // Если террейн не загружен, используем минимальную высоту из terrainGenerator
                if (!hasLoadedTerrain && this.chunkSystem.terrainGenerator) {
                    // Пробуем получить высоту еще раз, но с более широким поиском
                    const testHeight = this.chunkSystem.terrainGenerator.getHeight(
                        garage.x, 
                        garage.z, 
                        "dirt"
                    );
                    // Если получили разумную высоту (не 0 и не отрицательную), используем её
                    if (testHeight > 0.1) {
                        groundHeight = testHeight;
                    } else {
                        // Если все еще 0, используем минимальную безопасную высоту
                        groundHeight = 2.0; // Минимальная высота для спавна
                    }
                }
            }
            
            // ИСПРАВЛЕНИЕ: Спавн на 2 метра выше фактического террейна
            const spawnY = Math.max(groundHeight + 2.0, 3.0);
            
            const garagePos = new Vector3(garage.x, spawnY, garage.z);
            
            // Используем сложность из текущих настроек (sessionSettings/меню)
            const difficulty = this.getCurrentEnemyDifficulty();
            const difficultyScale = adaptiveScale;
            
            const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty, difficultyScale);
            
            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }
            
            // Store garage position for this tank
            const enemyGaragePos = garagePos.clone();
            
            // On death
            enemyTank.onDeathObservable.add(() => {
                logger.log("[GAME] Enemy tank destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                }
                const baseReward = 100;
                const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
                if (this.currencyManager) {
                    this.currencyManager.addCurrency(reward);
                    if (this.hud) {
                        this.hud.setCurrency(this.currencyManager.getCurrency());
                    }
                    if (this.chatSystem) {
                        this.chatSystem.economy(`+${reward} credits (enemy tank destroyed)`);
                    }
                    if (this.experienceSystem && this.tank) {
                        this.experienceSystem.recordKill(
                            this.tank.chassisType.id,
                            this.tank.cannonType.id,
                            false
                        );
                    }
                    if (this.playerProgression) {
                        this.playerProgression.recordKill();
                        this.playerProgression.addCredits(reward);
                    }
                }
                const idx = this.enemyTanks.indexOf(enemyTank);
                if (idx !== -1) this.enemyTanks.splice(idx, 1);
                
                // Find available garage for respawn (NOT player's garage!)
                const newGarage = this.gameGarage.findNearestAvailableGarage(enemyGaragePos);
                if (newGarage) {
                    this.gameGarage.startGarageRespawnTimer(newGarage);
                } else {
                    const anyGarage = this.gameGarage.findGarageFarFromPlayer();
                    if (anyGarage) {
                        this.gameGarage.startGarageRespawnTimer(anyGarage);
                    }
                }
            });
            
            this.enemyTanks.push(enemyTank);
        }
        
        logger.log(`[Game] Spawned ${this.enemyTanks.length} enemy tanks in garages`);
    }
    
    // Обработка смерти врага
    private handleEnemyDeath(enemy: EnemyTank): void {
        logger.log("[GAME] Enemy tank destroyed! Adding kill...");
        
        if (this.hud) {
            this.hud.addKill();
        }
        
        // Track achievements
        if (this.achievementsSystem) {
            this.achievementsSystem.updateProgress("first_blood", 1);
            this.achievementsSystem.updateProgress("tank_hunter", 1);
            this.achievementsSystem.updateProgress("tank_ace", 1);
            if (this.tank && this.tank.currentHealth / this.tank.maxHealth < 0.2) {
                this.achievementsSystem.updateProgress("comeback", 1);
            }
        }
        
        // Track missions
        if (this.missionSystem) {
            this.missionSystem.updateProgress("kill", 1);
        }
        
        // Track stats
        if (this.playerStats) {
            this.playerStats.recordKill();
        }
        
        // Начисляем валюту
        const baseReward = 100;
        const reward = Math.round(baseReward * this.getDifficultyRewardMultiplier());
        if (this.currencyManager) {
            this.currencyManager.addCurrency(reward);
            if (this.hud) {
                this.hud.setCurrency(this.currencyManager.getCurrency());
                this.hud.showMessage(`+${reward} кредитов!`, "#ffaa00", 2000);
            }
        }
        
        // Добавляем опыт за убийство
        if (this.experienceSystem && this.tank) {
            this.experienceSystem.recordKill(
                this.tank.chassisType.id,
                this.tank.cannonType.id,
                false
            );
        }
        
        if (this.playerProgression) {
            this.playerProgression.recordKill();
            this.playerProgression.addCredits(reward);
        }
        
        // Удаляем бота из AI Coordinator
        if (this.aiCoordinator) {
            this.aiCoordinator.unregisterBot(enemy.getId().toString());
        }
        
        // Удаляем из массива
        const idx = this.enemyTanks.indexOf(enemy);
        if (idx !== -1) this.enemyTanks.splice(idx, 1);
        
        // Respawn после 3 минут в ближайшем доступном гараже
        const pos = enemy.chassis?.position || Vector3.Zero();
        if (this.chunkSystem && this.chunkSystem.garagePositions.length > 0) {
            const nearestGarage = this.gameGarage.findNearestAvailableGarage(pos);
            if (nearestGarage) {
                this.gameGarage.startGarageRespawnTimer(nearestGarage);
            } else {
                const nearest = this.gameGarage.findNearestGarage(pos);
                if (nearest) {
                    this.gameGarage.startGarageRespawnTimer(nearest);
                } else {
                    this.gameGarage.startGarageRespawnTimer(pos);
                }
            }
        } else {
            this.gameGarage.startGarageRespawnTimer(pos);
        }
    }
    
    respawnEnemyTank(garagePos: Vector3) {
        this.gameEnemies.respawnEnemyTank(
            garagePos,
            () => this.gameGarage.playerGaragePosition,
            (enemy, _reward) => this.handleEnemyDeath(enemy)
        );
        
        // Синхронизируем массив врагов
        this.enemyTanks = this.gameEnemies.enemyTanks;
    }
    
    
    // Сразу установить прозрачность стен гаража игрока при спавне
    
    // Методы POI перенесены в GamePOI модуль
    
    // УЛУЧШЕНО: Метод update() перенесен в GameUpdate.ts для модульности
    // Теперь используется this.gameUpdate.update() вместо прямого вызова
    
    // checkConsumablePickups удалён - теперь в GameConsumables

    // Aim mode variables
    isAiming = false;
    aimingTransitionProgress = 0.0; // 0.0 = обычный режим, 1.0 = полный режим прицеливания
    private _aimCameraStartPos: Vector3 | null = null; // Начальная позиция для плавного перехода в режим прицеливания
    private _aimCameraStartTarget: Vector3 | null = null; // Начальный target для плавного перехода
    aimingTransitionSpeed = 0.12; // Скорость перехода (чем больше, тем быстрее)
    
    normalRadius = 12;
    aimRadius = 6;     // Ближе к танку в режиме прицеливания
    normalBeta = Math.PI / 2 - (20 * Math.PI / 180);  // 20 градусов от горизонта
    aimBeta = 0.25;    // Низкий угол - как из башни танка
    
    // FOV settings for aim mode  
    normalFOV = 0.8;   // Обычный угол обзора (радианы)
    aimFOV = 0.4;      // 2x зум для разумного обзора поля боя
    
    // Mouse control for aiming
    aimMouseSensitivity = 0.00015; // Базовая чувствительность мыши в режиме прицеливания (горизонтальная) - такая же как вертикальная
    aimMouseSensitivityVertical = 0.00015; // Базовая вертикальная чувствительность в режиме прицеливания
    // ИСПРАВЛЕНИЕ: Увеличена максимальная скорость мыши для режима прицеливания (убрано ограничение)
    aimMaxMouseSpeed = 200; // Максимальная скорость движения мыши (пиксели за кадр) - увеличено с 25 до 200 для разумной чувствительности
    aimPitchSmoothing = 0.12; // Коэффициент сглаживания для вертикального прицеливания (улучшено для плавности)
    aimYawSmoothing = 0.18; // Коэффициент сглаживания для горизонтального прицеливания (для плавности)
    targetAimPitch = 0; // Целевой угол вертикального прицеливания (для плавной интерполяции)
    targetAimYaw = 0; // Целевой угол горизонтального прицеливания (для плавной интерполяции)
    isPointerLocked = false; // Флаг блокировки указателя
    private altKeyPressed = false; // Флаг зажатия Alt для pointer lock
    private pointerMoveBlocked = false; // Флаг блокировки движения мыши (для предотвращения проворота башни при ESC)
    aimYaw = 0; // Горизонтальный поворот прицела
    aimPitch = 0; // Вертикальный поворот прицела
    
    // === ПЛАВНЫЙ ЗУМ В РЕЖИМЕ ПРИЦЕЛИВАНИЯ ===
    aimZoom = 0; // Текущий зум (плавно интерполируется)
    targetAimZoom = 0; // Целевой зум (устанавливается колёсиком мыши)
    minZoom = 0; // Минимальный зум (без приближения)
    maxZoom = 4.0; // Максимальный зум
    zoomStep = 0.5; // Шаг изменения зума
    zoomSmoothSpeed = 0.15; // Скорость плавной интерполяции зума
    
    // === НОВАЯ СИСТЕМА: Камера независима от башни ===
    cameraYaw = 0; // Угол камеры (горизонтальный) - мышь всегда управляет этим
    isFreeLook = false; // Shift зажат - свободный обзор без поворота башни
    mouseSensitivity = 0.003; // Обычная чувствительность мыши
    
    // Виртуальная точка для фиксации башни
    virtualTurretTarget: Vector3 | null = null; // Мировая точка направления башни
    lastMouseControlTime = 0; // Время последнего управления мышкой
    lastChassisRotation = 0; // Последний угол корпуса для отслеживания поворота
    
    // Методы calculateProjectileRange и findMaxPitchForRange перенесены в GameProjectile
    
    setupCameraInput() {
        window.addEventListener("keydown", (evt) => {
            this._inputMap[evt.code] = true;
            
            // === SHIFT = СВОБОДНЫЙ ОБЗОР (freelook) ===
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = true;
            }
            
            // === ALT = ВКЛЮЧЕНИЕ POINTER LOCK (игровой курсор) ===
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && !this.altKeyPressed) {
                // ИСПРАВЛЕНИЕ: Улучшенная проверка условий и визуальная индикация
                // Проверяем что игра запущена, не на паузе, и не открыты меню
                if (this.gameStarted && !(this as any).isPaused && 
                    (!this.garage || !this.garage.isGarageOpen()) &&
                    (!this.mainMenu || !this.mainMenu.isVisible())) {
                    this.altKeyPressed = true;
                    evt.preventDefault(); // Предотвращаем контекстное меню браузера
                    evt.stopPropagation(); // Предотвращаем всплытие события
                    const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
                    if (canvas && document.pointerLockElement !== canvas) {
                        
                        try {
                            // requestPointerLock может вернуть Promise или void в зависимости от браузера
                            const lockResult: any = canvas.requestPointerLock();
                            
                            if (lockResult && typeof lockResult === 'object' && typeof lockResult.then === 'function') {
                                lockResult.then(() => {
                                    logger.log("[Game] Pointer lock activated via Alt key");
                                    // Визуальная индикация
                                    if (this.hud) {
                                        this.hud.showMessage("🖱️ Игровой курсор включен (Alt)", "#0f0", 2000);
                                    }
                                }).catch((err: Error) => {
                                    
                                    logger.warn("[Game] Failed to request pointer lock on Alt:", err);
                                    if (this.hud) {
                                        this.hud.showMessage("⚠️ Не удалось включить курсор", "#f00", 2000);
                                    }
                                });
                            } else {
                                // requestPointerLock вернул void - используем события для отслеживания
                                logger.log("[Game] Pointer lock requested via Alt key");
                            }
                        } catch (err) {
                            
                            logger.warn("[Game] Failed to request pointer lock on Alt:", err);
                        }
                    } else if (canvas && document.pointerLockElement === canvas) {
                        // Уже заблокирован
                        if (this.hud) {
                            this.hud.showMessage("🖱️ Курсор уже активен", "#0ff", 1500);
                        }
                    }
                } else {
                    // Игра не запущена или меню открыто
                    logger.debug("[Game] Alt pressed but game not ready for pointer lock");
                }
            }
            
            // G key handled in main keydown listener (constructor)
            // ESC to close garage handled in main keydown listener
        });
        window.addEventListener("keyup", (evt) => {
            this._inputMap[evt.code] = false;
            
            // === ОТПУСТИЛИ SHIFT - выход из freelook ===
            if (evt.code === "ShiftLeft" || evt.code === "ShiftRight") {
                this.isFreeLook = false;
            }
            
            // === ОТПУСТИЛИ TAB - скрыть stats overlay ===
            if (evt.code === "Tab" && this.gameStarted) {
                evt.preventDefault();
                this.gameStats.hide();
            }
            
            // === ОТПУСТИЛИ ALT - выход из pointer lock ===
            if ((evt.code === "AltLeft" || evt.code === "AltRight") && this.altKeyPressed) {
                this.altKeyPressed = false;
                const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
                if (document.pointerLockElement === canvas) {
                    document.exitPointerLock();
                    logger.log("[Game] Pointer lock deactivated via Alt key release");
                    // Визуальная индикация
                    if (this.hud) {
                        this.hud.showMessage("🖱️ Игровой курсор выключен", "#888", 1500);
                    }
                }
            }
        });
        
        window.addEventListener("wheel", (evt) => {
            if (!this.camera) return;
            
            // Spectator mode: switch targets with wheel
            if (this.isSpectating && !this.isAiming) {
                if (evt.deltaY < 0) {
                    this.switchSpectatorTarget(true); // Next player
                } else {
                    this.switchSpectatorTarget(false); // Previous player
                }
                return;
            }
            
            if (this.isAiming) {
                // === ПЛАВНЫЙ ЗУМ В РЕЖИМЕ ПРИЦЕЛИВАНИЯ ===
                if (evt.deltaY < 0) {
                    // Scroll up - увеличить целевой зум
                    this.targetAimZoom = Math.min(this.maxZoom, this.targetAimZoom + this.zoomStep);
                } else {
                    // Scroll down - уменьшить целевой зум
                    this.targetAimZoom = Math.max(this.minZoom, this.targetAimZoom - this.zoomStep);
                }
                // HUD обновляется при плавной интерполяции в updateCamera
                return;
            }
            
            if (evt.shiftKey) {
                this.cameraBeta += evt.deltaY * 0.001;
                this.cameraBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.cameraBeta));
            } else {
                this.camera.radius += evt.deltaY * 0.01;
                this.camera.radius = Math.max(5, Math.min(25, this.camera.radius));
                this.normalRadius = this.camera.radius;
            }
        });
        
        // Pointer lock detection
        const canvas = this.scene.getEngine().getRenderingCanvas() as HTMLCanvasElement;
        document.addEventListener("pointerlockchange", () => {
            this.isPointerLocked = document.pointerLockElement === canvas;
            // НЕ сбрасываем углы - башня остаётся в текущем положении!
            // Просто выключаем режим прицеливания
            if (!this.isPointerLocked && this.isAiming) {
                this.isAiming = false;
                this.aimPitch = 0;
                this.targetAimPitch = 0; // Сбрасываем целевой угол
                this.targetAimYaw = this.aimYaw; // Сохраняем текущий угол
                this.aimZoom = 0;
                this.targetAimZoom = 0; // Сброс целевого зума
                if (this.tank) {
                    this.tank.aimPitch = 0;
                }
                if (this.hud) {
                    this.hud.setZoomLevel(-1);
                }
            }
        });
        
        // === НОВАЯ СИСТЕМА УПРАВЛЕНИЯ МЫШЬЮ ===
        // Мышка ВСЕГДА управляет камерой
        // Башня догоняет камеру (если не Shift/freelook)
        this.scene.onPointerMove = (evt) => {
            // КРИТИЧНО: Игнорируем движения мыши если меню открыто или игра на паузе
            if (!this.isPointerLocked) return;
            if (this.gamePaused) return;
            if (this.mainMenu && this.mainMenu.isVisible()) return;
            
            // КРИТИЧНО: Блокируем движение мыши при переключении меню (ESC)
            if (this.pointerMoveBlocked) {
                return;
            }
            
            if (evt.movementX !== undefined) {
                // В режиме прицеливания ограничиваем максимальную скорость движения мыши
                let movementX = evt.movementX;
                let movementY = evt.movementY || 0;
                
                // ИСПРАВЛЕНИЕ: Убрано жесткое ограничение скорости мыши в режиме прицеливания
                // Теперь используется разумная чувствительность без блокировок
                if (this.isAiming) {
                    // Мягкое ограничение только для экстремальных значений (защита от глюков)
                    const maxMovement = 500; // Очень высокий лимит, практически не ограничивает
                    movementX = Math.max(-maxMovement, Math.min(maxMovement, movementX));
                    movementY = Math.max(-maxMovement, Math.min(maxMovement, movementY));
                }
                
                const sensitivity = this.isAiming ? this.aimMouseSensitivity : this.mouseSensitivity;
                const yawDelta = movementX * sensitivity;
                
                // === КАМЕРА ВСЕГДА СЛЕДУЕТ ЗА МЫШКОЙ ===
                this.cameraYaw += yawDelta;
                
                // Нормализуем угол камеры (-PI до PI)
                while (this.cameraYaw > Math.PI) this.cameraYaw -= Math.PI * 2;
                while (this.cameraYaw < -Math.PI) this.cameraYaw += Math.PI * 2;
                
                if (this.isAiming) {
                    // В режиме прицеливания - обновляем целевой aimYaw (для плавной интерполяции)
                    // Адаптивная чувствительность в зависимости от зума (чем больше зум, тем ниже чувствительность)
                    const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3); // При зуме 4x чувствительность снижается до ~45%
                    const adaptiveSensitivity = this.aimMouseSensitivity * zoomFactor;
                    const adaptiveYawDelta = movementX * adaptiveSensitivity;
                    
                    this.targetAimYaw += adaptiveYawDelta;
                    
                    // Нормализуем целевой aimYaw
                    while (this.targetAimYaw > Math.PI) this.targetAimYaw -= Math.PI * 2;
                    while (this.targetAimYaw < -Math.PI) this.targetAimYaw += Math.PI * 2;
                    
                    // === БАШНЯ ПОВОРАЧИВАЕТСЯ ВМЕСТЕ С МЫШКОЙ В РЕЖИМЕ ПРИЦЕЛИВАНИЯ ===
                    // Используем плавно интерполированный aimYaw для башни
                    if (this.tank && this.tank.turret) {
                        // Вычисляем разницу для плавного поворота башни
                        let yawDiff = this.targetAimYaw - this.aimYaw;
                        // Нормализуем разницу в диапазон [-PI, PI]
                        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                        
                        // Применяем плавный поворот башни с ограничением скорости (как в обычном режиме)
                        const turretSpeed = this.tank.turretSpeed || 0.04;
                        if (Math.abs(yawDiff) > 0.01) {
                            const rotationAmount = Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
                            this.tank.turret.rotation.y += rotationAmount;
                        }
                        
                        // Нормализуем угол башни чтобы не накапливался
                        while (this.tank.turret.rotation.y > Math.PI) this.tank.turret.rotation.y -= Math.PI * 2;
                        while (this.tank.turret.rotation.y < -Math.PI) this.tank.turret.rotation.y += Math.PI * 2;
                    }
                    
                    // Нормализуем текущий aimYaw (будет плавно интерполироваться в updateCamera)
                    while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
                    while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
                    
                    // Вертикальный поворот (pitch) - только в режиме прицеливания
                    if (movementY !== undefined) {
                        // Адаптивная чувствительность по вертикали в зависимости от зума
                        const zoomFactor = 1.0 / (1.0 + this.aimZoom * 0.3);
                        const adaptiveVerticalSensitivity = this.aimMouseSensitivityVertical * zoomFactor;
                        const pitchDelta = -movementY * adaptiveVerticalSensitivity;
                        let newPitch = this.targetAimPitch + pitchDelta;
                        
                        // Ограничиваем угол так, чтобы дальность не превышала 999 метров
                        // ОПТИМИЗАЦИЯ: Используем кэшированную высоту ствола
                        if (this.tank) {
                            if (this._cachedBarrelHeightFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                                this._cachedBarrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
                                this._cachedBarrelHeightFrame = this._updateTick;
                            }
                            const barrelHeight = this._cachedBarrelHeight;
                            const maxRange = 999;
                            
                            // Вычисляем дальность для нового угла
                            const range = this.gameProjectile.calculateProjectileRange(newPitch, this.tank.projectileSpeed, barrelHeight);
                            
                            // Если дальность превышает максимум, ограничиваем угол
                            if (range > maxRange) {
                                // Находим максимальный угол, при котором дальность = 999м
                                newPitch = this.gameProjectile.findMaxPitchForRange(maxRange, this.tank.projectileSpeed, barrelHeight);
                            }
                        }
                        
                        // Также применяем стандартные ограничения угла к целевому углу (-10° до +5°)
                        this.targetAimPitch = Math.max(-Math.PI / 18, Math.min(Math.PI / 36, newPitch));
                    }
                    
                    // ИСПРАВЛЕНИЕ: Плавная интерполяция aimPitch и передача в TankController
                    this.aimPitch += (this.targetAimPitch - this.aimPitch) * this.aimPitchSmoothing;
                    // Передаем aimPitch в танк для применения к стволу
                    if (this.tank) {
                        this.tank.aimPitch = this.aimPitch;
                    }
                } else if (!this.isFreeLook && this.tank && this.tank.turret && this.tank.chassis) {
                    // НЕ в режиме прицеливания и НЕ freelook
                    // При движении мыши - сбрасываем виртуальную точку (игрок снова управляет башней)
                    this.virtualTurretTarget = null;
                    this.lastMouseControlTime = 0;
                    
                    // Отменяем центрирование башни при движении мыши
                    if (this.tank && Math.abs(evt.movementX) > 0.1) {
                        this.tank.isAutoCentering = false;
                        window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                    }
                }
            }
        };
        
        // Listen for aim mode changes from tank
        window.addEventListener("aimModeChanged", ((e: CustomEvent) => {
            this.isAiming = e.detail.aiming;
            logger.log(`[Camera] Aim mode: ${this.isAiming}`);
            // Показ/скрытие прицела
            if (this.hud) {
                this.hud.setAimMode(this.isAiming);
            }
            
            if (this.isAiming) {
                // === ВХОД В РЕЖИМ ПРИЦЕЛИВАНИЯ ===
                // Камера должна показывать актуальный угол ствола!
                // Синхронизируем aimYaw с ПОЛНЫМ углом башни (chassis + turret)
                if (this.tank && this.tank.turret && this.tank.chassis) {
                    // Получаем угол корпуса
                    const chassisRotY = this.tank.chassis.rotationQuaternion 
                        ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                        : this.tank.chassis.rotation.y;
                    // Получаем угол башни относительно корпуса
                    const turretRotY = this.tank.turret.rotation.y;
                    // Полный угол башни в мировых координатах
                    const totalRotY = chassisRotY + turretRotY;
                    
                    // Устанавливаем aimYaw на полный угол башни
                    this.aimYaw = totalRotY;
                    this.targetAimYaw = totalRotY; // Синхронизируем целевой угол
                    // cameraYaw должен оставаться углом башни относительно корпуса (не меняем при входе в режим прицеливания)
                    // Нормализуем угол башни относительно корпуса
                    let normalizedTurretRotY = turretRotY;
                    while (normalizedTurretRotY > Math.PI) normalizedTurretRotY -= Math.PI * 2;
                    while (normalizedTurretRotY < -Math.PI) normalizedTurretRotY += Math.PI * 2;
                    this.cameraYaw = normalizedTurretRotY;
                }
                this.aimPitch = 0; // Только вертикаль сбрасываем
                this.targetAimPitch = 0; // Сбрасываем целевой угол
                // Устанавливаем начальную дальность (горизонтальный выстрел)
                // ОПТИМИЗАЦИЯ: Используем кэшированную высоту ствола
                if (this.hud && this.tank && this.tank.barrel) {
                    if (this._cachedBarrelHeightFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                        this._cachedBarrelHeight = this.tank.barrel.getAbsolutePosition().y;
                        this._cachedBarrelHeightFrame = this._updateTick;
                    }
                    this.hud.setAimRange(0, this.tank.projectileSpeed, this._cachedBarrelHeight);
                }
            } else {
                // === ВЫХОД ИЗ РЕЖИМА ПРИЦЕЛИВАНИЯ ===
                // НЕ сбрасываем aimYaw - башня остаётся в текущем положении!
                // Только сбрасываем pitch и zoom
                this.aimPitch = 0;
                this.targetAimPitch = 0; // Сбрасываем целевой угол
                this.targetAimYaw = this.aimYaw; // Сохраняем текущий угол для плавного перехода
                this.aimZoom = 0; // Сброс зума
                this.targetAimZoom = 0; // Сброс целевого зума
                
                // Нормализуем угол башни чтобы избежать лишних оборотов
                if (this.tank && this.tank.turret) {
                    // Нормализуем turret.rotation.y в диапазон [-PI, PI]
                    let turretY = this.tank.turret.rotation.y;
                    while (turretY > Math.PI) turretY -= Math.PI * 2;
                    while (turretY < -Math.PI) turretY += Math.PI * 2;
                    this.tank.turret.rotation.y = turretY;
                }
                
                // Синхронизируем cameraYaw с текущим направлением башни
                // ВАЖНО: cameraYaw должен быть углом башни относительно корпуса, а не полным углом!
                if (this.tank && this.tank.turret && this.tank.chassis) {
                    const chassisRotY = this.tank.chassis.rotationQuaternion 
                        ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                        : this.tank.chassis.rotation.y;
                    const turretRotY = this.tank.turret.rotation.y;
                    // Нормализуем угол башни относительно корпуса
                    let normalizedTurretRotY = turretRotY;
                    while (normalizedTurretRotY > Math.PI) normalizedTurretRotY -= Math.PI * 2;
                    while (normalizedTurretRotY < -Math.PI) normalizedTurretRotY += Math.PI * 2;
                    // cameraYaw - это угол башни относительно корпуса (используется в обычном режиме)
                    this.cameraYaw = normalizedTurretRotY;
                    // aimYaw - полный угол в мировых координатах (для режима прицеливания)
                    let totalAngle = chassisRotY + turretRotY;
                    while (totalAngle > Math.PI) totalAngle -= Math.PI * 2;
                    while (totalAngle < -Math.PI) totalAngle += Math.PI * 2;
                    this.aimYaw = totalAngle;
                }
                
                // Reset tank's aimPitch
                if (this.tank) {
                    this.tank.aimPitch = 0;
                }
                
                if (this.hud) {
                    this.hud.setZoomLevel(-1); // -1 = скрыть индикатор
                }
            }
            // Плавный переход будет обрабатываться в updateCamera()
        }) as EventListener);
        
        // Listen for center camera request (when C is pressed)
        window.addEventListener("centerCamera", ((e: CustomEvent) => {
            this.shouldCenterCamera = true;
            if (e.detail) {
                // Используем ту же скорость lerp что и башня для синхронизации
                if (e.detail.lerpSpeed) {
                    this.centerCameraSpeed = e.detail.lerpSpeed;
                }
                this.isCenteringActive = e.detail.isActive !== false;
            }
        }) as EventListener);
        
        // Listen for stop center camera request (when C is released or centering complete)
        window.addEventListener("stopCenterCamera", (() => {
            this.shouldCenterCamera = false;
            this.isCenteringActive = false;
        }) as EventListener);
        
        // Listen for sync camera yaw request (when turret is already centered and C is pressed)
        window.addEventListener("syncCameraYaw", ((e: CustomEvent) => {
            if (e.detail && e.detail.turretRotY !== undefined) {
                // Синхронизируем cameraYaw с углом башни (должен быть 0 когда башня в центре)
                this.cameraYaw = e.detail.turretRotY;
            }
        }) as EventListener);
    }
    
    updateCamera() {
        // Spectator mode - follow other players
        if (this.isSpectating && this.isMultiplayer) {
            this.updateSpectatorCamera();
            return;
        }
        
        // Убеждаемся, что камера активна даже если танк еще не создан
        if (!this.camera) {
            return;
        }
        
        // КРИТИЧЕСКИ ВАЖНО: Устанавливаем камеру как активную, если она не установлена
        if (!this.scene.activeCamera) {
            this.scene.activeCamera = this.camera;
        }
        
        // Если танк еще не создан, просто убеждаемся что камера активна и выходим
        if (!this.tank || !this.tank.chassis || !this.tank.turret || !this.tank.barrel) {
            return;
        }
        
        if (this.camera) {
            // ИСПРАВЛЕНО: В режиме прицеливания управление стволом ТОЛЬКО через R/F, Q/E отключены
            if (this.isAiming) {
                // В режиме прицеливания Q/E НЕ управляют прицеливанием - только R/F управляют стволом
                // Управление через R/F обрабатывается в tankMovement.ts
            } else {
                // Вне режима прицеливания: Q/E управляют наклоном камеры (как раньше)
                const tiltSpeed = 0.02;
                if (this._inputMap["KeyQ"]) this.normalBeta -= tiltSpeed;
                if (this._inputMap["KeyE"]) this.normalBeta += tiltSpeed;
                this.normalBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.normalBeta));
            }
            
            // Camera collision - предотвращаем заход камеры за текстуры
            if (this.gameCamera) {
                this.gameCamera.adjustCameraForCollision(this.aimingTransitionProgress);
            }

            // === ПЛАВНЫЙ ПЕРЕХОД В РЕЖИМ ПРИЦЕЛИВАНИЯ ===
            // Обновляем прогресс перехода
            if (this.isAiming) {
                // Плавно увеличиваем прогресс перехода
                this.aimingTransitionProgress = Math.min(1.0, this.aimingTransitionProgress + this.aimingTransitionSpeed);
                
                // === ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ГОРИЗОНТАЛЬНОГО ПРИЦЕЛИВАНИЯ ===
                // Плавно интерполируем aimYaw к targetAimYaw для более плавного движения
                let yawDiff = this.targetAimYaw - this.aimYaw;
                // Нормализуем разницу в диапазон [-PI, PI] для правильной интерполяции
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                this.aimYaw += yawDiff * this.aimYawSmoothing;
                
                // Нормализуем aimYaw
                while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
                while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;
                
                // === ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ВЕРТИКАЛЬНОГО ПРИЦЕЛИВАНИЯ ===
                // Плавно интерполируем aimPitch к targetAimPitch для более плавного движения
                const pitchDiff = this.targetAimPitch - this.aimPitch;
                this.aimPitch += pitchDiff * this.aimPitchSmoothing;
                
                // === ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ЗУМА (0x-4x) ===
                const zoomDiff = this.targetAimZoom - this.aimZoom;
                this.aimZoom += zoomDiff * this.zoomSmoothSpeed;
                // Обновляем HUD с текущим зумом (всегда, чтобы индикатор был виден)
                if (this.hud) {
                    this.hud.setZoomLevel(this.aimZoom);
                }
                
                // SYNC aimPitch to tank controller for shooting
                if (this.tank) {
                    this.tank.aimPitch = this.aimPitch;
                }
                
                // Обновляем индикатор дальности в HUD
                // ОПТИМИЗАЦИЯ: Кэшируем getAbsolutePosition() - обновляем каждые 2 кадра
                if (this.hud && this.tank) {
                    if (this._cachedBarrelHeightFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                        this._cachedBarrelHeight = this.tank.barrel ? this.tank.barrel.getAbsolutePosition().y : 2.5;
                        this._cachedBarrelHeightFrame = this._updateTick;
                    }
                    this.hud.setAimRange(this.aimPitch, this.tank.projectileSpeed, this._cachedBarrelHeight);
                }
            } else {
                // Плавно уменьшаем прогресс перехода
                this.aimingTransitionProgress = Math.max(0.0, this.aimingTransitionProgress - this.aimingTransitionSpeed);
                
                // Сбрасываем целевые углы при выходе из режима прицеливания
                this.targetAimPitch = 0;
                this.targetAimYaw = this.aimYaw; // Сохраняем текущий угол для плавного перехода
            }
            
            // Используем плавную интерполяцию для всех параметров
            const t = this.aimingTransitionProgress; // 0.0 - 1.0
            
            // ИСПРАВЛЕНО: Инициализируем позицию aimCamera ПРИВЯЗАННУЮ К ТАНКУ при первом обнаружении перехода в режим прицеливания
            if (this.isAiming && this._aimCameraStartPos === null && this.camera && this.aimCamera && this.tank && this.tank.chassis) {
                // ПРИВЯЗЫВАЕМ КАМЕРУ К ПОЗИЦИИ ТАНКА - используем кэшированную позицию для производительности
                const tankPos = this.tank.getCachedChassisPosition();
                const cameraTarget = this.camera.getTarget();
                const alpha = this.camera.alpha;
                const beta = this.camera.beta;
                const radius = this.camera.radius;
                
                // Вычисляем текущую позицию камеры относительно танка
                const x = cameraTarget.x + radius * Math.cos(beta) * Math.sin(alpha);
                const y = cameraTarget.y + radius * Math.sin(beta);
                const z = cameraTarget.z + radius * Math.cos(beta) * Math.cos(alpha);
                
                this._aimCameraStartPos = new Vector3(x, y, z);
                // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                this._tmpCameraTarget.copyFrom(cameraTarget);
                this._aimCameraStartTarget = this._tmpCameraTarget.clone(); // Нужен новый объект для сохранения
                
                // Убеждаемся, что позиция не (0,0,0) - если да, используем позицию танка
                if (this._aimCameraStartPos.length() < 0.1) {
                    this._aimCameraStartPos = tankPos.add(new Vector3(0, 3, -8));
                    this._aimCameraStartTarget = tankPos.add(new Vector3(0, 1, 0));
                }
                
                // Устанавливаем начальную позицию и target для плавного перехода
                this.aimCamera.position.copyFrom(this._aimCameraStartPos);
                this.aimCamera.setTarget(this._aimCameraStartTarget);
                
                logger.log("[Game] Aim camera initialized from tank position:", {
                    tankPos: tankPos,
                    startPos: this._aimCameraStartPos,
                    startTarget: this._aimCameraStartTarget
                });
            }
            
            // Плавное переключение камер
            if (t > 0.01) {
                // Переключаемся на aim камеру (когда прогресс > 1%)
                if (this.camera) {
                    this.camera.setEnabled(false);
                }
                if (this.aimCamera) {
                    // КРИТИЧЕСКИ ВАЖНО: Убеждаемся, что позиция установлена ПЕРЕД активацией
                    if (this._aimCameraStartPos) {
                        this.aimCamera.position.copyFrom(this._aimCameraStartPos);
                    } else if (this.tank && this.tank.chassis) {
                        // Fallback: если позиция не установлена, используем кэшированную позицию танка
                        const tankPos = this.tank.getCachedChassisPosition();
                        this.aimCamera.position.copyFrom(tankPos.add(new Vector3(0, 3, -8)));
                        // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                        this._tmpAimPos.copyFrom(this.aimCamera.position);
                        this._aimCameraStartPos = this._tmpAimPos.clone(); // Нужен новый объект для сохранения
                    }
                    this.aimCamera.setEnabled(true);
                    this.scene.activeCamera = this.aimCamera;
                }
            } else {
                // Переключаемся обратно на основную камеру
                if (this.aimCamera) {
                    this.aimCamera.setEnabled(false);
                }
                if (this.camera) {
                    this.camera.setEnabled(true);
                    this.scene.activeCamera = this.camera;
                }
                // Сбрасываем начальную позицию при выходе из режима прицеливания
                if (!this.isAiming) {
                    this._aimCameraStartPos = null;
                    this._aimCameraStartTarget = null;
                }
            }
            
            // В режиме прицеливания ВСЕ элементы танка остаются ВИДИМЫМИ
            // Никаких изменений visibility - танк всегда виден полностью
            if (this.tank.turret) {
                this.tank.turret.visibility = 1.0;
            }
            if (this.tank.chassis) {
                this.tank.chassis.visibility = 1.0;
            }
            if (this.tank.barrel) {
                this.tank.barrel.visibility = 1.0;
            }
            
            // ПЛАВНЫЙ переход FOV с учётом зума
            if (this.aimCamera && t > 0.01) {
                // Базовый FOV в режиме прицеливания делим на зум (0 = без зума = FOV 1.0)
                const effectiveZoom = this.aimZoom <= 0 ? 1.0 : (1.0 + this.aimZoom * 0.5); // 0->1x, 1->1.5x, 2->2x, 4->3x
                const zoomedAimFOV = this.aimFOV / effectiveZoom;
                // Интерполируем FOV от normalFOV к зуммированному aimFOV
                const targetFOV = this.normalFOV + (zoomedAimFOV - this.normalFOV) * t;
                const currentFOV = this.aimCamera.fov;
                // Плавная интерполяция для FOV
                this.aimCamera.fov += (targetFOV - currentFOV) * 0.15;
            }
            
            // === AIMING CAMERA: SYNCHRONIZED WITH BARREL ===
            if (t > 0.01 && this.aimCamera) {
                // ОПТИМИЗАЦИЯ: getWorldMatrix() автоматически обновит матрицу если нужно
                // Get BARREL direction from mesh - this is the ACTUAL direction the gun is pointing
                // barrel is child of turret, which is child of chassis
                // So getDirection returns world direction accounting for all rotations
                // КРИТИЧНО: ОПТИМИЗАЦИЯ - getWorldMatrix() очень дорогая операция, кэшируем результат
                if (this._cachedBarrelWorldDirFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                    const barrelWorldMatrix = this.tank.barrel.getWorldMatrix();
                    this._cachedBarrelWorldDir = Vector3.TransformNormal(Vector3.Forward(), barrelWorldMatrix).normalize();
                    this._cachedBarrelWorldDirFrame = this._updateTick;
                }
                const barrelWorldDir = this._cachedBarrelWorldDir;
                
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию ствола (обновляем каждые 2 кадра)
                if (this._cachedBarrelWorldPosFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                    this._cachedBarrelWorldPos = this.tank.barrel.getAbsolutePosition();
                    this._cachedBarrelWorldPosFrame = this._updateTick;
                }
                const barrelWorldPos = this._cachedBarrelWorldPos;
                const muzzlePos = barrelWorldPos.add(barrelWorldDir.scale(1.6));
                
                // Calculate FULL aiming direction with pitch applied
                // Horizontal direction from barrel + vertical from aimPitch
                const aimDirection = new Vector3(
                    barrelWorldDir.x * Math.cos(this.aimPitch),
                    Math.sin(this.aimPitch),
                    barrelWorldDir.z * Math.cos(this.aimPitch)
                ).normalize();
                
                // ИСПРАВЛЕНО: Camera position для видимости ствола снизу по середине
                // Камера должна быть выше и смотреть вниз, чтобы ствол был виден в нижней части экрана
                const backOffset = 5.0 - this.aimZoom * 0.75;
                
                // Камера позади и ВЫШЕ ствола, чтобы видеть ствол снизу
                const cameraPos = muzzlePos.add(aimDirection.scale(-backOffset));
                
                // ИСПРАВЛЕНО: Увеличиваем высоту камеры, чтобы ствол был виден снизу по середине
                const heightOffset = 2.5 - this.aimZoom * 0.2; // Увеличено с 1.0 до 2.5
                cameraPos.y += heightOffset;
                
                // Slight right offset for better view
                const rightDir = Vector3.Cross(Vector3.Up(), barrelWorldDir).normalize();
                cameraPos.addInPlace(rightDir.scale(0.2));
                
                // ИСПРАВЛЕНО: Плавный переход от позиции основной камеры (третье лицо) к позиции прицеливания
                // ВСЕГДА ПРИВЯЗЫВАЕМ К ПОЗИЦИИ ТАНКА
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию танка
                const tankPos = this.tank.getCachedChassisPosition();
                
                // Используем начальную позицию из основной камеры для плавного перехода
                // Fallback: если начальная позиция не установлена или неправильная, используем позицию танка
                let startPos = this._aimCameraStartPos;
                // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо Vector3.Distance (быстрее)
                if (!startPos || startPos.length() < 0.1) {
                    startPos = tankPos.add(new Vector3(0, 3, -8));
                    this._aimCameraStartPos = startPos.clone();
                } else {
                    const dx = startPos.x - tankPos.x;
                    const dy = startPos.y - tankPos.y;
                    const dz = startPos.z - tankPos.z;
                    const distSq = dx * dx + dy * dy + dz * dz;
                    if (distSq > 10000) { // 100 в квадрате
                        // Если позиция слишком далеко от танка - используем позицию танка
                        startPos = tankPos.add(new Vector3(0, 3, -8));
                        // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                        this._tmpAimPos.copyFrom(startPos);
                        this._aimCameraStartPos = this._tmpAimPos.clone(); // Нужен новый объект для сохранения
                    }
                }
                
                // Easing функция для более плавного перехода (ease-in-out)
                const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                
                const newPos = Vector3.Lerp(startPos, cameraPos, easeT);
                this.aimCamera.position.copyFrom(newPos);
                
                // ИСПРАВЛЕНО: LOOK TARGET - смотрим немного ниже, чтобы ствол был виден в нижней части экрана
                const lookAtDistance = 300;
                let lookAtPos = muzzlePos.add(aimDirection.scale(lookAtDistance));
                // Смещаем target немного вниз, чтобы ствол был виден снизу по середине
                lookAtPos.y -= 0.5;
                
                // ИСПРАВЛЕНО: Плавный переход target от начального target основной камеры к target прицеливания
                const startTarget = this._aimCameraStartTarget || this.aimCamera.getTarget();
                const lerpedTarget = Vector3.Lerp(startTarget, lookAtPos, easeT);
                this.aimCamera.setTarget(lerpedTarget);
                
                // Apply camera shake
                if (this.cameraShakeIntensity > 0.01) {
                    // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                    this._tmpCameraPos.copyFrom(this.aimCamera.position);
                    this.aimCamera.position = this._tmpCameraPos.add(this.cameraShakeOffset.scale(0.4));
                }
            }
            
            // Применяем эффект тряски камеры
            this.updateCameraShake();
            
            // Плавный возврат FOV к нормальному значению для основной камеры
            if (this.camera && t < 0.99) {
                const currentFOV = this.camera.fov;
                const targetFOV = this.normalFOV;
                this.camera.fov += (targetFOV - currentFOV) * 0.2;
            }
            
            // Применяем смещение от тряски к камере
            // КРИТИЧЕСКИ ВАЖНО: Используем absolutePosition для получения актуальной позиции после обновления физики
            // ИСПРАВЛЕНО: Обновляем основную камеру только когда НЕ в режиме прицеливания
            if (t < 0.99 && this.camera && this.cameraShakeIntensity > 0.01) {
                // ИСПРАВЛЕНИЕ JITTER: Используем absolutePosition вместо кэшированной позиции
                // Кэш обновляется в onBeforePhysicsObservable, а камера в onAfterPhysicsObservable
                // Поэтому кэш содержит позицию от прошлого кадра, что вызывает дёргание
                this._tmpCameraPos.copyFrom(this.tank.chassis.absolutePosition);
                this._tmpCameraPos.y += 2;
                this.camera.position = this._tmpCameraPos.add(this.cameraShakeOffset);
            }
            
            // ИСПРАВЛЕНО: Применяем тряску только когда в режиме прицеливания (t > 0.01)
            if (t > 0.01 && this.aimCamera && this.cameraShakeIntensity > 0.01) {
                    // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                    this._tmpCameraPos.copyFrom(this.aimCamera.position);
                    this.aimCamera.position = this._tmpCameraPos.add(this.cameraShakeOffset.scale(0.5)); // Меньше тряски в режиме прицеливания
            }
            
            // Third-person smooth follow (для обычного режима, когда не в режиме прицеливания)
            if (t < 0.99 && this.camera) {
                const targetRadius = this.normalRadius;
                const targetBeta = this.normalBeta;
                this.camera.radius += (targetRadius - this.camera.radius) * 0.15;
                this.cameraBeta += (targetBeta - this.cameraBeta) * 0.15;
                this.cameraBeta = Math.max(0.2, Math.min(Math.PI / 2.2, this.cameraBeta));
                
                // Применяем тряску к основной камере
                if (this.cameraShakeIntensity > 0.01) {
                    // ОПТИМИЗАЦИЯ: Используем переиспользуемый вектор вместо clone()
                    this._tmpCameraPos.copyFrom(this.camera.position);
                    this.camera.position = this._tmpCameraPos.add(this.cameraShakeOffset);
                }
                
                // ОПТИМИЗАЦИЯ: Кэшируем toEulerAngles() - очень дорогая операция
                if (this._cachedChassisRotYFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                    this._cachedChassisRotY = this.tank.chassis.rotationQuaternion 
                        ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
                        : this.tank.chassis.rotation.y;
                    this._cachedChassisRotYFrame = this._updateTick;
                }
                const chassisRotY = this._cachedChassisRotY;
                const turretRotY = this.tank.turret.rotation.y;
                
                // Если нужно центрировать камеру (кнопка C), камера ПЛАВНО следует за башней
                if (this.shouldCenterCamera && this.isCenteringActive) {
                    // Целевой угол = угол корпуса (башня движется к 0)
                    const targetAlpha = -chassisRotY - turretRotY - Math.PI / 2;
                    
                    // Плавно сбрасываем cameraYaw к углу башни при центрировании
                    const yawLerp = 0.08;
                    this.cameraYaw += (turretRotY - this.cameraYaw) * yawLerp;
                    
                    const lerpSpeed = this.centerCameraSpeed || 0.08;
                    
                    // Нормализуем текущий угол камеры к [-PI, PI]
                    let currentAlpha = this.currentCameraAlpha;
                    while (currentAlpha > Math.PI) currentAlpha -= Math.PI * 2;
                    while (currentAlpha < -Math.PI) currentAlpha += Math.PI * 2;
                    
                    // Нормализуем целевой угол к [-PI, PI]
                    let normalizedTarget = targetAlpha;
                    while (normalizedTarget > Math.PI) normalizedTarget -= Math.PI * 2;
                    while (normalizedTarget < -Math.PI) normalizedTarget += Math.PI * 2;
                    
                    // Вычисляем разницу
                    let diff = normalizedTarget - currentAlpha;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    
                    this.currentCameraAlpha = currentAlpha + diff * lerpSpeed;
                    this.targetCameraAlpha = targetAlpha;
                    
                    // Когда башня в центре - камера и cameraYaw тоже в центре
                    if (Math.abs(turretRotY) < 0.005) {
                        this.currentCameraAlpha = -chassisRotY - Math.PI / 2;
                        this.targetCameraAlpha = this.currentCameraAlpha;
                        this.cameraYaw = 0; // Сбрасываем угол камеры
                    }
                } else {
                    // === НОВАЯ СИСТЕМА: Камера следует за мышью, башня догоняет камеру ===
                    
                    // Камера = угол корпуса + угол камеры (от мыши)
                    this.targetCameraAlpha = -chassisRotY - this.cameraYaw - Math.PI / 2;
                    
                    // Плавно интерполируем камеру
                    const cameraLerpSpeed = 0.15; // Камера реагирует быстро
                    let diff = this.targetCameraAlpha - this.currentCameraAlpha;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    this.currentCameraAlpha += diff * cameraLerpSpeed;
                    
                    // === БАШНЯ ДОГОНЯЕТ КАМЕРУ (если не Shift/freelook и не клавиатурное управление) ===
                    if (!this.isFreeLook && this.tank.turret && this.tank.chassis) {
                        // Проверяем клавиатурное управление башней (Z/X)
                        if (this.tank.isKeyboardTurretControl) {
                            // При клавиатурном управлении: камера следует за башней
                            // Синхронизируем cameraYaw с текущим положением башни
                            this.cameraYaw = this.tank.turret.rotation.y;
                            // Сбрасываем виртуальную точку при клавиатурном управлении
                            this.virtualTurretTarget = null;
                            // Отменяем центрирование при клавиатурном управлении
                            if (this.tank.isAutoCentering) {
                                this.tank.isAutoCentering = false;
                                window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                            }
                        } else if (!this.tank.isAutoCentering) {
                            // Только если не центрируемся - башня догоняет камеру
                            // ОПТИМИЗАЦИЯ: Используем кэшированный угол корпуса
                            const currentChassisRotY = this._cachedChassisRotY;
                            
                            // Обычное поведение: башня догоняет камеру
                            const targetTurretRot = this.cameraYaw;
                            const currentTurretRot = this.tank.turret.rotation.y;
                            
                            // Вычисляем разницу углов
                            let turretDiff = targetTurretRot - currentTurretRot;
                            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
                            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;
                            
                            // Скорость вращения башни (используем скорость танка)
                            const turretSpeed = this.tank.turretSpeed || 0.03;
                            
                            // Башня догоняет камеру с ограниченной скоростью
                            if (Math.abs(turretDiff) > 0.01) {
                                const rotationAmount = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), turretSpeed);
                                this.tank.turret.rotation.y += rotationAmount;
                            } else {
                                // Башня догнала камеру - сохраняем виртуальную точку (только если виртуальная фиксация включена)
                                if (this.settings.virtualTurretFixation && !this.virtualTurretTarget) {
                                    const turretRotY = this.tank.turret.rotation.y;
                                    const totalWorldAngle = currentChassisRotY + turretRotY;
                                    
                                    // Сохраняем виртуальную точку (направление башни в мировых координатах)
                                    // ОПТИМИЗАЦИЯ: Используем кэшированную позицию башни (обновляем каждые 2 кадра)
                                    if (this._cachedTurretPosFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                                        this._cachedTurretPos = this.tank.turret.getAbsolutePosition();
                                        this._cachedTurretPosFrame = this._updateTick;
                                    }
                                    const turretPos = this._cachedTurretPos;
                                    const forward = new Vector3(Math.sin(totalWorldAngle), 0, Math.cos(totalWorldAngle));
                                    this.virtualTurretTarget = turretPos.add(forward.scale(100)); // Точка на расстоянии 100 единиц
                                }
                            }
                            
                            // Если корпус повернулся и есть виртуальная точка - фиксируем башню на ней (только если виртуальная фиксация включена)
                            if (this.settings.virtualTurretFixation) {
                                const chassisRotDiff = currentChassisRotY - this.lastChassisRotation;
                                if (Math.abs(chassisRotDiff) > 0.01 && this.virtualTurretTarget) {
                                    // Вычисляем направление к виртуальной точке
                                    // ОПТИМИЗАЦИЯ: Используем кэшированную позицию башни
                                    if (this._cachedTurretPosFrame !== this._updateTick && (this._updateTick % 2 === 0)) {
                                        this._cachedTurretPos = this.tank.turret.getAbsolutePosition();
                                        this._cachedTurretPosFrame = this._updateTick;
                                    }
                                    const turretPos = this._cachedTurretPos;
                                    const toTarget = this.virtualTurretTarget.subtract(turretPos);
                                    toTarget.y = 0; // Только горизонтальная плоскость
                                    toTarget.normalize();
                                    
                                    // Вычисляем требуемый угол башни в мировых координатах
                                    const targetWorldAngle = Math.atan2(toTarget.x, toTarget.z);
                                    
                                    // Вычисляем требуемый угол башни относительно корпуса
                                    let targetTurretRot = targetWorldAngle - currentChassisRotY;
                                    
                                    // Нормализуем к [-PI, PI]
                                    while (targetTurretRot > Math.PI) targetTurretRot -= Math.PI * 2;
                                    while (targetTurretRot < -Math.PI) targetTurretRot += Math.PI * 2;
                                    
                                    // Применяем угол башни
                                    this.tank.turret.rotation.y = targetTurretRot;
                                    
                                    // Обновляем cameraYaw чтобы камера соответствовала
                                    this.cameraYaw = targetTurretRot;
                                }
                            } else {
                                // Если виртуальная фиксация отключена - сбрасываем виртуальную точку
                                if (this.virtualTurretTarget) {
                                    this.virtualTurretTarget = null;
                                }
                            }
                            
                            // Сохраняем текущий угол корпуса для следующего кадра
                            this.lastChassisRotation = currentChassisRotY;
                        }
                    }
                }
                
                this.camera.alpha = this.currentCameraAlpha;
                this.camera.beta = this.cameraBeta;
                
                // ИСПРАВЛЕНИЕ JITTER: Используем absolutePosition вместо кэшированной позиции
                // Кэш обновляется в onBeforePhysicsObservable, камера - в onAfterPhysicsObservable
                // Разница во времени обновления вызывает дёргание/мерцание танка при движении
                const tankPos = this.tank.chassis.absolutePosition;
                const lookAt = tankPos.add(new Vector3(0, 1.0, 0));
                this.camera.target.copyFrom(lookAt);
            }
        }
    }
    
    // Обновить эффект тряски камеры
    private updateCameraShake(): void {
        if (this.cameraShakeIntensity > 0.01) {
            // Генерируем случайное смещение
            this.cameraShakeTime += 0.1;
            const shakeX = (Math.random() - 0.5) * this.cameraShakeIntensity;
            const shakeY = (Math.random() - 0.5) * this.cameraShakeIntensity;
            const shakeZ = (Math.random() - 0.5) * this.cameraShakeIntensity;
            
            this.cameraShakeOffset = new Vector3(shakeX, shakeY, shakeZ);
            
            // Уменьшаем интенсивность
            this.cameraShakeIntensity *= this.cameraShakeDecay;
        } else {
            this.cameraShakeIntensity = 0;
            this.cameraShakeOffset = Vector3.Zero();
        }
    }
    
    // Добавить тряску камеры
    addCameraShake(intensity: number, _duration: number = 0.3): void {
        this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
    }
    
    // adjustCameraForCollision удалён - теперь в GameCamera
    
    // ПОКАЗАТЬ stats overlay (Tab ЗАЖАТ - пункт 13: K/D, убийства, смерти, credits)
    showStatsOverlay(): void {
        this.gameStatsOverlay.updateDependencies({
            enemyTanks: this.enemyTanks,
            enemyManager: this.enemyManager,
            playerProgression: this.playerProgression,
            currencyManager: this.currencyManager,
            experienceSystem: this.experienceSystem,
            realtimeStatsTracker: this.realtimeStatsTracker,
            multiplayerManager: this.multiplayerManager,
            isMultiplayer: this.isMultiplayer,
            currentMapType: this.currentMapType
        });
        this.gameStatsOverlay.show();
    }
    
    // СКРЫТЬ stats overlay (Tab ОТПУЩЕН)
    hideStatsOverlay(): void {
        this.gameStatsOverlay.hide();
    }
    
    // === ПУНКТ 14 & 15: Проверка видимости танка и плавная работа камеры ===
    // Состояние видимости танка перенесено в GameVisibility
    
    
    // updateEnemyTurretsVisibility удалён - теперь в GameVisibility
    
    // updateStatsOverlay удалён - теперь в GameStatsOverlay модуле
    
    updateHUD() {
        if (!this.hud || !this.tank) return;
        
        // КРИТИЧНО: ОПТИМИЗАЦИЯ - Ограничиваем до 8 ближних врагов для производительности
        const MAX_HUD_ENEMIES = 8;
        const MAX_HUD_DISTANCE_SQ = 64000; // 250м в квадрате
        
        // Get all enemy positions with turret rotation info (ЗАЩИТА от null)
        // ОПТИМИЗАЦИЯ: Используем кэш из GameUpdate, ограничиваем количество врагов
        let tankPositions: Array<{x: number, z: number, alive: boolean, turretRotation: number}> = [];
        let turretEnemies: Array<{x: number, z: number, alive: boolean, turretRotation?: number}> = [];
        
        // Получаем кэшированные позиции из GameUpdate
        const cachedEnemies = this.gameUpdate?.getCachedEnemyPositions() || [];
        
        // ОПТИМИЗАЦИЯ: Обрабатываем только ближних врагов (максимум 8)
        if (this.enemyTanks && this.enemyTanks.length > 0 && cachedEnemies.length > 0) {
            const playerPos = this.tank.chassis?.position;
            const enemyDistances: Array<{enemy: any, distSq: number, index: number}> = [];
            
            // Собираем ближних врагов с расстояниями
            const enemyCount = Math.min(this.enemyTanks.length, cachedEnemies.length);
            for (let i = 0; i < enemyCount; i++) {
                const t = this.enemyTanks[i];
                if (!t || !t.isAlive || !t.chassis || t.chassis.isDisposed()) continue;
                
                const cached = cachedEnemies[i];
                if (!cached || !cached.alive) continue;
                
                // Вычисляем расстояние до игрока
                if (playerPos) {
                    const dx = cached.x - playerPos.x;
                    const dz = cached.z - playerPos.z;
                    const distSq = dx * dx + dz * dz;
                    
                    // Только ближние враги
                    if (distSq <= MAX_HUD_DISTANCE_SQ) {
                        enemyDistances.push({ enemy: t, distSq, index: i });
                    }
                }
            }
            
            // Сортируем по расстоянию и берем ближайших
            enemyDistances.sort((a, b) => a.distSq - b.distSq);
            const nearestEnemies = enemyDistances.slice(0, MAX_HUD_ENEMIES);
            
            // Обрабатываем только ближайших врагов
            for (const { enemy: t, index } of nearestEnemies) {
                try {
                    // КРИТИЧНО: Используем кэшированный chassisRotY из updateEnemyPositionsCache
                    // Это избегает дорогого toEulerAngles() вызова
                    const cached = cachedEnemies[index];
                    const chassisRotY = cached.chassisRotY ?? (t.chassis.rotationQuaternion 
                        ? t.chassis.rotationQuaternion.toEulerAngles().y 
                        : t.chassis.rotation.y);
                    const turretRotY = t.turret ? t.turret.rotation.y : 0;
                    const absoluteTurretAngle = chassisRotY + turretRotY;
                    
                    tankPositions.push({
                        x: cached.x,
                        z: cached.z,
                        alive: true,
                        turretRotation: absoluteTurretAngle
                    });
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
        }
        
        // ОПТИМИЗАЦИЯ: Получаем позиции турелей (только ближние, ограниченное количество)
        const turretPositions = this.enemyManager?.getEnemyPositions() || [];
        const turretCount = Math.min(turretPositions.length, 5); // Максимум 5 турелей
        for (let i = 0; i < turretCount; i++) {
            const pos = turretPositions[i];
            if (!pos || !pos.alive) continue;
            turretEnemies.push({
                x: pos.x,
                z: pos.z,
                alive: true,
                turretRotation: undefined
            });
        }
        
        // ИСПРАВЛЕНО: Добавляем сетевых игроков в список врагов для радара
        const networkEnemies: Array<{x: number, z: number, alive: boolean, turretRotation: number}> = [];
        if (this.networkPlayerTanks && this.networkPlayerTanks.size > 0) {
            this.networkPlayerTanks.forEach((tank, playerId) => {
                if (!tank || !tank.chassis || !tank.networkPlayer) return;
                
                // Проверяем статус игрока
                if (tank.networkPlayer.status !== "alive") return;
                
                // Получаем позицию
                const pos = tank.chassis.position;
                
                // Вычисляем абсолютный угол башни
                let chassisRotY = 0;
                if (tank.chassis.rotationQuaternion) {
                    chassisRotY = tank.chassis.rotationQuaternion.toEulerAngles().y;
                } else {
                    chassisRotY = tank.chassis.rotation.y;
                }
                const turretRotY = tank.turret ? tank.turret.rotation.y : 0;
                const absoluteTurretAngle = chassisRotY + turretRotY;
                
                networkEnemies.push({
                    x: pos.x,
                    z: pos.z,
                    alive: true,
                    turretRotation: absoluteTurretAngle
                });
            });
        }
        
        const allEnemies = [...turretEnemies, ...tankPositions, ...networkEnemies];
        
        // КРИТИЧЕСКИ ВАЖНО: Передаём позицию и направление БАШНИ игрока для правильного обновления радара!
        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
        const playerPos = this.tank.getCachedChassisPosition();
        // Получаем угол поворота корпуса танка
        const tankRotation = this.tank.chassis.rotationQuaternion 
            ? this.tank.chassis.rotationQuaternion.toEulerAngles().y 
            : this.tank.chassis.rotation.y;
        // Получаем угол поворота БАШНИ танка (для ориентации радара)
        const turretRelativeRotation = this.tank.turret ? this.tank.turret.rotation.y : 0;
        // АБСОЛЮТНЫЙ угол башни игрока = корпус + башня
        const absoluteTurretRotation = tankRotation + turretRelativeRotation;
        // Передаём флаг режима прицеливания для отображения линии обзора
        this.hud.updateMinimap(allEnemies, playerPos, tankRotation, absoluteTurretRotation, this.isAiming);
        
        // Обновляем скорость и координаты под радаром
        if (this.tank.physicsBody) {
            const velocity = this.tank.physicsBody.getLinearVelocity();
            const speed = velocity ? velocity.length() : 0;
            this.hud.setSpeed(speed);
        }
        this.hud.setPosition(playerPos.x, playerPos.z, playerPos.y);
        
        // Обновляем угол наклона ствола (aimPitch в радианах -> градусы)
        if (this.tank.aimPitch !== undefined) {
            const barrelAngleDegrees = (this.tank.aimPitch * 180) / Math.PI;
            this.hud.setBarrelAngle(barrelAngleDegrees);
        }
        
        // Обновляем полную карту (если открыта)
        if (this.hud.isFullMapVisible()) {
            this.hud.updateFullMap(playerPos, absoluteTurretRotation, allEnemies);
        }

        // ИСПРАВЛЕНИЕ: Обновляем блок состояния танка (здоровье, топливо, броня)
        if (this.hud && this.tank) {
            const health = this.tank.currentHealth || 0;
            const maxHealth = this.tank.maxHealth || 100;
            const fuel = this.tank.currentFuel || 100;
            const maxFuel = this.tank.maxFuel || 100;
            const armor = (this.tank as any).currentArmor || 0;
            if (this.hud) {
                this.hud.updateTankStatus(health, maxHealth, fuel, maxFuel, armor);
            }
        }
        
        // Enemy health summary (tanks + turrets) - С ЗАЩИТОЙ от null
        let enemyHp = 0;
        let enemyCount = 0;
        if (this.enemyTanks && this.enemyTanks.length > 0) {
            const tankCount = this.enemyTanks.length;
            for (let i = 0; i < tankCount; i++) {
                const t = this.enemyTanks[i];
                if (t && t.isAlive) {
                    enemyHp += t.currentHealth || 0;
                    enemyCount += 1;
                }
            }
        }
        if (this.enemyManager && this.enemyManager.turrets) {
            const turretCount = this.enemyManager.turrets.length;
            for (let i = 0; i < turretCount; i++) {
                const t = this.enemyManager.turrets[i];
                if (t && t.isAlive) {
                    enemyHp += t.health || 0;
                    enemyCount += 1;
                }
            }
        }
        if (this.hud) {
            this.hud.setEnemyHealth(enemyHp, enemyCount);
        }

        // Aim-highlight enemy HP when looking at them (ОПТИМИЗИРОВАНО)
        // Вызываем реже - каждые 3 кадра
        if (this._updateTick % 3 === 0) {
        this.updateEnemyLookHP();
        }
        
        // Update compass direction - ПРИВЯЗАН К БАШНЕ ТАНКА
        // КРИТИЧЕСКИ ВАЖНО: Компас показывает направление БАШНИ, а не корпуса!
        if (this.tank.turret) {
            // Получаем угол корпуса (абсолютный угол в мировых координатах)
            let chassisY = 0;
            if (this.tank.chassis.rotationQuaternion) {
                chassisY = this.tank.chassis.rotationQuaternion.toEulerAngles().y;
            } else {
                chassisY = this.tank.chassis.rotation.y;
            }
            
            // Получаем угол башни (относительно корпуса)
            let turretY = this.tank.turret.rotation.y;
            
            // Нормализуем углы к диапазону [-π, π]
            while (turretY > Math.PI) turretY -= Math.PI * 2;
            while (turretY < -Math.PI) turretY += Math.PI * 2;
            while (chassisY > Math.PI) chassisY -= Math.PI * 2;
            while (chassisY < -Math.PI) chassisY += Math.PI * 2;
            
            // Общий угол = угол корпуса + угол башни (абсолютное направление башни)
            let totalAngle = chassisY + turretY;
            
            // Нормализуем к диапазону [0, 2π] для компаса
            while (totalAngle < 0) totalAngle += Math.PI * 2;
            while (totalAngle >= Math.PI * 2) totalAngle -= Math.PI * 2;
            
            // Используем общий угол для компаса (направление башни)
            this.hud.setDirection(totalAngle);
            
            // ИСПРАВЛЕНО: Обновляем индикатор направления башни над радаром
            this.hud.setMovementDirection(totalAngle);
            
            // Обновляем красные точки врагов на компасе
            // ОПТИМИЗАЦИЯ: Используем кэшированные позиции и обновляем реже (каждые 3 кадра)
            if (this._updateTick % 3 === 0) {
                // ОПТИМИЗАЦИЯ: Используем кэшированные позиции из GameUpdate
                const cachedEnemies = this.gameUpdate?.getCachedEnemyPositions() || [];
                const playerPos = this.tank.getCachedChassisPosition();
                this.hud.updateCompassEnemies(cachedEnemies, playerPos, totalAngle);
            }
        } else if (this.tank.chassis) {
            // Fallback: если башни нет, используем корпус
            let chassisY = 0;
            if (this.tank.chassis.rotationQuaternion) {
                chassisY = this.tank.chassis.rotationQuaternion.toEulerAngles().y;
            } else {
                chassisY = this.tank.chassis.rotation.y;
            }
            
            // Нормализуем к диапазону [0, 2π]
            while (chassisY < 0) chassisY += Math.PI * 2;
            while (chassisY >= Math.PI * 2) chassisY -= Math.PI * 2;
            
            this.hud.setDirection(chassisY);
            
            // ИСПРАВЛЕНО: Обновляем индикатор направления башни над радаром (fallback на корпус)
            this.hud.setMovementDirection(chassisY);
        }
        
        // Update enemy count
        // ОПТИМИЗАЦИЯ: Используем for цикл вместо filter и обновляем реже
        if (this._updateTick % 3 === 0) {
            let aliveCount = 0;
            if (this.enemyTanks && this.enemyTanks.length > 0) {
                const enemyCount = this.enemyTanks.length;
                for (let i = 0; i < enemyCount; i++) {
                    const t = this.enemyTanks[i];
                    if (t && t.isAlive) aliveCount++;
                }
            }
            if (this.enemyManager) {
                aliveCount += this.enemyManager.getAliveCount();
            }
            this.hud.setEnemyCount(aliveCount);
        }
        
        // Update nearest enemy distance
        // ОПТИМИЗАЦИЯ: Используем квадрат расстояния и обновляем реже
        if (this._updateTick % 3 === 0) {
            let nearestDistanceSq = Infinity;
            const playerPos = this.tank.getCachedChassisPosition();
            const allEnemiesCount = allEnemies.length;
            for (let i = 0; i < allEnemiesCount; i++) {
                const enemy = allEnemies[i];
                if (!enemy) continue;
                
                // ОПТИМИЗАЦИЯ: Используем квадрат расстояния вместо sqrt
                let dx: number, dz: number;
                if (enemy instanceof Vector3) {
                    dx = enemy.x - playerPos.x;
                    dz = enemy.z - playerPos.z;
                } else if ('x' in enemy && 'z' in enemy) {
                    dx = enemy.x - playerPos.x;
                    dz = enemy.z - playerPos.z;
                } else {
                    continue;
                }
                const distSq = dx * dx + dz * dz;
                if (distSq < nearestDistanceSq) {
                    nearestDistanceSq = distSq;
                }
            }
            if (nearestDistanceSq < Infinity) {
                const nearestDistance = Math.sqrt(nearestDistanceSq);
                this.hud.setNearestEnemyDistance(nearestDistance);
            } else {
                this.hud.setNearestEnemyDistance(0);
            }
        }
        
        // FPS теперь обновляется каждый кадр в методе update() для точности и плавности
        // Здесь только остальные элементы HUD
        
        // ОПТИМИЗАЦИЯ: Обновление прогресса прогрузки карты (каждые 2 кадра)
        if (this._updateTick % 2 === 0 && this.chunkSystem && this.hud) {
            try {
                const progress = this.chunkSystem.getLoadingProgress();
                this.hud.updateMapLoadingProgress(progress);
            } catch (e) {
                // Игнорируем ошибки
            }
        }
        
        // Update debug dashboard (обновляем всегда, даже если танка нет - для отображения сцены)
        if (this.debugDashboard) {
            if (this.tank && this.tank.chassis) {
                // ОПТИМИЗАЦИЯ: Используем кэшированную позицию вместо absolutePosition
                const tankPos = this.tank.getCachedChassisPosition();
                this.debugDashboard.update({ x: tankPos.x, y: tankPos.y, z: tankPos.z });
            } else {
                // Если танка нет, обновляем с нулевой позицией
                this.debugDashboard.update({ x: 0, y: 0, z: 0 });
            }
        }
        
        // Update tank stats with experience data
        if (this.tank) {
            const chassisType = this.tank.chassisType?.name || "Standard";
            const cannonType = this.tank.cannonType?.name || "Standard";
            const damage = this.tank.damage || 50;
            const fireRate = this.tank.cooldown || 2500;
            const speed = this.tank.moveSpeed || 10;
            const maxHealth = this.tank.maxHealth || 100;
            
            // Get experience data
            let chassisLevel = 1, chassisXp = 0, chassisXpToNext = 100, chassisTitle = "Recruit", chassisTitleColor = "#888";
            let cannonLevel = 1, cannonXp = 0, cannonXpToNext = 100, cannonTitle = "Novice", cannonTitleColor = "#888";
            let armor = 0;
            
            if (this.experienceSystem && this.tank.chassisType && this.tank.cannonType) {
                // Chassis experience
                const chassisExp = this.experienceSystem.getChassisExperience(this.tank.chassisType.id);
                if (chassisExp) {
                    chassisLevel = chassisExp.level;
                    const progressData = this.experienceSystem.getExperienceToNextLevel(chassisExp);
                    chassisXp = progressData.current;
                    chassisXpToNext = progressData.required;
                    const levelInfo = this.experienceSystem.getLevelInfo(this.tank.chassisType.id, "chassis");
                    if (levelInfo) {
                        chassisTitle = levelInfo.title;
                        chassisTitleColor = levelInfo.titleColor;
                        armor = levelInfo.armorBonus || 0;
                    }
                }
                
                // Cannon experience
                const cannonExp = this.experienceSystem.getCannonExperience(this.tank.cannonType.id);
                if (cannonExp) {
                    cannonLevel = cannonExp.level;
                    const progressData = this.experienceSystem.getExperienceToNextLevel(cannonExp);
                    cannonXp = progressData.current;
                    cannonXpToNext = progressData.required;
                    const levelInfo = this.experienceSystem.getLevelInfo(this.tank.cannonType.id, "cannon");
                    if (levelInfo) {
                        cannonTitle = levelInfo.title;
                        cannonTitleColor = levelInfo.titleColor;
                    }
                }
            }
            
            this.hud.setTankStats(
                chassisType, cannonType, armor, damage, fireRate,
                chassisLevel, chassisXp, chassisXpToNext, chassisTitle, chassisTitleColor,
                cannonLevel, cannonXp, cannonXpToNext, cannonTitle, cannonTitleColor,
                speed, maxHealth
            );
        }
        
        // Центральная шкала опыта теперь обновляется через события onExperienceChanged
        // (подписка настроена в setPlayerProgression для HUD)
    }

    private updateEnemyLookHP() {
        if (!this.tank || !this.tank.barrel) return;
        
        // === HP ПРОТИВНИКА ПРИ НАВЕДЕНИИ СТВОЛА (не камеры!) ===
        // Получаем направление ствола и создаём луч от ствола
        const barrelPos = this.tank.barrel.getAbsolutePosition();
        const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();
        const ray = new Ray(barrelPos, barrelDir, 100);
        
        // Используем pickWithRay для raycast от ствола
        const pick = this.scene.pickWithRay(ray);
        
        // Hide all labels by default
        // ОПТИМИЗАЦИЯ: Используем кэшированную позицию
        const playerPos = this.tank && this.tank.chassis ? this.tank.getCachedChassisPosition() : undefined;
        // ОПТИМИЗАЦИЯ: Используем обычный for цикл вместо forEach
        const enemyCount = this.enemyTanks.length;
        for (let i = 0; i < enemyCount; i++) {
            const enemy = this.enemyTanks[i];
            if (enemy) enemy.setHpVisible(false, playerPos);
        }
        if (this.enemyManager) {
            const turrets = this.enemyManager.turrets;
            const turretCount = turrets.length;
            for (let i = 0; i < turretCount; i++) {
                const turret = turrets[i];
                if (turret) turret.setHpVisible(false);
            }
        }
        
        // ИСПРАВЛЕНО: По умолчанию скрываем HUD индикатор цели
        // Он будет показан только когда враг строго на линии огня
        let targetFound = false;
        
        if (pick && pick.hit && pick.pickedMesh) {
            const pickedMesh = pick.pickedMesh as any; // Приведение типа для isPartOf
            // Check enemy tanks
            const tank = this.enemyTanks.find(et => et.isPartOf && et.isPartOf(pickedMesh));
            if (tank) {
                tank.setHpVisible(true, playerPos);
                // ИСПРАВЛЕНО: Показываем HUD индикатор только при точном попадании raycast
                if (this.hud && playerPos) {
                    const enemyPos = tank.chassis?.getAbsolutePosition();
                    const distance = enemyPos ? Vector3.Distance(playerPos, enemyPos) : 0;
                    this.hud.setTargetInfo({
                        name: tank.name || "Enemy Tank",
                        health: tank.currentHealth || 0,
                        maxHealth: tank.maxHealth || 100,
                        distance: distance,
                        type: "enemy"
                    });
                    targetFound = true;
                }
                return;
            }
            // Check turrets
            if (this.enemyManager) {
                const turret = this.enemyManager.turrets.find(tr => tr.isPartOf && tr.isPartOf(pickedMesh));
                if (turret) {
                    turret.setHpVisible(true);
                    // ИСПРАВЛЕНО: Показываем HUD индикатор только при точном попадании raycast
                    if (this.hud && playerPos) {
                        const turretPos = turret.base?.getAbsolutePosition();
                        const distance = turretPos ? Vector3.Distance(playerPos, turretPos) : 0;
                        this.hud.setTargetInfo({
                            name: turret.name || "Turret",
                            health: turret.health || 0,
                            maxHealth: turret.maxHealth || 100,
                            distance: distance,
                            type: "enemy"
                        });
                        targetFound = true;
                    }
                    return;
                }
            }
        }
        
        // ИСПРАВЛЕНО: HP bar врага показывается ТОЛЬКО при точном попадании raycast
        // Backup проверка по близости удалена - только прямое попадание
        
        // ИСПРАВЛЕНО: Если цель не найдена, скрываем HUD индикатор
        if (!targetFound && this.hud) {
            this.hud.setTargetInfo(null);
        }
    }
    
    // === MULTIPLAYER METHODS ===
    // setupMultiplayerCallbacks перенесён в GameMultiplayerCallbacks модуль
    
    // Все мультиплеерные колбэки перенесены в GameMultiplayerCallbacks модуль
    
    private createNetworkPlayerTank(playerData: any): void {
        if (this.networkPlayerTanks.has(playerData.id)) {
            return; // Already exists
        }
        
        const networkPlayer = this.multiplayerManager?.getNetworkPlayer(playerData.id);
        if (!networkPlayer) {
            console.warn(`[Game] Cannot create network tank: NetworkPlayer ${playerData.id} not found`);
            return;
        }
        
        try {
            const tank = new NetworkPlayerTank(this.scene, networkPlayer);
            // Store reference to multiplayerManager for RTT access
            (tank as any).multiplayerManager = this.multiplayerManager;
            this.networkPlayerTanks.set(playerData.id, tank);
            
            // Убеждаемся, что танк видим
            if (tank.chassis) {
                tank.chassis.isVisible = true;
                tank.chassis.setEnabled(true);
            }
            if (tank.turret) {
                tank.turret.isVisible = true;
                tank.turret.setEnabled(true);
            }
            if (tank.barrel) {
                tank.barrel.isVisible = true;
                tank.barrel.setEnabled(true);
            }
            
            console.log(`%c[Game] ✅ Сетевой танк создан: ${playerData.name || playerData.id}`, 'color: #4ade80; font-weight: bold;');
            console.log(`%cПозиция: (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`, 'color: #a78bfa;');
            console.log(`%cВсего сетевых игроков: ${this.networkPlayerTanks.size}`, 'color: #a78bfa;');
        } catch (error) {
            console.error(`[Game] Ошибка создания сетевого танка для ${playerData.id}:`, error);
        }
    }
    
    private updateMultiplayer(deltaTime: number): void {
        if (!this.multiplayerManager || !this.tank) return;
        
        // Send player input to server
        if (this.tank.chassis && this.tank.physicsBody) {
            // Get input from tank controller
            const throttle = this.tank.throttleTarget || 0;
            const steer = this.tank.steerTarget || 0;
            const turretRotation = this.tank.turret.rotation.y;
            const aimPitch = this.tank.aimPitch || 0;
            
            this.multiplayerManager.sendPlayerInput({
                throttle,
                steer,
                turretRotation,
                aimPitch,
                isShooting: false, // Will be sent separately on shoot
                timestamp: Date.now()
            });
        }
        
        // Update network player tanks
        if (this.networkPlayerTanks.size > 0) {
            this.networkPlayerTanks.forEach((tank, playerId) => {
                try {
                    if (tank && tank.update) {
                        tank.update(deltaTime);
                    } else {
                        console.warn(`[Game] Network player tank ${playerId} is invalid or missing update method`);
                    }
                } catch (error) {
                    console.error(`[Game] Error updating network player tank ${playerId}:`, error);
                }
            });
        } else {
            // DEBUG: Log when no network tanks exist (только раз в секунду, чтобы не спамить)
            if (this._updateTick % 60 === 0) {
                const networkPlayersCount = this.multiplayerManager?.getNetworkPlayers()?.size || 0;
                if (networkPlayersCount > 0 && this.isMultiplayer) {
                    console.warn(`[Game] ⚠️ No network player tanks created, but ${networkPlayersCount} network players exist!`);
                    console.warn(`[Game] Попытка создать танки через processPendingNetworkPlayers...`);
                    // Попытаемся создать танки еще раз
                    if (this.gameMultiplayerCallbacks) {
                        this.gameMultiplayerCallbacks.processPendingNetworkPlayers();
                    }
                }
            }
        }
        
        // Update multiplayer HUD every 10 frames (~6 times per second)
        if (this._updateTick % 10 === 0 && this.hud) {
            const cachedPlayers = (this.multiplayerManager as any).lastPlayerStates || [];
            const localPlayerId = this.multiplayerManager.getPlayerId();
            
            if (cachedPlayers.length > 0) {
                // Update real-time stats tracker
                if (this.realtimeStatsTracker) {
                    this.realtimeStatsTracker.updatePlayerStats(cachedPlayers.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        kills: p.kills || 0,
                        deaths: p.deaths || 0,
                        score: p.score || 0,
                        team: p.team,
                        status: p.status,
                        damageDealt: p.damageDealt,
                        damageTaken: p.damageTaken
                    })));
                }
                
                // Record player states for replay
                if (this.replayRecorder) {
                    this.replayRecorder.recordPlayerStates(cachedPlayers.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        position: new Vector3(p.position.x, p.position.y, p.position.z),
                        rotation: p.rotation || 0,
                        turretRotation: p.turretRotation || 0,
                        aimPitch: p.aimPitch || 0,
                        health: p.health || 100,
                        maxHealth: p.maxHealth || 100,
                        status: p.status || "alive",
                        team: p.team,
                        kills: p.kills || 0,
                        deaths: p.deaths || 0,
                        score: p.score || 0
                    })));
                }
                
                // Calculate team scores
                let team0Score = 0;
                let team1Score = 0;
                const playerList: Array<{
                    id: string;
                    name: string;
                    kills: number;
                    deaths: number;
                    score: number;
                    team?: number;
                    isAlive: boolean;
                }> = [];
                
                cachedPlayers.forEach((player: any) => {
                    if (player.team === 0) {
                        team0Score += player.score || 0;
                    } else if (player.team === 1) {
                        team1Score += player.score || 0;
                    }
                    
                    playerList.push({
                        id: player.id,
                        name: player.name,
                        kills: player.kills || 0,
                        deaths: player.deaths || 0,
                        score: player.score || 0,
                        team: player.team,
                        isAlive: player.status === "alive"
                    });
                });
                
                // Update score display
                const gameMode = this.multiplayerManager.getGameMode() || "ffa";
                this.hud.updateMultiplayerScore?.(team0Score, team1Score, gameMode);
                
                // Update player list
                this.hud.updatePlayerList?.(playerList, localPlayerId || "");
                
                // Update minimap players
                if (this.tank && this.tank.chassis) {
                    const localPos = this.tank.chassis.position;
                    const minimapPlayers = cachedPlayers
                        .filter((p: any) => p.position)
                        .map((p: any) => ({
                            id: p.id,
                            position: { x: p.position.x, z: p.position.z },
                            team: p.team
                        }));
                    this.hud.updateMinimapPlayers?.(minimapPlayers, { x: localPos.x, z: localPos.z }, localPlayerId || "");
                }
            }
        }
        
        // Update match timer every second
        if (this._updateTick % 60 === 0 && this.hud) {
            const gameTime = this.multiplayerManager.getGameTime() || 0;
            this.hud.updateMatchTimer?.(gameTime);
        }
        
        // Send client metrics to server periodically (every 5 seconds)
        const now = Date.now();
        if (this.metricsCollector && now - this.lastMetricsSendTime >= this.METRICS_SEND_INTERVAL) {
            try {
                const metrics = this.metricsCollector.collect();
                // Add FPS to metrics
                const fps = Math.round(this.engine.getFps());
                
                // Convert ExtendedMetrics to ClientMetricsData
                const clientMetrics: ClientMetricsData = {
                    ...metrics,
                    fps
                };
                
                this.multiplayerManager.sendClientMetrics(clientMetrics);
                this.lastMetricsSendTime = now;
            } catch (error) {
                logger.warn("[Game] Failed to send client metrics:", error);
            }
        }
        
        // Handle Tab key for stats (toggle player list)
        if (this._updateTick % 5 === 0) { // Check every 5 frames
            // Tab key handling would be in input system
        }
    }
    
    toggleMultiplayerStats(): void {
        if (this.hud && this.isMultiplayer) {
            this.hud.togglePlayerList?.();
        }
    }
    
    // Public API for multiplayer
    enableMultiplayer(serverUrl?: string): void {
        if (this.multiplayerManager) {
            if (serverUrl) {
                this.multiplayerManager.disconnect();
                this.multiplayerManager.connect(serverUrl);
            }
            this.isMultiplayer = true;
        }
    }
    
    disableMultiplayer(): void {
        this.isMultiplayer = false;
        if (this.multiplayerManager) {
            this.multiplayerManager.leaveRoom();
        }
        this.networkPlayerTanks.forEach(tank => tank.dispose());
        this.networkPlayerTanks.clear();
    }
    
    createMultiplayerRoom(mode: string, maxPlayers: number = 32): boolean {
        if (this.multiplayerManager) {
            return this.multiplayerManager.createRoom(mode as any, maxPlayers);
        }
        console.warn("[Game] Cannot create room: multiplayerManager not initialized");
        return false;
    }
    
    joinMultiplayerRoom(roomId: string): void {
        if (this.multiplayerManager) {
            this.multiplayerManager.joinRoom(roomId);
        }
    }
    
    quickPlayMultiplayer(mode: string, region?: string): void {
        if (this.multiplayerManager) {
            // Ensure connection before quick play
            if (!this.multiplayerManager.isConnected()) {
                // Используем текущий serverUrl или автоматически определяем его
                const serverUrl = this.multiplayerManager.getServerUrl();
                this.multiplayerManager.connect(serverUrl);
                // Retry after connection is established (with timeout)
                const retryTimeout = setTimeout(() => {
                    if (this.multiplayerManager && this.multiplayerManager.isConnected()) {
                        this.multiplayerManager.quickPlay(mode as any, region);
                    } else {
                        logger.warn("[Game] Failed to connect to multiplayer server for quick play");
                    }
                }, 1000);
                // Also try immediately after a short delay (in case already connecting)
                setTimeout(() => {
                    if (this.multiplayerManager && this.multiplayerManager.isConnected()) {
                        clearTimeout(retryTimeout);
                        this.multiplayerManager.quickPlay(mode as any, region);
                    }
                }, 100);
                return;
            }
            this.multiplayerManager.quickPlay(mode as any, region);
        }
    }
    
    // === SPECTATOR MODE ===
    
    enterSpectatorMode(): void {
        if (!this.isMultiplayer || !this.multiplayerManager) return;
        
        this.isSpectating = true;
        
        // Find first alive player to spectate
        const networkPlayers = Array.from(this.multiplayerManager.getNetworkPlayers().values());
        const alivePlayer = networkPlayers.find(p => p.status === "alive");
        
        if (alivePlayer) {
            this.spectatingPlayerId = alivePlayer.id;
        } else {
            // No alive players, use free camera
            this.spectatingPlayerId = null;
        }
        
        logger.log("[Game] Entered spectator mode");
    }
    
    exitSpectatorMode(): void {
        this.isSpectating = false;
        this.spectatingPlayerId = null;
        logger.log("[Game] Exited spectator mode");
    }
    
    switchSpectatorTarget(next: boolean = true): void {
        if (!this.isMultiplayer || !this.multiplayerManager) return;
        
        const networkPlayers = Array.from(this.multiplayerManager.getNetworkPlayers().values())
            .filter(p => p.status === "alive");
        
        if (networkPlayers.length === 0) {
            this.spectatingPlayerId = null;
            return;
        }
        
        const currentIndex = this.spectatingPlayerId 
            ? networkPlayers.findIndex(p => p.id === this.spectatingPlayerId)
            : -1;
        
        let nextIndex: number;
        if (next) {
            nextIndex = (currentIndex + 1) % networkPlayers.length;
        } else {
            nextIndex = currentIndex <= 0 ? networkPlayers.length - 1 : currentIndex - 1;
        }
        
        const nextPlayer = networkPlayers[nextIndex];
        if (!nextPlayer) {
            this.spectatingPlayerId = null;
            return;
        }
        
        this.spectatingPlayerId = nextPlayer.id;
    }
    
    private updateSpectatorCamera(): void {
        if (!this.camera) return;
        
        if (this.spectatingPlayerId) {
            // Follow specific player
            const networkPlayer = this.multiplayerManager?.getNetworkPlayer(this.spectatingPlayerId);
            if (networkPlayer && networkPlayer.status === "alive") {
                const targetPos = networkPlayer.position;
                this.camera.setTarget(targetPos);
                this.camera.alpha = networkPlayer.rotation + Math.PI / 2;
                this.camera.beta = this.cameraBeta;
                this.camera.radius = this.settings.cameraDistance;
            } else {
                // Player died, switch to next
                this.switchSpectatorTarget(true);
            }
        } else {
            // Free camera mode - allow manual control
            // Camera controls already work, just don't follow tank
        }
    }
    
    checkSpectatorMode(): void {
        if (!this.isMultiplayer || !this.tank) return;
        
        // Enter spectator mode if player died
        if (!this.tank.isAlive && !this.isSpectating) {
            this.enterSpectatorMode();
        }
        
        // Exit spectator mode if player respawned
        if (this.tank.isAlive && this.isSpectating) {
            this.exitSpectatorMode();
        }
    }
    
    // === FIREBASE INTEGRATION ===
    
    // Открыть панель настроек скриншотов
    private async ensureChatSystem(): Promise<void> {
        if (this.chatSystem) {
            return; // Already initialized
        }
        
        logger.warn("[Game] ChatSystem not initialized, attempting to initialize...");
        try {
            // ChatSystem is already imported, but we need to create it
            this.chatSystem = new ChatSystem(this.scene);
            this.chatSystem.setGame(this);
            if (this.soundManager) {
                this.chatSystem.setSoundManager(this.soundManager);
            }
            logger.log("[Game] ChatSystem initialized successfully");
        } catch (error) {
            logger.error("[Game] Failed to initialize ChatSystem:", error);
            throw error;
        }
    }
    
    private async openScreenshotPanel(): Promise<void> {
        
        try {
            // Ленивая загрузка ScreenshotManager и панели
            if (!this.screenshotManager) {
                logger.log("[Game] Loading screenshot manager (Ctrl+2)...");
                
                const { ScreenshotManager } = await import("./screenshotManager");
                this.screenshotManager = new ScreenshotManager(this.engine, this.scene, this.hud || null);
                logger.log("[Game] Screenshot manager loaded successfully");
            }
            
            if (!this.screenshotPanel) {
                logger.log("[Game] Loading screenshot panel (Ctrl+2)...");
                
                const { ScreenshotPanel } = await import("./screenshotPanel");
                this.screenshotPanel = new ScreenshotPanel(this.screenshotManager, this);
                logger.log("[Game] Screenshot panel loaded successfully");
            }
            
            
            this.screenshotPanel.toggle();
            logger.log("[Game] Screenshot panel toggled");
        } catch (error) {
            
            logger.error("[Game] Failed to open screenshot panel:", error);
            if (this.hud) {
                this.hud.showMessage("Failed to load Screenshot Panel", "#f00", 3000);
            }
        }
    }

    // === MAP EDITOR HELPERS ===
    private async openMapEditorInternal(): Promise<void> {
        if (!this.gameStarted) {
            logger.warn("[Game] Cannot open Map Editor: game not started");
            return;
        }
        if (!this.chunkSystem) {
            logger.warn("[Game] Cannot open Map Editor: chunkSystem is not ready");
            return;
        }

        try {
            if (!this.mapEditor) {
                logger.log("[Game] Loading map editor...");
                const { MapEditor } = await import("./mapEditor");
                this.mapEditor = new MapEditor(this.scene);
                this.mapEditor.chunkSystem = this.chunkSystem; // Передаем chunkSystem для доступа к террейну
            }

            if (typeof this.mapEditor.isEditorActive === "function" && this.mapEditor.isEditorActive()) {
                this.mapEditor.close();
                logger.log("[Game] Map editor closed");
            } else if (typeof this.mapEditor.open === "function") {
                this.mapEditor.open();
                logger.log("[Game] Map editor opened");
            }
        } catch (error) {
            logger.error("[Game] Failed to open map editor:", error);
            if (this.hud) {
                this.hud.showMessage("Failed to load Map Editor", "#f00", 3000);
            }
            this.mapEditor = undefined;
        }
    }

    public async openMapEditorFromMenu(): Promise<void> {
        try {
            // Инициализируем игру и запускаем, если ещё не запущена
            if (!this.gameInitialized) {
                logger.debug(`[Game] Initializing game for Map Editor with map type: ${this.currentMapType}`);
                await this.init();
                this.gameInitialized = true;
                logger.log("[Game] Game initialized for Map Editor");
            }
            if (!this.gameStarted) {
                this.startGame();
            }

            await this.openMapEditorInternal();
        } catch (error) {
            logger.error("[Game] Failed to open Map Editor from menu:", error);
            if (this.hud) {
                this.hud.showMessage("Failed to open Map Editor", "#f00", 3000);
            }
        }
    }
    
    // saveMatchStatistics удалён - теперь в GamePersistence
    
    // ═══════════════════════════════════════════════════════════════════════════
    // АВТОСОХРАНЕНИЕ ПРИ ЗАКРЫТИИ СТРАНИЦЫ
    // ═══════════════════════════════════════════════════════════════════════════
    
    // setupAutoSaveOnUnload удалён - теперь вызывается в GamePersistence.initialize()
    
    // Централизованный метод для сохранения всех данных игры
    public saveAllGameData(): void {
        this.gamePersistence.saveAllGameData();
    }
}




