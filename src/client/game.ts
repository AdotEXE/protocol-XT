import "@babylonjs/core/Debug/debugLayer";
import { Logger, logger, LogLevel, loggingSettings } from "./utils/logger";
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
import { PostProcessingManager } from "./effects/PostProcessingManager";
import { EnemyManager } from "./enemy";
import { ChunkSystem } from "./chunkSystem";
import { getPlayerGaragePosition } from "./maps/MapConstants";
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
import { DailyQuestsSystem, BattlePassSystem } from "./dailyQuests";
import { DestructionSystem } from "./destructionSystem";
import { MissionSystem, Mission } from "./missionSystem";
import { PlayerStatsSystem } from "./playerStats";
import { upgradeManager } from "./upgrade";
import type { TankStatsData, StatWithBonus } from "./hud/HUDTypes";
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
import type { UnifiedMenu } from "./unifiedMenu";
import type { ScreenshotManager } from "./screenshotManager";
import type { ScreenshotPanel } from "./screenshotPanel";
import type { BattleRoyaleVisualizer } from "./battleRoyale";
import type { CTFVisualizer } from "./ctfVisualizer";
// Game modules - direct imports to avoid initialization order issues
import { GameProjectile } from "./game/GameProjectile";
import { GamePhysics, DEFAULT_PHYSICS_CONFIG } from "./game/GamePhysics";
import type { PhysicsConfig } from "./game/GamePhysics";
import { GameConsumables } from "./game/GameConsumables";
import { GameVisibility } from "./game/GameVisibility";
import { GamePersistence } from "./game/GamePersistence";
import { GameLoaders } from "./game/GameLoaders";
import { GamePOI } from "./game/GamePOI";
import { GameAudio } from "./game/GameAudio";
import { GameStats } from "./game/GameStats";
import { GameStatsOverlay } from "./game/GameStatsOverlay";
import { GameEvents } from "./game/GameEvents";
import { GameCamera } from "./game/GameCamera";
import type { GameCameraContext } from "./game/GameCamera";
import { GameGarage } from "./game/GameGarage";
import { GameEnemies } from "./game/GameEnemies";
import { GameUpdate } from "./game/GameUpdate";
import { GameUI } from "./game/GameUI";
import { GameMultiplayer } from "./game/GameMultiplayer";
// GameSpectator is not currently used - removed to fix initialization order issue
// import { GameSpectator } from "./game/GameSpectator";
import { GameMultiplayerCallbacks } from "./game/GameMultiplayerCallbacks";
import { ProviderFactory, type IRewardProvider, type LocalRewardDependencies, type NetworkRewardDependencies } from "./game/providers";

export class Game {
    engine!: Engine; // Инициализируется в init()
    scene!: Scene; // Инициализируется в init()
    canvas!: HTMLCanvasElement; // Инициализируется в init()
    tank: TankController | undefined;
    camera: ArcRotateCamera | undefined;
    aimCamera: UniversalCamera | undefined; // Отдельная камера для режима прицеливания
    isCameraAnimating: boolean = false; // Флаг блокировки updateCamera во время анимации камеры (респавн)
    hud: HUD | undefined;
    soundManager: SoundManager | undefined;
    effectsManager: EffectsManager | undefined;
    enemyManager: EnemyManager | undefined;

    // Chunk system for optimization
    chunkSystem: ChunkSystem | undefined;

    // LOCKING: Promise to prevent concurrent map reloads
    private _reloadingPromise: Promise<void> | null = null;

    // Время последнего обновления зданий на радаре
    private lastBuildingsUpdate: number = 0;

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

    // Unified menu (lazy loaded) - заменяет все отдельные меню
    unifiedMenu: UnifiedMenu | undefined; // Lazy loaded from "./unifiedMenu"

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

    // Daily quests system
    dailyQuestsSystem: DailyQuestsSystem | undefined;

    // Battle pass system
    battlePassSystem: BattlePassSystem | undefined;

    // Provider system for unified SP/MP logic
    rewardProvider: IRewardProvider | undefined;

    // Post-processing manager
    postProcessingManager: PostProcessingManager | undefined;

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

    // Game modules - lazy initialization to prevent initialization order issues
    private _gameGarage: GameGarage | undefined;
    private _gameConsumables: GameConsumables | undefined;
    private _gameProjectile: GameProjectile | undefined;
    private _gameVisibility: GameVisibility | undefined;
    private _gamePersistence: GamePersistence | undefined;
    private _gameLoaders: GameLoaders | undefined;
    private _gameCamera: GameCamera | undefined;
    private _gameEnemies: GameEnemies | undefined;
    private _gameUI: GameUI | undefined;
    private _gamePhysics: GamePhysics | undefined;
    private _gameAudio: GameAudio | undefined;
    private _gameStats: GameStats | undefined;
    private _gamePOI: GamePOI | undefined;
    private _gameStatsOverlay: GameStatsOverlay | undefined;
    private _gameMultiplayerCallbacks: GameMultiplayerCallbacks | undefined;
    private _gameUpdate: GameUpdate | undefined;

    // Lazy getters for game modules
    private get gameGarage(): GameGarage {
        if (!this._gameGarage) {
            this._gameGarage = new GameGarage();
        }
        return this._gameGarage;
    }

    private get gameConsumables(): GameConsumables {
        if (!this._gameConsumables) {
            this._gameConsumables = new GameConsumables();
        }
        return this._gameConsumables;
    }

    private get gameProjectile(): GameProjectile {
        if (!this._gameProjectile) {
            this._gameProjectile = new GameProjectile();
        }
        return this._gameProjectile;
    }

    private get gameVisibility(): GameVisibility {
        if (!this._gameVisibility) {
            this._gameVisibility = new GameVisibility();
        }
        return this._gameVisibility;
    }

    private get gamePersistence(): GamePersistence {
        if (!this._gamePersistence) {
            this._gamePersistence = new GamePersistence();
        }
        return this._gamePersistence;
    }

    private get gameLoaders(): GameLoaders {
        if (!this._gameLoaders) {
            this._gameLoaders = new GameLoaders();
        }
        return this._gameLoaders;
    }

    private get gameCamera(): GameCamera | undefined {
        return this._gameCamera;
    }

    private set gameCamera(value: GameCamera | undefined) {
        this._gameCamera = value;
    }

    private get gameEnemies(): GameEnemies {
        if (!this._gameEnemies) {
            this._gameEnemies = new GameEnemies();
        }
        return this._gameEnemies;
    }

    private get gameUI(): GameUI {
        if (!this._gameUI) {
            this._gameUI = new GameUI();
        }
        return this._gameUI;
    }

    private get gamePhysics(): GamePhysics {
        if (!this._gamePhysics) {
            this._gamePhysics = new GamePhysics();
        }
        return this._gamePhysics;
    }

    private get gameAudio(): GameAudio {
        if (!this._gameAudio) {
            this._gameAudio = new GameAudio();
        }
        return this._gameAudio;
    }

    private get gameStats(): GameStats {
        if (!this._gameStats) {
            this._gameStats = new GameStats();
        }
        return this._gameStats;
    }

    private get gamePOI(): GamePOI {
        if (!this._gamePOI) {
            this._gamePOI = new GamePOI();
        }
        return this._gamePOI;
    }

    private get gameStatsOverlay(): GameStatsOverlay {
        if (!this._gameStatsOverlay) {
            this._gameStatsOverlay = new GameStatsOverlay();
        }
        return this._gameStatsOverlay;
    }

    private get gameMultiplayerCallbacks(): GameMultiplayerCallbacks {
        if (!this._gameMultiplayerCallbacks) {
            this._gameMultiplayerCallbacks = new GameMultiplayerCallbacks();
        }
        return this._gameMultiplayerCallbacks;
    }

    /**
     * Updates the network menu reference and injects it into dependencies
     */
    public updateNetworkMenu(menu: NetworkMenu): void {
        this.networkMenu = menu;
        this.gameMultiplayerCallbacks.updateDependencies({
            networkMenu: menu
        });
        logger.log("[Game] NetworkMenu dependency updated");
    }

    private get gameUpdate(): GameUpdate {
        if (!this._gameUpdate) {
            this._gameUpdate = new GameUpdate();
        }
        return this._gameUpdate;
    }

    public async getUnifiedMenu(): Promise<UnifiedMenu> {
        if (!this.unifiedMenu) {
            const { UnifiedMenu } = await import("./unifiedMenu");
            this.unifiedMenu = new UnifiedMenu();
            this.unifiedMenu.setGame(this);
        }
        return this.unifiedMenu;
    }

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

    // УДАЛЕНО: Система волн для карты "Передовая" - теперь управляется в GameEnemies

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

        // Game modules are now lazily initialized via getters to prevent initialization order issues
        // Modules are created on first access, ensuring correct initialization order

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
                const restartSettingsStr = localStorage.getItem("ptx_restart_settings");

                if (autoStart && restartMap) {
                    logger.log(`[Game] Auto-starting game on map: ${restartMap}`);

                    // Восстанавливаем настройки если они были сохранены
                    if (restartSettingsStr && this.mainMenu) {
                        try {
                            const restartSettings = JSON.parse(restartSettingsStr);
                            const menuSettings = (this.mainMenu as any).settings;
                            if (menuSettings && restartSettings.enemyDifficulty) {
                                menuSettings.enemyDifficulty = restartSettings.enemyDifficulty;
                                logger.log(`[Game] Restored difficulty: ${restartSettings.enemyDifficulty}`);
                            }
                        } catch (e) {
                            logger.error("[Game] Failed to restore settings:", e);
                        }
                    }

                    // Очищаем флаги
                    localStorage.removeItem("ptx_auto_start");
                    localStorage.removeItem("ptx_restart_map");
                    localStorage.removeItem("ptx_restart_settings");

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

                // Connect garage UI to GameGarage for pending changes
                if (this.gameGarage) {
                    this.gameGarage.setGarageUI(this.garage);
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

        // Обработчик Ctrl+7 для Unified Menu
        const ctrlHotkeysHandler = (e: KeyboardEvent) => {
            if (!e.ctrlKey) return;

            // Ctrl+7: Unified Menu
            if (e.code === "Digit7" || e.code === "Numpad7") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (!this.unifiedMenu) {
                    logger.log("[Game] Loading unified menu (Ctrl+7 CAPTURE)...");
                    this.getUnifiedMenu().then(menu => {
                        if (typeof menu.toggle === 'function') {
                            menu.toggle();
                        }
                        logger.log("[Game] Unified menu loaded (Ctrl+7)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load unified menu:", error);
                    });
                } else {
                    if (typeof this.unifiedMenu.toggle === 'function') {
                        this.unifiedMenu.toggle();
                        logger.log("[Game] Unified menu toggled (Ctrl+7)");
                    }
                }
                return;
            }
        };
        window.addEventListener("keydown", ctrlHotkeysHandler, true); // CAPTURE PHASE!

        // Главный обработчик для F7
        window.addEventListener("keydown", (e) => {
            // F7: Unified Menu
            if (e.code === "F7" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                if (!this.unifiedMenu) {
                    logger.log("[Game] Loading unified menu (F7)...");
                    this.getUnifiedMenu().then(menu => {
                        if (typeof menu.toggle === 'function') {
                            menu.toggle();
                        }
                        logger.log("[Game] Unified menu loaded (F7)");
                    }).catch(error => {
                        logger.error("[Game] Failed to load unified menu:", error);
                    });
                } else {
                    if (typeof this.unifiedMenu.toggle === 'function') {
                        this.unifiedMenu.toggle();
                        logger.log("[Game] Unified menu toggled (F7)");
                    }
                }
                return;
            }
        }, true); // CAPTURE PHASE - срабатывает ПЕРВЫМ!

        // F2: Скриншот
        window.addEventListener("keydown", async (e) => {
            if (e.code === "F2" && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                logger.log("[Game] Taking screenshot (F2)...");

                try {
                    // Убеждаемся, что screenshotManager инициализирован
                    if (!this.screenshotManager) {
                        const { ScreenshotManager } = await import("./screenshotManager");
                        this.screenshotManager = new ScreenshotManager(this.engine, this.scene, this.hud || null);
                    }

                    // Делаем скриншот
                    const { ScreenshotFormat, ScreenshotMode } = await import("./screenshotManager");
                    const blob = await this.screenshotManager.capture({ format: ScreenshotFormat.PNG, mode: ScreenshotMode.FULL_SCREEN });
                    await this.screenshotManager.copyToClipboard(blob);
                    await this.screenshotManager.saveToLocalStorage(blob, { format: ScreenshotFormat.PNG, mode: ScreenshotMode.FULL_SCREEN });

                    if (this.hud) {
                        this.hud.showMessage("📸 Скриншот сохранён! [F2]", "#0f0", 2000);
                    }
                    logger.log("[Game] Screenshot taken successfully (F2)");
                } catch (error) {
                    logger.error("[Game] Screenshot failed:", error);
                    if (this.hud) {
                        this.hud.showMessage("❌ Ошибка скриншота", "#f00", 2000);
                    }
                }
                return;
            }
        }, true);
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

        this.mainMenu.setOnStartGame(async (mapType?: MapType, mapData?: any) => {
            logger.log(`[Game] ===== Start game callback called with mapType: ${mapType} =====`);

            try {
                if (mapType) {
                    this.currentMapType = mapType;
                    logger.log(`[Game] Map type set to: ${this.currentMapType}`);

                    // Сохраняем данные карты для игры (все карты используют единый формат MapData)
                    // КРИТИЧНО: В мультиплеере НЕ сохраняем данные карты в localStorage - все игроки должны использовать карту с сервера
                    if (mapData) {
                        // Проверяем, не в мультиплеере ли мы
                        const hasRoomId = this.multiplayerManager?.getRoomId();
                        const hasPendingMapType = this.multiplayerManager?.getMapType();
                        const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;

                        if (!isInMultiplayerRoom) {
                            // В одиночной игре можно сохранять данные карты
                            // Нормализуем данные к единому формату перед сохранением
                            const normalized = this.normalizeMapDataForGame(mapData);
                            if (normalized) {
                                localStorage.setItem("selectedCustomMapData", JSON.stringify(normalized));
                                logger.log(`[Game] Map data saved (normalized): ${normalized.name}, type: ${normalized.mapType}`);
                            }
                        } else {
                            logger.log(`[Game] 🗺️ Мультиплеер: сохранение данных карты в localStorage запрещено, используем карту с сервера (roomId=${hasRoomId || 'N/A'}, pendingMapType=${hasPendingMapType || 'N/A'})`);
                        }
                    } else {
                        // Если mapData не передан явно, проверяем localStorage
                        const existingMapData = localStorage.getItem("selectedCustomMapData");
                        if (!existingMapData && mapType !== "custom") {
                            // Очищаем данные кастомной карты только если нет данных в localStorage
                            localStorage.removeItem("selectedCustomMapData");
                            localStorage.removeItem("selectedCustomMapIndex");
                            logger.log(`[Game] No map data found, cleared custom map data for mapType: ${mapType}`);
                        } else if (existingMapData) {
                            logger.log(`[Game] Using existing map data from localStorage for mapType: ${mapType}`);
                        }
                    }
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
                        await this.reloadMap(mapType);
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
        // ЗАЩИТА: Предотвращаем двойную регистрацию обработчика
        if ((this as any)._gameKeyboardHandlerRegistered) {
            return;
        }
        (this as any)._gameKeyboardHandlerRegistered = true;
        window.addEventListener("keydown", (e) => {
            // DEBUG: Логируем нажатия клавиш J/M в начале обработчика
            if (e.code === "KeyJ" || e.code === "KeyM") {
                console.log(`[Game] KEYDOWN EVENT: ${e.code}`, {
                    gameStarted: this.gameStarted,
                    hasHud: !!this.hud,
                    menuVisible: this.mainMenu?.isVisible?.() ?? "unknown"
                });
            }
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

            // === ЗАКРЫТИЕ UI ГАРАЖА (G key) ===
            // Если гараж открыт, G закрывает его
            if (e.code === "KeyG" && this.garage && this.garage.isGarageOpen()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.garage.close();
                logger.log("[Game] Garage closed by G key");
                return;
            }

            // === ВОРОТА ГАРАЖА (G key) ===
            // Управление воротами гаража - клавиша G открывает/закрывает ворота
            if (e.code === "KeyG" && this.gameStarted && this.chunkSystem && this.chunkSystem.garageDoors && this.chunkSystem.garageDoors.length > 0) {
                // Если UI гаража закрыт - управляем воротами
                if (!this.garage || !this.garage.isGarageOpen()) {
                    e.preventDefault();

                    // Логика управления воротами
                    if (this.tank && this.tank.chassis) {
                        const playerPos = this.tank.chassis.absolutePosition;

                        // Находим ближайший гараж (максимум 50м)
                        let nearestDoor: any = null;
                        let nearestDist = 50;

                        for (const doorData of this.chunkSystem.garageDoors) {
                            if (!doorData || !doorData.position) continue;
                            const dist = Vector3.Distance(
                                new Vector3(doorData.position.x, 0, doorData.position.z),
                                new Vector3(playerPos.x, 0, playerPos.z)
                            );
                            if (dist < nearestDist) {
                                nearestDist = dist;
                                nearestDoor = doorData;
                            }
                        }

                        if (nearestDoor) {
                            // Определяем ближайшие ворота по Z координате
                            const garageDepth = nearestDoor.garageDepth || 20;
                            const frontDoorZ = nearestDoor.position.z + garageDepth / 2;
                            const backDoorZ = nearestDoor.position.z - garageDepth / 2;
                            const distToFront = Math.abs(playerPos.z - frontDoorZ);
                            const distToBack = Math.abs(playerPos.z - backDoorZ);

                            if (distToFront < distToBack) {
                                nearestDoor.frontDoorOpen = !nearestDoor.frontDoorOpen;
                            } else {
                                nearestDoor.backDoorOpen = !nearestDoor.backDoorOpen;
                            }
                        }
                    }
                    return;
                }
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

            // Открыть/закрыть панель миссий клавишей J
            // ИСПРАВЛЕНИЕ: Панель миссий работает если есть HUD (не требует gameStarted)
            if (e.code === "KeyJ" && this.hud) {
                e.preventDefault();
                e.stopPropagation();
                console.log("[Game] J pressed - toggling mission panel, gameStarted:", this.gameStarted);
                this.hud.toggleMissionPanel();
                return;
            }

            // Открыть/закрыть карту клавишей M
            // ИСПРАВЛЕНИЕ: Карта работает если есть HUD (не требует gameStarted)
            if (e.code === "KeyM" && this.hud) {
                e.preventDefault();
                e.stopPropagation();
                console.log("[Game] M pressed - toggling full map");
                // Закрываем гараж при открытии карты
                if (this.garage && this.garage.isGarageOpen()) {
                    this.garage.close();
                }
                this.hud.toggleFullMap();
                return;
            }

            // ОПТИМИЗАЦИЯ: Tab включает/выключает миникарту (радар)
            // По умолчанию миникарта выключена для экономии ресурсов
            if (e.code === "Tab" && this.hud && this.gameStarted) {
                e.preventDefault();
                e.stopPropagation();
                this.hud.toggleMinimap();
                return;
            }

            if (e.code === "Escape") {

                logger.log(`[Game] ESC pressed - gameStarted: ${this.gameStarted}, mainMenu: ${!!this.mainMenu}`);

                // КРИТИЧНО: Если гараж открыт, ESC должен ТОЛЬКО закрывать гараж, ничего больше!
                if (this.garage && this.garage.isGarageOpen && this.garage.isGarageOpen()) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.garage.close();
                    return;
                }

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

                if (this.unifiedMenu && this.unifiedMenu.visible) {
                    // UnifiedMenu handles its own ESC (closes itself)
                    // We just return here to prevent MainMenu from opening
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



    public applySettings(): void {
        if (this.mainMenu) {
            this.settings = this.mainMenu.getSettings();
        }
        this.applyGraphicsSettings();
        this.applyAudioSettings();
        this.applyControlSettings();
        this.applyCameraSettings();
        logger.info("All game settings applied dynamically");
    }

    public applyGraphicsSettings(): void {
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

        // Shadow quality
        this.scene.shadowsEnabled = (this.settings.shadows ?? true) && this.settings.shadowQuality > 0;

        // Particle quality
        this.scene.particlesEnabled = this.settings.particleQuality > 0;

        // Texture quality - would need to reload textures at different resolutions
        // Lighting quality - would need to adjust light counts/quality

        // Fullscreen
        if (this.settings.fullscreen && !document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else if (!this.settings.fullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
        }

        // Post-processing effects (bloom, motion blur)
        if (this.postProcessingManager) {
            this.postProcessingManager.setBloom(this.settings.bloom ?? false);
            this.postProcessingManager.setMotionBlur(this.settings.motionBlur ?? false);
            this.postProcessingManager.setFXAA(this.settings.antiAliasing ?? true);
        }

        logger.debug("Graphics settings applied");
    }

    /**
     * Настраивает серый туман для плавного перехода на границе видимости
     * ВСЕ КАРТЫ ТЕПЕРЬ 500x500 - единые настройки тумана
     */
    private setupFog(): void {
        if (!this.scene) return;

        // Все карты теперь 500x500 - единые настройки тумана
        // Туман начинается на 60% дистанции, заканчивается на границе карты
        const fogStart = 180;  // Начало тумана
        const fogEnd = 280;    // Полный туман (немного за границей 250)

        this.scene.fogStart = fogStart;
        this.scene.fogEnd = fogEnd;

        logger.log(`[Game] Fog setup: start=${fogStart}, end=${fogEnd} (all maps 500x500)`);
    }

    public applyAudioSettings(): void {
        if (this.mainMenu) {
            const settings = this.mainMenu.getSettings();
            // Update local settings copy
            this.settings = settings;
            this.gameAudio.setSettings(settings);
            this.gameAudio.applySettings();
        }
    }

    public applyControlSettings(): void {
        if (!this.tank) return;

        // Invert mouse Y - would need to be applied in tank controller
        // Auto reload - would need to be applied in tank controller
        // Hold to aim - would need to be applied in tank controller

        logger.debug("Control settings applied");
    }

    public applyCameraSettings(): void {
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

            // Apply System Terminal visibility directly (since it's not part of GameUI/HUD)
            if (this.chatSystem) {
                this.chatSystem.setVisible(settings.showSystemTerminal);
            }
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
    async startGame(): Promise<void> {
        // КРИТИЧНО: Синхронизируем mapType из мультиплеера ДО проверки карты
        // Это гарантирует, что currentMapType актуален с данными сервера
        if (this.multiplayerManager?.isConnected() && this.multiplayerManager?.getRoomId()) {
            const serverMapType = this.multiplayerManager.getMapType();
            if (serverMapType && serverMapType !== this.currentMapType) {
                logger.log(`[Game] 🗺️ СИНХРОНИЗАЦИЯ в startGame(): меняем mapType с ${this.currentMapType} на ${serverMapType} (из сервера)`);
                console.log(`%c[Game] 🗺️ MAP SYNC: ${this.currentMapType} -> ${serverMapType}`, 'color: #22c55e; font-weight: bold; font-size: 14px;');
                this.currentMapType = serverMapType as MapType;
            }
        }

        logger.log("startGame() called, mapType:", this.currentMapType);

        // КРИТИЧНО: Проверяем, соответствует ли текущая карта ожидаемой
        if (this.chunkSystem && (this.chunkSystem as any).mapType !== this.currentMapType) {
            logger.warn(`[Game] Map mismatch! Expected: ${this.currentMapType}, Actual: ${(this.chunkSystem as any).mapType}. Reloading map...`);
            await this.reloadMap(this.currentMapType);
        }
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
            // ОТКЛЮЧЕНО: Уведомление о карте слишком отвлекает
            // this.hud.showMessage(`🗺️ КАРТА: ${mapName}`, "#0ff", 4000);
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

    /**
     * Перезагрузка карты (ChunkSystem)
     * Вынесено в отдельный метод для использования в startGame и setOnStartGame
     */
    /**
     * Перезагрузка карты (ChunkSystem)
     * Вынесено в отдельный метод для использования в startGame и setOnStartGame
     * 
     * ИСПРАВЛЕНО: Добавлен механизм блокировки для предотвращения гонки состояний (Race Condition),
     * когда reloadMap вызывается одновременно из setMapType (multplayer callback) и startGame.
     */
    public async reloadMap(mapType: string): Promise<void> {
        // LOCKING MECHANISM: Prevent concurrent map reloads
        if (this._reloadingPromise) {
            logger.log(`[Game] Map reload already in progress, waiting... (requested: ${mapType})`);
            await this._reloadingPromise;

            // After waiting, check if we already have the correct map
            // This handles the "double reload" case where both calls wanted the same map
            if (this.chunkSystem && (this.chunkSystem as any).mapType === mapType) {
                logger.log(`[Game] Map is already ${mapType} after wait, skipping redundant reload.`);
                return;
            }
            // Также проверяем currentMapType
            if (this.currentMapType === mapType && this.chunkSystem) {
                logger.log(`[Game] Current map type matches ${mapType} after wait, skipping redundant reload.`);
                return;
            }
            logger.log(`[Game] Previous reload finished. Proceeding with reload to ${mapType}...`);
        }

        // Create a new lock
        let resolveLock: () => void;
        this._reloadingPromise = new Promise<void>((resolve) => {
            resolveLock = resolve;
        });

        try {
            if (!this.chunkSystem) return;

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
            let mapTypeForChunkSystem = mapType || this.currentMapType || "normal";
            if (mapTypeForChunkSystem === "sandbox") {
                mapTypeForChunkSystem = "sand";
            }

            // Если это custom карта, проверяем базовый тип из сохраненных данных
            // КРИТИЧНО: В мультиплеере НЕ используем сохраненные custom карты
            if (mapTypeForChunkSystem === "custom") {
                // Проверяем, не в мультиплеере ли мы
                const hasRoomId = this.multiplayerManager?.getRoomId();
                const hasPendingMapType = this.multiplayerManager?.getMapType();
                const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;

                if (isInMultiplayerRoom) {
                    // В мультиплеере custom карты не поддерживаются - используем sandbox как fallback
                    logger.log(`[Game] 🗺️ Мультиплеер: custom карты не поддерживаются в reloadMap(), используем sandbox (roomId=${hasRoomId || 'N/A'}, pendingMapType=${hasPendingMapType || 'N/A'})`);
                    mapTypeForChunkSystem = "sand";
                } else {
                    // В одиночной игре можно использовать сохраненные custom карты
                    try {
                        const customMapDataStr = localStorage.getItem("selectedCustomMapData");
                        if (customMapDataStr) {
                            // Нормализуем данные к единому формату
                            const rawData = JSON.parse(customMapDataStr);
                            const customMapData = this.normalizeMapDataForGame(rawData);
                            if (customMapData && customMapData.mapType && customMapData.mapType !== "custom") {
                                mapTypeForChunkSystem = customMapData.mapType;
                                logger.log(`[Game] Using base map type from normalized custom map: ${customMapData.mapType}`);
                            } else {
                                mapTypeForChunkSystem = "sand";
                                logger.warn("[Game] Custom map missing valid mapType, using sand");
                            }
                        } else {
                            mapTypeForChunkSystem = "sand";
                        }
                    } catch (error) {
                        logger.error("[Game] Failed to read custom map data, using sand:", error);
                        mapTypeForChunkSystem = "sand";
                    }
                }
            }

            logger.log(`[Game] Recreating ChunkSystem with mapType: ${mapTypeForChunkSystem} (passed mapType: ${mapType}, currentMapType: ${this.currentMapType})`);

            this.chunkSystem = new ChunkSystem(this.scene, {
                chunkSize: 80,
                renderDistance: 1.5,
                unloadDistance: 3,  // ОПТИМИЗАЦИЯ: Уменьшено с 4 до 3
                worldSeed: newWorldSeed,
                mapType: mapTypeForChunkSystem as any
            });

            // Обновляем ссылки
            if (this.debugDashboard) {
                this.debugDashboard.setChunkSystem(this.chunkSystem);
            }

            // Обновляем чанки - используем позицию гаража
            const mapGaragePos = getPlayerGaragePosition(this.currentMapType);
            const mapInitialPos = mapGaragePos
                ? new Vector3(mapGaragePos[0], 2, mapGaragePos[1])
                : new Vector3(0, 2, 0);
            this.chunkSystem.update(mapInitialPos);

            // Восстанавливаем здоровье танка при смене карты
            if (this.tank) {
                this.tank.respawn(mapInitialPos);
                logger.debug("[Game] Player tank reset for new map");
            }

            // Ждём генерации гаражей и спавним игрока
            this.waitForGaragesAndSpawn();

        } finally {
            // RELEASE LOCK
            this._reloadingPromise = null;
            if (resolveLock!) resolveLock();
        }
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
        this.saveGameStateForAutoRestart();
        window.location.reload();
    }

    /**
     * Сохраняет состояние игры для автоматического восстановления после перезагрузки
     */
    private saveGameStateForAutoRestart(): void {
        // Сохраняем текущую карту
        if (this.currentMapType) {
            localStorage.setItem("ptx_restart_map", this.currentMapType);
            logger.log(`[Game] Saved map for restart: ${this.currentMapType}`);
        }

        // Сохраняем настройки игры (если есть mainMenu)
        if (this.mainMenu) {
            const settings = (this.mainMenu as any).settings;
            if (settings) {
                localStorage.setItem("ptx_restart_settings", JSON.stringify({
                    enemyDifficulty: settings.enemyDifficulty,
                    // Добавьте другие настройки при необходимости
                }));
                logger.log(`[Game] Saved settings for restart:`, settings.enemyDifficulty);
            }
        }

        // Устанавливаем флаг автозапуска
        localStorage.setItem("ptx_auto_start", "true");
        logger.log("[Game] Auto-restart flag set");
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

        // Останавливаем таймер волн фронтлайна (теперь управляется в GameEnemies.clearEnemies())
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

                // Устанавливаем firebaseService в window для доступа из других модулей
                (window as any).firebaseService = firebaseService;

                // Обработка Google redirect результата (если пользователь вернулся после Google auth)
                const googleResult = await firebaseService.handleGoogleRedirectResult();
                if (googleResult.success) {
                    logger.log("[Game] ✅ Google redirect auth completed:", googleResult.username);
                }

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

                                    // Update HUD effects (Damage indicators, etc)
                                    if (this.hud && this.camera) {
                                        this.hud.update(this.engine.getDeltaTime(), this.camera);
                                    }
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

            // === FOG SETUP - серый туман для плавного перехода на границе видимости ===
            this.scene.fogEnabled = true;
            this.scene.fogMode = Scene.FOGMODE_LINEAR;
            this.scene.fogColor = new Color3(0.45, 0.48, 0.52); // Серый с лёгким синеватым оттенком
            // Дистанции тумана зависят от типа карты (рассчитываются в setupFog)
            this.setupFog();

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
            // Проверяем настройки теней (если нет - используем значения по умолчанию)
            const shadowsEnabled = this.settings.shadows !== false && !isProduction;
            const shadowQuality = this.settings.shadowQuality || 'medium'; // 'low', 'medium', 'high'

            if (shadowsEnabled) {
                // Shadow generator for terrain depth
                // ОПТИМИЗАЦИЯ: Уменьшен размер карты теней и blur kernel
                const qualityStr = String(shadowQuality);
                const shadowMapSize = qualityStr === 'high' ? 2048 : qualityStr === 'medium' ? 1024 : 512;
                const blurKernel = qualityStr === 'high' ? 16 : qualityStr === 'medium' ? 8 : 4;

                const shadowGenerator = new ShadowGenerator(shadowMapSize, sunLight);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurKernel = blurKernel; // ОПТИМИЗИРОВАНО: было 32
                shadowGenerator.setDarkness(0.35); // Чуть темнее для компенсации
                shadowGenerator.bias = 0.0001; // Увеличен для избежания артефактов
                shadowGenerator.filteringQuality = String(shadowQuality) === 'high' ?
                    ShadowGenerator.QUALITY_HIGH : ShadowGenerator.QUALITY_MEDIUM;

                // Store shadow generator for terrain
                (this.scene as any).terrainShadowGenerator = shadowGenerator;
                logger.log(`[Game] Shadows enabled: quality=${shadowQuality}, mapSize=${shadowMapSize}, blurKernel=${blurKernel}`);
            }

            // Включаем тени только если shadowsEnabled
            this.scene.shadowsEnabled = shadowsEnabled;

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
            // Используем позицию гаража из MapConstants для спавна танка
            const tankGaragePos = getPlayerGaragePosition(this.currentMapType);
            const tankSpawnPos = tankGaragePos
                ? new Vector3(tankGaragePos[0], 1.2, tankGaragePos[1])
                : new Vector3(0, 1.2, 0);
            this.tank = new TankController(this.scene, tankSpawnPos);

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
            // ИСПРАВЛЕНИЕ: Устанавливаем начальную цель для предотвращения чёрного экрана
            const initialAimTarget = initialAimCameraPos.add(new Vector3(0, 1, 10));
            this.aimCamera.setTarget(initialAimTarget);
            this.aimCamera.minZ = 0.1; // Минимальное расстояние отсечения
            this.aimCamera.maxZ = 10000; // Максимальное расстояние отсечения (далёкие объекты видны)
            console.log("[Game] AimCamera created with minZ=0.1, maxZ=10000");

            // Устанавливаем камеру как активную СРАЗУ
            this.scene.activeCamera = this.camera;
            // Контролы уже настроены через setupCameraInput(), не нужно вызывать attachControls
            logger.log("[Game] Camera created and set as active");

            // Инициализация постпроцессинга (bloom, motion blur и др.)
            this.postProcessingManager = new PostProcessingManager(this.scene);
            this.postProcessingManager.initialize(this.camera);

            // ИСПРАВЛЕНИЕ: Добавляем aimCamera к пайплайну постпроцессинга
            // чтобы эффекты (vignette, exposure и др.) применялись одинаково к обеим камерам
            if (this.aimCamera) {
                this.postProcessingManager.addCamera(this.aimCamera);
            }

            // Применяем настройки постпроцессинга из settings
            if (this.settings) {
                this.postProcessingManager.setBloom(this.settings.bloom ?? false);
                this.postProcessingManager.setMotionBlur(this.settings.motionBlur ?? false);
            }
            logger.log("[Game] PostProcessingManager initialized");

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

            // Применение настроек HUD
            if (this.hud && this.mainMenu) {
                const settings = this.mainMenu.getSettings();
                // Показ/скрытие панели статистики танка
                if (settings.showTankStatsPanel !== undefined) {
                    this.hud.setDetailedStatsPanelVisible(settings.showTankStatsPanel);
                }
                // Экранное управление (touch controls)
                if (settings.showTouchControls !== undefined) {
                    this.hud.setTouchControlsVisible(settings.showTouchControls);
                }
            }

            // Подключаем touch input к танку
            if (this.hud && this.tank) {
                this.hud.setOnTouchInputChange((state) => {
                    if (!this.tank) return;
                    this.tank.setTouchInput({
                        throttle: state.throttle,
                        steer: state.steer,
                        turretLeft: state.turretLeft,
                        turretRight: state.turretRight,
                        turretRotation: state.turretRotation,
                        aimPitch: state.aimPitch,
                        fire: state.fire,
                        aim: state.aim
                    });
                });

                // Подключаем мобильный ввод (если доступен)
                if (this.hud.setOnMobileInputChange) {
                    this.hud.setOnMobileInputChange((state) => {
                        if (!this.tank) return;
                        this.tank.setTouchInput({
                            throttle: state.throttle,
                            steer: state.steer,
                            turretLeft: state.turretRotation < -0.3,
                            turretRight: state.turretRotation > 0.3,
                            turretRotation: state.turretRotation,
                            aimPitch: state.aimPitch,
                            fire: state.fire,
                            aim: state.aim
                        });
                    });
                }
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

            // Глобальная функция для восстановления уровня игрока (вызов из консоли браузера)
            // Использование: window.setPlayerLevel(17) - установит 17 уровень
            (window as any).setPlayerLevel = (level: number) => {
                if (this.playerProgression) {
                    this.playerProgression.setLevel(level);
                    logger.log(`[Game] Уровень игрока установлен: ${level}`);
                    return `Уровень установлен: ${level}`;
                }
                return "PlayerProgression не инициализирован";
            };
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

                // Connect network player hit callback for client-authoritative hit detection
                this.tank.setOnNetworkPlayerHitCallback((targetId: string, damage: number, hitPosition: Vector3, cannonType: string) => {
                    if (this.isMultiplayer && this.multiplayerManager) {
                        this.multiplayerManager.sendPlayerHit(targetId, damage, hitPosition, cannonType);
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

            // Инициализация системы ежедневных заданий
            this.dailyQuestsSystem = new DailyQuestsSystem();

            // Инициализация системы боевого пропуска
            this.battlePassSystem = new BattlePassSystem();
            this.battlePassSystem.initializeSeason("season_1", "Первый сезон", 90);

            // Connect enemy manager to tank for hit detection
            this.tank.setEnemyManager(this.enemyManager);

            // Connect kill counter and currency
            this.enemyManager.setOnTurretDestroyed(() => {
                logger.log("[GAME] Turret destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                    logger.log("[GAME] Kill added to HUD (turret)");
                }
                // Обновляем прогресс ежедневных заданий
                if (this.dailyQuestsSystem) {
                    this.dailyQuestsSystem.updateProgress("daily_kills", 1);
                }
                // Добавляем опыт в боевой пропуск
                if (this.battlePassSystem) {
                    this.battlePassSystem.addExperience(10);
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

            // === MULTIPLAYER MANAGER (КРИТИЧНО: создаем ДО проверок mapType и worldSeed!) ===
            // Это гарантирует, что pendingMapType и worldSeed из ROOM_JOINED/ROOM_CREATED
            // будут доступны при создании ChunkSystem
            if (!this.multiplayerManager) {
                this.multiplayerManager = new MultiplayerManager(undefined, true); // autoConnect = true
                logger.log("[Game] ✅ MultiplayerManager создан в начале init() (перед ChunkSystem)");
            } else {
                logger.log("[Game] ℹ️ MultiplayerManager уже существует, пропускаем создание");
            }

            // === CHUNK SYSTEM (MAXIMUM OPTIMIZATION!) ===
            this.updateLoadingProgress(70, "Генерация мира...");
            logger.log(`Creating ChunkSystem with mapType: ${this.currentMapType}`);
            // В production используем более агрессивные настройки производительности

            // Получаем сид из настроек меню или из мультиплеера
            let worldSeed: number;
            if (this.multiplayerManager && this.multiplayerManager.getWorldSeed()) {
                // В мультиплеере используем seed с сервера
                worldSeed = this.multiplayerManager.getWorldSeed()!;
                const roomId = this.multiplayerManager.getRoomId() || 'N/A';
                const mapType = this.multiplayerManager.getMapType() || 'N/A';
                logger.log(`[Game] 🎲 Using multiplayer world seed from server: ${worldSeed}, roomId=${roomId}, mapType=${mapType}`);
                console.log(`%c[Game] 🎲 World Seed Sync: ${worldSeed}`, 'color: #3b82f6; font-weight: bold;', {
                    worldSeed: worldSeed,
                    roomId: roomId,
                    mapType: mapType,
                    source: 'server'
                });
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
            let mapType = this.currentMapType || "normal";

            // КРИТИЧНО: ПРИОРИТЕТ - мультиплеер mapType > текущий
            // Это гарантирует синхронизацию между устройствами
            if (this.multiplayerManager) {
                const mpMapType = this.multiplayerManager.getMapType();
                if (mpMapType) {
                    mapType = mpMapType as MapType;
                    this.currentMapType = mapType as any;
                    logger.log(`[Game] 🗺️ Using multiplayer mapType: ${mapType} (from ROOM_CREATED/ROOM_JOINED)`);
                }
            }

            // Если это custom карта, проверяем базовый тип из сохраненных данных
            // КРИТИЧНО: В мультиплеере НЕ используем сохраненные custom карты - все игроки должны видеть одинаковую карту с сервера
            if (mapType === "custom") {
                // Проверяем, не в мультиплеере ли мы
                const hasRoomId = this.multiplayerManager?.getRoomId();
                const hasPendingMapType = this.multiplayerManager?.getMapType();
                const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;

                if (isInMultiplayerRoom) {
                    // В мультиплеере custom карты не поддерживаются - используем sandbox как fallback
                    logger.log(`[Game] 🗺️ Мультиплеер: custom карты не поддерживаются, используем sandbox (roomId=${hasRoomId || 'N/A'}, pendingMapType=${hasPendingMapType || 'N/A'})`);
                    mapType = "sandbox";
                } else {
                    // В одиночной игре можно использовать сохраненные custom карты
                    try {
                        const customMapDataStr = localStorage.getItem("selectedCustomMapData");
                        if (customMapDataStr) {
                            // Нормализуем данные к единому формату
                            const rawData = JSON.parse(customMapDataStr);
                            const customMapData = this.normalizeMapDataForGame(rawData);
                            if (customMapData && customMapData.mapType && customMapData.mapType !== "custom") {
                                logger.log(`[Game] Custom map has base type: ${customMapData.mapType}, using it for terrain generation (normalized from version ${rawData.version || 'legacy'})`);
                                mapType = customMapData.mapType;
                            } else {
                                // По умолчанию для custom карт используем sandbox (плоская земля)
                                mapType = "sandbox";
                                logger.log(`[Game] Custom map has no valid base type, using sandbox for terrain generation`);
                            }
                        } else {
                            mapType = "sandbox";
                        }
                    } catch (error) {
                        logger.error("[Game] Failed to read custom map data, using sandbox:", error);
                        mapType = "sandbox";
                    }
                }
            }

            const roomId = this.multiplayerManager?.getRoomId() || 'N/A';
            const pendingMapType = this.multiplayerManager?.getMapType() || 'N/A';

            // КРИТИЧЕСКОЕ ЛОГИРОВАНИЕ: Проверяем все параметры перед созданием ChunkSystem
            console.log(`%c[Game] 🗺️ КРИТИЧЕСКАЯ ТОЧКА: Создание ChunkSystem`, 'color: #ef4444; font-weight: bold; font-size: 16px;', {
                finalMapType: mapType,
                currentMapType: this.currentMapType,
                pendingMapType: pendingMapType,
                worldSeed: worldSeed,
                isMultiplayer: this.isMultiplayer,
                roomId: roomId,
                multiplayerManagerExists: !!this.multiplayerManager,
                isConnected: this.multiplayerManager?.isConnected() || false
            });

            logger.log(`[Game] 🗺️ Creating ChunkSystem: mapType=${mapType}, worldSeed=${worldSeed}, roomId=${roomId} (currentMapType was: ${this.currentMapType}, pendingMapType=${pendingMapType})`);

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
            this.gameGarage.initialize(this.scene, this.chunkSystem, this.tank, this.hud, this.enemyTanks, this.garage);

            // Если гараж загружен позже, обновляем ссылку
            if (this.garage) {
                this.gameGarage.setGarageUI(this.garage);
            }
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
                survivalStartTime: this.survivalStartTime,
                aiCoordinator: this.aiCoordinator // УЛУЧШЕНО: Передаём AI Coordinator
            });
            // Синхронизируем массив врагов
            this.enemyTanks = this.gameEnemies.enemyTanks;

            // Initialize GameUpdate system
            this.gameUpdate.initialize(
                this.engine,
                this.scene,
                {
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
                    gameStarted: true,
                    gamePaused: false,
                    isAiming: false
                }
            );

            // Set garage respawn timer callback
            this.gameUpdate.setOnUpdateGarageRespawnTimers((deltaTime) => {
                if (this.gameGarage) {
                    this.gameGarage.updateGarageRespawnTimers(deltaTime, (pos) => {
                        // Respawn enemy at the garage position
                        if (this.gameEnemies) {
                            this.gameEnemies.respawnEnemyTank(
                                pos,
                                () => this.gameGarage.getPlayerGaragePosition(this.camera)
                            );
                        }
                    });
                }
            });

            // Initialize GameStats
            this.gameStats.initialize({
                playerProgression: this.playerProgression,
                experienceSystem: this.experienceSystem,
                currencyManager: this.currencyManager,
                realtimeStatsTracker: this.realtimeStatsTracker,
                multiplayerManager: this.multiplayerManager,
                enemyTanks: this.enemyTanks,
                enemyManager: this.enemyManager,
                networkPlayerTanks: this.networkPlayerTanks,
                getIsMultiplayer: () => this.isMultiplayer,
                setIsMultiplayer: (v) => { this.isMultiplayer = v; },
                currentMapType: this.currentMapType
            });

            // Initialize GameCamera if not already initialized
            if (!this.gameCamera) {
                this.gameCamera = new GameCamera();
                this.gameCamera.initialize(this.scene, this.tank, this.hud, this.aimingSystem, this.gameProjectile);
            }

            // Initialize logging error handler
            Logger.setOnError((args) => {
                if (this.hud) {
                    // Format error message safely
                    const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(" ");
                    this.hud.showNotification(`ERROR: ${msg.substring(0, 100)}...`, "error");
                }
            });

            // Initialize HUD
            this.hud = new HUD(this.scene, this.engine, this.experienceSystem, this.gameType);

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
                    // КРИТИЧНО: Проверяем подключение к комнате, а не только isMultiplayer флаг
                    // Это гарантирует обновление сетевых игроков даже если isMultiplayer=false из-за бага
                    const isConnectedToRoom = this.multiplayerManager?.isConnected() && this.multiplayerManager?.getRoomId();
                    if ((this.isMultiplayer || isConnectedToRoom) && this.multiplayerManager) {
                        // КРИТИЧНО: Если подключены к комнате, но isMultiplayer=false - исправляем флаг
                        if (isConnectedToRoom && !this.isMultiplayer) {
                            this.isMultiplayer = true;
                            // КРИТИЧНО: Включаем режим мультиплеера для танка
                            if (this.tank) {
                                this.tank.isMultiplayerMode = true;
                            }
                            // Создаем RealtimeStatsTracker если его нет
                            if (!this.realtimeStatsTracker && this.multiplayerManager.getPlayerId()) {
                                // RealtimeStatsTracker уже импортирован в начале файла
                                const tracker = new RealtimeStatsTracker();
                                this.realtimeStatsTracker = tracker;
                                tracker.startMatch(this.multiplayerManager.getPlayerId()!);
                            }
                        }
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
                    // КРИТИЧНО: Проверяем подключение к комнате, а не только isMultiplayer флаг
                    const isConnectedToRoom = this.multiplayerManager?.isConnected() && this.multiplayerManager?.getRoomId();
                    if ((this.isMultiplayer || isConnectedToRoom) && this.multiplayerManager) {
                        this.checkSpectatorMode();
                    }
                }
            });

            this.updateLoadingProgress(90, "Завершение инициализации...");

            // ПОЛНАЯ ЗАГРУЗКА КАРТЫ: Загружаем ВСЮ карту сразу при старте
            // Используем позицию гаража из MapConstants для места спавна
            const garagePos = getPlayerGaragePosition(this.currentMapType);
            const initialPos = garagePos
                ? new Vector3(garagePos[0], 2, garagePos[1])
                : new Vector3(0, 2, 0);
            if (this.chunkSystem) {
                // Загружаем ВСЮ карту сразу - без дыр и непрогруженных чанков
                logger.log("[Game] Preloading entire map...");
                this.chunkSystem.preloadEntireMap();
                // Обновляем позицию игрока
                this.chunkSystem.update(initialPos);
                logger.log("[Game] Map preloading complete!");

                // КРИТИЧНО: В мультиплеере НЕ загружаем сохраненную карту - все игроки должны видеть одинаковую карту с сервера
                // Проверяем не только isMultiplayer, но и наличие комнаты или pendingMapType (isMultiplayer может быть еще не установлен)
                const hasRoomId = this.multiplayerManager?.getRoomId();
                const hasPendingMapType = this.multiplayerManager?.getMapType();
                const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;
                if (!isInMultiplayerRoom) {
                    // Если выбрана сохраненная/отредактированная карта, применяем её данные
                    // Проверяем наличие selectedCustomMapData в localStorage (может быть установлено для любого типа карты)
                    const customMapDataStr = localStorage.getItem("selectedCustomMapData");
                    if (customMapDataStr) {
                        try {
                            const customMapData = JSON.parse(customMapDataStr);
                            if (customMapData && customMapData.name) {
                                logger.log(`[Game] Found custom map data in localStorage: ${customMapData.name}, waiting for terrain meshes...`);
                                // Даем время чанкам полностью загрузиться и мешам террейна создаться
                                await new Promise(resolve => setTimeout(resolve, 500));
                                logger.log(`[Game] Applying custom map data...`);
                                await this.loadCustomMapData();
                            } else {
                                logger.warn("[Game] Custom map data found but invalid (no name)");
                            }
                        } catch (error) {
                            logger.error("[Game] Failed to parse custom map data:", error);
                            console.error("[Game] Error details:", error);
                        }
                    } else {
                        logger.log("[Game] No custom map data found in localStorage, using default map generation");
                    }
                } else {
                    logger.log("[Game] 🗺️ Мультиплеер: пропускаем загрузку сохраненной карты, используем карту с сервера");
                }
            }

            // === DEBUG TOOLS (Lazy loaded) ===
            // Debug tools are loaded on-demand when F3/F4/F7 are pressed
            // This reduces initial bundle size

            // Session Settings will be lazy loaded when F6 is pressed (see keydown handler)

            // === MULTIPLAYER ===
            // Initialize multiplayer manager with auto-connect (если еще не создан)
            // URL будет автоматически определен в конструкторе MultiplayerManager
            // ПРИМЕЧАНИЕ: MultiplayerManager теперь создается раньше (перед ChunkSystem) для доступа к mapType
            if (!this.multiplayerManager) {
                this.multiplayerManager = new MultiplayerManager(undefined, true); // autoConnect = true
                logger.log("[Game] ✅ MultiplayerManager создан (fallback)");
            }

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
                getIsMultiplayer: () => this.isMultiplayer,
                setIsMultiplayer: (v) => { this.isMultiplayer = v; },
                processPendingNetworkPlayers: () => {
                    this.gameMultiplayerCallbacks?.processPendingNetworkPlayers();
                },
                setBattleRoyaleVisualizer: (v) => { this.battleRoyaleVisualizer = v; },
                setCTFVisualizer: (v) => { this.ctfVisualizer = v; },
                setRealtimeStatsTracker: (v) => { this.realtimeStatsTracker = v; },
                setReplayRecorder: (v) => { this.replayRecorder = v; },
                setMapType: (mapType: string) => {
                    const currentMap = this.currentMapType || "normal";
                    logger.log(`[Game] setMapType called via dependency with: ${mapType} (current: ${currentMap})`);
                    if (currentMap !== mapType) {
                        this.currentMapType = mapType as any;
                        // Если ChunkSystem уже создан, нужно перезагрузить карту
                        if (this.chunkSystem) {
                            logger.log(`[Game] Map type changed from ${currentMap} to ${mapType}, reloading map...`);
                            this.reloadMap(mapType as any).catch(err => {
                                logger.error(`[Game] Failed to reload map: ${err}`);
                            });
                        }
                    } else {
                        logger.log(`[Game] Map type already matches (${mapType}), skipping reload`);
                    }
                },
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
    private getCurrentEnemyDifficulty(): "easy" | "medium" | "hard" | "nightmare" {
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
            isMultiplayer: this.isMultiplayer, // Передаем флаг мультиплеера
            aiCoordinator: this.aiCoordinator // УЛУЧШЕНО: Передаём AI Coordinator
        });

        // Синхронизируем массив врагов
        this.enemyTanks = this.gameEnemies.enemyTanks;

        // КРИТИЧНО: В мультиплеере НЕ спавним локальных ботов - они приходят с сервера
        // Боты создаются через processPendingNetworkPlayers() из pendingEnemies
        if (!this.isMultiplayer) {
            // Используем GameEnemies для спавна только в одиночной игре
            this.gameEnemies.spawnEnemies();
        } else {
            logger.log("[Game] Multiplayer mode: skipping local enemy spawn, waiting for network enemies");
        }

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

    // УДАЛЕНО: spawnPolygonTrainingBots() - логика перенесена в GameEnemies.spawnPolygonBots()
    // УДАЛЕНО: spawnFrontlineEnemies() - логика перенесена в GameEnemies.spawnFrontlineEnemies()
    // УДАЛЕНО: spawnFrontlineDefenders() - логика перенесена в GameEnemies.spawnFrontlineDefenders()
    // УДАЛЕНО: spawnFrontlineWave() - логика перенесена в GameEnemies.spawnFrontlineWave()
    // УДАЛЕНО: handleFrontlineEnemyDeath() - логика перенесена в GameEnemies.handleFrontlineEnemyDeath()

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

            // Для карт Тартария, Песок, Безумие, Экспо и Брест спавним в случайном месте, для остальных - в гараже
            // ЗАЩИТНАЯ ПРОВЕРКА: только явно указанные карты, не undefined и не другие значения
            if ((this.currentMapType !== undefined && (this.currentMapType === "tartaria" || this.currentMapType === "sand" || this.currentMapType === "madness" || this.currentMapType === "expo" || this.currentMapType === "brest" || this.currentMapType === "arena")) || this.chunkSystem.garagePositions.length >= 1) {
                if (this.currentMapType !== undefined && (this.currentMapType === "tartaria" || this.currentMapType === "sand" || this.currentMapType === "madness" || this.currentMapType === "expo" || this.currentMapType === "brest" || this.currentMapType === "arena")) {
                    logger.log(`[Game] ${this.currentMapType} map: spawning player at random location...`);
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
                    // Для карт Тартария и Песок спавним только в случайных местах, без гаражей
                    let enemiesSpawned = false;
                    if (this.currentMapType !== "tartaria" && this.currentMapType !== "sand" && this.chunkSystem && this.chunkSystem.garagePositions.length >= 2) {
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
                        // Инициализируем провайдер наград при старте игры
                        this.initializeRewardProvider();
                        logger.log("[Game] gameStarted set to true for enemy spawn + reward provider initialized");
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

    /**
     * Получает высоту САМОЙ ВЕРХНЕЙ поверхности (крыша здания или террейн) для спавна
     * Использует multiPickWithRay чтобы найти ВСЕ поверхности и выбрать самую высокую
     * @param x координата X
     * @param z координата Z
     * @returns высота самой верхней поверхности
     */
    getTopSurfaceHeight(x: number, z: number): number {
        if (!this.scene) return 5.0; // Fallback если сцены нет

        // Raycast с большой высоты вниз - найдём ВСЕ поверхности
        const rayStart = new Vector3(x, 200, z);
        const ray = new Ray(rayStart, Vector3.Down(), 250);

        // multiPickWithRay возвращает ВСЕ пересечения
        const hits = this.scene.multiPickWithRay(ray, (mesh) => {
            if (!mesh || !mesh.isEnabled() || !mesh.isPickable) return false;
            const name = mesh.name.toLowerCase();

            // Пропускаем невидимые и служебные меши
            if (name.includes("trigger") ||
                name.includes("collider") ||
                name.includes("invisible") ||
                name.includes("skybox") ||
                name.includes("light") ||
                name.includes("particle") ||
                name.includes("bullet") ||
                name.includes("projectile")) {
                return false;
            }

            return true;
        });

        if (hits && hits.length > 0) {
            // Находим САМУЮ ВЫСОКУЮ точку пересечения (крышу)
            let maxHeight = -Infinity;
            for (const hit of hits) {
                if (hit.hit && hit.pickedPoint) {
                    const h = hit.pickedPoint.y;
                    if (h > maxHeight && h > -10 && h < 150) {
                        maxHeight = h;
                    }
                }
            }

            if (maxHeight > -Infinity) {
                logger.log(`[Game] Top surface at (${x.toFixed(1)}, ${z.toFixed(1)}): ${maxHeight.toFixed(2)}m (from ${hits.length} hits)`);
                return maxHeight;
            }
        }

        // Fallback на getGroundHeight если raycast не нашёл поверхность
        return this.getGroundHeight(x, z);
    }

    /**
     * Находит безопасную позицию для спавна в указанном радиусе
     * Танк всегда спавнится НА ВЕРХНЕЙ поверхности (крыша здания или террейн)
     * @param centerX центр поиска X
     * @param centerZ центр поиска Z  
     * @param minRadius минимальный радиус от центра
     * @param maxRadius максимальный радиус от центра
     * @param maxAttempts максимальное количество попыток (не используется в новой логике)
     * @returns безопасная позиция Vector3
     */
    findSafeSpawnPosition(centerX: number = 0, centerZ: number = 0, minRadius: number = 20, maxRadius: number = 200, maxAttempts: number = 20): Vector3 {
        // Генерируем случайную позицию в кольце между minRadius и maxRadius
        const angle = Math.random() * Math.PI * 2;
        const distance = minRadius + Math.random() * (maxRadius - minRadius);
        const x = centerX + Math.cos(angle) * distance;
        const z = centerZ + Math.sin(angle) * distance;

        // Получаем высоту ВЕРХНЕЙ поверхности (крыша или террейн)
        const surfaceHeight = this.getTopSurfaceHeight(x, z);
        // Спавн на 1.5 метра выше поверхности
        const spawnY = surfaceHeight + 1.5;

        logger.log(`[Game] Spawn at top surface: (${x.toFixed(1)}, ${spawnY.toFixed(1)}, ${z.toFixed(1)}) - surface: ${surfaceHeight.toFixed(1)}m`);
        return new Vector3(x, spawnY, z);
    }

    /**
     * Проверяет, безопасна ли позиция для спавна (deprecated, оставлено для совместимости)
     * Новая логика всегда спавнит на верхней поверхности
     */
    isSpawnPositionSafe(x: number, z: number, checkY?: number): boolean {
        // Всегда возвращаем true - новая логика спавнит на верхней поверхности
        return true;
    }

    // Создаёт защитную плоскость под картой для предотвращения падения
    // Серая плоскость с зелёными метрическими линиями по метрам на Z=-10
    private createSafetyPlane(): void {
        if (!this.scene) {
            logger.warn("[Game] Cannot create safety plane: scene not available");
            return;
        }

        // Создаём большую горизонтальную плоскость под картой
        // Размер: 5500x5500 единиц (достаточно для карты 5000x5000 с запасом)
        // CreateGround создаёт горизонтальную плоскость в плоскости XZ
        // ОПТИМИЗАЦИЯ: Уменьшено subdivisions для производительности
        // Это создает 51x51 = 2601 вершин
        const safetyPlaneMesh = MeshBuilder.CreateGround("safetyPlane", {
            width: 5500,
            height: 5500,
            subdivisions: 50 // ОПТИМИЗИРОВАНО: Уменьшено для производительности
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
        safetyTexture.uScale = metersPerTexture; // 2000 метров по ширине
        safetyTexture.vScale = metersPerTexture; // 2000 метров по высоте

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

    // Спавн игрока в случайном месте на карте
    // Использует raycast для определения высоты террейна и проверяет безопасность позиции
    spawnPlayerRandom() {
        if (!this.tank) {
            logger.warn("[Game] Tank not initialized");
            return;
        }

        // В мультиплеере используем позицию спавна с сервера (X, Z), но Y рассчитываем по террейну
        if (this.isMultiplayer && this.multiplayerManager) {
            const serverSpawnPos = this.multiplayerManager.getSpawnPosition();
            console.log(`%c[Game] 🎯 spawnPlayerRandom: serverSpawnPos = ${serverSpawnPos ? `(${serverSpawnPos.x.toFixed(1)}, ${serverSpawnPos.y.toFixed(1)}, ${serverSpawnPos.z.toFixed(1)})` : 'NULL'}`, 'color: #3b82f6; font-weight: bold; font-size: 14px;');
            if (serverSpawnPos) {
                // КРИТИЧНО: Проверяем что позиция не в центре карты (0, 0)
                const distFromCenter = Math.sqrt(serverSpawnPos.x * serverSpawnPos.x + serverSpawnPos.z * serverSpawnPos.z);
                const MIN_SPAWN_DISTANCE = 10; // Минимальное расстояние от центра

                if (distFromCenter < MIN_SPAWN_DISTANCE) {
                    console.warn(`[Game] ⚠️ Server spawn (random) too close to center: (${serverSpawnPos.x.toFixed(1)}, ${serverSpawnPos.z.toFixed(1)}), dist=${distFromCenter.toFixed(1)} - using fallback`);
                    // Продолжаем к fallback логике ниже
                } else {
                    // КРИТИЧНО: Используем X, Z от сервера, но Y рассчитываем по высоте террейна
                    const terrainY = this.getTopSurfaceHeight(serverSpawnPos.x, serverSpawnPos.z);
                    const spawnY = terrainY + 2.0; // 2 метра над поверхностью
                    const spawnPos = new Vector3(serverSpawnPos.x, spawnY, serverSpawnPos.z);

                    logger.log(`[Game] 📍 Server spawn (random): terrain Y=${terrainY.toFixed(1)}, final: (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);

                    if (this.tank.chassis && this.tank.physicsBody) {
                        // Телепортация с правильной синхронизацией физики
                        this.tank.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
                        this.tank.chassis.position.copyFrom(spawnPos);
                        this.tank.chassis.computeWorldMatrix(true);
                        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());

                        // Возвращаем в DYNAMIC режим
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

                        // Сохраняем позицию для респавна
                        if (this.gameGarage) {
                            this.gameGarage.setPlayerGaragePosition(spawnPos.clone());
                        }
                        // КРИТИЧНО: Включаем режим мультиплеера для танка
                        this.tank.isMultiplayerMode = true;
                        logger.log(`[Game] ✅ Player spawned at server position (adjusted Y), isMultiplayerMode=true`);
                        return;
                    }
                }
            }
        }

        // Определяем границы спавна
        let minRadius = 20;
        let maxRadius = 200;
        let centerX = 0;
        let centerZ = 0;

        if (this.chunkSystem) {
            const mapBounds = this.chunkSystem.getMapBounds();
            if (mapBounds) {
                // Используем центр карты
                centerX = (mapBounds.minX + mapBounds.maxX) / 2;
                centerZ = (mapBounds.minZ + mapBounds.maxZ) / 2;
                // Радиус = 40% от размера карты
                const mapSize = Math.max(mapBounds.maxX - mapBounds.minX, mapBounds.maxZ - mapBounds.minZ);
                maxRadius = Math.min(mapSize * 0.4, 200);
            }
        }

        // Используем новую функцию поиска безопасной позиции
        const spawnPos = this.findSafeSpawnPosition(centerX, centerZ, minRadius, maxRadius, 30);

        this.gameGarage.setPlayerGaragePosition(spawnPos.clone());
        logger.log(`[Game] Player spawned at safe location (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);

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

        // В мультиплеере используем позицию спавна с сервера (X, Z), но Y рассчитываем по террейну
        if (this.isMultiplayer && this.multiplayerManager) {
            const serverSpawnPos = this.multiplayerManager.getSpawnPosition();
            console.log(`%c[Game] 🎯 spawnPlayerInGarage: serverSpawnPos = ${serverSpawnPos ? `(${serverSpawnPos.x.toFixed(1)}, ${serverSpawnPos.y.toFixed(1)}, ${serverSpawnPos.z.toFixed(1)})` : 'NULL'}`, 'color: #3b82f6; font-weight: bold; font-size: 14px;');
            if (serverSpawnPos) {
                // КРИТИЧНО: Проверяем что позиция не в центре карты (0, 0)
                // Если позиция слишком близко к центру, это может быть ошибка - используем fallback
                const distFromCenter = Math.sqrt(serverSpawnPos.x * serverSpawnPos.x + serverSpawnPos.z * serverSpawnPos.z);
                const MIN_SPAWN_DISTANCE = 10; // Минимальное расстояние от центра

                if (distFromCenter < MIN_SPAWN_DISTANCE) {
                    console.warn(`[Game] ⚠️ Server spawn position too close to center: (${serverSpawnPos.x.toFixed(1)}, ${serverSpawnPos.z.toFixed(1)}), dist=${distFromCenter.toFixed(1)} - using fallback`);
                    // Не используем эту позицию, продолжаем к fallback логике ниже
                } else {
                    // КРИТИЧНО: Используем X, Z от сервера, но Y рассчитываем по высоте террейна
                    // Сервер не знает высоту террейна, поэтому отправляет фиксированный Y=1.0
                    const terrainY = this.getTopSurfaceHeight(serverSpawnPos.x, serverSpawnPos.z);
                    const spawnY = terrainY + 2.0; // 2 метра над поверхностью
                    const spawnPos = new Vector3(serverSpawnPos.x, spawnY, serverSpawnPos.z);

                    logger.log(`[Game] 📍 Server spawn: (${serverSpawnPos.x.toFixed(1)}, ${serverSpawnPos.y.toFixed(1)}, ${serverSpawnPos.z.toFixed(1)})`);
                    logger.log(`[Game] 📍 Adjusted spawn (terrain Y=${terrainY.toFixed(1)}): (${spawnPos.x.toFixed(1)}, ${spawnPos.y.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);

                    if (this.tank.chassis && this.tank.physicsBody) {
                        // Телепортация с правильной синхронизацией физики
                        this.tank.physicsBody.setMotionType(PhysicsMotionType.ANIMATED);
                        this.tank.chassis.position.copyFrom(spawnPos);
                        this.tank.chassis.computeWorldMatrix(true);
                        this.tank.physicsBody.setLinearVelocity(Vector3.Zero());
                        this.tank.physicsBody.setAngularVelocity(Vector3.Zero());

                        // Возвращаем в DYNAMIC режим
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

                        // Сохраняем позицию для респавна
                        if (this.gameGarage) {
                            this.gameGarage.setPlayerGaragePosition(spawnPos.clone());
                        }
                        // КРИТИЧНО: Включаем режим мультиплеера для танка
                        this.tank.isMultiplayerMode = true;
                        logger.log(`[Game] ✅ Player spawned at server position (adjusted Y), isMultiplayerMode=true`);
                        return;
                    }
                }
            }
        }

        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            logger.warn("[Game] No garages available, using safe spawn position (not center)");
            // Fallback на безопасный спавн (не в центре!)
            if (this.tank.chassis && this.tank.physicsBody) {
                // Спавним на расстоянии 30 единиц от центра в случайном направлении
                const angle = Math.random() * Math.PI * 2;
                const radius = 30;
                const terrainY = this.getTopSurfaceHeight(Math.cos(angle) * radius, Math.sin(angle) * radius);
                const defaultPos = new Vector3(Math.cos(angle) * radius, terrainY + 2.0, Math.sin(angle) * radius);
                logger.log(`[Game] 📍 Fallback spawn at: (${defaultPos.x.toFixed(1)}, ${defaultPos.y.toFixed(1)}, ${defaultPos.z.toFixed(1)})`);
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
        // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
        const garageY = terrainHeight + 1.0;

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

            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            let spawnHeight = groundHeight + 1.0;

            // Минимальная защита: если высота слишком низкая (меньше 1.0), используем безопасное значение
            if (spawnHeight < 1.0) {
                logger.warn(`[Game] Spawn height too low (${spawnHeight.toFixed(2)}), using safe default 2.0`);
                spawnHeight = 2.0; // Минимум 1 метр над поверхностью при groundHeight = 1.0
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
    spawnEnemiesInGarages(attempts: number = 0) {
        if (!this.soundManager || !this.effectsManager) {
            logger.warn("Sound/Effects not ready, skipping enemy spawn");
            return;
        }
        if (!this.chunkSystem || !this.chunkSystem.garagePositions.length) {
            logger.warn("No garages available for garage spawn, will use map spawn instead");
            // НЕ возвращаемся - вызывающий код должен использовать spawnEnemyTanks() как fallback
            return;
        }

        // КРИТИЧЕСКИ ВАЖНО: Если гараж игрока ещё не определён, пробуем подождать
        if (!this.gameGarage.playerGaragePosition) {
            if (attempts < 10) {
                logger.warn(`[Game] Player garage NOT SET! Retrying spawnEnemiesInGarages in 100ms (attempt ${attempts + 1}/10)...`);
                setTimeout(() => {
                    if (this.gameStarted && !this.gamePaused) {
                        this.spawnEnemiesInGarages(attempts + 1);
                    }
                }, 100);
                return;
            } else {
                logger.error("CRITICAL: Player garage NOT SET after 10 attempts! Aborting enemy spawn!");
                return;
            }
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

            // ИСПРАВЛЕНО: Спавн на 1 метр над поверхностью
            const spawnY = groundHeight + 1.0;

            const garagePos = new Vector3(garage.x, spawnY, garage.z);

            // Используем сложность из текущих настроек (sessionSettings/меню)
            const difficulty = this.getCurrentEnemyDifficulty();
            const difficultyScale = adaptiveScale;

            const enemyTank = new EnemyTank(this.scene, garagePos, this.soundManager, this.effectsManager, difficulty, difficultyScale);

            if (this.tank) {
                enemyTank.setTarget(this.tank);
            }

            // УЛУЧШЕНО: Регистрируем бота в AI Coordinator
            if (this.aiCoordinator) {
                enemyTank.setAiCoordinator(this.aiCoordinator);
                this.aiCoordinator.registerBot(enemyTank);
            }

            // Store garage position for this tank
            const enemyGaragePos = garagePos.clone();

            // On death
            enemyTank.onDeathObservable.add(() => {
                logger.log("[GAME] Enemy tank destroyed! Adding kill...");
                if (this.hud) {
                    this.hud.addKill();
                }
                // Обновляем прогресс ежедневных заданий
                if (this.dailyQuestsSystem) {
                    this.dailyQuestsSystem.updateProgress("daily_kills", 1);
                }
                // Добавляем опыт в боевой пропуск
                if (this.battlePassSystem) {
                    this.battlePassSystem.addExperience(25);
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
                    // UpgradeManager: XP и кредиты за убийство
                    upgradeManager.addXpForKill();
                    upgradeManager.addCredits(reward, "battle", "Enemy tank destroyed");
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

        // === Используем провайдер наград для унификации SP/MP ===
        if (this.rewardProvider && this.rewardProvider.isReady()) {
            // Инициализируем провайдер если нужно
            if (!this.rewardProvider.isReady()) {
                this.initializeRewardProvider();
            }

            const reward = this.rewardProvider.awardKill({
                killerId: this.multiplayerManager?.getPlayerId() || "player",
                victimId: enemy.getId?.().toString() || "enemy",
                isPlayerKill: false, // Это бот
                position: enemy.chassis?.position
            });

            // applyReward для совместимости (в LocalRewardProvider пустой)
            this.rewardProvider.applyReward(reward, this.multiplayerManager?.getPlayerId() || "player");
        } else {
            // Fallback на старую логику если провайдер не готов
            if (this.hud) {
                this.hud.addKill();
            }

            // Обновляем прогресс ежедневных заданий
            if (this.dailyQuestsSystem) {
                this.dailyQuestsSystem.updateProgress("daily_kills", 1);
            }

            // Добавляем опыт в боевой пропуск
            if (this.battlePassSystem) {
                this.battlePassSystem.addExperience(25);
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

    /**
     * Инициализация провайдера наград
     * Создаёт правильный провайдер в зависимости от режима игры (SP/MP)
     */
    private initializeRewardProvider(): void {
        // Создаём провайдер через фабрику
        this.rewardProvider = ProviderFactory.createRewardProvider(this.isMultiplayer);

        // Инициализируем с зависимостями
        if (this.isMultiplayer) {
            // MP провайдер
            this.rewardProvider.initialize({
                multiplayerManager: this.multiplayerManager,
                hud: this.hud,
                tank: this.tank,
                getPlayerId: () => this.multiplayerManager?.getPlayerId() || ""
            } as NetworkRewardDependencies);
        } else {
            // SP провайдер
            this.rewardProvider.initialize({
                experienceSystem: this.experienceSystem,
                currencyManager: this.currencyManager,
                playerProgression: this.playerProgression,
                achievementsSystem: this.achievementsSystem,
                missionSystem: this.missionSystem,
                dailyQuestsSystem: this.dailyQuestsSystem,
                battlePassSystem: this.battlePassSystem,
                playerStats: this.playerStats,
                tank: this.tank,
                hud: this.hud,
                getDifficultyMultiplier: () => this.getDifficultyRewardMultiplier(),
                upgradeManager: upgradeManager
            } as LocalRewardDependencies);
        }

        logger.log(`[Game] Reward provider initialized: ${this.isMultiplayer ? "Network" : "Local"}`);
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
    aimingTransitionSpeed = 0.17; // ~0.1 сек при 60 FPS (6 кадров * 0.17 ≈ 1.0)

    normalRadius = 12;
    aimRadius = 6;     // Ближе к танку в режиме прицеливания
    normalBeta = Math.PI / 2 - (20 * Math.PI / 180);  // 20 градусов от горизонта
    aimBeta = 0.25;    // Низкий угол - как из башни танка

    // FOV settings for aim mode  
    normalFOV = 0.8;   // Обычный угол обзора (радианы)
    aimFOV = 0.75;     // Почти без зума при входе в режим прицеливания (колёсико мыши для зума)

    // Mouse control for aiming
    aimMouseSensitivity = 0.00015; // Базовая чувствительность мыши в режиме прицеливания (горизонтальная) - такая же как вертикальная
    aimMouseSensitivityVertical = 0.002; // Базовая вертикальная чувствительность в режиме прицеливания (увеличено для лучшей реакции)
    // ИСПРАВЛЕНИЕ: Увеличена максимальная скорость мыши для режима прицеливания (убрано ограничение)
    aimMaxMouseSpeed = 200; // Максимальная скорость движения мыши (пиксели за кадр) - увеличено с 25 до 200 для разумной чувствительности
    aimPitchSmoothing = 0.12; // Плавное управление стволом (уменьшено для более плавного движения)
    aimYawSmoothing = 0.12; // Плавное управление башней (уменьшено для более плавного движения)
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
    virtualTurretTarget: number | null = null; // Угол направления башни
    lastMouseControlTime = 0; // Время последнего управления мышкой
    lastChassisRotation = 0; // Последний угол корпуса для отслеживания поворота

    // КРИТИЧНО: Время последнего респавна для блокировки центрирования
    lastRespawnTime = 0; // Время последнего респавна


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

            // КРИТИЧНО: Обрабатываем движение мыши как по X, так и по Y
            if (evt.movementX !== undefined || evt.movementY !== undefined) {
                // В режиме прицеливания ограничиваем максимальную скорость движения мыши
                let movementX = evt.movementX || 0;
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
                const oldCameraYaw = this.cameraYaw;
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
                    // КРИТИЧНО: Не управляем башней если танк мёртв/респавнится
                    if (this.tank && this.tank.isAlive && this.tank.turret) {
                        // Вычисляем разницу для плавного поворота башни
                        let yawDiff = this.targetAimYaw - this.aimYaw;
                        // Нормализуем разницу в диапазон [-PI, PI]
                        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

                        // Применяем плавный поворот башни с ограничением скорости (как в обычном режиме)
                        // КРИТИЧНО: Проверяем и восстанавливаем turretSpeed если он невалидный
                        let turretSpeed = this.tank.turretSpeed || 0.08;

                        // КРИТИЧНО: Проверяем на NaN, Infinity и другие невалидные значения
                        if (!isFinite(turretSpeed) || isNaN(turretSpeed) || turretSpeed === Infinity || turretSpeed === -Infinity) {
                            turretSpeed = 0.08;
                            this.tank.turretSpeed = 0.08; // Восстанавливаем в танке тоже
                            logger.warn(`[Game] turretSpeed was invalid (NaN/Infinity) in aiming mode, resetting to 0.08`);
                        }

                        // Увеличиваем скорость если она слишком маленькая
                        if (turretSpeed < 0.06) {
                            turretSpeed = 0.08;
                            this.tank.turretSpeed = 0.08; // Восстанавливаем в танке тоже
                        }

                        // Ограничиваем максимальную скорость (защита от слишком больших значений)
                        const maxTurretSpeed = 0.15; // Максимальная скорость поворота башни
                        if (turretSpeed > maxTurretSpeed) {
                            turretSpeed = maxTurretSpeed;
                            this.tank.turretSpeed = maxTurretSpeed; // Восстанавливаем в танке тоже
                        }

                        // КРИТИЧНО: Финальная проверка перед использованием
                        if (!isFinite(turretSpeed) || turretSpeed <= 0) {
                            turretSpeed = 0.08;
                            this.tank.turretSpeed = 0.08;
                        }

                        if (Math.abs(yawDiff) > 0.01) {
                            // КРИТИЧНО: Ограничиваем скорость поворота башни
                            let rotationAmount = Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);

                            // КРИТИЧНО: Дополнительная проверка на валидность и ограничение
                            if (!isFinite(rotationAmount) || isNaN(rotationAmount) || rotationAmount === Infinity || rotationAmount === -Infinity) {
                                logger.error(`[Game] rotationAmount is invalid (${rotationAmount}) in aiming mode, skipping rotation`);
                                rotationAmount = 0;
                            }

                            // КРИТИЧНО: Абсолютное ограничение максимальной скорости поворота
                            const maxRotationAmount = 0.15; // Максимальная скорость поворота за кадр
                            if (Math.abs(rotationAmount) > maxRotationAmount) {
                                rotationAmount = Math.sign(rotationAmount) * maxRotationAmount;
                                logger.warn(`[Game] rotationAmount (${rotationAmount.toFixed(4)}) exceeded max (${maxRotationAmount}) in aiming mode, clamping`);
                            }

                            if (rotationAmount !== 0) {
                                this.tank.turret.rotation.y += rotationAmount;
                            }
                        }

                        // Нормализуем угол башни чтобы не накапливался
                        while (this.tank.turret.rotation.y > Math.PI) this.tank.turret.rotation.y -= Math.PI * 2;
                        while (this.tank.turret.rotation.y < -Math.PI) this.tank.turret.rotation.y += Math.PI * 2;
                    }

                    // Нормализуем текущий aimYaw (будет плавно интерполироваться в updateCamera)
                    while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
                    while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;

                    // Вертикальный поворот (pitch) - только в режиме прицеливания
                    // КРИТИЧНО: Всегда обрабатываем вертикальное движение мыши, если движение есть
                    if (Math.abs(movementY) > 0.01) {
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

                    // ИСПРАВЛЕНИЕ: Плавная интерполяция aimPitch с учетом deltaTime для независимости от FPS
                    const pitchDiff = this.targetAimPitch - this.aimPitch;
                    // Используем адаптивное сглаживание: быстрее при больших изменениях, медленнее при малых
                    const pitchEasing = Math.min(1.0, Math.abs(pitchDiff) * 5);
                    const adaptivePitchSmoothing = this.aimPitchSmoothing * (0.5 + pitchEasing * 0.5);
                    this.aimPitch += pitchDiff * adaptivePitchSmoothing;
                    // Передаем aimPitch в танк для применения к стволу
                    if (this.tank) {
                        this.tank.aimPitch = this.aimPitch;
                    }
                } else if (!this.isFreeLook && this.tank && this.tank.turret && this.tank.chassis) {
                    // НЕ в режиме прицеливания и НЕ freelook
                    // При движении мыши - сбрасываем виртуальную точку (игрок снова управляет башней)
                    this.virtualTurretTarget = null;
                    this.lastMouseControlTime = 0;

                    // Отменяем центрирование башни ТОЛЬКО при значительном движении мыши
                    // Порог увеличен, чтобы случайные микродвижения не отменяли центровку
                    if (this.tank && this.tank.isAutoCentering && Math.abs(evt.movementX) > 5) {
                        this.tank.isAutoCentering = false;
                        window.dispatchEvent(new CustomEvent("stopCenterCamera"));
                        console.log("[Game] Центровка отменена движением мыши");
                    }
                }
            }
        };

        // Listen for aim mode changes from tank
        window.addEventListener("aimModeChanged", ((e: CustomEvent) => {
            this.isAiming = e.detail.aiming;
            console.log(`[Game] Aim mode changed: ${this.isAiming}`);
            // Показ/скрытие прицела
            if (this.hud) {
                this.hud.setAimMode(this.isAiming);
            }
            // ИСПРАВЛЕНИЕ: Сбрасываем экспозицию чтобы экран не затемнялся при прицеливании
            if (this.postProcessingManager) {
                this.postProcessingManager.resetExposure();
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

        // КРИТИЧНО: Сбрасываем углы камеры после респавна для восстановления поворота башни
        window.addEventListener("tankRespawned", ((e: CustomEvent) => {
            if (e.detail && this.tank && this.tank.turret) {
                const { turretRotY, chassisRotY } = e.detail;

                logger.log(`[Game] Respawn event received: turretRotY=${turretRotY}, chassisRotY=${chassisRotY}`);

                // КРИТИЧНО: ПОЛНЫЙ СБРОС ВСЕХ БЛОКИРОВОК ПОВОРОТА БАШНИ
                // 1. Сбрасываем все флаги управления
                this.isFreeLook = false;
                this.tank.isKeyboardTurretControl = false;
                this.tank.isAutoCentering = false;

                // КРИТИЧНО: Сбрасываем флаги центрирования камеры (без этого cameraYaw постоянно сбрасывается на 0!)
                this.shouldCenterCamera = false;
                this.isCenteringActive = false;

                // 2. Очищаем виртуальную фиксацию
                this.virtualTurretTarget = null;

                // 3. Сбрасываем все переменные поворота башни в танке
                this.tank.turretTurnTarget = 0;
                this.tank.turretTurnSmooth = 0;
                (this.tank as any).turretAcceleration = 0;
                (this.tank as any).turretAccelStartTime = 0;

                // 4. Сбрасываем углы камеры
                // КРИТИЧНО: Используем РЕАЛЬНЫЙ угол башни, а не turretRotY из события
                // turretRotY может быть 0 после respawn, но башня может быть на другом угле
                const actualTurretRotY = this.tank.turret ? this.tank.turret.rotation.y : (turretRotY || 0);
                this.cameraYaw = actualTurretRotY;
                this.aimYaw = (chassisRotY || 0) + actualTurretRotY;
                this.targetAimYaw = this.aimYaw;
                this.aimPitch = 0;
                this.targetAimPitch = 0;

                // 5. Сбрасываем текущий угол камеры
                this.currentCameraAlpha = -((chassisRotY || 0) + actualTurretRotY) - Math.PI / 2;
                this.targetCameraAlpha = this.currentCameraAlpha;

                // 6. Синхронизируем rotationQuaternion
                if (this.tank.turret.rotationQuaternion) {
                    this.tank.turret.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                        this.tank.turret.rotation.y,
                        this.tank.turret.rotation.x,
                        this.tank.turret.rotation.z
                    );
                }

                // 7. Обновляем матрицу башни
                this.tank.turret.computeWorldMatrix(true);

                // 8. Проверяем turretSpeed - ИСПРАВЛЕН БАГ: проверяем напрямую, а не через OR
                // КРИТИЧНО: Проверяем turretSpeed НАПРЯМУЮ, а не через OR (старый код никогда не срабатывал!)
                if (!this.tank.turretSpeed || this.tank.turretSpeed === 0 || this.tank.turretSpeed < 0.06) {
                    this.tank.turretSpeed = 0.08; // УВЕЛИЧЕНО для более быстрого поворота
                    logger.warn(`[Game] turretSpeed was invalid, resetting to 0.08`);
                }
                if (!(this.tank as any).baseTurretSpeed || (this.tank as any).baseTurretSpeed === 0 || (this.tank as any).baseTurretSpeed < 0.06) {
                    (this.tank as any).baseTurretSpeed = 0.08; // УВЕЛИЧЕНО
                    logger.warn(`[Game] baseTurretSpeed was invalid, resetting to 0.08`);
                }

                // КРИТИЧНО: Ограничиваем максимальную скорость поворота башни
                // После применения бонусов turretSpeed может стать слишком большим
                const maxTurretSpeed = 0.15; // Максимальная скорость поворота башни
                if (this.tank.turretSpeed > maxTurretSpeed) {
                    logger.warn(`[Game] turretSpeed (${this.tank.turretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}) after respawn, clamping`);
                    this.tank.turretSpeed = maxTurretSpeed;
                }
                if ((this.tank as any).baseTurretSpeed > maxTurretSpeed) {
                    logger.warn(`[Game] baseTurretSpeed (${(this.tank as any).baseTurretSpeed.toFixed(4)}) exceeded max (${maxTurretSpeed}) after respawn, clamping`);
                    (this.tank as any).baseTurretSpeed = maxTurretSpeed;
                }

                // 9. Отменяем все события центрирования
                window.dispatchEvent(new CustomEvent("stopCenterCamera"));

                // 10. Запоминаем время респавна
                this.lastRespawnTime = Date.now();
                this.lastMouseControlTime = Date.now();
                this.lastChassisRotation = chassisRotY || 0;

                logger.log(`[Game] Башня полностью разблокирована после респавна: cameraYaw=${this.cameraYaw.toFixed(3)}, turretRotY=${this.tank.turret.rotation.y.toFixed(3)}, isAutoCentering=${this.tank.isAutoCentering}, isKeyboardTurretControl=${this.tank.isKeyboardTurretControl}, virtualTurretTarget=${this.virtualTurretTarget}`);

                // 11. КРИТИЧНО: Гарантированная разблокировка башни через requestAnimationFrame
                requestAnimationFrame(() => {
                    if (this.tank && this.tank.turret && !this.tank.turret.isDisposed()) {
                        // Принудительно разблокируем ВСЕ возможные блокировки
                        this.tank.isKeyboardTurretControl = false;
                        this.tank.isAutoCentering = false;
                        this.virtualTurretTarget = null;
                        this.isFreeLook = false;

                        // Сбрасываем переменные поворота башни
                        this.tank.turretTurnTarget = 0;
                        this.tank.turretTurnSmooth = 0;
                        (this.tank as any).turretAcceleration = 0;
                        (this.tank as any).turretAccelStartTime = 0;

                        // Гарантируем ненулевую скорость
                        if (!this.tank.turretSpeed || this.tank.turretSpeed < 0.06) {
                            this.tank.turretSpeed = 0.08; // УВЕЛИЧЕНО для более быстрого поворота
                        }

                        logger.log(`[Game] Башня ГАРАНТИРОВАННО разблокирована после респавна`);
                    }
                });

                // 12. Дополнительная проверка через 100мс
                setTimeout(() => {
                    if (this.tank && this.tank.turret && !this.tank.turret.isDisposed()) {
                        if (!this.tank.turretSpeed || this.tank.turretSpeed < 0.06) {
                            this.tank.turretSpeed = 0.08; // УВЕЛИЧЕНО для более быстрого поворота
                            logger.warn(`[Game] turretSpeed был invalid через 100мс после респавна, исправлено на 0.08`);
                        }
                        this.virtualTurretTarget = null;
                    }
                }, 100);
            } else {
                logger.warn(`[Game] Respawn event received but tank or turret is missing!`);
            }
        }) as EventListener);

        // === TAB SCOREBOARD ===
        window.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.code === "Tab") {
                e.preventDefault(); // Предотвращаем потерю фокуса
                if (this.gameStatsOverlay && !this.gameStatsOverlay.isVisible()) {
                    // Обновляем зависимости перед показом
                    this.gameStatsOverlay.updateDependencies({
                        enemyTanks: this.enemyTanks,
                        enemyManager: this.enemyManager,
                        playerProgression: this.playerProgression,
                        currencyManager: this.currencyManager,
                        experienceSystem: this.experienceSystem,
                        realtimeStatsTracker: this.realtimeStatsTracker,
                        multiplayerManager: this.multiplayerManager,
                        getIsMultiplayer: () => this.isMultiplayer,
                        currentMapType: this.currentMapType
                    });
                    this.gameStatsOverlay.show();
                }
            }
        });

        window.addEventListener("keyup", (e: KeyboardEvent) => {
            if (e.code === "Tab") {
                e.preventDefault();
                if (this.gameStatsOverlay && this.gameStatsOverlay.isVisible()) {
                    this.gameStatsOverlay.hide();
                }
            }
        });
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

        // КРИТИЧНО: Не обновляем камеру во время анимации респавна
        // Анимация камеры сама управляет позицией, updateCamera будет мешать
        if (this.isCameraAnimating) {
            return;
        }

        // Если танк еще не создан, просто убеждаемся что камера активна и выходим
        if (!this.tank || !this.tank.chassis || !this.tank.turret || !this.tank.barrel) {
            return;
        }

        // КРИТИЧНО: Не управляем башней если танк мёртв/респавнится
        // Это предотвращает конфликт между анимацией респавна и управлением башней
        if (!this.tank.isAlive) {
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
                // Используем адаптивное сглаживание: быстрее при больших изменениях, медленнее при малых
                const yawEasing = Math.min(1.0, Math.abs(yawDiff) * 2);
                const adaptiveYawSmoothing = this.aimYawSmoothing * (0.5 + yawEasing * 0.5);
                this.aimYaw += yawDiff * adaptiveYawSmoothing;

                // Нормализуем aimYaw
                while (this.aimYaw > Math.PI) this.aimYaw -= Math.PI * 2;
                while (this.aimYaw < -Math.PI) this.aimYaw += Math.PI * 2;

                // === ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ ВЕРТИКАЛЬНОГО ПРИЦЕЛИВАНИЯ ===
                // Плавно интерполируем aimPitch к targetAimPitch для более плавного движения
                const pitchDiff = this.targetAimPitch - this.aimPitch;
                // Используем адаптивное сглаживание: быстрее при больших изменениях, медленнее при малых
                const pitchEasing = Math.min(1.0, Math.abs(pitchDiff) * 5);
                const adaptivePitchSmoothing = this.aimPitchSmoothing * (0.5 + pitchEasing * 0.5);
                this.aimPitch += pitchDiff * adaptivePitchSmoothing;

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
            // ВАЖНО: Инициализируем КАЖДЫЙ РАЗ когда входим в режим прицеливания (не только когда _aimCameraStartPos === null)
            if (this.isAiming && this.camera && this.aimCamera && this.tank && this.tank.chassis &&
                (this._aimCameraStartPos === null || this.aimingTransitionProgress < 0.02)) {
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

            // Переключение камер
            if (t > 0.01) {
                // Включаем aim камеру
                if (this.camera) this.camera.setEnabled(false);
                if (this.aimCamera) {
                    this.aimCamera.setEnabled(true);
                    this.scene.activeCamera = this.aimCamera;
                }
            } else {
                // Включаем основную камеру
                if (this.aimCamera) this.aimCamera.setEnabled(false);
                if (this.camera) {
                    this.camera.setEnabled(true);
                    this.scene.activeCamera = this.camera;
                }
            }

            // В режиме прицеливания ВСЕ элементы танка остаются ВИДИМЫМИ
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
                const effectiveZoom = this.aimZoom <= 0 ? 1.0 : (1.0 + this.aimZoom * 0.5);
                const zoomedAimFOV = this.aimFOV / effectiveZoom;
                const targetFOV = this.normalFOV + (zoomedAimFOV - this.normalFOV) * t;
                const currentFOV = this.aimCamera.fov;
                this.aimCamera.fov += (targetFOV - currentFOV) * 0.15;
            }

            // === AIMING CAMERA: ПРЯМО ИЗ БАШНИ С ПЛАВНЫМ ПЕРЕХОДОМ ===
            if (t > 0.01 && this.aimCamera && this.tank.turret && this.tank.barrel) {
                // Целевая позиция: башня + немного вверх
                const turretPos = this.tank.turret.getAbsolutePosition();
                const targetCameraPos = turretPos.clone();
                targetCameraPos.y += 0.5;

                // Направление ствола
                const barrelMatrix = this.tank.barrel.getWorldMatrix();
                const barrelDir = Vector3.TransformNormal(Vector3.Forward(), barrelMatrix).normalize();

                // Целевая точка взгляда
                const targetLookAt = targetCameraPos.add(barrelDir.scale(100));

                // Плавный ПЕРЕХОД (t < 1), но РЕЗКОЕ следование когда полностью в режиме (t ≈ 1)
                const currentPos = this.aimCamera.position;
                const currentTarget = this.aimCamera.getTarget();

                // Во время перехода (t < 0.85) - очень быстрая интерполяция
                // После перехода (t >= 0.85) - мгновенное следование
                if (t < 0.85) {
                    // Очень быстрый переход камеры
                    const transitionSpeed = 0.5;
                    const newPos = Vector3.Lerp(currentPos, targetCameraPos, transitionSpeed);
                    this.aimCamera.position.copyFrom(newPos);
                    const newTarget = Vector3.Lerp(currentTarget, targetLookAt, transitionSpeed);
                    this.aimCamera.setTarget(newTarget);
                } else {
                    // Полный режим прицеливания - камера МГНОВЕННО следует за башней
                    this.aimCamera.position.copyFrom(targetCameraPos);
                    this.aimCamera.setTarget(targetLookAt);
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

            // Применяем смещение от тряски к основной камере (когда НЕ в режиме прицеливания)
            if (t < 0.99 && this.camera && this.cameraShakeIntensity > 0.01) {
                this._tmpCameraPos.copyFrom(this.tank.chassis.absolutePosition);
                this._tmpCameraPos.y += 2;
                this.camera.position = this._tmpCameraPos.add(this.cameraShakeOffset);
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

                    // === БАШНЯ ДОГОНЯЕТ КАМЕРУ ===
                    if (!this.isFreeLook && this.tank && this.tank.turret && this.tank.chassis && !this.tank.turret.isDisposed()) {
                        // ОПТИМИЗАЦИЯ: Используем кэшированный угол корпуса
                        const currentChassisRotY = this._cachedChassisRotY;

                        // Проверяем, не управляется ли башня клавиатурой (Z/X) или автоцентрированием (C)
                        if (!this.tank.isKeyboardTurretControl && !this.tank.isAutoCentering) {
                            // Обычное поведение: башня догоняет камеру
                            const targetTurretRot = this.cameraYaw;
                            let currentTurretRot = this.tank.turret.rotation.y;

                            // КРИТИЧНО: Защита от сброса башни в 0
                            // Если башня была сброшена в 0, но должна быть на другом угле - восстанавливаем
                            if (Math.abs(currentTurretRot) < 0.001 && Math.abs(targetTurretRot) > 0.1) {
                                // Башня была сброшена в 0 - восстанавливаем из cameraYaw
                                currentTurretRot = targetTurretRot;
                                this.tank.turret.rotation.y = targetTurretRot;
                                // Синхронизируем rotationQuaternion
                                if (this.tank.turret.rotationQuaternion) {
                                    this.tank.turret.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                                        this.tank.turret.rotation.y,
                                        this.tank.turret.rotation.x,
                                        this.tank.turret.rotation.z
                                    );
                                }
                            }

                            // Вычисляем разницу углов
                            let turretDiff = targetTurretRot - currentTurretRot;
                            while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
                            while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;

                            // Скорость вращения башни (используем скорость танка)
                            // КРИТИЧНО: Проверяем и восстанавливаем turretSpeed если он невалидный
                            let turretSpeed = this.tank.turretSpeed || 0.08;

                            // КРИТИЧНО: Проверяем на NaN, Infinity и другие невалидные значения
                            if (!isFinite(turretSpeed) || isNaN(turretSpeed) || turretSpeed === Infinity || turretSpeed === -Infinity) {
                                turretSpeed = 0.08;
                                this.tank.turretSpeed = 0.08; // Восстанавливаем в танке тоже
                                logger.warn(`[Game] turretSpeed was invalid (NaN/Infinity), resetting to 0.08`);
                            }

                            // Увеличиваем скорость если она слишком маленькая
                            if (turretSpeed < 0.06) {
                                turretSpeed = 0.08;
                                this.tank.turretSpeed = 0.08; // Восстанавливаем в танке тоже
                                logger.warn(`[Game] turretSpeed was too small (${this.tank.turretSpeed}), resetting to 0.08`);
                            }

                            // Ограничиваем максимальную скорость (защита от слишком больших значений)
                            const maxTurretSpeed = 0.15; // Максимальная скорость поворота башни
                            if (turretSpeed > maxTurretSpeed) {
                                turretSpeed = maxTurretSpeed;
                                this.tank.turretSpeed = maxTurretSpeed; // Восстанавливаем в танке тоже
                                logger.warn(`[Game] turretSpeed was too large (${this.tank.turretSpeed}), clamping to ${maxTurretSpeed}`);
                            }

                            // КРИТИЧНО: Финальная проверка перед использованием
                            if (!isFinite(turretSpeed) || turretSpeed <= 0) {
                                turretSpeed = 0.08;
                                this.tank.turretSpeed = 0.08;
                            }

                            // Башня догоняет камеру с ограниченной скоростью
                            const minDiff = 0.001; // Уменьшен порог для более точного наведения

                            if (Math.abs(turretDiff) > minDiff && !this.tank.turret.isDisposed()) {
                                // КРИТИЧНО: Ограничиваем скорость поворота башни
                                let rotationAmount = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), turretSpeed);

                                // КРИТИЧНО: Дополнительная проверка на валидность и ограничение
                                if (!isFinite(rotationAmount) || isNaN(rotationAmount) || rotationAmount === Infinity || rotationAmount === -Infinity) {
                                    logger.error(`[Game] rotationAmount is invalid (${rotationAmount}), skipping rotation`);
                                    rotationAmount = 0;
                                }

                                // КРИТИЧНО: Абсолютное ограничение максимальной скорости поворота
                                const maxRotationAmount = 0.15; // Максимальная скорость поворота за кадр
                                if (Math.abs(rotationAmount) > maxRotationAmount) {
                                    rotationAmount = Math.sign(rotationAmount) * maxRotationAmount;
                                    logger.warn(`[Game] rotationAmount (${rotationAmount.toFixed(4)}) exceeded max (${maxRotationAmount}), clamping`);
                                }

                                if (isFinite(rotationAmount) && !isNaN(rotationAmount) && rotationAmount !== 0) {
                                    const oldRot = this.tank.turret.rotation.y;
                                    this.tank.turret.rotation.y += rotationAmount;

                                    // КРИТИЧНО: Проверяем, что поворот не был сброшен
                                    const newRot = this.tank.turret.rotation.y;
                                    if (Math.abs(newRot - (oldRot + rotationAmount)) > 0.0001) {
                                        // Поворот был сброшен - восстанавливаем
                                        this.tank.turret.rotation.y = oldRot + rotationAmount;
                                    }

                                    // Синхронизируем rotationQuaternion если используется
                                    if (this.tank.turret.rotationQuaternion) {
                                        this.tank.turret.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                                            this.tank.turret.rotation.y,
                                            this.tank.turret.rotation.x,
                                            this.tank.turret.rotation.z
                                        );
                                    }
                                }
                            }
                        } else if (!this.tank.isAutoCentering) {
                            // Башня управляется клавиатурой (Z/X) - камера следует за башней
                            if (this.tank.isKeyboardTurretControl) {
                                // Синхронизируем cameraYaw с углом башни
                                const currentTurretRot = this.tank.turret.rotation.y;
                                const cameraYawDiff = currentTurretRot - this.cameraYaw;

                                // Нормализуем разницу к [-PI, PI]
                                let normalizedDiff = cameraYawDiff;
                                while (normalizedDiff > Math.PI) normalizedDiff -= Math.PI * 2;
                                while (normalizedDiff < -Math.PI) normalizedDiff += Math.PI * 2;

                                // Плавно синхронизируем cameraYaw с башней
                                const syncSpeed = 0.15; // Скорость синхронизации камеры
                                this.cameraYaw += normalizedDiff * syncSpeed;

                                // Нормализуем cameraYaw
                                while (this.cameraYaw > Math.PI) this.cameraYaw -= Math.PI * 2;
                                while (this.cameraYaw < -Math.PI) this.cameraYaw += Math.PI * 2;
                            }

                            // Но если есть виртуальная фиксация - применяем её
                            if (this.virtualTurretTarget !== null) {
                                const targetTurretRot = this.virtualTurretTarget;
                                const currentTurretRot = this.tank.turret.rotation.y;

                                let turretDiff = targetTurretRot - currentTurretRot;
                                while (turretDiff > Math.PI) turretDiff -= Math.PI * 2;
                                while (turretDiff < -Math.PI) turretDiff += Math.PI * 2;

                                const turretSpeed = this.tank.turretSpeed || 0.08;
                                const minDiff = 0.001; // Уменьшен порог для более точного наведения

                                if (Math.abs(turretDiff) > minDiff && !this.tank.turret.isDisposed()) {
                                    const rotationAmount = Math.sign(turretDiff) * Math.min(Math.abs(turretDiff), turretSpeed);
                                    if (isFinite(rotationAmount) && !isNaN(rotationAmount) && rotationAmount !== 0) {
                                        this.tank.turret.rotation.y += rotationAmount;
                                        if (this.tank.turret.rotationQuaternion) {
                                            this.tank.turret.rotationQuaternion = Quaternion.RotationYawPitchRoll(
                                                this.tank.turret.rotation.y,
                                                this.tank.turret.rotation.x,
                                                this.tank.turret.rotation.z
                                            );
                                        }
                                    }
                                } else {
                                    // Достигли цели - сбрасываем виртуальную фиксацию
                                    this.virtualTurretTarget = null;
                                }
                            }
                        }

                        // Виртуальная фиксация башни при повороте корпуса
                        if (this.settings.virtualTurretFixation) {
                            const chassisRotDelta = currentChassisRotY - this.lastChassisRotation;
                            if (Math.abs(chassisRotDelta) > 0.01) {
                                // Корпус повернулся - фиксируем башню относительно камеры
                                if (this.virtualTurretTarget === null) {
                                    this.virtualTurretTarget = this.tank.turret.rotation.y;
                                }
                            }
                        }

                        // Сохраняем текущий угол корпуса для следующего кадра
                        this.lastChassisRotation = currentChassisRotY;
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
    // ОПТИМИЗИРОВАНО: Тряска только при ОЧЕНЬ быстром движении танка (80%+ скорости)
    private updateCameraShake(): void {
        if (this.cameraShakeIntensity > 0.01) {
            // Проверяем скорость танка - тряска только при 80%+ скорости
            let speedFactor = 0;
            if (this.tank && typeof (this.tank as any).getSpeed === 'function') {
                const speed = Math.abs((this.tank as any).getSpeed());
                const maxSpeed = (this.tank as any).moveSpeed || 24;
                const speedRatio = speed / maxSpeed;
                const minThreshold = 0.80; // Тряска только при 80%+ скорости

                if (speedRatio >= minThreshold) {
                    // Нормализуем от 0 до 1 (80% -> 0, 100% -> 1)
                    const normalizedSpeed = (speedRatio - minThreshold) / (1 - minThreshold);
                    speedFactor = normalizedSpeed * normalizedSpeed;
                }
            }

            // Если скорость ниже порога - нет тряски
            if (speedFactor <= 0) {
                this.cameraShakeIntensity *= this.cameraShakeDecay;
                this.cameraShakeOffset = Vector3.Zero();
                return;
            }

            // Генерируем случайное смещение с учётом скорости
            this.cameraShakeTime += 0.1;
            const effectiveIntensity = this.cameraShakeIntensity * speedFactor * 0.5; // Уменьшенная интенсивность
            const shakeX = (Math.random() - 0.5) * effectiveIntensity;
            const shakeY = (Math.random() - 0.5) * effectiveIntensity;
            const shakeZ = (Math.random() - 0.5) * effectiveIntensity;

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
            getIsMultiplayer: () => this.isMultiplayer,
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
        let tankPositions: Array<{ x: number, z: number, alive: boolean, turretRotation: number }> = [];
        let turretEnemies: Array<{ x: number, z: number, alive: boolean, turretRotation?: number }> = [];

        // Получаем кэшированные позиции из GameUpdate
        const cachedEnemies = this.gameUpdate?.getCachedEnemyPositions() || [];

        // ОПТИМИЗАЦИЯ: Обрабатываем только ближних врагов (максимум 8)
        if (this.enemyTanks && this.enemyTanks.length > 0 && cachedEnemies.length > 0) {
            const playerPos = this.tank.chassis?.position;
            const enemyDistances: Array<{ enemy: any, distSq: number, index: number }> = [];

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
                    if (!cached) continue;
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
        const networkEnemies: Array<{ x: number, z: number, alive: boolean, turretRotation: number }> = [];
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

        // УЛУЧШЕНО: Обновляем здания на радаре (каждые 2 секунды для производительности)
        if (!this.lastBuildingsUpdate || Date.now() - this.lastBuildingsUpdate > 2000) {
            this.updateRadarBuildings(playerPos);
            this.lastBuildingsUpdate = Date.now();
        }

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
            // Обновляем снаряды на полной карте
            this.updateFullMapProjectiles(playerPos);
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

            // Обновляем детальную панель статистики танка (реже - каждые 30 кадров)
            if (this._updateTick % 30 === 0) {
                this.updateDetailedTankStatsPanel();
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
                this.hud.updateMapLoadingProgress(progress.percent);
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

    /**
     * Обновляет список зданий для отображения на радаре
     * Собирает данные о ближайших зданиях из сцены
     */
    private updateRadarBuildings(playerPos: Vector3): void {
        if (!this.hud || !this.scene) return;

        const buildings: { x: number; z: number; width: number; depth: number }[] = [];
        const maxDistance = 150; // Максимальная дистанция поиска зданий

        // Ищем меши зданий в сцене по имени
        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible) continue;

            // Фильтруем по имени меша (здания обычно имеют характерные имена)
            const name = mesh.name.toLowerCase();
            if (!name.includes('building') && !name.includes('house') &&
                !name.includes('structure') && !name.includes('wall') &&
                !name.includes('hangar') && !name.includes('warehouse') &&
                !name.includes('barrack') && !name.includes('tower')) continue;

            const pos = mesh.getAbsolutePosition();
            const dist = Vector3.Distance(pos, playerPos);
            if (dist > maxDistance) continue;

            // Получаем размеры из bounding box
            const bounds = mesh.getBoundingInfo()?.boundingBox;
            if (!bounds) continue;

            const size = bounds.extendSize;
            buildings.push({
                x: pos.x,
                z: pos.z,
                width: size.x * 2,
                depth: size.z * 2
            });

            if (buildings.length >= 30) break; // Ограничение
        }

        this.hud.setRadarBuildings(buildings);
    }

    /**
     * Обновить снаряды на миникарте
     */
    private updateMinimapProjectiles(playerPos: Vector3, angle: number): void {
        if (!this.scene || !this.hud) return;

        const projectiles = this.getActiveProjectiles();

        this.hud.updateMinimapProjectiles(projectiles, playerPos.x, playerPos.z, angle);
    }

    /**
     * Обновить снаряды на полной карте
     */
    private updateFullMapProjectiles(playerPos: Vector3): void {
        if (!this.scene || !this.hud) return;

        const projectiles = this.getActiveProjectiles();

        this.hud.updateFullMapProjectiles(projectiles, playerPos);
    }

    /**
     * Получить активные снаряды из сцены
     */
    private getActiveProjectiles(): Array<{ x: number, z: number, type?: string, ownerId?: string }> {
        if (!this.scene) return [];

        const projectiles: Array<{ x: number, z: number, type?: string, ownerId?: string }> = [];

        // Ищем снаряды в сцене
        for (const mesh of this.scene.meshes) {
            if (!mesh.isEnabled() || !mesh.isVisible) continue;

            const metadata = mesh.metadata;
            if (!metadata || (metadata.type !== "bullet" && metadata.type !== "projectile")) continue;

            const pos = mesh.getAbsolutePosition();
            projectiles.push({
                x: pos.x,
                z: pos.z,
                type: metadata.cannonType || "ap",
                ownerId: metadata.owner || "unknown"
            });
        }

        return projectiles;
    }

    /**
     * Обновить здоровье врагов для миникарты
     */
    private updateEnemyHealthForMinimap(enemies: { x: number, z: number, alive: boolean }[]): void {
        if (!this.hud || !this.enemyManager) return;

        // Получаем данные о здоровье врагов из enemyManager
        const turrets = (this.enemyManager as any).turrets || [];
        for (const turret of turrets) {
            if (!turret.isAlive) continue;

            const enemyKey = `${turret.position.x.toFixed(0)}_${turret.position.z.toFixed(0)}`;
            const health = (turret as any).health || 100;
            const maxHealth = (turret as any).maxHealth || 100;

            this.hud.setEnemyHealthForMinimap(enemyKey, health, maxHealth);
        }
    }

    /**
     * Добавить взрыв на миникарту (вызывается при попадании/взрыве)
     */
    addExplosionToMinimap(x: number, z: number, radius: number = 5): void {
        if (this.hud) {
            this.hud.addExplosion(x, z, radius);
        }
    }

    private updateEnemyLookHP() {
        if (!this.tank || !this.tank.barrel) return;

        // === HP ПРОТИВНИКА ПРИ НАВЕДЕНИИ СТВОЛА (не камеры!) ===
        // Получаем направление ствола и создаём луч от ствола
        const barrelPos = this.tank.barrel.getAbsolutePosition();
        const barrelDir = this.tank.barrel.getDirection(Vector3.Forward()).normalize();

        // Рассчитываем дальность поражения (макс 150м для отображения HP)
        const maxRange = 150;

        // Raycast с дальностью поражения
        const ray = new Ray(barrelPos, barrelDir, maxRange);

        // ИСПРАВЛЕНО: Используем multiPickWithRay чтобы найти ВСЕ объекты на пути
        // (не только первый - он может быть terrain/зданием)
        const picks = this.scene.multiPickWithRay(ray);

        // Hide all labels by default
        const playerPos = this.tank && this.tank.chassis ? this.tank.getCachedChassisPosition() : undefined;
        // Скрываем HP билборды турелей
        if (this.enemyManager) {
            const turrets = this.enemyManager.turrets;
            const turretCount = turrets.length;
            for (let i = 0; i < turretCount; i++) {
                const turret = turrets[i];
                if (turret) turret.setHpVisible(false);
            }
        }

        // По умолчанию скрываем HUD индикатор цели
        let targetFound = false;

        // Проверяем ВСЕ объекты на пути raycast
        if (picks && picks.length > 0) {
            for (const pick of picks) {
                if (!pick.hit || !pick.pickedMesh) continue;

                const pickedMesh = pick.pickedMesh as any;

                // Check enemy tanks
                const tank = this.enemyTanks.find(et => et.isPartOf && et.isPartOf(pickedMesh));
                if (tank && tank.isAlive) {
                    if (this.hud && playerPos) {
                        const enemyPos = tank.chassis?.getAbsolutePosition();
                        const distance = enemyPos ? Vector3.Distance(playerPos, enemyPos) : 0;

                        // Враг в радиусе поражения
                        if (distance <= maxRange) {
                            this.hud.setTargetInfo({
                                name: "Enemy Tank",
                                health: tank.currentHealth || 0,
                                maxHealth: tank.maxHealth || 100,
                                distance: distance,
                                type: "enemy"
                            });
                            targetFound = true;
                            break; // Нашли врага - выходим
                        }
                    }
                }

                // Check turrets
                if (this.enemyManager && !targetFound) {
                    const turret = this.enemyManager.turrets.find(tr => tr.isPartOf && tr.isPartOf(pickedMesh));
                    if (turret && turret.isAlive) {
                        if (this.hud && playerPos) {
                            const turretPos = turret.base?.getAbsolutePosition();
                            const distance = turretPos ? Vector3.Distance(playerPos, turretPos) : 0;

                            if (distance <= maxRange) {
                                turret.setHpVisible(true);
                                this.hud.setTargetInfo({
                                    name: "Turret",
                                    health: turret.health || 0,
                                    maxHealth: turret.maxHealth || 100,
                                    distance: distance,
                                    type: "enemy"
                                });
                                targetFound = true;
                                break; // Нашли турель - выходим
                            }
                        }
                    }
                }
            }
        }

        // Если цель не найдена, скрываем HUD индикатор
        if (!targetFound && this.hud) {
            this.hud.setTargetInfo(null);
        }
    }

    // === MULTIPLAYER METHODS ===
    // setupMultiplayerCallbacks перенесён в GameMultiplayerCallbacks модуль

    // Все мультиплеерные колбэки перенесены в GameMultiplayerCallbacks модуль

    private createNetworkPlayerTank(playerData: any): void {
        if (this.networkPlayerTanks.has(playerData.id)) {
            console.log(`[Game] ⏭️ Танк для ${playerData.id} уже существует, пропускаем`);
            return; // Already exists
        }

        const networkPlayer = this.multiplayerManager?.getNetworkPlayer(playerData.id);
        if (!networkPlayer) {
            console.warn(`[Game] ⚠️ Cannot create network tank: NetworkPlayer ${playerData.id} not found. networkPlayers.size=${this.multiplayerManager?.getNetworkPlayers()?.size || 0}`);
            return;
        }

        try {
            const tank = new NetworkPlayerTank(this.scene, networkPlayer);
            // Store reference to multiplayerManager for RTT access
            (tank as any).multiplayerManager = this.multiplayerManager;
            this.networkPlayerTanks.set(playerData.id, tank);

            // КРИТИЧНО: Убеждаемся, что танк видим и добавлен в сцену
            if (tank.chassis) {
                tank.chassis.isVisible = true;
                tank.chassis.setEnabled(true);

                // Принудительно добавляем в сцену если еще не добавлен
                if (this.scene && !this.scene.meshes.includes(tank.chassis)) {
                    this.scene.addMesh(tank.chassis);
                    console.log(`[Game] ✅ Танк ${playerData.id} ДОБАВЛЕН в сцену`);
                }
            }
            if (tank.turret) {
                tank.turret.isVisible = true;
                tank.turret.setEnabled(true);

                if (this.scene && !this.scene.meshes.includes(tank.turret)) {
                    this.scene.addMesh(tank.turret);
                }
            }
            if (tank.barrel) {
                tank.barrel.isVisible = true;
                tank.barrel.setEnabled(true);

                if (this.scene && !this.scene.meshes.includes(tank.barrel)) {
                    this.scene.addMesh(tank.barrel);
                }
            }

            console.log(`%c[Game] ✅ Сетевой танк создан: ${playerData.name || playerData.id}`, 'color: #4ade80; font-weight: bold;');
            console.log(`%cПозиция: (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`, 'color: #a78bfa;');
            console.log(`%cВсего сетевых танков: ${this.networkPlayerTanks.size}`, 'color: #a78bfa;');
        } catch (error) {
            console.error(`[Game] ❌ Ошибка создания сетевого танка для ${playerData.id}:`, error);
            if (error instanceof Error) {
                console.error(`[Game] Stack:`, error.stack);
            }
        }
    }

    private updateMultiplayer(deltaTime: number): void {
        if (!this.multiplayerManager || !this.tank) return;

        // =========================================================================
        // НОВЫЙ ПОДХОД: СЕРВЕР = АВТОРИТЕТ
        // Плавно интерполируем локального игрока к серверной позиции
        // =========================================================================
        if (this.gameMultiplayerCallbacks) {
            this.gameMultiplayerCallbacks.updateLocalPlayerToServer(deltaTime);
            // Update network projectiles (smooth movement & effects)
            this.gameMultiplayerCallbacks.update(deltaTime);
        }

        // Send player input to server (input отправляется, но не применяется локально)
        if (this.tank.chassis && this.tank.physicsBody) {
            // Get input from tank controller
            const throttle = this.tank.throttleTarget || 0;
            const steer = this.tank.steerTarget || 0;
            const turretRotation = this.tank.turret.rotation.y;
            const aimPitch = this.tank.aimPitch || 0;

            // DEBUG: Логируем инпут (закомментировано для чистоты консоли)
            // if (this._updateTick % 60 === 0 && (Math.abs(throttle) > 0.01 || Math.abs(steer) > 0.01)) {
            //     console.log(`%c[Game] 📤 Input: throttle=${throttle.toFixed(2)}, steer=${steer.toFixed(2)}`, 'color: #f59e0b; font-weight: bold;');
            // }

            // КРИТИЧНО: Используем getCachedChassisPosition() для получения мировых координат
            // Это абсолютная позиция после обновления физики, а не локальные координаты
            // updatePositionCache() вызывается автоматически в onAfterPhysicsObservable
            // 
            // ДИАГНОСТИКА: Проверяем что кэш позиций обновлен (проверяем _positionCacheFrame)
            const cachedPos = this.tank.getCachedChassisPosition();
            const cacheFrame = (this.tank as any)._positionCacheFrame;
            const currentFrame = (this.tank as any)._tick || 0;

            // Логируем только если кэш устарел (раз в 60 кадров для диагностики)
            if (currentFrame % 60 === 0 && cacheFrame !== undefined && cacheFrame < currentFrame - 1) {
                logger.warn(`[Game] ⚠️ [updateMultiplayer] Кэш позиций устарел! cacheFrame=${cacheFrame}, currentFrame=${currentFrame}, diff=${currentFrame - cacheFrame}`);
            }

            const currentPosition = cachedPos.clone();
            // КРИТИЧНО: Если используется rotationQuaternion, нужно конвертировать в Euler
            let currentRotation = this.tank.chassis.rotation.y;
            if (this.tank.chassis.rotationQuaternion) {
                // Конвертируем quaternion в Euler angles и берём Y rotation
                const euler = this.tank.chassis.rotationQuaternion.toEulerAngles();
                currentRotation = euler.y;
            }
            this.multiplayerManager.setLocalPlayerPosition(currentPosition, currentRotation);

            // Send input and get sequence number for prediction tracking
            // КРИТИЧНО: Используем getServerTime() для синхронизации с сервером
            // CLIENT-AUTHORITATIVE POSITION: Отправляем реальную позицию от Havok
            // Это гарантирует что другие игроки видят танк в правильной позиции
            // Extract chassis pitch/roll for terrain tilt visualization on other clients
            let chassisPitch = 0;
            let chassisRoll = 0;
            if (this.tank.chassis.rotationQuaternion) {
                const euler = this.tank.chassis.rotationQuaternion.toEulerAngles();
                chassisPitch = euler.x;
                chassisRoll = euler.z;
            }

            const sequence = this.multiplayerManager.sendPlayerInput({
                throttle,
                steer,
                turretRotation,
                aimPitch,
                isShooting: false, // Will be sent separately on shoot
                timestamp: this.multiplayerManager.getServerTime(),
                // НОВОЕ: Позиция и вращение от Havok физики
                position: { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
                rotation: currentRotation,
                chassisPitch,
                chassisRoll
            });

            // CLIENT-SIDE PREDICTION: Update predicted state with actual position after input
            // This allows reconciliation to compare predicted vs server state
            if (sequence >= 0) {
                // КРИТИЧНО: Используем getCachedChassisPosition() для мировых координат
                // Position after physics update (current frame)
                const newPosition = this.tank.getCachedChassisPosition().clone();
                // Конвертируем quaternion в Euler если нужно
                let newRotation = this.tank.chassis.rotation.y;
                if (this.tank.chassis.rotationQuaternion) {
                    newRotation = this.tank.chassis.rotationQuaternion.toEulerAngles().y;
                }
                this.multiplayerManager.updatePredictedState(sequence, newPosition, newRotation);
            }
        }

        // Update network player tanks
        if (this.networkPlayerTanks.size > 0) {
            // ДИАГНОСТИКА: Логируем обновление танков раз в 30 секунд (1800 кадров)
            const shouldLog = this._updateTick % 1800 === 0;

            this.networkPlayerTanks.forEach((tank, playerId) => {
                try {
                    if (tank && tank.update) {
                        tank.update(deltaTime);

                        // ДИАГНОСТИКА: Логируем позицию танка раз в 30 секунд
                        if (shouldLog && tank.chassis && tank.networkPlayer) {
                            const pos = tank.chassis.position;
                            const serverPos = tank.networkPlayer.position;
                            console.log(`[Game] 🔄 Network tank ${playerId}: pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
                        }
                    }
                } catch (error) {
                    console.error(`[Game] Error updating network player tank ${playerId}:`, error);
                }
            });
        } else {
            // ДИАГНОСТИКА: Логируем, если танков нет, но должны быть
            const networkPlayersCount = this.multiplayerManager?.getNetworkPlayers()?.size || 0;
            if (networkPlayersCount > 0 && this._updateTick % 600 === 0) {
                console.warn(`[Game] ⚠️ НЕТ сетевых танков, но есть ${networkPlayersCount} сетевых игроков!`);
            }
        }

        // КРИТИЧНО: Принудительная проверка на отсутствующие танки
        // Проверяем ВСЕГДА, независимо от того, есть ли уже танки
        // Это гарантирует создание танков для ВСЕХ сетевых игроков
        const checkInterval = this._updateTick < 600 ? 10 : 120; // Чаще в первые 10 секунд
        if (this._updateTick % checkInterval === 0) {
            const networkPlayers = this.multiplayerManager?.getNetworkPlayers();
            const networkPlayersCount = networkPlayers?.size || 0;
            const localPlayerId = this.multiplayerManager?.getPlayerId();
            const tanksCount = this.networkPlayerTanks.size;

            if (networkPlayersCount > 0 && this.isMultiplayer && this.scene) {
                let missingTanks = 0;

                // ДИАГНОСТИКА: Логируем состояние
                if (tanksCount < networkPlayersCount - 1) { // -1 для локального игрока
                    console.warn(`[Game] ⚠️ [updateMultiplayer] Несоответствие: networkPlayers=${networkPlayersCount}, tanks=${tanksCount}, localPlayerId=${localPlayerId}`);
                }

                // Проверяем каждого сетевого игрока - есть ли у него танк
                networkPlayers?.forEach((networkPlayer, playerId) => {
                    if (playerId === localPlayerId) return;
                    if (this.networkPlayerTanks.has(playerId)) return;

                    missingTanks++;

                    // Принудительно создаём танк
                    console.warn(`[Game] 🔨 [updateMultiplayer] ПРИНУДИТЕЛЬНОЕ создание танка для ${playerId} (${networkPlayer.name})`);
                    console.warn(`[Game]    Позиция: (${networkPlayer.position.x.toFixed(1)}, ${networkPlayer.position.y.toFixed(1)}, ${networkPlayer.position.z.toFixed(1)})`);
                    this.createNetworkPlayerTank({
                        id: playerId,
                        name: networkPlayer.name,
                        position: networkPlayer.position,
                        rotation: networkPlayer.rotation,
                        turretRotation: networkPlayer.turretRotation,
                        aimPitch: networkPlayer.aimPitch,
                        health: networkPlayer.health,
                        maxHealth: networkPlayer.maxHealth,
                        status: networkPlayer.status || "alive",
                        team: networkPlayer.team
                    });
                });

                if (missingTanks > 0) {
                    console.warn(`[Game] ⚠️ [updateMultiplayer] Создано ${missingTanks} недостающих танков (из ${networkPlayersCount} сетевых игроков, было танков: ${tanksCount})`);

                    // Также пробуем через callback для pending игроков
                    if (this.gameMultiplayerCallbacks) {
                        console.log(`[Game] 🔄 [updateMultiplayer] Вызываем processPendingNetworkPlayers для обработки оставшихся pending игроков`);
                        this.gameMultiplayerCallbacks.processPendingNetworkPlayers(true);
                    }
                }
            } else if (networkPlayersCount > 0 && !this.isMultiplayer) {
                // ДИАГНОСТИКА: Есть сетевые игроки, но isMultiplayer=false
                if (this._updateTick % 60 === 0) {
                    console.warn(`[Game] ⚠️ [updateMultiplayer] Есть ${networkPlayersCount} сетевых игроков, но isMultiplayer=false!`);
                }
            }
        }

        // Update multiplayer HUD every 10 frames (~6 times per second)
        if (this._updateTick % 10 === 0 && this.hud) {
            let cachedPlayers = (this.multiplayerManager as any).lastPlayerStates || [];
            const localPlayerId = this.multiplayerManager.getPlayerId();

            // КРИТИЧНО: Если lastPlayerStates пуст, но есть сетевые игроки - используем их
            if (cachedPlayers.length === 0) {
                const networkPlayers = this.multiplayerManager.getNetworkPlayers();
                if (networkPlayers && networkPlayers.size > 0) {
                    // НЕ логируем каждый кадр - это нормальная ситуация
                    cachedPlayers = [];

                    // Добавляем локального игрока
                    if (localPlayerId && this.tank?.chassis) {
                        // КРИТИЧНО: Используем getCachedChassisPosition() для мировых координат
                        const localPos = this.tank.getCachedChassisPosition();
                        cachedPlayers.push({
                            id: localPlayerId,
                            name: (this.multiplayerManager as any).playerName || "Вы",
                            position: localPos,
                            rotation: this.tank.chassis.rotation.y,
                            health: this.tank.currentHealth || 100,
                            maxHealth: this.tank.maxHealth || 100,
                            status: "alive",
                            kills: 0,
                            deaths: 0,
                            score: 0
                        });
                    }

                    // Добавляем сетевых игроков
                    networkPlayers.forEach((np, id) => {
                        cachedPlayers.push({
                            id: id,
                            name: np.name || "Игрок",
                            position: np.position,
                            rotation: np.rotation,
                            health: np.health || 100,
                            maxHealth: np.maxHealth || 100,
                            status: np.status || "alive",
                            team: np.team,
                            kills: 0,
                            deaths: 0,
                            score: 0
                        });
                    });
                }
            }

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
                    // КРИТИЧНО: Используем getCachedChassisPosition() для мировых координат
                    const localPos = this.tank.getCachedChassisPosition();
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
            // КРИТИЧНО: Включаем режим мультиплеера для танка
            // Это отключает локальную физику движения - сервер теперь авторитет
            if (this.tank) {
                this.tank.isMultiplayerMode = true;
            }
        }
    }

    disableMultiplayer(): void {
        this.isMultiplayer = false;
        // Отключаем режим мультиплеера для танка - возвращаем локальную физику
        if (this.tank) {
            this.tank.isMultiplayerMode = false;
        }
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

        // DISABLED: Auto spectator mode - only enable on explicit user request
        // Spectator mode was interfering with respawn countdown
        // TODO: Re-enable as optional feature later
        /*
        // Enter spectator mode if player died AND NOT in respawn countdown
        // During respawn countdown, we show death screen and wait for respawn, not spectator mode
        const isInRespawnCountdown = this.tank.respawnCountdown !== undefined && this.tank.respawnCountdown > 0;
        if (!this.tank.isAlive && !this.isSpectating && !isInRespawnCountdown) {
            this.enterSpectatorMode();
        }
        */

        // Exit spectator mode if player respawned
        if (this.tank.isAlive && this.isSpectating) {
            this.exitSpectatorMode();
        }
    }

    // === FIREBASE INTEGRATION ===

    // Открыть панель настроек скриншотов
    public async ensureChatSystem(): Promise<void> {
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
    private async openMapEditorInternal(config?: any): Promise<void> {
        if (!this.gameStarted) {
            const errorMsg = "Игра не запущена. Пожалуйста, сначала запустите игру.";
            logger.warn("[Game] Cannot open Map Editor: game not started");
            if (this.hud) {
                this.hud.showMessage(errorMsg, "#f00", 3000);
            } else {
                alert(errorMsg);
            }
            return;
        }
        if (!this.chunkSystem) {
            const errorMsg = "Система генерации карты не готова. Пожалуйста, подождите...";
            logger.warn("[Game] Cannot open Map Editor: chunkSystem is not ready");
            if (this.hud) {
                this.hud.showMessage(errorMsg, "#f00", 3000);
            } else {
                alert(errorMsg);
            }
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

                // Handle AI World Generation config
                if (config && config.worldGen) {
                    try {
                        console.log("[Game] 🌍 Generating world from RealWorldGeneratorV3:", config.worldGen);

                        // Use new RealWorldGeneratorV3 for better building generation
                        const { RealWorldGeneratorV3 } = await import("./services/RealWorldGeneratorV3");
                        const rwg = new RealWorldGeneratorV3(this.scene);

                        if (this.hud) this.hud.showMessage(`Загрузка карты: ${config.worldGen.name}...`, "#0f0", 5000);

                        const result = await rwg.generate({
                            lat: config.worldGen.lat,
                            lon: config.worldGen.lon,
                            radius: 500,  // Default radius
                            heightScale: 1.0,
                            includeRoads: true,
                            includeWater: true,
                            includeParks: true
                        });

                        if (result.success) {
                            const mapData: any = {
                                name: config.worldGen.name,
                                mapType: "world",
                                placedObjects: [],
                                terrainEdits: [],
                                triggers: [],
                                metadata: {
                                    createdAt: Date.now(),
                                    modifiedAt: Date.now(),
                                    author: "RealWorld Gen V3",
                                    description: `Generated ${result.buildingsGenerated} buildings, ${result.roadsGenerated} roads from ${config.worldGen.name}`
                                }
                            };

                            if (typeof this.mapEditor.loadMapData === "function") {
                                this.mapEditor.loadMapData(mapData);
                            } else {
                                (this.mapEditor as any).mapData = mapData;
                                if (typeof (this.mapEditor as any).updateUI === "function") (this.mapEditor as any).updateUI();
                            }

                            if (this.hud) this.hud.showMessage(`✅ Карта загружена! ${result.buildingsGenerated} зданий`, "#0f0", 3000);
                        } else {
                            throw new Error(result.errorMessage || "Generation failed");
                        }

                    } catch (e) {
                        console.error("[Game] Failed to generate world:", e);
                        if (this.hud) this.hud.showMessage("Ошибка генерации мира", "#f00", 5000);
                    }
                }

            }
        } catch (error) {
            logger.error("[Game] Failed to open map editor:", error);
            if (this.hud) {
                this.hud.showMessage("Failed to load Map Editor", "#f00", 3000);
            }
            this.mapEditor = undefined;
        }
    }

    /**
     * Нормализовать MapData к единому формату (совместимо с MapEditor)
     */
    private normalizeMapDataForGame(data: any): any | null {
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
     * Загрузить данные custom карты из localStorage
     */
    private async loadCustomMapData(): Promise<void> {
        // КРИТИЧНО: В мультиплеере загрузка сохраненной карты запрещена
        // Проверяем не только isMultiplayer, но и наличие комнаты или pendingMapType (isMultiplayer может быть еще не установлен)
        const hasRoomId = this.multiplayerManager?.getRoomId();
        const hasPendingMapType = this.multiplayerManager?.getMapType(); // pendingMapType из ROOM_CREATED/ROOM_JOINED
        const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;

        if (isInMultiplayerRoom) {
            logger.log(`[Game] 🗺️ Мультиплеер: загрузка сохраненной карты запрещена, используем карту с сервера (roomId=${hasRoomId || 'N/A'}, pendingMapType=${hasPendingMapType || 'N/A'})`);
            return;
        }

        try {
            const customMapDataStr = localStorage.getItem("selectedCustomMapData");
            if (!customMapDataStr) {
                logger.warn("[Game] No custom map data found in localStorage");
                return;
            }

            const rawData = JSON.parse(customMapDataStr);
            if (!rawData || !rawData.name) {
                logger.warn("[Game] Invalid custom map data");
                return;
            }

            // Нормализуем данные к единому формату перед использованием
            const customMapData = this.normalizeMapDataForGame(rawData);
            if (!customMapData) {
                logger.warn("[Game] Failed to normalize custom map data");
                return;
            }

            // КРИТИЧНО: В мультиплеере используем тип карты с сервера, а не из сохраненной карты
            // Проверяем не только isMultiplayer, но и наличие комнаты или pendingMapType
            const hasRoomId = this.multiplayerManager?.getRoomId();
            const hasPendingMapType = this.multiplayerManager?.getMapType();
            const isInMultiplayerRoom = this.isMultiplayer || (this.multiplayerManager?.isConnected() && hasRoomId) || hasPendingMapType;
            if (isInMultiplayerRoom && this.currentMapType) {
                logger.log(`[Game] 🗺️ Мультиплеер: используем тип карты с сервера '${this.currentMapType}' вместо '${customMapData.mapType}' из сохраненной карты`);
                customMapData.mapType = this.currentMapType;
            }

            logger.log(`[Game] ===== Loading custom map =====`);
            logger.log(`[Game] Map name: ${customMapData.name}`);
            logger.log(`[Game] Map type: ${customMapData.mapType}`);
            logger.log(`[Game] Map version: ${customMapData.version || 'legacy'}`);
            logger.log(`[Game] Objects: ${customMapData.placedObjects?.length || 0}`);
            logger.log(`[Game] Triggers: ${customMapData.triggers?.length || 0}`);
            logger.log(`[Game] Terrain edits: ${customMapData.terrainEdits?.length || 0}`);

            // Проверяем, что chunkSystem готов
            if (!this.chunkSystem) {
                logger.error("[Game] ChunkSystem is not initialized, cannot load custom map data");
                return;
            }

            logger.log(`[Game] ChunkSystem is ready, creating MapEditor...`);

            // Создаем MapEditor если его нет
            if (!this.mapEditor) {
                const { MapEditor } = await import("./mapEditor");
                this.mapEditor = new MapEditor(this.scene);
                this.mapEditor.chunkSystem = this.chunkSystem;
                logger.log(`[Game] MapEditor created and assigned to ChunkSystem`);
            } else {
                logger.log(`[Game] MapEditor already exists, updating ChunkSystem reference`);
                this.mapEditor.chunkSystem = this.chunkSystem;
            }

            // Устанавливаем нормализованные данные карты
            logger.log(`[Game] Setting map data to MapEditor...`);
            this.mapEditor.setMapData(customMapData);
            logger.log(`[Game] Map data set, applying without UI...`);

            // Применяем данные без открытия UI редактора
            await this.mapEditor.applyMapDataWithoutUI();

            // CRITICAL: Inject spawn positions from custom map into chunkSystem.garagePositions
            // This ensures players can spawn on custom maps
            this.injectCustomMapSpawnPositions(customMapData);

            logger.log(`[Game] ===== Custom map "${customMapData.name}" loaded and applied successfully =====`);
        } catch (error) {
            logger.error("[Game] Failed to load custom map data:", error);
            console.error("[Game] Full error details:", error);
            if (error instanceof Error) {
                console.error("[Game] Error stack:", error.stack);
            }
        }
    }

    /**
     * Inject spawn positions from custom map data into chunkSystem.garagePositions
     * This is critical for allowing players to spawn on custom maps
     */
    private injectCustomMapSpawnPositions(customMapData: any): void {
        if (!this.chunkSystem) {
            logger.error("[Game] Cannot inject spawn positions - ChunkSystem not initialized");
            return;
        }

        const spawnPositions: Vector3[] = [];

        // Extract spawn positions from triggers (type: 'spawn')
        if (customMapData.triggers && Array.isArray(customMapData.triggers)) {
            for (const trigger of customMapData.triggers) {
                if (trigger.type === 'spawn' && trigger.position) {
                    spawnPositions.push(new Vector3(
                        trigger.position.x,
                        trigger.position.y || 2,
                        trigger.position.z
                    ));
                }
            }
        }

        // Also check placedObjects for spawn-type objects (legacy support)
        if (customMapData.placedObjects && Array.isArray(customMapData.placedObjects)) {
            for (const obj of customMapData.placedObjects) {
                if (obj.type === 'spawn' && obj.position) {
                    spawnPositions.push(new Vector3(
                        obj.position.x,
                        obj.position.y || 2,
                        obj.position.z
                    ));
                }
            }
        }

        // If no spawns found in map data, create default spawn positions
        if (spawnPositions.length === 0) {
            logger.warn("[Game] No spawn positions in custom map - creating defaults");
            const mapSize = customMapData.mapSize || 200;
            const half = mapSize / 2;
            const offset = half * 0.7;

            spawnPositions.push(
                new Vector3(-offset, 2, -offset),
                new Vector3(offset, 2, -offset),
                new Vector3(-offset, 2, offset),
                new Vector3(offset, 2, offset),
                new Vector3(0, 2, 0)
            );
        }

        // Inject into chunkSystem.garagePositions (used by spawn system)
        // Clear existing and add from custom map
        this.chunkSystem.garagePositions.length = 0;
        for (const pos of spawnPositions) {
            this.chunkSystem.garagePositions.push(pos);
        }

        logger.log(`[Game] Injected ${spawnPositions.length} spawn positions from custom map`);
    }

    public async openMapEditorFromMenu(config?: any): Promise<void> {
        try {
            console.log("[Game] ====== openMapEditorFromMenu() CALLED ======");
            logger.log("[Game] openMapEditorFromMenu() called");

            // Инициализируем игру и запускаем, если ещё не запущена
            if (!this.gameInitialized) {
                console.log("[Game] Game not initialized, initializing...");
                logger.log(`[Game] Initializing game for Map Editor with map type: ${this.currentMapType}`);
                await this.init();
                this.gameInitialized = true;
                console.log("[Game] ✅ Game initialized");
                logger.log("[Game] Game initialized for Map Editor");
            }

            if (!this.gameStarted) {
                console.log("[Game] Game not started, starting...");
                logger.log("[Game] Starting game for Map Editor");
                this.startGame();
                // Даем время на инициализацию chunkSystem
                console.log("[Game] Waiting for chunkSystem initialization...");
                await new Promise(resolve => setTimeout(resolve, 1500));
                console.log("[Game] ✅ Game started");
            }

            // Проверяем что chunkSystem готов
            if (!this.chunkSystem) {
                console.log("[Game] chunkSystem not ready, waiting...");
                logger.warn("[Game] chunkSystem not ready, waiting...");
                let attempts = 0;
                while (!this.chunkSystem && attempts < 15) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    attempts++;
                    console.log(`[Game] Waiting for chunkSystem... attempt ${attempts}/15`);
                }
                if (!this.chunkSystem) {
                    const errorMsg = "chunkSystem не инициализирован после ожидания";
                    console.error(`[Game] ❌ ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                console.log("[Game] ✅ chunkSystem ready");
            }

            console.log("[Game] Opening map editor internal...");
            await this.openMapEditorInternal(config);
            console.log("[Game] ✅ Map Editor opened successfully from menu");
            logger.log("[Game] Map Editor opened successfully from menu");
        } catch (error) {
            logger.error("[Game] Failed to open Map Editor from menu:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("[Game] ❌ Failed to open Map Editor from menu:", error);
            console.error("[Game] Error message:", errorMessage);

            if (this.hud) {
                this.hud.showMessage(`Ошибка открытия редактора: ${errorMessage}`, "#f00", 5000);
            } else {
                alert(`Не удалось открыть редактор карт:\n${errorMessage}`);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // ОБНОВЛЕНИЕ ДЕТАЛЬНОЙ ПАНЕЛИ СТАТИСТИКИ ТАНКА
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Обновление данных детальной панели характеристик танка
     */
    private updateDetailedTankStatsPanel(): void {
        if (!this.hud || !this.tank) return;

        const tank = this.tank;
        const chassisType = tank.chassisType;
        const cannonType = tank.cannonType;
        const trackType = tank.trackType;

        if (!chassisType || !cannonType || !trackType) return;

        // Получаем уровни прокачки
        const chassisLevel = upgradeManager.getElementLevel("chassis", chassisType.id);
        const cannonLevel = upgradeManager.getElementLevel("cannon", cannonType.id);
        const tracksLevel = upgradeManager.getElementLevel("tracks", trackType.id);

        // Получаем бонусы от прокачки
        const chassisBonuses = upgradeManager.getChassisBonuses(chassisType.id);
        const cannonBonuses = upgradeManager.getCannonBonuses(cannonType.id);
        const tracksBonuses = upgradeManager.getTracksBonuses(trackType.id);

        // Формируем StatWithBonus для шасси
        const makeStatWithBonus = (base: number, multiplier: number | undefined): StatWithBonus => {
            const mult = multiplier ?? 1;
            return {
                base,
                bonus: mult - 1,
                total: base * mult,
                bonusType: "percent"
            };
        };

        // Данные о шасси
        const chassisData = {
            id: chassisType.id,
            name: chassisType.name,
            maxHealth: makeStatWithBonus(chassisType.maxHealth, chassisBonuses.healthMultiplier),
            moveSpeed: makeStatWithBonus(chassisType.moveSpeed, tracksBonuses.speedMultiplier),
            turnSpeed: makeStatWithBonus(chassisType.turnSpeed, tracksBonuses.turnSpeedMultiplier),
            acceleration: makeStatWithBonus(chassisType.acceleration, tracksBonuses.accelerationMultiplier),
            mass: chassisType.mass,
            width: chassisType.width,
            height: chassisType.height,
            depth: chassisType.depth,
            specialAbility: chassisType.specialAbility || null,
            upgradeLevel: chassisLevel,
            color: chassisType.color
        };

        // Данные о пушке
        const cannonData = {
            id: cannonType.id,
            name: cannonType.name,
            damage: makeStatWithBonus(cannonType.damage, cannonBonuses.damageMultiplier),
            cooldown: {
                base: cannonType.cooldown,
                bonus: cannonBonuses.cooldownMultiplier ? cannonBonuses.cooldownMultiplier - 1 : 0,
                total: cannonType.cooldown * (cannonBonuses.cooldownMultiplier ?? 1),
                bonusType: "percent" as const
            },
            projectileSpeed: makeStatWithBonus(cannonType.projectileSpeed, cannonBonuses.projectileSpeedMultiplier),
            projectileSize: cannonType.projectileSize,
            recoilMultiplier: cannonType.recoilMultiplier,
            barrelLength: cannonType.barrelLength,
            barrelWidth: cannonType.barrelWidth,
            maxRicochets: cannonType.maxRicochets ?? null,
            ricochetSpeedRetention: cannonType.ricochetSpeedRetention ?? null,
            ricochetAngle: cannonType.ricochetAngle ?? null,
            maxRange: cannonType.maxRange ?? (cannonType.barrelLength * 80 + cannonType.projectileSpeed * 0.5), // Рассчитываем если не указано
            upgradeLevel: cannonLevel,
            color: cannonType.color
        };

        // Данные о гусеницах
        const tracksData = {
            id: trackType.id,
            name: trackType.name,
            style: trackType.style,
            speedBonus: trackType.stats.speedBonus ?? 0,
            durabilityBonus: trackType.stats.durabilityBonus ?? 0,
            armorBonus: trackType.stats.armorBonus ?? 0,
            upgradeLevel: tracksLevel,
            color: trackType.color
        };

        // Бонусы от модулей (рассчитываем один раз)
        const installedModules = upgradeManager.getUpgrades().modules;
        let evasionBonus = 0;
        let repairRateBonus = 0;
        let fuelEfficiencyBonus = 0;

        // Calculate Module Bonuses
        Object.values(installedModules).forEach(m => {
            if (m.level > 0) {
                // Check module effects
                // Check module effects
                // const bonuses = upgradeManager.getModuleBonuses(m.elementId);
                if (m.elementId === "shield") evasionBonus += 5 + (m.level * 1); // Example: 5% + 1% per level
                if (m.elementId === "repair") repairRateBonus += 1 + (m.level * 0.5); // Example: 1 HP/s + 0.5 HP/s per level
                if (m.elementId === "boost") fuelEfficiencyBonus += 10 + (m.level * 2); // 10% + 2% per level
            }
        });

        const playerLevel = upgradeManager.getPlayerLevel();
        const baseCrit = Math.min(25, playerLevel * 0.5);
        const baseEvasion = Math.min(20, playerLevel * 0.2);
        const baseRepair = playerLevel * 0.05;
        const baseFuelEff = Math.min(30, playerLevel * 0.5);

        // Бонусы от всего
        const bonusesData = {
            damageBonus: (cannonBonuses.damageMultiplier ?? 1) - 1,
            cooldownBonus: (cannonBonuses.cooldownMultiplier ?? 1) - 1,
            healthBonus: (chassisBonuses.healthMultiplier ?? 1) - 1,
            armorBonus: (chassisBonuses.armorMultiplier ?? 1) - 1 + (trackType.stats.armorBonus ?? 0),
            speedBonus: (tracksBonuses.speedMultiplier ?? 1) - 1 + (trackType.stats.speedBonus ?? 0),
            turnSpeedBonus: (tracksBonuses.turnSpeedMultiplier ?? 1) - 1,
            accelerationBonus: (tracksBonuses.accelerationMultiplier ?? 1) - 1,
            projectileSpeedBonus: (cannonBonuses.projectileSpeedMultiplier ?? 1) - 1,
            playerLevel: playerLevel,
            critChance: baseCrit,
            evasion: baseEvasion + evasionBonus,
            repairRate: baseRepair + repairRateBonus,
            fuelEfficiency: baseFuelEff + fuelEfficiencyBonus,
            installedModules: Object.values(upgradeManager.getUpgrades().modules)
                .filter(m => m.level > 0)
                .map(m => {
                    const moduleMap: Record<string, { name: string, icon: string, rarity: "common" | "rare" | "epic" | "legendary" }> = {
                        "shield": { name: "Energy Shield", icon: "🛡️", rarity: "rare" },
                        "repair": { name: "Nano Repair", icon: "🔧", rarity: "epic" },
                        "boost": { name: "Turbo Boost", icon: "⚡", rarity: "common" }
                    };
                    const info = moduleMap[m.elementId] || { name: m.elementId, icon: "📦", rarity: "common" };
                    return {
                        id: m.elementId,
                        name: info.name,
                        icon: info.icon,
                        rarity: info.rarity
                    };
                })
        };

        // Sync to TankController
        if (tank) {
            tank.critChance = bonusesData.critChance;
            tank.evasion = bonusesData.evasion;
            tank.repairRate = bonusesData.repairRate;
            tank.fuelEfficiencyBonus = bonusesData.fuelEfficiency;
        }

        const tankStatsData: TankStatsData = {
            chassis: chassisData,
            cannon: cannonData,
            tracks: tracksData,
            bonuses: bonusesData,
            currentHealth: tank.currentHealth,
            currentFuel: tank.currentFuel,
            maxFuel: tank.maxFuel,
            currentArmor: (tank as any).currentArmor || 0
        };

        this.hud.updateDetailedTankStats(tankStatsData);
    }
}





